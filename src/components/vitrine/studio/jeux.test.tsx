// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LA PAGE « CE QUI PARAÎT SUR MA CARTE » DU STUDIO (VIT-22, refondue VIT-32).
 *
 * Cinq choses, et une seule est cosmétique.
 *
 *  1. LE RECHARGEMENT APRÈS SUCCÈS. C'est la garde qui compte. `setVitrineJeux`
 *     écrit `ordre_blocs` en base, et le studio en tient sa propre copie dans
 *     son état client : sans rechargement, l'enregistrement suivant — AUTOMATIQUE
 *     depuis VIT-30, donc 1,2 s après le moindre réglage — reposte l'ancien ordre
 *     et fait disparaître de la vitrine publique le bloc « Jeux » que le
 *     commerçant vient de demander. Rien à l'écran ne le signalerait : les deux
 *     actions répondent « enregistré ». Retirer `rechargerApresSucces` de
 *     `page-jeux.tsx` doit faire rougir ce fichier.
 *  2. L'ABSENCE DE CHOIX VAUT « TOUT » (ADR-129). Lire `theme.jeux` en direct
 *     plutôt que par `resoudreThemeVitrine` rendrait `undefined`, donc des cases
 *     vides, donc un enregistrement qui retire en silence les jeux d'une vitrine
 *     qui les affichait depuis toujours.
 *  3. UN MODULE NON POSSÉDÉ VOTE QUAND MÊME (VIT-32). `caseNative` lit un champ
 *     absent comme « décoché » : sans champ caché, enregistrer son choix
 *     écrirait `false` sur les quatre modules qu'on n'a pas encore achetés.
 *  4. « À LA UNE » EST LÀ, et c'est la demande du propriétaire — sa page a
 *     disparu au profit de celle-ci.
 *  5. UN SEUL ÉDITEUR DE JEUX. Deux rendus du même réglage seraient deux sources
 *     de vérité pour une ligne en base.
 */

/**
 * CE QUE CHAQUE FORMULAIRE A DEMANDÉ À `useActionForm`, PAR ACTION.
 *
 * Un simple « dernier appel » ne suffit plus depuis que « À la une » vit sur
 * cette page (VIT-32) : `SocialLinksForm` et `ContenusEditeur` appellent le même
 * crochet APRÈS l'éditeur des jeux, et la garde du rechargement aurait mesuré
 * leurs options — elle serait passée au vert le jour où `rechargerApresSucces`
 * disparaît, ce qui est exactement l'inverse de ce qu'on lui demande.
 */
const appels: Array<[unknown, Record<string, unknown>]> = [];

