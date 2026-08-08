import type { ReactElement } from "react";
import { fondSrc, fondSrcSet, type FondKey } from "@/lib/fonds-ecran";

/**
 * FOND D'ÉCRAN THÉMATIQUE — l'image cartoon plein cadre qui habille une page
 * joueur, sous le décor SVG et sous le contenu.
 *
 * ── Le contrat de montage, identique à `ThemeDecor` ──
 *
 * Ce composant rend UNE couche `absolute inset-0`, sans `z-index`. Il doit
 * donc être posé en PREMIER ENFANT d'un conteneur `position: relative`, et le
 * contenu ensuite : deux boîtes positionnées à `z-index: auto` se départagent
 * à l'ordre du DOM. C'est le seul empilement autorisé ici — voir
 * `player-page-shell.tsx` et `play-backdrop.tsx` pour ce que ce dépôt a payé
 * en posant un `z-index` ou une `opacity` sur un conteneur : la mesure de
 * contraste d'axe-core retombe alors sur le crème du `<body>` (1,07:1 relevé
 * là où le joueur voit 21:1).
 *
 * `aria-hidden` + `pointer-events-none` : c'est du PAPIER PEINT, jamais du
 * contenu. Le second n'est pas qu'un confort de clic — `elementsFromPoint`,
 * dont axe-core se sert pour résoudre le fond d'un texte, IGNORE les éléments
 * `pointer-events: none`. Le fond reste ainsi invisible au calcul de
 * contraste, qui continue de porter sur la surface réellement peinte.
 *
 * ── LE VOILE EST CE QUI TIENT LA LISIBILITÉ ──
 *
 * `ThemeDecor` protégeait le texte par la CARTE DES EMPLACEMENTS : les deux
 * couloirs non encartés des pages joueur (l'en-tête et le pied de page, tous
 * deux centrés) restaient vides de motifs. Une photo plein cadre rend cette
 * méthode caduque : elle couvre tout, on ne peut pas « ne pas peindre » sous
 * l'en-tête.
 *
 * D'où le voile, un dégradé vertical à alpha posé PAR-DESSUS l'image dans la
 * même couche. Il est RENFORCÉ EN HAUT ET EN BAS — exactement les deux
 * couloirs de texte libre — et s'éclaircit au centre, où le contenu vit sur
 * des cartes blanches opaques qui se défendent seules. Un dégradé à alpha est
 * une feuille peinte, pas une `opacity` de conteneur : il ne crée aucun
 * contexte d'empilement et ne déplace donc pas la mesure de contraste.
 *
 * ── L'animation ──
 *
 * Une dérive lente type Ken Burns (`scale(1.06)` → `scale(1)` en 45 s,
 * alternate), posée sur l'`<img>` SEULE et jamais sur un conteneur : l'image
 * ne contient aucun texte, un `transform` y est sans conséquence sur la
 * lecture. Coupée par `prefers-reduced-motion` (globals.css), et réservée au
 * variant `page` — une vignette de 40 px qui respire est du bruit.
 */

/** Voile : la teinte de la surface sous-jacente, pas une couleur libre. */
export type VoileFond = "creme" | "nuit";

/**
 * Les deux dégradés, mesurés à l'œil sur les dix fonds puis contrôlés au scan
 * axe sur les pages joueur.
 *
 * Les stops ne sont pas symétriques et c'est délibéré : le HAUT porte le nom
 * du commerce et le titre (deux lignes, souvent sur trois hauteurs de texte),
 * le BAS ne porte qu'une mention « propulsé par » en petit corps — laquelle,
 * étant plus petite, exige au contraire la couverture la plus franche. Le
 * creux du milieu (45 %) est le seul endroit où le dessin se voit vraiment ;
 * le réduire davantage rendrait les dix fonds interchangeables, l'augmenter
 * ferait passer un titre sur un aplat de couleur saturée.
 */
const VOILES: Record<VoileFond, string> = {
  creme:
    "linear-gradient(to bottom, rgba(253,246,227,.94) 0%, rgba(253,246,227,.62) 26%, rgba(253,246,227,.48) 58%, rgba(253,246,227,.90) 100%)",
  nuit: "linear-gradient(to bottom, rgba(12,1,24,.92) 0%, rgba(12,1,24,.60) 26%, rgba(12,1,24,.46) 58%, rgba(12,1,24,.88) 100%)",
};

/**
 * VIGNETTE — voile uniforme et léger. Aucun texte ne repose dessus (le libellé
 * du thème est SOUS la vignette), et une pastille de 40 px de haut n'a que
 * l'image pour dire de quel fond il s'agit : la voiler comme une page la
 * rendrait indistincte de ses neuf voisines. Même raisonnement que
 * `ALPHA_VIGNETTE` dans `theme-decor.tsx`.
 */
const VOILES_VIGNETTE: Record<VoileFond, string> = {
  creme: "rgba(253,246,227,.25)",
  nuit: "rgba(12,1,24,.25)",
};

/** `sizes` par variant — le fond de page occupe toute la largeur, pas les autres. */
const SIZES = {
  page: "100vw",
  apercu: "420px",
  vignette: "180px",
} as const;

export function FondEcran({
  fond,
  variant = "page",
  voile = "creme",
  className = "",
}: {
  fond: FondKey;
  /**
   * `page` : le fond réel du joueur (dérive animée, chargement immédiat mais
   * en priorité basse). `apercu` : la maquette de téléphone du Studio.
   * `vignette` : la pastille d'un sélecteur de thème.
   */
  variant?: "page" | "apercu" | "vignette";
  /** Teinte du voile — doit suivre la surface sous laquelle le fond se pose. */
  voile?: VoileFond;
  className?: string;
}): ReactElement {
  const estPage = variant === "page";
  const estVignette = variant === "vignette";

  return (
    <div
      aria-hidden
      data-fond={fond}
      className={`pointer-events-none absolute inset-0 select-none overflow-hidden ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- le dépôt n'utilise
          pas next/image (convention assumée) ; les dix fonds sont déjà
          pré-dimensionnés en trois largeurs et servis via srcSet. */}
      <img
        src={fondSrc(fond, estVignette ? "vignette" : 1280)}
        srcSet={estVignette ? undefined : fondSrcSet(fond)}
        sizes={estVignette ? undefined : SIZES[variant]}
        alt=""
        decoding="async"
        /* Fond décoratif : il ne doit jamais voler la bande passante au jeu
           lui-même, qui est la raison de la visite. */
        fetchPriority={estPage ? "low" : undefined}
        loading={estPage ? undefined : "lazy"}
        className={`h-full w-full object-cover ${estPage ? "fond-derive" : ""}`}
      />
      <div
        className="absolute inset-0"
        style={{
          background: estVignette ? VOILES_VIGNETTE[voile] : VOILES[voile],
        }}
      />
    </div>
  );
}
