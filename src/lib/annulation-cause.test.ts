import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CAUSES_ANNULATION,
  causeAnnulationRegistre,
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
 *
 * ── CE QUE CE FICHIER PROUVE, ET CE QU'IL NE PROUVE PLUS ────
 *
 * Il a d'abord gardé une DUPLICATION de comportement : la caisse dérivait la
 * cause du texte de `cancelled_reason` et recopiait pour cela les deux
 * sentinelles du `case` SQL. Cette duplication n'existe plus — les deux
 * surfaces lisent `cancelled_source`, colonne à vocabulaire fermé — et les
 * assertions qui la gardaient ont donc été retirées plutôt que laissées
 * vertes : c'est la classe « garde décorative » que ce chantier ferme.
 *
 * Ce qui reste, et qui n'est gardé nulle part ailleurs : le TypeScript et le
 * SQL parlent des MÊMES chaînes, avec le MÊME repli. `CAUSES_ANNULATION` est
 * un vocabulaire fermé côté application ; s'il divergeait de celui que
 * `player_wallet` rend, `normaliserCauseAnnulation` retomberait sur `null` et
 * `causeAnnulationRegistre` sur `merchant` — visibles à l'écran, muets au
 * test. Aucune assertion pgTAP ne peut voir ce bord-là : elle n'ouvre pas le
 * TypeScript.
 *
 * Ce qu'il ne prouve PAS, et qu'il ne faut pas lui demander : que la base se
 * COMPORTE ainsi. Il lit des fichiers, jamais `pg_proc`. Le comportement
 * (quelle fonction écrit la colonne, avec quelle cause) est prouvé contre le
 * catalogue vivant par `reward_source_deletion.test.sql`.
 *
 * Et il ne compare plus à un fichier NOMMÉ : une version antérieure épinglait
 * `20260902120000`, qui a cessé d'être la définition vivante de ces fonctions
 * dès la migration suivante — la garde restait verte en ne mesurant plus rien.
 * La définition est désormais RÉSOLUE : le dernier fichier, dans l'ordre
 * d'application, qui redéfinit la fonction. C'est ce que Postgres retient.
 */

const DOSSIER_MIGRATIONS = "supabase/migrations";

/**
 * Corps de la DERNIÈRE définition d'une fonction, dans l'ordre d'application
 * des migrations — c'est-à-dire celle qui vit en base.
 *
 * `create or replace` interdit la règle « un seul fichier doit nommer cette
 * fonction » : trois migrations définissent `player_wallet`, et c'est normal.
 * Ce qui compte est laquelle a le dernier mot ; les noms de fichiers étant
 * horodatés, l'ordre lexicographique EST l'ordre d'application.
 */
function definitionVivante(nomFonction: string): string {
  const fichiers = readdirSync(DOSSIER_MIGRATIONS)
    .filter((nom) => nom.endsWith(".sql"))
    .sort();
  const porteurs = fichiers.filter((nom) =>
    readFileSync(`${DOSSIER_MIGRATIONS}/${nom}`, "utf8").includes(
      `create or replace function public.${nomFonction}(`,
    ),
  );
  // Zéro porteur = la fonction a été renommée ou supprimée : les assertions
  // ci-dessous deviendraient vertes sur une chaîne vide. On échoue ici, en le
  // disant.
  expect(porteurs.length, `aucune définition de ${nomFonction}`).toBeGreaterThan(
    0,
  );
  return readFileSync(
    `${DOSSIER_MIGRATIONS}/${porteurs[porteurs.length - 1]}`,
    "utf8",
  );
}

describe("le vocabulaire est celui de la base, pas une invention locale", () => {
  const lecteur = definitionVivante("player_wallet");

  it("les trois causes sont celles que `player_wallet` rend", () => {
    // GARDE MÉCANIQUE, et la raison d'être qui reste à ce fichier. Un
    // vocabulaire élargi côté base sans être traité ici retomberait sur le
    // repli — visible à l'écran, muet au test.
    for (const cause of CAUSES_ANNULATION) {
      expect(lecteur, `cause absente de la RPC : ${cause}`).toContain(
        `'${cause}'`,
      );
    }
  });

  it("le repli du TypeScript est celui du SQL, à l'identique", () => {
    // `causeAnnulationRegistre` rend `merchant` sur une cause absente ou
    // illisible. Si le SQL changeait d'avis — repli sur `purged`, ou sur une
    // quatrième valeur —, les deux surfaces diraient deux choses différentes du
    // même lot : le client lirait « personne ne l'a annulé » et le caissier
    // « annulé depuis votre espace ».
    expect(lecteur).toMatch(/coalesce\(\s*r\.cancelled_source,\s*'merchant'\s*\)/);
  });

  it("TÉMOIN — la garde saurait voir une cause absente", () => {
    // Sans lui, les assertions ci-dessus seraient vertes sur une lecture ratée
    // (fichier résolu au mauvais endroit, contenu vide) : elles ne
    // prouveraient rien.
    expect(lecteur).not.toContain("'source jamais écrite'");
    expect(lecteur.length).toBeGreaterThan(1000);
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

describe("causeAnnulationRegistre — ce dont la caisse dispose", () => {
  const ANNULE_LE = "2026-08-01T09:30:00.000Z";

  it("la rétention n'est PAS imputée au commerçant", () => {
    expect(causeAnnulationRegistre(ANNULE_LE, "purged")).toBe("purged");
    expect(causeAnnulationRegistre(ANNULE_LE, "purged")).not.toBe("merchant");
  });

  it("le geste d'entretien reste distinct de l'annulation d'un lot", () => {
    expect(causeAnnulationRegistre(ANNULE_LE, "source_deleted")).toBe(
      "source_deleted",
    );
  });

  it("cause absente = décision du commerçant, jamais une exonération", () => {
    // Le cas NORMAL et non un accident : `upsert_reward_issuance`, qui propage
    // l'annulation d'une participation, ne nomme jamais `cancelled_source`.
    // Retomber sur `purged` ou sur « cause inconnue » offrirait au commerçant
    // l'excuse de l'automatique pour un geste qu'il a bel et bien fait.
    expect(causeAnnulationRegistre(ANNULE_LE, null)).toBe("merchant");
    expect(causeAnnulationRegistre(ANNULE_LE, undefined)).toBe("merchant");
    expect(causeAnnulationRegistre(ANNULE_LE, "PURGED")).toBe("merchant");
  });

  it("aucune annulation = aucune cause, quoi que porte la colonne", () => {
    // Une valeur résiduelle ne doit pas faire dire « annulé » à un lot vivant :
    // les deux lecteurs testent `cancelled_at` d'abord.
    expect(causeAnnulationRegistre(null, "purged")).toBeNull();
    expect(causeAnnulationRegistre(undefined, "source_deleted")).toBeNull();
  });

  it("LE TEXTE LIBRE N'EST PLUS UN PARAMÈTRE — le défaut ne peut pas revenir", () => {
    // La signature elle-même ferme le trou : la cause vient de la colonne que
    // le seul trigger d'annulation écrit, jamais du motif saisi au formulaire.
    // Rouge si quelqu'un rajoute un paramètre texte « pour les anciennes
    // lignes » — elles ont été rattrapées une fois pour toutes par la migration.
    expect(causeAnnulationRegistre.length).toBe(2);
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
