/**
 * Fabrique le décor de fond « panorama » — la variante /v2 de l'accueil.
 *
 * Là où la version vivante parcourt 172 images tirées d'une vidéo, celle-ci
 * parcourt UNE image verticale : un ciel bleu qui s'ouvre sur une percée de
 * lumière, puis un corridor de nuages roses et violets. Le récit se fait
 * entièrement dans les nuages.
 *
 * C'est la troisième illustration de cette variante, et la première qui ne
 * contienne QUE du ciel. Les deux précédentes descendaient vers une forêt de
 * bambous : leur ciel n'occupait qu'un douzième des pixels, et tenir le décor
 * « dans les nuages » obligeait à resserrer le cadre au point d'agrandir
 * l'image. Ici, toute la hauteur est utilisable — d'où `PANORAMA_SKY_FRACTION`
 * à 1, et un décor servi sans le moindre agrandissement.
 *
 * Pourquoi c'est une bien meilleure affaire. La séquence d'images coûte 9 à
 * 30 Mo selon le palier, parce qu'elle porte 172 fois la même scène à un
 * instant près. Le panorama porte la scène UNE fois : 1,4 Mo pour la totalité,
 * en qualité supérieure. Il n'y a rien à précharger par vagues, rien à décoder
 * image par image, aucun trou possible pendant le scroll — le navigateur
 * télécharge une image et la déplace.
 *
 * Sortie :
 *   public/panorama/p<largeur>.<sha256:8>.webp, un par palier
 *   src/lib/backdrop-panorama.ts   (dimensions, paliers, profils, aperçu)
 *
 * Ne dépend ni de ffmpeg ni d'aucun outil externe : `sharp` suffit.
 *
 *   node scripts/build-backdrop-panorama.mjs [chemin/vers/image.jpg]
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hueHistogram, perceivedLuminance, smoothAccents } from "./lib/teintes.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const sharp = require("sharp");

/**
 * Panorama source, nommé explicitement.
 *
 * `Input/` reçoit plusieurs générations de la même illustration, sous des noms
 * horodatés qu'on ne devine pas. Prendre « le fichier le plus récent » serait
 * commode et dangereux : une image déposée pour tout autre chose deviendrait le
 * décor du site sans que personne l'ait décidé. On nomme donc celle qui fait
 * foi, et on change CETTE ligne quand une nouvelle génération est retenue.
 *
 * Historique : « Image site.jpg » (ciel blanc, forêt) → « 6_45PM » (nuages roses,
 * forêt) → celle-ci, entièrement nuageuse, qui lève la contrainte de cadrage.
 */
const PANORAMA_SOURCE = "Generated Image September 05, 2026 - 10_58AM.jpg";

const SOURCE = process.argv[2] ?? join(ROOT, "Input", PANORAMA_SOURCE);
const PUBLIC_DIR = join(ROOT, "public", "panorama");
const CONTENT_FILE = join(ROOT, "src", "lib", "backdrop-panorama.ts");

/**
 * Paliers intermédiaires servis, en largeur. Le client n'en charge qu'un, et la
 * qualité peut être haute sans remords : l'image entière au palier natif pèse
 * moins qu'une seule seconde de la séquence vidéo.
 *
 * Le palier le plus large n'est pas dans cette liste :
 * c'est la largeur NATIVE de la source, ajoutée au moment de la fabrication.
 *
 * Une constante en dur ne survit pas au changement d'illustration — la
 * précédente faisait 2624 px de large, celle-ci 2560, et un palier figé à 2624
 * aurait demandé d'agrandir la source pour la servir. On ne devine pas la
 * taille du plus grand palier : on la lit sur l'image.
 */
const TIERS_INTERMEDIAIRES = [1080, 1920];
const QUALITY = 86;

/**
 * Longueur du hachage inscrit dans le nom de fichier.
 *
 * Les images sont servies en `Cache-Control: immutable` sur un an
 * (`next.config.ts`) : cet en-tête promet qu'une URL ne rendra jamais un autre
 * contenu. La première version écrivait `p1080.webp` — un nom stable pour un
 * contenu qui change à chaque génération — et un visiteur déjà venu aurait gardé
 * l'ancien décor un an sans recours. Le nom porte donc le sha256 du webp : une
 * autre image, une autre URL, plus aucun cache à invalider.
 *
 * Huit caractères hexadécimaux, soit 4 milliards de valeurs, pour trois fichiers
 * régénérés ensemble : la collision n'est pas un risque, et le nom reste lisible.
 */
