import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BANDE_PACKS, BANDE_PACK_CLES } from "@/lib/bande-packs";

/**
 * LA PARITÉ DES SOIXANTE QUESTIONS (L18).
 *
 * ── POURQUOI ELLES EXISTENT DEUX FOIS ──
 *
 * Le TEXTE des questions vit en TypeScript (`bande-packs.ts`) : c'est du contenu
 * de plateforme, relu, versionné, et la base n'a aucune raison de le stocker.
 * Mais le TIRAGE des cinq à huit questions d'une partie se fait en SQL, dans
 * `bande_start`, pour être reproductible sans que l'application ait à le
 * dicter — donc `bande_pack_questions()` connaît les CLÉS.
 *
 * Deux listes de soixante clés, écrites à la main, dans deux langages : elles
 * divergeront. La seule question est de savoir si la divergence se verra. Ce
 * test est la réponse — il lit la migration comme un texte et compare.
 *
 * ── CE QU'UNE DIVERGENCE PRODUIRAIT SANS LUI ──
 *
 * Une clé tirée par le SQL mais absente du TypeScript rendrait `questionBande()`
 * nul, donc une question SANS TEXTE sur l'écran d'une tablée. Une clé retirée du
 * SQL mais gardée en TypeScript ne serait jamais posée — moins grave, et
 * invisible. Les deux sens comptent, le test les vérifie tous les deux.
 *
 * Motif `vitrine-parity.test.ts` : la migration est la source, elle se lit, et
 * l'ancre est nommée pour que le test rougisse s'il ne mesure plus rien.
 */

const MIGRATION = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261019120000_portrait_bande.sql",
);

function sourceSql(): string {
  return readFileSync(MIGRATION, "utf8");
}

/**
 * Les clés que le SQL tire pour un pack, lues dans `bande_pack_questions`.
 *
 * L'extraction est ancrée sur `when '<pack>' then array[…]` et s'arrête au
 * crochet fermant. Si la forme de la fonction change, `ancreIntrouvable` fait
 * échouer le test au lieu de rendre une liste vide — une garde qui mesure le
 * vide est une garde qui a cessé de garder.
 */
function clesSql(pack: string): string[] {
  const source = sourceSql();
  const ancre = new RegExp(
    `when '${pack}' then array\\[([\\s\\S]*?)\\]`,
    "u",
  );
  const trouve = ancre.exec(source);
  if (!trouve) {
    throw new Error(
      `Ancre introuvable pour le pack « ${pack} » dans ${path.basename(MIGRATION)} — ` +
        "la forme de `bande_pack_questions` a changé, ce test ne mesure plus rien.",
    );
  }
  return [...trouve[1].matchAll(/'([a-z0-9-]+)'/gu)].map((m) => m[1]);
}

describe("packs du Portrait de la Bande — la parité SQL ⇄ TypeScript", () => {
  it("l'ancre existe pour les cinq packs (garde de la garde)", () => {
    for (const cle of BANDE_PACK_CLES) {
      expect(() => clesSql(cle), cle).not.toThrow();
    }
  });

  it.each(BANDE_PACKS.map((p) => [p.cle, p] as const))(
    "%s : les douze clés du SQL sont exactement celles du TypeScript, dans le même ordre",
    (_cle, pack) => {
      // L'ORDRE COMPTE : le tirage de `bande_start` est dérivé du lobby, donc
      // reproductible — mais il indexe cette liste. Deux ordres différents
      // donneraient deux parties différentes pour un même salon selon qu'on
      // relit la base ou l'application.
      expect(clesSql(pack.cle)).toEqual(pack.questions.map((q) => q.cle));
    },
  );

  it("le vocabulaire des packs est le même des deux côtés", () => {
    // Le `check` de `bande_settings.pack` doit nommer exactement les cinq packs
    // livrés : un pack en TypeScript que la base refuse ne se règle jamais, un
    // pack en base sans texte ne s'affiche pas.
    const source = sourceSql();
    for (const cle of BANDE_PACK_CLES) {
      expect(source.includes(`'${cle}'`), `pack ${cle} absent du SQL`).toBe(true);
    }
    // Et le contrôle inverse, celui qui attrape un pack oublié en base : la
    // liste `when … then` de `bande_pack_questions` ne doit contenir QUE des
    // packs connus du TypeScript.
    const packsSql = [...source.matchAll(/when '([a-z]+)' then array\[/gu)].map(
      (m) => m[1],
    );
    expect([...new Set(packsSql)].sort()).toEqual([...BANDE_PACK_CLES].sort());
  });
});
