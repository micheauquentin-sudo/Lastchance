-- ============================================================
-- QR de commande unique — Passeport de fidélité (cahier §7)
--
-- RÈGLE PRODUIT : « Livraison/e-commerce : une carte/QR/code unique par
-- commande crée/continue le Passeport après confirmation et ajoute un tampon
-- UNE SEULE FOIS. Code générique = zéro tampon. »
--
-- Le « code générique = zéro tampon » n'a rien à implémenter : un jeton qui
-- n'est pas dans `loyalty_order_codes` ne correspond à aucune ligne, donc
-- aucun tampon. La règle est portée par l'ABSENCE de famille de code clavier —
-- le jeton est scannable (URL) et rien d'autre.
--
-- ── CE QUI PORTE LE « UNE SEULE FOIS », ET POURQUOI CE N'EST PAS LE COOLDOWN ─
--
-- `loyalty_stamps` n'a AUCUN index d'unicité, et c'est écrit noir sur blanc
-- dans son commentaire (20260725120000:186-187) : « l'anti-double repose sur
-- le cooldown min_stamp_interval_seconds ». Ce cooldown est le bon outil pour
-- un comptoir — il empêche de retamponner le même passeport dans la journée —
-- et le MAUVAIS pour une commande : deux commandes livrées le même jour sont
-- deux visites légitimes, et les refuser serait un défaut, pas une protection.
--
-- DÉCISION (arbitrage tranché avant écriture) : le jeton de commande
-- CONTOURNE `min_stamp_interval_seconds`. L'anti-abus est porté par l'USAGE
-- UNIQUE DU JETON, pas par la fenêtre de temps. Concrètement, c'est cette
-- unique instruction qui tient toute la règle :
--
--     update public.loyalty_order_codes
--        set consumed_at = now()
--      where token = ? and program_id = ? and consumed_at is null
--     returning id
--
-- Zéro ligne rendue = jeton inconnu, déjà servi, ou appartenant à un AUTRE
-- programme : les trois cas rendent le même `order_invalid`, sans tampon. Un
-- `update ... where consumed_at is null` est atomique sous le verrou de ligne
-- de Postgres : deux appels concurrents sur le même jeton ne peuvent pas
-- gagner tous les deux, même sans le verrou de programme qui les sérialise
-- déjà par ailleurs.
--
-- ── LIMITES ASSUMÉES EN MVP ──────────────────────────────────
-- Pas d'expiration, pas de révocation : un jeton émis reste valable jusqu'à
-- sa consommation. Le commerçant peut supprimer la ligne (droit `delete`),
-- ce qui est la révocation du pauvre — mais il n'y a ni date de péremption
-- ni statut « annulé ». À reprendre si un commerçant émet des jetons en
-- masse avant de changer d'avis.
--
-- ── TROIS PIÈGES TRAITÉS ICI, ET LEUR RAISON ─────────────────
--
-- 1. `consumed_member_id` porte une FK SIMPLE, pas la FK composite tenant
--    habituelle — voir le long commentaire sur la table. Le motif est la
--    PURGE RGPD, et se tromper de clause y ressuscite des jetons dépensés.
--
-- 2. `loyalty_stamps.mode` était contraint à ('rotating_code', 'staff'). Un
--    tampon de commande n'est ni l'un ni l'autre : la contrainte est étendue,
--    sans quoi l'insertion lèverait. Écrire `v_prog.validation_mode` à la
--    place aurait fait passer un tampon de livraison pour une validation au
--    comptoir dans les statistiques du commerçant.
--
-- 3. ADR-082 — AJOUTER UN PARAMÈTRE NE REMPLACE PAS UNE FONCTION, IL EN CRÉE
--    UNE SECONDE. `create or replace` avec une arité différente laisse
--    l'ancienne 4-aire en place ET fait naître la 5-aire avec EXECUTE à
--    PUBLIC par défaut. Sur une fonction `security definer` qui pose des
--    tampons et ÉMET DES RÉCOMPENSES, cela rouvre à `anon` exactement ce que
--    20260725200000 avait fermé. D'où le `drop function` explicite de la
--    signature 4-aire, puis la réémission des `revoke`/`grant` après le
--    `create` — comme le fait CHAQUE recréation de cette fonction depuis
--    20260725120000. L'oubli est invisible au diff : le pgTAP le lit donc
--    dans le catalogue (surcharges = 1, `proacl` non nul, aucun grantee 0).
-- ============================================================

