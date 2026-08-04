import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  billingActions,
  billingButtonsToShow,
  CHECKOUT_REFUS_ABONNEMENT_VIVANT,
  displaySubscriptionStatus,
  hasActiveAccess,
  hasCompAccess,
  isTrialExpired,
  PAST_DUE_GRACE_DAYS,
  pastDueGraceEndsAt,
  TRIAL_EXPIRY_GRACE_DAYS,
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

  /* ────────────────────────────────────────────────────────────
   * APRÈS LE CRON `expire-trials`, le statut ne suffit plus.
   *
   * Le bandeau du dashboard se décidait sur `subscription_status ===
   * 'trialing'`. En basculant les essais jamais convertis vers `canceled`,
   * on faisait disparaître « votre essai gratuit est terminé : […] vous
   * pouvez toujours préparer vos QR codes » au profit du générique « votre
   * abonnement est inactif » — un message plus vague, pour EXACTEMENT la
   * population que la bascule vise.
   * ──────────────────────────────────────────────────────────── */
  it("essai basculé en `canceled` par le cron : reste un essai expiré", () => {
    expect(
      isTrialExpired(
        { ...org("canceled", "2026-07-01T00:00:00Z"), ever_subscribed: false },
        NOW,
      ),
    ).toBe(true);
  });

  it("VRAIE résiliation : jamais confondue avec un essai expiré", () => {
    // TÉMOIN de la précédente. Sans lui, un prédicat qui rendrait `true` sur
    // tout `canceled` passerait le test ci-dessus — et annoncerait « votre
    // essai gratuit est terminé » à un client qui a payé pendant deux ans.
    expect(
      isTrialExpired(
        { ...org("canceled", "2026-07-01T00:00:00Z"), ever_subscribed: true },
        NOW,
      ),
    ).toBe(false);
  });

  it("`canceled` dont l'essai n'est même pas échu : non", () => {
    // Un abonnement souscrit puis résilié PENDANT la fenêtre d'essai. Le cron
    // ne le produit pas (il attend l'échéance), mais le back-office peut poser
    // `canceled` à la main.
    expect(
      isTrialExpired(
        { ...org("canceled", "2026-07-10T00:00:00Z"), ever_subscribed: false },
        NOW,
      ),
    ).toBe(false);
  });

  it("sans réponse sur l'historique : comportement d'avant, jamais de faux positif", () => {
    // `ever_subscribed` absent = l'appelant ne sait pas. On dégrade vers le
    // message vague, jamais vers une affirmation fausse.
    expect(isTrialExpired(org("canceled", "2026-07-01T00:00:00Z"), NOW)).toBe(
      false,
    );
    expect(isTrialExpired(org("inactive", "2026-07-01T00:00:00Z"), NOW)).toBe(
      false,
    );
  });

  it("`inactive` n'est jamais un essai expiré, même sans historique Stripe", () => {
    // `inactive` couvre `incomplete` et `paused` : un objet abonnement existe
    // chez Stripe. Le cron n'y touche pas et le bandeau d'essai n'y a rien à
    // faire.
    expect(
      isTrialExpired(
        { ...org("inactive", "2026-07-01T00:00:00Z"), ever_subscribed: false },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("displaySubscriptionStatus", () => {
  it("sépare l'essai jamais converti de la vraie résiliation", () => {
    expect(
      displaySubscriptionStatus({
        subscription_status: "canceled",
        stripe_event_created_at: null,
      }),
    ).toBe("trial_expired");
    expect(
      displaySubscriptionStatus({
        subscription_status: "canceled",
        stripe_event_created_at: "2026-02-01T00:00:00Z",
      }),
    ).toBe("canceled");
  });

  it("rend les quatre autres statuts tels quels", () => {
    for (const status of ["trialing", "active", "past_due", "inactive"] as const) {
      expect(
        displaySubscriptionStatus({
          subscription_status: status,
          stripe_event_created_at: null,
        }),
      ).toBe(status);
    }
  });
});

describe("TRIAL_EXPIRY_GRACE_DAYS", () => {
  it("couvre la fenêtre de réessai des webhooks Stripe (3 jours)", () => {
    // Ce n'est pas un réglage de confort : en dessous, une panne complète de
    // notre réception d'événements ferait résilier des comptes dont Stripe a
    // bien annoncé l'abonnement. Au-dessus, le statut ment plus longtemps
    // mais personne n'est lésé.
    expect(TRIAL_EXPIRY_GRACE_DAYS).toBeGreaterThanOrEqual(3);
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

/* ════════════════════════════════════════════════════════════
 * billingButtonsToShow — UN REFUS NE NOMME JAMAIS UNE SORTIE FERMÉE
 *
 * Le défaut fermé ici : le propriétaire paie, revient sur Réglages, reclique
 * « Réglages » dans le menu (l'URL perd `?checkout=success`, donc `justPaid`
 * retombe à faux). Le webhook n'a pas encore été appliqué — ou ne le sera
 * JAMAIS, la route rendant 500 sans appeler la RPC sur un prix absent de la
 * configuration. `everSubscribed` reste donc faux : le bouton « Démarrer mon
 * abonnement » revient, il clique, et le serveur lui répond « Passez par
 * « Gérer mon abonnement » »… un bouton que `canManage` a caché pour la même
 * raison. De l'argent a changé de main et l'écran ne porte plus aucune action.
 *
 * Les deux tests de `billingActions` ci-dessus (« la fenêtre ne dure QUE ce
 * retour » et « checkout abandonné ») assertent DÉLIBÉRÉMENT cette
 * conjonction — bouton checkout visible + portail absent. Ils disent une vraie
 * propriété du modèle et restent inchangés : ce qui manquait n'était pas là,
 * c'était la cohérence entre le TEXTE du refus et les boutons rendus.
 * ════════════════════════════════════════════════════════════ */

describe("billingButtonsToShow", () => {
  it("le refus « abonnement déjà ouvert » OUVRE le portail qu'il nomme", () => {
    // LE FINDING, joué : l'état exact d'un webhook jamais appliqué.
    // ROUGE SI : l'écran retombe sur le seul `canManage`. Le commerçant lit
    // alors « Passez par Gérer mon abonnement » sans que ce bouton existe.
    const boutons = billingButtonsToShow({
      canCheckout: true,
      canManage: false,
      checkoutError: CHECKOUT_REFUS_ABONNEMENT_VIVANT,
    });

    expect(boutons.showPortal).toBe(true);
  });

  it("le texte du refus nomme bien le bouton — sinon la garde ne garde rien", () => {
    // ROUGE SI : le message cesse de nommer « Gérer mon abonnement » (il
    // pourrait alors ouvrir un bouton dont il ne parle pas) ou cesse d'être la
    // seule clé partagée. C'est l'assertion qui relie les deux moitiés.
    expect(CHECKOUT_REFUS_ABONNEMENT_VIVANT).toContain("Gérer mon abonnement");
  });

  it("aucun refus, ou un AUTRE refus : le portail reste sur `canManage`", () => {
    // CONTRÔLE NÉGATIF. Sans lui, `showPortal: true` en dur passerait le
    // premier test — et rétablirait le défaut que `billingActions` a fermé :
    // un portail offert en permanence à qui a seulement abandonné la page de
    // paiement, alors que le portail ne sait pas créer d'abonnement.
    for (const refus of [
      null,
      undefined,
      "Impossible de démarrer le paiement",
      // Voisin le plus dangereux : la même idée, un mot près. Une comparaison
      // par sous-chaîne l'accepterait ; l'égalité stricte le refuse.
      "Un abonnement est déjà ouvert pour ce compte.",
    ]) {
      const boutons = billingButtonsToShow({
        canCheckout: true,
        canManage: false,
        checkoutError: refus,
      });
      expect(boutons.showPortal, String(refus)).toBe(false);
    }
  });

  it("le checkout n'est jamais ouvert par un refus : `canCheckout` seul décide", () => {
    // ROUGE SI : le refus rouvrait aussi le checkout. Il est produit quand
    // Stripe confirme un abonnement VIVANT — y offrir un second paiement est
    // exactement ce que la garde serveur existe pour empêcher.
    const boutons = billingButtonsToShow({
      canCheckout: false,
      canManage: true,
      checkoutError: CHECKOUT_REFUS_ABONNEMENT_VIVANT,
    });

    expect(boutons.showCheckout).toBe(false);
    expect(boutons.showPortal).toBe(true);
  });

  it("l'impayé, lui, avait déjà son portail : le refus n'y change rien", () => {
    // La correction apportée au finding par la réfutation, épinglée. Le cas
    // `unpaid` (replié sur `canceled`, `everSubscribed` vrai) déclenche le
    // MÊME refus depuis un bouton visible, mais avec `canManage` déjà vrai.
    // Le trou était borné au sous-cas « webhook en retard ou jamais appliqué ».
    const impaye = billing("canceled", "cus_impaye", "2026-07-01T10:00:00Z");

    expect(impaye.canManage).toBe(true);
    expect(
      billingButtonsToShow({
        canCheckout: impaye.canCheckout,
        canManage: impaye.canManage,
        checkoutError: CHECKOUT_REFUS_ABONNEMENT_VIVANT,
      }).showPortal,
    ).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════
 * GARDE DE SOURCE — les deux moitiés doivent bouger ensemble
 *
 * La condition JSX qui rend le bouton du portail est vérifiée ici par lecture
 * du fichier. Depuis le 2026-08-04 le rendu React est disponible en test
 * (`// @vitest-environment happy-dom`), donc c'est un choix et non une
 * contrainte : ce qui est en jeu est que **les deux moitiés bougent
 * ensemble**, une propriété de co-localisation qui se lit sur la source et
 * qu'aucun montage ne montrerait. Comme dans
 * `destructive-confirm-coverage.test.ts` — elle prouve la forme, pas le pixel.
 *
 * Ce qu'elle attrape et qu'aucun test de module ne peut attraper : quelqu'un
 * recopie le texte du refus en littéral dans l'action, ou remet
 * `{canManage && …}` dans le composant. Les deux rouvrent le cul-de-sac sans
 * qu'aucune assertion de comportement ne bouge.
 * ════════════════════════════════════════════════════════════ */

const ACTION = "src/actions/billing.ts";
const COMPOSANT = "src/components/dashboard/billing-buttons.tsx";

/** Le fichier, lignes normalisées — les sources du dépôt sont en CRLF. */
function source(chemin: string): string {
  return readFileSync(chemin, "utf8").replace(/\r\n/g, "\n");
}

describe("cohérence du refus de checkout avec les boutons rendus", () => {
  it("l'action IMPORTE le texte du refus au lieu de le recopier", () => {
    // ROUGE SI : le littéral revient dans l'action. Le jour où l'un des deux
    // côtés est reformulé, l'égalité stricte cesse de correspondre et le
    // bouton disparaît en silence — le défaut d'origine, à l'identique.
    const src = source(ACTION);
    const imports = src.match(
      /import\s*\{[^}]*\}\s*from\s*"@\/lib\/subscription"/g,
    );
    expect(imports, "aucun import depuis @/lib/subscription").toBeTruthy();
    expect(
      imports!.some((b) => b.includes("CHECKOUT_REFUS_ABONNEMENT_VIVANT")),
    ).toBe(true);
    // Et le refus RENDU est la constante elle-même, pas une phrase qui lui
    // ressemble. L'assertion ne peut pas porter sur « Gérer mon abonnement » :
    // le commentaire qui explique la garde nomme ce bouton, légitimement. Elle
    // porte donc sur l'ouverture du message, qu'aucun commentaire ne cite, et
    // sur la forme du `return`.
    expect(src).toContain("error: CHECKOUT_REFUS_ABONNEMENT_VIVANT");
    expect(src).not.toContain("Un abonnement est déjà ouvert");
  });

  it("le composant décide ses deux boutons par `billingButtonsToShow`", () => {
    // ROUGE SI : le JSX retombe sur `{canManage && …}` / `{canCheckout && …}`.
    // Le composant recevrait toujours ses props, tout compilerait, et le refus
    // renommerait une sortie fermée.
    const src = source(COMPOSANT);
    expect(src).toContain("billingButtonsToShow");
    expect(src).toContain("{showPortal &&");
    expect(src).toContain("{showCheckout &&");
    expect(src).not.toContain("{canManage &&");
    expect(src).not.toContain("{canCheckout &&");
  });
});
