-- ============================================================
-- P0 lot 2 — L'OCTROI DATÉ, ET LE DROIT CORE QU'IL PORTE AVEC LUI
--
-- Suite directe de 20260905120000 (lot 1), qui a fait descendre en base « ce
-- commerçant a-t-il le droit de publier ce module ? ». Ce lot répond à la
-- question suivante : ce droit a-t-il un TERME, et que se passe-t-il après ?
--
-- Trois décisions produit du cahier partagé (docs/codex-handoff.md §2) que le
-- schéma actuel ne peut PAS représenter, et c'est le motif de cette migration :
--
--   1. « Tout add-on peut être acheté seul. Il embarque les briques communes
--      strictement nécessaires. » Or `org_has_module_access` exige aujourd'hui
--      `org_has_active_access`, c'est-à-dire un ABONNEMENT. Un commerçant qui
--      achète la seule Chasse au trésor n'aurait aucun droit : le booléen
--      `addon_hunts` serait vrai et la garde refuserait quand même.
--   2. « 29 EUR / 30 jours, activable dans les 90 jours. » Un booléen n'a ni
--      début, ni fin, ni date limite d'activation. Il n'existe aujourd'hui
--      AUCUNE colonne où écrire la fin d'un pass.
--   3. « À l'expiration d'un pass, la ressource est mise en pause de façon
--      sûre ; les données et exports restent lisibles. Ne jamais prolonger
--      silencieusement. »
--
-- ── LES TROIS ARBITRAGES, ET POURQUOI CEUX-LÀ ──
--
-- (a) ADDITIF, ET NON REMPLAÇANT. Les booléens `addon_*` restent. Vingt
--     migrations et vingt-et-un modules TS les lisent ; les remplacer ferait
--     porter à ce lot un risque sans rapport avec ce qu'il livre. Le droit
--     effectif devient donc « un octroi daté vivant OU (booléen ET abonnement) ».
--     Ce n'est pas une seconde source de vérité : les deux branches disent la
--     même chose — « ce module est-il payé en ce moment ? » — par deux
--     mécanismes dont l'un porte une date et l'autre non. La bascule complète
--     vers les octrois est un lot ultérieur, quand un chemin d'achat existera.
--
-- (b) LA PAUSE EST DÉRIVÉE, PAS ÉCRITE. Aucun cron ne bascule `status` à
--     l'échéance. Trois raisons, dans l'ordre de leur poids :
--       * c'est déjà l'architecture retenue au lot 1, qui laisse les lignes
--         `active` et fait couper le jeu par les gardes d'exécution ;
--       * « ne jamais prolonger silencieusement » : une dérivation ne PEUT pas
--         prolonger — si l'échéance est passée, elle est passée. Un cron, lui,
--         prolonge exactement le temps de sa panne, et sans le dire ;
--       * un cron qui écrit dépublie, donc se trompe de façon destructive. Une
--         dérivation qui se trompe refuse, ce qui se voit et se corrige.
--     Contrepartie assumée et écrite ici plutôt que découverte plus tard : la
--     colonne `status` d'une ressource expirée continue d'afficher `active` en
--     base. Ce que la ressource EST et ce qu'elle peut FAIRE cessent de
--     coïncider, et toute lecture de `status` seul ment. C'est pourquoi ce lot
--     livre `org_module_grant_state`, qui rend la RAISON, et non un booléen.
--
-- (c) L'ACTIVATION EST UN ACTE EXPLICITE, PAS LA PUBLICATION. Déduit du cahier
--     et non choisi : « Soirée en jeu : sept jours de préparation puis 24 heures
--     de jeu ». On prépare AVANT de publier ; si le compteur démarrait à la
--     publication, les sept jours de préparation n'existeraient pas. D'où deux
--     fenêtres distinctes — `activate_by` (délai pour démarrer) et
--     `starts_at`/`ends_at` (durée une fois démarré) — et non une seule.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS, DÉLIBÉRÉMENT ──
--
--   * Aucun produit Stripe, Price ID, checkout ni montant. Le cahier l'interdit
--     explicitement (« ne créer aucun produit Stripe … à partir des montants
--     ci-dessous : ce sont les tarifs de référence produit, à revalider
--     commercialement »). La table porte `source = 'stripe'` dans son
--     vocabulaire pour que le webhook n'ait pas à la modifier plus tard, mais
--     AUCUN chemin Stripe n'est câblé ici.
--   * Aucune durée en dur. Ni 30 jours, ni 90 jours, ni 7 jours : ce sont des
--     décisions commerciales non figées, et les graver en base obligerait à une
--     migration pour changer un prix. Les bornes sont portées par l'appelant
--     qui crée l'octroi ; la base ne contrôle que la COHÉRENCE (fin après
--     début, jauge positive).
--   * Aucune purge. Un octroi expiré est CONSERVÉ : « les données et exports
--     restent lisibles » suppose de pouvoir dire de quoi ils relèvent.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. La table
-- ────────────────────────────────────────────────────────────

