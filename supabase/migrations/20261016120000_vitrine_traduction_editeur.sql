-- ============================================================
-- VITRINE — CE QUE L'ÉCRAN DE TRADUCTION RÉCLAME EN PLUS (VIT-5, lot L15)
--
-- L11 (20261012120000) a livré l'infrastructure et l'a annoncé sans détour :
-- « L11 n'a besoin que du compteur ; l'écran de suivi arrive au lot L15. La
-- forme est néanmoins rendue COMPLÈTE dès maintenant — par cible et par champ —
-- parce que la refaire au moment de l'écran aurait demandé une seconde migration
-- pour une fonction que personne n'appelait encore. »
--
-- La promesse était bonne aux trois quarts. `vitrine_translation_state` rend
-- bien la granularité annoncée — une entrée par cible, une par champ, trois
-- états — mais elle rend des IDENTIFIANTS là où l'écran a besoin de TEXTE :
--
--   * `cible_id` sans LIBELLÉ. Une liste de quatorze UUID ne se traduit pas :
--     le commerçant doit lire « Carte du soir », « Entrées », « Velouté de
--     potiron », pas `f1000000-…-000000000701`. Le front n'a nulle part où
--     aller le chercher — il n'a pas le droit de lire les quatre tables cibles
--     sous la session marchande depuis une action serveur qui, elle, tourne en
--     `service_role`, et un second aller-retour par cible aurait rendu
--     quatorze requêtes pour afficher une page.
--   * `etat` sans TEXTE SOURCE. « perime » sur `item/description` ne dit pas
--     QUOI retraduire. L'écran de traduction est un écran à deux colonnes : le
--     français à gauche, l'anglais à droite. Sans le français, il n'a qu'une
--     colonne et un état.
--   * et sans le TEXTE TRADUIT existant, la colonne de droite s'ouvre vide même
--     quand une traduction périmée n'attend qu'une retouche — ce que L11
--     défendait pourtant explicitement : « elle n'est pas effacée pour autant :
--     elle reste sous les yeux du commerçant comme "à revoir" ».
--
-- Ce fichier ajoute ces trois valeurs, et une seule RPC : le RETRAIT.
--
-- ── CE QUI NE CHANGE PAS, ET C'EST DÉLIBÉRÉ ──
--
--   * `vitrine_translations` : aucune colonne, aucune contrainte, aucun index.
--   * Le `check` sur `lang` reste `('en')` SEUL. Une seconde langue est HORS
--     LOT : elle demande de changer ensemble ce `check`, la mesure de couverture
--     de `vitrine_public_state` et celle de `vitrine_translation_state` — trois
--     sites que `vitrine.test.sql` compte précisément pour forcer le passage ici
--     le jour venu. L15 livre l'écran d'UNE langue ; l'ouvrir à N est un lot à
--     part entière, avec son sélecteur, sa couverture par langue et sa page
--     publique.
--   * `upsert_vitrine_translation` : pas touchée. Le retrait est une SECONDE
--     porte, pas une variante de la première — un `p_texte` nul valant
--     suppression aurait fait d'un bug d'appelant (texte perdu en chemin) un
--     effacement silencieux de contenu publié.
--   * `vitrine_champs_traduisibles` : pas touchée non plus, et c'est le choix
--     le plus discutable de ce fichier, donc celui qui est écrit. Y ajouter le
--     texte source aurait évité la jointure ci-dessous — mais changer le type de
--     retour d'une fonction impose un `drop` puis un `create`, alors qu'elle est
--     appelée par `vitrine_public_state` (redéfinie trois fois depuis, en
--     dernier lieu par 20261015120000) et qu'elle est révoquée À TOUT LE MONDE,
--     `service_role` compris — une propriété que deux fichiers de test
--     asserttent et qu'un `drop`/`create` distrait perdrait en silence. La
--     jointure de `vitrine_translation_state` reste donc SUBORDONNÉE :
--     `vitrine_champs_traduisibles` décide seule QUELS champs existent, la
--     jointure ne fait que leur coller leur texte. Le `left join` est délibéré :
--     un champ dont la source ne serait pas retrouvée sort avec
--     `texte_source: null` et reste COMPTÉ — un `inner join` l'aurait fait
--     disparaître de la liste tout en le laissant dans le résumé chiffré, soit
--     un écran qui affirme « 3 manquants » en n'en montrant que deux.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. `delete_vitrine_translation` — le retrait, seconde porte
--
-- ── POURQUOI LE RETRAIT EST UN BESOIN, ET PAS UN CONFORT ──
--
-- L11 n'offrait aucun moyen d'enlever une traduction : une fois posée, elle
-- était servie tant que sa version source tenait. Or une traduction n'est pas
-- toujours une amélioration. Le nom propre d'un plat (« Bouillabaisse »,
-- « Kouign-amann ») traduit par un pipeline devient un contresens ; une accroche
-- dont la version anglaise ne rend pas le ton, le commerçant préfère la servir
-- en français. Sans retrait, sa seule issue était d'écrire l'anglais IDENTIQUE
-- au français — ce qui gonfle la couverture d'un champ qui n'est pas traduit et
-- laisse la table pleine de faux calques.
--
-- Retirer la ligne fait exactement la bonne chose : le champ redevient
-- « absent », la couverture baisse honnêtement, et la page publique sert le
-- français pour CE champ — ce que `vitrine_cartes_json` sait déjà faire depuis
-- L11, champ par champ, sans qu'aucun code n'ait à changer ici.
--
-- ── LE MÊME MOTIF QUE L'UPSERT, LIGNE POUR LIGNE ──
--
-- Mêmes refus nommés (`invalid_cible`, `invalid_lang`, `invalid_champ`), même
-- vérification d'appartenance PAR TYPE — `cible_id` ne porte toujours aucune FK,
-- quatre tables cibles — et le même 42501 INDISTINCT pour « la cible n'existe
-- pas » et « la cible est à quelqu'un d'autre ». Distinguer les deux aurait fait
-- de cette RPC un oracle sur les identifiants d'autrui, exactement ce que
-- l'upsert refuse d'être. Une divergence entre les deux portes serait un trou :
-- ce qu'on ne peut pas écrire chez le voisin, on ne doit pas pouvoir l'effacer.
--
-- ── L'IDEMPOTENCE : SUPPRIMER L'ABSENTE EST UN SUCCÈS ──
--
-- Aucune exception, aucune ligne de journal. Deux raisons, et la seconde est la
-- vraie :
--
--   1. Un écran qui envoie deux fois le même retrait (double-clic, rejeu d'une
--      action serveur) doit obtenir le même résultat. Lever sur la seconde
--      aurait transformé une opération sûre en erreur affichée au commerçant.
--   2. LE JOURNAL COMPTE LES GESTES, PAS LES NON-GESTES — motif `set_vitrine_slug`
--      et `upsert_vitrine_translation`. Journaliser un retrait qui n'a rien
--      retiré aurait fait du journal d'audit une trace de tentatives, pas
--      d'effets.
--
-- ── CE QUE `deleted` DIT, ET CE QU'IL NE TRAHIT PAS ──
--
-- La réponse porte `deleted: true|false`, symétrique du `changed` de l'upsert.
-- Ce drapeau n'est PAS un oracle d'existence : on ne l'atteint qu'APRÈS que
-- l'appartenance de la cible ait été prouvée, donc il ne parle jamais que des
-- traductions du locataire qui pose la question. Sur une cible d'autrui, la
-- fonction a déjà levé 42501 et ne rend aucun corps. L'écran, lui, en a besoin :
-- « retiré » et « il n'y avait rien à retirer » ne se disent pas pareil.
-- ────────────────────────────────────────────────────────────

