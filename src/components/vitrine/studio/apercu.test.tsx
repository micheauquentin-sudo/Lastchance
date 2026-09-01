// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { ApercuStudio } = await import("@/components/vitrine/studio/apercu");

import { etatInitialStudio } from "@/components/vitrine/studio/etat";
import type { VitrineCarteView } from "@/lib/vitrine";

/**
 * L'APERÇU MONTRE CE QUE LE CLIENT VERRA — NI PLUS, NI MOINS (VIT-26).
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME, ET IL ÉTAIT LIVRÉ ──
 *
 * `VitrineCarteView.active` porte son propre avertissement dans `src/lib/
 * vitrine.ts` : « toujours `true` dans l'état PUBLIC — la RPC n'en rend pas
 * d'autres ». L'état du TABLEAU DE BORD, lui, rend tout, y compris ce que le
 * commerçant a décoché : c'est ce qu'il faut pour l'éditer.
 *
 * L'aperçu du studio recevait donc les deux et les passait tels quels à
 * `CatalogueVitrine`, écrit pour la page publique — qui fait confiance à ce
 * qu'on lui donne, et qui a raison de le faire. Une carte désactivée mais
 * pleine s'affichait PLEINE au commerçant, et VIDE chez son client.
 *
 * C'est la pire forme de mensonge pour un aperçu : il ne se trompe pas au
 * hasard, il se trompe exactement là où le commerçant vient vérifier. Rien ne
 * le signalait, et rien ne pouvait le signaler — les deux composants faisaient
 * chacun ce qu'on attendait d'eux.
 *
 * ── ET LA MOITIÉ SYMÉTRIQUE, QUI COMPTE AUTANT ──
 *
 * `disponible` sur une FICHE ne se filtre PAS : la RPC publique la rend quand
 * même, et l'écran la grise. La retirer de l'aperçu serait le même défaut dans
 * l'autre sens — faire disparaître ce qui paraît en ligne. Les deux assertions
 * vont donc ensemble : sans la seconde, « filtrer plus » resterait une
 * correction plausible.
 */

afterEach(cleanup);

function carte(
  id: string,
  nom: string,
  active: boolean,
  fiches: Array<{ nom: string; disponible: boolean }>,
): VitrineCarteView {
  return {
    id,
    nom,
    ordre: 1,
    active,
    categories: [
      {
        id: `${id}-rub`,
        nom: "Nos entrées",
        ordre: 1,
        action: null,
        fiches: fiches.map((f, i) => ({
          id: `${id}-f${i}`,
          nom: f.nom,
          description: null,
          prix_affiche: "12 €",
          ordre: i + 1,
          photo_path: null,
          photo_alt: null,
          facettes: [],
          action: null,
          badges: [],
          allergenes: [],
          disponible: f.disponible,
        })),
      },
    ],
  };
}

const IDENTITE = {
  nom: "Le Comptoir",
  logoUrl: null,
  coverPath: null,
  coverAlt: null,
  accroche: "",
  histoire: "",
  horaires: "",
  badge: "",
  secteur: "restaurant" as const,
};

function rendre(cartes: VitrineCarteView[]) {
  const etat = etatInitialStudio(
    { ordre_blocs: ["cartes"] },
    { ...IDENTITE, secteur: IDENTITE.secteur },
  );
  return render(
    <ApercuStudio
      etat={etat}
      themeBase={{}}
      nom={IDENTITE.nom}
      logoUrl={null}
      coverPath={null}
      coverAlt={null}
      cartes={cartes}
      liens={{
        google_review_url: null,
        instagram_url: null,
        tiktok_url: null,
      }}
      slug="le-comptoir"
    />,
  );
}

describe("aperçu du studio — il ne montre que ce qui est servi", () => {
  it("écarte une carte DÉSACTIVÉE, que la page publique ne rendrait pas", () => {
    const { container } = rendre([
      carte("a", "Carte du midi", true, [{ nom: "Ravioles", disponible: true }]),
      carte("b", "Carte d'été", false, [{ nom: "Gaspacho", disponible: true }]),
    ]);

    // L'ASSERTION PORTE SUR LE NOM DE LA CARTE, pas sur ses fiches — et c'est
    // une correction, pas un détail. Le catalogue est à ONGLETS : les fiches
    // d'une carte non sélectionnée ne sont pas rendues de toute façon, si bien
    // qu'une assertion sur « Gaspacho » passait au vert même sans le filtre.
    // Elle ne mesurait rien. C'est la mutation qui l'a dit.
    const texte = container.textContent ?? "";
    expect(texte).toContain("Carte du midi");
    expect(
      texte,
      "une carte décochée paraît dans l'aperçu alors qu'elle est absente en ligne",
    ).not.toContain("Carte d'été");
  });

  it("GARDE une fiche indisponible, que la page publique rend grisée", () => {
    // La moitié symétrique. Sans elle, « filtrer davantage » passerait pour
    // une amélioration, et l'aperçu mentirait dans l'autre sens.
    const { container } = rendre([
      carte("a", "Carte du midi", true, [
        { nom: "Ravioles", disponible: true },
        { nom: "Poulpe grillé", disponible: false },
      ]),
    ]);

    expect(container.textContent ?? "").toContain("Poulpe grillé");
  });

  it("ne rend AUCUNE carte quand le bloc « Vos cartes » est décoché", () => {
    // Masquer, c'est omettre d'`ordre_blocs` (VIT-3) : la case de la page
    // « Identité » doit se voir tout de suite dans l'aperçu, sans quoi le
    // commerçant conclut qu'elle ne sert à rien.
    const etat = etatInitialStudio(
      { ordre_blocs: ["accroche"] },
      { ...IDENTITE, secteur: IDENTITE.secteur },
    );
    const { container } = render(
      <ApercuStudio
        etat={etat}
        themeBase={{}}
        nom={IDENTITE.nom}
        logoUrl={null}
        coverPath={null}
        coverAlt={null}
        cartes={[
          carte("a", "Carte du midi", true, [
            { nom: "Ravioles", disponible: true },
          ]),
        ]}
        liens={{
          google_review_url: null,
          instagram_url: null,
          tiktok_url: null,
        }}
        slug="le-comptoir"
      />,
    );

    expect(container.textContent ?? "").not.toContain("Ravioles");
  });
});
