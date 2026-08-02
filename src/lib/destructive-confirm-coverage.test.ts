import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CALENDAR_DAY_LOSS_HINT,
  CALENDAR_DELETE_LOSS_HINT,
} from "@/lib/validations/calendar";
import { CAMPAIGN_OUTSTANDING_LOSS_HINT } from "@/lib/validations/campaigns";
import { EVENT_SESSION_LOSS_HINT } from "@/lib/validations/events";
import {
  HUNT_DELETE_LOSS_HINT,
  HUNT_STEP_LOSS_HINT,
} from "@/lib/validations/hunts";
import {
  LOYALTY_MILESTONE_LOSS_HINT,
  LOYALTY_PROGRAM_LOSS_HINT,
} from "@/lib/validations/loyalty";
import { WHEEL_OUTSTANDING_LOSS_HINT } from "@/lib/validations/prizes";
import { QUIZ_DELETE_LOSS_HINT } from "@/lib/validations/quiz";

/**
 * GARDE MÉCANIQUE — une case de confirmation destructive ne s'affiche que sur
 * LE refus qu'elle concerne.
 *
 * ── Le défaut qu'elle ferme ──
 *
 * Ces gardes demandent au commerçant de cocher « je comprends que les codes non
 * retirés deviendront introuvables » avant un geste qui détruit des lots déjà
 * gagnés. Sur les quatre premières, deux n'affichaient la case qu'après LE
 * refus concerné ; les deux autres l'affichaient sur `!ok`, donc sur n'importe
 * quel échec — « Suppression impossible », une coupure réseau, une donnée
 * invalide.
 *
 * L'effet n'est pas fonctionnel, il est pédagogique, et il compte : on entraîne
 * le commerçant à cocher une confirmation destructive dans des situations où
 * elle ne veut rien dire, puis à la cocher par réflexe le jour où elle protège
 * de vrais codes. Une case toujours présente n'est plus une confirmation.
 *
 * ── Pourquoi une garde de SOURCE et pas un test de rendu ──
 *
 * Le projet n'a pas d'environnement de rendu React : une condition JSX n'est
 * vérifiable que par lecture du fichier. La garde lit donc la source, et c'est
 * assumé — elle prouve la forme, pas le pixel.
 *
 * ── Ce qu'elle ne couvre PAS ──
 *
 * Elle ne connaît que les cases nommées ci-dessous. Une garde destructive
 * ajoutée demain devra être inscrite ici : la garde empêche la dérive des
 * existantes, elle ne découvre pas les nouvelles.
 *
 * Et elle ne couvre QUE les gardes qui DÉTRUISENT (précédent ADR-054, où une
 * garde de sens de réponse — qui ne détruit rien — a été refusée de ce
 * registre après trois assertions tombées). Le compare-and-swap du stock d'un
 * lot (`updatePrize`) n'y figure donc pas : il refuse d'ÉCRIRE une valeur
 * périmée, il ne détruit rien et ne présente aucune case à cocher.
 *
 * ── Ce que le second lot a ajouté (2026-08-02) ──
 *
 * Six gardes de la même famille — un geste d'ENTRETIEN du commerçant qui
 * détruit un code que le client tient déjà en main : suppression d'une roue,
 * d'une chasse, d'un calendrier, d'un quiz, d'un palier de fidélité, d'un
 * programme de fidélité. Toutes portaient un `confirm()` navigateur qui ne
 * nommait aucun chiffre, quand elles en portaient un.
 */

interface Garde {
  /** Ce que le commerçant détruirait, en une ligne. */
  quoi: string;
  /** Nom du champ de la case à cocher, côté formulaire. */
  champ: string;
  /** Identifiant de la constante partagée, tel qu'écrit dans les sources. */
  marqueur: string;
  /** Sa valeur, importée — les deux côtés doivent bouger ensemble. */
  valeur: string;
  /** Module d'où elle est importée. */
  module: string;
  action: string;
  composant: string;
}