vi.mock("@/lib/use-action-form", () => ({
  useActionForm: (action: unknown, options: Record<string, unknown>) => {
    appels.push([action, options]);
    return { state: null, pending: false, onSubmit: vi.fn() };
  },
}));
vi.mock("@/actions/vitrine", () => ({
  setVitrineJeux: vi.fn(),
  setVitrineContenu: vi.fn(),
  deleteVitrineContenu: vi.fn(),
}));
vi.mock("@/actions/organizations", () => ({
  updateOrganizationSocialLinks: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { PageJeuxStudio } = await import(
  "@/components/vitrine/studio/page-jeux"
);

import {
  VITRINE_JEUX,
  VITRINE_JEUX_DEFAUTS,
  type BilanJeuxVitrine,
  type JeuVitrine,
  type ThemeVitrine,
} from "@/lib/vitrine";

const { setVitrineJeux } = await import("@/actions/vitrine");

afterEach(cleanup);
beforeEach(() => {
  appels.length = 0;
});

/** Tout possédé, tout prêt : chaque test ne fait varier que ce qu'il mesure. */
const BILAN_COMPLET: BilanJeuxVitrine = {
  possede: {
    duo: true,
    bande: true,
    quiz: true,
    calendars: true,
    pronostics: true,
    loyalty: true,
  },
  compte: { duo: 4, quiz: 2, calendars: 1, pronostics: 1, loyalty: 1 },
};

function rendre(
  patch: { theme?: ThemeVitrine; bilan?: Partial<BilanJeuxVitrine> } = {},
) {
  const bilan: BilanJeuxVitrine = {
    possede: { ...BILAN_COMPLET.possede, ...patch.bilan?.possede },
    compte: { ...BILAN_COMPLET.compte, ...patch.bilan?.compte },
  };
  return render(
    <PageJeuxStudio
      jeuxVisibles
      bilanJeux={bilan}
      themeInitial={patch.theme ?? {}}
      secteur="restaurant"
      contenus={[]}
      liens={{
        google_review_url: null,
        instagram_url: null,
        tiktok_url: null,
      }}
      blocs={["accroche", "cartes"]}
      onBloc={vi.fn()}
      socialVisible={false}
      onSocialVisible={vi.fn()}
      peutEditer
    />,
  );
}

describe("studio — la page « Ce qui paraît sur ma carte »", () => {
  it("recharge la page après un choix enregistré (la course d'ordre_blocs)", () => {
    // LA garde du lot. `setVitrineJeux` modifie `ordre_blocs` en base ; l'état
    // client du studio ne le sait pas et l'écraserait à son prochain envoi —
    // qui part TOUT SEUL depuis VIT-30.
    rendre();

    const options = appels.find(([action]) => action === setVitrineJeux)?.[1];
    expect(
      options,
      "l éditeur des jeux n a pas appelé useActionForm avec setVitrineJeux",
    ).toBeTruthy();
    expect(options!.reloadOnSuccess).toBe(true);
  });

  it("un thème sans clé `jeux` coche ce qui était DÉJÀ peint, et rien de plus", () => {
    // Les vitrines d'avant VIT-16 n'ont pas cette clé, celles d'avant VIT-32
    // n'en ont que deux. Des cases vides pour les cinq jeux existants, et le
    // premier enregistrement leur retirerait leurs jeux sans le dire.
    //
    // MAIS LE PASSEPORT DOIT NAÎTRE DÉCOCHÉ, et ce test disait l'inverse. Il
    // n'avait AUCUNE porte publique avant VIT-32 : le cocher par défaut
    // annonçait un passeport que personne n'avait demandé, et le premier
    // enregistrement gravait ce défaut en consentement — indistinguable d'un
    // choix. Corrigé en VIT-33, sur revue de sécurité.
    rendre({ theme: {} });

    const cases = casesJeux();
    expect(cases).toHaveLength(VITRINE_JEUX.length);
    for (const c of cases) {
      expect(c.checked, c.name).toBe(VITRINE_JEUX_DEFAUTS[c.name as JeuVitrine]);
    }
  });

  it("un choix explicite gagne sur l'absence, clé par clé", () => {
    rendre({
      theme: { jeux: { duo: false, bande: true, quiz: false, loyalty: true } },
    });

    const parNom = Object.fromEntries(casesJeux().map((c) => [c.name, c.checked]));
    expect(parNom.bande).toBe(true);
    expect(parNom.duo).toBe(false);
    expect(parNom.quiz).toBe(false);
    expect(parNom.loyalty).toBe(true);
    // `calendars` et `pronostics` ne sont PAS dans le thème : l'absence coche.
    expect(parNom.calendars).toBe(true);
    expect(parNom.pronostics).toBe(true);
  });

  it("le plancher du plateau vient de DUO_OPTIONS_MIN_BASE, pas d'un chiffre écrit ici", () => {
    // Sous le plancher, l'éditeur avertit ; au plancher, il déclare prêt.
    rendre({ bilan: { compte: { ...BILAN_COMPLET.compte, duo: 1 } } });
    expect(screen.getByText(/Pas encore prêt/)).toBeTruthy();

    cleanup();
    rendre({ bilan: { compte: { ...BILAN_COMPLET.compte, duo: 2 } } });
    expect(screen.getByText(/2 fiches épinglées au plateau/)).toBeTruthy();
  });

  it("un module possédé mais vide se coche encore, en le disant", () => {
    // Cocher n'ajoute rien tant qu'aucun quiz n'est publié — et c'est la seule
    // impasse possible de cet écran : cocher, ne rien voir, ne pas savoir
    // laquelle des deux moitiés manque.
    rendre({ bilan: { compte: { ...BILAN_COMPLET.compte, quiz: 0 } } });

    expect(screen.getByText(/Aucun quiz publié pour l'instant/)).toBeTruthy();
    expect(casesJeux().find((c) => c.name === "quiz")).toBeTruthy();
  });

  it("un module NON possédé n'a pas de case, mais garde une voix", () => {
    // `caseNative` lit un champ absent comme « décoché ». Sans le champ caché,
    // enregistrer écrirait `false` sur le Passeport, et le jour où le commerçant
    // l'achète sa carte ne l'annoncerait pas — sans rien lui dire.
    const { container } = rendre({
      bilan: { possede: { ...BILAN_COMPLET.possede, loyalty: false } },
    });

    expect(casesJeux().find((c) => c.name === "loyalty")).toBeUndefined();
    const cache = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="loyalty"]',
    );
    expect(cache, "le module non possédé ne poste plus rien").toBeTruthy();
    // IL VOTE SON ÉTAT RÉSOLU, et pour le Passeport cet état est désormais
    // « décoché » — donc la chaîne vide, que `caseNative` lit comme un refus.
    // C'est exact : un module non possédé, dont la porte n'a jamais été
    // demandée, ne doit pas s'annoncer le jour où il est acheté sans qu'on
    // l'ait coché. Le champ reste POSTÉ, ce qui est le point de ce test : sans
    // lui, l'écran n'aurait aucune voix et l'absence serait ambiguë.
    expect(cache!.value, "il vote son état résolu").toBe(
      VITRINE_JEUX_DEFAUTS.loyalty ? "1" : "",
    );
  });

  it("« À la une » a rejoint cette page (VIT-32)", () => {
    // Sa page à elle a disparu : si ses deux moitiés ne sont pas ici, elles ne
    // sont plus nulle part, et le commerçant a perdu ses mises en avant.
    rendre();

    expect(screen.getByRole("heading", { name: "Vos mises en avant" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Réseaux et avis/ })).toBeTruthy();
    expect(document.querySelector('input[name="instagram_url"]')).toBeTruthy();
  });

  it("l'éditeur des jeux n'est monté qu'une fois, et aucun formulaire n'en contient un autre", () => {
    // Deux rendus du même réglage = deux sources de vérité pour une ligne en
    // base. Et les `<form>` doivent rester PLATS : imbriqués, ils feraient
    // échouer l'hydratation de tout le studio.
    const { container } = rendre();

    expect(container.querySelectorAll("form form")).toHaveLength(0);
    expect(casesJeux()).toHaveLength(VITRINE_JEUX.length);
  });
});

/**
 * Les cases DES JEUX, et elles seules.
 *
 * `getAllByRole("checkbox")` ne suffit plus depuis que « Réseaux et avis » vit
 * sur cette page : il rendrait sept cases dont une n'a rien à voir avec le
 * vocabulaire. On filtre donc par `name`, qui est exactement ce que l'action
 * lit.
 */
function casesJeux(): HTMLInputElement[] {
  const noms = new Set<string>(VITRINE_JEUX);
  return (screen.getAllByRole("checkbox") as HTMLInputElement[]).filter((c) =>
    noms.has(c.name),
  );
}
