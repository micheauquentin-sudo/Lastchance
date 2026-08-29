-- ============================================================
-- « RÉSERVATION » PREND SA PROPRE CLÉ (RDV-5)
--
-- ── LA DÉCISION, ET SA RAISON ──
--
-- Décision propriétaire du 2026-08-29 : le module historique devient
-- « Moments » (ateliers, dégustations, files d'accueil, invitations, offres de
-- dernière minute) et la PRISE DE RENDEZ-VOUS devient un produit à part,
-- « Réservation ». Deux add-ons, 20 € chacun.
--
-- ── POURQUOI `reserver` NE CHANGE PAS DE SENS ──
--
-- La clé `reserver` garde EXACTEMENT ce qu'elle gardait hier : activités,
-- créneaux, files, invitations, offres — c'est-à-dire les Moments. Seul son
-- LIBELLÉ change, côté applicatif.
--
-- L'alternative — faire suivre la clé au nom, donc `reserver` → Réservation —
-- aurait exigé une migration de rattrapage octroyant la clé neuve à tous ceux
-- qui possèdent déjà `reserver`, sous peine de leur retirer du jour au
-- lendemain l'accès à ce qu'ils utilisent. Une migration de données pour ne
-- rien gagner, et un octroi déjà posé qui se serait mis à ouvrir autre chose
-- que ce qu'on avait vendu.
--
-- C'est le même arbitrage que `contests.event_kind = 'football'` devenu
-- « Sport » : le nom bouge, la valeur écrite en base ne bouge pas.
--
-- ── CONSÉQUENCE : AUCUN RATTRAPAGE ICI ──
--
-- Personne ne perd de droit, et personne n'en gagne. `rendez_vous` naît à
-- `false` pour tout le monde. Ceux qui veulent la prise de rendez-vous
-- reçoivent un octroi, exactement comme les quatre clés de la Vitrine pendant
-- la bêta — le back-office est le seul chemin ouvert aujourd'hui, et il n'a
-- rien à apprendre : `org_has_live_module_grant` est générique.
--
-- ── CE QUE CE FICHIER NE FAIT PAS ──
--
--   * AUCUN produit ni prix Stripe. Une mutation financière exige une demande
--     explicite du propriétaire (AGENTS.md). La colonne et le droit existent,
--     l'octroi fonctionne, la vente en ligne attend ce geste-là.
--   * AUCUNE modification des tables de Réserver. Les activités, créneaux et
--     réservations sont les MÊMES pour les deux produits : ce qui les sépare
--     est `reservation_activities.booking_mode` (20261106120000), pas une
--     seconde base.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. La colonne d'add-on
--
-- Même forme que les treize autres (20261020120000:74) : booléenne, non nulle,
-- fausse par défaut, et LISIBLE par le commerçant — il doit pouvoir voir ce
-- qu'il a. L'écriture reste au back-office et au webhook.
-- ────────────────────────────────────────────────────────────

alter table public.organizations
  add column if not exists addon_rendez_vous boolean not null default false;

grant select (addon_rendez_vous) on public.organizations to authenticated;

comment on column public.organizations.addon_rendez_vous is
  'Add-on « Réservation » (prise de rendez-vous : horaires récurrents, '
  'créneaux engendrés, agenda). Distinct d''`addon_reserver`, qui garde les '
  'MOMENTS — ateliers, files, invitations, offres. Les deux produits partagent '
  'les mêmes tables ; c''est reservation_activities.booking_mode qui les '
  'sépare, jamais un schéma en double.';


