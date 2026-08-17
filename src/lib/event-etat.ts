import "server-only";

import { mapEventPublicState, type EventPublicState } from "@/lib/event";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * LECTURE DE L'ÉTAT LIVE — UN SEUL PRODUCTEUR POUR DEUX APPELANTS (EVT-1+EVT-2)
 *
 * Le rendu serveur (`loadEventPublicContext`) et le repli polling
 * (`getEventState`) demandaient exactement le même état par deux chemins
 * différents, chacun payant trois allers-retours : la session, l'organisation
 * (garde de module), puis `event_public_state`. Les deux premiers sont
 * descendus DANS la RPC au wagon 5 (`event_etat_partage`, migration
 * 20260929120000) et prouvés par pgTAP : il ne reste ici qu'un voyage, et un
 * seul endroit où il est écrit.
 *
 * ── POURQUOI UN CACHE, ET POURQUOI D'UNE SECONDE ──
 *
 * Sur les sept clés de l'état public, SIX sont identiques pour tous les
 * joueurs d'une session. Cinquante téléphones qui sondent la même soirée
 * faisaient donc recalculer cinquante fois le même classement. La part
 * partagée est cachée une seconde ; la part propre au joueur
 * (`event_etat_joueur`) ne l'est JAMAIS — elle porte son score, son rang et
 * son code de retrait, et ne coûte qu'une ligne indexée.
 *
 * Une seconde parce que c'est très en dessous de la cadence de sondage la plus
 * serrée (2,5 s en question active) : le cache absorbe la SIMULTANÉITÉ des
 * joueurs, jamais la fraîcheur d'un joueur donné.
 *
 * ── L'ÉTAT VIT EN MÉMOIRE, PAR INSTANCE, ET C'EST ASSUMÉ ──
 *
 * Calque exact du modèle documenté de `dernieresTraces`
 * (src/lib/player-identity.ts:155-180) : la cardinalité est BORNÉE par les
 * sessions vivantes — aucune saisie n'entre dans la clé, c'est un UUID de
 * session déjà résolu —, les entrées périmées sont purgées au passage, et
 * l'état n'est pas partagé entre instances. Fluid Compute réutilise les
 * instances : c'est précisément ce qui rend le gain réel. Une instance froide
 * paie un appel de plus, ce qui est le comportement d'avant.
 */

/** Fenêtre de validité de la part partagée. Voir l'en-tête. */
const TTL_PARTAGE_MS = 1_000;

/** Dernière part partagée lue, par session. Purgée au passage. */
const partagesRecents = new Map<string, { at: number; partage: unknown }>();

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * La part partagée porte-t-elle un état exploitable ? Un `null` (panne de
 * lecture) et un `{"state":"unavailable"}` (session inexistante, brouillon,
 * archivée, ou module fermé — la garde descendue en base) se traitent de la
 * même façon : rien à fusionner, et surtout aucune raison d'aller demander le
 * bloc « moi » d'une soirée qu'on ne servira pas.
 */
function partagePorteUnEtat(partage: unknown): boolean {
  return asRecord(partage)?.state === "ok";
}

/**
 * Part partagée d'une session, servie par le cache d'une seconde. `null` en cas
 * de panne de lecture — un échec n'est JAMAIS mis en cache, sans quoi une
 * seconde de base indisponible se prolongerait en une seconde de refus
 * fabriqué par nous.
 */
async function lirePartPartagee(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string,
): Promise<unknown> {
  const maintenant = Date.now();

  // Purge au passage : la carte ne garde que ce qui a moins d'une seconde,
  // donc au plus les sessions réellement sondées dans cette fenêtre.
  for (const [cle, entree] of partagesRecents) {
    if (maintenant - entree.at >= TTL_PARTAGE_MS) partagesRecents.delete(cle);
  }

  const cachee = partagesRecents.get(sessionId);
  if (cachee) return cachee.partage;

  const { data, error } = await admin.rpc("event_etat_partage", {
    p_session_id: sessionId,
  });
  if (error) {
    reportError("event.etat-partage", error.message);
    return null;
  }

  partagesRecents.set(sessionId, { at: maintenant, partage: data });
  return data;
}

/**
 * État public complet d'une session : part partagée (cachée) + part propre au
 * joueur (jamais cachée), fusionnées puis mappées.
 *
 * `playerTokenHash` absent — c'est-à-dire aucun cookie de session — n'appelle
 * PAS `event_etat_joueur` : un visiteur qui n'a rien rejoint n'a pas de bloc
 * « moi » à lire, et l'écran de salle est dans ce cas.
 *
 * Aucune garde de contexte ici : `event_etat_partage` porte les trois refus
 * (session inexistante, draft/archived, module fermé) sous une réponse
 * indistincte — les distinguer ferait de l'état de préparation d'un commerçant
 * un oracle public.
 */
export async function chargerEtatLive(
  sessionId: string,
  playerTokenHash?: string,
): Promise<EventPublicState> {
  const admin = createAdminClient();

  const partage = await lirePartPartagee(admin, sessionId);
  if (!partagePorteUnEtat(partage)) return mapEventPublicState(null);

  if (!playerTokenHash) return mapEventPublicState(partage);

  const { data, error } = await admin.rpc("event_etat_joueur", {
    p_session_id: sessionId,
    p_player_token_hash: playerTokenHash,
  });
  if (error) {
    // La soirée reste suivable : seul le bloc « moi » manque. Rendre
    // `unavailable` pour un rang absent effacerait la question projetée en
    // salle au lieu de dégrader un badge.
    reportError("event.etat-joueur", error.message);
    return mapEventPublicState(partage);
  }

  return mapEventPublicState({
    ...(asRecord(partage) ?? {}),
    ...(asRecord(data) ?? {}),
  });
}
