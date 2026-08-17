-- ============================================================
-- SD-9 — L'EXPIRATION D'UN DROIT CESSE D'ÊTRE MUETTE
--
-- Dernier constat du wagon 2 du train de correction
-- (docs/chantier-audit-2026-08-16.md). Deux défauts qui n'en font qu'un :
--
--   1. `run_campaign_schedule()` (20260723110000:207-235) active une campagne
--      programmée SANS LIRE LE MOINDRE DROIT. Elle tourne en pg_cron toutes les
--      10 minutes, sous le propriétaire de la base — donc `auth.role()` y est
--      NULL et le trigger `campaigns_guard_publication` sort à sa première
--      ligne. Une campagne armée pendant que l'abonnement vivait continue donc
--      d'être PUBLIÉE longtemps après sa fin.
--   2. Rien ne le dit. À l'échéance d'un pass ou d'un abonnement, le droit
--      s'éteint par simple absence (c'est le dessin de `org_has_module_access`,
--      et il est bon), mais le commerçant n'apprend jamais que sa campagne ne
--      démarrera pas.
--
-- ── POURQUOI CETTE MIGRATION RENVERSE UNE DÉCISION ÉCRITE ──
--
-- 20260906120000 a délibérément laissé ce cron sans garde, et le motif était
-- exact : « garder `run_campaign_schedule` ferait échouer une activation en
-- tâche de fond, sans que le commerçant puisse jamais apprendre pourquoi sa
-- campagne n'a pas démarré » (20260906120000:215-219, et la même phrase en
-- 20260906120000:61-64 et :411-419). Le refus MUET était donc le motif de ne
-- rien garder — pas un oubli.
--
-- L'audit du 2026-08-16 tranche l'arbitrage dans l'autre sens, et il le peut
-- parce qu'il ferme l'objection au lieu de la contourner : on garde AVEC
-- SIGNAL. Le refus laisse désormais trois traces — un `paused_reason` dédié que
-- le dashboard lit déjà, une ligne d'`audit_logs`, et un job de notification.
-- Ce que 20260906120000 refusait, c'était une garde de plus en tâche de fond ;
-- il écrivait lui-même le geste juste : « un refus VISIBLE (notification,
-- `paused_reason` dédié), pas une garde muette » (:57-60). C'est celui-là.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS, ET C'EST VOULU ──
--
-- Elle NE MET PAS EN PAUSE les campagnes DÉJÀ `active` dont le droit tombe.
-- Le refus se joue à l'ACTIVATION, jamais en cours de route : les contextes
-- publics refusent déjà à la lecture (le joueur ne joue pas), et pauser
-- rétroactivement une campagne vivante, c'est éteindre des QR codes imprimés et
-- posés sur des tables — un geste qu'un défaut de carte bancaire ne doit pas
-- pouvoir déclencher tout seul. Hors périmètre SD-9, décision écrite.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. UN TROISIÈME MOTIF DE PAUSE AUTOMATIQUE
-- ════════════════════════════════════════════════════════════
--
-- ÉLARGISSEMENT PUR — toute valeur admise avant l'est encore, donc aucune ligne
-- existante ne peut être refusée par la nouvelle contrainte et le `drop`/`add`
-- ne fait courir aucun risque aux campagnes en cours. Même geste, même motif
-- qu'`event_sessions_max_participants_check` au lot précédent
-- (20260925120000:813-818).
--
-- Le nom est celui que Postgres a généré à l'ajout de la colonne
-- (20260723110000:35-36) : une contrainte de colonne anonyme se nomme
-- `{table}_{colonne}_check`. Le `if exists` ne doit pas servir de filet ici —
-- s'il ne trouvait rien, l'ANCIENNE contrainte survivrait à côté de la neuve et
-- `'droit_expire'` resterait refusé. C'est exactement ce que l'assertion (d) de
-- la section SD-9 de `droits_stripe.test.sql` éprouve, par une écriture réelle.
alter table public.campaigns
  drop constraint if exists campaigns_paused_reason_check;

alter table public.campaigns
  add constraint campaigns_paused_reason_check
    check (paused_reason is null
           or paused_reason in ('schedule_end', 'budget_reached', 'droit_expire'));

