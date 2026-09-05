"use client";

import { useEffect, useRef, useState } from "react";
import {
  PANORAMA_LUMA,
  PANORAMA_PREVIEW,
  PANORAMA_RATIO,
  PANORAMA_TIERS,
  PANORAMA_TINT,
} from "@/lib/backdrop-panorama";

interface ScrollPanoramaBackgroundProps {
  className?: string;
  overlayClassName?: string;
}

/* Deux API non standardisées, donc absentes de `lib.dom` : on les décrit ici
   plutôt que d'élargir l'interface `Navigator` globale — elles sont lues à un
   seul endroit et toujours de façon défensive. */
type ConnectionHint = { saveData?: boolean; effectiveType?: string };
type NavigatorHints = Navigator & { connection?: ConnectionHint };

/** Teinte du voile : le crème de la charte (`--color-k-bg`). */
const VEIL_RGB = "253, 246, 227";

/**
 * Hauteur rendue du panorama, en nombre de fenêtres.
 *
 * C'est ce facteur qui règle la VITESSE de la traversée : à 2,4, on parcourt
 * 1,4 fenêtre d'image pour une page entière de scroll, soit un défilement du
 * décor nettement plus lent que celui du contenu. Le mettre à 1 collerait le
 * décor au contenu et supprimerait tout effet de profondeur ; le monter au-delà
 * de 3 rendrait le fond quasi immobile, donc mort.
 */
const FACTEUR_HAUTEUR = 2.4;

/**
 * Amplitude du recul de caméra : l'image démarre agrandie de `RECUL` et finit à
 * son échelle de base.
 *
 * Le mouvement principal est désormais une DESCENTE — la nouvelle illustration
 * est un corridor de nuages à point de fuite, entièrement ciel du premier au
 * dernier pixel, qui se lit en le parcourant de haut en bas. Le recul demandé
 * par l'utilisateur est conservé, mais réduit à un accompagnement : à 1,18 il se
 * sent sans se voir, là où l'ancienne valeur (1,7) EST le mouvement.
 *
 * La contrainte qui enfermait la fenêtre dans une bande de ciel a disparu avec
 * l'illustration précédente : `PANORAMA_SKY_FRACTION` vaut désormais 1, et le
 * cadrage ne la consulte plus du tout — ni pour s'y conformer, ni pour la tester.
 */
const RECUL = 1.18;

/** Teinte de repli quand une bande n'a pas de dominante franche : l'orange de la charte. */
const ACCENT_FALLBACK: [number, number, number] = [245, 121, 59];
/** Opacité de la variante douce (fonds, liserés). */
const ACCENT_SOFT_ALPHA = 0.18;

/**
 * Éclaircissement de la variante TEXTE de l'accent, vers le blanc.
 *
 * L'accent est reposé à clarté constante (L 0,58) : très bien pour un liseré ou
 * une pastille, insuffisant pour du TEXTE sur une surface sombre translucide.
 * Le ruban défilant en est le cas type — encre à 80 % posée sur le décor, donc
 * une bande dont la couleur réelle dépend de ce qu'il y a derrière. Mesuré en
 * MÉLANGEANT correctement la bande avec le décor, l'accent brut y tombe entre
 * 2,4 et 3,8:1 selon la teinte, sur toutes les teintes du parcours.
 *
 * 0,60 relève le pire cas — un bleu sur la bande la plus claire — à 5,35:1.
 * Éclaircir vers le blanc plutôt que recalculer une teinte à clarté plus haute
 * garde exactement la même famille de couleur, ce qui est tout ce qu'on
 * demande à un accent.
 *
 * Piège à ne pas répéter : `getComputedStyle(...).backgroundColor` d'une
 * surface translucide rend la couleur DÉCLARÉE (ici en `oklab(… / 0.8)`), pas
 * la couleur perçue. La lire comme un triplet RVB donne un chiffre qui n'a
 * aucun rapport — c'est ce qui avait fait conclure à tort que ce ruban passait.
 */
const ACCENT_TEXT_LIGHTEN = 0.6;

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

