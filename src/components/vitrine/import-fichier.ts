/**
 * VIT-8 — LE FICHIER DEVIENT DU TEXTE, ET RIEN DE PLUS.
 *
 * ── CE QUE CE MODULE FAIT, ET SURTOUT CE QU'IL NE FAIT PAS ──
 *
 * Il transforme un fichier en TEXTE BRUT, dans la forme exacte que
 * `analyserCarte` sait déjà lire. Il ne classe pas, ne crée pas de rubrique,
 * n'écrit rien, ne devine aucun allergène, aucun prix, aucune disponibilité.
 * Tout ce qu'il produit retombe dans l'aperçu existant — celui où le commerçant
 * corrige ligne à ligne avant d'importer. Le chemin reste :
 *
 *     fichier → texte → analyserCarte → APERÇU RELU → import_vitrine_carte
 *
 * Ce module n'ajoute donc aucune écriture publique. La seule qui existe est
 * celle qui existait déjà, et elle est toujours précédée d'une relecture.
 *
 * ── POURQUOI TOUT SE PASSE DANS LE NAVIGATEUR ──
 *
 * La carte ne quitte pas la machine du commerçant. C'est le choix le plus
 * simple ET le plus sûr : pas d'endpoint de téléversement à protéger, pas de
 * stockage à purger, pas de quota, pas de fichier hostile à faire transiter par
 * nos serveurs, pas de limite de corps d'action serveur à relever pour tout le
 * monde. Le PDF d'un restaurant reste chez le restaurant ; seul le texte qu'il
 * en tire, une fois relu, part vers la base.
 *
 * ── ZÉRO DÉPENDANCE, ET CE QUE ÇA COÛTE ──
 *
 * `DecompressionStream` est une API du navigateur (et de Node) : elle décomprime
 * les entrées ZIP d'un `.xlsx` et les flux `FlateDecode` d'un PDF sans qu'aucune
 * bibliothèque n'entre dans un dépôt qui en compte quinze.
 *
 * CE QUE ÇA NE COUVRE PAS, ET C'EST DIT À L'ÉCRAN : une image et un PDF SCANNÉ
 * n'ont pas de couche de texte. Les lire demanderait un moteur d'OCR — une
 * dépendance lourde, et une décision qui n'appartient pas à ce module. Plutôt
 * que de rendre du charabia qui ressemble à un succès, l'extraction refuse et
 * dit quoi faire à la place.
 */

import { VITRINE_PRIX_AFFICHE_MAX } from "@/lib/vitrine";

/** D'où vient le texte — l'écran le dit au commerçant après l'extraction. */
export type SourceImport = "texte" | "csv" | "tableur" | "pdf" | "image";

export type ResultatExtraction =
  | { ok: true; source: SourceImport; texte: string; lignes: number }
  | { ok: false; raison: string };

/**
 * Plafond de taille. Une carte de restaurant tient très largement dedans ; au
 * delà, c'est un catalogue d'images, que l'extraction ne saurait pas lire de
 * toute façon. Le refus est immédiat et n'ouvre même pas le fichier.
 */
export const TAILLE_FICHIER_MAX = 8 * 1024 * 1024;

/** Ce que le sélecteur de fichiers propose. */
export const EXTENSIONS_ACCEPTEES =
  ".txt,.md,.csv,.tsv,.xlsx,.pdf,.png,.jpg,.jpeg,.webp,.heic," +
  "text/plain,text/csv,application/pdf,image/*";

const REFUS_PDF_SANS_TEXTE =
  "Ce PDF ne contient que des images — il a probablement été scanné. Envoyez la version d’origine, un fichier .csv ou .xlsx, ou collez le texte de la carte ci-dessus.";
const REFUS_VIDE =
  "Aucun texte lisible n’a été trouvé dans ce fichier.";
const REFUS_TAILLE = `Ce fichier dépasse ${Math.round(TAILLE_FICHIER_MAX / (1024 * 1024))} Mo.`;
const REFUS_FORMAT =
  "Format non reconnu. Formats acceptés : .txt, .csv, .tsv, .xlsx et .pdf.";

