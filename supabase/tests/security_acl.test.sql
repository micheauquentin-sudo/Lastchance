begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- L'audit interroge les ACL réellement installées, pas une liste maintenue
-- dans la CI ou une analyse textuelle des migrations.
select ok(not has_schema_privilege('anon', 'public', 'CREATE'), 'anon cannot create objects in public');
select ok(not has_schema_privilege('authenticated', 'public', 'CREATE'), 'authenticated cannot shadow SECURITY DEFINER objects');
select ok(not has_function_privilege('anon', 'public.decrement_prize_stock(uuid)', 'EXECUTE'), 'anon cannot decrement stock');
select ok(not has_table_privilege('anon', 'public.campaigns', 'SELECT'), 'anon cannot query campaigns directly');
select ok(not has_table_privilege('anon', 'public.participations', 'SELECT'), 'anon cannot query customer data directly');
select ok(not has_table_privilege('anon', 'public.spins', 'INSERT'), 'anon cannot create spins directly');
select ok(not has_function_privilege('authenticated', 'public.decrement_prize_stock(uuid)', 'EXECUTE'), 'merchant cannot decrement stock RPC');
-- Signature à 8 arguments depuis 20260927120000 (`p_idempotency_key`). Ces deux
-- lignes doivent suivre chaque changement de signature : `has_function_privilege`
-- LÈVE sur une signature inconnue, un moteur renommé rougirait donc ici en
-- premier — ce qui est le comportement voulu.
select ok(has_function_privilege('service_role', 'public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text)', 'EXECUTE'), 'only server can perform atomic spin');
select ok(not has_function_privilege('authenticated', 'public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text)', 'EXECUTE'), 'merchant cannot perform atomic spin');
-- Reprise d'un gain non réclamé (JOU-1) : elle lit des spins gagnants d'un
-- joueur sur une roue, et le spin_id qu'elle rend est ce que le serveur signe en
-- jeton de retrait. Une porte marchande ou anonyme y serait un vol de lot.
select ok(has_function_privilege('service_role', 'public.recover_pending_spin(uuid,text)', 'EXECUTE'), 'only server can recover a pending win');
select ok(not has_function_privilege('authenticated', 'public.recover_pending_spin(uuid,text)', 'EXECUTE'), 'merchant cannot probe player pending wins');
select ok(not has_function_privilege('anon', 'public.recover_pending_spin(uuid,text)', 'EXECUTE'), 'anon cannot recover a pending win');
select ok(has_function_privilege('service_role', 'public.claim_winning_spin(uuid,text,text,text,boolean,boolean)', 'EXECUTE'), 'only server can atomically claim');
select ok(not has_function_privilege('authenticated', 'public.claim_winning_spin(uuid,text,text,text,boolean,boolean)', 'EXECUTE'), 'merchant cannot claim arbitrary spin');
select ok(has_function_privilege('service_role', 'public.redeem_by_code(uuid,text,text,integer)', 'EXECUTE'), 'server can redeem by code');
select ok(not has_function_privilege('authenticated', 'public.redeem_by_code(uuid,text,text,integer)', 'EXECUTE'), 'cashier session cannot bypass server guards');
-- Registre universel : aucune lecture/écriture directe marchande. Seule la
-- service role peut utiliser la RPC de remise ; les helpers de trigger restent
-- inaccessibles même si leur SECURITY DEFINER contourne la RLS.
select ok(not has_table_privilege('anon', 'public.reward_issuances', 'SELECT'), 'anon cannot read universal reward codes');
select ok(not has_table_privilege('authenticated', 'public.reward_issuances', 'SELECT'), 'merchant cannot enumerate universal reward codes');
select ok(not has_table_privilege('authenticated', 'public.reward_issuances', 'INSERT'), 'merchant cannot mint universal rewards');
select ok(not has_table_privilege('authenticated', 'public.reward_issuances', 'UPDATE'), 'merchant cannot forge universal reward lifecycle');
select ok(has_table_privilege('service_role', 'public.reward_issuances', 'SELECT'), 'server can read universal rewards');
select ok(has_table_privilege('service_role', 'public.reward_issuances', 'INSERT'), 'server can mirror universal rewards');
select ok(has_table_privilege('service_role', 'public.reward_issuances', 'UPDATE'), 'server can reconcile universal rewards');
select ok(has_function_privilege('service_role', 'public.redeem_reward_by_code(uuid,text,text,integer)', 'EXECUTE'), 'server can use universal redemption');
select ok(not has_function_privilege('authenticated', 'public.redeem_reward_by_code(uuid,text,text,integer)', 'EXECUTE'), 'merchant cannot bypass the universal cashier action');
select ok(not has_function_privilege('anon', 'public.redeem_reward_by_code(uuid,text,text,integer)', 'EXECUTE'), 'anon cannot redeem universal rewards');
select ok(not has_function_privilege('authenticated', 'public.sync_reward_issuance(text,uuid)', 'EXECUTE'), 'merchant cannot invoke reward reconciliation');
select ok(not has_function_privilege('anon', 'public.upsert_reward_issuance(uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,timestamp with time zone,text,integer)', 'EXECUTE'), 'anon cannot invoke reward upsert');
select ok(has_function_privilege('authenticated', 'public.cancel_participation(uuid,uuid,text,boolean)', 'EXECUTE'), 'editor can cancel a claim through the audited RPC');
select ok(not has_function_privilege('anon', 'public.cancel_participation(uuid,uuid,text,boolean)', 'EXECUTE'), 'anon cannot cancel claims');
select ok(has_function_privilege('authenticated', 'public.org_prize_funnel(uuid,integer)', 'EXECUTE'), 'team can read its prize funnel (guarded in-function)');
select ok(not has_function_privilege('anon', 'public.org_prize_funnel(uuid,integer)', 'EXECUTE'), 'anon cannot read funnels');
select ok(not has_function_privilege('authenticated', 'public.lookup_redeem_code(uuid,text)', 'EXECUTE'), 'legacy cashier lookup is revoked');
select ok(not has_function_privilege('authenticated', 'public.redeem_participation(uuid,uuid)', 'EXECUTE'), 'legacy redeem is revoked');
select ok(has_function_privilege('authenticated', 'public.create_organization(text,text)', 'EXECUTE'), 'authenticated can onboard through narrow RPC');
select ok(not has_column_privilege('authenticated', 'public.organizations', 'webhook_secret', 'SELECT'), 'merchant cannot read webhook secret');
select ok(has_column_privilege('authenticated', 'public.organizations', 'addon_pronostics', 'SELECT'), 'merchant can read pronostics entitlement');
select ok(has_column_privilege('authenticated', 'public.organizations', 'comp_access', 'SELECT'), 'merchant can read complimentary entitlement');
select ok(has_column_privilege('authenticated', 'public.organizations', 'comp_access_until', 'SELECT'), 'merchant can read complimentary entitlement expiry');
select ok(not has_column_privilege('authenticated', 'public.organizations', 'comp_access_note', 'SELECT'), 'merchant cannot read internal complimentary-access note');
-- Invitation avant-jeu (20260918120000). Les trois liens sont LISIBLES —
-- l'écran de Réglages doit les afficher — et NON ÉCRIVABLES : `organizations`
-- ne porte aucune policy UPDATE depuis 00017 et l'écriture passe par le
-- serveur en service_role après garde owner. Un `grant update` accidentel
-- laisserait un membre `editor` réécrire l'adresse vers laquelle on envoie
-- les joueurs ; ces six assertions sont là pour qu'il ne passe pas.
select ok(has_column_privilege('authenticated', 'public.organizations', 'google_review_url', 'SELECT'), 'merchant can read its Google review link');
select ok(has_column_privilege('authenticated', 'public.organizations', 'instagram_url', 'SELECT'), 'merchant can read its Instagram link');
select ok(has_column_privilege('authenticated', 'public.organizations', 'tiktok_url', 'SELECT'), 'merchant can read its TikTok link');
select ok(not has_column_privilege('authenticated', 'public.organizations', 'google_review_url', 'UPDATE'), 'merchant cannot rewrite the Google review link directly');
select ok(not has_column_privilege('authenticated', 'public.organizations', 'instagram_url', 'UPDATE'), 'merchant cannot rewrite the Instagram link directly');
select ok(not has_column_privilege('authenticated', 'public.organizations', 'tiktok_url', 'UPDATE'), 'merchant cannot rewrite the TikTok link directly');
-- L'ACTIVATION, elle, est un réglage d'opération de même nature que
-- `collect_email` : le dashboard l'écrit directement. `campaigns` accorde
-- l'UPDATE en LISTE BLANCHE DE COLONNES depuis 20260906120000 — une colonne
-- neuve n'y entre pas toute seule, d'où cette assertion.
select ok(has_column_privilege('authenticated', 'public.campaigns', 'prejeu_invitation', 'SELECT'), 'merchant can read the pre-game invitation toggle');
select ok(has_column_privilege('authenticated', 'public.campaigns', 'prejeu_invitation', 'UPDATE'), 'merchant can toggle the pre-game invitation');
-- Partage après jeu (20260919120000). Même mécanique de droits que ci-dessus,
-- et même raison de l'asserter : la liste blanche de colonnes n'accueille pas
-- une colonne neuve toute seule. Sans le grant, l'interrupteur du dashboard
-- échouerait silencieusement à l'enregistrement.
select ok(has_column_privilege('authenticated', 'public.campaigns', 'share_enabled', 'SELECT'), 'merchant can read the post-game share toggle');
select ok(has_column_privilege('authenticated', 'public.campaigns', 'share_enabled', 'UPDATE'), 'merchant can toggle the post-game share block');
select ok(not has_table_privilege('authenticated', 'public.merchant_deletion_jobs', 'SELECT'), 'merchant cannot read deletion jobs');
select ok(has_table_privilege('service_role', 'public.merchant_deletion_jobs', 'INSERT'), 'server can create deletion jobs');
select ok(has_table_privilege('service_role', 'public.merchant_deletion_jobs', 'UPDATE'), 'server can advance deletion jobs');
select ok(not has_table_privilege('authenticated', 'public.ops_worker_runs', 'SELECT'), 'merchant cannot read worker heartbeats');
select ok(has_table_privilege('service_role', 'public.ops_worker_runs', 'INSERT'), 'server can open worker heartbeats');
select ok(not has_function_privilege('authenticated', 'public.ops_workers_health()', 'EXECUTE'), 'merchant cannot inspect worker or Vault health');
select ok(not has_table_privilege('authenticated', 'public.ops_worker_definitions', 'SELECT'), 'merchant cannot read the worker registry');
select ok(not has_table_privilege('anon', 'public.ops_worker_definitions', 'SELECT'), 'anon cannot read the worker registry');
select ok(has_table_privilege('service_role', 'public.ops_worker_definitions', 'UPDATE'), 'server can enrol a worker without a migration');
select ok(has_function_privilege('service_role', 'public.purge_ops_worker_runs(integer,integer)', 'EXECUTE'), 'server can prune the worker journal');
select ok(not has_function_privilege('authenticated', 'public.purge_ops_worker_runs(integer,integer)', 'EXECUTE'), 'merchant cannot prune the worker journal');
select ok(has_function_privilege('service_role', 'public.submit_contest_prediction(uuid,uuid,uuid,integer,integer)', 'EXECUTE'), 'only server can submit a public prediction');
select ok(not has_function_privilege('authenticated', 'public.submit_contest_prediction(uuid,uuid,uuid,integer,integer)', 'EXECUTE'), 'merchant cannot impersonate a contest player');
select ok(has_function_privilege('authenticated', 'public.set_contest_match_result(uuid,uuid,integer,integer,text,integer,integer)', 'EXECUTE'), 'editor can use the guarded result RPC');
select ok(has_function_privilege('service_role', 'public.purge_expired_contest_players()', 'EXECUTE'), 'server can purge contest PII');
select ok(has_function_privilege('service_role', 'public.contest_leaderboard(uuid,integer,integer,uuid)', 'EXECUTE'), 'server can read the aggregated leaderboard');
select ok(has_function_privilege('authenticated', 'public.contest_leaderboard(uuid,integer,integer,uuid)', 'EXECUTE'), 'owner dashboard can read the leaderboard (guarded in-function)');
select ok(not has_function_privilege('anon', 'public.contest_leaderboard(uuid,integer,integer,uuid)', 'EXECUTE'), 'anon cannot read the leaderboard (emails in payload)');
select ok(has_function_privilege('service_role', 'public.contest_player_rank(uuid,uuid,uuid)', 'EXECUTE'), 'server can read a single player rank');
select ok(not has_function_privilege('authenticated', 'public.contest_player_rank(uuid,uuid,uuid)', 'EXECUTE'), 'merchant cannot probe arbitrary player ranks');
select ok(has_function_privilege('service_role', 'public.claim_fixture_refresh(text,integer)', 'EXECUTE'), 'server can claim a fixture refresh');
select ok(not has_function_privilege('authenticated', 'public.claim_fixture_refresh(text,integer)', 'EXECUTE'), 'merchant cannot hold the shared refresh lock');
select ok(not has_table_privilege('authenticated', 'public.contest_players', 'INSERT'), 'merchant cannot create contest players directly');
select ok(not has_table_privilege('authenticated', 'public.contest_predictions', 'UPDATE'), 'merchant cannot rewrite customer predictions');
select ok(not has_column_privilege('authenticated', 'public.contests', 'scoring', 'UPDATE'), 'scoring changes must use the recalculation RPC');
select ok(has_column_privilege('authenticated', 'public.contests', 'name', 'UPDATE'), 'editor can still rename a contest');
select ok(not has_table_privilege('authenticated', 'public.contest_matches', 'UPDATE'), 'match results must use the atomic RPC');
select ok(not has_table_privilege('authenticated', 'public.contest_matches', 'DELETE'), 'match deletion must use the audited RPC');
select ok(not has_table_privilege('authenticated', 'public.contests', 'DELETE'), 'contest deletion must use the audited RPC');
select ok(has_function_privilege('authenticated', 'public.delete_contest_match(uuid,uuid,text)', 'EXECUTE'), 'editor can use guarded match deletion');
select ok(not has_column_privilege('authenticated', 'public.contests', 'status', 'UPDATE'), 'status transitions must use the guarded RPC');
select ok(not has_column_privilege('authenticated', 'public.contests', 'rewards', 'UPDATE'), 'rewards changes must use the audited RPC');
-- Simple entier borné par un CHECK, sans règle métier ni audit : la liste
-- blanche de colonnes suffit, l'élargir ne rouvre pas les colonnes gardées.
select ok(has_column_privilege('authenticated', 'public.contests', 'code_ttl_seconds', 'UPDATE'), 'editor can set the award code TTL directly');
select ok(has_function_privilege('authenticated', 'public.set_contest_status(uuid,uuid,text,text)', 'EXECUTE'), 'editor can transition status through the RPC');
select ok(has_function_privilege('authenticated', 'public.update_contest_rewards(uuid,uuid,jsonb,text)', 'EXECUTE'), 'editor can update rewards through the RPC');
select ok(has_function_privilege('authenticated', 'public.update_contest_tiebreaker(uuid,uuid,text,integer)', 'EXECUTE'), 'editor can configure the tiebreaker question');
select ok(has_function_privilege('authenticated', 'public.finalize_contest(uuid,uuid,integer)', 'EXECUTE'), 'owner can finalize through the RPC (owner-guarded in-function)');
select ok(has_function_privilege('authenticated', 'public.set_contest_award_status(uuid,uuid,text,text)', 'EXECUTE'), 'team can settle awards through the audited RPC');
-- Caisse pronostics : réservée au serveur, comme les 8 autres sources.
select ok(has_function_privilege('service_role', 'public.redeem_contest_award(uuid,text,text,integer)', 'EXECUTE'), 'server can redeem a PRONO- code');
select ok(not has_function_privilege('authenticated', 'public.redeem_contest_award(uuid,text,text,integer)', 'EXECUTE'), 'cashier session cannot bypass the contest redeem guards');
select ok(not has_function_privilege('anon', 'public.redeem_contest_award(uuid,text,text,integer)', 'EXECUTE'), 'anon cannot redeem a contest award');
select ok(not has_function_privilege('anon', 'public.finalize_contest(uuid,uuid,integer)', 'EXECUTE'), 'anon cannot finalize a contest');
select ok(not has_table_privilege('authenticated', 'public.contest_final_standings', 'SELECT'), 'final standings are served through the leaderboard RPC only');
select ok(not has_table_privilege('authenticated', 'public.contest_recovery_tokens', 'SELECT'), 'recovery tokens are server-only');
select ok(not has_table_privilege('anon', 'public.contest_recovery_tokens', 'SELECT'), 'anon cannot read recovery tokens');
select ok(has_table_privilege('service_role', 'public.contest_recovery_tokens', 'INSERT'), 'server can mint recovery tokens');
select ok(not has_table_privilege('authenticated', 'public.contest_awards', 'INSERT'), 'awards are only created by the finalize RPC');
select ok(has_table_privilege('authenticated', 'public.contest_awards', 'SELECT'), 'team can list awards (RLS-scoped)');
select ok(has_function_privilege('authenticated', 'public.delete_contest(uuid,uuid)', 'EXECUTE'), 'editor can use guarded contest deletion');

