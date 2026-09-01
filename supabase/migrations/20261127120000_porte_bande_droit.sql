-- ════════════════════════════════════════════════════════════
-- LA PORTE « PORTRAIT DE LA BANDE » SUIT SON DROIT (DUO-3a)
--
-- `vitrine_public_state` décrit les portes de la page publique, et depuis
-- 20261020120000 chacune reflète le droit du produit qu'elle ouvre : les trois
-- listes Réserver exigent `reserver`, `experiences.duo` exige `duo`,
-- `experiences.quiz` exige `quiz`, les calendriers `calendar`, les pronostics
-- leur ressource. UNE seule animation manquait à l'appel : le Portrait de la
-- Bande n'était PAS DÉCRIT DU TOUT — aucune clé, donc aucune garde, donc une
-- porte que l'écran peignait toujours (`src/components/vitrine/portes.tsx`,
-- L18 : « `portes.experiences` n'a PAS reçu de clé `bande` »).
--
-- ── POURQUOI CE TROU NE SE VOYAIT PAS, ET POURQUOI IL SE VOIT MAINTENANT ──
--
-- Jusqu'à 20261124120000, `duo` et `bande` étaient inclus dans les cinq offres :
-- tout détenteur de la Vitrine les avait, et une porte non gardée n'était qu'une
-- porte que personne ne pouvait trouver fermée. Depuis DUO-2, ce sont deux
-- OPTIONS VENDABLES SÉPARÉMENT. Un commerçant qui n'a pas acheté la Bande voit
-- donc sa page publique annoncer « Portrait de la Bande » — et son client, en
-- cliquant, reçoit le refus de `create_player_lobby`, qui, lui, vérifie bien le
-- droit (20261022120000 : `case p_kind when 'duo' then 'duo' else 'bande' end`).
-- Une promesse rompue chez le client, sur la page qu'il lit pendant son repas.
--
-- ── LE DROIT SEUL, ET SANS SEUIL — CE N'EST PAS UN OUBLI ──
--
-- `duo` vaut `org_has_module_access(…, 'duo') AND duo_jouable(…)` : son plateau
-- peut être vide, et annoncer un jeu qui ne démarrera pas est la même promesse
-- rompue. Le Portrait de la Bande n'a AUCUN état « pas prêt » à refléter — le
-- pack a un défaut, les questions vivent dans le code — et aucune fonction
-- `bande_jouable` n'existe. `v_bande` est donc EXACTEMENT le couple que
-- `create_player_lobby` refuse pour `p_kind = 'bande'` : le droit, et rien
-- d'autre. Les deux ne peuvent diverger que si l'une des deux gardes bouge
-- seule, et `droits_par_produit.test.sql` éprouve les deux bouts.
--
-- ── ÉLARGISSEMENT PUR : LA CLÉ EXISTE TOUJOURS, MÊME À FAUX ──
--
-- Motif des six listes de VIT-3, et de `duo` en L17 : la FORME du document ne
-- dépend pas de son contenu. `bande` est présente à `false` plutôt qu'absente,
-- sans quoi l'écran porterait deux chemins pour un seul état — et une clé qu'on
-- oublie de tester est une clé qu'on affiche. Rien d'autre ne bouge dans le
-- document : ni les quatre autres clés d'`experiences`, ni les trois de
-- `reserver`, ni le reste de l'état.
--
-- ── TROIS ANCRES, PARCE QUE LA FONCTION N'EST PAS RECOPIÉE ──
--
-- `vitrine_public_state` porte des patchs successifs appliqués par
-- `pg_get_functiondef` depuis 20261023120000 (sa dernière définition entière) :
-- la recopier ici écraserait en silence les gardes produit, l'indexation, le
-- badge d'ouverture et les portes Calendrier/Pronostics posées depuis. On patche
-- donc le CATALOGUE VIVANT, et chaque ancre est comptée avant d'être remplacée.
--
-- LES ANCRES SONT DES MARQUEURS À PRÉSERVER, JAMAIS L'ABSENCE DE CE QU'ON
-- AJOUTE. Vérifier que `bande` n'est pas déjà là ferait échouer ce fichier sur
-- toute base reconstruite après lui — un `db reset` rejoue les migrations dans
-- l'ordre, et la garde d'un fichier ancien doit rester vraie dans un monde où
-- les fichiers suivants existent.
-- ════════════════════════════════════════════════════════════

