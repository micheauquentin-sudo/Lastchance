-- ============================================================
-- Identité joueur unifiée : rattachement immédiat des événements
-- émis AVANT que le pont legacy n'existe (prérequis ADR-045 du
-- module de méta-progression).
--
-- Défaut établi par mesure sur base migrée, pas par déduction :
--
--   Scénario A — le pont existe avant le spin :
--     experience_started/completed portent player_id ✅
--     une mission « experience_completed » progresse ✅
--     → la résolution depuis player_legacy_identities EXISTE déjà,
--       dans append_experience_event_internal, et elle FONCTIONNE.
--
--   Scénario B — le spin précède le pont (ordre réel du parcours,
--   ensureProgressivePlayerIdentity étant appelé après le tirage) :
--     après la 1re résolution : player_id NULL, source « unknown »
--     après la 2e résolution : player_id posé, source « direct »
--
-- Le rattrapage existait donc, mais décalé d'une visite entière.
-- Cause exacte : resolve_player_identity insère l'adhésion
-- (player_experience_memberships) AVANT la ligne de pont
-- (player_legacy_identities), parce que la FK composite l'impose.
-- Or c'est le trigger de l'adhésion qui porte le rattrapage, et il
-- lit un pont qui n'est pas encore écrit — il ne rattache rien. Le
-- second passage ne réussit que parce que le pont existe enfin.
--
-- Conséquence : le tout premier tour de roue d'un joueur neuf — le
-- cas de loin le plus fréquent sur un produit à QR code — ne faisait
-- progresser aucune mission au moment où il avait lieu.
--
-- Correctif : poser le rattrapage là où la correspondance devient
-- vraie, c'est-à-dire sur l'insertion du pont lui-même. Le décalage
-- disparaît sans dépendre de l'ordre des appels côté serveur : ce
-- fichier corrige le défaut avant le correctif backend annoncé sur
-- src/actions/play.ts, et reste juste après lui.
--
-- Second défaut mesuré au passage (non déduit) : dans
-- append_experience_event_internal, le « select ... into » de
-- résolution écrase v_source et v_qr_code_id avec NULL quand aucune
-- ligne ne correspond — comportement normal de SELECT INTO. La
-- source « direct » posée par la roue était donc dégradée en
-- « unknown » sur tout événement émis avant son pont. L'attribution
-- d'acquisition s'en trouvait faussée pour chaque premier passage.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Index servant exactement le prédicat de rattachement
-- ────────────────────────────────────────────────────────────
-- experience_events_player_key_idx ne filtre pas les lignes déjà
-- attribuées : il ferait relire tout l'historique d'un joueur à
-- chaque passage. Cet index partiel ne contient que les orphelines,
-- population qui reste petite et se vide d'elle-même.
create index if not exists experience_events_unattributed_idx
  on public.experience_events (
    organization_id, experience_kind, experience_id, player_key
  )
  where player_id is null and player_key is not null;

comment on index public.experience_events_unattributed_idx is
  'Sert le rattachement des événements émis avant leur pont d''identité. Partiel : ne garde que les orphelines.';

