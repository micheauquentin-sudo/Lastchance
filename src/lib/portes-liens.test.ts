import { describe, expect, it } from "vitest";

import { liensDesPortes } from "./portes-liens";
import { mapPortesVitrine } from "./vitrine";

/**
 * `liensDesPortes` — la traduction d'une porte en adresse.
 *
 * POURQUOI CE FICHIER : le passeport de fidélité et la Vitrine peignent
 * désormais la MÊME liste d'animations. Ce qu'ils partagent réellement est ici,
 * et une adresse fausse y enverrait deux écrans sur un 404 au lieu d'un.
 *
 * Les portes d'entrée passent par `mapPortesVitrine` — le lecteur défensif du
 * document `jsonb` — plutôt que par un littéral typé à la main : c'est la forme
 * qu'un appelant reçoit réellement de `vitrine_public_state`.
 */
describe("liensDesPortes", () => {
  it("traduit les six familles en adresses publiques, réserver d'abord", () => {
    const portes = mapPortesVitrine({
      reserver: {
        activites: [{ id: "act-1", nom: "Table du soir" }],
        files: [{ id: "file-1", nom: "File du comptoir" }],
        offres: [{ id: "offre-1", nom: "Panier surprise" }],
      },
      experiences: {
        quiz: [{ slug: "quiz-du-jeudi", titre: "Quiz du jeudi" }],
        calendars: [{ slug: "avent-2026", titre: "Calendrier de l'Avent" }],
        pronostics: [{ slug: "ligue-1", titre: "Pronos Ligue 1" }],
        duo: true,
      },
    });

    expect(liensDesPortes(portes)).toEqual([
      {
        cle: "activite:act-1",
        href: "/reserver/act-1",
        nom: "Table du soir",
        famille: "reserver",
      },
      {
        cle: "file:file-1",
        href: "/reserver/file/file-1",
        nom: "File du comptoir",
        famille: "reserver",
      },
      {
        cle: "offre:offre-1",
        href: "/reserver/stock/offre-1",
        nom: "Panier surprise",
        famille: "reserver",
      },
      {
        cle: "quiz:quiz-du-jeudi",
        href: "/quiz/quiz-du-jeudi",
        nom: "Quiz du jeudi",
        famille: "experience",
      },
      {
        cle: "calendar:avent-2026",
        href: "/calendar/avent-2026",
        nom: "Calendrier de l'Avent",
        famille: "experience",
      },
      {
        cle: "pronos:ligue-1",
        href: "/pronos/ligue-1",
        nom: "Pronos Ligue 1",
        famille: "experience",
      },
    ]);
  });

  it("rien d'ouvert : une liste vide, jamais une entrée fantôme", () => {
    // Le Duo Miroir est OUVERT ici et ne doit produire AUCUN lien : son adresse
    // (`/lobby/nouveau/{slug}`) a besoin du slug de la Vitrine, que les portes
    // ne portent pas. Rouge si quelqu'un l'ajoutait avec un slug deviné.
    const portes = mapPortesVitrine({
      reserver: { activites: [], files: [], offres: [] },
      experiences: { quiz: [], calendars: [], pronostics: [], duo: true },
    });

    expect(liensDesPortes(portes)).toEqual([]);
  });

  it("les clés sont uniques même si un identifiant se répète d'une famille à l'autre", () => {
    // Une activité et une file peuvent porter le même identifiant : la clé de
    // rendu est préfixée par la famille, sinon React verrait deux frères
    // identiques et n'en peindrait qu'un.
    const portes = mapPortesVitrine({
      reserver: {
        activites: [{ id: "meme-id", nom: "Table" }],
        files: [{ id: "meme-id", nom: "File" }],
        offres: [],
      },
      experiences: { quiz: [], calendars: [], pronostics: [], duo: false },
    });

    const cles = liensDesPortes(portes).map((l) => l.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });
});
