-- ============================================================
-- LastChance — Durcissement accès offert + suppressions marchands
-- ============================================================

-- Le motif est une note interne au back-office. Les commerçants ont besoin
-- des deux indicateurs d'accès pour calculer leurs droits, jamais du motif.
revoke select (comp_access_note) on public.organizations from authenticated;
grant select (comp_access, comp_access_until)
  on public.organizations to authenticated;

-- Défense en profondeur : l'UI borne déjà cette valeur à 200 caractères.
-- NOT VALID évite de bloquer le déploiement si une ancienne valeur saisie
-- manuellement dépasse la limite ; toute nouvelle écriture est contrôlée.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.organizations'::regclass
      and conname = 'organizations_comp_access_note_length'
  ) then
    alter table public.organizations
      add constraint organizations_comp_access_note_length
      check (char_length(comp_access_note) <= 200) not valid;
  end if;
end
$$;

-- Journal durable de la saga de suppression. Il conserve l'identifiant
-- Stripe et les erreurs de nettoyage même après la cascade de l'organisation.
create table public.merchant_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  organization_name text not null check (char_length(organization_name) <= 200),
  organization_slug text not null check (char_length(organization_slug) <= 200),
  stripe_customer_id text,
  actor_admin_user_id uuid references public.admin_users(id) on delete set null,
  actor_email text not null,
  member_user_ids uuid[] not null default '{}',
  status text not null default 'pending'
    check (status in (
      'pending',
      'stripe_canceled',
      'database_deleted',
      'completed',
      'completed_with_warnings',
      'failed'
    )),
  cleanup_errors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(cleanup_errors) = 'array'),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index merchant_deletion_jobs_status_idx
  on public.merchant_deletion_jobs(status, created_at);
create index merchant_deletion_jobs_organization_idx
  on public.merchant_deletion_jobs(organization_id, created_at desc);

alter table public.merchant_deletion_jobs enable row level security;
revoke all on table public.merchant_deletion_jobs from public, anon, authenticated;
grant select, insert, update on table public.merchant_deletion_jobs to service_role;

comment on table public.merchant_deletion_jobs is
  'Journal durable des suppressions marchands : arrêt Stripe, cascade DB et nettoyages Auth/Storage.';

-- update_admin_safely protège déjà la rétrogradation/désactivation du dernier
-- super-admin. Ce trigger couvre aussi DELETE et les cascades depuis auth.users.
create or replace function public.prevent_last_active_super_admin_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'super_admin' and old.is_active then
    perform pg_catalog.pg_advisory_xact_lock(731904221);
    if (
      select count(*)
      from public.admin_users
      where role = 'super_admin' and is_active
    ) <= 1 then
      raise exception 'last active super admin';
    end if;
  end if;
  return old;
end
$$;

revoke all on function public.prevent_last_active_super_admin_delete()
  from public, anon, authenticated;

drop trigger if exists admin_users_protect_last_super_admin_delete
  on public.admin_users;
create trigger admin_users_protect_last_super_admin_delete
before delete on public.admin_users
for each row execute function public.prevent_last_active_super_admin_delete();
