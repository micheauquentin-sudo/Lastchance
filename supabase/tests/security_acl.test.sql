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
select ok(has_function_privilege('service_role', 'public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean)', 'EXECUTE'), 'only server can perform atomic spin');
select ok(not has_function_privilege('authenticated', 'public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean)', 'EXECUTE'), 'merchant cannot perform atomic spin');
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
select ok(has_function_privilege('service_role', 'public.record_loyalty_stamp(uuid,text,text,uuid)', 'EXECUTE'), 'only server can record a loyalty stamp');
select ok(not has_function_privilege('authenticated', 'public.record_loyalty_stamp(uuid,text,text,uuid)', 'EXECUTE'), 'merchant cannot stamp arbitrary passports');
select ok(not has_function_privilege('anon', 'public.record_loyalty_stamp(uuid,text,text,uuid)', 'EXECUTE'), 'anon cannot call the stamp RPC directly');
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

select ok((select relrowsecurity from pg_class where oid = 'public.organizations'::regclass), 'organizations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.participations'::regclass), 'participations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.newsletter_subscribers'::regclass), 'newsletter RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass), 'audit RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.team_invitations'::regclass), 'invitations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.admin_users'::regclass), 'admin users RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.admin_sessions'::regclass), 'admin sessions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.merchant_deletion_jobs'::regclass), 'merchant deletion jobs RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.reward_issuances'::regclass), 'universal rewards RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.ops_worker_runs'::regclass), 'worker heartbeat RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.ops_worker_definitions'::regclass), 'worker registry RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.webhook_deliveries'::regclass), 'webhook outbox RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.contest_players'::regclass), 'contest players RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.contest_predictions'::regclass), 'contest predictions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.contest_leagues'::regclass), 'contest leagues RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.contest_league_members'::regclass), 'league members RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.automation_settings'::regclass), 'automation settings RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.email_log'::regclass), 'email log RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.hunts'::regclass), 'hunts RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.hunt_steps'::regclass), 'hunt steps RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.hunt_players'::regclass), 'hunt players RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.hunt_scans'::regclass), 'hunt scans RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.hunt_completions'::regclass), 'hunt completions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.loyalty_programs'::regclass), 'loyalty programs RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.loyalty_milestones'::regclass), 'loyalty milestones RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.loyalty_members'::regclass), 'loyalty members RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.loyalty_stamps'::regclass), 'loyalty stamps RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.loyalty_rewards'::regclass), 'loyalty rewards RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.jackpot_campaigns'::regclass), 'jackpot campaigns RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.jackpot_players'::regclass), 'jackpot players RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.jackpot_participants'::regclass), 'jackpot participants RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.jackpot_wins'::regclass), 'jackpot wins RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.event_games'::regclass), 'event games RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.event_questions'::regclass), 'event questions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.event_question_options'::regclass), 'event options RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.event_sessions'::regclass), 'event sessions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.event_players'::regclass), 'event players RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.event_answers'::regclass), 'event answers RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.event_wins'::regclass), 'event wins RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.calendars'::regclass), 'calendars RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.calendar_days'::regclass), 'calendar days RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.calendar_players'::regclass), 'calendar players RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.calendar_openings'::regclass), 'calendar openings RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.calendar_rewards'::regclass), 'calendar rewards RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.campaign_templates'::regclass), 'campaign templates RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.quizzes'::regclass), 'quizzes RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.quiz_questions'::regclass), 'quiz questions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.quiz_players'::regclass), 'quiz players RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.quiz_answers'::regclass), 'quiz answers RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.quiz_rewards'::regclass), 'quiz rewards RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_seasons'::regclass), 'progression seasons RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_badges'::regclass), 'progression badges RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_collections'::regclass), 'progression collections RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_collection_items'::regclass), 'progression collection items RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_missions'::regclass), 'progression missions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_mission_versions'::regclass), 'progression mission versions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_player_seasons'::regclass), 'progression player seasons RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_mission_progress'::regclass), 'progression mission progress RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_mission_contributions'::regclass), 'progression contributions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_player_badges'::regclass), 'progression player badges RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_player_items'::regclass), 'progression player items RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_chests'::regclass), 'progression chests RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_chest_items'::regclass), 'progression chest items RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_chest_openings'::regclass), 'progression chest openings RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.progression_engine_failures'::regclass), 'progression engine failures RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.webhook_deliveries', 'SELECT'), 'merchant cannot read webhook payloads');
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

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select results_eq('select count(*) from public.campaigns', array[0::bigint], 'cashier cannot enumerate campaigns');
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

reset role;
select * from finish();
rollback;
