import {
  VITRINE_JOURS,
  type CreneauVitrine,
  type HorairesVitrine,
  type JourVitrine,
} from "@/lib/vitrine";

// ────────────────────────────────────────────────────────────
// « OUVERT · FERME À 23H » — LE CALCUL, ET RIEN QUE LE CALCUL (VIT-31)
//
// Ce module ne connaît ni React, ni Supabase, ni l'heure qu'il est. Il répond à
// une seule question : « à cet instant-là, dans ce fuseau-là, avec cette
// semaine-là, ouvert ou fermé, et jusqu'à quand ? »
//
// ── L'INSTANT EST UN PARAMÈTRE, ET C'EST LA DÉCISION CENTRALE ──
//
// `new Date()` à l'intérieur aurait rendu la fonction INTESTABLE : chaque
// assertion aurait dû mentir sur l'horloge (faux timers) ou ne rien prouver.
// Le paramètre déplace le problème d'un cran vers l'appelant, où il est trivial
// — le serveur passe `new Date()`, un test passe une date écrite en clair.
//
// ── ON NE REND PAS UN `Date`, ON REND UN JOUR ET UNE HEURE MURALE ──
//
// « ouvre lundi à 09:00 » est une phrase que l'on peut afficher sans savoir si
// le changement d'heure tombe entre-temps. Rendre un instant absolu aurait
// exigé une vraie arithmétique de calendrier dans un fuseau arbitraire —
// c'est-à-dire une bibliothèque de dates, pour un badge de seize caractères.
//
// ── CE QUE CETTE FONCTION NE SAIT PAS, ET IL FAUT LE DIRE ──
//
//   * LES JOURS FÉRIÉS. Rien dans la semaine ne les porte, et rien ici ne les
//     devine. C'est précisément pour cela que `horaires_texte` et
//     `badge_ouverture` (VIT-13) RESTENT : le 25 décembre, la phrase écrite à
//     la main est la seule qui dise vrai.
//   * MINUIT. Un créneau ne le franchit pas (`de < a`, garanti par le `check`
//     SQL). Un bar ouvert jusqu'à 2 h s'écrit `23:59` la veille puis `00:00` le
//     lendemain : à 23 h 30 la page annonce donc « ferme à 23:59 », ce qui est
//     inexact d'une minute et jamais dans le sens qui fait déplacer un client
//     pour rien. La forme franchissant minuit a été écartée en base parce
//     qu'elle rendait le tri et le chevauchement ambigus (voir l'en-tête de
//     20261201120000).
//
// ── DANS LE DOUTE, ON N'AFFIRME RIEN ──
//
// Horaires absents, fuseau refusé par l'environnement, semaine entièrement
// vide : le verdict est `inconnu` ou `ferme`, jamais `ouvert`. Un « Ouvert »
// faux sur une page publique fait déplacer un client pour rien — c'est la
// doctrine posée avec `badge_ouverture`, et ce module ne s'en écarte nulle
// part.
// ────────────────────────────────────────────────────────────

/** Le prochain moment d'ouverture, tel qu'il s'affiche. */
export interface ProchaineOuvertureVitrine {
  jour: JourVitrine;
  /** L'heure murale `HH:MM` dans le fuseau du COMMERCE. */
  heure: string;
  /** `true` quand c'est plus tard dans la même journée locale. */
  aujourdhui: boolean;
}

/**
 * Le verdict.
 *
 * `inconnu` n'est PAS « fermé » : c'est « la page n'a rien à annoncer », et
 * l'écran doit alors s'en tenir à `horaires_texte` et `badge_ouverture`, comme
 * avant VIT-31. Les confondre aurait affiché « Fermé » sur toutes les vitrines
 * qui n'ont jamais rien structuré.
 */
export type EtatHorairesVitrine =
  | { etat: "inconnu" }
  | { etat: "ouvert"; fermeA: string }
  | { etat: "ferme"; prochaine: ProchaineOuvertureVitrine | null };

const INCONNU: EtatHorairesVitrine = { etat: "inconnu" };

/** L'heure murale locale, décomposée — ou `null` si le fuseau est refusé. */
interface InstantLocal {
  jour: JourVitrine;
  /** `HH:MM`, comparable au texte des créneaux. */
  heure: string;
}

/**
 * Lit l'instant DANS LE FUSEAU DU COMMERCE, sans bibliothèque de dates.
 *
 * `Intl.DateTimeFormat` fait tout le travail difficile — décalage courant,
 * heure d'été, zones à demi-heure — et c'est la seule brique du runtime qui
 * connaisse la base de données IANA.
 *
 * LE JOUR DE LA SEMAINE N'EST PAS DEMANDÉ À `Intl` : on lui demande la DATE
 * civile locale, puis on en déduit le jour arithmétiquement. `weekday` aurait
 * rendu du texte dépendant de la locale passée (« Mon », « lun. ») — un
 * vocabulaire à réaligner à chaque version d'ICU, pour une information que
 * `Date.UTC` donne sans ambiguïté.
 *
 * Un fuseau inconnu fait LEVER `Intl` : on rend `null`, l'appelant répondra
 * `inconnu`. Deviner « probablement Paris » aurait produit un « Ouvert »
 * affirmatif sur une donnée invalide, exactement ce qu'on refuse partout ici.
 */
