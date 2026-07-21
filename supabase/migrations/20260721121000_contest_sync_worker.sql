-- ============================================================
-- Lastchance — Worker de synchronisation des résultats (Pronostics)
--
-- Le cron Vercel est quotidien (plan Hobby) : un résultat tombé après
-- 3 h 30 attendait le lendemain sans visite de la page. Trois briques :
--
--  1. Verrou de rafraîchissement par ligue (claim_fixture_refresh) :
--     plusieurs requêtes simultanées ne déclenchent plus qu'UN appel
--     fournisseur — les autres servent la copie existante sans attendre.
--  2. Observabilité : provider_status / last_error / âge du cache sur
--     fixture_cache ; last_synced_at / last_sync_error par championnat.
--  3. Planification fréquente côté Supabase : pg_cron appelle la route
--     /api/cron/sync-contests toutes les 10 minutes via pg_net, avec
--     l'URL et le secret lus dans Vault. Sans secrets (local, CI), le
--     job ne fait rien — l'activation prod est une insertion Vault
--     unique (voir docs/observability.md).
-- ============================================================

-- ── 1. Observabilité du cache partagé ────────────────────────
alter table public.fixture_cache
  add column if not exists refresh_claimed_at timestamptz,
  add column if not exists last_error text,
  add column if not exists provider_status text not null default 'ok';

alter table public.fixture_cache
  drop constraint if exists fixture_cache_provider_status_check;
alter table public.fixture_cache
  add constraint fixture_cache_provider_status_check
  check (provider_status in ('ok', 'error'));

comment on column public.fixture_cache.refresh_claimed_at is
  'Verrou de rafraîchissement : posé par claim_fixture_refresh, relâché à l''écriture du payload (ou expiré après le TTL).';
comment on column public.fixture_cache.provider_status is
  'Dernier appel fournisseur pour cette ligue : ok ou error (détail dans last_error).';

-- ── 2. Traçabilité par championnat ───────────────────────────
alter table public.contests
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_sync_error text;

comment on column public.contests.last_synced_at is
  'Dernière synchronisation fournisseur RÉUSSIE (cron, visite ou bouton).';
comment on column public.contests.last_sync_error is
  'Erreur de la dernière synchronisation (null si réussie).';

-- ── 3. Verrou de rafraîchissement par ligue ──────────────────
-- Claim atomique : vrai si l'appelant devient LE rafraîchisseur de la
-- ligue (verrou libre ou expiré), faux si un autre processus détient
-- un verrou encore valide. Le gagnant appelle le fournisseur puis
-- écrit le payload (ce qui relâche le verrou) ; les perdants servent
-- la copie en place — périmée au pire de quelques minutes.
create or replace function public.claim_fixture_refresh(
  p_league_id text,
  p_ttl_seconds integer default 90
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_league_id is null or char_length(p_league_id) not between 1 and 20 then
    raise exception 'invalid league id';
  end if;

  insert into public.fixture_cache as fc (league_id, payload, fetched_at, refresh_claimed_at)
  values (p_league_id, '[]'::jsonb, to_timestamp(0), now())
  on conflict (league_id) do update
     set refresh_claimed_at = now()
   where fc.refresh_claimed_at is null
      or fc.refresh_claimed_at
         < now() - make_interval(secs => greatest(coalesce(p_ttl_seconds, 90), 5))
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_fixture_refresh(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_fixture_refresh(text, integer) to service_role;

-- ── 4. Planification 10 min côté Supabase (pg_cron + pg_net) ─
-- Le job lit l'URL et le secret dans Vault à CHAQUE exécution : rien
-- de sensible n'est committé, et tant que les deux secrets
-- (sync_contests_url, sync_contests_secret) ne sont pas posés, le job
-- est un no-op silencieux (local, CI, prod pas encore activée).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'lastchance-sync-contests',
  '*/10 * * * *',
  $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets
             where name = 'sync_contests_url'),
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                     where name = 'sync_contests_secret')
    ),
    timeout_milliseconds := 55000
  )
  where (select count(*) from vault.decrypted_secrets
          where name in ('sync_contests_url', 'sync_contests_secret')) = 2
  $job$
);
