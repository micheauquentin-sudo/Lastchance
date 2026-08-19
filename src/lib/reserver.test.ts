import { describe, expect, it } from "vitest";

import {
  asQueueEntryStatus,
  asQueueStatus,
  cheminActiviteReserver,
  cheminFileReserver,
  cheminInvitationReserver,
  etatUiCreneau,
  etatUiEntreeFile,
  etatUiFile,
  etatUiInvitation,
  etatUiPlaceFile,
  etatUiReservation,
  fileAccepteEntree,
  formatCreneau,
  formatHeure,
  LIBELLE_FENETRE_CHECKIN,
  LIBELLE_FILE_SANS_DELAI,
  mapCancelReservation,
  mapCheckinReservation,
  mapClaimWaitlistOffer,
  mapCloseInvitation,
  mapCreateInvitation,
  mapQueueCallNext,
  mapQueueJoin,
  mapQueueLeave,
  mapQueuePublicState,
  mapQueueReopen,
  mapQueueResolve,
  mapQueueStaffState,
  mapRedeemInvitation,
  mapReservationPublicState,
  mapReserveSlot,
  mapRevokeInvitation,
  mapWaitlistJoin,
  mapWaitlistLeave,
  RESERVER_FUSEAU_DEFAUT,
  urlActiviteReserver,
  urlFileReserver,
  urlInvitationReserver,
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

// ════════════════════════════════════════════════════════════
// Liste prioritaire et invitations (RES-2, lot L5)
//
// Ce que ces tests attestent, et qui est le cœur du lot :
//   · aucun mapper ne laisse fuir un identifiant, un code ou une échéance
//     depuis un état qui ne prouve pas la possession de la ligne ;
//   · `offer_live` est LU, jamais recalculé : l'horloge du client ne décide pas
//     si une place est encore tenue ;
//   · les neuf refus de `redeem_invitation` restent UN SEUL état — le mapper ne
//     reconstruit pas l'oracle que le SQL a refusé de donner ;
//   · l'état d'une invitation suit l'ordre de ses quatre interrupteurs.
// ════════════════════════════════════════════════════════════

describe("mapWaitlistJoin", () => {
  it("rend le rang sur une inscription neuve, sans échéance d'offre", () => {
    const resultat = mapWaitlistJoin({
      state: "waiting",
      entry_id: "e1",
      status: "waiting",
      position: 3,
      offer_expires_at: null,
    });
    expect(resultat.state).toBe("waiting");
    expect(resultat.entryId).toBe("e1");
    expect(resultat.position).toBe(3);
    expect(resultat.offerExpiresAt).toBeNull();
  });

  it("rend le rang ET l'échéance sur une inscription DÉJÀ faite", () => {
    const resultat = mapWaitlistJoin({
      state: "already_waiting",
      entry_id: "e1",
      status: "offered",
      position: 1,
      offer_expires_at: "2026-09-01T12:00:00Z",
    });
    expect(resultat.entryStatus).toBe("offered");
    expect(resultat.offerExpiresAt).toBe("2026-09-01T12:00:00Z");
  });

  it("rend les places restantes sur `not_full` : on ne fait pas la queue pour une place libre", () => {
    const resultat = mapWaitlistJoin({ state: "not_full", remaining: 2 });
    expect(resultat.remaining).toBe(2);
    expect(resultat.entryId).toBeNull();
  });

  it("ne laisse fuir NI code NI identifiant depuis un refus muet", () => {
    const resultat = mapWaitlistJoin({
      state: "unavailable",
      entry_id: "e1",
      reservation_id: "r1",
      code: "ABCD2345",
      position: 1,
    });
    expect(resultat.entryId).toBeNull();
    expect(resultat.reservationId).toBeNull();
    expect(resultat.code).toBeNull();
    expect(resultat.position).toBeNull();
  });

  it("retombe sur `unavailable` — le repli le plus fermé — sur un document illisible", () => {
    expect(mapWaitlistJoin(null).state).toBe("unavailable");
    expect(mapWaitlistJoin({ state: "inconnu" }).state).toBe("unavailable");
  });
});

describe("mapClaimWaitlistOffer", () => {
  it("rend la réservation, son code et les bornes du créneau sur une conversion RÉELLE", () => {
    const resultat = mapClaimWaitlistOffer({
      state: "claimed",
      entry_id: "e1",
      reservation_id: "r1",
      code: "ABCD2345",
      status: "confirmed",
      starts_at: "2026-09-01T12:00:00Z",
      ends_at: "2026-09-01T14:00:00Z",
    });
    expect(resultat.reservationId).toBe("r1");
    expect(resultat.startsAt).toBe("2026-09-01T12:00:00Z");
  });

  it("laisse `startsAt` NUL sur le rejeu idempotent — c'est ce qui distingue les deux", () => {
    // La RPC ne rend les bornes que sur le chemin qui INSÈRE. L'action s'en sert
    // pour ne pas renvoyer une confirmation par email à chaque clic.
    const resultat = mapClaimWaitlistOffer({
      state: "claimed",
      entry_id: "e1",
      reservation_id: "r1",
      code: "ABCD2345",
      status: "confirmed",
    });
    expect(resultat.reservationId).toBe("r1");
    expect(resultat.startsAt).toBeNull();
  });

  it("rend l'échéance dépassée avec `expired`, et rien d'autre", () => {
    const resultat = mapClaimWaitlistOffer({
      state: "expired",
      entry_id: "e1",
      offer_expires_at: "2026-08-01T00:00:00Z",
    });
    expect(resultat.offerExpiresAt).toBe("2026-08-01T00:00:00Z");
    expect(resultat.code).toBeNull();
  });

  it("ne nomme AUCUNE entrée sur `unknown` ni sur `unavailable`", () => {
    expect(
      mapClaimWaitlistOffer({ state: "unknown", entry_id: "e1" }).entryId,
    ).toBeNull();
    expect(
      mapClaimWaitlistOffer({ state: "unavailable", entry_id: "e1" }).entryId,
    ).toBeNull();
  });

  it("retombe sur `unknown` sur un document illisible", () => {
    expect(mapClaimWaitlistOffer(undefined).state).toBe("unknown");
  });
});

describe("mapWaitlistLeave", () => {
  it("rend `converted` avec la réservation : la place n'est pas perdue, elle a été prise", () => {
    const resultat = mapWaitlistLeave({
      state: "converted",
      entry_id: "e1",
      reservation_id: "r1",
    });
    expect(resultat.reservationId).toBe("r1");
    expect(resultat.cancelledAt).toBeNull();
  });

  it("rend `left` idempotent avec sa date, sans réservation", () => {
    const resultat = mapWaitlistLeave({
      state: "left",
      entry_id: "e1",
      cancelled_at: "2026-08-20T10:00:00Z",
    });
    expect(resultat.cancelledAt).toBe("2026-08-20T10:00:00Z");
    expect(resultat.reservationId).toBeNull();
  });

  it("ne nomme aucune entrée sur `unknown`", () => {
    expect(
      mapWaitlistLeave({ state: "unknown", entry_id: "e1" }).entryId,
    ).toBeNull();
  });
});

describe("mapRedeemInvitation", () => {
  it("rend la place, son code, l'invitation et le créneau sur `reserved`", () => {
    const resultat = mapRedeemInvitation({
      state: "reserved",
      reservation_id: "r1",
      code: "ABCD2345",
      invitation_id: "i1",
      starts_at: "2026-09-01T12:00:00Z",
      ends_at: "2026-09-01T14:00:00Z",
      activity_name: "Dégustation",
      remaining: 4,
    });
    expect(resultat.status).toBe("confirmed");
    expect(resultat.invitationId).toBe("i1");
    expect(resultat.activityName).toBe("Dégustation");
    expect(resultat.remaining).toBe(4);
  });

  it("rend la place déjà détenue sur `already_reserved`, SANS nommer l'invitation", () => {
    const resultat = mapRedeemInvitation({
      state: "already_reserved",
      reservation_id: "r1",
      code: "ABCD2345",
      status: "checked_in",
      invitation_id: "i1",
    });
    expect(resultat.code).toBe("ABCD2345");
    expect(resultat.status).toBe("checked_in");
    // Deux clics ne brûlent qu'un usage, et n'apprennent rien de l'invitation.
    expect(resultat.invitationId).toBeNull();
  });

  it("ne laisse RIEN fuir de `unavailable` — les neuf refus restent muets", () => {
    const resultat = mapRedeemInvitation({
      state: "unavailable",
      reservation_id: "r1",
      code: "ABCD2345",
      invitation_id: "i1",
      activity_name: "Dégustation",
      capacity: 10,
    });
    expect(resultat.reservationId).toBeNull();
    expect(resultat.code).toBeNull();
    expect(resultat.invitationId).toBeNull();
    expect(resultat.activityName).toBeNull();
    expect(resultat.capacity).toBeNull();
  });

  it("rend la capacité avec `full` — de quoi expliquer le refus", () => {
    expect(mapRedeemInvitation({ state: "full", capacity: 8 }).capacity).toBe(8);
  });

  it("retombe sur `unavailable` sur un état hors contrat", () => {
    expect(mapRedeemInvitation({ state: "revoked" }).state).toBe("unavailable");
  });
});

describe("mappers d'invitation côté commerçant", () => {
  it("rend l'identifiant sur `created`, et le plafond d'usages", () => {
    const resultat = mapCreateInvitation({
      state: "created",
      invitation_id: "i1",
      max_uses: 5,
      expires_at: "2026-09-01T12:00:00Z",
    });
    expect(resultat.invitationId).toBe("i1");
    expect(resultat.maxUses).toBe(5);
  });

  it("ne nomme aucune invitation sur un refus", () => {
    const resultat = mapCreateInvitation({
      state: "duplicate",
      invitation_id: "i1",
    });
    expect(resultat.state).toBe("duplicate");
    expect(resultat.invitationId).toBeNull();
  });

  it("retombe sur `unknown` — repli FERMÉ — plutôt que d'annoncer un lien qui n'existe pas", () => {
    expect(mapCreateInvitation(null).state).toBe("unknown");
    expect(mapCreateInvitation({ state: "created" }).invitationId).toBeNull();
  });

  it("révoquer et clore rendent `unknown` indistinctement d'un autre locataire", () => {
    expect(mapRevokeInvitation({ state: "unknown" }).invitationId).toBeNull();
    expect(mapCloseInvitation({ state: "unknown" }).invitationId).toBeNull();
    expect(
      mapRevokeInvitation({
        state: "revoked",
        invitation_id: "i1",
        revoked_at: "2026-08-20T10:00:00Z",
      }).revokedAt,
    ).toBe("2026-08-20T10:00:00Z");
    expect(
      mapCloseInvitation({
        state: "closed",
        invitation_id: "i1",
        closed_at: "2026-08-20T10:00:00Z",
      }).closedAt,
    ).toBe("2026-08-20T10:00:00Z");
  });
});

describe("mapReservationPublicState — la file", () => {
  it("lit `offer_live` du SERVEUR, sans jamais le recalculer", () => {
    const etat = mapReservationPublicState({
      state: "ok",
      timezone: "Europe/Paris",
      reservations: [],
      waitlist: [
        {
          entry_id: "e1",
          slot_id: "s1",
          status: "offered",
          // Échéance PASSÉE, mais le serveur dit l'offre vivante : c'est lui qui
          // tranche, il a lu `now()` dans le même instantané.
          offer_expires_at: "2000-01-01T00:00:00Z",
          offer_live: true,
          position: 1,
          activity_name: "Dégustation",
        },
      ],
    });
    expect(etat.waitlist[0].offerLive).toBe(true);
    expect(etat.waitlist[0].position).toBe(1);
  });

  it("retombe sur `offerLive: false` — jamais une promesse — sur un champ illisible", () => {
    const etat = mapReservationPublicState({
      state: "ok",
      timezone: "Europe/Paris",
      reservations: [],
      waitlist: [
        { entry_id: "e1", slot_id: "s1", status: "offered", offer_live: "oui" },
      ],
    });
    expect(etat.waitlist[0].offerLive).toBe(false);
  });

  it("jette une entrée sans identifiant plutôt que d'en inventer un", () => {
    const etat = mapReservationPublicState({
      state: "ok",
      timezone: "Europe/Paris",
      reservations: [],
      waitlist: [{ slot_id: "s1" }, { entry_id: "e1" }],
    });
    expect(etat.waitlist).toHaveLength(0);
  });

  it("rend une file VIDE — pas `undefined` — sur un état refusé", () => {
    expect(mapReservationPublicState({ state: "unavailable" }).waitlist).toEqual(
      [],
    );
  });
});

describe("etatUiEntreeFile", () => {
  it("distingue l'offre vivante de l'offre échue que le balayage n'a pas encore vue", () => {
    expect(etatUiEntreeFile({ status: "offered", offerLive: true })).toBe("offre");
    // La ligne est ENCORE `offered` en base : dire « expirée » mentirait sur son
    // état, et l'écran n'aurait plus de quoi expliquer un rang encore occupé.
    expect(etatUiEntreeFile({ status: "offered", offerLive: false })).toBe(
      "offre_expiree",
    );
  });

  it("rend les trois états terminaux tels quels", () => {
    expect(etatUiEntreeFile({ status: "converted", offerLive: false })).toBe(
      "convertie",
    );
    expect(etatUiEntreeFile({ status: "expired", offerLive: false })).toBe(
      "expiree",
    );
    expect(etatUiEntreeFile({ status: "cancelled", offerLive: false })).toBe(
      "partie",
    );
  });

  it("`waiting` reste `attente`, même si un `offerLive` incohérent traîne", () => {
    expect(etatUiEntreeFile({ status: "waiting", offerLive: true })).toBe(
      "attente",
    );
  });
});

describe("etatUiInvitation", () => {
  const VIVANTE = {
    revokedAt: null,
    closedAt: null,
    expiresAt: null,
    usedCount: 0,
    maxUses: 5,
  };

  it("suit l'ordre des quatre interrupteurs de la RPC", () => {
    // Révoquée ET épuisée : c'est la RÉVOCATION qu'on nomme — une décision du
    // commerçant passe avant sa conséquence.
    expect(
      etatUiInvitation({
        ...VIVANTE,
        revokedAt: "2026-08-01T00:00:00Z",
        closedAt: "2026-08-01T00:00:00Z",
        usedCount: 5,
      }),
    ).toBe("revoquee");
    expect(
      etatUiInvitation({
        ...VIVANTE,
        closedAt: "2026-08-01T00:00:00Z",
        usedCount: 5,
      }),
    ).toBe("fermee");
    expect(
      etatUiInvitation(
        { ...VIVANTE, expiresAt: "2026-08-01T00:00:00Z", usedCount: 5 },
        new Date("2026-08-20T00:00:00Z"),
      ),
    ).toBe("expiree");
    expect(etatUiInvitation({ ...VIVANTE, usedCount: 5 })).toBe("epuisee");
    expect(etatUiInvitation(VIVANTE)).toBe("active");
  });

  it("une échéance FUTURE ne ferme rien", () => {
    expect(
      etatUiInvitation(
        { ...VIVANTE, expiresAt: "2030-01-01T00:00:00Z" },
        new Date("2026-08-20T00:00:00Z"),
      ),
    ).toBe("active");
  });

  it("une date illisible ne fait pas expirer une invitation valide", () => {
    expect(etatUiInvitation({ ...VIVANTE, expiresAt: "pas une date" })).toBe(
      "active",
    );
  });
});

describe("adresse d'une invitation", () => {
  it("porte le jeton — et c'est le seul chemin du module qui en porte un", () => {
    expect(cheminInvitationReserver("aBc_-123")).toBe(
      "/reserver/invitation/aBc_-123",
    );
  });

  it("échappe ce qui viendrait d'ailleurs plutôt que de le recopier dans le chemin", () => {
    expect(cheminInvitationReserver("a/b?c")).toBe(
      "/reserver/invitation/a%2Fb%3Fc",
    );
  });

  it("construit une URL absolue sans doubler la barre oblique", () => {
    expect(urlInvitationReserver("jeton", "https://x.fr/")).toBe(
      "https://x.fr/reserver/invitation/jeton",
    );
  });
});

// ────────────────────────────────────────────────────────────
// La file sereine (RES-3) — les mappers, et le repli le plus fermé.
//
// Ce que ces tests attestent :
//   · aucun document rendu ne porte de DURÉE — critère dur du lot ;
//   · un `jsonb` illisible se lit dans l'état auquel RIEN N'EST DÛ, jamais
//     dans celui qui promet une place ou qui crie « c'est à vous » ;
//   · les champs ne sont retenus que sur les états qui les JUSTIFIENT — un
//     identifiant d'entrée ne voyage pas avec un refus ;
//   · l'appel prime sur le rang, dans le mapper d'écran comme dans le SQL.
// ────────────────────────────────────────────────────────────

/** Toutes les clés d'un objet, y compris celles des objets imbriqués. */
function toutesLesCles(valeur: unknown, prefixe = ""): string[] {
  if (typeof valeur !== "object" || valeur === null) return [];
  return Object.entries(valeur).flatMap(([cle, sous]) => [
    `${prefixe}${cle}`,
    ...toutesLesCles(sous, `${prefixe}${cle}.`),
  ]);
}

const MOTS_DE_DELAI = /eta|delay|duree|duration|remaining_time|minutes/i;

describe("mapQueueJoin", () => {
  it("rend le rang, la taille de la file et l'entrée sur une inscription", () => {
    const resultat = mapQueueJoin({
      state: "waiting",
      entry_id: "e1",
      status: "waiting",
      position: 3,
      waiting_count: 3,
      called_at: null,
    });

    expect(resultat).toEqual({
      state: "waiting",
      entryId: "e1",
      entryStatus: "waiting",
      position: 3,
      waitingCount: 3,
      calledAt: null,
      capacity: null,
    });
  });

  it("rend LE MÊME RANG sur une rejointe idempotente, appel compris", () => {
    // Rejoindre deux fois est un RECHARGEMENT DE PAGE, pas une faute : la RPC
    // rend le rang existant, et celui qui a été appelé entre-temps le voit.
    const resultat = mapQueueJoin({
      state: "already_waiting",
      entry_id: "e1",
      status: "called",
      position: null,
      called_at: "2026-08-20T10:00:00Z",
    });

    expect(resultat.entryStatus).toBe("called");
    expect(resultat.position).toBeNull();
    expect(resultat.calledAt).toBe("2026-08-20T10:00:00Z");
    // La RPC ne recompte PAS la file pour quelqu'un qui a déjà sa place.
    expect(resultat.waitingCount).toBeNull();
  });

  it("rend le plafond avec `queue_full`, et AUCUNE entrée", () => {
    const resultat = mapQueueJoin({ state: "queue_full", capacity: 50 });
    expect(resultat.capacity).toBe(50);
    expect(resultat.entryId).toBeNull();
  });

  it("se replie sur `unavailable` — jamais sur une place accordée", () => {
    expect(mapQueueJoin(null).state).toBe("unavailable");
    expect(mapQueueJoin({ state: "waitiiing" }).state).toBe("unavailable");
    expect(mapQueueJoin("waiting").state).toBe("unavailable");
  });

  it("ne laisse AUCUN identifiant d'entrée voyager avec un refus", () => {
    const resultat = mapQueueJoin({
      state: "unavailable",
      entry_id: "fuite",
      position: 1,
    });
    expect(resultat.entryId).toBeNull();
    expect(resultat.position).toBeNull();
  });

  it("ne porte AUCUNE clé de durée", () => {
    const cles = toutesLesCles(
      mapQueueJoin({ state: "waiting", entry_id: "e1", position: 1 }),
    );
    expect(cles.some((cle) => MOTS_DE_DELAI.test(cle))).toBe(false);
  });
});

describe("mapQueueLeave", () => {
  it("rend l'issue telle quelle quand le comptoir a déjà tranché", () => {
    // Réécrire un `served` en `left` effacerait un passage réel des
    // statistiques du commerçant, sur simple clic d'un joueur.
    const resultat = mapQueueLeave({
      state: "served",
      entry_id: "e1",
      resolved_at: "2026-08-20T10:00:00Z",
    });
    expect(resultat.state).toBe("served");
    expect(resultat.resolvedAt).toBe("2026-08-20T10:00:00Z");
  });

  it("se replie sur `unknown`, sans identifiant", () => {
    const resultat = mapQueueLeave({ state: "??", entry_id: "fuite" });
    expect(resultat.state).toBe("unknown");
    expect(resultat.entryId).toBeNull();
  });
});

describe("mapQueueCallNext", () => {
  it("rend le prénom à appeler à voix haute, et le reste de la file", () => {
    const resultat = mapQueueCallNext({
      state: "called",
      entry_id: "e1",
      display_name: "Camille",
      called_at: "2026-08-20T10:00:00Z",
      waiting_count: 4,
    });
    expect(resultat.displayName).toBe("Camille");
    expect(resultat.waitingCount).toBe(4);
  });

  it("accepte l'absence de prénom — la file se rejoint sans rien donner de soi", () => {
    const resultat = mapQueueCallNext({
      state: "called",
      entry_id: "e1",
      display_name: null,
      called_at: "2026-08-20T10:00:00Z",
      waiting_count: 0,
    });
    expect(resultat.displayName).toBeNull();
    expect(resultat.state).toBe("called");
  });

  it("ne retient rien sur `empty` ni sur un document illisible", () => {
    expect(mapQueueCallNext({ state: "empty", display_name: "fuite" })).toEqual({
      state: "empty",
      entryId: null,
      displayName: null,
      calledAt: null,
      waitingCount: null,
    });
    expect(mapQueueCallNext(undefined).state).toBe("unknown");
  });
});

describe("mapQueueResolve", () => {
  it("rend l'issue et son horodatage", () => {
    expect(
      mapQueueResolve({
        state: "no_show",
        entry_id: "e1",
        resolved_at: "2026-08-20T10:00:00Z",
      }),
    ).toEqual({
      state: "no_show",
      entryId: "e1",
      resolvedAt: "2026-08-20T10:00:00Z",
    });
  });

  it("ne fabrique AUCUN horodatage sur `not_called` : rien n'a été tranché", () => {
    const resultat = mapQueueResolve({
      state: "not_called",
      entry_id: "e1",
      resolved_at: "2026-08-20T10:00:00Z",
    });
    expect(resultat.state).toBe("not_called");
    expect(resultat.resolvedAt).toBeNull();
  });
});

describe("mapQueueReopen", () => {
  it("rend le rang de la remise en tête — 1, par construction", () => {
    const resultat = mapQueueReopen({
      state: "waiting",
      entry_id: "e1",
      position: 1,
    });
    expect(resultat.position).toBe(1);
    expect(resultat.resolvedAt).toBeNull();
  });

  it("rend telle quelle une entrée terminale : on ne rouvre pas une absence constatée", () => {
    const resultat = mapQueueReopen({
      state: "no_show",
      entry_id: "e1",
      resolved_at: "2026-08-20T10:00:00Z",
    });
    expect(resultat.state).toBe("no_show");
    expect(resultat.position).toBeNull();
    expect(resultat.resolvedAt).toBe("2026-08-20T10:00:00Z");
  });
});

describe("mapQueuePublicState", () => {
  it("rend le rang, la taille de la file et l'appel sur le MÊME document", () => {
    // C'est ce qui permet à l'écran de basculer sans aller chercher ailleurs —
    // critère RES-3 « l'appel staff prime sur tout autre écran ».
    const resultat = mapQueuePublicState({
      state: "in_queue",
      queue_name: "Comptoir",
      queue_status: "open",
      entry_id: "e1",
      status: "called",
      position: null,
      waiting_count: 4,
      joined_at: "2026-08-20T09:00:00Z",
      called_at: "2026-08-20T10:00:00Z",
    });

    expect(resultat.entryStatus).toBe("called");
    expect(resultat.calledAt).toBe("2026-08-20T10:00:00Z");
    expect(resultat.position).toBeNull();
    expect(resultat.waitingCount).toBe(4);
  });

  it("garde le nom et la taille de la file quand on n'y est pas", () => {
    const resultat = mapQueuePublicState({
      state: "not_in_queue",
      queue_name: "Comptoir",
      queue_status: "paused",
      waiting_count: 2,
    });
    expect(resultat.queueName).toBe("Comptoir");
    expect(resultat.queueStatus).toBe("paused");
    expect(resultat.waitingCount).toBe(2);
    expect(resultat.entryId).toBeNull();
  });

  it("se replie sur `unavailable`, file muette et compte à zéro", () => {
    const resultat = mapQueuePublicState({ state: "nawak", queue_name: "X" });
    expect(resultat.state).toBe("unavailable");
    expect(resultat.queueName).toBeNull();
    expect(resultat.waitingCount).toBe(0);
  });

  it("ne porte AUCUNE clé de durée", () => {
    const cles = toutesLesCles(
      mapQueuePublicState({
        state: "in_queue",
        entry_id: "e1",
        position: 2,
        waiting_count: 5,
      }),
    );
    expect(cles.some((cle) => MOTS_DE_DELAI.test(cle))).toBe(false);
  });
});

describe("mapQueueStaffState", () => {
  const OK = {
    state: "ok",
    queue: {
      id: "f1",
      name: "Comptoir",
      status: "paused",
      max_live_entries: 20,
      activity_id: null,
      activity_name: null,
    },
    timezone: "Indian/Reunion",
    entries: [
      {
        entry_id: "e1",
        display_name: "Camille",
        status: "called",
        position: null,
        joined_at: "2026-08-20T09:00:00Z",
        called_at: "2026-08-20T10:00:00Z",
      },
      {
        entry_id: "e2",
        display_name: null,
        status: "waiting",
        position: 1,
        joined_at: "2026-08-20T09:05:00Z",
        called_at: null,
      },
    ],
    live: { waiting: 1, called: 1 },
    today: { served: 7, no_show: 2, left: 1 },
  };

  it("rend la file, ses entrées vivantes et les trois compteurs du jour", () => {
    const resultat = mapQueueStaffState(OK);

    expect(resultat.ok).toBe(true);
    expect(resultat.queue?.status).toBe("paused");
    expect(resultat.queue?.maxLiveEntries).toBe(20);
    expect(resultat.timezone).toBe("Indian/Reunion");
    expect(resultat.entries).toHaveLength(2);
    expect(resultat.entries[0].displayName).toBe("Camille");
    expect(resultat.entries[1].position).toBe(1);
    expect(resultat.today).toEqual({ served: 7, noShow: 2, left: 1 });
    expect(resultat.live).toEqual({ waiting: 1, called: 1 });
  });

  it("écarte une ligne sans identifiant ou sans heure d'inscription", () => {
    // Elle n'a ni geste possible ni place dans l'ordre : on l'écarte plutôt
    // que d'inventer une date pour la ranger quelque part.
    const resultat = mapQueueStaffState({
      ...OK,
      entries: [
        { display_name: "Sans id", status: "waiting", joined_at: "2026-08-20T09:00:00Z" },
        { entry_id: "e3", status: "waiting", joined_at: null },
        OK.entries[1],
      ],
    });
    expect(resultat.entries.map((e) => e.entryId)).toEqual(["e2"]);
  });

  it("rend un état FERMÉ sur `unknown`, sur un document illisible et sans file", () => {
    for (const brut of [
      { state: "unknown" },
      null,
      "ok",
      { state: "ok", queue: null },
      { state: "ok", queue: { name: "sans id" } },
    ]) {
      const resultat = mapQueueStaffState(brut);
      expect(resultat.ok).toBe(false);
      expect(resultat.queue).toBeNull();
      expect(resultat.entries).toEqual([]);
      expect(resultat.today).toEqual({ served: 0, noShow: 0, left: 0 });
    }
  });

  it("ne porte AUCUNE adresse — elle n'existe que pour un envoi serveur", () => {
    const resultat = mapQueueStaffState({
      ...OK,
      entries: [{ ...OK.entries[0], email: "fuite@exemple.fr" }],
    });
    const cles = toutesLesCles(resultat);
    expect(cles.some((cle) => /email/i.test(cle))).toBe(false);
  });

  it("ne porte AUCUNE clé de durée", () => {
    const cles = toutesLesCles(mapQueueStaffState(OK));
    expect(cles.some((cle) => MOTS_DE_DELAI.test(cle))).toBe(false);
  });
});

describe("statuts de file — le repli le plus fermé", () => {
  it("lit un statut de file inconnu comme `closed` : on n'ouvre pas sur un doute", () => {
    expect(asQueueStatus("open")).toBe("open");
    expect(asQueueStatus("paused")).toBe("paused");
    expect(asQueueStatus("ouverte")).toBe("closed");
    expect(asQueueStatus(null)).toBe("closed");
  });

  it("lit un statut d'entrée inconnu comme `waiting` : on ne crie pas un appel", () => {
    expect(asQueueEntryStatus("called")).toBe("called");
    expect(asQueueEntryStatus(42)).toBe("waiting");
  });
});

describe("états d'interface de la file", () => {
  it("teste `appele` EN PREMIER — l'appel prime sur tout autre écran", () => {
    expect(etatUiPlaceFile({ status: "called" })).toBe("appele");
    expect(etatUiPlaceFile({ status: "waiting" })).toBe("attente");
    expect(etatUiPlaceFile({ status: "served" })).toBe("servi");
    expect(etatUiPlaceFile({ status: "no_show" })).toBe("absent");
    expect(etatUiPlaceFile({ status: "left" })).toBe("parti");
  });

  it("distingue la pause de la fermeture", () => {
    expect(etatUiFile("open")).toBe("ouverte");
    expect(etatUiFile("paused")).toBe("en_pause");
    expect(etatUiFile("closed")).toBe("fermee");
  });

  it("refuse l'ENTRÉE en pause comme en fermeture — mais ce ne sont pas le même état", () => {
    // La pause refuse d'accueillir et continue de SERVIR : c'est pourquoi le
    // libellé les distingue là où l'entrée les confond.
    expect(fileAccepteEntree({ status: "open", activiteActive: true })).toBe(true);
    expect(fileAccepteEntree({ status: "paused", activiteActive: true })).toBe(
      false,
    );
    expect(fileAccepteEntree({ status: "closed", activiteActive: true })).toBe(
      false,
    );
  });

  it("referme la file quand son activité liée est coupée", () => {
    expect(fileAccepteEntree({ status: "open", activiteActive: false })).toBe(
      false,
    );
  });
});

describe("adresse publique d'une file", () => {
  it("ne porte NI jeton NI empreinte : c'est une adresse, pas une preuve", () => {
    expect(cheminFileReserver("f1")).toBe("/reserver/file/f1");
    expect(urlFileReserver("f1", "https://x.fr/")).toBe(
      "https://x.fr/reserver/file/f1",
    );
  });
});

describe("la phrase qui remplace le délai", () => {
  it("ne promet aucune durée, et le dit", () => {
    expect(LIBELLE_FILE_SANS_DELAI).not.toMatch(/\d+\s*(min|minute|heure)/i);
    expect(LIBELLE_FILE_SANS_DELAI).toMatch(/rang/i);
  });
});
