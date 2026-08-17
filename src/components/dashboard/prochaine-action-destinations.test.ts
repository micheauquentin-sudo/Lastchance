import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import type { OnboardingStep } from "@/components/dashboard/onboarding-checklist";
import {
  construireProchaineAction,
  tachesRecouvertesParHero,
  type EntreeProchaineAction,
} from "@/components/dashboard/prochaine-action-state";
import {
  CATALOGUE_ACTIONS,
  type CompteursCentreAnimation,
} from "@/lib/centre-animation-server";
import { lienSelonRole } from "@/lib/liens-proprietaire";

/**
 * UN FAIT, UNE DESTINATION.
 *
 * Le hero MASQUE la tâche d'équipe qui dit le même fait que lui
 * (`tachesRecouvertesParHero`) : le commerçant ne voit donc plus qu'un bouton.
 * Encore faut-il que ce bouton mène là où menait la tâche qu'il vient de
 * cacher. Deux des cinq faits avaient dérivé — « 3 animations en brouillon »
 * ouvrait la liste des campagnes, qui répondait « Aucune campagne pour
 * l'instant » à un compteur qui unit neuf modules ; « aucune animation
 * ouverte » ouvrait la même liste alors que la tâche masquée menait aux
 * modules.
 *
 * Cette garde ne juge aucune formulation : elle compare deux `href` que rien
 * d'autre n'oblige à rester égaux. Elle rougit à la prochaine dérive, dans
 * l'un ou l'autre sens.
 */

const RIEN_A_FAIRE: CompteursCentreAnimation = {
  drafts: 0,
  qrToTest: 0,
  liveExperiences: 2,
  lowStockPrizes: 0,
  rewardsToHandOver: 0,
  teamTasks: 0,
};

/** Démarrage terminé : le hero passe aux signaux opérationnels. */
const DEMARRAGE_FINI: OnboardingStep[] = [
  {
    key: "campaign",
    label: "Créer votre première campagne",
    href: "/dashboard/campaigns",
    done: true,
  },
];

const entree = (
  compteurs: Partial<CompteursCentreAnimation>,
): EntreeProchaineAction => ({
  role: "owner",
  etapesDemarrage: DEMARRAGE_FINI,
  compteurs: { ...RIEN_A_FAIRE, ...compteurs },
});

/** Les cinq états qui allument un candidat recouvrant une tâche d'équipe. */
const ETATS: Array<[string, Partial<CompteursCentreAnimation>]> = [
  ["gains", { rewardsToHandOver: 3 }],
  ["stock", { lowStockPrizes: 2 }],
  ["brouillons", { drafts: 3 }],
  ["qr", { qrToTest: 1 }],
  ["rien-ouvert", { liveExperiences: 0 }],
];

describe("le hero mène là où menait la tâche qu'il masque", () => {
  it.each(ETATS)("%s", (attendu, compteurs) => {
    const action = construireProchaineAction(entree(compteurs));
    expect(action.key).toBe(attendu);

    const cleTache = tachesRecouvertesParHero(action)[0];
    expect(cleTache).toBeDefined();

    const definition = CATALOGUE_ACTIONS.find((a) => a.key === cleTache);
    expect(definition, `tâche inconnue au catalogue : ${cleTache}`).toBeDefined();

    // `lienSelonRole` est le passage obligé des deux surfaces : on compare ce
    // que le commerçant OUVRIRAIT, pas le chemin brut.
    expect(action.cta?.href).toBe(lienSelonRole(definition!.href, "owner"));
  });
});
