import { describe, expect, it } from "vitest";

import {
  calculerFenetres,
  DUREE_MAX_JOURS,
  estVivant,
  LIBELLE_ETAT,
  ouvreLeModule,
  type EtatOctroi,
} from "./module-grants";

const MAINTENANT = new Date("2026-06-15T12:00:00Z");
const JOUR = 86_400_000;

function dans(jours: number): string {
  return new Date(MAINTENANT.getTime() + jours * JOUR).toISOString();
}

describe("calculerFenetres — un pass démarré tout de suite", () => {
  it("pose la fenêtre de jeu, et AUCUN délai d'activation", () => {
    const v = calculerFenetres(
      { module: "hunts", kind: "pass", demarrage: "maintenant", dureeJours: 30 },
      MAINTENANT,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.fenetres.starts_at).toBe(MAINTENANT.toISOString());
    expect(v.fenetres.ends_at).toBe(dans(30));
    // Un octroi déjà démarré n'a plus de date limite de démarrage : la laisser
    // ferait croire à une contrainte qui ne décide plus rien.
    expect(v.fenetres.activate_by).toBeNull();
  });

  it("refuse une durée absente, nulle ou hors bornes", () => {
    for (const duree of [null, 0, -1, DUREE_MAX_JOURS + 1]) {
      const v = calculerFenetres(
        { module: "quiz", kind: "pass", demarrage: "maintenant", dureeJours: duree },
        MAINTENANT,
      );
      expect(v.ok, `durée ${duree}`).toBe(false);
    }
  });
});

describe("calculerFenetres — un pass acheté mais pas démarré", () => {
  it("ne pose QUE la date limite de démarrage", () => {
    const v = calculerFenetres(
      { module: "calendar", kind: "pass", demarrage: "a_activer", delaiActivationJours: 90 },
      MAINTENANT,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    // Le point qui compte : ni début ni fin. C'est l'état `pending`, qui
    // n'ouvre rien — et la contrainte `grant_fin_apres_debut` refuserait de
    // toute façon une fin posée sans début.
    expect(v.fenetres.starts_at).toBeNull();
    expect(v.fenetres.ends_at).toBeNull();
    expect(v.fenetres.activate_by).toBe(dans(90));
  });

  it("refuse un délai hors bornes", () => {
    const v = calculerFenetres(
      { module: "calendar", kind: "pass", demarrage: "a_activer", delaiActivationJours: 0 },
      MAINTENANT,
    );
    expect(v.ok).toBe(false);
  });
});

describe("calculerFenetres — un droit récurrent", () => {
  it("court dès maintenant et n'a pas de terme", () => {
    const v = calculerFenetres(
      { module: "loyalty", kind: "recurring", demarrage: "maintenant" },
      MAINTENANT,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.fenetres.starts_at).toBe(MAINTENANT.toISOString());
    expect(v.fenetres.ends_at).toBeNull();
    expect(v.fenetres.activate_by).toBeNull();
  });

  it("REFUSE un démarrage différé — il n'y a aucun compteur à déclencher", () => {
    // Ce n'est pas une coquetterie : un récurrent « à activer » produirait une
    // ligne `pending` qu'aucun geste ne pourrait jamais faire démarrer, donc
    // un droit payé et inatteignable.
    const v = calculerFenetres(
      { module: "loyalty", kind: "recurring", demarrage: "a_activer", delaiActivationJours: 90 },
      MAINTENANT,
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.erreur).toContain("récurrent");
  });
});

describe("calculerFenetres — la jauge", () => {
  it("est reportée telle quelle quand elle est valide", () => {
    const v = calculerFenetres(
      { module: "events", kind: "pass", demarrage: "maintenant", dureeJours: 1, jauge: 30 },
      MAINTENANT,
    );
    expect(v.ok && v.fenetres.capacity).toBe(30);
  });

  it("refuse une jauge non entière ou hors bornes", () => {
    for (const jauge of [0, 501, 12.5]) {
      const v = calculerFenetres(
        { module: "events", kind: "pass", demarrage: "maintenant", dureeJours: 1, jauge },
        MAINTENANT,
      );
      expect(v.ok, `jauge ${jauge}`).toBe(false);
    }
  });

  it("absente, elle reste nulle plutôt que zéro", () => {
    // Zéro serait une jauge RÉELLE de zéro joueur, et le gel en base la
    // rendrait ensuite immodifiable.
    const v = calculerFenetres(
      { module: "events", kind: "pass", demarrage: "maintenant", dureeJours: 1 },
      MAINTENANT,
    );
    expect(v.ok && v.fenetres.capacity).toBeNull();
  });
});

describe("estVivant — port TypeScript de org_has_live_module_grant", () => {
  const base = { starts_at: dans(-1), ends_at: dans(29), revoked_at: null };

  it("vrai dans la fenêtre", () => {
    expect(estVivant(base, MAINTENANT)).toBe(true);
  });

  it("faux passé la fin — c'est la pause à l'échéance", () => {
    expect(estVivant({ ...base, ends_at: dans(-1) }, MAINTENANT)).toBe(false);
  });

  it("faux avant le début", () => {
    expect(estVivant({ ...base, starts_at: dans(1) }, MAINTENANT)).toBe(false);
  });

  it("faux si jamais démarré", () => {
    expect(estVivant({ ...base, starts_at: null }, MAINTENANT)).toBe(false);
  });

  it("faux si révoqué, MÊME dans sa fenêtre", () => {
    expect(estVivant({ ...base, revoked_at: dans(-0.5) }, MAINTENANT)).toBe(false);
  });

  it("vrai sans fin — un récurrent en cours", () => {
    expect(estVivant({ ...base, ends_at: null }, MAINTENANT)).toBe(true);
  });
});

describe("le vocabulaire affiché", () => {
  it("couvre les six états, et un seul ouvre le module", () => {
    const etats: EtatOctroi[] = [
      "live",
      "scheduled",
      "pending",
      "expired",
      "activation_expired",
      "revoked",
    ];
    for (const e of etats) {
      expect(LIBELLE_ETAT[e], e).toBeTruthy();
      // Le libellé dit la conséquence, pas l'état technique : aucun d'eux ne
      // doit être le mot de la base recopié.
      expect(LIBELLE_ETAT[e]).not.toBe(e);
    }
    expect(etats.filter(ouvreLeModule)).toEqual(["live"]);
  });
});
