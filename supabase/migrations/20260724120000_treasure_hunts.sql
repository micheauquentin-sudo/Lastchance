-- ============================================================
-- Lastchance — Module « Chasse au trésor multi-QR »
--
-- Addon d'organisation (miroir exact d'addon_pronostics, 00022/00023) :
-- le commerçant dispose 2 à 10 QR codes (étapes) dans son commerce ou
-- son quartier ; le client les scanne (ordre libre ou imposé, fenêtre
-- de dates optionnelle, délai minimal anti-partage de photos) et, la
-- dernière étape tamponnée, reçoit un code de retrait à présenter en
-- caisse (lot direct, stock optionnel — pas de roue).
--
-- Sécurité : même modèle que Pronostics —
--   · identité joueur = cookie HTTP-only côté app, seul le hash SHA-256
--     du jeton touche la base (aucune PII à l'inscription) ;
--   · AUCUN droit anon : le parcours public passe par le service role
--     (server actions) via la RPC atomique record_hunt_scan ;
--   · gestion commerçant (CRUD chasses/étapes) sous RLS is_org_editor,
--     lecture d'équipe (stats, caisse) sous is_org_member ;
--   · remise en caisse par RPC dédiée redeem_hunt_completion (même
--     contrat que redeem_by_code : atomique, auditée, org-scopée) ;
--   · purge RGPD : purge_expired_hunt_players, miroir de
--     purge_expired_contest_players (à appeler par le cron purge-data).
-- ============================================================

-- ── Addon d'organisation ─────────────────────────────────────
alter table public.organizations
  add column addon_hunts boolean not null default false;

-- `organizations` utilise des grants de colonnes (00017) : une colonne
-- ajoutée ensuite n'est pas lisible automatiquement par authenticated.
grant select (addon_hunts) on public.organizations to authenticated;

comment on column public.organizations.addon_hunts is
  'Module Chasse au trésor activé depuis le back-office (option payante, ou incluse dans un plan)';

-- ── Chasses ──────────────────────────────────────────────────
create table public.hunts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  -- Fenêtre de visibilité optionnelle (null = sans borne).
  starts_at timestamptz,
  ends_at timestamptz,
  -- Ordre des étapes : libre, ou imposé (l'étape attendue est la
  -- première position non tamponnée du joueur).
  order_mode text not null default 'free'
    check (order_mode in ('free', 'ordered')),
  -- Délai minimal entre deux scans d'un même joueur (anti-partage de
  -- photos des QR ; 0 = désactivé, plafonné à 24 h).
  min_scan_interval_seconds integer not null default 0
    check (min_scan_interval_seconds between 0 and 86400),
  -- Récompense finale : lot direct remis en caisse (pas de roue).
  reward_label text not null default ''
    check (char_length(btrim(reward_label)) <= 120),
  reward_details text
    check (reward_details is null or char_length(reward_details) <= 2000),
  -- Stock du lot (null = illimité) et compteur RPC-only des codes émis.
  reward_stock integer check (reward_stock is null or reward_stock >= 0),
  reward_claimed_count integer not null default 0
    check (reward_claimed_count >= 0),
  created_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or starts_at < ends_at),
  -- Support des FK composites tenant (même modèle que contests, 00023).
  unique (id, organization_id)
);

comment on table public.hunts is
  'Chasse au trésor multi-QR : 2 à 10 étapes, ordre libre ou imposé, lot final avec code de retrait. Parcours joueur via RPC service role uniquement.';

create index hunts_org_idx on public.hunts (organization_id);

