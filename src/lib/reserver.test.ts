import { describe, expect, it } from "vitest";

import {
  cheminActiviteReserver,
  etatUiCreneau,
  etatUiReservation,
  formatCreneau,
  formatHeure,
  LIBELLE_FENETRE_CHECKIN,
  mapCancelReservation,
  mapCheckinReservation,
  mapReservationPublicState,
  mapReserveSlot,
  RESERVER_FUSEAU_DEFAUT,
  urlActiviteReserver,
} from "@/lib/reserver";

// ────────────────────────────────────────────────────────────
// Cœur pur du module Réserver (RES-1b).
//
// Ce que ces tests attestent :
//   · un état inconnu retombe TOUJOURS sur le repli le plus fermé, jamais sur
//     une valeur inventée qui ferait afficher une place inexistante ;
//   · aucun identifiant ni code ne fuit d'un état qui ne prouve pas la
//     possession de la ligne ;
//   · au comptoir, `status` se lit AVANT `window_state` — un second scan le
//     lendemain est une arrivée DÉJÀ enregistrée, pas un refus ;
//   · le fuseau de l'établissement est toujours explicite.
// ────────────────────────────────────────────────────────────

describe("mapReserveSlot", () => {
  it("rend l'état, le code et les places restantes d'une place prise", () => {
    const resultat = mapReserveSlot({
      state: "reserved",
      reservation_id: "11111111-1111-4111-8111-111111111111",
      code: "ABCD2345",
      starts_at: "2026-09-01T12:00:00Z",
      ends_at: "2026-09-01T14:00:00Z",
      remaining: 3,
    });

    expect(resultat.state).toBe("reserved");
    expect(resultat.code).toBe("ABCD2345");
    expect(resultat.remaining).toBe(3);
    expect(resultat.status).toBe("confirmed");
  });

  it("rend le statut réel d'une réservation déjà détenue (arrivée comprise)", () => {
    // L'idempotence de la RPC couvre `checked_in` : le joueur déjà arrivé
    // détient toujours sa place, et l'écran doit dire « vous êtes arrivé »
    // plutôt que « vous êtes inscrit ».
    const resultat = mapReserveSlot({
      state: "already_reserved",
      reservation_id: "22222222-2222-4222-8222-222222222222",
      code: "EFGH2345",
      status: "checked_in",
    });

    expect(resultat.state).toBe("already_reserved");
    expect(resultat.status).toBe("checked_in");
    expect(resultat.code).toBe("EFGH2345");
  });

  it("rend la capacité avec `full`, de quoi expliquer le refus", () => {
    const resultat = mapReserveSlot({ state: "full", capacity: 8 });
    expect(resultat.capacity).toBe(8);
    expect(resultat.remaining).toBeNull();
  });

  it("NE LAISSE FUIR NI identifiant NI code hors des états de possession", () => {
    // Six refus partagent l'état `unavailable` (créneau inexistant, d'une autre
    // organisation, activité coupée, organisation sans droit, créneau fermé ou
    // passé). Si l'un d'eux charriait un code par accident, ce mapper le
    // donnerait à quelqu'un qui n'a rien réservé.
    const resultat = mapReserveSlot({
      state: "unavailable",
      reservation_id: "33333333-3333-4333-8333-333333333333",
      code: "IJKL2345",
    });

    expect(resultat.state).toBe("unavailable");
    expect(resultat.reservationId).toBeNull();
    expect(resultat.code).toBeNull();
  });

  it("dégrade tout état inconnu en `unavailable`", () => {
    expect(mapReserveSlot({ state: "surprise" }).state).toBe("unavailable");
    expect(mapReserveSlot(null).state).toBe("unavailable");
    expect(mapReserveSlot("reserved").state).toBe("unavailable");
  });
});

describe("mapCancelReservation", () => {
  it("rend l'horodatage d'annulation", () => {
    const resultat = mapCancelReservation({
      state: "cancelled",
      reservation_id: "44444444-4444-4444-8444-444444444444",
      cancelled_at: "2026-09-01T10:00:00Z",
    });
    expect(resultat.state).toBe("cancelled");
    expect(resultat.cancelledAt).toBe("2026-09-01T10:00:00Z");
  });

  it("rend le début du créneau avec `too_late`", () => {
    const resultat = mapCancelReservation({
      state: "too_late",
      reservation_id: "55555555-5555-4555-8555-555555555555",
      starts_at: "2026-09-01T12:00:00Z",
    });
    expect(resultat.startsAt).toBe("2026-09-01T12:00:00Z");
  });

  it("ne rend aucun identifiant sur `unknown`", () => {
    const resultat = mapCancelReservation({
      state: "unknown",
      reservation_id: "66666666-6666-4666-8666-666666666666",
    });
    expect(resultat.reservationId).toBeNull();
  });

  it("dégrade tout état inconnu en `unknown`", () => {
    expect(mapCancelReservation({ state: "peut-etre" }).state).toBe("unknown");
    expect(mapCancelReservation(undefined).state).toBe("unknown");
  });
});

