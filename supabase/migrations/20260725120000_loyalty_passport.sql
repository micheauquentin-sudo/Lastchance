-- ============================================================
-- Lastchance — Module « Passeport de fidélité ludique »
--
-- Addon d'organisation (miroir exact d'addon_hunts, 20260724120000) :
-- le client cumule des visites (« tampons ») sur un passeport dématé-
-- rialisé ; des paliers configurables débloquent soit un LOT direct
-- (code de retrait FIDELITE-… remis en caisse), soit un TOUR DE ROUE
-- OFFERT sur une roue existante. Niveaux bronze/argent/or calqués sur
-- le nombre de visites.
--
-- Deux modes de validation d'une visite, au choix du commerçant :
--   · rotating_code : un code type TOTP tourne sur un écran au comptoir ;
--     le serveur recalcule le code attendu depuis rotating_secret et
--     l'horloge (fenêtre ±1 période pour la dérive). Le secret ne sort
--     JAMAIS côté client (grant de colonne exclu pour authenticated).
--   · staff : un membre de l'org valide la visite depuis la caisse ;
--     l'autorisation vient du rôle de l'appelant (contrôlé côté action
--     backend), la RPC exige alors p_validated_by (identité du staff).
--
-- Sécurité : même modèle que Chasse au trésor / Pronostics —
--   · identité joueur = cookie HTTP-only côté app, seul le hash SHA-256
--     du jeton touche la base (aucune PII à la création) ;
--   · AUCUN droit anon : le parcours public passe par le service role
--     (server actions) via record_loyalty_stamp / consume_loyalty_spin_grant ;
--   · gestion commerçant (CRUD programmes/paliers) sous RLS is_org_editor,
--     lecture d'équipe (stats, caisse) sous is_org_member ;
--   · remise en caisse par RPC dédiée redeem_loyalty_reward (même contrat
--     que redeem_hunt_completion : atomique, auditée, org-scopée) ;
--   · purge RGPD : purge_expired_loyalty_members (à appeler par le cron
--     purge-data). Base sur la dernière activité (voir plus bas).
--
-- Intégration du tour de roue offert (« grant de spin ») :
--   un palier reward_type='spin' cible une roue de la MÊME organisation
--   (target_wheel_id). L'atteindre crée une ligne loyalty_rewards portant
--   un grant_token à usage unique. consume_loyalty_spin_grant échange ce
--   jeton contre EXACTEMENT un tirage atomique sur la roue cible — même
--   algorithme pondéré que perform_atomic_spin mais SANS la limite de jeu
--   par-fenêtre (le joueur a mérité ce spin). Le spin inséré (source
--   'loyalty') débouche sur le flux de gain normal : jeton HMAC signé côté
--   app → claim_winning_spin → participation + code GAIN-…. Le moteur
--   existant n'est pas modifié ; seule la valeur 'loyalty' s'ajoute à la
--   contrainte spins.source.
-- ============================================================

-- ── Addon d'organisation ─────────────────────────────────────
alter table public.organizations
  add column addon_loyalty boolean not null default false;

-- `organizations` utilise des grants de colonnes (00017) : une colonne
-- ajoutée ensuite n'est pas lisible automatiquement par authenticated.
grant select (addon_loyalty) on public.organizations to authenticated;

comment on column public.organizations.addon_loyalty is
  'Module Passeport de fidélité activé depuis le back-office (option payante, ou incluse dans un plan)';

-- ── Programmes de fidélité ───────────────────────────────────
create table public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  -- Mode de validation d'une visite (voir en-tête).
  validation_mode text not null default 'staff'
    check (validation_mode in ('rotating_code', 'staff')),
  -- Secret du code tournant (style TOTP). NE SORT JAMAIS côté client :
  -- exclu des grants de colonnes authenticated, lu par le service role
  -- uniquement (current_loyalty_code / record_loyalty_stamp). TOUJOURS
  -- rempli à l'insertion par le trigger loyalty_programs_set_secret
  -- (SECURITY DEFINER) — le marchand ne peut ni le lire ni le choisir, et
  -- l'insertion authenticated ne dépend pas d'un EXECUTE sur
  -- extensions.gen_random_bytes. Colonne laissée nullable pour une
  -- insertion sans ce champ (le trigger garantit la présence en pratique).
  rotating_secret bytea,
  -- Période de rotation du code (secondes) : de 15 s à 1 h.
  rotating_period_seconds integer not null default 60
    check (rotating_period_seconds between 15 and 3600),
  -- Cooldown anti-abus : au plus 1 tampon / membre / intervalle (0 = off,
  -- défaut 24 h). Filet contre les tampons répétés d'un même passeport.
  min_stamp_interval_seconds integer not null default 86400
    check (min_stamp_interval_seconds between 0 and 604800),
  -- Seuils de niveau (calque sur visit_count) : bronze = départ.
  silver_threshold integer not null default 5 check (silver_threshold >= 1),
  gold_threshold integer not null default 10 check (gold_threshold >= 1),
  created_at timestamptz not null default now(),
  check (gold_threshold > silver_threshold),
  -- Support des FK composites tenant (même modèle que hunts / contests).
  unique (id, organization_id)
);

