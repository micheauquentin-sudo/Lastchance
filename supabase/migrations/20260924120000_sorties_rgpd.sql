-- ============================================================
-- CE QUI SORT DE LA BASE — trois fuites de données, trois grains différents
--
-- Audit transverse du 2026-08-16, wagon 1. Les trois défauts n'ont rien en
-- commun sinon leur famille : de la donnée quitte la base, ou y reste, sans
-- que personne l'ait décidé.
--
--   1. SEC-1  `audit_logs` : un locataire lit le journal des autres.
--   2. IP-1   `referral_signups.ip` : une IP stockée douze mois, jamais lue.
--   3. RET-1  `spins` : aucune purge, alors que la table porte l'empreinte
--             qui relie entre elles les parties d'une même personne.
--
--
-- ── 1. SEC-1 · `audit_logs` : la moitié perdue d'un prédicat ──
--
-- La policy d'origine (00005:101) disait la bonne chose :
--
--     using (organization_id is not null and public.is_org_member(...))
--
-- 00017 l'a resserrée de `is_org_member` à `is_org_owner` — durcissement réel —
-- mais a réécrit le prédicat entier au passage, et le `is not null` s'est
-- retourné en `is null or` :
--
--     using (organization_id is null or public.is_org_owner(...))
--
-- Le premier terme n'est gardé par RIEN. Combiné au `grant select ... to
-- authenticated` de 00018:27, il donne à TOUT compte connecté, de N'IMPORTE
-- quel locataire, la lecture de toutes les lignes à organisation nulle. Ces
-- lignes ne sont pas hypothétiques : le webhook Stripe en écrit à chaque
-- synchronisation d'abonnement (`subscription.sync`), avec l'identifiant
-- client Stripe dans `metadata`. Un commerçant lisait donc le mouvement
-- d'abonnement de ses concurrents.
--
-- Le correctif rétablit l'intention de 00005 sans toucher au durcissement de
-- 00017 : `is not null AND is_org_owner`. Personne ne perd d'accès utile —
-- vérifié dans `src/` : `audit_logs` n'y est jamais LUE, seulement écrite par
-- des clients service_role (`src/lib/audit.ts`, `src/actions/pronostics.ts`),
-- et le back-office admin lit `admin_audit_logs`, qui est une autre table. Les
-- lignes à organisation nulle restent lisibles par la service_role, qui
-- contourne la RLS — c'est-à-dire par le seul lecteur qu'elles concernent.
--
--
-- ── 2. IP-1 · `referral_signups.ip` : collectée, jamais lue ──
--
-- La colonne n'apparaît QUE dans son `create table` (20260729120000:221) et
-- dans l'`insert` de `validate_referral`. Aucune lecture, nulle part — ni SQL,
-- ni TypeScript. Son propre commentaire le dit : « IP d'observation
-- (facultative, jamais une clé de rate-limit) ». Une donnée personnelle
-- conservée pour la durée de rétention de l'organisation sans usage n'a pas de
-- base légale à invoquer ; celle-ci en avait d'autant moins qu'un `grant
-- select` à `authenticated` l'exposait aux membres de l'organisation.
--
-- La SIGNATURE de `validate_referral` est conservée à l'identique — `p_ip`
-- survit et est ignoré. `src/actions/referral.ts:268` continue de le passer,
-- les types TypeScript ne bougent pas, et les `grant execute` posés sur la
-- signature à six arguments restent valides. Changer la signature aurait
-- imposé un `drop function`, donc une reprise des privilèges, pour supprimer
-- un paramètre dont l'absence ne se voit nulle part.
--
--
-- ── 3. RET-1 · `spins` : anonymiser, pas supprimer ──
--
-- Aucune des 127 migrations ne supprime jamais de ligne de `spins`, alors que
-- la table porte `player_key` — l'empreinte de l'appareil, pseudonyme mais
-- STABLE : c'est elle qui relie entre elles toutes les parties d'une même
-- personne, sur toutes les campagnes d'une organisation, indéfiniment.
-- `purge_expired_personal_data` purgeait les participations selon
-- `data_retention_months` et ignorait les parties qui les avaient produites.
--
-- SUPPRIMER les lignes n'était pas jouable, et c'est le fait qui commande le
-- correctif : neuf colonnes d'autres tables (`resulting_spin_id`,
-- `proof_spin_id`…) référencent `spins(id)`. Une purge par `delete` ferait
-- donc cascader ou échouer des objets qui n'ont rien de personnel — un lot
-- gagné, une preuve de parrainage — et emporterait au passage les statistiques
-- agrégées du commerçant, qui n'ont pas d'échéance.
--
-- D'où l'ANONYMISATION : au-delà de la rétention, `player_key` est remplacée
-- par `'purge:' || id`. La ligne survit, ses agrégats survivent, et le LIEN
-- meurt — deux parties de la même personne ne se ressemblent plus. La valeur
-- de remplacement est unique PAR CONSTRUCTION (l'identifiant de la ligne), ce
-- qui satisfait sans y penser l'index unique partiel
-- `spins_one_per_window_idx (wheel_id, player_key, play_window_key)` : deux
-- parties du même appareil dans deux fenêtres différentes reçoivent deux clés
-- distinctes au lieu d'entrer en collision. Le préfixe `purge:` est hors de
-- l'alphabet d'une empreinte réelle (64 caractères hexadécimaux), donc jamais
-- confondable avec un vrai joueur, et le garde `not like 'purge:%'` rend le
-- geste idempotent : le cron ne réécrit pas ce qu'il a déjà anonymisé.
--
-- Le GRAIN est celui de la boucle existante — les organisations dont
-- `data_retention_months` n'est pas nul, exactement comme la purge des
-- participations juste au-dessus. La colonne vaut `default 12` depuis 00019 :
-- une organisation sans rétention déclarée est un cas résiduel, et lui
-- inventer ici un repli différent de celui des participations créerait deux
-- politiques de rétention là où le produit n'en promet qu'une.
-- ============================================================

-- ── 1. `audit_logs` : le journal d'un locataire ne sort pas de chez lui ──
-- `to authenticated` est EXPLICITE, et ce n'est pas décoratif : 00017 avait
-- créé cette policy sans clause `to`, donc pour `public`, et 00020 l'a
-- re-scopée après coup par une boucle sur `pg_policies`. Recréer la policy
-- sans le dire la rendrait de nouveau évaluable par `anon`, dont l'EXECUTE sur
-- les helpers `is_org_*` est révoqué : PostgreSQL lèverait une erreur au lieu
-- de masquer les lignes. La forme vivante est au catalogue, pas dans 00017.
drop policy if exists "audit: owner select" on public.audit_logs;
create policy "audit: owner select" on public.audit_logs
  for select to authenticated using (
    organization_id is not null and public.is_org_owner(organization_id)
  );

-- ── 2. `validate_referral` : corps VERBATIM de 20260729120000, moins l'IP ──
-- Les `revoke`/`grant` d'origine ne sont pas réécrits : `create or replace`
-- conserve les privilèges et le commentaire de la fonction remplacée. Seul un
-- `drop` les emporterait, et il n'y en a aucun ici.
create or replace function public.validate_referral(
  p_campaign_id uuid,
  p_referral_code text,
  p_filleul_key text,
  p_proof_spin_id uuid,
  p_filleul_email text default null,
  -- IGNORÉ depuis cette migration : plus aucune IP n'est stockée. Le paramètre
  -- SURVIT pour que la signature ne change pas — l'appelant continue de le
  -- passer, aucun `drop function`, aucun privilège à reposer.
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
      (campaign_id, organization_id, sponsor_id, filleul_key, filleul_email, proof_spin_id)
    values (p_campaign_id, v_prog.organization_id, v_sponsor.id, p_filleul_key, v_email,
            p_proof_spin_id)
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

-- La colonne peut partir : plus aucune écriture ne la vise.
alter table public.referral_signups drop column if exists ip;

-- ── 3. `purge_expired_personal_data` : corps VERBATIM de 20260902120000, +1 geste ──
create or replace function public.purge_expired_personal_data()
returns table(organizations_processed bigint, participations_deleted bigint, subscribers_deleted bigint)
language plpgsql security definer set search_path = '' as $$
declare r record; p_count bigint := 0; s_count bigint := 0; n bigint := 0; c bigint;
begin
  perform pg_catalog.set_config('lastchance.purge_maintenance', 'on', true);
  for r in select id, data_retention_months from public.organizations
           where data_retention_months is not null loop
    n := n + 1;
    delete from public.participations
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; p_count := p_count + c;
    delete from public.newsletter_subscribers
      where organization_id = r.id and unsubscribed_at is not null
        and unsubscribed_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; s_count := s_count + c;
    delete from public.email_log
      where organization_id = r.id
        and sent_at < now() - make_interval(months => r.data_retention_months);

    -- (a) Le journal SMS : la ligne reste, la personne s'efface.
    update public.sms_log
       set recipient = '000000',
           last_error = null,
           updated_at = pg_catalog.clock_timestamp()
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and (recipient <> '000000' or last_error is not null);

    -- (b1) Consentement jamais retiré et périmé : supprimé.
    delete from public.sms_consents
      where organization_id = r.id
        and revoked_at is null
        and consented_at < now() - make_interval(months => r.data_retention_months);

    -- (b2) Consentement RETIRÉ : conservé — c'est la preuve d'opposition — et
    -- réduit à ce qui permet d'honorer cette opposition.
    update public.sms_consents
       set phone = phone_key,
           consent_source = null,
           revoked_reason = null
      where organization_id = r.id
        and revoked_at is not null
        and revoked_at < now() - make_interval(months => r.data_retention_months)
        and phone_key ~ '^\+?[0-9 .()\-]{6,20}$'
        and (phone <> phone_key or consent_source is not null
             or revoked_reason is not null);

    -- (c) Les PARTIES : la ligne reste, le LIEN entre les parties d'une même
    -- personne meurt. `player_key` est l'empreinte stable de l'appareil ; neuf
    -- colonnes d'autres tables pointent `spins(id)`, donc supprimer la ligne
    -- emporterait des lots et des preuves qui ne sont pas des données
    -- personnelles — et les statistiques du commerçant avec. La valeur de
    -- remplacement dérive de l'identifiant : unique par construction, donc
    -- compatible d'office avec `spins_one_per_window_idx`, et hors de
    -- l'alphabet hexadécimal d'une vraie empreinte. Le garde `not like` rend
    -- le passage idempotent.
    update public.spins
       set player_key = 'purge:' || id
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and player_key not like 'purge:%';
  end loop;
  delete from public.webhook_deliveries
    where (delivered_at is not null or attempts >= 12)
      and created_at < pg_catalog.now() - interval '30 days';
  delete from public.admin_sessions
    where expires_at < pg_catalog.now() - interval '30 days';
  -- L'événement d'audit reste probant, mais l'email et l'IP cessent
  -- d'identifier une personne après 24 mois.
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'on', true);
  update public.admin_audit_logs set actor_email = '[anonymisé]', ip = null,
    metadata = metadata - 'email' - 'target_email'
    where created_at < pg_catalog.now() - interval '24 months'
      and (actor_email <> '[anonymisé]' or ip is not null);
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'off', true);
  delete from public.admin_notes where created_at < pg_catalog.now() - interval '24 months';
  return query select n, p_count, s_count;
end
$$;
