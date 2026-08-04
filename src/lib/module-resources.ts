import type { GrantableModule } from "@/lib/subscription";

/**
 * OÙ VIT CHAQUE MODULE, ET CE QUE « PUBLIÉ » VEUT DIRE POUR LUI.
 *
 * Neuf modules, neuf tables, et deux façons de dire « publié » : une colonne
 * texte `status` valant `active` pour huit d'entre eux, une colonne booléenne
 * `enabled` pour le parrainage. Cette table est le pendant TypeScript des neuf
 * `create trigger … guard_module_publication(module, colonne, valeurs)` de la
 * migration 20260905120000, et `module-resources-parity.test.ts` la compare à
 * ces déclarations en LISANT la migration.
 *
 * ── POURQUOI ELLE EXISTE ──
 *
 * Compter les brouillons d'un module suppose de savoir ce qui n'est PAS
 * publié. Dériver ce prédicat des triggers plutôt que de le réécrire évite
 * l'écart le plus coûteux possible : compter comme brouillon une ressource que
 * la base considère publiée, ou l'inverse. Le premier laisserait créer
 * indéfiniment, le second bloquerait un commerçant qui n'a rien fait.
 *
 * ── CE QU'ELLE N'EST PAS ──
 *
 * Elle ne garde rien. Les triggers gardent ; ceci sert à COMPTER et à
 * présenter. Une divergence ici produit un chiffre faux dans un message, pas
 * un droit accordé à tort.
 */
export interface RessourceModule {
  /** Table qui porte les ressources publiables de ce module. */
  table: string;
  /** Colonne dont la valeur décide de la publication. */
  colonnePublication: string;
  /**
   * Valeurs de cette colonne qui signifient « exposé à un joueur ». Tout le
   * reste est un brouillon, une pause ou une archive.
   */
  valeursPubliees: readonly string[];
}

export const RESSOURCE_MODULE = {
  wheel: { table: "campaigns", colonnePublication: "status", valeursPubliees: ["active"] },
  hunts: { table: "hunts", colonnePublication: "status", valeursPubliees: ["active"] },
  calendar: { table: "calendars", colonnePublication: "status", valeursPubliees: ["active"] },
  loyalty: { table: "loyalty_programs", colonnePublication: "status", valeursPubliees: ["active"] },
  quiz: { table: "quizzes", colonnePublication: "status", valeursPubliees: ["active"] },
  jackpot: { table: "jackpot_campaigns", colonnePublication: "status", valeursPubliees: ["active"] },
  events: { table: "event_games", colonnePublication: "status", valeursPubliees: ["active"] },
  referral: { table: "referral_programs", colonnePublication: "enabled", valeursPubliees: ["true"] },
  pronostics: { table: "contests", colonnePublication: "status", valeursPubliees: ["active"] },
} as const satisfies Record<GrantableModule, RessourceModule>;

/**
 * La colonne de publication est-elle un booléen ?
 *
 * Le parrainage n'a pas de cycle brouillon/actif/archivé : il est activé ou
 * non. Cette différence remonte jusqu'à la requête de comptage, où un booléen
 * se filtre par `eq(col, false)` et un texte par `not(col, in, …)` — PostgREST
 * ne traite pas les deux de la même façon, et se tromper rend un compte VIDE
 * plutôt qu'une erreur.
 */
export function publicationBooleenne(module: GrantableModule): boolean {
  // Typé en `readonly string[]` et non par inférence : `as const` fige chaque
  // entrée sur sa valeur littérale, et comparer `"active"` à `"true"` devient
  // alors une erreur de compilation plutôt qu'un test qui rend false. On veut
  // ici la question générale — « cette valeur est-elle un booléen ? » — posée
  // aux neuf modules de la même façon.
  const valeurs: readonly string[] = RESSOURCE_MODULE[module].valeursPubliees;
  return valeurs.length === 1 && (valeurs[0] === "true" || valeurs[0] === "false");
}
