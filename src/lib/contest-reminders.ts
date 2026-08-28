import "server-only";

import { APP_URL } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { sendContestReminderEmail } from "@/lib/resend";
import { FENETRE_SEMAINE_MS } from "@/lib/pronostics-bornes";
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
 * Fenêtre du rappel — LA MÊME que celle des « matchs de la semaine » de
 * l'écran joueur, importée et non recopiée. Deux valeurs qui divergent
 * relanceraient le joueur sur des matchs que son écran ne met pas en avant.
 */
export const FENETRE_RAPPEL_MS = FENETRE_SEMAINE_MS;

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

  const limite = new Date(now.getTime() + FENETRE_RAPPEL_MS).toISOString();

  for (const contest of (contests ?? []) as ContestRow[]) {
    try {
      const [{ data: joueurs }, { data: matchs }] = await Promise.all([
        admin
          .from("contest_players")
          .select("id, email, first_name")
          .eq("contest_id", contest.id)
          .eq("reminder_opt_in", true)
          .not("email", "is", null),
        // Matchs ENCORE OUVERTS : coup d'envoi dans le futur et dans la
        // fenêtre. Un match déjà commencé ne se pronostique plus, le compter
        // comme « manquant » culpabiliserait le joueur pour un train passé.
        admin
          .from("contest_matches")
          .select("id")
          .eq("contest_id", contest.id)
          .eq("status", "scheduled")
          .gt("kickoff_at", now.toISOString())
          .lte("kickoff_at", limite),
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
      const listeMatchs = ((matchs ?? []) as Array<{ id: string }>).map((m) => ({
        id: m.id,
      }));

      if (listeJoueurs.length === 0 || listeMatchs.length === 0) continue;

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
