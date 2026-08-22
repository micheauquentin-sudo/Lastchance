-- ============================================================
-- UNE CLÉ D'OCTROI PAR PRODUIT — `reserver`, `duo`, `bande` à côté de `vitrine`
--
-- Décision propriétaire du 2026-08-22. Elle défait, volontairement, l'arbitrage
-- d'ADR-109 §A1 recopié en tête de 20261001120000 : « UN seul entitlement les
-- porte toutes les trois ». Cette migration est le « jour où l'un devra se
-- détacher » que ce texte annonçait, et le détachement est ici une décision
-- explicite, pas un état de fait.
--
-- ── CE QU'UNE SEULE CLÉ PORTAIT, MESURÉ ET NON SUPPOSÉ ──
--
-- Au catalogue VIVANT (et non au fil des fichiers de migration, qu'une
-- redéfinition ultérieure rend muets), QUINZE fonctions interrogeaient
-- `org_has_module_access(…, 'vitrine')`, pour SEIZE appels :
--
--   RÉSERVER — douze fonctions, quatre surfaces :
--     activités  : reserve_slot, waitlist_join, claim_waitlist_offer,
--                  reservation_offer_next, redeem_invitation
--     files      : queue_join, queue_public_state
--     stock      : hold_stock_offer, stock_offer_public_state
--     attente    : wait_session_open, wait_session_use_pause,
--                  consume_reserver_wait_spin_grant
--   VITRINE — trois fonctions :
--     create_player_lobby, vitrine_dashboard_state, vitrine_public_state
--     (cette dernière deux fois : `vitrine` et `quiz`)
--
-- LA LISTE DE DÉPART DE CE CHANTIER N'EN CITAIT QUE CINQ — celles qui vivent
-- dans 20261007120000. Les sept autres ont été écrites par 20261005, 20261006
-- et 20261010, et n'ont jamais été recopiées depuis. Ne convertir que cinq
-- portes sur douze aurait laissé un commerçant sans `reserver` entrer en file,
-- prendre une unité de stock et ouvrir une session d'attente — c'est-à-dire
-- livrer « une clé par produit » sous un nom seulement. Les DOUZE sont
-- converties, et c'est l'arbitrage principal tranché ici.
--
-- ── L'ORDRE DES OPÉRATIONS EST UNE PROPRIÉTÉ DE SÛRETÉ ──
--
-- Le REMPLISSAGE RÉTROACTIF (§3) précède TOUT changement de garde (§4 à §6).
-- Une migration s'applique dans une transaction, donc l'ordre est en théorie
-- indifférent ; il ne l'est pas pour qui relit, ni pour une reprise partielle
-- de ce fichier. Écrire les gardes d'abord ferait exister, ne serait-ce que sur
-- le papier, un instant où Réserver, Duo et Bande exigent un droit que personne
-- ne détient — chez de vrais commerçants, en production.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ──
--
--   * `vitrine_dashboard_state` GARDE `vitrine` : c'est le tableau de bord de
--     la Vitrine, et la Vitrine reste ce qu'il ouvre. Il rend un booléen
--     `module_access` unique ; si l'écran commerçant doit demain montrer ou
--     masquer les éditeurs Réserver / Duo / Bande séparément, il lui faudra
--     plus d'un booléen — c'est un changement de FORME, donc de contrat avec
--     l'application, et il n'appartient pas à ce lot.
--   * AUCUN nouveau trigger `guard_module_publication` : voir §7.
--   * AUCUN produit Stripe pour les trois clés neuves, exactement comme
--     `addon_vitrine` (20261001120000) : elles ne sont ni dans
--     `protect_stripe_managed_entitlements`, ni dans aucun `p_entitlements`,
--     ni au catalogue d'add-ons. Le seul chemin reste l'octroi de back-office.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Les trois colonnes d'organisation — miroirs EXACTS d'addon_vitrine
--
-- `boolean not null default false`, plus le `grant select` qu'exigent les
-- grants de colonnes de `organizations` (00017). Le `default false` n'est PAS
-- la valeur finale : §3 les allume immédiatement partout où `addon_vitrine`
-- l'est déjà. Le défaut ne gouverne que les organisations FUTURES, qui
-- n'avaient rien à perdre.
--
-- Posées AVANT la redéfinition d'`org_has_module_access` (§2) qui les lit —
-- même raison qu'en 20261001120000:99-103.
-- ────────────────────────────────────────────────────────────

alter table public.organizations
  add column if not exists addon_reserver boolean not null default false;
alter table public.organizations
  add column if not exists addon_duo      boolean not null default false;
alter table public.organizations
  add column if not exists addon_bande    boolean not null default false;

-- SANS CES TROIS LIGNES, ce n'est pas le seul droit qui tombe : le `select` de
-- `getUserAndOrg` (src/lib/auth.ts) énumère ses colonnes et serait refusé EN
-- ENTIER dès qu'il en nommerait une — donc tout le dashboard.
grant select (addon_reserver) on public.organizations to authenticated;
grant select (addon_duo)      on public.organizations to authenticated;
grant select (addon_bande)    on public.organizations to authenticated;