do $migration$
declare
  v_def text;

  -- 1. LA DÉCLARATION. Marqueur préservé : le booléen `duo` de L17.
  v_ancre_decl constant text :=
    '  v_duo        boolean;';
  v_neuf_decl constant text :=
    '  v_duo        boolean;' || E'\n'
    || '  -- LA PORTE DE L AUTRE JEU (DUO-3a). Un booleen, comme duo : un seul' || E'\n'
    || '  -- Portrait de la Bande par commerce, a une adresse deduite du slug.' || E'\n'
    || '  v_bande      boolean;';

  -- 2. LE CALCUL. Marqueur préservé : la conjonction droit + seuil de
  --    20261020120000, que ce fichier ne doit surtout pas déranger.
  v_ancre_calc constant text :=
    '  v_duo := public.org_has_module_access(v_settings.organization_id, ''duo'')' || E'\n'
    || '           and public.duo_jouable(v_settings.organization_id);';
  v_neuf_calc constant text :=
    '  v_duo := public.org_has_module_access(v_settings.organization_id, ''duo'')' || E'\n'
    || '           and public.duo_jouable(v_settings.organization_id);' || E'\n'
    || E'\n'
    || '  -- LA PORTE DU PORTRAIT DE LA BANDE (DUO-3a), gardee par sa propre cle.' || E'\n'
    || '  -- LE DROIT SEUL, et sans seuil : le pack a un defaut et les questions' || E'\n'
    || '  -- vivent dans le code, il n existe aucun etat « pas pret » a refleter.' || E'\n'
    || '  -- C est EXACTEMENT le couple que create_player_lobby refuse pour' || E'\n'
    || '  -- p_kind = ''bande'' (20261022120000) : les deux gardes ne peuvent plus' || E'\n'
    || '  -- diverger que si l une des deux est modifiee seule.' || E'\n'
    || '  v_bande := public.org_has_module_access(' || E'\n'
    || '               v_settings.organization_id, ''bande'');';

  -- 3. LE DOCUMENT. Marqueur préservé : l'ouverture du bloc `experiences` avec
  --    ses deux premières clés. `calendars` et `pronostics` suivent et ne sont
  --    pas touchées — l'ancre s'arrête avant elles.
  v_ancre_doc constant text :=
    '      ''experiences'', pg_catalog.jsonb_build_object(' || E'\n'
    || '        ''quiz'', v_quiz,' || E'\n'
    || '        ''duo'', v_duo,';
  v_neuf_doc constant text :=
    '      ''experiences'', pg_catalog.jsonb_build_object(' || E'\n'
    || '        ''quiz'', v_quiz,' || E'\n'
    || '        ''duo'', v_duo,' || E'\n'
    || '        ''bande'', v_bande,';

  v_hits_decl integer;
  v_hits_calc integer;
  v_hits_doc  integer;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state';

  v_hits_decl := (pg_catalog.length(v_def)
                  - pg_catalog.length(pg_catalog.replace(v_def, v_ancre_decl, '')))
                 / pg_catalog.length(v_ancre_decl);
  if v_hits_decl <> 1 then
    raise exception
      'vitrine_public_state porte % occurrence(s) de la declaration de v_duo au lieu d''une seule : la fonction a change, ce patch decrirait du code qui n''existe plus',
      v_hits_decl;
  end if;

  v_hits_calc := (pg_catalog.length(v_def)
                  - pg_catalog.length(pg_catalog.replace(v_def, v_ancre_calc, '')))
                 / pg_catalog.length(v_ancre_calc);
  if v_hits_calc <> 1 then
    raise exception
      'vitrine_public_state porte % occurrence(s) de la conjonction droit `duo` + duo_jouable au lieu d''une seule : la garde produit de 20261020120000 a bouge, migration arretee pour ne pas l''ecraser',
      v_hits_calc;
  end if;

  v_hits_doc := (pg_catalog.length(v_def)
                 - pg_catalog.length(pg_catalog.replace(v_def, v_ancre_doc, '')))
                / pg_catalog.length(v_ancre_doc);
  if v_hits_doc <> 1 then
    raise exception
      'vitrine_public_state porte % occurrence(s) de l''ouverture du bloc experiences (quiz puis duo) au lieu d''une seule : le document a change, migration arretee',
      v_hits_doc;
  end if;

  v_def := pg_catalog.replace(v_def, v_ancre_decl, v_neuf_decl);
  v_def := pg_catalog.replace(v_def, v_ancre_calc, v_neuf_calc);
  v_def := pg_catalog.replace(v_def, v_ancre_doc,  v_neuf_doc);

  execute v_def;
end
$migration$;


-- ════════════════════════════════════════════════════════════
-- LA GARDE DE SORTIE
--
-- Elle lit le catalogue APRÈS l'application. Un `replace` qui n'aurait rien
-- remplacé rendrait la même fonction sans lever : les comptes ci-dessus
-- protègent l'ANCRE, ceux-ci prouvent le RÉSULTAT. Les deux moitiés sont
-- exigées séparément — un calcul sans clé publiée serait du code mort, et une
-- clé publiée sans calcul aurait fait échouer le `create or replace` plus haut,
-- ce que cette seconde assertion rend explicite plutôt que fortuit.
--
-- Cette garde est TEXTUELLE, et c'est sa limite : elle prouve que la fonction
-- vivante lit `org_has_module_access(…, 'bande')` et publie la clé, non que le
-- couple se comporte bien. La preuve de COMPORTEMENT — porte fermée sans le
-- droit, ouverte avec, et `duo` inchangé de part et d'autre — est en pgTAP,
-- dans `supabase/tests/droits_par_produit.test.sql` (section 5 bis).
-- ════════════════════════════════════════════════════════════

do $verification$
declare
  v_calcul   integer;
  v_document integer;
begin
  select pg_catalog.count(*)::integer into v_calcul
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state'
     and p.prosrc ~ 'v_bande := public\.org_has_module_access\(\s*v_settings\.organization_id, ''bande''\)';
  if v_calcul <> 1 then
    raise exception
      'vitrine_public_state ne tire pas v_bande du droit `bande` : la porte Portrait de la Bande resterait annoncee a un commercant qui ne l''a pas, et son client se prendrait le refus de create_player_lobby';
  end if;

  select pg_catalog.count(*)::integer into v_document
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state'
     and p.prosrc ~ '''bande'', v_bande';
  if v_document <> 1 then
    raise exception
      'vitrine_public_state ne publie pas la cle `bande` dans portes.experiences : le droit est lu mais le document ne le porte pas, l''ecran n''a rien a lire';
  end if;
end
$verification$;