-- ── Ligues privées Pronostics ──
select ok(not has_table_privilege('anon', 'public.contest_leagues', 'SELECT'), 'anon cannot read private leagues');
select ok(has_table_privilege('authenticated', 'public.contest_leagues', 'SELECT'), 'team can list leagues (RLS-scoped)');
select ok(not has_table_privilege('authenticated', 'public.contest_leagues', 'INSERT'), 'leagues are only created by the guarded RPC');
select ok(not has_table_privilege('anon', 'public.contest_league_members', 'SELECT'), 'anon cannot read league membership');
select ok(not has_table_privilege('authenticated', 'public.contest_league_members', 'INSERT'), 'league membership changes go through the RPCs');
select ok(has_function_privilege('service_role', 'public.create_contest_league(uuid,uuid,text)', 'EXECUTE'), 'server can create a league for a player');
select ok(not has_function_privilege('authenticated', 'public.create_contest_league(uuid,uuid,text)', 'EXECUTE'), 'merchant cannot create leagues on behalf of players');
select ok(has_function_privilege('service_role', 'public.join_contest_league(uuid,uuid,text)', 'EXECUTE'), 'server can join a league by code');
select ok(not has_function_privilege('authenticated', 'public.join_contest_league(uuid,uuid,text)', 'EXECUTE'), 'merchant cannot join a league');
select ok(has_function_privilege('service_role', 'public.leave_contest_league(uuid,uuid,uuid)', 'EXECUTE'), 'server can remove a league member');
select ok(not has_function_privilege('authenticated', 'public.leave_contest_league(uuid,uuid,uuid)', 'EXECUTE'), 'merchant cannot remove league members');

-- ── Automatisations commerçant ──
select ok(has_function_privilege('service_role', 'public.run_campaign_schedule()', 'EXECUTE'), 'server can run the campaign scheduler');
select ok(not has_function_privilege('authenticated', 'public.run_campaign_schedule()', 'EXECUTE'), 'merchant cannot force scheduled transitions');
select ok(not has_function_privilege('anon', 'public.run_campaign_schedule()', 'EXECUTE'), 'anon cannot run the scheduler');
select ok(has_table_privilege('authenticated', 'public.automation_settings', 'SELECT'), 'team can read automation settings (RLS-scoped)');
select ok(has_table_privilege('authenticated', 'public.automation_settings', 'UPDATE'), 'editors can write automation settings (policy-scoped)');
select ok(not has_table_privilege('anon', 'public.automation_settings', 'SELECT'), 'anon cannot read automation settings');
select ok(not has_table_privilege('anon', 'public.email_log', 'SELECT'), 'anon cannot read the scenario email log');
select ok(not has_table_privilege('authenticated', 'public.email_log', 'INSERT'), 'the email log is written by the worker only');
select ok(has_table_privilege('service_role', 'public.email_log', 'INSERT'), 'server can journal scenario emails');
select ok(has_function_privilege('service_role', 'public.automation_won_not_redeemed_targets(uuid,integer,integer)', 'EXECUTE'), 'server can target unredeemed wins');
select ok(not has_function_privilege('authenticated', 'public.automation_won_not_redeemed_targets(uuid,integer,integer)', 'EXECUTE'), 'merchant cannot pull automation targets directly');
select ok(has_function_privilege('service_role', 'public.automation_inactive_targets(uuid,integer,integer)', 'EXECUTE'), 'server can target inactive subscribers');
select ok(not has_function_privilege('authenticated', 'public.automation_inactive_targets(uuid,integer,integer)', 'EXECUTE'), 'merchant cannot enumerate inactive subscribers via RPC');
select ok(has_function_privilege('service_role', 'public.automation_post_redemption_targets(uuid,integer,integer)', 'EXECUTE'), 'server can target post-redemption follow-ups');
select ok(not has_function_privilege('authenticated', 'public.automation_post_redemption_targets(uuid,integer,integer)', 'EXECUTE'), 'merchant cannot pull post-redemption targets');
select ok(has_function_privilege('service_role', 'public.automation_birthday_targets(uuid,integer)', 'EXECUTE'), 'server can target birthdays');
select ok(not has_function_privilege('authenticated', 'public.automation_birthday_targets(uuid,integer)', 'EXECUTE'), 'merchant cannot enumerate birth dates via RPC');

-- ── Chasse au trésor multi-QR ──
select ok(has_column_privilege('authenticated', 'public.organizations', 'addon_hunts', 'SELECT'), 'merchant can read hunts entitlement');
select ok(not has_table_privilege('anon', 'public.hunts', 'SELECT'), 'anon cannot read hunts');
select ok(not has_table_privilege('anon', 'public.hunt_steps', 'SELECT'), 'anon cannot enumerate step QR tokens');
select ok(not has_table_privilege('anon', 'public.hunt_players', 'SELECT'), 'anon cannot read hunt players');
select ok(not has_table_privilege('anon', 'public.hunt_completions', 'SELECT'), 'anon cannot read hunt redeem codes');
select ok(not has_table_privilege('authenticated', 'public.hunt_players', 'INSERT'), 'merchant cannot forge hunt players');
select ok(not has_table_privilege('authenticated', 'public.hunt_scans', 'INSERT'), 'merchant cannot forge hunt scans');
select ok(not has_table_privilege('authenticated', 'public.hunt_completions', 'INSERT'), 'merchant cannot mint hunt redeem codes');
select ok(not has_table_privilege('authenticated', 'public.hunt_completions', 'UPDATE'), 'hunt redemption must use the audited RPC');
select ok(not has_column_privilege('authenticated', 'public.hunts', 'reward_claimed_count', 'UPDATE'), 'hunt claimed counter is RPC-managed');
select ok(has_column_privilege('authenticated', 'public.hunts', 'name', 'UPDATE'), 'editor can still rename a hunt');
select ok(has_function_privilege('service_role', 'public.record_hunt_scan(text,text)', 'EXECUTE'), 'only server can record a hunt scan');
select ok(not has_function_privilege('authenticated', 'public.record_hunt_scan(text,text)', 'EXECUTE'), 'merchant cannot stamp arbitrary players');
select ok(not has_function_privilege('anon', 'public.record_hunt_scan(text,text)', 'EXECUTE'), 'anon cannot call the scan RPC directly');
select ok(has_function_privilege('service_role', 'public.redeem_hunt_completion(uuid,text,text)', 'EXECUTE'), 'server can redeem a hunt code');
select ok(not has_function_privilege('authenticated', 'public.redeem_hunt_completion(uuid,text,text)', 'EXECUTE'), 'cashier session cannot bypass the hunt redeem guards');
select ok(has_function_privilege('service_role', 'public.purge_expired_hunt_players()', 'EXECUTE'), 'server can purge hunt players');
select ok(not has_function_privilege('authenticated', 'public.purge_expired_hunt_players()', 'EXECUTE'), 'merchant cannot trigger the hunt purge');
-- 20260815120000 : le solde hors scan émet de vrais codes CHASSE- sans geste
-- du joueur. Il s'appelle depuis le client de SESSION du commerçant — c'est
-- `auth.uid()` qui alimente `is_org_editor` —, donc `authenticated` et surtout
-- PAS `service_role`, sous lequel le prédicat est structurellement faux.
select ok(has_function_privilege('authenticated', 'public.settle_hunt_completions(uuid)', 'EXECUTE'), 'merchant session can settle hunt completions after a step removal');
select ok(not has_function_privilege('anon', 'public.settle_hunt_completions(uuid)', 'EXECUTE'), 'anon cannot mint hunt codes through the settlement RPC');
select ok(not has_function_privilege('service_role', 'public.settle_hunt_completions(uuid)', 'EXECUTE'), 'no dead service_role grant on the settlement RPC (auth.uid() is null there)');
select ok(has_function_privilege('authenticated', 'public.hunt_players_in_progress(uuid)', 'EXECUTE'), 'merchant session can count hunt players in progress');
select ok(not has_function_privilege('anon', 'public.hunt_players_in_progress(uuid)', 'EXECUTE'), 'anon cannot count hunt players');
select ok(not has_function_privilege('service_role', 'public.hunt_players_in_progress(uuid)', 'EXECUTE'), 'no dead service_role grant on the in-progress count');
-- 20260817120000 : la prévision du solde. Simple lecture, mais elle porte les
-- MÊMES gardes que le solde qu'elle annonce — sinon elle ferait renoncer un
-- commerçant à un geste inoffensif. Même ACL que ses deux voisines.
select ok(has_function_privilege('authenticated', 'public.hunt_settlement_preview(uuid,uuid)', 'EXECUTE'), 'merchant session can preview what a step removal would settle');
select ok(not has_function_privilege('anon', 'public.hunt_settlement_preview(uuid,uuid)', 'EXECUTE'), 'anon cannot probe a hunt settlement');
select ok(not has_function_privilege('service_role', 'public.hunt_settlement_preview(uuid,uuid)', 'EXECUTE'), 'no dead service_role grant on the settlement preview');

-- ── Passeport de fidélité ──
select ok(has_column_privilege('authenticated', 'public.organizations', 'addon_loyalty', 'SELECT'), 'merchant can read loyalty entitlement');
select ok(not has_table_privilege('anon', 'public.loyalty_programs', 'SELECT'), 'anon cannot read loyalty programs');
select ok(not has_table_privilege('anon', 'public.loyalty_members', 'SELECT'), 'anon cannot read loyalty passports');
select ok(not has_table_privilege('anon', 'public.loyalty_rewards', 'SELECT'), 'anon cannot read loyalty redeem codes');
select ok(not has_column_privilege('authenticated', 'public.loyalty_programs', 'rotating_secret', 'SELECT'), 'merchant cannot read the rotating-code secret');
select ok(has_column_privilege('service_role', 'public.loyalty_programs', 'rotating_secret', 'SELECT'), 'server can read the rotating-code secret');
select ok(not has_table_privilege('authenticated', 'public.loyalty_members', 'INSERT'), 'merchant cannot forge loyalty passports');
select ok(not has_table_privilege('authenticated', 'public.loyalty_stamps', 'INSERT'), 'merchant cannot forge loyalty stamps');
select ok(not has_table_privilege('authenticated', 'public.loyalty_rewards', 'INSERT'), 'merchant cannot mint loyalty rewards');
select ok(not has_table_privilege('authenticated', 'public.loyalty_rewards', 'UPDATE'), 'loyalty redemption must use the audited RPC');
select ok(not has_column_privilege('authenticated', 'public.loyalty_milestones', 'reward_claimed_count', 'UPDATE'), 'loyalty claimed counter is RPC-managed');
select ok(has_column_privilege('authenticated', 'public.loyalty_milestones', 'reward_label', 'UPDATE'), 'editor can still edit a milestone reward');
-- Signature 5-aire depuis 20260915120000 (p_order_token). L'ANCIENNE 4-aire a
-- été droppée : la citer ici ne rendrait pas `false`, `has_function_privilege`
-- LÈVERAIT sur une signature inexistante et ce fichier échouerait sur une
-- erreur au lieu d'un verdict. L'absence de la 4-aire est prouvée dans
-- loyalty_order_codes.test.sql via to_regprocedure.
select ok(has_function_privilege('service_role', 'public.record_loyalty_stamp(uuid,text,text,uuid,text)', 'EXECUTE'), 'only server can record a loyalty stamp');
select ok(not has_function_privilege('authenticated', 'public.record_loyalty_stamp(uuid,text,text,uuid,text)', 'EXECUTE'), 'merchant cannot stamp arbitrary passports');
select ok(not has_function_privilege('anon', 'public.record_loyalty_stamp(uuid,text,text,uuid,text)', 'EXECUTE'), 'anon cannot call the stamp RPC directly');
-- QR de commande (20260915120000) : le jeton est un secret d'émission, et les
-- deux colonnes de consommation portent le « une seule fois » du cahier §7.
select ok(not has_table_privilege('anon', 'public.loyalty_order_codes', 'SELECT'), 'anon cannot read order QR tokens');
select ok(not has_table_privilege('anon', 'public.loyalty_order_codes', 'INSERT'), 'anon cannot forge order QR tokens');
select ok(not has_column_privilege('authenticated', 'public.loyalty_order_codes', 'consumed_at', 'UPDATE'), 'order code consumption is RPC-managed');
select ok(not has_column_privilege('authenticated', 'public.loyalty_order_codes', 'consumed_at', 'INSERT'), 'merchant cannot pre-burn an order code');
select ok(has_column_privilege('authenticated', 'public.loyalty_order_codes', 'label', 'UPDATE'), 'editor can still fix an order reference');
select ok(has_function_privilege('service_role', 'public.current_loyalty_code(uuid)', 'EXECUTE'), 'server can compute the current rotating code');
select ok(not has_function_privilege('authenticated', 'public.current_loyalty_code(uuid)', 'EXECUTE'), 'merchant session cannot read the rotating code RPC');
select ok(not has_function_privilege('anon', 'public.current_loyalty_code(uuid)', 'EXECUTE'), 'anon cannot read the rotating code');
select ok(has_function_privilege('service_role', 'public.consume_loyalty_spin_grant(uuid,text,text)', 'EXECUTE'), 'server can consume a spin grant');
select ok(not has_function_privilege('authenticated', 'public.consume_loyalty_spin_grant(uuid,text,text)', 'EXECUTE'), 'merchant cannot consume spin grants');
select ok(has_function_privilege('service_role', 'public.redeem_loyalty_reward(uuid,text,text)', 'EXECUTE'), 'server can redeem a loyalty code');
select ok(not has_function_privilege('authenticated', 'public.redeem_loyalty_reward(uuid,text,text)', 'EXECUTE'), 'cashier session cannot bypass the loyalty redeem guards');
select ok(has_function_privilege('service_role', 'public.purge_expired_loyalty_members()', 'EXECUTE'), 'server can purge loyalty passports');
select ok(not has_function_privilege('authenticated', 'public.purge_expired_loyalty_members()', 'EXECUTE'), 'merchant cannot trigger the loyalty purge');

