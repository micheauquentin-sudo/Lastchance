-- ============================================================
-- LE CONSENTEMENT SMS ENTRE DANS LA TRANSACTION DU GAIN (SMS-C1)
--
-- ── LE DÉFAUT, ET POURQUOI IL COÛTE PLUS QU'UN MESSAGE ──────
--
-- `claim_winning_spin` est atomique et l'assume : la participation, le code
-- GAIN-…, l'imputation du budget, la pause au plafond, le job
-- `automation.budget-paused`, l'audit et les deux webhooks vivent ou meurent
-- ensemble. Le CONSENTEMENT SMS, lui, était écrit APRÈS le commit, par un
-- second aller-retour du serveur applicatif (`src/actions/play.ts`,
-- `recordPrizeSmsConsent`).
--
-- Si l'invocation serverless expire ENTRE les deux — le gain est commité, le
-- consentement ne l'est pas — rien ne le rattrape :
--
--   · le rejeu ne le réémet pas. `replayExistingClaim` RELIT la participation
--     et rend le code ; il n'écrit rien, par construction et à raison ;
--   · l'envoi ultérieur refuse EN SILENCE. `src/lib/sms-prize.ts` ouvre sur
--     une lecture de `sms_consents` et sort sans rien faire quand elle ne
--     trouve pas de ligne — un compteur `sms.prize.no_consent`, aucune trace
--     lisible par le commerçant.
--
-- Ce n'est donc pas un message perdu : c'est LE CANAL perdu, définitivement,
-- pour ce couple (commerce, numéro). Le joueur a coché, la case est partie
-- avec l'invocation, et plus rien ne la lui redemandera jamais.
--
-- ── LE PATRON EST DÉJÀ DANS CE FICHIER ──────────────────────
--
-- Le job `automation.budget-paused` (20260723110000 `:155-163`) est écrit dans
-- LA transaction, sous `on conflict do nothing`. Le consentement suit le même
-- chemin, au même endroit, pour la même raison.
--
-- ── LA SIGNATURE S'ÉTEND, ET C'ÉTAIT INÉVITABLE ─────────────
--
-- `p_phone` arrivait déjà. Le DRAPEAU D'OPT-IN SMS, non : `claimSchema.smsOptIn`
-- restait côté TypeScript, et `p_marketing_opt_in` ne pouvait pas en tenir lieu
-- — c'est l'opt-in NEWSLETTER, une autre case, une autre phrase, un autre
-- canal. Écrire un consentement SMS sur la foi de l'opt-in e-mail aurait été
-- une faute RGPD, pas un raccourci.
--
-- Septième paramètre, `p_sms_opt_in boolean default false`, donc. Postgres
-- refuse deux surcharges devenues appelables avec le même nombre d'arguments
-- via un défaut (« function is not unique ») : on DROP la 6-args avant de
-- recréer en 7-args, exactement comme 20260927120000 l'a fait pour
-- `perform_atomic_spin`. Les corps plpgsql appelants se relient au runtime,
-- aucun DROP en cascade.
--
-- LE DÉFAUT `false` EST CE QUI REND CE FICHIER SÛR À APPLIQUER SEUL : l'appel
-- à six arguments de `src/actions/play.ts` continue de résoudre, et le
-- générateur de types rend le paramètre OPTIONNEL (`p_sms_opt_in?: boolean`,
-- comme `p_force_losing?` sur `perform_atomic_spin`). Tant que l'appelant ne
-- passe pas le drapeau, ce bloc ne s'exécute pas et le comportement est
-- RIGOUREUSEMENT celui d'avant. La migration précède le code qui en dépend,
-- comme le contrat de livraison l'exige.
--
-- ── LE PIÈGE DE CE LOT, REGARDÉ EN PREMIER ──────────────────
--
-- 20261209120000 ramène `p_phone` à `null` quand la campagne ne déclare pas
-- `collect_phone`. On pouvait craindre qu'elle annule le téléphone dont le
-- consentement a besoin. VÉRIFIÉ : elle ne peut pas.
--
-- L'appelant TypeScript garde déjà l'écriture du consentement derrière
-- `if (collectPhone && parsed.data.phone)` (`src/actions/play.ts:836`), où
-- `collectPhone` vaut `campaign.collect_phone`. La condition d'annulation de
-- la RPC et la condition d'appel du serveur sont donc LA MÊME : dans tous les
-- cas où la normalisation efface le numéro, l'ancien chemin n'écrivait aucun
-- consentement non plus. Le déplacement est iso-comportement, et non « iso à
-- un cas près qu'on découvrira en production ».
--
-- Le drapeau est ramené à `false` dans la même branche, par principe : la
-- doctrine de 20261209120000 est de normaliser EN TÊTE plutôt que de tester à
-- chaque site, et un site futur qui lirait `p_sms_opt_in` doit lire une valeur
-- déjà conforme à la campagne.
--
-- ── POURQUOI UN SOUS-BLOC D'EXCEPTION, ET NON UN APPEL NU ───
--
-- `record_sms_consent` LÈVE dans deux cas parfaitement ordinaires : numéro
-- illisible, et numéro dont le consentement a été RETIRÉ (un STOP) sans
-- `p_renew`. Un appel nu ferait alors échouer TOUTE la transaction — le
-- gagnant perdrait son lot parce que quelqu'un a envoyé STOP il y a trois
-- mois. C'est exactement ce que `recordPrizeSmsConsent` documente et refuse :
-- « un consentement qu'on n'a pas su écrire dégrade le canal, il ne doit pas
-- retirer son gain au gagnant ».
--
-- Le `begin … exception` ouvre un SAVEPOINT : l'échec annule le consentement
-- SEUL, la participation et le code survivent. Et l'atomicité recherchée est
-- intacte dans l'autre sens — si la transaction du gain échoue plus loin, le
-- consentement disparaît avec elle. C'est le test de ce lot.
--
-- L'ÉCHEC LAISSE UNE TRACE, parce que le silence est la moitié du défaut
-- d'origine : `audit_logs` reçoit `sms.consent.failed` avec le SQLSTATE et la
-- campagne. Jamais le numéro — un journal n'est pas un endroit où recopier une
-- donnée personnelle.
--
-- ── CE QUI NE CHANGE PAS ────────────────────────────────────
--
-- Tout le reste du corps est repris À L'IDENTIQUE de 20261209120000 : la
-- normalisation de collecte, les huit « case » de masquage, le budget, la
-- pause, l'audit, l'abonnement newsletter et les deux webhooks. Les rejouer
-- autrement aurait été le vrai risque.
-- ============================================================