create table public.organization_module_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  -- Même vocabulaire que `org_has_module_access` (lot 1). Volontairement répété
  -- plutôt que dérivé : un `check` ne peut pas appeler une fonction stable, et
  -- un type enum partagé rendrait toute évolution du vocabulaire bloquante.
  -- La divergence est empêchée par une assertion pgTAP qui compare les deux
  -- listes, pas par une bonne intention.
  module text not null check (
    module in (
      'wheel', 'hunts', 'calendar', 'loyalty', 'quiz',
      'jackpot', 'events', 'referral', 'pronostics'
    )
  ),

  -- `recurring` : reconduit tant qu'il est payé, sans terme connu à l'avance.
  -- `pass`      : achat unique à durée fixe.
  kind text not null check (kind in ('recurring', 'pass')),

  source text not null check (source in ('backoffice', 'stripe')),
  source_reference text
    check (source_reference is null or char_length(source_reference) <= 255),

  purchased_at timestamptz not null default now(),

  -- Date limite pour DÉMARRER. Null = pas de limite. Sans effet une fois
  -- l'octroi démarré : on ne périme pas rétroactivement ce qui a commencé.
  activate_by timestamptz,

  -- Fenêtre de jeu. `starts_at` null = acheté, pas encore démarré.
  -- `ends_at` null = sans terme (le cas normal d'un `recurring`).
  starts_at timestamptz,
  ends_at timestamptz,

  -- Jauge d'une Soirée en jeu. « enregistrée et jamais ajustée ou facturée
  -- rétroactivement » (cahier §2) : la valeur est gelée par un trigger.
  capacity integer check (capacity is null or capacity between 1 and 500),

  -- Un pass est borné « à sa ressource propre » (cahier §2). Polymorphe et
  -- SANS clé étrangère, comme `reward_issuances.source_id` : la ressource peut
  -- être un contest, une chasse, une session. Null = l'octroi couvre le module
  -- entier.
  resource_id uuid,

  revoked_at timestamptz,
  revoked_reason text
    check (revoked_reason is null or char_length(revoked_reason) <= 300),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Une fin sans début n'a aucun sens et se lirait comme « déjà expiré ».
  constraint grant_fin_apres_debut check (
    ends_at is null or (starts_at is not null and ends_at > starts_at)
  ),
  -- Un octroi démarré ne peut plus avoir de date limite de démarrage à venir
  -- qui le contredise : on garde la trace, mais elle ne décide plus rien.
  constraint grant_pass_borne check (
    kind <> 'pass' or activate_by is not null or starts_at is not null
  )
);

comment on table public.organization_module_grants is
  'Octrois datés de modules. Un octroi VIVANT (démarré, non échu, non révoqué) '
  'confère à lui seul le module ET le socle commun — c''est la traduction de '
  '« tout add-on peut être acheté seul » (docs/codex-handoff.md §2). '
  'La pause à l''échéance est DÉRIVÉE : aucun cron ne bascule de statut, et '
  'un octroi expiré est conservé pour que les exports restent explicables.';

comment on column public.organization_module_grants.activate_by is
  'Date limite pour DÉMARRER l''octroi (« activable dans les 90 jours »). '
  'Sans effet une fois `starts_at` posé : on ne périme pas rétroactivement '
  'ce qui a déjà commencé.';

comment on column public.organization_module_grants.capacity is
  'Jauge d''une Soirée en jeu, gelée dès qu''elle est posée (cahier §2 : '
  '« enregistrée et jamais ajustée ou facturée rétroactivement »).';

comment on column public.organization_module_grants.resource_id is
  'Ressource propre à laquelle un pass est borné (un contest, une chasse). '
  'Polymorphe et SANS clé étrangère, comme reward_issuances.source_id. '
  'Null = l''octroi couvre le module entier.';

-- Index de la seule question posée en chemin chaud : « cette organisation
-- a-t-elle un octroi vivant sur ce module ? ». Partiel sur les non révoqués,
-- qui sont la quasi-totalité des lignes utiles.
create index organization_module_grants_vivants_idx
  on public.organization_module_grants (organization_id, module, ends_at)
  where revoked_at is null and starts_at is not null;

