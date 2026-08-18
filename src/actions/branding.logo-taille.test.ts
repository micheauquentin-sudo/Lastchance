import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ────────────────────────────────────────────────────────────
// LE LOGO NE PÈSE PLUS 1600 PX POUR UN ROND DE 56
//
// `uploadLogo` normalisait chaque envoi en 1600×1600 « au cas où ». Aucune
// surface du produit n'affiche le logo au-delà de 64 px : l'en-tête du
// dashboard, la pastille de la page joueur et l'affiche QR le rendent tous en
// dessous. On servait donc, à chaque chargement d'une page publique et sur le
// réseau d'un téléphone, une image six fois plus large que son plus grand
// usage — pour des pixels que personne ne regarde.
//
// 256 px : la marge d'un écran à densité 4 (64 × 4), et rien de plus.
//
// ── Pourquoi une garde de SOURCE et non un test de comportement ──
//
// Exercer `uploadLogo` demanderait Supabase, un bucket, une organisation et une
// garde owner — soit toute une mise en scène pour observer un seul entier passé
// à sharp. La valeur n'est ni calculée ni configurable : c'est un littéral, et
// c'est un littéral qu'on garde. Même parti pris que
// `weekly-digest-anchor.test.ts` et `destructive-confirm-coverage.test.ts`.
//
// Ce que ce test NE dit PAS : les logos déjà envoyés restent lourds. Cette
// action ne retraite que ce qui passe par elle ; ils se réduiront au prochain
// envoi du commerçant, et pas avant.
// ────────────────────────────────────────────────────────────

const SRC = readFileSync(
  path.join(process.cwd(), "src", "actions", "branding.ts"),
  "utf8",
);

describe("uploadLogo — la largeur de normalisation", () => {
  it("normalise à 256 px, jamais au-delà", () => {
    expect(SRC).toContain(
      ".resize({ width: 256, height: 256, fit: \"inside\", withoutEnlargement: true })",
    );
    expect(SRC).not.toContain("width: 1600");
  });

  /**
   * `withoutEnlargement` est la moitié qui protège l'autre sens : sans lui,
   * un logo de 80 px serait AGRANDI à 256 — plus lourd qu'à l'arrivée, et flou.
   */
  it("n'agrandit jamais une image plus petite que la cible", () => {
    expect(SRC).toContain("withoutEnlargement: true");
  });

  /**
   * L'affiche QR (`poster-storage.ts`) garde son 1600 px, et ce n'est pas un
   * oubli : elle est destinée à être IMPRIMÉE, où 256 px donnerait un rendu
   * pixellisé. Deux usages, deux tailles — l'assertion existe pour que le
   * prochain lecteur ne « corrige » pas l'un au motif de l'autre.
   */
  it("l'affiche imprimable, elle, garde sa pleine résolution", () => {
    const poster = readFileSync(
      path.join(process.cwd(), "src", "lib", "poster-storage.ts"),
      "utf8",
    );
    expect(poster).toContain("width: 1600");
  });
});
