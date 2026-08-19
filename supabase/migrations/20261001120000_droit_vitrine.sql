-- ============================================================
-- LE DROIT SERVEUR « VITRINE » — un seul octroi, trois capacités
--
-- Lot L2 du train « Réserver & Vitrine ». Il n'ouvre AUCUNE fonctionnalité :
-- il pose le vocabulaire côté base pour que les lots suivants aient un droit à
-- interroger, plutôt que d'en inventer un chacun de leur côté.
--
-- ── CE QUE `vitrine` OUVRE, ET POURQUOI UN SEUL DROIT ──
--
-- Trois capacités décidées par le propriétaire : publier la Vitrine, le CRM
-- léger, l'agenda Réserver. UN seul entitlement les porte toutes les trois.
-- Trois droits séparés auraient demandé trois octrois à accorder, trois
-- colonnes à lire et trois façons de se tromper pour vendre ce qui se vend
-- ensemble ; le jour où l'un devra se détacher, le détacher sera une décision
-- explicite plutôt qu'un état de fait jamais choisi.
--
-- ── UNE COLONNE `addon_vitrine`, PARCE QUE VITRINE EST UNE OFFRE DISTINCTE ──
--
-- Décision propriétaire (2026-08-19, revue sécurité du lot L2, MOYEN-1) :
-- **Vitrine n'est PAS incluse dans l'abonnement.** C'est une offre à part, et
-- la colonne est ce qui rend cette phrase vraie côté base.
--
-- Une première écriture de ce lot n'en posait aucune et faisait valoir
-- `when 'vitrine' then true`, sur le précédent de `wheel`. La conséquence était
-- écrite noir sur blanc et présentée comme assumée : « un commerçant qui a une
-- offre vivante ouvre `vitrine` sans octroi ». C'est-à-dire que TOUS les abonnés
-- existants recevaient, à l'application de la migration, un module que personne
-- n'avait décidé de leur vendre. Un droit qu'on n'a jamais facturé ne se reprend
-- pas sans se dédire ; il valait mieux ne pas l'accorder.
--
-- La colonne est le MIROIR EXACT d'`addon_calendar` (20260728120000:65-73) :
-- `boolean not null default false`, plus le `grant select (…)` qu'exigent les
-- grants de colonnes de `organizations` (00017). `default false` est le point —
-- l'application de cette migration ne change le droit d'AUCUNE organisation
-- existante.
--
-- Trois chemins l'ouvrent désormais, et trois seulement :
--
--   * un OCTROI DATÉ vivant sur `organization_module_grants` — le chemin de la
--     bêta, accordé depuis le back-office et lui seul ;
--   * `addon_vitrine` allumé ET une OFFRE d'abonnement vivante
--     (`org_has_subscription_access`) — le chemin d'une vente future ;
--   * rien d'autre.
--
-- ── CE QUE LA COLONNE NE REJOINT PAS, ET POURQUOI ──
--
-- `protect_stripe_managed_entitlements` (20260818120000) et son trigger
-- `organizations_protect_stripe_entitlements` énumèrent les neuf colonnes que
-- STRIPE gouverne : `addon_vitrine` n'y entre PAS, parce qu'aucun produit Stripe
-- ne la pilote. L'y ajouter aurait rendu le seul chemin de la bêta — le
-- back-office — impossible sur tout commerçant portant un abonnement vivant :
-- le trigger aurait levé `entitlements are managed by Stripe` sur un droit que
-- Stripe ignore. Le trigger ne se déclenche pas sur un `update` qui ne touche
-- que `addon_vitrine` (`before update OF <colonnes>` ne mord que sur la liste).
-- Même raison pour la projection legacy et pour `apply_stripe_subscription_event_v2` :
-- `vitrine` n'est dans aucun `p_entitlements`, donc rien à y écrire.
--
-- ── AUCUN PRODUIT STRIPE, ET C'EST VOULU ──
--
-- Ni price, ni checkout, ni entrée au catalogue d'add-ons. Aucune variable
-- `STRIPE_PRICE_ID_PASS_VITRINE` n'est posée : `resolveAddonCheckout` refuse
-- donc « Cette option n'existe pas », et `termesDepuisCatalogue` refuse de même.
-- Vitrine n'est pas achetable en ligne, par construction et non par oubli de
-- configuration. Pendant la bêta, elle s'accorde au back-office — le formulaire
-- d'octroi la propose déjà, il dérive sa liste de `GRANTABLE_MODULES`.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ──
--
--   * Aucune table de ressource « vitrine », donc aucun trigger
--     `guard_module_publication` : il n'y a rien à publier encore. Les neuf
--     triggers de 20260905120000 restent neuf, et les gardes TypeScript qui les
--     comptent exemptent `vitrine` nommément.
--   * Aucun changement à `org_has_active_access` ni à
--     `org_has_subscription_access` : le socle et l'offre répondent déjà
--     correctement, et leur parité est jouée par access_parity.test.sql.
--
--     UNE RÉSERVE ÉCRITE ICI PLUTÔT QUE TAIRE (revue sécurité, MOYEN-2) :
--     `org_has_active_access` rend vrai sur UN OCTROI VIVANT QUELCONQUE, donc
--     aussi sur un octroi `vitrine` accordé gratuitement en bêta — un droit
--     offert y porterait le socle payant. Le miroir TypeScript
--     (`hasActiveAccess`, src/lib/subscription.ts) a été RESSERRÉ aux modules
--     adossés à une offre du catalogue ; le SQL ne l'a pas été, et l'écart est
--     BORNÉ et volontaire : dans le catalogue vivant, `org_has_active_access`
--     n'a plus AUCUN appelant SQL — `org_has_module_access` passe par
--     `org_has_subscription_access` depuis 20260925120000 — ni aucun appelant
--     applicatif (elle est révoquée à `authenticated` et n'est appelée par
--     aucune `.rpc`). La resserrer ici aurait demandé de recopier en SQL la
--     liste des offres d'`ADDON_OFFERS`, soit une troisième écriture d'un même
--     fait, pour corriger une fonction que rien n'interroge. Le jour où un
--     appelant réapparaît, c'est ici qu'il faut revenir.
--   * Aucun changement à `org_has_live_module_grant`, qui filtre sur le
--     `p_module` qu'on lui passe et n'énumère aucun vocabulaire.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 0. L'addon d'organisation — miroir EXACT d'addon_calendar
--
-- Posé AVANT la redéfinition d'`org_has_module_access` (§2) qui le lit : une
-- fonction plpgsql résout ses colonnes à l'exécution, mais l'ordre inverse
-- laisserait la fonction vivante quelques instructions durant sur une colonne
-- absente, et la moindre reprise partielle de ce fichier casserait sur un
-- message incompréhensible.
-- ────────────────────────────────────────────────────────────