comment on column public.organizations.addon_reserver is
  'Réserver (activités, files d''accueil, offres de stock, attente active) '
  'activé au titre d''une OFFRE d''abonnement. Détaché de `addon_vitrine` le '
  '2026-08-22 : une clé par produit. Aucun produit Stripe ne la pilote — elle '
  'est hors de `protect_stripe_managed_entitlements` et hors de la projection '
  'd''entitlements — et le seul chemin de la bêta reste l''octroi daté accordé '
  'au back-office, lu par la première branche d''org_has_module_access.';

comment on column public.organizations.addon_duo is
  'Duo Miroir activé au titre d''une OFFRE d''abonnement. Détaché de '
  '`addon_vitrine` le 2026-08-22. Mêmes propriétés qu''`addon_reserver` : '
  'hors Stripe, octroi de back-office pendant la bêta.';

comment on column public.organizations.addon_bande is
  'Portrait de la Bande activé au titre d''une OFFRE d''abonnement. Détaché de '
  '`addon_vitrine` le 2026-08-22. Mêmes propriétés qu''`addon_reserver` : '
  'hors Stripe, octroi de back-office pendant la bêta.';


-- ────────────────────────────────────────────────────────────
-- 2. Le vocabulaire — de dix à treize
--
-- ÉLARGISSEMENT PUR : toute valeur admise avant l'est encore, aucune ligne
-- existante ne peut être refusée par la nouvelle contrainte. Même geste
-- qu'en 20261001120000:141-151, et la contrainte est RENOMMÉE à son nom
-- conventionnel pour la même raison : `module_grants.test.sql` compte les
-- valeurs portées par LA contrainte de la colonne `module`, et deux
-- contraintes coexistantes lui en feraient compter vingt-trois.
--
-- Posé AVANT §3, qui insère des octrois `reserver` / `duo` / `bande` : sans
-- l'élargissement, le remplissage échouerait sur un `check`.
-- ────────────────────────────────────────────────────────────

alter table public.organization_module_grants
  drop constraint if exists organization_module_grants_module_check;

alter table public.organization_module_grants
  add constraint organization_module_grants_module_check
    check (
      module in (
        'wheel', 'hunts', 'calendar', 'loyalty', 'quiz',
        'jackpot', 'events', 'referral', 'pronostics', 'vitrine',
        'reserver', 'duo', 'bande'
      )
    );

comment on column public.organization_module_grants.module is
  'Module couvert par l''octroi. Même vocabulaire que le `if not in` de '
  'org_has_module_access, volontairement répété (un `check` ne peut pas '
  'appeler une fonction stable) et gardé par une assertion pgTAP qui compare '
  'les deux listes dans le catalogue VIVANT. « vitrine » depuis 20261001120000 ; '
  '« reserver », « duo » et « bande » depuis 20261020120000, où le droit unique '
  'de la Vitrine s''est détaché en une clé par produit. « vitrine » ne porte '
  'plus que la Vitrine publique elle-même et les salons.';


-- ────────────────────────────────────────────────────────────
-- 3. LE REMPLISSAGE RÉTROACTIF — la partie qui compte
--
-- CECI TOURNE EN PRODUCTION, CHEZ DE VRAIS COMMERÇANTS. Le critère numéro un
-- de ce lot est qu'AUCUN ne perde un accès qu'il avait. Toute organisation qui
-- détient le droit `vitrine` à l'instant où cette migration s'applique — par
-- l'un OU l'autre des deux chemins d'`org_has_module_access` — reçoit les trois
-- droits neufs, aux MÊMES bornes.
--
-- ── POURQUOI UNE FONCTION, ET NON DEUX INSTRUCTIONS EN LIGNE ──
--
-- Parce qu'un remplissage écrit en ligne ne se PROUVE pas. pgTAP s'exécute
-- APRÈS les migrations : il ne peut pas fabriquer un « avant ». En extrayant le
-- geste dans une fonction, le test rejoue LE code de la migration sur ses
-- propres organisations — et non une copie qui lui ressemble, c'est-à-dire la
-- forme de détecteur muet que ce dépôt s'est déjà fait prendre plusieurs fois.
-- Elle reste au catalogue pour cette seule raison, sans privilège pour
-- personne : ni `public`, ni `anon`, ni `authenticated`, ni `service_role`.
--
-- ── LES DEUX CHEMINS, TRAITÉS SÉPARÉMENT ──
--
--   * `addon_vitrine` allumé → les trois colonnes s'allument. La branche OFFRE
--     d'`org_has_module_access` répond alors identiquement pour les quatre.
--   * un OCTROI `vitrine` → un octroi MIROIR par module, recopiant `kind`,
--     `purchased_at`, `activate_by`, `starts_at`, `ends_at`, `capacity`,
--     `revoked_at` et `revoked_reason`. Recopier les bornes ET la révocation,
--     c'est faire que toute question posée demain aux trois clés neuves
--     (« l''avaient-elles le 12 mars ? ») reçoive la MÊME réponse que `vitrine`.
--
-- ── DEUX EXCLUSIONS, ÉCRITES PLUTÔT QUE TUES ──
--
--   * LES OCTROIS BORNÉS À UNE RESSOURCE (`resource_id is not null`) ne sont
--     pas recopiés. `org_has_live_module_grant` les ignore déjà (correctif
--     SD-5) : ils ne portent PAS le droit du module entier, donc aucune des
--     douze RPC Réserver ne les lit — elles appellent toutes
--     `org_has_module_access`, jamais `_for_resource`. Rien n'est perdu. Et
--     recopier un `resource_id` qui désigne une ressource du monde Vitrine dans
--     un octroi `reserver` aurait fabriqué un pointeur vers une table étrangère.
--   * LES OCTROIS D'ORIGINE STRIPE font ÉCHOUER cette migration, au lieu d'être
--     recopiés. C'est délibéré. `vitrine` n'est pilotée par aucun produit Stripe
--     (20261001120000:58-66), la contrainte de source n'admet que
--     'backoffice' et 'stripe', et le seul index unique de la table porte sur
--     (organization_id, source_reference) quand source = 'stripe' : recopier
--     une telle ligne trois fois la violerait. Surtout, un droit que Stripe
--     gouverne se RÉVOQUE par Stripe — trois miroirs de back-office qu''aucun
--     webhook ne connaît survivraient à la fin de l'abonnement. Si cette
--     exception se lève un jour, c'est que le monde a changé et qu''une décision
--     de propriétaire est due : un déploiement qui s'arrête en le disant vaut
--     mieux qu'un sur-octroi silencieux et perpétuel.
--
-- ── IDEMPOTENCE ──
--
-- L'`update` ne touche que ce qui n'est pas déjà à jour ; l'`insert` saute tout
-- miroir déjà présent aux mêmes (module, kind, starts_at, ends_at). Rejouée,
-- la fonction rend {organisations: 0, octrois: 0} — ce que le test vérifie.
-- ────────────────────────────────────────────────────────────

