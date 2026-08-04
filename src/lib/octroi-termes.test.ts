import { describe, expect, it } from "vitest";

import {
  moduleDepuisEntitlement,
  termesDepuisCatalogue,
} from "./octroi-termes";
import { ADDON_OFFERS, findAddonOffer } from "./plans";
import { GRANTABLE_MODULES } from "./subscription";

const ACHAT = new Date("2026-06-15T12:00:00.000Z");
const JOUR = 86_400_000;

function termes(entitlement: Parameters<typeof termesDepuisCatalogue>[0], jauge: number | null = null) {
  const v = termesDepuisCatalogue(entitlement, ACHAT, jauge);
  if (!v.ok) throw new Error(`verdict inattendu : ${v.erreur}`);
  return v.termes;
}

describe("termesDepuisCatalogue — les huit add-ons du catalogue", () => {
  it("chaque add-on vendu sait produire des termes d'octroi", () => {
    // Garde DÉRIVÉE du catalogue : un neuvième add-on ajouté demain fait
    // rougir ce test tant que son modèle de facturation n'est pas traité.
    // Sans elle, un modèle non géré rendrait `undefined` au webhook, et le
    // paiement encaissé n'ouvrirait rien.
    for (const offre of ADDON_OFFERS) {
      const jauge =
        offre.billing.model === "capacity-pass"
          ? offre.billing.steps[0].maxPlayers
          : null;
      const v = termesDepuisCatalogue(offre.entitlement, ACHAT, jauge);
      expect(v.ok, `${offre.entitlement} : ${v.ok ? "" : v.erreur}`).toBe(true);
    }
  });

  it("les huit add-ons sont tous des modules octroyables", () => {
    // Sinon un paiement encaissé désignerait un module que la base refuse,
    // et le `check` de la colonne ferait échouer le webhook APRÈS le débit.
    for (const offre of ADDON_OFFERS) {
      expect(
        moduleDepuisEntitlement(offre.entitlement, GRANTABLE_MODULES),
        `${offre.entitlement} n'est pas un module octroyable`,
      ).not.toBeNull();
    }
  });

  it("`core` n'est pas un module octroyable", () => {
    // Contre-exemple : sans lui, une fonction qui rendrait toujours son entrée
    // passerait le test précédent. `core` est le socle, il ne s'achète pas
    // comme un add-on.
    expect(moduleDepuisEntitlement("core", GRANTABLE_MODULES)).toBeNull();
  });
});

describe("termesDepuisCatalogue — récurrent", () => {
  it("démarre tout de suite et n'a PAS de terme", () => {
    const t = termes("loyalty");
    expect(t.kind).toBe("recurring");
    expect(t.starts_at).toBe(ACHAT.toISOString());
    // LE POINT : écrire une fin à trente jours paraîtrait prudent et couperait
    // le module d'un client à jour de ses paiements au premier renouvellement.
    // La fin d'un récurrent vient de Stripe, par révocation.
    expect(t.ends_at).toBeNull();
    expect(t.activate_by).toBeNull();
  });
});

describe("termesDepuisCatalogue — achat unique à fenêtre", () => {
  it("n'ouvre RIEN à l'achat : ni début, ni fin", () => {
    const t = termes("hunts");
    expect(t.kind).toBe("pass");
    // C'est l'état `pending` de `org_module_grant_state`. Sans cela, les
    // « 30 jours » payés s'écouleraient pendant que le commerçant rédige ses
    // lots — il paierait une animation et en consommerait la préparation.
    expect(t.starts_at).toBeNull();
    expect(t.ends_at).toBeNull();
  });

  it("borne la date limite de démarrage sur la fenêtre du catalogue", () => {
    const offre = findAddonOffer("hunts");
    if (offre?.billing.model !== "one-off-window") throw new Error("catalogue changé");
    const attendu = new Date(
      ACHAT.getTime() + offre.billing.activationWindowDays * JOUR,
    ).toISOString();
    // Comparé à la valeur LUE dans le catalogue, jamais à 90 écrit à la main :
    // un test qui recopie la constante qu'il vérifie ne vérifie rien.
    expect(termes("hunts").activate_by).toBe(attendu);
  });
});

describe("termesDepuisCatalogue — pass à jauge", () => {
  it("accepte une jauge qui correspond à un palier vendu", () => {
    const offre = findAddonOffer("events");
    if (offre?.billing.model !== "capacity-pass") throw new Error("catalogue changé");
    for (const palier of offre.billing.steps) {
      expect(termes("events", palier.maxPlayers).capacity).toBe(palier.maxPlayers);
    }
  });

  it("REFUSE une jauge hors des paliers vendus", () => {
    // Le défaut que ça ferme : un appelant qui poste 500 obtiendrait la jauge
    // du palier le plus cher au prix du moins cher. La jauge est « choisie
    // avant paiement et jamais ajustée » (cahier §2) — encore faut-il qu'elle
    // corresponde à quelque chose qui a été vendu.
    const v = termesDepuisCatalogue("events", ACHAT, 500);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.erreur).toContain("500");
  });

  it("REFUSE une jauge absente", () => {
    expect(termesDepuisCatalogue("events", ACHAT, null).ok).toBe(false);
  });
});

describe("termesDepuisCatalogue — une compétition", () => {
  it("pose le plafond dur du catalogue comme fin", () => {
    const offre = findAddonOffer("pronostics");
    if (offre?.billing.model !== "single-competition") throw new Error("catalogue changé");
    const t = termes("pronostics");
    expect(t.starts_at).toBe(ACHAT.toISOString());
    expect(t.ends_at).toBe(
      new Date(ACHAT.getTime() + offre.billing.hardCapMonths * 30 * JOUR).toISOString(),
    );
  });

  it("le plafond dépasse largement une saison de championnat", () => {
    // Le sens de l'approximation est délibéré et vérifié ici : trop LONG
    // laisse un droit ouvert un peu plus que dû, trop court couperait une
    // Ligue 1 en plein milieu — ce que le cahier interdit explicitement.
    const t = termes("pronostics");
    const dureeJours = (new Date(t.ends_at!).getTime() - ACHAT.getTime()) / JOUR;
    expect(dureeJours).toBeGreaterThan(300);
  });
});

describe("termesDepuisCatalogue — ce qui n'est pas au catalogue", () => {
  it("rend un verdict de refus, jamais une exception", () => {
    // L'appelant est un webhook : lever ferait rejouer Stripe indéfiniment sur
    // un événement que rien ne réparera.
    const v = termesDepuisCatalogue("core", ACHAT);
    expect(v.ok).toBe(false);
  });
});
