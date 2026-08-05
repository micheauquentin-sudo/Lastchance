// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PublicShare } from "@/components/dashboard/public-share";

/**
 * LE DÉFAUT QUE CE FICHIER GARDE — la suite de `public-share.test.tsx`, qui le
 * garde pour le quiz, étendue au calendrier et au jackpot.
 *
 * Ces deux pages affichaient un chemin RELATIF (`/calendar/…`) assorti de la
 * consigne « À mettre dans le QR code du commerce » : on demandait au
 * commerçant de fabriquer lui-même un QR à partir d'une URL qu'un scanner ne
 * sait pas résoudre, faute d'origine. Rien ne rougissait — c'est une string,
 * et elle s'affiche.
 *
 * Deux gardes par module :
 *  - l'URL est construite ABSOLUE, depuis `APP_URL` et le bon champ de slug.
 *    Le champ compte : le calendrier porte un `public_slug` NON NULL (posé par
 *    trigger) là où le jackpot l'a nullable et se replie sur l'id. Une URL
 *    bâtie sur le mauvais champ donne un QR vers un 404 — imprimé et collé en
 *    vitrine, c'est pire que pas de QR ;
 *  - aucun QR n'est rendu tant que l'expérience n'est pas publiée. Arbitrage
 *    repris du pilote quiz : un QR imprimé survit à la page qui l'a produit,
 *    un bandeau d'avertissement, non.
 *
 * Les deux pages sont des Server Components asynchrones qui importent
 * `next/headers` via le client Supabase : les rendre coûterait plus de mocks
 * que la valeur du signal. On lit donc leur source, comme le fait déjà le
 * test du pilote.
 */

const MODULES = [
  {
    label: "calendrier",
    file: "src/app/dashboard/calendar/[id]/page.tsx",
    // public_slug NON NULL : pas de repli sur l'id.
    urlLine: "const publicUrl = `${APP_URL}/calendar/${c.public_slug}`",
    sampleUrl: "https://app.lastchance.test/calendar/avent-2026",
  },
  {
    label: "jackpot",
    file: "src/app/dashboard/jackpot/[id]/page.tsx",
    // public_slug NULLABLE : la page publique résout l'UUID comme le slug.
    urlLine: "const publicUrl = `${APP_URL}/jackpot/${c.public_slug ?? c.id}`",
    sampleUrl: "https://app.lastchance.test/jackpot/cagnotte-du-quartier",
  },
] as const;

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

afterEach(cleanup);

describe.each(MODULES)("URL publique du $label", (mod) => {
  const src = source(mod.file);

  it("est construite absolue, depuis APP_URL et le bon champ de slug", () => {
    expect(src).toContain('import { APP_URL } from "@/lib/env"');
    expect(src).toContain(mod.urlLine);
  });

  it("est celle passée au bloc de partage, et il n'y a plus de chemin relatif", () => {
    expect(src).toMatch(/<PublicShare\s+url=\{publicUrl\}/);
    expect(src).not.toContain("const publicPath");
    expect(src).not.toContain("À mettre dans le QR code du commerce");
  });

  it("ne rend aucun QR tant que l'expérience n'est pas publiée", () => {
    // Un seul point de rendu, et il est dans la branche « publié » du ternaire.
    expect(src.match(/<PublicShare/g)).toHaveLength(1);

    const gate = 'c.status === "active" ? (';
    const start = src.indexOf(gate);
    expect(start).toBeGreaterThan(-1);

    const elseAt = src.indexOf(") : (", start);
    expect(elseAt).toBeGreaterThan(start);

    expect(src.slice(start, elseAt)).toContain("<PublicShare");
    expect(src.slice(elseAt)).not.toContain("<PublicShare");
    // La branche non publiée explique l'absence au lieu de livrer un code mort.
    expect(src.slice(elseAt)).toMatch(/Publie[zr]/);
  });

  it("rend une URL absolue scannable une fois passée au composant", () => {
    render(
      <PublicShare
        url={mod.sampleUrl}
        fileName={`${mod.label}-exemple`}
        qrLabel={`Mon ${mod.label}`}
      />,
    );
    expect(screen.getByText(mod.sampleUrl)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Ouvrir la page/ }).getAttribute("href"),
    ).toBe(mod.sampleUrl);
    expect(screen.getByLabelText(`QR code de Mon ${mod.label}`)).toBeTruthy();
  });
});