alter table public.organizations
  add column addon_vitrine boolean not null default false;

-- `organizations` utilise des grants de colonnes (00017) : une colonne ajoutée
-- ensuite n'est pas lisible automatiquement par authenticated. SANS CETTE
-- LIGNE, ce n'est pas le seul droit vitrine qui tombe : le `select` de
-- `getUserAndOrg` (src/lib/auth.ts) énumère ses colonnes et serait refusé EN
-- ENTIER, donc tout le dashboard.
grant select (addon_vitrine) on public.organizations to authenticated;

comment on column public.organizations.addon_vitrine is
  'Vitrine & Réserver activé au titre d''une OFFRE d''abonnement. Offre '
  'DISTINCTE, jamais incluse dans l''abonnement de base (décision propriétaire '
  'du 2026-08-19) : `default false` laisse donc tous les abonnés existants '
  'inchangés à l''application de 20261001120000. Aucun produit Stripe ne la '
  'pilote — elle est hors de `protect_stripe_managed_entitlements` et hors de '
  'la projection d''entitlements — et le seul chemin de la bêta reste l''octroi '
  'daté accordé au back-office, lu par la première branche '
  'd''org_has_module_access.';


-- ────────────────────────────────────────────────────────────
-- 1. Le vocabulaire de la table
--
-- ÉLARGISSEMENT PUR : toute valeur admise avant l'est encore, aucune ligne
-- existante ne peut être refusée par la nouvelle contrainte. Le `drop`/`add`
-- ne fait donc courir aucun risque aux octrois en cours — même geste que
-- l'élargissement des paliers de jauge en 20260925120000.
--
-- La contrainte est RENOMMÉE explicitement à son nom conventionnel plutôt que
-- laissée anonyme : `module_grants.test.sql` compte les valeurs portées par
-- LA contrainte de la colonne `module`, et deux contraintes coexistantes lui
-- en feraient compter dix-neuf. Le compte est l'assertion qui s'en aperçoit.
-- ────────────────────────────────────────────────────────────

alter table public.organization_module_grants
  drop constraint if exists organization_module_grants_module_check;

alter table public.organization_module_grants
  add constraint organization_module_grants_module_check
    check (
      module in (
        'wheel', 'hunts', 'calendar', 'loyalty', 'quiz',
        'jackpot', 'events', 'referral', 'pronostics', 'vitrine'
      )
    );

comment on column public.organization_module_grants.module is
  'Module couvert par l''octroi. Même vocabulaire que le `if not in` de '
  'org_has_module_access, volontairement répété (un `check` ne peut pas '
  'appeler une fonction stable) et gardé par une assertion pgTAP qui compare '
  'les deux listes dans le catalogue VIVANT. « vitrine » depuis 20261001120000 : '
  'un seul droit pour trois capacités — publier la Vitrine, le CRM léger, '
  'l''agenda Réserver.';


-- ────────────────────────────────────────────────────────────
-- 2. Le droit de module apprend « vitrine »
--
-- Corps repris de 20260925120000:299-356 — la définition VIVANTE, et non celle
-- de 20260907120000 que SD-4 a remplacée. Deux lignes changent, et elles
-- seules : `vitrine` entre au `not in`, et sa branche du `case` est posée.
-- Tout le reste est identique au caractère près, y compris l'ordre des deux
-- branches (octroi d'abord, offre ensuite) dont dépendent « acheté seul » et
-- la pause à l'échéance.
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
                      'vitrine') then
    raise exception 'unknown module: %', p_module;
  end if;

  -- BRANCHE OCTROI, et elle est PREMIÈRE : un octroi vivant de CE module,
  -- non borné à une ressource, donne le droit sans rien demander d'autre.
  -- C'est là qu'« acheté seul » devient vrai — et c'est aussi là que la PAUSE
  -- À L'ÉCHÉANCE opère, par simple absence. C'est le seul chemin par lequel
  -- « vitrine » s'ouvre pendant la bêta, l'octroi venant du back-office.
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
    -- Vitrine est une OFFRE DISTINCTE, jamais incluse dans l'abonnement : sa
    -- ligne se lit exactement comme les huit add-ons, et non comme la roue.
    when 'vitrine'    then o.addon_vitrine
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
  'Seul « wheel » n''a pas d''addon : c''est le produit de base. « vitrine » '
  '(20261001120000) a le sien, `addon_vitrine`, parce qu''elle est une OFFRE '
  'DISTINCTE et non une inclusion de l''abonnement — pendant la bêta elle ne '
  's''ouvre que par un octroi de back-office, lu par la première branche. '
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