create or replace function public.mirror_vitrine_entitlements()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_stripe      integer;
  v_organisations integer;
  v_octrois     integer;
begin
  select pg_catalog.count(*)::integer into v_stripe
    from public.organization_module_grants g
   where g.module = 'vitrine'
     and g.source = 'stripe';

  if v_stripe > 0 then
    raise exception
      'octroi vitrine d''origine STRIPE : % ligne(s). Le miroir par produit est un acte de back-office et ne peut pas recopier un droit que Stripe gouverne et révoque. Décision de propriétaire requise avant de rejouer.',
      v_stripe
      using errcode = '22023';
  end if;

  update public.organizations o
     set addon_reserver = true,
         addon_duo      = true,
         addon_bande    = true
   where o.addon_vitrine
     and not (o.addon_reserver and o.addon_duo and o.addon_bande);
  get diagnostics v_organisations = row_count;

  insert into public.organization_module_grants
    (organization_id, module, kind, source, source_reference,
     purchased_at, activate_by, starts_at, ends_at, capacity,
     revoked_at, revoked_reason)
  select g.organization_id, m.module, g.kind, g.source, g.source_reference,
         g.purchased_at, g.activate_by, g.starts_at, g.ends_at, g.capacity,
         g.revoked_at, g.revoked_reason
    from public.organization_module_grants g
   cross join (values ('reserver'), ('duo'), ('bande')) as m(module)
   where g.module = 'vitrine'
     and g.resource_id is null
     and not exists (
       select 1
         from public.organization_module_grants x
        where x.organization_id = g.organization_id
          and x.module          = m.module
          and x.kind            = g.kind
          and x.starts_at is not distinct from g.starts_at
          and x.ends_at   is not distinct from g.ends_at
     );
  get diagnostics v_octrois = row_count;

  return pg_catalog.jsonb_build_object(
    'organisations', v_organisations,
    'octrois', v_octrois
  );
end;
$$;

comment on function public.mirror_vitrine_entitlements() is
  'Donne à toute organisation détenant `vitrine` les droits `reserver`, `duo` '
  'et `bande` aux MÊMES bornes — colonne pour colonne sur `addon_vitrine`, '
  'octroi miroir pour octroi miroir. Appelée UNE fois par 20261020120000, et '
  'gardée au catalogue pour que le pgTAP rejoue LE code du remplissage plutôt '
  'qu''une copie qui lui ressemble : les tests s''exécutent après les '
  'migrations et ne peuvent pas fabriquer d''« avant ». Idempotente. LÈVE sur '
  'un octroi vitrine d''origine Stripe (aucun n''existe : aucun produit Stripe '
  'ne pilote la Vitrine). Ignore les octrois bornés à une ressource, qui ne '
  'portent déjà pas le droit du module entier. N''est exécutable par AUCUN '
  'rôle applicatif.';

-- Une fonction qui distribue des droits ne s'appelle pas depuis l'application.
-- `service_role` est retiré comme les autres : le back-office passe par
-- l'écriture d'octroi ordinaire, pas par un miroir de masse.
revoke all on function public.mirror_vitrine_entitlements()
  from public, anon, authenticated, service_role;

-- L'APPEL. Avant toute garde, et son résultat est affiché dans le journal de
-- déploiement : c'est la seule trace que laisse un remplissage réussi.
do $migration$
declare
  v_bilan jsonb;
begin
  v_bilan := public.mirror_vitrine_entitlements();
  raise notice 'miroir des droits Vitrine : % organisation(s) mise(s) à jour, % octroi(s) créé(s)',
    v_bilan ->> 'organisations', v_bilan ->> 'octrois';
end
$migration$;

