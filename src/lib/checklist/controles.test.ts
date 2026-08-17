import { describe, expect, it } from "vitest";
import {
  normaliserControles,
  type ControleBrut,
  type ModuleChecklist,
} from "@/lib/checklist/controles";

function brut(cle: string, patch: Partial<ControleBrut> = {}): ControleBrut {
  return { cle, ok: false, titre: `T ${cle}`, detail: `D ${cle}`, ...patch };
}

const bloquantDe = (module: ModuleChecklist, c: ControleBrut) =>
  normaliserControles(module, [c])[0].bloquant;

describe("normaliserContrôles — les quatre modules qui tranchent eux-mêmes", () => {
  it.each(["quiz", "calendrier", "jackpot", "evenement"] as const)(
    "%s : lit le champ `bloquant` du contrôle, sans le redécider",
    (module) => {
      expect(bloquantDe(module, brut("questions", { bloquant: true }))).toBe(true);
      expect(bloquantDe(module, brut("questions", { bloquant: false }))).toBe(
        false,
      );
    },
  );

  it("un champ absent vaut non-bloquant : on ne teinte pas en rouge par défaut", () => {
    expect(bloquantDe("quiz", brut("inconnu"))).toBe(false);
  });
});

describe("normaliserContrôles — les modules dont la table décide", () => {
  it("la roue bloque sur la mécanique et les lots, pas sur le QR ni les dates", () => {
    for (const cle of ["mecanique", "defi", "lot-gagnant", "poids"]) {
      expect(bloquantDe("roue", brut(cle))).toBe(true);
    }
    for (const cle of ["qr", "fenetre"]) {
      expect(bloquantDe("roue", brut(cle))).toBe(false);
    }
  });

  it("la chasse bloque sur le parcours et le lot final", () => {
    expect(bloquantDe("chasse", brut("parcours"))).toBe(true);
    expect(bloquantDe("chasse", brut("lot"))).toBe(true);
    expect(bloquantDe("chasse", brut("stock"))).toBe(false);
    expect(bloquantDe("chasse", brut("fenetre"))).toBe(false);
  });

  it("le passeport ne bloque que sur l'existence d'un palier", () => {
    expect(bloquantDe("fidelite", brut("paliers"))).toBe(true);
    expect(bloquantDe("fidelite", brut("stock"))).toBe(false);
    expect(bloquantDe("fidelite", brut("roues"))).toBe(false);
  });

  it("les pronostics ne bloquent que sur la MATIÈRE à pronostiquer", () => {
    // Cette assertion disait l'inverse — « les pronostics ne bloquent RIEN,
    // aucune précondition serveur n'existe » — et c'était vrai : c'était le
    // défaut FIA-2 du wagon 4. `updateContest` oppose désormais
    // `blocageActivationContest` avant `set_contest_status` ; la table le suit,
    // et ce test épingle la nouvelle frontière plutôt que l'ancienne absence.
    expect(bloquantDe("pronostics", brut("matiere"))).toBe(true);
    // Les quatre autres AVERTISSENT toujours : un championnat sans palier de
    // récompense, sans subsidiaire ou sans email est un réglage légitime.
    for (const cle of ["recompenses", "echeances", "subsidiaire", "contact"]) {
      expect(bloquantDe("pronostics", brut(cle))).toBe(false);
    }
  });

  it("ignore un `bloquant` porté par un contrôle d'un module à table", () => {
    // La table est la vérité pour ces quatre modules : un champ qui traînerait
    // sur le contrôle ne doit pas la contredire en silence.
    expect(bloquantDe("roue", brut("qr", { bloquant: true }))).toBe(false);
  });

  it("une clé hors table est non-bloquante", () => {
    expect(bloquantDe("roue", brut("nouveau-controle"))).toBe(false);
    expect(bloquantDe("pronostics", brut("nouveau-controle"))).toBe(false);
  });
});

describe("normaliserContrôles — ce qui traverse", () => {
  it("préserve l'ordre, les clés, les titres et les détails", () => {
    const sortie = normaliserControles("roue", [
      brut("mecanique", { ok: true }),
      brut("qr"),
    ]);
    expect(sortie.map((c) => c.cle)).toEqual(["mecanique", "qr"]);
    expect(sortie[0]).toEqual({
      cle: "mecanique",
      ok: true,
      titre: "T mecanique",
      detail: "D mecanique",
      bloquant: true,
    });
  });

  it("rend une liste vide sur une entrée vide", () => {
    expect(normaliserControles("quiz", [])).toEqual([]);
  });
});
