// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LobbyShell } from "@/components/lobby/lobby-shell";
import { contestThemeTokens } from "@/components/pronos/contest-theme";
import { LAVIS_SAISON } from "@/components/ui/theme-lavis";

/**
 * LA COQUILLE DES SALONS, ET LA GARDE QUI TIENT SA MOITIÉ PUBLIQUE (SALON-1).
 *
 * Deux propriétés, et la seconde est la plus importante des deux.
 *
 *   1. UN SALON SANS RÉGLAGE SE REND COMME AVANT. `lobby_settings` est vide
 *      pour tout le parc au moment de la livraison ; si ce lot changeait quoi
 *      que ce soit à ces salons-là, il changerait l'apparence de TOUS les
 *      salons en production sans que personne ne l'ait demandé.
 *
 *   2. LA PORTE D'ENTRÉE PUBLIQUE NE PEINT RIEN. `create_player_lobby` confond
 *      « organisation inconnue » et « organisation sans le module » sous un
 *      seul refus, pour ne rien apprendre à un appelant public sur ce que le
 *      commerce d'en face a acheté. `/lobby/nouveau/[slug]` est atteignable en
 *      déroulant un annuaire de slugs : y peindre un décor dirait « celui-ci a
 *      le module » de tous ceux qui s'habillent, et « celui-là ne l'a pas » de
 *      tous les autres.
 *
 * La garde de la seconde propriété relit le TEXTE des pages, et non leur rendu.
 * C'est le motif de `route-boundaries.test.ts`, et c'est ici le seul angle
 * honnête : monter ces pages demanderait de simuler la moitié du socle, et un
 * test qui vérifie « rien ne s'affiche » sur un composant à qui on n'a rien
 * donné ne prouve rien. Ce qui doit rester vrai est plus simple à énoncer —
 * ces pages ne PASSENT pas d'habillage à la coquille — et c'est exactement ce
 * qu'un contributeur lèverait de bonne foi dans six mois.
 */

const RACINE = join(process.cwd(), "src", "app", "(player)");
const lire = (...morceaux: string[]) =>
  readFileSync(join(RACINE, ...morceaux), "utf8");

