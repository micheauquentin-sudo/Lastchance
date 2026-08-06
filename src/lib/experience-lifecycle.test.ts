import { describe, expect, it } from "vitest";

import {
  construireEtapesAventure,
  estClotureeAventure,
  etatAventure,
  type CapacitesAventure,
  type EntreeAventure,
  type EtapeAventure,
  type MarqueursAventure,
} from "./experience-lifecycle";

const MAINTENANT = new Date("2026-08-06T12:00:00Z");
const HIER = "2026-08-05T12:00:00Z";
const DEMAIN = "2026-08-07T12:00:00Z";

const TOUT_PERMIS: CapacitesAventure = {
  canEditDraft: true,
  canPublish: true,
  message: null,
};

function carte(
  marqueurs: MarqueursAventure,
  capacites: CapacitesAventure = TOUT_PERMIS,
  liens?: EntreeAventure["liens"],
): EtapeAventure[] {
  return construireEtapesAventure({
    marqueurs,
    capacites,
    liens,
    maintenant: MAINTENANT,
  });
}

function etat(marqueurs: MarqueursAventure) {
  return etatAventure(marqueurs, MAINTENANT);
}

describe("etatAventure — chaque module a sa propre clôture", () => {
  it("campagne : délègue la fenêtre à campaign-window", () => {
    const base = { kind: "campaign" as const, starts_at: null, ends_at: null };
    expect(etat({ ...base, status: "draft" })).toBe("brouillon");
    expect(etat({ ...base, status: "active" })).toBe("en_cours");
    expect(etat({ ...base, status: "archived" })).toBe("cloturee");
    // Publiée mais injouable : programmée ou en pause, même lecture joueur.
    expect(etat({ ...base, status: "active", starts_at: DEMAIN })).toBe("prete");
    expect(etat({ ...base, status: "paused" })).toBe("prete");
    expect(etat({ ...base, status: "active", ends_at: HIER })).toBe("cloturee");
    // Dates incohérentes : « pas encore commencé » l'emporte, comme sur /play.
    expect(
      etat({ ...base, status: "active", starts_at: DEMAIN, ends_at: HIER }),
    ).toBe("prete");
  });

  it("chasse : fenêtre propre, écrite hors de campaign-window", () => {
    const base = { kind: "hunt" as const, starts_at: null, ends_at: null };
    expect(etat({ ...base, status: "draft" })).toBe("brouillon");
    expect(etat({ ...base, status: "active" })).toBe("en_cours");
    expect(etat({ ...base, status: "active", ends_at: HIER })).toBe("cloturee");
    expect(etat({ ...base, status: "active", starts_at: DEMAIN })).toBe("prete");
    expect(etat({ ...base, status: "archived", ends_at: DEMAIN })).toBe("cloturee");
  });

  it("calendrier : la fin se déduit de start_date + day_count, faute d'ends_at", () => {
    const base = { kind: "calendar" as const, status: "active" as const };
    // 24 cases à partir du 1er décembre 2025 : terminé depuis longtemps.
    expect(etat({ ...base, start_date: "2025-12-01", day_count: 24 })).toBe(
      "cloturee",
    );
    // Commencé hier, 10 cases : encore en cours.
    expect(etat({ ...base, start_date: "2026-08-05", day_count: 10 })).toBe(
      "en_cours",
    );
    // La dernière case reste ouverte toute sa journée.
    expect(etat({ ...base, start_date: "2026-08-05", day_count: 2 })).toBe(
      "en_cours",
    );
    expect(etat({ ...base, start_date: "2026-08-04", day_count: 2 })).toBe(
      "cloturee",
    );
    expect(etat({ ...base, start_date: "2026-09-01", day_count: 24 })).toBe(
      "prete",
    );
    // Date illisible : aucune fin connue, donc aucune clôture par accident.
    expect(etat({ ...base, start_date: null, day_count: 24 })).toBe("en_cours");
    expect(etat({ ...base, start_date: "2025-12-01", day_count: 0 })).toBe(
      "en_cours",
    );
    expect(
      etat({ kind: "calendar", status: "draft", start_date: null, day_count: 24 }),
    ).toBe("brouillon");
  });

  it("quiz : le tirage clôt, même si le quiz est resté actif", () => {
    const base = { kind: "quiz" as const, draw_state: "pending" as const, drawn_at: null };
    expect(etat({ ...base, status: "draft" })).toBe("brouillon");
    expect(etat({ ...base, status: "active" })).toBe("en_cours");
    expect(etat({ ...base, status: "active", draw_state: "done" })).toBe("cloturee");
    expect(etat({ ...base, status: "active", drawn_at: HIER })).toBe("cloturee");
    expect(etat({ ...base, status: "archived" })).toBe("cloturee");
  });

  it("jackpot : seul date_draw a une fin ; un cycle avancé ne clôt rien", () => {
    const base = {
      kind: "jackpot" as const,
      draw_mode: "threshold_draw" as const,
      draw_at: null,
      cycle: 1,
    };
    expect(etat({ ...base, status: "draft" })).toBe("brouillon");
    expect(etat({ ...base, status: "active" })).toBe("en_cours");
    // Trois cycles déjà tirés : le jackpot repart, il n'est pas terminé.
    expect(etat({ ...base, status: "active", cycle: 4 })).toBe("en_cours");
    expect(
      etat({ ...base, status: "active", draw_mode: "date_draw", draw_at: HIER }),
    ).toBe("cloturee");
    expect(
      etat({ ...base, status: "active", draw_mode: "date_draw", draw_at: DEMAIN }),
    ).toBe("en_cours");
    // Une date de tirage sur un mode qui n'en tient pas compte ne clôt pas.
    expect(etat({ ...base, status: "active", draw_at: HIER })).toBe("en_cours");
    expect(etat({ ...base, status: "archived" })).toBe("cloturee");
  });

  it("fidélité : aucune borne temporelle, l'archivage seul clôt", () => {
    expect(etat({ kind: "loyalty", status: "draft" })).toBe("brouillon");
    expect(etat({ kind: "loyalty", status: "active" })).toBe("en_cours");
    expect(etat({ kind: "loyalty", status: "archived" })).toBe("cloturee");
  });

  it("événement : une session en lobby sur un jeu brouillon = répétition", () => {
    expect(etat({ kind: "event", status: "draft", sessions: [] })).toBe("brouillon");
    expect(
      etat({ kind: "event", status: "draft", sessions: [{ status: "draft" }] }),
    ).toBe("brouillon");
    expect(
      etat({ kind: "event", status: "draft", sessions: [{ status: "lobby" }] }),
    ).toBe("repetition");
    expect(
      etat({ kind: "event", status: "draft", sessions: [{ status: "live" }] }),
    ).toBe("repetition");
    expect(etat({ kind: "event", status: "active", sessions: [] })).toBe("en_cours");
    expect(
      etat({
        kind: "event",
        status: "active",
        sessions: [{ status: "ended" }, { status: "archived" }],
      }),
    ).toBe("cloturee");
    // Une session finie sur deux : la soirée n'est pas terminée.
    expect(
      etat({
        kind: "event",
        status: "active",
        sessions: [{ status: "ended" }, { status: "live" }],
      }),
    ).toBe("en_cours");
    expect(etat({ kind: "event", status: "archived", sessions: [] })).toBe("cloturee");
  });

  it("pronostics : finished ou finalized_at", () => {
    expect(etat({ kind: "pronostics", status: "draft", finalized_at: null })).toBe(
      "brouillon",
    );
    expect(etat({ kind: "pronostics", status: "active", finalized_at: null })).toBe(
      "en_cours",
    );
    expect(etat({ kind: "pronostics", status: "finished", finalized_at: null })).toBe(
      "cloturee",
    );
    expect(etat({ kind: "pronostics", status: "active", finalized_at: HIER })).toBe(
      "cloturee",
    );
  });

  it("estClotureeAventure suit etatAventure", () => {
    expect(
      estClotureeAventure({ kind: "loyalty", status: "archived" }, MAINTENANT),
    ).toBe(true);
    expect(
      estClotureeAventure({ kind: "loyalty", status: "active" }, MAINTENANT),
    ).toBe(false);
  });
});

