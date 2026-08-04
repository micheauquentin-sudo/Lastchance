// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContestResult, WheelResult } from "@/app/dashboard/redeem/page";
import { phraseCaisseAnnulation } from "@/lib/annulation-cause";

/**
 * LA PHRASE D'ANNULATION EST RENDUE AU CAISSIER — PROUVÉ, PLUS AFFIRMÉ.
 *
 * ── LA DETTE QUE CE FICHIER FERME ───────────────────────────────────
 *
 * `annulation-cause.test.ts` garde le vocabulaire des causes et la présence de
 * la phrase à côté de chaque badge. Il est **textuel** : il lit la source de
 * `redeem/page.tsx`. `docs/bugs.md` le consignait ouvert depuis le
 * 2026-08-03 avec un motif qui était vrai à l'époque — « ce dépôt n'a aucun
 * environnement de rendu React ». Ce motif est mort le 2026-08-04 (ADR-076),
 * ce qui a transformé une impossibilité en dette faisable. La voici faite.
 *
 * ── CE QUE LE TEXTE NE VOIT PAS, MESURÉ ET NON SUPPOSÉ ──────────────
 *
 * Première justification écrite ici : « la garde textuelle serait aveugle si
 * la phrase disparaissait ». **Elle était fausse, et la mesure l'a dit** — sur
 * un sabotage supprimant la phrase de la carte pronostics, `annulation-cause.test.ts`
 * rend 1 rouge / 18 verts. Elle n'est pas aveugle du tout à une disparition.
 *
 * L'écart réel est ailleurs, et il tient en un sabotage : rendre la phrase
 * **présente mais inatteignable** (`{false && phraseCaisseAnnulation(...)}`).
 * Le fichier contient toujours l'appel, donc le grep le voit.
 *
 *   | sabotage                        | textuelle        | rendu (ici)  |
 *   |---------------------------------|------------------|--------------|
 *   | phrase SUPPRIMÉE                | 1 rouge / 18 v.  | 2 rouges/2 v.|
 *   | phrase PRÉSENTE mais inatteign. | **19 verts, 0 r.**| 2 rouges/2 v.|
 *
 * C'est exactement la frontière qu'ADR-074 énonce — une garde textuelle prouve
 * une présence, jamais une atteignabilité — et l'enjeu est humain : sans la
 * phrase RENDUE, le caissier lit « Gain annulé » et n'a rien à répondre au
 * client qui demande pourquoi ; c'est le défaut d'origine (ADR-069/072), où il
 * affirmait devant lui une décision que personne n'avait prise.
 *
 * ── POURQUOI « merchant » EN DUR ICI, ET PAS UNE LECTURE ────────────
 *
 * Les deux cartes passent la cause en dur (`"merchant"`) au lieu de lire
 * `cancelled_source`, et c'est délibéré : atteindre ces branches **prouve** que
 * la ligne parente vit, or les deux autres causes (purge, cascade) la font
 * précisément disparaître — la caisse retombe alors sur la carte du registre.
 * Ces tests gravent donc l'alignement des deux surfaces, pas une lecture.
 */

