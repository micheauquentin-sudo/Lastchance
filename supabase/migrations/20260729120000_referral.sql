-- ============================================================
-- Lastchance — Module « Parrainage ludique »
--
-- Addon d'organisation (miroir EXACT d'addon_calendar / addon_loyalty…) : le
-- parrainage s'attache aux campagnes ROUE (parcours public play/[slug]). Un
-- joueur qui vient de jouer peut PARRAINER des amis. Quand un ami PARTICIPE
-- VRAIMENT — pas un simple clic — le parrain progresse : jauge collective de
-- l'ÉQUIPE (parrain + filleuls), coffre débloqué à un seuil, récompenses
-- configurables. Il n'y a PAS de classement : l'équipe partage jauge et coffre.
--
-- Récompenses CONFIG LIBRE (commerçant), 3 versements indépendants, chacun de
-- type none | spin | lot :
--   · sponsor : par filleul validé ;
--   · filleul : bonus de bienvenue au filleul ;
--   · chest   : au franchissement du seuil (une fois par parrain).
--   Type 'spin' = un TOUR OFFERT sur la roue de LA campagne (grant_token à usage
--   unique → consume_referral_spin_grant → flux de gain normal, code GAIN-…,
--   patron « grant de spin » de la fidélité / calendrier). Type 'lot' = code de
--   retrait PARRAIN-… à STOCK FINI (caisse). 'none' = rien.
--
-- IDENTITÉ JOUEUR (clé de tout) : le parcours roue est anonyme mais porte une
-- identité device stable — anonymousPlayerKey() = SHA-256(sel:"anonymous-device"
-- :uuid), cookie HTTP-only, SANS PII. C'est la clé du PARRAIN (sponsor_key) ET
-- du FILLEUL (filleul_key). La base ne stocke JAMAIS l'uuid brut, seulement ce
-- hash (64 hex). L'email (parrain / filleul) est la SEULE PII, optionnelle,
-- purgée par purge_expired_referral_data.
--
-- INVARIANTS ANTI-ABUS (validate_referral, le cœur — tout sous le verrou du
-- parrain, aucun émission en cas d'échec, aucune exception qui fuite) :
--   1. ANTI-CLIC — le filleul doit avoir VRAIMENT JOUÉ : p_proof_spin_id désigne
--      un spin RÉEL du filleul sur la roue de CETTE campagne — participant,
--      GAGNANT OU PERDANT (on N'EXIGE PAS de participation/claim : « participant »
--      suffit, « inscrit » n'est pas requis). Le simple chargement de page ne
--      suffit pas ; une preuve d'un autre device, d'une autre campagne, trop
--      ancienne ou inexistante → 'no_participation', rien émis. Un même spin ne
--      vaut qu'une fois (unique(proof_spin_id)).
--   2. SELF-PARRAINAGE — refus si filleul_key = sponsor_key (même device) OU
--      email filleul = email parrain (les deux présents).
--   3. FILLEUL UNIQUE — un device = un filleul par campagne (unique(campaign_id,
--      filleul_key)) ; dédup email (unique partiel (campaign_id, filleul_email)).
--   4. BOUCLE — refus de la RÉCIPROCITÉ DIRECTE (A→B→A) : si le filleul courant
--      est lui-même un parrain dont le parrain courant est un filleul. Profondeur
--      couverte : 1 (réciprocité directe) + auto-parrainage (profondeur 0). Les
--      cycles ≥ 3 (A→B→C→A) ne sont pas détectés — bornés par le plafond et la
--      période, coût d'attaque = autant de spins réels de devices distincts.
--   5. PLAFOND & PÉRIODE — validated_count < sponsor_max_filleuls (ADR-031) ET
--      now() ≤ created_at + window_days ; sinon 'capped' / 'expired', rien émis.
--   6. BORNE ÉCONOMIQUE (ADR-031) — chaque versement 'lot' porte un stock FINI
--      OBLIGATOIRE ; décrément ATOMIQUE conditionnel sur referral_programs (verrou
--      de ligne du programme), jamais de sur-émission. Stock épuisé → row
--      out_of_stock, aucun code.
--
-- Sécurité (même modèle que Calendrier / Fidélité / Jackpot) :
--   · AUCUN droit anon ; parcours public 100 % via service_role ;
--   · gestion commerçant (referral_programs) sous RLS is_org_member (lecture) /
--     is_org_editor (écriture), compteurs *_claimed_count RPC-only ;
--   · données joueurs (sponsors / signups / rewards) : lecture d'équipe, écriture
--     service role uniquement ;
--   · remise en caisse par redeem_referral_reward (miroir redeem_calendar_reward :
--     atomique, auditée, org-scopée, réponse indistinguable) ;
--   · rappel ADR-032 (IP partagée) : la borne d'abus est l'identité cookie + les
--     contraintes d'unicité, jamais un rate-limit fail-closed sur clé partagée.
--
-- TOUR OFFERT sur la roue de LA campagne (consume_referral_spin_grant) : miroir
-- du consume_loyalty_spin_grant DURCI (20260725200000) — un tour offert n'a ni
-- play_limit, ni Turnstile, ni fenêtre de jeu, sa SEULE borne est le décrément
-- d'un stock RÉEL : un lot à stock ILLIMITÉ est donc exclu du tirage (BORNE 2),
-- et la campagne doit être ACTIVE et dans son créneau (BORNE 3). Le spin inséré
-- (source 'referral') débouche sur le flux de gain normal (jeton HMAC →
-- claim_winning_spin → code GAIN-…). Le moteur existant n'est pas modifié ;
-- seule la valeur 'referral' s'ajoute à la contrainte spins.source.
-- ============================================================

-- ── Addon d'organisation ─────────────────────────────────────
alter table public.organizations
  add column addon_referral boolean not null default false;

-- `organizations` utilise des grants de colonnes (00017) : une colonne ajoutée
-- ensuite n'est pas lisible automatiquement par authenticated.
grant select (addon_referral) on public.organizations to authenticated;

comment on column public.organizations.addon_referral is
  'Module Parrainage ludique activé depuis le back-office (option payante, ou incluse dans un plan)';

-- ── Source de spin « referral » ──────────────────────────────
-- Un tour offert par un versement de parrainage insère un spin comme le flux
-- normal, mais journalisé distinctement (hors limite de jeu, hors stats
-- direct/share). Contrainte additive (état final calendrier :
-- 'direct','share','loyalty','calendar').
alter table public.spins drop constraint if exists spins_source_check;
alter table public.spins
  add constraint spins_source_check
  check (source in ('direct', 'share', 'loyalty', 'calendar', 'referral'));

-- ── Programmes de parrainage (1 par campagne, opt-in) ────────
create table public.referral_programs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Activation PAR CAMPAGNE (l'addon global reste le premier verrou).
  enabled boolean not null default false,
  -- Seuil du coffre (nombre de filleuls validés déclenchant le versement chest).
  chest_threshold integer not null default 3 check (chest_threshold between 2 and 50),
  -- Plafond de filleuls comptés par parrain (ADR-031 : borne le nombre de
  -- versements sponsor qu'un parrain peut générer).
  sponsor_max_filleuls integer not null default 20
    check (sponsor_max_filleuls between 1 and 1000),
  -- Période de validité du parrainage après création du parrain (jours).
  window_days integer not null default 30 check (window_days between 1 and 365),
  -- Versement SPONSOR (par filleul validé).
  sponsor_reward_kind text not null default 'none'
    check (sponsor_reward_kind in ('none', 'spin', 'lot')),
  sponsor_reward_label text not null default ''
    check (char_length(btrim(sponsor_reward_label)) <= 120),
  sponsor_reward_details text
    check (sponsor_reward_details is null or char_length(sponsor_reward_details) <= 2000),
  sponsor_reward_stock integer
    check (sponsor_reward_stock is null or sponsor_reward_stock >= 0),
  sponsor_reward_claimed_count integer not null default 0
    check (sponsor_reward_claimed_count >= 0),
  -- Versement FILLEUL (bonus de bienvenue).
  filleul_reward_kind text not null default 'none'
    check (filleul_reward_kind in ('none', 'spin', 'lot')),
  filleul_reward_label text not null default ''
    check (char_length(btrim(filleul_reward_label)) <= 120),
  filleul_reward_details text
    check (filleul_reward_details is null or char_length(filleul_reward_details) <= 2000),
  filleul_reward_stock integer
    check (filleul_reward_stock is null or filleul_reward_stock >= 0),
  filleul_reward_claimed_count integer not null default 0
    check (filleul_reward_claimed_count >= 0),
  -- Versement CHEST (au seuil, une fois par parrain).
  chest_reward_kind text not null default 'none'
    check (chest_reward_kind in ('none', 'spin', 'lot')),
  chest_reward_label text not null default ''
    check (char_length(btrim(chest_reward_label)) <= 120),
  chest_reward_details text
    check (chest_reward_details is null or char_length(chest_reward_details) <= 2000),
  chest_reward_stock integer
    check (chest_reward_stock is null or chest_reward_stock >= 0),
  chest_reward_claimed_count integer not null default 0
    check (chest_reward_claimed_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un seul programme par campagne.
  unique (campaign_id),
  -- Support des FK composites tenant (même modèle que calendrier).
  unique (id, organization_id),
  -- Campagne dans la MÊME organisation (anti cross-tenant).
  foreign key (campaign_id, organization_id)
    references public.campaigns(id, organization_id) on delete cascade,
  -- VERROU ÉCONOMIQUE (ADR-031) : un versement 'lot' EXIGE un stock FINI. 'spin'
  -- et 'none' laissent le stock nullable — un tour offert est borné par le
  -- tirage à stock réel de la roue (consume_referral_spin_grant, BORNE 2).
  constraint referral_programs_sponsor_lot_stock_check check (
    sponsor_reward_kind <> 'lot' or sponsor_reward_stock is not null),
  constraint referral_programs_filleul_lot_stock_check check (
    filleul_reward_kind <> 'lot' or filleul_reward_stock is not null),
  constraint referral_programs_chest_lot_stock_check check (
    chest_reward_kind <> 'lot' or chest_reward_stock is not null)
);

comment on table public.referral_programs is
  'Programme de parrainage d''une campagne roue (opt-in) : seuil de coffre, plafond/période par parrain, 3 versements configurables (none/spin/lot) sponsor/filleul/chest. Parcours joueur via RPC service role uniquement.';
comment on column public.referral_programs.sponsor_reward_stock is
  'Stock du versement sponsor — OBLIGATOIRE et FINI si kind=''lot'' (ADR-031), nullable (illimité) si ''spin''/''none''. Décrémenté atomiquement via referral_programs_sponsor_reward_claimed_count par validate_referral.';
comment on column public.referral_programs.sponsor_reward_claimed_count is
  'Versements sponsor déjà émis (RPC-only : validate_referral, jamais accordé à authenticated). Borne sponsor_reward_stock.';

create index referral_programs_org_idx on public.referral_programs (organization_id);

-- ── Parrains (identité cookie ; jeton partageable) ───────────
create table public.referral_sponsors (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Hash SHA-256 du cookie device du parrain (aucune PII).
  sponsor_key text not null check (sponsor_key ~ '^[0-9a-f]{64}$'),
  -- Jeton partageable (URL/QR). Alphabet sans ambiguïté (sans I/O/0/1), préfixe
  -- PR-, généré côté SQL (gen_random_bytes). Unique tous parrains confondus.
  referral_code text not null unique
    check (referral_code ~ '^PR-[A-HJ-NP-Z2-9]{8}$'),
  -- Email opt-in du parrain (PII, purgée). Validation légère (présence d'un @).
  sponsor_email text
    check (sponsor_email is null or (char_length(sponsor_email) between 3 and 320 and sponsor_email like '%@%')),
  -- Jauge de l'équipe (nombre de filleuls validés). Maintenue par validate_referral.
  validated_count integer not null default 0 check (validated_count >= 0),
  -- Coffre déjà versé (idempotence du versement chest).
  chest_rewarded boolean not null default false,
  created_at timestamptz not null default now(),
  -- Un parrain par (campagne, device).
  unique (campaign_id, sponsor_key),
  -- FK composites tenant depuis referral_signups / referral_rewards.
  unique (id, organization_id),
  unique (id, campaign_id, organization_id),
  foreign key (campaign_id, organization_id)
    references public.campaigns(id, organization_id) on delete cascade
);

comment on table public.referral_sponsors is
  'Parrain d''une campagne : hash device (sponsor_key) + jeton partageable PR-… + email opt-in facultatif. validated_count = jauge de l''équipe, chest_rewarded = coffre déjà versé. Créé/renvoyé par ensure_referral_sponsor.';

create index referral_sponsors_org_idx on public.referral_sponsors (organization_id);
create index referral_sponsors_campaign_idx on public.referral_sponsors (campaign_id);

-- ── Filleuls validés (preuve de participation réelle) ────────
create table public.referral_signups (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sponsor_id uuid not null,
  -- Hash device du filleul (aucune PII).
  filleul_key text not null check (filleul_key ~ '^[0-9a-f]{64}$'),
  -- Email opt-in du filleul (PII, purgée).
  filleul_email text
    check (filleul_email is null or (char_length(filleul_email) between 3 and 320 and filleul_email like '%@%')),
  -- ANTI-CLIC : le spin RÉEL (gagnant OU perdant) qui prouve que le filleul a
  -- VRAIMENT JOUÉ. Un même spin ne valide qu'un filleul (unique).
  proof_spin_id uuid not null references public.spins(id) on delete cascade,
  -- IP d'observation (facultative, jamais une clé de rate-limit).
  ip text check (ip is null or char_length(ip) <= 45),
  created_at timestamptz not null default now(),
  -- Un device = un filleul par campagne.
  unique (campaign_id, filleul_key),
  -- Une preuve = un filleul (anti-réutilisation d'un même spin).
  unique (proof_spin_id),
  -- FK composite tenant depuis referral_rewards.
  unique (id, organization_id),
  foreign key (sponsor_id, campaign_id, organization_id)
    references public.referral_sponsors(id, campaign_id, organization_id) on delete cascade,
  foreign key (campaign_id, organization_id)
    references public.campaigns(id, organization_id) on delete cascade
);

comment on table public.referral_signups is
  'Filleul VALIDÉ : rattaché à un parrain, prouvé par proof_spin_id (un spin RÉEL du filleul sur la campagne, gagnant ou perdant — le filleul a vraiment joué). Un device et une preuve uniques par campagne. Créé par validate_referral.';

-- Dédup email des filleuls (partiel : les emails null ne se collisionnent pas).
create unique index referral_signups_campaign_email_uidx
  on public.referral_signups (campaign_id, filleul_email)
  where filleul_email is not null;

create index referral_signups_org_idx on public.referral_signups (organization_id);
create index referral_signups_sponsor_idx on public.referral_signups (sponsor_id);
create index referral_signups_campaign_idx on public.referral_signups (campaign_id);

-- ── Versements émis (miroir loyalty_rewards + grant) ─────────
create table public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Bénéficiaire parrain/chest → sponsor_id ; filleul → signup_id (nullable pour
  -- l'autre cas). Le triplet reste org-scopé par les FK composites.
  sponsor_id uuid,
  signup_id uuid,
  beneficiary text not null check (beneficiary in ('sponsor', 'filleul', 'chest')),
  kind text not null check (kind in ('spin', 'lot')),
  -- 'lot' : code de retrait présenté en caisse. Même alphabet que GAIN-/CADEAU-…
  -- (sans I/O/0/1), préfixe distinct PARRAIN- pour le routage caisse. NULL si
  -- rupture de stock (out_of_stock).
  code text unique
    check (code is null or code ~ '^PARRAIN-[A-HJ-NP-Z2-9]{8}$'),
  redeemed_at timestamptz,
  redeemed_by text check (redeemed_by is null or char_length(redeemed_by) <= 120),
  -- 'spin' : jeton de tour offert à usage unique (48 hex), échangé par
  -- consume_referral_spin_grant contre un tirage sur la roue de la campagne.
  spin_grant_token text unique
    check (spin_grant_token is null or spin_grant_token ~ '^[0-9a-f]{48}$'),
  grant_consumed_at timestamptz,
  resulting_spin_id uuid references public.spins(id) on delete set null,
  -- Le versement 'lot' était en rupture au moment de l'émission (aucun code).
  out_of_stock boolean not null default false,
  created_at timestamptz not null default now(),
  -- Cohérence état ↔ capacité : émission 'lot' (code), émission 'spin' (grant),
  -- ou rupture (ni code ni grant). Jamais les deux.
  constraint referral_rewards_shape_check check (
    (out_of_stock and code is null and spin_grant_token is null)
    or (not out_of_stock and kind = 'lot' and code is not null and spin_grant_token is null)
    or (not out_of_stock and kind = 'spin' and spin_grant_token is not null and code is null)
  ),
  foreign key (sponsor_id, organization_id)
    references public.referral_sponsors(id, organization_id) on delete cascade,
  foreign key (signup_id, organization_id)
    references public.referral_signups(id, organization_id) on delete cascade,
  foreign key (campaign_id, organization_id)
    references public.campaigns(id, organization_id) on delete cascade
);

comment on table public.referral_rewards is
  'Versement émis : parrain / filleul / chest, ''lot'' (code PARRAIN-… remis via redeem_referral_reward) ou ''spin'' (grant_token consommé via consume_referral_spin_grant → resulting_spin_id). out_of_stock=true = rupture au moment de l''émission (aucun code).';

create index referral_rewards_org_idx on public.referral_rewards (organization_id);
create index referral_rewards_sponsor_idx on public.referral_rewards (sponsor_id);
create index referral_rewards_signup_idx on public.referral_rewards (signup_id);
create index referral_rewards_campaign_idx on public.referral_rewards (campaign_id);

-- ── RLS et grants ────────────────────────────────────────────
alter table public.referral_programs enable row level security;
alter table public.referral_sponsors enable row level security;
alter table public.referral_signups enable row level security;
alter table public.referral_rewards enable row level security;

revoke all on table public.referral_programs from public, anon, authenticated;
revoke all on table public.referral_sponsors from public, anon, authenticated;
revoke all on table public.referral_signups from public, anon, authenticated;
revoke all on table public.referral_rewards from public, anon, authenticated;

-- Programme : CRUD éditeurs, lecture d'équipe.
create policy "referral_programs: member select" on public.referral_programs
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "referral_programs: editor write" on public.referral_programs
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- Données joueurs : lecture d'équipe (dashboard / stats / caisse), écritures
-- service role uniquement.
create policy "referral_sponsors: member select" on public.referral_sponsors
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "referral_signups: member select" on public.referral_signups
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "referral_rewards: member select" on public.referral_rewards
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Programme : select complet (équipe) ; insert/update RESTREINTS aux colonnes
-- éditables. Les compteurs *_claimed_count sont RPC-only (validate_referral).
grant select on table public.referral_programs to authenticated;
grant insert (campaign_id, organization_id, enabled, chest_threshold,
              sponsor_max_filleuls, window_days,
              sponsor_reward_kind, sponsor_reward_label, sponsor_reward_details, sponsor_reward_stock,
              filleul_reward_kind, filleul_reward_label, filleul_reward_details, filleul_reward_stock,
              chest_reward_kind, chest_reward_label, chest_reward_details, chest_reward_stock)
  on public.referral_programs to authenticated;
grant update (enabled, chest_threshold, sponsor_max_filleuls, window_days,
              sponsor_reward_kind, sponsor_reward_label, sponsor_reward_details, sponsor_reward_stock,
              filleul_reward_kind, filleul_reward_label, filleul_reward_details, filleul_reward_stock,
              chest_reward_kind, chest_reward_label, chest_reward_details, chest_reward_stock,
              updated_at)
  on public.referral_programs to authenticated;
grant delete on public.referral_programs to authenticated;

-- Données joueurs : lecture seule côté marchand.
grant select on table public.referral_sponsors to authenticated;
grant select on table public.referral_signups to authenticated;
grant select on table public.referral_rewards to authenticated;

grant select, insert, update, delete on table public.referral_programs to service_role;
grant select, insert, update, delete on table public.referral_sponsors to service_role;
grant select, insert, update, delete on table public.referral_signups to service_role;
grant select, insert, update, delete on table public.referral_rewards to service_role;

-- Mutations commerçant auditées (miroir des autres modules).
create trigger referral_programs_merchant_audit
  after insert or update or delete on public.referral_programs
  for each row execute function public.audit_merchant_mutation();

-- ============================================================
-- Helper INTERNE : émettre un versement (service_role, definer)
-- Décrément ATOMIQUE conditionnel du stock du programme (verrou de ligne
-- referral_programs) puis émission code PARRAIN-… ('lot') ou grant_token
-- ('spin'). Rupture → row out_of_stock, aucun code. N'est JAMAIS appelé pour
-- kind='none'. Appelé uniquement par validate_referral (déjà autorisée).
-- Renvoie jsonb { kind, rewarded, code? | grant? | out_of_stock? }.
-- ============================================================
create or replace function public.referral_emit_reward(
  p_program_id uuid,
  p_campaign_id uuid,
  p_organization_id uuid,
  p_beneficiary text,
  p_kind text,
  p_sponsor_id uuid,
  p_signup_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean := false;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_grant text;
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  -- Défense en profondeur : bien que revoke public/anon/authenticated, le claim
  -- de session (auth.role()) se propage à cet appel imbriqué depuis
  -- validate_referral — refuse tout appel hors service_role.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  -- Décrément atomique conditionnel : incrémente le compteur du bénéficiaire
  -- SEULEMENT s'il reste du stock (null = illimité, réservé à 'spin'/'none').
  -- L'UPDATE pose un verrou de ligne : sûr entre parrains concurrents.
  update public.referral_programs p
     set sponsor_reward_claimed_count = p.sponsor_reward_claimed_count
           + (case when p_beneficiary = 'sponsor' then 1 else 0 end),
         filleul_reward_claimed_count = p.filleul_reward_claimed_count
           + (case when p_beneficiary = 'filleul' then 1 else 0 end),
         chest_reward_claimed_count = p.chest_reward_claimed_count
           + (case when p_beneficiary = 'chest' then 1 else 0 end)
   where p.id = p_program_id
     and (case p_beneficiary
            when 'sponsor' then p.sponsor_reward_stock is null
                                or p.sponsor_reward_claimed_count < p.sponsor_reward_stock
            when 'filleul' then p.filleul_reward_stock is null
                                or p.filleul_reward_claimed_count < p.filleul_reward_stock
            when 'chest'   then p.chest_reward_stock is null
                                or p.chest_reward_claimed_count < p.chest_reward_stock
            else false end);
  v_ok := found;

  if not v_ok then
    -- Rupture de stock : row de traçabilité, aucun code/grant.
    insert into public.referral_rewards
      (campaign_id, organization_id, sponsor_id, signup_id, beneficiary, kind, out_of_stock)
    values (p_campaign_id, p_organization_id, p_sponsor_id, p_signup_id,
            p_beneficiary, p_kind, true);
    return pg_catalog.jsonb_build_object(
      'kind', p_kind, 'rewarded', false, 'out_of_stock', true);
  end if;

  if p_kind = 'lot' then
    v_code := null;
    for attempt in 1..8 loop
      v_bytes := extensions.gen_random_bytes(8);
      v_code := 'PARRAIN-';
      for i in 0..7 loop
        v_code := v_code || pg_catalog.substr(
          v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
      end loop;
      begin
        insert into public.referral_rewards
          (campaign_id, organization_id, sponsor_id, signup_id, beneficiary, kind, code)
        values (p_campaign_id, p_organization_id, p_sponsor_id, p_signup_id,
                p_beneficiary, 'lot', v_code);
        exit;
      exception when unique_violation then
        v_code := null;
      end;
    end loop;
    if v_code is null then
      raise exception 'referral code generation exhausted';
    end if;
    return pg_catalog.jsonb_build_object(
      'kind', 'lot', 'rewarded', true, 'code', v_code);
  else
    v_grant := null;
    for attempt in 1..8 loop
      v_grant := pg_catalog.encode(extensions.gen_random_bytes(24), 'hex');
      begin
        insert into public.referral_rewards
          (campaign_id, organization_id, sponsor_id, signup_id, beneficiary, kind, spin_grant_token)
        values (p_campaign_id, p_organization_id, p_sponsor_id, p_signup_id,
                p_beneficiary, 'spin', v_grant);
        exit;
      exception when unique_violation then
        v_grant := null;
      end;
    end loop;
    if v_grant is null then
      raise exception 'referral grant generation exhausted';
    end if;
    return pg_catalog.jsonb_build_object(
      'kind', 'spin', 'rewarded', true, 'grant', v_grant);
  end if;
end;
$$;

revoke all on function public.referral_emit_reward(uuid, uuid, uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.referral_emit_reward(uuid, uuid, uuid, text, text, uuid, uuid)
  to service_role;

-- ============================================================
-- RPC parcours JOUEUR (service_role uniquement)
-- ============================================================

-- ── ensure_referral_sponsor ──────────────────────────────────
-- Get-or-create le parrain de cette campagne pour cette clé device. Exige
-- addon + programme.enabled + campagne active (sinon 'unavailable', pas
-- d'oracle). Idempotent : re-appel = même referral_code. Fait MONTER l'email si
-- fourni (jamais l'effacer). Renvoie la config publique du programme (labels des
-- paliers, seuil) pour la page parrain.
create or replace function public.ensure_referral_sponsor(
  p_campaign_id uuid,
  p_sponsor_key text,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.referral_programs%rowtype;
  v_sponsor public.referral_sponsors%rowtype;
  v_email text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_sponsor_key is null or p_sponsor_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid sponsor key';
  end if;

  -- Programme actif de la campagne (addon + enabled + campagne active).
  select p.* into v_prog
    from public.referral_programs p
    join public.organizations o on o.id = p.organization_id
    join public.campaigns c
      on c.id = p.campaign_id and c.organization_id = p.organization_id
   where p.campaign_id = p_campaign_id
     and o.addon_referral
     and p.enabled
     and c.status = 'active'
     and (c.starts_at is null or c.starts_at <= pg_catalog.now())
     and (c.ends_at is null or c.ends_at >= pg_catalog.now());
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Email nettoyé (opt-in). Coercition silencieuse vers null si invalide.
  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null and (pg_catalog.length(v_email) > 320 or v_email not like '%@%') then
    v_email := null;
  end if;

  -- Parrain existant : fait MONTER l'email si fourni (jamais l'effacer).
  select s.* into v_sponsor
    from public.referral_sponsors s
   where s.campaign_id = p_campaign_id and s.sponsor_key = p_sponsor_key;
  if not found then
    -- Création : jeton PR-… unique (retry sur collision de code). Une insertion
    -- concurrente pour la même clé est rattrapée par unique(campaign_id,
    -- sponsor_key) → on relit la ligne gagnante.
    for attempt in 1..12 loop
      v_code := 'PR-';
      v_bytes := extensions.gen_random_bytes(8);
      for i in 0..7 loop
        v_code := v_code || pg_catalog.substr(
          v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
      end loop;
      begin
        insert into public.referral_sponsors
          (campaign_id, organization_id, sponsor_key, referral_code, sponsor_email)
        values (v_prog.campaign_id, v_prog.organization_id, p_sponsor_key, v_code, v_email)
        returning * into v_sponsor;
        exit;
      exception when unique_violation then
        -- Soit la clé existe déjà (course), soit le code a collisionné.
        select s.* into v_sponsor
          from public.referral_sponsors s
         where s.campaign_id = p_campaign_id and s.sponsor_key = p_sponsor_key;
        if found then exit; end if;
        v_sponsor.id := null;
      end;
    end loop;
    if v_sponsor.id is null then
      raise exception 'referral sponsor code generation exhausted';
    end if;
  elsif v_email is not null and v_sponsor.sponsor_email is distinct from v_email then
    update public.referral_sponsors
       set sponsor_email = coalesce(sponsor_email, v_email)
     where id = v_sponsor.id
     returning * into v_sponsor;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ready',
    'referral_code', v_sponsor.referral_code,
    'validated_count', v_sponsor.validated_count,
    'chest_threshold', v_prog.chest_threshold,
    'chest_rewarded', v_sponsor.chest_rewarded,
    'gauge', v_sponsor.validated_count,
    'has_email', (v_sponsor.sponsor_email is not null),
    'program', pg_catalog.jsonb_build_object(
      'chest_threshold', v_prog.chest_threshold,
      'sponsor_reward_kind', v_prog.sponsor_reward_kind,
      'sponsor_reward_label', v_prog.sponsor_reward_label,
      'filleul_reward_kind', v_prog.filleul_reward_kind,
      'filleul_reward_label', v_prog.filleul_reward_label,
      'chest_reward_kind', v_prog.chest_reward_kind,
      'chest_reward_label', v_prog.chest_reward_label)
  );
end;
$$;

revoke all on function public.ensure_referral_sponsor(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.ensure_referral_sponsor(uuid, text, text)
  to service_role;

-- ── referral_public_state ────────────────────────────────────
-- État suivable du PARRAIN : jauge, seuil, coffre, et SES versements/codes
-- émis (jamais ceux d'un autre parrain — non-fuite). Parrain inconnu → jauge 0.
create or replace function public.referral_public_state(
  p_campaign_id uuid,
  p_sponsor_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.referral_programs%rowtype;
  v_sponsor public.referral_sponsors%rowtype;
  v_has_sponsor boolean := false;
  v_rewards jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select p.* into v_prog
    from public.referral_programs p
   where p.campaign_id = p_campaign_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if p_sponsor_key is not null and p_sponsor_key ~ '^[0-9a-f]{64}$' then
    select s.* into v_sponsor
      from public.referral_sponsors s
     where s.campaign_id = p_campaign_id and s.sponsor_key = p_sponsor_key;
    v_has_sponsor := found;
  end if;

  -- SES versements uniquement (sponsor + chest attachés à SON id). Les versements
  -- filleul (attachés au signup, donc à un autre device) ne sont JAMAIS exposés
  -- ici : la page parrain ne voit que ses propres codes/jetons (non-fuite).
  if v_has_sponsor then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'beneficiary', r.beneficiary,
             'kind', r.kind,
             'code', r.code,
             'spin_grant_token', r.spin_grant_token,
             'grant_consumed_at', r.grant_consumed_at,
             'resulting_spin_id', r.resulting_spin_id,
             'redeemed_at', r.redeemed_at,
             'out_of_stock', r.out_of_stock,
             'created_at', r.created_at) order by r.created_at), '[]'::jsonb)
      into v_rewards
      from public.referral_rewards r
     where r.sponsor_id = v_sponsor.id
       and r.beneficiary in ('sponsor', 'chest');
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'campaign_id', p_campaign_id,
    'gauge', case when v_has_sponsor then v_sponsor.validated_count else 0 end,
    'validated_count', case when v_has_sponsor then v_sponsor.validated_count else 0 end,
    'chest_threshold', v_prog.chest_threshold,
    'chest_rewarded', case when v_has_sponsor then v_sponsor.chest_rewarded else false end,
    'referral_code', case when v_has_sponsor then v_sponsor.referral_code else null end,
    'program', pg_catalog.jsonb_build_object(
      'sponsor_reward_kind', v_prog.sponsor_reward_kind,
      'sponsor_reward_label', v_prog.sponsor_reward_label,
      'filleul_reward_kind', v_prog.filleul_reward_kind,
      'filleul_reward_label', v_prog.filleul_reward_label,
      'chest_reward_kind', v_prog.chest_reward_kind,
      'chest_reward_label', v_prog.chest_reward_label),
    'rewards', v_rewards
  );
end;
$$;

revoke all on function public.referral_public_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.referral_public_state(uuid, text) to service_role;

-- ── validate_referral (LE CŒUR) ──────────────────────────────
-- Sous le verrou du parrain (FOR UPDATE). Applique TOUTES les protections
-- (échec = jsonb d'état SANS émettre, jamais d'exception qui fuite). États :
--   'unavailable' (addon/enabled/campagne) · 'invalid' (code) · 'expired' ·
--   'capped' · 'self_referral' · 'duplicate' · 'loop' · 'no_participation' ·
--   'validated'.
-- Signature : les paramètres SANS défaut d'abord (contrainte PostgreSQL) —
--   (p_campaign_id, p_referral_code, p_filleul_key, p_proof_spin_id,
--    p_filleul_email default null, p_ip default null).
create or replace function public.validate_referral(
  p_campaign_id uuid,
  p_referral_code text,
  p_filleul_key text,
  p_proof_spin_id uuid,
  p_filleul_email text default null,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.referral_programs%rowtype;
  v_sponsor public.referral_sponsors%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_email text;
  v_signup_id uuid;
  v_new_count integer;
  v_sponsor_reward jsonb;
  v_filleul_reward jsonb;
  v_chest_reward jsonb := null;
  v_chest_unlocked boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_filleul_key is null or p_filleul_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid filleul key';
  end if;

  -- Gating : addon + programme.enabled + campagne active. Réponse 'unavailable'
  -- identique quel que soit le motif (pas d'oracle).
  select p.* into v_prog
    from public.referral_programs p
    join public.organizations o on o.id = p.organization_id
    join public.campaigns c
      on c.id = p.campaign_id and c.organization_id = p.organization_id
   where p.campaign_id = p_campaign_id
     and o.addon_referral
     and p.enabled
     and c.status = 'active'
     and (c.starts_at is null or c.starts_at <= v_now)
     and (c.ends_at is null or c.ends_at >= v_now);
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Parrain résolu par le code (dans CETTE campagne) et VERROUILLÉ : sérialise
  -- l'attribution des versements de ce parrain (jauge, coffre).
  select s.* into v_sponsor
    from public.referral_sponsors s
   where s.campaign_id = p_campaign_id
     and s.referral_code = pg_catalog.upper(pg_catalog.btrim(coalesce(p_referral_code, '')))
   for update;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'invalid');
  end if;

  -- PÉRIODE : parrainage clos au-delà de window_days après la création du parrain.
  if v_now > v_sponsor.created_at
       + pg_catalog.make_interval(days => v_prog.window_days) then
    return pg_catalog.jsonb_build_object('state', 'expired');
  end if;

  -- PLAFOND : nombre de filleuls comptés par parrain (ADR-031).
  if v_sponsor.validated_count >= v_prog.sponsor_max_filleuls then
    return pg_catalog.jsonb_build_object('state', 'capped');
  end if;

  -- SELF-PARRAINAGE (même device).
  if p_filleul_key = v_sponsor.sponsor_key then
    return pg_catalog.jsonb_build_object('state', 'self_referral');
  end if;

  -- Email filleul nettoyé (opt-in).
  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_filleul_email, ''))), '');
  if v_email is not null and (pg_catalog.length(v_email) > 320 or v_email not like '%@%') then
    v_email := null;
  end if;

  -- SELF-PARRAINAGE (même email, si les deux présents).
  if v_email is not null and v_sponsor.sponsor_email is not null
     and v_email = pg_catalog.lower(v_sponsor.sponsor_email) then
    return pg_catalog.jsonb_build_object('state', 'self_referral');
  end if;

  -- FILLEUL UNIQUE (device) puis (email) sur cette campagne.
  if exists (
    select 1 from public.referral_signups sg
     where sg.campaign_id = p_campaign_id and sg.filleul_key = p_filleul_key
  ) then
    return pg_catalog.jsonb_build_object('state', 'duplicate');
  end if;
  if v_email is not null and exists (
    select 1 from public.referral_signups sg
     where sg.campaign_id = p_campaign_id and sg.filleul_email = v_email
  ) then
    return pg_catalog.jsonb_build_object('state', 'duplicate');
  end if;

  -- BOUCLE (réciprocité directe A→B→A) : le filleul courant est-il un parrain
  -- dont le parrain courant a été un filleul ?
  if exists (
    select 1 from public.referral_signups sg
    join public.referral_sponsors sp on sp.id = sg.sponsor_id
   where sg.campaign_id = p_campaign_id
     and sp.sponsor_key = p_filleul_key
     and sg.filleul_key = v_sponsor.sponsor_key
  ) then
    return pg_catalog.jsonb_build_object('state', 'loop');
  end if;

  -- ANTI-CLIC : le proof_spin doit être un SPIN RÉEL du filleul sur la roue de
  -- CETTE campagne — le filleul a VRAIMENT JOUÉ (participant), qu'il ait GAGNÉ
  -- ou PERDU. On N'EXIGE PAS de participation/claim : « participant » suffit,
  -- « inscrit » n'est pas requis. Le simple clic reste exclu (il faut un spin
  -- réel du DEVICE filleul, rate-limité en amont), récent (fenêtre du programme)
  -- et non réutilisé (unique(proof_spin_id)). Preuve d'un AUTRE device, d'une
  -- AUTRE campagne, trop ancienne ou inexistante → 'no_participation', rien émis.
  if not exists (
    select 1
      from public.spins s
     where s.id = p_proof_spin_id
       and s.player_key = p_filleul_key
       and s.campaign_id = p_campaign_id
       and s.created_at >= v_now - pg_catalog.make_interval(days => v_prog.window_days)
  ) then
    return pg_catalog.jsonb_build_object('state', 'no_participation');
  end if;

  -- Insertion du filleul validé. Une course concurrente (même device / même
  -- email / même preuve) est rattrapée par les contraintes d'unicité → duplicate.
  begin
    insert into public.referral_signups
      (campaign_id, organization_id, sponsor_id, filleul_key, filleul_email, proof_spin_id, ip)
    values (p_campaign_id, v_prog.organization_id, v_sponsor.id, p_filleul_key, v_email,
            p_proof_spin_id, nullif(pg_catalog.btrim(coalesce(p_ip, '')), ''))
    returning id into v_signup_id;
  exception when unique_violation then
    return pg_catalog.jsonb_build_object('state', 'duplicate');
  end;

  -- Jauge de l'équipe +1.
  update public.referral_sponsors
     set validated_count = validated_count + 1
   where id = v_sponsor.id
   returning validated_count into v_new_count;

  -- Versement SPONSOR (par filleul validé).
  if v_prog.sponsor_reward_kind = 'none' then
    v_sponsor_reward := pg_catalog.jsonb_build_object('kind', 'none', 'rewarded', false);
  else
    v_sponsor_reward := public.referral_emit_reward(
      v_prog.id, p_campaign_id, v_prog.organization_id,
      'sponsor', v_prog.sponsor_reward_kind, v_sponsor.id, v_signup_id);
  end if;

  -- Versement FILLEUL (bonus de bienvenue).
  if v_prog.filleul_reward_kind = 'none' then
    v_filleul_reward := pg_catalog.jsonb_build_object('kind', 'none', 'rewarded', false);
  else
    v_filleul_reward := public.referral_emit_reward(
      v_prog.id, p_campaign_id, v_prog.organization_id,
      'filleul', v_prog.filleul_reward_kind, v_sponsor.id, v_signup_id);
  end if;

  -- COFFRE : au seuil, une seule fois par parrain.
  if v_new_count >= v_prog.chest_threshold and not v_sponsor.chest_rewarded then
    v_chest_unlocked := true;
    if v_prog.chest_reward_kind = 'none' then
      v_chest_reward := pg_catalog.jsonb_build_object('kind', 'none', 'rewarded', false);
    else
      v_chest_reward := public.referral_emit_reward(
        v_prog.id, p_campaign_id, v_prog.organization_id,
        'chest', v_prog.chest_reward_kind, v_sponsor.id, null);
    end if;
    update public.referral_sponsors set chest_rewarded = true where id = v_sponsor.id;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'validated',
    'gauge', v_new_count,
    'chest_threshold', v_prog.chest_threshold,
    'sponsor_rewarded', coalesce((v_sponsor_reward->>'rewarded')::boolean, false),
    'chest_unlocked', v_chest_unlocked,
    'sponsor_reward', v_sponsor_reward,
    'filleul_reward', v_filleul_reward,
    'chest_reward', v_chest_reward
  );
end;
$$;

revoke all on function public.validate_referral(uuid, text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.validate_referral(uuid, text, text, uuid, text, text)
  to service_role;

-- ── consume_referral_spin_grant ──────────────────────────────
-- Miroir du consume_loyalty_spin_grant DURCI (20260725200000) : échange un
-- grant_token à usage unique contre EXACTEMENT un tirage pondéré atomique sur la
-- roue ACTIVE de la campagne, SANS limite de jeu. Le jeton est lié au DEVICE du
-- bénéficiaire (défense en profondeur : parrain/chest → sponsor_key ; filleul →
-- filleul_key). Anti-rejeu : verrou FOR UPDATE du versement (grant_consumed_at).
--   BORNE 2 — un lot à stock ILLIMITÉ (stock is null) est EXCLU du tirage : le
--     tour offert n'a aucune borne propre, son seul plafond est le décrément
--     d'un stock RÉEL (sinon → no_prize, grant NON consommé, rejouable).
--   BORNE 3 — campagne active + fenêtre de dates + créneau de la roue, comme le
--     parcours public sain. Fermée → 'unavailable' SANS consommer le grant.
-- Le spin inséré (source 'referral') débouche sur le flux de gain normal.
--   Réponse jsonb : 'unavailable' | 'already_consumed' | 'no_prize' | 'spun'
--   (+ spin_id, wheel_id, prize_id, is_losing).
create or replace function public.consume_referral_spin_grant(
  p_campaign_id uuid,
  p_key text,
  p_grant_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward public.referral_rewards%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_wheel_id uuid;
  v_org_id uuid;
  v_camp_status text;
  v_camp_starts timestamptz;
  v_camp_ends timestamptz;
  v_timezone text;
  v_sched_start smallint;
  v_sched_end smallint;
  v_sched_days smallint[];
  v_local timestamp;
  v_dow integer;
  v_hour integer;
  v_start integer;
  v_end integer;
  v_ref_day integer;
  v_in_window boolean;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid key';
  end if;

  -- Versement 'spin' résolu par le jeton, dans CETTE campagne, ET lié au DEVICE
  -- appelant selon le bénéficiaire (le jeton seul, sans le bon cookie, ne suffit
  -- pas). Verrou de ligne : anti-rejeu.
  select r.* into v_reward
    from public.referral_rewards r
    left join public.referral_sponsors sp
      on sp.id = r.sponsor_id and sp.organization_id = r.organization_id
    left join public.referral_signups sg
      on sg.id = r.signup_id and sg.organization_id = r.organization_id
   where r.campaign_id = p_campaign_id
     and r.kind = 'spin'
     and r.spin_grant_token = pg_catalog.btrim(coalesce(p_grant_token, ''))
     and (
       (r.beneficiary in ('sponsor', 'chest') and sp.sponsor_key = p_key)
       or (r.beneficiary = 'filleul' and sg.filleul_key = p_key)
     )
   for update of r;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_reward.grant_consumed_at is not null then
    return pg_catalog.jsonb_build_object(
      'state', 'already_consumed', 'spin_id', v_reward.resulting_spin_id);
  end if;

  -- Roue ACTIVE de la campagne (une roue par campagne), AVEC sa campagne, son
  -- créneau et le fuseau de l'organisation.
  select w.id, w.organization_id,
         w.schedule_start_hour, w.schedule_end_hour, w.schedule_days,
         c.status, c.starts_at, c.ends_at, o.timezone
    into v_wheel_id, v_org_id,
         v_sched_start, v_sched_end, v_sched_days,
         v_camp_status, v_camp_starts, v_camp_ends, v_timezone
    from public.wheels w
    join public.campaigns c
      on c.id = w.campaign_id and c.organization_id = w.organization_id
    join public.organizations o on o.id = w.organization_id
   where w.campaign_id = p_campaign_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- BORNE 3 — statut et fenêtre de la campagne (comme loadPlayContext). Fermée :
  -- on sort AVANT toute écriture, le grant reste intact (rejouable).
  if v_camp_status <> 'active'
     or (v_camp_starts is not null and v_camp_starts > v_now)
     or (v_camp_ends is not null and v_camp_ends < v_now) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Créneau horaire de la roue (00013 ; miroir de wheelMatchesNow) évalué dans le
  -- fuseau de l'organisation. `schedule_days` : 0 = dimanche (convention JS/dow).
  v_local := v_now at time zone v_timezone;
  v_dow := extract(dow from v_local)::integer;
  v_hour := extract(hour from v_local)::integer;
  if v_sched_start is null and v_sched_end is null then
    v_in_window := pg_catalog.array_length(v_sched_days, 1) is null
                   or v_dow = any(v_sched_days);
  else
    v_start := coalesce(v_sched_start, 0);
    v_end := coalesce(v_sched_end, 24);
    if v_start <= v_end then
      v_in_window := (pg_catalog.array_length(v_sched_days, 1) is null
                      or v_dow = any(v_sched_days))
                     and v_hour >= v_start and v_hour < v_end;
    else
      v_ref_day := case when v_hour < v_end then (v_dow + 6) % 7 else v_dow end;
      v_in_window := (pg_catalog.array_length(v_sched_days, 1) is null
                      or v_ref_day = any(v_sched_days))
                     and (v_hour >= v_start or v_hour < v_end);
    end if;
  end if;
  if not v_in_window then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Tirage pondéré atomique (même algorithme que perform_atomic_spin, SANS
  -- fenêtre de jeu). BORNE 2 : filtre `(is_losing or stock > 0)` — un lot à stock
  -- illimité (stock is null) est EXCLU. Réserve le stock du lot tiré.
  loop
    select coalesce(sum(p.weight), 0)::bigint into v_total
      from public.prizes p
     where p.wheel_id = v_wheel_id and p.organization_id = v_org_id
       and p.is_active and p.weight > 0
       and (p.is_losing or p.stock > 0);
    if v_total <= 0 then
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
         and p.is_active and p.weight > 0 and (p.is_losing or p.stock > 0)
    ) q where q.ceiling > v_pick order by q.ceiling limit 1;

    if v_prize.is_losing then exit; end if;
    update public.prizes set stock = stock - 1
      where id = v_prize.id and stock > 0;
    if found then exit; end if;
  end loop;

  insert into public.spins(
    organization_id, campaign_id, wheel_id, prize_id, is_losing,
    player_key, engagement_action, source, play_window_key
  ) values (
    v_org_id, p_campaign_id, v_wheel_id,
    case when v_prize.is_losing then null else v_prize.id end,
    v_prize.is_losing, p_key, null, 'referral', null
  ) returning id into v_spin_id;

  -- Grant consommé (une seule fois) → spin résultant journalisé.
  update public.referral_rewards
     set grant_consumed_at = v_now, resulting_spin_id = v_spin_id
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

revoke all on function public.consume_referral_spin_grant(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_referral_spin_grant(uuid, text, text)
  to service_role;

-- ── redeem_referral_reward (caisse) ──────────────────────────
-- Miroir de redeem_calendar_reward / redeem_loyalty_reward : remise atomique du
-- lot PARRAIN-…, actor obligatoire, org-scopée, auditée. Ne traite QUE les
-- versements 'lot' (code PARRAIN-…) ; les 'spin' se réclament par le flux de
-- roue (code GAIN-…). Réponse indistinguable pour code inconnu / autre org /
-- déjà remis (aucune remise → redeemed_now false, ou zéro ligne cross-org).
create or replace function public.redeem_referral_reward(
  p_organization_id uuid,
  p_code text,
  p_actor text
)
returns table(
  id uuid, created_at timestamptz, code text, redeemed_at timestamptz,
  beneficiary text, campaign_name text,
  reward_label text, reward_details text, redeemed_now boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_id uuid;
begin
  if p_actor is null or length(p_actor) = 0 then
    raise exception 'actor required';
  end if;
  v_code := upper(btrim(coalesce(p_code, '')));

  update public.referral_rewards r
     set redeemed_at = now(),
         redeemed_by = p_actor
   where r.organization_id = p_organization_id
     and r.kind = 'lot'
     and r.code = v_code
     and r.redeemed_at is null
  returning r.id into v_id;

  if v_id is not null then
    insert into public.audit_logs(organization_id, actor, action, metadata)
    values (p_organization_id, p_actor, 'referral.redeem',
            pg_catalog.jsonb_build_object('reward_id', v_id));
  end if;

  return query
  select r.id, r.created_at, r.code, r.redeemed_at,
         r.beneficiary, c.name,
         case r.beneficiary
           when 'sponsor' then pr.sponsor_reward_label
           when 'filleul' then pr.filleul_reward_label
           else pr.chest_reward_label end,
         case r.beneficiary
           when 'sponsor' then pr.sponsor_reward_details
           when 'filleul' then pr.filleul_reward_details
           else pr.chest_reward_details end,
         (r.id is not distinct from v_id)
    from public.referral_rewards r
    join public.campaigns c on c.id = r.campaign_id
    left join public.referral_programs pr on pr.campaign_id = r.campaign_id
   where r.organization_id = p_organization_id
     and r.kind = 'lot'
     and r.code = v_code
   limit 1;
end;
$$;

revoke all on function public.redeem_referral_reward(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_referral_reward(uuid, text, text)
  to service_role;

-- ── Purge RGPD ───────────────────────────────────────────────
-- Miroir de purge_expired_calendar_players : anonymise la PII (emails) des
-- parrains et filleuls des campagnes ARCHIVÉES au-delà de la rétention de
-- l'organisation. data_retention_months null = pas de purge (opt-in commerçant).
-- Divergence assumée (à relayer à security-review) : on N'EFFACE PAS les hash
-- device (sponsor_key / filleul_key) — ils sont pseudonymes (aucune PII) et
-- servent l'intégrité anti-abus (unicité device) ; seuls les emails, seule PII
-- du module, sont neutralisés. Les lignes disparaissent entièrement avec la
-- campagne (cascade) ou l'organisation. Renvoie le nombre de lignes anonymisées.
create or replace function public.purge_expired_referral_data()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sponsors bigint;
  v_signups bigint;
begin
  with purged as (
    update public.referral_sponsors s
       set sponsor_email = null
      from public.campaigns c, public.organizations o
     where s.campaign_id = c.id
       and c.organization_id = o.id
       and c.status = 'archived'
       and o.data_retention_months is not null
       and s.sponsor_email is not null
       and s.created_at < pg_catalog.now()
         - pg_catalog.make_interval(months => o.data_retention_months)
    returning 1
  )
  select count(*) into v_sponsors from purged;

  with purged as (
    update public.referral_signups sg
       set filleul_email = null
      from public.campaigns c, public.organizations o
     where sg.campaign_id = c.id
       and c.organization_id = o.id
       and c.status = 'archived'
       and o.data_retention_months is not null
       and sg.filleul_email is not null
       and sg.created_at < pg_catalog.now()
         - pg_catalog.make_interval(months => o.data_retention_months)
    returning 1
  )
  select count(*) into v_signups from purged;

  return v_sponsors + v_signups;
end;
$$;

revoke all on function public.purge_expired_referral_data()
  from public, anon, authenticated;
grant execute on function public.purge_expired_referral_data()
  to service_role;
