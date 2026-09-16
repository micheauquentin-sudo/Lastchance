import { describe, expect, it } from "vitest";
import { calendarRedeemCodeSchema } from "@/lib/validations/calendar";
import { eventRedeemCodeSchema } from "@/lib/validations/events";
import { huntRedeemCodeSchema } from "@/lib/validations/hunts";
import { jackpotRedeemCodeSchema } from "@/lib/validations/jackpot";
import { loyaltyRedeemCodeSchema } from "@/lib/validations/loyalty";
import { contestRedeemCodeSchema } from "@/lib/validations/pronostics";
import { quizRedeemCodeSchema } from "@/lib/validations/quiz";
import { referralRedeemCodeSchema } from "@/lib/validations/referral";
import { stockHoldRedeemCodeSchema } from "@/lib/validations/reserver";
import { ticketOrRedeemCodeSchema } from "@/lib/validations/ticket-or";

const families = [
  ["calendrier", calendarRedeemCodeSchema, "CADEAU"],
  ["événement", eventRedeemCodeSchema, "EVENT"],
  ["chasse", huntRedeemCodeSchema, "CHASSE"],
  ["jackpot", jackpotRedeemCodeSchema, "JACKPOT"],
  ["fidélité", loyaltyRedeemCodeSchema, "FIDELITE"],
  ["pronostics", contestRedeemCodeSchema, "PRONO"],
  ["quiz", quizRedeemCodeSchema, "QUIZ"],
  ["parrainage", referralRedeemCodeSchema, "PARRAIN"],
  ["réservation", stockHoldRedeemCodeSchema, "RESA"],
  ["Ticket d'Or", ticketOrRedeemCodeSchema, "TICKET"],
] as const;

describe.each(families)("code de retrait %s", (_family, schema, prefix) => {
  it("normalise les espaces et la casse", () => {
    expect(schema.parse(`  ${prefix.toLowerCase()}-abcd2345  `)).toBe(
      `${prefix}-ABCD2345`,
    );
  });

  it("refuse l'alphabet ambigu et un préfixe voisin", () => {
    expect(schema.safeParse(`${prefix}-ABCI2345`).success).toBe(false);
    expect(schema.safeParse("AUTRE-ABCD2345").success).toBe(false);
  });
});
