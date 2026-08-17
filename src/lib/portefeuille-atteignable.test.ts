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
 * le lien, jamais qu'il le rend.
 *
 * **Ce n'est plus une contrainte, c'est un choix** — depuis le 2026-08-04 le
 * dépôt sait rendre du React en test (`// @vitest-environment happy-dom`).
 * Cette garde reste textuelle parce qu'elle fait le travail qu'un test de
 * rendu ne fait pas : elle **se dérive du système de fichiers**, donc elle
 * attrape l'écran de gain écrit demain que personne n'aura pensé à tester —
 * c'est elle qui a trouvé les pronostics manquants. Un test de rendu, lui,
 * ne voit que les composants qu'on a décidé de monter.
 *
 * Les deux formes sont donc COMPLÉMENTAIRES, et l'écart entre elles est la
 * démonstration : la couverture vient d'ici, la preuve du rendu vient de
 * `src/components/wheel/claim-form.test.tsx` et de
 * `src/components/wallet/lien-portefeuille.test.tsx`.
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
 * ── LA ROUE EST COUVERTE AILLEURS, ET C'EST MIEUX AINSI ─────────────
 *
 * Ses écrans (`play-experience`, `game-shell`, `scratch-experience`,
 * `skill-game-shell`) disent « Présentez cet ÉCRAN au comptoir » : ils
 * n'entrent donc pas dans le critère textuel ci-dessus, qui vise un code
 * affiché en toutes lettres. Le lien y arrive par `RedeemCodeScreen`
 * (`claim-form.tsx`), point de passage unique de HUIT surfaces — les quatre
 * écrans de roue et les quatre tours offerts (calendrier, fidélité, quiz,
 * parrainage).
 *
 * Ce composant a **deux vues mutuellement exclusives** (code valable, code
 * expiré) et le lien doit être dans les deux : un import unique en tête de
 * fichier satisferait une garde textuelle même s'il n'était posé que dans
 * l'une. C'est pourquoi il est gardé par un test de RENDU
 * (`claim-form.test.tsx`) et non ici.
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

// ────────────────────────────────────────────────────────────────────
// L'ÉCRAN DE BLOCAGE — le seul écran de gain qui n'en avait pas l'air
// ────────────────────────────────────────────────────────────────────

/**
 * LE JOUEUR BLOQUÉ AVEC UN LOT EN BASE DOIT POUVOIR LE REJOINDRE.
 *
 * Les quatre coques de jeu (roue, révélation, grattage, défi) rendent un écran
 * `blocked` — 🔒 « Impossible de jouer » — quand le serveur refuse le tour. Or
 * ce refus est le cas ORDINAIRE du joueur qui a DÉJÀ gagné : `play_limit` vaut
 * « weekly » par défaut, donc revenir dans la semaine se solde par un refus, et
 * c'est exactement la situation où un lot non réclamé existe à son nom. L'écran
 * ne portait alors AUCUNE sortie : ni bouton, ni lien, ni retour. Le lot était
 * décrémenté du stock, le client ne pouvait plus l'atteindre depuis nulle part.
 *
 * La reprise (`recoverPendingWin`) couvre le cas où elle répond ; elle peut
 * précisément ne pas répondre — c'est le drapeau `repriseIndisponible` — et
 * c'est alors le portefeuille qui reste le seul chemin vers le lot.
 *
 * Cette garde vise le BLOC RENDU, pas le fichier : un import en tête satisfait
 * une recherche textuelle même si le lien n'est posé que sur l'écran gagnant.
 * La population se dérive du système de fichiers, comme au-dessus.
 */

/** Corps de l'expression JSX `{phase === "blocked" && ( … )}`, par comptage. */
function blocDuBlocage(src: string): string {
  const marqueur = src.indexOf('phase === "blocked"');
  if (marqueur === -1) return "";
  const ouvrant = src.lastIndexOf("{", marqueur);
  let profondeur = 0;
  for (let i = ouvrant; i < src.length; i += 1) {
    if (src[i] === "{") profondeur += 1;
    else if (src[i] === "}") {
      profondeur -= 1;
      if (profondeur === 0) return src.slice(ouvrant, i + 1);
    }
  }
  return src.slice(ouvrant);
}

/** Toute coque de jeu qui peut BASCULER un joueur sur l'écran de blocage. */
const COQUES_BLOQUANTES = fichiersSous(COMPOSANTS, ".tsx")
  .filter((f) => readFileSync(f, "utf8").includes('setPhase("blocked")'))
  .map((f) => f.slice(COMPOSANTS.length + 1).replace(/\\/g, "/"))
  .sort();

describe("l'écran de blocage offre une sortie vers le portefeuille", () => {
  it("les quatre coques de jeu sont bien la population", () => {
    // Épinglé pour qu'une cinquième coque n'échappe pas à la garde en silence,
    // et pour qu'un renommage de la phase ne vide pas la population sans bruit.
    expect(COQUES_BLOQUANTES).toEqual([
      "wheel/game-shell.tsx",
      "wheel/play-experience.tsx",
      "wheel/scratch-experience.tsx",
      "wheel/skill-game-shell.tsx",
    ]);
  });

  it.each(COQUES_BLOQUANTES)("%s rend le lien DANS le bloc bloqué", (relatif) => {
    const src = readFileSync(join(COMPOSANTS, relatif), "utf8");
    const bloc = blocDuBlocage(src);

    expect(bloc, "le bloc rendu doit être trouvable").not.toBe("");
    expect(bloc).toContain("<LienPortefeuille");
    // Le composant doit être réellement importé, pas seulement nommé.
    expect(src).toContain(LIEN);
  });

  it.each(COQUES_BLOQUANTES)(
    "%s avoue une reprise impossible plutôt que de se taire",
    (relatif) => {
      const src = readFileSync(join(COMPOSANTS, relatif), "utf8");
      // Le drapeau n'existe QUE pour cet écran : posé quand les deux tentatives
      // de `recoverPendingWin` ont échoué, il évite d'affirmer « impossible de
      // jouer » à un joueur dont on n'a simplement pas pu lire le gain.
      expect(src).toContain("setRepriseIndisponible(true)");
      expect(blocDuBlocage(src)).toContain("repriseIndisponible");
    },
  );
});
