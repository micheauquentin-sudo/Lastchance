/* ════════════════════════════════════════════════════════════
 * LA FENÊTRE HORAIRE D'UN SMS PUBLICITAIRE
 *
 * ── LA RÈGLE, ET D'OÙ ELLE VIENT ────────────────────────────
 *
 * La prospection par SMS est interdite en France entre 22 h et 8 h, le
 * dimanche et les jours fériés. C'est la charte de déontologie AF2M, alignée
 * sur la doctrine CNIL de la prospection commerciale — la même source qui
 * impose déjà à ce canal l'expéditeur alphanumérique de 11 caractères et la
 * mention STOP.
 *
 * Rien ne la faisait respecter jusqu'ici : un gain à 23 h 30 partait à 23 h 35.
 *
 * ── POURQUOI CE MODULE EST PUR, ET SÉPARÉ DU WORKER ─────────
 *
 * Ce dépôt sait rendre du React en test depuis le 2026-08-04, mais cela ne
 * change rien ICI : la contrainte n'a jamais été le rendu, c'est qu'une
 * logique enfouie dans un WORKER est une logique que personne ne vérifie —
 * aucun DOM ne monte un job de file d'attente. La décision se réduit ici à une fonction
 * d'un instant vers un verdict — elle s'éprouve seule, sans base, sans job,
 * sans prestataire.
 *
 * ── LE FUSEAU EST UNE DONNÉE, PAS L'HEURE DU SERVEUR ────────
 *
 * `Date#getHours()` lit le fuseau du PROCESSUS. Vercel exécute en UTC : la
 * fenêtre y serait décalée d'une heure l'hiver et de deux l'été — c'est-à-dire
 * qu'elle s'ouvrirait à 6 h ou 7 h du matin, en plein cœur des heures qu'elle
 * existe pour interdire. Toute lecture d'horloge passe donc par `Intl` et un
 * fuseau IANA nommé.
 *
 * ── CE QUE CE MODULE NE COUVRE PAS, DIT PLUTÔT QUE SUPPOSÉ ──
 *
 * Les deux jours fériés propres à l'Alsace-Moselle (Vendredi saint et
 * 26 décembre) ne sont PAS ici : ils dépendent du département du DESTINATAIRE,
 * que ce produit ne connaît pas. Un commerçant de Strasbourg pourra donc voir
 * un SMS partir un Vendredi saint. Résidu nommé, et non couverture supposée.
 * ════════════════════════════════════════════════════════════ */

/** Le fuseau de la règle. Français, donc Paris — jamais l'heure du serveur. */
export const SMS_MARKETING_TIME_ZONE = "Europe/Paris";

/** Ouverture incluse, fermeture exclue : 8 h 00 passe, 22 h 00 ne passe pas. */
export const SMS_MARKETING_OPENS_HOUR = 8;
export const SMS_MARKETING_CLOSES_HOUR = 22;

/**
 * Le motif du refus, en étiquette fermée.
 *
 * Il ne change RIEN au sort du message — les trois mènent au même report. Il
 * existe pour le compteur : « la file est bloquée la nuit » et « la file est
 * bloquée un jour férié » ne se corrigent pas de la même façon.
 */
export type SmsWindowClosure = "night" | "sunday" | "holiday";

export type SmsWindowVerdict =
  | { allowed: true }
  | { allowed: false; closure: SmsWindowClosure };

interface CivilInstant {
  year: number;
  month: number;
  day: number;
  hour: number;
}

/**
 * L'heure civile d'un instant dans un fuseau IANA.
 *
 * `hourCycle: "h23"` est indispensable : sans lui, minuit se formate « 24 » en
 * en-US et la nuit se lit comme un après-midi.
 */
function civilInstant(instant: Date, timeZone: string): CivilInstant {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const read = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
  };
}

/**
 * Le dimanche de Pâques d'une année grégorienne (algorithme de Meeus/Butcher).
 *
 * Trois des onze jours fériés français en dérivent, et aucun n'est calculable
 * autrement : une table codée en dur serait fausse le jour où elle expire, en
 * silence. Cet algorithme, lui, ne périme pas.
 */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const total = h + l - 7 * m + 114;
  return { month: Math.floor(total / 31), day: (total % 31) + 1 };
}

/** Les huit fériés à date fixe, en `MM-DD`. */
const FIXED_HOLIDAYS = new Set([
  "01-01", // Jour de l'An
  "05-01", // Fête du Travail
  "05-08", // Victoire 1945
  "07-14", // Fête nationale
  "08-15", // Assomption
  "11-01", // Toussaint
  "11-11", // Armistice 1918
  "12-25", // Noël
]);

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * Un jour férié LÉGAL en France métropolitaine (art. L3133-1 du code du
 * travail), Alsace-Moselle exceptée — voir l'en-tête du fichier.
 *
 * Les trois mobiles sont dérivés de Pâques : lundi de Pâques (+1), Ascension
 * (+39), lundi de Pentecôte (+50). Le décalage se fait en UTC pur, sur une
 * date civile déjà résolue : aucun changement d'heure ne peut le déplacer.
 */