-- « function is not unique » sinon : la 6-args et la 7-args-à-défaut seraient
-- toutes deux candidates pour un appel à six arguments.
drop function if exists public.claim_winning_spin(uuid,text,text,text,boolean,boolean);

create or replace function public.claim_winning_spin(
  p_spin_id uuid,
  p_first_name text,
  p_email text,
  p_phone text,
  p_accepted_terms boolean,
  p_marketing_opt_in boolean,
  p_sms_opt_in boolean default false
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
  -- (20261209120000 — inchangé, hors `p_sms_opt_in` qui rejoint la branche
  -- `collect_phone` : un consentement SMS suppose un numéro, et un numéro que
  -- la campagne n'a pas le droit de garder n'en autorise aucun.)
  if not v_campaign.collect_email then
    p_email := null;
  end if;
  if not v_campaign.collect_phone then
    p_phone := null;
    p_sms_opt_in := false;
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

      -- ── SMS-C1 · LE CONSENTEMENT, DANS CETTE TRANSACTION ────────────
      --
      -- Miroir exact de l'abonnement newsletter juste au-dessus : l'e-mail
      -- ouvre un canal e-mail, le téléphone ouvre un canal SMS, et les deux
      -- s'écrivent là où le gain s'écrit. `p_phone` a déjà été normalisé par
      -- la campagne ; `p_sms_opt_in` aussi.
      --
      -- Le sous-bloc d'exception est la partie NON négociable : `record_sms_consent`
      -- lève sur un numéro illisible et sur un numéro retiré sans `p_renew`,
      -- et aucune de ces deux situations ne doit coûter son lot au gagnant.
      -- Le savepoint annule le consentement seul.
      --
      -- Version et source sont celles du chemin applicatif, au mot près —
      -- `SMS_CONSENT_VERSION` = 'sms.v1' et `p_consent_source` = 'play'
      -- (`src/lib/claim-libelles.ts`, `src/lib/sms-prize.ts`) : deux chemins
      -- qui écriraient des versions différentes rendraient la preuve de
      -- consentement illisible en support.
      if p_sms_opt_in and p_phone is not null then
        begin
          perform public.record_sms_consent(
            v_spin.organization_id, p_phone, 'sms.v1', 'play', false);
        exception when others then
          -- Le silence était la moitié du défaut : on laisse une trace, sans
          -- jamais y recopier le numéro.
          insert into public.audit_logs(organization_id, actor, action, metadata)
          values(v_spin.organization_id, 'system', 'sms.consent.failed',
            jsonb_build_object('campaign_id', v_spin.campaign_id,
                               'sqlstate', SQLSTATE));
        end;
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

comment on function public.claim_winning_spin(uuid,text,text,text,boolean,boolean,boolean) is
  'Transforme un spin gagnant en participation + code GAIN-… . Impute le coût '
  'du lot au budget de la campagne et la met en pause au plafond atteint, dans '
  'LA transaction du gain. Depuis 20261209120000, les paramètres que la '
  'campagne ne déclare pas collecter (`collect_email`, `collect_phone`) sont '
  'ramenés à null/false DÈS L''ENTRÉE. Depuis 20261213120000 (SMS-C1), le '
  'CONSENTEMENT SMS entre aussi dans cette transaction : `p_sms_opt_in` — '
  'septième paramètre, défaut `false` — déclenche `record_sms_consent` sous '
  'savepoint. Écrit après coup, ce consentement se perdait avec toute '
  'invocation serverless expirée, et rien ne le réémettait : le canal SMS '
  'était alors fermé DÉFINITIVEMENT pour ce numéro, en silence.';

-- L'ACL survit à un `create or replace` mais PAS à un `drop` : ces ordres sont
-- ici le cœur du correctif, pas une formalité. Identiques à 20261209120000.
revoke all on function public.claim_winning_spin(uuid,text,text,text,boolean,boolean,boolean)
  from public, anon, authenticated;
grant execute on function public.claim_winning_spin(uuid,text,text,text,boolean,boolean,boolean)
  to service_role;