comment on table public.loyalty_programs is
  'Programme de fidélité : cumul de visites, paliers (lot direct ou tour de roue offert), niveaux bronze/argent/or. Parcours joueur via RPC service role uniquement.';

create index loyalty_programs_org_idx on public.loyalty_programs (organization_id);

-- ── Paliers (récompenses par nombre de visites) ──────────────
create table public.loyalty_milestones (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Nombre de visites déclenchant le palier (unique par programme).
  visit_count integer not null check (visit_count between 1 and 1000),
  reward_type text not null check (reward_type in ('spin', 'lot')),
  -- reward_type='lot' : lot direct remis en caisse (code FIDELITE-…).
  reward_label text not null default ''
    check (char_length(btrim(reward_label)) <= 120),
  reward_details text
    check (reward_details is null or char_length(reward_details) <= 2000),
  -- Stock du lot (null = illimité) et compteur RPC-only des codes émis.
  reward_stock integer check (reward_stock is null or reward_stock >= 0),
  reward_claimed_count integer not null default 0 check (reward_claimed_count >= 0),
  -- reward_type='spin' : roue cible du tour offert (MÊME organisation,
  -- garanti par la FK composite ci-dessous).
  target_wheel_id uuid,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  -- Cohérence type ↔ champs : un lot n'a pas de roue, un spin en exige une.
  check (
    (reward_type = 'lot' and target_wheel_id is null)
    or (reward_type = 'spin' and target_wheel_id is not null)
  ),
  unique (program_id, visit_count),
  unique (id, organization_id),
  foreign key (program_id, organization_id)
    references public.loyalty_programs(id, organization_id) on delete cascade,
  -- Roue cible dans la MÊME organisation (anti cross-tenant : impossible
  -- d'offrir un spin sur la roue d'une autre org). MATCH SIMPLE : la FK
  -- n'est pas contrôlée quand target_wheel_id est null (paliers 'lot').
  -- NO ACTION (défaut) : bloque la suppression d'une roue encore ciblée
  -- SANS casser la suppression en cascade d'une organisation entière.
  foreign key (target_wheel_id, organization_id)
    references public.wheels(id, organization_id)
);

comment on table public.loyalty_milestones is
  'Palier d''un programme : à N visites, un lot (code FIDELITE-…) ou un tour de roue offert (grant de spin sur target_wheel_id).';

create index loyalty_milestones_org_idx on public.loyalty_milestones (organization_id);
create index loyalty_milestones_program_idx on public.loyalty_milestones (program_id);

-- ── Passeports (cookie HTTP-only, hash du jeton — aucune PII) ─
create table public.loyalty_members (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Hash SHA-256 du jeton remis au navigateur (miroir hunt_players).
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  visit_count integer not null default 0 check (visit_count >= 0),
  -- Niveau dérivé du visit_count, rafraîchi par record_loyalty_stamp à
  -- chaque tampon (RPC-only). La réponse de la RPC recalcule toujours le
  -- niveau depuis les seuils courants : la colonne peut être en léger
  -- retard si le commerçant vient de changer un seuil (rattrapé au tampon
  -- suivant) — dénormalisation assumée pour les stats.
  tier text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold')),
  last_stamp_at timestamptz,
  created_at timestamptz not null default now(),
  unique (program_id, token_hash),
  unique (id, program_id, organization_id),
  foreign key (program_id, organization_id)
    references public.loyalty_programs(id, organization_id) on delete cascade
);

comment on table public.loyalty_members is
  'Passeport d''un client, créé à sa première visite : hash de jeton uniquement, aucune donnée personnelle. visit_count et tier maintenus par record_loyalty_stamp.';

create index loyalty_members_org_idx on public.loyalty_members (organization_id);
create index loyalty_members_program_idx on public.loyalty_members (program_id);

-- ── Tampons (une visite validée) ─────────────────────────────
create table public.loyalty_stamps (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null,
  program_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stamped_at timestamptz not null default now(),
  -- Mode ayant validé la visite.
  mode text not null check (mode in ('rotating_code', 'staff')),
  -- Staff : user_id du membre de l'org ayant validé (null en mode
  -- rotating_code). Pas de FK vers auth.users (nettoyage des comptes
  -- indépendant de l'historique) — même approche que redeemed_by.
  validated_by uuid,
  foreign key (member_id, program_id, organization_id)
    references public.loyalty_members(id, program_id, organization_id) on delete cascade
);

