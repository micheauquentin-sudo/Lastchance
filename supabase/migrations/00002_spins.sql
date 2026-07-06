-- ============================================================
-- Spins : chaque lancer de roue est enregistré AU MOMENT DU SPIN.
-- La limite de jeu s'appuie sur cette table (et non sur les
-- participations, créées seulement après le formulaire) pour
-- empêcher de relancer la roue jusqu'au lot désiré.
-- ============================================================

create table public.spins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  wheel_id uuid not null references public.wheels(id) on delete cascade,
  prize_id uuid references public.prizes(id) on delete set null,
  is_losing boolean not null default false,
  player_key text not null,
  claimed boolean not null default false,
  created_at timestamptz not null default now()
);

create index spins_player_window_idx
  on public.spins(wheel_id, player_key, created_at desc);
create index spins_org_idx on public.spins(organization_id);

alter table public.spins enable row level security;

-- Lecture pour les membres de l'org (stats) ; écritures via service role.
create policy "spins: select membres" on public.spins
  for select using (public.is_org_member(organization_id));

-- Lien participation → spin (traçabilité + anti-double-claim)
alter table public.participations
  add column spin_id uuid unique references public.spins(id) on delete set null;