-- ── Codes de commande ────────────────────────────────────────
create table public.loyalty_order_codes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Jeton public de l'URL du QR imprimé sur le bon de livraison : même
  -- alphabet et mêmes bornes que hunt_steps.token (20260724120000:83-85),
  -- généré côté app par randomCode (src/lib/utils.ts). `unique` GLOBAL et
  -- non par programme : un jeton doit désigner une commande et une seule,
  -- toutes organisations confondues.
  token text not null unique check (token ~ '^[A-Za-z0-9-]{8,64}$'),
  -- Référence de commande du commerçant (« CMD-2026-0412 »), pour qu'il
  -- retrouve à quelle expédition correspond un jeton. Jamais montrée au
  -- client, jamais utilisée pour valider quoi que ce soit.
  label text check (label is null or char_length(btrim(label)) between 1 and 120),
  created_at timestamptz not null default now(),
  -- LE VERROU. Non nul = jeton dépensé, définitivement.
  consumed_at timestamptz,
  -- Passeport ayant bénéficié du tampon.
  --
  -- FK SIMPLE, à rebours de la FK composite tenant qui est la règle dans ce
  -- schéma (hunt_scans, loyalty_stamps, loyalty_rewards). Les deux variantes
  -- composites sont des défauts, et il vaut mieux les nommer que les
  -- redécouvrir en production :
  --
  --   · `on delete cascade` — SUPPRIMERAIT la ligne de code quand le
  --     passeport est purgé. `purge_expired_loyalty_members` efface les
  --     passeports dormants (RGPD) : le jeton dépensé disparaîtrait avec eux
  --     et redeviendrait CONSOMMABLE. La purge de conformité se muerait en
  --     machine à ressusciter les jetons — un double tampon gratuit pour qui
  --     a gardé le QR d'une vieille commande.
  --
  --   · `on delete set null` COMPOSITE — Postgres met à null TOUTES les
  --     colonnes de la clé, donc aussi `program_id` et `organization_id`,
  --     qui sont `not null`. La purge échouerait sur une violation de
  --     contrainte, et le cron de rétention resterait rouge.
  --
  -- D'où la FK simple `on delete set null` : la purge coupe le lien vers le
  -- passeport sans toucher à `consumed_at`. Le jeton reste dépensé alors
  -- même que le client a été oublié — ce qui est exactement le comportement
  -- voulu, et la raison pour laquelle c'est `consumed_at` qui porte la
  -- règle et non `consumed_member_id`.
  --
  -- La garantie perdue au passage — « le passeport lié appartient au même
  -- programme » — est tenue par record_loyalty_stamp, seul écrivain de cette
  -- colonne (jamais accordée à `authenticated`).
  consumed_member_id uuid references public.loyalty_members(id) on delete set null,
  -- Intégrité inter-tenant : un code ne peut pointer que vers un programme
  -- de SA propre organisation (miroir hunt_steps → hunts).
  foreign key (program_id, organization_id)
    references public.loyalty_programs(id, organization_id) on delete cascade
);

comment on table public.loyalty_order_codes is
  'QR de commande à usage unique (livraison/e-commerce) : un jeton non devinable par commande, consommé UNE SEULE FOIS par record_loyalty_stamp pour créer ou continuer un passeport. Le jeton contourne le cooldown du programme — deux commandes le même jour valent deux tampons — parce que l''anti-abus est porté par consumed_at, pas par min_stamp_interval_seconds. Pas d''expiration ni de révocation en MVP.';

comment on column public.loyalty_order_codes.consumed_at is
  'Horodatage de consommation, et SEULE garantie du « un seul tampon par commande » : loyalty_stamps n''a aucun index d''unicité. Posé par record_loyalty_stamp via un update conditionnel atomique (where consumed_at is null), jamais modifiable par une session marchande.';