-- LE CONTRÔLE DU CONTRÔLE. Un remplissage qui n'a rien trouvé à faire est
-- indistinguable d'un remplissage cassé, sauf à le vérifier : après l'appel,
-- il ne doit exister AUCUNE organisation portant le droit `vitrine` sans
-- porter les trois autres. La vérification interroge la VRAIE fonction de
-- droit, pas les tables — c'est elle que les gardes appelleront.
do $migration$
declare
  v_orphelines integer;
begin
  select pg_catalog.count(*)::integer into v_orphelines
    from public.organizations o
   where public.org_has_module_access(o.id, 'vitrine')
     and not (
       public.org_has_module_access(o.id, 'reserver')
       and public.org_has_module_access(o.id, 'duo')
       and public.org_has_module_access(o.id, 'bande')
     );
  if v_orphelines > 0 then
    raise exception
      '% organisation(s) détiennent `vitrine` sans les trois droits neufs : le remplissage rétroactif n''a pas tenu sa promesse, et Réserver / Duo / Bande se fermeraient chez elles',
      v_orphelines;
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 4. Le droit de module apprend les trois clés
--
-- Corps repris de la définition VIVANTE (20261001120000:173-237). Six lignes
-- changent, et elles seules : trois entrent au `not in`, trois branches du
-- `case` sont posées. Tout le reste est identique au caractère près, y compris
-- l'ordre des deux branches (octroi d'abord, offre ensuite) dont dépendent
-- « acheté seul » et la pause à l'échéance.
--
-- Les trois nouvelles lignes du `case` se lisent comme les huit add-ons et NON
-- comme la roue : ce sont des offres distinctes, jamais incluses dans
-- l'abonnement de base. `wheel` reste la seule ligne à valoir `true`, et la
-- garde de cardinalité de src/lib/module-access-parity.test.ts épingle ce
-- « une seule » — elle ne bouge donc pas.
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
  -- seul le premier se remarque : un `case` sans `else` rendrait null, donc un
  -- refus silencieux, et une faute de frappe dans un nom de module se lirait
  -- comme « ce commerçant n'a pas le droit » pour l'éternité.
  if p_module not in ('wheel', 'hunts', 'calendar', 'loyalty', 'quiz',
                      'jackpot', 'events', 'referral', 'pronostics',
                      'vitrine', 'reserver', 'duo', 'bande') then
    raise exception 'unknown module: %', p_module;
  end if;

  -- BRANCHE OCTROI, et elle est PREMIÈRE : un octroi vivant de CE module,
  -- non borné à une ressource, donne le droit sans rien demander d'autre.
  -- C'est là qu'« acheté seul » devient vrai — et c'est aussi là que la PAUSE
  -- À L'ÉCHÉANCE opère, par simple absence. C'est le seul chemin par lequel
  -- les quatre droits de la Vitrine s'ouvrent pendant la bêta, l'octroi venant
  -- du back-office.
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
    -- conditionne, seule l'OFFRE compte (src/actions/campaigns.ts). C'est
    -- désormais la SEULE ligne à valoir `true`, et la garde de cardinalité de
    -- src/lib/module-access-parity.test.ts épingle ce « une seule ».
    when 'wheel'      then true
    -- Les QUATRE clés de la Vitrine (20261020120000). Elles se lisent
    -- exactement comme les huit add-ons, et non comme la roue : chacune est une
    -- offre distincte, jamais incluse dans l'abonnement.
    when 'vitrine'    then o.addon_vitrine
    when 'reserver'   then o.addon_reserver
    when 'duo'        then o.addon_duo
    when 'bande'      then o.addon_bande
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
  'Seul « wheel » n''a pas d''addon : c''est le produit de base. La Vitrine '
  'porte QUATRE clés depuis 20261020120000 — « vitrine » (la page publique et '
  'les salons), « reserver », « duo », « bande » — chacune avec sa colonne, '
  'parce qu''elles sont des OFFRES DISTINCTES et non des inclusions de '
  'l''abonnement ; pendant la bêta elles ne s''ouvrent que par un octroi de '
  'back-office, lu par la première branche. '
  'Un nom de module inconnu LÈVE, il ne rend pas false. '
  'Pour un geste portant sur UNE ressource nommée : '
  'org_has_module_access_for_resource.';

