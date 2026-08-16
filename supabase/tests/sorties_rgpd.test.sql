-- ============================================================
-- Ce qui sort de la base — migration 20260924120000
--
-- Ce que ces tests établissent, par ordre d'importance :
--   1. les PARTIES survivent à la purge, mais le LIEN entre celles d'une même
--      personne meurt : au-delà de la rétention, `spins.player_key` est
--      remplacée par une valeur dérivée de l'identifiant de la ligne ;
--   2. la ligne, elle, est TOUJOURS LÀ — c'est tout l'intérêt d'anonymiser
--      plutôt que de supprimer : neuf colonnes d'autres tables pointent
--      `spins(id)`, et les statistiques du commerçant n'ont pas d'échéance ;
--   3. la frontière est bien la RÉTENTION de l'organisation, pas un forfait :
--      une partie récente garde son empreinte intacte ;
--   4. l'index unique partiel `(wheel_id, player_key, play_window_key)` ne
--      s'oppose pas au geste — deux parties du même appareil dans deux
--      fenêtres reçoivent deux clés distinctes, jamais une collision ;
--   5. le passage est IDEMPOTENT : le cron tourne tous les jours, il ne doit
--      pas réécrire une clé déjà anonymisée (ni la faire dériver) ;
--   6. la purge des participations, elle, n'a pas bougé — le corps a été
--      recopié verbatim, et ce test le prouve au lieu de l'espérer ;
--   7. `referral_signups.ip` n'existe plus, et la SIGNATURE de
--      `validate_referral` n'a pas bougé pour autant : c'est la promesse
--      « zéro churn TypeScript » de la migration, vérifiable ici seulement.
--
-- Plan CHIFFRÉ et non `no_plan()` : un fichier qui MEURT avant `finish()` rend
-- « aucun plan trouvé », ce que rien ne distingue d'un succès.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ══ 1. IP-1 — la colonne est partie, la signature est restée ═══
select hasnt_column('public', 'referral_signups', 'ip',
  'une IP jamais lue ne se conserve pas douze mois');
-- La signature entière, NOMS DE PARAMÈTRES COMPRIS : l'appelant TypeScript
-- passe `p_ip` par son nom (`src/actions/referral.ts`). Un `has_function` sur
-- les seuls types laisserait passer un renommage qui casserait l'appel.
-- Le sous-select scalaire vaut aussi assertion d'unicité : deux surcharges
-- feraient échouer la requête au lieu de passer inaperçues.
select is(
  (select pg_catalog.pg_get_function_identity_arguments(p.oid)
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'validate_referral'),
  'p_campaign_id uuid, p_referral_code text, p_filleul_key text, p_proof_spin_id uuid, p_filleul_email text, p_ip text',
  'validate_referral garde sa signature — p_ip survit, ignoré, pour ne rien casser côté appelant');

-- ══ 2. RET-1 — fixtures ════════════════════════════════════════
-- Deux organisations : l'une déclare six mois de rétention, l'autre n'en
-- déclare aucune. La seconde documente le GRAIN de la boucle existante
-- (`data_retention_months is not null`), le même que pour les participations.
insert into public.organizations (id, name, slug, data_retention_months)
values
  ('dd000000-0000-4000-8000-000000000001', 'Org Purge Spins', 'tap-purge-spins', 6),
  ('dd000000-0000-4000-8000-000000000002', 'Org Sans Retention', 'tap-purge-null', null);

insert into public.campaigns (id, organization_id, name)
values
  ('dd000000-0000-4000-8000-000000000011', 'dd000000-0000-4000-8000-000000000001', 'Campagne purge'),
  ('dd000000-0000-4000-8000-000000000012', 'dd000000-0000-4000-8000-000000000002', 'Campagne sans purge');

insert into public.wheels (id, organization_id, campaign_id, name)
values
  ('dd000000-0000-4000-8000-000000000021', 'dd000000-0000-4000-8000-000000000001',
   'dd000000-0000-4000-8000-000000000011', 'Roue purge'),
  ('dd000000-0000-4000-8000-000000000022', 'dd000000-0000-4000-8000-000000000002',
   'dd000000-0000-4000-8000-000000000012', 'Roue sans purge');

insert into public.spins (id, organization_id, campaign_id, wheel_id, is_losing, player_key,
                          play_window_key, created_at)