/**
 * Opacité du voile pour une luminosité de bande donnée (0 = noir, 1 = blanc).
 *
 * La pente a été relevée avec la nouvelle illustration, et ce n'est pas un
 * réglage d'humeur. `PANORAMA_LUMA` porte la luminosité MOYENNE d'une bande ; le
 * corridor rose et violet est très contrasté LOCALEMENT — moyenne 0,61 vers 70 %
 * de l'image, mais des poches à 2,3:1 pour l'encre. L'ancienne pente, calibrée
 * sur un décor bien plus lisse, sous-voilait donc exactement là où l'image est
 * la plus dure à lire.
 *
 * Mesuré sur `p1080.webp`, 5e centile de luminance par bande, colonne de texte
 * (15–85 % de la largeur) : l'encre passe de 2,60:1 à 3,07:1 au pire — le seuil
 * AA du grand texte, qui est ce que porte le décor à nu (les titres). Le petit
 * texte n'y est jamais posé sans `k-halo`, dont c'est précisément le rôle.
 *
 * Monter davantage ne rapporte presque rien : à alpha 0,55 le pire cas plafonne
 * à 3,56:1, pour une illustration lavée. Le contraste du petit texte se gagne
 * avec le halo, pas avec le voile.
 */
function veilAlphaFor(luma: number): number {
  return clamp(0.56 - 0.44 * luma, 0.16, 0.48);
}

/**
 * Teintes du panorama, résolues une fois pour toutes : plus aucun `null`,
 * chaque trou hérite de la dernière teinte franche. Un trou ne doit JAMAIS
 * virer au gris — c'est la seule couleur que l'illustration ne produit pas, et
 * elle se remarquerait immédiatement au milieu d'un décor coloré.
 */
const ACCENT_RGB: readonly (readonly [number, number, number])[] = (() => {
  let last: [number, number, number] = ACCENT_FALLBACK;
  const out: [number, number, number][] = [];
  for (let i = 0; i < PANORAMA_TINT.length; i += 1) {
    const hex = PANORAMA_TINT[i];
    if (hex && /^#[0-9a-f]{6}$/i.test(hex)) {
      last = [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ];
    }
    out.push(last);
  }
  return out;
})();

/**
 * Teinte interpolée entre les deux bandes encadrant `pos` (exprimé en index de
 * bande, fractionnaire). Sans interpolation, la teinte sauterait de bande en
 * bande et chaque saut se verrait sur les liserés qui la consomment.
 */
function accentAt(pos: number): [number, number, number] {
  const last = ACCENT_RGB.length - 1;
  const p = clamp(pos, 0, last);
  const a = Math.floor(p);
  const b = Math.min(a + 1, last);
  const t = p - a;
  const ca = ACCENT_RGB[a];
  const cb = ACCENT_RGB[b];
  return [
    Math.round(ca[0] + (cb[0] - ca[0]) * t),
    Math.round(ca[1] + (cb[1] - ca[1]) * t),
    Math.round(ca[2] + (cb[2] - ca[2]) * t),
  ];
}

/**
 * Décor de fond scrollytelling de la variante `/v2` : UNE image verticale,
 * TRAVERSÉE de haut en bas au scroll, avec un recul de caméra discret par-dessus.
 *
 * Histoire du cadrage, parce qu'elle explique la forme actuelle. Les deux
 * illustrations précédentes descendaient vers une forêt de bambous : leur ciel
 * ne faisait qu'un douzième des pixels, et la demande était de « rester dans les
 * nuages tout le long ». Le seul moyen était d'enfermer la fenêtre dans cette
 * bande étroite et de ne plus faire que reculer sur place — au prix
 * d'agrandissements de ×1,9 à ×3,6, donc d'une image molle en permanence.
 *
 * La nouvelle illustration est entièrement nuageuse (ciel bleu, percée de
 * lumière à mi-hauteur, puis corridor rose et violet) : `PANORAMA_SKY_FRACTION`
 * vaut 1. La contrainte tombe, et avec elle son coût — sur un écran de bureau
 * l'image est désormais rendue PLUS PETITE que sa taille native, donc nette.
 * Le mouvement redevient ce que l'illustration raconte : une descente.
 *
 * Conséquence directe et voulue : le profil de bandes est enfin parcouru sur
 * presque toute sa longueur, donc voile et accent voyagent réellement — bleu
 * 216° en haut, rose 351°, magenta 300°, violet 275° en bas.
 *
 * Différence de fond avec `ScrollVideoBackground` (la version vivante de `/`,
 * qui elle égrène 174 images) : il n'y a rien à précharger par vagues, aucun
 * trou possible, aucun fondu à jouer entre deux vues, et donc aucune raison de
 * lisser le mouvement. Le lissage exponentiel de l'autre composant servait à
 * masquer le passage d'une image à la suivante ; ici le navigateur transforme un
 * unique bitmap, qui peut suivre le scroll au pixel près.
 *
 * Le scroll est néanmoins lu dans une boucle `requestAnimationFrame` qui
 * s'arrête à l'immobilité, et non dans le gestionnaire `scroll` : sur les
 * navigateurs à scroll asynchrone, la valeur lue dans le gestionnaire est déjà
 * périmée au moment de peindre.
 *
 * Le composant est purement décoratif (`aria-hidden`, `pointer-events-none`).
 * Sous « mouvement réduit » ou en connexion ménagée, l'image reste affichée mais
 * FIGÉE sur le cadre du départ (`p = 0`, donc le haut du corridor) : elle n'a
 * rien de coûteux, c'est le mouvement qui est en cause, pas l'illustration.
 *
 * Il publie deux valeurs que le RESTE de la page consomme : `--backdrop-veil`
 * (opacité du voile) et `--backdrop-accent` (teinte dominante du moment, plus sa
 * variante douce). Elles sont posées sur `document.documentElement` et non sur
 * la racine du décor : celle-ci est un `fixed` FRÈRE du contenu, une variable
 * qui y vivrait n'atteindrait ni le marquee ni les sur-titres.
 */
