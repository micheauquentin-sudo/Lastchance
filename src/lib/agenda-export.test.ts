// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  contenuIcs,
  ficheIcsDataUri,
  instantUtcCompact,
  lienGoogleAgenda,
  nomFichierIcs,
  type RendezVousAgenda,
} from "@/lib/agenda-export";

/**
 * RDV-4 — l'ajout d'un rendez-vous à l'agenda du client.
 *
 * Deux propriétés portent ce fichier :
 *
 *  1. AUCUN SECRET N'ENTRE DANS L'ÉVÉNEMENT. Un fichier d'agenda se synchronise
 *     vers des serveurs tiers, se partage et se sauvegarde. Y écrire le code de
 *     retrait reviendrait à le diffuser.
 *
 *  2. LE FICHIER S'OUVRE VRAIMENT. Les séparateurs CRLF et l'échappement des
 *     virgules sont les deux défauts qui font qu'un `.ics` maison « ne s'ouvre
 *     pas » — sans message, et seulement chez certains clients.
 */

const RDV: RendezVousAgenda = {
  titre: "Coupe",
  commerce: "Le Salon",
  debut: "2026-09-08T12:00:00.000Z",
  fin: "2026-09-08T12:30:00.000Z",
};

describe("instantUtcCompact", () => {
  it("rend la forme attendue par Google et l'iCalendar", () => {
    expect(instantUtcCompact("2026-09-08T12:00:00.000Z")).toBe("20260908T120000Z");
  });

  it("convertit en UTC un instant donné avec décalage", () => {
    // 14 h à Paris en septembre = 12 h UTC.
    expect(instantUtcCompact("2026-09-08T14:00:00+02:00")).toBe("20260908T120000Z");
  });

  it("rend null sur une date illisible plutôt qu'un instant faux", () => {
    expect(instantUtcCompact("pas une date")).toBeNull();
    expect(instantUtcCompact("")).toBeNull();
  });
});

describe("lienGoogleAgenda", () => {
  it("compose un lien de PRÉ-REMPLISSAGE, qui n'écrit rien", () => {
    const lien = lienGoogleAgenda(RDV);
    expect(lien).toContain("https://calendar.google.com/calendar/render");
    // `action=TEMPLATE` ouvre le formulaire de création : nous ne touchons
    // jamais à l'agenda du client, nous lui proposons un brouillon.
    expect(lien).toContain("action=TEMPLATE");
    expect(lien).toContain("dates=20260908T120000Z%2F20260908T123000Z");
  });

  it("nomme la prestation ET le commerce", () => {
    const lien = lienGoogleAgenda(RDV) ?? "";
    const params = new URL(lien).searchParams;
    expect(params.get("text")).toBe("Coupe — Le Salon");
  });

  it("porte le lieu et les détails quand ils existent, et rien sinon", () => {
    const avec = new URL(
      lienGoogleAgenda({ ...RDV, lieu: "12 rue des Lilas", details: "Merci !" }) ?? "",
    ).searchParams;
    expect(avec.get("location")).toBe("12 rue des Lilas");
    expect(avec.get("details")).toBe("Merci !");

    const sans = new URL(lienGoogleAgenda(RDV) ?? "").searchParams;
    expect(sans.has("location")).toBe(false);
    expect(sans.has("details")).toBe(false);
  });

  it("échappe ce qui casserait l'adresse", () => {
    const lien =
      lienGoogleAgenda({ ...RDV, commerce: "Chez Léa & Cie / Bar" }) ?? "";
    // L'URL doit rester analysable, et le nom revenir intact.
    expect(new URL(lien).searchParams.get("text")).toBe(
      "Coupe — Chez Léa & Cie / Bar",
    );
  });

  it("rend null sur un instant illisible", () => {
    expect(lienGoogleAgenda({ ...RDV, debut: "bidon" })).toBeNull();
  });
});

