-- ============================================================
-- PRONOSTICS — LE RAPPEL HEBDOMADAIRE, SUR CONSENTEMENT
-- ============================================================
--
-- ── CE QU'IL RÉPARE ──
--
-- Un championnat se joue sur des mois. Le joueur qui a rempli la 2e journée en
-- août n'a aucun moyen de se souvenir que la 5e ouvre le vendredi suivant : il
-- « oublie » sa grille, perd des points sans l'avoir décidé, et le commerçant
-- perd le joueur régulier qui faisait vivre son classement.
--
-- ── OPT-IN STRICT, ET `false` PAR DÉFAUT ──
--
-- Un rappel est une sollicitation, pas un service dû. La colonne vaut `false`
-- pour tout le monde, y compris les joueurs déjà inscrits : personne ne se
-- retrouve abonné à une relance qu'il n'a pas demandée le jour du déploiement.
-- La case n'est jamais pré-cochée à l'inscription — même règle que le rappel
-- quotidien du Calendrier.
--
-- ── ET LE SILENCE QUAND LA GRILLE EST PLEINE ──
--
-- Ce n'est pas la base qui le tient, mais elle rend la question calculable :
-- l'envoi croise cette colonne avec les pronostics RÉELLEMENT posés sur les
-- matchs à venir, et ne part que s'il en manque. Un joueur à jour ne reçoit
-- rien — c'est ce qui distingue un rappel utile d'une newsletter.
--
-- ── AUCUN DROIT NOUVEAU ──
--
-- `insert`, `update` et `delete` sont révoqués sur `contest_players` pour
-- `authenticated` depuis 00023 : les écritures passent par le service role
-- (inscription, édition de profil). Rien à accorder.

alter table public.contest_players
  add column if not exists reminder_opt_in boolean not null default false;

comment on column public.contest_players.reminder_opt_in is
  'Le joueur accepte un rappel hebdomadaire quand des pronostics manquent sur les matchs à venir. Opt-in STRICT : false par défaut, jamais pré-coché, et aucun envoi si la grille est déjà complète. Miroir de calendar_players.reminder_opt_in.';

-- Cible du cron : les joueurs à relancer se cherchent par championnat, et
-- seuls les consentants comptent. Index partiel — il ne porte que sur eux,
-- c'est-à-dire une minorité, et reste minuscule.
create index if not exists contest_players_reminder_idx
  on public.contest_players (contest_id)
  where reminder_opt_in;

-- ════════════════════════════════════════════════════════════
-- Le worker est DÉCLARÉ, sinon son heartbeat est refusé
-- ════════════════════════════════════════════════════════════
-- `ops_worker_runs.worker` référence `ops_worker_definitions` : un cron dont
-- le nom n'y figure pas voit chacun de ses battements rejeté par la clé
-- étrangère, en production seulement — la supervision resterait muette sur un
-- worker qui tourne. C'est `worker-health.test.ts` qui l'exige, et il a raison.
--
-- HEBDOMADAIRE, contrairement à ses frères quotidiens : période 7 jours,
-- tolérance 8 jours. Le plan Hobby déclenche un cron « dans l'heure » ; une
-- tolérance serrée sur une cadence hebdomadaire ne ferait que du bruit.
--
-- `enabled = false` comme tous les autres : la supervision ne réclame que les
-- deux workers à cadence courte, et un rappel manqué dégrade le service sans
-- rendre la production indisponible.
insert into public.ops_worker_definitions (
  worker, expected_period_seconds, tolerance_seconds, enabled
) values
  ('contest-reminders', 604800, 691200, false)
on conflict (worker) do nothing;
