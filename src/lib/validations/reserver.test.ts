import { describe, expect, it } from "vitest";

import {
  cancelReservationSchema,
  checkinReservationSchema,
  claimWaitlistOfferSchema,
  createReserverActivitySchema,
  createReserverInvitationSchema,
  createReserverQueueSchema,
  createReserverSlotSchema,
  queueJoinSchema,
  queueResolveSchema,
  redeemInvitationSchema,
  reserveSlotSchema,
  updateReserverActivitySchema,
  updateReserverQueueSchema,
  updateReserverSlotSchema,
  updateReserverSlotStatusSchema,
  waitConsumeSpinSchema,
  waitlistJoinSchema,
  waitlistLeaveSchema,
  waitSessionOpenSchema,
  waitUsePauseSchema,
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

// ════════════════════════════════════════════════════════════
// Liste prioritaire et invitations (RES-2, lot L5)
// ════════════════════════════════════════════════════════════

describe("waitlistOfferMinutes — la fenêtre de tenue d'une place", () => {
  const BASE = {
    activityId: UUID,
    startsAt: "2026-09-01T14:00",
    endsAt: "2026-09-01T16:00",
    capacity: "4",
  };

  it("VIDE et NON RENDU valent tous deux `null` — le défaut du produit", () => {
    const vide = createReserverSlotSchema.safeParse({
      ...BASE,
      waitlistOfferMinutes: "",
    });
    const absent = createReserverSlotSchema.safeParse(BASE);
    expect(vide.success && vide.data.waitlistOfferMinutes).toBeNull();
    expect(absent.success && absent.data.waitlistOfferMinutes).toBeNull();
    // `null` (FormData.get d'un champ absent) doit dire la MÊME chose.
    const nul = createReserverSlotSchema.safeParse({
      ...BASE,
      waitlistOfferMinutes: null,
    });
    expect(nul.success && nul.data.waitlistOfferMinutes).toBeNull();
  });

  it("accepte les deux bornes du CHECK SQL, et refuse juste à côté", () => {
    for (const valeur of ["5", "1440"]) {
      expect(
        createReserverSlotSchema.safeParse({
          ...BASE,
          waitlistOfferMinutes: valeur,
        }).success,
      ).toBe(true);
    }
    for (const valeur of ["4", "1441", "0", "-10", "12.5", "abc"]) {
      expect(
        createReserverSlotSchema.safeParse({
          ...BASE,
          waitlistOfferMinutes: valeur,
        }).success,
      ).toBe(false);
    }
  });

  it("porte la même règle sur l'édition d'un créneau", () => {
    expect(
      updateReserverSlotSchema.safeParse({
        id: UUID,
        startsAt: "2026-09-01T14:00",
        endsAt: "2026-09-01T16:00",
        capacity: "4",
        waitlistOfferMinutes: "90",
      }).success,
    ).toBe(true);
  });
});

describe("waitlistJoinSchema — même règle que la réservation", () => {
  it("exige que l'adresse et le consentement voyagent ENSEMBLE", () => {
    expect(
      waitlistJoinSchema.safeParse({
        organizationId: UUID,
        slotId: AUTRE_UUID,
        email: "client@exemple.fr",
      }).success,
    ).toBe(false);
    expect(
      waitlistJoinSchema.safeParse({
        organizationId: UUID,
        slotId: AUTRE_UUID,
        consent: true,
      }).success,
    ).toBe(false);
    expect(
      waitlistJoinSchema.safeParse({
        organizationId: UUID,
        slotId: AUTRE_UUID,
      }).success,
    ).toBe(true);
  });
});

describe("les deux gestes de possession ne demandent QUE l'entrée", () => {
  it("prendre sa place et quitter la file n'exigent aucune organisation", () => {
    const prendre = claimWaitlistOfferSchema.safeParse({ entryId: UUID });
    const partir = waitlistLeaveSchema.safeParse({ entryId: UUID });
    expect(prendre.success).toBe(true);
    expect(partir.success).toBe(true);
    // Une organisation postée n'entrerait de toute façon pas dans le schéma :
    // le serveur la lit sur la ligne, sur preuve de possession.
    expect(
      Object.keys(prendre.success ? prendre.data : {}),
    ).toEqual(["entryId"]);
  });

  it("refuse un identifiant qui n'est pas un UUID", () => {
    expect(claimWaitlistOfferSchema.safeParse({ entryId: "abc" }).success).toBe(
      false,
    );
    expect(waitlistLeaveSchema.safeParse({ entryId: null }).success).toBe(false);
  });
});

describe("redeemInvitationSchema — la forme du jeton, jamais son contenu", () => {
  const JETON = "a".repeat(32);

  it("accepte un jeton base64url de 32 caractères, avec ou sans créneau", () => {
    expect(redeemInvitationSchema.safeParse({ token: JETON }).success).toBe(true);
    expect(
      redeemInvitationSchema.safeParse({ token: JETON, slotId: UUID }).success,
    ).toBe(true);
  });

  it("refuse tout ce qui n'a pas la forme du générateur", () => {
    for (const jeton of ["", "trop-court", "a".repeat(31), "a".repeat(33), `${"a".repeat(31)}+`]) {
      expect(redeemInvitationSchema.safeParse({ token: jeton }).success).toBe(
        false,
      );
    }
  });

  it("ne demande AUCUNE organisation : le jeton la désigne à lui seul", () => {
    const parsed = redeemInvitationSchema.safeParse({ token: JETON });
    expect(parsed.success && "organizationId" in parsed.data).toBe(false);
  });

  it("porte la même équivalence email ⇔ consentement que la réservation", () => {
    expect(
      redeemInvitationSchema.safeParse({
        token: JETON,
        email: "client@exemple.fr",
      }).success,
    ).toBe(false);
  });
});

describe("createReserverInvitationSchema — une cible, et une seule", () => {
  const BASE = { label: "Habitués du samedi", maxUses: "5" };

  it("accepte une activité SEULE ou un créneau SEUL", () => {
    expect(
      createReserverInvitationSchema.safeParse({ ...BASE, activityId: UUID })
        .success,
    ).toBe(true);
    expect(
      createReserverInvitationSchema.safeParse({ ...BASE, slotId: UUID }).success,
    ).toBe(true);
  });

  it("refuse LES DEUX comme AUCUNE — c'est un OU exclusif, comme le CHECK SQL", () => {
    expect(
      createReserverInvitationSchema.safeParse({
        ...BASE,
        activityId: UUID,
        slotId: AUTRE_UUID,
      }).success,
    ).toBe(false);
    expect(createReserverInvitationSchema.safeParse(BASE).success).toBe(false);
  });

  it("borne les usages entre 1 et 500, et refuse un champ non rendu", () => {
    for (const valeur of ["1", "500"]) {
      expect(
        createReserverInvitationSchema.safeParse({
          ...BASE,
          maxUses: valeur,
          activityId: UUID,
        }).success,
      ).toBe(true);
    }
    for (const valeur of ["0", "501", null]) {
      expect(
        createReserverInvitationSchema.safeParse({
          ...BASE,
          maxUses: valeur,
          activityId: UUID,
        }).success,
      ).toBe(false);
    }
  });

  it("borne le libellé à 120 caractères, comme le CHECK SQL", () => {
    expect(
      createReserverInvitationSchema.safeParse({
        ...BASE,
        label: "x".repeat(121),
        activityId: UUID,
      }).success,
    ).toBe(false);
    expect(
      createReserverInvitationSchema.safeParse({
        ...BASE,
        label: "   ",
        activityId: UUID,
      }).success,
    ).toBe(false);
  });

  it("n'exige AUCUNE expiration, et refuse une date illisible", () => {
    expect(
      createReserverInvitationSchema.safeParse({ ...BASE, activityId: UUID })
        .success,
    ).toBe(true);
    expect(
      createReserverInvitationSchema.safeParse({
        ...BASE,
        activityId: UUID,
        expiresAt: "pas une date",
      }).success,
    ).toBe(false);
    expect(
      createReserverInvitationSchema.safeParse({
        ...BASE,
        activityId: UUID,
        expiresAt: "2026-09-01T14:00",
      }).success,
    ).toBe(true);
  });

  it("NE PORTE AUCUN CHAMP DE JETON : il est tiré par le serveur, jamais posté", () => {
    const parsed = createReserverInvitationSchema.safeParse({
      ...BASE,
      activityId: UUID,
    });
    expect(parsed.success && "token" in parsed.data).toBe(false);
    expect(parsed.success && "tokenHash" in parsed.data).toBe(false);
  });
});

describe("queueJoinSchema — le prénom se tronque, l'adresse se consent", () => {
  it("accepte une entrée en file SANS rien donner de soi", () => {
    const parsed = queueJoinSchema.safeParse({ queueId: UUID });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.displayName).toBeUndefined();
      expect(parsed.data.email).toBeUndefined();
      expect(parsed.data.consent).toBe(false);
    }
  });

  it("NE PORTE AUCUNE ORGANISATION : elle se lit sur la file, côté serveur", () => {
    const parsed = queueJoinSchema.safeParse({
      queueId: UUID,
      organizationId: AUTRE_UUID,
    });
    expect(parsed.success && "organizationId" in parsed.data).toBe(false);
  });

  it("TRONQUE le prénom à 40 caractères au lieu de refuser l'entrée", () => {
    // Refuser l'entrée en file d'une personne debout dans le magasin parce que
    // son prénom fait 41 caractères ferait payer à la file ce qui ne la regarde
    // pas. `queue_join` tronque aussi — un seul juge, deux fois d'accord.
    const parsed = queueJoinSchema.safeParse({
      queueId: UUID,
      displayName: `  ${"a".repeat(60)}  `,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.displayName).toBe("a".repeat(40));
  });

  it("refuse un prénom d'une longueur qui n'est plus un prénom", () => {
    // Borne de DÉFENSE, pas borne métier : on ne rogne pas une chaîne non
    // bornée choisie par l'appelant.
    const parsed = queueJoinSchema.safeParse({
      queueId: UUID,
      displayName: "a".repeat(5000),
    });
    expect(parsed.success).toBe(false);
  });

  it("exige l'adresse et le consentement ENSEMBLE, ou aucun des deux", () => {
    expect(
      queueJoinSchema.safeParse({
        queueId: UUID,
        email: "client@exemple.fr",
        consent: false,
      }).success,
    ).toBe(false);
    expect(
      queueJoinSchema.safeParse({ queueId: UUID, consent: true }).success,
    ).toBe(false);
    expect(
      queueJoinSchema.safeParse({
        queueId: UUID,
        email: "  Client@Exemple.FR ",
        consent: true,
      }).success,
    ).toBe(true);
  });

  it("normalise l'adresse — deux orthographes de la même boîte, un seul seau", () => {
    const parsed = queueJoinSchema.safeParse({
      queueId: UUID,
      email: "  Client@Exemple.FR ",
      consent: true,
    });
    expect(parsed.success && parsed.data.email).toBe("client@exemple.fr");
  });
});