comment on column public.loyalty_order_codes.consumed_member_id is
  'Passeport tamponné. Mis à null par la purge RGPD des passeports dormants (FK simple on delete set null) SANS que consumed_at bouge : un jeton dépensé le reste même une fois le client oublié.';

create index loyalty_order_codes_org_idx on public.loyalty_order_codes (organization_id);
create index loyalty_order_codes_program_idx on public.loyalty_order_codes (program_id);

-- ── RLS et grants (calque hunt_steps, 20260724120000:177-227) ─
alter table public.loyalty_order_codes enable row level security;

revoke all on table public.loyalty_order_codes from public, anon, authenticated;

-- Gestion des codes : owners/editors, comme les étapes de chasse.
-- Lecture d'équipe (suivi des commandes) : tous les membres.
create policy "loyalty_order_codes: member select" on public.loyalty_order_codes
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "loyalty_order_codes: editor write" on public.loyalty_order_codes
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- Le commerçant émet et supprime ses codes, mais n'écrit AUCUNE des deux
-- colonnes de consommation — ni à l'insertion, ni à la mise à jour. Même
-- raison que loyalty_milestones.reward_claimed_count (RPC-only, 20260725120000) :
-- un `update ... set consumed_at = null` rendrait un jeton dépensé
-- réutilisable, et un `insert` portant `consumed_at` permettrait de
-- pré-brûler le jeton d'un client. Seule `label` reste modifiable après coup
-- (corriger une référence de commande).
grant select on table public.loyalty_order_codes to authenticated;
grant insert (organization_id, program_id, token, label)
  on public.loyalty_order_codes to authenticated;
grant update (label) on public.loyalty_order_codes to authenticated;
grant delete on table public.loyalty_order_codes to authenticated;

grant select, insert, update, delete on table public.loyalty_order_codes to service_role;

-- Mutations commerçant auditées, comme les programmes et les paliers.
-- (audit_merchant_mutation no-ope quand auth.uid() est null : la
-- consommation par le service role n'écrit pas de ligne d'audit.)
create trigger loyalty_order_codes_merchant_audit
  after insert or update or delete on public.loyalty_order_codes
  for each row execute function public.audit_merchant_mutation();

-- ── Le mode du tampon dit la VÉRITÉ sur sa provenance ────────
-- Un tampon de commande n'est ni un code tournant lu au comptoir ni une
-- validation par un membre du personnel. Sans cette extension, l'insertion
-- de la branche « jeton de commande » violerait loyalty_stamps_mode_check ;
-- avec un `v_prog.validation_mode` de repli, elle mentirait — les
-- statistiques du commerçant compteraient des passages en boutique là où il
-- n'y a eu que des livraisons.
alter table public.loyalty_stamps drop constraint loyalty_stamps_mode_check;
alter table public.loyalty_stamps add constraint loyalty_stamps_mode_check
  check (mode in ('rotating_code', 'staff', 'order_code'));

comment on column public.loyalty_stamps.mode is
  'Provenance de la visite validée : ''rotating_code'' (code tournant du comptoir), ''staff'' (validation par un membre de l''équipe), ''order_code'' (QR de commande unique, livraison/e-commerce — seul mode qui contourne le cooldown du programme).';