-- Module Jackpot collectif (miroir du Passeport de fidélité).
select ok(has_column_privilege('authenticated', 'public.organizations', 'addon_jackpot', 'SELECT'), 'merchant can read jackpot entitlement');
select ok(not has_table_privilege('anon', 'public.jackpot_campaigns', 'SELECT'), 'anon cannot read jackpot campaigns');
select ok(not has_table_privilege('anon', 'public.jackpot_players', 'SELECT'), 'anon cannot read jackpot players');
select ok(not has_table_privilege('anon', 'public.jackpot_participants', 'SELECT'), 'anon cannot read jackpot draw entries');
select ok(not has_table_privilege('anon', 'public.jackpot_wins', 'SELECT'), 'anon cannot read jackpot redeem codes');
select ok(not has_column_privilege('authenticated', 'public.jackpot_campaigns', 'rotating_secret', 'SELECT'), 'merchant cannot read the jackpot rotating-code secret');
select ok(has_column_privilege('service_role', 'public.jackpot_campaigns', 'rotating_secret', 'SELECT'), 'server can read the jackpot rotating-code secret');
select ok(not has_table_privilege('authenticated', 'public.jackpot_players', 'INSERT'), 'merchant cannot forge jackpot players');
select ok(not has_table_privilege('authenticated', 'public.jackpot_participants', 'INSERT'), 'merchant cannot forge jackpot draw entries');
select ok(not has_table_privilege('authenticated', 'public.jackpot_wins', 'INSERT'), 'merchant cannot mint jackpot redeem codes');
select ok(not has_table_privilege('authenticated', 'public.jackpot_wins', 'UPDATE'), 'jackpot redemption must use the audited RPC');
select ok(not has_column_privilege('authenticated', 'public.jackpot_campaigns', 'current_count', 'UPDATE'), 'the shared gauge is RPC-managed');
select ok(not has_column_privilege('authenticated', 'public.jackpot_campaigns', 'cycle', 'UPDATE'), 'the jackpot cycle is RPC-managed');
select ok(not has_column_privilege('authenticated', 'public.jackpot_campaigns', 'reward_claimed_count', 'UPDATE'), 'jackpot claimed counter is RPC-managed');
select ok(has_column_privilege('authenticated', 'public.jackpot_campaigns', 'name', 'UPDATE'), 'editor can still rename a jackpot campaign');
select ok(has_function_privilege('service_role', 'public.record_jackpot_participation(uuid,text,text,uuid)', 'EXECUTE'), 'only server can record a jackpot participation');
select ok(not has_function_privilege('authenticated', 'public.record_jackpot_participation(uuid,text,text,uuid)', 'EXECUTE'), 'merchant cannot record arbitrary participations');
select ok(not has_function_privilege('anon', 'public.record_jackpot_participation(uuid,text,text,uuid)', 'EXECUTE'), 'anon cannot call the participation RPC directly');
select ok(has_function_privilege('service_role', 'public.current_jackpot_code(uuid)', 'EXECUTE'), 'server can compute the current jackpot rotating code');
select ok(not has_function_privilege('authenticated', 'public.current_jackpot_code(uuid)', 'EXECUTE'), 'merchant session cannot read the jackpot rotating code RPC');
select ok(not has_function_privilege('anon', 'public.current_jackpot_code(uuid)', 'EXECUTE'), 'anon cannot read the jackpot rotating code');
select ok(has_function_privilege('service_role', 'public.run_jackpot_date_draws()', 'EXECUTE'), 'server/cron can run date draws');
select ok(not has_function_privilege('authenticated', 'public.run_jackpot_date_draws()', 'EXECUTE'), 'merchant cannot trigger date draws');
select ok(not has_function_privilege('anon', 'public.run_jackpot_date_draws()', 'EXECUTE'), 'anon cannot trigger date draws');
select ok(has_function_privilege('service_role', 'public.redeem_jackpot_prize(uuid,text,text)', 'EXECUTE'), 'server can redeem a jackpot code');
select ok(not has_function_privilege('authenticated', 'public.redeem_jackpot_prize(uuid,text,text)', 'EXECUTE'), 'cashier session cannot bypass the jackpot redeem guards');
select ok(has_function_privilege('service_role', 'public.purge_expired_jackpot_players()', 'EXECUTE'), 'server can purge jackpot players');
select ok(not has_function_privilege('authenticated', 'public.purge_expired_jackpot_players()', 'EXECUTE'), 'merchant cannot trigger the jackpot purge');

-- Mode événement en direct : addon, cloisonnement anon, is_correct confidentiel,
-- machine à états et parcours joueur service-role only.
select ok(has_column_privilege('authenticated', 'public.organizations', 'addon_events', 'SELECT'), 'merchant can read events entitlement');
select ok(not has_table_privilege('anon', 'public.event_games', 'SELECT'), 'anon cannot read event games');
select ok(not has_table_privilege('anon', 'public.event_questions', 'SELECT'), 'anon cannot read event questions');
select ok(not has_table_privilege('anon', 'public.event_question_options', 'SELECT'), 'anon cannot read event answer keys');
select ok(not has_table_privilege('anon', 'public.event_sessions', 'SELECT'), 'anon cannot read event sessions');
select ok(not has_table_privilege('anon', 'public.event_players', 'SELECT'), 'anon cannot read event players');
select ok(not has_table_privilege('anon', 'public.event_answers', 'SELECT'), 'anon cannot read event answers');
select ok(not has_table_privilege('anon', 'public.event_wins', 'SELECT'), 'anon cannot read event redeem codes');
-- is_correct : la colonne existe et n'est jamais servie au public que via RPC.
select ok(has_column_privilege('service_role', 'public.event_question_options', 'is_correct', 'SELECT'), 'server can read the answer key');
select ok(not has_column_privilege('anon', 'public.event_question_options', 'is_correct', 'SELECT'), 'anon cannot read the answer key column');
select ok(not has_table_privilege('authenticated', 'public.event_players', 'INSERT'), 'merchant cannot forge event players');
select ok(not has_table_privilege('authenticated', 'public.event_answers', 'INSERT'), 'merchant cannot forge event answers');
select ok(not has_table_privilege('authenticated', 'public.event_wins', 'INSERT'), 'merchant cannot mint event redeem codes');
select ok(not has_table_privilege('authenticated', 'public.event_wins', 'UPDATE'), 'event redemption must use the audited RPC');
-- Machine à états : status/phase/current/prono/claimed sont RPC-only côté marchand.
select ok(not has_column_privilege('authenticated', 'public.event_sessions', 'phase', 'UPDATE'), 'the session phase is RPC-managed');
select ok(not has_column_privilege('authenticated', 'public.event_sessions', 'status', 'UPDATE'), 'the session status is RPC-managed');
select ok(not has_column_privilege('authenticated', 'public.event_sessions', 'current_question_id', 'UPDATE'), 'the current question is RPC-managed');
select ok(not has_column_privilege('authenticated', 'public.event_sessions', 'current_question_started_at', 'UPDATE'), 'the question start clock is RPC-managed');
select ok(not has_column_privilege('authenticated', 'public.event_sessions', 'prono_correct_option_id', 'UPDATE'), 'the prono correct option is RPC-managed');
select ok(not has_column_privilege('authenticated', 'public.event_sessions', 'reward_claimed_count', 'UPDATE'), 'the event claimed counter is RPC-managed');
select ok(not has_column_privilege('authenticated', 'public.event_sessions', 'state_revision', 'UPDATE'), 'the event revision is trigger-managed');
select ok(not has_column_privilege('authenticated', 'public.event_sessions', 'join_code', 'UPDATE'), 'the join code is trigger-managed');
select ok(has_column_privilege('authenticated', 'public.event_sessions', 'reward_stock', 'UPDATE'), 'editor can still set the reward stock');
-- Parcours joueur : service_role only.
select ok(has_function_privilege('service_role', 'public.join_event_session(text,text,text,text)', 'EXECUTE'), 'only server can join a session');
select ok(not has_function_privilege('authenticated', 'public.join_event_session(text,text,text,text)', 'EXECUTE'), 'merchant cannot impersonate a joining player');
select ok(not has_function_privilege('anon', 'public.join_event_session(text,text,text,text)', 'EXECUTE'), 'anon cannot call join directly');
select ok(has_function_privilege('service_role', 'public.submit_event_answer(uuid,uuid,text,uuid)', 'EXECUTE'), 'only server can submit an answer');
select ok(not has_function_privilege('authenticated', 'public.submit_event_answer(uuid,uuid,text,uuid)', 'EXECUTE'), 'merchant cannot submit answers on behalf of players');
select ok(not has_function_privilege('anon', 'public.submit_event_answer(uuid,uuid,text,uuid)', 'EXECUTE'), 'anon cannot submit answers directly');
select ok(has_function_privilege('service_role', 'public.event_public_state(uuid,text)', 'EXECUTE'), 'server can read the public state');
select ok(not has_function_privilege('authenticated', 'public.event_public_state(uuid,text)', 'EXECUTE'), 'merchant reads state through the server, not anon');
select ok(not has_function_privilege('anon', 'public.event_public_state(uuid,text)', 'EXECUTE'), 'anon cannot read the public state directly');
select ok(not has_function_privilege('anon', 'public.bump_event_state_revision()', 'EXECUTE'), 'anon cannot invoke the event revision trigger');
select ok(not has_function_privilege('authenticated', 'public.bump_event_state_revision()', 'EXECUTE'), 'merchant cannot invoke the event revision trigger');
-- Machine à états organisateur : authenticated (gardée is_org_editor) + service_role.
select ok(has_function_privilege('authenticated', 'public.launch_event_question(uuid,uuid,uuid)', 'EXECUTE'), 'organizer can launch a question (editor-guarded in-function)');
select ok(not has_function_privilege('anon', 'public.launch_event_question(uuid,uuid,uuid)', 'EXECUTE'), 'anon cannot drive the state machine');
select ok(has_function_privilege('authenticated', 'public.reveal_event_question(uuid,uuid,uuid)', 'EXECUTE'), 'organizer can reveal and score');
select ok(has_function_privilege('authenticated', 'public.end_event_session(uuid,uuid)', 'EXECUTE'), 'organizer can end the session');
select ok(has_function_privilege('service_role', 'public.redeem_event_prize(uuid,text,text)', 'EXECUTE'), 'server can redeem an event code');
select ok(not has_function_privilege('authenticated', 'public.redeem_event_prize(uuid,text,text)', 'EXECUTE'), 'cashier session cannot bypass the event redeem guards');
select ok(has_function_privilege('service_role', 'public.purge_expired_event_sessions()', 'EXECUTE'), 'server can purge event players');
select ok(not has_function_privilege('authenticated', 'public.purge_expired_event_sessions()', 'EXECUTE'), 'merchant cannot trigger the event purge');

-- Calendrier / campagnes quotidiennes : addon, cloisonnement anon, contenu de
-- case confidentiel (jamais anon), compteurs de stock RPC-only, parcours joueur
-- service-role only.
select ok(has_column_privilege('authenticated', 'public.organizations', 'addon_calendar', 'SELECT'), 'merchant can read calendar entitlement');
select ok(not has_table_privilege('anon', 'public.calendars', 'SELECT'), 'anon cannot read calendars');
select ok(not has_table_privilege('anon', 'public.calendar_days', 'SELECT'), 'anon cannot read calendar box content');
select ok(not has_table_privilege('anon', 'public.calendar_players', 'SELECT'), 'anon cannot read calendar players');
select ok(not has_table_privilege('anon', 'public.calendar_openings', 'SELECT'), 'anon cannot read calendar openings/codes');
select ok(not has_table_privilege('anon', 'public.calendar_rewards', 'SELECT'), 'anon cannot read calendar completion codes');
-- Le contenu d'une case (message, code) n'est jamais servi au public que via RPC.
select ok(has_column_privilege('service_role', 'public.calendar_days', 'content_text', 'SELECT'), 'server can read box content');
select ok(not has_column_privilege('anon', 'public.calendar_days', 'content_text', 'SELECT'), 'anon cannot read box content column');
select ok(not has_table_privilege('authenticated', 'public.calendar_players', 'INSERT'), 'merchant cannot forge calendar players');
select ok(not has_table_privilege('authenticated', 'public.calendar_openings', 'INSERT'), 'merchant cannot forge calendar openings/codes');
select ok(not has_table_privilege('authenticated', 'public.calendar_rewards', 'INSERT'), 'merchant cannot mint calendar completion codes');
select ok(not has_table_privilege('authenticated', 'public.calendar_openings', 'UPDATE'), 'calendar redemption must use the audited RPC');
select ok(not has_table_privilege('authenticated', 'public.calendar_rewards', 'UPDATE'), 'calendar completion redemption must use the audited RPC');
-- Compteurs de stock émis : RPC-only côté marchand.
select ok(not has_column_privilege('authenticated', 'public.calendars', 'completion_reward_claimed_count', 'UPDATE'), 'the completion claimed counter is RPC-managed');
select ok(not has_column_privilege('authenticated', 'public.calendar_days', 'reward_claimed_count', 'UPDATE'), 'the box claimed counter is RPC-managed');
select ok(has_column_privilege('authenticated', 'public.calendar_days', 'reward_stock', 'UPDATE'), 'editor can still set the box stock');
select ok(has_column_privilege('authenticated', 'public.calendar_days', 'unlock_at', 'UPDATE'), 'editor can still schedule the unlock time');
-- Parcours joueur : service_role only.
select ok(has_function_privilege('service_role', 'public.join_calendar(text,text,text,boolean,boolean)', 'EXECUTE'), 'only server can join a calendar');
select ok(not has_function_privilege('authenticated', 'public.join_calendar(text,text,text,boolean,boolean)', 'EXECUTE'), 'merchant cannot impersonate a joining player');
select ok(not has_function_privilege('anon', 'public.join_calendar(text,text,text,boolean,boolean)', 'EXECUTE'), 'anon cannot call join directly');
select ok(has_function_privilege('service_role', 'public.open_calendar_box(uuid,text,uuid)', 'EXECUTE'), 'only server can open a box');
select ok(not has_function_privilege('authenticated', 'public.open_calendar_box(uuid,text,uuid)', 'EXECUTE'), 'merchant cannot open boxes on behalf of players');
select ok(not has_function_privilege('anon', 'public.open_calendar_box(uuid,text,uuid)', 'EXECUTE'), 'anon cannot open boxes directly');
select ok(has_function_privilege('service_role', 'public.consume_calendar_spin_grant(uuid,text,text)', 'EXECUTE'), 'only server can consume a calendar spin grant');
select ok(not has_function_privilege('anon', 'public.consume_calendar_spin_grant(uuid,text,text)', 'EXECUTE'), 'anon cannot consume a calendar spin grant');
select ok(has_function_privilege('service_role', 'public.calendar_public_state(uuid,text)', 'EXECUTE'), 'server can read the calendar public state');
select ok(not has_function_privilege('authenticated', 'public.calendar_public_state(uuid,text)', 'EXECUTE'), 'merchant reads calendar state through the server, not anon');
select ok(not has_function_privilege('anon', 'public.calendar_public_state(uuid,text)', 'EXECUTE'), 'anon cannot read the calendar public state directly');
select ok(has_function_privilege('service_role', 'public.calendar_reminder_targets(uuid)', 'EXECUTE'), 'server/cron can list calendar reminder targets');
select ok(not has_function_privilege('authenticated', 'public.calendar_reminder_targets(uuid)', 'EXECUTE'), 'merchant cannot list calendar reminder targets');
select ok(not has_function_privilege('anon', 'public.calendar_reminder_targets(uuid)', 'EXECUTE'), 'anon cannot list calendar reminder targets');
select ok(has_function_privilege('service_role', 'public.redeem_calendar_reward(uuid,text,text)', 'EXECUTE'), 'server can redeem a calendar code');
select ok(not has_function_privilege('authenticated', 'public.redeem_calendar_reward(uuid,text,text)', 'EXECUTE'), 'cashier session cannot bypass the calendar redeem guards');
select ok(has_function_privilege('service_role', 'public.purge_expired_calendar_players()', 'EXECUTE'), 'server can purge calendar players');
select ok(not has_function_privilege('authenticated', 'public.purge_expired_calendar_players()', 'EXECUTE'), 'merchant cannot trigger the calendar purge');

