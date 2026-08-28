import { describe, expect, it } from "vitest";

import { fondKeySchema, updateCalendarSchema } from "./calendar";
import { AUCUN_FOND, FOND_KEYS } from "@/lib/fonds-ecran";

/**
 * LE FOND D'ÉCRAN D'UN CALENDRIER — STRICT À L'ÉCRITURE, TROIS ÉTATS.
 *
 * Ce schéma est le pendant applicatif du CHECK SQL `calendars_fond_key_check`
 * (migration 20261102120000) et l'exact opposé de `fondChoisi`, qui est la
 * LECTURE : là-bas une valeur inconnue retombe silencieusement sur le repli,
 * ici elle est refusée. Même dissymétrie que `asSeasonalTheme` /
 * `wheelStyleWriteSchema` — souple sur ce qu'on relit, jamais sur ce qu'on
 * écrit.
 *
 * Les trois états gardés ici sont ceux que la colonne doit pouvoir exprimer :
 *
 *   `''`      → `null` : « suivre le thème », et c'est la valeur par DÉFAUT du
 *               formulaire. La refuser aurait bloqué l'enregistrement
 *               automatique de tous les autres réglages de l'écran.
 *   `'aucun'` → un CHOIX (« pas d'image »), distinct du précédent.
 *   une clé   → l'une des dix illustrations livrées.
 */
describe("fondKeySchema — ce qui peut être ÉCRIT en base", () => {
  it("replie la chaîne vide sur null : « suivre le thème » est le défaut", () => {
    const parsed = fondKeySchema.safeParse("");
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toBeNull();
    // Un champ rempli d'espaces vient du même geste (champ vidé à la main).
    expect(fondKeySchema.parse("   ")).toBeNull();
  });

  it("accepte « aucun » — un choix, pas une absence de choix", () => {
    expect(fondKeySchema.parse(AUCUN_FOND)).toBe(AUCUN_FOND);
  });

  it("accepte les dix clés livrées, et elles seules", () => {
    for (const cle of FOND_KEYS) expect(fondKeySchema.parse(cle)).toBe(cle);
  });

  it("refuse tout ce qui n'est pas dans le vocabulaire", () => {
    for (const inconnue of [
      "licorne",
      "NOEL", // la casse n'est pas normalisée : le CHECK SQL ne l'est pas non plus
      "constructor",
      "__proto__",
      "../../etc/passwd",
    ]) {
      expect(
        fondKeySchema.safeParse(inconnue).success,
        `${inconnue} accepté`,
      ).toBe(false);
    }
  });

  it("tolère les espaces autour d'une clé valide (champ recopié à la main)", () => {
    expect(fondKeySchema.parse("  prairie  ")).toBe("prairie");
  });

  it("refuse null : l'ABSENCE et « suivre le thème » ne se confondent pas", () => {
    // L'action lit ce champ par `formData.has(...)`. Un champ absent laisse la
    // colonne INTACTE (un autre formulaire de la page a posté), un champ vide
    // écrit `null` (le commerçant a choisi de suivre le thème). Confondre les
    // deux ferait repeindre le fond à chaque sauvegarde voisine.
    expect(fondKeySchema.safeParse(null).success).toBe(false);
  });
});

describe("updateCalendarSchema — le fond est FACULTATIF, jamais imposé", () => {
  const base = {
    id: "00000000-0000-4000-8000-0000000000aa",
    name: "Calendrier de test",
    theme: "noel",
    start_date: "2026-12-01",
    timezone: "Europe/Paris",
    day_count: "24",
    public_slug: "mon-calendrier",
    merchant_content: "",
    completion_reward_label: "",
    completion_reward_details: "",
    completion_reward_stock: "0",
  };

  it("un formulaire SANS le champ laisse le réglage indéfini (colonne intacte)", () => {
    const parsed = updateCalendarSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    expect(parsed.success && "fond_key" in parsed.data).toBe(false);
  });

  it("un formulaire AVEC le champ vide demande « suivre le thème »", () => {
    const parsed = updateCalendarSchema.safeParse({ ...base, fond_key: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.fond_key).toBeNull();
  });

  it("une clé inconnue fait échouer TOUT le formulaire, pas silencieusement le champ", () => {
    const parsed = updateCalendarSchema.safeParse({
      ...base,
      fond_key: "licorne",
    });
    expect(parsed.success).toBe(false);
  });
});
