-- ============================================================
-- Passeport de fidelite -> Jackpot collectif
--
-- Un scan QR de passeport valide par la caisse peut alimenter une seule
-- campagne Jackpot de la meme organisation. Le lien est configure sur le
-- programme de fidelite, mais l'ecriture reste entierement serveur : le
-- trigger part du tampon deja accepte dans record_loyalty_stamp.
-- ============================================================

-- Un programme choisit au plus un jackpot, dans son organisation. La FK
-- composite ferme le lien inter-tenant meme si une action serveur est
-- compromise. Un jackpot ne peut etre relie qu'a un passeport afin que la
-- frequence de ses participations reste non ambigue.
alter table public.loyalty_programs
  add column jackpot_campaign_id uuid;

alter table public.loyalty_programs
  add constraint loyalty_programs_jackpot_campaign_tenant_fkey
    foreign key (jackpot_campaign_id, organization_id)
    references public.jackpot_campaigns(id, organization_id)
    on delete restrict;

create unique index loyalty_programs_one_linked_jackpot_idx
  on public.loyalty_programs (jackpot_campaign_id)
  where jackpot_campaign_id is not null;

comment on column public.loyalty_programs.jackpot_campaign_id is
  'Jackpot collectif staff actif alimente par chaque scan QR de ce passeport. La FK composite impose la meme organisation.';

-- Provenance durable : un tampon ne devient jamais deux entrees de tirage,
-- y compris si le processus SQL etait rejoue apres une panne.
alter table public.jackpot_participants
  add column loyalty_stamp_id uuid
    references public.loyalty_stamps(id) on delete set null;

create unique index jackpot_participants_loyalty_stamp_once_idx
  on public.jackpot_participants (loyalty_stamp_id)
  where loyalty_stamp_id is not null;

comment on column public.jackpot_participants.loyalty_stamp_id is
  'Tampon Passeport source de cette participation. Unique quand renseigne ; efface a la purge RGPD du passeport, sans effacer le registre de tirage.';

-- Un lien n'est utile que pour les deux parcours de validation caisse. Le
-- cooldown du Jackpot doit etre inferieur ou egal a celui du Passeport : ainsi
-- chaque tampon staff accepte produit bien une participation (jamais un
-- tampon accepte mais refuse par un second cooldown invisible).
create function public.guard_loyalty_jackpot_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.jackpot_campaigns%rowtype;
begin
  if new.jackpot_campaign_id is null then
    return new;
  end if;

  select c.* into v_campaign
    from public.jackpot_campaigns c
   where c.id = new.jackpot_campaign_id;

  -- Laisser la FK composite produire son refus standard pour un UUID absent ou
  -- un autre tenant : cette fonction ne doit pas transformer une violation de
  -- cloisonnement en erreur metier.
  if not found or v_campaign.organization_id <> new.organization_id then
    return new;
  end if;

  if v_campaign.status <> 'active'
     or v_campaign.validation_mode <> 'staff' then
    raise exception 'linked jackpot must be active and use staff validation';
  end if;

  if new.validation_mode <> 'staff' then
    raise exception 'linked loyalty program must use staff validation';
  end if;

  if v_campaign.min_participation_interval_seconds
       > new.min_stamp_interval_seconds then
    raise exception 'linked jackpot cooldown cannot exceed loyalty cooldown';
  end if;

  return new;
end;
$$;

create trigger loyalty_programs_guard_jackpot_link
  before insert or update of jackpot_campaign_id, validation_mode, min_stamp_interval_seconds
  on public.loyalty_programs
  for each row execute function public.guard_loyalty_jackpot_link();

-- Une campagne encore reliee ne peut pas passer en code tournant ni voir son
-- cooldown depasser celui du passeport. En revanche elle peut etre archivee :
-- les tampons continuent alors normalement, sans participation Jackpot.
create function public.guard_linked_jackpot_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min_stamp_interval integer;
begin
  select p.min_stamp_interval_seconds into v_min_stamp_interval
    from public.loyalty_programs p
   where p.jackpot_campaign_id = new.id
   limit 1;

  if v_min_stamp_interval is null then
    return new;
  end if;

  if new.validation_mode <> 'staff' then
    raise exception 'a linked jackpot must keep staff validation';
  end if;

  if new.min_participation_interval_seconds > v_min_stamp_interval then
    raise exception 'linked jackpot cooldown cannot exceed loyalty cooldown';
  end if;

  return new;
