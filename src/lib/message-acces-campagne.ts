/**
 * Ce qu'on dit au commerçant quand une campagne ne peut pas être (ré)activée.
 *
 * ── Le défaut fermé ici ──
 *
 * `updateCampaign` et `resumeCampaignAfterBudget` refusaient sur
 * `hasActiveAccess` — un prédicat qui répond « non » pour QUATRE vécus
 * distincts : essai expiré, abonnement résilié, compte inactif, impayé au-delà
 * du délai de grâce. Le texte du refus, lui, était écrit en dur sur un seul :
 * « Votre essai gratuit est terminé. » Un commerçant qui a payé deux ans puis
 * résilié partait donc chercher un essai qu'il a terminé depuis des mois —
 * pendant que le bandeau en haut du MÊME écran lui disait correctement
 * « Votre abonnement est inactif ».
 *
 * ── Pourquoi un module pur ──
 *
 * Le discriminant existe déjà et a été écrit exactement pour ce défaut un cran
 * plus haut : `isTrialExpired` a reçu `ever_subscribed`, et le layout s'en sert
 * pour choisir entre ses deux bandeaux. Ce qui manquait n'était pas la donnée
 * mais son emploi ici. La règle vit dans un module pur parce que `campaigns.ts`
 * est un module `"use server"` : une règle laissée dans son corps ne serait
 * vérifiable par personne.
 *
 * ── Ce que cette fonction ne fait PAS ──
 *
 * Elle ne devine aucune cause. Elle reçoit le verdict déjà calculé par
 * `isTrialExpired` et se contente de choisir la phrase. En cas de doute sur
 * l'historique Stripe, `hasEverSubscribed` se replie sur `true`, donc
 * `essaiTermine` arrive à `false` et le message générique l'emporte : on
 * dégrade vers le vague, jamais vers le faux.
 */
export function messageAccesCampagne(input: {
  /** Verdict d'`isTrialExpired`, discriminant `ever_subscribed` compris. */
  essaiTermine: boolean;
  /**
   * `activation` : le commerçant passe une campagne en « active ».
   * `relance` : il repart d'une pause automatique pour budget atteint.
   * `programmation` : il ARME la programmation automatique (`auto_schedule`),
   * qui n'active rien tout de suite mais confie l'activation au cron
   * `run_campaign_schedule`. Geste distinct parce que le refus l'est aussi :
   * il vient d'un trigger `before update of auto_schedule` (migration
   * `20260906120000`), donc l'UPDATE ENTIER est rejeté — les dates et le
   * budget saisis dans le même panneau ne sont pas enregistrés non plus. La
   * phrase d'`activation` le tairait, et le commerçant repartirait en croyant
   * son budget en base.
   */
  geste: "activation" | "relance" | "programmation";
}): string {
  if (input.geste === "programmation") {
    return input.essaiTermine
      ? "Votre essai gratuit est terminé. Abonnez-vous pour programmer l'activation automatique de vos campagnes — vos dates et votre budget n'ont pas été enregistrés."
      : "Votre abonnement est inactif. Reprenez-le pour programmer l'activation automatique de vos campagnes — vos dates et votre budget n'ont pas été enregistrés.";
  }
  if (input.geste === "relance") {
    return input.essaiTermine
      ? "Votre essai gratuit est terminé. Abonnez-vous pour réactiver vos campagnes."
      : "Votre abonnement est inactif. Reprenez-le pour réactiver vos campagnes.";
  }
  return input.essaiTermine
    ? "Votre essai gratuit est terminé. Abonnez-vous pour activer vos campagnes — vous pouvez toujours préparer vos QR codes en attendant."
    : "Votre abonnement est inactif : vos roues publiques sont désactivées. Reprenez-le pour activer vos campagnes — vous pouvez toujours préparer vos QR codes en attendant.";
}
