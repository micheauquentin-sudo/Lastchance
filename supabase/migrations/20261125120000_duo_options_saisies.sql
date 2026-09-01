-- ============================================================
-- DUO-1 — LE DUO MIROIR CESSE DE DÉPENDRE DE LA CARTE VITRINE
--
-- Duo Miroir devient une option vendable seule (12 €/mois). Or son plateau
-- n'était composable qu'à partir de `vitrine_items` : `duo_options.item_id`
-- était NOT NULL et portait une FK composite vers la fiche. Un commerçant qui
-- achetait le Duo sans la Vitrine payait un jeu qu'il ne pouvait pas
-- configurer — il n'avait aucune fiche à épingler.
--
-- Ce fichier rend l'origine de l'option LIBRE : une option est SOIT une fiche
-- de la carte (ce qui existe et marche, et qui ne bouge pas), SOIT un libellé
-- saisi par le commerçant. Jamais les deux, jamais aucun.
--
-- ── CE QUI A ÉTÉ VÉRIFIÉ AVANT D'ÉCRIRE, ET QUI CHANGE LE DIAGNOSTIC ──
--
-- La demande désignait `duo_jouable()` comme le cœur du lot : « elle compte des
-- fiches épinglées, elle doit compter les options ». Le CATALOGUE VIVANT dit
-- autre chose, et c'est pour cela qu'on l'a lu plutôt que le fichier de
-- migration :
--
--     select exists (select 1 from public.duo_options o
--                     where o.organization_id = $1 offset 1);
--
-- Elle compte des LIGNES de `duo_options`, sans aucune jointure vers
-- `vitrine_items`. Elle est donc DÉJÀ indifférente à l'origine de l'option :
-- six libellés saisis la rendent vraie le jour où la colonne existe. Elle n'est
-- pas le verrou, et la réécrire aurait été un geste cosmétique sur la fonction
-- qui garde la porte publique — exactement le genre de `create or replace`
-- qu'on paie plus tard.
--
-- LE VERROU EST AILLEURS : `duo_options_json` fait une JOINTURE INTERNE sur
-- `vitrine_items`. Une option sans fiche n'en sort pas. Et comme `duo_start`
-- construit le plateau à partir de ce document, et que `src/lib/duo.ts` refait
-- le compte à la lecture (`options.length < 2` ⇒ `non_configure`), un plateau
-- de six libellés saisis serait resté injouable AVEC un `duo_jouable` à vrai —
-- porte publique ouverte, jeu qui refuse de démarrer. C'est cette jointure que
-- ce fichier passe en jointure externe. `duo_options_state` (l'écran de
-- configuration du commerçant) délègue au même document et guérit avec lui.
--
-- ── LE RÉGIME DE DROITS DE LA TABLE, MESURÉ ET NON SUPPOSÉ ──
--
-- `duo_options` est en régime MIXTE, ce que `information_schema` confirme :
--   · SELECT et DELETE sont accordés AU NIVEAU TABLE ;
--   · INSERT et UPDATE sont accordés COLONNE PAR COLONNE.
--
-- Conséquence exacte, et c'est ce qui décide des grants ci-dessous : la colonne
-- neuve est LISIBLE d'office (le grant de table la couvre — pas de `select`
-- entier refusé par PostgREST, pas d'écran qui disparaît), mais elle n'est ni
-- insérable ni modifiable tant qu'on ne l'accorde pas nommément. On accorde
-- donc INSERT et UPDATE sur `libelle`, et RIEN en SELECT : un grant de colonne
-- redondant par-dessus un grant de table ne protège de rien et laisse croire à
-- un régime qui n'est pas celui de la table.
--
-- ── LE LIBELLÉ EST DU TEXTE ÉCRIT PAR UN COMMERÇANT, LU PAR DES JOUEURS ──
--
-- Bornes en base (§2). Le dépôt a déjà `public.player_alias_is_allowed(text)`
-- (20260805190000) et on ne le réutilise PAS, pour deux raisons indépendantes,
-- l'une de fond et l'autre mécanique :
--
--   1. CE N'EST PAS LE MÊME OBJET. Cette fonction porte une LISTE DE MOTS
--      BLOQUÉS pensée pour un pseudo de joueur, dont « con ». Elle la teste au
--      mot (`like '% con %'`). « Spaghetti con vongole » est refusé. Sa borne
--      haute est 24 caractères, là où `vitrine_items.nom` — le NOM DE PLAT que
--      ce libellé remplace, et donc le bon précédent — est borné à 120.
--      Modérer un nom de plat comme un pseudo produit des refus incompréhen-
--      sibles sur une carte de restaurant.
--   2. ELLE N'EST PAS APPELABLE D'ICI. Un `check` évalue son expression avec
--      les droits de l'écrivain. `format_player_alias` et
--      `player_alias_is_allowed` sont révoquées de `authenticated` et rendues
--      au seul `service_role` : un membre qui insère par PostgREST se ferait
--      refuser sur « permission denied for function », pas sur son texte. Les
--      accorder à `authenticated` élargirait la surface de la modération des
--      pseudos pour un besoin qui n'est pas le sien.
--
-- On REPREND en revanche ce que cette fonction a appris, qui est la partie qui
-- vaut : le refus des caractères de contrôle et la LISTE EXACTE des codets
-- invisibles et bidirectionnels (U+200B..U+200F, U+202A..U+202E, U+2066..U+2069,
-- U+FEFF), écrits ici en classes de caractères plutôt qu'en appel de fonction —
-- donc sans dépendance de privilège et sans fonction à revalider.
--
-- Les six clauses ont été vérifiées sur la base locale avant d'être écrites :
-- les échappements \uXXXX sont bien interprétés par le moteur d'expressions
-- régulières, `[[:alnum:]]` reconnaît les idéogrammes comme les accents — la
-- règle « au moins un alphanumérique » n'exclut donc aucune écriture — et
-- l'espace insécable U+00A0, qui n'est NI un caractère de contrôle NI rogné par
-- `btrim`, tombe bien sous `[[:space:]]` et sous cette même règle. Un libellé
-- fait d'un seul insécable est refusé.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 0. GARDE DE FILIATION
--
-- `duo_options_json` est réécrite plus bas par un `create or replace` qui
-- RECOPIE son corps. Recopier un corps qu'on n'a pas relu est la manière connue
-- de faire disparaître une correction posée entre-temps : on CONSTATE donc la
-- forme vivante dans le catalogue — pas dans le fichier d'origine, qui ne dit
-- rien des migrations qui l'ont suivi.
--
-- On vérifie AUSSI `duo_jouable`, qu'on ne réécrit pas : l'en-tête affirme
-- qu'elle est déjà indifférente à l'origine des options, et cette affirmation
-- est ce sur quoi repose le fait de ne pas y toucher. Une affirmation qui
-- décide d'une inaction se vérifie comme une autre.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def text;
begin
  -- ── `duo_options_json` ──
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'duo_options_json';

  if pg_catalog.strpos(v_def, 'left join public.vitrine_items') > 0 then
    -- Déjà appliquée : on sort sans bruit plutôt que de lever (motif
    -- 20261026120000).
    return;
  end if;

  if pg_catalog.strpos(v_def, 'join public.vitrine_items i') = 0
     or pg_catalog.strpos(v_def, 'o.organization_id = p_organization_id') = 0 then
    raise exception
      'public.duo_options_json n a pas la forme attendue (jointure interne sur vitrine_items) : elle a ete reecrite depuis 20261018120000, et la recopier ici effacerait ce changement. Relire le catalogue avant de rejouer cette migration.';
  end if;

  -- ── `duo_jouable`, qu'on NE réécrit PAS ──
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'duo_jouable';

  if pg_catalog.strpos(v_def, 'vitrine_items') > 0 then
    raise exception
      'public.duo_jouable joint desormais vitrine_items : elle n est plus indifferente a l origine des options, et ce fichier la laisse pourtant intacte. Le plateau saisi a la main serait declare injouable et la porte publique resterait fermee.';
  end if;

  if pg_catalog.strpos(v_def, 'from public.duo_options o') = 0 then
    raise exception
      'public.duo_jouable ne compte plus les lignes de duo_options : sa forme vivante ne correspond plus a celle sur laquelle ce fichier s appuie pour ne pas y toucher.';
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 1. L'ORIGINE DE L'OPTION DEVIENT LIBRE
--
-- `item_id` perd son NOT NULL ; `libelle` apparaît. La FK COMPOSITE vers
-- `vitrine_items` n'est PAS touchée et n'a pas à l'être : une FK ne contraint
-- pas les lignes dont la colonne référençante est nulle. La propriété que
-- 20261018120000 tenait à garder — « toute option épinglée a sa fiche, du même
-- commerce » — vaut donc toujours, mot pour mot, pour les options qui ont une
-- fiche. Et la CASCADE de suppression continue de retirer du plateau le plat
-- retiré de la carte.
--
-- `duo_options_org_item_unique unique (organization_id, item_id)` n'est pas
-- touchée non plus : les nuls sont distincts entre eux dans un index unique,
-- donc autant d'options saisies qu'on veut cohabitent sans se gêner, tandis que
-- « une fiche, une fois » tient toujours pour celles qui en ont une.
-- ────────────────────────────────────────────────────────────

