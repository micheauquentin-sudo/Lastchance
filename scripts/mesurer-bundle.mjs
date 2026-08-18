// Mesure le poids du JavaScript envoyé au navigateur, route par route.
//
//   npm run build && npm run bundle:mesure            (les routes surveillées)
//   npm run bundle:mesure -- --tout                   (toutes les routes)
//   npm run bundle:mesure -- --detail /quiz/[slug]    (le détail des chunks)
//   npm run bundle:mesure -- /play/[slug] /portefeuille
//
// ── POURQUOI CE SCRIPT EXISTE ──
//
// Le poids d'une page n'apparaît nulle part dans la boucle de travail : ni le
// typecheck, ni les tests, ni la CI ne disent qu'un écran a doublé. C'est ce
// silence qui a laissé ~121 Ko gzip de polyfill `node:crypto` s'installer dans
// deux écrans du dashboard, sans qu'aucun import ne le demande — une chaîne
// partie d'un simple littéral de message.
//
// Le procédé reproduit ici est celui de l'audit du 2026-08-16, fait à la main :
// lire le `page_client-reference-manifest.js` d'une route, réunir les chunks
// qu'il déclare, peser les fichiers. Les chiffres se reproduisent à ~0,2 %.
//
// ── CE QU'IL NE FAIT PAS, ET C'EST VOULU ──
//
// AUCUN SEUIL, AUCUN ÉCHEC. Un budget de bundle posé avant d'avoir une série de
// mesures se choisit au doigt mouillé : trop haut il ne dit rien, trop bas il
// devient le test qu'on désactive. On commence par mesurer honnêtement ; le
// seuil viendra quand les chiffres auront une histoire.
//
// Il ne mesure pas non plus le CSS ni les images : le sujet est le JavaScript,
// seul poste qui coûte deux fois (transfert PUIS analyse/exécution).
import { readdir, readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const RACINE = path.resolve(".next/server/app");
const STATIQUE = path.resolve(".next");

/**
 * Les routes suivies par défaut : tout le parcours JOUEUR (servi sur mobile, à
 * des gens qui n'ont rien demandé à personne et paient leur data), plus les deux
 * écrans du dashboard où la chaîne `node:crypto` s'était installée — ils restent
 * sous surveillance parce que la régression y est déjà arrivée une fois.
 */
const ROUTES_SURVEILLEES = [
  // Parcours joueur
  "/play/[slug]",
  "/quiz/[slug]",
  "/pronos/[slug]",
  "/hunt/[token]",
  "/calendar/[slug]",
  "/jackpot/[id]",
  "/event/[code]",
  "/passeport/[programId]",
  "/commande/[token]",
  "/portefeuille",
  "/newsletter/unsubscribe",
  // Les deux récidivistes
  "/dashboard/quiz/[id]",
  "/dashboard/progression",
];

/** Chemin d'affichage d'une route : les groupes `(auth)` n'en font pas partie. */
function routeDepuisChemin(fichier) {
  const relatif = path.relative(RACINE, fichier).split(path.sep).slice(0, -1);
  const segments = relatif.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
}

async function manifestes(dossier = RACINE) {
  const trouves = [];
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...(await manifestes(complet)));
    else if (entree.name === "page_client-reference-manifest.js") trouves.push(complet);
  }
  return trouves;
}

/**
 * Le manifeste est un fichier JS qui pose un littéral JSON sur `globalThis`. On
 * le découpe plutôt que de l'évaluer : exécuter un artefact de build pour le
 * mesurer serait un pouvoir dont ce script n'a aucun besoin.
 */
function lireManifeste(source) {
  const debut = source.indexOf("] = {");
  if (debut < 0) throw new Error("Manifeste illisible : littéral JSON introuvable");
  return JSON.parse(source.slice(debut + 4).replace(/;\s*$/, ""));
}

