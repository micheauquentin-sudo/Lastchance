// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/organizations", () => ({
  updateOrganizationSocialLinks: vi.fn(),
}));
vi.mock("@/actions/vitrine", () => ({
  setVitrineContenu: vi.fn(),
  deleteVitrineContenu: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { PageALaUneStudio } = await import(
  "@/components/vitrine/studio/page-alaune"
);

/**
 * « À LA UNE » PORTE LES DEUX MOITIÉS DU MÊME GESTE (VIT-21).
 *
 * Le défaut que ces gardes ferment n'est pas visuel : la case de visibilité et
 * les liens qu'elle montre vivaient sur deux écrans, si bien qu'on pouvait
 * cocher un bloc vide ou remplir un Instagram qui ne paraîtrait jamais. Une
 * page qui perdrait l'une des deux moitiés se lirait comme complète.
 *
 * La troisième garde vise l'autre panne, silencieuse celle-là : les trois URL
 * appartiennent à `updateOrganizationSocialLinks`, PAS aux réglages de la
 * vitrine. Un champ visible qui porterait un nom de réglage (`accroche`,
 * `ordre_blocs`, …) serait démonté avec la page et son contenu disparaîtrait
 * de l'enregistrement suivant, qui répondrait pourtant « Vitrine enregistrée ».
 */

afterEach(cleanup);

const LIENS = {
  google_review_url: "https://g.page/r/Cx/review",
  instagram_url: "https://www.instagram.com/le-comptoir",
  tiktok_url: null,
};

function rendre(props: Partial<Parameters<typeof PageALaUneStudio>[0]> = {}) {
  const onSocialVisible = vi.fn();
  const rendu = render(
    <PageALaUneStudio
      contenus={[]}
      liens={LIENS}
      socialVisible={false}
      onSocialVisible={onSocialVisible}
      peutEditer
      {...props}
    />,
  );
  return { ...rendu, onSocialVisible };
}

describe("studio — page « À la une »", () => {
  it("la case des réseaux reflète l'état et le remonte au studio", () => {
    const { onSocialVisible } = rendre();

    const case_ = screen.getByRole("checkbox", { name: /Réseaux et avis/ });
    expect((case_ as HTMLInputElement).checked).toBe(false);

    case_.click();
    expect(onSocialVisible).toHaveBeenCalledWith(true);
  });

  it("les trois liens se saisissent ici, remplis de leur valeur", () => {
    rendre();

    // Les trois, TOUJOURS : l'action traite un champ absent comme un champ
    // vidé, donc en masquer un l'effacerait au premier enregistrement.
    for (const nom of ["google_review_url", "instagram_url", "tiktok_url"]) {
      expect(document.querySelector(`input[name="${nom}"]`)).toBeTruthy();
    }
    expect(
      (document.querySelector('input[name="instagram_url"]') as HTMLInputElement)
        .value,
    ).toBe(LIENS.instagram_url);
    // Un lien absent en base est un champ vide, pas la chaîne « null ».
    expect(
      (document.querySelector('input[name="tiktok_url"]') as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("aucun contrôle visible ne porte un nom de réglage de la vitrine", () => {
    const { container } = rendre();

    const noms = [...container.querySelectorAll("[name]")]
      .filter((n) => n.getAttribute("type") !== "hidden")
      .map((n) => n.getAttribute("name"));

    for (const reglage of [
      "accroche",
      "ordre_blocs",
      "style_cartes",
      "secteur",
      "histoire",
      "horaires_texte",
      "badge_ouverture",
    ]) {
      expect(noms, `nom de réglage détourné : ${reglage}`).not.toContain(
        reglage,
      );
    }
  });

  it("les contenus mis en avant se règlent ici", () => {
    rendre();
    expect(screen.getByText("À la une (3 max)")).toBeTruthy();
  });

  it("sans droit d'édition, les liens ne s'offrent pas à la saisie", () => {
    rendre({ peutEditer: false });

    expect(document.querySelector('input[name="instagram_url"]')).toBeNull();
    expect(
      (screen.getByRole("checkbox", { name: /Réseaux et avis/ }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });
});
