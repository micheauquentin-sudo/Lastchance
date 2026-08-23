-- ════════════════════════════════════════════════════════════
-- LA VITRINE PEUT ENTRER DANS GOOGLE — SUR DEMANDE (VIT-12)
--
-- La page publique porte `robots: { index: false }` depuis sa naissance, et
-- son commentaire disait pourquoi : « l'indexation est une décision de
-- COMMERCE et non d'ingénierie — elle se prendra pour de bon, avec un plan de
-- site et des adresses canoniques, et pas en marge d'une ouverture
-- technique ». C'est ce lot, et la décision reste au commerçant.
--
--
-- ── OPT-IN, ET LE DÉFAUT EST `false` ──────────────────────
--
-- Une carte de restaurant porte des prix, des horaires et parfois le nom de
-- l'équipe. La publier dans un moteur de recherche est un choix, pas une
-- conséquence d'avoir publié une adresse que le QR code sur la table suffit à
-- joindre. Toute vitrine existante reste donc hors index tant que personne n'a
-- coché la case — `default false`, et aucun remplissage rétroactif.
--
--
-- ── UNE SEULE COLONNE, ET SURTOUT PAS UNE « COMPLÉTUDE » EN BASE ──
--
-- Le cahier veut que l'indexation ne soit possible que pour une vitrine
-- « publiée, complète et explicitement autorisée ». La base tient les deux
-- bouts qu'elle sait tenir — `published` et `indexable` — et laisse la
-- COMPLÉTUDE à l'application, qui la calcule depuis le catalogue.
--
-- Pourquoi : « complète » est un jugement de produit qui bougera (une accroche
-- suffit-elle ? faut-il une photo ?), et le figer dans un `check` aurait rendu
-- une vitrine INENREGISTRABLE le jour où le critère change. Une colonne
-- calculée par trigger aurait fait pire — elle décocherait la case du
-- commerçant dans son dos, en silence, parce qu'il a supprimé un plat.
--
-- L'INVARIANT EST DONC : `indexable` dit « je veux », `published` dit « c'est
-- ouvert », et la page décide `index` = les deux ET complète. Décocher `index`
-- est immédiat côté application ; l'oubli des moteurs, lui, ne se commande
-- pas, et l'écran ne le promet pas.
--
--
-- ── LA LECTURE EST PATCHÉE EN PLACE, PAS REDÉFINIE ────────
--
-- `vitrine_public_state` porte des patchs successifs appliqués par
-- `pg_get_functiondef` + `replace` (20261020120000), invisibles à toute
-- recherche de `create ... function`. Un `create or replace` recopié depuis un
-- fichier les efface — c'est exactement ce que 20261023120000 a fait, et ce
-- que 20261026120000 a dû réparer en production.
--
-- Cette migration ne recopie donc RIEN : elle insère une clé après une ancre,
-- dans le corps VIVANT. C'est la seule façon d'ajouter un champ à cette
-- fonction sans risquer d'en perdre un autre.
-- ════════════════════════════════════════════════════════════

alter table public.vitrine_settings
  add column if not exists indexable boolean not null default false;

comment on column public.vitrine_settings.indexable is
  'Le commerçant AUTORISE-T-IL les moteurs de recherche à indexer sa Vitrine '
  '(VIT-12) ? `false` par défaut, sans remplissage rétroactif : une adresse '
  'publiée pour un QR sur une table n''est pas une adresse publiée pour '
  'Google. Ne suffit PAS à indexer — l''application exige en plus `published` '
  'et une vitrine complète, jugement de produit qui n''a pas sa place dans un '
  '`check`.';

grant update (indexable) on public.vitrine_settings to authenticated;

-- ── LA CLÉ ENTRE DANS LES DEUX LECTURES, PAR PATCH ──────────

