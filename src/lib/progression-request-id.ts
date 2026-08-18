import { createHash } from "node:crypto";

/**
 * Idempotence d'ouverture d'un coffre de méta-progression — dérivation du
 * `request_id`. **Module SERVEUR** : il tire `node:crypto`.
 *
 * ── POURQUOI IL EST SÉPARÉ DE `meta-progression.ts` ──
 *
 * `meta-progression.ts` est le cœur « pur » du module : types de domaine,
 * bornes, libellés d'erreur, mapping des jsonb. Son en-tête promet qu'il reste
 * importable côté client — et le dashboard le prend au mot :
 * `progression-season-card.tsx` en importe vingt-six constantes et types.
 *
 * Cette promesse était fausse depuis qu'une seule fonction — celle-ci — y avait
 * ajouté `import { createHash } from "node:crypto"` en tête de fichier. Le
 * bundler suivait, embarquait le polyfill `crypto-browserify` (~121 Ko gzip)
 * dans l'écran de configuration des saisons, et personne ne l'a vu : rien ne
 * casse, la page pèse simplement le double.
 *
 * La fonction n'a jamais eu besoin d'être là. Elle n'est appelée que par
 * `src/actions/meta-progression.ts` (chemin serveur), et son seul rôle est de
 * répondre au double-clic. Elle vit donc ici, seule avec son import Node.
 *
 * Garde de source : `src/lib/import-sans-crypto.test.ts`.
 */

/**
 * Fenêtre de repli de l'idempotence d'ouverture, quand l'appelant ne fournit pas
 * sa propre clé. Deux appels du MÊME device sur le MÊME coffre dans cette fenêtre
 * partagent le `request_id` dérivé : la contrainte unique
 * `(player_season_id, request_id)` fait alors rejouer l'ouverture au lieu de
 * débiter une seconde fois.
 *
 * 5 s couvre le double-clic et le rejeu réseau (retry d'un POST) sans gêner une
 * seconde ouverture DÉLIBÉRÉE du même coffre. Réserve connue : deux clics qui
 * enjambent une frontière de fenêtre tombent dans deux seaux — d'où la clé
 * fournie par l'appelant, qui reste le mécanisme PRÉFÉRÉ (une clé par geste,
 * stable à travers les reprises).
 */
export const PROGRESSION_REQUEST_WINDOW_MS = 5_000;

/**
 * Dérive un UUID déterministe (forme v4) à partir d'un secret d'identité, du
 * coffre visé et d'un seau de temps. Déterministe = idempotent : c'est la
 * propriété qui rend `open_progression_chest` sûre face au double-clic.
 *
 * Le hash du device n'est utilisé QU'EN ENTRÉE de SHA-256 tronqué à 128 bits :
 * l'identifiant produit ne permet pas de le retrouver, et il n'est comparable
 * qu'aux ouvertures du même joueur (l'unicité est portée par
 * `(player_season_id, request_id)`).
 */
export function deriveProgressionRequestId(
  deviceTokenHash: string,
  chestId: string,
  now: number = Date.now(),
): string {
  const bucket = Math.floor(now / PROGRESSION_REQUEST_WINDOW_MS);
  const digest = createHash("sha256")
    .update(`progression-chest:v1:${deviceTokenHash}:${chestId}:${bucket}`)
    .digest("hex");
  const bytes = digest.slice(0, 32).split("");
  // Version 4 + variant RFC 4122 : la valeur reste un UUID valide pour Postgres.
  bytes[12] = "4";
  bytes[16] = "89ab"[Number.parseInt(bytes[16], 16) % 4];
  const hex = bytes.join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