values
  -- DANS la rétention : intacte.
  ('dd000000-0000-4000-8000-000000000031', 'dd000000-0000-4000-8000-000000000001',
   'dd000000-0000-4000-8000-000000000011', 'dd000000-0000-4000-8000-000000000021',
   true, repeat('a', 64), null, now() - interval '1 month'),
  -- AU-DELÀ : anonymisée.
  ('dd000000-0000-4000-8000-000000000032', 'dd000000-0000-4000-8000-000000000001',
   'dd000000-0000-4000-8000-000000000011', 'dd000000-0000-4000-8000-000000000021',
   true, repeat('b', 64), null, now() - interval '12 months'),
  -- AU-DELÀ, même roue et MÊME empreinte, deux fenêtres de jeu : le seul cas
  -- que l'index unique partiel pourrait refuser si la valeur de remplacement
  -- n'était pas dérivée de l'identifiant de la ligne.
  ('dd000000-0000-4000-8000-000000000033', 'dd000000-0000-4000-8000-000000000001',
   'dd000000-0000-4000-8000-000000000011', 'dd000000-0000-4000-8000-000000000021',
   true, repeat('c', 64), '2026-01-01', now() - interval '12 months'),
  ('dd000000-0000-4000-8000-000000000034', 'dd000000-0000-4000-8000-000000000001',
   'dd000000-0000-4000-8000-000000000011', 'dd000000-0000-4000-8000-000000000021',
   true, repeat('c', 64), '2026-01-02', now() - interval '12 months'),
  -- Organisation SANS rétention déclarée : rien ne lui est appliqué.
  ('dd000000-0000-4000-8000-000000000035', 'dd000000-0000-4000-8000-000000000002',
   'dd000000-0000-4000-8000-000000000012', 'dd000000-0000-4000-8000-000000000022',
   true, repeat('e', 64), null, now() - interval '24 months');

-- Deux participations pour prouver que le corps recopié n'a pas perdu son
-- geste d'origine : l'ancienne part, la récente reste.
insert into public.participations (id, organization_id, campaign_id, wheel_id, first_name,
                                   email, accepted_terms, redeem_code, player_key, created_at)
values
  ('dd000000-0000-4000-8000-000000000041', 'dd000000-0000-4000-8000-000000000001',
   'dd000000-0000-4000-8000-000000000011', 'dd000000-0000-4000-8000-000000000021',
   'Ancienne', 'ancienne@tap-purge.local', true, 'PURGE-ANCIENNE',
   repeat('b', 64), now() - interval '12 months'),
  ('dd000000-0000-4000-8000-000000000042', 'dd000000-0000-4000-8000-000000000001',
   'dd000000-0000-4000-8000-000000000011', 'dd000000-0000-4000-8000-000000000021',
   'Recente', 'recente@tap-purge.local', true, 'PURGE-RECENTE',
   repeat('a', 64), now() - interval '1 month');

select public.purge_expired_personal_data();

-- ══ 3. RET-1 — ce que la purge a fait, et ce qu'elle n'a pas fait ══
select results_eq(
  $$select player_key from public.spins where id = 'dd000000-0000-4000-8000-000000000031'$$,
  array[repeat('a', 64)],
  'une partie DANS la rétention garde son empreinte'
);
select results_eq(
  $$select count(*)::int from public.spins where id = 'dd000000-0000-4000-8000-000000000032'$$,
  array[1],
  'une partie au-delà de la rétention EXISTE toujours — on anonymise, on ne supprime pas'
);
select results_eq(
  $$select player_key from public.spins where id = 'dd000000-0000-4000-8000-000000000032'$$,
  array['purge:dd000000-0000-4000-8000-000000000032'],
  'au-delà de la rétention, l empreinte est remplacée par une valeur dérivée de la ligne'
);
select results_eq(
  $$select count(*)::int from public.spins
     where id in ('dd000000-0000-4000-8000-000000000033',
                  'dd000000-0000-4000-8000-000000000034')
       and player_key = 'purge:' || id$$,
  array[2],
  'deux parties du même appareil dans deux fenêtres sont anonymisées toutes les deux'
);
select results_eq(
  $$select count(distinct player_key)::int from public.spins
     where id in ('dd000000-0000-4000-8000-000000000033',
                  'dd000000-0000-4000-8000-000000000034')$$,
  array[2],
  'et reçoivent deux clés DISTINCTES — l index unique partiel ne peut pas s y opposer'
);
select results_eq(
  $$select player_key from public.spins where id = 'dd000000-0000-4000-8000-000000000035'$$,
  array[repeat('e', 64)],
  'une organisation sans rétention déclarée n est pas purgée — même grain que les participations'
);
select results_eq(
  $$select count(*)::int from public.participations
     where id = 'dd000000-0000-4000-8000-000000000041'$$,
  array[0],
  'la participation périmée part toujours — le corps recopié n a rien perdu'
);
select results_eq(
  $$select count(*)::int from public.participations
     where id = 'dd000000-0000-4000-8000-000000000042'$$,
  array[1],
  'la participation récente reste'
);

-- ══ 4. Idempotence — le cron passe tous les jours ═══════════════
select public.purge_expired_personal_data();
select results_eq(
  $$select player_key from public.spins where id = 'dd000000-0000-4000-8000-000000000032'$$,
  array['purge:dd000000-0000-4000-8000-000000000032'],
  'un second passage ne réécrit pas une clé déjà anonymisée'
);

select * from finish();
rollback;
