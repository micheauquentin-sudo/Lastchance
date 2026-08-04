import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * GARDE DE SOURCE — le lien de désabonnement du rapport du lundi doit tomber
 * sur un interrupteur qui existe, et que son lecteur a le droit d'actionner.
 *
 * ── Ce qu'elle ferme ──
 *
 * `weekly-digest.ts` écrit dans le pied de chaque rapport un lien vers
 * `/dashboard/settings#weekly-digest`. Si l'ancre disparaît, ou si
 * l'interrupteur est déplacé ailleurs, le lien continue de fonctionner en
 * apparence : il ouvre bien les Réglages, simplement sans rien à couper. Le
 * commerçant se désabonne alors par le seul moyen qui lui reste — le bouton
 * « spam » de sa messagerie —, et cette plainte coûte la délivrabilité de tous
 * les e-mails du domaine, codes de gain compris. C'est une panne silencieuse
 * dont l'effet arrive des semaines plus tard, sur un autre canal.
 *
 * L'ancre n'est donc pas recopiée ici : elle est EXTRAITE du module qui
 * fabrique l'e-mail. Les deux bouts bougent ensemble ou le test tombe.
 *
 * ── Pourquoi une garde de source ──
 *
 * Une condition JSX est vérifiée ici par lecture du fichier. Depuis le
 * 2026-08-04 le rendu React est disponible en test
 * (`// @vitest-environment happy-dom`) : c'est donc un choix et non une
 * contrainte — la garde de source prouve la forme, pas le pixel, et suffit
 * pour une ancre dont seule la présence est en jeu.
 */

const SOURCE_DIGEST = readFileSync("src/lib/weekly-digest.ts", "utf8");
const SOURCE_PAGE = readFileSync("src/app/dashboard/settings/page.tsx", "utf8");
const SOURCE_TOGGLE = readFileSync(
  "src/components/dashboard/weekly-digest-toggle.tsx",
  "utf8",
);
const SOURCE_ACTION = readFileSync("src/actions/notifications.ts", "utf8");

/** L'ancre telle que l'e-mail la fabrique — jamais recopiée. */
const ANCRE = (() => {
  const m = /\/dashboard\/settings#([a-z0-9-]+)/.exec(SOURCE_DIGEST);
  expect(m, "le rapport ne pointe plus vers une ancre des Réglages").not.toBeNull();
  return m![1];
})();

describe("le lien de désabonnement mène à l'interrupteur", () => {
  it("l'e-mail vise bien une ancre (et pas la page nue)", () => {
    expect(ANCRE).toBe("weekly-digest");
  });

  it("l'ancre EXISTE sur la page des Réglages", () => {
    expect(
      SOURCE_PAGE,
      `le rapport pointe vers #${ANCRE} : aucun id="${ANCRE}" sur la page`,
    ).toContain(`id="${ANCRE}"`);
  });

  it("l'interrupteur est bien rendu par cette page", () => {
    expect(SOURCE_PAGE).toMatch(/<WeeklyDigestToggle\b/);
    expect(SOURCE_PAGE).toMatch(
      /import \{ WeeklyDigestToggle \} from "@\/components\/dashboard\/weekly-digest-toggle"/,
    );
  });

  it("il vit dans le même bloc que l'autre réglage de notification", () => {
    // Les deux interrupteurs de notification doivent se trouver au même
    // endroit : un commerçant qui cherche à couper ses e-mails ne doit pas
    // avoir à en faire le tour de la page. On vérifie l'ORDRE et la proximité,
    // pas la structure exacte de la carte.
    const iNotify = SOURCE_PAGE.indexOf("<NotifyWinToggle");
    const iDigest = SOURCE_PAGE.indexOf("<WeeklyDigestToggle");
    expect(iNotify).toBeGreaterThan(-1);
    expect(iDigest).toBeGreaterThan(iNotify);
    // Entre les deux : pas d'autre carte. `Card` ouvre chaque bloc de réglage.
    expect(SOURCE_PAGE.slice(iNotify, iDigest)).not.toContain("<Card");
  });
});

describe("l'interrupteur n'est montré qu'à qui peut s'en servir", () => {
  it("l'action est réservée au propriétaire", () => {
    // Le fait d'origine : `updateWeeklyDigest` appelle
    // `requireOrganizationOwner`. Tout le reste de cette garde en découle.
    const bloc = SOURCE_ACTION.slice(
      SOURCE_ACTION.indexOf("export async function updateWeeklyDigest"),
    );
    expect(bloc).toMatch(/requireOrganizationOwner\(\)/);
  });

  it("la page qui le rend renvoie tout autre rôle", () => {
    // MÊME PRINCIPE QUE `peutGererAbonnement` DANS LE LAYOUT. Ce projet a
    // corrigé quatre fois le même défaut : un contrôle offert à quelqu'un qui
    // n'y a pas droit, et dont le clic ne produit qu'une erreur ou un retour
    // au point de départ. Ici la garde n'est pas au niveau du composant mais
    // en tête de page — elle couvre tout l'écran, ce qui est plus fort, et
    // c'est pourquoi le composant lui-même ne teste aucun rôle.
    expect(SOURCE_PAGE).toMatch(/role !== "owner"\)\s*redirect\("\/dashboard"\)/);
    // La garde doit précéder le rendu, sinon elle ne garde rien.
    const iGarde = SOURCE_PAGE.indexOf('role !== "owner"');
    expect(iGarde).toBeGreaterThan(-1);
    expect(iGarde).toBeLessThan(SOURCE_PAGE.indexOf("<WeeklyDigestToggle"));
  });

  it("le composant ne réimplémente aucun contrôle de rôle", () => {
    // CONTRÔLE NÉGATIF de la ligne au-dessus : si le composant se mettait à
    // décider lui-même, il y aurait deux règles pour une seule autorisation,
    // et c'est ainsi qu'elles divergent.
    expect(SOURCE_TOGGLE).not.toMatch(/\brole\b|\bowner\b/);
  });
});

describe("l'interrupteur parle au commerçant, pas à la base", () => {
  it("le champ envoyé est celui que l'action lit", () => {
    const champ = /formData\.get\("([a-z_]+)"\) === "on"/.exec(
      SOURCE_ACTION.slice(
        SOURCE_ACTION.indexOf("export async function updateWeeklyDigest"),
      ),
    );
    expect(champ, "l'action ne lit plus de champ de formulaire").not.toBeNull();
    expect(SOURCE_TOGGLE).toContain(`name="${champ![1]}"`);
  });

  it("le libellé dit QUAND et QUOI, sans nom technique", () => {
    // Un réglage qu'on ne comprend pas ne se coupe pas : il se signale.
    const libelle = /<span className="text-sm text-zinc-700">([\s\S]*?)<\/span>/.exec(
      SOURCE_TOGGLE,
    );
    expect(libelle, "libellé introuvable").not.toBeNull();
    const texte = libelle![1];
    expect(texte, "le libellé ne dit pas quand").toMatch(/lundi/i);
    expect(texte, "le libellé ne dit pas ce qu'on reçoit").toMatch(/lots?/i);
    expect(texte, "nom de colonne exposé au commerçant").not.toMatch(
      /weekly_digest/,
    );
  });
});
