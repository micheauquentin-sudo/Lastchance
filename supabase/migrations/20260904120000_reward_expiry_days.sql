-- ============================================================
-- Lastchance — les SEPT familles sans échéance en reçoivent une,
-- choisie par le commerçant, comptée en JOURS
-- ============================================================
--
-- ── Ce qui n'était clos par rien ──
--
-- `sync_reward_issuance` (20260805150000) écrit `null::timestamptz as
-- expires_at` pour huit de ses dix branches d'émission — hunt, loyalty,
-- jackpot, event, calendrier (case ET assiduité), referral, quiz. Seules la
-- roue (`participations.redeem_expires_at`, dérivée de
-- `campaigns.code_ttl_seconds`) et les pronostics
-- (`contest_awards.redeem_expires_at`, dérivée de `contests.code_ttl_seconds`)
-- portaient une échéance.
--
-- Conséquence, écrite sans l'adoucir : un code `CHASSE-`, `FIDELITE-`,
-- `JACKPOT-`, `EVENT-`, `CADEAU-`, `PARRAIN-` ou `QUIZ-` émis en 2026 reste
-- encaissable en 2030. Rien ne le termine — ni la caisse (qui ne refuse que
-- sur `expires_at <= now()`, donc jamais), ni la purge RGPD (qui ne détruit
-- que des lignes TERMINÉES, ce qu'une ligne sans échéance n'est jamais tant
-- qu'elle n'est ni remise ni annulée).
--
-- Le propriétaire a tranché la question qui était posée dans docs/bugs.md :
-- le commerçant choisit une durée de validité, à l'expérience, en jours.
--
-- ── Pourquoi des JOURS, quand les deux familles existantes comptent en
--    SECONDES ──
--
-- La divergence est délibérée, elle n'est pas une inattention de copie.
--
--   · `campaigns.code_ttl_seconds` (10 s à 600 s) : le décompte part de
--     l'instant où le joueur, qui vient de gagner, se trouve DEVANT la
--     caisse. La seconde est l'unité de cette fenêtre, dont l'objet est
--     d'empêcher qu'une capture d'écran resserve.
--   · `contests.code_ttl_seconds` (1 h à 90 j) : le décompte part de la
--     CLÔTURE du championnat, un instant précis lui aussi.
--   · Ici, le décompte part de l'ÉMISSION du lot, et la question posée au
--     commerçant est « combien de temps ce lot reste-t-il valable ? ». Il
--     répond « un mois », « deux semaines » — jamais « 2 592 000 secondes ».
--
-- Le stockage en secondes d'une durée que l'humain pense en jours a DÉJÀ
-- coûté un défaut à ce dépôt : commit `76c72dc`, éditeur pronostics, « TTL
-- non représentable en jours entiers » — l'écran offrait des jours, la base
-- des secondes, et une valeur héritée tombait entre deux crans.
--
-- Corollaire écrit ici pour qu'il ne se redécouvre pas : si un besoin
-- INFRA-JOURNALIER apparaît un jour sur ces familles, il demandera une
-- NOUVELLE colonne, jamais une réinterprétation de celle-ci. Réinterpréter
-- `code_ttl_days` en heures ferait passer toutes les échéances déjà servies
-- de N jours à N heures, en silence, sur des codes que des clients tiennent.
--
-- ── `null` = sans limite, et c'est le défaut ──
--
-- Aucune expérience existante ne gagne d'échéance à l'application de cette
-- migration. La colonne naît nulle partout, et nulle vaut « sans limite »,
-- exactement comme les deux `code_ttl_seconds`. C'est le commerçant qui
-- décide, expérience par expérience.
--
-- ── L'échéance est FIGÉE à l'émission ──
--
-- L'échéance n'est PAS calculée à la lecture depuis la parente : elle est
-- posée sur la ligne d'émission par un trigger `before insert`, et
-- `sync_reward_issuance` la recopie telle quelle au registre.
--
-- C'est la propriété de correction la plus importante de ce fichier. Un
-- commerçant qui ramène sa durée de 90 à 7 jours ne doit pas raccourcir
-- l'échéance d'un code déjà dans la poche d'un client — et un commerçant qui
-- l'allonge ne doit pas ressusciter des codes déjà morts. Même principe, et
-- mêmes raisons, que `freeze_reward_label` (20260814120000) et
-- `freeze_reward_details` (20260901120000) : ce qui a été promis au client au
-- moment où il a gagné ne se réécrit pas derrière lui.
--
-- ── Aucune rétroactivité, et c'est voulu ──
--
-- Le trigger est `before insert` SEULEMENT, et la colonne naît nulle. Aucune
-- ligne déjà émise ne gagne d'échéance. Une migration ne fait pas expirer un
-- code qui est déjà dans une poche : le client ne saurait ni que la règle a
-- changé, ni quand.
--
-- ── Ce que la purge devient, et ce qu'elle ne devient pas ──
--
-- `purge_expired_reward_issuances` (20260903120000) compte déjà `expires_at <
-- now()` comme « terminé ». Ce fichier lui donne donc, pour la première fois,
-- des lignes à voir dans ces sept familles. Il ne la modifie pas, et il n'a
-- pas à le faire : le critère « terminé » y est ANDé avec `issued_at < now()
-- - fenêtre de rétention` (plancher 1 mois, repli 13). Un lot périmé n'est
-- donc pas détruit le lendemain de son échéance — il survit assez longtemps
-- pour que la caisse et le portefeuille disent « expiré » plutôt que
-- « introuvable ». Cette propriété n'était portée par aucune assertion tant
-- qu'aucune de ces familles n'expirait ; elle devient porteuse ici, et
-- `reward_expiry_days.test.sql` l'épingle.
--
-- ── Le réglage doit être ATTEIGNABLE ──
--
-- Les SEPT tables parentes portent une liste blanche de colonnes en `grant
-- update` — vérifié une par une, pas déduit. Sans réémission, la colonne
-- serait du code mort : « une capacité écrite en base sans chemin applicatif
-- pour l'atteindre » est un défaut que ce dépôt a déjà payé plusieurs fois.
-- Deux d'entre elles (`loyalty_programs`, `jackpot_campaigns`) portent en
-- plus une liste blanche en `grant select` : sans elle le commerçant ne
-- pourrait pas RELIRE ce qu'il vient de régler. Détail au §2.
--
-- ── Ce que ce fichier NE fait pas ──
--
-- Il ne touche ni à `redeem_reward_by_code` (qui applique déjà l'échéance,
-- 20260805150000 l. 760 et 861), ni à la purge, ni aux écrans. Les
-- validations Zod, les types TypeScript et les formulaires d'édition sont
-- des lots séparés — voir le rapport.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. Le réglage, sur les sept tables parentes
-- ════════════════════════════════════════════════════════════
-- Bornes identiques partout (1 à 365) : contrairement aux deux
-- `code_ttl_seconds`, dont les bornes divergent parce que leurs décomptes
-- partent d'instants de nature différente, ces sept familles partagent le
-- MÊME point de départ — l'émission — et la même question posée au
-- commerçant. Rien ne justifierait qu'une chasse au trésor et un quiz
-- admettent des plages différentes.
--
-- Plancher 1 et non 0 : un lot valable zéro jour est un lot mort à
-- l'émission, ce que personne ne veut régler par accident. Plafond 365 :
-- au-delà, `null` (sans limite) dit la même chose plus honnêtement.