alter table public.duo_options
  alter column item_id drop not null;

alter table public.duo_options
  add column if not exists libelle text;


-- ────────────────────────────────────────────────────────────
-- 2. L'UN OU L'AUTRE, ET LE TEXTE EST BORNÉ
--
-- ── L'UN OU L'AUTRE (`num_nonnulls`) ──
--
-- `pg_catalog.num_nonnulls(item_id, libelle) = 1` dit exactement la règle :
-- exactement une des deux origines. Les deux à la fois donnerait une option
-- dont le nom affiché dépendrait de qui le lit (la fiche ? le libellé ?) ;
-- aucune des deux donnerait une place sur le plateau sans rien à choisir — et
-- `duo_jouable`, qui compte des LIGNES, la compterait.
--
-- ── LE TEXTE ──
--
-- Six clauses, chacune un refus nommé (voir l'en-tête pour le choix de ne pas
-- réutiliser `player_alias_is_allowed`) :
--   · 1..120 caractères — borne de `vitrine_items.nom`, le champ que ce libellé
--     remplace, écrite dans la même forme que lui ;
--   · pas de blanc en tête ni en queue — `[[:space:]]` et non `btrim`, parce
--     que `btrim` ne rogne que l'espace ASCII et laisserait passer un libellé
--     ouvert par un insécable ;
--   · pas deux blancs de suite — un plateau n'aligne pas des noms qui se
--     ressemblent à l'espacement près ;
--   · au moins un alphanumérique — c'est ce qui refuse le libellé vide de sens
--     (« … », un seul insécable) sans avoir à énumérer la ponctuation ;
--   · aucun caractère de contrôle ;
--   · aucun codet invisible ou bidirectionnel (liste de 20260805190000).
-- ────────────────────────────────────────────────────────────

