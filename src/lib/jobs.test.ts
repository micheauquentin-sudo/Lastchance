// @vitest-environment node
import { describe, expect, it } from "vitest";
import { backoffMinutes, settleJob } from "./jobs";

describe("backoffMinutes — délais entre tentatives", () => {
  it("progresse 1, 5, 15, 60 minutes puis plafonne", () => {
    expect(backoffMinutes(1)).toBe(1);
    expect(backoffMinutes(2)).toBe(5);
    expect(backoffMinutes(3)).toBe(15);
    expect(backoffMinutes(4)).toBe(60);
    expect(backoffMinutes(5)).toBe(60);
    expect(backoffMinutes(12)).toBe(60);
  });

  it("tolère un compteur incohérent (0, négatif)", () => {
    expect(backoffMinutes(0)).toBe(1);
    expect(backoffMinutes(-3)).toBe(1);
  });
});

/* ════════════════════════════════════════════════════════════
 * settleJob — LE REPORT DATÉ NE COÛTE PAS UNE TENTATIVE
 *
 * `claim_jobs` incrémente `attempts` au moment de la réclamation : la valeur
 * que le worker lit inclut déjà la tentative en cours. Un report de fenêtre
 * doit la RENDRE, sans quoi un travail simplement prématuré consomme le budget
 * réservé aux pannes — 81 minutes d'horizon face à 10 h de fermeture nocturne.
 *
 * Ces tests interrogent la MISE À JOUR ÉCRITE, pas le fait qu'une fonction ait
 * été appelée : c'est la seule chose qui distingue un report d'un retry.
 * ════════════════════════════════════════════════════════════ */

interface Written {
  table: string;
  values: Record<string, unknown>;
  id: string;
}

function fakeAdmin() {
  const writes: Written[] = [];
  const admin = {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            eq(_column: string, id: string) {
              writes.push({ table, values, id });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  // unsafe-cast-justification: double minimal — `settleJob` n'utilise que
  // from().update().eq(), et reproduire le type complet du client Supabase
  // n'ajouterait aucune garantie sur ce contrat-là.
  return { writes, admin: admin as unknown as Parameters<typeof settleJob>[0] };
}

const claimed = { id: "job-1", attempts: 3, max_attempts: 5 };

describe("settleJob — report daté (deferred)", () => {
  it("REND la tentative et pose la date d'ouverture", async () => {
    /* ROUGE SI : `attempts` n'est pas restauré. Le budget de pannes serait
     * consommé par une attente prévue, et cinq nuits suffiraient à tuer un
     * message que rien n'empêchait d'envoyer. */
    const { writes, admin } = fakeAdmin();
    const opening = new Date("2026-08-05T06:00:00.000Z");

    await settleJob(admin, claimed, {
      status: "deferred",
      runAfter: opening,
      error: "hors fenêtre légale d'envoi (night)",
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].values).toMatchObject({
      status: "queued",
      run_after: opening.toISOString(),
      // 3 au moment de la lecture, donc 2 avant la réclamation.
      attempts: 2,
      locked_until: null,
    });
  });

  it("ne descend jamais sous zéro", async () => {
    const { writes, admin } = fakeAdmin();

    await settleJob(
      admin,
      { id: "job-1", attempts: 0, max_attempts: 5 },
      { status: "deferred", runAfter: new Date("2026-08-05T06:00:00.000Z") },
    );

    expect(writes[0].values).toMatchObject({ attempts: 0 });
  });

  it("TÉMOIN — un `retry`, lui, consomme bien sa tentative", async () => {
    /* Sans ce témoin, un `settleJob` qui restaurerait `attempts` dans TOUS les
     * cas rendrait les deux assertions ci-dessus vertes — en supprimant au
     * passage le seul mécanisme qui borne un incident. */
    const { writes, admin } = fakeAdmin();

    await settleJob(admin, claimed, { status: "retry", error: "panne" });

    expect(writes[0].values).not.toHaveProperty("attempts");
    expect(writes[0].values).toMatchObject({ status: "queued" });
  });
});