comment on table public.loyalty_stamps is
  'Journal des visites validées. Pas d''unicité en base : l''anti-double repose sur le cooldown min_stamp_interval_seconds dans record_loyalty_stamp.';

create index loyalty_stamps_org_idx on public.loyalty_stamps (organization_id);
create index loyalty_stamps_member_idx on public.loyalty_stamps (member_id);
create index loyalty_stamps_program_idx on public.loyalty_stamps (program_id);

-- ── Récompenses de palier (miroir hunt_completions) ──────────
create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null,
  program_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  milestone_id uuid not null,
  reward_type text not null check (reward_type in ('spin', 'lot')),
  earned_at timestamptz not null default now(),
  -- reward_type='lot' : code de retrait présenté en caisse. Même alphabet
  -- que GAIN-/CHASSE-/PRONO- (sans I/O/0/1), préfixe distinct FIDELITE-.
  code text unique check (code is null or code ~ '^FIDELITE-[A-HJ-NP-Z2-9]{8}$'),
  redeemed_at timestamptz,
  redeemed_by text check (redeemed_by is null or char_length(redeemed_by) <= 120),
  -- reward_type='spin' : jeton de spin offert à usage unique (48 hex),
  -- échangé par consume_loyalty_spin_grant contre un tirage sur la roue.
  grant_token text unique check (grant_token is null or grant_token ~ '^[0-9a-f]{48}$'),
  consumed_at timestamptz,
  resulting_spin_id uuid references public.spins(id) on delete set null,
  -- Cohérence type ↔ capacité : un lot porte un code, un spin un grant.
  check (
    (reward_type = 'lot' and code is not null and grant_token is null)
    or (reward_type = 'spin' and grant_token is not null and code is null)
  ),
  -- Un palier gagné une seule fois par passeport.
  unique (member_id, milestone_id),
  foreign key (member_id, program_id, organization_id)
    references public.loyalty_members(id, program_id, organization_id) on delete cascade,
  foreign key (milestone_id, organization_id)
    references public.loyalty_milestones(id, organization_id) on delete cascade
);

comment on table public.loyalty_rewards is
  'Palier gagné : lot (code FIDELITE-… remis via redeem_loyalty_reward) ou spin offert (grant_token consommé via consume_loyalty_spin_grant → resulting_spin_id).';

create index loyalty_rewards_org_idx on public.loyalty_rewards (organization_id);
create index loyalty_rewards_member_idx on public.loyalty_rewards (member_id);
create index loyalty_rewards_program_idx on public.loyalty_rewards (program_id);

-- ── Source de spin « loyalty » ───────────────────────────────
-- Le tour offert insère un spin comme le flux normal, mais journalisé
-- distinctement pour ne pas polluer les stats direct/share et marquer un
-- spin hors limite de jeu. Contrainte additive (00013 : 'direct','share').
alter table public.spins drop constraint if exists spins_source_check;
alter table public.spins
  add constraint spins_source_check check (source in ('direct', 'share', 'loyalty'));

-- ── RLS et grants ────────────────────────────────────────────
alter table public.loyalty_programs enable row level security;
alter table public.loyalty_milestones enable row level security;
alter table public.loyalty_members enable row level security;
alter table public.loyalty_stamps enable row level security;
alter table public.loyalty_rewards enable row level security;

revoke all on table public.loyalty_programs from public, anon, authenticated;
revoke all on table public.loyalty_milestones from public, anon, authenticated;
revoke all on table public.loyalty_members from public, anon, authenticated;
revoke all on table public.loyalty_stamps from public, anon, authenticated;
revoke all on table public.loyalty_rewards from public, anon, authenticated;

-- Gestion (CRUD programmes/paliers) : owners/editors. Lecture d'équipe
-- (stats dashboard, caisse) : tous les membres.
create policy "loyalty_programs: member select" on public.loyalty_programs
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "loyalty_programs: editor write" on public.loyalty_programs
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "loyalty_milestones: member select" on public.loyalty_milestones
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "loyalty_milestones: editor write" on public.loyalty_milestones
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- Données joueurs : lecture d'équipe, écritures service role uniquement.
create policy "loyalty_members: member select" on public.loyalty_members
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "loyalty_stamps: member select" on public.loyalty_stamps
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "loyalty_rewards: member select" on public.loyalty_rewards
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Programmes : le SECRET du code tournant n'est jamais lisible ni écrit
-- par une session marchande — grants de colonnes explicites (rotating_secret
-- absent). Généré par le DEFAULT à l'insertion, lu par le service role seul.
grant select (id, organization_id, name, status, validation_mode,
              rotating_period_seconds, min_stamp_interval_seconds,
              silver_threshold, gold_threshold, created_at)
  on public.loyalty_programs to authenticated;