-- Créateur de quiz : addon, cloisonnement anon, CORRIGÉ confidentiel (jamais
-- anon), compteurs de stock et état du tirage RPC-only, parcours joueur
-- service-role only, helper d'émission strictement interne.
select ok(has_column_privilege('authenticated', 'public.organizations', 'addon_quiz', 'SELECT'), 'merchant can read quiz entitlement');

-- Vitrine & Réserver (20261001120000). `organizations` fonctionne par grants de
-- COLONNES : sans celui-ci, ce n'est pas le seul droit vitrine qui tombe — le
-- `select` de `getUserAndOrg` énumère ses colonnes et serait refusé EN ENTIER.
select ok(has_column_privilege('authenticated', 'public.organizations', 'addon_vitrine', 'SELECT'), 'merchant can read vitrine entitlement');
select ok(not has_column_privilege('authenticated', 'public.organizations', 'addon_vitrine', 'UPDATE'), 'merchant cannot grant itself the vitrine entitlement');

-- Socle Réserver (20261002120000). Trois tables, et trois régimes distincts :
-- le catalogue d'activités et les créneaux sont ÉDITEURS (motif
-- campaign_templates) ; les réservations sont en LECTURE SEULE pour tous les
-- membres — le caissier a besoin de l'écran de comptoir — et n'acceptent
-- AUCUNE écriture directe, parce qu'une insertion PostgREST contournerait le
-- comptage sous verrou de `reserve_slot` et donc la capacité elle-même.
-- L'adresse est hors du grant de colonnes : elle n'existe que pour l'envoi
-- transactionnel côté serveur, jamais pour un écran.
select ok(not has_table_privilege('anon', 'public.reservation_activities', 'SELECT'), 'anon cannot read reservation activities');
select ok(not has_table_privilege('anon', 'public.reservation_slots', 'SELECT'), 'anon cannot read reservation slots');
select ok(not has_table_privilege('anon', 'public.reservations', 'SELECT'), 'anon cannot read reservations');
select ok(not has_column_privilege('authenticated', 'public.reservations', 'email', 'SELECT'), 'merchant session cannot read reservation email addresses');
select ok(has_column_privilege('authenticated', 'public.reservations', 'code', 'SELECT'), 'merchant session can read the check-in code');
select ok(not has_table_privilege('authenticated', 'public.reservations', 'INSERT'), 'merchant cannot insert a reservation past the capacity guard');
select ok(not has_table_privilege('authenticated', 'public.reservations', 'UPDATE'), 'merchant cannot check in a reservation by direct update');
select ok(not has_table_privilege('authenticated', 'public.reservations', 'DELETE'), 'merchant cannot delete a reservation');
-- NI SUR LES DEUX TABLES DE CONFIGURATION : la cascade y emporterait les
-- créneaux d'une activité PUIS les réservations de ces créneaux, donc
-- l'historique des arrivées, sans audit et sans que rien n'ait compté ce qui
-- disparaissait. `active = false` et `status = 'closed'` ferment sans effacer.
select ok(not has_table_privilege('authenticated', 'public.reservation_activities', 'DELETE'), 'merchant cannot delete a reservation activity and cascade away its arrival history');
select ok(not has_table_privilege('authenticated', 'public.reservation_slots', 'DELETE'), 'merchant cannot delete a reservation slot and cascade away its arrival history');
select ok(has_function_privilege('service_role', 'public.reserve_slot(uuid,uuid,text,text,boolean)', 'EXECUTE'), 'server can take a reservation slot');
select ok(not has_function_privilege('authenticated', 'public.reserve_slot(uuid,uuid,text,text,boolean)', 'EXECUTE'), 'merchant session cannot bypass the reservation capacity lock');
select ok(not has_function_privilege('anon', 'public.reserve_slot(uuid,uuid,text,text,boolean)', 'EXECUTE'), 'anon cannot reserve directly');
select ok(not has_function_privilege('authenticated', 'public.cancel_reservation(uuid,text)', 'EXECUTE'), 'merchant session cannot cancel through the player RPC');
select ok(not has_function_privilege('anon', 'public.cancel_reservation(uuid,text)', 'EXECUTE'), 'anon cannot cancel directly');
select ok(has_function_privilege('service_role', 'public.checkin_reservation(uuid,text,text)', 'EXECUTE'), 'server can validate an arrival');
select ok(not has_function_privilege('authenticated', 'public.checkin_reservation(uuid,text,text)', 'EXECUTE'), 'merchant session cannot bypass the check-in role guard');
select ok(not has_function_privilege('anon', 'public.checkin_reservation(uuid,text,text)', 'EXECUTE'), 'anon cannot check in a reservation');
select ok(not has_function_privilege('authenticated', 'public.reservation_public_state(uuid,text)', 'EXECUTE'), 'merchant cannot enumerate player reservations through the public RPC');
select ok(not has_function_privilege('anon', 'public.reservation_public_state(uuid,text)', 'EXECUTE'), 'anon cannot read the reservation public state directly');

-- Liste prioritaire et invitations privées (20261004120000, RES-2). Deux tables
-- neuves, deux régimes distincts : la FILE est lisible par tous les MEMBRES —
-- le caissier doit pouvoir dire à quelqu'un où il en est — les INVITATIONS le
-- sont par les seuls éditeurs, parce que c'est de la configuration. Aucune
-- écriture directe nulle part : l'ordre de la file et le compteur d'usages
-- décident de qui obtient une place, et une écriture PostgREST les
-- contournerait aussi sûrement qu'elle contournerait la capacité.
select ok(not has_table_privilege('anon', 'public.reservation_waitlist_entries', 'SELECT'), 'anon cannot read the reservation waitlist');
select ok(not has_table_privilege('anon', 'public.reservation_invitations', 'SELECT'), 'anon cannot read private reservation invitations');
select ok(not has_table_privilege('authenticated', 'public.reservation_waitlist_entries', 'INSERT'), 'merchant cannot insert itself into a waitlist');
select ok(not has_table_privilege('authenticated', 'public.reservation_waitlist_entries', 'UPDATE'), 'merchant cannot reorder a waitlist by direct update');
select ok(not has_table_privilege('authenticated', 'public.reservation_waitlist_entries', 'DELETE'), 'merchant cannot delete a waitlist entry');
select ok(not has_table_privilege('authenticated', 'public.reservation_invitations', 'INSERT'), 'merchant cannot forge an invitation outside the audited RPC');
select ok(not has_table_privilege('authenticated', 'public.reservation_invitations', 'UPDATE'), 'merchant cannot reset an invitation use counter by hand');
select ok(not has_table_privilege('authenticated', 'public.reservation_invitations', 'DELETE'), 'merchant cannot delete an invitation and its trace');
-- L'ADRESSE de la file et l'EMPREINTE du jeton sont hors des grants de colonnes,
-- pour la même raison que `reservations.email` : elles n'existent pas pour un
-- écran. Le jeton en clair, lui, n'entre jamais en base — seule son empreinte y
-- vit, et elle ne sort pas non plus.
select ok(not has_column_privilege('authenticated', 'public.reservation_waitlist_entries', 'email', 'SELECT'), 'merchant session cannot read waitlist email addresses');
select ok(has_column_privilege('authenticated', 'public.reservation_waitlist_entries', 'status', 'SELECT'), 'merchant session can read a waitlist entry status');
select ok(not has_column_privilege('authenticated', 'public.reservation_invitations', 'token_hash', 'SELECT'), 'merchant session cannot read the invitation token digest');
select ok(has_column_privilege('authenticated', 'public.reservation_invitations', 'used_count', 'SELECT'), 'merchant session can read how many invitation places were taken');
select ok(has_function_privilege('service_role', 'public.waitlist_join(uuid,uuid,text,text,boolean)', 'EXECUTE'), 'server can join a reservation waitlist');
select ok(not has_function_privilege('authenticated', 'public.waitlist_join(uuid,uuid,text,text,boolean)', 'EXECUTE'), 'merchant session cannot forge a waitlist position');
select ok(not has_function_privilege('anon', 'public.waitlist_join(uuid,uuid,text,text,boolean)', 'EXECUTE'), 'anon cannot join a waitlist directly');
select ok(not has_function_privilege('authenticated', 'public.claim_waitlist_offer(uuid,uuid,text)', 'EXECUTE'), 'merchant session cannot claim a waitlist offer on behalf of a player');
select ok(not has_function_privilege('anon', 'public.claim_waitlist_offer(uuid,uuid,text)', 'EXECUTE'), 'anon cannot claim a waitlist offer directly');
select ok(not has_function_privilege('authenticated', 'public.waitlist_leave(uuid,text)', 'EXECUTE'), 'merchant session cannot remove a player from a waitlist through the player RPC');
-- Le RETRAIT STAFF existe désormais (revue L5, E-1b), et il passe par sa PROPRE
-- RPC : celle-ci vérifie l'appartenance owner/editor en SQL et journalise
-- l'acteur, là où `waitlist_leave` n'exige qu'une preuve de possession du
-- cookie. Les laisser toutes deux ouvertes à la session marchande aurait rendu
-- l'audit contournable par le chemin joueur.
select ok(has_function_privilege('service_role', 'public.evict_waitlist_entry(uuid,uuid,text)', 'EXECUTE'), 'server can evict a waitlist entry on behalf of the merchant');
select ok(not has_function_privilege('authenticated', 'public.evict_waitlist_entry(uuid,uuid,text)', 'EXECUTE'), 'merchant session cannot evict a waitlist entry past the role guard and the audit trail');
select ok(not has_function_privilege('anon', 'public.evict_waitlist_entry(uuid,uuid,text)', 'EXECUTE'), 'anon cannot evict anyone from a waitlist');
select ok(not has_function_privilege('authenticated', 'public.redeem_invitation(uuid,text,text,uuid,text,boolean)', 'EXECUTE'), 'merchant session cannot redeem an invitation past the capacity lock');
select ok(not has_function_privilege('anon', 'public.redeem_invitation(uuid,text,text,uuid,text,boolean)', 'EXECUTE'), 'anon cannot redeem an invitation directly');
select ok(not has_function_privilege('authenticated', 'public.create_reservation_invitation(uuid,text,text,text,uuid,uuid,integer,timestamptz)', 'EXECUTE'), 'merchant session cannot mint an invitation past the role guard');
select ok(not has_function_privilege('authenticated', 'public.revoke_reservation_invitation(uuid,uuid,text)', 'EXECUTE'), 'merchant session cannot revoke an invitation past the role guard');
select ok(not has_function_privilege('authenticated', 'public.close_reservation_invitation(uuid,uuid,text)', 'EXECUTE'), 'merchant session cannot close an invitation past the role guard');
select ok(not has_function_privilege('authenticated', 'public.expire_waitlist_offers()', 'EXECUTE'), 'merchant session cannot run the waitlist sweep');
select ok(not has_function_privilege('anon', 'public.expire_waitlist_offers()', 'EXECUTE'), 'anon cannot run the waitlist sweep');
-- LE HELPER INTERNE : le SEUL de tout ce dépôt qui ne soit granté à AUCUN rôle
-- applicatif, service_role compris. Il fait avancer une file en supposant que
-- son appelant détient déjà le verrou d'avis du créneau ; l'exposer à
-- l'application permettrait de proposer deux fois la même place. Les privilèges
-- par défaut de Supabase servent `execute` à service_role sur toute fonction
-- neuve de `public` : ce retrait est donc explicite, pas hérité.
select ok(not has_function_privilege('service_role', 'public.reservation_offer_next(uuid,uuid)', 'EXECUTE'), 'the waitlist release helper is not callable by the application at all');
select ok(not has_function_privilege('authenticated', 'public.reservation_offer_next(uuid,uuid)', 'EXECUTE'), 'nor by a merchant session');
select ok(not has_function_privilege('anon', 'public.reservation_offer_next(uuid,uuid)', 'EXECUTE'), 'nor by anon');

-- File sereine (20261005120000, RES-3). Deux tables neuves, mêmes régimes que
-- RES-2 : les FILES sont de la configuration (éditeurs, policy `for all`), les
-- ENTRÉES sont lisibles par tous les MEMBRES — le caissier tient l'écran
-- d'accueil, c'est son poste — et n'acceptent AUCUNE écriture directe, parce
-- que l'ordre de passage décide de qui passe devant.
select ok(not has_table_privilege('anon', 'public.reservation_queues', 'SELECT'), 'anon cannot read reservation queues');
select ok(not has_table_privilege('anon', 'public.reservation_queue_entries', 'SELECT'), 'anon cannot read who is standing in a queue');
select ok(not has_table_privilege('authenticated', 'public.reservation_queue_entries', 'INSERT'), 'merchant cannot insert itself into a queue');
select ok(not has_table_privilege('authenticated', 'public.reservation_queue_entries', 'UPDATE'), 'merchant cannot reorder a queue by direct update');
select ok(not has_table_privilege('authenticated', 'public.reservation_queue_entries', 'DELETE'), 'merchant cannot delete a queue entry');
-- AUCUN delete sur les files non plus : la cascade emporterait les entrées du
-- jour, donc les compteurs de servis et d'absents — la seule mesure que RES-3
-- promet au commerçant. `status = 'closed'` ferme sans effacer.
select ok(not has_table_privilege('authenticated', 'public.reservation_queues', 'DELETE'), 'merchant cannot delete a queue and cascade away the day counters');
-- L'ADRESSE et LE PRÉNOM sont hors du grant de colonnes. L'adresse pour la
-- raison du socle — elle n'existe que pour un envoi serveur. Le prénom pour une
-- raison propre à ce lot : il n'a de sens que sur l'écran d'accueil, ordonné en
-- face du bon rang, et queue_staff_state est ce qui l'y met. Ouvert en
-- PostgREST, il aurait aussi listé les prénoms de tous ceux qui sont passés.
select ok(not has_column_privilege('authenticated', 'public.reservation_queue_entries', 'email', 'SELECT'), 'merchant session cannot read queue email addresses');
select ok(not has_column_privilege('authenticated', 'public.reservation_queue_entries', 'display_name', 'SELECT'), 'merchant session cannot list the first names of everyone who queued');
select ok(has_column_privilege('authenticated', 'public.reservation_queue_entries', 'status', 'SELECT'), 'merchant session can read a queue entry status');
select ok(has_function_privilege('service_role', 'public.queue_join(uuid,uuid,text,text,text,boolean)', 'EXECUTE'), 'server can put someone in a queue');
select ok(not has_function_privilege('authenticated', 'public.queue_join(uuid,uuid,text,text,text,boolean)', 'EXECUTE'), 'merchant session cannot forge a queue position');
select ok(not has_function_privilege('anon', 'public.queue_join(uuid,uuid,text,text,text,boolean)', 'EXECUTE'), 'anon cannot join a queue directly');
select ok(not has_function_privilege('authenticated', 'public.queue_leave(uuid,text)', 'EXECUTE'), 'merchant session cannot drop someone through the player RPC');
select ok(not has_function_privilege('anon', 'public.queue_leave(uuid,text)', 'EXECUTE'), 'anon cannot leave a queue directly');
-- Les trois gestes de comptoir : org-scopés, acteur vérifié owner/editor/cashier
-- EN SQL et audités. Ouverts à la session marchande, la garde de rôle et la
-- trace d'audit seraient contournables par le chemin PostgREST.
select ok(has_function_privilege('service_role', 'public.queue_call_next(uuid,uuid,text)', 'EXECUTE'), 'server can call the next person in line');
select ok(not has_function_privilege('authenticated', 'public.queue_call_next(uuid,uuid,text)', 'EXECUTE'), 'merchant session cannot call someone past the role guard and the audit trail');
select ok(not has_function_privilege('anon', 'public.queue_call_next(uuid,uuid,text)', 'EXECUTE'), 'anon cannot call the next person');
select ok(not has_function_privilege('authenticated', 'public.queue_resolve(uuid,uuid,text,text)', 'EXECUTE'), 'merchant session cannot mark someone served or absent past the audit trail');
select ok(not has_function_privilege('anon', 'public.queue_resolve(uuid,uuid,text,text)', 'EXECUTE'), 'anon cannot mark anyone absent');
select ok(not has_function_privilege('authenticated', 'public.queue_reopen_entry(uuid,uuid,text)', 'EXECUTE'), 'merchant session cannot undo a call past the audit trail');
select ok(not has_function_privilege('anon', 'public.queue_reopen_entry(uuid,uuid,text)', 'EXECUTE'), 'anon cannot undo a call');
select ok(not has_function_privilege('authenticated', 'public.queue_public_state(uuid,text)', 'EXECUTE'), 'merchant cannot enumerate player queue positions through the public RPC');
select ok(not has_function_privilege('anon', 'public.queue_public_state(uuid,text)', 'EXECUTE'), 'anon cannot read the queue public state directly');
select ok(not has_function_privilege('authenticated', 'public.queue_staff_state(uuid,uuid)', 'EXECUTE'), 'merchant session cannot read a queue front desk without going through the server');
select ok(not has_function_privilege('anon', 'public.queue_staff_state(uuid,uuid)', 'EXECUTE'), 'anon cannot read a queue front desk');
-- LE SECOND HELPER INTERNE, après reservation_offer_next : la formule du rang.
-- Elle n'est grantée à AUCUN rôle applicatif, service_role compris — non parce
-- qu'elle serait dangereuse, mais parce qu'une SECONDE façon d'obtenir un rang
-- est une seconde façon de le voir diverger. Un seul chemin : les RPC.
select ok(not has_function_privilege('service_role', 'public.queue_entry_position(public.reservation_queue_entries)', 'EXECUTE'), 'the queue rank formula is not callable by the application at all');
select ok(not has_function_privilege('authenticated', 'public.queue_entry_position(public.reservation_queue_entries)', 'EXECUTE'), 'nor by a merchant session');
select ok(not has_function_privilege('anon', 'public.queue_entry_position(public.reservation_queue_entries)', 'EXECUTE'), 'nor by anon');

