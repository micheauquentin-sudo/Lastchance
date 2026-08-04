import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * LE PORTEFEUILLE DOIT RESTER ATTEIGNABLE DEPUIS CHAQUE ÉCRAN DE GAIN.
 *
 * ── LE DÉFAUT QUE CETTE GARDE FERME ─────────────────────────────────
 *
 * `/portefeuille` rassemble les lots des neuf familles et lit leur échéance
 * dans le registre — la source que la caisse applique. Il était complet et
 * **atteignable par personne** : son adresse n'apparaissait dans aucun fichier
 * du produit sauf le sien, donc un client ne pouvait y arriver qu'en la
 * devinant. C'est le motif déjà reproché plusieurs fois ici — une capacité
 * livrée sans chemin applicatif pour l'atteindre — pris du côté de l'écran.
 *
 * Il devient critique depuis `20260904120000` : le commerçant peut donner une
 * échéance aux sept familles qui n'en avaient aucune, et le portefeuille est
 * le seul endroit où le client peut lire cette échéance.
 *
 * ── CE QU'ELLE PROUVE, ET CE QU'ELLE NE PROUVE PAS ──────────────────
 *
 * Elle est TEXTUELLE (ADR-074) : elle prouve que chaque écran de gain IMPORTE
 * le lien, jamais qu'il le rend — le rendu dépend de branches (`code !== null`)
 * qu'aucun test ne peut atteindre sans environnement de rendu React, dont ce
 * dépôt ne dispose pas. La limite est réelle et écrite plutôt que tue.
 *
 * ── ELLE SE DÉRIVE, MAIS PAS ENTIÈREMENT, ET C'EST DIT ──────────────
 *
 * Les écrans de gain ne se dérivent d'aucun dossier ni d'aucun suffixe : ce
 * qui les définit est « cet écran montre au client un code qu'il présentera en
 * caisse », une propriété de sens. Ils sont donc DÉRIVÉS DU TEXTE qu'ils
 * portent tous — la phrase « en caisse » près d'un code — et le compte attendu
 * est épinglé pour qu'un huitième écran ne s'ajoute pas en silence.
 */

const RACINE = join(__dirname, "..", "..");
const COMPOSANTS = join(RACINE, "src", "components");
const LIEN = "wallet/lien-portefeuille";

/**
 * Les écrans où le client lit un CODE à présenter en caisse.
 *
 * Huit et non sept : la confrontation ci-dessous a trouvé les pronostics, que
 * la liste écrite à la main avait manqués — la 9ᵉ famille émet bien un
 * `PRONO-…`, et c'est même le seul écran qui affichait déjà son échéance.
 *
 * ── LA ROUE N'Y EST PAS, ET C'EST DÉLIBÉRÉ ──────────────────────────
 *
 * Ses trois écrans (`play-experience`, `game-shell`, `scratch-experience`)
 * disent « Présentez cet ÉCRAN au comptoir » : le gain y est l'écran lui-même,
 * QR compris, et `claim-form` porte déjà son propre traitement d'échéance —
 * un compte à rebours qui masque le code et annonce « Ce code n'est plus
 * valable », aligné sur `redeem_expires_at`. Le critère retenu ici est net et
 * vérifiable — un code de retrait affiché en toutes lettres — plutôt
 * qu'extensible au jugé. Le lien y reste utile et n'est pas posé : c'est un
 * reste OUVERT assumé, pas un oubli.
 */
const ECRANS_DE_GAIN = [
  "hunts/hunt-journey.tsx",
  "loyalty/loyalty-passport.tsx",
  "jackpot/jackpot-tracker.tsx",
  "event/event-player.tsx",
  "calendar/calendar-tracker.tsx",
  "wheel/referral-panel.tsx",
  "quiz/quiz-experience.tsx",
  "pronos/player-hub.tsx",
];

function fichiersSous(dir: string, suffixe: string): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, entree.name);
    if (entree.isDirectory()) out.push(...fichiersSous(chemin, suffixe));
    else if (entree.name.endsWith(suffixe)) out.push(chemin);
  }
  return out;
}

describe("le portefeuille est atteignable depuis les écrans de gain", () => {
  it("chacun des sept écrans porte le lien", () => {
    const sansLien = ECRANS_DE_GAIN.filter(
      (e) => !readFileSync(join(COMPOSANTS, e), "utf8").includes(LIEN),
    );
    // Nommer les écrans manquants : un compte seul ne dirait pas lequel.
    expect(sansLien).toEqual([]);
  });

  it("aucun écran montrant un code en caisse n'a été oublié", () => {
    // La liste ci-dessus est écrite à la main faute de critère dérivable ;
    // cette assertion la CONFRONTE au texte du produit. Un huitième écran de
    // gain écrit demain fait rougir ici, à l'endroit où on l'ajouterait.
    const candidats = fichiersSous(COMPOSANTS, ".tsx")
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        // « en caisse » près d'un code de retrait, hors partage social
        // (`text:` d'un navigator.share) qui n'est pas un écran.
        return /Présente(z)? ce code en caisse|Présentez ce code en caisse/.test(
          src,
        );
      })
      .map((f) =>
        f.slice(COMPOSANTS.length + 1).replace(/\\/g, "/"),
      );

    expect([...candidats].sort()).toEqual([...ECRANS_DE_GAIN].sort());
  });

  it("le lien vise la route fixe, sans rien passer dans l'adresse", () => {
    const src = readFileSync(
      join(COMPOSANTS, "wallet", "lien-portefeuille.tsx"),
      "utf8",
    );
    // `PortefeuillePage()` ne prend AUCUN argument, par sécurité : un lien
    // qui porterait un identifiant désignerait le portefeuille de quelqu'un
    // d'autre, c'est-à-dire ses codes de retrait — des droits au porteur.
    expect(src).toContain('href="/portefeuille"');
    expect(src).not.toMatch(/href=\{[^}]*portefeuille[^}]*\$\{/);
  });
});
