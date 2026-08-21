#!/usr/bin/env node
// Hook Stop — le rappel du journal partagé `docs/codex-handoff.md`.
//
// CE QU'IL GARDE : la règle du dépôt veut une entrée datée dans le journal à
// chaque avancée significative d'un lot. C'est la première chose oubliée en fin
// de chantier, et la seule qu'aucun test ne rattrape — un chantier livré sans
// entrée ne se voit qu'à la relecture suivante, quand le contexte est perdu.
//
// UNE DIFFÉRENCE ASSUMÉE AVEC LA VERSION CLAUDE. Là-bas le hook émet un
// `systemMessage` et ne bloque rien. Ici, le contrat `Stop` d'Antigravity
// n'offre qu'un seul levier : `decision: "continue"`, qui REND la main à
// l'agent. Un rappel devient donc une relance. Pour que ce ne soit pas du
// harcèlement, il ne relance QU'UNE FOIS par conversation — au deuxième arrêt,
// il se tait définitivement, même si le journal n'a toujours pas bougé. Le
// rappel est une aide, pas une serrure.
//
// DEUX CAS, et le second existe parce que le premier a échoué au moment précis
// où le rappel devient utile — la fusion. La version d'origine ne regardait que
// les commits AU-DESSUS de la base : le jour où un lot a été fusionné sans
// entrée de journal, il n'y avait plus rien « au-dessus » de main, et le hook
// s'est tu.
//
//   A. des commits existent au-dessus de la base → on les examine.
//   B. aucun (on EST sur la base, typiquement juste après une fusion) → on
//      examine le dernier commit, mais seulement s'il est RÉCENT. La fenêtre
//      n'est pas de la timidité : sans elle, un vieux commit sans entrée ferait
//      parler ce hook indéfiniment pour une omission que plus personne ne
//      réparera.

import { entree, repondre, git, lireEtat, ecrireEtat } from "./commun.mjs";

const JOURNAL = "docs/codex-handoff.md";
const BASE = process.env.LASTCHANCE_HOOK_BASE || "origin/main";
const TETE = process.env.LASTCHANCE_HOOK_HEAD || "HEAD";
const FENETRE_H = Number(process.env.LASTCHANCE_HOOK_FENETRE_H || 12);

const lignes = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean);

const rappel = (entete) =>
  `${entete} La règle du dépôt demande une entrée datée dans ${JOURNAL} ` +
  "(lot et objectif, branche/commits, état, faits et fichiers, validations " +
  "réellement exécutées, risque/blocage, prochaine action). " +
  "Écrire l'entrée, puis s'arrêter — ce rappel ne se répétera pas.";

try {
  const e = await entree();
  const conversation = String(e?.conversationId ?? "sans-id").replace(/[^a-zA-Z0-9_-]/g, "");
  const nomEtat = `journal-${conversation}.json`;

  // Une seule relance par conversation, quoi qu'il arrive.
  if (lireEtat(nomEtat)?.relance) repondre({});

  // Ne pas relancer tant que des tâches de fond tournent.
  if (e?.fullyIdle === false) repondre({});

  if (git("rev-parse", "--verify", "--quiet", BASE).status !== 0) repondre({});
  if (git("rev-parse", "--verify", "--quiet", TETE).status !== 0) repondre({});

  // L'entrée est déjà en cours d'écriture → rien à réclamer. On exige une ligne
  // AJOUTÉE portant la date DU JOUR, et non la simple présence d'une
  // modification : ce dépôt porte un brouillon de journal non commité de longue
  // date, qui aurait suffi à éteindre ce garde pour toujours. Un garde qu'un
  // vieux brouillon peut désarmer ne garde rien.
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const brouillon = git("diff", "HEAD", "--", JOURNAL);
  if (
    brouillon.status === 0 &&
    brouillon.stdout.split("\n").some((l) => l.startsWith("+") && l.includes(aujourdhui))
  ) {
    repondre({});
  }

  const touche = (fichiers) => fichiers.some((f) => /^(src|supabase)\//.test(f));
  const relancer = (message) => {
    ecrireEtat(nomEtat, { relance: true, ts: Date.now() });
    repondre({ decision: "continue", reason: message });
  };

  // ── Cas A : du travail au-dessus de la base ───────────────────────────────
  const devant = git("diff", "--name-only", `${BASE}...${TETE}`);
  if (devant.status !== 0) repondre({});
  const fichiersDevant = lignes(devant.stdout);

  if (fichiersDevant.length > 0) {
    if (touche(fichiersDevant) && !fichiersDevant.includes(JOURNAL)) {
      const branche = git("rev-parse", "--abbrev-ref", TETE).stdout.trim() || TETE;
      relancer(
        rappel(
          `📓 ${fichiersDevant.length} fichier(s) modifiés sur \`${branche}\` ` +
            `au-dessus de ${BASE}, dont du code, mais le journal n'a pas bougé.`,
        ),
      );
    }
    repondre({});
  }

  // ── Cas B : rien au-dessus — le dernier commit, s'il est récent ───────────
  const meta = git("log", "-1", "--format=%h%x09%ct%x09%s", TETE);
  if (meta.status !== 0) repondre({});
  const [court, horodatage, sujet = ""] = meta.stdout.trim().split("\t");
  if (!court || !horodatage) repondre({});

  const heures = (Date.now() / 1000 - Number(horodatage)) / 3600;
  if (!Number.isFinite(heures) || heures > FENETRE_H) repondre({});

  // `--name-only --format=` ne rend rien sur une vraie fusion : on se tait
  // plutôt que de réclamer une entrée pour un merge sans contenu.
  const contenu = git("show", "--name-only", "--format=", court);
  if (contenu.status !== 0) repondre({});
  const fichiers = lignes(contenu.stdout);
  if (fichiers.length === 0) repondre({});

  if (touche(fichiers) && !fichiers.includes(JOURNAL)) {
    relancer(
      rappel(
        `📓 Le dernier commit (\`${court}\`, il y a ${heures < 1 ? "moins d'une heure" : `${Math.round(heures)} h`}) ` +
          `touche du code sans entrée de journal — « ${sujet.slice(0, 70)} ».`,
      ),
    );
  }
} catch {
  // Silence délibéré : voir l'en-tête de commun.mjs.
}
repondre({});
