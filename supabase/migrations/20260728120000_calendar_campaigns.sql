-- ============================================================
-- Lastchance — Module « Calendrier / campagnes quotidiennes »
--
-- Addon d'organisation (miroir EXACT d'addon_events / addon_jackpot /
-- addon_loyalty / addon_hunts) : un CALENDRIER expose une grille de CASES —
-- une par jour — que le joueur ouvre À DISTANCE (de chez lui : calendrier de
-- l'Avent, semaine anniversaire, 7 jours de cadeaux, soldes…). Il n'y a AUCUNE
-- présence physique ni anti-triche par proximité : le SEUL gating est TEMPOREL.
--
-- Une case a 4 usages possibles (par jour, au choix du commerçant) :
--   · content : un message / une offre affichée, AUCUN lot ;
--   · lot     : un lot direct, code de retrait CADEAU-…, stock FINI ;
--   · spin    : un tour de roue offert sur une roue de l'organisation
--               (RÉUTILISE le patron « grant de spin » de la fidélité /
--               jackpot — grant_token à usage unique → consume → flux de gain
--               normal) ;
--   plus une RÉCOMPENSE FINALE D'ASSIDUITÉ au niveau du calendrier : un lot
--   (code CADEAU-…) débloqué quand TOUTES les cases ont été ouvertes.
--
-- INVARIANTS DE SÉCURITÉ (critiques) :
--   1. OUVERTURE TEMPORISÉE SERVEUR-AUTORITATIVE. Chaque case porte un
--      `unlock_at timestamptz` (dérivé par le backend de start_date + offset du
--      jour dans le fuseau du calendrier, override possible pour un compte à
--      rebours à dates précises). open_calendar_box compare `now() >= unlock_at`
--      côté serveur — JAMAIS une date fournie par le client. Impossible d'ouvrir
--      en avance (état `too_early`).
--   2. NON-FUITE DU CONTENU AVANT OUVERTURE. Le message, le libellé de lot, le
--      code et l'option de spin d'une case ne sont lisibles par le joueur
--      qu'APRÈS qu'IL l'a ouverte. calendar_public_state n'expose, pour une case
--      NON ouverte par CE joueur, que {day_index, unlock_at, status} (verrouillée
--      / ouvrable / ouverte) — jamais content_type ni le contenu (comme la
--      non-fuite de la bonne réponse du module événement). Le contenu vit sur
--      calendar_days (jamais d'accès anon ; lecture membre uniquement) ; le
--      parcours public passe TOUJOURS par les RPC service_role.
--   3. BORNE ÉCONOMIQUE (ADR-031). `reward_stock` FINI et OBLIGATOIRE sur les
--      cases `lot` ET sur la récompense d'assiduité (completion_reward_stock).
--      Décrément ATOMIQUE sous le verrou du calendrier : jamais de sur-émission.
--   4. UNE OUVERTURE PAR (joueur, jour) — unique(player_id, day_id), immuable.
--
-- Retour joueur : opt-in EMAIL (rappel quotidien via cron backend, RGPD) ET page
--   suivable/installable. La base stocke l'email + les opt-in (marketing /
--   reminder) sur calendar_players ; le cron d'envoi et l'upsert éventuel vers
--   newsletter_subscribers (quand marketing_opt_in) sont du ressort du backend
--   (miroir claimPrize). calendar_reminder_targets alimente le cron.
--
-- Parcours PUBLIC à IP PARTAGÉE — RAPPEL ADR-032 : join et open sont des chemins
--   publics servis par le service_role. Le backend ne doit PAS poser de rate-limit
--   fail-closed sur une clé partagée (plusieurs joueurs derrière une même IP) :
--   la borne d'abus est l'identité cookie (token_hash) et les contraintes
--   d'unicité en base (un joueur par calendrier, une ouverture par jour), pas un
--   interrupteur global.
--
-- Sécurité (même modèle que Événement / Jackpot / Fidélité / Chasse) :
--   · AUCUN droit anon ; parcours public via service_role uniquement ;
--   · gestion commerçant (CRUD calendars / days) sous RLS is_org_member
--     (lecture) / is_org_editor (écriture) ;
--   · les compteurs de stock émis (*_claimed_count) sont RPC-only (grants de
--     colonnes) ;
--   · écritures joueur uniquement via RPC service_role ;
--   · remise en caisse par redeem_calendar_reward (miroir redeem_jackpot_prize) ;
--   · purge RGPD purge_expired_calendar_players (à brancher au cron purge-data).
-- ============================================================

-- ── Addon d'organisation ─────────────────────────────────────
alter table public.organizations
  add column addon_calendar boolean not null default false;

-- `organizations` utilise des grants de colonnes (00017) : une colonne ajoutée
-- ensuite n'est pas lisible automatiquement par authenticated.
grant select (addon_calendar) on public.organizations to authenticated;

comment on column public.organizations.addon_calendar is
  'Module Calendrier / campagnes quotidiennes activé depuis le back-office (option payante, ou incluse dans un plan)';

-- ── Source de spin « calendar » ──────────────────────────────
-- Un tour offert par une case insère un spin comme le flux normal, mais
-- journalisé distinctement (hors limite de jeu, hors stats direct/share).
-- Contrainte additive (état final loyalty : 'direct','share','loyalty').
alter table public.spins drop constraint if exists spins_source_check;
alter table public.spins
  add constraint spins_source_check
  check (source in ('direct', 'share', 'loyalty', 'calendar'));

-- ── Calendriers ──────────────────────────────────────────────
create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Thème saisonnier : la DA « carton » est déclinée côté UI ; côté base c'est
  -- un simple champ d'affichage.
  theme text not null default 'neutre'
    check (theme in ('noel', 'anniversaire', 'soldes', 'festival', 'neutre')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  -- Date de départ de la grille. Le backend en dérive les unlock_at des cases
  -- (offset du jour dans le fuseau `timezone`) ; la base ne stocke que les
  -- unlock_at résultants (source de vérité du gating).
  start_date date not null,
  -- Fuseau du calendrier (défaut = celui de l'organisation, posé par le trigger
  -- calendars_set_defaults si absent). Informe le calcul des unlock_at côté
  -- backend ; le gating serveur compare des timestamptz absolus.
  timezone text not null,
  -- Nombre de cases (Avent = 24, semaine = 7, compte à rebours = N…).
  day_count integer not null check (day_count between 1 and 60),
  -- URL/QR publique suivable. Posée par le trigger calendars_set_defaults si
  -- absente ; les fixtures peuvent en fournir une déterministe.
  public_slug text not null unique
    check (public_slug ~ '^[a-z0-9-]{3,64}$'),
  -- Texte court affiché sur la page publique (accroche du commerçant).
  merchant_content text
    check (merchant_content is null or char_length(merchant_content) <= 4000),
  -- Récompense d'assiduité : lot débloqué quand toutes les cases sont ouvertes.
  -- VERROU ÉCONOMIQUE (ADR-031) : stock FINI et OBLIGATOIRE = nombre de joueurs
  -- récompensés. 0 = pas de récompense finale (état non destructeur).
  completion_reward_label text not null default ''
    check (char_length(btrim(completion_reward_label)) <= 120),
  completion_reward_details text
    check (completion_reward_details is null or char_length(completion_reward_details) <= 2000),
  completion_reward_stock integer not null check (completion_reward_stock >= 0),
  -- Codes d'assiduité déjà émis (RPC-only : open_calendar_box) : borne le stock.
  completion_reward_claimed_count integer not null default 0
    check (completion_reward_claimed_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Support des FK composites tenant (même modèle que event / jackpot).
  unique (id, organization_id)
);

comment on table public.calendars is
  'Calendrier / campagne quotidienne : grille de day_count cases ouvertes À DISTANCE, gating TEMPOREL (unlock_at par case), thème saisonnier, récompense finale d''assiduité (lot fini CADEAU-…). Parcours joueur via RPC service role uniquement.';
comment on column public.calendars.completion_reward_stock is
  'Stock de la récompense d''assiduité — OBLIGATOIRE et FINI (ADR-031) : nombre de joueurs récompensés au terme du calendrier. open_calendar_box n''émet jamais au-delà. 0 = pas de récompense finale.';

create index calendars_org_idx on public.calendars (organization_id);

-- ── Cases (une par jour) ─────────────────────────────────────
create table public.calendar_days (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Rang du jour dans la grille (1..day_count ; unicité par calendrier).
  day_index integer not null check (day_index between 1 and 60),
  -- LE GATING (invariant #1) : instant absolu de déverrouillage. Dérivé par le
  -- backend de start_date + offset dans le fuseau, ou posé précisément pour un
  -- compte à rebours. open_calendar_box exige now() >= unlock_at.
  unlock_at timestamptz not null,
  content_type text not null default 'content'
    check (content_type in ('content', 'lot', 'spin')),
  -- content / offre : message affiché à l'ouverture.
  content_text text
    check (content_text is null or char_length(content_text) <= 2000),
  -- lot : libellé / détails du lot direct.
  reward_label text not null default ''
    check (char_length(btrim(reward_label)) <= 120),
  reward_details text
    check (reward_details is null or char_length(reward_details) <= 2000),
  -- lot : stock FINI OBLIGATOIRE (ADR-031). NULL hors 'lot'. Décrément atomique
  -- (open_calendar_box) ; borne reward_claimed_count.
  reward_stock integer check (reward_stock is null or reward_stock >= 0),
  reward_claimed_count integer not null default 0
    check (reward_claimed_count >= 0),
  -- spin : roue cible (même organisation, FK composite tenant). NULL hors 'spin'.
  target_wheel_id uuid,
  -- Case partageable (teaser social) : simple drapeau d'affichage.
  is_special boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_id, day_index),
  -- FK composite tenant : les ouvertures ciblent (id, organization_id).
  unique (id, organization_id),
  foreign key (calendar_id, organization_id)
    references public.calendars(id, organization_id) on delete cascade,
  -- Roue cible dans la MÊME organisation (anti cross-tenant). MATCH SIMPLE : non
  -- contrôlée quand target_wheel_id est null. NO ACTION (défaut, miroir
  -- loyalty_milestones) : bloque la suppression d'une roue encore ciblée SANS
  -- casser la suppression en cascade d'une organisation entière.
  foreign key (target_wheel_id, organization_id)
    references public.wheels(id, organization_id),
  -- Cohérence usage ↔ champs (implications, même style que loyalty_milestones).
  constraint calendar_days_lot_stock_check check (
    (content_type = 'lot' and reward_stock is not null)
    or (content_type <> 'lot' and reward_stock is null)
  ),
  constraint calendar_days_spin_wheel_check check (
    (content_type = 'spin' and target_wheel_id is not null)
    or (content_type <> 'spin' and target_wheel_id is null)
  )
);

comment on table public.calendar_days is
  'Case d''un calendrier : gating unlock_at (serveur-autoritatif), 3 usages (content / lot / spin). Le contenu N''EST JAMAIS lisible par le public avant que le joueur ait ouvert la case : réservé aux membres et au service_role ; calendar_public_state ne l''expose qu''aux cases ouvertes par le joueur.';
comment on column public.calendar_days.unlock_at is
  'Instant absolu de déverrouillage (serveur-autoritatif). open_calendar_box exige now() >= unlock_at ; une date fournie par le client n''est jamais utilisée.';
comment on column public.calendar_days.reward_stock is
  'Stock du lot d''une case ''lot'' — OBLIGATOIRE et FINI (ADR-031). NULL hors ''lot''. Décrément atomique sous le verrou du calendrier ; jamais de sur-émission.';

create index calendar_days_org_idx on public.calendar_days (organization_id);
create index calendar_days_calendar_idx on public.calendar_days (calendar_id, day_index);

-- ── Joueurs (identité cookie, hash du jeton ; email opt-in RGPD) ──
create table public.calendar_players (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Hash SHA-256 du jeton cookie HTTP-only (miroir event / jackpot / loyalty).
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Email opt-in (rappel quotidien / marketing). Seule PII du module ; purgée
  -- par purge_expired_calendar_players. Validation légère (présence d'un @).
  email text
    check (email is null or (char_length(email) between 3 and 320 and email like '%@%')),
  marketing_opt_in boolean not null default false,
  reminder_opt_in boolean not null default false,
  -- Nombre de cases distinctes ouvertes (dénormalisé, maintenu par
  -- open_calendar_box). Déclencheur de la récompense d'assiduité.
  opened_count integer not null default 0 check (opened_count >= 0),
  -- Récompense d'assiduité déjà attribuée à ce joueur (idempotence).
  completion_rewarded boolean not null default false,
  created_at timestamptz not null default now(),
  unique (calendar_id, token_hash),
  -- FK composite tenant pour calendar_openings / calendar_rewards.
  unique (id, calendar_id, organization_id),
  foreign key (calendar_id, organization_id)
    references public.calendars(id, organization_id) on delete cascade
);

comment on table public.calendar_players is
  'Joueur d''un calendrier, créé au join / à la première ouverture : hash de jeton + email opt-in facultatif (rappel quotidien RGPD). opened_count / completion_rewarded maintenus par open_calendar_box.';

create index calendar_players_org_idx on public.calendar_players (organization_id);
create index calendar_players_calendar_idx on public.calendar_players (calendar_id);
create index calendar_players_reminder_idx on public.calendar_players (calendar_id)
  where reminder_opt_in and email is not null;

-- ── Ouvertures (une par (joueur, jour), immuable) ────────────
create table public.calendar_openings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  day_id uuid not null,
  calendar_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opened_at timestamptz not null default now(),
  -- Copie du type au moment de l'ouverture (l'édition ultérieure d'une case ne
  -- réécrit pas l'histoire du joueur).
  content_type text not null
    check (content_type in ('content', 'lot', 'spin')),
  -- lot : code de retrait présenté en caisse. Même alphabet que EVENT-/JACKPOT-…
  -- (sans I/O/0/1), préfixe distinct CADEAU- pour le routage caisse. NULL si
  -- rupture de stock (out_of_stock) ou usage non-lot.
  code text unique check (code is null or code ~ '^CADEAU-[A-HJ-NP-Z2-9]{8}$'),
  -- lot : remise en caisse (redeem_calendar_reward).
  redeemed_at timestamptz,
  redeemed_by text check (redeemed_by is null or char_length(redeemed_by) <= 120),
  -- spin : jeton de spin offert à usage unique (48 hex), échangé par
  -- consume_calendar_spin_grant contre un tirage sur la roue cible.
  spin_grant_token text unique
    check (spin_grant_token is null or spin_grant_token ~ '^[0-9a-f]{48}$'),
  consumed_at timestamptz,
  resulting_spin_id uuid references public.spins(id) on delete set null,
  -- lot : la case était en rupture au moment de l'ouverture (aucun code émis).
  out_of_stock boolean not null default false,
  -- Invariant #4 : une seule ouverture par joueur et par jour.
  unique (player_id, day_id),
  foreign key (player_id, calendar_id, organization_id)
    references public.calendar_players(id, calendar_id, organization_id) on delete cascade,
  foreign key (day_id, organization_id)
    references public.calendar_days(id, organization_id) on delete cascade,
  foreign key (calendar_id, organization_id)
    references public.calendars(id, organization_id) on delete cascade
);

comment on table public.calendar_openings is
  'Ouverture d''une case par un joueur : type copié, code CADEAU-… (lot, remis via redeem_calendar_reward) ou grant_token de spin (consommé via consume_calendar_spin_grant). Unicité (joueur, jour) — immuable.';

create index calendar_openings_org_idx on public.calendar_openings (organization_id);
create index calendar_openings_player_idx on public.calendar_openings (player_id);
create index calendar_openings_day_idx on public.calendar_openings (day_id);

-- ── Récompenses d'assiduité (miroir des wins) ────────────────
create table public.calendar_rewards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  calendar_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Code de retrait présenté en caisse. Même préfixe CADEAU- que les lots de
  -- case (routage caisse unifié) ; unicité garantie par génération avec retry.
  code text not null unique check (code ~ '^CADEAU-[A-HJ-NP-Z2-9]{8}$'),
  redeemed_at timestamptz,
  redeemed_by text check (redeemed_by is null or char_length(redeemed_by) <= 120),
  created_at timestamptz not null default now(),
  -- Une récompense d'assiduité par joueur et par calendrier.
  unique (player_id, calendar_id),
  foreign key (player_id, calendar_id, organization_id)
    references public.calendar_players(id, calendar_id, organization_id) on delete cascade,
  foreign key (calendar_id, organization_id)
    references public.calendars(id, organization_id) on delete cascade
);

comment on table public.calendar_rewards is
  'Récompense d''assiduité gagnée (toutes les cases ouvertes) : code CADEAU-… remis via redeem_calendar_reward. Une par (joueur, calendrier). Registre vérifiable des lots finaux.';

create index calendar_rewards_org_idx on public.calendar_rewards (organization_id);
create index calendar_rewards_calendar_idx on public.calendar_rewards (calendar_id);

-- ── RLS et grants ────────────────────────────────────────────
alter table public.calendars enable row level security;
alter table public.calendar_days enable row level security;
alter table public.calendar_players enable row level security;
alter table public.calendar_openings enable row level security;
alter table public.calendar_rewards enable row level security;

revoke all on table public.calendars from public, anon, authenticated;
revoke all on table public.calendar_days from public, anon, authenticated;
revoke all on table public.calendar_players from public, anon, authenticated;
revoke all on table public.calendar_openings from public, anon, authenticated;
revoke all on table public.calendar_rewards from public, anon, authenticated;

-- Contenu (calendars / days) : CRUD éditeurs, lecture d'équipe.
create policy "calendars: member select" on public.calendars
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "calendars: editor write" on public.calendars
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "calendar_days: member select" on public.calendar_days
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "calendar_days: editor write" on public.calendar_days
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- Données joueurs : lecture d'équipe (dashboard / stats / caisse), écritures
-- service role uniquement.
create policy "calendar_players: member select" on public.calendar_players
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "calendar_openings: member select" on public.calendar_openings
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "calendar_rewards: member select" on public.calendar_rewards
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Calendars : select complet (équipe) ; insert/update RESTREINTS aux colonnes
-- non pilotées par les RPC. public_slug / timezone posés par trigger (ou
-- fournis) ; completion_reward_claimed_count est RPC-only (open_calendar_box).
grant select on table public.calendars to authenticated;
grant insert (organization_id, name, theme, status, start_date, timezone,
              day_count, public_slug, merchant_content,
              completion_reward_label, completion_reward_details,
              completion_reward_stock)
  on public.calendars to authenticated;
grant update (name, theme, status, start_date, timezone, day_count,
              public_slug, merchant_content,
              completion_reward_label, completion_reward_details,
              completion_reward_stock, updated_at)
  on public.calendars to authenticated;
grant delete on public.calendars to authenticated;

-- Calendar_days : idem ; reward_claimed_count est RPC-only.
grant select on table public.calendar_days to authenticated;
grant insert (calendar_id, organization_id, day_index, unlock_at, content_type,
              content_text, reward_label, reward_details, reward_stock,
              target_wheel_id, is_special)
  on public.calendar_days to authenticated;
grant update (day_index, unlock_at, content_type, content_text, reward_label,
              reward_details, reward_stock, target_wheel_id, is_special,
              updated_at)
  on public.calendar_days to authenticated;
grant delete on public.calendar_days to authenticated;

-- Données joueurs : lecture seule côté marchand.
grant select on table public.calendar_players to authenticated;
grant select on table public.calendar_openings to authenticated;
grant select on table public.calendar_rewards to authenticated;

grant select, insert, update, delete on table public.calendars to service_role;
grant select, insert, update, delete on table public.calendar_days to service_role;
grant select, insert, update, delete on table public.calendar_players to service_role;
grant select, insert, update, delete on table public.calendar_openings to service_role;
grant select, insert, update, delete on table public.calendar_rewards to service_role;

-- Mutations commerçant auditées (miroir des autres modules).
create trigger calendars_merchant_audit
  after insert or update or delete on public.calendars
  for each row execute function public.audit_merchant_mutation();

-- ── Trigger : défauts service-authoritatifs (slug + fuseau) ──
-- BEFORE INSERT SECURITY DEFINER : génère un public_slug si absent (alphabet
-- [a-z0-9], la contrainte unique reste le filet) et remplit le fuseau depuis
-- l'organisation si absent. N'écrase jamais des valeurs fournies (fixtures
-- déterministes).
create or replace function public.calendars_set_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  attempt integer;
begin
  if new.timezone is null then
    select o.timezone into new.timezone
      from public.organizations o where o.id = new.organization_id;
    if new.timezone is null then
      new.timezone := 'Europe/Paris';
    end if;
  end if;

  if new.public_slug is null then
    for attempt in 1..12 loop
      v_slug := pg_catalog.encode(extensions.gen_random_bytes(6), 'hex');
      if not exists (select 1 from public.calendars c where c.public_slug = v_slug) then
        new.public_slug := v_slug;
        exit;
      end if;
    end loop;
    if new.public_slug is null then
      raise exception 'calendar slug generation exhausted';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.calendars_set_defaults()
  from public, anon, authenticated;

create trigger calendars_set_defaults
  before insert on public.calendars
  for each row execute function public.calendars_set_defaults();

-- ============================================================
-- RPC parcours JOUEUR (service_role uniquement)
-- ============================================================

-- ── join_calendar ────────────────────────────────────────────
-- Résout le calendrier par public_slug (statut actif), crée/renvoie le joueur
-- (idempotent : re-join = même ligne). Enregistre l'email + les opt-in si
-- fournis (miroir claimPrize pour l'opt-in newsletter — l'upsert vers
-- newsletter_subscribers reste au backend quand marketing_opt_in). N'expose
-- AUCUN contenu de case.
create or replace function public.join_calendar(
  p_slug text,
  p_player_token_hash text,
  p_email text default null,
  p_marketing_opt_in boolean default false,
  p_reminder_opt_in boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cal public.calendars%rowtype;
  v_player public.calendar_players%rowtype;
  v_email text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  select c.* into v_cal
    from public.calendars c
    join public.organizations o on o.id = c.organization_id
   where c.public_slug = pg_catalog.lower(pg_catalog.btrim(coalesce(p_slug, '')))
     and o.addon_calendar
   for update of c;
  -- Réponse 'unavailable' identique quel que soit le motif (slug inconnu, addon
  -- coupé, calendrier non actif) : pas d'oracle.
  if not found or v_cal.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Email nettoyé (opt-in). Coercition silencieuse vers null si manifestement
  -- invalide (la contrainte de colonne reste le filet).
  v_email := pg_catalog.nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null and (pg_catalog.length(v_email) > 320 or v_email not like '%@%') then
    v_email := null;
  end if;

  -- Joueur créé au premier join (idempotent). Le DO NOTHING puis l'UPDATE ci-
  -- dessous évitent toute auto-référence ambiguë dans le ON CONFLICT.
  insert into public.calendar_players
    (calendar_id, organization_id, token_hash, email, marketing_opt_in, reminder_opt_in)
  values (v_cal.id, v_cal.organization_id, p_player_token_hash, v_email,
          coalesce(p_marketing_opt_in, false), coalesce(p_reminder_opt_in, false))
  on conflict (calendar_id, token_hash) do nothing;

  -- Toujours appliqué (nouvelle ligne ou re-join) : on met à jour l'email
  -- seulement si un nouvel email est fourni, et on fait MONTER les opt-in (OR)
  -- — un re-join ne rétracte jamais un consentement déjà donné.
  update public.calendar_players
     set email = coalesce(v_email, email),
         marketing_opt_in = marketing_opt_in or coalesce(p_marketing_opt_in, false),
         reminder_opt_in = reminder_opt_in or coalesce(p_reminder_opt_in, false)
   where calendar_id = v_cal.id and token_hash = p_player_token_hash
  returning * into v_player;

  return pg_catalog.jsonb_build_object(
    'state', 'joined',
    'calendar', pg_catalog.jsonb_build_object(
      'id', v_cal.id, 'name', v_cal.name, 'theme', v_cal.theme,
      'day_count', v_cal.day_count, 'merchant_content', v_cal.merchant_content),
    'player', pg_catalog.jsonb_build_object(
      'id', v_player.id, 'opened_count', v_player.opened_count,
      'marketing_opt_in', v_player.marketing_opt_in,
      'reminder_opt_in', v_player.reminder_opt_in,
      'has_email', (v_player.email is not null))
  );
end;
$$;

revoke all on function public.join_calendar(text, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.join_calendar(text, text, text, boolean, boolean)
  to service_role;

-- ── open_calendar_box ────────────────────────────────────────
-- TOUT atomique sous le verrou du calendrier (select … for update) :
-- addon + statut actif, le jour appartient bien au calendrier, GATING SERVEUR
-- now() >= unlock_at (sinon 'too_early'), une ouverture par (joueur, jour)
-- (unique, immuable). Selon content_type :
--   · content : renvoie content_text ;
--   · lot     : code CADEAU-… + décrément atomique du stock (échec propre
--               out_of_stock si épuisé) ;
--   · spin    : grant_token à usage unique (échangé ensuite via
--               consume_calendar_spin_grant).
-- Incrémente opened_count. COMPLETION : si opened_count >= day_count et pas
-- encore récompensé, crée la récompense d'assiduité (code CADEAU-… + décrément
-- completion_reward_stock).
--
-- Réponse jsonb :
--   state: 'unavailable' | 'too_early' | 'opened' | 'already_opened'
--   day: { id, day_index, content_type, unlock_at }             (sauf unavailable)
--   content_text, reward_label, reward_details, code, spin_grant_token,
--     target_wheel_id, out_of_stock                             (opened/already_opened)
--   unlock_at                                                    (too_early)
--   progression: { opened_count, day_count }                    (opened/already_opened)
--   completion: { rewarded, code, out_of_stock }                (opened)
create or replace function public.open_calendar_box(
  p_calendar_id uuid,
  p_player_token_hash text,
  p_day_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cal public.calendars%rowtype;
  v_day public.calendar_days%rowtype;
  v_player public.calendar_players%rowtype;
  v_open public.calendar_openings%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_code text;
  v_grant text;
  v_out_of_stock boolean := false;
  v_new_opened integer;
  v_completion_rewarded boolean := false;
  v_completion_code text := null;
  v_completion_out_of_stock boolean := false;
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

  -- Verrou sur le calendrier : fige le stock d'assiduité et sérialise
  -- l'attribution. Sérialise, ne rejette pas sur la clé partagée (ADR-032).
  select c.* into v_cal
    from public.calendars c
    join public.organizations o on o.id = c.organization_id
   where c.id = p_calendar_id
     and o.addon_calendar
   for update of c;
  if not found or v_cal.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- La case doit appartenir au calendrier (même tenant).
  select d.* into v_day
    from public.calendar_days d
   where d.id = p_day_id and d.calendar_id = v_cal.id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Joueur créé à la première ouverture si absent (aucune PII imposée ; l'email
  -- opt-in passe par join_calendar). Verrou de ligne pour opened_count.
  insert into public.calendar_players (calendar_id, organization_id, token_hash)
  values (v_cal.id, v_cal.organization_id, p_player_token_hash)
  on conflict (calendar_id, token_hash) do nothing;
  select p.* into v_player
    from public.calendar_players p
   where p.calendar_id = v_cal.id and p.token_hash = p_player_token_hash
   for update;

  -- Déjà ouverte ? Renvoie SON contenu (c'est l'ouverture du joueur lui-même).
  select o.* into v_open
    from public.calendar_openings o
   where o.player_id = v_player.id and o.day_id = v_day.id;
  if found then
    return pg_catalog.jsonb_build_object(
      'state', 'already_opened',
      'day', pg_catalog.jsonb_build_object(
        'id', v_day.id, 'day_index', v_day.day_index,
        'content_type', v_open.content_type, 'unlock_at', v_day.unlock_at),
      'content_text', case when v_open.content_type = 'content' then v_day.content_text else null end,
      'reward_label', case when v_open.content_type = 'lot' then v_day.reward_label else null end,
      'reward_details', case when v_open.content_type = 'lot' then v_day.reward_details else null end,
      'code', v_open.code,
      'spin_grant_token', v_open.spin_grant_token,
      'target_wheel_id', case when v_open.content_type = 'spin' then v_day.target_wheel_id else null end,
      'out_of_stock', v_open.out_of_stock,
      'progression', pg_catalog.jsonb_build_object(
        'opened_count', v_player.opened_count, 'day_count', v_cal.day_count)
    );
  end if;

  -- GATING SERVEUR-AUTORITATIF (invariant #1) : impossible d'ouvrir en avance.
  if v_now < v_day.unlock_at then
    return pg_catalog.jsonb_build_object(
      'state', 'too_early',
      'day', pg_catalog.jsonb_build_object(
        'id', v_day.id, 'day_index', v_day.day_index, 'unlock_at', v_day.unlock_at),
      'unlock_at', v_day.unlock_at
    );
  end if;

  -- Attribution selon l'usage.
  v_code := null;
  v_grant := null;
  if v_day.content_type = 'lot' then
    if v_day.reward_claimed_count >= coalesce(v_day.reward_stock, 0) then
      v_out_of_stock := true;
    else
      for attempt in 1..8 loop
        v_bytes := extensions.gen_random_bytes(8);
        v_code := 'CADEAU-';
        for i in 0..7 loop
          v_code := v_code || pg_catalog.substr(
            v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
        end loop;
        begin
          insert into public.calendar_openings
            (player_id, day_id, calendar_id, organization_id, content_type, code)
          values (v_player.id, v_day.id, v_cal.id, v_cal.organization_id, 'lot', v_code);
          exit;
        exception when unique_violation then
          -- Collision de code (l'unicité (player_id, day_id) ne peut se violer
          -- ici : déjà écartée plus haut sous le verrou).
          v_code := null;
        end;
      end loop;
      if v_code is null then
        raise exception 'calendar code generation exhausted';
      end if;
      update public.calendar_days
         set reward_claimed_count = reward_claimed_count + 1
       where id = v_day.id;
    end if;
    if v_out_of_stock then
      insert into public.calendar_openings
        (player_id, day_id, calendar_id, organization_id, content_type, out_of_stock)
      values (v_player.id, v_day.id, v_cal.id, v_cal.organization_id, 'lot', true);
    end if;

  elsif v_day.content_type = 'spin' then
    for attempt in 1..8 loop
      v_grant := pg_catalog.encode(extensions.gen_random_bytes(24), 'hex');
      begin
        insert into public.calendar_openings
          (player_id, day_id, calendar_id, organization_id, content_type, spin_grant_token)
        values (v_player.id, v_day.id, v_cal.id, v_cal.organization_id, 'spin', v_grant);
        exit;
      exception when unique_violation then
        v_grant := null;
      end;
    end loop;
    if v_grant is null then
      raise exception 'calendar grant generation exhausted';
    end if;

  else
    -- content : simple message, aucune émission.
    insert into public.calendar_openings
      (player_id, day_id, calendar_id, organization_id, content_type)
    values (v_player.id, v_day.id, v_cal.id, v_cal.organization_id, 'content');
  end if;

  -- Une case distincte de plus a été ouverte.
  v_new_opened := v_player.opened_count + 1;
  update public.calendar_players
     set opened_count = v_new_opened
   where id = v_player.id;

  -- COMPLETION : toutes les cases ouvertes → récompense d'assiduité (une seule
  -- fois, stock FINI). Sous le verrou du calendrier : pas de sur-émission.
  if v_new_opened >= v_cal.day_count and not v_player.completion_rewarded then
    if v_cal.completion_reward_claimed_count >= v_cal.completion_reward_stock then
      v_completion_out_of_stock := true;
    else
      for attempt in 1..8 loop
        v_bytes := extensions.gen_random_bytes(8);
        v_completion_code := 'CADEAU-';
        for i in 0..7 loop
          v_completion_code := v_completion_code || pg_catalog.substr(
            v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
        end loop;
        begin
          insert into public.calendar_rewards
            (player_id, calendar_id, organization_id, code)
          values (v_player.id, v_cal.id, v_cal.organization_id, v_completion_code);
          exit;
        exception when unique_violation then
          v_completion_code := null;
        end;
      end loop;
      if v_completion_code is null then
        raise exception 'calendar completion code generation exhausted';
      end if;
      update public.calendars
         set completion_reward_claimed_count = completion_reward_claimed_count + 1
       where id = v_cal.id;
      update public.calendar_players
         set completion_rewarded = true
       where id = v_player.id;
      v_completion_rewarded := true;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'opened',
    'day', pg_catalog.jsonb_build_object(
      'id', v_day.id, 'day_index', v_day.day_index,
      'content_type', v_day.content_type, 'unlock_at', v_day.unlock_at),
    'content_text', case when v_day.content_type = 'content' then v_day.content_text else null end,
    'reward_label', case when v_day.content_type = 'lot' then v_day.reward_label else null end,
    'reward_details', case when v_day.content_type = 'lot' then v_day.reward_details else null end,
    'code', v_code,
    'spin_grant_token', v_grant,
    'target_wheel_id', case when v_day.content_type = 'spin' then v_day.target_wheel_id else null end,
    'out_of_stock', v_out_of_stock,
    'progression', pg_catalog.jsonb_build_object(
      'opened_count', v_new_opened, 'day_count', v_cal.day_count),
    'completion', pg_catalog.jsonb_build_object(
      'rewarded', v_completion_rewarded,
      'code', v_completion_code,
      'out_of_stock', v_completion_out_of_stock)
  );
end;
$$;

revoke all on function public.open_calendar_box(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.open_calendar_box(uuid, text, uuid)
  to service_role;

-- ── consume_calendar_spin_grant ──────────────────────────────
-- Miroir de consume_loyalty_spin_grant : échange un grant_token à usage unique
-- (émis par open_calendar_box sur une case 'spin') contre EXACTEMENT un tirage
-- pondéré atomique sur la roue cible (réservation de stock incluse), SANS limite
-- de jeu. Anti-rejeu : verrou FOR UPDATE de l'ouverture ; un second appel voit
-- consumed_at. Le spin inséré (source 'calendar') débouche sur le flux de gain
-- normal (le backend signe le jeton HMAC → claim_winning_spin → code GAIN-…).
--
-- Réponse jsonb :
--   state: 'unavailable' | 'already_consumed' | 'no_prize' | 'spun'
--   spin_id, wheel_id, prize_id, is_losing                (spun)
create or replace function public.consume_calendar_spin_grant(
  p_calendar_id uuid,
  p_player_token_hash text,
  p_grant_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open public.calendar_openings%rowtype;
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
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  -- Grant résolu ET lié au joueur appelant (défense en profondeur : le
  -- grant_token seul, sans le cookie du joueur, ne suffit pas). Verrou de ligne :
  -- anti-rejeu.
  select o.* into v_open
    from public.calendar_openings o
    join public.calendar_players p
      on p.id = o.player_id
     and p.calendar_id = o.calendar_id
     and p.organization_id = o.organization_id
   where o.calendar_id = p_calendar_id
     and o.content_type = 'spin'
     and o.spin_grant_token = pg_catalog.btrim(coalesce(p_grant_token, ''))
     and p.token_hash = p_player_token_hash
   for update of o;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_open.consumed_at is not null then
    return pg_catalog.jsonb_build_object(
      'state', 'already_consumed', 'spin_id', v_open.resulting_spin_id);
  end if;

  -- Roue cible de la case (garantie même organisation par la FK du jour).
  select d.target_wheel_id into v_wheel_id
    from public.calendar_days d where d.id = v_open.day_id;
  select w.id, w.campaign_id, w.organization_id
    into v_wheel_id, v_campaign_id, v_org_id
    from public.wheels w where w.id = v_wheel_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Tirage pondéré atomique (même algorithme que perform_atomic_spin, SANS
  -- contrôle de fenêtre de jeu). Réserve le stock du lot tiré.
  loop
    select coalesce(sum(p.weight), 0)::bigint into v_total
      from public.prizes p
     where p.wheel_id = v_wheel_id and p.organization_id = v_org_id
       and p.is_active and p.weight > 0
       and (p.is_losing or p.stock is null or p.stock > 0);
    if v_total <= 0 then
      -- Aucun lot disponible : le grant reste NON consommé (rejouable quand le
      -- commerçant réapprovisionne).
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
    v_prize.is_losing, p_player_token_hash, null, 'calendar', null
  ) returning id into v_spin_id;

  -- Grant consommé (une seule fois) → spin résultant journalisé.
  update public.calendar_openings
     set consumed_at = pg_catalog.now(), resulting_spin_id = v_spin_id
   where id = v_open.id;

  return pg_catalog.jsonb_build_object(
    'state', 'spun',
    'spin_id', v_spin_id,
    'wheel_id', v_wheel_id,
    'prize_id', case when v_prize.is_losing then null else v_prize.id end,
    'is_losing', v_prize.is_losing
  );
end;
$$;

revoke all on function public.consume_calendar_spin_grant(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_calendar_spin_grant(uuid, text, text)
  to service_role;

-- ============================================================
-- RPC LECTURE PUBLIQUE de l'état (service_role) — source du transport
-- (page suivable / polling léger). NE FUITE JAMAIS le contenu d'une case non
-- ouverte par le joueur (invariant #2) : une case non ouverte n'expose que
-- {day_index, unlock_at, status, is_special}. p_player_token_hash optionnel.
-- ============================================================
create or replace function public.calendar_public_state(
  p_calendar_id uuid,
  p_player_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cal public.calendars%rowtype;
  v_player public.calendar_players%rowtype;
  v_has_player boolean := false;
  v_now timestamptz := pg_catalog.now();
  v_days jsonb;
  v_reward jsonb := null;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select c.* into v_cal from public.calendars c where c.id = p_calendar_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if p_player_token_hash is not null and p_player_token_hash ~ '^[0-9a-f]{64}$' then
    select p.* into v_player
      from public.calendar_players p
     where p.calendar_id = v_cal.id and p.token_hash = p_player_token_hash;
    v_has_player := found;
  end if;

  -- Grille des cases. Le contenu (content_type, texte, libellé, code, grant)
  -- N'EST inclus QUE pour les cases ouvertes par CE joueur (LEFT JOIN sur
  -- calendar_openings du joueur). Sinon : statut temporel seul.
  select coalesce(pg_catalog.jsonb_agg(x.obj order by x.day_index), '[]'::jsonb)
    into v_days
    from (
      select d.day_index,
        case when o.id is not null then
          -- Case OUVERTE par le joueur : contenu complet (le sien).
          pg_catalog.jsonb_build_object(
            'day_index', d.day_index,
            'unlock_at', d.unlock_at,
            'status', 'opened',
            'is_special', d.is_special,
            'content_type', o.content_type,
            'content_text', case when o.content_type = 'content' then d.content_text else null end,
            'reward_label', case when o.content_type = 'lot' then d.reward_label else null end,
            'reward_details', case when o.content_type = 'lot' then d.reward_details else null end,
            'code', o.code,
            'spin_grant_token', o.spin_grant_token,
            'target_wheel_id', case when o.content_type = 'spin' then d.target_wheel_id else null end,
            'resulting_spin_id', o.resulting_spin_id,
            'out_of_stock', o.out_of_stock)
        else
          -- Case NON ouverte : AUCUN contenu (invariant #2), statut temporel seul.
          pg_catalog.jsonb_build_object(
            'day_index', d.day_index,
            'unlock_at', d.unlock_at,
            'status', case when v_now >= d.unlock_at then 'available' else 'locked' end,
            'is_special', d.is_special)
        end as obj,
        d.day_index as day_index
        from public.calendar_days d
        left join public.calendar_openings o
          on o.day_id = d.id
         and v_has_player
         and o.player_id = v_player.id
       where d.calendar_id = v_cal.id
    ) x;

  -- Récompense d'assiduité du joueur (si gagnée) : son code (jamais celui d'un
  -- autre). completion_reward_label reste une accroche publique.
  if v_has_player then
    select pg_catalog.jsonb_build_object(
             'code', r.code, 'redeemed_at', r.redeemed_at)
      into v_reward
      from public.calendar_rewards r
     where r.calendar_id = v_cal.id and r.player_id = v_player.id
     limit 1;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'calendar', pg_catalog.jsonb_build_object(
      'id', v_cal.id, 'name', v_cal.name, 'theme', v_cal.theme,
      'status', v_cal.status, 'day_count', v_cal.day_count,
      'merchant_content', v_cal.merchant_content,
      'completion_reward_label', v_cal.completion_reward_label,
      'completion_reward_details', v_cal.completion_reward_details),
    'days', v_days,
    'progression', pg_catalog.jsonb_build_object(
      'opened_count', case when v_has_player then v_player.opened_count else 0 end,
      'day_count', v_cal.day_count),
    'completion_reward', v_reward
  );
end;
$$;

revoke all on function public.calendar_public_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.calendar_public_state(uuid, text) to service_role;

-- ── RPC cron : cibles du rappel quotidien ────────────────────
-- Pour le cron backend d'envoi d'email : joueurs opt-in reminder (email présent)
-- d'un calendrier ACTIF ayant une case ouvrable AUJOURD'HUI (dans le fuseau du
-- calendrier), déjà déverrouillée (now() >= unlock_at) et NON encore ouverte.
-- Anti-doublon en base : au plus une case par joueur (la plus récente du jour).
-- La déduplication inter-runs (ne pas ré-emailer le même jour) est laissée au
-- backend via un email_log. SQL direct ; le cron d'envoi reste backend.
create or replace function public.calendar_reminder_targets(
  p_organization_id uuid default null
)
returns table(
  calendar_id uuid, organization_id uuid, player_id uuid, email text,
  calendar_name text, public_slug text, theme text,
  day_id uuid, day_index integer, unlock_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  return query
  select distinct on (pl.id)
         c.id, c.organization_id, pl.id, pl.email,
         c.name, c.public_slug, c.theme,
         d.id, d.day_index, d.unlock_at
    from public.calendars c
    join public.organizations o
      on o.id = c.organization_id and o.addon_calendar
    join public.calendar_players pl
      on pl.calendar_id = c.id
     and pl.reminder_opt_in
     and pl.email is not null
    join public.calendar_days d
      on d.calendar_id = c.id
     and d.unlock_at <= pg_catalog.now()
     and (d.unlock_at at time zone c.timezone)::date
       = (pg_catalog.now() at time zone c.timezone)::date
   where c.status = 'active'
     and (p_organization_id is null or c.organization_id = p_organization_id)
     and not exists (
       select 1 from public.calendar_openings op
        where op.player_id = pl.id and op.day_id = d.id)
   order by pl.id, d.unlock_at desc, d.day_index desc;
end;
$$;

revoke all on function public.calendar_reminder_targets(uuid)
  from public, anon, authenticated;
grant execute on function public.calendar_reminder_targets(uuid) to service_role;

-- ── RPC caisse : remise d'un lot de calendrier ───────────────
-- Miroir de redeem_jackpot_prize : recherche + validation + audit atomiques,
-- actor obligatoire, org-scopée (code inconnu, déjà remis ou d'une autre
-- organisation → aucune remise, réponse indistinguable). Le code CADEAU-… peut
-- provenir d'une case 'lot' (calendar_openings) OU de la récompense d'assiduité
-- (calendar_rewards) : les DEUX sources sont couvertes (caisse unifiée).
create or replace function public.redeem_calendar_reward(
  p_organization_id uuid,
  p_code text,
  p_actor text
)
returns table(
  id uuid, source text, created_at timestamptz, code text,
  redeemed_at timestamptz, calendar_name text,
  reward_label text, reward_details text, redeemed_now boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_open_id uuid;
  v_reward_id uuid;
begin
  if p_actor is null or length(p_actor) = 0 then
    raise exception 'actor required';
  end if;
  v_code := upper(btrim(coalesce(p_code, '')));

  -- 1) Lot de case (calendar_openings).
  update public.calendar_openings o
     set redeemed_at = now(),
         redeemed_by = p_actor
   where o.organization_id = p_organization_id
     and o.code = v_code
     and o.content_type = 'lot'
     and o.redeemed_at is null
  returning o.id into v_open_id;

  -- 2) Sinon, récompense d'assiduité (calendar_rewards).
  if v_open_id is null then
    update public.calendar_rewards r
       set redeemed_at = now(),
           redeemed_by = p_actor
     where r.organization_id = p_organization_id
       and r.code = v_code
       and r.redeemed_at is null
    returning r.id into v_reward_id;
  end if;

  if v_open_id is not null then
    insert into public.audit_logs(organization_id, actor, action, metadata)
    values (p_organization_id, p_actor, 'calendar.redeem',
            pg_catalog.jsonb_build_object('opening_id', v_open_id));
  elsif v_reward_id is not null then
    insert into public.audit_logs(organization_id, actor, action, metadata)
    values (p_organization_id, p_actor, 'calendar.redeem',
            pg_catalog.jsonb_build_object('reward_id', v_reward_id));
  end if;

  return query
  select o.id, 'day'::text, o.opened_at, o.code, o.redeemed_at,
         c.name, d.reward_label, d.reward_details,
         (o.id is not distinct from v_open_id)
    from public.calendar_openings o
    join public.calendar_days d on d.id = o.day_id
    join public.calendars c on c.id = o.calendar_id
   where o.organization_id = p_organization_id
     and o.code = v_code
     and o.content_type = 'lot'
  union all
  select r.id, 'completion'::text, r.created_at, r.code, r.redeemed_at,
         c.name, c.completion_reward_label, c.completion_reward_details,
         (r.id is not distinct from v_reward_id)
    from public.calendar_rewards r
    join public.calendars c on c.id = r.calendar_id
   where r.organization_id = p_organization_id
     and r.code = v_code
  limit 1;
end;
$$;

revoke all on function public.redeem_calendar_reward(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_calendar_reward(uuid, text, text)
  to service_role;

-- ── Purge RGPD ───────────────────────────────────────────────
-- Miroir de purge_expired_event_sessions : supprime les JOUEURS (email opt-in +
-- hash) des calendriers ARCHIVÉS au-delà de la rétention de l'organisation. Les
-- calendar_openings cascadent (FK player on delete cascade). À brancher au cron
-- /api/cron/purge-data.
--
-- Divergence assumée (à relayer à security-review) : calendars, calendar_days et
-- calendar_rewards ne sont PAS supprimés par la purge — calendar_rewards ne
-- porte qu'un code et un lien vers un joueur (cascadé) ; le registre disparaît
-- avec le calendrier (cascade) ou l'organisation. Un commerçant qui n'archive
-- jamais son calendrier gèle la purge de ses joueurs : à relayer au backend (le
-- cron peut archiver les calendriers entièrement écoulés).
create or replace function public.purge_expired_calendar_players()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.calendar_players pl
  using public.calendars c, public.organizations o
  where pl.calendar_id = c.id
    and c.organization_id = o.id
    and c.status = 'archived'
    and o.data_retention_months is not null
    and pl.created_at < pg_catalog.now()
      - pg_catalog.make_interval(months => o.data_retention_months);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_calendar_players()
  from public, anon, authenticated;
grant execute on function public.purge_expired_calendar_players()
  to service_role;
