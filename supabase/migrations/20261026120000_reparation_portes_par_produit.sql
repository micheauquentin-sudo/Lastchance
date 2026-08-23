-- ════════════════════════════════════════════════════════════
-- RÉPARATION — LES PORTES REDEVIENNENT CLOISONNÉES PAR PRODUIT
--
-- ── LE DÉFAUT, ET IL ÉTAIT EN PRODUCTION ──────────────────
--
-- `20261023120000_vitrine_images.sql` (VIT-7) a fait un
-- `create or replace function public.vitrine_public_state`, en recopiant le
-- corps de sa « dernière définition » — celle de `20261018120000`. C'était
-- faux, et d'une façon qu'aucun `grep` de `create ... function` ne montre :
--
--   `20261020120000_cle_par_produit.sql` n'a PAS redéfini cette fonction. Il
--   l'a PATCHÉE EN PLACE — `pg_get_functiondef`, `replace`, `execute` — pour
--   y insérer le cloisonnement par produit. Le fichier de migration ne
--   contient donc aucune définition de `vitrine_public_state`, et la
--   recherche textuelle qui a servi à VIT-7 s'est arrêtée deux migrations
--   trop tôt.
--
-- CE QUE ÇA A COÛTÉ, concrètement, sur chaque Vitrine publiée :
--
--   * les trois listes de Réserver — activités, files, offres de stock — sont
--     redevenues visibles SANS le droit `reserver` ;
--   * la porte du Duo Miroir est redevenue visible sans le droit `duo`.
--
-- C'est-à-dire exactement ce que 20261020120000 appelle « une promesse
-- rompue » : une porte annoncée vers un module que `create_player_lobby` et
-- les douze portes de Réserver refusent d'ouvrir. Aucune fuite de données,
-- aucun accès obtenu — un client qui pousse la porte est refusé — mais une
-- offre affichée que le commerçant n'a pas achetée.
--
-- Détecté par `droits_par_produit.test.sql`, test 25 (« PUBLIQUE-2 … et sa
-- porte d'activités est VIDE »), rouge sur `main` depuis la fusion de VIT-7.
--
--
-- ── CE QUE CETTE MIGRATION FAIT ───────────────────────────
--
-- Elle REJOUE mot pour mot le patch de 20261020120000 §6, avec une seule
-- différence : elle est IDEMPOTENTE. Une base où le patch tient encore — celle
-- où 20261023120000 n'a jamais tourné — la traverse sans bruit, parce qu'une
-- migration de réparation doit pouvoir s'appliquer partout, y compris là où il
-- n'y a rien à réparer.
--
-- Le corps de `v_neuf` est RECOPIÉ À L'IDENTIQUE de sa source. Le réécrire
-- « en mieux » aurait fait diverger deux textes que Postgres compare octet par
-- octet à la prochaine réparation.
--
--
-- ── CE QU'ELLE NE RÉPARE PAS, PARCE QUE RIEN N'EST CASSÉ ──
--
-- `vitrine_dashboard_state` a bien été réécrit par VIT-7 depuis 20261011120000,
-- mais aucun patch en place ne l'avait touché : le seul droit qu'il interroge
-- est `vitrine`, et 20261020120000 l'a délibérément laissé tel quel (§7 le
-- compte parmi les trois fonctions qui gardent encore `vitrine`).
-- `vitrine_cartes_json` n'a jamais été patché non plus.
--
--
-- ── LA LEÇON, ÉCRITE ICI POUR LA PROCHAINE FOIS ───────────
--
-- « La dernière définition d'une fonction » ne se cherche pas avec
-- `create ... function`. Ce dépôt patche en place quand la signature ne change
-- pas — c'est le motif de 20261020120000, et il en existera d'autres. La seule
-- source qui ne ment pas est `pg_get_functiondef` sur une base à jour. Avant
-- tout `create or replace` d'une fonction existante : la lire dans la BASE,
-- pas dans un fichier.
-- ════════════════════════════════════════════════════════════

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

  -- RIEN À RÉPARER : la garde est déjà là, l'ancre a donc disparu. On sort
  -- sans bruit plutôt que de lever — voir l'en-tête.
  if v_hits = 0 and pg_catalog.strpos(
       v_def, 'org_has_module_access(v_settings.organization_id, ''duo'')') > 0 then
    return;
  end if;

  if v_hits <> 1 then
    raise exception
      'vitrine_public_state porte % occurrence(s) de l''affectation de v_duo au lieu d''une seule, et la garde `duo` est absente : la fonction a changé, cette réparation décrirait du code qui n''existe plus',
      v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_ancre, v_neuf);
end
$migration$;

-- ── LA VÉRIFICATION, REPRISE DE 20261020120000 §7 ───────────
--
-- Elle porte sur le CATALOGUE VIVANT et non sur ce fichier : c'est la seule
-- forme d'assertion qu'une réparation puisse offrir, puisque le défaut qu'elle
-- répare venait précisément d'avoir cru un fichier.

do $migration$
declare
  v_reserver integer;
  v_duo integer;
begin
  select pg_catalog.count(*)::integer into v_reserver
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state'
     and p.prosrc ~ 'org_has_module_access\(\s*v_settings\.organization_id, ''reserver''\)';
  if v_reserver <> 1 then
    raise exception
      'vitrine_public_state ne vide plus ses trois listes Réserver sans le droit `reserver` : la réparation n''a pas pris';
  end if;

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
end
$migration$;
