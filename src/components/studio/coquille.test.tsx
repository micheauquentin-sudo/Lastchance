// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CoquilleStudio } from "@/components/studio/coquille";
import { libelleEtape } from "@/components/studio/etapes";

/**
 * LE SOCLE DES STUDIOS (VIT-38) — les invariants que ONZE modules vont hériter.
 *
 * Ce fichier n'est pas la garde d'un écran, c'est celle d'un CONTRAT. Le studio
 * vitrine a ses quarante gardes à lui ; ce qui est vérifié ici est ce qui doit
 * rester vrai pour le calendrier, la roue, le jackpot et les huit autres, y
 * compris ceux qui ne sont pas encore écrits.
 *
 * Trois invariants, et aucun n'est cosmétique — chacun correspond à une panne
 * déjà payée dans ce dépôt :
 *
 *  1. LE FORMULAIRE DE CHARGE UTILE N'EST L'ANCÊTRE DE RIEN. Un `<form>` dans
 *     un `<form>` est du HTML invalide : le navigateur déplie en silence et
 *     l'hydratation de toute la page meurt (VIT-16). Or la moitié des étapes de
 *     ce produit contiennent leur propre formulaire — une ligne de catalogue,
 *     un logo, un lot. La coquille doit donc rendre le formulaire en VOISIN.
 *  2. LE BOUTON EST DEHORS ET VISE DEDANS. C'est ce qui permet au point 1
 *     d'exister sans perdre la soumission.
 *  3. LE FIL D'ÉTAPES NE SE CENTRE PAS AVEC `justify-center`. Posé sur le
 *     conteneur qui défile, il rend le DÉBUT de la liste inatteignable dès
 *     qu'elle déborde : les premières étapes se font rogner à gauche et aucun
 *     défilement n'y revient. Sur un fil de dix étapes et un téléphone de
 *     comptoir, c'est la moitié du parcours qui disparaît.
 */

const ETAPES = [
  { cle: "un", titre: "Le nom", resume: "Comment ça s'appelle." },
  { cle: "deux", titre: "Les lots", resume: "Ce qu'il y a à gagner." },
  { cle: "trois", titre: "L'allure", resume: "Les couleurs." },
] as const;

type Cle = (typeof ETAPES)[number]["cle"];

function rendre(patch: {
  etape?: Cle;
  onEtape?: (c: Cle) => void;
  apercu?: React.ReactNode;
  peutEditer?: boolean;
} = {}) {
  return render(
    <CoquilleStudio
      titre="Mon studio"
      hrefRetour="/dashboard/quelque-part"
      idFormulaire="studio-reglages"
      formulaire={{ current: null }}
      onSubmit={vi.fn()}
      champsCaches={<input type="hidden" name="nom" value="Chez Astra" readOnly />}
      etapes={ETAPES}
      etape={patch.etape ?? "un"}
      onEtape={patch.onEtape ?? vi.fn()}
      peutEditer={patch.peutEditer ?? true}
      enregistrement={{ enCours: false, reussi: false }}
      apercu={patch.apercu}
    >
      {/* Une étape qui porte SON PROPRE formulaire — le cas courant, et celui
          qui casserait tout si la coquille l'englobait. */}
      <form aria-label="Le lot">
        <input name="lot" defaultValue="Un café" />
      </form>
    </CoquilleStudio>,
  );
}

afterEach(cleanup);

describe("socle des studios — la coquille", () => {
  it("ne rend AUCUN <form> à l'intérieur d'un autre", () => {
    const { container } = rendre();

    // Les deux existent bien — sans quoi l'assertion suivante ne mesurerait
    // rien : zéro formulaire imbriqué est trivialement vrai s'il n'y en a pas.
    expect(container.querySelectorAll("form")).toHaveLength(2);
    expect(container.querySelectorAll("form form")).toHaveLength(0);
  });

  it("le bouton d'enregistrement est HORS du formulaire, et le vise", () => {
    const { container } = rendre();
    const bouton = screen.getByRole("button", { name: "Enregistrer" });

    expect(bouton.getAttribute("form")).toBe("studio-reglages");
    expect(bouton.closest("form")).toBeNull();
    // Et la charge utile est bien DANS le formulaire ciblé, pas ailleurs.
    const cache = container.querySelector('input[name="nom"]');
    expect(cache?.closest("form")?.id).toBe("studio-reglages");
  });

  it("le fil d'étapes ne se centre pas au prix du défilement", () => {
    const { container } = rendre();
    const fil = container.querySelector("nav");

    // Le conteneur qui défile ne doit pas centrer : c'est l'enfant qui le fait.
    expect(fil?.className).toContain("overflow-x-auto");
    expect(fil?.className).not.toContain("justify-center");
    expect(fil?.firstElementChild?.className).toContain("mx-auto");
    expect(fil?.firstElementChild?.className).toContain("w-max");
  });

  it("chaque étape porte son numéro dans son nom accessible", () => {
    // « 3 » seul ne dit pas de quoi il est le numéro : lu par un lecteur
    // d'écran, « 3 L'allure » n'apprend rien. Le libellé est composé au socle.
    rendre({ etape: "deux" });

    for (const e of ETAPES) {
      expect(
        screen.getByRole("button", { name: libelleEtape(ETAPES, e.cle) }),
      ).toBeTruthy();
    }
    expect(
      screen
        .getByRole("button", { name: libelleEtape(ETAPES, "deux") })
        .getAttribute("aria-current"),
    ).toBe("step");
  });

  it("changer d'étape ne navigue pas : ce sont des boutons", () => {
    // Une navigation perdrait l'état en cours d'essai — tout ce que le
    // commerçant vient de régler sans avoir encore enregistré.
    const onEtape = vi.fn();
    const { container } = rendre({ onEtape });

    expect(container.querySelector("nav a")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: libelleEtape(ETAPES, "trois") }),
    );
    expect(onEtape).toHaveBeenCalledWith("trois");
  });

  it("l'aperçu est FACULTATIF, et son absence ne casse rien", () => {
    // Toutes les animations n'ont pas de page joueur rendable côté client. Un
    // faux aperçu serait pire que pas d'aperçu : c'est le seul défaut de cette
    // famille qui ne se voit pas (ADR-152).
    const sans = rendre();
    expect(sans.container.textContent).toContain("Le nom");

    cleanup();
    rendre({ apercu: <p>La page de vos clients</p> });
    expect(screen.getByText("La page de vos clients")).toBeTruthy();
  });

  it("sans droit d'édition, ni bouton ni état d'enregistrement", () => {
    // Mieux vaut ne rien proposer que laisser l'action refuser après coup.
    rendre({ peutEditer: false });

    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
    expect(screen.queryByText("Enregistrement automatique")).toBeNull();
  });
});
