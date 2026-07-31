import { describe, expect, it } from "vitest";
import {
  billingActions,
  hasActiveAccess,
  hasCompAccess,
  isTrialExpired,
  PAST_DUE_GRACE_DAYS,
  pastDueGraceEndsAt,
  trialDaysLeft,
} from "./subscription";
import type { SubscriptionStatus } from "@/types/database";

const NOW = new Date("2026-07-07T12:00:00Z");

function org(
  status: "trialing" | "active" | "past_due" | "canceled" | "inactive",
  trialEndsAt: string,
  pastDueSince: string | null = null,
  comp: { comp_access?: boolean; comp_access_until?: string | null } = {},
) {
  return {
    subscription_status: status,
    trial_ends_at: trialEndsAt,
    past_due_since: pastDueSince,
    comp_access: comp.comp_access ?? false,
    comp_access_until: comp.comp_access_until ?? null,
  } as const;
}

describe("hasActiveAccess", () => {
  it("abonnement actif → accès complet", () => {
    expect(hasActiveAccess(org("active", "2020-01-01T00:00:00Z"), NOW)).toBe(
      true,
    );
  });

  it("essai en cours → accès complet", () => {
    expect(hasActiveAccess(org("trialing", "2026-07-10T00:00:00Z"), NOW)).toBe(
      true,
    );
  });

  it("essai expiré → accès refusé", () => {
    expect(hasActiveAccess(org("trialing", "2026-07-01T00:00:00Z"), NOW)).toBe(
      false,
    );
  });

  it("abonnement annulé / inactif → accès refusé", () => {
    for (const status of ["canceled", "inactive"] as const) {
      expect(hasActiveAccess(org(status, "2099-01-01T00:00:00Z"), NOW)).toBe(
        false,
      );
    }
  });

  it("l'impayé SORTI du dunning n'a pas de seconde grâce, contrairement à past_due", () => {
    // ASYMÉTRIE VOULUE, et elle suit la sémantique de Stripe : `past_due`
    // décrit une relance en cours (la carte peut encore passer), `unpaid`
    // décrit une relance ÉPUISÉE. Le délai de grâce couvre la première ; le
    // rejouer sur la seconde offrirait 14 jours de plus à quelqu'un qui vient
    // déjà d'en consommer autant.
    //
    // `unpaid` arrive ici replié sur `canceled` (mapStripeStatus), d'où
    // l'absence de branche dédiée. Motif écrit dans 00009_past_due_grace.sql
    // et docs/decisions.md : le webhook terminal `canceled`/`unpaid` clôt la
    // fenêtre. ROUGE SI quelqu'un « uniformise » les deux statuts.
    const impayeEpuise = org("canceled", "2099-01-01T00:00:00Z");
    const relanceEnCours = org("past_due", "2099-01-01T00:00:00Z", "2026-07-06T12:00:00Z");

    expect(hasActiveAccess(impayeEpuise, NOW)).toBe(false);
    expect(hasActiveAccess(relanceEnCours, NOW)).toBe(true);
  });
});