grant insert (organization_id, name, status, validation_mode,
              rotating_period_seconds, min_stamp_interval_seconds,
              silver_threshold, gold_threshold)
  on public.loyalty_programs to authenticated;
grant update (name, status, validation_mode, rotating_period_seconds,
              min_stamp_interval_seconds, silver_threshold, gold_threshold)
  on public.loyalty_programs to authenticated;
grant delete on public.loyalty_programs to authenticated;

-- Paliers : CRUD marchand, sauf le compteur de codes émis (RPC-only).
grant select, insert, delete on table public.loyalty_milestones to authenticated;
grant update (visit_count, reward_type, reward_label, reward_details,
              reward_stock, target_wheel_id, position)
  on public.loyalty_milestones to authenticated;

-- Données joueurs : lecture seule côté marchand.
grant select on table public.loyalty_members to authenticated;
grant select on table public.loyalty_stamps to authenticated;
grant select on table public.loyalty_rewards to authenticated;

grant select, insert, update, delete on table public.loyalty_programs to service_role;
grant select, insert, update, delete on table public.loyalty_milestones to service_role;
grant select, insert, update, delete on table public.loyalty_members to service_role;
grant select, insert, update, delete on table public.loyalty_stamps to service_role;
grant select, insert, update, delete on table public.loyalty_rewards to service_role;

-- Secret du code tournant généré côté serveur (jamais fourni par le
-- marchand). BEFORE INSERT SECURITY DEFINER : s'exécute comme le
-- propriétaire, indépendamment de l'EXECUTE de l'appelant sur pgcrypto, et
-- garantit un secret non choisi. N'écrase pas un secret fourni par le
-- service role (fixtures de test déterministes).
create or replace function public.loyalty_programs_set_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rotating_secret is null then
    new.rotating_secret := extensions.gen_random_bytes(32);
  end if;
  return new;
end;
$$;

revoke all on function public.loyalty_programs_set_secret()
  from public, anon, authenticated;

create trigger loyalty_programs_set_secret
  before insert on public.loyalty_programs
  for each row execute function public.loyalty_programs_set_secret();

-- Mutations commerçant auditées, comme campagnes/roues/lots/chasses (00019).
create trigger loyalty_programs_merchant_audit
  after insert or update or delete on public.loyalty_programs
  for each row execute function public.audit_merchant_mutation();
create trigger loyalty_milestones_merchant_audit
  after insert or update or delete on public.loyalty_milestones
  for each row execute function public.audit_merchant_mutation();

