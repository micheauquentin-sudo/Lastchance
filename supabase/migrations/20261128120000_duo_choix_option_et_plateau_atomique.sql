-- ============================================================
-- DUO-4 — UN PLATEAU ENTIÈREMENT SAISI DEVIENT JOUABLE
--
-- DUO-1 (20261126120000) a rendu l'origine d'une option libre : une place du
-- plateau est SOIT une fiche de la carte Vitrine, SOIT un libellé saisi. Elle
-- s'AFFICHE dans les deux cas — `duo_options_json` fait une jointure externe et
-- expose `option_id`. Elle ne se CHOISIT que dans un cas : `duo_choose` valide
-- le geste du joueur par `o.item_id = p_item_id`, et un `item_id` nul n'est
-- égal à rien. Un commerçant qui achète Duo Miroir sans la Vitrine compose donc
-- un plateau complet, voit la porte publique s'ouvrir (`duo_jouable` compte des
-- LIGNES), et ses joueurs se heurtent à un refus `unavailable` sur chaque
-- place. Le jeu se vend seul depuis 199922a0 ; il ne se joue pas seul.
--
-- Ce fichier fait deux choses, et la seconde n'est pas cosmétique :
--
--   1. LE CHOIX SE FAIT SUR `option_id`, la clé qui désigne une PLACE quelle
--      que soit son origine — celle que DUO-1 a mise dans le document en
--      annonçant qu'elle serait « la clé à donner à un futur duo_choose ».
--   2. LE PLATEAU S'ÉCRIT EN UNE TRANSACTION. `set_duo_options` ne sait poser
--      que des fiches, si bien qu'un plateau mixte s'écrit aujourd'hui PAR LA
--      TABLE, en `delete` puis `insert` (src/actions/duo.ts,
--      `ecrirePlateauParTable`) : deux allers-retours dont une panne au milieu
--      laisse le plateau VIDE.
--
-- ── CE QUI A ÉTÉ LU DANS LE CATALOGUE VIVANT AVANT D'ÉCRIRE ──
--
-- La signature vivante est `duo_choose(p_lobby_id uuid, p_token_hash text,
-- p_item_id uuid)` — l'ordre des paramètres n'est PAS celui que la demande
-- annonçait, et c'est le genre d'écart qui ferait échouer une délégation écrite
-- de mémoire. Les fonctions de ce dépôt sont réécrites par patchs successifs :
-- ce fichier s'appuie sur `pg_get_functiondef`, jamais sur les migrations qui
-- les ont créées.
--
-- ── POURQUOI UNE FONCTION NEUVE ET NON UNE SIGNATURE ÉLARGIE ──
--
-- Trois voies existaient, deux sont fermées par Postgres lui-même :
--
--   · AJOUTER UN PARAMÈTRE avec valeur par défaut — `duo_choose(uuid, text,
--     uuid, uuid default null)` — crée une SECONDE fonction, et tout appel à
--     trois arguments devient alors ambigu : « function is not unique ». Le
--     défaut ne serait découvert qu'à l'exécution, sur la porte du jeu.
--   · RENOMMER le troisième paramètre en place est refusé par `create or
--     replace` (« cannot change name of input parameter ») ; il faudrait
--     `drop` puis `create`, c'est-à-dire faire DISPARAÎTRE la fonction pendant
--     que l'application déployée l'appelle encore.
--   · RÉUTILISER `p_item_id` pour y faire passer un `option_id` — un seul
--     objet, aucune migration de signature — donnerait un paramètre dont le nom
--     ment sur ce qu'il porte, et une résolution `o.item_id = $3 or o.id = $3`
--     qui interroge deux colonnes différentes avec la même valeur.
--
-- On prend donc la quatrième : `duo_choose_option` porte l'IMPLÉMENTATION, et
-- `duo_choose` reste en place comme PORTE D'HIER — même nom, même signature,
-- même document rendu — en résolvant la fiche vers sa place puis en déléguant.
-- Un appelant qui passe encore `p_item_id` pendant la fenêtre de déploiement
-- obtient exactement ce qu'il obtenait hier ; il n'échoue ni bruyamment ni
-- silencieusement. La logique n'est écrite QU'UNE FOIS : deux copies auraient
-- divergé, et la divergence aurait porté sur le sceau.
--
-- ── LE RÉGIME DE DROITS, MESURÉ ET NON SUPPOSÉ ──
--
-- `duo_choices` est en régime TABLE PUR : `relacl` porte
-- `service_role=arwdDxtm` et AUCUNE colonne de la table n'a d'`attacl`. Une
-- colonne neuve y hérite donc de tout, et il n'y a RIEN à accorder — poser un
-- `grant (option_id)` ici laisserait croire à un régime par colonne qui n'est
-- pas celui de cette table, et ferait tomber le prochain lecteur dans le piège
-- inverse de celui de DUO-1.
--
-- `duo_options` est en régime MIXTE (SELECT et DELETE au niveau table, INSERT
-- et UPDATE colonne par colonne, cf. 20261126120000 §3), mais ce fichier ne lui
-- ajoute AUCUNE colonne : seulement une contrainte d'unicité, qui ne se
-- distribue pas. Rien à accorder là non plus.
--
-- Les DEUX FONCTIONS NEUVES, elles, ont bien besoin de leurs droits : le défaut
-- de Postgres est `execute` à PUBLIC, ce que le dépôt révoque partout. §4 et §7
-- révoquent puis accordent au seul `service_role`, et la garde de sortie le
-- vérifie.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 0. GARDES DE FILIATION
--
-- Trois fonctions sont réécrites plus bas par des `create or replace` qui
-- RECOPIENT leur corps. Recopier un corps qu'on n'a pas relu efface les
-- corrections posées entre-temps — c'est le motif de 20261126120000 §0, et il
-- vaut ici pour `duo_choose` et `duo_state`, dont l'histoire est faite de
-- patchs successifs (`item_id` devenu nullable, `is distinct from`, le calcul
-- de `salle_close`).
--
-- ON VÉRIFIE LES MARQUEURS À PRÉSERVER, JAMAIS L'ABSENCE DE CE QU'ON AJOUTE.
-- Une garde écrite à l'envers (« si `option_id` n'est pas là, lever ») ferait
-- échouer le premier `supabase db reset` venu, sur une base où la migration
-- n'a évidemment pas encore été appliquée. La seule mention du NEUF est le
-- test d'idempotence ci-dessous, qui SORT sans bruit au lieu de lever.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def text;
begin
  -- ── `duo_choose` : la forme qu'on remplace ──
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'duo_choose';

  if pg_catalog.strpos(v_def, 'duo_choose_option') > 0 then
    -- Déjà appliquée : on sort sans bruit (motif 20261026120000).
    return;
  end if;

  -- La VALIDATION qu'on remplace. Si elle n'est plus là, quelqu'un a déjà
  -- touché au chemin du choix et ce fichier écraserait son travail.
  if pg_catalog.strpos(v_def, 'o.item_id = p_item_id') = 0 then
    raise exception
      'public.duo_choose ne valide plus le choix par o.item_id = p_item_id : sa forme vivante a change depuis 20261018120000 et la recopier ici effacerait ce changement. Relire le catalogue avant de rejouer cette migration.';
  end if;

  -- LE VERROU. C'est lui qui rend le comptage des sceaux vrai ; `duo_choose`
  -- devenant une porte qui delegue, il doit rester dans la fonction qui compte.
  if pg_catalog.strpos(v_def, 'pg_advisory_xact_lock') = 0 then
    raise exception
      'public.duo_choose ne prend plus le verrou consultatif de la salle : la forme vivante n est pas celle sur laquelle duo_choose_option est transposee, et deux choix simultanes cesseraient de declencher la revelation.';
  end if;

  -- LE NOM GRAVÉ, et la garde du changement d'avis dans sa forme corrigée
  -- (`is distinct from`, et non `<>`, depuis que `item_id` est nullable).
  if pg_catalog.strpos(v_def, 'nom_fige') = 0
     or pg_catalog.strpos(v_def, 'is distinct from p_item_id') = 0 then
    raise exception
      'public.duo_choose ne grave plus le nom ou a perdu le « is distinct from » de la garde du changement d avis : la transposition ci-dessous partirait d une forme qui n existe plus.';
  end if;

  -- ── `duo_state` : l'expression de l'accord, qu'on GARDE en repli ──
  --
  -- §6 n'ajoute une branche QUE devant celle-ci ; l'expression elle-même est
  -- recopiee mot pour mot, et c'est ce qui rend la non-regression structurelle
  -- plutot que testee. Si elle a change, le repli qu'on ecrit n'est plus celui
  -- d'aujourd'hui.
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'duo_state';

  if pg_catalog.strpos(
       v_def, 'v_accord := v_mon_item is not distinct from v_autre_item') = 0 then
    raise exception
      'public.duo_state ne calcule plus l accord par « v_mon_item is not distinct from v_autre_item » : le repli que DUO-4 conserve pour les sceaux poses avant lui n est plus la forme vivante.';
  end if;

  if pg_catalog.strpos(v_def, 'v_salle_close := v_lobby.status in') = 0
     or pg_catalog.strpos(v_def, 'c.nom_fige') = 0 then
    raise exception
      'public.duo_state a perdu le calcul de salle_close ou la lecture de nom_fige : sa forme vivante n est pas celle que ce fichier recopie.';
  end if;

  -- ── `duo_options_json`, qu'on NE réécrit PAS ──
  --
  -- Ce fichier ne la touche pas, et s'appuie pourtant entierement sur elle :
  -- `option_id` est la cle que le joueur renverra, et elle ne peut la renvoyer
  -- que si le document la porte. Une affirmation qui decide d une inaction se
  -- verifie comme une autre (motif 20261126120000 §0 pour `duo_jouable`).
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'duo_options_json';

  if pg_catalog.strpos(v_def, '''option_id'', o.id') = 0 then
    raise exception
      'public.duo_options_json n expose plus option_id : le plateau rendu au joueur ne porterait pas la cle que duo_choose_option attend, et aucune option — saisie ou non — ne serait choisissable.';
  end if;

  if pg_catalog.strpos(v_def, 'left join public.vitrine_items') = 0 then
    raise exception
      'public.duo_options_json est repassee en jointure interne sur vitrine_items : les options saisies ont disparu du plateau, et rendre leur choix possible ne servirait a rien.';
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 1. `duo_options` DEVIENT UNE CIBLE DE CLÉ ÉTRANGÈRE COMPOSITE
--
-- Le sceau va porter la PLACE choisie, et une référence de ce schéma vers une
-- table portant `organization_id` se fait en COMPOSITE — patron
-- `(campaign_id, organization_id)`, tenu dynamiquement par
-- `fk_composites_couverture.test.sql`. Une FK composite exige une contrainte
-- unique sur exactement ces colonnes côté cible : c'est le rôle que
-- `duo_rounds_id_org_unique` joue déjà pour `duo_choices.round_id`, et qu'on
-- transpose ici mot pour mot.
--
-- `id` est déjà la clé primaire ; cette unicité-ci ne restreint donc RIEN de
-- neuf sur les données. Elle n'existe que pour donner à la FK une cible qui
-- embarque le locataire — c'est-à-dire pour rendre IMPOSSIBLE, en base, un
-- sceau qui désignerait la place d'une AUTRE organisation.
--
-- Le `if not exists` est écrit en DO plutôt qu'en `drop … if exists` puis
-- `add` : la FK de §2 dépend de cette contrainte, et un `drop` échouerait au
-- second passage au lieu de ne rien faire.
-- ────────────────────────────────────────────────────────────

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'duo_options_id_org_unique'
       and conrelid = 'public.duo_options'::regclass
  ) then
    alter table public.duo_options
      add constraint duo_options_id_org_unique unique (id, organization_id);
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 2. LE SCEAU PORTE LA PLACE
--
-- `duo_choices` ne savait désigner qu'une FICHE. Un choix d'option saisie n'a
-- rien à y écrire : `item_id` reste nul et `nom_fige` seul survivrait, ce qui
-- rendrait deux saisies distinctes INDISCERNABLES l'une de l'autre (deux nuls)
-- au moment de trancher l'accord. `option_id` est la colonne qui manquait.
--
-- ── `ON DELETE SET NULL`, ET POURQUOI L'ORDRE DE §6 EN DÉPEND ──
--
-- Même règle que `duo_choices.item_id` : le sceau SURVIT à la disparition de ce
-- qu'il désignait, parce qu'il porte ce que le joueur a FAIT et non ce qu'il en
-- reste (`nom_fige` reste affichable). Le commerçant qui recompose son plateau
-- `delete`-ant toutes ses places met donc à nul les `option_id` des manches en
-- cours — et c'est précisément ce qui rend l'ordre des branches de §6 sûr :
-- une manche à fiches traversée par un remplacement de plateau retombe
-- mécaniquement sur le repli `item_id`, c'est-à-dire sur le verdict d'hier.
--
-- L'index de tête est posé dans la foulée. Postgres n'en crée aucun pour une
-- clé étrangère, et celle-ci est parcourue par le `set null` de la cascade à
-- chaque remplacement de plateau.
-- ────────────────────────────────────────────────────────────

alter table public.duo_choices
  add column if not exists option_id uuid;

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'duo_choices_option_id_organization_id_fkey'
       and conrelid = 'public.duo_choices'::regclass
  ) then
    alter table public.duo_choices
      add constraint duo_choices_option_id_organization_id_fkey
      foreign key (option_id, organization_id)
      references public.duo_options (id, organization_id)
      on delete set null (option_id);
  end if;
end
$migration$;

create index if not exists duo_choices_option_idx
  on public.duo_choices (option_id, organization_id);


-- ────────────────────────────────────────────────────────────
-- 3. LES DROITS DE LA COLONNE NEUVE — CE QU'ON N'ACCORDE PAS
--
-- RIEN N'EST ACCORDÉ SUR `duo_choices.option_id`, et c'est une décision, pas un
-- oubli. La table est en régime TABLE PUR (`relacl` = service_role=arwdDxtm,
-- aucune colonne porteuse d'`attacl`) : la colonne neuve hérite de tout. Un
-- `grant (option_id)` redondant par-dessus un grant de table ne protège de rien
-- et laisse croire à un régime par colonne — le contresens exactement inverse
-- de celui qui a coûté cinq lots cette semaine sur les tables qui, elles, sont
-- en régime mixte.
--
-- Le régime CONSTATÉ est vérifié ci-dessous plutôt qu'affirmé : si quelqu'un
-- fait un jour basculer `duo_choices` en grants de colonnes, cette assertion
-- rougit à l'application et nomme la conséquence.
-- ────────────────────────────────────────────────────────────

do $migration$
begin
  if exists (
    select 1
      from pg_catalog.pg_attribute a
     where a.attrelid = 'public.duo_choices'::regclass
       and a.attnum > 0
       and not a.attisdropped
       and a.attacl is not null
  ) then
    raise exception
      'public.duo_choices est passee en grants de COLONNES : option_id n heriterait alors d aucun droit, duo_choose_option ne pourrait plus l ecrire, et aucun choix ne se scellerait. Accorder nommement insert et select sur option_id a service_role.';
  end if;

  if not pg_catalog.has_column_privilege(
           'service_role', 'public.duo_choices', 'option_id', 'INSERT') then
    raise exception
      'public.duo_choices.option_id n est pas insérable par service_role : duo_choose_option ne pourrait sceller aucun choix.';
  end if;

  if not pg_catalog.has_column_privilege(
           'service_role', 'public.duo_choices', 'option_id', 'SELECT') then
    raise exception
      'public.duo_choices.option_id n est pas lisible par service_role : duo_state ne pourrait plus trancher l accord de deux options saisies.';
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 4. `duo_choose_option` — LE CHOIX SE FAIT SUR LA PLACE
--
-- Transposition de `duo_choose` telle que le catalogue la porte aujourd'hui.
-- L'ORDRE DES GARDES EST INCHANGÉ, et il n'est pas décoratif : rôle, forme de
-- la clé, existence de la salle, VERROU, salle vivante et verrouillée,
-- appartenance, manche ouverte, puis seulement le plateau. Chaque refus rend le
-- même document `unavailable`, indistinct des autres.
--
-- ── LA SEULE LIGNE QUI CHANGE VRAIMENT ──
--
-- La validation du plateau passe de `o.item_id = p_item_id` à `o.id =
-- p_option_id`, et la jointure vers `vitrine_items` devient EXTERNE — la même
-- que `duo_options_json`, pour la même raison : une option saisie n'a pas de
-- fiche, et une jointure interne la ferait disparaître du plateau qu'on est en
-- train de valider. Le nom gravé sort du même `coalesce(i.nom, o.libelle)` que
-- le document rendu au joueur : ce qu'il a vu est ce qui est gravé.
--
-- LA LECTURE RESTE UNIQUE, et c'est toujours le point : nom ET fiche sortent de
-- l'instruction qui vient de déclarer la place jouable, sous le même verrou.
-- Deux lectures rouvriraient l'intervalle que 20261018120000 avait fermé.
--
-- ── L'ISOLATION EST DANS LE `where`, PAS DANS UNE GARDE À PART ──
--
-- `o.organization_id = v_lobby.organization_id` : une `option_id` d'un AUTRE
-- salon ne joint rien et emprunte le `return` commun. Les quatre cas — place
-- inexistante, place d'un autre commerce, place retirée du plateau, identifiant
-- malformé — sortent par le même chemin, indistincts par STRUCTURE et non par
-- convention. Rien ne divulgue qu'une place existe ailleurs.
--
-- ── LA GARDE DU CHANGEMENT D'AVIS, ET LES SCEAUX D'AVANT DUO-4 ──
--
-- « Est-ce le MÊME geste » se lisait sur `item_id`. Il se lit maintenant sur
-- `option_id` — mais un sceau posé AVANT ce fichier n'en porte pas, et le
-- comparer à nu ferait basculer en `scelle` un joueur qui rejoue simplement son
-- clic. On lit donc la place quand elle est là, et la fiche à défaut. Les deux
-- nuls (sceau ancien sur une fiche depuis supprimée) rendent `false` : on ne
-- peut pas identifier ce qui a été scellé, et le refus prudent est le bon — le
-- joueur A scellé, rien ne doit être réécrit.
-- ────────────────────────────────────────────────────────────

create or replace function public.duo_choose_option(
  p_lobby_id uuid,
  p_token_hash text,
  p_option_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
  v_round public.duo_rounds%rowtype;
  v_choix public.duo_choices%rowtype;
  -- LE NOM À GRAVER et LA FICHE DE LA PLACE. Ils sortent de la MÊME lecture que
  -- la validation du plateau : chercher l'un ou l'autre séparément rouvrirait
  -- un intervalle entre « cette place est jouable » et « voici ce qu'elle est ».
  v_nom text;
  v_item_id uuid;
  v_meme_place boolean;
  v_membres integer;
  v_scelles integer;
  v_revelee boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_lobby_id is null or p_option_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select l.organization_id into v_org
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE MÊME VERROU QUE `duo_start` ET QUE L16 : c'est lui qui rend le comptage
  -- des sceaux vrai. Sans lui, deux choix simultanés liraient tous les deux
  -- « un seul scellé » et AUCUN ne déclencherait la révélation — la partie
  -- resterait ouverte pour toujours avec ses deux choix écrits.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || p_lobby_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  -- ON NE CHOISIT QUE DANS UNE SALLE VERROUILLÉE ET VIVANTE, contrairement à
  -- `duo_state` qui doit survivre à la fermeture. Une salle déjà `closed` — donc
  -- une manche déjà révélée — emprunte ce refus-ci, et c'est le premier des deux
  -- filets qui protègent le sceau.
  if not found
     or v_lobby.kind <> 'duo'
     or v_lobby.status <> 'locked'
     or v_lobby.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if not exists (
    select 1 from public.player_lobby_members m
     where m.lobby_id = v_lobby.id
       and m.token_hash = p_token_hash
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select r.* into v_round
    from public.duo_rounds r
   where r.lobby_id = v_lobby.id;
  -- Le SECOND filet : une manche absente ou déjà révélée refuse le choix. Le
  -- premier (salle `closed`) l'aura presque toujours devancé, mais une garde ne
  -- se déduit pas d'une autre.
  if not found or v_round.status <> 'ouverte' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LA PLACE DOIT ÊTRE SUR LE PLATEAU, ET C'EST ICI QUE SON NOM SE GRAVE.
  --
  -- Jointure EXTERNE, comme `duo_options_json` : une option saisie n'a pas de
  -- fiche. `coalesce(i.nom, o.libelle)` est LA MÊME EXPRESSION que celle du
  -- document rendu au joueur — ce qu'il a lu sur le plateau est mot pour mot ce
  -- qui se grave dans son sceau.
  select coalesce(i.nom, o.libelle), o.item_id
    into v_nom, v_item_id
    from public.duo_options o
    left join public.vitrine_items i
      on i.id = o.item_id
     and i.organization_id = o.organization_id
   where o.organization_id = v_lobby.organization_id
     and o.id = p_option_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE SCEAU. Lecture unique, sous le verrou.
  select c.* into v_choix
    from public.duo_choices c
   where c.round_id = v_round.id
     and c.member_token_hash = p_token_hash;

  if found then
    -- EST-CE LE MÊME GESTE ? La PLACE tranche quand elle est là ; la FICHE
    -- tranche pour les sceaux posés avant DUO-4, qui ne portent pas de place.
    -- Deux nuls rendent `false` : ce qui a été scellé n'est plus identifiable,
    -- et on ne réécrit rien sur un doute.
    v_meme_place := case
      when v_choix.option_id is not null
        then v_choix.option_id = p_option_id
      when v_choix.item_id is not null
        then v_choix.item_id is not distinct from v_item_id
      else false
    end;

    -- UNE AUTRE PLACE APRÈS AVOIR SCELLÉ : refus, et RIEN n'est écrit. C'est ce
    -- qui empêche d'attendre `autre_a_choisi` pour changer d'avis.
    --
    -- CE CHEMIN EST MARCHÉ PAR UNE ASSERTION, et il faut qu'il le reste :
    -- `GRAVE-9a` (duo_miroir.test.sql) rejoue ce cas sur la salle P3, dont la
    -- manche doit demeurer OUVERTE pour cela — une salle révélée sortirait en
    -- `unavailable` deux gardes plus haut et laisserait ce `if` non couvert.
    if not v_meme_place then
      return pg_catalog.jsonb_build_object('state', 'scelle');
    end if;
    -- LA MÊME PLACE : idempotent, et l'on RETOMBE DANS LE COMPTAGE ci-dessous
    -- plutôt que de rendre tout de suite. Un `return` ici serait un
    -- court-circuit : le jour où la révélation deviendrait due entre deux
    -- appels du même joueur, elle serait sautée par celui-là même qui aurait dû
    -- la déclencher. Rejouer ne saute jamais une révélation.
  else
    insert into public.duo_choices
      (round_id, organization_id, member_token_hash, item_id, option_id,
       nom_fige)
    values (v_round.id, v_lobby.organization_id, p_token_hash, v_item_id,
            p_option_id, v_nom);
  end if;

  -- ── LA RÉVÉLATION ────────────────────────────────────────
  --
  -- « Tout le monde a scellé » se lit en comparant DEUX COMPTES : les membres de
  -- la salle et les choix de la manche. Le second ne peut pas dépasser le
  -- premier — `duo_choose_option` exige l'appartenance et `unique (round_id,
  -- member_token_hash)` interdit le doublon — donc l'égalité veut bien dire
  -- « tous ». Le `v_membres >= 2` est la ceinture : `lock_player_lobby` refuse
  -- déjà de verrouiller à un seul, mais une révélation à un joueur serait un
  -- miroir sans reflet.
  select pg_catalog.count(*)::integer into v_membres
    from public.player_lobby_members m
   where m.lobby_id = v_lobby.id;

  select pg_catalog.count(*)::integer into v_scelles
    from public.duo_choices c
   where c.round_id = v_round.id;

  if v_membres >= 2 and v_scelles >= v_membres then
    update public.duo_rounds r
       set status = 'revelee',
           revealed_at = pg_catalog.clock_timestamp()
     where r.id = v_round.id
       and r.status = 'ouverte';

    -- LA SALLE A FINI SON OFFICE (arbitrage 6). `least` NON qualifié : ce n'est
    -- pas une fonction du catalogue, la qualifier casserait à l'exécution
    -- (garde `npm run sql:check`).
    update public.player_lobbies l
       set status = 'closed',
           expires_at = least(pg_catalog.clock_timestamp(), l.expires_at)
     where l.id = v_lobby.id;

    v_revelee := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'scelle', true,
    'revelee', v_revelee
  );
end;
$$;

revoke all on function public.duo_choose_option(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.duo_choose_option(uuid, text, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 5. `duo_choose` — LA PORTE D'HIER, QUI DÉLÈGUE
--
-- Même nom, même signature, même document rendu. Elle existe pour la FENÊTRE DE
-- DÉPLOIEMENT : la migration passe avant le code, et l'application déployée
-- appelle encore `duo_choose(p_item_id: …)`. La supprimer lui rendrait un 404
-- PostgREST sur la porte du jeu ; la laisser telle quelle aurait figé deux
-- implémentations du sceau, qui auraient divergé.
--
-- ── CE QU'ELLE FAIT, ET DANS QUEL ORDRE ──
--
-- Le rôle et la forme de la clé sont vérifiés ICI, avant toute lecture : c'est
-- l'invariant « une clé malformée ne touche jamais le plateau », et le rendre
-- au délégué l'aurait déplacé d'un cran. Le reste — salle, appartenance,
-- manche, verrou — appartient à `duo_choose_option` et n'est PAS dupliqué.
--
-- ── LA RÉSOLUTION FICHE → PLACE ──
--
-- Une seule instruction, bornée à l'organisation de la SALLE : une fiche d'un
-- autre commerce ne joint rien. Si elle ne résout pas, on transmet un `null`
-- plutôt que de rendre tout de suite — le refus sort ainsi du MÊME `return` que
-- tous les autres, au lieu d'un chemin plus court qui se distinguerait au
-- chronomètre.
--
-- ── L'INTERVALLE OUVERT PAR LA DÉLÉGATION, ET POURQUOI IL EST SANS EFFET ──
--
-- Cette résolution a lieu HORS du verrou, que seul le délégué prend. Si le
-- plateau est remplacé entre les deux, la place résolue a disparu et
-- `duo_choose_option` rend `unavailable` — ce que l'ancienne forme rendait
-- déjà, puisque la fiche n'était alors plus sur le plateau. L'intervalle ne
-- crée donc aucun résultat qui n'existait pas ; il ne fait qu'y mener par un
-- autre chemin.
-- ────────────────────────────────────────────────────────────

create or replace function public.duo_choose(
  p_lobby_id uuid,
  p_token_hash text,
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_option_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  -- LA FICHE VERS SA PLACE, dans l'organisation de la salle et nulle part
  -- ailleurs. `p_lobby_id` ou `p_item_id` nul ne joint rien : `v_option_id`
  -- reste nul et le délégué rend `unavailable`, comme l'ancienne forme.
  select o.id into v_option_id
    from public.duo_options o
    join public.player_lobbies l
      on l.organization_id = o.organization_id
   where l.id = p_lobby_id
     and o.item_id = p_item_id;

  return public.duo_choose_option(p_lobby_id, p_token_hash, v_option_id);
end;
$$;


-- ────────────────────────────────────────────────────────────
-- 6. `duo_state` — L'ACCORD SAIT TRANCHER DEUX SAISIES
--
-- Le corps est RECOPIÉ de la forme vivante, gardes de filiation à l'appui
-- (§0). Deux choses seulement changent, et la seconde découle de la première.
--
--   1. LES DEUX LECTURES DE SCEAU RAPPORTENT AUSSI `option_id`. Elles restent
--      UNIQUES et portent toujours sur `duo_choices` seule — la jointure vers
--      `vitrine_items` avait été retirée parce qu'elle faisait retomber
--      `mon_choix` à `null` quand la fiche avait quitté la carte, et rien ici
--      ne la rappelle. Le document gagne la clé `option_id`, qui manquait à
--      l'écran pour surligner la place scellée quand elle n'a pas de fiche.
--
--   2. L'ACCORD SE TRANCHE D'ABORD SUR LA PLACE, ET À DÉFAUT SUR LA FICHE.
--      L'expression d'hier est conservée MOT POUR MOT en repli.
--
-- ── POURQUOI CET ORDRE NE CHANGE RIEN AUX PARTIES À FICHES ──
--
-- Ce n'est pas une espérance, c'est une conséquence de
-- `duo_options_org_item_unique (organization_id, item_id)` : dans une même
-- organisation, une fiche occupe AU PLUS UNE place. Deux joueurs choisissant
-- sur le MÊME plateau ont donc « même place ⟺ même fiche », et la branche neuve
-- rend exactement ce que rendait l'ancienne.
--
-- Reste le cas où le plateau a été REMPLACÉ pendant la manche : les places
-- d'hier sont supprimées, et le `on delete set null` de §2 vide les `option_id`
-- des sceaux. La branche neuve ne s'applique alors plus et le repli — celui
-- d'hier — reprend la main sur `item_id`, qui pointe vers `vitrine_items` et
-- survit au remplacement. C'est ce `set null` qui rend l'ordre sûr, pas une
-- convention.
--
-- Le cas VRAIMENT neuf est celui-ci : deux options SAISIES portent chacune un
-- `item_id` nul, et l'expression d'hier n'en tirait rien — sa garde `or` coupait
-- et `accord` restait `null`, c'est-à-dire « on ne peut pas trancher », sur un
-- plateau où il n'y avait pourtant rien d'ambigu. Deux places distinctes sont
-- deux réponses distinctes ; la même place est un accord. C'est cela que DUO-4
-- rend décidable, et c'est la moitié de « le jeu est jouable ».
-- ────────────────────────────────────────────────────────────

create or replace function public.duo_state(
  p_lobby_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lobby public.player_lobbies%rowtype;
  v_round public.duo_rounds%rowtype;
  v_mon_item uuid;
  v_mon_option uuid;
  v_mon_choix jsonb := null;
  v_autre_choix jsonb := null;
  v_suggestion jsonb := null;
  v_accord boolean := null;
  v_autre_a_choisi boolean;
  v_autre_item uuid;
  v_autre_option uuid;
  -- LE SEUL FAIT SUR LA SALLE PORTEUSE. Sans initialisation, contrairement aux
  -- trois valeurs réservées : celles-là gardent un `null` qui SIGNIFIE « pas
  -- encore », celle-ci est calculée sur tout chemin qui rend un document `ok`.
  v_salle_close boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found or v_lobby.kind <> 'duo' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- L'APPARTENANCE EST LA SEULE GARDE, ET ELLE SUFFIT. Le refus est INDISTINCT
  -- de celui d'un lobby inconnu : sans cela, un identifiant de salle volé
  -- suffirait à lire une partie où l'on n'a pas été invité.
  if not exists (
    select 1 from public.player_lobby_members m
     where m.lobby_id = v_lobby.id
       and m.token_hash = p_token_hash
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LA SALLE A-T-ELLE CESSÉ D'ACCUEILLIR. Un booléen, calculé sur la MÊME ligne
  -- `v_lobby` que tout le reste, et jamais transformé en refus (voir l'en-tête).
  --
  -- LES DEUX MOITIÉS SONT NÉCESSAIRES. `status` seul raterait la salle
  -- simplement DÉPASSÉE : l'expiration se CONSTATE et ne s'écrit pas (ADR-111),
  -- donc la colonne y porte encore `locked`. `expires_at` seul raterait la salle
  -- fermée par le commerçant, dont la date de mort est ramenée à l'instant mais
  -- reste, pendant cet instant, strictement postérieure à `now()` — `least(
  -- clock_timestamp(), …)` avance sur le temps de la transaction.
  v_salle_close := v_lobby.status in ('closed', 'expired')
                   or v_lobby.expires_at <= pg_catalog.now();

  select r.* into v_round
    from public.duo_rounds r
   where r.lobby_id = v_lobby.id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- MON choix : toujours lisible, c'est le mien. UNE SEULE LECTURE, sur
  -- `duo_choices` et rien d'autre — le nom sort de `nom_fige`, gravé au moment
  -- du geste. La jointure sur `vitrine_items` a disparu, et c'est elle qui
  -- faisait retomber `mon_choix` à `null` quand la fiche avait quitté la carte.
  --
  -- `option_id` VOYAGE AVEC (DUO-4) : c'est la seule clé qui désigne la place
  -- scellée quand celle-ci est un libellé saisi, et l'écran en a besoin pour la
  -- surligner. Elle est nulle pour un sceau d'avant DUO-4, comme `item_id` l'est
  -- pour une fiche supprimée : le document porte ce qui reste, jamais un refus.
  select c.item_id, c.option_id,
         pg_catalog.jsonb_build_object(
           'item_id', c.item_id, 'option_id', c.option_id, 'nom', c.nom_fige)
    into v_mon_item, v_mon_option, v_mon_choix
    from public.duo_choices c
   where c.round_id = v_round.id
     and c.member_token_hash = p_token_hash;

  -- L'AUTRE A-T-IL SCELLÉ : un BOOLÉEN, et rien de plus. `exists` et non
  -- `count` — un compte serait déjà une information de trop le jour où la
  -- salle en compterait plus de deux.
  v_autre_a_choisi := exists (
    select 1 from public.duo_choices c
     where c.round_id = v_round.id
       and c.member_token_hash <> p_token_hash
  );

  -- ── LA BRANCHE RÉVÉLÉE, ET ELLE SEULE ──────────────────────
  --
  -- Tout ce qui suit n'est LU que si la manche est révélée. Hors de ce `if`,
  -- `v_autre_choix`, `v_suggestion` et `v_accord` gardent leur `null` initial :
  -- ce ne sont pas des valeurs écartées à l'écriture du document, ce sont des
  -- valeurs qui n'ont jamais été cherchées.
  if v_round.status = 'revelee' then
    -- Même lecture unique que pour le mien : le nom gravé, jamais la carte.
    select c.item_id, c.option_id,
           pg_catalog.jsonb_build_object(
             'item_id', c.item_id, 'option_id', c.option_id, 'nom', c.nom_fige)
      into v_autre_item, v_autre_option, v_autre_choix
      from public.duo_choices c
     where c.round_id = v_round.id
       and c.member_token_hash <> p_token_hash;

    -- L'ACCORD SE CALCULE, IL NE SE STOCKE PAS (voir §4 du cahier). Booléen,
    -- sans note et sans récompense : « vous avez pensé à la même chose », et le
    -- cahier interdit tout ce qu'on pourrait vouloir en faire ensuite.
    --
    -- ── LA PLACE D'ABORD (DUO-4) ──
    --
    -- L'accord porte sur l'IDENTITÉ de ce qui a été désigné, jamais sur son nom :
    -- deux options distinctes peuvent s'appeler pareil, et la MÊME fiche peut
    -- avoir été renommée entre les deux sceaux — donc `nom_fige` ne peut trancher
    -- ni dans un sens ni dans l'autre.
    --
    -- La PLACE (`option_id`) est cette identité, et elle vaut pour les deux
    -- origines. Elle tranche dès que les deux sceaux la portent — ce qui est le
    -- cas de toute manche jouée après DUO-4 sur un plateau intact. Pour une
    -- manche à fiches, elle rend le MÊME verdict que la fiche, et ce n'est pas
    -- une espérance : `duo_options_org_item_unique` garantit qu'une fiche occupe
    -- au plus une place par organisation.
    --
    -- ── LA FICHE EN REPLI, MOT POUR MOT L'EXPRESSION D'AVANT DUO-4 ──
    --
    -- Elle reprend la main dans les deux cas où la place manque : un sceau posé
    -- AVANT ce fichier, et un plateau REMPLACÉ pendant la manche (le `on delete
    -- set null` de §2 vide alors les `option_id`, tandis qu'`item_id` survit).
    --
    --   · les DEUX identités connues → `=` tranche, comme toujours ;
    --   · UNE SEULE connue → l'autre fiche a été SUPPRIMÉE, donc ce n'est pas
    --     celle qui survit : `is not distinct from` rend faux, et c'est VRAI ;
    --   · AUCUNE des deux → deux fiches effacées peuvent avoir été la même ou
    --     non ; la garde `or` coupe et `accord` garde son `null` initial ;
    --   · un seul joueur a scellé → `v_autre_choix` est `null`, la garde coupe.
    --
    -- LE TROISIÈME CAS EST LE PRIX ASSUMÉ DU REMÈDE, et il est le bon prix :
    -- `null` dit « on ne peut plus le trancher », là où `false` DÉMENTIRAIT un
    -- accord qui a peut-être eu lieu. Les deux noms gravés restent affichés côte
    -- à côte — le joueur voit deux fois le même intitulé et conclut lui-même.
    if v_mon_choix is not null and v_autre_choix is not null then
      if v_mon_option is not null and v_autre_option is not null then
        v_accord := v_mon_option = v_autre_option;
      elsif v_mon_item is not null or v_autre_item is not null then
        v_accord := v_mon_item is not distinct from v_autre_item;
      end if;
    end if;

    -- LA PROPOSITION DE LA MAISON, après les deux autres et jamais avant :
    -- l'afficher pendant le choix aurait surligné une réponse sur le plateau.
    select pg_catalog.jsonb_build_object(
             'item_id', i.id,
             'nom', i.nom,
             'description', i.description,
             'prix_affiche', i.prix_affiche)
      into v_suggestion
      from public.duo_settings s
      join public.vitrine_items i
        on i.id = s.suggestion_item_id
       and i.organization_id = s.organization_id
     where s.organization_id = v_lobby.organization_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'status', v_round.status,
    'mon_choix', v_mon_choix,
    'options', public.duo_options_json(v_lobby.organization_id),
    'autre_a_choisi', v_autre_a_choisi,
    'autre_choix', v_autre_choix,
    'suggestion', v_suggestion,
    'accord', v_accord,
    'salle_close', v_salle_close
  );
end;
$$;


-- ────────────────────────────────────────────────────────────
-- 7. `set_duo_plateau` — LE PLATEAU ENTIER, EN UNE TRANSACTION
--
-- `set_duo_options` ne connaît que des tableaux de FICHES. Un plateau qui porte
-- au moins un libellé s'écrit donc aujourd'hui par la table, en `delete` puis
-- `insert` depuis la session (`ecrirePlateauParTable`, src/actions/duo.ts) :
-- DEUX allers-retours, et une panne entre les deux laisse le plateau VIDE.
--
-- Ce n'est pas une corruption — un plateau vide ferme la porte publique
-- (`duo_jouable` est alors faux) et ne fait jamais jouer sur une liste à moitié
-- écrite — et le message d'erreur nomme le geste à refaire. Mais c'est une
-- écriture NON ATOMIQUE sur un réglage que le commerçant croit enregistré, et
-- rien ne l'oblige à l'être : les deux instructions tiennent dans une fonction.
--
-- ── LA FORME DE L'ENTRÉE, ET POURQUOI DU `jsonb` ──
--
-- `set_duo_options` prend un `uuid[]` parce qu'une place n'était qu'une fiche.
-- Une place a désormais DEUX formes possibles, et un tableau parallèle
-- (`uuid[]` + `text[]`) aurait fait porter l'appariement à l'appelant : deux
-- tableaux de longueurs différentes, ou décalés d'un cran, produiraient un
-- plateau silencieusement faux. Un tableau d'OBJETS garde chaque place entière :
--
--     [{"item_id": "…"}, {"libelle": "Tiramisu"}, …]
--
-- L'ORDRE DU TABLEAU EST L'ORDRE DU PLATEAU (`with ordinality`), exactement
-- comme dans `set_duo_options`.
--
-- ── CE QU'ON VALIDE ICI, ET CE QU'ON LAISSE À LA TABLE ──
--
-- On valide ce qui produit un refus LISIBLE et actionnable : le cardinal,
-- l'exclusivité des origines, la forme des identifiants, les doublons, et
-- l'existence des fiches. Ces cinq-là remonteraient sinon en violation brute
-- (23503, 23505, 22P02) dont le message n'apprend rien au commerçant.
--
-- On NE revalide PAS la forme du libellé. `duo_options_libelle_valide` la tient
-- déjà en six clauses (20261126120000 §2), un `check` abandonne la transaction
-- ENTIÈRE — donc l'atomicité qu'on vient d'acheter est intacte — et recopier ce
-- prédicat ici en ferait une seconde source de vérité, qui dériverait. La
-- contrainte reste l'autorité ; l'appelant envoie du texte déjà rogné.
-- ────────────────────────────────────────────────────────────

create or replace function public.set_duo_plateau(
  p_organization_id uuid,
  p_places jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
  v_fiches integer;
  v_libelles integer;
  v_distincts integer;
  v_connus integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  -- L'ACTEUR D'ABORD, LA SÉLECTION ENSUITE (motif `set_duo_options`, lui-même
  -- repris de `close_player_lobby_as_org`) : un non-habilité ne doit rien
  -- apprendre du catalogue qu'il désigne, pas même par la forme du chemin
  -- parcouru.
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

  -- LA FORME DU DOCUMENT AVANT SON CONTENU. Un `jsonb` qui n'est pas un tableau
  -- ferait échouer `jsonb_array_length` sur un message du moteur ; on le nomme.
  if p_places is null or pg_catalog.jsonb_typeof(p_places) <> 'array' then
    raise exception 'invalid duo options payload' using errcode = '22023';
  end if;

  v_n := pg_catalog.jsonb_array_length(p_places);
  if v_n < 2 or v_n > 6 then
    raise exception 'invalid duo options count' using errcode = '22023';
  end if;

  -- EXACTEMENT UNE ORIGINE PAR PLACE — la transposition littérale de
  -- `duo_options_origine_exclusive`, dite ici pour pouvoir la NOMMER.
  --
  -- `->>` ET NON `->` : une clé absente et une clé présente à `null` doivent
  -- compter pareil. `->` rendrait le `null` JSON, qui n'est pas SQL NULL et que
  -- `num_nonnulls` compterait comme une valeur — une place `{"item_id": null,
  -- "libelle": "x"}` serait alors refusée comme portant deux origines.
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_places) as e(value)
     where pg_catalog.jsonb_typeof(e.value) <> 'object'
        or pg_catalog.num_nonnulls(e.value ->> 'item_id',
                                   e.value ->> 'libelle') <> 1
  ) then
    raise exception 'invalid duo option origin' using errcode = '22023';
  end if;

  -- LA FORME DE L'IDENTIFIANT, avant le cast. Sans cette garde, une chaîne
  -- quelconque sortirait en 22P02 « invalid input syntax for type uuid », qui
  -- désigne le moteur et non le geste.
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_places) as e(value)
     where (e.value ->> 'item_id') is not null
       and (e.value ->> 'item_id')
             !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'invalid duo option item' using errcode = '22023';
  end if;

  select pg_catalog.count(*) filter (where (e.value ->> 'item_id') is not null),
         pg_catalog.count(*) filter (where (e.value ->> 'libelle') is not null)
    into v_fiches, v_libelles
    from pg_catalog.jsonb_array_elements(p_places) as e(value);

  -- UNE FICHE, UNE FOIS — `duo_options_org_item_unique` le tient déjà, mais en
  -- 23505 : on le dit avant, comme `set_duo_options`.
  select pg_catalog.count(*)::integer into v_distincts
    from (select distinct e.value ->> 'item_id' as x
            from pg_catalog.jsonb_array_elements(p_places) as e(value)
           where (e.value ->> 'item_id') is not null) s;
  if v_distincts <> v_fiches then
    raise exception 'duplicate duo option item' using errcode = '22023';
  end if;

  -- UN LIBELLÉ, UNE FOIS — même geste pour l'autre origine
  -- (`duo_options_org_libelle_unique`, index partiel de 20261126120000 §2).
  -- Comparaison EXACTE, casse comprise, comme l'index : normaliser la casse
  -- serait une politique de rapprochement de textes que ce dépôt ne tient pas.
  select pg_catalog.count(*)::integer into v_distincts
    from (select distinct e.value ->> 'libelle' as x
            from pg_catalog.jsonb_array_elements(p_places) as e(value)
           where (e.value ->> 'libelle') is not null) s;
  if v_distincts <> v_libelles then
    raise exception 'duplicate duo option libelle' using errcode = '22023';
  end if;

  -- TOUTES LES FICHES EXISTENT ET SONT DE CE COMMERCE — une seule question,
  -- donc un seul refus, et le MÊME message que `set_duo_options`. Une fiche du
  -- voisin ne joint pas et tombe dans ce compte : elle est refusée sans que
  -- rien ne dise qu'elle existe ailleurs.
  select pg_catalog.count(*)::integer into v_connus
    from public.vitrine_items i
   where i.organization_id = p_organization_id
     and i.id in (
       select (e.value ->> 'item_id')::uuid
         from pg_catalog.jsonb_array_elements(p_places) as e(value)
        where (e.value ->> 'item_id') is not null
     );
  if v_connus <> v_fiches then
    raise exception 'unknown duo option item' using errcode = '22023';
  end if;

  -- REMPLACEMENT INTÉGRAL, dans la transaction de l'appelant — ET C'EST TOUT
  -- L'OBJET DE CETTE FONCTION. Les deux instructions ne peuvent plus être
  -- séparées par une panne réseau : ou le plateau neuf est là, ou l'ancien est
  -- intact. Le `delete` précède l'`insert`, parce que
  -- `duo_options_org_ordre_unique` est vérifiée PAR INSTRUCTION — insérer
  -- d'abord ferait entrer en collision la place 1 ancienne et la place 1 neuve.
  delete from public.duo_options o
   where o.organization_id = p_organization_id;

  insert into public.duo_options (organization_id, item_id, libelle, ordre)
  select p_organization_id,
         (e.value ->> 'item_id')::uuid,
         e.value ->> 'libelle',
         e.ordinality::integer
    from pg_catalog.jsonb_array_elements(p_places)
           with ordinality as e(value, ordinality);

  -- LE JOURNAL PORTE LE GESTE, sous le MÊME nom d'action que `set_duo_options`
  -- (`duo.options_set`) et avec la MÊME forme de métadonnée : c'est le même
  -- geste commerçant — « j'ai changé mon plateau » — et lui donner deux noms
  -- selon la RPC empruntée couperait en deux un historique qui se lit par
  -- organisation.
  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor::text, 'duo.options_set',
          pg_catalog.jsonb_build_object('options', v_n));

  return pg_catalog.jsonb_build_object('state', 'ok', 'options', v_n);
end;
$$;

revoke all on function public.set_duo_plateau(uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.set_duo_plateau(uuid, jsonb, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 8. CE QUE LE SCHÉMA RACONTE DE LUI-MÊME
-- ────────────────────────────────────────────────────────────

comment on column public.duo_choices.option_id is
  'La PLACE du plateau que le joueur a scellée (DUO-4), ou NUL. C''est le seul '
  'identifiant qui désigne un choix quelle que soit son origine : une option '
  'saisie n''a pas de fiche, et deux saisies distinctes portaient donc jusqu''ici '
  'le même item_id nul — indiscernables au moment de trancher l''accord. NUL '
  'dans deux cas, et duo_state les traite pareil en retombant sur item_id : un '
  'sceau posé AVANT DUO-4, et un plateau remplacé pendant la manche (la FK '
  'composite est ON DELETE SET NULL, comme celle d''item_id — le sceau survit à '
  'la disparition de ce qu''il désignait, parce qu''il porte ce que le joueur a '
  'FAIT et non ce qu''il en reste).';

comment on function public.duo_choose_option(uuid, text, uuid) is
  'Sceller son choix dans une manche de Duo Miroir, désigné par sa PLACE (L17, '
  'DUO-4). Remplace la validation par item_id de duo_choose, qui ne pouvait pas '
  'atteindre une option saisie : un plateau composé sans la carte Vitrine '
  's''affichait et refusait tous les choix. Mêmes gardes et même ordre '
  'qu''avant — rôle, forme de la clé, salle, VERROU consultatif, appartenance, '
  'manche ouverte, plateau — et tous les refus rendent le même unavailable, '
  'indistinct par structure : une option_id d''un autre salon ne joint pas et '
  'ne divulgue pas son existence. duo_choose demeure et DÉLÈGUE ici après avoir '
  'résolu la fiche vers sa place : la logique du sceau n''est écrite qu''une '
  'fois. Accordée au seul service_role.';

comment on function public.duo_choose(uuid, text, uuid) is
  'LA PORTE D''HIER de Duo Miroir, conservée pour la fenêtre de déploiement '
  '(DUO-4) : même nom, même signature, même document rendu. Elle vérifie le '
  'rôle et la forme de la clé — « une clé malformée ne touche jamais le '
  'plateau » —, résout la fiche vers sa PLACE dans l''organisation de la salle, '
  'puis délègue à duo_choose_option. Elle n''a plus de logique propre : le '
  'sceau, le verrou et la révélation sont écrits une seule fois, chez le '
  'délégué. Un item_id qui ne résout pas transmet un null et emprunte le même '
  'refus que tous les autres. À retirer quand plus aucun appelant ne passe '
  'p_item_id.';

comment on function public.set_duo_plateau(uuid, jsonb, uuid) is
  'Poser le plateau ENTIER de Duo Miroir, des deux origines, EN UNE TRANSACTION '
  '(DUO-4). Remplace l''écriture par table de src/actions/duo.ts '
  '(ecrirePlateauParTable), qui faisait delete puis insert en deux allers-'
  'retours : une panne entre les deux laissait le plateau VIDE. p_places est un '
  'tableau d''OBJETS — [{"item_id": "…"} | {"libelle": "…"}] — et non deux '
  'tableaux parallèles, qui auraient fait porter l''appariement à l''appelant. '
  'L''ordre du tableau est l''ordre du plateau. set_duo_options reste en place '
  'pour les plateaux entièrement composés de fiches, dont elle est le chemin '
  'historique et le témoin de non-régression. La forme du libellé n''est PAS '
  'revalidée ici : duo_options_libelle_valide en est l''unique autorité, et un '
  'check abandonne la transaction entière — l''atomicité tient. Accordée au '
  'seul service_role, qui vérifie l''acteur en SQL (owner|editor).';


-- ────────────────────────────────────────────────────────────
-- 9. GARDE DE SORTIE
--
-- Une migration qui s'applique sans rien produire est le pire des deux mondes :
-- elle enregistre sa version, ferme le sujet, et laisse la panne. On CONSTATE
-- donc le résultat, et chaque message nomme ce qui casserait — un « objet
-- manquant » obligerait à refaire l'enquête que cette garde vient de faire.
--
-- Ici, et ici seulement, on vérifie la PRÉSENCE de ce qu'on ajoute : c'est la
-- différence avec §0, qui ne peut vérifier que ce qui préexiste sous peine de
-- faire échouer tout `supabase db reset`.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def text;
begin
  -- ── LA COLONNE, SA FK COMPOSITE, SON INDEX ──
  if not exists (
    select 1 from pg_catalog.pg_attribute a
     where a.attrelid = 'public.duo_choices'::regclass
       and a.attname = 'option_id' and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception
      'public.duo_choices.option_id n existe pas : le sceau ne pourrait pas designer une option saisie, et deux saisies distinctes resteraient indiscernables.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'duo_choices_option_id_organization_id_fkey'
       and conrelid = 'public.duo_choices'::regclass
       and contype = 'f'
       and pg_catalog.array_length(conkey, 1) = 2
  ) then
    raise exception
      'la FK COMPOSITE duo_choices.(option_id, organization_id) -> duo_options manque : un sceau pourrait designer la place d une AUTRE organisation, et fk_composites_couverture.test.sql rougirait.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
     where schemaname = 'public' and tablename = 'duo_choices'
       and indexname = 'duo_choices_option_idx'
  ) then
    raise exception
      'l index duo_choices_option_idx manque : le « set null » de la cascade balaierait la table a chaque remplacement de plateau.';
  end if;

  -- ── LES DEUX FONCTIONS NEUVES, ET LEURS DROITS ──
  --
  -- Le defaut de Postgres est `execute` a PUBLIC. Une fonction `security
  -- definer` laissee a PUBLIC serait appelable par `anon` : elle refuserait sur
  -- son propre controle de role, mais la surface n a pas a exister.
  if not pg_catalog.has_function_privilege(
           'service_role', 'public.duo_choose_option(uuid, text, uuid)',
           'EXECUTE') then
    raise exception
      'service_role ne peut pas executer duo_choose_option : PostgREST rendrait un refus sur CHAQUE choix, et le jeu serait injouable dans les deux origines.';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.duo_choose_option(uuid, text, uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege(
          'authenticated', 'public.duo_choose_option(uuid, text, uuid)',
          'EXECUTE') then
    raise exception
      'duo_choose_option est executable par anon ou authenticated : le revoke de §4 n a pas porte.';
  end if;

  if not pg_catalog.has_function_privilege(
           'service_role', 'public.set_duo_plateau(uuid, jsonb, uuid)',
           'EXECUTE') then
    raise exception
      'service_role ne peut pas executer set_duo_plateau : l ecran de reglages resterait sur son ecriture en deux temps, celle qui peut laisser le plateau vide.';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.set_duo_plateau(uuid, jsonb, uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege(
          'authenticated', 'public.set_duo_plateau(uuid, jsonb, uuid)',
          'EXECUTE') then
    raise exception
      'set_duo_plateau est executable par anon ou authenticated : le revoke de §7 n a pas porte, et le plateau serait ecrivable hors de la garde d acteur.';
  end if;

  -- ── LA PORTE D'HIER TIENT TOUJOURS, ET ELLE DÉLÈGUE ──
  --
  -- `create or replace` PRÉSERVE l ACL ; on le constate plutot que de l esperer,
  -- parce qu un `drop` accidentel ailleurs la ramenerait au defaut PUBLIC.
  if not pg_catalog.has_function_privilege(
           'service_role', 'public.duo_choose(uuid, text, uuid)', 'EXECUTE') then
    raise exception
      'service_role a perdu l execution de duo_choose : l application deployee, qui l appelle encore, recevrait un refus sur la porte du jeu pendant toute la fenetre de deploiement.';
  end if;

  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'duo_choose';
  if pg_catalog.strpos(v_def, 'duo_choose_option') = 0 then
    raise exception
      'public.duo_choose ne delegue pas a duo_choose_option : le create or replace de §5 n a pas porte, et les options saisies resteraient inchoisissables.';
  end if;

  -- ── L'ACCORD SAIT TRANCHER DEUX PLACES, ET GARDE SON REPLI ──
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'duo_state';
  if pg_catalog.strpos(v_def, 'v_accord := v_mon_option = v_autre_option') = 0 then
    raise exception
      'public.duo_state ne tranche pas l accord sur la place : deux options saisies resteraient indecidables (accord nul) sur un plateau ou rien n est pourtant ambigu.';
  end if;
  if pg_catalog.strpos(
       v_def, 'v_accord := v_mon_item is not distinct from v_autre_item') = 0 then
    raise exception
      'public.duo_state a PERDU le repli sur item_id : les sceaux poses avant DUO-4, et les manches traversees par un remplacement de plateau, cesseraient de rendre le verdict qu ils rendaient hier.';
  end if;
end
$migration$;
