import "server-only";

import { APP_URL } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { sendContestReminderEmail } from "@/lib/resend";
import { HORIZON_RAPPEL_MS } from "@/lib/pronostics-bornes";
import { grouperParJournee } from "@/lib/pronostics";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * LE RAPPEL HEBDOMADAIRE DE PRONOSTICS — « il vous manque des pronostics ».
 *
 * ── CE QU'IL RÉPARE ──
 *
 * Un championnat se joue sur des mois. Le joueur qui a rempli la 2e journée en
 * août n'a aucun moyen de se souvenir que la 5e ouvre vendredi : il perd des
 * points sans l'avoir décidé, et le commerçant perd le joueur régulier qui
 * faisait vivre son classement.
 *
 * ── TROIS RÈGLES, ET LA TROISIÈME EST LA PLUS IMPORTANTE ──
 *
 * 1. OPT-IN STRICT. `reminder_opt_in` vaut `false` par défaut et n'est jamais
 *    pré-coché. Un rappel est une sollicitation, pas un service dû.
 * 2. UN SEUL par semaine et par joueur, quel que soit le nombre de passages du
 *    cron — la réservation dans `email_log` (`on conflict do nothing`) le tient
 *    de façon atomique, comme pour le Calendrier.
 * 3. RIEN SI LA GRILLE EST PLEINE. C'est ce qui sépare un rappel utile d'une
 *    newsletter : on ne relance QUE le joueur à qui il manque réellement des
 *    pronostics sur les matchs à venir. Un joueur à jour ne reçoit rien, et
 *    n'a donc aucune raison de se désabonner.
 *
 * ── LA FENÊTRE EST UNE SEMAINE, PAS UNE JOURNÉE ──
 *
 * On ne raisonne pas en « prochaine journée » mais en « matchs qui s'ouvrent
 * dans les sept jours ». Une journée peut être à cheval sur deux week-ends
 * (matchs reportés), et un championnat peut en enchaîner deux dans la même
 * semaine — la semaine est l'unité qui correspond au rythme du rappel.
 */

/**
 * Au-delà de cet horizon, on ne prévient pas : la journée est trop loin,
 * et un rappel trois semaines à l'avance est du bruit.
 *
 * C'est une BORNE DE DÉCLENCHEMENT, pas un découpage : le CONTENU du rappel
 * est la prochaine journée ENTIÈRE. Les deux ont été confondus, et l'écran
 * joueur en a payé le prix (10 matchs une semaine, 8 la suivante).
 */
export const HORIZON_RAPPEL = HORIZON_RAPPEL_MS;

/**
 * Clé anti-doublon : un joueur ne reçoit qu'UN rappel par championnat et par
 * semaine civile. `semaine` est la date du lundi de la semaine courante, ce qui
 * rend la clé stable quel que soit le jour où le cron passe.
 */
export function contestReminderDedupKey(
  playerId: string,
  semaine: string,
): string {
  return `contest-reminder:${playerId}:${semaine}`;
}

/** Lundi de la semaine d'une date, en clé `AAAA-MM-JJ` (UTC). */
export function lundiDeLaSemaine(now: Date = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // getUTCDay : 0 = dimanche. On ramène au lundi précédent.
  const decalage = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - decalage);
  return d.toISOString().slice(0, 10);
}

/** Ce que le cœur pur reçoit d'un championnat, et rien de plus. */
export interface EtatRappel {
  /** Joueurs CONSENTANTS et joignables (email non nul). */
  joueurs: ReadonlyArray<{ id: string; email: string; firstName: string }>;
  /** Matchs ouverts dont le coup d'envoi tombe dans la fenêtre. */
  matchsAVenir: ReadonlyArray<{ id: string }>;
  /** Couples (playerId, matchId) déjà pronostiqués. */
  pronostics: ReadonlyArray<{ playerId: string; matchId: string }>;
}

export interface Relance {
  playerId: string;
  email: string;
  firstName: string;
  /** Combien de pronostics il lui manque sur la fenêtre. */
  manquants: number;
  total: number;
}

/**
 * QUI RELANCER — le cœur pur, et la seule règle qui compte.
 *
 * Un joueur est relancé s'il lui manque AU MOINS un pronostic sur les matchs à
 * venir. Zéro manquant ⇒ aucun envoi : ce n'est pas une optimisation, c'est la
 * promesse faite au joueur quand il a coché la case.
 *
 * Aucun match à venir ⇒ personne n'est relancé. Un « il vous manque 0
 * pronostic » serait un courriel qui n'a rien à dire.
 */
export function joueursARelancer(etat: EtatRappel): Relance[] {
  const total = etat.matchsAVenir.length;
  if (total === 0) return [];

  const aVenir = new Set(etat.matchsAVenir.map((m) => m.id));
  const posesPar = new Map<string, number>();
  for (const p of etat.pronostics) {
    if (!aVenir.has(p.matchId)) continue;
    posesPar.set(p.playerId, (posesPar.get(p.playerId) ?? 0) + 1);
  }

  const relances: Relance[] = [];
  for (const joueur of etat.joueurs) {
    const poses = posesPar.get(joueur.id) ?? 0;
    const manquants = total - poses;
    if (manquants <= 0) continue;
    relances.push({
      playerId: joueur.id,
      email: joueur.email,
      firstName: joueur.firstName,
      manquants,
      total,
    });
  }
  return relances;
}

/** `grouperParJournee` appliqué aux lignes du rappel — même règle, même tri. */
function partagerGrilleRappel<
  T extends { round: number | null; kickoff_at: string },
