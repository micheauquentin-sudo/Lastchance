/**
 * HABILLAGE DU PASSEPORT DE FIDÉLITÉ — le contenu du jsonb
 * `loyalty_programs.style` (migration 20261116120000).
 *
 * ── Le même contrat que `wheels.style`, délibérément ──
 *
 * La base ne contrôle que la FORME (un objet, ≤ 8 Ko) et n'énumère AUCUN fond :
 * retirer une image du catalogue ne doit jamais rendre un programme
 * non modifiable. Le CONTENU est donc validé ici, et il l'est DEUX FOIS, avec
 * deux tolérances différentes — exactement le partage de `wheel-style.ts` :
 *
 *   · `loyaltyStyleSchema`      LECTURE — `fond` porte `.catch(undefined)`.
 *     Une clé disparue du catalogue rend un passeport SANS fond, jamais une
 *     page en erreur. Le jour où l'habillage portera aussi des couleurs, le
 *     commerçant ne les perdra pas à cause d'une image retirée.
 *
 *   · `loyaltyStyleWriteSchema` ÉCRITURE — `fond` sans son `.catch`.
 *     Une clé inconnue est REFUSÉE. Tolérer à la saisie ce qu'on tolère à la
 *     relecture acquitterait « Enregistré » une valeur jetée en silence :
 *     le commerçant croirait avoir choisi un fond qu'il ne reverrait jamais.
 *     C'est la doctrine déjà écrite dans `wheel-style.ts` et `fonds-ecran.ts`.
 *
 * `null` en base = aucun choix, donc l'habillage par défaut : c'est l'état de
 * tous les programmes antérieurs, dont le rendu n'a pas bougé.
 */

import { z } from "zod";
import { FOND_KEYS } from "@/lib/fonds-ecran";

/** Schéma de LECTURE — souple sur ce qu'on relit (voir l'en-tête). */
export const loyaltyStyleSchema = z.object({
  /**
   * Fond d'écran thématique du passeport — choix explicite du commerçant,
   * absent = aucune image. `.catch(undefined)` POUR LA LECTURE SEULEMENT.
   */
  fond: z.enum(FOND_KEYS).optional().catch(undefined),
});

export type LoyaltyStyle = z.infer<typeof loyaltyStyleSchema>;

/**
 * Schéma d'ÉCRITURE — `fond` privé de son `.catch`, tout le reste partagé.
 *
 * `.extend` et non un second `z.object` recopié : les champs ajoutés demain au
 * schéma de lecture sont gardés à l'écriture sans qu'on y pense.
 */
export const loyaltyStyleWriteSchema = loyaltyStyleSchema.extend({
  fond: z.enum(FOND_KEYS).optional(),
});

/** Habillage résolu — sûr même sur un jsonb corrompu ou absent. */
export function resolveLoyaltyStyle(raw: unknown): LoyaltyStyle {
  const parsed = loyaltyStyleSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : loyaltyStyleSchema.parse({});
}