/* ────────────────────────────────────────────────────────────
   L'aiguillage
   ──────────────────────────────────────────────────────────── */

/** L'extension, en minuscules et sans le point. `""` si le nom n'en porte pas. */
function extension(nom: string): string {
  const point = nom.lastIndexOf(".");
  return point > 0 ? nom.slice(point + 1).toLowerCase() : "";
}

export async function extraireTexteDeFichier(
  fichier: File,
  /**
   * L'AVANCEMENT DE LA LECTURE D'IMAGE (VIT-18), entre 0 et 1.
   *
   * Facultatif, et ignoré par tous les autres formats : eux se lisent en
   * quelques millisecondes. La reconnaissance, elle, prend dix à trente
   * secondes sur un téléphone — un écran qui ne bouge pas pendant ce temps se
   * lit comme une panne.
   */
  onProgress?: (fraction: number) => void,
): Promise<ResultatExtraction> {
  if (fichier.size > TAILLE_FICHIER_MAX) {
    return { ok: false, raison: REFUS_TAILLE };
  }

  const ext = extension(fichier.name);
  const type = (fichier.type || "").toLowerCase();

  // ── L'IMAGE EST DÉSORMAIS LUE (VIT-18) ──
  //
  // Elle l'était refusée par principe : « une photo n'a pas de texte à lire ».
  // C'était vrai tant qu'aucun moteur ne tournait ici. Il en tourne un
  // maintenant, dans le navigateur et servi depuis notre domaine — la carte ne
  // sort toujours pas du commerce.
  //
  // L'IMPORT DU MOTEUR EST DYNAMIQUE, et il l'est ICI plutôt qu'en tête de
  // fichier : 4,1 Mo ne doivent pas peser sur l'import d'un `.csv`.
  if (
    type.startsWith("image/") ||
    ["png", "jpg", "jpeg", "webp", "heic", "gif", "avif"].includes(ext)
  ) {
    const { texteDepuisImage } = await import(
      "@/components/vitrine/import-ocr"
    );
    const lu = await texteDepuisImage(fichier, onProgress);
    if (!lu.ok) return { ok: false, raison: lu.raison };
    return conclure("image", lu.texte);
  }

  try {
    if (ext === "csv" || ext === "tsv" || type === "text/csv") {
      const brut = await fichier.text();
      return conclure("csv", texteDepuisCsv(brut, ext === "tsv" ? "\t" : null));
    }

    if (ext === "xlsx") {
      const octets = new Uint8Array(await fichier.arrayBuffer());
      return conclure("tableur", await texteDepuisXlsx(octets));
    }

    if (ext === "pdf" || type === "application/pdf") {
      const octets = new Uint8Array(await fichier.arrayBuffer());
      const texte = await texteDepuisPdf(octets);
      if (!texte.trim()) return { ok: false, raison: REFUS_PDF_SANS_TEXTE };
      if (paraitIllisible(texte)) {
        return { ok: false, raison: REFUS_PDF_SANS_TEXTE };
      }
      return conclure("pdf", texte);
    }

    if (ext === "txt" || ext === "md" || type.startsWith("text/")) {
      return conclure("texte", await fichier.text());
    }
  } catch {
    // Fichier tronqué, ZIP corrompu, flux illisible : une seule phrase, la
    // même que pour un fichier vide. Distinguer les causes n'aiderait pas —
    // le geste de réparation est identique.
    return { ok: false, raison: REFUS_VIDE };
  }

  return { ok: false, raison: REFUS_FORMAT };
}

function conclure(source: SourceImport, texte: string): ResultatExtraction {
  const propre = texte.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!propre) return { ok: false, raison: REFUS_VIDE };
  return {
    ok: true,
    source,
    texte: propre,
    lignes: propre.split("\n").filter((l) => l.trim()).length,
  };
}

/* ────────────────────────────────────────────────────────────
   La forme canonique d'une ligne
   ──────────────────────────────────────────────────────────── */