-- ────────────────────────────────────────────────────────────
-- 2. `org_has_module_access` apprend la quatorzième clé
--
-- ── POURQUOI ON RÉÉCRIT LA FONCTION ENTIÈRE ──
--
-- Une fonction ne se modifie pas par morceaux : `create or replace` la
-- remplace en bloc. Le corps ci-dessous est donc repris de sa DERNIÈRE
-- définition — 20261020120000 — et non d'une version antérieure. Une garde
-- ci-dessous vérifie cette filiation AVANT de remplacer quoi que ce soit : le
-- 2026-08-23, un `create or replace` de VIT-7 a annulé en production un patch
-- de 20261020120000 sans que rien ne le signale, et il a fallu une migration
-- de réparation. On ne recommence pas.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_src text;
begin
  select p.prosrc into strict v_src
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'org_has_module_access';

  -- DÉJÀ POSÉE : rien à faire. Motif de 20261026120000.
  if pg_catalog.strpos(v_src, 'rendez_vous') > 0 then
    return;
  end if;

  -- La définition vivante DOIT être celle qui porte les quatre clés détachées
  -- par 20261020120000. Si elle ne les porte pas, une migration postérieure
  -- l'a réécrite autrement et le corps ci-dessous en supprimerait le travail.
  if pg_catalog.strpos(v_src, 'addon_reserver') = 0
     or pg_catalog.strpos(v_src, 'addon_vitrine') = 0
     or pg_catalog.strpos(v_src, 'addon_duo') = 0
     or pg_catalog.strpos(v_src, 'addon_bande') = 0
  then
    raise exception
      'org_has_module_access ne porte pas les quatre cles de 20261020120000 : la definition vivante n est pas celle attendue, et ce fichier en supprimerait le travail';
  end if;

  -- La branche OCTROI doit être présente et PREMIÈRE : c'est elle qui ouvre
  -- les droits pendant la bêta, et c'est par elle que `rendez_vous` sera
  -- accordé tant qu'aucun produit Stripe n'existe.
  if pg_catalog.strpos(v_src, 'org_has_live_module_grant') = 0 then
    raise exception
      'org_has_module_access ne consulte plus les octrois : le corps ci-dessous les retablirait a tort';
  end if;
end
$migration$;

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
                      'vitrine', 'reserver', 'rendez_vous', 'duo', 'bande') then
    raise exception 'unknown module: %', p_module;
  end if;

  -- BRANCHE OCTROI, et elle est PREMIÈRE : un octroi vivant de CE module,
  -- non borné à une ressource, donne le droit sans rien demander d'autre.
  -- C'est là qu'« acheté seul » devient vrai — et c'est aussi là que la PAUSE
  -- À L'ÉCHÉANCE opère, par simple absence. C'est le seul chemin par lequel
  -- les cinq droits Vitrine / Réserver / Réservation s'ouvrent pendant la
  -- bêta, l'octroi venant du back-office.
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
    when 'wheel'       then true
    -- Les CINQ clés détachées. Elles se lisent exactement comme les huit
    -- add-ons, et non comme la roue : chacune est une offre distincte, jamais
    -- incluse dans l'abonnement.
    when 'vitrine'     then o.addon_vitrine
    -- `reserver` GARDE SON SENS : les Moments — ateliers, dégustations, files
    -- d'accueil, invitations, offres de dernière minute. Seul son libellé
    -- applicatif a changé le 2026-08-29.
    when 'reserver'    then o.addon_reserver
    -- La prise de rendez-vous : horaires récurrents, créneaux engendrés,
    -- agenda. Produit distinct depuis RDV-5.
    when 'rendez_vous' then o.addon_rendez_vous
    when 'duo'         then o.addon_duo
    when 'bande'       then o.addon_bande
    when 'hunts'       then o.addon_hunts
    when 'calendar'    then o.addon_calendar
    when 'loyalty'     then o.addon_loyalty
    when 'quiz'        then o.addon_quiz
    when 'jackpot'     then o.addon_jackpot
    when 'events'      then o.addon_events
    when 'referral'    then o.addon_referral
    when 'pronostics'  then o.addon_pronostics
  end
  into v_addon
  from public.organizations o
  where o.id = p_organization_id;

  return coalesce(v_addon, false);
end;
$$;

comment on function public.org_has_module_access(uuid, text, timestamptz) is
  'Le module est-il ouvert à cette organisation ? Octroi vivant d''abord, puis '
  'abonnement actif ET colonne d''add-on. QUATORZE clés depuis RDV-5 : '
  '`reserver` garde les MOMENTS, `rendez_vous` porte la prise de rendez-vous.';
