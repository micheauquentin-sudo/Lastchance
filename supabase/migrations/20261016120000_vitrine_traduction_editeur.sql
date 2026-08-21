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
-- Ce fichier ajoute ces trois valeurs, une seule RPC — le RETRAIT — et ferme les
-- DEUX POINTS MOYENS de la revue de sécurité du lot L15. Tous deux portent sur
-- les portes du calque, et tous deux sont des trous de CONFIANCE : la base
-- croyait sur parole ce que le client lui disait.
--
--   * M1 — LA VERSION POSÉE EST BORNÉE PAR LA RÉALITÉ. `p_version_source` voyage
--     dans le formulaire, donc le client la tient. Une version FUTURE forgée
--     (« 9999-12-31 ») rendait `version_source >= version_courante` vrai POUR
--     TOUJOURS : l'anglais correspondant ne pouvait plus JAMAIS périmer, quoi
--     qu'il advienne du français — c'est-à-dire exactement le pire cas que L11
--     nommait, « le champ faux qui se croit bon », mais rendu définitif. La ligne
--     écrite porte désormais `least(p_version_source, updated_at de la cible)`.
--     Une version honnête plus ancienne reste périmée — le comportement de L11 ne
--     bouge pas d'un pouce, et le scénario complet de `vitrine.test.sql` §15g le
--     prouve SANS UNE LIGNE DE CHANGEMENT. Une version future, elle, retombe sur
--     la réalité : « fraîche maintenant, périmée à la prochaine édition du
--     français ». L'invariant « honnête par construction » cesse de dépendre du
--     seul champ que le client tient.
--   * M2 — L'ACTEUR REMPLACE `system`. Les deux portes du calque journalisaient
--     `system` faute de recevoir un acteur : « qui a écrit ça sur ma carte » —
--     la question pour laquelle ce journal existe — restait sans réponse, et
--     « qui a retiré l'anglais de ma carte » aussi. Elles prennent maintenant un
--     `p_actor uuid` REVÉRIFIÉ EN SQL membre `owner|editor` de l'organisation
--     visée, motif EXACT de `set_vitrine_slug` (VIT-1) et d'`import_vitrine_carte`
--     (VIT-3, point I2 de la revue L12) : un acteur reçu et recopié sans être
--     vérifié aurait fait de la ligne d'audit une déclaration sur l'honneur —
--     plus dangereuse qu'un journal vide, parce qu'on la croit.
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
--   * `upsert_vitrine_translation` NE DEVIENT PAS LA PORTE DE RETRAIT. Elle est
--     redéfinie ci-dessous — M1 et M2 la touchent tous les deux — mais le retrait
--     reste une SECONDE porte et non une variante de la première : un `p_texte`
--     nul valant suppression aurait fait d'un bug d'appelant (texte perdu en
--     chemin) un effacement silencieux de contenu publié.
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
-- 1. `upsert_vitrine_translation` — la borne (M1) et l'acteur (M2)
--
-- La fonction vient de L11 (20261012120000). Elle est REDÉFINIE ICI, corps
-- inchangé sauf sur les deux points de la revue.
--
-- ── M1 : `least(version reçue, version RÉELLE de la cible)` ──
--
-- L11 a eu raison de faire voyager la version dans le formulaire : c'est ce qui
-- fait atterrir DÉJÀ PÉRIMÉE une traduction saisie sur un français qui a bougé
-- entre l'affichage et l'envoi, sans verrou ni relecture. Ce que ce choix n'avait
-- pas tranché, c'est ce qui arrive quand la valeur qui revient n'est pas celle
-- qui était partie.
--
-- En dessous de la réalité, rien à faire : une version ANCIENNE est le cas
-- honnête, celui que L11 décrit, et la clamper aurait détruit la propriété même
-- qu'on veut garder. AU-DESSUS, en revanche, il n'existe aucun cas honnête. Une
-- version postérieure à l'`updated_at` de la cible ne peut pas être « la version
-- du français que je viens de lire » : ce français n'existe pas encore. Et son
-- effet est le seul irréversible du module — `version_source >= version_courante`
-- reste vrai à chaque édition ultérieure du français, donc la page publique sert
-- cet anglais jusqu'à ce que quelqu'un le remarque à l'œil.
--
-- La borne est donc unilatérale, et c'est ce que `least` dit exactement :
--
--   * version reçue ANTÉRIEURE  → conservée telle quelle → reste périmée, et le
--     rafraîchissement la revalide comme avant. AUCUN changement de comportement,
--     et §15g de `vitrine.test.sql` le prouve sans qu'une ligne y bouge.
--   * version reçue ÉGALE       → conservée → fraîche, comme avant.
--   * version reçue POSTÉRIEURE → ramenée à l'`updated_at` de la cible → fraîche
--     MAINTENANT (elle traduit bien le texte courant, personne n'a rien à y
--     redire), et PÉRIMÉE à la prochaine édition du français. Le privilège
--     d'éternité disparaît ; le geste, lui, n'est pas refusé.
--
-- REFUSER AURAIT ÉTÉ PIRE. Un `raise` sur version future transforme une horloge
-- décalée de trois secondes — cas réel, le client n'est pas le serveur — en échec
-- d'enregistrement affiché au commerçant, pour un texte qu'il vient d'écrire. La
-- borne, elle, accepte le geste et lui retire seulement ce qu'il n'aurait pas dû
-- pouvoir prendre.
--
-- ── LA VERSION RÉELLE EST LUE PAR LA REQUÊTE QUI EXISTAIT DÉJÀ ──
--
-- Les quatre `exists` d'appartenance de L11 deviennent quatre `select
-- <table>.updated_at into v_version_cible` : MÊME table, MÊME index (clé primaire
-- et `organization_id`), MÊME instruction — on ne rapporte plus un booléen mais
-- la valeur qu'on avait sous la main. Aucun accès supplémentaire, et surtout
-- aucune SECONDE lecture qui aurait pu différer de la première.
--
-- ── M2 : L'ACTEUR, VÉRIFIÉ ICI ET NULLE PART AILLEURS ──
--
-- `p_actor uuid` en DERNIER paramètre, motif `import_vitrine_carte`. Il est
-- revérifié membre `owner|editor` de `p_organization_id` — pas le caissier :
-- publier de l'anglais sous l'enseigne n'est pas un geste de comptoir, même
-- arbitrage que l'adresse publique et que l'import de carte. Les quatre refus
-- (acteur absent, caissier, membre d'une AUTRE organisation, organisation
-- inconnue) rendent le MÊME 42501 indistinct, et le même que « cible d'autrui » :
-- distinguer ferait de cette RPC un oracle sur les équipes et les identifiants
-- des autres locataires.
--
-- `uuid` ET NON `text`, comme `import_vitrine_carte` et contrairement à
-- `set_vitrine_slug` : la signature change de toute façon, donc le TYPE fait le
-- travail que la garde par expression régulière faisait là-bas.
--
-- ── NOUVELLE SIGNATURE, DONC `drop` DE L'ANCIENNE (leçon L3) ──
--
-- `upsert_vitrine_translation(uuid, text, uuid, text, text, text, timestamptz)`
-- est SUPPRIMÉE et non surchargée. Deux exemplaires auraient laissé grand ouvert
-- le chemin sans acteur ET SANS BORNE — un appelant oublié aurait continué
-- d'écrire `system` avec une version que personne ne vérifie, et rien ne
-- l'aurait dit. `vitrine.test.sql` compte désormais qu'il n'en existe qu'un.
-- ────────────────────────────────────────────────────────────

drop function if exists public.upsert_vitrine_translation(
  uuid, text, uuid, text, text, text, timestamptz);

create or replace function public.upsert_vitrine_translation(
  p_organization_id uuid,
  p_cible_type text,
  p_cible_id uuid,
  p_lang text,
  p_champ text,
  p_texte text,
  p_version_source timestamptz,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lang           text;
  v_texte          text;
  v_version_cible  timestamptz;
  v_version_posee  timestamptz;
  v_precedent      text;
  v_version        timestamptz;
  v_cree           boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null or p_cible_id is null then
    raise exception 'organization and target required' using errcode = '22023';
  end if;
  if p_version_source is null then
    raise exception 'source version required' using errcode = '22023';
  end if;

  -- ── L'ACTEUR — MEMBRE owner|editor, TRANCHÉ EN SQL (M2) ────
  --
  -- Motif EXACT de `set_vitrine_slug` et d'`import_vitrine_carte`. CE TEST REND
  -- AUSSI CELUI DE L'EXISTENCE DE L'ORGANISATION : aucune ligne de
  -- `organization_members` ne peut pointer une organisation absente (FK), donc un
  -- `p_organization_id` inconnu ne trouve aucun membre et tombe ici — sous le
  -- même refus que tout le reste.
  if p_actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = p_actor
       and om.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_cible_type is null
     or p_cible_type not in ('settings', 'menu', 'categorie', 'item') then
    return pg_catalog.jsonb_build_object('state', 'invalid_cible');
  end if;

  -- Normalisation avant validation, motif `set_vitrine_slug` : « EN » et « en »
  -- sont la même langue, et refuser sur la casse aurait été de la pédanterie.
  v_lang := pg_catalog.lower(pg_catalog.btrim(coalesce(p_lang, '')));
  if v_lang <> 'en' then
    return pg_catalog.jsonb_build_object('state', 'invalid_lang');
  end if;

  -- LE COUPLAGE TYPE ↔ CHAMP, rendu sous son propre mot. La contrainte de table
  -- le tient aussi — elle est le filet — mais elle ne rend qu'un 23514.
  if p_champ is null or not (
       (p_cible_type = 'settings'
          and p_champ in ('accroche', 'histoire', 'horaires_texte'))
    or (p_cible_type in ('menu', 'categorie') and p_champ = 'nom')
    or (p_cible_type = 'item' and p_champ in ('nom', 'description'))
  ) then
    return pg_catalog.jsonb_build_object('state', 'invalid_champ');
  end if;

  v_texte := pg_catalog.btrim(coalesce(p_texte, ''));
  if pg_catalog.char_length(v_texte) < 1
     or pg_catalog.char_length(v_texte) > 2000 then
    return pg_catalog.jsonb_build_object('state', 'invalid_texte');
  end if;

  -- ── L'APPARTENANCE, PAR TYPE — ET LA VERSION RÉELLE (M1) ───
  --
  -- C'est la garde que la FK absente ne peut pas rendre, et elle est la raison
  -- d'être de cette RPC. Elle rapporte maintenant l'`updated_at` de la cible au
  -- lieu d'un booléen : même table, même index, même instruction.
  --
  -- `if/elsif` ET NON un `case` : un `select … into` est une INSTRUCTION, elle ne
  -- tient pas dans le `case` d'EXPRESSION de L11, et le `case` d'INSTRUCTION
  -- lèverait un 20000 illisible sur un cinquième type au lieu du 42501 attendu.
  --
  -- LA GARDE DE L11 EST TENUE À L'IDENTIQUE, sous une autre forme. Le
  -- `coalesce(v_appartient, false)` était écrit pour qu'un type sorti de la liste
  -- ne passe pas en silence (`if not null then` NE LÈVE PAS) ; ici c'est le test
  -- de nullité ci-dessous qui le fait, et il est plus fort : `updated_at` est
  -- `not null` sur les quatre tables (20261011120000), donc `v_version_cible is
  -- null` veut dire EXACTEMENT « aucune ligne trouvée » — cible inconnue, cible
  -- d'autrui, ou type qu'aucune branche ne couvre.
  if p_cible_type = 'settings' then
    select s.updated_at into v_version_cible
      from public.vitrine_settings s
     where s.id = p_cible_id and s.organization_id = p_organization_id;
  elsif p_cible_type = 'menu' then
    select m.updated_at into v_version_cible
      from public.vitrine_menus m
     where m.id = p_cible_id and m.organization_id = p_organization_id;
  elsif p_cible_type = 'categorie' then
    select k.updated_at into v_version_cible
      from public.vitrine_categories k
     where k.id = p_cible_id and k.organization_id = p_organization_id;
  elsif p_cible_type = 'item' then
    select i.updated_at into v_version_cible
      from public.vitrine_items i
     where i.id = p_cible_id and i.organization_id = p_organization_id;
  end if;

  if v_version_cible is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- LA BORNE, ET C'EST TOUT M1 EN UNE LIGNE. Le client peut faire vieillir sa
  -- propre traduction — c'est son droit, et c'est même le cas honnête — mais il
  -- ne peut plus la faire naître hors d'atteinte de la péremption.
  v_version_posee := least(p_version_source, v_version_cible);

  select t.texte, t.version_source into v_precedent, v_version
    from public.vitrine_translations t
   where t.organization_id = p_organization_id
     and t.cible_type = p_cible_type
     and t.cible_id = p_cible_id
     and t.lang = v_lang
     and t.champ = p_champ;
  v_cree := not found;

  -- LE NON-GESTE SE COMPARE À CE QUI SERAIT ÉCRIT, pas à ce qui a été reçu :
  -- c'est `v_version_posee` et non `p_version_source`. Garder la seconde aurait
  -- fait qu'un pipeline renvoyant deux fois la même version future rende
  -- `changed: true` à chaque passage — une ligne de journal par tentative, pour
  -- une table qui n'a pas bougé.
  if v_precedent is not distinct from v_texte
     and v_version is not distinct from v_version_posee then
    return pg_catalog.jsonb_build_object(
      'state', 'ok', 'created', false, 'changed', false);
  end if;

  insert into public.vitrine_translations
    (organization_id, cible_type, cible_id, lang, champ, texte, version_source)
  values
    (p_organization_id, p_cible_type, p_cible_id, v_lang, p_champ,
     v_texte, v_version_posee)
  on conflict on constraint vitrine_translations_cible_unique do update
    set texte = excluded.texte,
        version_source = excluded.version_source;

  -- AUDIT LÉGER : de quoi savoir QUI a posé ou remplacé un texte anglais, QUAND,
  -- et sur quoi. LE TEXTE N'Y EST PAS — un journal n'est pas un stockage, et l'y
  -- recopier aurait doublé le volume de chaque traduction pour ne rien apprendre
  -- que la table ne dise déjà.
  --
  -- `version_source` EST LA VERSION ÉCRITE, pas celle reçue : le journal décrit
  -- l'effet, et il doit rester d'accord avec la table qu'il commente. `::text`
  -- parce que `audit_logs.actor` est une colonne de texte, partagée avec les
  -- acteurs non humains.
  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor::text, 'vitrine.translation_set',
          pg_catalog.jsonb_build_object(
            'cible_type', p_cible_type,
            'cible_id', p_cible_id,
            'lang', v_lang,
            'champ', p_champ,
            'version_source', v_version_posee,
            'created', v_cree));

  return pg_catalog.jsonb_build_object(
    'state', 'ok', 'created', v_cree, 'changed', true);
end;
$$;

comment on function public.upsert_vitrine_translation(uuid, text, uuid, text, text, text, timestamp with time zone, uuid) is
  'Pose ou remplace UNE traduction d''un champ de vitrine (VIT-1b ; ACTEUR et '
  'BORNE DE VERSION ajoutés en VIT-5, points M1 et M2 de la revue L15) — seule '
  'porte d''écriture de vitrine_translations. LA VERSION ÉCRITE EST '
  '`least(p_version_source, updated_at de la cible)` : une version ANTÉRIEURE est '
  'conservée telle quelle — c''est le cas honnête, la traduction atterrit périmée '
  'et rien ne change depuis L11 — mais une version POSTÉRIEURE, que le client '
  'peut forger puisqu''elle voyage dans son formulaire, retombe sur la réalité. '
  'Sans cette borne, `version_source >= version_courante` restait vrai pour '
  'TOUJOURS et l''anglais correspondant ne pouvait plus jamais périmer : le pire '
  'cas d''un calque, le champ faux qui se croit bon, rendu définitif. La borne '
  'accepte le geste et lui retire seulement l''éternité — refuser aurait '
  'transformé une horloge décalée de trois secondes en échec affiché au '
  'commerçant. L''ACTEUR EST OBLIGATOIRE et vérifié EN SQL membre owner/editor de '
  'l''organisation, motif exact de set_vitrine_slug et import_vitrine_carte : '
  'publier de l''anglais sous l''enseigne n''est pas un geste de comptoir, et un '
  'p_actor non vérifié aurait fait de la ligne d''audit une déclaration sur '
  'l''honneur. Vérifie PAR TYPE que la cible appartient à l''organisation : '
  '`cible_id` ne porte aucune FK (quatre tables cibles), donc rien d''autre dans '
  'le schéma n''empêche d''écrire chez le voisin — et c''est la MÊME lecture qui '
  'rend la version de borne, sans accès supplémentaire. Acteur absent, caissier, '
  'membre d''une AUTRE organisation, organisation inconnue, cible inconnue et '
  'cible d''autrui rendent TOUS le même 42501 indistinct, sans quoi la RPC '
  'deviendrait un oracle sur les équipes et les identifiants d''autrui. Refus '
  'nommés et distincts pour « invalid_cible », « invalid_lang », « invalid_champ » '
  '(le couplage type↔champ) et « invalid_texte » (1 à 2000 caractères détourés). '
  'Réécrire le MÊME texte pour la MÊME version ÉCRITE ne journalise rien : un '
  'pipeline qui repasse sur cinquante fiches écrirait sinon deux cents lignes '
  'd''audit par passage. Le journal ne contient PAS le texte, et sa '
  '`version_source` est celle qui a été ÉCRITE, pas celle qui a été reçue. '
  'L''ANCIENNE FORME (uuid, text, uuid, text, text, text, timestamptz) EST '
  'SUPPRIMÉE, pas surchargée (leçon L3) : deux exemplaires auraient laissé ouvert '
  'le chemin sans acteur ET sans borne. Rendue à service_role seul.';

revoke all on function public.upsert_vitrine_translation(uuid, text, uuid, text, text, text, timestamp with time zone, uuid)
  from public, anon, authenticated;
grant execute on function public.upsert_vitrine_translation(uuid, text, uuid, text, text, text, timestamp with time zone, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 2. `delete_vitrine_translation` — le retrait, seconde porte
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
--
-- ── L'ACTEUR (M2), ET POURQUOI IL COMPTE PLUS ENCORE ICI ──
--
-- `p_actor uuid` en dernier paramètre, revérifié membre `owner|editor` EN SQL —
-- copie conforme de la porte d'écriture ci-dessus, jusqu'au 42501 indistinct.
-- La symétrie n'est pas décorative : ce qu'on ne peut pas écrire chez le voisin,
-- on ne doit pas pouvoir l'effacer, et ce qu'on efface doit se lire dans le
-- journal sous un nom de personne. « Qui a retiré l'anglais de ma carte » est
-- même la question la plus difficile à reconstituer après coup — le retrait ne
-- laisse, par construction, aucune trace dans la table.
--
-- ── SIGNATURE CHANGÉE, DONC `drop` DE LA FORME SANS ACTEUR ──
--
-- Cette migration n'est pas fusionnée : sur une base neuve la forme à cinq
-- arguments n'a jamais existé. Elle existe en revanche sur toute base où la
-- version précédente de CE fichier a déjà été appliquée, et un `create or
-- replace` qui change un paramètre ne remplace rien — il SURCHARGE (leçon L3).
-- Le `drop … if exists` est donc écrit pour ces bases-là, et le pgTAP compte
-- qu'il n'existe qu'un exemplaire.
-- ────────────────────────────────────────────────────────────

drop function if exists public.delete_vitrine_translation(
  uuid, text, uuid, text, text);

create or replace function public.delete_vitrine_translation(
  p_organization_id uuid,
  p_cible_type text,
  p_cible_id uuid,
  p_lang text,
  p_champ text,
  p_actor uuid
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

  -- ── L'ACTEUR — MEMBRE owner|editor, TRANCHÉ EN SQL (M2) ────
  --
  -- Copie conforme de `upsert_vitrine_translation`, et pour la même raison qu'à
  -- l'appartenance de la cible : une divergence entre les deux portes serait un
  -- trou. Le caissier est REFUSÉ ici aussi — retirer l'anglais d'une carte change
  -- ce que lit le visiteur, ce n'est pas un geste de comptoir. Ce test rend aussi
  -- celui de l'existence de l'organisation (FK sur `organization_members`).
  if p_actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = p_actor
       and om.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized' using errcode = '42501';
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

  -- AUDIT LÉGER, et symétrique de `vitrine.translation_set` : de quoi savoir QUI
  -- a fait cesser un texte anglais d'être servi, QUAND, et sur quel champ. LE
  -- TEXTE RETIRÉ N'Y EST PAS — un journal n'est pas une corbeille, et l'y
  -- recopier aurait fait du journal d'audit le seul endroit où survit un contenu
  -- que le commerçant vient précisément de retirer.
  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor::text, 'vitrine.translation_removed',
          pg_catalog.jsonb_build_object(
            'cible_type', p_cible_type,
            'cible_id', p_cible_id,
            'lang', v_lang,
            'champ', p_champ));

  return pg_catalog.jsonb_build_object('state', 'ok', 'deleted', true);
end;
$$;

comment on function public.delete_vitrine_translation(uuid, text, uuid, text, text, uuid) is
  'Retire UNE traduction d''un champ de vitrine (VIT-5) — seconde porte de '
  'vitrine_translations, symétrique de upsert_vitrine_translation. Le champ '
  'redevient « absent », la couverture baisse honnêtement et la page publique '
  'ressert le français POUR CE CHAMP : c''est la seule alternative propre à '
  'écrire un anglais identique au français, qui gonflerait la couverture d''un '
  'champ non traduit. L''ACTEUR EST OBLIGATOIRE et vérifié EN SQL membre '
  'owner/editor de l''organisation (point M2 de la revue L15), copie conforme de '
  'la porte d''écriture : le caissier est refusé, et « qui a retiré l''anglais de '
  'ma carte » est la question la plus difficile à reconstituer après coup, '
  'puisque le retrait ne laisse par construction aucune trace dans la table. '
  'Vérifie PAR TYPE que la cible appartient à l''organisation, et lève le MÊME '
  '42501 pour « acteur absent », « caissier », « membre d''une AUTRE '
  'organisation », « organisation inconnue », « cible inconnue » et « cible '
  'd''autrui » — ce qu''on ne peut pas écrire chez le voisin, on ne doit pas '
  'pouvoir l''effacer, et distinguer ferait de cette RPC un oracle sur les '
  'équipes et les identifiants d''autrui. IDEMPOTENTE : retirer une traduction '
  'absente rend `ok`/`deleted: false`, sans exception et SANS ligne de journal — '
  'le journal compte les gestes, pas les non-gestes. `deleted` n''est pas un '
  'oracle d''existence : il n''est atteint qu''après la preuve d''appartenance. Le '
  'journal ne contient PAS le texte retiré. Rendue à service_role seul.';

revoke all on function public.delete_vitrine_translation(uuid, text, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_vitrine_translation(uuid, text, uuid, text, text, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 3. `vitrine_translation_state` — les trois valeurs qui manquaient
--
-- MÊME SIGNATURE, MÊME NOM, MÊMES GARDES : `create or replace`, donc aucune
-- surcharge possible (leçon L3, gardée par une assertion de compte dans
-- `vitrine.test.sql`) et aucun `grant` à refaire — les privilèges suivent la
-- fonction, pas sa définition.
--
-- CE QUI EST AJOUTÉ, ET RIEN D'AUTRE :
--   * `cibles[].libelle`   — le nom lisible de la cible ;
--   * `cibles[].version`   — l'`updated_at` COURANT de la cible, celui que
--     l'écran devra rendre à l'upsert (voir plus bas, c'est le point le moins
--     évident de ce fichier) ;
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
--
-- ── `version` : LA FRAÎCHEUR SE DÉCIDE À L'AFFICHAGE, PAS À L'ENVOI ──
--
-- `upsert_vitrine_translation` exige un `p_version_source` : la version du texte
-- français que la traduction traduit. La question est QUI la fournit, et la
-- réponse change le sens de tout le calque.
--
-- SANS cette clé, l'action serveur n'a qu'un seul choix — relire `updated_at` au
-- moment de l'envoi. Elle enregistre alors la version d'ARRIVÉE, pas celle que
-- le commerçant avait sous les yeux, et le trou qui s'ouvre est étroit mais
-- parfaitement atteignable : il ouvre l'écran, part traduire une fiche, et
-- pendant ce temps le français bouge — lui-même dans un autre onglet, son
-- associé, un import de carte (`vitrine_import_carte`, L12, qui écrit dans les
-- mêmes tables). Son anglais traduit l'ANCIEN texte et il est enregistré FRAIS.
-- La péremption ne le rattrapera JAMAIS : `version_source >= version_courante`
-- est vrai, donc la page publique sert cet anglais faux jusqu'à la prochaine
-- correction du français — c'est-à-dire indéfiniment. Le pire cas d'un calque de
-- traduction n'est pas le champ manquant, c'est le champ faux qui se croit bon.
--
-- AVEC la clé, la version voyage avec le formulaire : l'écran la reçoit ici, la
-- renvoie telle quelle, l'upsert l'enregistre sans la recalculer. Une saisie
-- faite sur un texte qui a bougé entre-temps atterrit DÉJÀ PÉRIMÉE — le champ
-- ressort « à revoir » dès la relecture suivante de l'écran, et le français
-- continue d'être servi en attendant. Honnête PAR CONSTRUCTION : aucun verrou,
-- aucune relecture, aucune comparaison à écrire dans l'action serveur, et
-- surtout aucune fenêtre à refermer — il n'y en a plus.
--
-- ET CETTE CLÉ N'EST PLUS CRUE SUR PAROLE (M1, section 1). Elle voyage par le
-- client, donc elle est forgeable ; l'upsert la borne désormais à l'`updated_at`
-- RÉEL de la cible. Une version rendue ici et renvoyée telle quelle traverse la
-- borne sans la sentir — c'est le cas normal, et c'est pour cela que rien du
-- comportement décrit ci-dessus ne change — mais une valeur inventée ne peut plus
-- rendre une traduction impérissable.
--
-- PAR CIBLE ET NON PAR CHAMP, parce que c'est la portée RÉELLE de la clé de
-- version : `touch_updated_at` avance l'`updated_at` de la LIGNE, donc corriger
-- une description périme aussi la traduction du nom. L11 l'a assumé et chiffré
-- (« le coût de cette imprécision est une retraduction de trop ; le coût de
-- l'inverse serait un anglais faux »). Rendre une version par champ aurait
-- laissé croire à une granularité que la base n'a pas, et le premier appelant à
-- s'y fier aurait écrit un fraîchissement sélectif qui ne marche pas.
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
           -- LA VERSION DE LA CIBLE. `max()` et non `min()` alors que les deux
           -- rendent ici la même chose — `version_courante` est l'`updated_at`
           -- de la LIGNE, identique pour tous les champs d'une même cible. Le
           -- choix se justifie le jour où ce ne serait plus vrai : rendre la
           -- version la PLUS RÉCENTE fait atterrir une traduction douteuse en
           -- « périmée », rendre la plus ancienne l'aurait fait atterrir
           -- « fraîche ». Entre deux erreurs, on prend celle qui se voit.
           pg_catalog.max(ch.version_courante) as version,
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
          'version', p.version,
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
  'Chaque cible porte aussi sa `version` — l''`updated_at` COURANT — et c''est '
  'elle que l''écran doit renvoyer à upsert_vitrine_translation, TELLE QUELLE : '
  'une action serveur qui relirait `updated_at` à l''envoi enregistrerait FRAÎCHE '
  'une traduction du texte d''AVANT si le français a bougé entre l''affichage et '
  'l''envoi, et rien ne la périmerait jamais. Avec la version vue, une telle '
  'saisie atterrit déjà périmée — honnête par construction, sans verrou. Par '
  'CIBLE et non par champ : touch_updated_at avance l''updated_at de la LIGNE. '
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
