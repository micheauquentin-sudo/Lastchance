-- Module « Pronostics » : championnats de pronostics pendant les grandes
-- compétitions (Coupe du monde, 6 Nations, Roland-Garros…). Vendu en
-- option (addon) ou inclus dans le plan premium.
--
-- Le commerçant crée un championnat, ajoute des matchs depuis le
-- catalogue de compétitions (drapeaux/équipes/joueurs côté app), fixe
-- son barème de points et ses récompenses par rang. Ses clients
-- s'inscrivent via lien/QR, pronostiquent chaque match avant le coup
-- d'envoi, et le classement cumule les points à mesure que le
-- commerçant saisit les résultats.
--
-- Sécurité : même modèle que le reste de l'app — RLS par organisation
-- (is_org_editor) pour la gestion, aucun accès anon (le parcours
-- public passe par le service role dans les server actions, comme /play).

alter table public.organizations
  add column addon_pronostics boolean not null default false;

comment on column public.organizations.addon_pronostics is
  'Module Pronostics activé (option payante, ou inclus dans le plan premium)';

-- ── Championnats ──
create table public.contests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null unique,
  name text not null,
  competition_key text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'finished')),
  -- Barème : { exact, diff, winner } (points par pronostic)
  scoring jsonb not null default '{"exact": 3, "diff": 2, "winner": 1}'::jsonb,
  -- Récompenses par rang : [{ "from": 1, "to": 3, "label": "…" }]
  rewards jsonb not null default '[]'::jsonb,
  collect_email boolean not null default true,
  collect_phone boolean not null default false,
  created_at timestamptz not null default now()
);

create index contests_org_idx on public.contests (organization_id);

-- ── Matchs d'un championnat ──
create table public.contest_matches (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  home_key text not null default '',
  home_name text not null,
  home_badge text not null default '',
  home_color text not null default '',
  away_key text not null default '',
  away_name text not null,
  away_badge text not null default '',
  away_color text not null default '',
  kickoff_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'finished')),
  home_score integer check (home_score between 0 and 99),
  away_score integer check (away_score between 0 and 99),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index contest_matches_contest_idx on public.contest_matches (contest_id);
create index contest_matches_org_idx on public.contest_matches (organization_id);

-- ── Joueurs inscrits (clients du commerçant) ──
create table public.contest_players (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Identité côté navigateur : hash du jeton remis à l'inscription.
  token_hash text not null,
  first_name text not null default '',
  email text,
  phone text,
  created_at timestamptz not null default now(),
  unique (contest_id, token_hash)
);

create index contest_players_contest_idx on public.contest_players (contest_id);
create index contest_players_org_idx on public.contest_players (organization_id);
-- Un même email ne s'inscrit qu'une fois par championnat.
create unique index contest_players_email_uniq
  on public.contest_players (contest_id, lower(email))
  where email is not null;

-- ── Pronostics ──
create table public.contest_predictions (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  match_id uuid not null references public.contest_matches(id) on delete cascade,
  player_id uuid not null references public.contest_players(id) on delete cascade,
  home_score integer not null check (home_score between 0 and 99),
  away_score integer not null check (away_score between 0 and 99),
  -- Points attribués à la saisie du résultat (null tant que non joué).
  points integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index contest_predictions_contest_idx on public.contest_predictions (contest_id);
create index contest_predictions_player_idx on public.contest_predictions (player_id);
create index contest_predictions_org_idx on public.contest_predictions (organization_id);

-- ── RLS : gestion réservée aux owners/editors de l'organisation ──
alter table public.contests enable row level security;
alter table public.contest_matches enable row level security;
alter table public.contest_players enable row level security;
alter table public.contest_predictions enable row level security;

create policy "contests: editors" on public.contests
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "contest_matches: editors" on public.contest_matches
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "contest_players: editors" on public.contest_players
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "contest_predictions: editors" on public.contest_predictions
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

grant select, insert, update, delete
  on public.contests, public.contest_matches,
     public.contest_players, public.contest_predictions
  to authenticated;
