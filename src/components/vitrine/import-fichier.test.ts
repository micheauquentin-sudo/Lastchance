// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  composerLigne,
  lignesDuFluxPdf,
  lireCsv,
  paraitIllisible,
  texteDepuisCsv,
  texteDepuisTableau,
  texteDepuisXlsx,
} from "@/components/vitrine/import-fichier";
import { analyserCarte } from "@/components/vitrine/import-parse";

/**
 * VIT-8 — un fichier devient du TEXTE, que l'aperçu existant relit.
 *
 * LE TEST QUI COMPTE LE PLUS EST LE DERNIER : le texte produit ici doit
 * retraverser `analyserCarte` sans perte. Composer autrement — une virgule au
 * lieu du tiret cadratin, un prix au milieu — ferait retomber une colonne dans
 * une autre EN SILENCE, et une carte de soixante plats arriverait sans prix
 * sans qu'aucun message ne le dise. C'est le seul mode d'échec qu'un écran
 * d'import ne rattrape pas, parce qu'il ressemble à un succès.
 */

describe("lireCsv", () => {
  it("devine le point-virgule avant la virgule", () => {
    // Un export de tableur français. Deviner la virgule aurait coupé
    // « Tartare, câpres » en deux colonnes.
    expect(lireCsv("Nom;Description\nTartare;Tartare, câpres", null)).toEqual([
      ["Nom", "Description"],
      ["Tartare", "Tartare, câpres"],
    ]);
  });

  it("lit les guillemets, les guillemets doublés et le retour à la ligne interne", () => {
    const contenu = 'Nom;Description\n"Pizza ""du chef""";"Base tomate\nOrigan"';
    expect(lireCsv(contenu, null)).toEqual([
      ["Nom", "Description"],
      ['Pizza "du chef"', "Base tomate\nOrigan"],
    ]);
  });

  it("écarte les lignes entièrement vides", () => {
    expect(lireCsv("Nom;Prix\n\n;\nTarte;6,50", null)).toEqual([
      ["Nom", "Prix"],
      ["Tarte", "6,50"],
    ]);
  });
});

describe("texteDepuisTableau", () => {
  it("reconnaît les en-têtes, quels que soient l'accent et la casse", () => {
    const texte = texteDepuisTableau([
      ["Catégorie", "PLAT", "Descriptif", "Tarif"],
      ["Entrées", "Velouté", "Potiron", "8 €"],
    ]);
    expect(texte).toBe("Entrées\nVelouté — Potiron — 8 €");
  });

  it("n'avale pas la première ligne quand il n'y a pas d'en-tête", () => {
    // Le mode d'échec le plus coûteux d'un import : perdre le premier plat.
    const texte = texteDepuisTableau([
      ["Velouté", "Potiron", "8 €"],
      ["Tartare", "Câpres", "14 €"],
    ]);
    expect(texte).toBe("Velouté — Potiron — 8 €\nTartare — Câpres — 14 €");
  });

  it("n'imprime une rubrique qu'au moment où elle change", () => {
    const texte = texteDepuisTableau([
      ["Rubrique", "Nom", "Prix"],
      ["Entrées", "Velouté", "8 €"],
      ["Entrées", "Salade", "9 €"],
      ["Plats", "Tartare", "14 €"],
    ]);
    expect(texte).toBe(
      "Entrées\nVelouté — 8 €\nSalade — 9 €\nPlats\nTartare — 14 €",
    );
  });

  it("saute une ligne sans nom plutôt que d'inventer un plat", () => {
    const texte = texteDepuisTableau([
      ["Nom", "Prix"],
      ["", "8 €"],
      ["Salade", "9 €"],
    ]);
    expect(texte).toBe("Salade — 9 €");
  });
});

describe("composerLigne", () => {
  it("omet les morceaux vides au lieu de laisser des tirets orphelins", () => {
    expect(composerLigne("Café", "", "")).toBe("Café");
    expect(composerLigne("Café", "", "2 €")).toBe("Café — 2 €");
  });
});

