#!/usr/bin/env node
// Hook Stop — le rappel du journal partagé.
//
// CE QU'IL GARDE : `docs/codex-handoff.md` est le journal partagé unique du
// dépôt, et la règle de travail veut qu'une entrée datée y soit ajoutée à chaque
// avancée significative d'un lot. C'est la première chose oubliée en fin de
// chantier, et la seule qu'aucun test ne rattrape — un chantier livré sans
// entrée de journal ne se voit qu'à la relecture suivante, quand le contexte est
// déjà perdu.
//
// DEUX CAS, et le second a été ajouté après avoir vu le premier échouer. La
// version d'origine ne regardait que les commits AU-DESSUS de la base : elle se
// taisait donc à l'instant précis où le rappel devient utile, la fusion. Le
// 2026-08-16 le lot d'outillage a été fusionné sans entrée de journal et ce hook
// n'a rien dit, parce qu'il n'y avait plus rien « au-dessus » de main.
//
//   A. des commits existent au-dessus de la base → on les examine.
//   B. aucun (on EST sur la base, typiquement juste après une fusion) → on
//      examine le dernier commit, mais seulement s'il est RÉCENT.
//
// La fenêtre du cas B n'est pas de la timidité, c'est ce qui sépare un rappel
// d'un harcèlement : sans elle, un vieux commit sans entrée de journal ferait
// parler ce hook à chaque fin de tour, indéfiniment, pour une omission que
// personne ne réparera plus. Douze heures couvrent la journée de travail où
// l'oubli est encore frais et corrigeable.
//
// CE QU'IL NE FAIT PAS : il ne bloque rien (pas de `decision: block`), et il se
// tait dès que `docs/codex-handoff.md` est déjà modifié dans l'arbre de travail
// — c'est le signe que l'entrée est en cours d'écriture, inutile de la réclamer.
//
// Silencieux sur toute erreur (dépôt en état inhabituel, pas de remote…).

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const JOURNAL = "docs/codex-handoff.md";

// Surchargeables — d'abord pour que ce hook soit TESTABLE au tuyau sans
// fabriquer un faux origin/main ni attendre douze heures, ensuite pour un dépôt
// dont la base porte un autre nom.
const BASE = process.env.LASTCHANCE_HOOK_BASE || "origin/main";
const TETE = process.env.LASTCHANCE_HOOK_HEAD || "HEAD";
const FENETRE_H = Number(process.env.LASTCHANCE_HOOK_FENETRE_H || 12);

const git = (...args) =>
  spawnSync("git", args, { cwd: RACINE, encoding: "utf8", timeout: 15_000 });

const lignes = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean);

const rappel = (entete) =>
  `${entete} La règle du dépôt demande une entrée datée dans ${JOURNAL} ` +
  "(lot et objectif, branche/commits, état, faits et fichiers, validations " +
  "réellement exécutées, risque/blocage, prochaine action).";

try {
  if (git("rev-parse", "--verify", "--quiet", BASE).status !== 0) process.exit(0);
  if (git("rev-parse", "--verify", "--quiet", TETE).status !== 0) process.exit(0);

  // L'entrée est déjà en train d'être écrite → rien à réclamer.
  //
  // On exige une ligne AJOUTÉE portant la date DU JOUR, et non la simple
  // présence d'une modification du fichier. La version large de ce test se
  // désarmait toute seule : ce dépôt porte une modification non commitée du
  // journal depuis le 2026-08-10 (un audit Codex en attente d'arbitrage), qui
  // aurait suffi à faire taire ce hook indéfiniment. Un garde qu'un vieux
  // brouillon peut éteindre ne garde rien.
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const brouillon = git("diff", "HEAD", "--", JOURNAL);
  if (
    brouillon.status === 0 &&
    brouillon.stdout
      .split("\n")
      .some((l) => l.startsWith("+") && l.includes(aujourdhui))
  ) {
    process.exit(0);
  }

  const touche = (fichiers) => fichiers.some((f) => /^(src|supabase)\//.test(f));

  // ── Cas A : du travail au-dessus de la base ───────────────────────────────
  const devant = git("diff", "--name-only", `${BASE}...${TETE}`);
  if (devant.status !== 0) process.exit(0);
  const fichiersDevant = lignes(devant.stdout);

  if (fichiersDevant.length > 0) {
    if (touche(fichiersDevant) && !fichiersDevant.includes(JOURNAL)) {
      const branche =
        git("rev-parse", "--abbrev-ref", TETE).stdout.trim() || TETE;
      process.stdout.write(
        JSON.stringify({
          systemMessage: rappel(
            `📓 ${fichiersDevant.length} fichier(s) modifiés sur \`${branche}\` ` +
              `au-dessus de ${BASE}, dont du code, mais le journal n'a pas bougé.`,
          ),
        }),
      );
    }
    process.exit(0);
  }

  // ── Cas B : rien au-dessus — on regarde le dernier commit, s'il est récent ─
  const meta = git("log", "-1", "--format=%h%x09%ct%x09%s", TETE);
  if (meta.status !== 0) process.exit(0);
  const [court, horodatage, sujet = ""] = meta.stdout.trim().split("\t");
  if (!court || !horodatage) process.exit(0);

  const heures = (Date.now() / 1000 - Number(horodatage)) / 3600;
  if (!Number.isFinite(heures) || heures > FENETRE_H) process.exit(0);

  // `--name-only --format=` sur un commit de fusion vrai ne rend rien : on se
  // tait alors, plutôt que de réclamer une entrée pour un merge sans contenu.
  const contenu = git("show", "--name-only", "--format=", court);
  if (contenu.status !== 0) process.exit(0);
  const fichiers = lignes(contenu.stdout);
  if (fichiers.length === 0) process.exit(0);

  if (touche(fichiers) && !fichiers.includes(JOURNAL)) {
    process.stdout.write(
      JSON.stringify({
        systemMessage: rappel(
          `📓 Le dernier commit (\`${court}\`, il y a ${heures < 1 ? "moins d'une heure" : `${Math.round(heures)} h`}) ` +
            `touche du code sans entrée de journal — « ${sujet.slice(0, 70)} ».`,
        ),
      }),
    );
  }
} catch {
  // Silence délibéré : voir l'en-tête.
}
process.exit(0);