alter table public.duo_options
  drop constraint if exists duo_options_origine_exclusive;
alter table public.duo_options
  add constraint duo_options_origine_exclusive
  check (pg_catalog.num_nonnulls(item_id, libelle) = 1);

alter table public.duo_options
  drop constraint if exists duo_options_libelle_valide;
alter table public.duo_options
  add constraint duo_options_libelle_valide
  check (
    libelle is null
    or (
          pg_catalog.char_length(libelle) between 1 and 120
      and libelle !~ '^[[:space:]]'
      and libelle !~ '[[:space:]]$'
      and libelle !~ '[[:space:]][[:space:]]'
      and libelle ~ '[[:alnum:]]'
      and libelle !~ '[[:cntrl:]]'
      and libelle !~ '[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]'
    )
  );

-- DEUX FOIS LE MÊME LIBELLÉ EST UN PLATEAU CASSÉ. C'est la transposition
-- littérale de `duo_options_org_item_unique` (« une fiche, une fois ») à
-- l'origine textuelle : le jeu demande à deux joueurs de désigner LA MÊME
-- chose, et deux places portant le même nom rendent l'accord indécidable.
-- Les nuls étant distincts, cet index ne gêne en rien les options à fiche.
--
-- La comparaison est EXACTE et non insensible à la casse : « Pizza » et
-- « pizza » restent deux options acceptées. Normaliser la casse serait une
-- politique de rapprochement de textes, que rien dans ce dépôt ne tient
-- aujourd'hui et qu'on n'invente pas au détour d'un index.
create unique index if not exists duo_options_org_libelle_unique
  on public.duo_options (organization_id, libelle)
  where libelle is not null;


