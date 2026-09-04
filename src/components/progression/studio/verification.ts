import type { OrgProgressionSeason } from "@/lib/meta-progression";

/**
 * LES QUATRE CONDITIONS DE LANCEMENT, TRADUITES DE LA RPC — PAS DEVINÉES
 * (VIT-50).
 *
 * `activate_progression_season` (migration `20260805200000`) refuse tout ce qui
 * ne satisfait pas, littéralement :
 *
 *     status = 'draft'
 *     and ends_at > now()
 *     and exists (… progression_missions where enabled)
 *     and not exists (… autre saison where status = 'active')
 *
 * Réécrire ces conditions « à peu près » ici donnerait le pire des défauts d'un
 * écran de vérification : il annonce « prêt » sur une configuration que la base
 * refuse, ou l'inverse — et dans les deux cas le commerçant apprend la vérité
 * en cliquant, après avoir cru comprendre. C'est la même leçon que le prédicat
 * `estLotTirable` du Ticket d'Or (ADR-160), par un autre module.
 *
 * ── CE QUE CE FICHIER NE FAIT PAS ──
 *
 * Il ne LANCE rien et ne décide rien : il explique une décision que la RPC
 * prendra. Le lancement lui-même reste au tableau de bord, avec la clôture, la
 * suppression et l'archivage — voir l'en-tête de `etapes.ts`.
 */

export interface PointVerificationSaison {
  /** Ce que la condition exige, dit au commerçant. */
  libelle: string;
  ok: boolean;
  /** Ce qui manque, quand la condition n'est pas remplie. */
  manque: string;
}

export function verifierSaison(
  season: OrgProgressionSeason,
  /** Une AUTRE saison est déjà `active` — l'index unique partiel n'en veut qu'une. */
  autreSaisonActive: boolean,
  /** Injecté pour que la garde ne dépende pas de l'horloge de la machine. */
  maintenant: Date = new Date(),
): PointVerificationSaison[] {
  const missionsActives = season.missions.filter((m) => m.enabled);
  const fin = season.endsAt ? new Date(season.endsAt) : null;
  const finLisible = fin && !Number.isNaN(fin.getTime());

  return [
    {
      libelle: "La saison est encore en brouillon",
      ok: season.status === "draft",
      manque:
        season.status === "active"
          ? "Elle tourne déjà : ses missions avancent chez vos joueurs."
          : "Elle est close ou archivée. Une saison terminée ne se relance pas — créez-en une nouvelle.",
    },
    {
      libelle: "Sa date de fin n'est pas passée",
      ok: finLisible ? fin.getTime() > maintenant.getTime() : false,
      manque: finLisible
        ? "La fenêtre annoncée est déjà écoulée. Les dates d'une saison ne se corrigent pas : créez-en une nouvelle."
        : "Aucune date de fin lisible sur cette saison.",
    },
    {
      libelle: "Au moins une mission est activée",
      ok: missionsActives.length > 0,
      manque: season.missions.length
        ? "Vos missions existent mais sont toutes désactivées : rallumez-en une à l'étape « Vos missions »."
        : "Aucune mission : sans elle, personne ne gagne de clé et rien n'avance.",
    },
    {
      libelle: "Aucune autre saison ne tourne",
      ok: !autreSaisonActive,
      manque:
        "Une saison est déjà en cours. Clôturez-la d'abord — une seule peut tourner à la fois.",
    },
  ];
}

/** Prête au sens de la RPC : les quatre conditions, sans exception. */
export function saisonLancable(points: PointVerificationSaison[]): boolean {
  return points.every((point) => point.ok);
}