-- PIÈGE VÉRIFIÉ ET NON SUPPOSÉ (20260907120000:509) : `CREATE OR REPLACE` ne
-- réinitialise pas les privilèges, donc ceux de 20260925120000 tiennent encore.
-- On les réaffirme quand même : le jour où la signature change, le CREATE
-- deviendrait un CREATE réel et un grant par défaut à `public` réapparaîtrait
-- en silence sur une fonction SECURITY DEFINER qui lit l'état commercial de
-- n'importe quelle organisation.
revoke all on function public.org_has_module_access(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_has_module_access(uuid, text, timestamptz)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 5. LES DOUZE PORTES DE RÉSERVER passent de `vitrine` à `reserver`
--
-- ── POURQUOI UN PATCH DU CORPS VIVANT, ET NON DOUZE `create or replace` ──
--
-- Motif du dépôt, déjà employé six fois (20260814120000, 20260818120000,
-- 20260901120000, 20260904120000, et deux fois en 20261010120000:756 et 1167).
-- La raison y est écrite et vaut ici au carré : recopier douze corps depuis
-- leurs fichiers d'origine, c'est recopier l'état où ils étaient à leur
-- écriture. Cinq d'entre eux ont été redéfinis depuis. Un seul oubli et la
-- migration REVIENDRAIT EN ARRIÈRE sur un correctif, en silence, sur des
-- fonctions qui distribuent des places et décrémentent du stock.
--
-- On lit donc la définition VIVANTE, on applique UNE substitution mesurée, et
-- on la ré-exécute. `CREATE OR REPLACE` conserve l'OID, donc les privilèges
-- (`reservation_offer_next` n'est grantée à PERSONNE, pas même service_role) et
-- les commentaires — qui sont patchés dans la foulée, sans quoi douze
-- descriptions continueraient d'annoncer un droit qui n'est plus demandé.
--
-- ── LE COMPTE EST L'ASSERTION ──
--
-- Chaque corps doit porter EXACTEMENT UNE occurrence du motif. Zéro voudrait
-- dire que la fonction a changé et que cette migration décrit du code qui
-- n'existe plus ; deux, qu'une seconde garde est apparue et qu'un choix est dû.
-- Dans les deux cas la migration s'arrête en le nommant.
--
-- `into strict` porte la seconde assertion, muette celle-là : une surcharge
-- apparue depuis rendrait deux lignes, et `strict` lève au lieu d'en patcher
-- une au hasard.
--
-- ── CE QUI RESTE SUR `vitrine`, ET POURQUOI ──
--
-- `create_player_lobby` (§6) et `vitrine_public_state` (§7) sont traités à
-- part : le premier CONSERVE sa garde vitrine et en ajoute une, la seconde en
-- porte deux dont une seule bouge. `vitrine_dashboard_state` ne bouge pas.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_noms constant text[] := array[
    -- activités
    'reserve_slot', 'waitlist_join', 'claim_waitlist_offer',
    'reservation_offer_next', 'redeem_invitation',
    -- files d'accueil
    'queue_join', 'queue_public_state',
    -- offres de stock
    'hold_stock_offer', 'stock_offer_public_state',
    -- attente active
    'wait_session_open', 'wait_session_use_pause',
    'consume_reserver_wait_spin_grant'
  ];
  v_motif   constant text := 'org_has_module_access\(([^,]+), ''vitrine''\)';
  v_neuf    constant text := 'org_has_module_access(\1, ''reserver'')';
  v_nom     text;
  v_oid     oid;
  v_def     text;
  v_com     text;
  v_hits    integer;
  v_faits   integer := 0;
begin
  foreach v_nom in array v_noms loop
    select p.oid, pg_catalog.pg_get_functiondef(p.oid)
      into strict v_oid, v_def
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = v_nom;

    select pg_catalog.count(*)::integer into v_hits
      from pg_catalog.regexp_matches(v_def, v_motif, 'g');

    if v_hits <> 1 then
      raise exception
        '%() porte % occurrence(s) de la garde `vitrine` au lieu d''une seule : la fonction a changé, cette migration décrirait du code qui n''existe plus',
        v_nom, v_hits;
    end if;

    execute pg_catalog.regexp_replace(v_def, v_motif, v_neuf);

    -- LE COMMENTAIRE SUIT LE CODE. Les douze descriptions nomment le droit
    -- entre accents graves — « une organisation sans le droit `vitrine` » — et
    -- c'est ce jeton, et lui seul, qui est remplacé : la prose autour ne dit
    -- rien du module et n'a pas à bouger.
    -- `strpos` et NON `position(… in …)` : la seconde est une construction
    -- SQL spéciale, pas un appel de fonction — la qualifier par son schéma
    -- (obligatoire ici, `search_path` du bloc mis à part) en fait une erreur
    -- de syntaxe. La leçon a coûté une application ratée.
    v_com := pg_catalog.obj_description(v_oid, 'pg_proc');
    if v_com is null or pg_catalog.strpos(v_com, '`vitrine`') = 0 then
      raise exception
        'le commentaire de %() ne nomme pas `vitrine` : il décrirait une garde qu''il ne porte plus',
        v_nom;
    end if;
    execute pg_catalog.format(
      'comment on function public.%I(%s) is %L',
      v_nom,
      pg_catalog.pg_get_function_identity_arguments(v_oid),
      pg_catalog.replace(v_com, '`vitrine`', '`reserver`')
    );

    v_faits := v_faits + 1;
  end loop;

  if v_faits <> 12 then
    raise exception 'douze portes Réserver attendues, % converties', v_faits;
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 6. Les salons : la garde `vitrine` RESTE, une garde de jeu s'y AJOUTE
--
-- ADR-109 §A1 pose que « les salons joueurs SONT la Vitrine », et
-- `create_player_lobby` exige déjà une vitrine PUBLIÉE. Rien de cela n'est
-- retiré : on ajoute un cran, dérivé de `p_kind`, que l'opérateur pourra
-- desserrer seul le jour où il vendra les salons sans la Vitrine.
--
-- ── L'INDISTINGUABILITÉ TIENT PAR LA STRUCTURE, ET C'EST NON NÉGOCIABLE ──
--
-- La nouvelle condition entre dans le MÊME `if`, donc dans le MÊME `return`
-- que les deux autres. « Organisation inconnue », « pas le module vitrine »,
-- « vitrine non publiée » et désormais « pas le module du jeu » rendent le même
-- document parce qu'ils empruntent le même chemin — et non parce que quatre
-- branches se sont mises d'accord. C'est exactement ce que dit le commentaire
-- de 20261017120000:483-487, et l'ajouter en `elsif` l'aurait démenti.
--
-- ── `case p_kind` EST TOTAL ──
--
-- `p_kind` est validé plus haut : `not in ('duo', 'bande')` lève avant
-- d'arriver ici. Le `else 'bande'` n'est donc pas un défaut permissif, c'est la
-- seule autre valeur possible. Un `case` sans `else` aurait rendu null, et
-- `org_has_module_access(…, null)` lève « unknown module » — un refus bruyant
-- là où le contrat promet un refus muet.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def  text;
  v_ancre constant text :=
    '  if not public.org_has_module_access(p_organization_id, ''vitrine'')';
  v_neuf constant text :=
    '  if not public.org_has_module_access(p_organization_id, ''vitrine'')' || E'\n'
    -- Commentaire inséré SANS APOSTROPHE, délibérément : ce texte traverse un
    -- littéral SQL avant d etre execute, et chaque apostrophe y couterait un
    -- doublement de plus (motif 20261010120000:727-730).
    || '     -- UNE CLE PAR PRODUIT (20261020120000). ADDITIF, jamais' || E'\n'
    || '     -- substitutif : la garde `vitrine` ci-dessus reste, et le jeu' || E'\n'
    || '     -- demande EN PLUS sa propre cle. Meme `if`, donc meme `return` :' || E'\n'
    || '     -- l indistinction des quatre refus tient par la STRUCTURE.' || E'\n'
    || '     or not public.org_has_module_access(' || E'\n'
    || '          p_organization_id,' || E'\n'
    -- `p_kind` est deja borne a ('duo','bande') plus haut : le case est total.
    || '          case p_kind when ''duo'' then ''duo'' else ''bande'' end)';
  v_hits integer;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'create_player_lobby';

  v_hits := (pg_catalog.length(v_def)
             - pg_catalog.length(pg_catalog.replace(v_def, v_ancre, '')))
            / pg_catalog.length(v_ancre);
  if v_hits <> 1 then
    raise exception
      'create_player_lobby porte % occurrence(s) de la garde vitrine au lieu d''une seule : la fonction a changé',
      v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_ancre, v_neuf);
end
$migration$;

comment on function public.create_player_lobby(uuid, text, integer, text, text) is
  'Ouvre une salle de jeu joueur (L16). Exige TROIS choses, dans un seul `if` '
  'et donc un seul refus : le droit `vitrine`, une vitrine PUBLIÉE, et — depuis '
  '20261020120000 — le droit du JEU demandé, `duo` ou `bande` selon `p_kind`. '
  'Rend `unavailable` INDISTINCTEMENT pour une organisation inconnue, sans '
  'l''un de ces droits, ou dont la vitrine est éteinte : ce point d''entrée '
  'public n''est pas un oracle sur le carnet de commandes d''en face. Rend '
  '`quota` au vingtième salon habité ou récent. La capacité d''un duo est FIGÉE '
  'à deux, le paramètre est ignoré et non contesté.';


-- ────────────────────────────────────────────────────────────
-- 7. La page publique : chaque porte reflète le droit du produit qu'elle ouvre
--
-- Une porte affichée vers un module fermé est une promesse rompue sur la page
-- qu'un client lit pendant son repas. `vitrine_public_state` continue d'exiger
-- `published` ET `vitrine` pour SERVIR la page — c'est la Vitrine, et elle
-- reste ce que `vitrine` ouvre — mais ses portes se ferment produit par
-- produit :
--
--   * `portes.reserver` (activites, files, offres) exige `reserver` ;
--   * `portes.experiences.duo` exige `duo` EN PLUS de `duo_jouable()` ;
--   * `portes.experiences.quiz` exigeait déjà `quiz` et ne bouge pas.
--
-- LA FORME NE CHANGE PAS. Les quatre listes et le drapeau existent TOUJOURS,
-- vides ou à faux : c'est l'écran qui masque un bloc sans contenu, pas la base
-- (20261018120000:2079-2083). Une clé qui apparaît et disparaît se teste à
-- chaque lecture ; une forme stable se type une fois.
--
-- ── LES TROIS LISTES SONT CALCULÉES PUIS VIDÉES, ET C'EST ASSUMÉ ──
--
-- La garde est posée APRÈS les trois `select`, pas avant. Poser un `if …
-- then … else … end if` autour d'eux aurait demandé deux ancres dans un corps
-- que la migration ne recopie pas — deux fois plus de surface pour se tromper,
-- sur la fonction la plus lue du produit. Le coût réel est de trois lectures
-- indexées, sur les tables de la SEULE organisation concernée, et seulement
-- pour une vitrine dont le propriétaire n'a pas Réserver — cas que le
-- remplissage de §3 rend inexistant à l'application de cette migration, et qui
-- ne réapparaîtra que sur une vente future de la Vitrine seule. La page est
-- servie en ISR 60 s par-dessus.
--
-- ── `duo` : LA PORTE ET LE JEU RESTENT UNE SEULE VÉRITÉ ──
--
-- `duo_jouable` est conservée dans la conjonction, et l'ordre importe : le
-- droit d'abord, le seuil ensuite. La propriété que 20261018120000:1843-1848
-- tenait à garder — la porte est visible SI ET SEULEMENT SI le jeu démarre —
-- devient : visible si et seulement si le jeu démarre ET est vendu. Elle tient
-- toujours, parce que `create_player_lobby` (§6) refuse désormais exactement le
-- même couple. Les deux ne peuvent plus diverger que si l'une des deux gardes
-- est modifiée seule.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def  text;
  v_ancre constant text :=
    '  v_duo := public.duo_jouable(v_settings.organization_id);';
  v_neuf constant text :=
    '  -- UNE CLE PAR PRODUIT (20261020120000). Les portes Reserver refletent' || E'\n'
    || '  -- le droit du produit qu elles ouvrent, et non celui de la vitrine :' || E'\n'
    || '  -- une porte annoncee vers un module ferme est une promesse rompue.' || E'\n'
    || '  -- La FORME ne bouge pas : trois listes VIDES, jamais absentes.' || E'\n'
    || '  if not public.org_has_module_access(' || E'\n'
    || '           v_settings.organization_id, ''reserver'') then' || E'\n'
    || '    v_activites := ''[]''::jsonb;' || E'\n'
    || '    v_files     := ''[]''::jsonb;' || E'\n'
    || '    v_offres    := ''[]''::jsonb;' || E'\n'
    || '  end if;' || E'\n'
    || E'\n'
    || '  -- LA PORTE DU JEU (L17), desormais gardee par sa propre cle. Le droit' || E'\n'
    || '  -- D ABORD, le seuil ensuite : la porte est visible si et seulement si' || E'\n'
    || '  -- le jeu demarre ET est vendu — c est exactement le couple que' || E'\n'
    || '  -- create_player_lobby refuse.' || E'\n'
    || '  v_duo := public.org_has_module_access(v_settings.organization_id, ''duo'')' || E'\n'
    || '           and public.duo_jouable(v_settings.organization_id);';
  v_hits integer;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state';

  v_hits := (pg_catalog.length(v_def)
             - pg_catalog.length(pg_catalog.replace(v_def, v_ancre, '')))
            / pg_catalog.length(v_ancre);
  if v_hits <> 1 then
    raise exception
      'vitrine_public_state porte % occurrence(s) de l''affectation de v_duo au lieu d''une seule : la fonction a changé',
      v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_ancre, v_neuf);