alter table public.hunts
  add column if not exists code_ttl_days integer
    check (code_ttl_days is null or code_ttl_days between 1 and 365);
alter table public.loyalty_programs
  add column if not exists code_ttl_days integer
    check (code_ttl_days is null or code_ttl_days between 1 and 365);
alter table public.jackpot_campaigns
  add column if not exists code_ttl_days integer
    check (code_ttl_days is null or code_ttl_days between 1 and 365);
alter table public.event_sessions
  add column if not exists code_ttl_days integer
    check (code_ttl_days is null or code_ttl_days between 1 and 365);
alter table public.calendars
  add column if not exists code_ttl_days integer
    check (code_ttl_days is null or code_ttl_days between 1 and 365);
alter table public.referral_programs
  add column if not exists code_ttl_days integer
    check (code_ttl_days is null or code_ttl_days between 1 and 365);
alter table public.quizzes
  add column if not exists code_ttl_days integer
    check (code_ttl_days is null or code_ttl_days between 1 and 365);

comment on column public.hunts.code_ttl_days is
  'Durée de validité du code CHASSE-… émis, en JOURS (null : sans limite, et c''est le défaut). Comptée depuis l''ÉMISSION et FIGÉE à cet instant sur hunt_completions.redeem_expires_at : changer ce réglage ne déplace aucune échéance déjà servie. Unité en jours et non en secondes — le décompte part de l''émission et le commerçant raisonne en jours, cf. en-tête 20260904120000.';
comment on column public.loyalty_programs.code_ttl_days is
  'Durée de validité du code FIDELITE-… émis, en JOURS (null : sans limite, et c''est le défaut). Comptée depuis l''ÉMISSION et FIGÉE à cet instant sur loyalty_rewards.redeem_expires_at.';
comment on column public.jackpot_campaigns.code_ttl_days is
  'Durée de validité du code JACKPOT-… émis, en JOURS (null : sans limite, et c''est le défaut). Comptée depuis l''ÉMISSION et FIGÉE à cet instant sur jackpot_wins.redeem_expires_at.';
comment on column public.event_sessions.code_ttl_days is
  'Durée de validité du code EVENT-… émis, en JOURS (null : sans limite, et c''est le défaut). Comptée depuis l''ÉMISSION et FIGÉE à cet instant sur event_wins.redeem_expires_at.';