// La page importe du code serveur au niveau module ; seuls les deux
// composants de résultat nous intéressent, et ils sont synchrones et purs.
vi.mock("@/lib/auth", () => ({ getUserAndOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

// Le chemin NON annulé rend un bouton de remise, donc `useActionForm`, donc
// `useRouter` — absent hors d'un App Router monté. Le router est le CONTEXTE
// de ces cartes, jamais leur sujet : on le double au lieu de renoncer au
// contre-exemple, qui est la seule assertion capable de distinguer « la
// phrase est conditionnelle » de « la phrase est toujours là ».
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/redeem",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const FUSEAU = "Europe/Paris";

/**
 * La phrase attendue vient de la SOURCE DE VÉRITÉ, jamais recopiée ici : la
 * recopier ferait passer ce test au vert le jour où quelqu'un change la
 * phrase d'un seul des deux écrans — précisément le défaut qu'il garde.
 */
const PHRASE_MERCHANT = phraseCaisseAnnulation("merchant");

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Fixtures dérivées des champs RÉELLEMENT lus par chaque composant (relevés
 * par extraction sur la source, pas devinés). Un champ de date manquant fait
 * lever `formatDate` — c'est ainsi que la première rédaction a échoué, et
 * c'est déjà une chose qu'aucune garde textuelle ne pouvait dire.
 */
function participationAnnulee(overrides: Record<string, unknown> = {}): any {
  return {
    id: "p-1",
    redeem_code: "ABCD1234",
    created_at: "2026-07-30T09:00:00.000Z",
    first_name: "Camille",
    redeemed_at: null,
    cancelled_at: "2026-08-01T10:00:00.000Z",
    basket_cents: null,
    redeem_expires_at: null,
    prizes: { label: "Café offert", description: null },
    campaigns: { name: "Roue de l'été" },
    ...overrides,
  };
}

function contestAnnule(overrides: Record<string, unknown> = {}): any {
  return {
    id: "a-1",
    code: "PRONO-ABCD",
    status: "cancelled",
    reward_label: "Places de match",
    contest_name: "Championnat",
    player_name: "Camille",
    created_at: "2026-07-30T09:00:00.000Z",
    redeemed_at: null,
    basket_cents: null,
    redeem_expires_at: null,
    rank: 1,
    ...overrides,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("carte de caisse d'un lot annulé — la cause est DITE", () => {
  it("la roue : le badge n'apparaît jamais seul", () => {
    render(
      <WheelResult
        participation={participationAnnulee()}
        nomGagne="Café offert"
        descriptionGagnee={null}
        fuseau={FUSEAU}
        remis={false}
      />,
    );

    // Le badge, d'abord — sinon on prouverait une phrase sur une carte
    // qui n'annonce même pas l'annulation.
    expect(screen.getByText(/Gain annulé/)).toBeDefined();

    // Puis la phrase, RENDUE, et comparée à la source de vérité plutôt qu'à
    // un fragment : `getByText(/annulé/)` matcherait aussi le badge, donc
    // passerait même si la phrase manquait.
    expect(screen.getByText(PHRASE_MERCHANT)).toBeDefined();
  });

  it("les pronostics : même badge, même exigence", () => {
    render(
      <ContestResult
        award={contestAnnule()}
        nomGagne="Places de match"
        fuseau={FUSEAU}
        remis={false}
      />,
    );
    expect(screen.getByText(/Lot annulé/)).toBeDefined();
    expect(screen.getByText(PHRASE_MERCHANT)).toBeDefined();
  });

  it("les deux surfaces disent EXACTEMENT la même phrase", () => {
    // LE DÉFAUT D'ORIGINE : le caissier lisait deux vocabulaires selon le
    // chemin qui l'avait servi. L'assertion porte donc sur l'égalité mot pour
    // mot, pas sur une ressemblance — deux formulations « équivalentes »
    // seraient exactement le défaut qu'ADR-072 a fermé.
    render(
      <WheelResult
        participation={participationAnnulee()}
        nomGagne="Café offert"
        descriptionGagnee={null}
        fuseau={FUSEAU}
        remis={false}
      />,
    );
    const roue = screen.getByText(PHRASE_MERCHANT).textContent;
    cleanup();

    render(
      <ContestResult
        award={contestAnnule()}
        nomGagne="Places de match"
        fuseau={FUSEAU}
        remis={false}
      />,
    );
    expect(screen.getByText(PHRASE_MERCHANT).textContent).toBe(roue);
  });

  it("un lot NON annulé ne porte aucune phrase d'annulation", () => {
    // Contre-exemple : sans lui, une phrase rendue inconditionnellement
    // passerait les trois assertions ci-dessus.
    render(
      <WheelResult
        participation={participationAnnulee({ cancelled_at: null })}
        nomGagne="Café offert"
        descriptionGagnee={null}
        fuseau={FUSEAU}
        remis={false}
      />,
    );
    expect(screen.queryByText(/Gain annulé/)).toBeNull();
  });
});