const GARDES: Garde[] = [
  {
    quoi: "supprimer une campagne emporte les lots gagnés non retirés",
    champ: "confirm_outstanding",
    marqueur: "CAMPAIGN_OUTSTANDING_LOSS_HINT",
    valeur: CAMPAIGN_OUTSTANDING_LOSS_HINT,
    module: "@/lib/validations/campaigns",
    action: "src/actions/campaigns.ts",
    composant: "src/components/dashboard/campaign-settings.tsx",
  },
  {
    quoi: "supprimer une session emporte les codes EVENT- non remis",
    champ: "confirm_outstanding",
    marqueur: "EVENT_SESSION_LOSS_HINT",
    valeur: EVENT_SESSION_LOSS_HINT,
    module: "@/lib/validations/events",
    action: "src/actions/events.ts",
    composant: "src/components/dashboard/event-editor.tsx",
  },
  {
    quoi: "réduire la grille emporte les cases ouvertes et leurs codes CADEAU-",
    champ: "confirm_day_loss",
    marqueur: "CALENDAR_DAY_LOSS_HINT",
    valeur: CALENDAR_DAY_LOSS_HINT,
    module: "@/lib/validations/calendar",
    action: "src/actions/calendar.ts",
    composant: "src/components/dashboard/calendar-editor.tsx",
  },
  {
    quoi: "retirer une étape raccourcit les chasses en cours et émet des codes",
    champ: "confirm_players",
    marqueur: "HUNT_STEP_LOSS_HINT",
    valeur: HUNT_STEP_LOSS_HINT,
    module: "@/lib/validations/hunts",
    action: "src/actions/hunts.ts",
    composant: "src/components/dashboard/hunt-editor.tsx",
  },
  {
    quoi: "supprimer une roue emporte les participations et leurs codes GAIN-",
    champ: "confirm_outstanding",
    marqueur: "WHEEL_OUTSTANDING_LOSS_HINT",
    valeur: WHEEL_OUTSTANDING_LOSS_HINT,
    module: "@/lib/validations/prizes",
    action: "src/actions/prizes.ts",
    composant: "src/components/dashboard/campaign-wheels.tsx",
  },
  {
    quoi: "supprimer une chasse emporte les codes CHASSE- non retirés",
    champ: "confirm_outstanding",
    marqueur: "HUNT_DELETE_LOSS_HINT",
    valeur: HUNT_DELETE_LOSS_HINT,
    module: "@/lib/validations/hunts",
    action: "src/actions/hunts.ts",
    composant: "src/components/dashboard/hunt-editor.tsx",
  },
  {
    quoi: "supprimer un calendrier emporte les codes CADEAU- non retirés",
    champ: "confirm_outstanding",
    marqueur: "CALENDAR_DELETE_LOSS_HINT",
    valeur: CALENDAR_DELETE_LOSS_HINT,
    module: "@/lib/validations/calendar",
    action: "src/actions/calendar.ts",
    composant: "src/components/dashboard/calendar-editor.tsx",
  },
  {
    quoi: "supprimer un quiz emporte les codes QUIZ- non retirés",
    champ: "confirm_outstanding",
    marqueur: "QUIZ_DELETE_LOSS_HINT",
    valeur: QUIZ_DELETE_LOSS_HINT,
    module: "@/lib/validations/quiz",
    action: "src/actions/quiz.ts",
    composant: "src/components/dashboard/quiz-editor.tsx",
  },
  {
    quoi: "supprimer un palier emporte ses codes FIDELITE- non retirés",
    champ: "confirm_outstanding",
    marqueur: "LOYALTY_MILESTONE_LOSS_HINT",
    valeur: LOYALTY_MILESTONE_LOSS_HINT,
    module: "@/lib/validations/loyalty",
    action: "src/actions/loyalty.ts",
    composant: "src/components/dashboard/loyalty-editor.tsx",
  },
  {
    // Champ DISTINCT du palier ci-dessus : les deux cases vivent dans le même
    // fichier, et `conditionAutour` ne sait remonter que jusqu'à la PREMIÈRE
    // occurrence d'un nom de champ. Partager le nom ferait tester deux fois la
    // même case en croyant en couvrir deux.
    quoi: "supprimer un programme de fidélité emporte tous ses codes FIDELITE-",
    champ: "confirm_program_outstanding",
    marqueur: "LOYALTY_PROGRAM_LOSS_HINT",
    valeur: LOYALTY_PROGRAM_LOSS_HINT,
    module: "@/lib/validations/loyalty",
    action: "src/actions/loyalty.ts",
    composant: "src/components/dashboard/loyalty-editor.tsx",
  },
];

/** Le fichier, lignes normalisées — les sources du dépôt sont en CRLF. */
function lignes(chemin: string): string[] {
  return readFileSync(chemin, "utf8").replace(/\r\n/g, "\n").split("\n");
}

/**
 * L'expression conditionnelle qui décide de rendre la case : du `{…` ouvrant
 * le conteneur JSX jusqu'à la ligne du champ. Remonter jusqu'au `{` et non
 * prendre « les N lignes d'avant » est ce qui rend la garde insensible à la
 * mise en forme (la condition tient sur une ligne chez l'un, sur trois chez
 * l'autre).
 */
