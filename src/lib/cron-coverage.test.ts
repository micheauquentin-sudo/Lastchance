// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WORKER_NAMES } from "./worker-health";

/**
 * Garde anti-dérive entre TROIS représentations du même fait — « quels workers
 * tournent, et qui les déclenche » :
 *
 *   1. `WORKER_NAMES` (ce module) — ce que la supervision surveille ;
 *   2. `src/app/api/cron/<nom>/route.ts` — ce qui existe et sait travailler ;
 *   3. `vercel.json` — ce qui est réellement DÉCLENCHÉ.
 *
 * Trois copies d'une même vérité, tenues à la main : la première qui diverge le
 * fait en silence. C'est exactement ce qui est arrivé à `jackpot-draws`, qui
 * avait une route, un `CRON_SECRET`, un test, un heartbeat et une inscription
 * au registre des workers — mais **aucune entrée dans `vercel.json`**. Le filet
 * de sécurité des tirages à date n'était déclenché par rien, et rien ne le
 * disait : l'en-tête de la migration du registre parlait même des « six crons
 * quotidiens de vercel.json » en en listant un qui n'y était pas.
 *
 * Ce test est le même antidote que `pgtap-coverage.test.ts` (fichiers pgTAP ⇄
 * commande CI) et `release.test.ts` (EXPECTED_MIGRATION ⇄ dossier des
 * migrations) : relier mécaniquement les copies plutôt que d'espérer qu'un
 * relecteur remarque l'écart.
 *
 * NOTE — `jobs` et `sync-contests` sont AUSSI planifiés côté Postgres par
 * pg_cron, et `jackpot-draws` l'est à cadence 5 min. Leur cron Vercel reste un
 * filet de sécurité : la double planification est voulue, les RPC concernées
 * sont idempotentes. Ce test n'exige donc PAS l'inverse (un cron Vercel sans
 * worker déclaré serait, lui, une anomalie — il est vérifié plus bas).
 */

const RACINE = join(process.cwd(), "src", "app", "api", "cron");

interface CronVercel {
  path: string;
  schedule: string;
}

function cronsDeclares(): CronVercel[] {
  const brut = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  return (JSON.parse(brut).crons ?? []) as CronVercel[];
}

describe("couverture des crons", () => {
  it("chaque worker supervisé a une route /api/cron/<nom>", () => {
    const routes = readdirSync(RACINE, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    const sansRoute = WORKER_NAMES.filter((w) => !routes.includes(w));
    expect(sansRoute, `workers sans route HTTP : ${sansRoute.join(", ")}`).toEqual([]);
  });

  it("chaque worker supervisé est DÉCLENCHÉ par vercel.json", () => {
    const chemins = new Set(cronsDeclares().map((c) => c.path));

    // Le défaut réel : un worker complet de bout en bout, mais que personne
    // n'appelle. Il ne se signale par aucune erreur — il ne se passe
    // simplement rien.
    const jamaisDeclenches = WORKER_NAMES.filter(
      (w) => !chemins.has(`/api/cron/${w}`),
    );
    expect(
      jamaisDeclenches,
      `workers jamais déclenchés (route + supervision, mais absents de vercel.json) : ${jamaisDeclenches.join(", ")}`,
    ).toEqual([]);
  });

  it("aucun cron de vercel.json ne pointe vers un worker inconnu", () => {
    // Sens inverse : une entrée qui survit à la suppression d'une route
    // produirait un 404 quotidien, silencieux lui aussi.
    const connus = new Set<string>(WORKER_NAMES);
    const orphelins = cronsDeclares()
      .map((c) => c.path)
      .filter((p) => {
        const nom = p.replace("/api/cron/", "");
        return p.startsWith("/api/cron/") && !connus.has(nom);
      });
    expect(orphelins, `crons pointant vers un worker inconnu : ${orphelins.join(", ")}`).toEqual(
      [],
    );
  });

  it("les crons Vercel restent quotidiens (contrainte du plan Hobby)", () => {
    // Le plan Hobby n'accepte qu'un déclenchement par jour et par cron. Une
    // cadence plus courte est acceptée par le fichier puis IGNORÉE par la
    // plateforme : le cron paraîtrait planifié sans jamais tenir sa fréquence.
    const infraQuotidiens = cronsDeclares().filter((c) => {
      const [minute, heure] = c.schedule.split(" ");
      return minute.includes("*") || minute.includes("/") || heure.includes("*") || heure.includes("/");
    });
    expect(
      infraQuotidiens.map((c) => `${c.path} (${c.schedule})`),
      "crons plus fréquents que quotidiens : le plan Hobby les ignorerait",
    ).toEqual([]);
  });
});