/**
 * `Nom — Description — 12,50 €` : la seule forme que `analyserCarte` relit sans
 * perte. `detacherPrix` trouve le prix en fin de ligne et retire le tiret qui le
 * précède ; `detacherDescription` coupe au PREMIER ` — `. Composer autrement —
 * une virgule, deux-points, un prix au milieu — ferait retomber une colonne
 * dans une autre, en silence.
 */
export function composerLigne(
  nom: string,
  description: string,
  prix: string,
): string {
  const morceaux = [nom.trim()];
  if (description.trim()) morceaux.push(description.trim());
  if (prix.trim()) morceaux.push(prix.trim().slice(0, VITRINE_PRIX_AFFICHE_MAX));
  return morceaux.join(" — ");
}

/* ────────────────────────────────────────────────────────────
   CSV / TSV
   ──────────────────────────────────────────────────────────── */

/**
 * Un lecteur CSV conforme à l'usage : guillemets, guillemets doublés, retours
 * à la ligne DANS un champ, séparateur deviné entre `;` `,` et tabulation.
 *
 * Le point-virgule d'abord : c'est ce qu'exporte un tableur français, et le
 * deviner à l'envers coupait « Tartare, câpres » en deux colonnes.
 */
export function lireCsv(contenu: string, separateur: string | null): string[][] {
  const sep = separateur ?? devinerSeparateur(contenu);
  const lignes: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let dansGuillemets = false;

  for (let i = 0; i < contenu.length; i += 1) {
    const c = contenu[i];

    if (dansGuillemets) {
      if (c === '"') {
        if (contenu[i + 1] === '"') {
          champ += '"';
          i += 1;
        } else {
          dansGuillemets = false;
        }
      } else {
        champ += c;
      }
      continue;
    }

    if (c === '"') {
      dansGuillemets = true;
    } else if (c === sep) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n" || c === "\r") {
      // `\r\n` : le `\n` qui suit ne doit pas ouvrir une seconde ligne vide.
      if (c === "\r" && contenu[i + 1] === "\n") i += 1;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
    } else {
      champ += c;
    }
  }

  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }

  return lignes.filter((l) => l.some((v) => v.trim() !== ""));
}

function devinerSeparateur(contenu: string): string {
  const echantillon = contenu.slice(0, 4000);
  const compte = (c: string) => echantillon.split(c).length - 1;
  const candidats: Array<[string, number]> = [
    [";", compte(";")],
    ["\t", compte("\t")],
    [",", compte(",")],
  ];
  candidats.sort((a, b) => b[1] - a[1]);
  return candidats[0][1] > 0 ? candidats[0][0] : ";";
}

/** Les intitulés de colonnes reconnus, par rôle. Comparaison sans accents. */
const ENTETES: Record<"nom" | "description" | "prix" | "rubrique", string[]> = {
  nom: ["nom", "plat", "produit", "article", "intitule", "libelle", "titre", "name"],
  description: ["description", "descriptif", "detail", "details", "composition"],
  prix: ["prix", "tarif", "prix affiche", "price", "montant"],
  rubrique: ["rubrique", "categorie", "section", "famille", "groupe", "menu"],
};

