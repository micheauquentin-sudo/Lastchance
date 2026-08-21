#!/usr/bin/env node
// Génère `.agents/skills/<nom>/SKILL.md` à partir de `.claude/agents/<nom>.md`.
//
// POURQUOI CE SCRIPT PLUTÔT QUE HUIT COPIES. Les briefs d'agents existent déjà
// et sont maintenus dans `.claude/agents/` ; Antigravity ne lit pas ce dossier,
// il lit `.agents/skills/`. Recopier à la main, c'est garantir qu'au troisième
// ajustement d'un brief les deux versions divergent, et que personne ne saura
// laquelle fait foi. La source de vérité reste `.claude/agents/` — ce script
// dérive l'autre forme, et la marque comme dérivée.
//
// Ce que la conversion enlève : les clés de frontmatter propres à Claude Code
// (`model`, `effort`, `tools`), qui n'ont pas de sens pour Antigravity et dont
// la présence ferait échouer la lecture du frontmatter. Ce qu'elle garde :
// `name` et `description` — les deux seuls champs qu'Antigravity exige, et la
// `description` est ce sur quoi il décide de charger la skill ou non.
//
// Rejouer après toute modification d'un brief :
//   node .agents/scripts/sync-skills-depuis-agents.mjs

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = path.join(RACINE, ".claude", "agents");
const CIBLE = path.join(RACINE, ".agents", "skills");

const ENTETE_DERIVE =
  "<!-- GÉNÉRÉ depuis .claude/agents/%s — ne pas éditer ici.\n" +
  "     Modifier le brief source puis rejouer :\n" +
  "     node .agents/scripts/sync-skills-depuis-agents.mjs -->\n\n";

/** Découpe un fichier `---\nfrontmatter\n---\ncorps`. */
function decouper(brut) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(brut);
  if (!m) return null;
  return { frontmatter: m[1], corps: m[2] };
}

/**
 * Extrait `name` et `description` sans dépendre d'un parseur YAML : les briefs
 * utilisent `description: >` suivi d'un bloc indenté, forme stable ici depuis
 * l'origine. Un vrai parseur ajouterait une dépendance pour trois lignes.
 */
function champs(frontmatter) {
  const lignes = frontmatter.split(/\r?\n/);
  let nom = "";
  const description = [];
  let dansDescription = false;

  for (const ligne of lignes) {
    const cle = /^([a-zA-Z_]+):\s*(.*)$/.exec(ligne);
    if (cle && !/^\s/.test(ligne)) {
      dansDescription = false;
      if (cle[1] === "name") nom = cle[2].trim();
      if (cle[1] === "description") {
        dansDescription = true;
        const reste = cle[2].trim();
        if (reste && reste !== ">" && reste !== "|" && reste !== ">-") description.push(reste);
      }
      continue;
    }
    if (dansDescription && ligne.trim()) description.push(ligne.trim());
  }

  return { nom, description: description.join(" ").replace(/\s+/g, " ").trim() };
}

if (!existsSync(SOURCE)) {
  console.error(`Source absente : ${SOURCE}`);
  process.exit(1);
}

let ecrits = 0;
for (const fichier of readdirSync(SOURCE).filter((f) => f.endsWith(".md"))) {
  const brut = readFileSync(path.join(SOURCE, fichier), "utf8");
  const decoupe = decouper(brut);
  if (!decoupe) {
    console.error(`⚠ ${fichier} : pas de frontmatter reconnaissable, ignoré.`);
    continue;
  }

  const { nom, description } = champs(decoupe.frontmatter);
  if (!nom || !description) {
    console.error(`⚠ ${fichier} : name ou description manquant, ignoré.`);
    continue;
  }

  const dossier = path.join(CIBLE, nom);
  mkdirSync(dossier, { recursive: true });

  // La description est repliée en YAML `>-` : une seule ligne de 600 caractères
  // reste valide mais devient illisible en revue.
  const plie = description.match(/.{1,76}(\s|$)/g)?.map((l) => `  ${l.trim()}`).join("\n") ?? `  ${description}`;

  const contenu =
    `---\nname: ${nom}\ndescription: >-\n${plie}\n---\n\n` +
    ENTETE_DERIVE.replace("%s", fichier) +
    decoupe.corps.replace(/^\s+/, "");

  writeFileSync(path.join(dossier, "SKILL.md"), contenu, "utf8");
  ecrits += 1;
}

console.log(`${ecrits} skill(s) générée(s) dans .agents/skills/`);