const HASH_LENGTH = 8;

/** Nom servi pour un palier : sa largeur, puis l'empreinte de son contenu. */
function nomDuPalier(width, buffer) {
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, HASH_LENGTH);
  return `p${width}.${hash}.webp`;
}

/**
 * Nombre de bandes horizontales analysées.
 *
 * Le voile de lisibilité et la teinte d'accent suivent la position dans le
 * panorama, exactement comme ils suivaient l'image courante du film. 64 bandes
 * sur 6528 px, soit une mesure tous les 102 px : plus fin que ce que l'œil
 * distingue sur un fond qui défile.
 */
const BANDS = 64;

/** Demi-fenêtre de lissage, en bandes, appliquée aux histogrammes de teinte. */
const ACCENT_SMOOTHING = 3;

/** Aperçu flou encodé dans le module : peint avant même la première requête. */
const PREVIEW_WIDTH = 20;

/**
 * Détection de la végétation : par la TEINTE, et à haute résolution.
 *
 * Trois réglages successifs ont laissé passer des bambous dans le hero, chacun
 * pour une raison différente — les trois valent d'être retenues.
 *
 *   1. « Plus de 2 % de la ligne est verte » plaçait la limite à 22,4 %. Faux :
 *      les cimes percent le ciel par les ANGLES, et quelques dizaines de pixels
 *      sur une ligne de 2624 ne pèsent rien en proportion tout en se voyant
 *      parfaitement.
 *   2. Le critère est donc passé à « un seul pixel suffit » — mais l'analyse
 *      tournait sur une réduction à 256 px de large, où une pousse fine
 *      disparaît purement et simplement. Réponse : 17,9 % au lieu de 16,3 %.
 *   3. Restait le test lui-même, `vert > rouge × 1,12`, qui rate les feuillages
 *      JAUNES : un bambou ensoleillé à (180, 200, 90) échoue de peu. En teinte,
 *      la même végétation commence en réalité à 15,3 %.
 *
 * D'où la forme actuelle : teinte entre `HUE_MIN` et `HUE_MAX`, saturation
 * minimale pour écarter les gris, un seul pixel suffit, analyse à
 * `ANALYSIS_WIDTH` — la moitié de la source, où plus rien ne se perd.
 */
const HUE_MIN = 55;
const HUE_MAX = 165;
const ANALYSIS_WIDTH = 1312;

/**
 * Saturation minimale, mesurée en HSV (`delta / max`) et NON en HSL.
 *
 * Quatrième piège de cette fonction, découvert sur l'illustration de nuages :
 * elle a déclaré de la végétation à 9,7 % de la hauteur d'une image qui n'en
 * contient aucune. Le coupable était `rgb(253, 251, 228)` — un reflet quasi
 * BLANC sur un bord de nuage. Sa teinte calcule 55° parce que le bleu y est à
 * peine plus bas que le rouge et le vert ; et la saturation HSL,
 * `delta / (1 - |2L - 1|)`, DIVERGE près du blanc : son dénominateur tend vers
 * zéro et rendait 0,86 pour un pixel qui n'a pas de couleur.
 *
 * `delta / max` ne diverge pas : le même pixel rend 0,10, sous le seuil. Les
 * bornes de clarté ci-dessous ferment la porte au cas symétrique, le presque
 * noir. Vérifié sur les deux illustrations : bambous retrouvés à 15,32 % sur
 * l'ancienne, aucune détection sur la nouvelle.
 */
const CANOPY_SATURATION = 0.18;
const CANOPY_LIGHT_MIN = 0.12;
const CANOPY_LIGHT_MAX = 0.78;

/**
 * Marge de sécurité retranchée à la hauteur de ciel trouvée.
 *
 * 3 % et non 2 % : la fenêtre d'un visiteur peut être plus large et plus courte
 * que celle des tests, et elle montre alors une plus grande part de la LARGEUR
 * de l'illustration — donc ses angles, précisément là où les premières pousses
 * se cachent. La marge paie cette variabilité.
 */
const SKY_MARGIN = 0.03;