export function isFrenchPublicHoliday(
  year: number,
  month: number,
  day: number,
): boolean {
  if (FIXED_HOLIDAYS.has(`${pad(month)}-${pad(day)}`)) return true;

  const easter = easterSunday(year);
  const easterUtc = Date.UTC(year, easter.month - 1, easter.day);
  const dayUtc = Date.UTC(year, month - 1, day);
  const offset = Math.round((dayUtc - easterUtc) / 86_400_000);
  return offset === 1 || offset === 39 || offset === 50;
}

/**
 * Le verdict pour un instant donné.
 *
 * L'ORDRE DES TROIS CAUSES est fixé et non arbitraire du point de vue de la
 * lecture : un refus est rendu dès la première rencontrée, et un dimanche à
 * 23 h est étiqueté `night` parce que c'est la contrainte qui se lèvera la
 * dernière. N'importe laquelle suffit à refuser ; l'étiquette ne sert qu'à
 * compter.
 */
export function smsMarketingWindow(
  instant: Date,
  timeZone: string = SMS_MARKETING_TIME_ZONE,
): SmsWindowVerdict {
  const civil = civilInstant(instant, timeZone);

  if (
    civil.hour < SMS_MARKETING_OPENS_HOUR ||
    civil.hour >= SMS_MARKETING_CLOSES_HOUR
  ) {
    return { allowed: false, closure: "night" };
  }

  // Le jour de la semaine est dérivé de la date CIVILE déjà résolue dans le
  // fuseau, et non de l'instant : `instant.getUTCDay()` rendrait « samedi »
  // pour un dimanche 00 h 30 à Paris.
  const weekday = new Date(
    Date.UTC(civil.year, civil.month - 1, civil.day),
  ).getUTCDay();
  if (weekday === 0) return { allowed: false, closure: "sunday" };

  if (isFrenchPublicHoliday(civil.year, civil.month, civil.day)) {
    return { allowed: false, closure: "holiday" };
  }

  return { allowed: true };
}

/**
 * Combien d'heures on accepte de chercher avant de renoncer.
 *
 * La plus longue fermeture réellement possible est un enchaînement férié +
 * week-end : un 1er mai un samedi ferme du vendredi 22 h au lundi 8 h, soit
 * 58 h. Un 15 août encadré par un dimanche et un lundi de Pentecôte ne
 * dépasse pas non plus quelques jours. Quinze jours de recherche sont donc
 * très au-delà du besoin, et bornent quand même la boucle : une règle
 * modifiée un jour de façon incohérente (fenêtre vide) ferait tourner cette
 * fonction indéfiniment sans ce plafond.
 */
const OPENING_LOOKAHEAD_HOURS = 24 * 15;

/**
 * LE PROCHAIN INSTANT OÙ CE MESSAGE POURRA PARTIR.
 *
 * ── Pourquoi cette fonction existe ──────────────────────────
 *
 * Refuser un envoi hors fenêtre ne suffit pas : il faut dire QUAND le
 * reprendre. Sans elle, le report retombait sur le backoff des pannes —
 * 1, 5, 15 puis 60 minutes, soit 81 minutes d'horizon pour cinq tentatives —
 * face à 10 h de fermeture nocturne et 34 h entre un samedi 22 h et un lundi
 * 8 h. L'arithmétique est sans appel : le message MOURAIT avant la
 * réouverture. Une attente prévue et datée n'est pas un incident, et ne doit
 * pas consommer le budget des incidents.
 *
 * ── Comment elle est calculée, et pourquoi pas par formule ──
 *
 * Par ESSAIS SUCCESSIFS d'heure en heure, en réinterrogeant
 * `smsMarketingWindow`. Une formule fermée devrait rejouer les trois causes
 * (nuit, dimanche, fériés mobiles) et leurs enchaînements — un 15 août qui
 * tombe un dimanche, un lundi de Pentecôte suivi d'un 1er mai — c'est-à-dire
 * dupliquer la règle, avec la certitude qu'un jour les deux copies
 * divergeront. Ici, la seule source de vérité reste `smsMarketingWindow` :
 * cette fonction ne connaît AUCUNE règle, elle interroge.
 *
 * L'heure est tronquée à l'heure pleine UTC — les décalages d'`Europe/Paris`
 * sont des heures entières, donc une frontière UTC est une frontière de
 * Paris —, ce qui fait tomber le résultat pile à l'ouverture (8 h 00) plutôt
 * qu'à une minute arbitraire.
 *
 * Rend `null` si aucune ouverture n'est trouvée dans l'horizon : l'appelant
 * doit alors se replier sur son comportement d'avant, jamais présumer une
 * date.
 */
export function nextSmsMarketingOpening(
  instant: Date,
  timeZone: string = SMS_MARKETING_TIME_ZONE,
): Date | null {
  const hourStart = Math.floor(instant.getTime() / 3_600_000) * 3_600_000;

  for (let step = 1; step <= OPENING_LOOKAHEAD_HOURS; step += 1) {
    const candidate = new Date(hourStart + step * 3_600_000);
    if (smsMarketingWindow(candidate, timeZone).allowed) return candidate;
  }

  return null;
}