-- Mode attente active (20261006120000, RES-4). Une table neuve au régime LE PLUS
-- FERMÉ du module : RLS active et AUCUNE policy — ni joueur ni commerçant n'a
-- d'écran dessus. Le joueur passe par les RPC ; le commerçant n'a rien à y lire,
-- son écran d'accueil parle de rangs, pas de qui a joué en attendant. Lui ouvrir
-- une lecture aurait fait de l'animation une information sur les personnes
-- présentes dans son magasin, ce que RES-4 n'a jamais promis.
select ok(not has_table_privilege('anon', 'public.reservation_wait_sessions', 'SELECT'), 'anon cannot read wait sessions');
select ok(not has_table_privilege('authenticated', 'public.reservation_wait_sessions', 'SELECT'), 'merchant cannot read who played while waiting');
select ok(not has_table_privilege('authenticated', 'public.reservation_wait_sessions', 'INSERT'), 'merchant cannot forge a wait session');
select ok(not has_table_privilege('authenticated', 'public.reservation_wait_sessions', 'UPDATE'), 'merchant cannot reset a spent Pause Chance by direct update');
select ok(not has_table_privilege('authenticated', 'public.reservation_wait_sessions', 'DELETE'), 'merchant cannot delete a wait session');
-- AUCUN privilège d'AUCUNE sorte, `references`/`trigger`/`truncate` compris :
-- c'est le `revoke all` de la migration qui mord, pas l'absence de policy
-- (leçon SEC-4, wagon 7 — les privilèges par défaut de Supabase servent ces
-- trois-là sur toute table neuve de `public`).
select is(
  (select coalesce(string_agg(distinct a.privilege_type, ', '), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace,
     lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = 'public'
      and c.relname = 'reservation_wait_sessions'
      and a.grantee in ('authenticated'::regrole::oid, 'anon'::regrole::oid)),
  '',
  'ni anon ni authenticated ne gardent le moindre privilège sur les sessions d''attente'
);
select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'reservation_wait_sessions'),
  0::bigint,
  'les sessions d''attente ne portent AUCUNE policy — service_role et rien d''autre'
);
-- Les trois RPC d'animation : serveur seul. Ouvertes à la session marchande, un
-- commerçant aurait pu ouvrir une session sur l'entrée de quelqu'un d'autre et
-- brûler sa Pause Chance ; ouvertes à anon, n'importe qui l'aurait pu.
select ok(has_function_privilege('service_role', 'public.wait_session_open(uuid,text,uuid,uuid)', 'EXECUTE'), 'server can open a wait session');
select ok(not has_function_privilege('authenticated', 'public.wait_session_open(uuid,text,uuid,uuid)', 'EXECUTE'), 'merchant session cannot open a wait session on someone else''s place in line');
select ok(not has_function_privilege('anon', 'public.wait_session_open(uuid,text,uuid,uuid)', 'EXECUTE'), 'anon cannot open a wait session directly');
select ok(has_function_privilege('service_role', 'public.wait_session_use_pause(uuid,uuid,text)', 'EXECUTE'), 'server can spend the one Pause Chance of a session');
select ok(not has_function_privilege('authenticated', 'public.wait_session_use_pause(uuid,uuid,text)', 'EXECUTE'), 'merchant session cannot spend a player Pause Chance');
select ok(not has_function_privilege('anon', 'public.wait_session_use_pause(uuid,uuid,text)', 'EXECUTE'), 'anon cannot spend a Pause Chance directly');
select ok(has_function_privilege('service_role', 'public.consume_reserver_wait_spin_grant(uuid,text,text)', 'EXECUTE'), 'server can draw the offered wait spin');
select ok(not has_function_privilege('authenticated', 'public.consume_reserver_wait_spin_grant(uuid,text,text)', 'EXECUTE'), 'merchant session cannot draw an offered wait spin past the economic bounds');
select ok(not has_function_privilege('anon', 'public.consume_reserver_wait_spin_grant(uuid,text,text)', 'EXECUTE'), 'anon cannot draw an offered wait spin directly');
-- La CONFIGURATION d'attente, elle, est de la configuration : les quatre
-- colonnes rejoignent la liste blanche des éditeurs, sur les deux porteurs.
select ok(has_column_privilege('authenticated', 'public.reservation_queues', 'wait_quiz_id', 'UPDATE'), 'merchant can pick the quiz offered while waiting in a queue');
select ok(has_column_privilege('authenticated', 'public.reservation_queues', 'wait_pause_campaign_id', 'UPDATE'), 'merchant can pick the Pause Chance campaign of a queue');
select ok(has_column_privilege('authenticated', 'public.reservation_activities', 'wait_quiz_id', 'UPDATE'), 'merchant can pick the quiz offered while waiting for a booked slot');
select ok(has_column_privilege('authenticated', 'public.reservation_activities', 'wait_pause_campaign_id', 'UPDATE'), 'merchant can pick the Pause Chance campaign of an activity');

select ok(not has_table_privilege('anon', 'public.quizzes', 'SELECT'), 'anon cannot read quizzes');
select ok(not has_table_privilege('anon', 'public.quiz_questions', 'SELECT'), 'anon cannot read quiz answer keys');
select ok(not has_table_privilege('anon', 'public.quiz_players', 'SELECT'), 'anon cannot read quiz players');
select ok(not has_table_privilege('anon', 'public.quiz_answers', 'SELECT'), 'anon cannot read quiz answers');
select ok(not has_table_privilege('anon', 'public.quiz_rewards', 'SELECT'), 'anon cannot read quiz redeem codes');
-- correct_answer : la colonne existe et n'est servie au public que via RPC.
select ok(has_column_privilege('service_role', 'public.quiz_questions', 'correct_answer', 'SELECT'), 'server can read the quiz answer key');
select ok(not has_column_privilege('anon', 'public.quiz_questions', 'correct_answer', 'SELECT'), 'anon cannot read the quiz answer key column');
select ok(not has_table_privilege('authenticated', 'public.quiz_players', 'INSERT'), 'merchant cannot forge quiz players');
select ok(not has_table_privilege('authenticated', 'public.quiz_answers', 'INSERT'), 'merchant cannot forge quiz answers');
select ok(not has_table_privilege('authenticated', 'public.quiz_answers', 'UPDATE'), 'merchant cannot rewrite a quiz answer');
select ok(not has_table_privilege('authenticated', 'public.quiz_rewards', 'INSERT'), 'merchant cannot mint quiz redeem codes');
select ok(not has_table_privilege('authenticated', 'public.quiz_rewards', 'UPDATE'), 'quiz redemption must use the audited RPC');
-- Compteur de stock émis et état du tirage : RPC-only côté marchand.
select ok(not has_column_privilege('authenticated', 'public.quizzes', 'reward_claimed_count', 'UPDATE'), 'the quiz claimed counter is RPC-managed');
select ok(not has_column_privilege('authenticated', 'public.quizzes', 'draw_state', 'UPDATE'), 'the quiz draw state is RPC-managed');
select ok(not has_column_privilege('authenticated', 'public.quizzes', 'drawn_at', 'UPDATE'), 'the quiz draw timestamp is RPC-managed');
select ok(has_column_privilege('authenticated', 'public.quizzes', 'reward_stock', 'UPDATE'), 'editor can still set the quiz reward stock');
select ok(has_column_privilege('authenticated', 'public.quizzes', 'name', 'UPDATE'), 'editor can still rename a quiz');
-- Partage du lien public du quiz (20260920120000), miroir de
-- campaigns.share_enabled. TROIS assertions et non deux comme pour les
-- campagnes, parce que le régime de droits de `quizzes` diffère : ici INSERT
-- ET UPDATE sont en listes blanches de colonnes (sur `campaigns`, seul
-- l'UPDATE l'est), et une colonne neuve n'entre dans aucune des deux toute
-- seule. Sans ces grants, l'interrupteur du dashboard échouerait
-- silencieusement à l'enregistrement.
select ok(has_column_privilege('authenticated', 'public.quizzes', 'share_enabled', 'SELECT'), 'merchant can read the quiz share toggle');
select ok(has_column_privilege('authenticated', 'public.quizzes', 'share_enabled', 'UPDATE'), 'merchant can toggle the quiz share buttons');
select ok(has_column_privilege('authenticated', 'public.quizzes', 'share_enabled', 'INSERT'), 'merchant can set the quiz share toggle at creation');
-- Le défaut est ALLUMÉ, et l'assertion tient à ce que ça reste vrai : les
-- boutons « Défier un ami » et « Partager mon score » s'affichaient sur tous
-- les quiz avant d'être réglables, un `default false` les aurait retirés en
-- silence de la production le jour du déploiement.
--
-- Assertion sur le CATALOGUE et non sur une ligne, à la différence de son
-- miroir campagne : ce fichier ne crée aucun quiz de test, et le défaut doit
-- être vérifié aussi bien sur base VIDE que SEMÉE.
--
-- `col_default_is` et non `results_eq` sur le catalogue : les deux formulations
-- ont été essayées, et results_eq ÉCHOUE ici quelle que soit la source —
-- information_schema comme pg_attrdef — sur « could not determine which
-- collation to use for string comparison », levé par sa propre comparaison de
-- records (results_eq(refcursor,refcursor,text) l. 17) parce que ni
-- `character_data` ni le retour de `pg_get_expr` ne porte de collation
-- déterminable. Le helper natif de pgTAP compare la valeur, pas un record :
-- c'est le seul des deux qui passe. Ne pas le « rétablir » en results_eq.
select col_default_is(
  'public', 'quizzes', 'share_enabled', 'true',
  'a quiz keeps offering its share buttons by default'
);
-- Parcours joueur : service_role only.
select ok(has_function_privilege('service_role', 'public.join_quiz(text,text,text,text,text,boolean)', 'EXECUTE'), 'only server can join a quiz');
select ok(not has_function_privilege('authenticated', 'public.join_quiz(text,text,text,text,text,boolean)', 'EXECUTE'), 'merchant cannot impersonate a joining quiz player');
select ok(not has_function_privilege('anon', 'public.join_quiz(text,text,text,text,text,boolean)', 'EXECUTE'), 'anon cannot call quiz join directly');
select ok(has_function_privilege('service_role', 'public.start_quiz_question(uuid,text,uuid)', 'EXECUTE'), 'only server can start the question clock');
select ok(not has_function_privilege('authenticated', 'public.start_quiz_question(uuid,text,uuid)', 'EXECUTE'), 'merchant cannot start the question clock');
select ok(not has_function_privilege('anon', 'public.start_quiz_question(uuid,text,uuid)', 'EXECUTE'), 'anon cannot start the question clock');
select ok(has_function_privilege('service_role', 'public.submit_quiz_answer(uuid,text,uuid,jsonb)', 'EXECUTE'), 'only server can submit a quiz answer');
select ok(not has_function_privilege('authenticated', 'public.submit_quiz_answer(uuid,text,uuid,jsonb)', 'EXECUTE'), 'merchant cannot answer on behalf of a quiz player');
select ok(not has_function_privilege('anon', 'public.submit_quiz_answer(uuid,text,uuid,jsonb)', 'EXECUTE'), 'anon cannot submit quiz answers directly');
select ok(has_function_privilege('service_role', 'public.finish_quiz(uuid,text)', 'EXECUTE'), 'only server can close a quiz participation');
select ok(not has_function_privilege('authenticated', 'public.finish_quiz(uuid,text)', 'EXECUTE'), 'merchant cannot close a participation on behalf of a player');
select ok(has_function_privilege('service_role', 'public.quiz_public_state(uuid,text)', 'EXECUTE'), 'server can read the quiz public state');
select ok(not has_function_privilege('authenticated', 'public.quiz_public_state(uuid,text)', 'EXECUTE'), 'merchant reads quiz state through the server, not anon');
select ok(not has_function_privilege('anon', 'public.quiz_public_state(uuid,text)', 'EXECUTE'), 'anon cannot read the quiz public state directly');
select ok(has_function_privilege('service_role', 'public.consume_quiz_spin_grant(uuid,text,text)', 'EXECUTE'), 'only server can consume a quiz spin grant');
select ok(not has_function_privilege('anon', 'public.consume_quiz_spin_grant(uuid,text,text)', 'EXECUTE'), 'anon cannot consume a quiz spin grant');
-- Évaluation de justesse et émission de lot : jamais exposées au marchand.
select ok(not has_function_privilege('authenticated', 'public.quiz_answer_is_correct(text,jsonb,jsonb,numeric)', 'EXECUTE'), 'merchant cannot probe the quiz answer key through the grader');
select ok(not has_function_privilege('anon', 'public.quiz_answer_is_correct(text,jsonb,jsonb,numeric)', 'EXECUTE'), 'anon cannot probe the quiz answer key through the grader');
select ok(not has_function_privilege('authenticated', 'public.quiz_emit_reward(uuid,uuid,uuid,text,integer)', 'EXECUTE'), 'merchant cannot mint a quiz reward directly');
select ok(not has_function_privilege('service_role', 'public.quiz_emit_reward(uuid,uuid,uuid,text,integer)', 'EXECUTE'), 'the quiz emitter is owner-only (called from the guarded RPCs)');
-- Classement (sans email) : équipe + serveur ; tirage : éditeur + serveur.
select ok(has_function_privilege('authenticated', 'public.quiz_leaderboard(uuid,integer,integer)', 'EXECUTE'), 'team can read the quiz leaderboard (guarded in-function)');
select ok(not has_function_privilege('anon', 'public.quiz_leaderboard(uuid,integer,integer)', 'EXECUTE'), 'anon cannot read the quiz leaderboard');
select ok(has_function_privilege('authenticated', 'public.draw_quiz_winners(uuid,uuid)', 'EXECUTE'), 'editor can run the quiz draw (editor-guarded in-function)');
select ok(not has_function_privilege('anon', 'public.draw_quiz_winners(uuid,uuid)', 'EXECUTE'), 'anon cannot run the quiz draw');
select ok(has_function_privilege('service_role', 'public.redeem_quiz_reward(uuid,text,text)', 'EXECUTE'), 'server can redeem a quiz code');
select ok(not has_function_privilege('authenticated', 'public.redeem_quiz_reward(uuid,text,text)', 'EXECUTE'), 'cashier session cannot bypass the quiz redeem guards');
select ok(has_function_privilege('service_role', 'public.purge_expired_quiz_players()', 'EXECUTE'), 'server can purge quiz PII');
select ok(not has_function_privilege('authenticated', 'public.purge_expired_quiz_players()', 'EXECUTE'), 'merchant cannot trigger the quiz purge');

