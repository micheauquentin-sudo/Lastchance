-- ============================================================
-- Lastchance — Cache partagé des calendriers sportifs (Pronostics)
--
-- Une seule copie des données fournisseur par ligue, partagée entre
-- tous les commerçants : 20 championnats « Ligue 1 » créés le même
-- jour ne coûtent que 2 appels fournisseur par fenêtre de fraîcheur,
-- et un fournisseur en panne est absorbé (repli sur la copie périmée).
-- Écrit et lu exclusivement par le serveur (service role).
-- ============================================================

create table public.fixture_cache (
  league_id text primary key
    check (char_length(league_id) between 1 and 20),
  payload jsonb not null default '[]'::jsonb
    check (jsonb_typeof(payload) = 'array'),
  fetched_at timestamptz not null default now()
);

comment on table public.fixture_cache is
  'Cache partagé des calendriers TheSportsDB (une ligne par ligue). Service role uniquement.';

alter table public.fixture_cache enable row level security;
revoke all on table public.fixture_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.fixture_cache to service_role;