/* ────────────────────────────────────────────────────────────
   XLSX — un ZIP construit à la main, entrées STOCKÉES
   ──────────────────────────────────────────────────────────── */

/**
 * Un `.xlsx` minimal, sans compression : le lecteur de ZIP est ainsi éprouvé
 * pour lui-même (répertoire central, en-tête local, décalages) sans dépendre du
 * moteur de décompression.
 */
function zipStocke(fichiers: Array<[string, string]>): Uint8Array {
  const encodeur = new TextEncoder();
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let offset = 0;

  for (const [nom, contenu] of fichiers) {
    const octetsNom = encodeur.encode(nom);
    const octetsContenu = encodeur.encode(contenu);

    const local = new Uint8Array(30 + octetsNom.length + octetsContenu.length);
    const vueLocale = new DataView(local.buffer);
    vueLocale.setUint32(0, 0x04034b50, true);
    vueLocale.setUint16(8, 0, true); // méthode : stocké
    vueLocale.setUint32(18, octetsContenu.length, true);
    vueLocale.setUint32(22, octetsContenu.length, true);
    vueLocale.setUint16(26, octetsNom.length, true);
    local.set(octetsNom, 30);
    local.set(octetsContenu, 30 + octetsNom.length);
    locales.push(local);

    const centrale = new Uint8Array(46 + octetsNom.length);
    const vueCentrale = new DataView(centrale.buffer);
    vueCentrale.setUint32(0, 0x02014b50, true);
    vueCentrale.setUint16(10, 0, true);
    vueCentrale.setUint32(20, octetsContenu.length, true);
    vueCentrale.setUint32(24, octetsContenu.length, true);
    vueCentrale.setUint16(28, octetsNom.length, true);
    vueCentrale.setUint32(42, offset, true);
    centrale.set(octetsNom, 46);
    centrales.push(centrale);

    offset += local.length;
  }

  const tailleCentrale = centrales.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const vueEocd = new DataView(eocd.buffer);
  vueEocd.setUint32(0, 0x06054b50, true);
  vueEocd.setUint16(8, fichiers.length, true);
  vueEocd.setUint16(10, fichiers.length, true);
  vueEocd.setUint32(12, tailleCentrale, true);
  vueEocd.setUint32(16, offset, true);

  const total = offset + tailleCentrale + eocd.length;
  const sortie = new Uint8Array(total);
  let curseur = 0;
  for (const bloc of [...locales, ...centrales, eocd]) {
    sortie.set(bloc, curseur);
    curseur += bloc.length;
  }
  return sortie;
}

describe("texteDepuisXlsx", () => {
  it("lit les chaînes partagées, les chaînes en ligne et les nombres", async () => {
    const partagees = `<?xml version="1.0"?><sst count="4"><si><t>Nom</t></si><si><t>Prix</t></si><si><t>Velout&#233;</t></si><si><t>Tartare &amp; c&#226;pres</t></si></sst>`;
    const feuille = `<?xml version="1.0"?><worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>8.5</v></c></row>
      <row r="3"><c r="A3" t="inlineStr"><is><t>Salade</t></is></c><c r="B3"><v>9</v></c></row>
      <row r="4"><c r="A4" t="s"><v>3</v></c><c r="B4"><v>14</v></c></row>
    </sheetData></worksheet>`;

    const texte = await texteDepuisXlsx(
      zipStocke([
        ["xl/sharedStrings.xml", partagees],
        ["xl/worksheets/sheet1.xml", feuille],
      ]),
    );

    expect(texte).toBe("Velouté — 8.5\nSalade — 9\nTartare & câpres — 14");
  });

  it("respecte la lettre de colonne quand une cellule manque", async () => {
    // `B2` absente : la valeur de `C2` ne doit pas glisser dans la colonne du
    // prix — elle appartient à une troisième colonne.
    const feuille = `<?xml version="1.0"?><worksheet><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Nom</t></is></c><c r="B1" t="inlineStr"><is><t>Description</t></is></c><c r="C1" t="inlineStr"><is><t>Prix</t></is></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>Café</t></is></c><c r="C2" t="inlineStr"><is><t>2 €</t></is></c></row>
    </sheetData></worksheet>`;

    const texte = await texteDepuisXlsx(
      zipStocke([["xl/worksheets/sheet1.xml", feuille]]),
    );
    expect(texte).toBe("Café — 2 €");
  });

  it("rend une chaîne vide quand le classeur n'a pas de première feuille", async () => {
    const texte = await texteDepuisXlsx(
      zipStocke([["xl/sharedStrings.xml", "<sst/>"]]),
    );
    expect(texte).toBe("");
  });
});

