import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Le fond personnalisé est une couche `absolute`. Sans un contenu positionné
 * après lui dans le DOM, il est peint par-dessus tous les jeux instantanés :
 * seul le décor reste alors visible. Cette garde vise la branche nuit, qui
 * couvre le style par défaut et avait divergé de la branche kermesse.
 */
const SOURCE = readFileSync(
  "src/app/(player)/play/[slug]/page.tsx",
  "utf8",
).replace(/\r\n/g, "\n");

describe("PlayShell — fond d'écran joueur", () => {
  it("place le contenu nuit dans la couche positionnée après le fond", () => {
    expect(SOURCE).toMatch(
      /\{fond && <FondEcran fond=\{fond\} voile="nuit" \/>\}\s*<SkipLink \/>\s*<main[\s\S]*?className="relative flex min-h-dvh items-start justify-center outline-none sm:items-center"/,
    );
  });
});
