import { describe, expect, it } from "vitest";

import {
  construireVerificationReserver,
  type ActiviteVerificationReserver,
  type CreneauVerificationReserver,
  type EntreeVerificationReserver,
} from "@/lib/activation/reserver";

const MAINTENANT = new Date("2026-08-07T12:00:00.000Z");
const DEMAIN = "2026-08-08T18:00:00.000Z";
const HIER = "2026-08-06T18:00:00.000Z";

function creneau(
  patch: Partial<CreneauVerificationReserver> = {},
): CreneauVerificationReserver {
  return { status: "open", startsAt: DEMAIN, remaining: 4, ...patch };
}

function activite(
  patch: Partial<ActiviteVerificationReserver> = {},
): ActiviteVerificationReserver {
  return {
    id: "a1",
    active: true,
    kind: "standard",
    slots: [creneau()],
    ...patch,
  };
}

function verif(patch: Partial<EntreeVerificationReserver> = {}) {
  return construireVerificationReserver({
    activites: [activite()],
    files: [],
    now: MAINTENANT,
    ...patch,
  });
}

const point = (etat: ReturnType<typeof verif>, cle: string) =>
  etat.controles.find((c) => c.cle === cle);

describe("le catalogue d'activités", () => {
  it("sans activité, il est le SEUL point émis", () => {
    const etat = verif({ activites: [] });
    expect(etat.controles.map((c) => c.cle)).toEqual(["activites"]);
    expect(etat.controles[0].ok).toBe(false);
    // « Aucun créneau ouvert » ne serait pas un second défaut : c'est le même.
    expect(point(etat, "creneaux")).toBeUndefined();
  });

  it("compte les activités du catalogue", () => {
    expect(point(verif(), "activites")).toMatchObject({ ok: true });
  });
});

describe("un créneau ouvert et à venir", () => {
  it("est vert dès qu'il en existe un", () => {
    expect(point(verif(), "creneaux")).toMatchObject({ ok: true });
  });

  it("LE PIÈGE DU BROUILLON : un agenda préparé, jamais ouvert", () => {
    // Un créneau NAÎT en brouillon et l'ouvrir est un second geste explicite.
    // Un commerçant qui a saisi sa semaine la veille croit son agenda en ligne.
    const controle = point(
      verif({ activites: [activite({ slots: [creneau({ status: "draft" })] })] }),
      "creneaux",
    )!;
    expect(controle.ok).toBe(false);
    expect(controle.detail).toContain("brouillon");
  });

  it("ne compte pas un créneau déjà passé", () => {
    const controle = point(
      verif({ activites: [activite({ slots: [creneau({ startsAt: HIER })] })] }),
      "creneaux",
    )!;
    expect(controle.ok).toBe(false);
  });

  it("UNE ACTIVITÉ COUPÉE FERME SES CRÉNEAUX, et le dit avec ses mots", () => {
    const controle = point(
      verif({ activites: [activite({ active: false })] }),
      "creneaux",
    )!;
    expect(controle.ok).toBe(false);
    expect(controle.detail).toContain("coupées");
  });

  it("dit « aucun créneau enregistré » quand l'agenda est vraiment vide", () => {
    const controle = point(
      verif({ activites: [activite({ slots: [] })] }),
      "creneaux",
    )!;
    expect(controle.ok).toBe(false);
    expect(controle.detail).toContain("Aucun créneau enregistré");
  });
});

describe("les places restantes", () => {
  it("N'EST PAS ÉMIS s'il n'y a aucun créneau ouvert à venir", () => {
    // Ce serait le contrôle précédent, dit une seconde fois.
    const etat = verif({
      activites: [activite({ slots: [creneau({ status: "draft" })] })],
    });
    expect(point(etat, "places")).toBeUndefined();
  });

  it("avertit — sans bloquer — quand tout est complet", () => {
    const etat = verif({
      activites: [activite({ slots: [creneau({ remaining: 0 })] })],
    });
    const controle = point(etat, "places")!;
    expect(controle.ok).toBe(false);
    expect(controle.detail).toContain("liste prioritaire");
    // Le créneau existe bel et bien : `creneaux` reste vert.
    expect(point(etat, "creneaux")).toMatchObject({ ok: true });
  });

  it("SUIT LE FORMAT : une place isolée sur un Atelier Duo n'est prenable par personne", () => {
    // Le verdict vient d'`etatUiCreneau`, partagé avec la page publique. Le
    // recopier ici aurait rejoué RES-5 : « 1 créneau ouvert » côté commerçant,
    // « complet » côté client.
    const etat = verif({
      activites: [
        activite({ kind: "duo", slots: [creneau({ remaining: 1 })] }),
      ],
    });
    expect(point(etat, "places")).toMatchObject({ ok: false });
  });
});

describe("les files d'accueil", () => {
  it("N'EST PAS ÉMIS sans file ouverte — ne pas en tenir est le cas dominant", () => {
    expect(point(verif(), "files-activite")).toBeUndefined();
    expect(point(verif({ files: [{ status: "closed", activityId: null }] }), "files-activite")).toBeUndefined();
  });

  it("est vert sur une file ouverte rattachée à une activité qui tourne", () => {
    expect(
      point(verif({ files: [{ status: "open", activityId: "a1" }] }), "files-activite"),
    ).toMatchObject({ ok: true });
  });

  it("une file « Comptoir » sans activité n'est jamais refermée", () => {
    expect(
      point(verif({ files: [{ status: "open", activityId: null }] }), "files-activite"),
    ).toMatchObject({ ok: true });
  });

  it("LE DÉFAUT MUET : « Ouverte » à l'écran, refusée par `queue_join`", () => {
    // `queue_join` referme la file quand son activité est coupée, mais la
    // pastille du tableau de bord se peint sur le seul `status` : le commerçant
    // lit « Ouverte » sur une file qui renvoie tout le monde.
    const etat = verif({
      activites: [activite({ active: false })],
      files: [{ status: "open", activityId: "a1" }],
    });
    const controle = point(etat, "files-activite")!;
    expect(controle.ok).toBe(false);
    expect(controle.detail).toContain("activité coupée");
  });

  it("une file rattachée à une activité inconnue de la liste ne crie pas au loup", () => {
    // La liste des activités est plafonnée à la lecture : une file peut pointer
    // une activité absente de cette page. Inventer un défaut là-dessus ferait
    // rougir un écran sur une donnée qu'il n'a pas.
    expect(
      point(
        verif({ files: [{ status: "open", activityId: "inconnue" }] }),
        "files-activite",
      ),
    ).toMatchObject({ ok: true });
  });
});

describe("ce que ce module ne prétend pas vérifier", () => {
  it("n'émet AUCUN point sur la capacité ni sur les offres de stock", () => {
    expect(verif().controles.map((c) => c.cle)).toEqual([
      "activites",
      "creneaux",
      "places",
    ]);
  });

  it("un agenda prêt est prêt", () => {
    const etat = verif({ files: [{ status: "open", activityId: "a1" }] });
    expect(etat.toutPret).toBe(true);
    expect(etat.ctaHref).toBe("/dashboard/moments");
  });
});