-- ────────────────────────────────────────────────────────────
-- 2. Fermeture des écritures
--
-- Aucun accès `authenticated`, et ce n'est pas un excès de prudence : cette
-- table DÉCIDE de ce qui est payé. Un `grant update` même partiel donnerait à
-- tout éditeur porteur d'un JWT le moyen de repousser sa propre échéance par
-- un PATCH PostgREST — exactement la classe de trou que le lot 1 vient de
-- fermer sur `status`, et qui serait ici plus grave puisqu'elle porte sur le
-- droit lui-même et non sur son application.
-- ────────────────────────────────────────────────────────────

alter table public.organization_module_grants enable row level security;
revoke all on table public.organization_module_grants
  from public, anon, authenticated;
grant select, insert, update, delete on table public.organization_module_grants
  to service_role;

-- ────────────────────────────────────────────────────────────
-- 3. Les deux gels
--
-- `capacity` et `starts_at` sont des promesses faites au client au moment de
-- l'achat. Les laisser modifiables ferait de « jamais ajustée rétroactivement »
-- une intention plutôt qu'une garantie.
-- ────────────────────────────────────────────────────────────

create or replace function public.freeze_module_grant_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Le gel porte sur la VALEUR une fois posée, pas sur la colonne : passer de
  -- null à une valeur est l'acte d'achat/de démarrage, et doit rester possible.
  -- (Même distinction que le gel des libellés de lots, 20260901120000 : y
  -- tester la présence de la clé aurait gravé un état vide à perpétuité.)
  if old.capacity is not null and new.capacity is distinct from old.capacity then
    raise exception 'grant capacity is frozen'
      using errcode = 'check_violation';
  end if;

  if old.starts_at is not null and new.starts_at is distinct from old.starts_at then
    raise exception 'grant start is frozen'
      using errcode = 'check_violation';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

comment on function public.freeze_module_grant_terms() is
  'Gèle la jauge et la date de démarrage d''un octroi une fois posées. '
  'Le gel porte sur la VALEUR et non sur la présence de la colonne : null → '
  'valeur reste permis (c''est l''achat, puis le démarrage), valeur → autre '
  'valeur est refusé.';

revoke all on function public.freeze_module_grant_terms() from public, anon, authenticated;

create trigger freeze_module_grant_terms_trg
  before update on public.organization_module_grants
  for each row execute function public.freeze_module_grant_terms();

-- ────────────────────────────────────────────────────────────
-- 4. L'octroi vivant, et l'ÉTAT qui explique pourquoi il ne l'est pas
--
-- Deux fonctions et non une, parce qu'elles répondent à deux publics :
-- la garde a besoin d'un booléen, l'écran a besoin d'une raison. Rendre
-- seulement le booléen obligerait chaque écran à refaire le calcul pour
-- afficher « pass expiré le 3 mars » — c'est-à-dire à recréer la seconde
-- source de vérité que ce lot évite par ailleurs.
-- ────────────────────────────────────────────────────────────

create or replace function public.org_module_grant_state(
  p_organization_id uuid,
  p_module text,
  p_now timestamptz default pg_catalog.now()
)
returns table (
  state text,
  grant_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  activate_by timestamptz,
  capacity integer
)
language sql
stable
security definer
set search_path = ''
as $$
  -- L'ordre du `order by` EST la règle de choix, et il est délibéré : quand
  -- plusieurs octrois coexistent sur un module (un pass acheté par-dessus un
  -- récurrent), c'est le plus favorable au client qui décide. `live` d'abord,
  -- puis ce qui peut encore être démarré, puis ce qui est fini — et à état
  -- égal, la fin la plus lointaine.
  select
    g.state,
    g.id,
    g.starts_at,
    g.ends_at,
    g.activate_by,
    g.capacity
  from (
    select
      gr.id,
      gr.starts_at,
      gr.ends_at,
      gr.activate_by,
      gr.capacity,
      case
        when gr.revoked_at is not null then 'revoked'
        when gr.starts_at is null
             and gr.activate_by is not null
             and gr.activate_by <= p_now then 'activation_expired'
        when gr.starts_at is null then 'pending'
        when gr.starts_at > p_now then 'scheduled'
        when gr.ends_at is not null and gr.ends_at <= p_now then 'expired'
        else 'live'
      end as state
    from public.organization_module_grants gr
    where gr.organization_id = p_organization_id
      and gr.module = p_module
  ) g
  order by
    case g.state
      when 'live' then 0
      when 'scheduled' then 1
      when 'pending' then 2
      when 'expired' then 3
      when 'activation_expired' then 4
      else 5
    end,
    g.ends_at desc nulls first
  limit 1;
$$;

