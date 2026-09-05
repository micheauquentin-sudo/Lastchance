// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════
 * LE PSEUDO QUI ARRIVE À L'ÉCRAN, PAS CELUI QU'ON VALIDE
 *
 * ── LE DÉFAUT ──────────────────────────────────────────────
 *
 * ADR-169 a branché `isAllowedPlayerAlias` sur le `nicknameSchema` des
 * pronostics et l'a écrit noir sur blanc : « Son pseudo enregistré reste
 * affiché : ce schéma ne garde que les ÉCRITURES. » Le classement
 * `/pronos/<slug>` est PUBLIC et sans authentification. Tout pseudo inscrit
 * AVANT ce lot y restait donc rendu tel quel — U+202E compris, celui qui
 * inverse l'affichage et permet d'imiter le pseudo d'un autre joueur.
 *
 * ── POURQUOI CE FICHIER PART DE LA LIGNE DE BASE ET FINIT AU DOM ──
 *
 * ADR-168 puis ADR-169 ont chacune payé une garde qui restait VERTE sur un
 * import devenu orphelin : elle reconnaissait une déclaration, pas un
 * câblage. Le seul énoncé qu'on ne peut pas satisfaire par accident est donc
 * celui-ci — une ligne SALE telle que la RPC `contest_leaderboard` la rendait
 * entre par le chargeur RÉEL, ressort par le composant RÉEL, et le HTML
 * produit ne doit plus porter un seul caractère invisible.
 *
 * Rien n'est recopié : ni le nettoyeur, ni la liste des surfaces. Débrancher
 * `sanitizePlayerAlias` de `pronostics-context.ts` — à n'importe lequel de
 * ses deux entonnoirs — fait rougir ce fichier, quel que soit l'état des
 * imports restés en haut du module.
 *
 * ── LA COUCHE, ET LES DEUX AUTRES ──────────────────────────
 *
 * Celle-ci est la troisième. Le nettoyage des lignes déjà en base et la
 * contrainte qui referme la porte vivent dans la migration 20261205120000 et
 * sont gardés par `supabase/tests/alias_pronostics_historiques.test.sql`.
 * ════════════════════════════════════════════════════════════ */

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

import { ContestLeaderboardCard } from "@/components/pronos/leaderboard";
import {
  loadContestLeaderboard,
  loadContestPlayerRank,
  type ContestLeaderboardRow,
} from "@/lib/pronostics-context";

afterEach(cleanup);

/** U+202E RIGHT-TO-LEFT OVERRIDE, U+200B ZWSP, U+FEFF BOM. */
const RLO = String.fromCharCode(0x202e);
const ZWSP = String.fromCharCode(0x200b);
const BOM = String.fromCharCode(0xfeff);

/** Ce qu'aucune surface publique ne doit rendre : contrôle ou formatage. */
const INVISIBLE = /[\p{Cc}\p{Cf}]/u;

function ligne(first_name: string, over: Partial<ContestLeaderboardRow> = {}) {
  return {
    player_id: "p1",
    first_name,
    avatar: "",
    email: null,
    total_points: 12,
    exact_count: 2,
    diff_count: 1,
    prediction_count: 3,
    rank: 1,
    total_players: 1,
    ...over,
  } satisfies ContestLeaderboardRow;
}

/** Client admin réduit à ce que les deux chargeurs appellent vraiment. */
function adminQuiRend(rows: ContestLeaderboardRow[]) {
  return {
    rpc: async () => ({ data: rows, error: null }),
    // unsafe-cast-justification: double de test reduit aux seuls appels des deux chargeurs
  } as unknown as Parameters<typeof loadContestLeaderboard>[0];
}

describe("classement public — le pseudo rendu est assaini", () => {
  it("neutralise un alias porteur de U+202E jusque dans le HTML rendu", async () => {
    const board = await loadContestLeaderboard(
      adminQuiRend([ligne(`Cam${RLO}ille`)]),
      "contest-1",
    );

    const { container } = render(
      <ContestLeaderboardCard
        title="Classement"
        entries={board.entries}
        totalPlayers={board.totalPlayers}
        myPlayerId={null}
        finished={false}
      />,
    );

    // L'ASSERTION QUI COMPTE : ce que le navigateur reçoit. Elle ne nomme ni
    // le nettoyeur ni le module qui l'appelle — elle regarde le produit.
    expect(container.innerHTML).not.toMatch(INVISIBLE);
    expect(container.textContent).toContain("Camille");
    expect(container.textContent).not.toContain(RLO);
  });

  it("laisse un pseudo légitime INTACT", async () => {
    // Le contre-exemple. Sans lui, une projection qui renverrait « Joueur »
    // pour tout le monde passerait l'assertion précédente.
    const board = await loadContestLeaderboard(
      adminQuiRend([ligne("Jean-Luc")]),
      "contest-1",
    );

    const { container } = render(
      <ContestLeaderboardCard
        title="Classement"
        entries={board.entries}
        totalPlayers={board.totalPlayers}
        myPlayerId={null}
        finished={false}
      />,
    );

    expect(container.textContent).toContain("Jean-Luc");
    expect(board.entries[0]?.firstName).toBe("Jean-Luc");
  });

  it("retire aussi ZWSP et BOM, et replie ce qu'ils laissent derrière", async () => {
    const board = await loadContestLeaderboard(
      adminQuiRend([ligne(`Jean${ZWSP} ${BOM}Luc`)]),
      "contest-1",
    );
    expect(board.entries[0]?.firstName).toBe("Jean Luc");
  });

  it("borne l'affichage à 24 caractères, comme la base", async () => {
    // Trente en base — la contrainte d'avant en laissait passer soixante.
    const board = await loadContestLeaderboard(
      adminQuiRend([ligne("z".repeat(30))]),
      "contest-1",
    );
    expect(board.entries[0]?.firstName).toBe("z".repeat(24));
  });

  it("ne rend jamais une chaîne vide sous le rang", async () => {
    // Un pseudo entièrement invisible ne doit pas produire une ligne de
    // classement sans nom : le rang serait attribué à personne.
    const board = await loadContestLeaderboard(
      adminQuiRend([ligne(`${ZWSP}${BOM}`)]),
      "contest-1",
    );
    expect(board.entries[0]?.firstName).not.toBe("");

    const { container } = render(
      <ContestLeaderboardCard
        title="Classement"
        entries={board.entries}
        totalPlayers={board.totalPlayers}
        myPlayerId={null}
        finished={false}
      />,
    );
    expect(container.innerHTML).not.toMatch(INVISIBLE);
  });

  it("assainit AUSSI la ligne du joueur courant (loadContestPlayerRank)", async () => {
    // Second entonnoir du même mappeur : le joueur sous le top affiché voit sa
    // propre ligne par ce chemin-là, pas par le classement.
    const entry = await loadContestPlayerRank(
      adminQuiRend([ligne(`Cam${RLO}ille`, { rank: 42 })]),
      "contest-1",
      "p1",
    );
    expect(entry?.firstName).toBe("Camille");
  });
});
