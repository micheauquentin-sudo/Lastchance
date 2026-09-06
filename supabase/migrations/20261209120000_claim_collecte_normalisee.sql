-- ============================================================
-- CLAIM — LA COLLECTE DÉCLARÉE PAR LA CAMPAGNE VAUT POUR TOUS LES SITES
--
-- LE CONSTAT. `claim_winning_spin` reçoit six paramètres du joueur et la
-- campagne déclare, par `collect_email` et `collect_phone`, lesquels elle a le
-- droit de garder. L'insert dans `participations` respectait cette déclaration
-- — cinq champs masqués, un « case » chacun (20260723110000 `:126-130`) — mais
-- DEUX SITES PLUS BAS LA LISAIENT EN BRUT :
--
--   1. `:167-170` l'abonnement dans `newsletter_subscribers`, gardé par le
--      seul `p_marketing_opt_in and p_email is not null` ;
--   2. `:171-175` le webhook `newsletter.subscriber.created`, qui sort
--      l'adresse EN CLAIR vers l'URL du commerçant.
--
-- Le webhook voisin `participation.claimed` (`:178-186`), lui, était
-- correctement gardé — ce qui montre que la règle était connue et simplement
-- oubliée à deux endroits. C'est le mode de défaillance qu'on corrige ici, pas
-- seulement les deux occurrences.
--
-- CONSÉQUENCE RÉELLE. Une campagne sans collecte d'e-mail — donc une campagne
-- dont le joueur n'a JAMAIS vu de case à cocher — écrivait quand même un abonné
-- newsletter dès que l'appelant transmettait un e-mail et un opt-in. Or
-- `claimSchema` (`src/lib/validations/play.ts`) accepte ces deux champs sans
-- condition et `src/actions/play.ts` les transmet tels quels : la RPC était le
-- dernier filtre, et il manquait.
--
-- LA FORME DU CORRECTIF : NORMALISER EN TÊTE, PAS TESTER À CHAQUE SITE.
-- Ajouter `and v_campaign.collect_email` aux deux sites fautifs aurait réparé
-- ces deux-là et laissé le suivant à écrire correctement. Les paramètres sont
-- donc ramenés à `null`/`false` juste après la lecture de la campagne : tout ce
-- qui les lit ensuite lit une valeur déjà conforme.
--
-- CE QUI NE CHANGE PAS, ET C'EST VOULU : l'imputation du budget et sa pause,
-- le job `automation.budget-paused`, l'audit, le webhook `participation.claimed`
-- et les huit « case » de masquage — conservés à l'identique. Les `case` sont
-- désormais redondants avec la normalisation ; ils restent en place comme
-- second verrou, pour qu'une évolution future de l'un ne rouvre pas l'autre.
-- L'insert écrit donc exactement les mêmes lignes qu'avant ce correctif.
-- ============================================================

