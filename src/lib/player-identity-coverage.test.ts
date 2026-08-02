// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAYER_EXPERIENCE_KINDS } from "./player-identity";

/* ════════════════════════════════════════════════════════════
 * LE PONT D'IDENTITÉ A-T-IL UN ÉCRIVAIN POUR CHAQUE FAMILLE ?
 *
 * ── LE DÉFAUT QUI JUSTIFIE CETTE GARDE ──────────────────────
 *
 * `ensureProgressivePlayerIdentity` est le SEUL écrivain de
 * `player_legacy_identities` (via `resolve_player_identity`, insert unique du
 * dépôt). Il était appelé pour SEPT familles sur neuf : `contest` et
 * `referral` n'en avaient aucun. Rien ne rougissait, rien ne s'affichait, et
 * deux conséquences couraient en production :
 *
 *   · `reward_player_from_legacy(org, 'contest'|'referral', …)` ne trouvait
 *     aucun pont, donc `reward_issuances.player_id` restait null et
 *     `/portefeuille` n'affichait JAMAIS ces lots — alors que la page promet
 *     « les lots gagnés depuis ce téléphone », et que `docs/architecture.md`
 *     et `docs/roadmap.md` écrivent « toutes familles confondues » ;
 *   · `apply_meta_progression_event` sort sur `player_id is null` : une
 *     mission de saison portant sur ces deux familles ne progressait pour
 *     PERSONNE, alors que l'éditeur propose bien les neuf.
 *
 * ── POURQUOI UNE GARDE DÉRIVÉE PLUTÔT QU'UNE LISTE ──────────
 *
 * Aucune famille n'est recopiée ici : elles viennent de
 * `PLAYER_EXPERIENCE_KINDS`, la même constante que le schéma Zod du pont. Une
 * dixième famille ajoutée demain arrive donc dans ce test AVEC son exigence
 * d'écrivain, sans que personne ait à penser à l'y inscrire — c'est
 * exactement ce qui a manqué pendant deux modules.
 *
 * ── CE QU'ELLE NE PROUVE PAS ────────────────────────────────
 *
 * Qu'un appel EXISTE, pas qu'il soit atteint sur le bon chemin ni qu'il porte
 * la bonne empreinte. Elle est une garde de couverture, comme
 * `revalidate-coverage.test.ts` ou `cron-coverage.test.ts` — la justesse de
 * chaque site relève des tests de son module.
 * ════════════════════════════════════════════════════════════ */

const ACTIONS_DIR = "src/actions";

/** Sources des actions, en LF — le dépôt est en CRLF. */
const SOURCES = readdirSync(ACTIONS_DIR)
  .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
  .map((f) => ({
    fichier: `${ACTIONS_DIR}/${f}`,
    src: readFileSync(`${ACTIONS_DIR}/${f}`, "utf8").replace(/\r\n/g, "\n"),
  }));

/** Les fichiers d'action qui posent le pont pour cette famille. */
function ecrivains(kind: string): string[] {
  const marqueur = new RegExp(`experienceKind: "${kind}"`);
  return SOURCES.filter(
    ({ src }) => src.includes("ensureProgressivePlayerIdentity") && marqueur.test(src),
  ).map(({ fichier }) => fichier);
}

describe("pont d'identité — les neuf familles ont un écrivain applicatif", () => {
  it.each(PLAYER_EXPERIENCE_KINDS)(
    "la famille « %s » est posée par au moins une action",
    (kind) => {
      // ROUGE SI : une famille du registre n'a aucun appel. Le module tourne,
      // les lots s'émettent, le registre universel les inscrit — avec
      // `player_id` null. Le portefeuille reste vide et les missions de saison
      // restent inertes, sans une erreur nulle part.
      expect(ecrivains(kind), `aucun écrivain de pont pour « ${kind} »`)
        .not.toHaveLength(0);
    },
  );

  it("TÉMOIN : une famille inventée n'a évidemment aucun écrivain", () => {
    // Sans cette moitié, une garde qui ne regarderait rien serait verte pour
    // rien — quatre harnais ont menti de cette façon sur ce projet.
    expect(ecrivains("famille-qui-n-existe-pas")).toHaveLength(0);
  });
});

describe("pont d'identité — l'expérience désignée est la bonne table", () => {
  it("« referral » désigne le PROGRAMME, jamais la campagne", () => {
    // `player_experience_scope_is_valid('referral', …)` résout l'expérience
    // dans `referral_programs`. Passer l'identifiant de CAMPAGNE — la valeur
    // la plus à portée de main dans ce module, qui s'appelle `campaignId` et
    // circule partout — ferait lever la RPC en `23503` et le pont ne serait
    // jamais posé. Le refus étant avalé (best-effort), rien ne le dirait.
    const src = readFileSync(`${ACTIONS_DIR}/referral.ts`, "utf8").replace(
      /\r\n/g,
      "\n",
    );
    const appels = [
      ...src.matchAll(
        /ensureProgressivePlayerIdentity\(\{[\s\S]*?experienceId: ([\w.]+)/g,
      ),
    ].map((m) => m[1]);

    expect(appels.length, "le pont referral a disparu").toBeGreaterThan(0);
    for (const valeur of appels) {
      expect(valeur, "le pont referral désigne une campagne").toBe(
        "ctx.programId",
      );
    }
  });

  it("« contest » désigne le championnat, avec le hash que le registre lit", () => {
    // `reward_player_from_legacy(org, 'contest', ca.contest_id, cp.token_hash)`
    // — l'expérience est le championnat et l'empreinte est le `token_hash` de
    // `contest_players`, pas une empreinte device. Une des deux fausse suffit
    // à laisser `player_id` null.
    const src = readFileSync(`${ACTIONS_DIR}/pronostics.ts`, "utf8").replace(
      /\r\n/g,
      "\n",
    );
    const m = /experienceKind: "contest",\s*\n\s*experienceId: ([\w.]+),\s*\n\s*legacyIdentityHash: ([\w.]+),/.exec(
      src,
    );
    expect(m, "le pont contest a disparu ou changé de forme").not.toBeNull();
    expect(m![1]).toBe("ctx.contest.id");
    expect(m![2]).toBe("tokenHash");
  });
});
