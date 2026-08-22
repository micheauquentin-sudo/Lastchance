import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { GRANTABLE_MODULES, type GrantableModule } from "./subscription";

/**
 * GARDE DE COUVERTURE — chaque module qui se CRÉE borne son brouillon gratuit.
 *
 * ── LE DÉFAUT QU'ELLE ATTRAPE ──
 *
 * Le quota est appliqué action par action. Une garde posée huit fois sur neuf
 * est une garde qu'on croit avoir : le module oublié laisse créer sans fin, et
 * rien ne le signale — il n'y a pas d'erreur, juste une limite qui ne limite
 * pas. Ce fichier DÉRIVE la liste des modules de `GRANTABLE_MODULES` et exige
 * que chacun soit couvert, si bien qu'un dixième module ajouté demain fait
 * rougir ce test tant que personne n'a tranché son cas.
 *
 * ── L'EXEMPTION EST NOMMÉE, PAS SILENCIEUSE ──
 *
 * Le parrainage n'a pas d'action de création : son programme est un réglage de
 * campagne, activé ou non (`saveReferralProgram`, colonne `enabled`). Il n'y a
 * donc aucun brouillon à compter. L'exempter par une liste ÉCRITE plutôt que
 * par un `grep` qui ne trouve rien oblige à justifier chaque absence — un
 * module absent parce qu'on l'a oublié et un module absent parce qu'on l'a
 * décidé se ressemblent trop pour être distingués par le vide.
 *
 * ── CE QU'ELLE PROUVE, ET CE QU'ELLE NE PROUVE PAS ──
 *
 * Garde TEXTUELLE au sens d'ADR-074 : elle prouve que l'appel est ÉCRIT dans
 * le fichier de l'action, jamais qu'il est ATTEINT. Un appel placé derrière un
 * `if (false)` la satisferait. Ce qu'elle ferme est l'oubli complet, qui est
 * le mode de défaillance réellement observé sur ce dépôt.
 */

const APPEL = "refuserSiQuotaBrouillonAtteint";

/**
 * Où vit l'action de création de chaque module, et sous quel argument elle
 * doit demander le quota.
 */
const FICHIER_ACTION: Record<GrantableModule, string | null> = {
  wheel: "campaigns.ts",
  hunts: "hunts.ts",
  calendar: "calendar.ts",
  loyalty: "loyalty.ts",
  quiz: "quiz.ts",
  jackpot: "jackpot.ts",
  events: "events.ts",
  pronostics: "pronostics.ts",
  // EXEMPTÉ, avec son motif : pas de création, un réglage booléen par campagne.
  referral: null,
  // EXEMPTÉ, avec son motif — RÉÉCRIT, car le précédent est périmé depuis L10.
  //
  // Il disait : « le lot L2 livre le DROIT SERVEUR "vitrine" et rien d'autre —
  // ni table, ni ressource », et annonçait sa propre chute « le jour où le lot
  // qui livre la Vitrine ajoutera son action ». Ce lot est livré : la table
  // `vitrine_settings` existe, et le trigger `vitrine_settings_guard_publication`
  // (migration 20261011120000) garde sa colonne `published` en base, comme pour
  // les neuf autres modules. La vitrine se publie, et sa publication est gardée.
  //
  // CE QUI RESTE VRAI, et qui est le motif actuel : aucune action de création
  // de la vitrine ne passe par `refuserSiQuotaBrouillonAtteint`, parce qu'il n'y
  // a rien à contingenter — une organisation a UNE vitrine, pas N brouillons de
  // vitrine. Ce test garde des quotas, pas des gardes de publication.
  //
  // CE QUI LA FERAIT TOMBER : que la vitrine devienne contingentée — plusieurs
  // vitrines par organisation, ou une action de création dont la gratuité doit
  // être bornée. Le critère est là, et non plus une date déjà passée.
  vitrine: null,
};

function source(fichier: string): string {
  return readFileSync(join(process.cwd(), "src", "actions", fichier), "utf8");
}

describe("couverture du quota de brouillons", () => {
  it("chaque module a un sort décidé : un fichier d'action, ou une exemption", () => {
    // Dérivé de GRANTABLE_MODULES : un dixième module ne peut pas apparaître
    // sans que quelqu'un écrive ici s'il se crée, et où.
    expect(Object.keys(FICHIER_ACTION).sort()).toEqual(
      [...GRANTABLE_MODULES].sort(),
    );
  });

  it("deux modules sont exemptés, et on sait lesquels", () => {
    // ÉPINGLÉ NOMMÉMENT plutôt que compté : un module retiré du quota par
    // erreur se « réparerait » sinon en le passant à `null`, et ce test
    // resterait vert en ayant cessé de garder quoi que ce soit.
    const exemptes = GRANTABLE_MODULES.filter((m) => FICHIER_ACTION[m] === null);
    expect(exemptes).toEqual(["referral", "vitrine"]);
  });

  it.each(GRANTABLE_MODULES.filter((m) => FICHIER_ACTION[m] !== null))(
    "%s : son action de création demande le quota",
    (nom) => {
      const contenu = source(FICHIER_ACTION[nom]!);
      expect(contenu).toContain(APPEL);
      // L'appel doit porter SON module. Sans cette seconde assertion, huit
      // actions appelant toutes `("wheel")` passeraient — chaque module
      // consommerait le quota d'un autre, et le compte serait faux partout
      // sans qu'aucun test ne bouge.
      expect(contenu).toContain(`${APPEL}("${nom}")`);
    },
  );
});