-- ────────────────────────────────────────────────────────────
-- 2. La résolution ne dégrade plus la source quand elle échoue
-- ────────────────────────────────────────────────────────────
-- Une résolution qui échoue est LÉGITIME (premier passage, pont pas
-- encore écrit) : l'événement doit s'écrire quand même, avec
-- player_id nul et sa source d'origine intacte. L'analytics ne
-- dépend jamais de l'identité.
create or replace function public.append_experience_event_internal(
  p_organization_id uuid,
  p_event_name text,
  p_experience_kind text,
  p_experience_id uuid,
  p_player_key text,
  p_player_id uuid,
  p_source text,
  p_qr_code_id uuid,
  p_idempotency_key text,
  p_occurred_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := p_player_id;
  v_source text := coalesce(p_source, 'unknown');
  v_qr_code_id uuid := p_qr_code_id;
  v_resolved_player_id uuid;
  v_resolved_source text;
  v_resolved_qr_code_id uuid;
begin
  if v_player_id is null and p_player_key is not null then
    select li.player_id, m.acquisition_source, m.acquisition_qr_code_id
      into v_resolved_player_id, v_resolved_source, v_resolved_qr_code_id
      from public.player_legacy_identities li
      join public.player_experience_memberships m
        on m.id = li.experience_membership_id
     where li.organization_id = p_organization_id
       and li.experience_kind = p_experience_kind
       and li.experience_id = p_experience_id
       and li.legacy_identity_hash = p_player_key
     limit 1;

    -- Sans cette garde, une absence de correspondance NULLifie aussi
    -- v_source et v_qr_code_id : l'échec de résolution corrompait des
    -- dimensions qui n'ont rien à voir avec l'identité.
    if v_resolved_player_id is not null then
      v_player_id := v_resolved_player_id;
      -- L'adhésion porte l'origine d'acquisition de référence, sauf
      -- quand elle-même l'ignore : l'appelant est alors plus précis.
      v_source := case
        when v_resolved_source is null or v_resolved_source = 'unknown'
          then v_source
        else v_resolved_source
      end;
      v_qr_code_id := coalesce(v_resolved_qr_code_id, v_qr_code_id);
    end if;
  end if;

  insert into public.experience_events (
    organization_id,
    event_name,
    experience_kind,
    experience_id,
    source,
    player_id,
    player_key,
    qr_code_id,
    campaign_id,
    idempotency_key,
    occurred_at
  ) values (
    p_organization_id,
    p_event_name,
    p_experience_kind,
    p_experience_id,
    case
      when v_source in ('direct', 'qr', 'share', 'referral', 'unknown')
        then v_source
      else 'unknown'
    end,
    v_player_id,
    p_player_key,
    v_qr_code_id,
    case when p_experience_kind = 'campaign' then p_experience_id end,
    p_idempotency_key,
    coalesce(p_occurred_at, pg_catalog.now())
  )
  on conflict do nothing;
exception
  when others then
    return;
end;
$$;

revoke all on function public.append_experience_event_internal(
  uuid,text,text,uuid,text,uuid,text,uuid,text,timestamptz
) from public, anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 3. Le pont revendique ses orphelines dès qu'il naît
-- ────────────────────────────────────────────────────────────
-- Trigger sur player_legacy_identities plutôt que sur l'adhésion :
-- c'est à cet instant précis, et pas avant, que la correspondance
-- hash → player_id devient vraie. Le rattachement a donc lieu dans
-- la transaction même du parcours joueur, sans attendre une visite
-- suivante.
--
-- INSERT seulement : la contrainte unique
-- (organization_id, experience_kind, experience_id,
--  legacy_identity_hash) fige la correspondance à vie, et
-- resolve_player_identity lève 23505 si un hash tentait de changer
-- de joueur. Un UPDATE ne touche que last_seen_at, qui ne réattribue
-- rien.
--
-- Comme tout l'analytics du projet, une erreur ici est absorbée :
-- une mesure ne doit jamais annuler une résolution d'identité, donc
-- jamais un parcours joueur.
create or replace function public.attach_legacy_identity_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
  v_qr_code_id uuid;
begin
  select m.acquisition_source, m.acquisition_qr_code_id
    into v_source, v_qr_code_id
    from public.player_experience_memberships m
   where m.id = new.experience_membership_id
     and m.organization_id = new.organization_id
     and m.player_id = new.player_id;

  update public.experience_events
     set player_id = new.player_id,
         source = case
           when source = 'unknown'
             and v_source is not null
             and v_source <> 'unknown'
             then v_source
           else source
         end,
         qr_code_id = coalesce(qr_code_id, v_qr_code_id)
   where organization_id = new.organization_id
     and experience_kind = new.experience_kind
     and experience_id = new.experience_id
     and player_id is null
     and player_key = new.legacy_identity_hash;

  return new;
exception
  when others then
    return new;
end;
$$;

revoke all on function public.attach_legacy_identity_events()
  from public, anon, authenticated, service_role;

comment on function public.attach_legacy_identity_events() is
  'Rattache à leur joueur les événements analytics émis avant l''écriture du pont legacy. Sans lui, le premier tour de roue d''un joueur neuf ne déclenche aucune progression.';

create trigger player_legacy_identities_attach_events
after insert on public.player_legacy_identities
for each row execute function public.attach_legacy_identity_events();
