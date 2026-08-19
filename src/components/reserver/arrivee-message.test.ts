import { describe, expect, it } from "vitest";
import type { CheckinVerdict } from "@/lib/reserver";
import { messageArrivee, TON_ARRIVEE } from "./arrivee-message";

/**
 * Couverture du module pur qui traduit un `CheckinVerdict` en message de
 * comptoir. Aucun réseau, aucun React : on prouve que chaque verdict a un
 * message dédié, que le ton correspond à un mot de contraste défini, et — le
 * point le plus important pour un caissier — que `already_checked_in` ne se
 * confond jamais avec `too_late` : ce sont deux réponses différentes à deux
 * situations différentes (voir le commentaire en tête du module source).
 */
describe("messageArrivee", () => {
  const verdicts: CheckinVerdict[] = [
    "unknown",
    "cancelled",
    "checked_in",
    "already_checked_in",
    "too_early",
    "too_late",
  ];

  it.each(verdicts)("rend un message pour le verdict %s", (verdict) => {
    const message = messageArrivee(verdict);
    expect(message.titre.length).toBeGreaterThan(0);
    expect(message.corps.length).toBeGreaterThan(0);
    expect(TON_ARRIVEE[message.ton]).toBeTruthy();
  });

  it("distingue « déjà enregistrée » de « fenêtre refermée »", () => {
    const dejaEnregistree = messageArrivee("already_checked_in");
    const fenetreRefermee = messageArrivee("too_late");
    expect(dejaEnregistree.titre).not.toBe(fenetreRefermee.titre);
    expect(dejaEnregistree.titre.toLowerCase()).toContain("déjà");
    expect(fenetreRefermee.titre.toLowerCase()).not.toContain("déjà");
  });

  it("un code inconnu ne propose pas de rappel de créneau", () => {
    expect(messageArrivee("unknown").montrerCreneau).toBe(false);
  });

  it("une arrivée enregistrée est de ton succès", () => {
    expect(messageArrivee("checked_in").ton).toBe("success");
  });
});
