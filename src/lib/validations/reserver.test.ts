import { describe, expect, it } from "vitest";

import {
  cancelReservationSchema,
  checkinReservationSchema,
  createReserverActivitySchema,
  createReserverSlotSchema,
  reserveSlotSchema,
  updateReserverActivitySchema,
  updateReserverSlotSchema,
  updateReserverSlotStatusSchema,
} from "@/lib/validations/reserver";

const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUTRE_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("reserveSlotSchema — email et consentement, ensemble ou rien", () => {
  it("accepte une réservation SANS adresse ni consentement", () => {
    const parsed = reserveSlotSchema.safeParse({
      organizationId: UUID,
      slotId: AUTRE_UUID,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBeUndefined();
      expect(parsed.data.consent).toBe(false);
    }
  });

  it("accepte adresse ET consentement ensemble, en minuscules", () => {
    const parsed = reserveSlotSchema.safeParse({
      organizationId: UUID,
      slotId: AUTRE_UUID,
      email: "  Client@Exemple.FR ",
      consent: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("client@exemple.fr");
  });

  it("REFUSE une adresse sans consentement", () => {
    // Une adresse sans consentement est une donnée personnelle conservée sans
    // finalité : la base la refuse (équivalence `reservations_consent_state`),
    // le schéma le dit en français avant l'aller-retour.
    const parsed = reserveSlotSchema.safeParse({
      organizationId: UUID,
      slotId: AUTRE_UUID,
      email: "client@exemple.fr",
      consent: false,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toEqual(["consent"]);
    }
  });

  it("REFUSE un consentement sans adresse", () => {
    const parsed = reserveSlotSchema.safeParse({
      organizationId: UUID,
      slotId: AUTRE_UUID,
      consent: true,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].path).toEqual(["email"]);
  });

  it("refuse une adresse au-delà de 254 caractères (RFC 5321, comme le CHECK SQL)", () => {
    const trop = `${"a".repeat(250)}@exemple.fr`;
    const parsed = reserveSlotSchema.safeParse({
      organizationId: UUID,
      slotId: AUTRE_UUID,
      email: trop,
      consent: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("refuse un identifiant qui n'est pas un UUID", () => {
    expect(
      reserveSlotSchema.safeParse({ organizationId: "x", slotId: AUTRE_UUID })
        .success,
    ).toBe(false);
  });
});

describe("schémas d'entrée du parcours joueur et du comptoir", () => {
  it("cancelReservationSchema n'exige QUE l'identifiant (l'identité vient du cookie)", () => {
    const parsed = cancelReservationSchema.safeParse({ reservationId: UUID });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.keys(parsed.data)).toEqual(["reservationId"]);
    }
  });

  it("checkinReservationSchema normalise le code et n'accepte PAS d'acteur", () => {
    const parsed = checkinReservationSchema.safeParse({
      code: "  abcd2345 ",
      // Un acteur posté serait une déclaration sur l'honneur : le schéma ne le
      // connaît pas, et l'action le prend sur la session.
      actor: "99999999-9999-4999-8999-999999999999",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.code).toBe("ABCD2345");
      expect(Object.keys(parsed.data)).toEqual(["code"]);
    }
  });

  it("refuse un code hors de l'alphabet sans ambiguïté (ni I/O/0/1)", () => {
    expect(checkinReservationSchema.safeParse({ code: "ABCD2I45" }).success).toBe(
      false,
    );
    expect(checkinReservationSchema.safeParse({ code: "ABCD234" }).success).toBe(
      false,
    );
    expect(checkinReservationSchema.safeParse({ code: null }).success).toBe(false);
  });
});

describe("schémas du dashboard (FormData)", () => {
  it("crée une activité, description facultative", () => {
    const parsed = createReserverActivitySchema.safeParse({
      name: "  Dégustation  ",
      description: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Dégustation");
      expect(parsed.data.description).toBe("");
    }
  });

  it("refuse un nom vide et un nom de plus de 120 caractères", () => {
    expect(
      createReserverActivitySchema.safeParse({ name: "   " }).success,
    ).toBe(false);
    expect(
      createReserverActivitySchema.safeParse({ name: "a".repeat(121) }).success,
    ).toBe(false);
  });

  it("lit l'interrupteur `active` d'une case cochée, absente = décochée", () => {
    const coche = updateReserverActivitySchema.safeParse({
      id: UUID,
      name: "Atelier",
      description: "",
      active: "true",
    });
    const absente = updateReserverActivitySchema.safeParse({
      id: UUID,
      name: "Atelier",
      description: "",
      active: null,
    });
    expect(coche.success && coche.data.active).toBe(true);
    expect(absente.success && absente.data.active).toBe(false);
  });

  it("exige une fenêtre cohérente : la fin suit le début", () => {
    const inverse = createReserverSlotSchema.safeParse({
      activityId: UUID,
      startsAt: "2026-09-01T16:00",
      endsAt: "2026-09-01T14:00",
      capacity: "10",
    });
    expect(inverse.success).toBe(false);
    if (!inverse.success) expect(inverse.error.issues[0].path).toEqual(["endsAt"]);

    const egales = createReserverSlotSchema.safeParse({
      activityId: UUID,
      startsAt: "2026-09-01T14:00",
      endsAt: "2026-09-01T14:00",
      capacity: "10",
    });
    expect(egales.success).toBe(false);

    const bonne = createReserverSlotSchema.safeParse({
      activityId: UUID,
      startsAt: "2026-09-01T14:00",
      endsAt: "2026-09-01T16:00",
      capacity: "10",
    });
    expect(bonne.success).toBe(true);
    if (bonne.success) expect(bonne.data.capacity).toBe(10);
  });

  it("borne la capacité à 1..500 et REFUSE le champ non rendu", () => {
    const base = {
      activityId: UUID,
      startsAt: "2026-09-01T14:00",
      endsAt: "2026-09-01T16:00",
    };
    expect(createReserverSlotSchema.safeParse({ ...base, capacity: "0" }).success).toBe(false);
    expect(createReserverSlotSchema.safeParse({ ...base, capacity: "501" }).success).toBe(false);
    expect(createReserverSlotSchema.safeParse({ ...base, capacity: "2.5" }).success).toBe(false);
    // Le mode SILENCIEUX que `entierRequis` ferme : `Number(null)` vaut 0, et un
    // créneau à zéro place est une promesse d'attente sans issue.
    expect(createReserverSlotSchema.safeParse({ ...base, capacity: null }).success).toBe(false);
  });

  it("refuse une date et heure malformée", () => {
    expect(
      createReserverSlotSchema.safeParse({
        activityId: UUID,
        startsAt: "2026-13-45T99:99",
        endsAt: "2026-09-01T16:00",
        capacity: "10",
      }).success,
    ).toBe(false);
  });

  it("corrige un créneau existant, mêmes bornes qu'à la création", () => {
    const parsed = updateReserverSlotSchema.safeParse({
      id: UUID,
      startsAt: "2026-09-01T14:00",
      endsAt: "2026-09-01T16:00",
      capacity: "4",
    });
    expect(parsed.success).toBe(true);
    expect(
      updateReserverSlotSchema.safeParse({
        id: UUID,
        startsAt: "2026-09-01T16:00",
        endsAt: "2026-09-01T14:00",
        capacity: "4",
      }).success,
    ).toBe(false);
  });

  it("n'accepte que les trois statuts de créneau du CHECK SQL", () => {
    for (const status of ["draft", "open", "closed"]) {
      expect(
        updateReserverSlotStatusSchema.safeParse({ id: UUID, status }).success,
      ).toBe(true);
    }
    expect(
      updateReserverSlotStatusSchema.safeParse({ id: UUID, status: "deleted" })
        .success,
    ).toBe(false);
    expect(
      updateReserverSlotStatusSchema.safeParse({ id: UUID, status: null })
        .success,
    ).toBe(false);
  });
});