function conditionAutour(src: string[], champ: string): string {
  const cible = src.findIndex((l) => l.includes(`name="${champ}"`));
  expect(cible, `champ ${champ} introuvable`).toBeGreaterThan(-1);
  let debut = cible;
  while (debut > 0 && !/^\s*\{[A-Za-z_]/.test(src[debut])) debut -= 1;
  expect(debut, `aucun conteneur JSX au-dessus de ${champ}`).toBeGreaterThan(0);
  return src.slice(debut, cible + 1).join("\n");
}

describe("cases de confirmation destructives — la même forme pour toutes", () => {
  it.each(GARDES)(
    "$marqueur : l'écran ne montre la case qu'après CE refus",
    ({ champ, marqueur, composant }) => {
      // ROUGE SI : la condition retombe sur `!state.ok`. La case destructive
      // réapparaît alors sur « Suppression impossible » et sur toute coupure
      // réseau — et le commerçant apprend à la cocher sans la lire.
      const condition = conditionAutour(lignes(composant), champ);
      expect(condition).toContain(`.includes(${marqueur})`);
    },
  );

  it.each(GARDES)(
    "$marqueur : l'écran l'IMPORTE au lieu de recopier la phrase",
    ({ marqueur, module, composant }) => {
      // ROUGE SI : un côté recopie le littéral. Les deux côtés cesseraient de
      // bouger ensemble, et le jour où le message change la case disparaît
      // sans que rien ne rougisse.
      // L'assertion portait la forme EXACTE `import { X } from "…"`, sur une
      // seule ligne. Elle est tombée le jour où un second marqueur du même
      // module a fait passer l'import en multi-lignes — un changement de mise
      // en forme, pas de propriété. Une garde qui rougit sur un retour à la
      // ligne apprend à être contournée.
      //
      // On vérifie donc ce qu'elle voulait dire : le composant IMPORTE ce
      // marqueur DEPUIS ce module. Le littéral recopié, qui est le vrai
      // danger, reste attrapé — il n'apparaîtrait dans aucun bloc d'import.
      const source = readFileSync(composant, "utf8").replace(/\r\n/g, "\n");
      const blocs = source.match(
        new RegExp(`import\\s*\\{[^}]*\\}\\s*from\\s*"${module}"`, "g"),
      );
      expect(blocs, `aucun import depuis ${module}`).toBeTruthy();
      expect(blocs!.some((b) => b.includes(marqueur))).toBe(true);
    },
  );

  it.each(GARDES)(
    "$marqueur : le refus de l'action le PORTE, sinon la case n'apparaît jamais",
    ({ marqueur, action }) => {
      // ROUGE SI : le message d'erreur perd le marqueur. La garde devient alors
      // un cul-de-sac : l'action refuse, l'écran ne propose aucune case, et le
      // commerçant ne peut plus faire son geste du tout.
      expect(readFileSync(action, "utf8")).toContain(`\${${marqueur}}`);
    },
  );

  it("tous les marqueurs disent exactement la même chose au commerçant", () => {
    // ROUGE SI : l'un d'eux dérive. Dix instructions différentes pour un même
    // geste (« cochez la case », « validez la confirmation »…) forcent le
    // commerçant à relire à chaque fois, et rendent la relecture d'un refus
    // dépendante du module où l'on se trouve.
    expect(new Set(GARDES.map((g) => g.valeur))).toEqual(
      new Set(["Cochez la case de confirmation"]),
    );
  });

  it("deux gardes du même écran ne partagent JAMAIS le nom de champ", () => {
    // ROUGE SI : deux cases du même composant portent le même `name`.
    // `conditionAutour` remonte depuis la PREMIÈRE occurrence : la seconde
    // garde serait alors testée sur la condition de la première, et le
    // registre affirmerait couvrir deux cases en n'en voyant qu'une. C'est le
    // seul piège que l'ajout du second lot a rendu atteignable — loyalty-editor
    // porte les deux seules cases d'un même fichier.
    const paires = GARDES.map((g) => `${g.composant}::${g.champ}`);
    expect(new Set(paires).size).toBe(GARDES.length);
  });

  it("les gardes du registre sont bien DIX, pas neuf", () => {
    // ROUGE SI : une garde est retirée de la table sans l'être du produit.
    // C'est le seul point où le nombre est écrit ; le laisser implicite, c'est
    // laisser une garde sortir de la couverture sans bruit.
    expect(GARDES).toHaveLength(10);
    expect(GARDES.map((g) => g.quoi.length > 20).every(Boolean)).toBe(true);
    // Chaque marqueur est unique : deux entrées pointant la même constante
    // seraient deux tests du même code déguisés en couverture.
    expect(new Set(GARDES.map((g) => g.marqueur)).size).toBe(GARDES.length);
  });
});
