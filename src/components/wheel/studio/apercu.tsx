"use client";

import { CadreApercu } from "@/components/studio/cadre-apercu";
import { ApercuAccueilJeu } from "@/components/dashboard/apercu-accueil-jeu";
import type { WheelSegment } from "@/components/wheel/wheel-svg";
import type { EtatRoue } from "@/components/wheel/studio/etat";

/**
 * L'APERÇU DU STUDIO DE LA ROUE (VIT-46).
 *
 * ── IL NE FABRIQUE RIEN : IL MONTE CE QUI EXISTE DÉJÀ ──
 *
 * `ApercuAccueilJeu` est le meilleur point de départ de tout le programme des
 * studios, et il n'a pas été écrit pour eux : il vit dans le tableau de bord
 * depuis que l'étape « Le jeu » et l'étape « L'habillage » ont cessé de
 * dessiner deux aperçus qui divergeaient. Il pose la surface `playSurface`, le
 * fond d'écran, le bandeau kermesse, puis le `GameIdleScreen` que le joueur
 * reçoit vraiment — avec l'emoji, l'accroche et le verbe de SA mécanique.
 *
 * Rien n'est donc recopié ici, et c'est le but : une maquette approximative
 * aurait été une seconde page joueur à tenir d'accord avec la première. C'est
 * le seul défaut qu'un aperçu ne doit jamais avoir parce qu'il est INVISIBLE —
 * rien ne casse, tout a l'air de fonctionner, et l'écart ne se découvre qu'en
 * ouvrant la vraie page (ADR-152).
 *
 * ── AUCUNE ACTION SERVEUR N'EST MONTÉE ICI ──
 *
 * Vérifié fichier par fichier : `apercu-accueil-jeu`, `game-idle-screen`,
 * `wheel-svg`, `play-theme` et `fond-ecran` n'importent RIEN de `@/actions`.
 * Le seul aperçu de ce module qui touche le serveur est `WheelPreviewTest`
 * (il appelle `previewSpin` et CONSOMME une simulation) : il reste où il est,
 * dans l'étape de vérification, et n'entre jamais dans un aperçu permanent —
 * un aperçu qui vit sous les yeux du commerçant pendant qu'il règle vingt
 * curseurs partirait au serveur à chaque curseur.
 *
 * ── L'ÉTAT LOCAL, JAMAIS LA BASE ──
 *
 * `gameType`, `style` et les segments viennent de `EtatRoue` : l'aperçu change
 * AU CLIC, avant tout enregistrement. C'est ce que le commerçant décrivait
 * comme manquant — il choisissait « Carte à gratter » et ne voyait sa mécanique
 * nulle part avant d'enregistrer puis de changer d'étape.
 */
export function ApercuRoue({
  etat,
  segments,
  organizationName,
}: {
  etat: EtatRoue;
  /** Lots ACTIFS de la roue ; l'aperçu retombe sur ses quatre segments de
   *  démonstration quand la roue n'en a aucun. */
  segments: readonly WheelSegment[];
  organizationName: string;
}) {
  return (
    <CadreApercu
      /* 384 px, ET CE N'EST PAS UN CHOIX D'ESTHÉTIQUE : c'est `max-w-sm`, la
         borne que `PlayExperience` pose sur la colonne de la page joueur. Un
         cadre plus large rendrait une mise en page que personne ne verra. La
         valeur reste LITTÉRALE — Tailwind ne compile pas une classe construite
         à l'exécution. */
      classeCadre="w-full max-w-[384px]"
      legende="Aperçu — ce que verront vos clients. Vos modifications s'enregistrent toutes seules."
      banniere={
        <p
          role="status"
          className="w-full max-w-[384px] shrink-0 rounded-xl border-2 border-dashed border-k-ink/40 bg-k-yellow/40 px-3 py-2 text-xs font-black text-k-ink"
        >
          Aperçu de l&apos;écran d&apos;accueil : rien ne se lance ici. Pour
          faire tourner le jeu pour de bon, l&apos;étape « Dernière
          vérification » propose un tour d&apos;essai.
        </p>
      }
    >
      <ApercuAccueilJeu
        style={etat.style}
        organizationName={organizationName}
        gameType={etat.game_type}
        segments={segments}
      />
    </CadreApercu>
  );
}
