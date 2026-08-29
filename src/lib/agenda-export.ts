/**
 * AJOUTER UN RENDEZ-VOUS À SON AGENDA (RDV-4).
 *
 * Module PUR : ni base, ni DOM, ni réseau. Il fabrique deux choses à partir
 * d'un rendez-vous — un lien Google Agenda, et le contenu d'un fichier `.ics`.
 *
 * ── POURQUOI LES DEUX, ET PAS SEULEMENT GOOGLE ──
 *
 * Le lien Google ne sert qu'aux comptes Google, ouverts dans un navigateur.
 * Le `.ics` est le format standard (RFC 5545) : Apple Calendar, Outlook,
 * Thunderbird et Android l'ouvrent nativement, et c'est le seul chemin pour un
 * iPhone — c'est-à-dire pour la moitié des clients d'un commerce français.
 * N'offrir que Google aurait laissé cette moitié sans rien.
 *
 * ── CE QUI N'ENTRE PAS DANS L'ÉVÉNEMENT ──
 *
 * Ni le code de retrait, ni l'email du client, ni aucun identifiant interne.
 * Un fichier d'agenda se synchronise vers des serveurs tiers, se partage et se
 * sauvegarde : y écrire un code qui donne droit à quelque chose reviendrait à
 * le diffuser. L'événement porte le NOM du commerce, l'intitulé, l'heure et le
 * lieu — de quoi se souvenir, jamais de quoi prouver.
 */

export interface RendezVousAgenda {
  /** Intitulé de la prestation. */
  titre: string;
  /** Nom du commerce — il devient le lieu à défaut d'adresse. */
  commerce: string;
  /** Instants ABSOLUS, tels que la base les porte. */
  debut: string;
  fin: string;
  /** Adresse du commerce, si elle est connue. */
  lieu?: string | null;
  /** Une ligne de contexte, jamais un secret. */
  details?: string | null;
}

/**
 * `20260908T140000Z` — la forme d'instant que Google et l'iCalendar attendent
 * tous les deux, en UTC.
 *
 * On part de l'ISO et on retire les séparateurs plutôt que de recomposer à la
 * main : `toISOString()` rend déjà l'instant en UTC, avec le bon calendrier et
 * les bons passages d'heure. Recalculer aurait été une occasion de se tromper.
 */
export function instantUtcCompact(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Le lien « Ajouter à Google Agenda ».
 *
 * `render?action=TEMPLATE` est l'adresse publique et stable de Google pour
 * pré-remplir un événement. Elle n'écrit RIEN : elle ouvre le formulaire de
 * création, que le client valide ou non. C'est ce qui la rend acceptable sans
 * aucune autorisation — nous ne touchons jamais à son agenda, nous lui
 * proposons un brouillon.
 */
export function lienGoogleAgenda(rdv: RendezVousAgenda): string | null {
  const debut = instantUtcCompact(rdv.debut);
  const fin = instantUtcCompact(rdv.fin);
  if (!debut || !fin) return null;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${rdv.titre} — ${rdv.commerce}`,
    dates: `${debut}/${fin}`,
  });
  if (rdv.lieu) params.set("location", rdv.lieu);
  if (rdv.details) params.set("details", rdv.details);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Échappement iCalendar (RFC 5545 §3.3.11).
 *
 * Sans lui, une virgule dans un nom de commerce coupe la valeur en deux et
 * l'événement arrive tronqué — un défaut qui ne se voit que chez le client, et
 * seulement pour certains noms.
 */
function echapperIcs(valeur: string): string {
  return valeur
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Le contenu d'un fichier `.ics`, prêt à être téléchargé.
 *
 * ── LES SÉPARATEURS SONT DES CRLF, ET CE N'EST PAS UN DÉTAIL ──
 *
 * La RFC impose `\r\n`. Outlook refuse purement et simplement un fichier en
 * `\n` seul — le client verrait un fichier qui « ne s'ouvre pas », sans
 * message. C'est le défaut le plus courant des générateurs maison.
 *
 * `uid` est fourni par l'appelant : deux ajouts du même rendez-vous doivent
 * mettre à jour le même événement, pas en créer un second.
 */
export function contenuIcs(
  rdv: RendezVousAgenda,
  uid: string,
  maintenant: string,
): string | null {
  const debut = instantUtcCompact(rdv.debut);
  const fin = instantUtcCompact(rdv.fin);
  const horodatage = instantUtcCompact(maintenant);
  if (!debut || !fin || !horodatage) return null;

  const lignes = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lastchance//Reservation//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${echapperIcs(uid)}`,
    `DTSTAMP:${horodatage}`,
    `DTSTART:${debut}`,
    `DTEND:${fin}`,
    `SUMMARY:${echapperIcs(`${rdv.titre} — ${rdv.commerce}`)}`,
  ];
  if (rdv.lieu) lignes.push(`LOCATION:${echapperIcs(rdv.lieu)}`);
  if (rdv.details) lignes.push(`DESCRIPTION:${echapperIcs(rdv.details)}`);
  lignes.push("END:VEVENT", "END:VCALENDAR");

  return `${lignes.join("\r\n")}\r\n`;
}

/**
 * Le `data:` URI d'un `.ics`, pour un téléchargement sans aller-retour serveur.
 *
 * `encodeURIComponent` et non `btoa` : le contenu porte des accents, et `btoa`
 * lève sur tout caractère hors Latin-1 — « Dégustation » aurait suffi.
 */
export function ficheIcsDataUri(contenu: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(contenu)}`;
}

/** Nom de fichier proposé au téléchargement — sans accent ni espace. */
export function nomFichierIcs(titre: string): string {
  const base = titre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${base || "rendez-vous"}.ics`;
}
