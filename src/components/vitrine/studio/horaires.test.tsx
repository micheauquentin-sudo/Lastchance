// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HorairesEditeurStudio,
  horairesDepuisSaisie,
} from "@/components/vitrine/studio/horaires-editeur";
import { texteEtatHoraires } from "@/components/vitrine/studio/horaires-badge";
import { PastilleHoraires } from "@/components/vitrine/studio/horaires-pastille";
import { HeroVitrine } from "@/components/vitrine/hero-vitrine";
import { resoudreThemeVitrine } from "@/components/vitrine/theme";
import { etatHoraires } from "@/lib/vitrine-horaires";
import { VITRINE_JOURS, type HorairesVitrine } from "@/lib/vitrine";

/**
 * LES ÉCRANS DES HORAIRES STRUCTURÉS (VIT-31c).
 *
 * ── CE QUE CE FICHIER GARDE, ET POURQUOI CHAQUE POINT COMPTE ──
 *
 * 1. LES SEPT JOURS SONT PRÉ-ÉCRITS. C'est la demande textuelle du
 *    propriétaire (« il faudrait déjà avoir écrit Lundi Mardi etc. »), donc la
 *    seule chose qu'une régression de mise en page ne doit jamais emporter.
 * 2. UNE SAISIE INCOMPLÈTE NE PART PAS EN BASE, et ne disparaît pas non plus
 *    de l'écran. Les deux moitiés vont ensemble : sans la seconde, « ne rien
 *    pousser » se satisferait d'un champ qui s'efface entre deux frappes.
 * 3. RIEN DE SAISI ⇒ `null`, et non sept tableaux vides. C'est la
 *    compatibilité de toutes les vitrines déjà publiées : sept tableaux vides
 *    disent « fermé toute la semaine », ce qui n'est pas « je n'ai rien
 *    saisi ».
 * 4. LA PASTILLE NE REMPLACE CELLE ÉCRITE À LA MAIN QUE SI ELLE A DE QUOI.
 *    C'est l'assertion de non-régression du lot entier.
 * 5. LE PREMIER RENDU EST STABLE. C'est la garde du piège d'hydratation : la
 *    pastille calculée n'apparaît qu'APRÈS le montage, jamais dans le HTML
 *    servi, sinon React refuse d'hydrater et la page perd toute interactivité.
 */

afterEach(cleanup);

const SEMAINE_VIDE: HorairesVitrine = {
  lundi: [],
  mardi: [],
  mercredi: [],
  jeudi: [],
  vendredi: [],
  samedi: [],
  dimanche: [],
};

const ALLURE = resoudreThemeVitrine({}, "restaurant").allure;

function hero(props: Partial<Parameters<typeof HeroVitrine>[0]> = {}) {
  return render(
    <HeroVitrine
      nom="Le Comptoir"
      logoUrl={null}
      couverture={null}
      couvertureAlt={null}
      accroche={null}
      badgeOuverture="Ouvert · 12h–23h"
      allure={ALLURE}
      liens={{
        google_review_url: null,
        instagram_url: null,
        tiktok_url: null,
      }}
      avisGoogle="Avis Google"
      selecteurLangue={null}
      {...props}
    />,
  );
}