-- ────────────────────────────────────────────────────────────
-- 3. LES DROITS DE LA COLONNE NEUVE
--
-- Régime MIXTE (voir l'en-tête) : SELECT et DELETE au niveau table, INSERT et
-- UPDATE colonne par colonne. `libelle` hérite donc de la lecture et de rien
-- d'autre. On accorde l'écriture, et RIEN en SELECT.
--
-- `organization_id` reste insérable et non modifiable : le locataire d'une
-- ligne ne se corrige pas, il se supprime et se ressaisit (20261018120000).
-- `libelle` est modifiable, lui : corriger une faute de frappe dans un nom de
-- plat ne change pas de locataire.
-- ────────────────────────────────────────────────────────────

grant insert (libelle) on public.duo_options to authenticated;
grant update (libelle) on public.duo_options to authenticated;


-- ────────────────────────────────────────────────────────────
-- 3 bis. LA GARDE DES DROITS
--
-- Un grant sans effet (mauvais rôle, mauvais schéma, colonne mal orthographiée)
-- laisse la panne intacte et fait passer ce fichier pour appliqué. Cinq lots
-- ont payé ce défaut cette semaine, toujours découvert après coup et jamais par
-- une garde. Modèle `20261109120000_plan_salle_lecture.sql`.
--
-- On vérifie les TROIS privilèges dont dépend l'écran, et on nomme dans chaque
-- message ce qui casserait exactement — un message qui dit « grant manquant »
-- oblige à refaire l'enquête que cette garde vient de faire.
-- ────────────────────────────────────────────────────────────

do $migration$
begin
  if not pg_catalog.has_column_privilege(
           'authenticated', 'public.duo_options', 'libelle', 'INSERT') then
    raise exception
      'public.duo_options.libelle n est pas insérable par authenticated : le commercant sans Vitrine ne pourrait creer aucune option et le plateau resterait vide.';
  end if;

  if not pg_catalog.has_column_privilege(
           'authenticated', 'public.duo_options', 'libelle', 'UPDATE') then
    raise exception
      'public.duo_options.libelle n est pas modifiable par authenticated : corriger une faute de frappe dans un nom de plat exigerait de supprimer la ligne.';
  end if;

  -- La LECTURE, qui vient du grant de TABLE et non d un grant de colonne. Si
  -- quelqu un remplace un jour ce grant de table par des grants de colonnes en
  -- oubliant `libelle`, PostgREST refuserait le `select` ENTIER — l ecran ne se
  -- degraderait pas, il DISPARAITRAIT. C est le defaut qu on ne voit qu en
  -- production, et c est pour lui que cette assertion existe alors meme que ce
  -- fichier n accorde aucun SELECT.
  if not pg_catalog.has_column_privilege(
           'authenticated', 'public.duo_options', 'libelle', 'SELECT') then
    raise exception
      'public.duo_options.libelle n est pas lisible par authenticated : le grant de table de 20261018120000 a ete remplace par des grants de colonnes qui l oublient, et PostgREST refuserait le select entier — l ecran de configuration Duo disparaitrait au lieu de se degrader.';
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 4. `duo_options_json` — LE PLATEAU CESSE D'EXIGER UNE FICHE
--
-- C'EST LA CORRECTION DE FOND DU LOT. La jointure interne devient EXTERNE, et
-- le nom affiché vient de la fiche OU du libellé. Tout le reste du document est
-- recopié à l'identique — mêmes clés, même ordre, même `coalesce` sur
-- l'agrégat vide.
--
-- ── `option_id`, LA CLÉ QUI MANQUAIT ──
--
-- Le document ne portait que `item_id` pour désigner une option, c'est-à-dire
-- l'identifiant de la FICHE. Une option saisie n'en a pas. On ajoute
-- `option_id` (la clé primaire de `duo_options`, qui existe pour les deux
-- origines) : c'est le seul identifiant qui désigne une place du plateau quelle
-- que soit son origine. `item_id` reste présent, nul pour une option saisie —
-- la forme ne perd rien, elle gagne une clé (motif 20261020120000 : une forme
-- stable se type une fois, une clé qui apparaît et disparaît se teste à chaque
-- lecture).
--
-- CE QUE CE FICHIER NE FAIT PAS, ET QU'IL FAUT SAVOIR : `duo_choose` valide
-- toujours le choix du joueur par `o.item_id = p_item_id`. Une option saisie a
-- un `item_id` nul, que rien n'égale — elle est donc AFFICHÉE mais pas encore
-- CHOISISSABLE. Le refus reste `unavailable`, indistinct comme les autres :
-- aucune fuite, aucune régression sur les fiches, mais un lot applicatif reste
-- nécessaire pour que `duo_choose` accepte `option_id`. De même,
-- `set_duo_options` ne connaît que des tableaux de fiches et REMPLACE le
-- plateau en entier : l'appeler effacerait les options saisies. L'écriture des
-- options saisies passe par la table (RLS + grants de §3), pas par cette RPC.
-- ────────────────────────────────────────────────────────────

create or replace function public.duo_options_json(
  p_organization_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'option_id', o.id,
               'item_id', i.id,
               'nom', coalesce(i.nom, o.libelle),
               'description', i.description,
               'prix_affiche', i.prix_affiche,
               'photo_path', i.photo_path,
               'ordre', o.ordre)
             order by o.ordre),
           '[]'::jsonb)
    from public.duo_options o
    left join public.vitrine_items i
      on i.id = o.item_id
     and i.organization_id = o.organization_id
   where o.organization_id = p_organization_id;