comment on function public.org_module_grant_state(uuid, text, timestamptz) is
  'État de l''octroi le plus favorable d''un module : live, scheduled, pending, '
  'expired, activation_expired, revoked — ou aucune ligne si l''organisation '
  'n''a jamais rien acheté sur ce module. Rend la RAISON et pas seulement un '
  'booléen, pour qu''un écran puisse écrire « pass expiré le … » sans refaire '
  'le calcul de son côté.';

create or replace function public.org_has_live_module_grant(
  p_organization_id uuid,
  p_module text,
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- `exists` et non une lecture de org_module_grant_state : la question posée
  -- ici est « au moins un », alors que l'autre fonction choisit le meilleur.
  -- Passer par elle rendrait faux le cas où un octroi révoqué serait mieux
  -- classé qu'un octroi vivant — il ne l'est pas aujourd'hui, mais faire
  -- dépendre une GARDE d'un ordre de tri est un couplage qu'on paierait un
  -- jour sans le voir.
  select exists (
    select 1
      from public.organization_module_grants g
     where g.organization_id = p_organization_id
       and g.module = p_module
       and g.revoked_at is null
       and g.starts_at is not null
       and g.starts_at <= p_now
       and (g.ends_at is null or g.ends_at > p_now)
  );
$$;

comment on function public.org_has_live_module_grant(uuid, text, timestamptz) is
  'Un octroi de ce module est-il vivant maintenant ? Démarré, non échu, non '
  'révoqué. C''est la branche « add-on acheté seul » du droit effectif : elle '
  'n''exige AUCUN abonnement, conformément à docs/codex-handoff.md §2.';

-- Les deux sont SECURITY DEFINER et liraient l'état commercial de n'importe
-- quelle organisation : même raisonnement qu'au lot 1, aucun grant à
-- `authenticated`. Les gardes les appellent depuis leur propre contexte.
revoke all on function public.org_module_grant_state(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_module_grant_state(uuid, text, timestamptz)
  to service_role;

revoke all on function public.org_has_live_module_grant(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_has_live_module_grant(uuid, text, timestamptz)
  to service_role;

-- ────────────────────────────────────────────────────────────
-- 5. LE DROIT CORE — le cœur du lot
--
-- `org_has_active_access` répondait « cette organisation a-t-elle un
-- ABONNEMENT valable ? ». Elle doit désormais répondre « … un droit valable ? »,
-- dont un abonnement n'est plus qu'une des sources.
--
-- Le corps existant est repris À L'IDENTIQUE et non réécrit : il est le port
-- d'une règle TS dont la parité est jouée par access_parity.test.sql, et le
-- toucher casserait une garantie sans rapport avec ce lot. La seule chose
-- ajoutée est une branche AMONT.
-- ────────────────────────────────────────────────────────────

create or replace function public.org_has_active_access(
  p_organization_id uuid,
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- BRANCHE NEUVE (lot 2) : un octroi vivant, quel que soit son module,
    -- porte le socle commun avec lui. C'est « il embarque les briques
    -- communes strictement nécessaires » du cahier §2 — et c'est bien un OU :
    -- l'octroi ne remplace pas l'abonnement, il s'y ajoute comme seconde
    -- source du même droit.
    exists (
      select 1
        from public.organization_module_grants g
       where g.organization_id = p_organization_id
         and g.revoked_at is null
         and g.starts_at is not null
         and g.starts_at <= p_now
         and (g.ends_at is null or g.ends_at > p_now)
    )
    or coalesce((
      -- coalesce EXTÉRIEUR, et il porte tout le poids de la garde : une
      -- organisation inconnue rend zéro ligne, donc NULL, et `if not NULL` ne
      -- déclenche AUCUNE branche en plpgsql — la garde échouerait OUVERTE sur
      -- exactement l'entrée qu'un attaquant contrôle. Un identifiant inconnu
      -- doit se lire « pas d'accès », jamais « pas d'avis ».
      select case
        -- Accès offert par le back-office : prime sur l'état Stripe.
        when o.comp_access
         and (o.comp_access_until is null or o.comp_access_until > p_now)
          then true
        when o.subscription_status = 'active' then true
        -- Impayé : 14 j de grâce (PAST_DUE_GRACE_DAYS, src/lib/subscription.ts:36).
        -- `past_due_since` nul = transition en cours que le webhook datera :
        -- on ne coupe pas sur un état incomplet.
        when o.subscription_status = 'past_due'
          then o.past_due_since is null
            or o.past_due_since + interval '336 hours' > p_now
        when o.subscription_status <> 'trialing' then false
        else o.trial_ends_at > p_now
      end
      from public.organizations o
      where o.id = p_organization_id
    ), false);
$$;

comment on function public.org_has_active_access(uuid, timestamptz) is
  'Socle commun de l''organisation. Deux sources, en OU : un octroi de module '
  'VIVANT (lot 2 — « tout add-on peut être acheté seul », donc il porte le '
  'socle), ou l''état d''abonnement (actif, essai en cours, impayé dans les '
  '14 jours, accès offert non échu). Port SQL de hasActiveAccess '
  '(src/lib/subscription.ts) ; la parité est jouée sur une matrice unique par '
  'supabase/tests/access_parity.test.sql et src/lib/subscription-parity.test.ts. '
  'Une organisation INCONNUE rend false, pas null. '
  'N''applique PAS TRIAL_EXPIRY_GRACE_DAYS, qui borne le cron expire-trials.';

-- ────────────────────────────────────────────────────────────
-- 6. Le droit de MODULE, et la pause à l'échéance
--
-- Le booléen `addon_*` continue de valoir, mais il ne suffit plus à lui seul :
-- il exige toujours l'abonnement. L'octroi, lui, se suffit.
-- ────────────────────────────────────────────────────────────

create or replace function public.org_has_module_access(
  p_organization_id uuid,
  p_module text,
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_addon boolean;
begin
  -- Un module inconnu LÈVE au lieu de rendre false. Les deux refusent, mais
  -- seul le premier se remarque : un `case` sans `else` rendrait null, donc
  -- un refus silencieux, et une faute de frappe dans un nom de module se
  -- lirait comme « ce commerçant n'a pas le droit » pour l'éternité.
  if p_module not in ('wheel', 'hunts', 'calendar', 'loyalty', 'quiz',
                      'jackpot', 'events', 'referral', 'pronostics') then
    raise exception 'unknown module: %', p_module;
  end if;

  -- BRANCHE NEUVE (lot 2), et elle est PREMIÈRE : un octroi vivant de CE
  -- module donne le droit sans rien demander d'autre. C'est là que « acheté
  -- seul » devient vrai — et c'est aussi là que la PAUSE À L'ÉCHÉANCE opère,
  -- par simple absence : à `ends_at`, l'octroi cesse d'être vivant, cette
  -- branche cesse de répondre, et le module retombe sur la branche
  -- abonnement — qui refusera si le commerçant n'a que ce pass.
  -- Aucune écriture, aucun cron, donc aucune prolongation possible par panne.
  if public.org_has_live_module_grant(p_organization_id, p_module, p_now) then
    return true;
  end if;

  if not public.org_has_active_access(p_organization_id, p_now) then
    return false;
  end if;

  select case p_module
    -- La roue / les campagnes sont le produit de base : aucun addon ne les
    -- conditionne, seul l'abonnement compte (src/actions/campaigns.ts:171).
    when 'wheel'      then true
    when 'hunts'      then o.addon_hunts
    when 'calendar'   then o.addon_calendar
    when 'loyalty'    then o.addon_loyalty
    when 'quiz'       then o.addon_quiz
    when 'jackpot'    then o.addon_jackpot
    when 'events'     then o.addon_events
    when 'referral'   then o.addon_referral
    when 'pronostics' then o.addon_pronostics
  end
  into v_addon
  from public.organizations o
  where o.id = p_organization_id;

  return coalesce(v_addon, false);
end;
$$;

comment on function public.org_has_module_access(uuid, text, timestamptz) is
  'Droit effectif d''un module. Deux branches, en OU : un octroi daté VIVANT '
  'de ce module (qui se suffit — cahier §2 « acheté seul »), ou addon allumé '
  'ET org_has_active_access. La PAUSE À L''ÉCHÉANCE opère ici par ABSENCE : '
  'passé `ends_at`, la première branche cesse de répondre. Aucun cron, aucune '
  'écriture, donc aucune prolongation silencieuse possible. '
  'Le module « wheel » n''a pas d''addon (produit de base). '
  'Un nom de module inconnu LÈVE, il ne rend pas false.';

-- ATTENTION, PIÈGE VÉRIFIÉ ET NON SUPPOSÉ : `org_has_active_access` est
-- redéfinie ci-dessus, donc les `revoke`/`grant` du lot 1 restent en place
-- (CREATE OR REPLACE ne réinitialise pas les privilèges). On les réaffirme
-- quand même : si un jour la signature change, le CREATE deviendrait un
-- CREATE réel, et un grant par défaut à `public` réapparaîtrait en silence.
revoke all on function public.org_has_active_access(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_has_active_access(uuid, timestamptz)
  to service_role;

revoke all on function public.org_has_module_access(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_has_module_access(uuid, text, timestamptz)
  to service_role;