end
$migration$;

comment on function public.vitrine_public_state(text, text) is
  'État PUBLIC d''une vitrine, par son slug et dans une langue (VIT-1a, langue '
  'ajoutée en VIT-1b, PORTES en VIT-3, CONTENUS MIS EN AVANT en VIT-4, PORTE DUO '
  'MIROIR en L17, UNE CLÉ PAR PRODUIT en 20261020120000). Exige `published` ET '
  'org_has_module_access(…, ''vitrine''), relu à CHAQUE consultation. Rend '
  '`unavailable` INDISTINCTEMENT pour un slug mal formé, inconnu, non publié ou '
  'sans droit — ce point d''entrée non authentifié n''est pas un oracle. '
  '`p_lang` null, ''fr'' ou INCONNUE → français : le repli est silencieux. En '
  'anglais, les traductions FRAÎCHES se superposent champ à champ et les '
  'périmées sont ignorées. Rend `lang` — la langue RÉELLEMENT servie — et '
  '`lang_coverage` DANS LES DEUX LANGUES ; le SEUIL reste dans l''application. '
  '`portes` rend l''annuaire des pages publiques du commerce : {reserver: '
  '{activites, files, offres}, experiences: {quiz, duo}} — QUATRE listes '
  'toujours présentes (douze par liste, identifiants en TEXTE) et UN drapeau '
  'toujours présent. CHAQUE PORTE REFLÈTE LE DROIT DU PRODUIT QU''ELLE OUVRE : '
  'les trois listes Réserver sont vides sans `reserver`, `duo` est faux sans '
  '`duo`, `quiz` est vide sans `quiz` — une porte annoncée vers un module fermé '
  'serait une promesse rompue. `duo` est un BOOLÉEN et non une liste : Duo '
  'Miroir est UN jeu par commerce, à une adresse déductible du slug '
  '(/lobby/nouveau/{slug}), là où les quiz sont une collection dont l''écran a '
  'besoin des slugs. Il vaut vrai si et seulement si le droit `duo` ET '
  'duo_jouable() — la MÊME fonction dont duo_start tire son non_configure, et '
  'le MÊME couple que create_player_lobby refuse, pour que la porte soit '
  'visible si et seulement si le jeu démarre. NI LES PORTES, NI LES CONTENUS, '
  'NI LA PORTE DUO NE SONT TRADUISIBLES : ils n''entrent ni au numérateur ni au '
  'dénominateur de `lang_coverage`, sans quoi toute vitrine traduite '
  'retomberait sous le seuil du sélecteur de langue. N''expose aucune donnée de '
  'client, aucun identifiant d''organisation.';