/** Le passage de la prop en JSX — les commentaires nomment le mot, pas le geste. */
const PROP_HABILLAGE = /habillage\s*=\s*\{/;

/** Les valeurs CSS relues par happy-dom portent des blancs qu'on n'a pas écrits. */
const sansBlancs = (valeur: string) => valeur.replace(/\s+/g, "");

afterEach(cleanup);

describe("LobbyShell — sans habillage", () => {
  it("peint EXACTEMENT le lavis neutre rayé d'avant SALON-1", () => {
    const { container } = render(
      <LobbyShell titre="Le salon" chapeau="Retrouvez-vous ici">
        <p>contenu</p>
      </LobbyShell>,
    );

    const page = container.querySelector("div[style]") as HTMLElement;
    // happy-dom rend la valeur littérale : on compare au jeton, pas à une
    // forme normalisée.
    expect(page.style.backgroundColor).toBe(LAVIS_SAISON.neutre);
    // Les rayures, à l'espace près : happy-dom réinsère un blanc après chaque
    // virgule. C'est la MÊME chaîne que celle codée en dur avant ce lot.
    expect(sansBlancs(page.style.backgroundImage)).toBe(
      sansBlancs("repeating-linear-gradient(135deg,#f3ead3 0 14px,#fdf6e3 14px 28px)"),
    );
  });

  it("n'affiche ni logo ni nom d'enseigne", () => {
    render(
      <LobbyShell titre="Le salon">
        <p>contenu</p>
      </LobbyShell>,
    );
    // AUCUNE image du tout : ni logo, ni fond d'écran. Le salon d'hier n'en
    // avait aucune, et `neutre` n'a pas de fond associé.
    expect(document.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Le salon");
  });

  it("hérite du repli de `contestThemeTokens`, il ne le réécrit pas", () => {
    // Si un jour le lavis neutre change, il doit changer AUX DEUX ENDROITS à la
    // fois — c'est-à-dire à un seul, celui de la table partagée.
    const { container } = render(
      <LobbyShell titre="Le salon">
        <p>contenu</p>
      </LobbyShell>,
    );
    const page = container.querySelector("div[style]") as HTMLElement;
    const attendu = contestThemeTokens(null).pageStyle;
    expect(page.style.backgroundColor).toBe(attendu.backgroundColor);
  });
});

describe("LobbyShell — habillé par le commerce", () => {
  it("porte le lavis du thème, le nom et le logo", () => {
    const { container } = render(
      <LobbyShell
        titre="Le salon"
        habillage={{
          theme: "noel",
          fondKey: null,
          nom: "Café des Sports",
          logoUrl: "https://exemple.test/logo.png",
        }}
      >
        <p>contenu</p>
      </LobbyShell>,
    );

    const page = container.querySelector("div[style]") as HTMLElement;
    expect(page.style.backgroundColor).toBe(LAVIS_SAISON.noel);
    expect(screen.getByText("Café des Sports")).toBeTruthy();

    // LE LOGO EST DÉCORATIF : le nom du commerce le suit en toutes lettres, et
    // le lui donner aussi pour nom accessible le ferait annoncer deux fois.
    const logo = container.querySelector(
      'img[src="https://exemple.test/logo.png"]',
    ) as HTMLImageElement;
    expect(logo.getAttribute("alt")).toBe("");
    expect(logo.getAttribute("aria-hidden")).toBe("true");
  });

  it("un commerce qui se tait garde ses couleurs sans son enseigne", () => {
    // `affiche_identite = false` : la base rend `nom` et `logo_url` à `null`.
    // Les COULEURS restent — c'est tout l'intérêt de la colonne : un commerce
    // peut vouloir son décor sans se nommer devant des gens qui ne l'ont pas
    // choisi.
    const { container } = render(
      <LobbyShell
        titre="Le salon"
        habillage={{ theme: "soldes", fondKey: null, nom: null, logoUrl: null }}
      >
        <p>contenu</p>
      </LobbyShell>,
    );
    const page = container.querySelector("div[style]") as HTMLElement;
    expect(page.style.backgroundColor).toBe(LAVIS_SAISON.soldes);
    // Le fond d'écran du thème est bien là ; le LOGO, lui, ne l'est pas. On
    // vise donc l'image d'enseigne (servie par une URL absolue) et non « toute
    // image », qui confondrait les deux.
    expect(container.querySelector('img[src^="http"]')).toBeNull();
    expect(container.querySelectorAll("img").length).toBeGreaterThan(0);
  });

  it("« aucun » retire l'image là où `null` laisse celle du thème", () => {
    // Les deux états que `null` seul ne sait pas dire. Sans cette différence, le
    // commerçant qui retire le fond de son thème le verrait revenir.
    const { container: suivi } = render(
      <LobbyShell
        titre="Le salon"
        habillage={{ theme: "noel", fondKey: null, nom: null, logoUrl: null }}
      >
        <p>contenu</p>
      </LobbyShell>,
    );
    expect(suivi.querySelectorAll("img").length).toBeGreaterThan(0);

    cleanup();

    const { container: aucun } = render(
      <LobbyShell
        titre="Le salon"
        habillage={{ theme: "noel", fondKey: "aucun", nom: null, logoUrl: null }}
      >
        <p>contenu</p>
      </LobbyShell>,
    );
    expect(aucun.querySelectorAll("img")).toHaveLength(0);
  });
});

describe("la contrainte de confidentialité, tenue par le texte des pages", () => {
  it("la branche membre de /lobby/[code] PASSE l'habillage", () => {
    // Contrôle POSITIF : sans lui, les deux assertions ci-dessous passeraient
    // aussi le jour où la prop disparaîtrait complètement du dépôt.
    expect(lire("lobby", "[code]", "page.tsx")).toMatch(PROP_HABILLAGE);
  });

  it("/lobby/nouveau/[slug] n'en passe AUCUN — c'est la porte publique", () => {
    expect(lire("lobby", "nouveau", "[slug]", "page.tsx")).not.toMatch(
      PROP_HABILLAGE,
    );
  });

  it("/ticket/[code] n'en passe AUCUN — ouvert à qui tient un code", () => {
    // Même raison, et une de plus : cette page ne sait pas si le code existe.
    // Peindre une enseigne lui ferait dire de quel commerce il est, avant tout
    // geste, à quiconque en essaie un.
    expect(lire("ticket", "[code]", "page.tsx")).not.toMatch(PROP_HABILLAGE);
  });
});