$$;

revoke all on function public.duo_options_json(uuid)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 5. CE QUE LA TABLE RACONTE D'ELLE-MÊME
-- ────────────────────────────────────────────────────────────

comment on column public.duo_options.item_id is
  'La fiche Vitrine épinglée, ou NUL si l''option est un libellé saisi '
  '(DUO-1). Facultative depuis que Duo Miroir se vend sans la Vitrine : un '
  'commerçant sans carte n''a aucune fiche à épingler et composait donc un '
  'plateau vide. Exactement l''une des deux origines est renseignée — '
  'contrainte duo_options_origine_exclusive. La FK COMPOSITE vers '
  'vitrine_items est inchangée et ne contraint que les lignes qui portent une '
  'fiche : « une option épinglée a sa fiche, du même commerce » tient toujours, '
  'et la CASCADE retire toujours du plateau le plat retiré de la carte.';

comment on column public.duo_options.libelle is
  'Le nom de l''option quand le commerçant l''a SAISI plutôt que pioché dans sa '
  'carte (DUO-1), NUL sinon. Borné en base : 1..120 caractères — la borne de '
  'vitrine_items.nom, le champ qu''il remplace — sans blanc en tête, en queue '
  'ni doublé, au moins un alphanumérique, aucun caractère de contrôle et aucun '
  'codet invisible ou bidirectionnel (liste de 20260805190000). Le filtre de '
  'pseudo player_alias_is_allowed n''est PAS réutilisé : sa liste de mots '
  'bloqués refuserait « Spaghetti con vongole », sa borne haute est 24, et '
  'elle n''est de toute façon pas exécutable par authenticated depuis un check. '
  'Unique par organisation (index partiel) : deux places du même nom rendraient '
  'l''accord du jeu indécidable.';