-- ── record_loyalty_stamp : + p_order_token ───────────────────
-- ADR-082 : l'arité change, donc DROP explicite de la 4-aire AVANT le
-- create. Un `create or replace` laisserait deux surcharges vivantes, dont
-- une neuve ouverte à PUBLIC (voir l'en-tête, piège 3).
drop function public.record_loyalty_stamp(uuid, text, text, uuid);

-- Corps repris VERBATIM de 20260725200000 (dernière définition), quatre
-- changements, tous conditionnés par `p_order_token is not null` :
--
--   1. La validation d'entrée devient un aiguillage à TROIS branches. Le
--      jeton de commande se substitue à la validation rotating/staff : il
--      EST la preuve, émise par le commerçant et non devinable. Un programme
--      en mode `staff` devient donc tamponnable sans `p_validated_by` par
--      cette voie — c'est voulu : il n'y a personne au comptoir au moment
--      d'une livraison.
--   2. Le cooldown est sauté (`not v_by_order`). C'est la décision produit
--      de l'en-tête : deux commandes le même jour = deux tampons.
--   3. Le tampon est journalisé avec `mode = 'order_code'`.
--   4. La ligne de code consommée reçoit `consumed_member_id` APRÈS la
--      création/résolution du passeport — le passeport peut naître dans le
--      même appel, son id n'existe pas encore au moment de la consommation.
--      La consommation reste le VERROU et passe en premier ; le lien n'est
--      qu'une traçabilité posée ensuite, dans la même transaction.
--
-- ORDRE DES VÉRIFICATIONS — pas d'oracle inter-tenant : le `where` de la
-- consommation porte `program_id = v_prog.id`, donc un jeton volé chez un
-- autre commerçant rend le même `order_invalid` qu'un jeton inventé. Et la
-- disponibilité du programme est testée AVANT la consommation : un jeton
-- n'est jamais brûlé sur un programme en pause, il redevient valable à la
-- réactivation (même principe que le grant de spin, 20260725200000).
--
-- Réponse jsonb — un état s'ajoute au contrat existant :
--   state: 'unavailable' | 'invalid_code' | 'order_invalid' | 'too_soon'
--        | 'stamped'
--   'order_invalid' : jeton de commande inconnu, déjà consommé, ou
--   appartenant à un autre programme. Aucun tampon, aucun passeport créé.
--   Le reste du contrat est inchangé.
create function public.record_loyalty_stamp(
  p_program_id uuid,
  p_member_token_hash text,
  p_rotating_code text default null,
  p_validated_by uuid default null,
  p_order_token text default null
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
  v_is_new boolean := false;
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
  v_order_id uuid;
  v_by_order boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_member_token_hash is null or p_member_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member token';
  end if;

  -- Verrou sur le programme : fige réglages, stock des paliers et sérialise
  -- l'attribution des récompenses. Réponse 'unavailable' identique quel que
  -- soit le motif (addon coupé, brouillon, archivé) : pas d'oracle.
  select p.* into v_prog
    from public.loyalty_programs p
    join public.organizations o on o.id = p.organization_id
   where p.id = p_program_id
     and o.addon_loyalty
   for update of p;
  if not found or v_prog.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Validation selon l'entrée (AVANT toute création de passeport : une
  -- entrée refusée n'inscrit personne).
  if p_order_token is not null then
    -- QR de commande : consommation ATOMIQUE. `consumed_at is null` dans le
    -- WHERE est la clause qui interdit le second tampon — la relire avant
    -- d'y toucher, c'est elle qui tient la règle produit du §7.
    update public.loyalty_order_codes
       set consumed_at = v_now
     where token = p_order_token
       and program_id = v_prog.id
       and consumed_at is null
    returning id into v_order_id;
    if v_order_id is null then
      -- Inconnu, déjà servi, ou d'un autre programme : réponse unique.
      return pg_catalog.jsonb_build_object('state', 'order_invalid');
    end if;
    v_by_order := true;
  elsif v_prog.validation_mode = 'rotating_code' then
    v_code_in := pg_catalog.regexp_replace(coalesce(p_rotating_code, ''), '\D', '', 'g');
    if pg_catalog.length(v_code_in) <> 6 then
      return pg_catalog.jsonb_build_object('state', 'invalid_code');
    end if;
    v_counter := pg_catalog.floor(extract(epoch from v_now) / v_prog.rotating_period_seconds)::bigint;
    v_ok := false;
    -- Tolérance de DEUX fenêtres : la courante et la précédente (voir
    -- 20260725180000). La durée d'acceptation d'un code vaut donc
    -- 2 · rotating_period_seconds, bornée par le cooldown via
    -- loyalty_programs_cooldown_floor_check.
    for d in -1..0 loop
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

  -- Passeport créé à la première visite (aucune PII). FOUND immédiatement
  -- après l'INSERT distingue la CRÉATION (1 ligne affectée) du simple accès à
  -- un passeport existant (conflit → 0 ligne) : source de vérité de
  -- `is_new_member`.
  insert into public.loyalty_members (program_id, organization_id, token_hash)
  values (v_prog.id, v_prog.organization_id, p_member_token_hash)
  on conflict (program_id, token_hash) do nothing;
  v_is_new := found;

  select m.* into v_member
    from public.loyalty_members m
   where m.program_id = v_prog.id and m.token_hash = p_member_token_hash
   for update;

  -- Traçabilité du jeton de commande : le passeport vient peut-être de
  -- naître, son id n'existait pas à la consommation. Le verrou reste
  -- `consumed_at`, posé plus haut — ceci n'est qu'un lien.
  if v_by_order then
    update public.loyalty_order_codes
       set consumed_member_id = v_member.id
     where id = v_order_id;
  end if;

  -- Cooldown depuis le dernier tampon (anti-abus) — SAUF par jeton de
  -- commande : deux commandes le même jour sont deux visites légitimes, et
  -- l'usage unique du jeton tient déjà l'anti-abus (en-tête de migration).
  if not v_by_order
     and v_member.last_stamp_at is not null
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
      'is_new_member', v_is_new,
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
          case when v_by_order then 'order_code' else v_prog.validation_mode end,
          p_validated_by);

  -- Paliers nouvellement atteints (visit_count <= total ET pas déjà gagnés).
  -- Sous le verrou du programme : l'attribution (stock + code/grant) est
  -- sérialisée, sans double émission. Le plancher visit_count >= 2 garantit
  -- qu'un premier tampon (v_new_count = 1) ne sélectionne jamais rien.
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
    -- Rupture de stock — COMMUNE aux deux types de palier. Un lot épuisé
    -- n'émet pas de code, un palier spin épuisé n'émet pas de tour offert :
    -- dans les deux cas le palier est signalé, aucune récompense n'est créée
    -- (échec propre), et le passeport supplémentaire ne rapporte plus rien.
    -- C'est ce qui donne au stock choisi par le commerçant la valeur de
    -- PLAFOND DE PERTE annoncée dans l'éditeur de programme.
    if coalesce(v_ms.reward_stock, 0) <= v_ms.reward_claimed_count then
      v_reached := v_reached || pg_catalog.jsonb_build_object(
        'milestone_id', v_ms.id, 'visit_count', v_ms.visit_count,
        'reward_type', v_ms.reward_type, 'out_of_stock', true,
        'reward_label', v_ms.reward_label);
      continue;
    end if;
    update public.loyalty_milestones
       set reward_claimed_count = reward_claimed_count + 1
     where id = v_ms.id;

    if v_ms.reward_type = 'lot' then
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
      v_reached := v_reached || pg_catalog.jsonb_build_object(
        'milestone_id', v_ms.id, 'visit_count', v_ms.visit_count,
        'reward_type', 'lot', 'code', v_code,
        'reward_label', v_ms.reward_label, 'reward_details', v_ms.reward_details);
    else
      -- Tour de roue offert : grant_token à usage unique, décompté du stock
      -- du palier au même titre qu'un code de retrait.
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
    'is_new_member', v_is_new,
    'milestones_reached', v_reached,
    'next_milestone', case when v_next_visit is null then null
      else pg_catalog.jsonb_build_object(
        'visit_count', v_next_visit, 'reward_type', v_next_type) end
  );
end;
$$;

-- ADR-082 : la fonction VIENT D'ÊTRE CRÉÉE, son ACL est donc vierge —
-- c'est-à-dire EXECUTE à PUBLIC. Ces deux instructions ne sont pas une
-- redite du fichier d'origine, elles sont la seule chose qui referme la
-- porte. Les supprimer rendrait la RPC appelable par `anon`.
revoke all on function public.record_loyalty_stamp(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_loyalty_stamp(uuid, text, text, uuid, text)
  to service_role;