create or replace function public.delete_vitrine_translation(
  p_organization_id uuid,
  p_cible_type text,
  p_cible_id uuid,
  p_lang text,
  p_champ text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lang       text;
  v_appartient boolean;
  v_supprime   boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null or p_cible_id is null then
    raise exception 'organization and target required' using errcode = '22023';
  end if;

  if p_cible_type is null
     or p_cible_type not in ('settings', 'menu', 'categorie', 'item') then
    return pg_catalog.jsonb_build_object('state', 'invalid_cible');
  end if;

  -- Normalisation avant validation, motif `upsert_vitrine_translation` : « EN »
  -- et « en » sont la même langue. Retirer doit accepter EXACTEMENT ce que
  -- poser accepte, sans quoi une traduction écrite en « EN » deviendrait
  -- ineffaçable par le même appelant.
  v_lang := pg_catalog.lower(pg_catalog.btrim(coalesce(p_lang, '')));
  if v_lang <> 'en' then
    return pg_catalog.jsonb_build_object('state', 'invalid_lang');
  end if;

  -- LE COUPLAGE TYPE ↔ CHAMP. Il n'est pas là pour protéger la table — un
  -- `delete` ne viole aucune contrainte — mais pour que l'appelant qui se
  -- trompe de champ l'apprenne, au lieu de recevoir un « rien à retirer »
  -- rassurant sur une paire qui n'aurait jamais pu exister.
  if p_champ is null or not (
       (p_cible_type = 'settings'
          and p_champ in ('accroche', 'histoire', 'horaires_texte'))
    or (p_cible_type in ('menu', 'categorie') and p_champ = 'nom')
    or (p_cible_type = 'item' and p_champ in ('nom', 'description'))
  ) then
    return pg_catalog.jsonb_build_object('state', 'invalid_champ');
  end if;

  -- L'APPARTENANCE, PAR TYPE — copie conforme de `upsert_vitrine_translation`.
  v_appartient := case p_cible_type
    when 'settings' then exists (
      select 1 from public.vitrine_settings s
       where s.id = p_cible_id and s.organization_id = p_organization_id)
    when 'menu' then exists (
      select 1 from public.vitrine_menus m
       where m.id = p_cible_id and m.organization_id = p_organization_id)
    when 'categorie' then exists (
      select 1 from public.vitrine_categories k
       where k.id = p_cible_id and k.organization_id = p_organization_id)
    when 'item' then exists (
      select 1 from public.vitrine_items i
       where i.id = p_cible_id and i.organization_id = p_organization_id)
  end;

  -- `coalesce(…, false)` ET NON `not v_appartient` seul, même raison qu'à
  -- l'upsert : un `case` sans `else` rend `null` si un cinquième type de cible
  -- entrait un jour, et `if not null then` NE LÈVE PAS — le retrait s'exécuterait
  -- alors sans qu'aucune appartenance ait été vérifiée.
  if not coalesce(v_appartient, false) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.vitrine_translations
   where organization_id = p_organization_id
     and cible_type = p_cible_type
     and cible_id = p_cible_id
     and lang = v_lang
     and champ = p_champ;
  v_supprime := found;

  if not v_supprime then
    return pg_catalog.jsonb_build_object('state', 'ok', 'deleted', false);
  end if;

  -- AUDIT LÉGER, et symétrique de `vitrine.translation_set` : de quoi savoir
  -- quand un texte anglais a CESSÉ d'être servi, et sur quel champ. LE TEXTE
  -- RETIRÉ N'Y EST PAS — un journal n'est pas une corbeille, et l'y recopier
  -- aurait fait du journal d'audit le seul endroit où survit un contenu que le
  -- commerçant vient précisément de retirer.
  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, 'system', 'vitrine.translation_removed',
          pg_catalog.jsonb_build_object(
            'cible_type', p_cible_type,
            'cible_id', p_cible_id,
            'lang', v_lang,
            'champ', p_champ));

  return pg_catalog.jsonb_build_object('state', 'ok', 'deleted', true);
