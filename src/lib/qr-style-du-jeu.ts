/**
 * Le QR naît habillé comme le jeu qu'il ouvre.
 *
 * ── Le défaut que ce module ferme ──
 *
 * `createQrCode` insérait sans colonne `style` : le jsonb tombait sur son
 * défaut `'{}'`, donc sur `QR_DEFAULTS` — un QR noir sur blanc. Un commerçant
 * qui avait passé dix minutes à choisir un fond « Noël » et un bouton rouge
 * obtenait, sur la page même de son jeu, une vignette qui n'avait rien à voir
 * avec ce qu'il venait de composer. Le studio QR permettait de rattraper à la
 * main ce que la création aurait dû poser d'emblée.
 *
 * ── Ce que la dérivation prend, et ce qu'elle ne prend pas ──
 *
 * Elle ne recopie PAS le style de la roue : un QR n'a pas d'anneau, pas de
 * pointeur, pas de police. Elle prend les deux seules choses qui traversent :
 * la couleur de PAGE (le lavis du fond thématique) et la couleur d'ACCENT du
 * commerçant (`buttonFrom`, le début du dégradé de son bouton).
 *
 * ── L'invariant, qui prime sur le goût ──
 *
 * TOUT style rendu ici passe `isScannable`. Un QR joli et non scanné est un QR
 * raté : dès que l'accent du commerçant ne tient pas le contraste, on retombe
 * sur l'encre maison plutôt que de servir sa couleur. `qr-style-du-jeu.test.ts`
 * repasse l'invariant sur les dix fonds à chaque exécution.
 *
 * Aucune de ces valeurs ne vient du client : `createQrCode` ne prend que
 * `campaign_id` et `label`, et la dérivation est faite côté serveur à partir de
 * la roue active. Il n'y a donc rien de plus à valider ici.
 */

import { LAVIS_SAISON } from "@/components/ui/theme-lavis";
import { QR_PRESETS, isScannable, type ResolvedQrStyle } from "@/lib/qr-render";
import type { WheelStyle } from "@/lib/wheel-style";

/** Encre maison — le repli quand l'accent du commerçant ne tient pas. */
const ENCRE = "#211d16";

/** Blanc franc — le repli de FOND sur une page « nuit » (voir plus bas). */
const BLANC = "#ffffff";

/**
 * Le goût « Kermesse », lu sur le preset du studio QR plutôt que recopié :
 * les deux ne peuvent pas diverger, et `qr-render.test.ts` garantit déjà que
 * tout preset livré est scannable.
 */
const KERMESSE = QR_PRESETS.find((p) => p.key === "kermesse")?.style ?? null;

/**
 * Hex sur SIX chiffres, en minuscules.
 *
 * `wheelStyleSchema` accepte `#abc` autant que `#aabbcc` ; `qrStyleSchema`
 * (src/actions/qr-codes.ts) n'accepte QUE six chiffres. Sans cette expansion,
 * un commerçant dont le bouton est réglé en trois chiffres verrait son QR créé
 * avec une couleur que le studio refuserait ensuite de ré-enregistrer.
 */
function hex6(couleur: string): string | null {
  const v = couleur.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return null;
}

/**
 * Style de QR assorti au jeu, ou `null` quand il n'y a rien à dériver — auquel
 * cas le QR garde le défaut noir et blanc, qui reste le bon rendu pour une
 * page jamais habillée.
 */
export function qrStyleDuJeu(style: WheelStyle): Partial<ResolvedQrStyle> | null {
  const fond = style.fond;

  if (fond) {
    const lavis = LAVIS_SAISON[fond];
    const accent = hex6(style.buttonFrom);

    // 1. L'accent du commerçant sur le lavis de son fond — le cas nominal.
    if (accent && isScannable({ dark: accent, light: lavis, eyeColor: accent })) {
      return { dark: accent, light: lavis, eyeColor: accent };
    }

    // 2. Ambiance « nuit » : le lavis est une couleur de page CLAIRE posée sous
    //    une image, et le QR, lui, est imprimé seul. Plutôt que de jeter
    //    l'accent du commerçant parce qu'il rate le lavis de peu, on blanchit
    //    le fond du QR — ce qui ne se voit que sur le QR, jamais sur la page.
    //    Réservé à « nuit » : sur « kermesse », le crème EST l'univers du site
    //    et le blanchir trahirait le thème choisi.
    if (
      accent &&
      style.pageTheme === "nuit" &&
      isScannable({ dark: accent, light: BLANC, eyeColor: accent })
    ) {
      return { dark: accent, light: BLANC, eyeColor: accent };
    }

    // 3. Repli : l'encre maison sur le lavis. Le plus sombre des lavis rend
    //    14:1 à l'encre — l'invariant tient quel que soit le fond.
    return { dark: ENCRE, light: lavis, eyeColor: ENCRE };
  }

  // Sans fond, seule l'ambiance « kermesse » dit quelque chose d'assez net pour
  // en tirer un habillage : l'encre sur crème du site.
  if (style.pageTheme === "kermesse" && KERMESSE) return { ...KERMESSE };

  return null;
}