create or replace function public.claim_winning_spin(
  p_spin_id uuid,
  p_first_name text,
  p_email text,
  p_phone text,
  p_accepted_terms boolean,
  p_marketing_opt_in boolean
)
returns table(participation_id uuid, redeem_code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_spin public.spins%rowtype;
  v_campaign public.campaigns%rowtype;
  v_code text;
  v_id uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_budget_cents integer;
  v_budget_spent integer;
  i integer;
  attempt integer;
begin
  select * into v_spin from public.spins where id = p_spin_id for update;
  if not found or v_spin.is_losing or v_spin.prize_id is null or v_spin.claimed then
    raise exception 'gain unavailable';
  end if;
  select * into v_campaign from public.campaigns
    where id = v_spin.campaign_id and organization_id = v_spin.organization_id;
  if not found then raise exception 'campaign unavailable'; end if;

  -- ── LA CAMPAGNE DÉCIDE CE QUI ENTRE, ET ELLE LE DÉCIDE ICI ──────
  --
  -- CE QUE CE BLOC REMPLACE : trois sites plus bas qui lisaient les paramètres
  -- BRUTS. L'insert « participations » masquait bien les cinq champs sous
  -- un « case » par champ, mais l'abonnement newsletter et le
  -- webhook `newsletter.subscriber.created` testaient `p_marketing_opt_in and
  -- p_email is not null` sans consulter la campagne. Une campagne déclarée
  -- SANS collecte d'e-mail se retrouvait donc avec un abonné en base et, si le
  -- commerce avait un webhook, l'adresse partait EN CLAIR vers son URL.
  --
  -- POURQUOI EN TÊTE PLUTÔT QU'À CHAQUE SITE. Un test local par site est une
  -- règle qu'il faut se rappeler d'écrire : il en manquait déjà trois sur six.
  -- Normalisée ici, la règle ne peut plus être oubliée en aval — un site futur
  -- qui lira `p_email` lira une valeur DÉJÀ conforme à la campagne.
  --
  -- LES GARDES SONT CELLES DE L'INSERT, AU MOT PRÈS — `collect_email` pour
  -- l'e-mail, `collect_phone` pour le téléphone, et l'OU des deux pour le
  -- prénom, le consentement et l'opt-in. C'est ce qui rend l'insert
  -- rigoureusement identique à ce qu'il écrivait avant ce correctif : le
  -- `case` d'un champ et sa normalisation portent la MÊME condition.
  --
  -- Placé après les contrôles de `found` mais avant ceux de consentement : ces
  -- derniers ne se déclenchent que lorsque la campagne collecte, cas où ce bloc
  -- ne touche à rien.
  if not v_campaign.collect_email then
    p_email := null;
  end if;
  if not v_campaign.collect_phone then
    p_phone := null;
  end if;
  if not (v_campaign.collect_email or v_campaign.collect_phone) then
    p_first_name := null;
    p_accepted_terms := false;
    p_marketing_opt_in := false;
  end if;
  if v_campaign.collect_email and p_email is null then raise exception 'email required'; end if;
  if v_campaign.collect_phone and p_phone is null then raise exception 'phone required'; end if;
  if (v_campaign.collect_email or v_campaign.collect_phone)
     and (p_first_name is null or not p_accepted_terms) then
    raise exception 'consent required';
  end if;

  for attempt in 1..8 loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := 'GAIN-';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, get_byte(v_bytes, i) % length(v_alphabet) + 1, 1);
    end loop;
    begin
      insert into public.participations(
        organization_id, campaign_id, wheel_id, prize_id, spin_id,
        first_name, email, phone, accepted_terms, marketing_opt_in,
        redeem_code, player_key
      ) values (
        v_spin.organization_id, v_spin.campaign_id, v_spin.wheel_id,
        v_spin.prize_id, v_spin.id,
        case when v_campaign.collect_email or v_campaign.collect_phone then p_first_name else null end,
        case when v_campaign.collect_email then p_email else null end,
        case when v_campaign.collect_phone then p_phone else null end,
        case when v_campaign.collect_email or v_campaign.collect_phone then p_accepted_terms else false end,
        case when v_campaign.collect_email or v_campaign.collect_phone then p_marketing_opt_in else false end,
        v_code, v_spin.player_key
      ) returning id into v_id;
      update public.spins set claimed = true where id = v_spin.id;

      -- ── Budget : le coût réel du lot s'impute ICI, atomiquement.
      -- Un plafond atteint pause la campagne dans la même transaction
      -- (le lot en cours reste dû : léger dépassement accepté).
      update public.campaigns c
         set budget_spent_cents = c.budget_spent_cents
           + coalesce((select p.cost_cents from public.prizes p
                        where p.id = v_spin.prize_id), 0)
       where c.id = v_spin.campaign_id
      returning c.budget_cents, c.budget_spent_cents
        into v_budget_cents, v_budget_spent;
      if v_budget_cents is not null and v_budget_spent >= v_budget_cents then
        update public.campaigns c
           set status = 'paused', paused_reason = 'budget_reached'
         where c.id = v_spin.campaign_id and c.status = 'active';
        if found then
          insert into public.audit_logs(organization_id, actor, action, metadata)
          values(v_spin.organization_id, 'system', 'campaign.budget.pause',
            jsonb_build_object('campaign_id', v_spin.campaign_id,
              'budget_cents', v_budget_cents,
              'budget_spent_cents', v_budget_spent));
        end if;
        insert into public.jobs (type, payload, organization_id, idempotency_key)
        values ('automation.budget-paused',
          jsonb_build_object('campaignId', v_spin.campaign_id,
                             'organizationId', v_spin.organization_id),
          v_spin.organization_id,
          'budget-paused:' || v_spin.campaign_id::text || ':' || v_budget_cents::text)
        on conflict (idempotency_key) do nothing;
      end if;

      insert into public.audit_logs(organization_id, actor, action, metadata)
      values(v_spin.organization_id, 'public', 'participation.claim',
        jsonb_build_object('campaign_id', v_spin.campaign_id, 'prize_id', v_spin.prize_id));
      if p_marketing_opt_in and p_email is not null then
        insert into public.newsletter_subscribers(organization_id, email, source)
        values(v_spin.organization_id, p_email, 'claim')
        on conflict(organization_id, email) do nothing;
        if found and exists(select 1 from public.organizations o where o.id = v_spin.organization_id and o.webhook_url is not null) then
          insert into public.webhook_deliveries(organization_id, event, data)
          values(v_spin.organization_id, 'newsletter.subscriber.created',
            jsonb_build_object('email', p_email, 'source', 'claim'));
        end if;
      end if;
      if exists(select 1 from public.organizations o where o.id = v_spin.organization_id and o.webhook_url is not null) then
        insert into public.webhook_deliveries(organization_id, event, data)
        values(v_spin.organization_id, 'participation.claimed', jsonb_strip_nulls(jsonb_build_object(
          'first_name', case when v_campaign.collect_email or v_campaign.collect_phone then p_first_name else null end,
          'email', case when v_campaign.collect_email then p_email else null end,
          'phone', case when v_campaign.collect_phone then p_phone else null end,
          'prize_label', (select label from public.prizes where id = v_spin.prize_id),
          'redeem_code', v_code
        )));
      end if;
      return query select v_id, v_code;
      return;
    exception when unique_violation then
      if exists(select 1 from public.participations where spin_id = v_spin.id) then
        raise exception 'gain already claimed';
      end if;
    end;
  end loop;
  raise exception 'code generation exhausted';
end
$$;

comment on function public.claim_winning_spin(uuid,text,text,text,boolean,boolean) is
  'Transforme un spin gagnant en participation + code GAIN-… . Impute le coût '
  'du lot au budget de la campagne et la met en pause au plafond atteint, dans '
  'LA transaction du gain. Depuis 20261209120000, les paramètres que la '
  'campagne ne déclare pas collecter (`collect_email`, `collect_phone`) sont '
  'ramenés à null/false DÈS L''ENTRÉE : aucun site en aval — abonnement '
  'newsletter, webhooks — ne peut plus écrire ni diffuser une donnée que le '
  'joueur n''a pas été invité à donner.';

-- L'ACL survit à un `create or replace` ; ces ordres la réaffirment parce
-- qu'une garantie qui repose sur « ça n'a pas dû changer » n'en est pas une.
-- Identiques à 20260723110000 `:199-202`. pgTAP les vérifie (security_acl).
revoke all on function public.claim_winning_spin(uuid,text,text,text,boolean,boolean)
  from public, anon, authenticated;
grant execute on function public.claim_winning_spin(uuid,text,text,text,boolean,boolean)
  to service_role;
