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
-- ── PAS DE COLONNE `addon_vitrine`, ET CE N'EST PAS UN OUBLI ──
--
-- Les huit modules d'add-on portent un booléen `organizations.addon_*`, posé
-- par le webhook d'abonnement. `vitrine` n'en a pas, et suit le précédent EXACT
-- de `wheel` : sa ligne du `case p_module` vaut `true`, c'est-à-dire « aucun
-- booléen ne la conditionne ». Deux chemins l'ouvrent, et deux seulement :
--
--   * un OCTROI DATÉ vivant sur `organization_module_grants` — le chemin de la
--     bêta, accordé depuis le back-office et lui seul ;
--   * une OFFRE d'abonnement vivante (`org_has_subscription_access`) — le
--     chemin d'un abonnement futur, si le catalogue décide d'y inclure Vitrine.
--
-- Conséquence à lire avant de s'en étonner, elle est ASSUMÉE et non subie : un
-- commerçant qui a une offre vivante ouvre `vitrine` sans octroi, exactement
-- comme il ouvre `wheel`. C'est ce que « colonne addon null » veut dire, et
-- c'est la seule forme que `src/lib/module-access-parity.test.ts` sait mettre
-- en regard de `MODULE_ADDON_COLUMN.vitrine = null`.
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
--   * Aucun changement à `org_has_live_module_grant`, qui filtre sur le
--     `p_module` qu'on lui passe et n'énumère aucun vocabulaire.
-- ============================================================


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
  -- La remarque vaut désormais aussi pour `vitrine`, dont la ligne vaut `true`
  -- pour la même raison : sans ce resserrement, un pass Quiz l'ouvrirait.
  if not public.org_has_subscription_access(p_organization_id, p_now) then
    return false;
  end if;

  select case p_module
    -- La roue / les campagnes sont le produit de base : aucun addon ne les
    -- conditionne, seule l'OFFRE compte (src/actions/campaigns.ts).
    when 'wheel'      then true
    -- Vitrine n'a AUCUNE colonne `addon_vitrine` : elle n'est pas vendue comme
    -- ligne d'abonnement, et pendant la bêta elle ne s'ouvre que par l'octroi
    -- traité plus haut. `true` ici dit « aucun booléen ne la conditionne »,
    -- exactement comme pour la roue — et non « ouverte à tous » : la branche
    -- offre juste au-dessus a déjà refusé qui n'a pas d'abonnement vivant.
    when 'vitrine'    then true
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
  'Les modules « wheel » et « vitrine » n''ont pas d''addon : le premier est le '
  'produit de base, la seconde (20261001120000) n''est pas vendue comme ligne '
  'd''abonnement et ne s''ouvre pendant la bêta que par un octroi de back-office. '
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
