// @vitest-environment node
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde de budget : CLAUDE.md est chargé dans CHAQUE session **et hérité par
 * CHAQUE agent** — le fichier l'écrit lui-même (« chaque agent inhère le
 * contexte de session complet »). Son coût n'est donc pas payé une fois mais
 * une fois par agent d'un chantier.
 *
 * RAISON D'ÊTRE, MESURÉE LE 2026-08-05. La section `## Last Updated` pesait
 * **39 062 tokens sur les 42 971 du fichier — 91 %** — et grossissait
 * d'environ 5 500 tokens par chantier sans jamais décroître : 19 302 tokens
 * le 2026-08-01, 41 561 le 2026-08-04, soit +22 000 en quatre jours. Au
 * rythme d'un chantier à six agents, ce récit était payé sept fois, soit près
 * de **273 000 tokens de prefill** avant qu'une ligne de code ne soit lue —
 * pour un contenu dont aucun agent n'avait besoin pour faire sa part.
 * L'historique vit désormais dans `docs/journal.md`.
 *
 * CE QUE CETTE GARDE NE PROTÈGE PAS, et c'est délibéré : la taille du dépôt.
 * `docs/journal.md` n'a **aucun plafond** — il n'est lu que sur demande, donc
 * son poids ne se multiplie pas. Ce qui est borné ici est le budget de
 * contexte, pas le volume documentaire.
 *
 * SI CE TEST CASSE : le dernier chantier doit **remplacer** le précédent dans
 * `## Last Updated`, l'ancien partant **en tête** de `docs/journal.md`. Ne
 * relevez pas `BUDGET_OCTETS` pour faire passer un ajout — relever le plafond
 * est exactement le geste, répété une trentaine de fois, qui a produit les
 * 39 000 tokens que ce test existe pour empêcher.
 */

/**
 * ~6 100 tokens, soit environ 38 % de marge au-dessus des 15 973 octets
 * mesurés après l'extraction du 2026-08-05. La marge laisse passer une
 * entrée de chantier rédigée normalement ; elle ne laisse pas passer deux
 * entrées empilées, ce qui est précisément le comportement à interdire.
 */
const BUDGET_OCTETS = 22_000;

/**
 * Plancher de non-vacuité. Sans lui, un CLAUDE.md vidé ou absent passerait le
 * plafond haut la main — la treizième forme du motif « le détecteur ment »
 * que ce dépôt s'est déjà infligée : un test qui rend vert parce qu'il ne
 * mesure rien.
 */
const PLANCHER_OCTETS = 3_000;

const racine = process.cwd();
const claudeMd = join(racine, "CLAUDE.md");
const agentsMd = join(racine, "AGENTS.md");
const journal = join(racine, "docs", "journal.md");

describe("budget de contexte — CLAUDE.md", () => {
  /**
   * LA MESURE NE DOIT PAS DÉPENDRE DE LA PLATEFORME QUI A FAIT LE CHECKOUT.
   *
   * `statSync().size` compte les octets du DISQUE. Sur un clone Windows,
   * git rend les fichiers en CRLF : chaque ligne y pèse un octet de plus, et
   * les deux fichiers en portent trois cent cinquante. La garde rougissait
   * donc en local à 22 023 octets là où la CI, qui checkout en LF, en
   * mesurait 21 856 et passait — un rouge que personne ne pouvait
   * reproduire, sur un budget que personne n'avait dépassé. Vu le
   * 2026-08-24.
   *
   * Ce que le plafond veut borner, c'est le CONTEXTE hérité par chaque
   * agent, et un `\r` n'en fait pas partie : il disparaît avant le modèle.
   * On compte donc le contenu normalisé, identique des deux côtés.
   */
  function octetsNormalises(chemin: string): number {
    return Buffer.byteLength(readFileSync(chemin, "utf8").replace(/\r\n/g, "\n"), "utf8");
  }

  it("reste sous le plafond de contexte hérité par chaque agent", () => {
    expect(existsSync(claudeMd)).toBe(true);

    const octets = octetsNormalises(claudeMd);

    // Non-vacuité d'abord : un fichier vide ou tronqué ne doit jamais être
    // lu comme un succès de sobriété.
    expect(octets).toBeGreaterThan(PLANCHER_OCTETS);
    expect(octets).toBeLessThanOrEqual(BUDGET_OCTETS);
  });

  /**
   * CLAUDE.md importe `AGENTS.md` (ligne `@AGENTS.md`) depuis le 2026-08-19 :
   * le socle opérationnel — environnement, pièges, boucle de vérification — a
   * été déplacé là-bas parce qu'il ne dépend d'aucun outil et qu'Antigravity et
   * Codex en ont le même besoin, or ils ne lisent pas CLAUDE.md.
   *
   * SANS CETTE ASSERTION, LE DÉPLACEMENT AURAIT DÉSARMÉ LE GARDE. Un import est
   * inliné : le contexte hérité par chaque agent reste celui des DEUX fichiers,
   * mais la mesure n'en voyait plus qu'un. Le plafond serait devenu satisfaisable
   * en poussant n'importe quel volume dans l'autre fichier — exactement la
   * quatorzième forme du motif « le détecteur ment » que ce dépôt collectionne.
   *
   * C'est donc la SOMME qui est bornée, et le plafond ne bouge pas : au moment
   * du déplacement, les deux fichiers pesaient ensemble 21 470 octets, soit
   * moins que les 21 981 du seul CLAUDE.md la veille.
   */
  it("borne la SOMME des deux fichiers, puisque l'un importe l'autre", () => {
    expect(existsSync(agentsMd)).toBe(true);

    const contenu = readFileSync(claudeMd, "utf8");
    expect(contenu).toContain("@AGENTS.md");

    const somme = octetsNormalises(claudeMd) + octetsNormalises(agentsMd);

    expect(somme).toBeGreaterThan(PLANCHER_OCTETS);
    expect(somme).toBeLessThanOrEqual(BUDGET_OCTETS);
  });

  it("a déporté l'historique plutôt que de le détruire", () => {
    // Le plafond seul est satisfaisable en SUPPRIMANT le récit. Cette
    // assertion ferme ce chemin : l'histoire doit exister ailleurs, et y
    // peser plus lourd que ce qui reste dans CLAUDE.md.
    expect(existsSync(journal)).toBe(true);

    const poidsJournal = statSync(journal).size;
    const poidsClaudeMd = statSync(claudeMd).size;

    expect(poidsJournal).toBeGreaterThan(poidsClaudeMd);
  });

  it("nomme le journal, pour que le récit reste atteignable", () => {
    // Un historique déporté sans lien depuis le document d'entrée est un
    // historique introuvable — la classe de défaut « capacité livrée sans
    // chemin applicatif pour l'atteindre », déjà payée plusieurs fois ici.
    const contenu = readFileSync(claudeMd, "utf8");

    expect(contenu).toContain("docs/journal.md");
  });
});