describe("construireEtapesAventure — cinq étapes, dans l'ordre", () => {
  const BROUILLON: MarqueursAventure = { kind: "loyalty", status: "draft" };

  it("rend toujours exactement les cinq phases du cahier", () => {
    for (const marqueurs of [
      BROUILLON,
      { kind: "loyalty", status: "active" } as const,
      { kind: "loyalty", status: "archived" } as const,
    ]) {
      expect(carte(marqueurs).map((e) => e.key)).toEqual([
        "idee",
        "brouillon",
        "repetition",
        "en_cours",
        "cloturee",
      ]);
    }
  });

  it("l'idée est acquise dès que la ressource existe", () => {
    expect(carte(BROUILLON)[0].status).toBe("complete");
    expect(carte({ kind: "loyalty", status: "archived" })[0].status).toBe("complete");
  });

  it("brouillon : current tant que draft, complete dès la publication", () => {
    expect(carte(BROUILLON)[1].status).toBe("current");
    expect(carte({ kind: "loyalty", status: "active" })[1].status).toBe("complete");
    expect(carte({ kind: "loyalty", status: "archived" })[1].status).toBe("complete");
  });

  it("répétition : current sur un brouillon publiable, complete une fois publié", () => {
    expect(carte(BROUILLON)[2].status).toBe("current");
    expect(carte(BROUILLON)[2].description).toContain("Testez");
    expect(carte({ kind: "loyalty", status: "active" })[2].status).toBe("complete");
    expect(carte({ kind: "loyalty", status: "archived" })[2].status).toBe("complete");
    // Publiée mais pas encore ouverte : la répétition est bien derrière nous.
    expect(
      carte({ kind: "hunt", status: "active", starts_at: DEMAIN, ends_at: null })[2]
        .status,
    ).toBe("complete");
  });

  it("en cours et clôturée avancent ensemble", () => {
    const enCours = carte({ kind: "loyalty", status: "active" });
    expect(enCours[3].status).toBe("current");
    expect(enCours[4].status).toBe("upcoming");

    const finie = carte({ kind: "loyalty", status: "archived" });
    expect(finie[3].status).toBe("complete");
    expect(finie[4].status).toBe("current");

    const brouillon = carte(BROUILLON);
    expect(brouillon[3].status).toBe("upcoming");
    expect(brouillon[4].status).toBe("upcoming");
  });

  it("la répétition d'un événement laisse le brouillon ouvert", () => {
    const etapes = carte({
      kind: "event",
      status: "draft",
      sessions: [{ status: "lobby" }],
    });
    expect(etapes[1].status).toBe("current");
    expect(etapes[2].status).toBe("current");
    expect(etapes[3].status).toBe("upcoming");
  });
});

