-- ============================================================
-- ACTIFS QR DE DIFFUSION
--
-- Les QR de campagne avaient deja un objet persistant (`qr_codes`) avec
-- style et affiche. Les autres experiences publient aussi un lien, mais leur
-- QR etait recompose avec un style fixe a chaque rendu. Ce registre donne un
-- actif editorial aux seules adresses publiques stables, sans jamais stocker
-- une URL saisie par le navigateur ni melanger les QR de caisse / de retrait.
-- ============================================================

create table public.qr_distribution_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_kind text not null check (resource_kind in (
    'quiz', 'calendar', 'pronostics', 'jackpot', 'loyalty', 'event',
    'reservation', 'duo', 'portrait', 'hunt_step', 'vitrine'
  )),
  resource_id uuid not null,
  style jsonb not null default '{}'::jsonb
    check (pg_column_size(style) <= 262144),
  poster jsonb not null default '{}'::jsonb
    check (pg_column_size(poster) <= 16384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_distribution_assets_resource_unique
    unique (organization_id, resource_kind, resource_id)
);

create index qr_distribution_assets_org_idx
  on public.qr_distribution_assets (organization_id, resource_kind, resource_id);

alter table public.qr_distribution_assets enable row level security;
revoke all on table public.qr_distribution_assets from public, anon;
grant select, insert, update, delete on table public.qr_distribution_assets to authenticated;
grant select, insert, update, delete on table public.qr_distribution_assets to service_role;

create policy "qr_distribution_assets: editor all"
  on public.qr_distribution_assets
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create trigger qr_distribution_assets_set_updated_at
  before update on public.qr_distribution_assets
  for each row execute function public.touch_updated_at();

comment on table public.qr_distribution_assets is
  'Actif editorial d''un QR de diffusion public : style et affiche par ressource, jamais une URL, un token de caisse ou un code de retrait.';