describe("mapReservationPublicState", () => {
  it("rend le fuseau de l'organisation et les réservations", () => {
    const etat = mapReservationPublicState({
      state: "ok",
      timezone: "Indian/Reunion",
      reservations: [
        {
          reservation_id: "77777777-7777-4777-8777-777777777777",
          code: "MNPQ2345",
          status: "confirmed",
          created_at: "2026-08-20T08:00:00Z",
          cancelled_at: null,
          checked_in_at: null,
          starts_at: "2026-09-01T12:00:00Z",
          ends_at: "2026-09-01T14:00:00Z",
          activity_name: "Dégustation",
        },
      ],
    });

    expect(etat.ok).toBe(true);
    expect(etat.timezone).toBe("Indian/Reunion");
    expect(etat.reservations).toHaveLength(1);
    expect(etat.reservations[0].activityName).toBe("Dégustation");
  });

  it("rend une liste vide et le fuseau par défaut sur `unavailable`", () => {
    const etat = mapReservationPublicState({ state: "unavailable" });
    expect(etat.ok).toBe(false);
    expect(etat.reservations).toEqual([]);
    expect(etat.timezone).toBe(RESERVER_FUSEAU_DEFAUT);
  });

  it("écarte une entrée sans identifiant plutôt que d'en inventer un", () => {
    const etat = mapReservationPublicState({
      state: "ok",
      timezone: "Europe/Paris",
      reservations: [{ code: "RSTU2345" }, null, "texte"],
    });
    expect(etat.reservations).toEqual([]);
  });
});

describe("mapCheckinReservation", () => {
  const ligne = {
    id: "88888888-8888-4888-8888-888888888888",
    code: "VWXY2345",
    starts_at: "2026-09-01T12:00:00Z",
    ends_at: "2026-09-01T14:00:00Z",
    activity_name: "Atelier floral",
    cancelled_at: null,
  };

  it("rend `checked_in` pour le geste réel", () => {
    const resultat = mapCheckinReservation([
      {
        ...ligne,
        status: "checked_in",
        checked_in_at: "2026-09-01T11:30:00Z",
        checked_in_now: true,
        window_state: "ok",
      },
    ]);
    expect(resultat.verdict).toBe("checked_in");
    expect(resultat.activityName).toBe("Atelier floral");
  });

  it("STATUS AVANT WINDOW_STATE : un second scan le lendemain est une arrivée déjà enregistrée", () => {
    // Le cas exact que l'ordre inverse cassait : la RPC rend `checked_in` ET
    // `too_late`. Lire la fenêtre d'abord aurait affiché « trop tard » sur un
    // client pourtant venu, et envoyé le staff chercher un problème inexistant.
    const resultat = mapCheckinReservation([
      {
        ...ligne,
        status: "checked_in",
        checked_in_at: "2026-09-01T11:30:00Z",
        checked_in_now: false,
        window_state: "too_late",
      },
    ]);
    expect(resultat.verdict).toBe("already_checked_in");
  });

  it("rend `cancelled` avant toute considération de fenêtre", () => {
    const resultat = mapCheckinReservation([
      {
        ...ligne,
        status: "cancelled",
        cancelled_at: "2026-08-30T09:00:00Z",
        checked_in_at: null,
        checked_in_now: false,
        window_state: "too_early",
      },
    ]);
    expect(resultat.verdict).toBe("cancelled");
  });

  it("rend `too_early` / `too_late` sur une réservation NON consommée", () => {
    const tot = mapCheckinReservation([
      {
        ...ligne,
        status: "confirmed",
        checked_in_at: null,
        checked_in_now: false,
        window_state: "too_early",
      },
    ]);
    const tard = mapCheckinReservation([
      {
        ...ligne,
        status: "confirmed",
        checked_in_at: null,
        checked_in_now: false,
        window_state: "too_late",
      },
    ]);
    expect(tot.verdict).toBe("too_early");
    expect(tard.verdict).toBe("too_late");
    // La réservation n'est PAS consommée : rien ne doit laisser croire l'inverse.
    expect(tot.checkedInAt).toBeNull();
    expect(tard.checkedInAt).toBeNull();
  });

  it("rend `unknown` — INDISTINCTEMENT — pour aucune ligne", () => {
    // Code inconnu et code d'une AUTRE organisation partagent cette réponse :
    // la RPC ne les distingue pas, ce mapper non plus.
    expect(mapCheckinReservation([]).verdict).toBe("unknown");
    expect(mapCheckinReservation(null).verdict).toBe("unknown");
    expect(mapCheckinReservation([{ code: "SANSID2" }]).verdict).toBe("unknown");
  });
});

