import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CAUSES_ANNULATION,
  causeDepuisMotif,
  MOTIF_PURGE,
  MOTIF_SUPPRESSION,
  normaliserCauseAnnulation,
  phraseCaisseAnnulation,
  phraseClientAnnulation,
  type CauseAnnulation,
} from "./annulation-cause";

/**
 * TROIS CAUSES, TROIS PHRASES — et une accusation qui doit cesser.
 *
 * Le défaut fermé : deux surfaces affirmaient un motif UNIQUE. Le portefeuille
 * disait « Le commerçant a annulé ce lot. » et la caisse « l'opération qui le
 * portait a été supprimée ». Depuis `20260902120000`, la rétention annule elle
 * aussi des lignes de registre, sur le seul critère d'âge. Les deux textes
 * imputaient donc à un commerçant un geste automatique — et côté caisse, le
 * caissier le répétait au client, en face.
 */

const MIGRATION = readFileSync(
  "supabase/migrations/20260902120000_cancel_reward_on_source_delete.sql",
  "utf8",
);

describe("le vocabulaire est celui de la base, pas une invention locale", () => {
  it("les deux motifs bruts sont ceux que le trigger écrit", () => {
    // GARDE MÉCANIQUE, et c'est la raison d'être de ce fichier.
    //
    // La caisse ne peut pas lire `player_wallet` (scopée au joueur porteur du
    // cookie) : elle lit `reward_issuances.cancelled_reason` en direct et
    // dérive la cause elle-même. Ces deux littéraux sont donc une DUPLICATION
    // réelle du `case` SQL. Renommer un motif côté base sans toucher ici ferait
    // retomber TOUTES les annulations automatiques dans le repli `merchant` —
    // c'est-à-dire recréerait exactement l'accusation que ce module ferme, et
    // sans le moindre signal.
    expect(MIGRATION).toContain(`then '${MOTIF_PURGE}'`);
    expect(MIGRATION).toContain(`else '${MOTIF_SUPPRESSION}'`);
  });

  it("les trois causes sont celles que `player_wallet` rend", () => {
    // Même garde, à l'autre bout : la RPC mappe motif → cause, et l'écran du
    // client lit cette cause. Un vocabulaire élargi côté base sans être traité
    // ici retomberait sur `null`, donc sur le repli — visible, mais muet.
    // `merchant` est le REPLI du `case` (`else`), les deux autres des branches
    // `then` : on cherche donc le littéral quoté, sans présumer de sa forme.
    for (const cause of CAUSES_ANNULATION) {
      expect(MIGRATION, `cause absente de la RPC : ${cause}`).toContain(
        `'${cause}'`,
      );
    }
  });

  it("TÉMOIN — la garde saurait voir un motif absent", () => {
    // Sans lui, les deux assertions ci-dessus seraient vertes sur une lecture
    // ratée du fichier (chemin faux, contenu vide) : elles ne prouveraient rien.
    expect(MIGRATION).not.toContain("then 'source jamais écrite'");
    expect(MIGRATION.length).toBeGreaterThan(1000);
  });
});

describe("normaliserCauseAnnulation — ce que rend la RPC", () => {
  it("laisse passer les trois causes du vocabulaire", () => {
    for (const cause of CAUSES_ANNULATION) {
      expect(normaliserCauseAnnulation(cause)).toBe(cause);
    }
  });

  it("`null` hors annulation, et sur toute valeur inattendue", () => {
    // On ne devine pas une cause qu'on n'a pas su lire : la deviner reviendrait
    // à retomber sur `merchant`, le repli accusateur.
    expect(normaliserCauseAnnulation(null)).toBeNull();
    expect(normaliserCauseAnnulation(undefined)).toBeNull();
    expect(normaliserCauseAnnulation("")).toBeNull();
    expect(normaliserCauseAnnulation("PURGED")).toBeNull();
    expect(normaliserCauseAnnulation("autre chose")).toBeNull();
  });
});

describe("causeDepuisMotif — ce dont la caisse dispose", () => {
  it("la rétention n'est PAS imputée au commerçant", () => {
    // L'assertion centrale du chantier. Rouge si le repli avale ce motif.
    expect(causeDepuisMotif(MOTIF_PURGE)).toBe("purged");
    expect(causeDepuisMotif(MOTIF_PURGE)).not.toBe("merchant");
  });

  it("le geste d'entretien reste distinct de l'annulation d'un lot", () => {
    expect(causeDepuisMotif(MOTIF_SUPPRESSION)).toBe("source_deleted");
  });

  it("tout motif SAISI est une décision du commerçant", () => {
    // Repli du `case` SQL, à l'identique : `cancel_participation` écrit ici le
    // texte libre du formulaire, quel qu'il soit.
    expect(causeDepuisMotif("client indésirable")).toBe("merchant");
    expect(causeDepuisMotif("")).toBe("merchant");
  });

  it("aucun motif = aucune cause, jamais `merchant` par défaut", () => {
    // Une ligne sans motif ne dit pas qui a agi ; l'appelant ne sait alors même
    // pas qu'elle est annulée.
    expect(causeDepuisMotif(null)).toBeNull();
    expect(causeDepuisMotif(undefined)).toBeNull();
  });
});

describe("les deux tables de texte — aucune branche muette", () => {
  const TOUTES: Array<CauseAnnulation | null> = [...CAUSES_ANNULATION, null];

  for (const [nom, phrase] of [
    ["client", phraseClientAnnulation],
    ["caisse", phraseCaisseAnnulation],
  ] as const) {
    it(`${nom} : une phrase non vide pour les trois causes ET pour \`null\``, () => {
      for (const cause of TOUTES) {
        const texte = phrase(cause);
        expect(texte.trim(), `branche muette : ${cause ?? "null"}`).not.toBe("");
      }
    });

    it(`${nom} : les quatre phrases sont DISTINCTES`, () => {
      // Deux causes qui partagent leur texte, c'est le défaut d'origine avec
      // une étape de plus : la distinction existerait dans le type et nulle
      // part sur l'écran.
      const textes = TOUTES.map(phrase);
      expect(new Set(textes).size).toBe(TOUTES.length);
    });

    it(`${nom} : « purged » n'impute rien au commerçant`, () => {
      // LA raison d'être du chantier. Rouge si la phrase de la purge se remet à
      // nommer le commerçant comme auteur du geste.
      const texte = phrase("purged").toLowerCase();
      expect(texte).not.toContain("le commerçant a annulé");
      expect(texte).not.toContain("a été supprimée depuis votre espace");
    });
  }

  it("client : aucun jargon de conformité sur l'écran d'un joueur", () => {
    // Le client ouvre son téléphone, pas un registre de traitement. Il a besoin
    // de deux choses — ce n'est pas sa faute, ce n'est pas une décision.
    const texte = phraseClientAnnulation("purged").toLowerCase();
    for (const mot of ["rgpd", "rétention", "conservation", "purge"]) {
      expect(texte, `jargon servi au client : ${mot}`).not.toContain(mot);
    }
    expect(texte).toContain("personne ne l'a annulé");
  });

  it("les deux audiences ne reçoivent pas la même phrase", () => {
    // Le client n'a rien à corriger ; le caissier, lui, lit sa phrase à voix
    // haute et a besoin de savoir d'où vient l'annulation. Les fondre
    // reviendrait à servir un texte de comptoir sur un téléphone, ou l'inverse.
    for (const cause of TOUTES) {
      expect(phraseClientAnnulation(cause)).not.toBe(phraseCaisseAnnulation(cause));
    }
  });
});