function normaliser(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * La première ligne est-elle un en-tête ? On l'accepte dès qu'une colonne porte
 * un intitulé reconnu — sans quoi une carte sans en-tête perdrait son premier
 * plat, ce qui est le mode d'échec le plus coûteux d'un import.
 */
function repererColonnes(
  premiere: string[],
): { indices: Partial<Record<keyof typeof ENTETES, number>>; entete: boolean } {
  const indices: Partial<Record<keyof typeof ENTETES, number>> = {};
  premiere.forEach((cellule, index) => {
    const propre = normaliser(cellule);
    (Object.keys(ENTETES) as Array<keyof typeof ENTETES>).forEach((role) => {
      if (indices[role] === undefined && ENTETES[role].includes(propre)) {
        indices[role] = index;
      }
    });
  });
  return { indices, entete: Object.keys(indices).length > 0 };
}

/**
 * Un tableau (CSV ou feuille de calcul) → le texte canonique.
 *
 * SANS EN-TÊTE RECONNU, l'ordre par défaut est nom, description, prix : celui
 * de l'immense majorité des exports, et celui que l'aperçu laisse corriger.
 * Une colonne « rubrique » fait imprimer son intitulé sur une ligne seule, au
 * moment où il change — c'est ce que `analyserCarte` lit comme une rubrique.
 */
export function texteDepuisTableau(lignes: string[][]): string {
  if (lignes.length === 0) return "";

  const { indices, entete } = repererColonnes(lignes[0]);
  const corps = entete ? lignes.slice(1) : lignes;
  const iNom = indices.nom ?? 0;
  const iDesc = indices.description ?? (entete ? undefined : 1);
  const iPrix = indices.prix ?? (entete ? undefined : 2);
  const iRub = indices.rubrique;

  const sortie: string[] = [];
  let rubriqueCourante: string | null = null;

  for (const ligne of corps) {
    const cellule = (i: number | undefined): string =>
      i === undefined ? "" : (ligne[i] ?? "").trim();

    const rubrique = cellule(iRub);
    if (rubrique && rubrique !== rubriqueCourante) {
      rubriqueCourante = rubrique;
      sortie.push(rubrique);
    }

    const nom = cellule(iNom);
    if (!nom) continue;
    sortie.push(composerLigne(nom, cellule(iDesc), cellule(iPrix)));
  }

  return sortie.join("\n");
}

export function texteDepuisCsv(contenu: string, separateur: string | null): string {
  return texteDepuisTableau(lireCsv(contenu, separateur));
}

/* ────────────────────────────────────────────────────────────
   XLSX — un ZIP de XML, et rien de plus
   ──────────────────────────────────────────────────────────── */

async function inflater(octets: Uint8Array, format: "deflate-raw" | "deflate"): Promise<Uint8Array> {
  const flux = new Blob([octets as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

/** Les entrées d'un ZIP dont on a besoin, lues par le répertoire central. */
async function lireZip(
  octets: Uint8Array,
  voulues: (nom: string) => boolean,
): Promise<Map<string, Uint8Array>> {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const sortie = new Map<string, Uint8Array>();

  // Le répertoire central se trouve par SA FIN : le commentaire du ZIP est de
  // longueur variable, donc l'EOCD ne se déduit pas de la taille du fichier.
  let eocd = -1;
  for (let i = octets.length - 22; i >= 0 && i > octets.length - 66_000; i -= 1) {
    if (vue.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip");

  const nbEntrees = vue.getUint16(eocd + 10, true);
  let curseur = vue.getUint32(eocd + 16, true);
  const decodeur = new TextDecoder();

  for (let n = 0; n < nbEntrees; n += 1) {
    if (vue.getUint32(curseur, true) !== 0x02014b50) break;
    const methode = vue.getUint16(curseur + 10, true);
    const tailleCompressee = vue.getUint32(curseur + 20, true);
    const longueurNom = vue.getUint16(curseur + 28, true);
    const longueurExtra = vue.getUint16(curseur + 30, true);
    const longueurCommentaire = vue.getUint16(curseur + 32, true);
    const offsetLocal = vue.getUint32(curseur + 42, true);
    const nom = decodeur.decode(
      octets.subarray(curseur + 46, curseur + 46 + longueurNom),
    );

    if (voulues(nom)) {
      // L'en-tête LOCAL redonne les longueurs de nom et d'extra, qui diffèrent
      // souvent de celles du répertoire central : c'est lui qui situe les
      // octets, jamais le central.
      const nomLocal = vue.getUint16(offsetLocal + 26, true);
      const extraLocal = vue.getUint16(offsetLocal + 28, true);
      const debut = offsetLocal + 30 + nomLocal + extraLocal;
      const donnees = octets.subarray(debut, debut + tailleCompressee);
      sortie.set(
        nom,
        methode === 0 ? donnees : await inflater(donnees, "deflate-raw"),
      );
    }

    curseur += 46 + longueurNom + longueurExtra + longueurCommentaire;
  }

  return sortie;
}

/** `&amp;` et compagnie — les cinq entités que produit un tableur. */
function desechapper(valeur: string): string {
  return valeur
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Le texte d'un `<si>` ou d'un `<is>` : tous ses `<t>`, concaténés. */
function texteDesT(fragment: string): string {
  const morceaux = fragment.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
  return morceaux
    .map((m) => desechapper(m.replace(/^<t[^>]*>/, "").replace(/<\/t>$/, "")))
    .join("");
}

/** `B12` → 1. La lettre de colonne, en base 26. */
function indiceColonne(reference: string): number {
  const lettres = reference.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const lettre of lettres) n = n * 26 + (lettre.charCodeAt(0) - 64);
  return n - 1;
}

export async function texteDepuisXlsx(octets: Uint8Array): Promise<string> {
  const entrees = await lireZip(
    octets,
    (nom) =>
      nom === "xl/sharedStrings.xml" ||
      /^xl\/worksheets\/sheet1\.xml$/.test(nom),
  );

  const feuille = entrees.get("xl/worksheets/sheet1.xml");
  if (!feuille) return "";

  const decodeur = new TextDecoder();
  const partagees: string[] = [];
  const brutPartage = entrees.get("xl/sharedStrings.xml");
  if (brutPartage) {
    const xml = decodeur.decode(brutPartage);
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      partagees.push(texteDesT(si));
    }
  }

  const xmlFeuille = decodeur.decode(feuille);
  const lignes: string[][] = [];

  for (const brutLigne of xmlFeuille.match(/<row[\s\S]*?<\/row>/g) ?? []) {
    const cellules: string[] = [];
    for (const brutCellule of brutLigne.match(/<c[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
      const reference = brutCellule.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = brutCellule.match(/\bt="([^"]+)"/)?.[1] ?? "n";
      let valeur = "";

      if (type === "s") {
        const index = Number(brutCellule.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
        valeur = Number.isInteger(index) ? (partagees[index] ?? "") : "";
      } else if (type === "inlineStr") {
        valeur = texteDesT(brutCellule);
      } else {
        const v = brutCellule.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        valeur = v ? desechapper(v) : "";
      }

      const colonne = reference ? indiceColonne(reference) : cellules.length;
      while (cellules.length < colonne) cellules.push("");
      cellules[colonne] = valeur;
    }
    if (cellules.some((c) => c.trim() !== "")) lignes.push(cellules);
  }

  return texteDepuisTableau(lignes);
}

/* ────────────────────────────────────────────────────────────
   PDF — la couche de texte, quand il y en a une
   ──────────────────────────────────────────────────────────── */

/**
 * Le texte d'un PDF qui en contient.
 *
 * ── LA LIMITE, ÉNONCÉE ──
 *
 * Un PDF est un format de MISE EN PAGE : il place des fragments à des
 * coordonnées, il ne stocke pas de lignes. Ce lecteur reconstruit les lignes
 * par l'ordonnée du curseur de texte — deux fragments à la même hauteur
 * appartiennent à la même ligne, ce qui remet « Margherita » et « 12,50 € »
 * ensemble sur une carte en deux colonnes. C'est ce qui rend le résultat
 * exploitable par `detacherPrix`.
 *
 * Un PDF scanné ne contient aucun fragment de texte : le résultat est vide, et
 * l'appelant le dit. Un PDF à police entièrement ré-encodée peut rendre du
 * charabia : `paraitIllisible` l'attrape avant l'aperçu.
 */
export async function texteDepuisPdf(octets: Uint8Array): Promise<string> {
  const flux = await extraireFluxDeContenu(octets);
  const lignes: string[] = [];

  for (const contenu of flux) {
    for (const ligne of lignesDuFluxPdf(contenu)) lignes.push(ligne);
  }

  return lignes.join("\n");
}

/**
 * Les flux de contenu du document, décompressés.
 *
 * On ne construit PAS l'arbre des objets : on balaie les `stream…endstream` et
 * on ne garde que ceux dont le dictionnaire annonce `/FlateDecode` sans filtre
 * exotique. Les images (`/DCTDecode`, `/JPXDecode`) et les flux chiffrés sont
 * ignorés — ils ne portent pas de texte.
 */
async function extraireFluxDeContenu(octets: Uint8Array): Promise<string[]> {
  const latin = new TextDecoder("latin1").decode(octets);
  const sortie: string[] = [];
  const motif = /stream\r?\n?/g;
  let trouve: RegExpExecArray | null;

  while ((trouve = motif.exec(latin)) !== null) {
    const debut = trouve.index + trouve[0].length;
    const fin = latin.indexOf("endstream", debut);
    if (fin < 0) break;
    motif.lastIndex = fin;

    // Le dictionnaire précède le mot-clé `stream`, sur au plus quelques
    // centaines d'octets.
    const dictionnaire = latin.slice(Math.max(0, trouve.index - 500), trouve.index);
    if (!dictionnaire.includes("/FlateDecode")) continue;
    if (/\/(DCT|JPX|CCITTFax|JBIG2)Decode/.test(dictionnaire)) continue;

    try {
      const brut = octets.subarray(debut, fin);
      const clair = await inflater(brut, "deflate");
      const texte = new TextDecoder("latin1").decode(clair);
      // Un flux de contenu porte forcément un opérateur de texte : sans quoi
      // c'est une police, une image décompressée ou des métadonnées.
      if (/\bBT\b/.test(texte)) sortie.push(texte);
    } catch {
      // Flux illisible : il ne fait pas échouer les autres.
    }
  }

  return sortie;
}

/** Une chaîne PDF littérale `(…)`, échappements compris. */
function lireChaineLitterale(source: string, depart: number): { valeur: string; fin: number } {
  let valeur = "";
  let profondeur = 1;
  let i = depart;

  while (i < source.length) {
    const c = source[i];
    if (c === "\\") {
      const suivant = source[i + 1] ?? "";
      const octal = source.slice(i + 1, i + 4).match(/^[0-7]{1,3}/);
      if (octal) {
        valeur += String.fromCharCode(parseInt(octal[0], 8));
        i += 1 + octal[0].length;
        continue;
      }
      const table: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        b: "\b",
        f: "\f",
        "(": "(",
        ")": ")",
        "\\": "\\",
      };
      valeur += table[suivant] ?? suivant;
      i += 2;
      continue;
    }
    if (c === "(") profondeur += 1;
    if (c === ")") {
      profondeur -= 1;
      if (profondeur === 0) return { valeur, fin: i + 1 };
    }
    valeur += c;
    i += 1;
  }

  return { valeur, fin: i };
}

/** Une chaîne hexadécimale `<…>`, en UTF-16BE si elle porte la marque. */
function lireChaineHexa(source: string): string {
  const chiffres = source.replace(/[^0-9a-fA-F]/g, "");
  const pair = chiffres.length % 2 === 0 ? chiffres : `${chiffres}0`;
  const octets: number[] = [];
  for (let i = 0; i < pair.length; i += 2) {
    octets.push(parseInt(pair.slice(i, i + 2), 16));
  }
  if (octets[0] === 0xfe && octets[1] === 0xff) {
    let valeur = "";
    for (let i = 2; i + 1 < octets.length; i += 2) {
      valeur += String.fromCharCode((octets[i] << 8) | octets[i + 1]);
    }
    return valeur;
  }
  return octets.map((o) => String.fromCharCode(o)).join("");
}

/**
 * Un flux de contenu → des lignes.
 *
 * Le curseur de texte se déplace par `Td`, `TD`, `T*` et `Tm`. On suit sa seule
 * ORDONNÉE : tant qu'elle ne change pas, les fragments s'accumulent sur la même
 * ligne ; dès qu'elle bouge, la ligne se ferme. `Tm` réinitialise, `Td`/`TD`
 * décalent, `T*` descend d'une interligne — approximée à un déplacement, ce qui
 * suffit à séparer deux lignes.
 */
export function lignesDuFluxPdf(contenu: string): string[] {
  const lignes: string[] = [];
  let courante = "";
  let y: number | null = null;
  const nombres: number[] = [];

  const fermer = () => {
    const propre = courante.replace(/\s+/g, " ").trim();
    if (propre) lignes.push(propre);
    courante = "";
  };

  /** Un fragment posé à la même hauteur continue la ligne — avec une espace. */
  const espacer = () => {
    if (courante && !courante.endsWith(" ")) courante += " ";
  };

  const deplacer = (nouveau: number) => {
    if (y === null || Math.abs(nouveau - y) > 0.5) fermer();
    else espacer();
    y = nouveau;
  };

  let i = 0;
  while (i < contenu.length) {
    const c = contenu[i];

    if (c === "(") {
      const { valeur, fin } = lireChaineLitterale(contenu, i + 1);
      courante += valeur;
      i = fin;
      continue;
    }

    if (c === "<" && contenu[i + 1] !== "<") {
      const fin = contenu.indexOf(">", i);
      if (fin < 0) break;
      courante += lireChaineHexa(contenu.slice(i + 1, fin));
      i = fin + 1;
      continue;
    }

    const nombre = contenu.slice(i).match(/^-?\d+(?:\.\d+)?/);
    if (nombre) {
      nombres.push(Number(nombre[0]));
      if (nombres.length > 6) nombres.shift();
      i += nombre[0].length;
      continue;
    }

    const operateur = contenu.slice(i).match(/^(Td|TD|Tm|T\*|Tj|TJ|ET|BT|'|")/);
    if (operateur) {
      const op = operateur[1];
      if (op === "Td" || op === "TD") {
        // `Td tx ty` est RELATIF : sans l'ordonnée courante, on ne peut que
        // constater le déplacement — un `ty` non nul ferme la ligne.
        const tx = nombres[nombres.length - 2] ?? 0;
        const ty = nombres[nombres.length - 1] ?? 0;
        // `ty` non nul : la ligne change. `ty` nul et `tx` non nul : le
        // curseur saute à la colonne de droite — c'est une espace, pas une
        // soudure. Sans elle, « Margherita » et « 12,50 € » arrivent collés et
        // `detacherPrix` ne trouve plus rien.
        if (ty !== 0) fermer();
        else if (tx !== 0) espacer();
        y = (y ?? 0) + ty;
      } else if (op === "Tm") {
        deplacer(nombres[nombres.length - 1] ?? 0);
      } else if (op === "T*" || op === "'" || op === '"') {
        fermer();
      } else if (op === "ET") {
        fermer();
        y = null;
      }
      nombres.length = 0;
      i += op.length;
      continue;
    }

    // Un espace entre deux fragments d'une même ligne : `TJ` intercale des
    // décalages négatifs, qui valent souvent une espace typographique.
    if (c === "]" && courante && !courante.endsWith(" ")) courante += " ";
    i += 1;
  }

  fermer();
  return lignes;
}

/**
 * Ce texte ressemble-t-il à du charabia ?
 *
 * Une police entièrement ré-encodée rend des octets qui ne sont plus des
 * lettres. Le seuil porte sur la part de caractères PLAUSIBLES dans une carte :
 * lettres, chiffres, ponctuation courante, espaces. En dessous des deux tiers,
 * l'aperçu montrerait une bouillie que le commerçant devrait effacer ligne à
 * ligne — refuser lui coûte moins cher.
 */
export function paraitIllisible(texte: string): boolean {
  const echantillon = texte.slice(0, 4000);
  if (echantillon.trim().length < 12) return true;
  const plausibles = echantillon.match(
    /[\p{L}\p{N}\s.,;:!?'’"()\-–—€$£%&/+*°#@]/gu,
  );
  return (plausibles?.length ?? 0) / echantillon.length < 0.66;
}