comment on table public.duo_options is
  'La sélection du commerçant pour Duo Miroir (L17) : 2 à 6 options qui forment '
  'le plateau de jeu. Depuis DUO-1, une option est SOIT une fiche Vitrine '
  '(item_id) SOIT un libellé saisi (libelle), jamais les deux et jamais aucun — '
  'le jeu se vend seul, sans la carte. Portée par l''ORGANISATION et non par la '
  'manche : les deux joueurs choisissent dans la MÊME liste, sans quoi aucun '
  'accord ne serait observable. `ordre` est une PLACE (1..6, unique par '
  'organisation), motif vitrine_contenus.rang. La borne BASSE (au moins deux '
  'options) ne peut pas s''écrire en check — un check porte sur une ligne, pas '
  'sur un cardinal : elle est CONSTATÉE par duo_jouable, qui compte des LIGNES '
  'et se moque donc de leur origine. ATTENTION : set_duo_options ne connaît que '
  'des tableaux de fiches et remplace le plateau EN ENTIER — l''appeler efface '
  'les options saisies. Celles-ci s''écrivent par la table (RLS + grants de '
  'colonnes), pas par cette RPC.';

comment on function public.duo_options_json(uuid) is
  'Le plateau de Duo Miroir, écrit une fois et lu par duo_start, duo_state et '
  'duo_options_state (L17). JOINTURE EXTERNE sur vitrine_items depuis DUO-1 : '
  'une option saisie à la main n''a pas de fiche, et une jointure interne '
  'l''aurait fait DISPARAÎTRE du plateau — avec duo_jouable à vrai, ce qui '
  'aurait donné une porte publique ouverte sur un jeu refusant de démarrer. '
  '`nom` vient de la fiche ou du libellé ; description, prix_affiche et '
  'photo_path sont nuls pour une option saisie. `option_id` désigne la PLACE '
  'quelle que soit son origine — c''est la clé à donner à un futur duo_choose, '
  'item_id ne pouvant pas désigner une option sans fiche. Accordée à AUCUN '
  'rôle applicatif, service_role compris : elle n''a de sens qu''à l''intérieur '
  'des RPC.';

comment on function public.duo_jouable(uuid) is
  'Le jeu peut-il se jouer ici : au moins DEUX options sur le plateau (L17). '
  'UNE SEULE DÉFINITION, DEUX APPELANTS — duo_start refuse d''ouvrir une manche '
  'injouable (non_configure), vitrine_public_state décide si la PORTE du jeu '
  's''affiche. Deux seuils écrits séparément auraient divergé, et la divergence '
  'aurait la pire forme : une porte visible menant à un jeu qui refuse de '
  'démarrer. Elle compte des LIGNES de duo_options, SANS jointure vers '
  'vitrine_items : elle est donc indifférente à l''origine des options, et '
  'DUO-1 n''a pas eu à la modifier pour qu''un plateau entièrement saisi à la '
  'main soit jouable. Cette indifférence est une PROPRIÉTÉ TENUE, pas un '
  'accident : duo_options_saisies.test.sql la rejoue à chaque CI.';