describe("construireEtapesAventure — capacités et liens", () => {
  const BROUILLON: MarqueursAventure = { kind: "quiz", status: "draft", draw_state: "pending", drawn_at: null };

  it("sans canEditDraft : le brouillon est bloqué et porte la raison", () => {
    const etapes = carte(BROUILLON, {
      canEditDraft: false,
      canPublish: false,
      message: "Votre brouillon d'essai est déjà utilisé.",
    });
    expect(etapes[1].status).toBe("blocked");
    expect(etapes[1].blockedReason).toBe("Votre brouillon d'essai est déjà utilisé.");
  });

  it("sans canPublish : la répétition est bloquée, le brouillon reste ouvert", () => {
    const etapes = carte(BROUILLON, {
      canEditDraft: true,
      canPublish: false,
      message: "Demandez au propriétaire d'ouvrir ce module.",
    });
    expect(etapes[1].status).toBe("current");
    expect(etapes[2].status).toBe("blocked");
    expect(etapes[2].blockedReason).toBe("Demandez au propriétaire d'ouvrir ce module.");
  });

  it("un blocage sans message reçoit une phrase de repli", () => {
    const etapes = carte(BROUILLON, {
      canEditDraft: true,
      canPublish: false,
      message: null,
    });
    expect(etapes[2].blockedReason).toBeTruthy();
  });

  it("JAMAIS de href sur une étape bloquée", () => {
    const liens = {
      editeur: "/dashboard/quiz/1",
      apercu: "/dashboard/quiz/1/apercu",
      suivi: "/dashboard/quiz/1/resultats",
    };
    const etapes = carte(
      BROUILLON,
      { canEditDraft: false, canPublish: false, message: "non" },
      liens,
    );
    for (const etape of etapes) {
      if (etape.status === "blocked") expect(etape.href).toBeUndefined();
    }
    expect(etapes.filter((e) => e.status === "blocked")).toHaveLength(2);
  });

  it("un lien null (refusé par lienSelonRole) ne produit jamais de href", () => {
    const etapes = carte(BROUILLON, TOUT_PERMIS, {
      editeur: null,
      apercu: null,
      suivi: null,
    });
    expect(etapes.every((etape) => etape.href === undefined)).toBe(true);
  });

  it("les liens fournis atterrissent sur les étapes atteignables", () => {
    const etapes = carte(
      { kind: "quiz", status: "active", draw_state: "done", drawn_at: "2026-08-01T00:00:00Z" },
      TOUT_PERMIS,
      { editeur: "/e", apercu: "/a", suivi: "/s" },
    );
    expect(etapes[1].href).toBe("/e");
    expect(etapes[2].href).toBe("/a");
    expect(etapes[3].href).toBe("/s");
    expect(etapes[4].href).toBe("/s");
    // Une étape à venir n'ouvre rien : pas de lien sur ce qui n'a pas commencé.
    expect(carte(BROUILLON, TOUT_PERMIS, { suivi: "/s" })[3].href).toBeUndefined();
  });
});
