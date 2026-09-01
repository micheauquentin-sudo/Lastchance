// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LA PAGE « LES JEUX » DU STUDIO (VIT-22).
 *
 * Trois choses, et une seule est cosmétique.
 *
 *  1. LE RECHARGEMENT APRÈS SUCCÈS. C'est la garde qui compte. `setVitrineJeux`
 *     écrit `ordre_blocs` en base, et le studio en tient sa propre copie dans
 *     son état client : sans rechargement, le prochain « Enregistrer » reposte
 *     l'ancien ordre et fait disparaître de la vitrine publique le bloc « Jeux »
 *     que le commerçant vient de demander. Rien à l'écran ne le signalerait —
 *     les deux actions répondent « enregistré ». Retirer `rechargerApresSucces`
 *     de `page-jeux.tsx` doit faire rougir ce fichier.
 *  2. L'ABSENCE DE CHOIX VAUT « LES DEUX » (ADR-129). Lire `theme.jeux` en
 *     direct plutôt que par `resoudreThemeVitrine` rendrait `undefined`, donc
 *     deux cases vides, donc un enregistrement qui retire en silence les jeux
 *     d'une vitrine qui les affichait depuis toujours.
 *  3. UN SEUL ÉDITEUR. Deux rendus du même réglage seraient deux sources de
 *     vérité pour une ligne en base.
 */

/** Ce que `JeuxVitrineEditeur` a demandé à `useActionForm`, du dernier rendu. */
let optionsVues: Record<string, unknown> | null = null;

vi.mock("@/lib/use-action-form", () => ({
  useActionForm: (_action: unknown, options: Record<string, unknown>) => {
    optionsVues = options;
    return { state: null, pending: false, onSubmit: vi.fn() };
  },
}));
vi.mock("@/actions/vitrine", () => ({ setVitrineJeux: vi.fn() }));

const { PageJeuxStudio } = await import(
  "@/components/vitrine/studio/page-jeux"
);

import type { ThemeVitrine } from "@/lib/vitrine";

afterEach(cleanup);
beforeEach(() => {
  optionsVues = null;
});

function rendre(patch: {
  theme?: ThemeVitrine;
  nbFichesDuo?: number;
  duoPossede?: boolean;
  bandePossede?: boolean;
} = {}) {
  return render(
    <PageJeuxStudio
      jeuxVisibles
      duoPossede={patch.duoPossede ?? true}
      bandePossede={patch.bandePossede ?? true}
      nbFichesDuo={patch.nbFichesDuo ?? 4}
      themeInitial={patch.theme ?? {}}
      secteur="restaurant"
      peutEditer
    />,
  );
}

describe("studio — la page « Les jeux »", () => {
  it("recharge la page après un choix enregistré (la course d'ordre_blocs)", () => {
    // LA garde du lot. `setVitrineJeux` modifie `ordre_blocs` en base ; l'état
    // client du studio ne le sait pas et l'écraserait au clic suivant.
    rendre();

    expect(optionsVues).not.toBeNull();
    expect(optionsVues!.reloadOnSuccess).toBe(true);
  });

  it("un thème sans clé `jeux` coche les DEUX cases (ADR-129)", () => {
    // Les vitrines d'avant VIT-16 n'ont pas cette clé. Deux cases vides ici,
    // et le premier enregistrement leur retire leurs jeux sans le dire.
    rendre({ theme: {} });

    for (const c of cases()) expect(c.checked).toBe(true);
  });

  it("un choix explicite gagne sur l'absence", () => {
    rendre({ theme: { jeux: { duo: false, bande: true } } });

    const [bande, duo] = cases();
    expect(bande.checked).toBe(true);
    expect(duo.checked).toBe(false);
  });

  it("le plancher du plateau vient de DUO_OPTIONS_MIN_BASE, pas d'un chiffre écrit ici", () => {
    // Sous le plancher, l'éditeur avertit ; au plancher, il déclare prêt.
    rendre({ nbFichesDuo: 1 });
    expect(screen.getByText(/Pas encore prêt/)).toBeTruthy();

    cleanup();
    rendre({ nbFichesDuo: 2 });
    expect(screen.getByText(/2 fiches épinglées au plateau/)).toBeTruthy();
  });

  it("l'éditeur n'est monté qu'une fois, et son formulaire n'en contient pas d'autre", () => {
    // Deux rendus du même réglage = deux sources de vérité pour une ligne en
    // base. Et le `<form>` de l'éditeur doit rester plat : imbriqué, il ferait
    // échouer l'hydratation de tout le studio.
    const { container } = rendre();

    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelectorAll("form form")).toHaveLength(0);
    expect(cases()).toHaveLength(2);
  });
});

/** Les cases dans l'ordre du rendu : la Bande d'abord, puis le Duo. */
function cases(): HTMLInputElement[] {
  return screen.getAllByRole("checkbox") as HTMLInputElement[];
}
