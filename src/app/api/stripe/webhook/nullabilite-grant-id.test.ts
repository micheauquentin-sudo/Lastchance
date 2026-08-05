// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* ════════════════════════════════════════════════════════════
 * LE TYPE GÉNÉRÉ MENT ICI, ET LE CAST QUI LE CORRIGE A L'AIR REDONDANT
 *
 * `grant_module_from_payment` est généré ainsi :
 *
 *   Returns: { created: boolean; grant_id: string }[]     ← NON-NULLABLE
 *
 * Or la RPC rend `(null, false)` sur un refus de cumul — l'index unique du
 * lot P0.5 a refusé un second octroi récurrent, et c'est le cas du DOUBLE
 * PAIEMENT : deux sessions de checkout encaissées, un remboursement dû.
 *
 * L'écart n'est pas un défaut du générateur : Postgres ne transporte pas la
 * nullabilité des colonnes d'un `returns table`, et rien dans le catalogue ne
 * permet de la déduire. Le type sera donc TOUJOURS faux ici, quelle que soit
 * la régénération.
 *
 * ── POURQUOI CE FICHIER EXISTE ──
 *
 * Le webhook corrige l'écart par un cast explicite vers `grant_id: string |
 * null`. Un lecteur qui compare ce cast au type généré le verra « élargir un
 * type déjà connu » et le supprimera comme redondant — c'est le geste naturel,
 * et il est faux. `grant_id` redeviendrait non-nullable, `!ligne.grant_id` ne
 * pourrait plus être vrai, et la branche du double paiement deviendrait morte
 * SANS QU'AUCUN TEST NE ROUGISSE : les cas nominaux passent tous.
 *
 * Ce fichier est donc une garde TEXTUELLE, avec la limite qu'ADR-074 lui
 * assigne — elle prouve qu'une forme est écrite, jamais qu'elle est atteinte.
 * L'atteignabilité, elle, est prouvée par les cas d'exécution de
 * `route.test.ts` et par le pgTAP `module_grant_recurring`.
 * ════════════════════════════════════════════════════════════ */

const SOURCE = readFileSync(
  join(process.cwd(), "src", "app", "api", "stripe", "webhook", "route.ts"),
  "utf8",
);

describe("grant_id doit rester nullable côté webhook", () => {
  it("le cast qui corrige le type généré est présent", () => {
    // Sans lui, le refus de cumul devient indétectable.
    expect(SOURCE).toMatch(/grant_id:\s*string\s*\|\s*null/);
  });

  it("la branche du double paiement teste bien l'absence d'identifiant", () => {
    // C'est CETTE condition que le cast rend possible. Si `grant_id` était
    // non-nullable, TypeScript la réduirait à du code mort.
    expect(SOURCE).toMatch(/!ligne\.created\s*&&\s*!ligne\.grant_id/);
  });

  it("et elle crie — un remboursement dû ne doit pas passer en silence", () => {
    expect(SOURCE).toContain("stripe.module-grant-cumul");
    expect(SOURCE).toContain("module_grant_double_paiement");
  });

  it("le type GÉNÉRÉ est bien non-nullable — c'est ce qui rend la garde utile", () => {
    // Le jour où le générateur (ou une migration) rendra `grant_id` nullable,
    // ce test rougira et ce fichier entier deviendra inutile. C'est voulu :
    // une garde qui survit à son objet est une muselière.
    const genere = readFileSync(
      join(process.cwd(), "src", "types", "database.generated.ts"),
      "utf8",
    );
    const bloc = genere.slice(genere.indexOf("grant_module_from_payment:"));
    const returns = bloc.slice(bloc.indexOf("Returns:"), bloc.indexOf("}[]") + 3);
    expect(returns).toContain("grant_id: string");
    expect(returns).not.toMatch(/grant_id:\s*string\s*\|\s*null/);
  });
});