describe("contenuIcs", () => {
  const MAINTENANT = "2026-09-01T10:00:00.000Z";

  it("sépare ses lignes par CRLF — Outlook refuse le reste", () => {
    const ics = contenuIcs(RDV, "rdv-1", MAINTENANT) ?? "";
    expect(ics).toContain("\r\n");
    // Aucun `\n` qui ne soit précédé d'un `\r`.
    expect(/[^\r]\n/.test(ics)).toBe(false);
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("porte l'enveloppe et l'événement attendus", () => {
    const ics = contenuIcs(RDV, "rdv-1", MAINTENANT) ?? "";
    for (const ligne of [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:rdv-1",
      "DTSTAMP:20260901T100000Z",
      "DTSTART:20260908T120000Z",
      "DTEND:20260908T123000Z",
      "SUMMARY:Coupe — Le Salon",
      "END:VEVENT",
      "END:VCALENDAR",
    ]) {
      expect(ics, ligne).toContain(ligne);
    }
  });

  it("échappe virgules, points-virgules et retours à la ligne", () => {
    // Une virgule non échappée coupe la valeur en deux : l'événement arrive
    // tronqué, et seulement pour certains noms de commerce.
    const ics =
      contenuIcs(
        { ...RDV, commerce: "Chez Léa, Coiffure; Barbier", details: "Ligne 1\nLigne 2" },
        "rdv-2",
        MAINTENANT,
      ) ?? "";
    expect(ics).toContain("Chez Léa\\, Coiffure\\; Barbier");
    expect(ics).toContain("DESCRIPTION:Ligne 1\\nLigne 2");
  });

  it("garde l'UID fourni : deux ajouts METTENT À JOUR le même événement", () => {
    const a = contenuIcs(RDV, "reservation-42", MAINTENANT) ?? "";
    const b = contenuIcs(RDV, "reservation-42", "2026-09-02T10:00:00.000Z") ?? "";
    expect(a).toContain("UID:reservation-42");
    expect(b).toContain("UID:reservation-42");
    // Seul l'horodatage d'émission diffère.
    expect(a).not.toBe(b);
  });

  it("omet lieu et description quand ils n'existent pas", () => {
    const ics = contenuIcs(RDV, "rdv-3", MAINTENANT) ?? "";
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("rend null sur un instant illisible", () => {
    expect(contenuIcs({ ...RDV, fin: "bidon" }, "x", MAINTENANT)).toBeNull();
    expect(contenuIcs(RDV, "x", "bidon")).toBeNull();
  });
});

describe("aucun secret dans l'événement", () => {
  it("ne transporte jamais un code de retrait, même passé en détails", () => {
    // La garde est à l'APPELANT : ce test fixe le contrat que les deux
    // fabriques n'ajoutent RIEN d'elles-mêmes. Ce qui n'est pas dans `rdv`
    // n'entre pas dans l'événement.
    const rdv: RendezVousAgenda = { ...RDV, details: "À bientôt" };
    const ics = contenuIcs(rdv, "rdv-4", "2026-09-01T10:00:00.000Z") ?? "";
    const lien = lienGoogleAgenda(rdv) ?? "";

    for (const secret of ["RESA-", "code", "@", "token"]) {
      expect(ics.toLowerCase(), secret).not.toContain(secret.toLowerCase());
      expect(decodeURIComponent(lien).toLowerCase(), secret).not.toContain(
        secret.toLowerCase(),
      );
    }
  });
});

describe("ficheIcsDataUri", () => {
  it("encode les accents, là où btoa aurait levé", () => {
    // « Dégustation » suffit à faire échouer `btoa` : hors Latin-1.
    const uri = ficheIcsDataUri("SUMMARY:Dégustation\r\n");
    expect(uri.startsWith("data:text/calendar;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(uri.split(",").slice(1).join(","))).toContain(
      "Dégustation",
    );
  });
});

describe("nomFichierIcs", () => {
  it("retire accents et espaces, et garde l'extension", () => {
    expect(nomFichierIcs("Dégustation de vins")).toBe("degustation-de-vins.ics");
    expect(nomFichierIcs("Coupe / Brushing")).toBe("coupe-brushing.ics");
  });

  it("retombe sur un nom générique plutôt que sur une extension nue", () => {
    expect(nomFichierIcs("   ")).toBe("rendez-vous.ics");
    expect(nomFichierIcs("!!!")).toBe("rendez-vous.ics");
  });
});
