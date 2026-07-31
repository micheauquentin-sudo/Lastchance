// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reportError = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/monitoring", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

import {
  FREQUENT_WORKERS,
  WORKER_NAMES,
  finishWorkerRun,
  finishWorkerRunSafely,
  startWorkerRun,
} from "./worker-health";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registre des workers", () => {
  it("tout worker déclaré est enregistré dans ops_worker_definitions", () => {
    /* LA LISTE FIGÉE EST DEVENUE MÉCANIQUE, et ce n'est pas un confort.
     *
     * Elle était recopiée à la main depuis la migration 20260805240000, avec
     * pour seul commentaire « un nom qui diverge est refusé par la clé
     * étrangère ops_worker_runs_worker_fkey, EN PRODUCTION SEULEMENT ». Deux
     * copies d'une même vérité, dont l'une n'échoue que là où personne ne
     * regarde : ajouter un worker et corriger la liste faisait passer le test
     * au vert tout en laissant `ops_worker_runs` refuser le heartbeat chaque
     * nuit — `startWorkerRunSafely` avalant l'échec par conception, le cron
     * travaillerait sans jamais être journalisé.
     *
     * On lit donc le registre là où il est réellement défini. Même antidote
     * que `cron-coverage.test.ts` (routes ⇄ vercel.json) et `release.test.ts`
     * (EXPECTED_MIGRATION ⇄ dossier des migrations) : relier les copies plutôt
     * qu'espérer qu'un relecteur remarque l'écart.
     *
     * ROUGE ATTENDU quand une route worker est ajoutée sans la ligne de
     * registre correspondante. C'est le message, pas un accident.
     */
    const racine = join(process.cwd(), "supabase", "migrations");
    const enregistres = new Set<string>();
    for (const fichier of readdirSync(racine).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(racine, fichier), "utf8");
      for (const bloc of sql.matchAll(
        /insert\s+into\s+public\.ops_worker_definitions\b[\s\S]*?;/gi,
      )) {
        for (const nom of bloc[0].matchAll(/\(\s*'([a-z][a-z0-9-]{1,39})'\s*,/g)) {
          enregistres.add(nom[1]);
        }
      }
    }

    // Contrôle du LECTEUR lui-même : un motif qui ne trouve plus rien rendrait
    // l'assertion suivante vide, donc verte sans rien vérifier.
    expect(enregistres.size).toBeGreaterThanOrEqual(8);

    const inconnus = WORKER_NAMES.filter((worker) => !enregistres.has(worker));
    expect(
      inconnus,
      `workers absents de public.ops_worker_definitions (leur heartbeat sera refusé par ops_worker_runs_worker_fkey en production) : ${inconnus.join(", ")}`,
    ).toEqual([]);
  });

  it("ne compte comme fréquents que les deux workers exigés par le healthcheck", () => {
    expect([...FREQUENT_WORKERS]).toEqual(["jobs", "sync-contests"]);
    for (const worker of FREQUENT_WORKERS) {
      expect(WORKER_NAMES).toContain(worker);
    }
  });
});

describe("worker heartbeats", () => {
  it("ouvre un run authentifié sans payload métier", async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: "run-1" }, error: null }),
      }),
    });
    const admin = { from: vi.fn().mockReturnValue({ insert }) };

    await expect(startWorkerRun(admin as never, "jobs")).resolves.toEqual(
      expect.objectContaining({ id: "run-1" }),
    );
    expect(admin.from).toHaveBeenCalledWith("ops_worker_runs");
    expect(insert).toHaveBeenCalledWith({ worker: "jobs", status: "running" });
  });

  it("refuse de continuer si le journal ne peut pas être créé", async () => {
    const admin = {
      from: vi.fn().mockReturnValue({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { message: "database unavailable" },
            }),
          }),
        }),
      }),
    };

    await expect(startWorkerRun(admin as never, "jobs")).rejects.toThrow(
      "Journal de santé du worker indisponible.",
    );
    expect(reportError).toHaveBeenCalledWith(
      "cron.jobs.heartbeat.start",
      "database unavailable",
    );
  });

  it("borne les compteurs et ne stocke qu'un code d'erreur contrôlé", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "run-1" },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const secondEq = vi.fn().mockReturnValue({ select });
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
    const update = vi.fn().mockReturnValue({ eq: firstEq });
    const admin = { from: vi.fn().mockReturnValue({ update }) };

    await finishWorkerRun(
      admin as never,
      { id: "run-1", startedAt: Date.now() - 10 },
      "degraded",
      {
        processed: 1.6,
        invalid: Number.POSITIVE_INFINITY,
        negative: -2,
      },
      "x".repeat(200),
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "degraded",
        counters: { processed: 2, invalid: 0, negative: 0 },
        error_code: "x".repeat(120),
      }),
    );
    expect(firstEq).toHaveBeenCalledWith("id", "run-1");
    expect(secondEq).toHaveBeenCalledWith("status", "running");
  });

  it("échoue si aucun run encore ouvert n'a été clôturé", async () => {
    const admin = {
      from: vi.fn().mockReturnValue({
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    await expect(
      finishWorkerRun(
        admin as never,
        { id: "run-1", startedAt: Date.now() },
        "succeeded",
        {},
      ),
    ).rejects.toThrow("Clôture du journal de santé impossible.");
  });

  it("ne masque pas la panne d'origine quand la clôture d'un échec échoue", async () => {
    const admin = {
      from: vi.fn().mockReturnValue({
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { message: "database unavailable" },
                }),
              }),
            }),
          }),
        }),
      }),
    };

    await expect(
      finishWorkerRunSafely(
        admin as never,
        { id: "run-1", startedAt: Date.now() },
        "failed",
        { processed: 0 },
        "orgs_read_failed",
      ),
    ).resolves.toBeUndefined();
    // Silencieuse pour l'appelant, jamais pour la supervision.
    expect(reportError).toHaveBeenCalledWith(
      "cron.heartbeat.failed",
      "database unavailable",
    );
  });
});
