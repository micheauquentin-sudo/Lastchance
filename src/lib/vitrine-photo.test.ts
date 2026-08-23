// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  altPhotoVitrine,
  cheminMobile,
  estCheminPhotoVitrine,
  sourcesPhotoVitrine,
  srcSetPhotoVitrine,
  urlPhotoVitrine,
} from "@/lib/vitrine-photo";

/**
 * VIT-7 — la convention de nommage des photos, et sa seule porte.
 *
 * CE QUI EST VÉRIFIÉ ICI EST UNE FRONTIÈRE DE SÉCURITÉ, pas une commodité :
 * `photo_path` est relu en base et transformé en URL publique. Un chemin qui
 * n'est pas des nôtres — traversée, extension inattendue, préfixe d'une autre
 * forme — ne doit pas produire d'adresse. Le même filtre garde `effacerPhotos`,
 * où une valeur dérivée effacerait le fichier de quelqu'un d'autre.
 */

const ORG = "11111111-2222-3333-4444-555555555555";
const FICHIER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CHEMIN = `${ORG}/${FICHIER}.webp`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("estCheminPhotoVitrine", () => {
  it("accepte un chemin de la forme organisation/fichier.webp", () => {
    expect(estCheminPhotoVitrine(CHEMIN)).toBe(true);
  });

  it("refuse tout ce qui n'a pas exactement cette forme", () => {
    for (const valeur of [
      null,
      undefined,
      42,
      "",
      `${ORG}/${FICHIER}.png`,
      `${ORG}/${FICHIER}`,
      `${ORG}/sous/${FICHIER}.webp`,
      `../${ORG}/${FICHIER}.webp`,
      `${ORG}/../${FICHIER}.webp`,
      `autre/${FICHIER}.webp`,
      `${ORG}/${FICHIER}.webp?x=1`,
    ]) {
      expect(estCheminPhotoVitrine(valeur)).toBe(false);
    }
  });
});

describe("cheminMobile", () => {
  it("insère le suffixe avant l'extension, jamais après", () => {
    expect(cheminMobile(CHEMIN)).toBe(`${ORG}/${FICHIER}-480.webp`);
  });
});

describe("urlPhotoVitrine", () => {
  it("compose l'adresse publique du bucket", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemple.supabase.co");
    expect(urlPhotoVitrine(CHEMIN)).toBe(
      `https://exemple.supabase.co/storage/v1/object/public/vitrine-images/${CHEMIN}`,
    );
  });

  it("supporte une base terminée par une barre", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemple.supabase.co/");
    expect(urlPhotoVitrine(CHEMIN)).toContain(
      ".supabase.co/storage/v1/object/public/",
    );
  });

  it("rend null plutôt qu'une chaîne vide quand il n'y a rien à servir", () => {
    // `src=""` fait recharger la page courante dans certains navigateurs.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemple.supabase.co");
    expect(urlPhotoVitrine(null)).toBeNull();
    expect(urlPhotoVitrine("n'importe quoi")).toBeNull();
  });

  it("rend null quand la base n'est pas configurée", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(urlPhotoVitrine(CHEMIN)).toBeNull();
  });
});

describe("sourcesPhotoVitrine", () => {
  it("rend les deux adresses, la mobile portant le suffixe", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemple.supabase.co");
    const sources = sourcesPhotoVitrine(CHEMIN);
    expect(sources?.grande).toContain(`${FICHIER}.webp`);
    expect(sources?.mobile).toContain(`${FICHIER}-480.webp`);
  });

  it("rend null pour un chemin qui n'est pas des nôtres", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemple.supabase.co");
    expect(sourcesPhotoVitrine("autre/chose.webp")).toBeNull();
  });
});

describe("srcSetPhotoVitrine", () => {
  it("décrit les deux largeurs", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemple.supabase.co");
    const srcSet = srcSetPhotoVitrine(CHEMIN);
    expect(srcSet).toContain("480w");
    expect(srcSet).toContain("1200w");
  });

  it("rend une chaîne vide quand il n'y a rien — React n'émet alors pas l'attribut", () => {
    expect(srcSetPhotoVitrine(null)).toBe("");
  });
});

describe("altPhotoVitrine", () => {
  it("rend le texte saisi, détouré", () => {
    expect(altPhotoVitrine("  Une assiette de velouté  ")).toBe(
      "Une assiette de velouté",
    );
  });

  it("rend une chaîne vide sans alternative — l'image devient décorative", () => {
    // `alt=""` retire l'image de l'arbre d'accessibilité. Y mettre le nom du
    // plat l'aurait fait lire deux fois : il est déjà à côté, en texte.
    expect(altPhotoVitrine(null)).toBe("");
    expect(altPhotoVitrine("   ")).toBe("");
  });
});