describe("queueResolveSchema — un vocabulaire de deux mots", () => {
  it("accepte les deux issues que le comptoir peut CONSTATER", () => {
    expect(
      queueResolveSchema.safeParse({ entryId: UUID, outcome: "served" }).success,
    ).toBe(true);
    expect(
      queueResolveSchema.safeParse({ entryId: UUID, outcome: "no_show" }).success,
    ).toBe(true);
  });

  it("refuse `left` : partir est un geste du JOUEUR, pas un constat du staff", () => {
    expect(
      queueResolveSchema.safeParse({ entryId: UUID, outcome: "left" }).success,
    ).toBe(false);
    expect(
      queueResolveSchema.safeParse({ entryId: UUID, outcome: "waiting" }).success,
    ).toBe(false);
  });
});

describe("créer et régler une file d'accueil", () => {
  it("accepte une file SANS activité — c'est le cas dominant du modèle", () => {
    const parsed = createReserverQueueSchema.safeParse({
      name: "Comptoir",
      activityId: "",
      maxLiveEntries: "50",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.activityId).toBe("");
      // Une file se configure d'un nom et d'un plafond : elle naît OUVERTE, à
      // l'inverse d'un créneau, dont les heures se relisent avant l'ouverture.
      expect(parsed.data.status).toBe("open");
    }
  });

  it("lit le champ NON RENDU comme « aucune activité », pas comme un UUID invalide", () => {
    const parsed = createReserverQueueSchema.safeParse({
      name: "Comptoir",
      activityId: null,
      maxLiveEntries: "50",
      status: null,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.activityId).toBe("");
    expect(parsed.success && parsed.data.status).toBe("open");
  });

  it("borne le nom et le plafond exactement comme les CHECK SQL", () => {
    expect(
      createReserverQueueSchema.safeParse({
        name: "a".repeat(81),
        maxLiveEntries: "50",
      }).success,
    ).toBe(false);
    expect(
      createReserverQueueSchema.safeParse({ name: "", maxLiveEntries: "50" })
        .success,
    ).toBe(false);
    expect(
      createReserverQueueSchema.safeParse({ name: "Comptoir", maxLiveEntries: "0" })
        .success,
    ).toBe(false);
    expect(
      createReserverQueueSchema.safeParse({
        name: "Comptoir",
        maxLiveEntries: "201",
      }).success,
    ).toBe(false);
    expect(
      createReserverQueueSchema.safeParse({
        name: "Comptoir",
        maxLiveEntries: "200",
      }).success,
    ).toBe(true);
  });

  it("REFUSE un plafond non rendu plutôt que de le lire zéro", () => {
    // Le mode silencieux que `entierRequis` ferme : `Number(null)` vaut 0, et
    // une file à zéro place n'est pas une file fermée.
    expect(
      createReserverQueueSchema.safeParse({ name: "Comptoir", maxLiveEntries: null })
        .success,
    ).toBe(false);
  });

  it("accepte les trois statuts au réglage — `paused` n'est pas `closed`", () => {
    for (const status of ["open", "paused", "closed"]) {
      expect(
        updateReserverQueueSchema.safeParse({
          queueId: UUID,
          name: "Comptoir",
          activityId: "",
          maxLiveEntries: "20",
          status,
        }).success,
      ).toBe(true);
    }
    expect(
      updateReserverQueueSchema.safeParse({
        queueId: UUID,
        name: "Comptoir",
        activityId: "",
        maxLiveEntries: "20",
        status: "archived",
      }).success,
    ).toBe(false);
  });

  it("NE PORTE AUCUN CHAMP DE SUPPRESSION : rien ne s'efface dans ce module", () => {
    const parsed = updateReserverQueueSchema.safeParse({
      queueId: UUID,
      name: "Comptoir",
      activityId: "",
      maxLiveEntries: "20",
      status: "closed",
    });
    expect(parsed.success && "delete" in parsed.data).toBe(false);
    expect(parsed.success && "supprimer" in parsed.data).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// LE MODE ATTENTE ACTIVE (RES-4) — les deux colonnes de config, les trois gestes
// ════════════════════════════════════════════════════════════

describe("les deux colonnes d'animation, sur les DEUX porteurs", () => {
  // La configuration vit sur `reservation_queues` ET sur
  // `reservation_activities` : on attend DEBOUT dans une file, ou AVEC un
  // créneau pour une activité. Un seul des deux schémas aurait laissé une des
  // deux formes d'attente sans animation configurable.
  const porteurs = [
    {
      nom: "file (création)",
      schema: createReserverQueueSchema,
      base: { name: "Comptoir", activityId: "", maxLiveEntries: "20" },
    },
    {
      nom: "file (réglages)",
      schema: updateReserverQueueSchema,
      base: {
        queueId: UUID,
        name: "Comptoir",
        activityId: "",
        maxLiveEntries: "20",
        status: "open",
      },
    },
    {
      nom: "activité (création)",
      schema: createReserverActivitySchema,
      base: { name: "Dégustation", description: "" },
    },
    {
      nom: "activité (réglages)",
      schema: updateReserverActivitySchema,
      base: { id: UUID, name: "Dégustation", description: "", active: "true" },
    },
  ];

  it.each(porteurs)(
    "$nom : les deux champs ABSENTS valent « aucune animation »",
    ({ schema, base }) => {
      // Le Mode Attente active est FACULTATIF : un panneau qui n'affiche pas le
      // réglage ne demande pas de le changer.
      const parsed = schema.safeParse(base);
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.waitQuizId).toBe("");
      expect(parsed.success && parsed.data.waitPauseCampaignId).toBe("");
    },
  );

  it.each(porteurs)("$nom : accepte deux UUID", ({ schema, base }) => {
    const parsed = schema.safeParse({
      ...base,
      waitQuizId: UUID,
      waitPauseCampaignId: AUTRE_UUID,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.waitQuizId).toBe(UUID);
    expect(parsed.success && parsed.data.waitPauseCampaignId).toBe(AUTRE_UUID);
  });

  it.each(porteurs)(
    "$nom : `\"\"` DÉCROCHE l'animation, et n'est pas un UUID invalide",
    ({ schema, base }) => {
      // Un `<select>` remis sur « Aucune » poste la chaîne vide : la lire comme
      // un UUID invalide donnerait au commerçant un message hors sujet.
      const parsed = schema.safeParse({
        ...base,
        waitQuizId: "",
        waitPauseCampaignId: "",
      });
      expect(parsed.success).toBe(true);
    },
  );

  it.each(porteurs)("$nom : refuse une valeur qui n'est ni vide ni un UUID", ({
    schema,
    base,
  }) => {
    expect(schema.safeParse({ ...base, waitQuizId: "quiz-1" }).success).toBe(
      false,
    );
  });
});

describe("waitSessionOpenSchema — EXACTEMENT une source", () => {
  it("accepte une entrée de file SEULE, ou une réservation SEULE", () => {
    expect(waitSessionOpenSchema.safeParse({ queueEntryId: UUID }).success).toBe(
      true,
    );
    expect(
      waitSessionOpenSchema.safeParse({ reservationId: UUID }).success,
    ).toBe(true);
  });

  it("refuse ZÉRO source, et refuse les DEUX", () => {
    // Miroir du `num_nonnulls(…) = 1` de la table : une session qui pointerait
    // les deux n'aurait aucune configuration parente déterminée.
    expect(waitSessionOpenSchema.safeParse({}).success).toBe(false);
    expect(
      waitSessionOpenSchema.safeParse({
        queueEntryId: UUID,
        reservationId: AUTRE_UUID,
      }).success,
    ).toBe(false);
  });

  it("NE PORTE AUCUNE ORGANISATION : le serveur la résout depuis la source", () => {
    const parsed = waitSessionOpenSchema.safeParse({
      queueEntryId: UUID,
      organizationId: AUTRE_UUID,
    });
    expect(parsed.success && "organizationId" in parsed.data).toBe(false);
  });
});

describe("waitUsePauseSchema / waitConsumeSpinSchema", () => {
  it("la Pause ne prend QUE la session — jamais la campagne à jouer", () => {
    // Un `campaignId` posté aurait laissé le navigateur choisir sur quelle
    // campagne il joue son tour offert : la cible vient du PARENT.
    const parsed = waitUsePauseSchema.safeParse({
      sessionId: UUID,
      campaignId: AUTRE_UUID,
      organizationId: AUTRE_UUID,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "campaignId" in parsed.data).toBe(false);
    expect(parsed.success && "organizationId" in parsed.data).toBe(false);
  });

  it("le jeton d'octroi a la forme du CHECK SQL — 48 hexadécimaux", () => {
    expect(
      waitConsumeSpinSchema.safeParse({
        sessionId: UUID,
        grantToken: "a".repeat(48),
      }).success,
    ).toBe(true);
    expect(
      waitConsumeSpinSchema.safeParse({
        sessionId: UUID,
        grantToken: "a".repeat(47),
      }).success,
    ).toBe(false);
    expect(
      waitConsumeSpinSchema.safeParse({
        sessionId: UUID,
        grantToken: "Z".repeat(48),
      }).success,
    ).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// LES EXPÉRIENCES SIGNATURE (RES-5, lot L8) — migration 20261007120000
//
// Les schémas ne DÉCIDENT rien : la base porte les cinq CHECK et les deux
// contraintes conditionnelles. Ce qui est vérifié ici, c'est qu'un refus arrive
// AVANT l'aller-retour, avec un message que le commerçant comprend.
// ════════════════════════════════════════════════════════════

/** Le minimum qu'un formulaire d'activité poste toujours. */
const ACTIVITE_BASE = {
  name: "Atelier",
  description: "",
  waitQuizId: "",
  waitPauseCampaignId: "",
};

describe("reserveSlotSchema — la taille de la réservation (RES-5)", () => {
  it("vaut 1 quand l'écran ne dit rien : c'est le parcours d'hier", () => {
    const parsed = reserveSlotSchema.safeParse({
      organizationId: UUID,
      slotId: AUTRE_UUID,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.partySize).toBe(1);
  });

  it("accepte 2 — ce que la SURFACE DUO envoie", () => {
    const parsed = reserveSlotSchema.safeParse({
      organizationId: UUID,
      slotId: AUTRE_UUID,
      partySize: 2,
    });
    expect(parsed.success && parsed.data.partySize).toBe(2);
  });

  it("refuse hors de 1..2 et refuse les décimales — garde de FORME", () => {
    // Au-delà, c'est un bogue d'appelant : la contrainte de table refuserait
    // de toute façon la ligne, mais avec une erreur illisible.
    for (const partySize of [0, 3, 40, 1.5]) {
      expect(
        reserveSlotSchema.safeParse({
          organizationId: UUID,
          slotId: AUTRE_UUID,
          partySize,
        }).success,
      ).toBe(false);
    }
  });
});

describe("createReserverActivitySchema — les cinq champs d'expérience", () => {
  it("reste `standard` quand le panneau ne rend aucun des cinq champs", () => {
    const parsed = createReserverActivitySchema.safeParse(ACTIVITE_BASE);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.kind).toBe("standard");
    expect(parsed.data.durationMinutes).toBeNull();
    expect(parsed.data.steps).toEqual([]);
    expect(parsed.data.promise).toBe("");
    expect(parsed.data.preparation).toBe("");
  });

  it("EXIGE la durée des deux formats nouveaux, jamais du standard", () => {
    // « 20-45 min » est une promesse faite au joueur AVANT qu'il réserve : une
    // page immersive sans durée lui demande de s'engager sur une inconnue.
    const sansDuree = createReserverActivitySchema.safeParse({
      ...ACTIVITE_BASE,
      kind: "duo",
    });
    expect(sansDuree.success).toBe(false);
    expect(sansDuree.success === false && sansDuree.error.issues[0].path).toEqual(
      ["durationMinutes"],
    );

    expect(
      createReserverActivitySchema.safeParse({
        ...ACTIVITE_BASE,
        kind: "duo",
        durationMinutes: "120",
      }).success,
    ).toBe(true);
  });

  it("EXIGE une à trois étapes de la SEULE signature", () => {
    // C'est SA définition — « présentée en trois étapes ». Le Duo, lui, dit sa
    // préparation en prose.
    const sansEtapes = createReserverActivitySchema.safeParse({
      ...ACTIVITE_BASE,
      kind: "signature",
      durationMinutes: "30",
    });
    expect(sansEtapes.success).toBe(false);
    expect(
      sansEtapes.success === false && sansEtapes.error.issues[0].path,
    ).toEqual(["steps"]);

    const avecUne = createReserverActivitySchema.safeParse({
      ...ACTIVITE_BASE,
      kind: "signature",
      durationMinutes: "30",
      steps: [
        { title: "Accueil", body: "On vous installe." },
        { title: null, body: null },
        { title: "", body: "" },
      ],
    });
    expect(avecUne.success).toBe(true);
    expect(avecUne.success && avecUne.data.steps).toEqual([
      { title: "Accueil", body: "On vous installe." },
    ]);
  });

  it("refuse une paire À MOITIÉ remplie — une saisie interrompue", () => {
    // La paire ENTIÈREMENT vide se retire (un Signature en deux étapes en laisse
    // une vide) ; la moitié, elle, est une erreur qu'on nomme.
    const parsed = createReserverActivitySchema.safeParse({
      ...ACTIVITE_BASE,
      kind: "signature",
      durationMinutes: "30",
      steps: [{ title: "Accueil", body: "" }],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0].message).toBe(
      "Décrivez cette étape",
    );
  });

  it("refuse une quatrième carte : la page n'en montre que trois", () => {
    const parsed = createReserverActivitySchema.safeParse({
      ...ACTIVITE_BASE,
      kind: "signature",
      durationMinutes: "30",
      steps: [1, 2, 3, 4].map((n) => ({ title: `Étape ${n}`, body: "Corps." })),
    });
    expect(parsed.success).toBe(false);
  });

  it("borne les quatre textes exactement comme les CHECK SQL", () => {
    const trop = (champs: Record<string, unknown>) =>
      createReserverActivitySchema.safeParse({ ...ACTIVITE_BASE, ...champs })
        .success;

    expect(trop({ promise: "p".repeat(200) })).toBe(true);
    expect(trop({ promise: "p".repeat(201) })).toBe(false);
    expect(trop({ preparation: "p".repeat(600) })).toBe(true);
    expect(trop({ preparation: "p".repeat(601) })).toBe(false);
    expect(
      trop({
        kind: "signature",
        durationMinutes: "30",
        steps: [{ title: "t".repeat(81), body: "Corps." }],
      }),
    ).toBe(false);
    expect(
      trop({
        kind: "signature",
        durationMinutes: "30",
        steps: [{ title: "Titre", body: "b".repeat(401) }],
      }),
    ).toBe(false);
  });

  it("borne la durée à 10..240 minutes, entiers seulement", () => {
    // La borne haute est la journée de travail d'un commerce ; la basse écarte
    // la saisie accidentelle. « 20 à 45 » reste une recommandation de format —
    // la borner ici interdirait l'Atelier Duo de deux heures.
    const duree = (valeur: string) =>
      createReserverActivitySchema.safeParse({
        ...ACTIVITE_BASE,
        kind: "duo",
        durationMinutes: valeur,
      }).success;

    expect(duree("10")).toBe(true);
    expect(duree("240")).toBe(true);
    expect(duree("9")).toBe(false);
    expect(duree("241")).toBe(false);
    expect(duree("30.5")).toBe(false);
    expect(duree("bientôt")).toBe(false);
  });

  it("refuse un format hors du vocabulaire fermé", () => {
    expect(
      createReserverActivitySchema.safeParse({
        ...ACTIVITE_BASE,
        kind: "atelier",
      }).success,
    ).toBe(false);
  });
});

describe("updateReserverActivitySchema — les mêmes règles, plus l'interrupteur", () => {
  it("porte les cinq champs et garde `active`", () => {
    const parsed = updateReserverActivitySchema.safeParse({
      ...ACTIVITE_BASE,
      id: UUID,
      active: "true",
      kind: "duo",
      promise: "Deux heures à deux.",
      durationMinutes: "120",
      preparation: "Venez avec un tablier.",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.kind).toBe("duo");
    expect(parsed.data.durationMinutes).toBe(120);
    expect(parsed.data.active).toBe(true);
    expect(parsed.data.preparation).toBe("Venez avec un tablier.");
  });

  it("applique les DEUX règles conditionnelles à la mise à jour aussi", () => {
    expect(
      updateReserverActivitySchema.safeParse({
        ...ACTIVITE_BASE,
        id: UUID,
        active: "true",
        kind: "signature",
        durationMinutes: "",
      }).success,
    ).toBe(false);
  });
});
