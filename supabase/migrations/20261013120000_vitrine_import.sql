-- ============================================================
-- VITRINE — L'IMPORT D'UNE CARTE EN LOT (VIT-2, lot L12)
--
-- Les deux lots précédents ont livré le catalogue (20261011120000) et son calque
-- de traduction (20261012120000), et pas une ligne de CRÉATION EN LOT : on pose
-- une carte, puis une rubrique, puis une fiche, un aller-retour par ligne. Un
-- commerçant qui ouvre sa vitrine arrive avec une carte de cinquante plats déjà
-- écrite ailleurs — sur un PDF, dans un tableur, sur la carte imprimée qu'il
-- vient de photographier. Cinquante allers-retours pour la ressaisir, c'est
-- l'écran qu'il ne finira pas.
--
-- Ce fichier n'ajoute AUCUNE TABLE et AUCUNE COLONNE. Il ajoute une porte, et
-- toute sa valeur est dans ce qu'elle refuse.
--
-- ── L'ATOMICITÉ EST GRATUITE, ET C'EST PRÉCISÉMENT POURQUOI ON LA PROUVE ──
--
-- Le corps d'une fonction PL/pgSQL s'exécute dans la transaction de l'appelant :
-- une exception non rattrapée l'abandonne tout entière. « Tout ou rien » ne
-- coûte donc ici pas une ligne de code — il suffit de NE JAMAIS AVALER une
-- erreur. C'est exactement la raison pour laquelle le pgTAP de ce lot ne se
-- contente pas de vérifier que l'import échoue : il compte les lignes APRÈS
-- l'échec et exige zéro. Une garantie qui ne coûte rien est une garantie que le
-- prochain `exception when others then return` fera disparaître sans bruit, et
-- personne ne s'en apercevra avant qu'un commerçant ne retrouve une demi-carte.
--
-- Les deux blocs `exception` de ce fichier RELÈVENT toujours. Ils ne servent
-- qu'à rhabiller le refus, jamais à le convertir en succès partiel.
--
-- ── CE QUE LE MESSAGE DE REFUS A LE DROIT DE DIRE ──
--
-- Le lot arrive d'un fichier que quelqu'un a déposé. Recopier son contenu dans
-- un message d'erreur, c'est le renvoyer tel quel vers un écran, un journal
-- d'application et une trace d'observabilité — trois endroits qui ne l'ont pas
-- validé et qui, eux, ne sont pas bornés. Aucun message de ce fichier ne relaie
-- donc de texte libre du payload.
--
-- Ce qu'ils relaient à la place est un NOM DE CONTRAINTE, lu dans
-- `get stacked diagnostics`. C'est un identifiant du schéma : borné, écrit par
-- nous, et infiniment plus utile qu'un « ligne invalide » — il dit LAQUELLE des
-- règles a mordu (`vitrine_items_nom_check` n'est pas
-- `vitrine_items_badges_check`), ce qu'un écran d'import doit savoir pour
-- pointer la bonne colonne du fichier.
--
-- ── LES BORNES DE LONGUEUR NE SONT PAS RECOPIÉES ICI ──
--
-- 80 caractères pour un nom de carte ou de rubrique, 120 pour une fiche, 400
-- pour une description, 40 pour un prix : tout cela est DÉJÀ dans les `check` de
-- 20261011120000, et les y recopier aurait créé la paire qui diverge à la
-- première correction. Ce fichier laisse la contrainte lever et se contente de
-- rhabiller le refus.
--
-- Ce qu'il ajoute, parce qu'aucun `check` de colonne ne peut l'exprimer, ce sont
-- les deux bornes de CARDINALITÉ : douze rubriques, cent vingt fiches. Elles ne
-- protègent pas la forme des données mais le COÛT du geste — un payload de
-- dix mille fiches est une transaction longue sur une table que des visiteurs
-- lisent, et l'écran qui rendrait cette carte n'existe pas. Douze et cent vingt
-- sont au-dessus de toute carte réelle mesurée au benchmark (sept listes, la
-- plus longue à une soixantaine de lignes) et très en dessous de ce qui ferait
-- de cette RPC un canal d'écriture en masse.
--
-- ── LE VOCABULAIRE EST VALIDÉ PAR LE `check`, ET C'EST VOULU ──
--
-- Badges et allergènes ne sont PAS revérifiés dans cette fonction. Le lot L10
-- l'écrit noir sur blanc : le vocabulaire vit dans la DDL de `vitrine_items`,
-- « c'est là qu'on le compte », et une liste jumelle dans ce fichier aurait
-- divergé le jour où un quinzième allergène entre. Un badge inconnu est donc
-- refusé par `is_valid_vitrine_vocabulaire` à l'INSERT, en 23514, et le nom de
-- la contrainte remonte dans le message.
--
-- LA CLASSE A FRAPPÉ DEUX FOIS DANS CE DÉPÔT (20261008120000 puis les trois
-- validateurs de 20261011120000) : une fonction appelée par un `check` doit être
-- EXÉCUTABLE par le rôle qui écrit la ligne. Ici l'écriture se fait en
-- `security definer`, donc sous le PROPRIÉTAIRE de cette fonction, qui détient
-- l'EXECUTE — la règle est satisfaite par construction, et non par un grant de
-- plus. La règle catalogue de `security_acl.test.sql` ne le voit pas : elle
-- n'inspecte qu'`anon` et `authenticated`, les écrivains DIRECTS. C'est pourquoi
-- `vitrine.test.sql` en pose l'assertion explicite pour ce chemin-ci.
--
-- ── L'IMPORT NE TRADUIT RIEN, ET C'EST L'INVARIANT DE L11 ──
--
-- Aucune ligne n'est écrite dans `vitrine_translations`. Une carte importée naît
-- donc NON TRADUITE, et la couverture publique de l'organisation BAISSE
-- mécaniquement au moment de l'import — jusqu'à éteindre le sélecteur de langue
-- si elle passe sous le seuil applicatif. Ce n'est pas un effet de bord à
-- corriger : c'est exactement ce que L11 a construit. Une machine ne publie pas
-- d'anglais sans contrôle, et une carte qu'on vient de déposer n'a été relue par
-- personne. Le pipeline ou la saisie humaine repasseront par
-- `upsert_vitrine_translation`, seule porte d'écriture du calque.
--
-- ── CE QUE CE FICHIER NE FAIT PAS ──
--
--   * Aucune MISE À JOUR. L'import CRÉE une carte ; il ne fusionne pas avec une
--     carte existante et n'en écrase aucune. Un nom déjà pris est un refus, pas
--     une fusion silencieuse — deviner ce que le commerçant voulait faire de ses
--     anciennes fiches était le seul choix impossible à reprendre.
--   * Aucune PHOTO, aucune DISPONIBILITÉ dans le payload. `photo_path` suppose
--     un fichier déjà déposé dans le bucket, ce qu'un lot jsonb ne peut pas
--     porter ; `disponible` naît à `true` par le défaut de la colonne, et se
--     règle ensuite d'un geste sur l'écran prévu pour ça.
--   * Aucun contrôle du droit `vitrine`. Comme `set_vitrine_slug`, et pour la
--     même raison : la garde est APPLICATIVE (`gardeEditeurVitrine`), elle est
--     le seul endroit d'où elle peut se rouvrir sans migration. Rien de ce qui
--     est importé n'est visible du public tant que `published` et le droit ne
--     sont pas réunis — le trigger de publication, lui, ne bouge pas.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- `import_vitrine_carte` — une carte entière, ou rien
--
-- ── LE CONTRAT DU PAYLOAD, FERMÉ AUX TROIS RANGS ──
--
--   {
--     "nom": "Carte du midi",
--     "rubriques": [
--       {
--         "nom": "Entrées",
--         "fiches": [
--           {
--             "nom": "Velouté de potiron",
--             "description": "Crème légère.",      -- facultatif
--             "prix_affiche": "à partir de 8 €",   -- facultatif
--             "badges": ["vegetarien"],            -- facultatif
--             "allergenes": ["lait"]               -- facultatif
--           }
--         ]
--       }
--     ]
--   }
--
-- UNE CLÉ INCONNUE EST REFUSÉE, aux trois rangs. C'est la leçon de
-- `is_valid_experience_steps` (lot L8) et de `is_valid_vitrine_theme`,
-- transposée à une entrée plutôt qu'à une colonne, et elle vaut ici plus encore
-- qu'ailleurs : un import est un fichier écrit à la main. Accepter `"prix"` au
-- lieu de `"prix_affiche"` en le laissant tomber en silence aurait produit une
-- carte de soixante plats SANS AUCUN PRIX et sans le moindre message — le seul
-- mode d'échec qu'un écran d'import ne peut pas rattraper, parce qu'il ressemble
-- à un succès.
--
-- ── LE RETOUR EST UN COMPTE, PAS UN ARBRE ──
--
--   { "carte_id": …, "rubriques_creees": n, "fiches_creees": m }
--
-- L'appelant qui veut l'arbre a déjà `vitrine_dashboard_state`, qui le rend dans
-- la forme exacte que l'écran consomme. Le recomposer ici aurait créé une
-- seconde écriture du même fait, et c'est toujours l'ORDRE qui diverge en
-- premier.
--
-- ── LES RANGS SONT CEUX DU FICHIER, ET LA CARTE ARRIVE AU BOUT ──
--
-- Rubriques et fiches reçoivent `ordre` = leur position dans le payload, 0..n :
-- l'ordre du fichier EST une information que le commerçant a produite, et la
-- perdre l'obligerait à tout réordonner à la main après l'import. La CARTE, en
-- revanche, se pose APRÈS les cartes existantes (`max(ordre) + 1`) : elle
-- s'ajoute à un catalogue, elle ne le prend pas en tête. Le plafond 999 est
-- celui du `check` de la colonne.
-- ────────────────────────────────────────────────────────────

