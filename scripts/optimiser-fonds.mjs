// Optimise les 10 fonds d'écran thématiques (chaîne « lumoz » : source lourde
// dans Input/ non versionné, artefacts optimisés seuls dans public/).
//
//   node scripts/optimiser-fonds.mjs        (script npm : assets:fonds)
//
// Entrée  : Input/fonds/<cle>.png — les originaux ChatGPT du propriétaire,
//           1672x941, jamais retouchés ni commités (.gitignore couvre Input/).
// Sortie  : public/fonds/<cle>-{960,1280,1672}.webp + <cle>-vignette.webp
//
// Recette sharp identique à src/actions/branding.ts:60-66 (q88, effort 4,
// jamais d'agrandissement) : c'est la doctrine d'optimisation du dépôt —
// à l'upload/hors build, pas à la requête. La largeur native est 1672 px :
// aucune variante n'est agrandie, le rendu >1672 px est un léger étirement
// CSS assumé (style cartoon, dégradation invisible).
import { readdir, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC = path.resolve("Input/fonds");
const OUT = path.resolve("public/fonds");
const LARGEURS = [960, 1280, 1672];
const VIGNETTE = 360;

const fichiers = (await readdir(SRC)).filter((f) => f.endsWith(".png"));
if (fichiers.length === 0) {
  console.error(`Aucun PNG dans ${SRC} — rien à faire.`);
  process.exit(1);
}
await mkdir(OUT, { recursive: true });

let total = 0;
for (const fichier of fichiers.sort()) {
  const cle = path.basename(fichier, ".png");
  const source = path.join(SRC, fichier);
  for (const largeur of LARGEURS) {
    const dest = path.join(OUT, `${cle}-${largeur}.webp`);
    await sharp(source, { limitInputPixels: 16_000_000 })
      .resize({ width: largeur, withoutEnlargement: true })
      .webp({ quality: 88, effort: 4 })
      .toFile(dest);
    const octets = (await stat(dest)).size;
    total += octets;
    console.log(`${path.basename(dest)}\t${Math.round(octets / 1024)} Ko`);
  }
  const vignette = path.join(OUT, `${cle}-vignette.webp`);
  await sharp(source, { limitInputPixels: 16_000_000 })
    .resize({ width: VIGNETTE, withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toFile(vignette);
  const octets = (await stat(vignette)).size;
  total += octets;
  console.log(`${path.basename(vignette)}\t${Math.round(octets / 1024)} Ko`);
}
console.log(`\nTotal public/fonds : ${(total / 1024 / 1024).toFixed(1)} Mo`);
