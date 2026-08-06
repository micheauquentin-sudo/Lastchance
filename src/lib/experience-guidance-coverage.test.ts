import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KINDS_RELANCE } from "@/lib/experience-relance";

/**
 * GARDE MÉCANIQUE — « une surface sans chemin ».
 *
 * Trois modules ont été livrés — la Carte de l'Aventure, « Relancer une
 * formule », le Centre d'animation — et chacun est PUR : ses tests unitaires
 * passeraient à l'identique si plus aucune page ne le montait. C'est
 * exactement le défaut que ce dépôt a déjà payé ailleurs : du code correct,
 * testé, vert en CI, et invisible pour le commerçant.
 *
 * Cette garde lit la SOURCE des pages de détail et rougit si le montage
 * disparaît. Elle ne prouve pas un pixel ; elle prouve qu'il existe un chemin
 * entre le module et l'écran.
 *
 * ── POURQUOI PAS UN TEST DE RENDU ──
 *
 * Ces pages sont des Server Components qui ouvrent une session Supabase, lisent
 * l'organisation active et interrogent la base avant de rendre la première
 * balise. Les monter demanderait de doubler l'authentification, le client
 * Supabase et neuf tables — un échafaudage qui casserait au premier `select`
 * ajouté, pour une promesse (« le composant est monté ») qu'une lecture de
 * source établit sans rien simuler.
 *
 * ── LES DEUX LISTES NE SONT PAS LES MÊMES, ET C'EST LE SUJET ──
 *
 * Huit pages portent la Carte, six seulement portent la relance. Les deux
 * absences sont des DÉCISIONS, écrites ici pour qu'on ne les corrige pas par
 * distraction : le jackpot n'est pas relançable (son économie — jauge, cycle,
 * seuil — est vivante) et la campagne ne l'est pas non plus (« Dupliquer » et
 * les modèles font mieux, en emportant la roue et ses lots).
 */

const RACINE = "src/app/dashboard";

/** Les huit modules qui portent une Carte de l'Aventure. Le parrainage n'en a
 * pas : `referral_programs.enabled` est un booléen sous une campagne, sans
 * brouillon, sans répétition et sans clôture. */
const PAGES_CARTE = {
  campaign: `${RACINE}/campaigns/[id]/page.tsx`,
  hunt: `${RACINE}/hunts/[id]/page.tsx`,
  quiz: `${RACINE}/quiz/[id]/page.tsx`,
  calendar: `${RACINE}/calendar/[id]/page.tsx`,
  jackpot: `${RACINE}/jackpot/[id]/page.tsx`,
  event: `${RACINE}/events/[id]/page.tsx`,
  pronostics: `${RACINE}/pronostics/[id]/page.tsx`,
  loyalty: `${RACINE}/loyalty/[id]/page.tsx`,
} as const;

/** Les six kinds que le moteur universel sait recopier. */
const PAGES_RELANCE = {
  hunt: PAGES_CARTE.hunt,
  quiz: PAGES_CARTE.quiz,
  calendar: PAGES_CARTE.calendar,
  event: PAGES_CARTE.event,
  pronostics: PAGES_CARTE.pronostics,
  loyalty: PAGES_CARTE.loyalty,
} as const;

/** Sans carte de relance, sur décision — voir l'en-tête. */
const SANS_RELANCE = ["campaign", "jackpot"] as const;

function lire(chemin: string): string {
  return readFileSync(chemin, "utf8");
}

describe("Carte de l'Aventure — montée sur les huit pages de détail", () => {
  for (const [kind, chemin] of Object.entries(PAGES_CARTE)) {
    it(`${kind} construit ses étapes et rend GuidedJourney`, () => {
      const source = lire(chemin);
      expect(source).toContain("construireEtapesAventure");
      expect(source).toContain("<GuidedJourney");
      // Le kind passé doit être CELUI du module : une page qui construirait
      // les marqueurs d'un autre afficherait une clôture qui n'est pas la
      // sienne, sans erreur de compilation puisque l'union les accepte tous.
      expect(source).toContain(`kind: "${kind}"`);
    });
  }
});

describe("Relancer une formule — montée sur les six kinds supportés", () => {
  for (const [kind, chemin] of Object.entries(PAGES_RELANCE)) {
    it(`${kind} rend la carte et son action`, () => {
      const source = lire(chemin);
      expect(source).toContain("<RelaunchFormulaCard");
      expect(source).toContain("etatSourceRelance");
      expect(source).toContain(`<RelaunchFormulaAction kind="${kind}"`);
    });
  }

  /**
   * UN REFUS QUI N'EST PAS RENDU EST UN CLIC MORT.
   *
   * `relancerFormuleForm` renvoie ses six refus vers
   * `…?relance_error=<message>`. Une page qui monte la carte sans lire ce
   * paramètre laisse le commerçant revenir sur un écran inchangé, sans un mot —
   * et ce silence-là ne casse aucun test unitaire du composant, puisque le
   * composant, lui, est correct. La garde vit donc ici.
   */
  for (const [kind, chemin] of Object.entries(PAGES_RELANCE)) {
    it(`${kind} lit relance_error et rend l'encart de refus`, () => {
      const source = lire(chemin);
      expect(source).toContain("relance_error");
      expect(source).toContain("<RelanceErreur");
    });
  }

  it("les six kinds montés sont exactement ceux que le moteur supporte", () => {
    expect(Object.keys(PAGES_RELANCE).sort()).toEqual([...KINDS_RELANCE].sort());
  });

  for (const kind of SANS_RELANCE) {
    it(`${kind} n'en porte PAS — décision, pas oubli`, () => {
      expect(lire(PAGES_CARTE[kind])).not.toContain("<RelaunchFormulaCard");
    });
  }
});

describe("Centre d'animation — monté sur la vue d'ensemble", () => {
  const source = lire(`${RACINE}/page.tsx`);

  it("charge les compteurs et rend les deux blocs", () => {
    expect(source).toContain("chargerCentreAnimation");
    expect(source).toContain("<AnimationCenter");
    expect(source).toContain("<TeamActionBoard");
  });

  it("filtre les raccourcis par `lienSelonRole`", () => {
    // Le raccourci « gains à remettre » vise `/dashboard/participations`, qui
    // renvoie tout non-propriétaire ailleurs sans un mot. Passer par
    // `lienSelonRole` est ce qui fait tomber le lien plutôt que le clic.
    expect(source).toContain("lienSelonRole");
    expect(source).toContain("/dashboard/participations?statut=a-valider");
  });
});