/** Ce pixel appartient-il à de la végétation ? Voir les constantes ci-dessus. */
function estVegetal(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 8) return false;

  if (delta / max < CANOPY_SATURATION) return false;

  const lightness = (max + min) / 2 / 255;
  if (lightness < CANOPY_LIGHT_MIN || lightness > CANOPY_LIGHT_MAX) return false;

  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;

  return hue >= HUE_MIN && hue <= HUE_MAX;
}

/**
 * Fraction de la hauteur, depuis le haut, où l'image n'est que ciel — `1` quand
 * elle l'est de bout en bout.
 *
 * Le décor s'en sert pour borner son cadrage : la fenêtre visible ne doit jamais
 * descendre plus bas, sinon le hero s'ouvre sur de la végétation. La mesurer ici
 * plutôt que de la fixer dans le composant, c'est la garder juste le jour où
 * l'illustration change — et elle a déjà changé deux fois.
 */
async function skyFraction(source) {
  const { data, info } = await sharp(source)
    .resize({ width: ANALYSIS_WIDTH })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * c;
      if (estVegetal(data[o], data[o + 1], data[o + 2])) {
        return Math.max(0.05, Number((y / h - SKY_MARGIN).toFixed(4)));
      }
    }
  }
  return 1;
}

function renderContentModule({ width, height, tiers, sky, luma, tint, preview }) {
  const lumaRows = [];
  for (let i = 0; i < luma.length; i += 8) {
    lumaRows.push("  " + luma.slice(i, i + 8).map((n) => n.toFixed(3)).join(", ") + ",");
  }
  const tintRows = [];
  for (let i = 0; i < tint.length; i += 4) {
    tintRows.push("  " + tint.slice(i, i + 4).map((c) => (c ? `"${c}"` : "null")).join(", ") + ",");
  }
  const brightest = Math.max(...luma).toFixed(2).replace(".", ",");
  const darkest = Math.min(...luma).toFixed(2).replace(".", ",");

  return [
    "/**",
    " * Décor « panorama » de la variante /v2 : une seule illustration verticale,",
    " * parcourue au scroll. La source vit hors dépôt (`Input/` est ignoré) — les",
    " * images se régénèrent avec `node scripts/build-backdrop-panorama.mjs`.",
    " *",
    ` * Le panorama descend d'un ciel de cumulus à un cœur de lave : la luminosité`,
    ` * perçue passe de ${brightest} à ${darkest}. Un voile d'opacité fixe serait donc soit`,
    " * inutile en haut, soit opaque en bas. PANORAMA_LUMA porte la luminosité de",
    " * chaque bande, PANORAMA_TINT sa teinte dominante : voile et accents suivent",
    " * la descente, comme ils suivent le film sur la version vivante.",
    " *",
    " * Fichier généré — ne pas éditer à la main.",
    " */",
    "",
    "/** Dimensions de la source, pour calculer le cadrage sans attendre le chargement. */",
    `export const PANORAMA_WIDTH = ${width};`,
    `export const PANORAMA_HEIGHT = ${height};`,
    `export const PANORAMA_RATIO = ${(width / height).toFixed(5)};`,
    "",
    "/** Paliers de largeur. Le client n'en charge qu'un, le plus étroit qui couvre. */",
    "export const PANORAMA_TIERS = [",
    ...tiers.map((t) => `  { src: "/panorama/${t.file}", width: ${t.width} },`),
    "] as const;",
    "",
    "/**",
    " * Fraction de la hauteur, depuis le haut, où l'image n'est QUE du ciel.",
    " *",
    " * Le décor s'en sert pour cadrer son ouverture : au repos, la fenêtre",
    " * visible ne doit pas descendre plus bas, sinon le hero s'ouvre sur des",
    " * bambous. Mesurée sur l'image, marge de sécurité comprise — et remesurée",
    " * à chaque génération, parce que l'illustration a déjà changé une fois.",
    " */",
    `export const PANORAMA_SKY_FRACTION = ${sky};`,
    "",
    "/** Aperçu flou, peint avant la première requête réseau. */",
    `export const PANORAMA_PREVIEW = "${preview}";`,
    "",
    `/** Luminosité perçue, une valeur par bande, du haut vers le bas (${luma.length} bandes). */`,
    "export const PANORAMA_LUMA: readonly number[] = [",
    ...lumaRows,
    "];",
    "",
    "/** Teinte dominante de chaque bande, `null` si la bande n'en a pas. */",
    "export const PANORAMA_TINT: readonly (string | null)[] = [",
    ...tintRows,
    "];",
    "",
  ].join("\n");
}