-- ── RPC service role : code tournant courant (écran comptoir) ─
-- Calcule le code type TOTP en vigueur pour l'affichage marchand. Le code
-- change toutes les rotating_period_seconds ; fenêtre courante
-- [floor(epoch/period)·period, +period). Appelée par le backend
-- (server action authentifiée du commerçant), JAMAIS exposée à l'anon.
create or replace function public.current_loyalty_code(p_program_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret bytea;
  v_period integer;
  v_mode text;
  v_counter bigint;
  v_mac bytea;
  v_off integer;
  v_bin bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select p.rotating_secret, p.rotating_period_seconds, p.validation_mode
    into v_secret, v_period, v_mode
    from public.loyalty_programs p
   where p.id = p_program_id;
  if not found or v_mode <> 'rotating_code' then
    return null;
  end if;

  v_counter := pg_catalog.floor(extract(epoch from pg_catalog.now()) / v_period)::bigint;
  -- HOTP/TOTP (RFC 4226/6238) : HMAC-SHA1 du compteur 8 octets big-endian,
  -- troncature dynamique, code décimal à 6 chiffres.
  v_mac := extensions.hmac(pg_catalog.int8send(v_counter), v_secret, 'sha1');
  v_off := pg_catalog.get_byte(v_mac, 19) & 15;
  v_bin := ((pg_catalog.get_byte(v_mac, v_off) & 127)::bigint * 16777216)
         + (pg_catalog.get_byte(v_mac, v_off + 1)::bigint * 65536)
         + (pg_catalog.get_byte(v_mac, v_off + 2)::bigint * 256)
         + (pg_catalog.get_byte(v_mac, v_off + 3)::bigint);
  return pg_catalog.lpad((v_bin % 1000000)::text, 6, '0');
end;
$$;

revoke all on function public.current_loyalty_code(uuid)
  from public, anon, authenticated;
grant execute on function public.current_loyalty_code(uuid) to service_role;

-- ── RPC service role : enregistrer un tampon ─────────────────
-- TOUT dans une transaction : résolution programme→org, droits (addon +
-- statut), mode de validation, création du passeport à la 1re visite,
-- cooldown, incrément, recalcul du niveau, détection des paliers NOUVEAU
-- atteints, création des récompenses (lot → code FIDELITE-… + stock ;
-- spin → grant_token). Le verrou sur le programme sérialise l'attribution
-- des lots (stock) — même approche que record_hunt_scan sur la chasse.
--
-- Mode piloté par le PROGRAMME (validation_mode), pas par l'appelant :
--   · rotating_code : p_rotating_code recalculé et comparé (fenêtre ±1
--     période). p_validated_by ignoré.
--   · staff : p_validated_by OBLIGATOIRE (identité du staff). C'est
--     l'action backend qui garantit que cet appelant est bien un membre
--     autorisé (owner/editor/cashier) AVANT d'appeler avec le service
--     role — la RPC refuse un tampon staff sans validateur (ferme le
--     chemin public sur un programme staff).
--
-- Réponse jsonb :
--   state: 'unavailable' | 'invalid_code' | 'too_soon' | 'stamped'
--   program: { id, name, validation_mode }        (sauf unavailable)
--   visit_count, tier, tier_thresholds            (dès qu'un passeport existe)
--   milestones_reached: [{ milestone_id, visit_count, reward_type,
--       lot: reward_label/reward_details/code | out_of_stock,
--       spin: target_wheel_id/grant_token }]      (paliers de ce tour)
--   next_milestone: { visit_count, reward_type } | null
--   retry_in_seconds                              (too_soon)
create or replace function public.record_loyalty_stamp(
  p_program_id uuid,
  p_member_token_hash text,
  p_rotating_code text default null,
  p_validated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.loyalty_programs%rowtype;
  v_member public.loyalty_members%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_code_in text;
  v_counter bigint;
  v_mac bytea;
  v_off integer;
  v_bin bigint;
  v_ok boolean;
  d integer;
  v_new_count integer;
  v_tier text;
  v_reached jsonb := '[]'::jsonb;
  v_ms public.loyalty_milestones%rowtype;
  v_next_visit integer;
  v_next_type text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_grant text;
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_member_token_hash is null or p_member_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member token';
  end if;

  -- Verrou sur le programme : fige réglages, stock des paliers et sérialise
  -- l'attribution des lots. Réponse 'unavailable' identique quel que soit
  -- le motif (addon coupé, brouillon, archivé) : pas d'oracle.
  select p.* into v_prog
    from public.loyalty_programs p
    join public.organizations o on o.id = p.organization_id
   where p.id = p_program_id
     and o.addon_loyalty
   for update of p;
  if not found or v_prog.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Validation selon le mode du programme (AVANT toute création de
  -- passeport : un code invalide n'inscrit personne).
  if v_prog.validation_mode = 'rotating_code' then
    v_code_in := pg_catalog.regexp_replace(coalesce(p_rotating_code, ''), '\D', '', 'g');
    if pg_catalog.length(v_code_in) <> 6 then
      return pg_catalog.jsonb_build_object('state', 'invalid_code');
    end if;
    v_counter := pg_catalog.floor(extract(epoch from v_now) / v_prog.rotating_period_seconds)::bigint;
    v_ok := false;
    -- Tolérance ±1 période (dérive d'horloge).
    for d in -1..1 loop
      v_mac := extensions.hmac(pg_catalog.int8send(v_counter + d), v_prog.rotating_secret, 'sha1');
      v_off := pg_catalog.get_byte(v_mac, 19) & 15;
      v_bin := ((pg_catalog.get_byte(v_mac, v_off) & 127)::bigint * 16777216)
             + (pg_catalog.get_byte(v_mac, v_off + 1)::bigint * 65536)
             + (pg_catalog.get_byte(v_mac, v_off + 2)::bigint * 256)
             + (pg_catalog.get_byte(v_mac, v_off + 3)::bigint);
      if pg_catalog.lpad((v_bin % 1000000)::text, 6, '0') = v_code_in then
        v_ok := true;
        exit;
      end if;
    end loop;
    if not v_ok then
      return pg_catalog.jsonb_build_object('state', 'invalid_code');
    end if;
  else
    -- Mode staff : l'appelant DOIT fournir l'identité du validateur
    -- (l'action backend l'a authentifié comme membre autorisé). Ferme le
    -- chemin public (p_validated_by null) sur un programme staff.
    if p_validated_by is null then
      return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;
  end if;

  -- Passeport créé à la première visite (aucune PII).
  insert into public.loyalty_members (program_id, organization_id, token_hash)
  values (v_prog.id, v_prog.organization_id, p_member_token_hash)
  on conflict (program_id, token_hash) do nothing;
  select m.* into v_member
    from public.loyalty_members m
   where m.program_id = v_prog.id and m.token_hash = p_member_token_hash
   for update;

  -- Cooldown depuis le dernier tampon (anti-abus).
  if v_member.last_stamp_at is not null
     and v_prog.min_stamp_interval_seconds > 0
     and v_member.last_stamp_at
         + pg_catalog.make_interval(secs => v_prog.min_stamp_interval_seconds) > v_now then
    return pg_catalog.jsonb_build_object(
      'state', 'too_soon',
      'retry_in_seconds', pg_catalog.ceil(extract(epoch from
        v_member.last_stamp_at
        + pg_catalog.make_interval(secs => v_prog.min_stamp_interval_seconds)
        - v_now))::integer,
      'program', pg_catalog.jsonb_build_object(
        'id', v_prog.id, 'name', v_prog.name,
        'validation_mode', v_prog.validation_mode),
      'visit_count', v_member.visit_count,
      'tier', case
        when v_member.visit_count >= v_prog.gold_threshold then 'gold'
        when v_member.visit_count >= v_prog.silver_threshold then 'silver'
        else 'bronze' end,
      'tier_thresholds', pg_catalog.jsonb_build_object(
        'silver', v_prog.silver_threshold, 'gold', v_prog.gold_threshold)
    );
  end if;

  -- Visite validée : incrément + recalcul du niveau + tampon.
  v_new_count := v_member.visit_count + 1;
  v_tier := case
    when v_new_count >= v_prog.gold_threshold then 'gold'
    when v_new_count >= v_prog.silver_threshold then 'silver'
    else 'bronze' end;
  update public.loyalty_members
     set visit_count = v_new_count, last_stamp_at = v_now, tier = v_tier
   where id = v_member.id;
  insert into public.loyalty_stamps
    (member_id, program_id, organization_id, stamped_at, mode, validated_by)
  values (v_member.id, v_prog.id, v_prog.organization_id, v_now,
          v_prog.validation_mode, p_validated_by);

  -- Paliers nouvellement atteints (visit_count <= total ET pas déjà gagnés).
  -- Sous le verrou du programme : l'attribution des lots (code + stock) est
  -- sérialisée, sans double émission.
  for v_ms in
    select ms.* from public.loyalty_milestones ms
     where ms.program_id = v_prog.id
       and ms.visit_count <= v_new_count
       and not exists (
         select 1 from public.loyalty_rewards r
          where r.member_id = v_member.id and r.milestone_id = ms.id
       )
     order by ms.visit_count
  loop
    if v_ms.reward_type = 'lot' then
      -- Stock épuisé : signalé, aucune récompense créée (échec propre).
      if v_ms.reward_stock is not null
         and v_ms.reward_claimed_count >= v_ms.reward_stock then
        v_reached := v_reached || pg_catalog.jsonb_build_object(
          'milestone_id', v_ms.id, 'visit_count', v_ms.visit_count,
          'reward_type', 'lot', 'out_of_stock', true,
          'reward_label', v_ms.reward_label);
        continue;
      end if;
      v_code := null;
      for attempt in 1..8 loop
        v_bytes := extensions.gen_random_bytes(8);
        v_code := 'FIDELITE-';
        for i in 0..7 loop
          v_code := v_code || pg_catalog.substr(
            v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
        end loop;
        begin
          insert into public.loyalty_rewards
            (member_id, program_id, organization_id, milestone_id,
             reward_type, code, earned_at)
          values (v_member.id, v_prog.id, v_prog.organization_id, v_ms.id,
                  'lot', v_code, v_now);
          exit;
        exception when unique_violation then
          -- Collision de code (le verrou programme exclut un double palier).
          v_code := null;
        end;
      end loop;
      if v_code is null then
        raise exception 'code generation exhausted';
      end if;
      update public.loyalty_milestones
         set reward_claimed_count = reward_claimed_count + 1
       where id = v_ms.id;
      v_reached := v_reached || pg_catalog.jsonb_build_object(
        'milestone_id', v_ms.id, 'visit_count', v_ms.visit_count,
        'reward_type', 'lot', 'code', v_code,
        'reward_label', v_ms.reward_label, 'reward_details', v_ms.reward_details);
    else
      -- Tour de roue offert : grant_token à usage unique.
      v_grant := null;
      for attempt in 1..8 loop
        v_grant := pg_catalog.encode(extensions.gen_random_bytes(24), 'hex');
        begin
          insert into public.loyalty_rewards
            (member_id, program_id, organization_id, milestone_id,
             reward_type, grant_token, earned_at)
          values (v_member.id, v_prog.id, v_prog.organization_id, v_ms.id,
                  'spin', v_grant, v_now);
          exit;
        exception when unique_violation then
          v_grant := null;
        end;
      end loop;
      if v_grant is null then
        raise exception 'grant generation exhausted';
      end if;
      v_reached := v_reached || pg_catalog.jsonb_build_object(
        'milestone_id', v_ms.id, 'visit_count', v_ms.visit_count,
        'reward_type', 'spin', 'target_wheel_id', v_ms.target_wheel_id,
        'grant_token', v_grant);
    end if;
  end loop;

  -- Prochain palier (le plus proche strictement au-dessus).
  select ms.visit_count, ms.reward_type into v_next_visit, v_next_type
    from public.loyalty_milestones ms
   where ms.program_id = v_prog.id and ms.visit_count > v_new_count
   order by ms.visit_count
   limit 1;

  return pg_catalog.jsonb_build_object(
    'state', 'stamped',
    'program', pg_catalog.jsonb_build_object(
      'id', v_prog.id, 'name', v_prog.name,
      'validation_mode', v_prog.validation_mode),
    'visit_count', v_new_count,
    'tier', v_tier,
    'tier_thresholds', pg_catalog.jsonb_build_object(
      'silver', v_prog.silver_threshold, 'gold', v_prog.gold_threshold),
    'milestones_reached', v_reached,
    'next_milestone', case when v_next_visit is null then null
      else pg_catalog.jsonb_build_object(
        'visit_count', v_next_visit, 'reward_type', v_next_type) end
  );
end;
$$;

revoke all on function public.record_loyalty_stamp(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_loyalty_stamp(uuid, text, text, uuid)
  to service_role;

-- ── RPC service role : consommer un tour de roue offert ──────
-- Échange un grant_token à usage unique contre EXACTEMENT un tirage
-- atomique sur target_wheel_id. Tirage pondéré identique à
-- perform_atomic_spin (réservation de stock incluse) mais SANS la limite
-- de jeu par-fenêtre : le joueur a mérité ce spin. Anti-rejeu : le verrou
-- FOR UPDATE sur la ligne loyalty_rewards sérialise la consommation ; un
-- second appel voit consumed_at et renvoie 'already_consumed'.
--
-- Le spin inséré (source 'loyalty') débouche sur le flux de gain normal :
-- le backend signe un jeton HMAC sur spin_id → claim_winning_spin →
-- participation + code GAIN-…. Réponse jsonb :
--   state: 'unavailable' | 'already_consumed' | 'no_prize' | 'spun'
--   spin_id, wheel_id, prize_id, is_losing                (spun)
create or replace function public.consume_loyalty_spin_grant(
  p_program_id uuid,
  p_member_token_hash text,
  p_grant_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward public.loyalty_rewards%rowtype;
  v_wheel_id uuid;
  v_campaign_id uuid;
  v_org_id uuid;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_member_token_hash is null or p_member_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member token';
  end if;

  -- Grant résolu ET lié au passeport appelant (défense en profondeur : un
  -- grant_token seul, sans le cookie du membre, ne suffit pas). Verrou de
  -- ligne : anti-rejeu.
  select r.* into v_reward
    from public.loyalty_rewards r
    join public.loyalty_members m
      on m.id = r.member_id
     and m.program_id = r.program_id
     and m.organization_id = r.organization_id
   where r.program_id = p_program_id
     and r.reward_type = 'spin'
     and r.grant_token = pg_catalog.btrim(coalesce(p_grant_token, ''))
     and m.token_hash = p_member_token_hash
   for update of r;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_reward.consumed_at is not null then
    return pg_catalog.jsonb_build_object(
      'state', 'already_consumed', 'spin_id', v_reward.resulting_spin_id);
  end if;

  -- Roue cible (garantie même organisation par la FK du palier).
  select ms.target_wheel_id into v_wheel_id
    from public.loyalty_milestones ms where ms.id = v_reward.milestone_id;
  select w.id, w.campaign_id, w.organization_id
    into v_wheel_id, v_campaign_id, v_org_id
    from public.wheels w where w.id = v_wheel_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Tirage pondéré atomique (même algorithme que perform_atomic_spin,
  -- SANS contrôle de fenêtre de jeu). Réserve le stock du lot tiré.
  loop
    select coalesce(sum(p.weight), 0)::bigint into v_total
      from public.prizes p
     where p.wheel_id = v_wheel_id and p.organization_id = v_org_id
       and p.is_active and p.weight > 0
       and (p.is_losing or p.stock is null or p.stock > 0);
    if v_total <= 0 then
      -- Aucun lot disponible : le grant reste NON consommé (rejouable
      -- quand le commerçant réapprovisionne).
      return pg_catalog.jsonb_build_object('state', 'no_prize');
    end if;

    v_random := extensions.gen_random_bytes(4);
    v_pick := mod(
      (pg_catalog.get_byte(v_random, 0)::bigint * 16777216
       + pg_catalog.get_byte(v_random, 1)::bigint * 65536
       + pg_catalog.get_byte(v_random, 2)::bigint * 256
       + pg_catalog.get_byte(v_random, 3)::bigint),
      v_total
    );
    select q.* into v_prize from (
      select p.*, sum(p.weight) over(order by p.position, p.created_at, p.id) as ceiling
        from public.prizes p
       where p.wheel_id = v_wheel_id and p.organization_id = v_org_id
         and p.is_active and p.weight > 0 and (p.is_losing or p.stock is null or p.stock > 0)
    ) q where q.ceiling > v_pick order by q.ceiling limit 1;

    if v_prize.is_losing or v_prize.stock is null then exit; end if;
    update public.prizes set stock = stock - 1
      where id = v_prize.id and stock > 0;
    if found then exit; end if;
  end loop;

  insert into public.spins(
    organization_id, campaign_id, wheel_id, prize_id, is_losing,
    player_key, engagement_action, source, play_window_key
  ) values (
    v_org_id, v_campaign_id, v_wheel_id,
    case when v_prize.is_losing then null else v_prize.id end,
    v_prize.is_losing, p_member_token_hash, null, 'loyalty', null
  ) returning id into v_spin_id;

  -- Grant consommé (une seule fois) → spin résultant journalisé.
  update public.loyalty_rewards
     set consumed_at = pg_catalog.now(), resulting_spin_id = v_spin_id
   where id = v_reward.id;

  return pg_catalog.jsonb_build_object(
    'state', 'spun',
    'spin_id', v_spin_id,
    'wheel_id', v_wheel_id,
    'prize_id', case when v_prize.is_losing then null else v_prize.id end,
    'is_losing', v_prize.is_losing
  );
end;
$$;

revoke all on function public.consume_loyalty_spin_grant(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_loyalty_spin_grant(uuid, text, text)
  to service_role;

-- ── RPC caisse : remise d'un lot de fidélité ─────────────────
-- Miroir de redeem_hunt_completion : recherche + validation + audit
-- atomiques, actor obligatoire, org-scopée (code inconnu, déjà remis ou
-- d'une autre organisation → aucune remise, réponse indistinguable). Ne
-- traite QUE les paliers 'lot' (code FIDELITE-…) ; les paliers 'spin' se
-- réclament par le flux de roue normal (code GAIN-…). Le préfixe distinct
-- FIDELITE- permet au backend de router la caisse (source 'loyalty').
create or replace function public.redeem_loyalty_reward(
  p_organization_id uuid,
  p_code text,
  p_actor text
)
returns table(
  id uuid, earned_at timestamptz, code text, redeemed_at timestamptz,
  program_name text, reward_label text, reward_details text,
  redeemed_now boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_actor is null or length(p_actor) = 0 then
    raise exception 'actor required';
  end if;

  update public.loyalty_rewards r
     set redeemed_at = now(),
         redeemed_by = p_actor
   where r.organization_id = p_organization_id
     and r.reward_type = 'lot'
     and r.code = upper(btrim(p_code))
     and r.redeemed_at is null
  returning r.id into v_id;

  if v_id is not null then
    insert into public.audit_logs(organization_id, actor, action, metadata)
    values (p_organization_id, p_actor, 'loyalty.redeem',
            pg_catalog.jsonb_build_object('reward_id', v_id));
  end if;

  return query
  select r.id, r.earned_at, r.code, r.redeemed_at,
         pr.name, ms.reward_label, ms.reward_details, (v_id is not null)
    from public.loyalty_rewards r
    join public.loyalty_milestones ms on ms.id = r.milestone_id
    join public.loyalty_programs pr on pr.id = r.program_id
   where r.organization_id = p_organization_id
     and r.reward_type = 'lot'
     and r.code = upper(btrim(p_code))
   limit 1;
end;
$$;

revoke all on function public.redeem_loyalty_reward(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_loyalty_reward(uuid, text, text)
  to service_role;

-- ── Purge RGPD ───────────────────────────────────────────────
-- Miroir de purge_expired_hunt_players : la suppression des passeports
-- cascade vers leurs tampons et récompenses. À appeler par le cron
-- /api/cron/purge-data, à côté des purges existantes.
--
-- Divergence assumée : la borne est la DERNIÈRE ACTIVITÉ
-- (coalesce(last_stamp_at, created_at)) et non created_at. Un programme de
-- fidélité vit dans la durée — purger un client encore actif sur son seul
-- ancienneté d'inscription contredirait l'objet du module. On ne purge
-- donc que les passeports DORMANTS au-delà de la rétention choisie.
create or replace function public.purge_expired_loyalty_members()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.loyalty_members m
  using public.organizations o
  where m.organization_id = o.id
    and o.data_retention_months is not null
    and coalesce(m.last_stamp_at, m.created_at) < pg_catalog.now()
      - pg_catalog.make_interval(months => o.data_retention_months);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_loyalty_members()
  from public, anon, authenticated;
grant execute on function public.purge_expired_loyalty_members()
  to service_role;