export function ScrollPanoramaBackground({
  className = "",
  overlayClassName = "",
}: ScrollPanoramaBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const img = imgRef.current;
    if (!root || !img) return;

    const hints = navigator as NavigatorHints;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const docStyle = document.documentElement.style;
    const lastBand = PANORAMA_LUMA.length - 1;

    /* Le voile vit dans une variable CSS : le composant ne se re-rend pas au
       scroll, seule cette valeur bouge, et le navigateur ne repeint qu'un div. */
    let lastAlpha = -1;
    const setVeil = (alpha: number) => {
      if (Math.abs(alpha - lastAlpha) <= 0.005) return;
      lastAlpha = alpha;
      root.style.setProperty("--backdrop-veil", alpha.toFixed(3));
    };

    /* Même principe pour la teinte : on ne réécrit que si elle a bougé de façon
       perceptible, sinon chaque tick de rAF invaliderait le style de tous les
       éléments qui la consomment. */
    let lastAccent: [number, number, number] = [-1, -1, -1];
    const setAccent = (rgb: [number, number, number]) => {
      if (
        Math.abs(rgb[0] - lastAccent[0]) < 2 &&
        Math.abs(rgb[1] - lastAccent[1]) < 2 &&
        Math.abs(rgb[2] - lastAccent[2]) < 2
      ) {
        return;
      }
      lastAccent = rgb;
      const triplet = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
      docStyle.setProperty("--backdrop-accent", `rgb(${triplet})`);
      docStyle.setProperty(
        "--backdrop-accent-soft",
        `rgba(${triplet}, ${ACCENT_SOFT_ALPHA})`,
      );
      const clair = rgb.map((c) => Math.round(c + (255 - c) * ACCENT_TEXT_LIGHTEN));
      docStyle.setProperty(
        "--backdrop-accent-text",
        `rgb(${clair[0]}, ${clair[1]}, ${clair[2]})`,
      );
    };

    /** Le mouvement est-il désactivé pour cette visite (préférence ou réseau) ? */
    const isSuppressed = () => {
      if (motionQuery.matches) return true;
      const connection = hints.connection;
      if (!connection) return false;
      if (connection.saveData) return true;
      return connection.effectiveType === "2g" || connection.effectiveType === "slow-2g";
    };

    /* ── Choix du palier ────────────────────────────────────────────────────
       Le premier palier dont la largeur COUVRE le besoin ; au-delà, le
       navigateur agrandit et l'image est réellement molle. Le calcul est REFAIT
       à chaque redimensionnement et à chaque rotation : le décor vidéo ne le
       faisait pas au départ et c'était un vrai défaut — une fenêtre agrandie ou
       un téléphone tourné faisait grandir le cadrage sans que le palier suive.
       On ne redescend jamais : le trafic du palier large est déjà payé, et
       repasser à une image plus étroite ne rendrait ni octets ni mémoire. */
    let tierIndex = -1;
    const applyTier = (renderedWidth: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const need = renderedWidth * dpr;
      let wanted = PANORAMA_TIERS.findIndex((tier) => tier.width >= need);
      if (wanted === -1) wanted = PANORAMA_TIERS.length - 1;
      if (wanted <= tierIndex) return;
      tierIndex = wanted;
      img.src = PANORAMA_TIERS[wanted].src;
    };

    /* Dimensions de base : celles de la FIN du recul (progression 1, échelle 1).
       Tout le reste du mouvement se joue en `transform`, jamais en
       `width`/`height` — une transformation reste composée par le GPU là où un
       changement de dimensions relance une mise en page à chaque image. */
    let hauteurBase = 0;
    let largeurBase = 0;

    const layout = () => {
      /* Deux exigences, dont on prend le maximum :
         — `innerHeight * FACTEUR_HAUTEUR` fixe la course de la traversée, donc
           la vitesse du décor par rapport au contenu ;
         — `innerWidth / PANORAMA_RATIO` garantit que la largeur rendue couvre la
           fenêtre. Le panorama est très étroit (ratio 0,39), donc sur un écran
           large c'est ce second terme qui gagne, et la largeur vaut alors
           exactement `innerWidth` : aucune bande vide sur les côtés, jamais. */
      const hauteur = Math.max(
        window.innerHeight * FACTEUR_HAUTEUR,
        window.innerWidth / PANORAMA_RATIO,
      );
      hauteurBase = hauteur;
      largeurBase = hauteur * PANORAMA_RATIO;
      const largeur = largeurBase;

      img.style.width = `${largeur}px`;
      img.style.height = `${hauteur}px`;
      /* Origine et coin en haut à gauche : la translation porte alors seule le
         cadrage, et se relit directement comme « quel pixel de l'image se pose
         en (0, 0) de la fenêtre ». Un centrage par `left` ferait dépendre le
         résultat de deux réglages au lieu d'un. */
      img.style.left = "0px";
      img.style.top = "0px";
      img.style.transformOrigin = "0 0";

      /* Le palier se choisit sur la largeur la PLUS grande jamais affichée,
         celle du cadre resserré du départ (`p = 0`, échelle `RECUL`). Le choisir
         sur la largeur finale ferait agrandir l'image pendant tout le début du
         scroll — exactement le flou qu'on cherche à éviter. */
      applyTier(largeur * RECUL);
    };

    /* ── Boucle de rendu ────────────────────────────────────────────────────
       Elle ne tourne que tant que la position bouge : une boucle rAF qui tourne
       dans le vide réveille le compositeur en continu et vide la batterie sur
       une page qu'on est en train de lire. */
    let rafId = 0;
    let running = false;
    let stopped = false;
    let lastProgress = Number.NaN;

    /**
     * Pose le cadre pour une progression donnée.
     *
     * L'échelle suit une exponentielle et non une droite. Une interpolation
     * linéaire paraîtrait RALENTIR à mesure qu'on recule : l'œil perçoit le
     * grandissement en relatif, pas en absolu, donc un même décrément d'échelle
     * produit un déplacement apparent de plus en plus faible. `RECUL^(1-p)`
     * garde un rapport constant entre deux instants voisins, donc un recul
     * régulier.
     */
    const render = (progress: number) => {
      const echelle = Math.pow(RECUL, 1 - progress);
      const hauteurAffichee = hauteurBase * echelle;
      const largeurAffichee = largeurBase * echelle;

      /* Cadrage vertical : la TRAVERSÉE. `ty` va de 0 (haut de l'image sur le
         haut de la fenêtre) à `-(H - innerHeight)` (bas de l'image sur le bas de
         la fenêtre), donc le corridor est parcouru d'un bout à l'autre. La
         hauteur dépendant de l'échelle, la course se recalcule à chaque image :
         c'est ce qui fait cohabiter descente et recul sans dérive du cadrage. */
      const ty = -(hauteurAffichee - window.innerHeight) * progress;

      /* Cadrage horizontal : l'image reste CENTRÉE. Le corridor a un point de
         fuite au milieu ; le décaler latéralement casserait la perspective, et
         l'ancienne dérive n'existait que pour donner du mouvement à un cadre qui
         ne descendait pas. Elle n'a plus lieu d'être. */
      const tx = (window.innerWidth - largeurAffichee) * 0.5;

      /* `translate3d` et rien d'autre : `top` ou `background-position`
         provoqueraient une mise en page (ou un repeint) à chaque image. */
      img.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${echelle})`;

      /* Voile et accent s'échantillonnent au CENTRE de la fenêtre réellement
         visible — et non à la progression, qui ne désigne aucun endroit de
         l'image dès que l'échelle bouge. La fenêtre va de `-ty/H` à
         `-ty/H + innerHeight/H` ; son milieu est la seule position qui reste
         représentative de ce que l'œil voit. */
      const centre = clamp(
        (-ty + window.innerHeight / 2) / hauteurAffichee,
        0,
        1,
      );
      const bande = centre * lastBand;
      setVeil(veilAlphaFor(PANORAMA_LUMA[Math.round(bande)] ?? 0.5));
      setAccent(accentAt(bande));
    };

    const paint = () => {
      const span = document.documentElement.scrollHeight - window.innerHeight;
      const progress = span > 0 ? clamp(window.scrollY / span, 0, 1) : 0;
      render(progress);
      return progress;
    };

    const step = () => {
      const progress = paint();
      /* Immobile depuis une image entière : on rend la main. Le prochain
         événement de scroll ou de redimensionnement relancera la boucle. Le
         critère porte sur la progression et non sur une translation : celle-ci
         peut être stationnaire alors que l'échelle, elle, bouge encore. */
      if (Math.abs(progress - lastProgress) < 1e-5) {
        running = false;
        return;
      }
      lastProgress = progress;
      rafId = requestAnimationFrame(step);
    };

    const wake = () => {
      if (stopped || running) return;
      running = true;
      lastProgress = Number.NaN;
      rafId = requestAnimationFrame(step);
    };

    const onScroll = () => wake();
    const onResize = () => {
      layout();
      wake();
    };

    /** Décor figé sur le cadre du départ : ni écoute du scroll, ni boucle rAF. */
    const freeze = () => {
      render(0);
    };

    let listening = false;
    const evaluate = () => {
      if (listening) {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
        listening = false;
      }
      cancelAnimationFrame(rafId);
      running = false;

      layout();
      if (isSuppressed()) {
        freeze();
        return;
      }
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize, { passive: true });
      window.addEventListener("orientationchange", onResize, { passive: true });
      listening = true;
      wake();
    };

    evaluate();
    /* La préférence « mouvement réduit » peut changer en cours de visite : on
       bascule sans recharger la page. */
    motionQuery.addEventListener("change", evaluate);

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      motionQuery.removeEventListener("change", evaluate);
      if (listening) {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
      }
      docStyle.removeProperty("--backdrop-accent");
      docStyle.removeProperty("--backdrop-accent-soft");
      docStyle.removeProperty("--backdrop-accent-text");
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      style={
        {
          "--backdrop-veil": "0.2",
          /* Aperçu de 0,5 Ko en base64 : peint dès le premier rendu, donc avant
             la moindre requête réseau, et couvre l'attente de l'image réelle. */
          backgroundImage: `url("${PANORAMA_PREVIEW}")`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
        } as React.CSSProperties
      }
      className={`pointer-events-none fixed inset-0 z-0 select-none overflow-hidden ${className}`}
    >
      {/* Le panorama. Positionné et transformé par le moteur ci-dessus ; les
          dimensions arrivent au premier `layout()`, d'où l'absence de classe de
          taille ici. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        alt=""
        aria-hidden="true"
        decoding="async"
        onLoad={() => setLoaded(true)}
        /* Priorité laissée par défaut, volontairement : c'est un décor, il ne
           doit pas concourir avec le titre et la roue pour le LCP. */
        className={`absolute top-0 left-0 max-w-none transition-opacity duration-700 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Voile adaptatif : crème d'autant plus dense que l'image est sombre. */}
      <div
        className={`absolute inset-0 ${overlayClassName}`}
        style={{ backgroundColor: `rgba(${VEIL_RGB}, var(--backdrop-veil, 0.2))` }}
      />

      {/* Dégradés fixes : le haut porte l'en-tête, le bas assoit le pied de page. */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#fdf6e3]/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#211d16]/25 to-transparent" />
    </div>
  );
}
