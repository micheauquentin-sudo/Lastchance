-- ============================================================
-- LE CATALOGUE STRIPE DIT VRAI — cinq droits qui mentaient en base
--
-- Volet SQL du wagon 2 du train de correction (docs/chantier-audit-2026-08-16.md).
-- Il applique une seule décision produit, écrite par le propriétaire le
-- 2026-08-04 et confirmée le 2026-08-16 :
--
--   « Un pass (add-on) n'ouvre QUE son module. Il embarque les briques communes
--     strictement nécessaires — organisation, QR/publication DE SON module,
--     lots, caisse, gardes — sans déverrouiller les autres modules. La roue et
--     les campagnes ne s'ouvrent que par une OFFRE d'abonnement (ou un octroi
--     explicitement `wheel`). »
--
-- Les lots 2 à 5 (20260907 → 20260913) ont construit l'octroi daté, son achat,
-- son activation et son unicité. Ils l'ont fait AVANT qu'un catalogue de pass
-- n'existe, et le raccourci qu'ils ont pris — « un octroi vivant porte le socle,
-- et le socle porte la roue » — était juste tant qu'un seul produit se vendait.
-- Il ne l'est plus : le pass Chasse à 29 EUR / 30 jours ouvre aujourd'hui la
-- roue, les campagnes et leur publication, c'est-à-dire l'offre mensuelle à
-- 29 EUR. Le catalogue se sous-vend lui-même.
--
-- ── LES CINQ DÉFAUTS, ET CE QUE CHACUN CHANGE ──
--
--   SD-4  Tout octroi vivant ouvrait `wheel`. La roue exige désormais une
--         OFFRE (abonnement, essai, accès offert) ou un octroi `wheel`.
--   SD-5  Un octroi de pronostics « borné à sa ressource » ne l'était pas :
--         `resource_id` était écrit et lu par personne. Il décide maintenant, et
--         la clôture d'un championnat resserre les octrois qui le visaient.
--   SD-1  La jauge vendue avec le pass « Soirée en jeu » n'était lue par rien,
--         et les paliers vendus (10/30/50) n'étaient même pas stockables.
--   SD-6  Un rachat pendant la grâce d'impayé créait un SECOND octroi récurrent,
--         puis un 500 au webhook suivant.
--   SD-2  Rien ne reprenait ce qui avait été remboursé.
--
-- ── LE FIL COMMUN, ET LA RAISON DE N'EN FAIRE QU'UNE MIGRATION ──
--
-- Les cinq passent par le même goulot : `org_has_module_access`. L'audit des
-- appelants (fait avant d'écrire, pas supposé) l'a montré — `org_has_active_access`
-- n'a QU'UN seul appelant vivant dans tout le schéma, et c'est elle. Tout le
-- reste — les dix RPC de transition, les neuf triggers de publication — passe
-- par `assert_module_publish_allowed`, donc par elle. Séparer les correctifs en
-- cinq migrations aurait fait redéfinir la même fonction cinq fois, chaque
-- version n'étant vraie qu'entre deux fichiers.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SD-4 — LA ROUE CESSE DE SUIVRE N'IMPORTE QUEL OCTROI
-- ════════════════════════════════════════════════════════════
--
-- ── LE DÉFAUT, EXACTEMENT ──
--
-- `org_has_active_access` (20260907120000:373-422) rend vrai dès qu'UN octroi
-- vivant existe, quel que soit son module. `org_has_module_access` répond
-- `when 'wheel' then true` dès que ce socle est acquis. Composées, les deux
-- disent : « un pass Chasse ouvre la roue ». Et par
-- `assert_module_publish_allowed` → `set_campaign_status`, il ouvre aussi la
-- PUBLICATION d'une campagne.
--
-- ── POURQUOI ON NE TOUCHE PAS À `org_has_active_access` ──
--
-- Parce qu'elle répond honnêtement à la question qu'elle pose : « cette
-- organisation a-t-elle un droit payant quelconque ? ». C'est vrai d'un
-- porteur de pass, et c'est ce que les bandeaux « compte actif » doivent
-- lire. Son défaut n'est pas dans sa réponse, il est dans le fait qu'un
-- SECOND besoin — « a-t-elle une offre d'abonnement ? » — s'était rabattu sur
-- elle faute d'exister. On sépare donc les deux questions au lieu de tordre
-- celle qui marche.
--
-- `access_parity.test.sql` et `src/lib/subscription-parity.test.ts` continuent
-- de jouer leur matrice contre `org_has_active_access`, dont la sémantique est
-- inchangée : aucune assertion de parité n'est révisée par ce lot.

-- ── La question neuve : y a-t-il une OFFRE ? ─────────────────
--
-- C'est le corps exact de la branche abonnement de `org_has_active_access`,
-- DÉPLACÉ ici et non recopié : `org_has_active_access` l'appelle désormais. Une
-- copie aurait créé deux écritures de la règle des 336 heures de grâce, et le
-- dépôt sait ce que deux écritures d'un même fait finissent par coûter — c'est
-- le motif littéral du retrait de `created` au lot 20260913120000.
create or replace function public.org_has_subscription_access(
  p_organization_id uuid,
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    -- coalesce EXTÉRIEUR, et il porte tout le poids de la garde : une
    -- organisation inconnue rend zéro ligne, donc NULL, et `if not NULL` ne
    -- déclenche AUCUNE branche en plpgsql — la garde échouerait OUVERTE sur
    -- exactement l'entrée qu'un attaquant contrôle.
    select case
      -- Accès offert par le back-office : prime sur l'état Stripe.
      when o.comp_access
       and (o.comp_access_until is null or o.comp_access_until > p_now)
        then true
      when o.subscription_status = 'active' then true
      -- Impayé : 14 j de grâce (PAST_DUE_GRACE_DAYS, src/lib/subscription.ts).
      -- `336 hours` et non `14 days` : une durée ABSOLUE, comme le TypeScript.
      -- Le champ « jours » se résout dans le fuseau de session et coupe une
      -- heure trop tôt quand la grâce traverse le passage à l'heure d'été
      -- (access_parity.test.sql, finding F7).
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

comment on function public.org_has_subscription_access(uuid, timestamptz) is
  'L''organisation a-t-elle une OFFRE vivante ? Abonnement actif, essai en '
  'cours, impayé dans les 14 jours de grâce, ou accès offert non échu. '
  'Ne regarde AUCUN octroi de module — c''est sa raison d''être : « la roue et '
  'les campagnes ne s''ouvrent que par une offre d''abonnement » (décision '
  'propriétaire du 2026-08-04). Port SQL exact de hasActiveAccess '
  '(src/lib/subscription.ts) ; c''est org_has_active_access qui l''appelle et '
  'non l''inverse, pour qu''il n''existe qu''UNE écriture de la règle de grâce. '
  'Une organisation INCONNUE rend false, pas null.';

revoke all on function public.org_has_subscription_access(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_has_subscription_access(uuid, timestamptz)
  to service_role;

-- ── Le socle, inchangé dans son verdict, factorisé dans son corps ──
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
    -- Un octroi vivant, quel que soit son module, porte le socle avec lui.
    -- Volontairement SANS filtre sur `resource_id` : un pass borné à un
    -- championnat est un droit payant aussi réel qu'un autre, et le socle
    -- répond « ce commerçant paie », pas « pour quoi ».
    exists (
      select 1
        from public.organization_module_grants g
       where g.organization_id = p_organization_id
         and g.revoked_at is null
         and g.starts_at is not null
         and g.starts_at <= p_now
         and (g.ends_at is null or g.ends_at > p_now)
    )
    or public.org_has_subscription_access(p_organization_id, p_now);
$$;

comment on function public.org_has_active_access(uuid, timestamptz) is
  'Socle commun de l''organisation : « a-t-elle un droit payant quelconque ? ». '
  'Deux sources, en OU — un octroi de module VIVANT, ou une offre '
  '(org_has_subscription_access). Verdict INCHANGÉ depuis 20260907120000 ; '
  'seul le corps est factorisé. ATTENTION : ce n''est PLUS ce qui décide de la '
  'roue. Depuis 20260925120000, org_has_module_access interroge '
  'org_has_subscription_access — un pass Chasse ouvrait sinon roue, campagnes '
  'et publication, c''est-à-dire l''offre mensuelle qu''il coûte. '
  'Une organisation INCONNUE rend false, pas null.';

revoke all on function public.org_has_active_access(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_has_active_access(uuid, timestamptz)
  to service_role;


-- ════════════════════════════════════════════════════════════
-- SD-5 (a) — `resource_id` CESSE D'ÊTRE UNE COLONNE MORTE
-- ════════════════════════════════════════════════════════════
--
-- Le lot 2 a créé `organization_module_grants.resource_id` en écrivant qu'un
-- pass est « borné à sa ressource propre ». Audit fait : la colonne est écrite
-- par `grant_module_from_payment` et lue par PERSONNE — ni garde, ni policy,
-- ni index. Un octroi censé couvrir UN championnat couvrait donc le module
-- entier, 360 jours.
--
-- ── LE PARTAGE RETENU, ET POURQUOI CELUI-LÀ ──
--
-- Deux questions distinctes, deux fonctions :
--   * « ce module est-il ouvert ? »            → un octroi NON borné, ou l'offre
--   * « puis-je agir sur CETTE ressource ? »   → ci-dessus, OU un octroi borné
--                                                à exactement cette ressource
--
-- Le sens de lecture compte : un octroi borné n'ouvre PAS le module, mais le
-- droit du module ouvre TOUTE ressource. Sans la première moitié, `resource_id`
-- resterait décoratif ; sans la seconde, un abonné perdrait l'accès à ses
-- propres championnats.

-- ── L'octroi qui porte le module ENTIER ──────────────────────
-- Ajout d'`resource_id is null`, et c'est tout le correctif : un octroi borné
-- sort de cette fonction, donc de `org_has_module_access`, donc des dix RPC de
-- publication. Signature inchangée — les miroirs TypeScript (`estVivant`,
-- module-grants-loader) gardent la leur.
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
  select exists (
    select 1
      from public.organization_module_grants g
     where g.organization_id = p_organization_id
       and g.module = p_module
       -- LE CORRECTIF SD-5. Un octroi borné à une ressource ne porte plus le
       -- droit du module entier : c'est ce que « borné à sa ressource propre »
       -- (20260907120000:157-160) voulait dire depuis le début.
       and g.resource_id is null
       and g.revoked_at is null
       and g.starts_at is not null
       and g.starts_at <= p_now
       and (g.ends_at is null or g.ends_at > p_now)
  );
$$;

comment on function public.org_has_live_module_grant(uuid, text, timestamptz) is
  'Un octroi de ce module, NON BORNÉ à une ressource, est-il vivant maintenant ? '
  'Démarré, non échu, non révoqué. C''est la branche « add-on acheté seul » du '
  'droit effectif : elle n''exige aucun abonnement. `resource_id is null` depuis '
  '20260925120000 — un pass vendu pour UN championnat n''ouvre pas les autres ; '
  'pour lui, voir org_has_live_resource_grant.';

revoke all on function public.org_has_live_module_grant(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_has_live_module_grant(uuid, text, timestamptz)
  to service_role;

-- ── L'octroi qui porte UNE ressource nommée ──────────────────
-- Nom distinct plutôt que surcharge de `org_has_live_module_grant` : une
-- surcharge (uuid, text, uuid) et (uuid, text, timestamptz) se départagerait
-- sur le seul type du troisième argument, et un `null` non typé passé depuis
-- PostgREST deviendrait ambigu — erreur que Postgres rend à l'appel, jamais à
-- la migration.
create or replace function public.org_has_live_resource_grant(
  p_organization_id uuid,
  p_module text,
  p_resource_id uuid,
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_resource_id is not null and exists (
    select 1
      from public.organization_module_grants g
     where g.organization_id = p_organization_id
       and g.module = p_module
       and g.resource_id = p_resource_id
       and g.revoked_at is null
       and g.starts_at is not null
       and g.starts_at <= p_now
       and (g.ends_at is null or g.ends_at > p_now)
  );
$$;

comment on function public.org_has_live_resource_grant(uuid, text, uuid, timestamptz) is
  'Un octroi vivant BORNÉ à exactement cette ressource existe-t-il ? Rend false '
  'sur p_resource_id null plutôt que de se rabattre sur le module entier : le '
  'repli appartient à org_has_module_access_for_resource, qui le fait '
  'explicitement.';

revoke all on function public.org_has_live_resource_grant(uuid, text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_has_live_resource_grant(uuid, text, uuid, timestamptz)
  to service_role;

-- ── LE DROIT DE MODULE — le point où SD-4 se joue ────────────
--
-- Une seule ligne change par rapport à 20260907120000:475 :
-- `org_has_active_access` devient `org_has_subscription_access`. Elle suffit à
-- fermer SD-4 pour les neuf modules à la fois, `wheel` compris, parce que la
-- table `case p_module` est en aval de cette garde et non à côté.
--
-- ── CE QUE LE MÊME GESTE CORRIGE AU PASSAGE, ET QU'IL FAUT DIRE ──
--
-- La branche addon devient elle aussi conditionnée à l'offre. Avant, un pass
-- Chasse doublé d'un `addon_calendar` resté allumé par un abonnement RÉSILIÉ
-- rouvrait le Calendrier — même défaut que `wheel`, une table plus loin. Ce
-- n'est pas un élargissement du chantier : c'est la même phrase du cahier
-- (« sans déverrouiller les autres modules ») appliquée jusqu'au bout.
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
  -- seul le premier se remarque : un `case` sans `else` rendrait null, donc un
  -- refus silencieux, et une faute de frappe dans un nom de module se lirait
  -- comme « ce commerçant n'a pas le droit » pour l'éternité.
  if p_module not in ('wheel', 'hunts', 'calendar', 'loyalty', 'quiz',
                      'jackpot', 'events', 'referral', 'pronostics') then
    raise exception 'unknown module: %', p_module;
  end if;

  -- BRANCHE OCTROI, et elle est PREMIÈRE : un octroi vivant de CE module,
  -- non borné à une ressource, donne le droit sans rien demander d'autre.
  -- C'est là qu'« acheté seul » devient vrai — et c'est aussi là que la PAUSE
  -- À L'ÉCHÉANCE opère, par simple absence.
  if public.org_has_live_module_grant(p_organization_id, p_module, p_now) then
    return true;
  end if;

  -- BRANCHE OFFRE. `org_has_subscription_access` et NON `org_has_active_access` :
  -- la seconde rend vrai sur n'importe quel octroi vivant, ce qui faisait
  -- ouvrir `wheel` — dont la ligne du `case` vaut `true` — par un pass Chasse.
  if not public.org_has_subscription_access(p_organization_id, p_now) then
    return false;
  end if;

  select case p_module
    -- La roue / les campagnes sont le produit de base : aucun addon ne les
    -- conditionne, seule l'OFFRE compte (src/actions/campaigns.ts).
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
  'Droit effectif d''un module, à l''échelle du MODULE ENTIER. Deux branches, '
  'en OU : un octroi daté vivant de ce module et non borné à une ressource, ou '
  'addon allumé ET org_has_subscription_access. Depuis 20260925120000 la '
  'seconde branche exige une OFFRE et non plus « un droit quelconque » : un '
  'pass ouvrait sinon la roue, les campagnes et leur publication — soit '
  'exactement l''abonnement qu''il coûte (décision propriétaire du 2026-08-04, '
  '« un pass n''ouvre QUE son module »). La PAUSE À L''ÉCHÉANCE opère par '
  'ABSENCE : passé `ends_at`, la première branche cesse de répondre. Aucun '
  'cron, aucune écriture, donc aucune prolongation silencieuse possible. '
  'Le module « wheel » n''a pas d''addon (produit de base). '
  'Un nom de module inconnu LÈVE, il ne rend pas false. '
  'Pour un geste portant sur UNE ressource nommée : '
  'org_has_module_access_for_resource.';

revoke all on function public.org_has_module_access(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_has_module_access(uuid, text, timestamptz)
  to service_role;

-- ── Le droit PORTANT SUR UNE RESSOURCE ───────────────────────
create or replace function public.org_has_module_access_for_resource(
  p_organization_id uuid,
  p_module text,
  p_resource_id uuid,
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- L'ordre est délibéré : le droit du module ouvre toute ressource, donc on le
  -- teste d'abord et le cas borné n'est interrogé que s'il décide vraiment.
  -- Il lève aussi sur module inconnu, ce que la seconde branche ne ferait pas.
  select public.org_has_module_access(p_organization_id, p_module, p_now)
      or public.org_has_live_resource_grant(
           p_organization_id, p_module, p_resource_id, p_now);
$$;

comment on function public.org_has_module_access_for_resource(uuid, text, uuid, timestamptz) is
  'Droit effectif portant sur UNE ressource nommée (un championnat, une chasse). '
  'Vrai si le module entier est ouvert, OU si un octroi vivant est borné à '
  'exactement cette ressource. C''est le seul chemin par lequel '
  'organization_module_grants.resource_id décide de quoi que ce soit — avant '
  '20260925120000 la colonne était écrite et lue par personne, et un pass vendu '
  'pour un championnat couvrait le module 360 jours.';

revoke all on function public.org_has_module_access_for_resource(uuid, text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_has_module_access_for_resource(uuid, text, uuid, timestamptz)
  to service_role;

-- ── La garde partagée apprend la ressource ───────────────────
--
-- SURCHARGE à trois arguments plutôt que modification de la garde à deux : les
-- dix RPC de transition et les neuf triggers appellent la forme à deux, et
-- aucune n'a de ressource à passer. Leur en imposer une aurait fait recopier
-- `null` dix fois — c'est-à-dire écrire dix fois « ce module n'a pas de pass à
-- la ressource », ce qui est vrai aujourd'hui et faux au premier suivant.
create or replace function public.assert_module_publish_allowed(
  p_organization_id uuid,
  p_module text,
  p_resource_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.org_has_module_access_for_resource(
       p_organization_id, p_module, p_resource_id) then
    raise exception 'module access required: %', p_module
      using hint = 'addon inactif, abonnement sans acces, ou pass borne a une autre ressource';
  end if;
end;
$$;

comment on function public.assert_module_publish_allowed(uuid, text, uuid) is
  'Lève si l''organisation ne peut pas PUBLIER ce module POUR CETTE RESSOURCE. '
  'Surcharge de la garde à deux arguments, qui reste la porte de tout ce qui '
  'n''a pas de ressource propre. Le message d''erreur est le même : un pass '
  'borné à un autre championnat doit se lire comme un défaut de droit, pas '
  'comme une panne.';

revoke all on function public.assert_module_publish_allowed(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.assert_module_publish_allowed(uuid, text, uuid)
  to service_role;

-- ── Le trigger générique transmet l'identifiant de la ligne ──
--
-- Corps repris de 20260906120000:130-194 (la définition VIVANTE), une seule
-- ligne changée : la garde reçoit `new.id`. Le trigger sert neuf tables ; sur
-- les huit dont aucun octroi ne porte de `resource_id`, l'ajout ne change
-- rien — `org_has_module_access_for_resource` retombe alors sur le droit du
-- module. C'est un élargissement inerte aujourd'hui et déjà câblé demain,
-- préférable à neuf triggers spécialisés.
create or replace function public.guard_module_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_module    text   := tg_argv[0];
  v_column    text   := tg_argv[1];
  v_published text[] := tg_argv[2]::text[];
  v_new       text;
  v_old       text;
  v_org       uuid;
  v_resource  uuid;
begin
  -- ARMÉ POUR LE SEUL PORTEUR D'UN JWT MARCHAND, et 20260905120000 dit
  -- pourquoi : le seed insère des lignes publiées en tant que `postgres`
  -- (aucun JWT) et les crons écrivent en service_role. Armer pour tous
  -- casserait le seed, donc tous les E2E, avec un échec sans rapport visible
  -- avec sa cause.
  if coalesce((select auth.role()), '') <> 'authenticated' then
    return new;
  end if;

  -- Lecture générique par jsonb : la même fonction sert une colonne texte
  -- (`status`) et une colonne booléenne (`enabled`, `auto_schedule`, qui se
  -- lisent 'true'/'false').
  v_new := pg_catalog.to_jsonb(new) ->> v_column;

  -- Retrait, pause, archivage, désarmement : jamais gardés. On ne bloque pas
  -- quelqu'un qui veut cesser d'utiliser.
  if v_new is null or not (v_new = any (v_published)) then
    return new;
  end if;

  -- Sur UPDATE, seule la TRANSITION est gardée : ré-enregistrer une ligne
  -- déjà publiée sans toucher à sa publication ne doit pas exiger le droit,
  -- sinon éditer le libellé d'un lot deviendrait impossible dès la fin de
  -- l'abonnement.
  if tg_op = 'UPDATE' then
    v_old := pg_catalog.to_jsonb(old) ->> v_column;
    if v_old is not distinct from v_new then
      return new;
    end if;
  end if;

  v_org := (pg_catalog.to_jsonb(new) ->> 'organization_id')::uuid;
  -- `->>` rend null si la table n'a pas de colonne `id` : la garde retombe
  -- alors sur le droit du module entier, ce qui est le comportement d'avant.
  v_resource := (pg_catalog.to_jsonb(new) ->> 'id')::uuid;

  -- CORRECTIF M2 (20260906120000). Placé ICI et pas plus haut : les quatre
  -- sorties ci-dessus ne lisent que la ligne fournie par l'appelant lui-même,
  -- elles ne peuvent rien révéler de personne, et les faire précéder d'un
  -- `is_org_editor` ferait payer une lecture de table à toutes les écritures
  -- qui ne publient rien — c'est-à-dire la quasi-totalité d'entre elles.
  --
  -- On ne refuse pas, ON SE TAIT : refuser ici (avec un message propre)
  -- recréerait l'oracle sous un autre code d'erreur. Laisser passer rend la
  -- main à la RLS, dont le refus est le MÊME que l'organisation visée ait le
  -- droit ou non — et c'est cette indistinction qui est le correctif.
  if not public.is_org_editor(v_org) then
    return new;
  end if;

  perform public.assert_module_publish_allowed(v_org, v_module, v_resource);
  return new;
end;
$$;

comment on function public.guard_module_publication() is
  'Trigger de publication : refuse qu''une ligne atteigne un état PUBLIÉ sans '
  'le droit du module lu dans tg_argv[0]. Depuis 20260925120000 il transmet '
  'aussi `new.id` comme ressource, ce qui permet à un pass borné (pronostics) '
  'de publier SA ressource et à elle seule. Ne garde que la TRANSITION vers un '
  'état publié, se tait — au lieu de refuser — quand l''appelant n''est pas '
  'éditeur de l''organisation, pour ne pas recréer un oracle d''existence.';

-- ── set_contest_status : la seule RPC qui tient déjà sa ressource ──
--
-- Corps repris de 20260905120000:445-530 (définition VIVANTE), une seule ligne
-- changée : l'appel de la garde passe `p_contest_id`.
create or replace function public.set_contest_status(
  p_organization_id uuid,
  p_contest_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_finalized timestamptz;
  v_needs_reason boolean := false;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('draft', 'active', 'finished') then
    raise exception 'invalid status';
  end if;

  select c.status, c.finalized_at into v_current, v_finalized
  from public.contests c
  where c.id = p_contest_id and c.organization_id = p_organization_id
  for update;
  if not found then return false; end if;

  if v_current = p_status then
    return true;
  end if;
  -- Un championnat clôturé (récompenses attribuées) ne bouge plus.
  if v_finalized is not null then
    raise exception 'contest finalized';
  end if;
  -- Transitions permises : draft↔active, active→finished,
  -- finished→active (réouverture motivée tant que non clôturé).
  if not (
    (v_current = 'draft' and p_status = 'active')
    or (v_current = 'active' and p_status in ('draft', 'finished'))
    or (v_current = 'finished' and p_status = 'active')
  ) then
    raise exception 'invalid transition';
  end if;

  -- Placé APRÈS la matrice de transitions et non avant : un `finished → active`
  -- illégal doit continuer de s'annoncer comme une transition invalide, pas
  -- comme un défaut de droit, sinon le commerçant irait acheter un module pour
  -- débloquer un geste que le module ne débloque pas. Seule la publication est
  -- gardée : `active → draft` et `active → finished` restent ouverts sans droit.
  --
  -- `p_contest_id` transmis depuis 20260925120000 : un pass de Saison acheté
  -- POUR ce championnat le publie, sans ouvrir les autres championnats de
  -- l'organisation.
  if p_status = 'active' then
    perform public.assert_module_publish_allowed(
      p_organization_id, 'pronostics', p_contest_id);
  end if;

  -- Motif obligatoire pour retirer un championnat en cours de route ou
  -- le rouvrir après l'avoir terminé.
  v_needs_reason := (v_current = 'finished' and p_status = 'active')
    or (v_current = 'active' and p_status = 'draft'
        and public.contest_is_locked(p_contest_id));
  if v_needs_reason
     and (p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 10)
  then
    raise exception 'locked: reason required';
  end if;

  update public.contests
  set status = p_status
  where id = p_contest_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'contest.status.update',
    pg_catalog.jsonb_build_object(
      'contest_id', p_contest_id,
      'previous', v_current,
      'next', p_status,
      'reason', case when v_needs_reason then pg_catalog.btrim(p_reason) end
    )
  );
  return true;
end;
$$;

comment on function public.set_contest_status(uuid,uuid,text,text) is
  'Transition de statut d''un championnat. Exige is_org_editor, et le droit '
  '« pronostics » POUR CE CHAMPIONNAT pour publier — un pass de Saison borné à '
  'ce contest suffit, et n''ouvre pas les autres (20260925120000). Le droit est '
  'vérifié APRÈS la matrice de transitions, pour qu''une transition illégale '
  'continue de se nommer telle. Aucun droit exigé pour repasser en draft ou '
  'terminer.';


-- ════════════════════════════════════════════════════════════
-- SD-5 (b) — LA CLÔTURE D'UN CHAMPIONNAT RESSERRE SES OCTROIS
-- ════════════════════════════════════════════════════════════
--
-- « La Saison de pronostics » se vend pour UN championnat. Quand celui-ci est
-- clos, l'octroi n'a plus d'objet : le laisser courir 360 jours, c'est vendre
-- l'année au prix de la saison.
--
-- ── POURQUOI UN TRIGGER ET NON DEUX FONCTIONS RÉÉCRITES ──
--
-- Deux chemins portent un championnat à l'état clos, et ils sont distincts :
--   * `finalize_contest` (20260721190000:78-248) pose `finalized_at` et
--     attribue les lots — irréversible ;
--   * `set_contest_status(..., 'finished')` termine sans clôturer, et reste
--     réversible.
-- Recopier 170 lignes de `finalize_contest` pour y ajouter six lignes ferait
-- porter à ce lot le risque d'une régression sur l'attribution des lots, qu'il
-- ne touche pas. Un trigger `after update` couvre les DEUX chemins, plus tout
-- futur, avec un seul objet à relire.
--
-- ── POURQUOI `least` ET POURQUOI SEPT JOURS ──
--
-- `least` est MONOTONE : la fin ne peut que se rapprocher. C'est ce qui rend le
-- geste sûr sur le chemin réversible — un commerçant qui termine puis rouvre ne
-- récupère pas ses 360 jours, mais il ne peut pas non plus s'en offrir en
-- basculant le statut d'avant en arrière. Les sept jours sont la queue qui rend
-- cette asymétrie vivable : ils laissent le temps de consulter le classement,
-- de réclamer un lot, et de corriger une clôture faite par erreur.
create or replace function public.shrink_contest_grants_on_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deadline timestamptz := pg_catalog.now() + interval '7 days';
begin
  update public.organization_module_grants g
     set ends_at = least(g.ends_at, v_deadline)
   where g.organization_id = new.organization_id
     and g.module = 'pronostics'
     and g.resource_id = new.id
     -- VIVANTS SEULEMENT, et ce n'est pas une commodité : la contrainte
     -- `grant_fin_apres_debut` exige `ends_at > starts_at`. Un octroi encore
     -- à démarrer (`starts_at` null) ou programmé au-delà de l'échéance
     -- ferait échouer la clôture du championnat sur une violation de
     -- contrainte — un 500 sur le geste le plus important du module.
     and g.revoked_at is null
     and g.starts_at is not null
     and g.starts_at <= pg_catalog.now()
     and (g.ends_at is null or g.ends_at > v_deadline);
  return null;
end;
$$;

comment on function public.shrink_contest_grants_on_close() is
  'Rapproche la fin des octrois « pronostics » bornés à un championnat qui vient '
  'd''être clos : ends_at = least(ends_at, clôture + 7 jours). Couvre les DEUX '
  'chemins de clôture (finalize_contest et set_contest_status → finished) avec '
  'un seul objet, plutôt que de recopier 170 lignes de finalize_contest. '
  'MONOTONE par least : rouvrir un championnat ne rend pas les jours repris, ce '
  'qui interdit de s''en offrir en basculant le statut. Ne touche que les '
  'octrois VIVANTS — un octroi non démarré violerait grant_fin_apres_debut et '
  'ferait échouer la clôture elle-même.';

revoke all on function public.shrink_contest_grants_on_close()
  from public, anon, authenticated, service_role;

drop trigger if exists contests_shrink_grants_on_close on public.contests;
create trigger contests_shrink_grants_on_close
  after update on public.contests
  for each row
  when (
    (old.finalized_at is null and new.finalized_at is not null)
    or (old.status is distinct from new.status and new.status = 'finished')
  )
  execute function public.shrink_contest_grants_on_close();


-- ════════════════════════════════════════════════════════════
-- SD-1 — LA JAUGE VENDUE AVEC LE PASS « SOIRÉE EN JEU » EST ENFIN LUE
-- ════════════════════════════════════════════════════════════
--
-- Le webhook écrit `p_capacity` dans `organization_module_grants.capacity`
-- depuis le lot 4. `event_participant_capacity` (20260805190000:238-260, seule
-- définition vivante) ne lit que `organizations.plan` et `comp_access` : la
-- valeur payée n'entre nulle part. Et `event_sessions.max_participants` porte
-- `check (in (100, 500, 1000))` — les paliers vendus 10, 30 et 50 ne sont même
-- pas STOCKABLES, donc le trigger d'instantané aurait échoué s'il avait su les
-- lire.
--
-- ── POURQUOI LA BRANCHE PLAN SE CONDITIONNE À L'OFFRE ──
--
-- Sans cela, `greatest(100, 30)` rendrait 100 à qui a payé 30 : le plancher
-- historique « legacy/addon 100 » vaut pour un ABONNÉ dont l'offre n'inclut pas
-- la Soirée, jamais pour un commerçant sans offre qui a acheté un pass. Le
-- conditionner à `org_has_subscription_access` est ce qui rend la jauge vendue
-- lisible.
--
-- ── ET POURQUOI IL RESTE UN PLANCHER À 10 ──
--
-- `max_participants` est `not null` avec un `check (in …)` : rendre 0 ferait
-- échouer la création d'une session sur une VIOLATION DE CONTRAINTE au lieu de
-- la refuser sur le droit. Le plancher est donc le plus petit palier vendu, et
-- non l'ancien 100 — sinon la première branche ne servirait à rien.
create or replace function public.event_participant_capacity(
  p_organization_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  -- `greatest` / `least` / `nullif` sont des CONSTRUCTIONS DU PARSEUR et non
  -- des fonctions de pg_catalog : les qualifier lève à l'exécution, jamais à
  -- l'application de la migration. Elles ignorent le search_path, donc `set
  -- search_path = ''` ne les met pas en danger.
  select greatest(
    -- BRANCHE OFFRE — le corps de 20260805190000, plus sa condition d'entrée.
    case
      when not public.org_has_subscription_access(o.id) then 0
      when o.comp_access
       and (o.comp_access_until is null or o.comp_access_until > pg_catalog.now())
        then 1000
      when o.plan = 'full' then 1000
      when o.plan = 'live' then 500
      else 100
    end,
    -- BRANCHE OCTROI — la jauge gelée à l'achat du pass. `max` et non `sum` :
    -- deux passes ne s'additionnent pas, c'est le plus généreux qui vaut, comme
    -- partout ailleurs dans org_module_grant_state.
    coalesce((
      select pg_catalog.max(g.capacity)
        from public.organization_module_grants g
       where g.organization_id = o.id
         and g.module = 'events'
         and g.capacity is not null
         and g.revoked_at is null
         and g.starts_at is not null
         and g.starts_at <= pg_catalog.now()
         and (g.ends_at is null or g.ends_at > pg_catalog.now())
    ), 0),
    -- PLANCHER TECHNIQUE. Voir l'en-tête : 0 ferait échouer l'insertion d'une
    -- session sur event_sessions_max_participants_check.
    10
  )
  from public.organizations o
  where o.id = p_organization_id
$$;

comment on function public.event_participant_capacity(uuid) is
  'Jauge de participants d''une Soirée en jeu : le PLUS GÉNÉREUX entre l''offre '
  '(accès offert ou plan full 1000, live 500, autre abonnement 100, aucune '
  'offre 0) et la jauge gelée sur les octrois « events » VIVANTS. Depuis '
  '20260925120000 seulement — la valeur payée était écrite par le webhook et '
  'lue par personne. La branche offre est conditionnée à '
  'org_has_subscription_access, sans quoi un pass de 30 places en aurait rendu '
  '100. Plancher à 10 (le plus petit palier vendu) parce que '
  'max_participants est not null sous un check : rendre 0 ferait échouer la '
  'création de session sur une contrainte au lieu de la refuser sur le droit. '
  'Une organisation inconnue rend null, comme avant ; les appelants coalescent.';

revoke all on function public.event_participant_capacity(uuid)
  from public, anon, authenticated;
grant execute on function public.event_participant_capacity(uuid)
  to service_role;

-- ── Les paliers vendus deviennent stockables ─────────────────
-- ÉLARGISSEMENT PUR : toute valeur admise avant l'est encore. Aucune ligne
-- existante ne peut donc être refusée par la nouvelle contrainte, et le
-- `drop`/`add` ne fait courir aucun risque aux sessions en cours.
alter table public.event_sessions
  drop constraint if exists event_sessions_max_participants_check;

alter table public.event_sessions
  add constraint event_sessions_max_participants_check
    check (max_participants in (10, 30, 50, 100, 500, 1000));

comment on column public.event_sessions.max_participants is
  'Capacité commerciale figée à la création (trigger '
  'snapshot_event_participant_capacity). Paliers : 10/30/50 vendus avec le pass '
  '« Soirée en jeu », 100 pour un abonnement sans la Soirée, 500 pour le plan '
  'Live, 1000 pour Full ou un accès offert.';


-- ════════════════════════════════════════════════════════════
-- SD-6 — LE RACHAT PENDANT LA GRÂCE RÉACTIVE AU LIEU DE DOUBLER
-- ════════════════════════════════════════════════════════════
--
-- ── LE DÉFAUT, DANS L'ORDRE OÙ IL SE PRODUIT ──
--
--   1. l'abonnement d'un add-on mensuel passe `past_due` ; le webhook pose une
--      fin de grâce sur l'octroi récurrent (`ends_at` non nul) ;
--   2. `organization_module_grants_recurrent_vivant_idx` est PARTIEL sur
--      `ends_at is null` : l'octroi sort de l'index, donc de l'unicité ;
--   3. le commerçant rachète le même add-on. Le refus applicatif
--      (`octroiRecurrentVivant`) exclut lui aussi les lignes à `ends_at` posé :
--      rien ne s'y oppose, un SECOND octroi récurrent naît ;
--   4. au webhook suivant, la levée de grâce remet `ends_at` à null sur le
--      premier → violation d'index → 500, et Stripe retente trois jours.
--
-- Les deux exclusions ont la même cause et se renforcent : ce n'est pas une
-- course, c'est un trou ouvert pendant toute la durée de la grâce.
--
-- ── LE CORRECTIF : RÉACTIVER, PAS INSÉRER ──
--
-- Un rachat pendant la grâce n'est pas un second droit, c'est le MÊME droit
-- repayé. On efface donc la fin de grâce et on rattache l'octroi au nouveau
-- paiement, ce qui rend une quatrième issue : `reactivated`.
--
-- ── POURQUOI `source_reference` EST REMPLACÉE, ET CE QUE ÇA COÛTE ──
--
-- Sans cela, un rejeu du même événement ne trouverait pas l'octroi par sa
-- référence, tenterait une insertion, buterait sur l'index d'unicité du
-- récurrent et se ferait rendre `refused` — c'est-à-dire qu'un simple rejeu se
-- signalerait comme un double débit. Le coût assumé est symétrique et il faut
-- le dire : la référence du paiement d'ORIGINE est perdue, et si Stripe
-- redélivre CET événement-là après la réactivation, il sera rendu `refused`.
-- Bruyant, jamais silencieux — c'est le bon sens de l'erreur.
--
-- La signature ne bouge pas : `src/types/database.generated.ts` n'a rien à
-- recevoir de ce défaut, seul le TypeScript qui filtre les littéraux d'`outcome`
-- doit apprendre le quatrième.
create or replace function public.grant_module_from_payment(
  p_organization_id uuid,
  p_module text,
  p_kind text,
  p_source_reference text,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_activate_by timestamptz default null,
  p_capacity integer default null,
  p_resource_id uuid default null
)
returns table (grant_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_contrainte text;
begin
  -- Même idiome que `declare_sms_sender` et les autres portes service_role du
  -- dépôt. Ce refus-ci LÈVE, contrairement aux issues non nominales plus bas :
  -- un appelant non autorisé est un événement de sécurité, qui doit laisser une
  -- trace, et ce chemin est inatteignable depuis l'application légitime.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'grant_module_from_payment: service_role requis'
      using errcode = '42501';
  end if;

  -- Une référence de paiement est OBLIGATOIRE ici. C'est elle, et elle seule,
  -- qui rend l'index unique opérant : sans elle, l'index partiel ne mord pas
  -- et chaque rejeu créerait un octroi. Un octroi sans référence relève du
  -- back-office, pas de cette fonction.
  if p_source_reference is null or pg_catalog.length(pg_catalog.btrim(p_source_reference)) = 0 then
    raise exception 'grant_module_from_payment: référence de paiement requise'
      using errcode = '22023';
  end if;

  -- ── SD-6. LA RÉACTIVATION PASSE AVANT L'INSERTION ──────────
  -- Bornée aux récurrents SANS terme demandé : un pass a légitimement une fin,
  -- et un récurrent auquel l'appelant impose une fin est une mise en grâce, pas
  -- un rachat.
  if p_kind = 'recurring' and p_ends_at is null then
    select g.id into v_id
      from public.organization_module_grants g
     where g.organization_id = p_organization_id
       and g.module = p_module
       and g.kind = 'recurring'
       -- `source = 'stripe'` : réactiver un octroi OFFERT par le back-office et
       -- y estampiller une référence de paiement en ferait un octroi payé, que
       -- la prochaine résiliation Stripe révoquerait. Les deux portées sont
       -- volontairement disjointes, comme la révocation par webhook (lot 5).
       and g.source = 'stripe'
       and g.revoked_at is null
       and g.starts_at is not null
       -- SOUS GRÂCE, c'est-à-dire hors de l'index d'unicité : exactement les
       -- lignes que le trou laissait doubler.
       and g.ends_at is not null
       -- LE REJEU N'EST PAS UN RACHAT. Sans cette ligne, une redélivrance du
       -- paiement d'origine PENDANT la grâce lèverait la grâce elle-même.
       and g.source_reference is distinct from p_source_reference
     order by g.ends_at desc
     limit 1
       for update;

    if v_id is not null then
      begin
        -- `starts_at` n'est PAS retouché : le droit n'a jamais cessé, seule sa
        -- fin est levée — et `freeze_module_grant_terms` le refuserait.
        update public.organization_module_grants
           set ends_at = null,
               source_reference = p_source_reference
         where id = v_id;
      exception when unique_violation then
        get stacked diagnostics v_contrainte = constraint_name;
        if v_contrainte is distinct from 'organization_module_grants_recurrent_vivant_idx' then
          raise;
        end if;
        -- Un autre octroi récurrent SANS terme tient déjà ce module : c'est le
        -- doublon que ce correctif empêche de créer, hérité d'avant lui. Le
        -- verdict est le même qu'un cumul, et pour la même raison — il y a un
        -- débit sans contrepartie et un humain doit le voir.
        return query select null::uuid, 'refused'::text;
        return;
      end;
      return query select v_id, 'reactivated'::text;
      return;
    end if;
  end if;

  begin
    insert into public.organization_module_grants (
      organization_id, module, kind, source, source_reference,
      starts_at, ends_at, activate_by, capacity, resource_id
    )
    values (
      p_organization_id, p_module, p_kind, 'stripe', p_source_reference,
      p_starts_at, p_ends_at, p_activate_by, p_capacity, p_resource_id
    )
    on conflict (organization_id, source_reference)
      where source = 'stripe' and source_reference is not null
      do nothing
    returning id into v_id;
  exception when unique_violation then
    -- LA VIOLATION EST IDENTIFIÉE PAR SON NOM, LES AUTRES REMONTENT. Rattraper
    -- `unique_violation` en bloc avalerait n'importe quelle unicité future de
    -- la table, y compris une qui signalerait un vrai défaut. Postgres met le
    -- nom de l'index dans `constraint_name` sur une violation d'index unique.
    get stacked diagnostics v_contrainte = constraint_name;
    if v_contrainte is distinct from 'organization_module_grants_recurrent_vivant_idx' then
      raise;
    end if;
    -- CUMUL REFUSÉ. Un AUTRE paiement tient déjà ce module en récurrent : le
    -- commerçant a été débité pour un droit qu'il possède déjà. On ne rend PAS
    -- l'octroi vivant existant — le nommer ferait ressembler un double débit à
    -- un succès, et `outcome` suffit à dire lequel des deux c'est.
    return query select null::uuid, 'refused'::text;
    return;
  end;

  if v_id is not null then
    return query select v_id, 'created'::text;
    return;
  end if;

  -- REJEU : l'octroi existe déjà pour ce paiement. On rend le sien, et surtout
  -- on ne le MET PAS À JOUR — les termes d'un octroi sont une promesse faite au
  -- client au moment de l'achat (le lot 2 les gèle par trigger), et un rejeu ne
  -- doit pas pouvoir les redater.
  select g.id into v_id
    from public.organization_module_grants g
   where g.organization_id = p_organization_id
     and g.source = 'stripe'
     and g.source_reference = p_source_reference;

  return query select v_id, 'replayed'::text;
end;
$$;

comment on function public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid) is
  'Crée l''octroi daté correspondant à un paiement Stripe, et rend '
  '(grant_id, outcome). QUATRE issues, portées par une VALEUR et non par une '
  'nullité : ''created'' = octroi créé ; ''replayed'' = même paiement rejoué, '
  'sans redater l''octroi existant ; ''reactivated'' = rachat d''un récurrent '
  'SOUS GRÂCE — la fin de grâce est levée et la référence rattachée au nouveau '
  'paiement, au lieu de créer un second octroi que la levée de grâce ferait '
  'ensuite violer l''index (20260925120000) ; ''refused'' = un AUTRE paiement '
  'tient déjà ce module en récurrent, donc un débit sans contrepartie — '
  'l''appelant doit crier, pas acquitter en silence. Ne LÈVE ni sur un rejeu ni '
  'sur un refus : le webhook doit pouvoir acquitter, aucun rejeu ne réparant un '
  'conflit définitif. Elle lève sur appelant non service_role et sur référence '
  'de paiement absente. L''idempotence tient aux index uniques et au `for '
  'update` de la branche de réactivation, pas à une lecture préalable — un '
  'select suivi d''un insert laisse une fenêtre que deux livraisons simultanées '
  'traversent toutes les deux (ADR-059).';

revoke all on function public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid)
  to service_role;


-- ════════════════════════════════════════════════════════════
-- SD-2 — REPRENDRE CE QUI A ÉTÉ REMBOURSÉ
-- ════════════════════════════════════════════════════════════
--
-- Rien ne révoque un octroi à `charge.refunded` ni à `dispute.created`, et le
-- back-office REFUSE de révoquer un octroi né d'un paiement en renvoyant vers
-- Stripe — où le geste n'a aucun effet sur la base. Un add-on remboursé reste
-- donc ouvert jusqu'à son terme, et des crédits SMS remboursés restent
-- dépensables.
--
-- Les deux RPC ci-dessous sont IDEMPOTENTES SUR LA RÉFÉRENCE parce qu'un
-- webhook de remboursement est rejoué comme n'importe quel autre, et parce
-- qu'un litige suit souvent un remboursement sur la même charge.

-- ── (a) Révoquer les octrois nés d'un paiement remboursé ─────
create or replace function public.revoke_grant_for_refund(
  p_source_reference text,
  p_reason text
)
returns table (grant_id uuid, grant_module text, revoked boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'revoke_grant_for_refund: service_role requis'
      using errcode = '42501';
  end if;

  if p_source_reference is null
     or pg_catalog.length(pg_catalog.btrim(p_source_reference)) = 0 then
    raise exception 'revoke_grant_for_refund: référence de paiement requise'
      using errcode = '22023';
  end if;

  -- TRONQUÉ ET NON REFUSÉ. `revoked_reason` porte un `check (… <= 300)`, et un
  -- motif trop long venu d'un message Stripe ferait échouer le webhook sur une
  -- contrainte — donc retenter trois jours un remboursement définitif. Le motif
  -- est une trace, pas une donnée de décision.
  v_reason := pg_catalog.left(
    coalesce(nullif(pg_catalog.btrim(p_reason), ''), 'stripe refund'),
    300);

  return query
  with cibles as (
    select g.id
      from public.organization_module_grants g
     where g.source = 'stripe'
       and g.source_reference = p_source_reference
       -- IDEMPOTENCE : un octroi déjà révoqué n'est pas re-révoqué, et son
       -- horodatage d'origine n'est pas réécrit. Un litige qui suit un
       -- remboursement rejoue exactement ce chemin.
       and g.revoked_at is null
       -- DÉJÀ ÉCHU : on n'y touche pas. Marquer « révoqué » un droit qui s'est
       -- éteint tout seul réécrirait l'histoire d'un octroi que les exports
       -- doivent pouvoir expliquer (« les données restent lisibles », lot 2).
       and (g.ends_at is null or g.ends_at > pg_catalog.now())
  ),
  faits as (
    update public.organization_module_grants g
       set revoked_at = pg_catalog.now(),
           revoked_reason = v_reason
      from cibles c
     where g.id = c.id
    returning g.id, g.module
  )
  select f.id, f.module, true from faits f;
end;
$$;

comment on function public.revoke_grant_for_refund(text, text) is
  'Révoque le ou les octrois nés d''un paiement Stripe remboursé ou contesté, '
  'désignés par leur `source_reference` — celle-là même que '
  'grant_module_from_payment a reçue, jamais un identifiant de charge que la '
  'base ne connaît pas. IDEMPOTENTE : un octroi déjà révoqué n''est pas '
  'retouché et ne figure pas dans le retour, ce qui rend un rejeu de webhook '
  'silencieux. Ne touche pas les octrois DÉJÀ ÉCHUS — les marquer révoqués '
  'réécrirait l''histoire d''un droit qui s''est éteint de lui-même. Rend une '
  'ligne par octroi RÉELLEMENT révoqué : zéro ligne veut dire « rien à '
  'reprendre », jamais « échec ». service_role uniquement.';

revoke all on function public.revoke_grant_for_refund(text, text)
  from public, anon, authenticated;
grant execute on function public.revoke_grant_for_refund(text, text)
  to service_role;

-- ── (b) Reprendre les crédits SMS d'un achat remboursé ───────
--
-- ── POURQUOI UN INDEX, ET NON UN TEST D'EXISTENCE ──
--
-- Même raison qu'ADR-059 et que `credit_sms_balance` : `supabase-js` rend
-- `{ error }` de la même façon pour un rollback et pour une coupure survenue
-- APRÈS le commit. Un appelant qui relit pour décider de réessayer ne peut pas
-- distinguer les deux, et Stripe réessaie. Sans index, un rejeu débiterait deux
-- fois — sur un grand livre APPEND-ONLY, donc sans rattrapage possible.
--
-- ── POURQUOI UNE RÉFÉRENCE PRÉFIXÉE ──
--
-- Le débit ne peut pas porter la référence NUE du paiement : l'achat la porte
-- déjà, et `sms_credit_entries_one_purchase_per_reference` n'est partiel que
-- sur `reason = 'purchase'`. Le préfixe donne au débit sa propre clé sans
-- toucher à celle de l'achat, et le prédicat partiel ci-dessous ne mord que sur
-- les lignes de ce chemin — un `adjustment` de geste commercial portant sa
-- propre référence reste libre.
create unique index if not exists sms_credit_entries_one_refund_debit
  on public.sms_credit_entries (organization_id, reference)
  where reason = 'adjustment' and reference like 'stripe_refund:%';

comment on index public.sms_credit_entries_one_refund_debit is
  'Un remboursement Stripe ne peut être repris qu''UNE fois par organisation. '
  'PARTIEL sur le préfixe `stripe_refund:` pour ne pas contraindre les autres '
  'ajustements, qui sont des gestes commerciaux libres. Le grand livre étant '
  'append-only, un double débit serait irrattrapable.';

create or replace function public.debit_sms_balance_for_refund(
  p_source_reference text
)
returns table (org_id uuid, debited_units integer, entry_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_achat public.sms_credit_entries%rowtype;
  v_solde integer;
  v_units integer;
  v_ref text;
  v_entry uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'debit_sms_balance_for_refund: service_role requis'
      using errcode = '42501';
  end if;

  if p_source_reference is null
     or pg_catalog.length(pg_catalog.btrim(p_source_reference)) = 0 then
    raise exception 'debit_sms_balance_for_refund: référence de paiement requise'
      using errcode = '22023';
  end if;

  v_ref := 'stripe_refund:' || pg_catalog.btrim(p_source_reference);
  -- `reference` porte un `check (… between 1 and 200)`. Une référence Stripe
  -- fait une trentaine de caractères ; on refuse plutôt que de tronquer, parce
  -- qu'une référence tronquée désignerait un autre paiement.
  if pg_catalog.char_length(v_ref) > 200 then
    raise exception 'debit_sms_balance_for_refund: référence trop longue'
      using errcode = '22023';
  end if;

  -- L'ACHAT est la source de vérité du montant à reprendre : on ne reprend pas
  -- « ce qui reste », on reprend CE QUI A ÉTÉ VENDU, borné au solde.
  select e.* into v_achat
    from public.sms_credit_entries e
   where e.reason = 'purchase'
     and e.reference = pg_catalog.btrim(p_source_reference)
   order by e.created_at asc
   limit 1;

  if not found then
    -- Aucun achat sous cette référence : ce remboursement ne concerne pas les
    -- SMS. Zéro ligne, pas d'exception — le webhook appelle les deux reprises
    -- sans savoir laquelle s'applique.
    return;
  end if;

  -- LE VERROU EST PRIS SUR LE SOLDE, et il sérialise cette reprise avec les
  -- envois : sans lui, un SMS parti entre la lecture du solde et l'écriture du
  -- mouvement rendrait le débit supérieur au solde restant, donc refusé par
  -- `balance_units >= 0` — au moment le plus inutile.
  select c.balance_units into v_solde
    from public.sms_credits c
   where c.organization_id = v_achat.organization_id
   for update;

  if v_solde is null then
    return;
  end if;

  -- BORNÉ AU SOLDE, jamais négatif. Le commerçant a pu dépenser une partie des
  -- crédits remboursés : on reprend ce qui reste, et le reste est une perte
  -- commerciale, pas une dette qu'on lui inscrirait au compteur.
  v_units := least(v_achat.delta_units, v_solde);
  if v_units <= 0 then
    -- Rien à reprendre. `delta_units <> 0` refuserait de toute façon un
    -- mouvement nul : un journal ne consigne pas les non-événements.
    return;
  end if;

  insert into public.sms_credit_entries (
    organization_id, delta_units, reason,
    unit_cost_micros, currency, destination_country, reference
  ) values (
    v_achat.organization_id, -v_units, 'adjustment',
    -- Le coût GELÉ de l'achat, relu sur sa ligne : le mouvement de reprise doit
    -- valoir exactement ce que valait le mouvement repris, sans quoi la somme
    -- du grand livre cesserait de reconstituer la facturation.
    v_achat.unit_cost_micros, v_achat.currency, v_achat.destination_country,
    v_ref
  )
  on conflict (organization_id, reference)
    where reason = 'adjustment' and reference like 'stripe_refund:%'
  do nothing
  returning id into v_entry;

  -- `returning` ne rend une ligne que si l'insertion a eu lieu : c'est la seule
  -- lecture faite dans la même instruction que l'écriture, donc la seule qu'un
  -- rejeu concurrent ne puisse pas glisser sous les pieds de l'appelant.
  if v_entry is null then
    return;
  end if;

  return query select v_achat.organization_id, v_units, v_entry;
end;
$$;

comment on function public.debit_sms_balance_for_refund(text) is
  'Reprend les crédits SMS d''un achat Stripe remboursé ou contesté. Le montant '
  'repris est celui de l''ACHAT, BORNÉ au solde courant : le solde ne devient '
  'jamais négatif, et ce qui a déjà été consommé est une perte commerciale et '
  'non une dette inscrite au commerçant. IDEMPOTENTE par index '
  '(sms_credit_entries_one_refund_debit) et non par relecture — le grand livre '
  'est append-only, un double débit serait irrattrapable. Rend zéro ligne quand '
  'il n''y a rien à reprendre : référence inconnue des SMS, solde vide, ou '
  'reprise déjà faite. La référence attendue est celle de l''ACHAT '
  '(sms_credit_entries.reference, reason = purchase), pas un identifiant de '
  'charge. service_role uniquement.';

revoke all on function public.debit_sms_balance_for_refund(text)
  from public, anon, authenticated;
grant execute on function public.debit_sms_balance_for_refund(text)
  to service_role;
