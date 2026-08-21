import "server-only";

import { mapDuoOptionsAdmin, type DuoOptionsAdminView } from "@/lib/duo";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { duoOptionsStateSchema } from "@/lib/validations/duo";
import { gardeEditeurVitrine } from "@/lib/vitrine-context";

/**
 * DUO MIROIR (L17) — LA LECTURE DE L'ÉCRAN DE CONFIGURATION.
 *
 * ── AUCUNE IDENTITÉ JOUEUR ICI ──
 *
 * Ce fichier ne connaît ni cookie de salle, ni empreinte, ni manche : il sert le
 * COMMERÇANT. Les trois RPC de jeu (`duo_start`, `duo_choose`, `duo_state`)
 * vivent dans `src/actions/duo.ts` et prennent leur jeton du cookie POSÉ PAR
 * SALLE de L16 (`lobby-context.ts`) — rien de cette identité-là n'a de raison de
 * passer par ici, et lui en donner une l'aurait mise à portée d'un écran de
 * tableau de bord.
 */

export type DuoOptionsContext =
  | { ok: false; error: string }
  | {
      ok: true;
      organizationId: string;
      /** Le plateau épinglé et la proposition. Jamais `undefined`. */
      plateau: DuoOptionsAdminView;
    };

/**
 * LE PLATEAU D'UN COMMERCE, pour son écran de configuration.
 *
 * ── POURQUOI ICI, ET PAS DANS UNE SERVER ACTION ──
 *
 * C'est une LECTURE DE PAGE : pas de `_prev`, pas de `FormData`, rien à
 * revalider. L'exposer en `"use server"` en aurait fait un point POST de plus,
 * atteignable sans qu'aucun écran ne le rende. Le dépôt range ces lectures dans
 * les `*-context` — motif exact de `loadOrgLobbies` (L16) et de
 * `loadVitrineTraductions`.
 *
 * ── C'EST LA GARDE QUI TIENT L'APPARTENANCE, PAS LA RPC ──
 *
 * `duo_options_state` est `security definer` / `service_role` et n'interroge
 * AUCUNE appartenance : elle rend le plateau de l'organisation qu'on lui nomme,
 * point. Son en-tête l'assume en toutes lettres — elle ne rend rien de
 * personnel (ni manche, ni choix, ni accord : seulement le catalogue que le
 * commerçant a lui-même épinglé) et n'écrit rien, donc exiger un acteur aurait
 * coûté une vérification par rafraîchissement d'écran pour garder une liste de
 * plats. Sa sûreté repose ENTIÈREMENT sur le fait que ce chargeur lui passe
 * l'organisation de la SESSION, et jamais un paramètre venu du navigateur. Les
 * gardes d'écriture, elles, sont en SQL (`set_duo_options`,
 * `set_duo_suggestion`, qui revérifient l'acteur `owner|editor`).
 *
 * ── UNE PANNE DE LECTURE REND LE PLATEAU VIDE, PAS UN REFUS ──
 *
 * Motif de `loadOrgLobbies` : le commerçant a le droit, il n'a simplement rien à
 * afficher. Confondre les deux lui ferait croire que son abonnement a changé —
 * et un plateau vide affiche exactement ce qu'il doit afficher dans ce cas : une
 * invitation à le composer.
 */
export async function loadDuoOptions(): Promise<DuoOptionsContext> {
  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const vide = {
    ok: true as const,
    organizationId: garde.organizationId,
    plateau: { options: [], suggestion: null } as DuoOptionsAdminView,
  };

  // DE LA SESSION, et le schéma est là pour qu'un `null` ne parte jamais : la
  // RPC lèverait une 22023, c'est-à-dire une exception là où il n'y a rien à
  // réparer côté commerçant.
  const parsed = duoOptionsStateSchema.safeParse({
    organizationId: garde.organizationId,
  });
  if (!parsed.success) return vide;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("duo_options_state", {
      p_organization_id: parsed.data.organizationId,
    });
    if (error) {
      reportError("duo.options_state", error.message);
      return vide;
    }
    return { ...vide, plateau: mapDuoOptionsAdmin(data) };
  } catch (err) {
    reportError("duo.options_state", err);
    return vide;
  }
}
