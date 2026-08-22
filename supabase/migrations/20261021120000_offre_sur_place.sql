-- ════════════════════════════════════════════════════════════
-- L'OFFRE « SUR PLACE » ET LA TOTALE ÉTENDUE — le côté SQL
--
-- Décision propriétaire du 2026-08-22 : la Vitrine et Réserver cessent d'être
-- invendables. Une cinquième offre les porte (`place`, 79 €), et La Totale les
-- absorbe sans changer de prix (129 €). Le catalogue TypeScript
-- (`src/lib/plans.ts`) décrit la vente ; ce fichier ouvre la seule porte par
-- laquelle un paiement Stripe peut l'inscrire en base.
--
--
-- ── CE QUI SE SERAIT PASSÉ SANS CETTE MIGRATION ─────────────
--
-- Deux `raise exception` de `apply_stripe_subscription_event_v2`, tous deux
-- atteints par le PREMIER abonnement vendu :
--
--   * `p_plan_id not in ('starter','core','engagement','live','full')`
--     → « invalid plan » sur toute souscription à `place` ;
--   * `if not v_entitlements <@ v_allowed` → « invalid entitlement » sur
--     `vitrine`, `reserver`, `duo` et `bande`, donc sur `place` ET sur `full`.
--
-- Et le webhook ne se contente pas d'échouer : il retente. Stripe rejoue trois
-- jours, puis désactive le point d'entrée — ce qui couperait AUSSI la
-- synchronisation des abonnements existants. Le défaut n'aurait donc pas été
-- borné au produit neuf.
--
--
-- ── POURQUOI AUCUNE ORGANISATION NE PEUT RIEN PERDRE ────────
--
-- L'`update` gagne quatre colonnes, et une lecture rapide y verrait un risque :
-- `addon_vitrine = v_access_active and 'vitrine' = any(v_entitlements)` écrit
-- FALSE chez tout abonné qui n'est pas sur `place` ni `full`. Vérifié avant
-- d'écrire, et non supposé :
--
--   1. Les quatre colonnes sont nées `not null default false`
--      (20261001120000 pour `addon_vitrine`, 20261020120000 pour les trois
--      autres) et AUCUN chemin ne les écrit — ni migration, ni RPC, ni code
--      applicatif. `grep -rn "addon_vitrine" src/` ne rend que des `select`.
--      Elles valent donc `false` partout : y réécrire `false` est un no-op.
--
--   2. Le back-office n'accorde PAS par ces colonnes. Il pose des octrois
--      datés dans `organization_module_grants`, et `org_has_module_access`
--      répond « colonne OU octroi vivant ». Un accès offert survit donc
--      intact à cette migration — c'est la moitié de la disjonction que ce
--      fichier ne touche pas.
--
-- C'est exactement ce que le commentaire de `addon_reserver` annonçait le
-- 2026-08-22 : « activé au titre d'une OFFRE d'abonnement ». La colonne
-- attendait sa porte ; la voici.
--
--
-- ── UNE SEULE DÉFINITION VIVANTE, ET ELLE EST ICI ───────────
--
--     grep -rl "create or replace function public.apply_stripe_subscription_event_v2" \
--       supabase/migrations/*.sql
--
-- doit rendre DEUX fichiers après ce lot : 20260805170000 (l'origine) et
-- celui-ci. Le corps ci-dessous est repris CARACTÈRE POUR CARACTÈRE de
-- l'origine, à l'exception des quatre changements énumérés plus haut — y
-- compris ses commentaires internes, qui expliquent des défauts déjà payés et
-- qu'un « nettoyage » ferait revenir.
--
-- `create or replace` conserve l'OID : les `grant` de l'origine restent
-- valides et ne sont pas rejoués.
-- ════════════════════════════════════════════════════════════

create or replace function public.apply_stripe_subscription_event_v2(
  p_event_id text,
  p_event_created_at timestamptz,
  p_customer_id text,
  p_status text,
  p_trial_ends_at timestamptz,
  p_subscription_id text,
  p_plan_id text,
  p_entitlements text[],
  p_price_ids text[]
)
returns table(organization_id uuid, applied boolean, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations%rowtype;
  -- ÉLARGISSEMENT PUR : les neuf droits admis avant le sont encore, dans le
  -- même ordre. Les quatre ajoutés sont ceux que la PR #176 a détachés en une
  -- clé par produit — `vitrine` ne porte plus que la Vitrine publique.
  v_allowed constant text[] := array[
    'core', 'pronostics', 'hunts', 'loyalty', 'jackpot',
    'events', 'calendar', 'quiz', 'referral',
    'vitrine', 'reserver', 'duo', 'bande'
  ];
  v_entitlements text[] := coalesce(p_entitlements, array[]::text[]);
  v_prices text[] := coalesce(p_price_ids, array[]::text[]);
  v_access_active boolean;
begin
  if p_status not in ('trialing','active','past_due','canceled','inactive') then
    raise exception 'invalid subscription status';
  end if;
  if p_event_id is null or pg_catalog.char_length(p_event_id) > 255
     or p_customer_id is null or pg_catalog.char_length(p_customer_id) > 255
     or p_subscription_id is null
     or pg_catalog.char_length(p_subscription_id) > 255 then
    raise exception 'invalid stripe identifiers';
  end if;
  -- `place` rejoint le vocabulaire ; `starter` y reste, c'est l'identifiant
  -- historique encore stocké chez les abonnés de la première heure.
  if p_plan_id not in ('starter', 'core', 'engagement', 'place', 'live', 'full') then
    raise exception 'invalid plan';
  end if;
  if not v_entitlements <@ v_allowed then
    raise exception 'invalid entitlement';
  end if;
  if coalesce(array_length(v_prices, 1), 0) > 20
     or exists(
       select 1 from unnest(v_prices) price
        where pg_catalog.char_length(price) > 255
     ) then
    raise exception 'invalid price identifiers';
  end if;

  insert into public.stripe_events(id, event_created_at)
  values(p_event_id, p_event_created_at)
  on conflict(id) do nothing;
  if not found then
    return query select null::uuid, false, true;
    return;
  end if;

  select * into v_org
    from public.organizations
   where stripe_customer_id = p_customer_id
   for update;
  if not found then raise exception 'unknown stripe customer'; end if;

  if v_org.stripe_event_created_at is null
     or p_event_created_at >= v_org.stripe_event_created_at then
    v_access_active := p_status in ('trialing', 'active', 'past_due');

    perform pg_catalog.set_config(
      'lastchance.stripe_entitlements_sync',
      'on',
      true
    );

    update public.organizations set
      subscription_status = p_status,
      plan = p_plan_id,
      past_due_since = case
        when p_status = 'past_due'
          then coalesce(past_due_since, p_event_created_at)
        else null
      end,
      trial_ends_at = case
        when p_status = 'trialing' and p_trial_ends_at is not null
          then p_trial_ends_at
        else trial_ends_at
      end,
      stripe_event_created_at = p_event_created_at,
      -- Projections de compatibilité : les RPC publiques historiques
      -- continuent à appliquer les mêmes contrôles pendant la migration.
      addon_pronostics = v_access_active and 'pronostics' = any(v_entitlements),
      addon_hunts = v_access_active and 'hunts' = any(v_entitlements),
      addon_loyalty = v_access_active and 'loyalty' = any(v_entitlements),
      addon_jackpot = v_access_active and 'jackpot' = any(v_entitlements),
      addon_events = v_access_active and 'events' = any(v_entitlements),
      addon_calendar = v_access_active and 'calendar' = any(v_entitlements),
      addon_quiz = v_access_active and 'quiz' = any(v_entitlements),
      addon_referral = v_access_active and 'referral' = any(v_entitlements),
      -- Les quatre neuves. Elles se lisent exactement comme les huit
      -- au-dessus, et ne peuvent rien retirer : voir l'en-tête, § « pourquoi
      -- aucune organisation ne peut rien perdre ».
      addon_vitrine = v_access_active and 'vitrine' = any(v_entitlements),
      addon_reserver = v_access_active and 'reserver' = any(v_entitlements),
      addon_duo = v_access_active and 'duo' = any(v_entitlements),
      addon_bande = v_access_active and 'bande' = any(v_entitlements)
    where id = v_org.id;

    delete from public.organization_entitlements
     where organization_entitlements.organization_id = v_org.id
       and source = 'stripe';

    -- DÉRIVÉ de `v_allowed` : les quatre droits neufs entrent dans le registre
    -- sans une ligne de plus ici. C'est la raison pour laquelle la liste est
    -- une constante et non une énumération recopiée.
    insert into public.organization_entitlements (
      organization_id, entitlement, source, active,
      source_reference, metadata, updated_at
    )
    select
      v_org.id,
      allowed.entitlement,
      'stripe',
      v_access_active and allowed.entitlement = any(v_entitlements),
      p_subscription_id,
      pg_catalog.jsonb_build_object('price_ids', to_jsonb(v_prices)),
      pg_catalog.now()
    from unnest(v_allowed) as allowed(entitlement);

    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;
    perform pg_catalog.set_config(
      'lastchance.stripe_entitlements_sync',
      'off',
      true
    );
    return query select v_org.id, true, false;
    -- `return query` AJOUTE au jeu de résultats sans interrompre la fonction :
    -- sans ce `return`, l'exécution retombait sur la sortie « ignoré » plus
    -- bas et rendait DEUX lignes pour un même événement — la seconde annonçant
    -- `applied = false` pour un événement pourtant appliqué — tout en
    -- réécrivant `processed_at` une seconde fois. Le webhook lisait `rows[0]`
    -- et tombait sur la bonne par simple ordre d'émission, qu'aucun `order by`
    -- ne garantit ; un appelant lisant le résultat comme scalaire, lui,
    -- échouait. Le chemin « doublon » portait déjà son `return`.
    return;
  end if;

  update public.stripe_events
     set processed_at = pg_catalog.now()
   where id = p_event_id;
  return query select v_org.id, false, false;
end
$$;


-- ────────────────────────────────────────────────────────────
-- Le registre des droits gagne quatre valeurs
--
-- `organization_entitlements.entitlement` porte un `check` propre, indépendant
-- de `v_allowed` ci-dessus (un `check` ne peut pas lire une constante de
-- fonction). L'insert dérivé ci-dessus poserait donc treize lignes contre une
-- contrainte qui n'en admet que neuf.
--
-- ÉLARGISSEMENT PUR, même geste qu'en 20261020120000 : toute valeur admise
-- avant l'est encore, aucune ligne existante ne peut être refusée.
-- ────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'organization_entitlements'
       and c.conname = 'organization_entitlements_entitlement_check'
  ) then
    alter table public.organization_entitlements
      drop constraint organization_entitlements_entitlement_check;
  end if;
end
$$;

alter table public.organization_entitlements
  add constraint organization_entitlements_entitlement_check
    check (
      entitlement in (
        'core', 'pronostics', 'hunts', 'loyalty', 'jackpot',
        'events', 'calendar', 'quiz', 'referral',
        'vitrine', 'reserver', 'duo', 'bande'
      )
    );

comment on constraint organization_entitlements_entitlement_check
  on public.organization_entitlements is
  'Vocabulaire des droits inscriptibles au registre. Miroir du `v_allowed` de '
  'apply_stripe_subscription_event_v2, volontairement répété (un `check` ne '
  'peut pas lire une constante de fonction). « vitrine », « reserver », « duo » '
  'et « bande » depuis 20261021120000, où l''offre Sur Place les a rendus '
  'vendables par abonnement.';


-- ────────────────────────────────────────────────────────────
-- Le garde-fou suit les colonnes qu'il garde
--
-- `protect_stripe_managed_entitlements` interdit à toute écriture HORS de la
-- transaction du webhook de toucher `plan` et les `addon_*` d'une organisation
-- pilotée par Stripe. Il énumérait huit colonnes ; la fonction ci-dessus en
-- écrit désormais douze.
--
-- Laisser les quatre neuves dehors ne produirait aucun défaut AUJOURD'HUI —
-- rien ne les écrit — mais créerait une asymétrie invisible : Stripe ferait
-- autorité sur quatre colonnes que le garde-fou ne défendrait pas. Le premier
-- écran de back-office qui les basculerait passerait sans erreur, puis serait
-- écrasé au prochain événement Stripe, sans que personne comprenne pourquoi.
--
-- Corps repris CARACTÈRE POUR CARACTÈRE de 20260818120000 (la définition
-- vivante), aux quatre lignes près.
-- ────────────────────────────────────────────────────────────

create or replace function public.protect_stripe_managed_entitlements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.current_setting(
       'lastchance.stripe_entitlements_sync',
       true
     ) is distinct from 'on'
     and exists (
       select 1
         from public.organization_entitlements e
        where e.organization_id = old.id
          and e.source = 'stripe'
          -- LA CORRECTION (20260818120000). Une résiliation laisse les lignes
          -- en place avec `active = false` : sans ce prédicat, l'organisation
          -- reste « pilotée par Stripe » longtemps après que Stripe a cessé de
          -- la piloter.
          and e.active
     )
     and (
       new.plan is distinct from old.plan
       or new.addon_pronostics is distinct from old.addon_pronostics
       or new.addon_hunts is distinct from old.addon_hunts
       or new.addon_loyalty is distinct from old.addon_loyalty
       or new.addon_jackpot is distinct from old.addon_jackpot
       or new.addon_events is distinct from old.addon_events
       or new.addon_calendar is distinct from old.addon_calendar
       or new.addon_quiz is distinct from old.addon_quiz
       or new.addon_referral is distinct from old.addon_referral
       -- Les quatre que l'offre Sur Place fait passer sous autorité Stripe.
       or new.addon_vitrine is distinct from old.addon_vitrine
       or new.addon_reserver is distinct from old.addon_reserver
       or new.addon_duo is distinct from old.addon_duo
       or new.addon_bande is distinct from old.addon_bande
     ) then
    raise exception 'entitlements are managed by Stripe'
      using errcode = '42501';
  end if;
  return new;
end
$$;


-- ────────────────────────────────────────────────────────────
-- Les commentaires de colonne devenus faux
--
-- Celui d'`addon_vitrine` affirmait, en toutes lettres : « Aucun produit
-- Stripe ne la pilote — elle est hors de protect_stripe_managed_entitlements
-- et hors de la projection d'entitlements ». Les deux moitiés cessent d'être
-- vraies au-dessus. Un commentaire de catalogue qui ment est pire qu'absent :
-- il se lit comme une garantie.
-- ────────────────────────────────────────────────────────────

comment on column public.organizations.addon_vitrine is
  'Vitrine publique et salons de jeu, activé au titre d''une OFFRE '
  'd''abonnement. Piloté par Stripe depuis 20261021120000 (offre « Sur Place » '
  'et La Totale) : la colonne est écrite par '
  'apply_stripe_subscription_event_v2 et défendue par '
  'protect_stripe_managed_entitlements. L''octroi daté du back-office reste le '
  'second chemin, indépendant de cette colonne — org_has_module_access répond '
  '« colonne OU octroi vivant », un accès offert survit donc à une résiliation.';

comment on column public.organizations.addon_reserver is
  'Agenda Réserver, activé au titre d''une OFFRE d''abonnement. Détaché '
  'd''addon_vitrine le 2026-08-22 (20261020120000), piloté par Stripe depuis '
  '20261021120000. Mêmes propriétés qu''addon_vitrine : écrit par le webhook, '
  'défendu par le trigger, doublé par l''octroi daté du back-office.';

comment on column public.organizations.addon_duo is
  'Duo Miroir, activé au titre d''une OFFRE d''abonnement. Détaché '
  'd''addon_vitrine le 2026-08-22 (20261020120000), piloté par Stripe depuis '
  '20261021120000. Mêmes propriétés qu''addon_reserver.';

comment on column public.organizations.addon_bande is
  'Portrait de la Bande, activé au titre d''une OFFRE d''abonnement. Détaché '
  'd''addon_vitrine le 2026-08-22 (20261020120000), piloté par Stripe depuis '
  '20261021120000. Mêmes propriétés qu''addon_reserver.';