/** Les chunks JS d'une route, dédoublonnés — chargés une fois, pesés une fois. */
function chunksDeLaRoute(manifeste) {
  const chunks = new Set();
  const ajouter = (chemin) => {
    if (typeof chemin !== "string" || !chemin.endsWith(".js")) return;
    // Deux formes coexistent dans le même fichier : `/_next/static/…` côté
    // clientModules, `static/…` côté entryJSFiles. Même fichier sur le disque.
    chunks.add(chemin.replace(/^\/_next\//, "").replace(/^\//, ""));
  };
  // `entree` et non `module` : ce dernier est un nom réservé côté Next.
  for (const entree of Object.values(manifeste.clientModules ?? {})) {
    for (const chunk of entree.chunks ?? []) ajouter(chunk);
  }
  for (const fichiers of Object.values(manifeste.entryJSFiles ?? {})) {
    for (const chunk of fichiers ?? []) ajouter(chunk);
  }
  return [...chunks].sort();
}

/**
 * gzip au niveau par défaut (6) : c'est ce que servent les CDN. Le niveau 9
 * gagnerait ~0,3 % qu'aucun visiteur ne recevrait — mesurer ce qui n'est pas
 * livré donne un chiffre plus flatteur et moins vrai.
 */
async function peser(chunk) {
  const fichier = path.join(STATIQUE, chunk);
  const contenu = await readFile(fichier);
  return { brut: contenu.length, gzip: gzipSync(contenu).length };
}

function ko(octets) {
  return `${(octets / 1024).toFixed(1)} Ko`;
}

async function main() {
  const args = process.argv.slice(2);
  const tout = args.includes("--tout");
  const detail = args.includes("--detail");
  const demandees = args.filter((a) => a.startsWith("/"));

  try {
    await stat(RACINE);
  } catch {
    console.error(
      "Aucun build trouvé dans .next/server/app — lancer `npm run build` d'abord.",
    );
    process.exit(1);
  }

  const fichiers = await manifestes();
  const parRoute = new Map(fichiers.map((f) => [routeDepuisChemin(f), f]));

  let cibles;
  if (tout) cibles = [...parRoute.keys()].sort();
  else if (demandees.length > 0) cibles = demandees;
  else cibles = ROUTES_SURVEILLEES;

  const lignes = [];
  const manquantes = [];
  for (const route of cibles) {
    const fichier = parRoute.get(route);
    if (!fichier) {
      manquantes.push(route);
      continue;
    }
    const manifeste = lireManifeste(await readFile(fichier, "utf8"));
    const chunks = chunksDeLaRoute(manifeste);
    const poids = await Promise.all(chunks.map(peser));
    const brut = poids.reduce((s, p) => s + p.brut, 0);
    const gzip = poids.reduce((s, p) => s + p.gzip, 0);
    lignes.push({ route, chunks: chunks.length, brut, gzip, poids, noms: chunks });
  }

  lignes.sort((a, b) => b.gzip - a.gzip);

  const largeur = Math.max(6, ...lignes.map((l) => l.route.length));
  console.log(
    `${"Route".padEnd(largeur)}  ${"Chunks".padStart(6)}  ${"Brut".padStart(10)}  ${"Gzip".padStart(10)}`,
  );
  console.log("─".repeat(largeur + 32));
  for (const l of lignes) {
    console.log(
      `${l.route.padEnd(largeur)}  ${String(l.chunks).padStart(6)}  ${ko(l.brut).padStart(10)}  ${ko(l.gzip).padStart(10)}`,
    );
  }

  if (detail) {
    for (const l of lignes) {
      console.log(`\n${l.route}`);
      const parTaille = l.noms
        .map((nom, i) => ({ nom, ...l.poids[i] }))
        .sort((a, b) => b.gzip - a.gzip);
      for (const c of parTaille) {
        console.log(`  ${ko(c.gzip).padStart(10)} gzip  ${c.nom}`);
      }
    }
  }

  if (manquantes.length > 0) {
    console.log(
      `\nAbsentes de ce build (route renommée, ou build partiel) : ${manquantes.join(", ")}`,
    );
  }
  console.log(
    "\nJavaScript seul, gzip niveau 6 (celui des CDN). Les chunks partagés entre",
  );
  console.log(
    "routes sont comptés dans CHACUNE : la colonne dit ce qu'un visiteur arrivant",
  );
  console.log("directement sur cette page télécharge, pas une somme à additionner.");
}

await main();