describe("états d'interface", () => {
  it("traduit le statut d'une réservation", () => {
    expect(etatUiReservation("confirmed")).toBe("confirme");
    expect(etatUiReservation("cancelled")).toBe("annule");
    expect(etatUiReservation("checked_in")).toBe("arrive");
  });

  it("suit l'ordre des refus de reserve_slot : fermé, puis passé, puis complet", () => {
    const now = new Date("2026-09-01T10:00:00Z");
    const futur = "2026-09-02T12:00:00Z";
    const passe = "2026-08-31T12:00:00Z";

    // Un créneau non ouvert est FERMÉ quoi qu'il reste de places.
    expect(
      etatUiCreneau({ status: "closed", startsAt: futur, remaining: 5 }, now),
    ).toBe("ferme");
    expect(
      etatUiCreneau({ status: "draft", startsAt: futur, remaining: 5 }, now),
    ).toBe("ferme");
    // Un créneau commencé est PASSÉ même s'il est plein — afficher « complet »
    // enverrait le joueur chercher une place qui n'existe plus.
    expect(
      etatUiCreneau({ status: "open", startsAt: passe, remaining: 0 }, now),
    ).toBe("passe");
    expect(
      etatUiCreneau({ status: "open", startsAt: futur, remaining: 0 }, now),
    ).toBe("complet");
    expect(
      etatUiCreneau({ status: "open", startsAt: futur, remaining: 1 }, now),
    ).toBe("ouvert");
  });

  it("traite une date illisible comme passée, jamais comme réservable", () => {
    expect(
      etatUiCreneau({ status: "open", startsAt: "pas-une-date", remaining: 4 }),
    ).toBe("passe");
  });
});

describe("formatage dans le fuseau de l'établissement", () => {
  it("formate un créneau avec son heure de fin", () => {
    const libelle = formatCreneau(
      "2026-09-01T12:00:00Z",
      "2026-09-01T14:00:00Z",
      "Europe/Paris",
    );
    // 12:00 UTC = 14:00 à Paris en septembre ; 14:00 UTC = 16:00.
    expect(libelle).toContain("14:00");
    expect(libelle).toContain("16:00");
    expect(libelle).toContain("–");
  });

  it("rend un fuseau DIFFÉRENT pour le même instant — le fuseau n'est pas décoratif", () => {
    const paris = formatHeure("2026-09-01T12:00:00Z", "Europe/Paris");
    const reunion = formatHeure("2026-09-01T12:00:00Z", "Indian/Reunion");
    expect(paris).not.toBe(reunion);
  });

  it("retombe sur le défaut plutôt que de casser sur un fuseau inconnu", () => {
    expect(formatHeure("2026-09-01T12:00:00Z", "Mars/Olympus")).toBe(
      formatHeure("2026-09-01T12:00:00Z", RESERVER_FUSEAU_DEFAUT),
    );
  });

  it("omet la fin quand elle est absente", () => {
    const libelle = formatCreneau("2026-09-01T12:00:00Z", null, "Europe/Paris");
    expect(libelle).not.toContain("–");
  });

  it("la formulation de la fenêtre de check-in nomme les deux bornes", () => {
    expect(LIBELLE_FENETRE_CHECKIN).toContain("fin de la séance");
    expect(LIBELLE_FENETRE_CHECKIN).toContain("deux heures");
    expect(LIBELLE_FENETRE_CHECKIN).toContain("fin de la journée");
  });
});

describe("adresses publiques", () => {
  it("ne porte NI jeton NI code NI empreinte", () => {
    const chemin = cheminActiviteReserver(
      "99999999-9999-4999-8999-999999999999",
    );
    expect(chemin).toBe("/reserver/99999999-9999-4999-8999-999999999999");
    expect(chemin).not.toContain("?");
    expect(chemin).not.toContain("token");
    expect(chemin).not.toContain("code");
  });

  it("construit une URL absolue sans doubler la barre oblique", () => {
    expect(
      urlActiviteReserver("99999999-9999-4999-8999-999999999999", "https://x.fr/"),
    ).toBe("https://x.fr/reserver/99999999-9999-4999-8999-999999999999");
  });
});