do $migration$
declare
  v_def text;
  v_ancre constant text := '      ''cover_alt'', v_settings.cover_alt,';
  v_neuf  constant text :=
       '      ''cover_alt'', v_settings.cover_alt,' || E'\n'
    || '      -- VIT-12 : le VOULOIR du commercant. La page y ajoute'
    || ' `published`' || E'\n'
    || '      -- et sa propre mesure de completude avant de retirer le'
    || ' `noindex`.' || E'\n'
    || '      ''indexable'', v_settings.indexable,';
  v_hits integer;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state';

  -- DÉJÀ POSÉE : on sort sans bruit. Motif de 20261026120000 — une migration
  -- doit pouvoir se rejouer sur une base déjà à jour.
  if pg_catalog.strpos(v_def, '''indexable'', v_settings.indexable') > 0 then
    return;
  end if;

  v_hits := (pg_catalog.length(v_def)
             - pg_catalog.length(pg_catalog.replace(v_def, v_ancre, '')))
            / pg_catalog.length(v_ancre);
  if v_hits <> 1 then
    raise exception
      'vitrine_public_state porte % occurrence(s) de la cle cover_alt au lieu d''une seule : la fonction a change',
      v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_ancre, v_neuf);
end
$migration$;

do $migration$
declare
  v_def text;
  v_ancre constant text := '        ''cover_alt'', v_settings.cover_alt,';
  v_neuf  constant text :=
       '        ''cover_alt'', v_settings.cover_alt,' || E'\n'
    || '        ''indexable'', v_settings.indexable,';
  v_hits integer;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_dashboard_state';

  if pg_catalog.strpos(v_def, '''indexable'', v_settings.indexable') > 0 then
    return;
  end if;

  v_hits := (pg_catalog.length(v_def)
             - pg_catalog.length(pg_catalog.replace(v_def, v_ancre, '')))
            / pg_catalog.length(v_ancre);
  if v_hits <> 1 then
    raise exception
      'vitrine_dashboard_state porte % occurrence(s) de la cle cover_alt au lieu d''une seule : la fonction a change',
      v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_ancre, v_neuf);
end
$migration$;

-- ────────────────────────────────────────────────────────────
-- `vitrines_indexables` — ce que le plan de site publie
--
-- UNE FONCTION ET NON UNE VUE : la liste est lue par `src/app/sitemap.ts`, au
-- `service_role`, et une vue aurait demandé une policy — donc un droit de
-- lecture sur `vitrine_settings` à donner à quelqu'un. La fonction ne rend que
-- ce qui est déjà public : un slug et une date.
--
-- LA COMPLÉTUDE N'EST PAS JUGÉE ICI. Le plan de site liste ce que le
-- commerçant a autorisé ET qui est ouvert ; c'est la PAGE qui refuse le
-- `index` d'une vitrine vide, et un plan de site qui cite une page `noindex`
-- n'est pas une faute — Google lit la page avant de la croire.
-- ────────────────────────────────────────────────────────────

create or replace function public.vitrines_indexables()
returns table (slug text, mise_a_jour timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  -- `vitrine_settings.updated_at` SEUL : c'est la date qu'un plan de site doit
  -- porter — celle du contenu servi. `organizations` n'en a pas, et la date
  -- d'une carte modifiée vit dans `vitrine_menus`/`_items`, dont la remonter
  -- ferait une agrégation par vitrine sur chaque génération du fichier.
  select s.slug, s.updated_at
    from public.vitrine_settings s
   where s.published
     and s.indexable
     and public.org_has_module_access(s.organization_id, 'vitrine')
   order by s.slug
   limit 5000;
$$;

comment on function public.vitrines_indexables() is
  'Les Vitrines que leur commerçant autorise à l''indexation (VIT-12) : '
  'publiées, `indexable`, et dont le droit `vitrine` est ouvert. Ne juge PAS '
  'la complétude — c''est la page qui retire ou non son `noindex`. Plafond de '
  '5000, pour qu''un plan de site reste un fichier.';

revoke all on function public.vitrines_indexables() from public;
revoke all on function public.vitrines_indexables() from anon;
revoke all on function public.vitrines_indexables() from authenticated;
grant execute on function public.vitrines_indexables() to service_role;