-- ── Méta-progression (20260805200000) ──
-- Les 14 tables progression_* sont RPC-only : aucun rôle n'y lit ou n'y
-- écrit en direct, pas même le service role en écriture. Le module ne
-- porte aucun code de caisse : c'est un état d'engagement, pas une
-- récompense commerciale.
select results_eq($$
  select
    count(*) filter (where has_table_privilege('anon', 'public.' || t.name, 'SELECT')),
    count(*) filter (where has_table_privilege('authenticated', 'public.' || t.name, 'SELECT')),
    count(*) filter (where has_table_privilege('authenticated', 'public.' || t.name, 'INSERT')
                       or has_table_privilege('authenticated', 'public.' || t.name, 'UPDATE')
                       or has_table_privilege('authenticated', 'public.' || t.name, 'DELETE')),
    count(*) filter (where has_table_privilege('service_role', 'public.' || t.name, 'SELECT')),
    count(*) filter (where has_table_privilege('service_role', 'public.' || t.name, 'INSERT')
                       or has_table_privilege('service_role', 'public.' || t.name, 'UPDATE')
                       or has_table_privilege('service_role', 'public.' || t.name, 'DELETE'))
    from unnest(array[
      'progression_seasons', 'progression_badges', 'progression_collections',
      'progression_collection_items', 'progression_missions',
      'progression_mission_versions', 'progression_player_seasons',
      'progression_mission_progress', 'progression_mission_contributions',
      'progression_player_badges', 'progression_player_items',
      'progression_chests', 'progression_chest_items',
      'progression_chest_openings', 'progression_engine_failures'
    ]) as t(name)$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 15::bigint, 0::bigint)$$,
  'the 15 meta-progression tables are readable only by the server, writable only by RPC');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename like 'progression\_%' and ('anon' = any(roles::text[]) or 'public' = any(roles::text[]))), 0::bigint, 'no meta-progression policy is open to anon or public');
select ok(has_function_privilege('authenticated', 'public.create_progression_season(uuid,text,timestamptz,timestamptz)', 'EXECUTE'), 'editor can create a progression season (editor-guarded in-function)');
select ok(not has_function_privilege('anon', 'public.create_progression_season(uuid,text,timestamptz,timestamptz)', 'EXECUTE'), 'anon cannot create a progression season');
select ok(has_function_privilege('authenticated', 'public.create_progression_badge(uuid,uuid,text,text,text)', 'EXECUTE'), 'editor can create a progression badge (editor-guarded in-function)');
select ok(not has_function_privilege('anon', 'public.create_progression_badge(uuid,uuid,text,text,text)', 'EXECUTE'), 'anon cannot create a progression badge');
select ok(has_function_privilege('authenticated', 'public.create_progression_collection(uuid,uuid,text,text)', 'EXECUTE'), 'editor can create a progression collection (editor-guarded in-function)');
select ok(not has_function_privilege('anon', 'public.create_progression_collection(uuid,uuid,text,text)', 'EXECUTE'), 'anon cannot create a progression collection');
select ok(has_function_privilege('authenticated', 'public.create_progression_collection_item(uuid,uuid,text,text,text)', 'EXECUTE'), 'editor can add a collection item (editor-guarded in-function)');
select ok(not has_function_privilege('anon', 'public.create_progression_collection_item(uuid,uuid,text,text,text)', 'EXECUTE'), 'anon cannot add a collection item');
select ok(has_function_privilege('authenticated', 'public.create_progression_mission(uuid,uuid,text,text,text,integer,text[],integer,text,boolean,uuid,uuid)', 'EXECUTE'), 'editor can create a mission and its versioned rule');
select ok(not has_function_privilege('anon', 'public.create_progression_mission(uuid,uuid,text,text,text,integer,text[],integer,text,boolean,uuid,uuid)', 'EXECUTE'), 'anon cannot create a progression mission');
select ok(has_function_privilege('authenticated', 'public.create_progression_chest(uuid,uuid,text,text,integer,uuid[])', 'EXECUTE'), 'editor can create a progression chest (editor-guarded in-function)');
select ok(not has_function_privilege('anon', 'public.create_progression_chest(uuid,uuid,text,text,integer,uuid[])', 'EXECUTE'), 'anon cannot create a progression chest');
select ok(has_function_privilege('authenticated', 'public.activate_progression_season(uuid,uuid)', 'EXECUTE'), 'editor can activate a season (editor-guarded in-function)');
select ok(not has_function_privilege('anon', 'public.activate_progression_season(uuid,uuid)', 'EXECUTE'), 'anon cannot activate a progression season');
select ok(has_function_privilege('authenticated', 'public.org_progression_snapshot(uuid)', 'EXECUTE'), 'team can read its progression aggregate (guarded in-function)');
select ok(not has_function_privilege('anon', 'public.org_progression_snapshot(uuid)', 'EXECUTE'), 'anon cannot read the progression aggregate');
select ok(has_function_privilege('service_role', 'public.player_progression_snapshot(text,uuid)', 'EXECUTE'), 'server can read a player progression snapshot');
select ok(not has_function_privilege('authenticated', 'public.player_progression_snapshot(text,uuid)', 'EXECUTE'), 'merchant cannot read a player progression snapshot');
select ok(not has_function_privilege('anon', 'public.player_progression_snapshot(text,uuid)', 'EXECUTE'), 'anon cannot read a player progression snapshot');
select ok(has_function_privilege('service_role', 'public.open_progression_chest(text,uuid,uuid,uuid)', 'EXECUTE'), 'only server can open a progression chest');
select ok(not has_function_privilege('authenticated', 'public.open_progression_chest(text,uuid,uuid,uuid)', 'EXECUTE'), 'merchant cannot open a chest on behalf of a player');
select ok(not has_function_privilege('anon', 'public.open_progression_chest(text,uuid,uuid,uuid)', 'EXECUTE'), 'anon cannot open a progression chest');
select ok(has_function_privilege('service_role', 'public.purge_expired_meta_progression()', 'EXECUTE'), 'server can purge expired meta-progression state');
select ok(not has_function_privilege('authenticated', 'public.purge_expired_meta_progression()', 'EXECUTE'), 'merchant cannot trigger the meta-progression purge');
select ok(not has_function_privilege('anon', 'public.purge_expired_meta_progression()', 'EXECUTE'), 'anon cannot trigger the meta-progression purge');
-- Moteur et validateur : jamais appelables, même par le service role.
select ok(not has_function_privilege('service_role', 'public.apply_meta_progression_event()', 'EXECUTE'), 'the meta-progression engine is trigger-only, even for the server');
select ok(not has_function_privilege('service_role', 'public.is_valid_progression_rule(jsonb)', 'EXECUTE'), 'the progression rule validator is owner-only');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.experience_events'::regclass and tgname = 'experience_events_meta_progression' and not tgisinternal), 'meta-progression is fed only by the server analytics journal');
-- ── Cycle de vie et édition de la méta-progression (20260805210000) ──
-- Les 13 RPC d'édition sont éditeur + serveur, jamais anon ; l'archive
-- joueur est serveur seul, comme les deux autres lectures joueur.
select results_eq($$
  select
    count(*) filter (where has_function_privilege('authenticated', f.sig, 'EXECUTE')),
    count(*) filter (where has_function_privilege('service_role', f.sig, 'EXECUTE')),
    count(*) filter (where has_function_privilege('anon', f.sig, 'EXECUTE'))
    from unnest(array[
      'public.end_progression_season(uuid,uuid)',
      'public.archive_progression_season(uuid,uuid)',
      'public.delete_progression_season(uuid,uuid)',
      'public.update_progression_badge(uuid,uuid,text,text,text)',
      'public.delete_progression_badge(uuid,uuid)',
      'public.update_progression_collection(uuid,uuid,text,text)',
      'public.delete_progression_collection(uuid,uuid)',
      'public.update_progression_collection_item(uuid,uuid,text,text,text,integer)',
      'public.delete_progression_collection_item(uuid,uuid)',
      'public.update_progression_mission(uuid,uuid,text,text,text,integer,text[],integer,text,boolean,uuid,uuid,boolean)',
      'public.delete_progression_mission(uuid,uuid)',
      'public.update_progression_chest(uuid,uuid,text,text,integer,uuid[],boolean)',
      'public.delete_progression_chest(uuid,uuid)',
      'public.set_progression_mission_enabled(uuid,uuid,boolean)',
      'public.set_progression_chest_enabled(uuid,uuid,boolean)'
    ]) as f(sig)$$,
  $$values (15::bigint, 15::bigint, 0::bigint)$$,
  'the 15 progression editing RPCs are merchant + server, never anon');
select ok(has_function_privilege('service_role', 'public.player_progression_archive(text,uuid)', 'EXECUTE'), 'server can read a player progression archive');
select ok(not has_function_privilege('authenticated', 'public.player_progression_archive(text,uuid)', 'EXECUTE'), 'merchant cannot read a player progression archive');
select ok(not has_function_privilege('anon', 'public.player_progression_archive(text,uuid)', 'EXECUTE'), 'anon cannot read a player progression archive');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.progression_missions'::regclass and conname = 'progression_missions_badge_fk' and confdeltype = 'a'), 'mission badge reference is NO ACTION so tenant deletion cascades cleanly');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.progression_missions'::regclass and conname = 'progression_missions_collection_item_fk' and confdeltype = 'a'), 'mission collection item reference is NO ACTION too');
select ok(exists (select 1 from pg_attribute where attrelid = 'public.progression_chests'::regclass and attname = 'loot_seed' and attnotnull), 'every chest carries a server-side loot seed');
select ok(position('loot_seed' in pg_get_functiondef('public.open_progression_chest(text,uuid,uuid,uuid)'::regprocedure)) > 0, 'chest loot draw is salted with the server seed, not derivable from request_id');
select is((select count(*) from pg_constraint where conrelid = 'public.progression_engine_failures'::regclass and contype in ('f','c')), 0::bigint, 'the engine failure log carries no constraint that could block a trace');
-- Suites de la revue de sécurité (20260805220000).
-- M2 : la branche `seasons` de l'agrégat est réservée aux éditeurs — un
-- caissier lisait la saison NON LANCÉE, missions et coffres désactivés
-- compris, ce qu'un visiteur n'a jamais.
select ok(position('is_org_editor' in pg_get_functiondef('public.org_progression_snapshot(uuid)'::regprocedure)) > 0, 'progression aggregate gates its configuration branch on is_org_editor');
select ok(position('can_configure' in pg_get_functiondef('public.org_progression_snapshot(uuid)'::regprocedure)) > 0, 'progression aggregate tells the caller whether configuration is withheld');
-- F1 : l'idempotence d'un coffre porte sur le coffre, plus seulement sur
-- le request_id — sinon un request_id rejoué rendait le butin d'un autre.
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'progression_chest_openings' and indexname = 'progression_chest_openings_request_idx' and indexdef ilike '%unique%' and indexdef ilike '%player_season_id, chest_id, request_id%'), 'chest idempotency is keyed by (player season, chest, request id)');
-- F5 : la contention n'est plus confondue avec une erreur métier.
select ok(position('serialization_failure' in pg_get_functiondef('public.apply_meta_progression_event()'::regprocedure)) > 0, 'meta-progression engine retries contention before losing a contribution');
-- F3 : le journal moteur n'écrit plus d'identité joueur.
select ok(position('player_id' in pg_get_functiondef('public.purge_expired_meta_progression()'::regprocedure)) = 0, 'the meta-progression purge never needs a player identity');
-- M3 : interrupteur d'arrêt sur saison lancée, journalisé.
select ok(position('audit_logs' in pg_get_functiondef('public.set_progression_mission_enabled(uuid,uuid,boolean)'::regprocedure)) > 0, 'cutting a live mission is audited');
select ok(position('audit_logs' in pg_get_functiondef('public.set_progression_chest_enabled(uuid,uuid,boolean)'::regprocedure)) > 0, 'cutting a live chest is audited');
-- INFO : la charge utile joueur ne livre plus le mode d'emploi du meulage.
select ok(position('experience_kinds' in pg_get_functiondef('public.player_progression_snapshot(text,uuid)'::regprocedure)) = 0, 'player payload no longer ships the mission grinding recipe');

select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
  lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  where n.nspname = 'public' and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
), 'PUBLIC has no EXECUTE on public functions');
select ok(not exists (
  select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace,
  lateral aclexplode(d.defaclacl) acl
  where n.nspname = 'public' and d.defaclobjtype = 'f'
    and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
), 'future public functions do not grant PUBLIC execute');

-- ── RLS : le CATALOGUE remplace la liste tenue à la main ─────
--
-- Ce qui était ici : soixante-dix `ok(relrowsecurity)`, un par table, empilés au
-- fil des chantiers — et un commentaire qui AVOUAIT le défaut sans le corriger
-- (« cette liste est tenue À LA MAIN : une table absente d'ici n'est pas couverte
-- par défaut, elle est INVISIBLE »). Le catalogue en comptait 110. Quarante
-- tables n'étaient donc regardées par personne, dont `campaigns` et
-- `organization_members` — les deux qui décident de tout le reste.
--
-- La règle remplace la liste : aucune table de `public` ne tourne sans RLS. Une
-- table neuve est couverte le jour de sa création, sans que personne ait à
-- penser à revenir ici, et l'échec NOMME les fautives d'un coup — là où une
-- liste de 70 assertions les révélait une par une, à condition d'y figurer.
--
-- ── EXCEPTIONS ──
-- Aucune. Il n'existe aujourd'hui AUCUNE table de `public` légitimement sans
-- RLS : l'attendu est la chaîne vide, et il a été mesuré, pas supposé. Si une
-- exception devait naître un jour, elle s'écrit ICI, nommée et justifiée —
-- jamais absorbée en silence par un attendu qu'on aurait élargi.
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity),
  '',
  'aucune table de public ne tourne sans row level security'
);
-- CONTRÔLE DE PORTÉE — sans lui, l'assertion ci-dessus serait vraie sur un
-- ensemble VIDE : une garde qui ne garde rien. Même raison, et même forme, que
-- l'assertion 3 de `search_path_invariant.test.sql`.
select cmp_ok(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'),
  '>=', 110,
  'le contrôle porte bien sur les 110 tables du schéma, pas sur un ensemble vide'
);