comment on column public.campaigns.paused_reason is
  'Pourquoi la campagne est en pause automatique. Trois motifs : schedule_end '
  '(fenêtre close), budget_reached (plafond atteint), droit_expire (le '
  'planificateur a refusé de publier faute du droit « wheel » — 20260926120000). '
  'Null : pause manuelle ou campagne non pausée. Effacé au retour en active '
  '(trigger campaigns_clear_paused_reason), ce qui rend le rachat d''un droit '
  'auto-réparateur : le passage suivant du planificateur réactive et le motif '
  'disparaît de lui-même.';


-- ════════════════════════════════════════════════════════════
-- 2. LE PLANIFICATEUR LIT LE DROIT, ET DIT QUAND IL REFUSE
-- ════════════════════════════════════════════════════════════
--
-- Corps repris de 20260723110000:207-235 (la définition VIVANTE, seule en
-- vigueur). Signature, langage et ACL inchangés ; trois choses s'ajoutent.
--
-- ── (a) `activated` DEMANDE LE DROIT ──
--
-- Une condition, et elle referme le chemin d'activation sans écran. Elle
-- n'exclut PAS `'droit_expire'` : le rachat du droit doit réactiver tout seul au
-- passage suivant, et le trigger existant efface alors le motif. `'budget_reached'`
-- reste exclu — un plafond atteint prime sur le calendrier, comme avant.
--
-- ── (b) `blocked` : LE REFUS DEVIENT UN ÉTAT ──
--
-- Exactement le complément de `activated` : mêmes conditions de calendrier, droit
-- ABSENT. La campagne tombe en `paused` / `droit_expire` au lieu de rester en
-- brouillon silencieux, ce qui donne au dashboard quelque chose à afficher.
--
-- LES DEUX CTE NE PEUVENT PAS SE DISPUTER UNE LIGNE, et il faut le dire parce
-- que Postgres ne le garantit pas en général : « trying to update the same row
-- twice in a single statement is not supported ». Ici c'est structurel —
-- `org_has_module_access` est `stable`, les deux CTE partagent le snapshot de
-- l'instruction, donc pour une ligne donnée l'une des deux conditions est vraie
-- et l'autre fausse. `ended` non plus : elle exige `status = 'active'`, que les
-- deux autres excluent (`status in ('draft', 'paused')`).
--
-- ── (c) L'IDEMPOTENCE VIENT DE LA TRANSITION, PAS DE LA CLÉ ──
--
-- `paused_reason is distinct from 'droit_expire'` : le signal ne part qu'au
-- passage du seuil. Au passage suivant du cron — dix minutes plus tard, puis
-- toutes les dix minutes pendant des semaines — la campagne porte déjà le motif
-- et sort de `blocked` : ni ligne d'audit, ni job. Sans cela le commerçant
-- recevrait 144 notifications par jour et par campagne.
--
-- La clé d'idempotence du job porte tout de même le JOUR UTC. Ce n'est pas une
-- redondance inutile : elle borne les dégâts d'un scénario que la transition ne
-- couvre pas — motif effacé puis reposé plusieurs fois dans la même journée
-- (activation manuelle, désarmement/réarmement). Au pire une notification par
-- campagne et par jour.
create or replace function public.run_campaign_schedule()
returns table (campaign_id uuid, organization_id uuid, action text)
language sql
security definer
set search_path = ''
as $$
  with activated as (
    update public.campaigns c
       set status = 'active', paused_reason = null
     where c.auto_schedule
       and c.status in ('draft', 'paused')
       -- Un plafond de budget atteint prime sur le calendrier.
       and c.paused_reason is distinct from 'budget_reached'
       and c.starts_at is not null and c.starts_at <= pg_catalog.now()
       and (c.ends_at is null or c.ends_at > pg_catalog.now())
       -- LE CORRECTIF SD-9. Le cron cesse de publier ce qu'aucun droit ne
       -- couvre. `'droit_expire'` n'est pas exclu ci-dessus : c'est ce qui rend
       -- le rachat auto-réparateur.
       and public.org_has_module_access(c.organization_id, 'wheel')
     returning c.id, c.organization_id
  ),
  ended as (
    update public.campaigns c
       set status = 'paused', paused_reason = 'schedule_end'
     where c.auto_schedule
       and c.status = 'active'
       and c.ends_at is not null and c.ends_at <= pg_catalog.now()
     returning c.id, c.organization_id
  ),
  blocked as (
    update public.campaigns c
       set status = 'paused', paused_reason = 'droit_expire'
     where c.auto_schedule
       and c.status in ('draft', 'paused')
       and c.paused_reason is distinct from 'budget_reached'
       -- LA TRANSITION, ET ELLE SEULE : c'est d'ici que vient l'idempotence du
       -- signal, pas de la clé du job.
       and c.paused_reason is distinct from 'droit_expire'
       and c.starts_at is not null and c.starts_at <= pg_catalog.now()
       and (c.ends_at is null or c.ends_at > pg_catalog.now())
       and not public.org_has_module_access(c.organization_id, 'wheel')
     returning c.id, c.organization_id, c.name
  ),
  -- LA TRACE PROBANTE. Même patron que la pause budget de `claim_winning_spin`
  -- (20260723110000:149-153) : acteur 'system', action nommée, métadonnées
  -- suffisantes pour comprendre sans rejouer la requête.
  journal as (
    insert into public.audit_logs (organization_id, actor, action, metadata)
    select b.organization_id, 'system', 'campaign.schedule.blocked',
           pg_catalog.jsonb_build_object(
             'campaign_id', b.id,
             'campaign_name', b.name)
      from blocked b
    returning id
  ),
  -- LA NOTIFICATION. `on conflict do nothing` et non `do update` : un job déjà
  -- déposé a peut-être déjà été traité, le réécrire le ferait repartir.
  --
  -- CLÉS EN camelCase, comme les trois autres jobs déposés par la base
  -- (`campaignId`/`organizationId` pour `automation.budget-paused`, `prizeId`
  -- pour `automation.low-stock`) : `src/lib/automations.ts` les lit ainsi, et un
  -- quatrième nommage aurait fait trouver `undefined` à un handler recopié depuis
  -- `processBudgetPausedJob` — sans erreur et sans notification, soit exactement
  -- le silence que ce lot corrige. NB : `audit_logs.metadata` reste en
  -- snake_case, c'est la convention de CE journal (`campaign_id` dans
  -- claim_winning_spin, `contest_id` dans set_contest_status).
  notifie as (
    insert into public.jobs (type, payload, organization_id, idempotency_key)
    select 'automation.schedule-blocked',
           pg_catalog.jsonb_build_object(
             'campaignId', b.id,
             'organizationId', b.organization_id),
           b.organization_id,
           'automation.schedule-blocked:' || b.id::text || ':'
             || pg_catalog.to_char(pg_catalog.now() at time zone 'UTC', 'YYYYMMDD')
      from blocked b
    on conflict (idempotency_key) do nothing
    returning id
  )
  select a.id, a.organization_id, 'activated'::text from activated a
  union all
  select e.id, e.organization_id, 'paused'::text from ended e
  union all
  select b.id, b.organization_id, 'blocked'::text from blocked b