create or replace function public.import_vitrine_carte(
  p_organization_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- LES DEUX BORNES DE CARDINALITÉ, écrites ici et nulle part ailleurs. Elles
  -- sont dans le corps et non dans un `check` parce qu'elles ne portent sur
  -- AUCUNE ligne : elles bornent un GESTE.
  c_max_rubriques constant integer := 12;
  c_max_fiches    constant integer := 120;

  v_rubriques    jsonb;
  v_nom          text;
  v_total_fiches bigint;
  v_ordre_carte  integer;
  v_carte_id     uuid;
  v_categorie_id uuid;
  v_badges       text[];
  v_allergenes   text[];
  v_n_rubriques  integer := 0;
  v_n_fiches     integer := 0;
  v_contrainte   text;
  v_rub          record;
  v_fic          record;
begin
  -- ── 1. LA PORTE : service_role SEUL ────────────────────────
  --
  -- Motif du module depuis RES-1a. La garde d'APPARTENANCE du commerçant est
  -- applicative — `service_role` n'a pas de session marchande et ne peut donc
  -- pas la rendre — et c'est ce qui rend ce choix sûr : la clé ne quitte jamais
  -- le serveur.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  -- ── 2. L'ORGANISATION EXISTE, ET LE REFUS EST INDISTINCT ───
  --
  -- Le MÊME 42501 que `upsert_vitrine_translation` rend pour « cible inconnue »
  -- et « cible d'un autre locataire ». Distinguer aurait fait de cette RPC un
  -- oracle sur les identifiants d'organisations qui ne sont pas les siennes.
  if not exists (
    select 1 from public.organizations o where o.id = p_organization_id
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- ── 3. LA FORME DU LOT — premier rang ──────────────────────
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload must be an object' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_object_keys(p_payload) k
     where k not in ('nom', 'rubriques')
  ) then
    raise exception 'payload carries an unknown key' using errcode = '22023';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_payload -> 'nom'), '') <> 'string' then
    raise exception 'carte name required' using errcode = '22023';
  end if;

  -- NORMALISATION AVANT VALIDATION, motif `set_vitrine_slug` : un fichier
  -- exporté d'un tableur porte des espaces de bord sur une ligne sur trois, et
  -- refuser là-dessus aurait été de la pédanterie. La LONGUEUR, elle, reste au
  -- `check` de la colonne.
  v_nom := pg_catalog.btrim(p_payload ->> 'nom');

  -- `rubriques` absent vaut liste vide : importer une carte sans rubrique est
  -- exactement une création de carte, et refuser aurait demandé à l'appelant de
  -- choisir entre deux portes pour un même geste.
  v_rubriques := coalesce(p_payload -> 'rubriques', '[]'::jsonb);
  if pg_catalog.jsonb_typeof(v_rubriques) <> 'array' then
    raise exception 'rubriques must be an array' using errcode = '22023';
  end if;

  -- ── 4. LA PREMIÈRE BORNE DE CARDINALITÉ ────────────────────
  --
  -- Comptée AVANT toute inspection du contenu : c'est la borne qui protège du
  -- payload démesuré, et la faire passer après aurait fait parcourir dix mille
  -- éléments pour découvrir qu'il y en a dix mille.
  if pg_catalog.jsonb_array_length(v_rubriques) > c_max_rubriques then
    raise exception 'too many rubriques in one import (max %)', c_max_rubriques
      using errcode = '22023';
  end if;

  -- ── 5. LA FORME DU LOT — deuxième rang, les rubriques ──────
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
     where pg_catalog.jsonb_typeof(r.value) <> 'object'
  ) then
    raise exception 'each rubrique must be an object' using errcode = '22023';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
      cross join lateral pg_catalog.jsonb_object_keys(r.value) k
     where k not in ('nom', 'fiches')
  ) then
    raise exception 'a rubrique carries an unknown key' using errcode = '22023';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
     where coalesce(pg_catalog.jsonb_typeof(r.value -> 'nom'), '') <> 'string'
        or pg_catalog.jsonb_typeof(coalesce(r.value -> 'fiches', '[]'::jsonb))
           <> 'array'
  ) then
    raise exception 'each rubrique needs a name and an array of fiches'
      using errcode = '22023';
  end if;

  -- DEUX RUBRIQUES DE MÊME NOM DANS LE MÊME LOT. La contrainte
  -- `vitrine_categories_menu_nom_unique` le refuserait aussi — elle est le filet
  -- — mais en 23505, sous le même mot que « cette carte existe déjà », que
  -- l'écran devrait alors distinguer sans indice. Le refus est rendu ici, sous
  -- son propre nom, avant que rien ne soit écrit.
  if (select pg_catalog.count(distinct pg_catalog.btrim(r.value ->> 'nom'))
        from pg_catalog.jsonb_array_elements(v_rubriques) r)
     <> pg_catalog.jsonb_array_length(v_rubriques)::bigint then
    raise exception 'two rubriques of the import share the same name'
      using errcode = '22023';
  end if;

  -- ── 6. LA FORME DU LOT — troisième rang, les fiches ────────
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(r.value -> 'fiches', '[]'::jsonb)) f
     where pg_catalog.jsonb_typeof(f.value) <> 'object'
  ) then
    raise exception 'each fiche must be an object' using errcode = '22023';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(r.value -> 'fiches', '[]'::jsonb)) f
      cross join lateral pg_catalog.jsonb_object_keys(f.value) k
     where k not in ('nom', 'description', 'prix_affiche',
                     'badges', 'allergenes')
  ) then
    raise exception 'a fiche carries an unknown key' using errcode = '22023';
  end if;

  -- `? 'clé'` AVANT le type : une clé ABSENTE est légitime pour les quatre
  -- champs facultatifs, une clé PRÉSENTE mais d'un autre type ne l'est pas. Sans
  -- ce test d'existence, `jsonb_typeof` rendrait `null` sur l'absence et la
  -- comparaison `not in (…)` rendrait `null` — c'est-à-dire « accepté », par le
  -- même piège à trois valeurs que celui refermé dans is_valid_vitrine_vocabulaire.
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(r.value -> 'fiches', '[]'::jsonb)) f
     where coalesce(pg_catalog.jsonb_typeof(f.value -> 'nom'), '') <> 'string'
        or (f.value ? 'description'
            and pg_catalog.jsonb_typeof(f.value -> 'description')
                not in ('string', 'null'))
        or (f.value ? 'prix_affiche'
            and pg_catalog.jsonb_typeof(f.value -> 'prix_affiche')
                not in ('string', 'null'))
        or (f.value ? 'badges'
            and pg_catalog.jsonb_typeof(f.value -> 'badges') <> 'array')
        or (f.value ? 'allergenes'
            and pg_catalog.jsonb_typeof(f.value -> 'allergenes') <> 'array')
  ) then
    raise exception 'a fiche has a field of the wrong type'
      using errcode = '22023';
  end if;

  -- LES ÉLÉMENTS des deux vocabulaires doivent être des CHAÎNES. Le `check` de
  -- la table refuserait `[1]` de toute façon — `'1'` n'est dans aucun des deux
  -- vocabulaires — mais il rendrait « badge inconnu » pour ce qui est en réalité
  -- un fichier mal formé, et l'écran d'import enverrait le commerçant chercher
  -- une faute de vocabulaire qui n'existe pas.
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(r.value -> 'fiches', '[]'::jsonb)) f
      cross join lateral (values (f.value -> 'badges'),
                                 (f.value -> 'allergenes')) v(liste)
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(v.liste, '[]'::jsonb)) e
     where pg_catalog.jsonb_typeof(e.value) <> 'string'
  ) then
    raise exception 'badges and allergenes must be arrays of strings'
      using errcode = '22023';
  end if;

  -- ── 7. LA SECONDE BORNE DE CARDINALITÉ — le TOTAL ──────────
  --
  -- SUR LE LOT ENTIER et non par rubrique : douze rubriques de cent fiches
  -- chacune passeraient douze bornes locales et resteraient un import de mille
  -- deux cents lignes. C'est le total qui coûte.
  select coalesce(pg_catalog.sum(pg_catalog.jsonb_array_length(
           coalesce(r.value -> 'fiches', '[]'::jsonb))), 0)
    into v_total_fiches
    from pg_catalog.jsonb_array_elements(v_rubriques) r;

  if v_total_fiches > c_max_fiches then
    raise exception 'too many fiches in one import (max %)', c_max_fiches
      using errcode = '22023';
  end if;

  -- ── 8. LA CARTE — elle arrive APRÈS les cartes existantes ──
  select least(coalesce(pg_catalog.max(m.ordre) + 1, 0), 999)
    into v_ordre_carte
    from public.vitrine_menus m
   where m.organization_id = p_organization_id;

  -- LE BLOC NE COUVRE QUE CETTE ÉCRITURE, motif `set_vitrine_slug` : une garde
  -- plus large aurait avalé, sous le nom « ce nom est pris », des violations qui
  -- n'ont rien à voir. `vitrine_menus` porte deux contraintes uniques — le nom
  -- par organisation, et le couple `(id, organization_id)` qui n'existe que pour
  -- servir de cible aux FK composites et ne peut collisionner que sur un
  -- `gen_random_uuid()` répété.
  begin
    insert into public.vitrine_menus (organization_id, nom, ordre)
    values (p_organization_id, v_nom, v_ordre_carte)
    returning id into v_carte_id;
  exception
    when unique_violation then
      -- LE NOM N'EST PAS DANS LE MESSAGE. L'appelant l'a envoyé, il le connaît ;
      -- ce message-ci finit dans un journal.
      raise exception 'a carte of this name already exists in this catalogue'
        using errcode = '23505';
    when check_violation then
      get stacked diagnostics v_contrainte = constraint_name;
      raise exception 'carte rejected by constraint %',
        coalesce(v_contrainte, 'unknown') using errcode = '23514';
  end;

  -- ── 9. LES RUBRIQUES ET LES FICHES, DANS L'ORDRE DU FICHIER ─
  --
  -- `with ordinality` porte le rang, et le `order by` explicite le fige : la
  -- position dans le payload EST l'information que le commerçant a produite en
  -- écrivant sa carte, et c'est le seul travail que l'import ne doit pas lui
  -- rendre à refaire.
  begin
    for v_rub in
      select r.value as rubrique, (r.rang - 1)::integer as rang
        from pg_catalog.jsonb_array_elements(v_rubriques)
             with ordinality as r(value, rang)
       order by r.rang
    loop
      insert into public.vitrine_categories
        (menu_id, organization_id, nom, ordre)
      values
        (v_carte_id, p_organization_id,
         pg_catalog.btrim(v_rub.rubrique ->> 'nom'), v_rub.rang)
      returning id into v_categorie_id;
      v_n_rubriques := v_n_rubriques + 1;

      for v_fic in
        select f.value as fiche, (f.rang - 1)::integer as rang
          from pg_catalog.jsonb_array_elements(
                 coalesce(v_rub.rubrique -> 'fiches', '[]'::jsonb))
               with ordinality as f(value, rang)
         order by f.rang
      loop
        -- `#>> '{}'` ET NON `->> …` : sur un élément SCALAIRE, le
        -- déréférencement par chemin VIDE rend le texte nu, là où `::text`
        -- rendrait `"vegan"` AVEC ses guillemets — même idiome qu'au validateur
        -- d'`ordre_blocs`, et la même raison.
        select coalesce(
                 pg_catalog.array_agg(e.value #>> '{}' order by e.rang),
                 '{}'::text[])
          into v_badges
          from pg_catalog.jsonb_array_elements(
                 coalesce(v_fic.fiche -> 'badges', '[]'::jsonb))
               with ordinality as e(value, rang);

        select coalesce(
                 pg_catalog.array_agg(e.value #>> '{}' order by e.rang),
                 '{}'::text[])
          into v_allergenes
          from pg_catalog.jsonb_array_elements(
                 coalesce(v_fic.fiche -> 'allergenes', '[]'::jsonb))
               with ordinality as e(value, rang);

        -- `nullif(btrim(…), '')` sur les deux champs facultatifs : « absent »,
        -- « null » et « trois espaces » sont le MÊME état — rien à afficher — et
        -- trois façons de l'écrire en base auraient donné trois chemins à tenir
        -- dans chaque lecture. Le `check` de `prix_affiche` exige d'ailleurs une
        -- valeur déjà détourée : sans ce btrim, un prix copié d'un tableur avec
        -- son espace de fin ferait échouer tout l'import.
        insert into public.vitrine_items
          (categorie_id, organization_id, nom, description, prix_affiche,
           badges, allergenes, ordre)
        values (
          v_categorie_id,
          p_organization_id,
          pg_catalog.btrim(v_fic.fiche ->> 'nom'),
          nullif(pg_catalog.btrim(coalesce(v_fic.fiche ->> 'description', '')), ''),
          nullif(pg_catalog.btrim(coalesce(v_fic.fiche ->> 'prix_affiche', '')), ''),
          v_badges,
          v_allergenes,
          v_fic.rang
        );
        v_n_fiches := v_n_fiches + 1;
      end loop;
    end loop;
  exception
    -- LES DEUX BRANCHES RELÈVENT. C'est ce qui garde l'atomicité : un
    -- `return` ici rendrait un succès sur une carte à moitié écrite, et le
    -- commerçant découvrirait le trou en relisant sa carte, pas à l'import.
    when check_violation then
      get stacked diagnostics v_contrainte = constraint_name;
      raise exception 'a line of the import was rejected by constraint %',
        coalesce(v_contrainte, 'unknown') using errcode = '23514';
    when unique_violation then
      raise exception 'two lines of the import collide on their name'
        using errcode = '23505';
  end;

  -- ── 10. LE JOURNAL — un geste, une ligne ───────────────────
  --
  -- UNE SEULE LIGNE POUR TOUT L'IMPORT, et pas une par fiche : le journal compte
  -- les GESTES (motif `set_vitrine_slug` et `upsert_vitrine_translation`), et
  -- cent vingt lignes d'audit pour un clic l'auraient rendu illisible exactement
  -- quand on en a besoin. Le CONTENU n'y est pas non plus — un journal n'est pas
  -- un stockage, et la carte se lit dans la carte.
  --
  -- ACTEUR `system`, comme `upsert_vitrine_translation` : cette RPC ne reçoit
  -- pas d'acteur, et un `p_actor` non vérifié en SQL aurait fait de la ligne
  -- d'audit une déclaration sur l'honneur — ce que `set_vitrine_slug` refuse
  -- explicitement en vérifiant l'appartenance avant de journaliser.
  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, 'system', 'vitrine.carte_imported',
          pg_catalog.jsonb_build_object(
            'carte_id', v_carte_id,
            'rubriques_creees', v_n_rubriques,
            'fiches_creees', v_n_fiches));

  return pg_catalog.jsonb_build_object(
    'carte_id', v_carte_id,
    'rubriques_creees', v_n_rubriques,
    'fiches_creees', v_n_fiches);
end;
$$;

comment on function public.import_vitrine_carte(uuid, jsonb) is
  'Crée EN UN SEUL GESTE une carte de vitrine, ses rubriques et ses fiches '
  '(VIT-2). TOUT OU RIEN : aucune branche n''avale d''erreur, donc une seule '
  'ligne invalide abandonne la transaction entière — le pgTAP compte les lignes '
  'APRÈS l''échec et exige zéro, parce qu''une garantie gratuite est celle qu''un '
  'futur `exception when others` fera disparaître sans bruit. Payload FERMÉ aux '
  'trois rangs — {nom, rubriques[{nom, fiches[{nom, description?, prix_affiche?, '
  'badges?, allergenes?}]}]} — une clé inconnue est REFUSÉE : acceptée en '
  'silence, « prix » au lieu de « prix_affiche » produirait une carte entière '
  'sans prix, le seul échec qui ressemble à un succès. Deux bornes de '
  'CARDINALITÉ, seules règles que ce fichier ajoute : 12 rubriques et 120 fiches '
  'au total — elles bornent le GESTE, pas la ligne. Les longueurs, le vocabulaire '
  'des badges et des allergènes restent aux `check` de 20261011120000 : les '
  'recopier ici aurait créé la paire qui diverge. AUCUN MESSAGE NE RELAIE DE '
  'TEXTE LIBRE DU PAYLOAD ; ce qui remonte est un NOM DE CONTRAINTE lu dans '
  '`get stacked diagnostics`, borné et écrit par nous, qui dit LAQUELLE des '
  'règles a mordu. Un nom de carte déjà pris rend 23505 SANS le nom. Une '
  'organisation inconnue rend le même 42501 indistinct que le reste du module. '
  'Rangs 0..n dans l''ordre du fichier pour les rubriques et les fiches ; la '
  'carte se pose APRÈS les cartes existantes. N''ÉCRIT AUCUNE TRADUCTION : une '
  'carte importée naît non traduite et la couverture publique baisse, ce qui est '
  'l''invariant de L11 et non un effet de bord — une machine ne publie pas '
  'd''anglais sur une carte que personne n''a relue. Ne contrôle PAS le droit '
  '`vitrine` (garde applicative, motif set_vitrine_slug). Rendue à service_role.';

revoke all on function public.import_vitrine_carte(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_vitrine_carte(uuid, jsonb)
  to service_role;
