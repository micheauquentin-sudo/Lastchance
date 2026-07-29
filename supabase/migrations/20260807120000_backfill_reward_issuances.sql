-- ============================================================
-- Lastchance — Backfill du registre universel des récompenses
--
-- ── Le trou que ceci comble ──
--
-- `20260805150000_universal_rewards.sql` a installé le registre
-- `reward_issuances` et dix triggers de miroir, MAIS n'a rien rétro-alimenté :
-- son en-tête l'assume (« migration sans big-bang »). Conséquence mesurée par
-- l'analyse d'écart du 2026-07-29 : **tout lot émis AVANT cette migration est
-- invisible du moteur unique** `redeem_reward_by_code`, qui ne connaît que le
-- registre et sort en zéro ligne autrement.
--
-- Aujourd'hui personne ne s'en aperçoit : la caisse tente le moteur, obtient
-- zéro ligne, et retombe silencieusement sur la RPC historique de la famille.
-- Le test `universal_rewards.test.sql:311-341` prouve littéralement que c'est
-- CE REPLI qui sauve ces codes — il supprime la ligne de registre pour simuler
-- une émission antérieure à la migration.
--
-- Cet écart est donc BLOQUANT pour les neuf familles : tant qu'il subsiste,
-- retirer le repli ferait dire « code introuvable » à un caissier tenant un lot
-- parfaitement valide, devant un client qui attend.
--
-- ── Ce que cette migration fait, et ne fait pas ──
--
-- Elle rejoue `sync_reward_issuance(table, id)` — l'outil EXISTE déjà et est
-- idempotent par construction (`on conflict (source_type, source_id) do
-- update`) — sur les lignes des dix tables historiques qui portent un code et
-- n'ont pas encore de miroir.
--
-- Elle NE CHANGE AUCUN COMPORTEMENT : le repli reste en place, la caisse
-- continue exactement comme avant. Elle rend seulement le moteur capable de
-- voir ce qu'il ne voyait pas. C'est le prérequis de toute bascule ultérieure,
-- et c'est réversible ligne à ligne (`delete from reward_issuances where …`).
--
-- ── Pourquoi une boucle et pas un `insert … select` ──
--
-- `sync_reward_issuance` porte toute la logique par famille : résolution du
-- joueur, mapping des colonnes, expiration et annulation quand la table les
-- connaît. La réécrire en ensembliste dupliquerait 300 lignes de règles
-- métier — exactement la seconde source de vérité que ce registre existe pour
-- supprimer. On paie une boucle, on garde UNE définition.
--
-- Chaque ligne est isolée : une source malformée est comptée et sautée, elle
-- n'annule pas le backfill des autres.
-- ============================================================

do $$
declare
  -- Table historique ↦ nom de SA colonne de code. Le nom n'est PAS uniforme :
  -- `participations` porte `redeem_code`, les neuf autres `code`. Présumer
  -- l'uniformité fait échouer la migration entière sur un 42703 — constaté en
  -- l'écrivant. La liste est explicite plutôt que déduite, pour que toute
  -- nouvelle famille oblige à un choix conscient ici.
  --
  -- Complétude et exactitude vérifiées contre le catalogue vivant, et non
  -- présumées : les tables portant un trigger appelant `sync_reward_issuance`
  -- sont exactement ces dix, et la colonne de code relevée pour chacune est
  -- bien celle listée ici. Un nom de colonne erroné lèverait de toute façon un
  -- 42703 dès l'ouverture du curseur, même sur une table vide — donc à chaque
  -- `db reset` de la CI, avant toute production.
  v_tables text[][] := array[
    ['participations',    'redeem_code'],
    ['hunt_completions',  'code'],
    ['loyalty_rewards',   'code'],
    ['jackpot_wins',      'code'],
    ['event_wins',        'code'],
    ['calendar_openings', 'code'],
    ['calendar_rewards',  'code'],
    ['referral_rewards',  'code'],
    ['quiz_rewards',      'code'],
    ['contest_awards',    'code']
  ];
  v_table text;
  v_code_column text;
  v_id uuid;
  v_done int;
  v_failed int;
  v_total int := 0;
  v_total_failed int := 0;
  i int;
begin
  for i in 1 .. array_length(v_tables, 1) loop
    v_table := v_tables[i][1];
    v_code_column := v_tables[i][2];
    v_done := 0;
    v_failed := 0;

    -- `source_type` n'est pas déductible du nom de table (calendar_openings et
    -- calendar_rewards partagent 'calendar'), donc on ne présume rien : on
    -- rejoue la synchro pour toute ligne portant un code, et l'idempotence de
    -- `sync_reward_issuance` rend l'opération inoffensive sur celles qui ont
    -- déjà leur miroir.
    for v_id in execute format(
      'select id from public.%I where %I is not null order by id',
      v_table, v_code_column
    ) loop
      begin
        perform public.sync_reward_issuance(v_table, v_id);
        v_done := v_done + 1;
      exception when others then
        -- Une source incohérente (organisation supprimée, joueur irrésoluble)
        -- ne doit pas emporter le backfill des autres.
        v_failed := v_failed + 1;
      end;
    end loop;

    v_total := v_total + v_done;
    v_total_failed := v_total_failed + v_failed;
    raise notice 'backfill %: % ligne(s) synchronisée(s), % ignorée(s)',
      v_table, v_done, v_failed;
  end loop;

  raise notice 'backfill registre: % ligne(s) au total, % ignorée(s)',
    v_total, v_total_failed;
end;
$$;