-- ── SEC-4 : sept tables qui ne tenaient que par l'absence de policy ──
--
-- RLS active et zéro policy suffit à ne rien laisser sortir — jusqu'à la
-- première policy écrite un peu large, qui les ouvrirait sans qu'aucun `grant`
-- ait eu à être ajouté. 20260930120000 leur retire les privilèges : la porte se
-- ferme alors sans dépendre de ce qu'écrira la prochaine migration.
--
-- HONNÊTETÉ SUR CE QUE MESURENT LES SEPT LIGNES QUI SUIVENT : `authenticated`
-- n'avait déjà ni SELECT ni aucun autre droit DML sur ces tables — elles sont
-- vertes avant comme après la migration. Ce sont des gardes de NON-RÉGRESSION,
-- pas la preuve du changement. Ce que la migration retire vraiment, ce sont
-- REFERENCES/TRIGGER/TRUNCATE hérités des privilèges par défaut de Supabase, et
-- c'est l'assertion catalogue qui suit les sept qui le mesure — TRUNCATE sur le
-- journal Stripe ou sur les sessions d'administration n'est pas un privilège
-- théorique.
select ok(not has_table_privilege('authenticated', 'public.stripe_events', 'SELECT'), 'merchant cannot read the Stripe event journal');
select ok(not has_table_privilege('authenticated', 'public.rate_limits', 'SELECT'), 'merchant cannot read the rate limit counters');
select ok(not has_table_privilege('authenticated', 'public.admin_users', 'SELECT'), 'merchant cannot enumerate back-office administrators');
select ok(not has_table_privilege('authenticated', 'public.admin_sessions', 'SELECT'), 'merchant cannot read back-office sessions');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_logs', 'SELECT'), 'merchant cannot read the back-office audit trail');
select ok(not has_table_privilege('authenticated', 'public.admin_notes', 'SELECT'), 'merchant cannot read internal admin notes');
select ok(not has_table_privilege('authenticated', 'public.webhook_deliveries', 'SELECT'), 'merchant cannot read webhook payloads');
-- AUCUN privilège, d'aucune sorte, sur les sept — l'assertion qui mord.
select is(
  (select coalesce(string_agg(distinct c.relname || '.' || a.privilege_type, ', '), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace,
     lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = 'public'
      and c.relname in ('stripe_events', 'rate_limits', 'admin_users',
                        'admin_sessions', 'admin_audit_logs', 'admin_notes',
                        'webhook_deliveries')
      and a.grantee = 'authenticated'::regrole::oid),
  '',
  'authenticated ne garde aucun privilège sur les sept tables hors-locataire'
);
-- Le FILET, enfin : plus aucun privilège par défaut ne tombe dans
-- `authenticated` pour un objet créé par `postgres` — le rôle sous lequel
-- tournent les migrations. C'est ce qui rend la prochaine table couverte le jour
-- de sa création, comme 00021 l'avait fait pour `anon` et pour lui seul. Portée
-- exacte : les privilèges par défaut posés par `supabase_admin` ne sont pas
-- atteignables ainsi et subsistent ; la garde vaut pour tout ce que ce dépôt
-- écrit, elle n'est pas universelle.
select is(
  -- `defaclobjtype` est un `"char"` (un octet, pas du texte) : sans le cast,
  -- `"char" || unknown` est ambigu et psql refuse la requête entière.
  (select coalesce(string_agg(distinct d.defaclobjtype::text || ':' || a.privilege_type, ', '), '')
     from pg_default_acl d
     join pg_namespace n on n.oid = d.defaclnamespace,
     lateral aclexplode(d.defaclacl) a
    where n.nspname = 'public'
      and d.defaclrole = 'postgres'::regrole::oid
      and d.defaclobjtype in ('r', 'S')
      and a.grantee = 'authenticated'::regrole::oid),
  '',
  'aucun privilège par défaut ne tombe dans authenticated (tables et séquences créées par postgres)'
);
select is((select count(*) from pg_policies where schemaname='public' and tablename='organizations' and cmd='UPDATE'), 0::bigint, 'no direct organization update policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='participations' and policyname='participations: owner select'), 1::bigint, 'participations are owner-only');
select is((select count(*) from pg_policies where schemaname='public' and tablename='newsletter_subscribers' and policyname='newsletter: owner select'), 1::bigint, 'newsletter is owner-only');
select is((select count(*) from pg_policies where schemaname='public' and tablename='campaigns' and policyname='campaigns: editors'), 1::bigint, 'campaign mutations are editor-only');
select ok(not exists (
  select 1 from pg_policies
  where schemaname = 'public'
    and 'public' = any(roles)
    and (
      coalesce(qual, '') ~ 'is_org_(member|owner|editor)'
      or coalesce(with_check, '') ~ 'is_org_(member|owner|editor)'
    )
), 'member policies are never evaluated for anon');

select ok(exists (select 1 from pg_constraint where conrelid='public.wheels'::regclass and conname='wheels_campaign_org_fk' and contype='f'), 'wheel campaign tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.prizes'::regclass and conname='prizes_wheel_org_fk' and contype='f'), 'prize wheel tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.qr_codes'::regclass and conname='qr_campaign_org_fk' and contype='f'), 'QR campaign tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.spins'::regclass and conname='spins_wheel_campaign_org_fk' and contype='f'), 'spin wheel tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.spins'::regclass and conname='spins_prize_wheel_org_fk' and contype='f'), 'spin prize tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.participations'::regclass and conname='participations_wheel_campaign_org_fk' and contype='f'), 'participation wheel tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.participations'::regclass and conname='participations_prize_wheel_org_fk' and contype='f'), 'participation prize tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.contest_matches'::regclass and conname='contest_matches_contest_org_fk' and contype='f'), 'contest match tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.contest_predictions'::regclass and conname='contest_predictions_match_contest_org_fk' and contype='f'), 'prediction match tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.contest_predictions'::regclass and conname='contest_predictions_player_contest_org_fk' and contype='f'), 'prediction player tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.hunt_steps'::regclass and conname='hunt_steps_hunt_id_organization_id_fkey' and contype='f'), 'hunt step tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.hunt_players'::regclass and conname='hunt_players_hunt_id_organization_id_fkey' and contype='f'), 'hunt player tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.hunt_scans'::regclass and conname='hunt_scans_player_id_hunt_id_organization_id_fkey' and contype='f'), 'hunt scan player tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.hunt_scans'::regclass and conname='hunt_scans_step_id_hunt_id_organization_id_fkey' and contype='f'), 'hunt scan step tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.hunt_completions'::regclass and conname='hunt_completions_player_id_hunt_id_organization_id_fkey' and contype='f'), 'hunt completion player tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.loyalty_milestones'::regclass and conname='loyalty_milestones_program_id_organization_id_fkey' and contype='f'), 'loyalty milestone tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.loyalty_milestones'::regclass and conname='loyalty_milestones_target_wheel_id_organization_id_fkey' and contype='f'), 'loyalty milestone wheel same-org FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.loyalty_members'::regclass and conname='loyalty_members_program_id_organization_id_fkey' and contype='f'), 'loyalty member tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.loyalty_rewards'::regclass and conname='loyalty_rewards_member_id_program_id_organization_id_fkey' and contype='f'), 'loyalty reward member tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.loyalty_rewards'::regclass and conname='loyalty_rewards_milestone_id_organization_id_fkey' and contype='f'), 'loyalty reward milestone tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.jackpot_players'::regclass and conname='jackpot_players_campaign_id_organization_id_fkey' and contype='f'), 'jackpot player tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.jackpot_participants'::regclass and conname='jackpot_participants_campaign_id_organization_id_fkey' and contype='f'), 'jackpot participant tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.jackpot_wins'::regclass and conname='jackpot_wins_campaign_id_organization_id_fkey' and contype='f'), 'jackpot win tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.jackpot_wins'::regclass and contype='u' and pg_get_constraintdef(oid) ilike '%(campaign_id, cycle)%'), 'jackpot one-winner-per-cycle uniqueness exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.event_questions'::regclass and conname='event_questions_game_id_organization_id_fkey' and contype='f'), 'event question tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.event_players'::regclass and conname='event_players_session_id_organization_id_fkey' and contype='f'), 'event player tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.event_answers'::regclass and contype='u' and pg_get_constraintdef(oid) ilike '%(session_id, question_id, player_id)%'), 'event one-answer-per-question uniqueness exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.event_wins'::regclass and contype='u' and pg_get_constraintdef(oid) ilike '%(session_id, rank)%'), 'event one-winner-per-rank uniqueness exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.calendar_days'::regclass and conname='calendar_days_calendar_id_organization_id_fkey' and contype='f'), 'calendar day tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.calendar_days'::regclass and conname='calendar_days_target_wheel_id_organization_id_fkey' and contype='f'), 'calendar day wheel same-org FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.calendar_players'::regclass and conname='calendar_players_calendar_id_organization_id_fkey' and contype='f'), 'calendar player tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.calendar_openings'::regclass and conname='calendar_openings_player_id_calendar_id_organization_id_fkey' and contype='f'), 'calendar opening player tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.calendar_openings'::regclass and conname='calendar_openings_day_id_organization_id_fkey' and contype='f'), 'calendar opening day tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.calendar_openings'::regclass and contype='u' and pg_get_constraintdef(oid) ilike '%(player_id, day_id)%'), 'calendar one-opening-per-day uniqueness exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.calendar_rewards'::regclass and contype='u' and pg_get_constraintdef(oid) ilike '%(player_id, calendar_id)%'), 'calendar one-completion-reward-per-player uniqueness exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.quizzes'::regclass and conname='quizzes_target_wheel_id_organization_id_fkey' and contype='f'), 'quiz wheel same-org FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.quiz_questions'::regclass and conname='quiz_questions_quiz_id_organization_id_fkey' and contype='f'), 'quiz question tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.quiz_players'::regclass and conname='quiz_players_quiz_id_organization_id_fkey' and contype='f'), 'quiz player tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.quiz_answers'::regclass and conname='quiz_answers_player_id_quiz_id_organization_id_fkey' and contype='f'), 'quiz answer player tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.quiz_answers'::regclass and conname='quiz_answers_question_id_organization_id_fkey' and contype='f'), 'quiz answer question tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.quiz_answers'::regclass and contype='u' and pg_get_constraintdef(oid) ilike '%(player_id, question_id)%'), 'quiz one-answer-per-question uniqueness exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.quiz_rewards'::regclass and contype='u' and pg_get_constraintdef(oid) ilike '%(quiz_id, player_id)%'), 'quiz one-reward-per-player uniqueness exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.quiz_rewards'::regclass and contype='u' and pg_get_constraintdef(oid) ilike '%(quiz_id, rank)%'), 'quiz one-winner-per-rank uniqueness exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.quizzes'::regclass and conname='quizzes_reward_bounds_check' and contype='c'), 'quiz reward emission is bounded by its finite stock');
select ok(exists (select 1 from pg_constraint where conrelid='public.reservation_slots'::regclass and conname='reservation_slots_activity_id_organization_id_fkey' and contype='f'), 'reservation slot tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.reservations'::regclass and conname='reservations_slot_id_organization_id_fkey' and contype='f'), 'reservation slot-of-reservation tenant FK exists');
-- L'unicité de la place n'est pas une contrainte mais un index PARTIEL : la
-- réservation annulée doit pouvoir être remplacée par une nouvelle du même
-- joueur, ce qu'une contrainte pleine interdirait. Son prédicat porte LES DEUX
-- ÉTATS VIVANTS, et l'assertion le vérifie état par état : sur `confirmed`
-- seul, un joueur ARRIVÉ sortait de l'index et pouvait reprendre une seconde
-- place sur le créneau qu'il venait d'honorer — le même trou que le comptage
-- de capacité de `reserve_slot`, dont ce prédicat doit rester le miroir exact.
select ok(exists (select 1 from pg_indexes where schemaname='public' and indexname='reservations_slot_player_active_idx' and indexdef ilike '%where%' and indexdef ilike '%confirmed%' and indexdef ilike '%checked_in%' and indexdef not ilike '%cancelled%'), 'one live reservation per player and slot is enforced by a partial unique index covering BOTH live states');
select ok(exists (select 1 from pg_constraint where conrelid='public.reservations'::regclass and conname='reservations_org_code_unique' and contype='u'), 'the check-in code is unique within its organization only');
select ok(exists (select 1 from pg_trigger where tgrelid='public.quiz_answers'::regclass and tgname='quiz_answers_freeze' and not tgisinternal), 'a submitted quiz answer is frozen by trigger');
select ok(exists (
  select 1 from storage.buckets
  where id = 'poster-images' and public
    and file_size_limit = 2097152
    and allowed_mime_types = array['image/webp']
), 'poster images use the bounded public WebP bucket');
select ok(position('quota propriétaire atteint' in pg_get_functiondef('public.create_organization(text,text)'::regprocedure)) > 0, 'owner quota enforced in database');
select ok(position('editor' in pg_get_constraintdef((select oid from pg_constraint where conname='team_invitations_role_check'))) > 0, 'editor invitations allowed');
select ok(position('cashier' in pg_get_constraintdef((select oid from pg_constraint where conname='team_invitations_role_check'))) > 0, 'cashier invitations allowed');
select ok(position('owner' in pg_get_constraintdef((select oid from pg_constraint where conname='team_invitations_role_check'))) = 0, 'invitations cannot grant owner');
select has_index('public', 'organization_members', 'organization_members_one_owned_org_idx', 'one owned organization per user');
-- 20260815120000 : le SEUL chemin d'écriture de `organization_members.role`.
-- `authenticated` n'a toujours que select/delete sur la table (00018) — la
-- colonne `role` ne doit jamais devenir écrivable par PostgREST, sinon la
-- borne « jamais le dernier propriétaire » se contourne par un simple PATCH.
select ok(has_function_privilege('authenticated', 'public.set_team_member_role(uuid,uuid,text)', 'EXECUTE'), 'owner session can change a member role through the RPC');
select ok(not has_function_privilege('anon', 'public.set_team_member_role(uuid,uuid,text)', 'EXECUTE'), 'anon cannot change a member role');
-- `revoke … from public, anon` ne retire PAS service_role : les privilèges par
-- défaut du schéma public lui accordent EXECUTE sur toute fonction créée
-- (mesuré dans pg_default_acl). Le retrait est écrit dans 20260815120000.
select ok(not has_function_privilege('service_role', 'public.set_team_member_role(uuid,uuid,text)', 'EXECUTE'), 'no dead service_role grant on the role-change RPC (auth.uid() is null there)');
select ok(not has_function_privilege('anon', 'public.resync_calendar_progress(uuid)', 'EXECUTE'), 'anon cannot resync a calendar');
select ok(has_function_privilege('authenticated', 'public.resync_calendar_progress(uuid)', 'EXECUTE'), 'merchant session can resync calendar progress after a grid reduction');
select ok(not has_function_privilege('service_role', 'public.resync_calendar_progress(uuid)', 'EXECUTE'), 'no dead service_role grant on the calendar resync');
select ok(not has_table_privilege('authenticated', 'public.organization_members', 'UPDATE'), 'member roles stay RPC-only — no direct UPDATE path to organization_members');
select ok(position('last owner' in pg_get_functiondef('public.set_team_member_role(uuid,uuid,text)'::regprocedure)) > 0, 'last owner guard lives in the database, not in the caller');
select ok(position('is_org_owner' in pg_get_functiondef('public.set_team_member_role(uuid,uuid,text)'::regprocedure)) > 0, 'role changes are owner-only, checked inside the function');
select has_index('public', 'spins', 'spins_one_per_window_idx', 'one spin per play window enforced');
select ok(exists (
  select 1 from pg_trigger
  where tgrelid = 'public.admin_users'::regclass
    and tgname = 'admin_users_protect_last_super_admin_delete'
    and not tgisinternal
), 'last active super admin is protected from deletion');

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
 ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@test.local', '', now(), now()),
 ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'editor@test.local', '', now(), now()),
 ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'cashier@test.local', '', now(), now());