async function main() {
  const meta = await sharp(SOURCE).metadata();
  console.log(`Source ${SOURCE}`);
  console.log(`  ${meta.width} × ${meta.height} px (ratio ${(meta.width / meta.height).toFixed(3)})`);
  if (meta.height <= meta.width) {
    throw new Error("Le panorama doit être vertical : la hauteur doit dépasser la largeur.");
  }

  mkdirSync(PUBLIC_DIR, { recursive: true });

  /* Le plus large palier est la source elle-même : on ne l'agrandit jamais, et
     on ne se prive pas non plus de ses pixels. Les intermédiaires plus larges
     que la source seraient des doublons — on les écarte. */
  const largeurs = [
    ...TIERS_INTERMEDIAIRES.filter((w) => w < meta.width),
    meta.width,
  ];

  const tiers = [];
  for (const width of largeurs) {
    const buffer = await sharp(SOURCE)
      .resize({ width })
      .webp({ quality: QUALITY, effort: 6 })
      .toBuffer();
    const file = nomDuPalier(width, buffer);
    writeFileSync(join(PUBLIC_DIR, file), buffer);
    tiers.push({ width, file });
    console.log(`  ${file}  ${(buffer.length / 1024).toFixed(0)} Ko`);
  }

  /* Les générations précédentes ont laissé leurs propres noms hachés : sans ce
     ménage, `public/panorama/` accumulerait un décor mort par régénération, et
     la garde de `src/lib/backdrop-panorama.test.ts` rougirait sur l'orphelin.
     On ne supprime que ce que ce script écrit — un `p*.webp` dont le chemin
     résolu reste sous PUBLIC_DIR — et jamais le reste du dossier. */
  const gardes = new Set(tiers.map((t) => t.file));
  for (const entree of readdirSync(PUBLIC_DIR)) {
    if (gardes.has(entree)) continue;
    if (!/^p.*\.webp$/.test(entree)) continue;
    const chemin = resolve(PUBLIC_DIR, entree);
    if (chemin !== join(PUBLIC_DIR, entree)) continue;
    unlinkSync(chemin);
    console.log(`  supprimé ${entree} (génération précédente)`);
  }

  /* Analyse sur une version réduite : les mesures sont des moyennes, elles ne
     gagnent rien à être prises sur 2624 px de large et coûteraient dix fois
     plus cher. */
  const bandHeight = Math.floor(meta.height / BANDS);
  const analyse = await sharp(SOURCE)
    .resize({ width: 64 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const aw = analyse.info.width;
  const ah = analyse.info.height;
  const ch = analyse.info.channels;
  const bandRows = Math.max(1, Math.floor(ah / BANDS));

  const luma = [];
  const histograms = [];
  for (let b = 0; b < BANDS; b++) {
    const y0 = b * bandRows;
    const rows = b === BANDS - 1 ? ah - y0 : bandRows;
    const slice = analyse.data.subarray(y0 * aw * ch, (y0 + rows) * aw * ch);
    const pixels = aw * rows;
    luma.push(perceivedLuminance(slice, ch, pixels));
    histograms.push(hueHistogram(slice, ch, pixels));
  }
  const tint = smoothAccents(histograms, ACCENT_SMOOTHING);

  const sky = await skyFraction(SOURCE);

  const previewBuffer = await sharp(SOURCE)
    .resize({ width: PREVIEW_WIDTH })
    .webp({ quality: 40 })
    .toBuffer();
  const preview = `data:image/webp;base64,${previewBuffer.toString("base64")}`;

  writeFileSync(
    CONTENT_FILE,
    renderContentModule({ width: meta.width, height: meta.height, tiers, sky, luma, tint, preview }),
  );

  console.log(`  ${BANDS} bandes · hauteur ${bandHeight} px chacune`);
  console.log(`  luminosité ${Math.min(...luma)} → ${Math.max(...luma)}`);
  console.log(`  accents ${tint.filter(Boolean).length}/${tint.length} bandes teintées`);
  console.log(`  ciel pur jusqu'à ${(sky * 100).toFixed(1)} % de la hauteur`);
  console.log(`  aperçu ${(preview.length / 1024).toFixed(1)} Ko en base64`);
  console.log(`Écrit : ${PUBLIC_DIR} et ${CONTENT_FILE}`);
}

await main();
