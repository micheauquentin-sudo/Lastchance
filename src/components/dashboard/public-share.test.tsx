// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicShare } from "@/components/dashboard/public-share";

/**
 * LE DÉFAUT QUE CE FICHIER GARDE : un QR qui n'encode pas une URL absolue.
 *
 * Le quiz affichait `/quiz/{slug}` — un chemin relatif. Cliquable depuis le
 * dashboard, donc parfaitement vert à l'œil ; illisible une fois encodé dans
 * un QR code collé en vitrine, parce qu'un scanner n'a pas d'origine à
 * laquelle le rattacher. Rien dans la suite ne rougissait : ni le typecheck
 * (c'est une string), ni un test de rendu (le texte s'affiche). Le seul
 * moment où le défaut se voit, c'est un téléphone devant une vitrine.
 *
 * D'où deux gardes complémentaires :
 *  - le composant rend bien l'URL qu'on lui donne, à l'identique, y compris
 *    dans le href d'ouverture (une troncature d'affichage suffirait à faire
 *    copier une URL fausse) ;
 *  - la page quiz CONSTRUIT une URL absolue à partir d'`APP_URL` et du slug
 *    public. Cette seconde garde lit la source parce que la page est un
 *    Server Component asynchrone qui importe `next/headers` via le client
 *    Supabase : la rendre en test coûterait plus de mocks que la valeur du
 *    signal. Ce qu'on protège ici est précis — le retour d'un chemin relatif.
 */

const ABSOLUTE = "https://app.lastchance.test/quiz/quiz-de-noel";

afterEach(cleanup);

describe("PublicShare", () => {
  it("affiche l'URL absolue telle quelle", () => {
    render(<PublicShare url={ABSOLUTE} fileName="quiz-noel" qrLabel="Quiz de Noël" />);
    expect(screen.getByText(ABSOLUTE)).toBeTruthy();
  });

  it("ouvre la page publique sur cette même URL absolue", () => {
    render(<PublicShare url={ABSOLUTE} fileName="quiz-noel" qrLabel="Quiz de Noël" />);
    const link = screen.getByRole("link", { name: /Ouvrir la page/ });
    expect(link.getAttribute("href")).toBe(ABSOLUTE);
  });

  it("étiquette le QR avec le nom de l'expérience", () => {
    render(<PublicShare url={ABSOLUTE} fileName="quiz-noel" qrLabel="Quiz de Noël" />);
    expect(screen.getByLabelText("QR code de Quiz de Noël")).toBeTruthy();
  });

  it("ne charge pas les réglages QR au montage", () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    render(
      <PublicShare
        url={ABSOLUTE}
        fileName="quiz-noel"
        qrLabel="Quiz de Noël"
        resource={{
          kind: "quiz",
          id: "00000000-0000-4000-8000-000000000001",
        }}
      />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    globalThis.fetch = originalFetch;
  });
});

describe("URL publique du quiz", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/dashboard/quiz/[id]/page.tsx"),
    "utf8",
  );

  it("est construite absolue, depuis APP_URL et le slug public", () => {
    expect(source).toContain(
      "const publicUrl = `${APP_URL}/quiz/${quiz.publicSlug ?? quiz.id}`",
    );
    expect(source).toContain('import { APP_URL } from "@/lib/env"');
  });

  it("est celle passée au bloc de partage, pas un chemin relatif", () => {
    expect(source).toMatch(/<PublicShare\s+url=\{publicUrl\}/);
    expect(source).not.toContain("const publicPath");
  });
});
