import { timingSafeEqual } from "node:crypto";

/**
 * Comparaison de secrets à TEMPS CONSTANT — le seul endroit du dépôt.
 *
 * ── POURQUOI CE FICHIER ─────────────────────────────────────────────
 *
 * Le motif « longueurs d'abord, puis `timingSafeEqual` » était recopié à huit
 * endroits (spin, skill, unsubscribe, jackpot-checkin, loyalty-checkin,
 * team-invite, sms/webhook) pendant que DIX routes cron comparaient leur
 * `CRON_SECRET` avec un `!==` ordinaire, qui s'arrête au premier octet
 * différent. Un motif recopié huit fois et absent dix fois n'est pas une
 * doctrine : c'est une habitude, et une habitude a des trous. Le voici en un
 * seul point, appelé partout.
 *
 * LES LONGUEURS SONT COMPARÉES D'ABORD, et ce n'est pas une optimisation :
 * `timingSafeEqual` LÈVE sur deux tampons de tailles différentes. Sans ce test
 * préalable, une entrée de mauvaise longueur produirait une exception au lieu
 * d'un refus. La longueur d'un secret n'est pas le secret.
 */
export function timingSafeEquals(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

/**
 * Autorisation d'une route cron : en-tête `Authorization: Bearer <CRON_SECRET>`,
 * comparé à temps constant.
 *
 * L'en-tête ENTIER est comparé, préfixe `Bearer ` compris — comparer le seul
 * jeton après découpe rendrait la présence du préfixe observable par le temps
 * de réponse, pour un gain nul.
 */
export function authorizeCronRequest(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;
  return timingSafeEquals(header, `Bearer ${secret}`);
}