end;
$$;

create trigger jackpot_campaigns_guard_loyalty_link
  before update of validation_mode, min_participation_interval_seconds
  on public.jackpot_campaigns
  for each row execute function public.guard_linked_jackpot_campaign();

-- Le tampon est la source de verite : le QR ne porte qu'un laissez-passer
-- court et sa simple lecture ne doit jamais modifier le pot. Le trigger se
-- declenche APRES l'insertion du tampon, dans la transaction de la RPC
-- record_loyalty_stamp. record_jackpot_participation garde son verrou de
-- campagne, son tirage et ses bornes economiques existants.
create function public.attach_loyalty_stamp_to_jackpot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_member_hash text;
  v_result jsonb;
  v_state text;
  v_participant_id uuid;
begin
  -- Les commandes et le code tournant restent des parcours distincts : seul le
  -- scan QR caisse d'un passeport, avec un validateur authentifie, alimente le
  -- pot commun.
  if new.mode <> 'staff' or new.validated_by is null then
    return new;
  end if;

  select p.jackpot_campaign_id, m.token_hash
    into v_campaign_id, v_member_hash
    from public.loyalty_programs p
    join public.loyalty_members m
      on m.id = new.member_id
     and m.program_id = new.program_id
     and m.organization_id = new.organization_id
   where p.id = new.program_id
     and p.organization_id = new.organization_id;

  if v_campaign_id is null or v_member_hash is null then
    return new;
  end if;

  -- Un lien est conserve pour faciliter une reactivation, mais un Jackpot
  -- arrete ne doit jamais empecher la fidelite de fonctionner.
  if not exists (
    select 1
      from public.jackpot_campaigns c
      join public.organizations o on o.id = c.organization_id
     where c.id = v_campaign_id
       and c.organization_id = new.organization_id
       and c.status = 'active'
       and c.validation_mode = 'staff'
       and o.addon_jackpot
  ) then
    return new;
  end if;

  v_result := public.record_jackpot_participation(
    v_campaign_id,
    v_member_hash,
    null,
    new.validated_by
  );
  v_state := v_result ->> 'state';

  -- La garde de configuration rend too_soon impossible pour un tampon valide.
  -- S'il apparaissait malgre tout, on annule la transaction : mieux vaut un
  -- refus explicite que promettre une participation qui n'a pas eu lieu.
  if v_state <> 'recorded' then
    raise exception 'linked jackpot participation was not recorded';
  end if;

  -- record_jackpot_participation tient le verrou de campagne jusqu'au commit.
  -- La derniere entree de ce joueur est donc exactement celle qu'il vient de
  -- creer; le predicate loyalty_stamp_id is null preserve la provenance.
  select pt.id into v_participant_id
    from public.jackpot_participants pt
   where pt.campaign_id = v_campaign_id
     and pt.organization_id = new.organization_id
     and pt.player_token_hash = v_member_hash
     and pt.loyalty_stamp_id is null
   order by pt.created_at desc, pt.id desc
   limit 1
   for update;

  if v_participant_id is null then
    raise exception 'linked jackpot participant missing';
  end if;

  update public.jackpot_participants
     set loyalty_stamp_id = new.id
   where id = v_participant_id;

  return new;
end;
$$;

create trigger loyalty_stamps_attach_jackpot
  after insert on public.loyalty_stamps
  for each row execute function public.attach_loyalty_stamp_to_jackpot();

revoke all on function public.guard_loyalty_jackpot_link() from public, anon, authenticated;
revoke all on function public.guard_linked_jackpot_campaign() from public, anon, authenticated;
revoke all on function public.attach_loyalty_stamp_to_jackpot() from public, anon, authenticated;
