// @vitest-environment node
import { describe, expect, it } from "vitest";

import { weeklyDigestEmailContent } from "./resend";
import type { WeeklyDigestStats } from "./weekly-digest";

/* ════════════════════════════════════════════════════════════
 * Gabarit du rapport du lundi.
 *
 * Ce que ces tests gardent n'est pas la mise en page : c'est ce que le
 * gabarit REFUSE de dire à qui n'y a pas droit, et ce qu'il doit dire pour
 * être ouvert (la comparaison) et pour ne pas finir en spam (la sortie).
 * ════════════════════════════════════════════════════════════ */

function stats(over: Partial<WeeklyDigestStats> = {}): WeeklyDigestStats {
  return {
    periodDays: 7,
    players: 34,
    rewardsIssued: 40,
    rewardsRedeemed: 25,
    basketCents: 123_45,
    prevPlayers: 22,
    prevRewardsIssued: 40,
    prevRewardsRedeemed: 34,
    prevBasketCents: 90_00,
    topRewards: [{ label: "Café offert", count: 12 }],
    ...over,
  };
}

const SETTINGS_URL = "https://app.example.com/dashboard/settings#weekly-digest";

function render(s: WeeklyDigestStats) {
  return weeklyDigestEmailContent({
    organizationName: "Chez Marco",
    stats: s,
    settingsUrl: SETTINGS_URL,
  });
}

describe("montants — un caissier ne reçoit AUCUN chiffre d'affaires", () => {
  it("basketCents null : ni montant, ni ligne de panier, ni symbole €", () => {
    // `basket_cents` est une donnée de marge, que la policy « prizes: editors »
    // refuse à un caissier. Un e-mail ne doit pas être le contournement d'une
    // policy — et le bloc n'est pas masqué, il n'est pas rendu du tout.
    const { html, subject } = render(
      stats({ basketCents: null, prevBasketCents: null }),
    );

    expect(html).not.toContain("€");
    expect(html).not.toContain("Panier");
    expect(html).not.toContain("123,45");
    expect(html).not.toContain("90,00");
    // Les VOLUMES, eux, restent : un caissier a le droit de lire l'activité.
    expect(html).toContain("Joueurs uniques");
    expect(html).toContain("Lots remis en caisse");
    expect(subject).toContain("34 joueurs");
  });

  it("TÉMOIN — un propriétaire les reçoit bien", () => {
    // Sans ce contrôle négatif, le test précédent serait vert sur un gabarit
    // qui n'affiche jamais aucun montant à personne.
    const { html } = render(stats());

    expect(html).toContain("Panier attribuable");
    expect(html).toContain("123,45 €");
  });
});

describe("la comparaison, seule raison d'ouvrir l'e-mail", () => {
  it("chaque chiffre porte son écart à la semaine précédente", () => {
    const { html } = render(stats());

    expect(html).toContain("+12"); // 34 joueurs contre 22
    expect(html).toContain("-9"); // 25 lots remis contre 34
    expect(html).toContain("stable"); // 40 lots gagnés contre 40
  });

  it("l'écart est DANS l'objet : « 34 joueurs » n'intéresse personne", () => {
    expect(render(stats()).subject).toBe(
      "📊 Votre semaine chez Chez Marco : 34 joueurs (+12)",
    );
  });

  it("une semaine identique se dit « stable », jamais « +0 »", () => {
    const { subject } = render(stats({ players: 22, prevPlayers: 22 }));
    expect(subject).toContain("(stable)");
    expect(subject).not.toContain("+0");
  });

  it("le singulier est respecté", () => {
    expect(render(stats({ players: 1, prevPlayers: 0 })).subject).toContain(
      "1 joueur (+1)",
    );
  });
});

describe("la sortie", () => {
  it("chaque rapport porte un lien de désabonnement", () => {
    // Un hebdomadaire sans issue finit en signalement de spam — qui coûte la
    // délivrabilité de TOUS les e-mails du domaine, code de gain compris.
    const { html } = render(stats());
    expect(html).toContain(SETTINGS_URL);
    expect(html).toContain("Ne plus le recevoir");
  });
});

describe("innocuité du contenu", () => {
  it("le nom du commerce et les libellés sont échappés", () => {
    const { html } = weeklyDigestEmailContent({
      organizationName: 'Chez "Marco" <script>',
      stats: stats({ topRewards: [{ label: "<img onerror=x>", count: 3 }] }),
      settingsUrl: SETTINGS_URL,
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img onerror");
    expect(html).toContain("&lt;script&gt;");
  });

  it("un top vide ne rend aucun bloc", () => {
    expect(render(stats({ topRewards: [] })).html).not.toContain("LES PLUS GAGNÉS");
  });
});