>(matchs: ReadonlyArray<T>) {
  const journees = grouperParJournee(matchs);
  return { prochaine: journees[0] ?? null };
}

interface ContestRow {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
}

/**
 * Envoie les rappels hebdomadaires de tous les championnats actifs.
 *
 * DÉDUP INTER-RUNS, comme `runCalendarReminders` : on RÉSERVE d'abord la ligne
 * `email_log` (on-conflict-do-nothing sur `dedup_key`) et on n'envoie qu'aux
 * cibles réellement insérées. Un second passage la même semaine ne réinsère
 * rien, donc n'envoie rien. Au pire un rappel manqué si Resend tombe après la
 * réservation ; jamais un doublon — arbitrage assumé pour une relance
 * best-effort.
 */
export async function runContestReminders(
  admin: Admin,
  now: Date = new Date(),
): Promise<{ sent: number; skipped: number }> {
  const semaine = lundiDeLaSemaine(now);
  let sent = 0;
  let skipped = 0;

  const { data: contests, error } = await admin
    .from("contests")
    .select("id, organization_id, name, slug")
    .eq("status", "active");
  if (error) {
    reportError("pronostics.reminders.contests", error.message);
    return { sent, skipped };
  }

  // Borne de CHARGEMENT, volontairement large : elle doit contenir la
  // prochaine journée en entier, horizon compris.
  const limite = new Date(now.getTime() + 4 * HORIZON_RAPPEL).toISOString();

  for (const contest of (contests ?? []) as ContestRow[]) {
    try {
      const [{ data: joueurs }, { data: matchs }] = await Promise.all([
        admin
          .from("contest_players")
          .select("id, email, first_name")
          .eq("contest_id", contest.id)
          .eq("reminder_opt_in", true)
          .not("email", "is", null),
        // Matchs ENCORE OUVERTS : coup d'envoi dans le futur. Un match déjà
        // commencé ne se pronostique plus, le compter comme « manquant »
        // culpabiliserait le joueur pour un train passé.
        //
        // La borne haute est LARGE (pas l'horizon) : on charge de quoi
        // reconnaître la prochaine journée, puis on décide. Filtrer à sept
        // jours ici couperait la journée en deux, exactement le défaut que
        // l'écran joueur vient de payer.
        admin
          .from("contest_matches")
          .select("id, round, kickoff_at")
          .eq("contest_id", contest.id)
          .eq("status", "scheduled")
          .gt("kickoff_at", now.toISOString())
          .lte("kickoff_at", limite)
          .order("kickoff_at", { ascending: true }),
      ]);

      const listeJoueurs = ((joueurs ?? []) as Array<{
        id: string;
        email: string | null;
        first_name: string;
      }>)
        .filter((j): j is { id: string; email: string; first_name: string } =>
          Boolean(j.email),
        )
        .map((j) => ({ id: j.id, email: j.email, firstName: j.first_name }));
      // LA PROCHAINE JOURNÉE, et elle seule — la même unité que l'écran.
      // Les matchs sont déjà filtrés sur « ouverts », donc la journée la
      // plus basse est bien celle qui vient.
      const { prochaine } = partagerGrilleRappel(
        (matchs ?? []) as Array<{
          id: string;
          round: number | null;
          kickoff_at: string;
        }>,
      );
      if (!prochaine || prochaine.matchs.length === 0) continue;

      // Trop loin pour prévenir : on se tait plutôt que d'annoncer une
      // journée que le joueur ne peut pas encore situer.
      const premier = new Date(prochaine.matchs[0].kickoff_at).getTime();
      if (premier > now.getTime() + HORIZON_RAPPEL) continue;

      const listeMatchs = prochaine.matchs.map((m) => ({ id: m.id }));

      if (listeJoueurs.length === 0) continue;

      const { data: pronos } = await admin
        .from("contest_predictions")
        .select("player_id, match_id")
        .in(
          "player_id",
          listeJoueurs.map((j) => j.id),
        );

      const relances = joueursARelancer({
        joueurs: listeJoueurs,
        matchsAVenir: listeMatchs,
        pronostics: ((pronos ?? []) as Array<{
          player_id: string;
          match_id: string;
        }>).map((p) => ({ playerId: p.player_id, matchId: p.match_id })),
      });

      for (const relance of relances) {
        const dedupKey = contestReminderDedupKey(relance.playerId, semaine);
        // RÉSERVATION D'ABORD : c'est elle qui interdit le doublon, pas l'envoi.
        const { error: reserveError } = await admin
          .from("email_log")
          .insert({
            organization_id: contest.organization_id,
            dedup_key: dedupKey,
            scenario: "contest_reminder",
            recipient: relance.email,
          });
        if (reserveError) {
          // 23505 = déjà réservé cette semaine : ce n'est pas une panne.
          if (reserveError.code !== "23505") {
            reportError("pronostics.reminders.reserve", reserveError.message);
          }
          skipped += 1;
          continue;
        }

        const envoye = await sendContestReminderEmail({
          to: relance.email,
          firstName: relance.firstName,
          contestName: contest.name,
          manquants: relance.manquants,
          total: relance.total,
          url: `${APP_URL}/pronos/${contest.slug}`,
        });
        if (envoye) sent += 1;
        else skipped += 1;
      }
    } catch (err) {
      // Un championnat en panne n'arrête pas les autres : le cron sert tout le
      // parc, et une organisation ne doit pas priver les autres de leur rappel.
      reportError("pronostics.reminders.contest", err);
    }
  }

  return { sent, skipped };
}