-- ── Étapes (une étape = un QR code) ──────────────────────────
create table public.hunt_steps (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- 2 à 10 étapes en V1 (minimum vérifié à l'activation côté app).
  position integer not null check (position between 1 and 10),
  label text not null check (char_length(btrim(label)) between 1 and 120),
  -- Indice optionnel révélé une fois l'étape tamponnée.
  hint_text text check (hint_text is null or char_length(hint_text) <= 500),
  -- Jeton public de l'URL du QR : non devinable, généré côté app comme
  -- les slugs/jetons publics existants (randomCode, src/lib/utils.ts).
  token text not null unique check (token ~ '^[A-Za-z0-9-]{8,64}$'),
  created_at timestamptz not null default now(),
  unique (hunt_id, position),
  unique (id, hunt_id, organization_id),
  foreign key (hunt_id, organization_id)
    references public.hunts(id, organization_id) on delete cascade
);

comment on table public.hunt_steps is
  'Étapes d''une chasse : une position unique par chasse, un jeton public non devinable (URL du QR), un indice optionnel révélé après scan.';

create index hunt_steps_org_idx on public.hunt_steps (organization_id);

-- ── Joueurs (cookie HTTP-only, hash du jeton — aucune PII) ───
create table public.hunt_players (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Hash SHA-256 du jeton remis au navigateur (miroir contest_players).
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (hunt_id, token_hash),
  unique (id, hunt_id, organization_id),
  foreign key (hunt_id, organization_id)
    references public.hunts(id, organization_id) on delete cascade
);

comment on table public.hunt_players is
  'Joueurs d''une chasse, créés au premier scan : hash de jeton uniquement, aucune donnée personnelle à l''inscription.';

create index hunt_players_org_idx on public.hunt_players (organization_id);

-- ── Scans (un tampon par joueur et par étape) ────────────────
create table public.hunt_scans (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null,
  step_id uuid not null,
  scanned_at timestamptz not null default now(),
  unique (player_id, step_id),
  -- Intégrité inter-tenant ET intra-chasse : un scan ne peut relier que
  -- un joueur et une étape de la MÊME chasse de la MÊME organisation.
  foreign key (player_id, hunt_id, organization_id)
    references public.hunt_players(id, hunt_id, organization_id) on delete cascade,
  foreign key (step_id, hunt_id, organization_id)
    references public.hunt_steps(id, hunt_id, organization_id) on delete cascade
);

comment on table public.hunt_scans is
  'Tampons du carnet de chasse : unique par joueur et par étape (le re-scan est idempotent dans record_hunt_scan).';

create index hunt_scans_org_idx on public.hunt_scans (organization_id);
create index hunt_scans_hunt_idx on public.hunt_scans (hunt_id);
create index hunt_scans_step_idx on public.hunt_scans (step_id);

-- ── Complétions (code de retrait du lot final) ───────────────
create table public.hunt_completions (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null,
  -- Même convention que les codes de participation (GAIN-…) et de
  -- récompense pronostics (PRONO-…) : alphabet sans I/O/0/1.
  code text not null unique check (code ~ '^CHASSE-[A-HJ-NP-Z2-9]{8}$'),
  -- Renseignés plus tard par le backend au moment du claim (opt-in),
  -- comme sur participations.
  email text check (email is null or char_length(email) <= 254),
  marketing_opt_in boolean not null default false,
  completed_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by text check (redeemed_by is null or char_length(redeemed_by) <= 120),
  -- Une seule complétion par joueur (le joueur est propre à SA chasse).
  unique (player_id, hunt_id, organization_id),
  foreign key (player_id, hunt_id, organization_id)
    references public.hunt_players(id, hunt_id, organization_id) on delete cascade
);

comment on table public.hunt_completions is
  'Chasse terminée : code de retrait unique (CHASSE-XXXXXXXX) remis en caisse via redeem_hunt_completion, email optionnel ajouté au claim.';

create index hunt_completions_org_idx on public.hunt_completions (organization_id);
create index hunt_completions_hunt_idx on public.hunt_completions (hunt_id);

-- ── RLS et grants ────────────────────────────────────────────
alter table public.hunts enable row level security;
alter table public.hunt_steps enable row level security;
alter table public.hunt_players enable row level security;
alter table public.hunt_scans enable row level security;
alter table public.hunt_completions enable row level security;

revoke all on table public.hunts from public, anon, authenticated;
revoke all on table public.hunt_steps from public, anon, authenticated;
revoke all on table public.hunt_players from public, anon, authenticated;
revoke all on table public.hunt_scans from public, anon, authenticated;
revoke all on table public.hunt_completions from public, anon, authenticated;

-- Gestion (CRUD chasses/étapes) : owners/editors, comme les campagnes.
-- Lecture d'équipe (stats dashboard, caisse) : tous les membres.
create policy "hunts: member select" on public.hunts
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "hunts: editor write" on public.hunts
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "hunt_steps: member select" on public.hunt_steps
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "hunt_steps: editor write" on public.hunt_steps
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- Données joueurs : lecture d'équipe, écritures service role uniquement
-- (record_hunt_scan / redeem_hunt_completion).
create policy "hunt_players: member select" on public.hunt_players
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "hunt_scans: member select" on public.hunt_scans
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "hunt_completions: member select" on public.hunt_completions
  for select to authenticated
  using (public.is_org_member(organization_id));

grant select, insert, delete on table public.hunts to authenticated;
-- Le compteur de codes émis n'est modifiable que par la RPC atomique.
grant update (name, status, starts_at, ends_at, order_mode,
              min_scan_interval_seconds, reward_label, reward_details,
              reward_stock)
  on public.hunts to authenticated;
grant select, insert, update, delete on table public.hunt_steps to authenticated;
grant select on table public.hunt_players to authenticated;
grant select on table public.hunt_scans to authenticated;
grant select on table public.hunt_completions to authenticated;

grant select, insert, update, delete on table public.hunts to service_role;
grant select, insert, update, delete on table public.hunt_steps to service_role;
grant select, insert, update, delete on table public.hunt_players to service_role;
grant select, insert, update, delete on table public.hunt_scans to service_role;
grant select, insert, update, delete on table public.hunt_completions to service_role;

-- Mutations commerçant auditées, comme campagnes/roues/lots/QR (00019).
create trigger hunts_merchant_audit
  after insert or update or delete on public.hunts
  for each row execute function public.audit_merchant_mutation();
create trigger hunt_steps_merchant_audit
  after insert or update or delete on public.hunt_steps
  for each row execute function public.audit_merchant_mutation();

-- ── RPC publique atomique : enregistrer un scan ──────────────
-- TOUT dans une transaction : résolution étape→chasse→organisation,
-- droits (addon + statut + fenêtre), création du joueur au premier
-- scan, délai minimal, ordre imposé, tampon idempotent, et complétion
-- (code + stock) quand toutes les étapes sont tamponnées. Le verrou
-- sur la chasse sérialise l'attribution du lot final (stock) — même
-- approche que submit_contest_prediction (verrou contest + match).
--
-- Réponse jsonb :
--   state: 'unavailable' | 'too_soon' | 'wrong_order' | 'scanned'
--        | 'already' | 'completed' | 'hunt_full'
--   hunt: { id, name, order_mode, reward_label }   (sauf unavailable)
--   step: { position, label [, hint] }             (hint une fois tamponnée)
--   progress: { done, total } · stamped: [positions tamponnées]
--   retry_in_seconds (too_soon) · expected_position (wrong_order)
--   code + already (completed)
create or replace function public.record_hunt_scan(
  p_step_token text,
  p_player_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step public.hunt_steps%rowtype;
  v_hunt public.hunts%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_player_id uuid;
  v_total integer;
  v_done integer;
  v_positions jsonb;
  v_already boolean;
  v_last_scan timestamptz;
  v_expected integer;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  select s.* into v_step
    from public.hunt_steps s
   where s.token = pg_catalog.btrim(coalesce(p_step_token, ''));
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Verrou sur la chasse : fige réglages et stock pendant le scan.
  -- Réponse identique quel que soit le motif (addon coupé, brouillon,
  -- archivée, hors fenêtre) : pas d'oracle sur l'état interne.
  select h.* into v_hunt
    from public.hunts h
    join public.organizations o on o.id = h.organization_id
   where h.id = v_step.hunt_id
     and o.addon_hunts
   for update of h;
  if not found
     or v_hunt.status <> 'active'
     or (v_hunt.starts_at is not null and v_hunt.starts_at > v_now)
     or (v_hunt.ends_at is not null and v_hunt.ends_at <= v_now) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select count(*)::integer into v_total
    from public.hunt_steps s where s.hunt_id = v_hunt.id;

  -- Joueur créé au premier scan (aucune PII).
  insert into public.hunt_players (hunt_id, organization_id, token_hash)
  values (v_hunt.id, v_hunt.organization_id, p_player_token_hash)
  on conflict (hunt_id, token_hash) do nothing;
  select p.id into v_player_id
    from public.hunt_players p
   where p.hunt_id = v_hunt.id and p.token_hash = p_player_token_hash;

  select count(*)::integer,
         coalesce(pg_catalog.jsonb_agg(s.position order by s.position), '[]'::jsonb)
    into v_done, v_positions
    from public.hunt_scans sc
    join public.hunt_steps s on s.id = sc.step_id
   where sc.player_id = v_player_id;

  -- Chasse déjà complétée : renvoyer le code, sans erreur (idempotent).
  select c.code into v_code
    from public.hunt_completions c where c.player_id = v_player_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'state', 'completed',
      'already', true,
      'code', v_code,
      'hunt', pg_catalog.jsonb_build_object(
        'id', v_hunt.id, 'name', v_hunt.name,
        'order_mode', v_hunt.order_mode, 'reward_label', v_hunt.reward_label),
      'step', pg_catalog.jsonb_build_object(
        'position', v_step.position, 'label', v_step.label,
        'hint', v_step.hint_text),
      'progress', pg_catalog.jsonb_build_object('done', v_done, 'total', v_total),
      'stamped', v_positions
    );
  end if;

  perform 1 from public.hunt_scans sc
   where sc.player_id = v_player_id and sc.step_id = v_step.id;
  v_already := found;

  if not v_already then
    -- Délai minimal depuis le dernier scan du joueur (anti-partage).
    if v_hunt.min_scan_interval_seconds > 0 then
      select max(sc.scanned_at) into v_last_scan
        from public.hunt_scans sc where sc.player_id = v_player_id;
      if v_last_scan is not null
         and v_last_scan + pg_catalog.make_interval(secs => v_hunt.min_scan_interval_seconds) > v_now then
        return pg_catalog.jsonb_build_object(
          'state', 'too_soon',
          'retry_in_seconds', pg_catalog.ceil(extract(epoch from
            v_last_scan
            + pg_catalog.make_interval(secs => v_hunt.min_scan_interval_seconds)
            - v_now))::integer,
          'hunt', pg_catalog.jsonb_build_object(
            'id', v_hunt.id, 'name', v_hunt.name,
            'order_mode', v_hunt.order_mode, 'reward_label', v_hunt.reward_label),
          'step', pg_catalog.jsonb_build_object(
            'position', v_step.position, 'label', v_step.label),
          'progress', pg_catalog.jsonb_build_object('done', v_done, 'total', v_total),
          'stamped', v_positions
        );
      end if;
    end if;

    -- Ordre imposé : l'étape attendue est la première non tamponnée.
    if v_hunt.order_mode = 'ordered' then
      select min(s.position) into v_expected
        from public.hunt_steps s
       where s.hunt_id = v_hunt.id
         and not exists (
           select 1 from public.hunt_scans sc
            where sc.player_id = v_player_id and sc.step_id = s.id
         );
      if v_step.position <> v_expected then
        return pg_catalog.jsonb_build_object(
          'state', 'wrong_order',
          'expected_position', v_expected,
          'hunt', pg_catalog.jsonb_build_object(
            'id', v_hunt.id, 'name', v_hunt.name,
            'order_mode', v_hunt.order_mode, 'reward_label', v_hunt.reward_label),
          'step', pg_catalog.jsonb_build_object(
            'position', v_step.position, 'label', v_step.label),
          'progress', pg_catalog.jsonb_build_object('done', v_done, 'total', v_total),
          'stamped', v_positions
        );
      end if;
    end if;

    insert into public.hunt_scans (hunt_id, organization_id, player_id, step_id, scanned_at)
    values (v_hunt.id, v_hunt.organization_id, v_player_id, v_step.id, v_now)
    on conflict (player_id, step_id) do nothing;

    select count(*)::integer,
           coalesce(pg_catalog.jsonb_agg(s.position order by s.position), '[]'::jsonb)
      into v_done, v_positions
      from public.hunt_scans sc
      join public.hunt_steps s on s.id = sc.step_id
     where sc.player_id = v_player_id;
  end if;

  -- Toutes les étapes tamponnées : complétion (code + stock) dans la
  -- même transaction, sous le verrou de la chasse.
  if v_done >= v_total then
    if v_hunt.reward_stock is not null
       and v_hunt.reward_claimed_count >= v_hunt.reward_stock then
      return pg_catalog.jsonb_build_object(
        'state', 'hunt_full',
        'hunt', pg_catalog.jsonb_build_object(
          'id', v_hunt.id, 'name', v_hunt.name,
          'order_mode', v_hunt.order_mode, 'reward_label', v_hunt.reward_label),
        'step', pg_catalog.jsonb_build_object(
          'position', v_step.position, 'label', v_step.label,
          'hint', v_step.hint_text),
        'progress', pg_catalog.jsonb_build_object('done', v_done, 'total', v_total),
        'stamped', v_positions
      );
    end if;

    v_code := null;
    for attempt in 1..8 loop
      v_bytes := extensions.gen_random_bytes(8);
      v_code := 'CHASSE-';
      for i in 0..7 loop
        v_code := v_code || pg_catalog.substr(
          v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
      end loop;
      begin
        insert into public.hunt_completions
          (hunt_id, organization_id, player_id, code, completed_at)
        values (v_hunt.id, v_hunt.organization_id, v_player_id, v_code, v_now);
        exit;
      exception when unique_violation then
        -- Collision de code : nouvelle tentative (le verrou de chasse
        -- exclut une double complétion du même joueur).
        v_code := null;
      end;
    end loop;
    if v_code is null then
      raise exception 'code generation exhausted';
    end if;

    update public.hunts
       set reward_claimed_count = reward_claimed_count + 1
     where id = v_hunt.id;

    return pg_catalog.jsonb_build_object(
      'state', 'completed',
      'already', false,
      'code', v_code,
      'hunt', pg_catalog.jsonb_build_object(
        'id', v_hunt.id, 'name', v_hunt.name,
        'order_mode', v_hunt.order_mode, 'reward_label', v_hunt.reward_label),
      'step', pg_catalog.jsonb_build_object(
        'position', v_step.position, 'label', v_step.label,
        'hint', v_step.hint_text),
      'progress', pg_catalog.jsonb_build_object('done', v_done, 'total', v_total),
      'stamped', v_positions
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'state', case when v_already then 'already' else 'scanned' end,
    'hunt', pg_catalog.jsonb_build_object(
      'id', v_hunt.id, 'name', v_hunt.name,
      'order_mode', v_hunt.order_mode, 'reward_label', v_hunt.reward_label),
    'step', pg_catalog.jsonb_build_object(
      'position', v_step.position, 'label', v_step.label,
      'hint', v_step.hint_text),
    'progress', pg_catalog.jsonb_build_object('done', v_done, 'total', v_total),
    'stamped', v_positions
  );
end;
$$;

revoke all on function public.record_hunt_scan(text, text)
  from public, anon, authenticated;
grant execute on function public.record_hunt_scan(text, text)
  to service_role;

-- ── RPC caisse : remise du lot final ─────────────────────────
-- RPC dédiée plutôt qu'extension de redeem_by_code : le contrat de
-- retour de redeem_by_code est façonné participation (lot de roue,
-- campagne, panier, expiration) — l'étendre casserait ses appelants.
-- Même modèle : recherche + validation + audit atomiques, actor
-- obligatoire, org-scopée (code inconnu, déjà remis ou d'une autre
-- organisation → aucune remise ; un code d'une autre organisation ne
-- renvoie AUCUNE ligne, indistinguable d'un code inconnu).
create or replace function public.redeem_hunt_completion(
  p_organization_id uuid,
  p_code text,
  p_actor text
)
returns table(
  id uuid, completed_at timestamptz, code text, redeemed_at timestamptz,
  hunt_name text, reward_label text, reward_details text,
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

  update public.hunt_completions c
     set redeemed_at = now(),
         redeemed_by = p_actor
   where c.organization_id = p_organization_id
     and c.code = upper(btrim(p_code))
     and c.redeemed_at is null
  returning c.id into v_id;

  if v_id is not null then
    insert into public.audit_logs(organization_id, actor, action, metadata)
    values (p_organization_id, p_actor, 'hunt.redeem',
            pg_catalog.jsonb_build_object('completion_id', v_id));
  end if;

  return query
  select c.id, c.completed_at, c.code, c.redeemed_at,
         h.name, h.reward_label, h.reward_details, (v_id is not null)
    from public.hunt_completions c
    join public.hunts h on h.id = c.hunt_id
   where c.organization_id = p_organization_id
     and c.code = upper(btrim(p_code))
   limit 1;
end;
$$;

revoke all on function public.redeem_hunt_completion(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_hunt_completion(uuid, text, text)
  to service_role;

-- ── Purge RGPD ───────────────────────────────────────────────
-- Miroir de purge_expired_contest_players : la suppression des joueurs
-- cascade vers leurs scans et complétions. À appeler par le cron
-- /api/cron/purge-data, à côté des purges existantes.
create or replace function public.purge_expired_hunt_players()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.hunt_players p
  using public.organizations o
  where p.organization_id = o.id
    and o.data_retention_months is not null
    and p.created_at < pg_catalog.now()
      - pg_catalog.make_interval(months => o.data_retention_months);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_hunt_players()
  from public, anon, authenticated;
grant execute on function public.purge_expired_hunt_players()
  to service_role;
