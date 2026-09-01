-- ============================================================
-- LE DROIT « rendez_vous » ENTRE DANS LE VOCABULAIRE PILOTÉ PAR STRIPE
--
-- ── LE DÉFAUT ──
--
-- Le module Réservation (RDV-5, 20261107120000) a détaché `rendez_vous` de
-- `reserver` et lui a donné sa colonne `addon_rendez_vous`, que
-- `org_has_module_access` sait lire. Le back-office peut l'accorder :
-- `organization_module_grants_module_check` porte bien la clé
-- (20261108120000:690-694). C'est pourquoi l'octroi manuel fonctionne et que
-- rien n'a été remarqué.
--
-- Mais le droit n'a JAMAIS été ajouté au vocabulaire de l'abonnement :
--
--   * `v_allowed`, la constante d'`apply_stripe_subscription_event_v2`,
--     énumère treize droits (20261021120000:87-91) — pas celui-ci ;
--   * `organization_entitlements_entitlement_check` porte les mêmes treize
--     (20261021120000:257-264), miroir volontairement répété de la constante ;
--   * et la fonction n'écrit pas `addon_rendez_vous`, alors qu'elle écrit ses
--     quatre voisines `addon_vitrine`, `addon_reserver`, `addon_duo`,
--     `addon_bande`.
--
-- Vérifié dans le catalogue VIVANT de la base, et non seulement dans les
-- fichiers : aucune migration postérieure ne redéfinit la fonction ni la
-- contrainte (`apply_stripe_subscription_event_v2` n'apparaît que dans quatre
-- migrations, la plus récente étant 20261021120000).
--
-- ── POURQUOI C'EST URGENT ──
--
-- `src/lib/plans.ts` met `rendez_vous` dans les droits de l'offre « Sur Place »
-- et de « La Totale », et le produit Stripe « Réservation » vient d'être créé
-- (`STRIPE_PRICE_ID_ADDON_RENDEZ_VOUS` posé en Production). Au premier achat,
-- le webhook résout les droits, appelle la RPC avec `rendez_vous` dans le
-- tableau, et `not v_entitlements <@ v_allowed` fait lever « invalid
-- entitlement ». Le webhook répond alors 500
-- (`src/app/api/stripe/webhook/route.ts:199-208`), Stripe retente trois jours
-- puis coupe le point d'entrée — ce qui bloque la synchronisation de TOUS les
-- abonnements, pas seulement celui-là.
--
-- Aucun abonnement actif en réel aujourd'hui : c'est la seule raison pour
-- laquelle il reste du temps pour le réparer proprement.
--
-- ── CE QUE FAIT CETTE MIGRATION ──
--
-- ÉLARGISSEMENT PUR, aux quatre endroits que le droit traverse :
--
--   1. `v_allowed` gagne `rendez_vous` — la RPC cesse de lever ;
--   2. la fonction ÉCRIT `addon_rendez_vous`, comme les quatre voisines. Sans
--      ce point, élargir le vocabulaire ferait ADMETTRE le droit sans jamais
--      le POSER : achat réussi, registre correct, agenda toujours fermé ;
--   3. `organization_entitlements_entitlement_check` gagne la même valeur —
--      sans quoi l'insert dérivé de `v_allowed` poserait quatorze lignes
--      contre une contrainte qui n'en admet que treize ;
--   4. `protect_stripe_managed_entitlements` défend la colonne, puisque Stripe
--      en devient l'auteur. L'en-tête de 20261021120000 explique pourquoi une
--      colonne pilotée mais non défendue est pire qu'inutile.
--
-- RIEN N'EST RETIRÉ, RIEN N'EST RÉORDONNÉ : toute valeur admise avant l'est
-- encore, aucune ligne existante ne peut être refusée, et aucune organisation
-- ne peut rien perdre — `addon_rendez_vous` passe de « jamais écrite » à
-- « écrite par le webhook », et la seule écriture possible aujourd'hui reste
-- l'octroi de back-office, qui vit dans une autre table.
--
-- ── LA GARDE QUI MANQUAIT (voir supabase/tests/vocabulaire_droits.test.sql) ──
--
-- Ces trois énumérations sont recopiées à la main et avaient déjà divergé. Un
-- test pgTAP les compare désormais deux à deux et rougit à la première
-- divergence : sans lui, le prochain droit repasserait par le même trou.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. GARDE DE FILIATION — on ne remplace pas une fonction à l'aveugle
--
-- Une fonction ne se modifie pas par morceaux : `create or replace` la
-- remplace en bloc. Le corps ci-dessous est repris de sa DERNIÈRE définition
-- (20261021120000), aux lignes de `rendez_vous` près. Si la définition VIVANTE
-- n'est pas celle-là, la remplacer annulerait silencieusement un patch
-- intermédiaire — c'est arrivé le 2026-08-23, où un `create or replace` de
-- VIT-7 a effacé en production un correctif de 20261020120000 sans que rien ne
-- le signale, et il a fallu une migration de réparation.
--
-- On vérifie donc la présence des marqueurs que ce fichier doit PRÉSERVER, et
-- non l'absence de ce qu'il ajoute : la garde reste ainsi vraie si les
-- migrations sont rejouées de zéro (`supabase db reset`).
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_src text;
begin
  select p.prosrc into v_src
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'apply_stripe_subscription_event_v2';

  if v_src is null then
    raise exception
      'apply_stripe_subscription_event_v2 est introuvable : la migration 20261021120000 n a pas ete appliquee, on ne peut pas elargir ce qui n existe pas';
  end if;

  -- Marqueur 1 : l'élargissement de 20261021120000 (les quatre clés détachées).
  if pg_catalog.strpos(v_src, '''vitrine'', ''reserver''') = 0
     or pg_catalog.strpos(v_src, 'addon_bande = v_access_active') = 0 then
    raise exception
      'la definition vivante d apply_stripe_subscription_event_v2 ne porte pas l elargissement de 20261021120000 : la remplacer par ce corps ferait perdre des droits';
  end if;

  -- Marqueur 2 : le correctif de la double ligne de résultat (même migration).
  if pg_catalog.strpos(v_src, 'return query select v_org.id, true, false;') = 0 then
    raise exception
      'la definition vivante d apply_stripe_subscription_event_v2 ne porte pas le correctif de double ligne : un patch intermediaire serait annule';
  end if;

  -- Marqueur 3 : le drapeau de session que lit `protect_stripe_managed_entitlements`.
  if pg_catalog.strpos(v_src, 'lastchance.stripe_entitlements_sync') = 0 then
    raise exception
      'la definition vivante d apply_stripe_subscription_event_v2 ne pose pas le drapeau de synchronisation : le garde-fou refuserait l ecriture du webhook';
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 2. La fonction — corps de 20261021120000, plus `rendez_vous`
--
-- `create or replace` conserve l'OID : les `grant` de l'origine restent
-- valides et ne sont pas rejoués.
-- ────────────────────────────────────────────────────────────

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
  -- ÉLARGISSEMENT PUR, une seconde fois : les treize droits admis avant le
  -- sont encore, dans le même ordre. Le quatorzième — `rendez_vous` — est
  -- celui que RDV-5 (20261107120000) a détaché de `reserver` sans jamais
  -- l'inscrire ici : `reserver` garde les MOMENTS, `rendez_vous` porte la
  -- prise de rendez-vous, et seul le second manquait à ce tableau.
  v_allowed constant text[] := array[
    'core', 'pronostics', 'hunts', 'loyalty', 'jackpot',
    'events', 'calendar', 'quiz', 'referral',
    'vitrine', 'reserver', 'rendez_vous', 'duo', 'bande'
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
      -- Les cinq neuves. Elles se lisent exactement comme les huit
      -- au-dessus, et ne peuvent rien retirer : voir l'en-tête, § « pourquoi
      -- aucune organisation ne peut rien perdre ».
      addon_vitrine = v_access_active and 'vitrine' = any(v_entitlements),
      addon_reserver = v_access_active and 'reserver' = any(v_entitlements),
      -- LA LIGNE QUI MANQUAIT. `addon_rendez_vous` existe depuis
      -- 20261107120000 et `org_has_module_access` la lit déjà ; personne ne
      -- l'écrivait. Sans elle, élargir `v_allowed` ci-dessus aurait fait
      -- ADMETTRE le droit sans jamais le POSER : l'achat aurait réussi, le
      -- registre aurait porté la ligne `active = true`, et le commerçant
      -- n'aurait toujours pas eu son agenda. Un défaut plus discret que
      -- l'exception, et bien plus long à trouver.
      addon_rendez_vous = v_access_active and 'rendez_vous' = any(v_entitlements),
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
-- 3. Le registre des droits gagne une quatorzième valeur
--
-- `organization_entitlements.entitlement` porte un `check` propre, indépendant
-- de `v_allowed` ci-dessus (un `check` ne peut pas lire une constante de
-- fonction). L'insert dérivé de la fonction poserait donc quatorze lignes
-- contre une contrainte qui n'en admet que treize.
--
-- ÉLARGISSEMENT PUR, même geste qu'en 20261020120000 et 20261021120000 : toute
-- valeur admise avant l'est encore, aucune ligne existante ne peut être
-- refusée.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def text;
begin
  select pg_catalog.pg_get_constraintdef(c.oid) into v_def
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'organization_entitlements'
     and c.conname = 'organization_entitlements_entitlement_check';

  if v_def is null then
    raise exception
      'organization_entitlements_entitlement_check est introuvable : le registre des droits n a pas la forme attendue';
  end if;

  -- Même garde de filiation que 20261108120000 : on vérifie que les clés à
  -- PRÉSERVER sont là, pas que la nouvelle est absente.
  if pg_catalog.strpos(v_def, 'vitrine') = 0
     or pg_catalog.strpos(v_def, 'reserver') = 0
     or pg_catalog.strpos(v_def, 'bande') = 0
     or pg_catalog.strpos(v_def, 'core') = 0 then
    raise exception
      'organization_entitlements_entitlement_check ne porte pas les cles de 20261021120000 : la definition vivante n est pas celle attendue';
  end if;

  alter table public.organization_entitlements
    drop constraint organization_entitlements_entitlement_check;

  alter table public.organization_entitlements
    add constraint organization_entitlements_entitlement_check
      check (
        entitlement in (
          'core', 'pronostics', 'hunts', 'loyalty', 'jackpot',
          'events', 'calendar', 'quiz', 'referral',
          'vitrine', 'reserver', 'rendez_vous', 'duo', 'bande'
        )
      );
end
$migration$;

comment on constraint organization_entitlements_entitlement_check
  on public.organization_entitlements is
  'Vocabulaire des droits inscriptibles au registre. Miroir du `v_allowed` de '
  'apply_stripe_subscription_event_v2, volontairement répété (un `check` ne '
  'peut pas lire une constante de fonction). QUATORZE valeurs depuis '
  '20261124120000, où « rendez_vous » — détaché de « reserver » par RDV-5 — a '
  'enfin rejoint le vocabulaire piloté par Stripe. La répétition est gardée '
  'par supabase/tests/vocabulaire_droits.test.sql, qui compare les trois '
  'énumérations et rougit à la première divergence.';


-- ────────────────────────────────────────────────────────────
-- 4. Le garde-fou suit la colonne qu'il doit garder
--
-- `protect_stripe_managed_entitlements` interdit à toute écriture HORS de la
-- transaction du webhook de toucher `plan` et les `addon_*` d'une organisation
-- pilotée par Stripe. Il en énumère douze ; la fonction ci-dessus en écrit
-- désormais treize.
--
-- Corps repris de 20261021120000 (la définition vivante), à la ligne de
-- `addon_rendez_vous` près. Même garde de filiation qu'au point 1.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_src text;
begin
  select p.prosrc into v_src
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'protect_stripe_managed_entitlements';

  if v_src is null then
    raise exception
      'protect_stripe_managed_entitlements est introuvable : le garde-fou des colonnes pilotees par Stripe a disparu';
  end if;

  -- Marqueur 1 : le correctif de 20260818120000 — l'autorité Stripe s'arrête
  -- avec l'abonnement (`and e.active`). Sans ce prédicat, une organisation
  -- résiliée reste « pilotée par Stripe » indéfiniment.
  if pg_catalog.strpos(v_src, 'e.active') = 0 then
    raise exception
      'la definition vivante de protect_stripe_managed_entitlements ne porte pas le correctif de 20260818120000 : la remplacer figerait les organisations resiliees';
  end if;

  -- Marqueur 2 : les quatre colonnes de 20261021120000.
  if pg_catalog.strpos(v_src, 'new.addon_bande') = 0
     or pg_catalog.strpos(v_src, 'new.addon_reserver') = 0 then
    raise exception
      'la definition vivante de protect_stripe_managed_entitlements ne defend pas les colonnes de 20261021120000 : un patch intermediaire serait annule';
  end if;
end
$migration$;

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
       -- La cinquième, depuis cette migration : `apply_stripe_subscription_
       -- event_v2` écrit désormais `addon_rendez_vous`. La laisser dehors
       -- reproduirait exactement l'asymétrie que l'en-tête de 20261021120000
       -- décrit — Stripe ferait autorité sur une colonne que le garde-fou ne
       -- défendrait pas, un basculement de back-office passerait sans erreur
       -- puis serait écrasé au prochain événement, sans cause visible.
       or new.addon_rendez_vous is distinct from old.addon_rendez_vous
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
-- 5. Le commentaire de colonne devenu incomplet
--
-- Celui d'`addon_rendez_vous` décrivait un produit que rien ne pilotait. Ce
-- n'est plus vrai : Stripe l'écrit et le trigger la défend. Un commentaire de
-- catalogue qui tait l'autorité se lit comme une permission.
-- ────────────────────────────────────────────────────────────

comment on column public.organizations.addon_rendez_vous is
  'Add-on « Réservation » (prise de rendez-vous : horaires récurrents, '
  'créneaux engendrés, agenda). Distinct d''`addon_reserver`, qui garde les '
  'MOMENTS — ateliers, files, invitations, offres. Les deux produits partagent '
  'les mêmes tables ; c''est reservation_activities.booking_mode qui les '
  'sépare, jamais un schéma en double. Piloté par Stripe depuis '
  '20261124120000 (offres « Sur Place » et « La Totale », et produit '
  '« Réservation » vendu à l''unité) : la colonne est écrite par '
  'apply_stripe_subscription_event_v2 et défendue par '
  'protect_stripe_managed_entitlements. L''octroi daté du back-office reste le '
  'second chemin, indépendant de cette colonne — org_has_module_access répond '
  '« colonne OU octroi vivant », un accès offert survit donc à une résiliation.';


-- ────────────────────────────────────────────────────────────
-- 6. GARDE DE SORTIE — le droit est-il réellement admis, des deux côtés ?
--
-- Sur le modèle de 20261109120000 : on échoue ICI, à l'application, plutôt
-- qu'en production au premier achat. Un `create or replace` sans effet
-- (mauvais schéma, corps non rechargé) ou un `alter constraint` silencieux
-- laisserait la panne intacte et ce fichier passerait pour appliqué.
--
-- Les quatre points sont vérifiés séparément, parce qu'ils peuvent échouer
-- séparément — et parce que le troisième est celui dont l'absence ne se voit
-- pas : le droit serait admis, l'achat réussirait, et l'agenda resterait
-- fermé.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_src text;
  v_allowed_vivant text;
  v_def text;
begin
  select p.prosrc into v_src
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'apply_stripe_subscription_event_v2';

  -- ── 1. `v_allowed` admet le droit ──
  -- On extrait le TABLEAU, et non le corps entier : `addon_rendez_vous`
  -- apparaît aussi dans la projection, et chercher « rendez_vous » partout
  -- rendrait la garde verte alors que la constante n'aurait pas bougé.
  v_allowed_vivant := pg_catalog.substring(
    v_src, 'v_allowed constant text\[\] :=\s*(array\[[^\]]*\])'
  );

  if v_allowed_vivant is null then
    raise exception
      'v_allowed est introuvable dans apply_stripe_subscription_event_v2 : la forme de la constante a change, la garde ne sait plus la lire';
  end if;

  if pg_catalog.strpos(v_allowed_vivant, '''rendez_vous''') = 0 then
    raise exception
      'v_allowed n admet toujours pas rendez_vous : le webhook levera invalid entitlement au premier achat de l offre Sur Place';
  end if;

  -- ── 2. Rien n'a été perdu en chemin ──
  if pg_catalog.strpos(v_allowed_vivant, '''core''') = 0
     or pg_catalog.strpos(v_allowed_vivant, '''vitrine''') = 0
     or pg_catalog.strpos(v_allowed_vivant, '''reserver''') = 0
     or pg_catalog.strpos(v_allowed_vivant, '''bande''') = 0 then
    raise exception
      'v_allowed a PERDU des droits : l elargissement devait etre pur, il ne l est pas';
  end if;

  -- ── 3. La fonction POSE le droit, et ne fait pas que l'admettre ──
  if pg_catalog.strpos(v_src, 'addon_rendez_vous = v_access_active') = 0 then
    raise exception
      'apply_stripe_subscription_event_v2 n ecrit pas addon_rendez_vous : le droit serait admis et jamais pose, l achat reussirait et l agenda resterait ferme';
  end if;

  -- ── 4. Le registre accepte la valeur ──
  select pg_catalog.pg_get_constraintdef(c.oid) into v_def
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'organization_entitlements'
     and c.conname = 'organization_entitlements_entitlement_check';

  if v_def is null or pg_catalog.strpos(v_def, 'rendez_vous') = 0 then
    raise exception
      'organization_entitlements_entitlement_check n admet toujours pas rendez_vous : l insert derive de v_allowed violerait la contrainte et le webhook echouerait quand meme';
  end if;

  -- ── 5. Le garde-fou défend la colonne que Stripe écrit désormais ──
  select p.prosrc into v_src
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'protect_stripe_managed_entitlements';

  if pg_catalog.strpos(v_src, 'new.addon_rendez_vous') = 0 then
    raise exception
      'protect_stripe_managed_entitlements ne defend pas addon_rendez_vous alors que Stripe l ecrit : un basculement de back-office passerait puis serait ecrase sans cause visible';
  end if;
end
$migration$;