comment on column public.calendars.code_ttl_days is
  'Durée de validité des codes CADEAU-… émis, en JOURS (null : sans limite, et c''est le défaut). UN SEUL réglage couvre les DEUX tables d''émission du calendrier — le lot de case (calendar_openings) et la récompense d''assiduité (calendar_rewards) — parce qu''elles n''ont qu''une parente et une seule RPC de remise.';
comment on column public.referral_programs.code_ttl_days is
  'Durée de validité du code PARRAIN-… émis, en JOURS (null : sans limite, et c''est le défaut). Comptée depuis l''ÉMISSION et FIGÉE à cet instant sur referral_rewards.redeem_expires_at. À ne pas confondre avec window_days, qui borne la période pendant laquelle un parrainage peut être VALIDÉ, pas la validité du lot qui en découle.';
comment on column public.quizzes.code_ttl_days is
  'Durée de validité du code QUIZ-… émis, en JOURS (null : sans limite, et c''est le défaut). Comptée depuis l''ÉMISSION et FIGÉE à cet instant sur quiz_rewards.redeem_expires_at.';

-- ════════════════════════════════════════════════════════════
-- 2. Le réglage est atteignable — listes blanches réémises
-- ════════════════════════════════════════════════════════════
-- Les listes blanches sont réémises EN ENTIER : un `grant update (col)`
-- supplémentaire s'AJOUTE aux privilèges déjà là, il ne les remplace pas —
-- mais réémettre l'ensemble laisse le fichier lisible comme l'état voulu, et
-- c'est ce qu'a fait 20260804120000 pour `contests.code_ttl_seconds`.
--
-- Un entier borné par un CHECK et cadré par la RLS `is_org_editor` existante
-- ne justifie pas une RPC dédiée — contrairement aux colonnes qui portent une
-- règle métier ou un audit (`status`, `reward_stock`, compteurs d'émission),
-- qui restent RPC-only ici comme avant.
--
-- L'INSERT reçoit la colonne partout où une liste blanche d'insertion existe :
-- sans elle, le réglage ne serait posable qu'APRÈS création, et un formulaire
-- de création qui l'affiche l'écrirait dans le vide.

-- hunts : liste blanche en UPDATE seulement (select et insert sont au niveau
-- table, donc la colonne y est acquise d'office).
grant update (name, status, starts_at, ends_at, order_mode,
              min_scan_interval_seconds, reward_label, reward_details,
              reward_stock, code_ttl_days)
  on public.hunts to authenticated;

-- loyalty_programs : listes blanches en SELECT, INSERT et UPDATE. La colonne
-- doit entrer dans les trois — sans le SELECT, le commerçant écrirait un
-- réglage qu'aucun de ses écrans ne pourrait relire. `rotating_secret` reste
-- absent des trois, comme avant.
grant select (id, organization_id, name, status, validation_mode,
              rotating_period_seconds, min_stamp_interval_seconds,
              silver_threshold, gold_threshold, created_at, code_ttl_days)
  on public.loyalty_programs to authenticated;
grant insert (organization_id, name, status, validation_mode,
              rotating_period_seconds, min_stamp_interval_seconds,
              silver_threshold, gold_threshold, code_ttl_days)
  on public.loyalty_programs to authenticated;
grant update (name, status, validation_mode, rotating_period_seconds,
              min_stamp_interval_seconds, silver_threshold, gold_threshold,
              code_ttl_days)
  on public.loyalty_programs to authenticated;

-- jackpot_campaigns : mêmes trois listes blanches, même raison.
-- `rotating_secret`, `current_count`, `cycle` et `reward_claimed_count`
-- restent hors UPDATE (RPC-only), inchangé.
grant select (id, organization_id, name, status, public_slug, validation_mode,
              rotating_period_seconds, min_participation_interval_seconds,
              draw_mode, threshold, win_probability, draw_at,
              reward_label, reward_details, reward_stock, reward_claimed_count,
              display_base_cents, display_increment_cents, merchant_content,
              current_count, cycle, created_at, code_ttl_days)
  on public.jackpot_campaigns to authenticated;
grant insert (organization_id, name, status, public_slug, validation_mode,
              rotating_period_seconds, min_participation_interval_seconds,
              draw_mode, threshold, win_probability, draw_at,
              reward_label, reward_details, reward_stock,
              display_base_cents, display_increment_cents, merchant_content,
              code_ttl_days)
  on public.jackpot_campaigns to authenticated;
grant update (name, status, public_slug, validation_mode,
              rotating_period_seconds, min_participation_interval_seconds,
              draw_mode, threshold, win_probability, draw_at,
              reward_label, reward_details, reward_stock,
              display_base_cents, display_increment_cents, merchant_content,
              code_ttl_days)
  on public.jackpot_campaigns to authenticated;

-- event_sessions : SELECT au niveau table, listes blanches en INSERT/UPDATE.
grant insert (game_id, organization_id, label, join_code,
              reward_label, reward_details, reward_stock, code_ttl_days)
  on public.event_sessions to authenticated;
grant update (label, reward_label, reward_details, reward_stock,
              code_ttl_days)
  on public.event_sessions to authenticated;

-- calendars : SELECT au niveau table, listes blanches en INSERT/UPDATE.
grant insert (organization_id, name, theme, status, start_date, timezone,
              day_count, public_slug, merchant_content,
              completion_reward_label, completion_reward_details,
              completion_reward_stock, code_ttl_days)
  on public.calendars to authenticated;
grant update (name, theme, status, start_date, timezone, day_count,
              public_slug, merchant_content,
              completion_reward_label, completion_reward_details,
              completion_reward_stock, updated_at, code_ttl_days)
  on public.calendars to authenticated;

-- referral_programs : SELECT au niveau table, listes blanches en
-- INSERT/UPDATE.
grant insert (campaign_id, organization_id, enabled, chest_threshold,
              sponsor_max_filleuls, window_days,
              sponsor_reward_kind, sponsor_reward_label, sponsor_reward_details, sponsor_reward_stock,
              filleul_reward_kind, filleul_reward_label, filleul_reward_details, filleul_reward_stock,
              chest_reward_kind, chest_reward_label, chest_reward_details, chest_reward_stock,
              code_ttl_days)
  on public.referral_programs to authenticated;
grant update (enabled, chest_threshold, sponsor_max_filleuls, window_days,
              sponsor_reward_kind, sponsor_reward_label, sponsor_reward_details, sponsor_reward_stock,
              filleul_reward_kind, filleul_reward_label, filleul_reward_details, filleul_reward_stock,
              chest_reward_kind, chest_reward_label, chest_reward_details, chest_reward_stock,
              updated_at, code_ttl_days)
  on public.referral_programs to authenticated;

-- quizzes : SELECT au niveau table, listes blanches en INSERT/UPDATE.
-- `reward_claimed_count`, `draw_state` et `drawn_at` restent RPC-only.
grant insert (organization_id, name, theme, status, public_slug, intro_text,
              reward_mode, reward_threshold, draw_top_n, reward_label,
              reward_details, reward_stock, target_wheel_id, code_ttl_days)
  on public.quizzes to authenticated;
grant update (name, theme, status, public_slug, intro_text, reward_mode,
              reward_threshold, draw_top_n, reward_label, reward_details,
              reward_stock, target_wheel_id, updated_at, code_ttl_days)
  on public.quizzes to authenticated;

-- ════════════════════════════════════════════════════════════
-- 3. L'échéance, gravée sur les huit tables d'émission
-- ════════════════════════════════════════════════════════════
-- Huit tables et sept parentes : le calendrier en porte deux (le lot de case
-- et la récompense d'assiduité), qui partagent `calendars.code_ttl_days`.
--
-- Aucun index : le seul prédicat qui lit cette colonne est ANDé au code de
-- retrait, déjà indexé et sélectif à une ligne. Un index de plus sur une
-- colonne nulle partout ne servirait qu'à ralentir les insertions.
--
-- Les huit tables accordent `select` au niveau TABLE à `authenticated` — la
-- colonne y est donc lisible d'office, sans réémission de liste blanche
-- (vérifié table par table).

alter table public.hunt_completions
  add column if not exists redeem_expires_at timestamptz;
alter table public.loyalty_rewards
  add column if not exists redeem_expires_at timestamptz;
alter table public.jackpot_wins
  add column if not exists redeem_expires_at timestamptz;
alter table public.event_wins
  add column if not exists redeem_expires_at timestamptz;
alter table public.calendar_openings
  add column if not exists redeem_expires_at timestamptz;
alter table public.calendar_rewards
  add column if not exists redeem_expires_at timestamptz;
alter table public.referral_rewards
  add column if not exists redeem_expires_at timestamptz;
alter table public.quiz_rewards
  add column if not exists redeem_expires_at timestamptz;

comment on column public.hunt_completions.redeem_expires_at is
  'Échéance du code de retrait, GRAVÉE à l''insertion depuis hunts.code_ttl_days (null : sans limite). Ne bouge plus ensuite, quoi que le commerçant règle après coup.';
comment on column public.loyalty_rewards.redeem_expires_at is
  'Échéance du code de retrait, GRAVÉE à l''insertion depuis loyalty_programs.code_ttl_days (null : sans limite).';
comment on column public.jackpot_wins.redeem_expires_at is
  'Échéance du code de retrait, GRAVÉE à l''insertion depuis jackpot_campaigns.code_ttl_days (null : sans limite).';
comment on column public.event_wins.redeem_expires_at is
  'Échéance du code de retrait, GRAVÉE à l''insertion depuis event_sessions.code_ttl_days (null : sans limite).';
comment on column public.calendar_openings.redeem_expires_at is
  'Échéance du code de retrait, GRAVÉE à l''insertion depuis calendars.code_ttl_days (null : sans limite).';
comment on column public.calendar_rewards.redeem_expires_at is
  'Échéance du code de retrait, GRAVÉE à l''insertion depuis calendars.code_ttl_days — le MÊME réglage que le lot de case (null : sans limite).';
comment on column public.referral_rewards.redeem_expires_at is
  'Échéance du code de retrait, GRAVÉE à l''insertion depuis referral_programs.code_ttl_days (null : sans limite).';
comment on column public.quiz_rewards.redeem_expires_at is
  'Échéance du code de retrait, GRAVÉE à l''insertion depuis quizzes.code_ttl_days (null : sans limite).';

-- ════════════════════════════════════════════════════════════
-- 4. Le trigger qui grave — calque de set_contest_award_redeem_expiry
-- ════════════════════════════════════════════════════════════
-- UNE fonction pour huit tables, sur le modèle de `mirror_reward_issuance`
-- (20260805150000) : le contexte arrive par `tg_argv`, jamais par du SQL
-- dynamique, et le nom de la table parente est une VALEUR de liste blanche
-- comparée dans un `if/elsif`.
--
-- `tg_argv[0]` = table parente, `tg_argv[1]` = colonne porteuse de la clé
-- étrangère sur la ligne d'émission.
--
-- La clé est lue par `to_jsonb(new) ->> tg_argv[1]` et NON par `new.<champ>` :
-- une même fonction sert huit types de ligne différents, et une référence de
-- champ statique (`new.hunt_id`) échouerait à l'exécution dès la première
-- table qui ne porte pas ce champ. `to_jsonb` est indifférent au type de la
-- ligne.
create or replace function public.set_reward_redeem_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_id uuid;
  v_days integer;
begin
  -- Une échéance déjà portée par la ligne insérée fait foi et n'est jamais
  -- recalculée — même règle que set_contest_award_redeem_expiry. Elle couvre
  -- les reprises de données et laisse une RPC future poser une échéance
  -- particulière sans que ce trigger la lui reprenne.
  if new.redeem_expires_at is not null then
    return new;
  end if;

  v_parent_id := (pg_catalog.to_jsonb(new) ->> tg_argv[1])::uuid;
  if v_parent_id is null then
    return new;
  end if;

  if tg_argv[0] = 'hunts' then
    select h.code_ttl_days into v_days
      from public.hunts h where h.id = v_parent_id;
  elsif tg_argv[0] = 'loyalty_programs' then
    select lp.code_ttl_days into v_days
      from public.loyalty_programs lp where lp.id = v_parent_id;
  elsif tg_argv[0] = 'jackpot_campaigns' then
    select jc.code_ttl_days into v_days
      from public.jackpot_campaigns jc where jc.id = v_parent_id;
  elsif tg_argv[0] = 'event_sessions' then
    select es.code_ttl_days into v_days
      from public.event_sessions es where es.id = v_parent_id;
  elsif tg_argv[0] = 'calendars' then
    select c.code_ttl_days into v_days
      from public.calendars c where c.id = v_parent_id;
  elsif tg_argv[0] = 'referral_programs' then
    -- SEULE parente qui ne se joint pas par `id` : referral_programs est
    -- keyée par campaign_id (`unique (campaign_id)`, 20260729120000), et
    -- c'est la campagne que referral_rewards référence — exactement la
    -- jointure que fait déjà sync_reward_issuance.
    select rp.code_ttl_days into v_days
      from public.referral_programs rp where rp.campaign_id = v_parent_id;
  elsif tg_argv[0] = 'quizzes' then
    select q.code_ttl_days into v_days
      from public.quizzes q where q.id = v_parent_id;
  else
    -- Deny-by-default : un neuvième argument non prévu ne grave rien en
    -- silence, il fait échouer l'insertion et se voit tout de suite.
    raise exception 'unsupported reward expiry parent: %', tg_argv[0]
      using errcode = '22023';
  end if;

  if v_days is not null then
    -- `make_interval(days => …)` et non un multiple d'heures : l'unité
    -- annoncée au commerçant est le jour CALENDAIRE, et c'est ce que
    -- l'addition d'un intervalle en jours produit.
    new.redeem_expires_at := pg_catalog.now()
      + pg_catalog.make_interval(days => v_days);
  end if;

  return new;
end;
$$;

comment on function public.set_reward_redeem_expiry() is
  'Trigger `before insert` des huit tables d''émission sans échéance : grave redeem_expires_at depuis le code_ttl_days de la parente désignée par tg_argv[0], via la clé étrangère nommée par tg_argv[1]. Ne recalcule jamais une échéance déjà posée, et ne s''applique jamais à une ligne existante (before insert seulement) : un réglage modifié après coup ne déplace aucune échéance déjà servie.';

-- CREATE FUNCTION accorde l'EXECUTE à PUBLIC par défaut : le retirer tout de
-- suite. Sans ça l'audit générique pgTAP « PUBLIC has no EXECUTE on public
-- functions » (security_acl.test.sql) échoue — c'est l'oubli qu'ont dû
-- corriger 20260722160000 puis 20260804120000 sur les deux fonctions
-- trigger jumelles.
revoke all on function public.set_reward_redeem_expiry()
  from public, anon, authenticated;

drop trigger if exists hunt_completions_set_redeem_expiry on public.hunt_completions;
create trigger hunt_completions_set_redeem_expiry
  before insert on public.hunt_completions
  for each row execute function public.set_reward_redeem_expiry('hunts', 'hunt_id');

drop trigger if exists loyalty_rewards_set_redeem_expiry on public.loyalty_rewards;
create trigger loyalty_rewards_set_redeem_expiry
  before insert on public.loyalty_rewards
  for each row execute function public.set_reward_redeem_expiry('loyalty_programs', 'program_id');

drop trigger if exists jackpot_wins_set_redeem_expiry on public.jackpot_wins;
create trigger jackpot_wins_set_redeem_expiry
  before insert on public.jackpot_wins
  for each row execute function public.set_reward_redeem_expiry('jackpot_campaigns', 'campaign_id');

drop trigger if exists event_wins_set_redeem_expiry on public.event_wins;
create trigger event_wins_set_redeem_expiry
  before insert on public.event_wins
  for each row execute function public.set_reward_redeem_expiry('event_sessions', 'session_id');

drop trigger if exists calendar_openings_set_redeem_expiry on public.calendar_openings;
create trigger calendar_openings_set_redeem_expiry
  before insert on public.calendar_openings
  for each row execute function public.set_reward_redeem_expiry('calendars', 'calendar_id');

drop trigger if exists calendar_rewards_set_redeem_expiry on public.calendar_rewards;
create trigger calendar_rewards_set_redeem_expiry
  before insert on public.calendar_rewards
  for each row execute function public.set_reward_redeem_expiry('calendars', 'calendar_id');

drop trigger if exists referral_rewards_set_redeem_expiry on public.referral_rewards;
create trigger referral_rewards_set_redeem_expiry
  before insert on public.referral_rewards
  for each row execute function public.set_reward_redeem_expiry('referral_programs', 'campaign_id');

drop trigger if exists quiz_rewards_set_redeem_expiry on public.quiz_rewards;
create trigger quiz_rewards_set_redeem_expiry
  before insert on public.quiz_rewards
  for each row execute function public.set_reward_redeem_expiry('quizzes', 'quiz_id');

-- ════════════════════════════════════════════════════════════
-- 5. Le registre lit l'échéance gravée
-- ════════════════════════════════════════════════════════════
-- ── Pourquoi ce bloc se DÉRIVE au lieu de recopier la fonction ──
--
-- Même raison que 20260814120000 et 20260901120000, et elle n'a pas faibli :
-- `sync_reward_issuance` fait plus de trois cents lignes et porte dix
-- branches d'émission. La recopier pour changer huit lignes créerait une
-- SECONDE SOURCE DE VÉRITÉ, qui divergerait au premier correctif porté à
-- l'originale — la classe de défaut la plus coûteuse de ce projet, et celle
-- qui lui a déjà livré deux escalades de privilège.
--
-- On lit donc la définition VIVANTE (`pg_get_functiondef`), on applique HUIT
-- substitutions ancrées, et on rejoue. Vérifié au préalable : aucune
-- migration n'a redéfini ni live-muté `sync_reward_issuance` depuis
-- 20260805150000 (les deux gels de 20260814120000 et 20260901120000 portent
-- sur `upsert_reward_issuance`, sa voisine).
--
-- ── L'ancre, et pourquoi elle est celle-là ──
--
-- Chaque branche rend `<alias>.<colonne> as issued_at,` puis
-- `null::timestamptz as expires_at,`. Le premier de ces deux lignes est
-- UNIQUE dans toute la fonction — les dix branches ont dix alias distincts —
-- alors que le second, seul, apparaît huit fois. C'est le COUPLE qui sert
-- d'ancre ; un `replace` sur la seule ligne d'échéance frapperait les huit
-- d'un coup avec un alias faux pour sept d'entre elles.
--
-- Trois gardes, comptées et non arrondies :
--   1. chaque ancre est présente exactement UNE fois avant sa substitution ;
--   2. après les huit passes, il ne reste ZÉRO branche rendant une échéance
--      nulle — c'est la garde de COMPLÉTUDE : sans elle, sept branches
--      corrigées sur huit passeraient pour un succès ;
--   3. le corps INSTALLÉ porte la marque (contrôle final sur le catalogue).
do $migration$
declare
  v_def text;
  v_motif text;
  v_grave text;
  v_hits int;
  v_reste int;
  v_i int;
  v_nul constant text := '      null::timestamptz as expires_at,';
  -- Alias de la table d'ÉMISSION dans sync_reward_issuance, et colonne
  -- qu'elle rend comme `issued_at`. Le couple est unique par branche.
  -- `participations` (p) et `contest_awards` (ca) sont absents : ils portent
  -- déjà leur échéance.
  v_branches constant text[][] := array[
    array['hc', 'completed_at'],
    array['lr', 'earned_at'],
    array['jw', 'drawn_at'],
    array['ew', 'created_at'],
    array['co', 'opened_at'],
    array['cr', 'created_at'],
    array['rr', 'created_at'],
    array['qr', 'created_at']
  ];
begin
  select pg_get_functiondef(p.oid) into strict v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'sync_reward_issuance';

  for v_i in 1 .. array_length(v_branches, 1) loop
    v_motif :=
      '      ' || v_branches[v_i][1] || '.' || v_branches[v_i][2]
        || ' as issued_at,' || E'\n' || v_nul;
    v_grave :=
      '      ' || v_branches[v_i][1] || '.' || v_branches[v_i][2]
        || ' as issued_at,' || E'\n'
      || '      -- ÉCHÉANCE GRAVÉE À L''ÉMISSION (20260904120000) : lue sur la'
        || E'\n'
      || '      -- ligne émise, jamais recalculée depuis la parente.' || E'\n'
      || '      ' || v_branches[v_i][1] || '.redeem_expires_at as expires_at,';

    v_hits := (length(v_def)
               - length(replace(v_def, v_motif, '')))
              / length(v_motif);
    if v_hits <> 1 then
      raise exception
        'sync_reward_issuance porte % occurrence(s) de l''ancre « %.% as issued_at » au lieu d''une seule : la fonction a changé, cette migration décrirait du code qui n''existe plus',
        v_hits, v_branches[v_i][1], v_branches[v_i][2];
    end if;

    v_def := replace(v_def, v_motif, v_grave);
  end loop;

  -- Garde de COMPLÉTUDE. Sept branches sur huit corrigées rendraient un
  -- résultat parfaitement plausible : la famille oubliée n'expirerait
  -- simplement jamais, et rien ne le dirait.
  v_reste := (length(v_def)
              - length(replace(v_def, v_nul, '')))
             / length(v_nul);
  if v_reste <> 0 then
    raise exception
      '% branche(s) de sync_reward_issuance rendent encore une échéance nulle',
      v_reste;
  end if;

  execute v_def;
end
$migration$;

-- ════════════════════════════════════════════════════════════
-- 6. Le repli legacy refuse aussi un code expiré
-- ════════════════════════════════════════════════════════════
-- La caisse passe par `redeem_reward_by_code` AVANT tout repli legacy
-- (`redeemThroughUniversalRegistry`, les neuf points d'entrée de
-- src/actions/participations.ts), et ce moteur applique déjà l'échéance. Le
-- §5 suffirait donc… tant que le registre répond.
--
-- Mais le repli existe précisément pour le cas où il ne répond PAS
-- (`rewards.registry_error`). Sans ce §6, une panne du registre deviendrait
-- une remise de codes périmés : le seul moment où la garde compte est
-- justement celui où elle disparaîtrait.
--
-- Même dérivation qu'au §5, mêmes raisons : ces sept RPC sont longues et
-- sensibles, et une seule ligne y change. L'ancre est le prédicat
-- d'idempotence de l'UPDATE (`and <alias>.redeemed_at is null`), unique dans
-- chaque fonction — aucune des sept lectures de retour ne le porte.
--
-- Ce que ce bloc NE change PAS, et pourquoi : la LECTURE de retour reste
-- sans filtre d'échéance. C'est elle qui permet à la caisse d'expliquer un
-- refus plutôt que de répondre « code inconnu » — la même règle que
-- redeem_contest_award, dont l'UPDATE filtre l'échéance et dont le `return
-- query` ne la filtre pas. La signature de retour n'est pas élargie : la
-- changer imposerait un `drop function` sur sept RPC en production et ferait
-- bouger les types générés, pour une information que le moteur unique porte
-- déjà. Conséquence assumée et écrite : sur le seul chemin de repli, un code
-- expiré est refusé sans que la caisse puisse dire « expiré » — elle affiche
-- le lot comme non remis. C'est un défaut d'EXPLICATION sur un chemin de
-- panne, pas un défaut de garde.
--
-- Trois gardes, comme au §5 :
--   1. l'ancre est présente exactement UNE fois avant substitution ;
--   2. le prédicat neuf est absent AVANT et présent exactement une fois
--      APRÈS — c'est ce qui distingue « la substitution a mordu » de « le
--      texte était déjà là » ;
--   3. le corps INSTALLÉ porte la marque (contrôle final sur le catalogue).
--
-- `redeem_calendar_reward` figure DEUX fois : elle porte deux UPDATE, un par
-- table d'émission du calendrier. Chaque passe relit la définition vivante,
-- donc la seconde voit la première.
do $legacy$
declare
  v_def text;
  v_motif text;
  v_ajout text;
  v_pred text;
  v_hits int;
  v_i int;
  -- (fonction, alias de la table d'émission dans l'UPDATE, indentation de
  -- l'ancre). L'indentation est portée explicitement : le second UPDATE du
  -- calendrier est imbriqué dans un `if`, donc décalé de deux espaces.
  v_cibles constant text[][] := array[
    array['redeem_hunt_completion', 'c',  '     '],
    array['redeem_loyalty_reward',  'r',  '     '],
    array['redeem_jackpot_prize',   'w',  '     '],
    array['redeem_event_prize',     'w',  '     '],
    array['redeem_calendar_reward', 'o',  '     '],
    array['redeem_calendar_reward', 'r',  '       '],
    array['redeem_referral_reward', 'r',  '     '],
    array['redeem_quiz_reward',     'r',  '     ']
  ];
begin
  for v_i in 1 .. array_length(v_cibles, 1) loop
    select pg_get_functiondef(p.oid) into strict v_def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = v_cibles[v_i][1];

    v_motif := v_cibles[v_i][3] || 'and ' || v_cibles[v_i][2]
               || '.redeemed_at is null';
    v_pred := 'and (' || v_cibles[v_i][2] || '.redeem_expires_at is null or '
              || v_cibles[v_i][2] || '.redeem_expires_at > pg_catalog.now())';
    v_ajout := v_motif || E'\n'
      || v_cibles[v_i][3]
      || '-- ÉCHÉANCE OPPOSÉE AU REPLI LEGACY (20260904120000). Le moteur'
      || E'\n' || v_cibles[v_i][3]
      || '-- unique refuse déjà un code expiré ; ce chemin ne sert QUE quand'
      || E'\n' || v_cibles[v_i][3]
      || '-- le registre est injoignable, et sans ce prédicat une panne du'
      || E'\n' || v_cibles[v_i][3]
      || '-- registre remettrait des lots périmés. La lecture de retour, en'
      || E'\n' || v_cibles[v_i][3]
      || '-- revanche, reste sans filtre : la caisse doit pouvoir répondre.'
      || E'\n' || v_cibles[v_i][3] || v_pred;

    v_hits := (length(v_def)
               - length(replace(v_def, v_motif, '')))
              / length(v_motif);
    if v_hits <> 1 then
      raise exception
        '%() porte % occurrence(s) de l''ancre « % » au lieu d''une seule : la fonction a changé',
        v_cibles[v_i][1], v_hits, v_motif;
    end if;

    if position(v_pred in v_def) > 0 then
      raise exception
        '%() porte déjà le prédicat d''échéance pour l''alias % : cette migration ne mordrait pas',
        v_cibles[v_i][1], v_cibles[v_i][2];
    end if;

    v_def := replace(v_def, v_motif, v_ajout);

    v_hits := (length(v_def)
               - length(replace(v_def, v_pred, '')))
              / length(v_pred);
    if v_hits <> 1 then
      raise exception
        '%() porte % occurrence(s) du prédicat neuf au lieu d''une seule',
        v_cibles[v_i][1], v_hits;
    end if;

    execute v_def;
  end loop;
end
$legacy$;

-- ════════════════════════════════════════════════════════════
-- 7. Contrôle final sur le catalogue VIVANT
-- ════════════════════════════════════════════════════════════
-- Ce qui compte est ce qui est INSTALLÉ, jamais ce que la migration croit
-- avoir fait. Les deux gels portés par `upsert_reward_issuance` sont
-- revérifiés au passage : le §5 réécrit sa VOISINE, pas elle, mais la
-- vérification coûte une ligne et un jour quelqu'un déplacera la
-- substitution.
do $verif$
declare
  v_manquantes text;
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'sync_reward_issuance'
      and p.prosrc like '%ÉCHÉANCE GRAVÉE À L''ÉMISSION (20260904120000)%'
  ) then
    raise exception 'la lecture de l''échéance n''est pas dans le corps installé de sync_reward_issuance';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'sync_reward_issuance'
      and p.prosrc like '%null::timestamptz as expires_at%'
  ) then
    raise exception 'une branche de sync_reward_issuance rend encore une échéance nulle dans le corps INSTALLÉ';
  end if;

  select string_agg(nom, ', ' order by nom) into v_manquantes
    from unnest(array[
      'redeem_hunt_completion', 'redeem_loyalty_reward',
      'redeem_jackpot_prize', 'redeem_event_prize',
      'redeem_calendar_reward', 'redeem_referral_reward',
      'redeem_quiz_reward'
    ]) as nom
   where not exists (
     select 1 from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = nom
       and p.prosrc like '%ÉCHÉANCE OPPOSÉE AU REPLI LEGACY (20260904120000)%'
   );
  if v_manquantes is not null then
    raise exception 'le prédicat d''échéance manque au corps installé de : %', v_manquantes;
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'upsert_reward_issuance'
      and p.prosrc like '%LIBELLÉ GRAVÉ À L''ÉMISSION%'
      and p.prosrc like '%DESCRIPTION GRAVÉE À L''ÉMISSION%'
  ) then
    raise exception 'les gels de 20260814120000 / 20260901120000 ont disparu de upsert_reward_issuance';
  end if;
end
$verif$;