insert into public.admin_users (user_id, email, role, is_active)
values ('10000000-0000-4000-8000-000000000001', 'owner@test.local', 'super_admin', true);
select throws_ok(
  $$delete from public.admin_users where user_id = '10000000-0000-4000-8000-000000000001'$$,
  'P0001', 'last active super admin',
  'last active super admin cannot be deleted directly'
);
insert into public.organizations (id, name, slug) values
 ('20000000-0000-4000-8000-000000000001', 'Test ACL', 'test-acl');
insert into public.organization_members (organization_id, user_id, role) values
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'editor'),
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'cashier');
insert into public.campaigns (id, organization_id, name) values
 ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Test');
insert into public.wheels (id, organization_id, campaign_id, name) values
 ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Test');
insert into public.prizes (id, organization_id, wheel_id, label) values
 ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Café');
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id, first_name, email,
  accepted_terms, redeem_code, player_key
) values (
 '60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001', 'Alice', 'alice@test.local', true, 'GAIN-ABCDEFGH', repeat('a', 64)
);
insert into public.newsletter_subscribers (organization_id, email)
values ('20000000-0000-4000-8000-000000000001', 'alice@test.local');
insert into public.contests (id, organization_id, slug, name, competition_key)
values (
  '70000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'TESTPRONO', 'Test pronostics', 'custom'
);
insert into public.contest_players (
  id, contest_id, organization_id, token_hash, first_name, email, accepted_terms
) values (
  '80000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  repeat('b', 64), 'Bob', 'bob@test.local', true
);
insert into public.contest_matches (
  id, contest_id, organization_id, home_name, away_name, kickoff_at, external_ref, position
) values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'A', 'B', now() - interval '2 hours', '', 0),
  ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'C', 'D', now() - interval '2 hours', 'provider-1', 1),
  ('71000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'E', 'F', now() + interval '1 day', '', 2);
insert into public.contest_predictions (
  contest_id, organization_id, match_id, player_id, home_score, away_score
) values (
  '70000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001', 2, 1
);
insert into public.hunts (id, organization_id, name, status, reward_label)
values (
  '90000000-0000-4000-8000-000000000010',
  '20000000-0000-4000-8000-000000000001',
  'Chasse ACL', 'active', 'Café offert'
);
insert into public.loyalty_programs (id, organization_id, name, status)
values (
  '90000000-0000-4000-8000-000000000020',
  '20000000-0000-4000-8000-000000000001',
  'Fidélité ACL', 'active'
);

-- Régression 42702 : le tirage atomique doit s'exécuter réellement.
-- (« column reference is_losing is ambiguous » — variable du returns
-- table vs colonne de prizes — cassait 100 % des spins en production.)
select lives_ok(
  $$select * from public.perform_atomic_spin(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    repeat('c', 64), null, 'direct')$$,
  'atomic spin executes end-to-end (no plpgsql ambiguity)'
);
select results_eq(
  $$select count(*)::int from public.perform_atomic_spin(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    repeat('d', 64), null, 'direct')$$,
  array[1],
  'atomic spin always returns exactly one row (result or denial)'
);

-- ── Invitation avant-jeu : ce que la base refuse d'enregistrer ──
-- Les CHECKs sont nommés à la main (20260918120000) : ils n'admettent qu'une
-- chaîne vide ou un lien `https://` d'au plus 300 caractères. `http://` est
-- refusé parce que ces liens sont OUVERTS DEPUIS LE MOBILE DU JOUEUR, où un
-- lien en clair est au mieux réécrit, au pire bloqué.
select throws_ok(
  $$update public.organizations set google_review_url = 'http://maps.google.com/avis'
     where id = '20000000-0000-4000-8000-000000000001'$$,
  '23514', null::text,
  'a Google review link in plain http is refused'
);
select throws_ok(
  $$update public.organizations set instagram_url = 'http://instagram.com/testacl'
     where id = '20000000-0000-4000-8000-000000000001'$$,
  '23514', null::text,
  'an Instagram link in plain http is refused'
);
select throws_ok(
  $$update public.organizations set tiktok_url = 'javascript:alert(1)'
     where id = '20000000-0000-4000-8000-000000000001'$$,
  '23514', null::text,
  'a TikTok link that is not a URL at all is refused'
);
select throws_ok(
  $$update public.organizations
       set google_review_url = 'https://' || repeat('a', 300)
     where id = '20000000-0000-4000-8000-000000000001'$$,
  '23514', null::text,
  'a link longer than 300 characters is refused'
);
select lives_ok(
  $$update public.organizations
       set google_review_url = 'https://g.page/r/test-acl/review',
           instagram_url     = 'https://instagram.com/testacl',
           tiktok_url        = 'https://tiktok.com/@testacl'
     where id = '20000000-0000-4000-8000-000000000001'$$,
  'https links to Google, Instagram and TikTok are accepted'
);
-- La chaîne vide est le SEUL « non renseigné » : pas de NULL concurrent à
-- traiter côté app. Cet update remet aussi la ligne dans son état d'origine.
select lives_ok(
  $$update public.organizations
       set google_review_url = '', instagram_url = '', tiktok_url = ''
     where id = '20000000-0000-4000-8000-000000000001'$$,
  'clearing an invitation link is always allowed (empty string = not set)'
);
-- L'activation est par campagne, et éteinte par défaut : aucune campagne
-- existante ne se met à afficher un écran de plus après cette migration.
select results_eq(
  $$select prejeu_invitation from public.campaigns
     where id = '30000000-0000-4000-8000-000000000001'$$,
  array[false],
  'a campaign does not invite before the game unless asked'
);
-- Le partage après jeu, lui, est ALLUMÉ par défaut, et l'assertion tient à ce
-- que ça reste vrai : le bloc s'affichait partout avant d'être réglable, un
-- `default false` l'aurait retiré en silence de toutes les campagnes en
-- production le jour du déploiement.
select results_eq(
  $$select share_enabled from public.campaigns
     where id = '30000000-0000-4000-8000-000000000001'$$,
  array[true],
  'a campaign keeps offering the post-game share block by default'
);

-- ── L'ORGANISATION VOISINE ──────────────────────────────────
--
-- Ce fichier prouvait les RÔLES — caissier, éditeur, propriétaire — et jamais
-- les LOCATAIRES : sa fixture n'a longtemps porté qu'UNE organisation. C'est
-- exactement le trou par lequel la fuite `audit_logs` du wagon 1 est passée. La
-- policy donnait les lignes sans organisation à TOUT compte connecté ; le test
-- restait vert parce qu'aucune session d'un AUTRE locataire ne venait jamais
-- lire. Prouver qu'un caissier voit moins qu'un propriétaire ne dit rien de ce
-- que voit le voisin.
--
-- « Org Voisine » ne partage rien avec « Test ACL » : aucune donnée, aucun
-- membre. Son propriétaire est le rôle le PLUS privilégié de son locataire — si
-- lui ne voit rien d'en face, personne chez lui ne voit rien.
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'voisin@test.local', '', now(), now());
insert into public.organizations (id, name, slug) values
 ('20000000-0000-4000-8000-000000000002', 'Org Voisine', 'test-acl-voisine');
insert into public.organization_members (organization_id, user_id, role) values
 ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'owner');
-- Un QR code chez « Test ACL ». Sans lui, le zéro du voisin sur `qr_codes`
-- serait vrai faute de ligne à cacher, et non faute de droit d'y accéder.
insert into public.qr_codes (id, organization_id, campaign_id, slug, label) values
 ('a0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001', 'TESTACLQR', 'Comptoir');

-- Une ligne d'audit SANS organisation : c'est exactement ce que le webhook
-- Stripe écrit à chaque synchronisation d'abonnement, identifiant client dans
-- `metadata`. La policy de 00017 la donnait à lire à TOUT compte connecté, de
-- n'importe quel locataire — son premier terme, `organization_id is null or …`,
-- n'était gardé par rien. 20260924120000 le retourne en `is not null and …`.
-- L'insertion se fait ici, hors du bloc `authenticated`, sinon elle serait
-- refusée avant d'avoir rien prouvé.
insert into public.audit_logs (organization_id, actor, action, metadata)
values (null, 'stripe', 'subscription.sync', '{"customer_id":"cus_TESTACL"}'::jsonb);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select results_eq('select count(*) from public.campaigns', array[0::bigint], 'cashier cannot enumerate campaigns');
select results_eq($$select count(*) from public.audit_logs where organization_id is null$$, array[0::bigint], 'cashier cannot read the tenant-less audit trail');
select results_eq('select count(*) from public.participations', array[0::bigint], 'cashier cannot enumerate PII');
select results_eq('select count(*) from public.newsletter_subscribers', array[0::bigint], 'cashier cannot enumerate newsletter');
select results_eq('select count(*) from public.contest_players', array[0::bigint], 'cashier cannot enumerate contest PII');
select results_eq('select count(*) from public.hunts', array[1::bigint], 'cashier can read hunts (caisse et stats, sans PII)');
select results_eq('select count(*) from public.loyalty_programs', array[1::bigint], 'cashier can read loyalty programs (caisse et stats, sans PII)');
select throws_ok($$select * from public.org_customer_profiles('20000000-0000-4000-8000-000000000001')$$, 'P0001', 'not authorized', 'cashier cannot enumerate customer profiles');

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
select results_eq('select count(*) from public.campaigns', array[1::bigint], 'editor can read campaigns');
select results_eq('select count(*) from public.participations', array[0::bigint], 'editor cannot enumerate PII');
select results_eq('select count(*) from public.contest_players', array[0::bigint], 'editor cannot enumerate contest PII');
update public.campaigns set name = 'Modifiée' where id = '30000000-0000-4000-8000-000000000001';
select results_eq($$select count(*) from public.audit_logs where action = 'campaigns.update'$$, array[0::bigint], 'editor cannot read even their mutation audit');
select is(
  public.set_contest_match_result(
    '20000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001', 3, 1
  ), true, 'editor can set a result after kickoff'
);
select throws_ok(
  $$select public.set_contest_match_result('20000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002',1,0)$$,
  'P0001', 'managed match', 'editor cannot overwrite a provider-managed result'
);
select throws_ok(
  $$select public.set_contest_match_result('20000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003',1,0)$$,
  'P0001', 'match not started', 'editor cannot publish a result before kickoff'
);
-- Le championnat a des pronostics : règlement verrouillé, motif exigé.
select throws_ok(
  $$select public.update_contest_scoring('20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001', 5, 3, 2)$$,
  'P0001', 'locked: reason required',
  'a locked contest refuses a silent scoring change'
);
select is(
  public.update_contest_scoring(
    '20000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001', 5, 3, 2,
    'correction du barème pour le test de verrouillage'
  ), true, 'scoring update succeeds atomically (with audited reason)'
);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select results_eq('select count(*) from public.participations', array[1::bigint], 'owner can read participations');
select results_eq('select count(*) from public.newsletter_subscribers', array[1::bigint], 'owner can read newsletter');
select results_eq('select count(*) from public.contest_players', array[1::bigint], 'owner can read contest players');
select results_eq($$select count(*) from public.audit_logs where action = 'campaigns.update'$$, array[1::bigint], 'direct editor mutation is audited for owner');
-- L'owner lit le journal de SON organisation (assertion ci-dessus) et rien
-- d'autre : les lignes sans organisation ne lui appartiennent pas davantage
-- qu'au caissier. C'est le cas le plus fort — si le rôle le plus privilégié du
-- locataire ne les voit pas, personne dans ce locataire ne les voit.
select results_eq($$select count(*) from public.audit_logs where organization_id is null$$, array[0::bigint], 'not even an owner reads the tenant-less billing audit');
select results_eq(
  $$select points from public.contest_predictions where match_id = '71000000-0000-4000-8000-000000000001'$$,
  array[2], 'scoring update recalculates a finished prediction'
);
select results_eq(
  $$select count(*) from public.audit_logs where action in ('contest.result.set','contest.scoring.update')$$,
  array[2::bigint], 'result and scoring mutations are audited'
);
select throws_ok(
  $$delete from public.contest_matches where id = '71000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table contest_matches',
  'direct match deletion is forbidden'
);
select throws_ok(
  $$select public.delete_contest_match('20000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002')$$,
  'P0001', 'managed match', 'managed match deletion is forbidden'
);
-- Le match porte un pronostic : suppression motivée uniquement.
select throws_ok(
  $$select public.delete_contest_match('20000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001')$$,
  'P0001', 'locked: reason required',
  'deleting a predicted match without a reason is refused'
);
select is(
  public.delete_contest_match(
    '20000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'match annulé par la fédération (test)'
  ), true, 'manual match deletion uses the guarded RPC'
);
select results_eq(
  $$select count(*) from public.audit_logs where action = 'contest.match.delete'$$,
  array[1::bigint], 'match deletion is audited'
);
select is(
  public.delete_contest(
    '20000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001'
  ), 'TESTPRONO', 'contest deletion returns its invalidated slug'
);
select results_eq(
  $$select count(*) from public.audit_logs where action = 'contest.delete'$$,
  array[1::bigint], 'contest deletion is audited'
);

-- CONTRÔLE DE PORTÉE du cloisonnement, joué depuis la session propriétaire de
-- « Test ACL » — la seule qui voit ces lignes. Les neuf `count(*) = 0` du voisin
-- ne valent que si chacune de ces tables contient RÉELLEMENT quelque chose à
-- cacher au moment où il regarde : sur une table vide, un refus et une absence
-- rendent le même zéro. `concat_ws` ignore les NULL, donc l'échec NOMME les
-- tables qui se seraient vidées.
select is(
  concat_ws(', ',
    case when (select count(*) from public.campaigns) = 0 then 'campaigns' end,
    case when (select count(*) from public.wheels) = 0 then 'wheels' end,
    case when (select count(*) from public.prizes) = 0 then 'prizes' end,
    case when (select count(*) from public.qr_codes) = 0 then 'qr_codes' end,
    case when (select count(*) from public.participations) = 0 then 'participations' end,
    case when (select count(*) from public.spins) = 0 then 'spins' end,
    case when (select count(*) from public.newsletter_subscribers) = 0 then 'newsletter_subscribers' end,
    case when (select count(*) from public.organizations where id = '20000000-0000-4000-8000-000000000001') = 0 then 'organizations' end,
    case when (select count(*) from public.audit_logs) = 0 then 'audit_logs' end),
  '',
  'les neuf tables du cloisonnement ont bien une ligne à cacher au voisin'
);

-- ── Quatrième session : le propriétaire d'EN FACE ────────────
-- Neuf tables, neuf zéros. `organizations` est bornée à l'organisation d'en
-- face : le voisin voit évidemment la sienne, ce qu'on lui refuse c'est l'autre.
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000004';
select results_eq('select count(*) from public.campaigns', array[0::bigint], 'a neighbouring owner reads no campaign of another tenant');
select results_eq('select count(*) from public.wheels', array[0::bigint], 'a neighbouring owner reads no wheel of another tenant');
select results_eq('select count(*) from public.prizes', array[0::bigint], 'a neighbouring owner reads no prize of another tenant');
select results_eq('select count(*) from public.qr_codes', array[0::bigint], 'a neighbouring owner reads no QR code of another tenant');
select results_eq('select count(*) from public.participations', array[0::bigint], 'a neighbouring owner reads no participation PII of another tenant');
select results_eq('select count(*) from public.spins', array[0::bigint], 'a neighbouring owner reads no spin of another tenant');
select results_eq('select count(*) from public.newsletter_subscribers', array[0::bigint], 'a neighbouring owner reads no newsletter subscriber of another tenant');
select results_eq($$select count(*) from public.organizations where id = '20000000-0000-4000-8000-000000000001'$$, array[0::bigint], 'a neighbouring owner does not even see the other organization row');
select results_eq('select count(*) from public.audit_logs', array[0::bigint], 'a neighbouring owner reads no audit line at all — neither the other tenant''s, nor the tenant-less billing trail');

reset role;
select * from finish();
rollback;