end;
$$;

comment on function public.delete_vitrine_translation(uuid, text, uuid, text, text) is
  'Retire UNE traduction d''un champ de vitrine (VIT-5) — seconde porte de '
  'vitrine_translations, symétrique de upsert_vitrine_translation. Le champ '
  'redevient « absent », la couverture baisse honnêtement et la page publique '
  'ressert le français POUR CE CHAMP : c''est la seule alternative propre à '
  'écrire un anglais identique au français, qui gonflerait la couverture d''un '
  'champ non traduit. Vérifie PAR TYPE que la cible appartient à '
  'l''organisation, et lève le MÊME 42501 pour « cible inconnue » et « cible '
  'd''autrui » — ce qu''on ne peut pas écrire chez le voisin, on ne doit pas '
  'pouvoir l''effacer. IDEMPOTENTE : retirer une traduction absente rend '
  '`ok`/`deleted: false`, sans exception et SANS ligne de journal — le journal '
  'compte les gestes, pas les non-gestes. `deleted` n''est pas un oracle '
  'd''existence : il n''est atteint qu''après la preuve d''appartenance. Le '
  'journal ne contient PAS le texte retiré. Rendue à service_role seul.';

revoke all on function public.delete_vitrine_translation(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.delete_vitrine_translation(uuid, text, uuid, text, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 2. `vitrine_translation_state` — les trois valeurs qui manquaient
--
-- MÊME SIGNATURE, MÊME NOM, MÊMES GARDES : `create or replace`, donc aucune
-- surcharge possible (leçon L3, gardée par une assertion de compte dans
-- `vitrine.test.sql`) et aucun `grant` à refaire — les privilèges suivent la
-- fonction, pas sa définition.
--
-- CE QUI EST AJOUTÉ, ET RIEN D'AUTRE :
--   * `cibles[].libelle`   — le nom lisible de la cible ;
--   * `cibles[].champs[].texte_source`  — le FRANÇAIS courant, la référence ;
--   * `cibles[].champs[].texte_traduit` — l'anglais stocké, `null` si absent.
--
-- Les clés existantes ne bougent pas, ni leur ordre de tri : `state`, `lang`,
-- `resume` (quatre compteurs) et `cibles[]` avec `cible_type`, `cible_id`,
-- `champs[]` portant `champ` et `etat`. Un appelant de L11 continue de lire ce
-- qu'il lisait.
--
-- ── LE LIBELLÉ DES RÉGLAGES EST UNE CONSTANTE, ET C'EST ASSUMÉ ──
--
-- Les trois autres niveaux ont un nom propre — la carte, la rubrique, la fiche.
-- Les réglages n'en ont pas : `vitrine_settings` porte un slug, une accroche,
-- une histoire, jamais un titre. « Réglages » est donc écrit ici, en dur, en
-- français. C'est le seul texte d'interface de tout ce fichier, et le mettre en
-- base est le moindre mal : l'alternative — un libellé nul que le front
-- remplace — aurait obligé chaque appelant à connaître ce cas particulier, et
-- le premier qui l'oublie affiche une ligne sans titre.
--
-- ── LE TEXTE SOURCE VIENT DES TABLES, PAS DE LA TRADUCTION ──
--
-- Évident et pourtant décisif pour l'état `perime` : le français rendu est
-- TOUJOURS le courant, celui qui a péri la traduction. Rendre celui d'alors
-- aurait montré au commerçant le texte qu'il vient de corriger, à retraduire.
--
-- ── LE TEXTE TRADUIT SORT MÊME PÉRIMÉ ──
--
-- C'est la raison d'être de la conservation décidée en L11 : « elle n'est pas
-- effacée pour autant — l'écran commerçant la montre "à revoir", et un
-- rafraîchissement la revalide ». Une périmée est presque toujours à retoucher,
-- pas à réécrire ; l'ouvrir vide aurait rendu la conservation inutile.
-- ────────────────────────────────────────────────────────────

create or replace function public.vitrine_translation_state(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cibles jsonb;
  v_total  integer;
  v_frais  integer;
  v_perime integer;
  v_absent integer;
  v_lang_traduite constant text := 'en';
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.organizations o where o.id = p_organization_id
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  with sources as (
    -- LE TEXTE ET LE LIBELLÉ, par (cible_type, cible_id, champ). Cette liste ne
    -- décide RIEN : `vitrine_champs_traduisibles` reste seule à dire quels
    -- champs existent, et la jointure ci-dessous est un `left join` subordonné à
    -- elle. Aucun filtre `active`, aucune exclusion des valeurs nulles : filtrer
    -- ici n'aurait servi qu'à faire disparaître des lignes que la définition
    -- retient, c'est-à-dire à faire mentir le résumé chiffré.
    select 'settings'::text as cible_type,
           s.id             as cible_id,
           v.nom_champ      as champ,
           v.valeur         as texte_source,
           'Réglages'::text as libelle
      from public.vitrine_settings s
      cross join lateral (values ('accroche', s.accroche),
                                 ('histoire', s.histoire),
                                 ('horaires_texte', s.horaires_texte))
        as v(nom_champ, valeur)
     where s.organization_id = p_organization_id

    union all

    select 'menu'::text, m.id, 'nom'::text, m.nom, m.nom
      from public.vitrine_menus m
     where m.organization_id = p_organization_id

    union all

    select 'categorie'::text, k.id, 'nom'::text, k.nom, k.nom
      from public.vitrine_categories k
     where k.organization_id = p_organization_id

    union all

    -- LE LIBELLÉ D'UNE FICHE EST SON NOM FRANÇAIS, y compris sur la ligne de sa
    -- description : les deux champs d'une même fiche doivent se ranger sous le
    -- même titre, sinon l'écran affiche deux entrées pour un seul plat.
    select 'item'::text, i.id, v.nom_champ, v.valeur, i.nom
      from public.vitrine_items i
      cross join lateral (values ('nom', i.nom),
                                 ('description', i.description))
        as v(nom_champ, valeur)
     where i.organization_id = p_organization_id
  ),
  champs as (
    select c.cible_type,
           c.cible_id,
           c.champ,
           c.version_courante,
           case
             when t.id is null then 'absent'
             when t.version_source >= c.version_courante then 'frais'
             else 'perime'
           end as etat,
           src.libelle,
           src.texte_source,
           t.texte as texte_traduit
      from public.vitrine_champs_traduisibles(p_organization_id, false) c
      left join public.vitrine_translations t
        on t.organization_id = p_organization_id
       and t.cible_type = c.cible_type
       and t.cible_id = c.cible_id
       and t.champ = c.champ
       and t.lang = v_lang_traduite
      left join sources src
        on src.cible_type = c.cible_type
       and src.cible_id = c.cible_id
       and src.champ = c.champ
  ),
  par_cible as (
    select ch.cible_type,
           ch.cible_id,
           -- `max()` ET NON un `group by ch.libelle` : le libellé ne dépend que
           -- de la cible, donc les deux formes rendent la même chose — sauf le
           -- jour où la jointure raterait sur UN champ d'une fiche et pas sur
           -- l'autre. Un `group by` scinderait alors la fiche en deux entrées,
           -- l'une sans titre ; `max()` ignore le nul et garde la fiche entière.
           pg_catalog.max(ch.libelle) as libelle,
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'champ', ch.champ,
               'etat', ch.etat,
               'texte_source', ch.texte_source,
               'texte_traduit', ch.texte_traduit
             )
             order by ch.champ
           ) as champs
      from champs ch
     group by ch.cible_type, ch.cible_id
  )
  select
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'cible_type', p.cible_type,
          'cible_id', p.cible_id,
          'libelle', p.libelle,
          'champs', p.champs
        )
        -- ORDRE STABLE, inchangé depuis L11 : (cible_type, cible_id). Le tri par
        -- libellé aurait été plus joli et moins sûr — deux cartes homonymes
        -- rendraient un ordre au choix du plan, et l'écran changerait de contenu
        -- d'un rafraîchissement à l'autre. Le regroupement visuel est une
        -- décision de rendu, pas de base.
        order by p.cible_type, p.cible_id
      )
      from par_cible p
    ), '[]'::jsonb),
    (select pg_catalog.count(*)::integer from champs),
    (select pg_catalog.count(*)::integer from champs ch where ch.etat = 'frais'),
    (select pg_catalog.count(*)::integer from champs ch where ch.etat = 'perime'),
    (select pg_catalog.count(*)::integer from champs ch where ch.etat = 'absent')
  into v_cibles, v_total, v_frais, v_perime, v_absent;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'lang', v_lang_traduite,
    'resume', pg_catalog.jsonb_build_object(
      'total_champs_traduisibles', v_total,
      'traduits_frais', v_frais,
      'perimes', v_perime,
      'manquants', v_absent
    ),
    'cibles', v_cibles
  );