$$;

comment on function public.run_campaign_schedule() is
  'Bascule programmée des campagnes `auto_schedule`, jouée par pg_cron toutes '
  'les 10 minutes. TROIS issues, rendues sous `action` : ''activated'' (fenêtre '
  'ouverte ET droit « wheel » présent), ''paused'' (fenêtre close), et depuis '
  '20260926120000 ''blocked'' — fenêtre ouverte mais AUCUN droit, la campagne '
  'tombe en paused/droit_expire avec une ligne d''audit '
  '(campaign.schedule.blocked) et un job `automation.schedule-blocked`. '
  'Jusque-là ce cron publiait sans lire aucun droit, et le trigger de '
  'publication ne le voyait pas passer : `auth.role()` est NULL sous le '
  'propriétaire de la base. La décision de NE PAS le garder (20260906120000) '
  'avait pour motif écrit qu''un refus en tâche de fond n''a pas d''écran pour se '
  'dire — c''est cette objection que le signal ferme, pas la garde qui '
  'l''ignore. Le signal ne part qu''à la TRANSITION (paused_reason is distinct '
  'from ''droit_expire''), sinon 144 notifications par jour et par campagne. '
  'N''INTERROMPT PAS une campagne déjà `active` dont le droit tombe : le refus '
  'se joue à l''activation, les contextes publics refusant déjà à la lecture. '
  'Un rachat du droit réactive tout seul au passage suivant, le trigger '
  'campaigns_clear_paused_reason effaçant alors le motif. service_role '
  'uniquement (ACL seule en garde, pattern claim_jobs).';

-- ACL réémise à l'identique : `create or replace` la conserve, mais une porte de
-- service qui décide de ce qui est publié ne se lit pas dans un autre fichier.
revoke all on function public.run_campaign_schedule()
  from public, anon, authenticated;
grant execute on function public.run_campaign_schedule() to service_role;
