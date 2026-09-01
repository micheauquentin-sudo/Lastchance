import "server-only";

import { packConnu } from "@/lib/bande";
import { BANDE_PACK_DEFAUT } from "@/lib/bande-packs";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { gardeEditeurJeuSalon } from "@/lib/salon-garde";
import { bandePackStateSchema } from "@/lib/validations/bande";

/**
 * PORTRAIT DE LA BANDE (L18) — LA LECTURE DE L'ÉCRAN DE CONFIGURATION.
 *
 * ── AUCUNE IDENTITÉ JOUEUR ICI ──
 *
 * Ce fichier ne connaît ni cookie de salle, ni empreinte, ni partie : il sert le
 * COMMERÇANT. Les six RPC de jeu vivent dans `src/actions/bande.ts` et prennent
 * leur jeton du cookie POSÉ PAR SALLE de L16 (`lobby-context.ts`) — rien de
 * cette identité-là n'a de raison de passer par ici, et lui en donner une
 * l'aurait mise à portée d'un écran de tableau de bord. Motif exact de
 * `duo-context.ts` (L17).
 */

export type BandePackContext =
  | { ok: false; error: string }
  | {
      ok: true;
      organizationId: string;
      /** La clé du pack réglé. JAMAIS `null` : le défaut est `amis`. */
      pack: string;
    };

/**
 * LE PACK D'UN COMMERCE, pour son écran de configuration.
 *
 * ── POURQUOI ICI, ET PAS DANS UNE SERVER ACTION ──
 *
 * C'est une LECTURE DE PAGE : pas de `_prev`, pas de `FormData`, rien à
 * revalider. L'exposer en `"use server"` en aurait fait un point POST de plus,
 * atteignable sans qu'aucun écran ne le rende. Le dépôt range ces lectures dans
 * les `*-context` — motif exact de `loadDuoOptions` (L17) et de `loadOrgLobbies`
 * (L16).
 *
 * ── POURQUOI UNE LECTURE DE TABLE, ET PAS UNE RPC ──
 *
 * L18 n'a pas d'équivalent de `duo_options_state`, et n'en avait pas besoin : ce
 * qu'il y a à lire est UNE COLONNE d'UNE ligne, sans jointure, sans agrégation
 * et sans rien à filtrer. Une RPC `security definer` pour cela aurait ajouté une
 * surface exécutable au seul bénéfice de la symétrie. La table est typée
 * (`bande_settings` est dans les types générés), donc la lecture l'est aussi.
 *
 * ── C'EST LA GARDE QUI TIENT L'APPARTENANCE ──
 *
 * La clé de service contourne la RLS : le filtre `organization_id` de cette
 * requête est la seule chose qui la borne à un locataire, et il ne reçoit QUE
 * l'organisation de la SESSION, jamais un paramètre venu du navigateur. La garde
 * passe donc AVANT — la placer après reviendrait à ne pas l'avoir. La garde
 * d'écriture, elle, est en SQL (`set_bande_pack` revérifie l'acteur
 * `owner|editor`).
 *
 * ── LA GARDE EST CELLE DU JEU, PLUS CELLE DE LA VITRINE (DUO-3b) ──
 *
 * Elle était `gardeEditeurVitrine`, sur un arbitrage qui nommait lui-même sa
 * condition de péremption : « un salon jouable hors vitrine, ou un plateau
 * vendu séparément ». Les deux sont arrivés — `create_player_lobby` n'exige
 * plus `vitrine` (20261022120000) et DUO-2 vend Portrait de la Bande seul à 12 €/mois. Un
 * commerçant qui achète le jeu sans la carte était verrouillé hors de ses
 * propres réglages. Le raisonnement complet est sur `gardeEditeurJeuSalon`.
 *
 * ── UNE PANNE DE LECTURE REND LE DÉFAUT, PAS UN REFUS ──
 *
 * Motif de `loadDuoOptions` : le commerçant a le droit, il n'a simplement rien
 * de réglé à afficher. Et le repli est le pack POSITIF — jamais `taquin` : un
 * défaut d'affichage ne doit pas pouvoir faire croire à un commerçant que le
 * pack moqueur est actif chez lui, ni l'inverse cocher pour lui une case qu'il
 * n'a pas cochée. C'est aussi ce que la base sert (`default 'amis'`), donc les
 * deux disent la même chose.
 */
export async function loadBandePack(): Promise<BandePackContext> {
  const garde = await gardeEditeurJeuSalon("bande");
  if (!garde.ok) return { ok: false, error: garde.error };

  const defaut = {
    ok: true as const,
    organizationId: garde.organizationId,
    pack: BANDE_PACK_DEFAUT,
  };

  // DE LA SESSION. Le schéma est là pour qu'un `null` ne parte jamais dans le
  // filtre : une égalité sur `null` ne rapporte rien, mais elle le ferait
  // silencieusement, et l'écran afficherait le défaut sans que personne ne sache
  // pourquoi.
  const parsed = bandePackStateSchema.safeParse({
    organizationId: garde.organizationId,
  });
  if (!parsed.success) return defaut;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("bande_settings")
      .select("pack")
      .eq("organization_id", parsed.data.organizationId)
      .maybeSingle();
    if (error) {
      reportError("bande.pack_state", error.message);
      return defaut;
    }
    // AUCUNE LIGNE = AUCUN RÉGLAGE, et c'est le cas ORDINAIRE : la ligne naît de
    // `set_bande_pack`, jamais d'un `insert` direct (pas de `grant insert`).
    // Une clé que ce dépôt ne connaît pas retombe sur le défaut plutôt que de
    // faire cocher, dans une liste de cinq, un sixième nom qui n'y est pas.
    const pack = data?.pack;
    if (typeof pack !== "string" || !packConnu(pack)) return defaut;
    return { ...defaut, pack };
  } catch (err) {
    reportError("bande.pack_state", err);
    return defaut;
  }
}