describe("hasActiveAccess — accès offert (comp)", () => {
  it("accès offert illimité → accès complet malgré un statut coupé", () => {
    expect(
      hasActiveAccess(
        org("canceled", "2020-01-01T00:00:00Z", null, { comp_access: true }),
        NOW,
      ),
    ).toBe(true);
  });

  it("accès offert daté et non dépassé → accès complet", () => {
    expect(
      hasActiveAccess(
        org("inactive", "2020-01-01T00:00:00Z", null, {
          comp_access: true,
          comp_access_until: "2026-08-01T00:00:00Z",
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it("accès offert expiré → retombe sur l'état Stripe (refusé ici)", () => {
    expect(
      hasActiveAccess(
        org("canceled", "2020-01-01T00:00:00Z", null, {
          comp_access: true,
          comp_access_until: "2026-07-01T00:00:00Z",
        }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("hasCompAccess", () => {
  it("faux si non accordé", () => {
    expect(hasCompAccess({ comp_access: false, comp_access_until: null }, NOW)).toBe(false);
  });
  it("vrai si accordé sans date de fin", () => {
    expect(hasCompAccess({ comp_access: true, comp_access_until: null }, NOW)).toBe(true);
  });
  it("respecte la date de fin", () => {
    expect(
      hasCompAccess({ comp_access: true, comp_access_until: "2026-07-08T00:00:00Z" }, NOW),
    ).toBe(true);
    expect(
      hasCompAccess({ comp_access: true, comp_access_until: "2026-07-06T00:00:00Z" }, NOW),
    ).toBe(false);
  });
});

describe("hasActiveAccess — délai de grâce des impayés", () => {
  it("impayé récent → accès maintenu pendant la relance Stripe", () => {
    expect(
      hasActiveAccess(
        org("past_due", "2020-01-01T00:00:00Z", "2026-07-04T00:00:00Z"),
        NOW,
      ),
    ).toBe(true);
  });

  it("impayé au-delà du délai de grâce → accès coupé", () => {
    expect(
      hasActiveAccess(
        org("past_due", "2020-01-01T00:00:00Z", "2026-06-01T00:00:00Z"),
        NOW,
      ),
    ).toBe(false);
  });

  it("la coupure tombe exactement à la fin de la grâce", () => {
    const since = "2026-06-23T12:00:00Z"; // NOW - 14 jours pile
    const o = org("past_due", "2020-01-01T00:00:00Z", since);
    expect(hasActiveAccess(o, NOW)).toBe(false);
    expect(hasActiveAccess(o, new Date(NOW.getTime() - 1))).toBe(true);
  });

  it("impayé non daté (transition webhook en cours) → ne coupe pas", () => {
    expect(
      hasActiveAccess(org("past_due", "2020-01-01T00:00:00Z", null), NOW),
    ).toBe(true);
  });
});

describe("pastDueGraceEndsAt", () => {
  it("date d'entrée + délai de grâce", () => {
    const end = pastDueGraceEndsAt(
      org("past_due", "2020-01-01T00:00:00Z", "2026-07-04T00:00:00Z"),
    );
    expect(end?.toISOString()).toBe(
      new Date(
        new Date("2026-07-04T00:00:00Z").getTime() +
          PAST_DUE_GRACE_DAYS * 86_400_000,
      ).toISOString(),
    );
  });

  it("null hors impayé ou sans date d'entrée", () => {
    expect(
      pastDueGraceEndsAt(org("active", "2020-01-01T00:00:00Z", "2026-07-04T00:00:00Z")),
    ).toBeNull();
    expect(
      pastDueGraceEndsAt(org("past_due", "2020-01-01T00:00:00Z", null)),
    ).toBeNull();
  });
});

describe("isTrialExpired", () => {
  it("uniquement pour un statut trialing dépassé", () => {
    expect(isTrialExpired(org("trialing", "2026-07-01T00:00:00Z"), NOW)).toBe(
      true,
    );
    expect(isTrialExpired(org("trialing", "2026-07-10T00:00:00Z"), NOW)).toBe(
      false,
    );
    expect(isTrialExpired(org("canceled", "2026-07-01T00:00:00Z"), NOW)).toBe(
      false,
    );
  });
});

describe("trialDaysLeft", () => {
  it("arrondit au jour supérieur", () => {
    expect(trialDaysLeft(org("trialing", "2026-07-08T18:00:00Z"), NOW)).toBe(2);
    expect(trialDaysLeft(org("trialing", "2026-07-08T11:00:00Z"), NOW)).toBe(1);
  });

  it("0 si expiré ou hors essai", () => {
    expect(trialDaysLeft(org("trialing", "2026-07-01T00:00:00Z"), NOW)).toBe(0);
    expect(trialDaysLeft(org("active", "2026-07-10T00:00:00Z"), NOW)).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════
 * billingActions — « a un client Stripe » n'est pas « a un abonnement »
 *
 * Le défaut fermé ici était une impasse commerciale complète : le commerçant
 * ouvre la page de paiement Stripe, clique « Retour », et le bouton
 * « Démarrer mon abonnement » DISPARAÎT pour toujours. Cause unique : le
 * client Stripe est créé et persisté à l'OUVERTURE du Checkout
 * (`ensureStripeCustomer`, appelé avant `checkout.sessions.create`), jamais à
 * l'encaissement, et rien ne le remet à null — pas même
 * `checkout.session.expired`, que le webhook ne traite pas. Le prédicat
 * `!!stripe_customer_id` répondait donc « abonné » à quelqu'un qui n'avait
 * jamais payé, et lui offrait à la place un portail Stripe qui ne sait pas
 * créer d'abonnement.
 * ════════════════════════════════════════════════════════════ */

function billing(
  status: SubscriptionStatus,
  stripeCustomerId: string | null,
  stripeEventCreatedAt: string | null,
  justPaid = false,
) {
  return billingActions({
    subscriptionStatus: status,
    stripeCustomerId,
    stripeEventCreatedAt,
    justPaid,
  });
}

describe("billingActions", () => {
  // ── La fenêtre du retour de paiement ────────────────────────────────
  // Le correctif ci-dessus déplace le discriminant de `stripe_customer_id`
  // (posé à l'OUVERTURE du paiement) vers `stripe_event_created_at` (posé
  // par le WEBHOOK). Il gagne ainsi les cas d'abandon — mais il rouvre, s'il
  // s'arrête là, une fenêtre que l'ancien prédicat fermait par accident :
  // entre le retour de Stripe et l'arrivée du webhook, l'organisation n'a
  // TOUJOURS PAS de `stripe_event_created_at`.
  //
  // Sans ces deux tests, on remplace « le commerçant ne peut plus payer »
  // par « le commerçant paie deux fois ». Le second défaut coûte plus cher
  // que le premier.
  it("retour d'un paiement réussi : aucun second checkout offert, webhook pas encore arrivé", () => {
    const actions = billing("trialing", "cus_paye", null, true);

    expect(actions.canCheckout).toBe(false);
  });

  it("mais la fenêtre ne dure QUE ce retour : rechargée sans le paramètre, la page redevient franche", () => {
    // CONTRÔLE NÉGATIF DU DRAPEAU : s'il collait à l'organisation plutôt
    // qu'à la navigation, un webhook perdu laisserait le commerçant sans
    // aucun moyen de payer — exactement l'impasse qu'on vient de fermer,
    // remise en place par son propre correctif.
    const actions = billing("trialing", "cus_paye", null, false);

    expect(actions.canCheckout).toBe(true);
  });

  it("checkout abandonné : client Stripe créé, aucun abonnement → le bouton s'abonner RESTE", () => {
    // ROUGE SI : le prédicat retombe sur `stripe_customer_id`. C'est le geste
    // exact qui produisait l'impasse — « Retour » sur la page Stripe.
    const actions = billing("trialing", "cus_abandon", null);

    expect(actions.canCheckout).toBe(true);
    expect(actions.canManage).toBe(false);
    expect(actions.everSubscribed).toBe(false);
    expect(actions.hasLiveSubscription).toBe(false);
  });

  it("jamais passé par Stripe : checkout offert, portail fermé", () => {
    const actions = billing("trialing", null, null);

    expect(actions.canCheckout).toBe(true);
    expect(actions.canManage).toBe(false);
  });

  it("abonnement en cours : portail seul, pas de second checkout", () => {
    // ROUGE SI : le checkout reste offert à un abonné — il pourrait souscrire
    // une SECONDE fois et être facturé deux fois.
    for (const status of ["active", "trialing", "past_due"] as const) {
      const actions = billing(status, "cus_abonne", "2026-07-01T10:00:00Z");
      expect(actions.canCheckout, status).toBe(false);
      expect(actions.canManage, status).toBe(true);
      expect(actions.hasLiveSubscription, status).toBe(true);
    }
  });

  it("abonnement résilié : les DEUX portes s'ouvrent", () => {
    // ROUGE SI : les deux boutons redeviennent une alternative. `canceled` est
    // terminal chez Stripe : un nouvel abonnement est le seul retour possible,
    // et le portail garde l'historique de facturation, qui appartient au
    // commerçant.
    const actions = billing("canceled", "cus_resilie", "2026-07-01T10:00:00Z");

    expect(actions.canCheckout).toBe(true);
    expect(actions.canManage).toBe(true);
    expect(actions.everSubscribed).toBe(true);
    // Le catalogue d'offres, lui, doit rester ouvert : plus d'abonnement vivant
    // à basculer côté Stripe.
    expect(actions.hasLiveSubscription).toBe(false);
  });

  it("statut inactif : PAS de second checkout, le portail suffit", () => {
    // ROUGE SI : `inactive` est traité comme `canceled`. Il couvre `incomplete`
    // et `paused` (cf. mapStripeStatus) : l'objet abonnement existe ENCORE chez
    // Stripe et se reprend depuis le portail. Y rouvrir le checkout ferait
    // facturer deux abonnements au même commerçant — un défaut d'argent, pire
    // que le bouton manquant qu'on répare.
    const actions = billing("inactive", "cus_incomplet", "2026-07-01T10:00:00Z");

    expect(actions.canCheckout).toBe(false);
    expect(actions.canManage).toBe(true);
  });

  it("impayé (`unpaid`, replié sur canceled) : le PORTAIL reste ouvert", () => {
    // SYMÉTRIE. `unpaid` arrive ici sous le masque de `canceled` : le portail
    // doit rester ouvert, c'est le SEUL endroit où le commerçant remet une
    // carte et réactive son abonnement. Le lui fermer l'enfermerait dans un
    // impayé qu'il ne peut plus régulariser.
    const actions = billing("canceled", "cus_impaye", "2026-07-01T10:00:00Z");

    expect(actions.canManage).toBe(true);
  });

  it("… mais ce que ces booléens montrent n'est PAS ce qui autorise", () => {
    // AVEU EXPLICITE, et il vaut mieux qu'un faux confort. Un impayé et une
    // résiliation arrivent ici avec exactement les mêmes champs : rien en
    // local ne les distingue, `mapStripeStatus` ayant replié `unpaid` sur
    // `canceled` et le statut interne n'ayant que cinq valeurs autorisées en
    // base. `canCheckout` vaut donc `true` dans les deux cas.
    //
    // Ce n'est pas la faille : le refus qui protège l'argent est posé par
    // `createCheckoutSession`, qui interroge Stripe avant d'ouvrir la moindre
    // session (src/actions/billing.test.ts). ROUGE SI quelqu'un croit avoir
    // fermé le trou ICI sans toucher à l'action — il aurait déplacé le
    // problème sans le résoudre, et l'aurait cru résolu.
    const impaye = billing("canceled", "cus_x", "2026-07-01T10:00:00Z");
    const resilie = billing("canceled", "cus_x", "2026-07-01T10:00:00Z");

    expect(impaye).toEqual(resilie);
    expect(impaye.canCheckout).toBe(true);
  });

  it("abonné sans client Stripe enregistré : aucun portail à ouvrir", () => {
    // État théoriquement impossible (la RPC retrouve l'org PAR son customer),
    // mais `createPortalSession` refuserait de toute façon : l'écran ne doit
    // pas proposer un bouton qui échoue.
    const actions = billing("active", null, "2026-07-01T10:00:00Z");

    expect(actions.canManage).toBe(false);
  });
});