describe("l'éditeur jour par jour", () => {
  it("écrit les sept jours d'avance, avec deux créneaux vides chacun", () => {
    render(
      <HorairesEditeurStudio horaires={null} onChange={vi.fn()} />,
    );

    // Le nom du jour EST à l'écran avant toute saisie — c'est la demande.
    for (const libelle of [
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
      "Dimanche",
    ]) {
      expect(screen.getByText(libelle)).toBeTruthy();
    }

    // Midi ET soir, sans avoir cliqué sur quoi que ce soit.
    expect(
      screen.getByLabelText("Lundi — créneau 1, ouverture"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Lundi — créneau 2, fermeture")).toBeTruthy();

    // Sept jours vides : sept « Fermé », et pas un formulaire muet.
    expect(screen.getAllByText("Fermé")).toHaveLength(7);
  });

  it("ne pousse qu'un créneau COMPLET, sans effacer la saisie en cours", () => {
    const onChange = vi.fn();
    render(<HorairesEditeurStudio horaires={null} onChange={onChange} />);

    const de = screen.getByLabelText(
      "Lundi — créneau 1, ouverture",
    ) as HTMLInputElement;
    fireEvent.change(de, { target: { value: "12:00" } });

    // À moitié saisi : rien ne part en base…
    expect(onChange).toHaveBeenLastCalledWith(null);
    // …mais la frappe RESTE à l'écran. C'est la moitié qui manquerait si l'état
    // local était remplacé par sa projection « complète ou rien ».
    expect(de.value).toBe("12:00");

    fireEvent.change(screen.getByLabelText("Lundi — créneau 1, fermeture"), {
      target: { value: "14:30" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      ...SEMAINE_VIDE,
      lundi: [{ de: "12:00", a: "14:30" }],
    });
  });

  it("refuse une fermeture antérieure à l'ouverture, et le dit", () => {
    const onChange = vi.fn();
    render(<HorairesEditeurStudio horaires={null} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Mardi — créneau 1, ouverture"), {
      target: { value: "23:00" },
    });
    fireEvent.change(screen.getByLabelText("Mardi — créneau 1, fermeture"), {
      target: { value: "02:00" },
    });

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(
      screen.getByText(/la fermeture après l'ouverture/i),
    ).toBeTruthy();
  });

  it("ne dépasse jamais trois créneaux par jour", () => {
    render(<HorairesEditeurStudio horaires={null} onChange={vi.fn()} />);

    const ajouts = screen.getAllByRole("button", { name: "+ créneau" });
    expect(ajouts).toHaveLength(7);
    fireEvent.click(ajouts[0]);

    expect(screen.getByLabelText("Lundi — créneau 3, ouverture")).toBeTruthy();
    // Le bouton du lundi a disparu : la borne est tenue par l'écran, pas
    // seulement par le `check` SQL qui rendrait une erreur de base.
    expect(screen.getAllByRole("button", { name: "+ créneau" })).toHaveLength(6);
  });

  it("n'émet PAS sept tableaux vides quand rien n'est saisi", () => {
    expect(
      horairesDepuisSaisie({
        ...Object.fromEntries(VITRINE_JOURS.map((j) => [j, [{ de: "", a: "" }]])),
      } as never),
    ).toBeNull();
  });

  it("est de bout en bout d'accord avec le calcul déjà livré", () => {
    const onChange = vi.fn();
    render(<HorairesEditeurStudio horaires={null} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Lundi — créneau 1, ouverture"), {
      target: { value: "12:00" },
    });
    fireEvent.change(screen.getByLabelText("Lundi — créneau 1, fermeture"), {
      target: { value: "23:00" },
    });

    const saisi = onChange.mock.calls.at(-1)?.[0] as HorairesVitrine;
    // Lundi 20 h à Paris — la forme que l'éditeur produit doit être celle que
    // `etatHoraires` sait lire, sans adaptateur entre les deux.
    const etat = etatHoraires(saisi, "Europe/Paris", new Date("2026-09-07T18:00:00Z"));
    expect(etat).toEqual({ etat: "ouvert", fermeA: "23:00" });
  });
});

describe("la phrase de la pastille", () => {
  it("dit l'heure de fermeture, sans le zéro de tête", () => {
    expect(
      texteEtatHoraires({ etat: "ouvert", fermeA: "23:00" }, "fr", "lundi"),
    ).toBe("Ouvert · ferme à 23h");
    expect(
      texteEtatHoraires({ etat: "ouvert", fermeA: "09:30" }, "fr", "lundi"),
    ).toBe("Ouvert · ferme à 9h30");
  });

  it("dit « demain » quand c'est demain, et le jour sinon", () => {
    expect(
      texteEtatHoraires(
        {
          etat: "ferme",
          prochaine: { jour: "mardi", heure: "12:00", aujourdhui: false },
        },
        "fr",
        "lundi",
      ),
    ).toBe("Fermé · ouvre demain à 12h");

    expect(
      texteEtatHoraires(
        {
          etat: "ferme",
          prochaine: { jour: "samedi", heure: "12:00", aujourdhui: false },
        },
        "fr",
        "lundi",
      ),
    ).toBe("Fermé · ouvre samedi à 12h");

    // Plus tard dans la même journée : ni « demain », ni un nom de jour.
    expect(
      texteEtatHoraires(
        {
          etat: "ferme",
          prochaine: { jour: "lundi", heure: "19:00", aujourdhui: true },
        },
        "fr",
        "lundi",
      ),
    ).toBe("Fermé · ouvre à 19h");
  });

  it("rend `null` sur « inconnu » — le signal de repli, et non « Fermé »", () => {
    expect(texteEtatHoraires({ etat: "inconnu" }, "fr", "lundi")).toBeNull();
    // Une semaine explicitement vide, elle, est une AFFIRMATION.
    expect(
      texteEtatHoraires({ etat: "ferme", prochaine: null }, "fr", "lundi"),
    ).toBe("Fermé");
  });
});

describe("la pastille sur le hero", () => {
  it("laisse une vitrine SANS horaires structurés exactement comme avant", () => {
    hero();
    expect(screen.getByText("Ouvert · 12h–23h")).toBeTruthy();
    expect(screen.queryByText(/ferme à/)).toBeNull();
  });

  it("n'affiche rien quand il n'y a ni structure ni phrase écrite", () => {
    hero({ badgeOuverture: null });
    expect(screen.queryByText(/Ouvert|Fermé/)).toBeNull();
  });

  it("remplace la phrase écrite à la main dès que la semaine existe", () => {
    // 20 h un lundi à Paris : ouvert jusqu'à 23 h.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T18:00:00Z"));
    try {
      hero({
        horaires: { ...SEMAINE_VIDE, lundi: [{ de: "12:00", a: "23:00" }] },
        timezone: "Europe/Paris",
      });
      expect(screen.getByText("Ouvert · ferme à 23h")).toBeTruthy();
      expect(screen.queryByText("Ouvert · 12h–23h")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("retombe sur la phrase écrite à la main si le fuseau est refusé", () => {
    hero({
      horaires: { ...SEMAINE_VIDE, lundi: [{ de: "12:00", a: "23:00" }] },
      timezone: "Pas/UnFuseau",
    });
    // `etatHoraires` rend `inconnu`, donc la pastille du commerçant tient. Un
    // « Fermé » affirmatif sur une donnée invalide ferait renoncer un client.
    expect(screen.getByText("Ouvert · 12h–23h")).toBeTruthy();
  });
});

describe("le piège d'hydratation", () => {
  /**
   * LE PREMIER RENDU NE LIT PAS L'HORLOGE.
   *
   * `useSyncExternalStore` prend son instantané SERVEUR pendant l'hydratation :
   * le HTML servi et le premier rendu client sont donc identiques par
   * construction. Ce test le prouve à l'endroit où ça se voit — le rendu d'un
   * composant sans abonnement actif, c'est-à-dire `renderToString`.
   *
   * Si quelqu'un remplace le hook par un `new Date()` direct, la phrase
   * calculée apparaîtra ici, ce test rougira, et l'hydratation aura été sauvée
   * avant d'être cassée.
   */
  it("rend la phrase écrite à la main dans le HTML servi, pas la calculée", async () => {
    const { renderToString } = await import("react-dom/server");
    const html = renderToString(
      <PastilleHoraires
        horaires={{ ...SEMAINE_VIDE, lundi: [{ de: "12:00", a: "23:00" }] }}
        timezone="Europe/Paris"
        repli="Ouvert · 12h–23h"
      />,
    );
    expect(html).toContain("Ouvert · 12h–23h");
    expect(html).not.toContain("ferme à");
  });

  it("n'affiche rien au premier rendu quand il n'y a pas de repli", async () => {
    const { renderToString } = await import("react-dom/server");
    const html = renderToString(
      <PastilleHoraires
        horaires={{ ...SEMAINE_VIDE, lundi: [{ de: "12:00", a: "23:00" }] }}
        timezone="Europe/Paris"
        repli={null}
      />,
    );
    // Un trou, et non une phrase que le client contredirait une seconde plus
    // tard : l'écart entre les deux rendus est ce qui casse l'hydratation.
    expect(html).toBe("");
  });
});
