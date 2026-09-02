import type { EtatHorairesVitrine } from "@/lib/vitrine-horaires";
import {
  VITRINE_JOURS,
  libelleJour,
  type JourVitrine,
  type LangueVitrine,
} from "@/lib/vitrine";

/**
 * LA PHRASE DE LA PASTILLE, ET SON HABILLAGE (VIT-31c).
 *
 * ── CE FICHIER NE PORTE PAS « use client », ET C'EST VOULU ──
 *
 * `PastilleOuverture` est le SEUL rendu de la pastille du hero : celle écrite
 * à la main (chemin serveur — aucune vitrine existante n'y gagne un octet de
 * JavaScript) et celle calculée (chemin client, dans `horaires-pastille.tsx`)
 * passent toutes les deux par lui. Marquer ce module « use client » aurait
 * fait basculer TOUTES les vitrines dans le bundle client pour une pastille de
 * seize caractères qu'elles n'ont jamais demandée.
 *
 * ── LA PHRASE EST PURE, ET C'EST CE QUI LA REND TESTABLE ──
 *
 * `texteEtatHoraires` ne lit pas l'horloge : elle reçoit le verdict déjà
 * calculé et le jour courant. Même arbitrage que `etatHoraires`, pour la même
 * raison — une phrase qui dépend de `new Date()` ne s'assure qu'avec de faux
 * chronomètres, c'est-à-dire pas du tout.
 *
 * ── LES MOTS SONT ICI, PAS DANS `src/lib/vitrine.ts` ──
 *
 * Deux libellés dans deux langues, lus par un seul composant. Les poser dans
 * le dictionnaire public aurait ajouté une clé à tenir dans toutes les langues
 * du module pour un texte que rien d'autre n'affiche.
 */

/**
 * `"23:00"` → « 23h », `"23:30"` → « 23h30 », `"09:00"` → « 9h ».
 *
 * Le zéro de tête est OBLIGATOIRE en base — c'est lui qui fait que l'ordre
 * alphabétique de deux heures est leur ordre chronologique — et ILLISIBLE à
 * l'écran : « ouvre à 09h » n'est pas la façon dont on lit l'heure d'une
 * porte. On le retire au dernier moment, à l'affichage, jamais dans la donnée.
 *
 * L'anglais garde `HH:MM` sur vingt-quatre heures : « 11pm » aurait demandé de
 * choisir entre am/pm et la notation continue selon le pays anglophone, une
 * question sans bonne réponse pour un commerce français dont la page est
 * traduite.
 */
export function formaterHeure(heure: string, lang: LangueVitrine): string {
  if (lang === "en") return heure;
  const [hh, mm] = heure.split(":");
  return mm === "00" ? `${Number(hh)}h` : `${Number(hh)}h${mm}`;
}

const MOTS = {
  fr: {
    ouvert: "Ouvert",
    ferme: "Fermé",
    fermeA: (h: string) => `ferme à ${h}`,
    ouvreA: (h: string) => `ouvre à ${h}`,
    ouvreDemain: (h: string) => `ouvre demain à ${h}`,
    ouvreJour: (j: string, h: string) => `ouvre ${j.toLowerCase()} à ${h}`,
  },
  en: {
    ouvert: "Open",
    ferme: "Closed",
    fermeA: (h: string) => `closes at ${h}`,
    ouvreA: (h: string) => `opens at ${h}`,
    ouvreDemain: (h: string) => `opens tomorrow at ${h}`,
    ouvreJour: (j: string, h: string) => `opens ${j} at ${h}`,
  },
} as const;

/**
 * « Ouvert · ferme à 23h », « Fermé · ouvre demain à 12h ».
 *
 * @param etat            Le verdict de `etatHoraires`.
 * @param lang            La langue de la page.
 * @param jourAujourdhui  Le jour courant DANS LE FUSEAU DU COMMERCE, ou `null`
 *                        s'il n'a pas pu être lu. Il ne sert qu'à dire
 *                        « demain » plutôt que « mardi » — nuance qui, sur une
 *                        page ouverte à table, évite de compter les jours.
 * @returns `null` quand il n'y a RIEN à annoncer. L'appelant retombe alors sur
 *          la pastille écrite à la main : `inconnu` n'est PAS « fermé ».
 */
export function texteEtatHoraires(
  etat: EtatHorairesVitrine,
  lang: LangueVitrine,
  jourAujourdhui: JourVitrine | null,
): string | null {
  const mots = lang === "en" ? MOTS.en : MOTS.fr;

  if (etat.etat === "inconnu") return null;

  if (etat.etat === "ouvert") {
    return `${mots.ouvert} · ${mots.fermeA(formaterHeure(etat.fermeA, lang))}`;
  }

  // Fermé sans réouverture connue : la semaine est explicitement vide. On dit
  // « Fermé », et surtout pas une heure inventée pour compléter la phrase.
  if (!etat.prochaine) return mots.ferme;

  const heure = formaterHeure(etat.prochaine.heure, lang);
  if (etat.prochaine.aujourdhui) {
    return `${mots.ferme} · ${mots.ouvreA(heure)}`;
  }

  const demain =
    jourAujourdhui !== null
      ? VITRINE_JOURS[(VITRINE_JOURS.indexOf(jourAujourdhui) + 1) % 7]
      : null;
  if (demain !== null && etat.prochaine.jour === demain) {
    return `${mots.ferme} · ${mots.ouvreDemain(heure)}`;
  }

  return `${mots.ferme} · ${mots.ouvreJour(
    libelleJour(etat.prochaine.jour, lang),
    heure,
  )}`;
}

/**
 * L'HABILLAGE — repris tel quel du hero, sans une classe de plus.
 *
 * Il a été extrait pour que la pastille calculée et la pastille écrite à la
 * main soient le MÊME objet à l'écran. Deux copies auraient divergé au premier
 * réglage d'allure, et le commerçant aurait vu son aperçu changer d'apparence
 * le jour où il saisit ses horaires.
 */
export function PastilleOuverture({ texte }: { texte: string }) {
  return (
    <p className="mt-3.5 inline-flex items-center gap-[7px] rounded-full bg-black/35 px-3 py-1.5 text-[9.5px] font-semibold uppercase leading-none tracking-[0.1em] text-white backdrop-blur-sm">
      {/* La pastille verte est DÉCORATIVE : le texte dit déjà « Ouvert », et
          l'annoncer ferait entendre une couleur. */}
      <span aria-hidden className="size-1.5 rounded-full bg-[#8fd6a0]" />
      {texte}
    </p>
  );
}