function instantLocal(timezone: string, instant: Date): InstantLocal | null {
  if (Number.isNaN(instant.getTime())) return null;

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
  } catch {
    return null;
  }

  const champ = (type: Intl.DateTimeFormatPartTypes): number | null => {
    const trouve = parts.find((p) => p.type === type);
    if (!trouve) return null;
    const valeur = Number(trouve.value);
    return Number.isFinite(valeur) ? valeur : null;
  };

  const annee = champ("year");
  const mois = champ("month");
  const jourDuMois = champ("day");
  const heures = champ("hour");
  const minutes = champ("minute");
  if (
    annee === null ||
    mois === null ||
    jourDuMois === null ||
    heures === null ||
    minutes === null
  ) {
    return null;
  }

  // `Date.UTC` sert ici de CALENDRIER, pas d'horloge : on lui donne la date
  // civile locale et on ne lit que le jour de la semaine qu'elle porte. Aucun
  // décalage n'entre en jeu, donc aucun changement d'heure ne peut le fausser.
  const dow = new Date(Date.UTC(annee, mois - 1, jourDuMois)).getUTCDay();
  // `getUTCDay` compte à partir de DIMANCHE ; `VITRINE_JOURS` commence lundi.
  const jour = VITRINE_JOURS[(dow + 6) % 7];

  return { jour, heure: `${deuxChiffres(heures)}:${deuxChiffres(minutes)}` };
}

function deuxChiffres(valeur: number): string {
  return valeur < 10 ? `0${valeur}` : `${valeur}`;
}

/**
 * Trie et FUSIONNE les créneaux d'un jour.
 *
 * Deux créneaux qui se touchent — 09:00–12:00 puis 12:00–19:00 — décrivent une
 * journée continue. Sans cette fusion, la page annoncerait « ferme à 12h » à
 * 11 h 59 dans un commerce qui ne ferme pas : exact au sens des données,
 * absurde au sens du client. La fusion couvre aussi le chevauchement, que la
 * base n'interdit pas — elle ne borne que le NOMBRE de créneaux, parce qu'un
 * `check` qui refuserait un chevauchement rendrait une erreur de base dans un
 * formulaire pour une saisie que l'on sait recoller ici.
 */
function fusionner(creneaux: CreneauVitrine[]): CreneauVitrine[] {
  const tries = [...creneaux].sort((x, y) => (x.de < y.de ? -1 : x.de > y.de ? 1 : 0));
  const sortie: CreneauVitrine[] = [];
  for (const creneau of tries) {
    const dernier = sortie[sortie.length - 1];
    if (dernier && creneau.de <= dernier.a) {
      if (creneau.a > dernier.a) dernier.a = creneau.a;
      continue;
    }
    sortie.push({ ...creneau });
  }
  return sortie;
}

/**
 * Ouvert ou fermé, et jusqu'à quand — à un instant DONNÉ.
 *
 * @param horaires  La semaine structurée, ou `null` si rien n'a été saisi.
 * @param timezone  Le fuseau IANA du COMMERCE (`identite.timezone`), jamais
 *                  celui du visiteur.
 * @param instant   L'instant à évaluer. TOUJOURS un paramètre — voir l'en-tête.
 */
export function etatHoraires(
  horaires: HorairesVitrine | null,
  timezone: string,
  instant: Date,
): EtatHorairesVitrine {
  if (!horaires) return INCONNU;

  const local = instantLocal(timezone, instant);
  if (!local) return INCONNU;

  const semaine = {} as Record<JourVitrine, CreneauVitrine[]>;
  for (const jour of VITRINE_JOURS) {
    semaine[jour] = fusionner(horaires[jour] ?? []);
  }

  // ── OUVERT ? Le créneau du jour qui CONTIENT l'instant. ──
  //
  // Borne de gauche INCLUSE, borne de droite EXCLUE : à 23:00 pile, un commerce
  // qui ferme à 23:00 est fermé. C'est la lecture que fait le client d'une
  // porte, et c'est aussi ce qui empêche deux créneaux qui se suivent de se
  // revendiquer tous les deux.
  const aujourdhui = semaine[local.jour];
  const encours = aujourdhui.find((c) => c.de <= local.heure && local.heure < c.a);
  if (encours) return { etat: "ouvert", fermeA: encours.a };

  // ── FERMÉ. Reste à dire quand ça rouvre. ──
  //
  // Plus tard dans la journée d'abord, puis les jours suivants, jusqu'à
  // retomber sur le MÊME jour la semaine d'après : `offset` va donc jusqu'à 7,
  // sans quoi un commerce qui n'ouvre que le samedi n'aurait, un samedi soir,
  // aucune réouverture à annoncer.
  const plusTard = aujourdhui.find((c) => c.de > local.heure);
  if (plusTard) {
    return {
      etat: "ferme",
      prochaine: { jour: local.jour, heure: plusTard.de, aujourdhui: true },
    };
  }

  const indexAujourdhui = VITRINE_JOURS.indexOf(local.jour);
  for (let offset = 1; offset <= 7; offset += 1) {
    const jour = VITRINE_JOURS[(indexAujourdhui + offset) % 7];
    const premier = semaine[jour][0];
    if (premier) {
      return {
        etat: "ferme",
        prochaine: { jour, heure: premier.de, aujourdhui: false },
      };
    }
  }

  // Sept jours vides : « fermé », sans réouverture annoncée. C'est une semaine
  // que le commerçant a écrite — sept tableaux vides sont une AFFIRMATION, pas
  // une absence — et l'écran doit pouvoir la rendre telle quelle.
  return { etat: "ferme", prochaine: null };
}