/* ────────────────────────────────────────────────────────────
   PDF
   ──────────────────────────────────────────────────────────── */

describe("lignesDuFluxPdf", () => {
  it("regroupe sur une seule ligne deux fragments à la même hauteur", () => {
    // Le cas d'une carte en deux colonnes : le nom à gauche, le prix à droite.
    // Les séparer aurait privé `detacherPrix` de tout prix à trouver.
    const flux = `BT /F1 12 Tf 72 700 Td (Margherita) Tj 400 0 Td (12,50 €) Tj ET`;
    expect(lignesDuFluxPdf(flux)).toEqual(["Margherita 12,50 €"]);
  });

  it("ferme la ligne dès que l'ordonnée change", () => {
    const flux = `BT 72 700 Td (Entrées) Tj 0 -20 Td (Velouté) Tj ET`;
    expect(lignesDuFluxPdf(flux)).toEqual(["Entrées", "Velouté"]);
  });

  it("décode les échappements et les chaînes hexadécimales", () => {
    const flux = `BT 72 700 Td (Caf\\351 \\(serr\\351\\)) Tj ET BT 72 680 Td <54617274> Tj ET`;
    expect(lignesDuFluxPdf(flux)).toEqual(["Café (serré)", "Tart"]);
  });

  it("ne rend rien pour un flux sans texte", () => {
    expect(lignesDuFluxPdf("q 1 0 0 1 0 0 cm /Im0 Do Q")).toEqual([]);
  });
});

describe("paraitIllisible", () => {
  it("laisse passer une carte ordinaire", () => {
    expect(
      paraitIllisible("Entrées\nVelouté de potiron — 8,50 €\nSalade — 9 €"),
    ).toBe(false);
  });

  it("attrape le charabia d'une police ré-encodée", () => {
    expect(paraitIllisible("")).toBe(true);
  });

  it("refuse un texte trop court pour être une carte", () => {
    expect(paraitIllisible("  ")).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────
   L'aller-retour, et c'est le test qui compte
   ──────────────────────────────────────────────────────────── */

describe("le texte produit retraverse analyserCarte sans perte", () => {
  it("rend nom, description et prix à leur place", () => {
    const texte = texteDepuisCsv(
      [
        "Rubrique;Nom;Description;Prix",
        "Entrées;Velouté de potiron;Crème légère;8,50 €",
        "Plats;Tartare de bœuf;Câpres et échalotes;18,50",
      ].join("\n"),
      null,
    );

    const lignes = analyserCarte(texte);

    expect(lignes.map((l) => l.type)).toEqual([
      "rubrique",
      "fiche",
      "rubrique",
      "fiche",
    ]);
    expect(lignes[1]).toMatchObject({
      nom: "Velouté de potiron",
      description: "Crème légère",
      prix: "8,50 €",
    });
    // Prix nu décimal : accepté parce qu'il est détaché et décimal.
    expect(lignes[3]).toMatchObject({
      nom: "Tartare de bœuf",
      description: "Câpres et échalotes",
      prix: "18,50",
    });
  });
});