-- ────────────────────────────────────────────────────────────
-- 8. LE PIÈGE `guard_module_publication` — conclusion, et pourquoi rien n'est
--    ajouté
--
-- LE FAIT. Le trigger garde la TRANSITION vers `published = true`, pas l'état
-- (20260905120000, corps relu au catalogue vivant : `if tg_op = 'UPDATE' … if
-- v_old is not distinct from v_new then return new`). Une organisation dont le
-- droit `vitrine` expire garde donc une vitrine `published = true`. Un seul
-- exemplaire existe pour ce lot : `vitrine_settings_guard_publication`, sur le
-- module `vitrine`.
--
-- CE QUE ÇA IMPLIQUE POUR LES TROIS GARDES NEUVES : RIEN, et la raison est
-- structurelle plutôt que chanceuse. Aucune des gardes ajoutées ici ne lit
-- `published` comme preuve d'un droit ; toutes rappellent
-- `org_has_module_access` À CHAQUE APPEL. Un droit expiré ferme donc les portes
-- à la seconde, même sur une vitrine restée allumée — `vitrine_public_state`
-- vide ses listes Réserver, `create_player_lobby` refuse le salon, les douze
-- RPC de Réserver rendent `unavailable`. Le drapeau périmé ne survit qu'à
-- lui-même : il ne porte aucun droit qu'il pourrait prolonger.
--
-- AUCUN TRIGGER DE PUBLICATION N'EST AJOUTÉ POUR `reserver`, `duo` NI `bande`,
-- et c'est une décision, pas un oubli :
--
--   * il n'existe aucune ressource « publiée » de Duo ni de Bande — les salons
--     naissent par une RPC, qui est déjà gardée (§6) ;
--   * les ressources de Réserver (`reservation_activities.active`,
--     `reservation_queues.status`, `reservation_stock_offers.status`) n'en ont
--     jamais porté non plus. Leur en poser un serait une restriction NEUVE sur
--     le geste des commerçants, en dehors de ce lot, et elle mordrait d'abord
--     sur ceux qui viennent d'être remplis en §3.
--
-- L'ASYMÉTRIE NEUVE, ÉCRITE PLUTÔT QUE DÉCOUVERTE PLUS TARD : une organisation
-- peut désormais publier sa Vitrine avec le seul droit `vitrine`, et la page
-- servie n'affichera aucune porte Réserver ni Duo. Avant ce lot, « vitrine
-- publiée » impliquait « Réserver ouvert » ; les deux faits sont maintenant
-- séparés. Le mode de défaillance est « moins de portes », jamais « plus de
-- droits » — c'est exactement le sens de la séparation.
-- ────────────────────────────────────────────────────────────