end;
$$;

comment on function public.vitrine_translation_state(uuid) is
  'État de TRADUCTION d''une vitrine pour l''éditeur (VIT-1b, complété en VIT-5) '
  ': par cible et par champ, `frais` / `perime` / `absent`, plus un résumé '
  'chiffré. Chaque cible porte un LIBELLÉ lisible — nom de la carte, de la '
  'rubrique, de la fiche, et « Réglages » pour vitrine_settings, qui n''a pas de '
  'titre — et chaque champ porte son `texte_source` FRANÇAIS COURANT (celui qui '
  'a péri la traduction, jamais celui d''alors) et son `texte_traduit` s''il en '
  'existe un, PÉRIMÉ COMPRIS : une périmée se retouche, elle ne se réécrit pas. '
  'Trois états et non deux — « il reste des plats à traduire » et « vos '
  'modifications d''hier ont périmé six fiches » sont deux écrans différents. '
  'Mesure TOUT le catalogue, cartes désactivées comprises : le compte diffère '
  'donc de `lang_coverage` du public, qui ne mesure que ce que le visiteur voit, '
  'et c''est voulu. `vitrine_champs_traduisibles` reste seule à décider QUELS '
  'champs comptent ; la jointure des textes lui est subordonnée et ne peut ni en '
  'ajouter ni en retirer. NE GARDE PAS l''appartenance de l''appelant : '
  '`service_role` n''a pas de session marchande, la garde est dans l''action '
  'serveur, motif de toutes les vues de dashboard du dépôt. Rendue à '
  'service_role seul.';
