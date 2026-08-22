import type { GrantableModule } from "@/lib/subscription";
import type { Database } from "@/lib/supabase/types";

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

/**
 * ── OÙ LE COMPILATEUR VÉRIFIE CETTE TABLE ──
 *
 * C'est ICI, pas au point de requête. `compterBrouillons` construit sa requête
 * à partir d'une table et d'une colonne toutes deux VARIABLES : le client
 * Supabase typé ne peut alors garantir que l'intersection des colonnes des neuf
 * tables, où ni `status` ni `enabled` ne figurent — il ne vérifie donc plus
 * rien de ce qui compte. Le contrôle est déplacé à la déclaration, où les deux
 * sont littéraux : `table` doit nommer une table réelle du schéma, et
 * `colonnePublication` une colonne réelle DE CETTE table. Renommer
 * `campaigns.status` en base fait désormais rougir le compilateur à cette
 * ligne, là où le comptage de quota se serait contenté de rendre un chiffre
 * faux — un commerçant bloqué, ou une création laissée illimitée.
 *
 * `module-resources-parity.test.ts` reste la borne complémentaire : il compare
 * les VALEURS publiées aux triggers de la migration, ce qu'aucun type ne sait
 * faire.
 */
type TableDuSchema = keyof Database["public"]["Tables"];

type RessourceModuleTypee = {
  [T in TableDuSchema]: {
    table: T;
    colonnePublication: string & keyof Database["public"]["Tables"][T]["Row"];
    valeursPubliees: readonly string[];
  };
}[TableDuSchema];

/**
 * Les modules qui ONT une ressource DONT LES BROUILLONS SE COMPTENT — c'est-à-
 * dire tous sauf `vitrine`.
 *
 * ── CE QUE CETTE EXEMPTION NE DIT PAS, ET DISAIT ENCORE ──
 *
 * Elle a longtemps porté le motif « `vitrine` n'a ni table, ni trigger
 * `guard_module_publication` : le lot L2 ne livre que le droit serveur, il n'y
 * a encore rien à publier ». C'était vrai de L2 ; c'est FAUX depuis L10.
 * `vitrine_settings` existe, elle porte `published`, et le trigger
 * `vitrine_settings_guard_publication` (migration 20261011120000) la garde
 * exactement comme les neuf autres. La publication de la vitrine EST gardée en
 * base — la lire ici comme « non gardée » était l'erreur la plus coûteuse que
 * ce commentaire pouvait induire.
 *
 * ── CE QUI RESTE VRAI, ET QUI EST LE MOTIF ACTUEL ──
 *
 * Aucun QUOTA DE BROUILLONS ne s'applique à la vitrine : une organisation a UNE
 * vitrine, pas N brouillons de vitrine, et aucune action de création ne passe
 * par `refuserSiQuotaBrouillonAtteint` pour elle. Cette table sert à COMPTER
 * des brouillons ; un module qui n'en a pas à compter n'y a pas d'entrée. C'est
 * ce que mesure `estPubliable`, et rien d'autre — surtout pas l'existence d'un
 * trigger.
 *
 * ── CE QUI LA FERAIT TOMBER ──
 *
 * Non plus « le lot qui livre la Vitrine », qui est livré : le jour où la
 * vitrine devient CONTINGENTÉE — plusieurs vitrines par organisation, ou une
 * action de création qui doit borner sa gratuité. Il faudra alors la retirer de
 * l'`Exclude` ci-dessous, et `tsc` réclamera son entrée dans
 * `RESSOURCE_MODULE` (`vitrine_settings` / `published` / `["true"]`).
 *
 * EXEMPTION ÉCRITE ET NON DÉDUITE : la faire porter par le type plutôt que par
 * une clé absente est ce qui la rend visible — une clé simplement manquante
 * n'aurait jamais rien réclamé à personne.
 */
export type ModulePubliable = Exclude<GrantableModule, "vitrine">;

/** Ce module a-t-il une ressource publiable, donc une entrée ci-dessous ? */
export function estPubliable(module: GrantableModule): module is ModulePubliable {
  return module !== "vitrine";
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
} as const satisfies Record<ModulePubliable, RessourceModuleTypee>;

/**
 * La colonne de publication est-elle un booléen ?
 *
 * Le parrainage n'a pas de cycle brouillon/actif/archivé : il est activé ou
 * non. Cette différence remonte jusqu'à la requête de comptage, où un booléen
 * se filtre par `eq(col, false)` et un texte par `not(col, in, …)` — PostgREST
 * ne traite pas les deux de la même façon, et se tromper rend un compte VIDE
 * plutôt qu'une erreur.
 */
export function publicationBooleenne(module: ModulePubliable): boolean {
  // Typé en `readonly string[]` et non par inférence : `as const` fige chaque
  // entrée sur sa valeur littérale, et comparer `"active"` à `"true"` devient
  // alors une erreur de compilation plutôt qu'un test qui rend false. On veut
  // ici la question générale — « cette valeur est-elle un booléen ? » — posée
  // aux neuf modules de la même façon.
  const valeurs: readonly string[] = RESSOURCE_MODULE[module].valeursPubliees;
  return valeurs.length === 1 && (valeurs[0] === "true" || valeurs[0] === "false");
}
