// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  SMS_CONSENT_VERSION,
  smsConsentText,
  smsSenderIdSchema,
} from "@/lib/validations/sms";

/* L'expéditeur : miroir Zod du CHECK de `sms_senders.sender_id`. Le refus
 * doit tomber À LA SAISIE — au moment de l'envoi il est trop tard, le SMS est
 * perdu et facturé. */
describe("smsSenderIdSchema", () => {
  it("accepte un nom commercial conforme à la charte AF2M", () => {
    expect(smsSenderIdSchema.parse("MONRESTO")).toBe("MONRESTO");
    expect(smsSenderIdSchema.parse("CAFE75")).toBe("CAFE75");
    expect(smsSenderIdSchema.parse("A")).toBe("A");
  });

  it("met en majuscules : « monresto » est le même nom commercial", () => {
    expect(smsSenderIdSchema.parse("monresto")).toBe("MONRESTO");
    expect(smsSenderIdSchema.parse("  MonResto  ")).toBe("MONRESTO");
  });

  it("refuse au-delà de onze caractères", () => {
    expect(smsSenderIdSchema.safeParse("A".repeat(11)).success).toBe(true);
    expect(smsSenderIdSchema.safeParse("A".repeat(12)).success).toBe(false);
  });

  it("refuse le vide", () => {
    expect(smsSenderIdSchema.safeParse("").success).toBe(false);
    expect(smsSenderIdSchema.safeParse("   ").success).toBe(false);
  });

  it("refuse accents, espaces et ponctuation — l'opérateur les refuse", () => {
    for (const value of ["CAFÉ", "MON RESTO", "MON-RESTO", "RESTO!", "RESTO_1"]) {
      expect(smsSenderIdSchema.safeParse(value).success, value).toBe(false);
    }
  });
});

/* Les quatre cas de `smsConsentSchema` ont été retirés avec le schéma
 * lui-même : son seul appelant applicatif (`submitSmsConsent`) a disparu quand
 * le consentement est passé dans le claim. Un test qui n'exerce plus qu'un
 * export mort donne un vert sans contenu — le numéro est aujourd'hui validé
 * par `claimSchema`, et c'est là que sa couverture appartient. */

describe("texte de consentement versionné", () => {
  it("la version courante a un texte, et il mentionne la sortie", () => {
    expect(SMS_CONSENT_VERSION).toBe("sms.v1");
    expect(smsConsentText()).toMatch(/STOP/);
  });

  it("une version inconnue retombe sur la courante plutôt que sur du vide", () => {
    expect(smsConsentText("sms.v99")).toBe(smsConsentText("sms.v1"));
  });
});
