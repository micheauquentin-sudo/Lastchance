import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * LE PASSEPORT DOIT ÊTRE PROPOSÉ DEPUIS CHAQUE ÉCRAN DE FIN DE JEU.
 *
 * ── LE DÉFAUT QUE CETTE GARDE FERME ─────────────────────────────────
 *
 * Un commerçant peut exploiter un Passeport de fidélité en même temps qu'une
 * roue, un quiz, une chasse ou un calendrier sans qu'aucun joueur ne
 * l'apprenne : `/passeport/<programId>` ne s'atteignait qu'en scannant
 * l'affiche du programme. C'est le même motif que
 * `src/lib/portefeuille-atteignable.test.ts` — une capacité livrée sans chemin
 * applicatif — et cette garde est calquée sur elle, délibérément.
 *
 * ── ELLE EST TEXTUELLE, ET C'EST COMPLÉMENTAIRE, PAS INFÉRIEUR ──────
 *
 * Elle prouve que chaque écran de fin IMPORTE la proposition, jamais qu'il la
 * rend. La preuve du RENDU vit dans `proposer-passeport.test.tsx`, qui monte
 * réellement le composant. L'écart entre les deux est le point : celle-ci
 * attrape l'écran de fin écrit demain que personne n'aura pensé à tester ;
 * celle-là attrape la régression de rendu sur les écrans qu'on connaît.
 *
 * ── LES DEUX SURFACES QUI N'Y FIGURENT PAS, ET POURQUOI ─────────────
 *
 * · Les quatre écrans de roue et les quatre tours offerts passent tous par
 *   `RedeemCodeScreen` (`wheel/claim-form.tsx`), point de mutualisation —
 *   c'est LUI qui est listé, pas ses huit appelants.
 * · `loyalty/loyalty-passport.tsx` et `loyalty/loyalty-spin-experience.tsx`
 *   en sont EXCLUS, et cette exclusion est assertée plus bas : proposer le
 *   passeport sur le passeport reviendrait à inviter le joueur là d'où il
 *   vient.
 */

const COMPOSANTS = join(__dirname, "..");
const PROPOSITION = "loyalty/proposer-passeport";

/** Les écrans de fin de jeu, un par module + le point de passage de la roue. */
const ECRANS_DE_FIN = [
  "wheel/claim-form.tsx",
  "hunts/hunt-journey.tsx",
  "jackpot/jackpot-tracker.tsx",
  "event/event-player.tsx",
  "calendar/calendar-tracker.tsx",
  "wheel/referral-panel.tsx",
  "quiz/quiz-experience.tsx",
  "pronos/player-hub.tsx",
];

/** Les surfaces DU passeport : elles ne doivent jamais se proposer elles-mêmes. */
const SURFACES_FIDELITE = [
  "loyalty/loyalty-passport.tsx",
  "loyalty/loyalty-spin-experience.tsx",
];

const lire = (relatif: string) =>
  readFileSync(join(COMPOSANTS, relatif), "utf8");

describe("le passeport est proposé depuis les écrans de fin de jeu", () => {
  it("chacun des huit écrans monte la proposition", () => {
    const sansProposition = ECRANS_DE_FIN.filter(
      (e) => !lire(e).includes(PROPOSITION),
    );
    // Nommer les écrans manquants : un compte seul ne dirait pas lequel.
    expect(sansProposition).toEqual([]);
  });

  it("le tour offert DU passeport exclut explicitement la proposition", () => {
    // `RedeemCodeScreen` est mutualisé : sans ce refus explicite, le joueur
    // qui gagne au tour offert de son passeport se verrait proposer… son
    // passeport. Le défaut est invisible depuis `claim-form.tsx`.
    expect(lire("loyalty/loyalty-spin-experience.tsx")).toContain(
      "proposerPasseport={false}",
    );
  });

  it("aucune surface de fidélité ne se propose elle-même", () => {
    const fautives = SURFACES_FIDELITE.filter((f) =>
      lire(f).includes(PROPOSITION),
    );
    expect(fautives).toEqual([]);
  });

  it("le lien vise le programme, et ne porte rien d'autre", () => {
    const src = lire("loyalty/proposer-passeport.tsx");
    // `programId` est un identifiant PUBLIC de programme — jamais un jeton
    // joueur : le lien ne doit transporter aucune identité.
    expect(src).toContain("href={`/passeport/${invitation.programId}`}");
    // Strictement navigationnel : la SEULE action importée est la lecture.
    // (Le mot « tampon » apparaît dans la documentation du fichier, d'où une
    // garde portée sur les imports et non sur le texte entier.)
    const imports = src.match(/^import .*$/gm) ?? [];
    expect(imports.filter((l) => l.includes("@/actions/"))).toEqual([
      'import { invitationPasseport } from "@/actions/loyalty";',
    ]);
    expect(src).not.toMatch(/stampLoyalty|document\.cookie|<form/);
  });
});