-- ────────────────────────────────────────────────────────────
-- 9. LE CONTRÔLE FINAL, sur le catalogue vivant
--
-- Les substitutions de §5 à §7 sont textuelles : ce qui prouve qu'elles ont
-- porté, ce n'est pas qu'elles n'ont pas levé, c'est le compte de ce qui reste.
-- Sans ce bloc, un motif qui aurait cessé de correspondre laisserait douze
-- portes sur `vitrine` et la migration se lirait comme un succès.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_reste    integer;
  v_reserver integer;
  v_duo      integer;
  v_bande    integer;
begin
  select pg_catalog.count(*)::integer into v_reste
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~ 'org_has_module_access\([^,]+, ''vitrine''\)';
  -- TROIS, nommément : create_player_lobby (qui la garde ET ajoute la sienne),
  -- vitrine_dashboard_state (le tableau de bord de la Vitrine) et
  -- vitrine_public_state (la page elle-même).
  if v_reste <> 3 then
    raise exception
      '% fonction(s) gardent encore `vitrine` au lieu des trois attendues (create_player_lobby, vitrine_dashboard_state, vitrine_public_state)',
      v_reste;
  end if;

  select pg_catalog.count(*)::integer into v_reserver
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~ 'org_has_module_access\([^,]+, ''reserver''\)';
  -- TREIZE : les douze portes de Réserver, plus vitrine_public_state.
  if v_reserver <> 13 then
    raise exception
      '% fonction(s) gardent `reserver` au lieu des treize attendues', v_reserver;
  end if;

  -- LA PORTE DUO DE LA PAGE PUBLIQUE. Cherchée sur l'appel EXACT et non sur le
  -- jeton `'duo'`, qui apparaît aussi dans la clé du document et dans le nom de
  -- `duo_jouable` — une assertion qui se contente du jeton serait verte sur une
  -- fonction où le droit n'est jamais demandé.
  select pg_catalog.count(*)::integer into v_duo
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state'
     and p.prosrc ~ 'org_has_module_access\(v_settings\.organization_id, ''duo''\)';
  if v_duo <> 1 then
    raise exception
      'la porte Duo de vitrine_public_state ne demande pas le droit `duo` : elle annoncerait un jeu que create_player_lobby refuse d''ouvrir';
  end if;

  -- LA GARDE DE JEU DES SALONS. Le `case` en entier, parce que c'est LUI la
  -- garde : `duo` et `bande` apparaissent tous deux dans la validation de
  -- `p_kind` qui existait déjà, et les y compter ne prouverait rien. Le
  -- `p.prosrc like` porte sur le texte multi-ligne exact que §6 a inséré.
  select pg_catalog.count(*)::integer into v_bande
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'create_player_lobby'
     and p.prosrc like
         '%org_has_module_access(%case p_kind when ''duo'' then ''duo'' else ''bande'' end)%';
  if v_bande <> 1 then
    raise exception
      'create_player_lobby ne dérive aucune garde de `p_kind` : les salons Duo et Portrait de la Bande resteraient ouverts sans leur droit';
  end if;
end
$migration$;
