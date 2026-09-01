-- ============================================================
-- DUO-1 — LE PLATEAU DU DUO N'EXIGE PLUS LA CARTE VITRINE
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. UN PLATEAU ENTIÈREMENT SAISI EST JOUABLE. C'est la promesse du lot :
--      un commerçant qui achète Duo Miroir sans la Vitrine n'a AUCUNE fiche,
--      et doit pouvoir composer et faire tourner son jeu quand même. Prouvé
--      sur une organisation qui n'a pas la moindre ligne de `vitrine_menus`.
--   2. LE PLATEAU MIXTE TIENT. Fiches et libellés cohabitent, chacun rendant
--      ce qu'il a : la fiche garde description, prix et photo, le libellé les
--      rend nuls — et l'ordre du plateau ne dépend pas de l'origine.
--   3. LA NON-RÉGRESSION, qui est la raison d'être de la moitié de ce fichier.
--      Un plateau de fiches — le seul qui existait avant DUO-1 — se compose
--      par `set_duo_options`, se lit à l'identique, et la CASCADE de
--      suppression de fiche continue de le vider place par place.
--   4. L'UN OU L'AUTRE, JAMAIS LES DEUX, JAMAIS AUCUN.
--   5. LE TEXTE EST BORNÉ. Longueur, blancs de bord, blancs doublés,
--      caractères de contrôle, codets invisibles et bidirectionnels, libellé
--      sans un seul alphanumérique.
--   6. L'ISOLATION. Le plateau du voisin n'entre pas dans le document, et un
--      membre du voisin ne lit pas la table d'à côté — éprouvé en DESCENDANT
--      de superutilisateur, seule manière de tester une RLS pour de vrai.
--   7. LES DROITS DE LA COLONNE NEUVE, dans le régime MIXTE de la table :
--      lecture héritée du grant de TABLE, écriture accordée COLONNE PAR
--      COLONNE. C'est le défaut qui a coûté cinq lots cette semaine.
--
--   8. LE PLATEAU SAISI SE JOUE (DUO-4). Une option saisie se SCELLE, la
--      manche se révèle, et l'accord se tranche entre deux libellés — verdict
--      qui n'existait pas, faute d'une clé pour distinguer deux `item_id` nuls.
--      La fiche, elle, passe toujours par la PORTE D'HIER sans rien changer.
--      Et le plateau entier s'écrit EN UNE TRANSACTION (`set_duo_plateau`).
--
-- ── CE QUE CE FICHIER A CESSÉ DE NE PAS PROUVER ──
--
-- Il portait jusqu'à DUO-4 un aveu : « il ne prouve PAS qu'une option saisie
-- est CHOISISSABLE ». C'était exact — `duo_choose` validait le choix par
-- `o.item_id = p_item_id`, qu'un `item_id` nul n'égale jamais, si bien qu'une
-- option saisie s'affichait sans pouvoir se sceller. §8 lève cet aveu en jouant
-- de vraies parties, et non en assertant la forme des fonctions : un plateau de
-- trois libellés, chez un commerce qui n'a AUCUNE fiche, mène jusqu'au verdict.
--
-- Le fichier doit passer sur une base VIDE comme sur une base SEMÉE : toutes
-- les assertions sont bornées aux organisations créées ici, aucune ne compte
-- globalement.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
-- S : LE COMMERCE SANS CARTE. C'est le cas du lot : il achète le Duo seul.
--     AUCUNE ligne de vitrine_menus / vitrine_categories / vitrine_items ne
--     lui est semée, délibérément — lui en donner une rendrait la preuve
--     vacante, puisqu'on ne saurait plus si le plateau tient par le libellé
--     ou par une fiche oubliée.
-- M : LE COMMERCE MIXTE. Deux fiches et deux libellés sur le même plateau.
-- V : LE COMMERCE D'AVANT DUO-1. Trois fiches, plateau composé par
--     `set_duo_options` : c'est le témoin de non-régression.
-- Z : LE VOISIN. Il porte les MÊMES libellés que S — ce qui prouve d'un même
--     geste que l'unicité est bien PAR ORGANISATION et que rien ne fuit.
-- L : LE LABORATOIRE. Les refus s'y éprouvent sans consommer les six places
--     d'un plateau qu'une autre assertion relit.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('da000000-0000-4000-8000-00000000000a', 'Duo Saisie', 'tap-duos-s',
   'active', 'starter', 'Europe/Paris', 6),
  ('da000000-0000-4000-8000-00000000000b', 'Duo Mixte', 'tap-duos-m',
   'active', 'starter', 'Europe/Paris', 6),
  ('da000000-0000-4000-8000-00000000000c', 'Duo Vitrine', 'tap-duos-v',
   'active', 'starter', 'Europe/Paris', 6),
  ('da000000-0000-4000-8000-00000000000d', 'Duo Voisin', 'tap-duos-z',
   'active', 'starter', 'Europe/Paris', 6),
  ('da000000-0000-4000-8000-00000000000e', 'Duo Labo', 'tap-duos-l',
   'active', 'starter', 'Europe/Paris', 6);

-- LES ACTEURS. `set_duo_options` vérifie l'appartenance EN SQL (owner|editor),
-- et la section 6 a besoin d'un membre du VOISIN pour éprouver la RLS.
insert into auth.users (id, email) values
  ('da000001-0000-4000-8000-000000000001', 'proprio-v@tap-duos.local'),
  ('da000001-0000-4000-8000-000000000002', 'proprio-z@tap-duos.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('da000000-0000-4000-8000-00000000000c',
   'da000001-0000-4000-8000-000000000001', 'owner'),
  ('da000000-0000-4000-8000-00000000000d',
   'da000001-0000-4000-8000-000000000002', 'owner');

-- LA CARTE, pour M et V SEULEMENT. S n'en a pas, et c'est le point.
insert into public.vitrine_menus (id, organization_id, nom, ordre) values
  ('da000002-0000-4000-8000-00000000000b',
   'da000000-0000-4000-8000-00000000000b', 'Carte M', 0),
  ('da000002-0000-4000-8000-00000000000c',
   'da000000-0000-4000-8000-00000000000c', 'Carte V', 0);

insert into public.vitrine_categories (id, menu_id, organization_id, nom, ordre)
values
  ('da000003-0000-4000-8000-00000000000b', 'da000002-0000-4000-8000-00000000000b',
   'da000000-0000-4000-8000-00000000000b', 'Plats M', 0),
  ('da000003-0000-4000-8000-00000000000c', 'da000002-0000-4000-8000-00000000000c',
   'da000000-0000-4000-8000-00000000000c', 'Plats V', 0);

-- Les fiches portent description / prix / photo : c'est ce qui permet de
-- montrer, en §2, que le document rend ces champs pour une fiche et des NULS
-- pour un libellé — sans quoi « la fiche garde ce qu'elle a » serait invérifié.
insert into public.vitrine_items
  (id, categorie_id, organization_id, nom, description, prix_affiche, photo_path,
   ordre)
values
  ('da000004-0000-4000-8000-0000000000b1', 'da000003-0000-4000-8000-00000000000b',
   'da000000-0000-4000-8000-00000000000b', 'Fiche M1', 'Desc M1', '12 EUR',
   'p/m1.jpg', 1),
  ('da000004-0000-4000-8000-0000000000b2', 'da000003-0000-4000-8000-00000000000b',
   'da000000-0000-4000-8000-00000000000b', 'Fiche M2', 'Desc M2', '14 EUR',
   'p/m2.jpg', 2),
  -- NON ÉPINGLÉE, délibérément : c'est la seule fiche libre de M, et §4 en a
  -- besoin pour éprouver « une fiche seule est acceptée » sans se heurter à
  -- `duo_options_org_item_unique`, qui tient toujours (DUO-S24).
  ('da000004-0000-4000-8000-0000000000b3', 'da000003-0000-4000-8000-00000000000b',
   'da000000-0000-4000-8000-00000000000b', 'Fiche M3', 'Desc M3', '16 EUR',
   'p/m3.jpg', 3),
  ('da000004-0000-4000-8000-0000000000c1', 'da000003-0000-4000-8000-00000000000c',
   'da000000-0000-4000-8000-00000000000c', 'Fiche V1', 'Desc V1', '10 EUR',
   'p/v1.jpg', 1),
  ('da000004-0000-4000-8000-0000000000c2', 'da000003-0000-4000-8000-00000000000c',
   'da000000-0000-4000-8000-00000000000c', 'Fiche V2', 'Desc V2', '11 EUR',
   'p/v2.jpg', 2),
  ('da000004-0000-4000-8000-0000000000c3', 'da000003-0000-4000-8000-00000000000c',
   'da000000-0000-4000-8000-00000000000c', 'Fiche V3', 'Desc V3', '13 EUR',
   'p/v3.jpg', 3);

-- LE PLATEAU DE S : trois libellés, aucune fiche. Écrit par la table et non
-- par `set_duo_options` — cette RPC ne connaît que des tableaux de fiches.
insert into public.duo_options (organization_id, libelle, ordre) values
  ('da000000-0000-4000-8000-00000000000a', 'Tarte aux pommes', 1),
  ('da000000-0000-4000-8000-00000000000a', 'Crème brûlée', 2),
  ('da000000-0000-4000-8000-00000000000a', 'Spaghetti con vongole', 3);

-- LE PLATEAU DE M : deux fiches, deux libellés, places entremêlées pour que
-- l'ordre ne puisse pas être vert par coïncidence d'origine.
insert into public.duo_options (organization_id, item_id, libelle, ordre) values
  ('da000000-0000-4000-8000-00000000000b',
   'da000004-0000-4000-8000-0000000000b1', null, 1),
  ('da000000-0000-4000-8000-00000000000b', null, 'Suggestion du chef', 2),
  ('da000000-0000-4000-8000-00000000000b',
   'da000004-0000-4000-8000-0000000000b2', null, 3),
  ('da000000-0000-4000-8000-00000000000b', null, 'Dessert surprise', 4);

-- LE PLATEAU DU VOISIN : les MÊMES libellés que S.
insert into public.duo_options (organization_id, libelle, ordre) values
  ('da000000-0000-4000-8000-00000000000d', 'Tarte aux pommes', 1),
  ('da000000-0000-4000-8000-00000000000d', 'Secret du voisin', 2);


-- ════════════════════════════════════════════════════════════
-- 1. UN PLATEAU ENTIÈREMENT SAISI EST JOUABLE
--
-- LA PROMESSE DU LOT. Si l'une de ces quatre assertions tombe, un commerçant
-- qui a payé le Duo sans la Vitrine a un jeu qu'il ne peut pas faire tourner.
-- ════════════════════════════════════════════════════════════

select ok(
  public.duo_jouable('da000000-0000-4000-8000-00000000000a'),
  'DUO-S1 trois libellés saisis, aucune fiche : le jeu est JOUABLE');

-- LE CONTRÔLE DE PORTÉE de l'assertion précédente : sans lui, DUO-S1 pourrait
-- être vert parce que `duo_jouable` rend vrai pour tout le monde.
select ok(
  not public.duo_jouable('da000000-0000-4000-8000-00000000000e'),
  'DUO-S2 … et un plateau VIDE reste injouable (la garde sait dire non)');

select is(
  pg_catalog.jsonb_array_length(
    public.duo_options_json('da000000-0000-4000-8000-00000000000a')),
  3,
  'DUO-S3 les trois options saisies SORTENT du document (jointure externe)');

select is(
  (select pg_catalog.string_agg(e->>'nom', ' | ' order by (e->>'ordre')::int)
     from pg_catalog.jsonb_array_elements(
            public.duo_options_json('da000000-0000-4000-8000-00000000000a')) e),
  'Tarte aux pommes | Crème brûlée | Spaghetti con vongole',
  'DUO-S4 … et leur `nom` est le libellé saisi, dans l''ordre du plateau');

-- « Spaghetti con vongole » n'est pas un exemple pris au hasard : c'est le
-- libellé que `player_alias_is_allowed` REFUSERAIT (sa liste de mots bloqués
-- contient « con », testé au mot). Sa présence ici est la preuve vivante que
-- le filtre de pseudo n'a pas été réutilisé pour un nom de plat.
select ok(
  not public.player_alias_is_allowed('Spaghetti con vongole'),
  'DUO-S5 le filtre de PSEUDO aurait refusé ce nom de plat : ne pas le réutiliser était le bon choix');

select is(
  (select pg_catalog.count(*)::int
     from pg_catalog.jsonb_array_elements(
            public.duo_options_json('da000000-0000-4000-8000-00000000000a')) e
    where e->>'item_id' is null and e->>'option_id' is not null),
  3,
  'DUO-S6 une option saisie porte un option_id et AUCUN item_id');


-- ════════════════════════════════════════════════════════════
-- 2. LE PLATEAU MIXTE
-- ════════════════════════════════════════════════════════════

select ok(
  public.duo_jouable('da000000-0000-4000-8000-00000000000b'),
  'DUO-S7 un plateau mixte est jouable');

select is(
  pg_catalog.jsonb_array_length(
    public.duo_options_json('da000000-0000-4000-8000-00000000000b')),
  4,
  'DUO-S8 … et ses QUATRE options sortent, fiches et libellés ensemble');

select is(
  (select pg_catalog.string_agg(e->>'nom', ' | ' order by (e->>'ordre')::int)
     from pg_catalog.jsonb_array_elements(
            public.duo_options_json('da000000-0000-4000-8000-00000000000b')) e),
  'Fiche M1 | Suggestion du chef | Fiche M2 | Dessert surprise',
  'DUO-S9 … dans l''ordre des PLACES, que l''origine ne réordonne pas');

-- LA FICHE GARDE CE QU'ELLE A. C'est la moitié qui prouve que la jointure
-- externe n'a rien perdu au passage.
select is(
  (select e->>'description' || ' / ' || (e->>'prix_affiche')
       || ' / ' || (e->>'photo_path')
     from pg_catalog.jsonb_array_elements(
            public.duo_options_json('da000000-0000-4000-8000-00000000000b')) e
    where e->>'nom' = 'Fiche M1'),
  'Desc M1 / 12 EUR / p/m1.jpg',
  'DUO-S10 une option À FICHE rend toujours description, prix et photo');

-- ET LE LIBELLÉ N'INVENTE RIEN. Le contrôle de portée du précédent.
select is(
  (select pg_catalog.count(*)::int
     from pg_catalog.jsonb_array_elements(
            public.duo_options_json('da000000-0000-4000-8000-00000000000b')) e
    where e->>'nom' = 'Suggestion du chef'
      and e->>'description' is null
      and e->>'prix_affiche' is null
      and e->>'photo_path' is null),
  1,
  'DUO-S11 … et une option SAISIE rend ces trois champs NULS');


-- ════════════════════════════════════════════════════════════
-- 3. NON-RÉGRESSION — LE PLATEAU DE FICHES, COMME AVANT DUO-1
--
-- Tout ce qui suit doit se comporter EXACTEMENT comme avant le lot. C'est la
-- section qui a le droit d'être ennuyeuse.
-- ════════════════════════════════════════════════════════════

select lives_ok(
  format($$select public.set_duo_options(%L, %L::uuid[], %L)$$,
         'da000000-0000-4000-8000-00000000000c',
         array['da000004-0000-4000-8000-0000000000c1',
               'da000004-0000-4000-8000-0000000000c2',
               'da000004-0000-4000-8000-0000000000c3']::uuid[],
         'da000001-0000-4000-8000-000000000001'),
  'DUO-S12 set_duo_options compose toujours un plateau de fiches');

select is(
  (select pg_catalog.count(*)::int from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000c'),
  3,
  'DUO-S13 … trois lignes, comme demandé');

select ok(
  public.duo_jouable('da000000-0000-4000-8000-00000000000c'),
  'DUO-S14 … le plateau de fiches est jouable');

select is(
  (select pg_catalog.count(*)::int
     from pg_catalog.jsonb_array_elements(
            public.duo_options_json('da000000-0000-4000-8000-00000000000c')) e
    where e->>'item_id' is not null),
  3,
  'DUO-S15 … et ses trois options portent toujours leur item_id');

select is(
  (select pg_catalog.string_agg(e->>'nom', ' | ' order by (e->>'ordre')::int)
     from pg_catalog.jsonb_array_elements(
            public.duo_options_json('da000000-0000-4000-8000-00000000000c')) e),
  'Fiche V1 | Fiche V2 | Fiche V3',
  'DUO-S16 … avec les noms de la CARTE, lus par jointure');

-- LA CASCADE. Retirer un plat de la carte le retire du plateau : la FK
-- composite et son ON DELETE CASCADE ne sont pas touchées par DUO-1, et cette
-- assertion est ce qui le prouve plutôt que de l'affirmer.
delete from public.vitrine_items
 where id = 'da000004-0000-4000-8000-0000000000c3';

select is(
  (select pg_catalog.count(*)::int from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000c'),
  2,
  'DUO-S17 supprimer la FICHE retire l''option du plateau (cascade intacte)');

select ok(
  public.duo_jouable('da000000-0000-4000-8000-00000000000c'),
  'DUO-S18 … à deux options le jeu tient encore');

delete from public.vitrine_items
 where id = 'da000004-0000-4000-8000-0000000000c2';

select ok(
  not public.duo_jouable('da000000-0000-4000-8000-00000000000c'),
  'DUO-S19 … à UNE option il ne tient plus : le seuil de deux est intact');


-- ════════════════════════════════════════════════════════════
-- 4. L'UN OU L'AUTRE, JAMAIS LES DEUX, JAMAIS AUCUN
-- ════════════════════════════════════════════════════════════

select throws_ok(
  $$insert into public.duo_options (organization_id, item_id, libelle, ordre)
    values ('da000000-0000-4000-8000-00000000000b',
            'da000004-0000-4000-8000-0000000000b1', 'Un libellé en plus', 5)$$,
  '23514',
  null,
  'DUO-S20 une fiche ET un libellé sur la même option : REFUSÉ');

select throws_ok(
  $$insert into public.duo_options (organization_id, ordre)
    values ('da000000-0000-4000-8000-00000000000e', 1)$$,
  '23514',
  null,
  'DUO-S21 ni fiche NI libellé : REFUSÉ (une place sans rien à choisir)');

select lives_ok(
  $$insert into public.duo_options (organization_id, libelle, ordre)
    values ('da000000-0000-4000-8000-00000000000e', 'Origine libellé seul', 1)$$,
  'DUO-S22 un libellé seul : accepté');

select lives_ok(
  $$insert into public.duo_options (organization_id, item_id, ordre)
    values ('da000000-0000-4000-8000-00000000000b',
            'da000004-0000-4000-8000-0000000000b3', 5)$$,
  'DUO-S23 une fiche seule : acceptée');

-- « UNE FICHE, UNE FOIS » TIENT TOUJOURS. `duo_options_org_item_unique` n'est
-- pas touchée par DUO-1, et rendre `item_id` nullable ne l'a pas relâchée pour
-- les lignes qui en portent un. Cette assertion existe parce que la première
-- version de ce fichier l'a violée sans le vouloir : elle réépinglait une fiche
-- déjà sur le plateau, et la base a eu raison de refuser.
select throws_ok(
  $$insert into public.duo_options (organization_id, item_id, ordre)
    values ('da000000-0000-4000-8000-00000000000b',
            'da000004-0000-4000-8000-0000000000b1', 6)$$,
  '23505',
  null,
  'DUO-S24 … mais la MÊME fiche deux fois sur un plateau reste refusée');

delete from public.duo_options
 where organization_id = 'da000000-0000-4000-8000-00000000000e';
delete from public.duo_options
 where organization_id = 'da000000-0000-4000-8000-00000000000b' and ordre = 5;


-- ════════════════════════════════════════════════════════════
-- 5. LE TEXTE EST BORNÉ
--
-- Chaque refus est nommé. Le laboratoire L sert de table d'essai : ses lignes
-- sont effacées après chaque acceptation pour ne pas consommer les six places.
-- ════════════════════════════════════════════════════════════

select lives_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e', pg_catalog.repeat('a', 120)),
  'DUO-S25 120 caractères : accepté (borne de vitrine_items.nom)');

delete from public.duo_options
 where organization_id = 'da000000-0000-4000-8000-00000000000e';

select throws_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e', pg_catalog.repeat('a', 121)),
  '23514',
  null,
  'DUO-S26 121 caractères : refusé');

select throws_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e', ''),
  '23514',
  null,
  'DUO-S27 libellé VIDE : refusé');

select throws_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e', ' Poulet'),
  '23514',
  null,
  'DUO-S28 blanc en TÊTE : refusé');

select throws_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e', 'Poulet '),
  '23514',
  null,
  'DUO-S29 blanc en QUEUE : refusé');

select throws_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e', 'Poulet  rôti'),
  '23514',
  null,
  'DUO-S30 deux blancs de SUITE : refusé');

select throws_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e',
         'Poulet' || pg_catalog.chr(10) || 'rôti'),
  '23514',
  null,
  'DUO-S31 caractère de CONTRÔLE (saut de ligne) : refusé');

-- LES CODETS INVISIBLES, un par famille de la liste de 20260805190000. Ce sont
-- eux qui servent à faire lire à un joueur autre chose que ce qui est écrit.
select throws_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e',
         'Poulet' || pg_catalog.chr(8203) || 'rôti'),
  '23514',
  null,
  'DUO-S32 espace de largeur nulle (U+200B) : refusé');

select throws_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e',
         'Poulet' || pg_catalog.chr(8238) || 'rôti'),
  '23514',
  null,
  'DUO-S33 renversement bidirectionnel (U+202E) : refusé');

select throws_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e',
         'Poulet' || pg_catalog.chr(8296) || 'rôti'),
  '23514',
  null,
  'DUO-S34 isolat directionnel (U+2068) : refusé');

select throws_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e',
         pg_catalog.chr(65279) || 'Poulet'),
  '23514',
  null,
  'DUO-S35 marque d''ordre des octets (U+FEFF) : refusée');

-- L'INSÉCABLE SEUL. Il n'est NI un caractère de contrôle NI rogné par `btrim` :
-- c'est la règle « au moins un alphanumérique » qui l'attrape, et c'est pour ce
-- cas précis qu'elle est écrite.
select throws_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e', pg_catalog.chr(160)),
  '23514',
  null,
  'DUO-S36 un seul espace INSÉCABLE : refusé (aucun alphanumérique)');

select throws_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e', '...'),
  '23514',
  null,
  'DUO-S37 ponctuation SEULE : refusée (aucun alphanumérique)');

-- ET CE QUI DOIT PASSER. Sans ces deux-là, les treize refus ci-dessus
-- seraient compatibles avec un filtre qui refuse TOUT.
select lives_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 1)$$,
         'da000000-0000-4000-8000-00000000000e', 'Crème brûlée à l''ancienne'),
  'DUO-S38 accents et apostrophe : acceptés');

select lives_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 2)$$,
         'da000000-0000-4000-8000-00000000000e', '寿司'),
  'DUO-S39 idéogrammes : acceptés (la règle alphanumérique n''est pas ASCII)');


-- ════════════════════════════════════════════════════════════
-- 6. UNICITÉ DU LIBELLÉ, ET ISOLATION
-- ════════════════════════════════════════════════════════════

select throws_ok(
  format($$insert into public.duo_options (organization_id, libelle, ordre)
           values (%L, %L, 3)$$,
         'da000000-0000-4000-8000-00000000000e', '寿司'),
  '23505',
  null,
  'DUO-S40 deux fois le MÊME libellé chez le même commerce : refusé');

-- ET LA MÊME CHAÎNE CHEZ LE VOISIN EST ACCEPTÉE — c'est déjà semé (Z porte
-- « Tarte aux pommes » comme S). L'unicité est PAR ORGANISATION.
select is(
  (select pg_catalog.count(*)::int from public.duo_options o
    where o.libelle = 'Tarte aux pommes'),
  2,
  'DUO-S41 … mais le MÊME libellé chez deux commerces coexiste');

select is(
  (select pg_catalog.count(*)::int
     from pg_catalog.jsonb_array_elements(
            public.duo_options_json('da000000-0000-4000-8000-00000000000a')) e
    where e->>'nom' = 'Secret du voisin'),
  0,
  'DUO-S42 le plateau du VOISIN n''entre pas dans le document de S');

-- LA RLS, ÉPROUVÉE EN DESCENDANT DE SUPERUTILISATEUR. Sous `postgres`, toute
-- policy est contournée : une assertion posée ici sans changer de rôle serait
-- un vert qui ne prouve rien.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"da000001-0000-4000-8000-000000000002","role":"authenticated"}',
  true);

select is(
  (select pg_catalog.count(*)::int from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000a'),
  0,
  'DUO-S43 le propriétaire du VOISIN ne lit AUCUNE option de S (RLS)');

select is(
  (select pg_catalog.count(*)::int from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000d'),
  2,
  'DUO-S44 … et lit bien les DEUX siennes (contrôle de portée)');

-- IL ÉCRIT AUSSI SON LIBELLÉ, ce qui est le geste que le lot ouvre : sans les
-- grants de colonnes de §3, cette insertion échouerait sur un refus de
-- privilège et le commerçant sans Vitrine n'aurait toujours pas de plateau.
select lives_ok(
  $$insert into public.duo_options (organization_id, libelle, ordre)
    values ('da000000-0000-4000-8000-00000000000d', 'Écrit par le commerçant', 3)$$,
  'DUO-S45 un ÉDITEUR écrit son libellé depuis sa session (grant INSERT)');

select lives_ok(
  $$update public.duo_options set libelle = 'Corrigé par le commerçant'
     where organization_id = 'da000000-0000-4000-8000-00000000000d'
       and ordre = 3$$,
  'DUO-S46 … et le corrige (grant UPDATE), sans supprimer la ligne');

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);


-- ════════════════════════════════════════════════════════════
-- 7. LES DROITS DE LA COLONNE NEUVE
--
-- LE DÉFAUT QUI A COÛTÉ CINQ LOTS CETTE SEMAINE. `duo_options` est en régime
-- MIXTE : SELECT et DELETE au niveau TABLE, INSERT et UPDATE colonne par
-- colonne. Une colonne neuve hérite donc de la LECTURE et de rien d'autre.
-- Ces assertions constatent les deux moitiés de cette phrase — celle qui a été
-- accordée et celle qui a été héritée.
-- ════════════════════════════════════════════════════════════

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.duo_options', 'libelle', 'INSERT'),
  'DUO-S47 authenticated INSÈRE libelle (grant de colonne, accordé par DUO-1)');

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.duo_options', 'libelle', 'UPDATE'),
  'DUO-S48 authenticated MODIFIE libelle (grant de colonne, accordé par DUO-1)');

-- LA LECTURE VIENT DU GRANT DE TABLE, pas d'un grant de colonne. Si quelqu'un
-- remplace un jour ce grant de table par des grants de colonnes en oubliant
-- `libelle`, PostgREST refuserait le `select` ENTIER : l'écran ne se
-- dégraderait pas, il DISPARAÎTRAIT.
select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.duo_options', 'libelle', 'SELECT'),
  'DUO-S49 authenticated LIT libelle (hérité du grant de TABLE)');

select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.duo_options', 'SELECT'),
  'DUO-S50 … et ce grant est bien porté par la TABLE, pas par des colonnes');

-- `anon` RESTE NU. Le plateau est du paramétrage de commerçant : il ne se lit
-- pas sans session, et il ne s'écrit certainement pas.
select ok(
  not pg_catalog.has_column_privilege(
    'anon', 'public.duo_options', 'libelle', 'SELECT'),
  'DUO-S51 anon ne LIT pas libelle');

select ok(
  not pg_catalog.has_column_privilege(
    'anon', 'public.duo_options', 'libelle', 'INSERT'),
  'DUO-S52 anon n''ÉCRIT pas libelle');


-- ════════════════════════════════════════════════════════════
-- 8. DUO-4 — LE PLATEAU SAISI DEVIENT JOUABLE
--
-- CE QUE CETTE SECTION FERME. L'en-tête de ce fichier portait, depuis DUO-1,
-- un aveu : « il ne prouve PAS qu'une option saisie est CHOISISSABLE ».
-- `duo_choose` validait le geste par `o.item_id = p_item_id`, qu'un `item_id`
-- nul n'égale jamais — un plateau entièrement saisi s'affichait, ouvrait la
-- porte publique, et refusait chaque clic. C'est cet aveu que la section
-- ci-dessous retire, et elle ne peut le retirer qu'en jouant VRAIMENT une
-- partie : `create` / `join` / `lock` / `duo_start` / choix / `duo_state`.
--
-- ── POURQUOI AUCUNE ORGANISATION NEUVE ──
--
-- S (plateau entièrement saisi) et M (plateau mixte, deux fiches et deux
-- libellés aux places 1-3 et 2-4) portent déjà exactement les deux formes dont
-- ces preuves ont besoin, et Z reste le voisin. V ne peut PAS servir : §3 lui
-- supprime deux fiches pour éprouver la cascade et le laisse à UNE option,
-- au-dessous du seuil de jouabilité — ce qui est le propos de DUO-S19 et qu'on
-- ne défait pas pour se donner un terrain de jeu. V retrouve un plateau en §8.5,
-- APRÈS les parties, et c'est aussi pourquoi les salles ne sont pas chez lui.
--
-- ── L'ORDRE DES SOUS-SECTIONS N'EST PAS LIBRE ──
--
-- §8.5 REMPLACE des plateaux. Le `on delete set null` de `duo_choices.option_id`
-- vide alors les places scellées des manches en cours — c'est voulu, et §6 de la
-- migration en dépend. Écrire §8.5 avant les parties rendrait donc les
-- assertions d'accord vertes ou rouges pour une raison qui n'est pas la leur.
-- ════════════════════════════════════════════════════════════

-- LE DROIT DU JEU, et lui seul. `create_player_lobby` n'exige plus que
-- `org_has_module_access(org, 'duo')` : ni le droit `vitrine`, ni une vitrine
-- publiée. Ne PAS semer `vitrine` ici est délibéré — c'est ce qui fait de S un
-- commerce qui joue au Duo SANS la carte, du premier octroi au dernier sceau.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
select o.id, 'duo', 'pass', 'backoffice',
       now() - interval '1 day', now() + interval '365 days'
  from (values
    ('da000000-0000-4000-8000-00000000000a'::uuid),
    ('da000000-0000-4000-8000-00000000000b'::uuid)) as o(id);

create temporary table d4 (nom text primary key, j jsonb) on commit drop;

-- ── LES SALLES ───────────────────────────────────────────────
-- On passe par les VRAIES RPC du socle L16 plutôt que d'écrire les lobbies en
-- direct : c'est plus long et cela prouve davantage — le plateau saisi doit
-- traverser le socle, pas seulement la fonction qu'on vient d'écrire.
--
-- SA : chez S, DEUX SAISIES DIFFÉRENTES.        SB : chez S, LA MÊME SAISIE.
-- MA : chez M, LA MÊME FICHE, par la PORTE D'HIER (`duo_choose`).
-- MB : chez M, UNE FICHE CONTRE UN LIBELLÉ.
-- MC : chez M, manche laissée OUVERTE — le sceau et les refus s'y éprouvent.
insert into d4 values ('sa', public.create_player_lobby(
  'da000000-0000-4000-8000-00000000000a', 'duo', 2, repeat('aa', 32), 'Hote SA'));
insert into d4 values ('saj', public.join_player_lobby(
  (select j->>'join_code' from d4 where nom = 'sa'), repeat('ab', 32), 'Invite SA'));
insert into d4 values ('sal', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'sa'), repeat('aa', 32)));

insert into d4 values ('sb', public.create_player_lobby(
  'da000000-0000-4000-8000-00000000000a', 'duo', 2, repeat('ba', 32), 'Hote SB'));
insert into d4 values ('sbj', public.join_player_lobby(
  (select j->>'join_code' from d4 where nom = 'sb'), repeat('bb', 32), 'Invite SB'));
insert into d4 values ('sbl', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'sb'), repeat('ba', 32)));

insert into d4 values ('ma', public.create_player_lobby(
  'da000000-0000-4000-8000-00000000000b', 'duo', 2, repeat('ca', 32), 'Hote MA'));
insert into d4 values ('maj', public.join_player_lobby(
  (select j->>'join_code' from d4 where nom = 'ma'), repeat('cb', 32), 'Invite MA'));
insert into d4 values ('mal', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'ma'), repeat('ca', 32)));

insert into d4 values ('mb', public.create_player_lobby(
  'da000000-0000-4000-8000-00000000000b', 'duo', 2, repeat('da', 32), 'Hote MB'));
insert into d4 values ('mbj', public.join_player_lobby(
  (select j->>'join_code' from d4 where nom = 'mb'), repeat('db', 32), 'Invite MB'));
insert into d4 values ('mbl', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mb'), repeat('da', 32)));

insert into d4 values ('mc', public.create_player_lobby(
  'da000000-0000-4000-8000-00000000000b', 'duo', 2, repeat('ea', 32), 'Hote MC'));
insert into d4 values ('mcj', public.join_player_lobby(
  (select j->>'join_code' from d4 where nom = 'mc'), repeat('eb', 32), 'Invite MC'));
insert into d4 values ('mcl', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mc'), repeat('ea', 32)));

select is((select j->>'state' from d4 where nom = 'sal'), 'locked',
  'DUO-S53 une salle Duo s''ouvre et se verrouille chez S, qui n''a AUCUNE fiche');

insert into d4 values ('sastart', public.duo_start(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'sa'), repeat('aa', 32)));
insert into d4 values ('sbstart', public.duo_start(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'sb'), repeat('ba', 32)));
insert into d4 values ('mastart', public.duo_start(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'ma'), repeat('ca', 32)));
insert into d4 values ('mbstart', public.duo_start(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mb'), repeat('da', 32)));
insert into d4 values ('mcstart', public.duo_start(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mc'), repeat('ea', 32)));

select is((select j->>'state' from d4 where nom = 'sastart'), 'ok',
  'DUO-S54 … et la manche démarre sur un plateau de trois LIBELLÉS');


-- ── 8.1 LA PROMESSE : UNE OPTION SAISIE SE SCELLE ────────────

insert into d4 values ('sac1', public.duo_choose_option(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'sa'),
  repeat('aa', 32),
  (select o.id from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000a'
      and o.libelle = 'Tarte aux pommes')));

select is((select j->>'state' from d4 where nom = 'sac1'), 'ok',
  'DUO-S55 UNE OPTION SAISIE SE SCELLE — le refus « unavailable » de DUO-1 est levé');

-- LE SCEAU EST ÉCRIT, ET IL PORTE LA PLACE. `item_id` reste nul : c'est
-- précisément ce qui rendait deux saisies indiscernables avant DUO-4.
select is(
  (select pg_catalog.jsonb_build_object(
            'place_connue', c.option_id is not null,
            'fiche', c.item_id,
            'nom', c.nom_fige)
     from public.duo_choices c
     join public.duo_rounds r on r.id = c.round_id
    where r.lobby_id = (select (j->>'lobby_id')::uuid from d4 where nom = 'sa')
      and c.member_token_hash = repeat('aa', 32)),
  '{"place_connue": true, "fiche": null, "nom": "Tarte aux pommes"}'::jsonb,
  'DUO-S56 … le sceau porte la PLACE, aucune fiche, et le libellé GRAVÉ');

insert into d4 values ('sac2', public.duo_choose_option(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'sa'),
  repeat('ab', 32),
  (select o.id from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000a'
      and o.libelle = 'Crème brûlée')));

select is((select j->'revelee' from d4 where nom = 'sac2'), 'true'::jsonb,
  'DUO-S57 … et le second sceau RÉVÈLE la manche, comme sur un plateau de fiches');

insert into d4 values ('savue', public.duo_state(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'sa'), repeat('aa', 32)));

-- LE VERDICT QUI N'EXISTAIT PAS. Avant DUO-4, les deux sceaux portaient
-- `item_id` nul : la garde `or` de `duo_state` coupait et `accord` restait
-- `null` — « on ne peut pas trancher » sur un plateau où rien n'est pourtant
-- ambigu. Deux places distinctes sont deux réponses distinctes.
select is((select j->'accord' from d4 where nom = 'savue'), 'false'::jsonb,
  'DUO-S58 DEUX SAISIES DIFFÉRENTES : le désaccord est NOMMÉ (il était « indécidable »)');

select is(
  (select (j->'mon_choix'->>'nom') || ' / ' || (j->'autre_choix'->>'nom')
     from d4 where nom = 'savue'),
  'Tarte aux pommes / Crème brûlée',
  'DUO-S59 … et les deux libellés gravés sont rendus CÔTE À CÔTE');

-- LA PLACE VOYAGE DANS LE DOCUMENT. Sans elle, l'écran ne peut pas surligner
-- l'option scellée quand celle-ci n'a pas de fiche : `item_id` y est nul.
select is(
  (select (j->'mon_choix'->>'option_id')::uuid from d4 where nom = 'savue'),
  (select o.id from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000a'
      and o.libelle = 'Tarte aux pommes'),
  'DUO-S60 … et `mon_choix` porte `option_id`, la seule clé qui désigne une saisie');

-- LA MÊME SAISIE DES DEUX CÔTÉS : l'accord, sur un plateau sans une seule fiche.
insert into d4 values ('sbc1', public.duo_choose_option(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'sb'),
  repeat('ba', 32),
  (select o.id from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000a'
      and o.libelle = 'Spaghetti con vongole')));
insert into d4 values ('sbc2', public.duo_choose_option(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'sb'),
  repeat('bb', 32),
  (select o.id from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000a'
      and o.libelle = 'Spaghetti con vongole')));
insert into d4 values ('sbvue', public.duo_state(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'sb'), repeat('bb', 32)));

select is((select j->'accord' from d4 where nom = 'sbvue'), 'true'::jsonb,
  'DUO-S61 LA MÊME SAISIE DES DEUX CÔTÉS : l''accord est NOMMÉ, sans une seule fiche');


-- ── 8.2 NON-RÉGRESSION : LA FICHE, PAR LA PORTE D'HIER ───────
--
-- `duo_choose(p_lobby_id, p_token_hash, p_item_id)` existe toujours, avec la
-- MÊME signature, et l'application déployée l'appelle encore pendant la fenêtre
-- de déploiement. Tout ce qui suit doit se comporter comme avant DUO-4 : c'est
-- la sous-section qui a le droit d'être ennuyeuse.

insert into d4 values ('mac1', public.duo_choose(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'ma'),
  repeat('ca', 32), 'da000004-0000-4000-8000-0000000000b1'));

select is((select j->>'state' from d4 where nom = 'mac1'), 'ok',
  'DUO-S62 la PORTE D''HIER scelle toujours une fiche (p_item_id, trois arguments)');

-- ELLE RÉSOUT LA FICHE VERS SA PLACE. Le sceau porte les DEUX : la fiche, comme
-- avant, et la place, que le délégué a écrite.
select is(
  (select pg_catalog.jsonb_build_object(
            'fiche', c.item_id,
            'place_est_celle_du_plateau',
              c.option_id = (select o.id from public.duo_options o
                              where o.organization_id = 'da000000-0000-4000-8000-00000000000b'
                                and o.item_id = 'da000004-0000-4000-8000-0000000000b1'),
            'nom', c.nom_fige)
     from public.duo_choices c
     join public.duo_rounds r on r.id = c.round_id
    where r.lobby_id = (select (j->>'lobby_id')::uuid from d4 where nom = 'ma')
      and c.member_token_hash = repeat('ca', 32)),
  '{"fiche": "da000004-0000-4000-8000-0000000000b1", "place_est_celle_du_plateau": true, "nom": "Fiche M1"}'::jsonb,
  'DUO-S63 … en résolvant la fiche vers SA place, et en gravant le nom de la CARTE');

insert into d4 values ('mac2', public.duo_choose(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'ma'),
  repeat('cb', 32), 'da000004-0000-4000-8000-0000000000b1'));
insert into d4 values ('mavue', public.duo_state(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'ma'), repeat('ca', 32)));

select is((select j->'accord' from d4 where nom = 'mavue'), 'true'::jsonb,
  'DUO-S64 LA MÊME FICHE des deux côtés : l''accord vaut ce qu''il valait hier');

select is((select j->'mon_choix'->>'item_id' from d4 where nom = 'mavue'),
  (select j->'autre_choix'->>'item_id' from d4 where nom = 'mavue'),
  'DUO-S65 … et les deux choix sont bien le même, rendus CÔTE À CÔTE');

-- LE PLATEAU MIXTE SE JOUE DES DEUX CÔTÉS À LA FOIS : une fiche contre un
-- libellé, dans la MÊME manche, par les DEUX portes.
insert into d4 values ('mbc1', public.duo_choose(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mb'),
  repeat('da', 32), 'da000004-0000-4000-8000-0000000000b2'));
insert into d4 values ('mbc2', public.duo_choose_option(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mb'),
  repeat('db', 32),
  (select o.id from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000b'
      and o.libelle = 'Suggestion du chef')));
insert into d4 values ('mbvue', public.duo_state(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mb'), repeat('da', 32)));

select is((select j->>'state' from d4 where nom = 'mbc2'), 'ok',
  'DUO-S66 PLATEAU MIXTE : l''un scelle une fiche, l''autre un libellé, dans la même manche');

select is((select j->'accord' from d4 where nom = 'mbvue'), 'false'::jsonb,
  'DUO-S67 … et le désaccord est NOMMÉ (une fiche n''est pas un libellé)');

-- LE SCEAU EST IMMUABLE, ET LE DOUBLE-CLIC NE PUNIT PAS. Salle MC, manche
-- laissée OUVERTE : une salle révélée sortirait en `unavailable` bien avant
-- d'atteindre la garde qu'on veut marcher ici.
insert into d4 values ('mcc1', public.duo_choose_option(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mc'),
  repeat('ea', 32),
  (select o.id from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000b'
      and o.libelle = 'Dessert surprise')));
insert into d4 values ('mcc1bis', public.duo_choose_option(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mc'),
  repeat('ea', 32),
  (select o.id from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000b'
      and o.libelle = 'Dessert surprise')));

select is((select j->>'state' from d4 where nom = 'mcc1bis'), 'ok',
  'DUO-S68 REJOUER LA MÊME PLACE est idempotent — le double-clic ne punit pas');

insert into d4 values ('mcc1autre', public.duo_choose_option(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mc'),
  repeat('ea', 32),
  (select o.id from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000b'
      and o.item_id = 'da000004-0000-4000-8000-0000000000b1')));

select is((select j->>'state' from d4 where nom = 'mcc1autre'), 'scelle',
  'DUO-S69 EN DÉSIGNER UNE AUTRE après avoir scellé : refus');

select is(
  (select c.nom_fige from public.duo_choices c
     join public.duo_rounds r on r.id = c.round_id
    where r.lobby_id = (select (j->>'lobby_id')::uuid from d4 where nom = 'mc')
      and c.member_token_hash = repeat('ea', 32)),
  'Dessert surprise',
  'DUO-S70 … et RIEN n''a été réécrit : le premier sceau tient');


-- ── 8.3 L'ISOLATION, ET LE REFUS QUI NE DIVULGUE RIEN ────────
--
-- Le voisin Z porte un plateau, et l'un de ses libellés — « Tarte aux pommes »
-- — est le MÊME que chez S. Un joueur de M qui présenterait la place de Z doit
-- être refusé, et refusé SANS que le refus se distingue de celui d'une place
-- qui n'existe nulle part. C'est l'indistinction par STRUCTURE : les deux cas
-- empruntent le même `return` parce que le `where` scope l'organisation, pas
-- parce qu'on a pensé à harmoniser deux messages.

insert into d4 values ('mcvoisin', public.duo_choose_option(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mc'),
  repeat('eb', 32),
  (select o.id from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000d'
      and o.libelle = 'Secret du voisin')));

insert into d4 values ('mcnulle', public.duo_choose_option(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mc'),
  repeat('eb', 32), 'da00ffff-0000-4000-8000-00000000ffff'));

select is((select j from d4 where nom = 'mcvoisin'),
  '{"state": "unavailable"}'::jsonb,
  'DUO-S71 une PLACE DU VOISIN est refusée');

select is((select j from d4 where nom = 'mcvoisin'),
  (select j from d4 where nom = 'mcnulle'),
  'DUO-S72 … par le MÊME document qu''une place inexistante : rien ne dit qu''elle existe ailleurs');

select is(
  (select pg_catalog.count(*)::int from public.duo_choices c
     join public.duo_rounds r on r.id = c.round_id
    where r.lobby_id = (select (j->>'lobby_id')::uuid from d4 where nom = 'mc')
      and c.member_token_hash = repeat('eb', 32)),
  0,
  'DUO-S73 … et RIEN n''a été écrit pour ce joueur');

-- LA PORTE D'HIER GARDE LA MÊME FRONTIÈRE : une fiche d'un autre commerce ne
-- résout aucune place, et emprunte le refus commun.
insert into d4 values ('mcfvoisin', public.duo_choose(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mc'),
  repeat('eb', 32), 'da000004-0000-4000-8000-0000000000c1'));

select is((select j from d4 where nom = 'mcfvoisin'),
  '{"state": "unavailable"}'::jsonb,
  'DUO-S74 la porte d''hier refuse aussi la FICHE d''un autre commerce');


-- ── 8.4 `set_duo_plateau` — LE PLATEAU ENTIER, EN UNE FOIS ───
--
-- V est le terrain : §3 l'a laissé à UNE option (les deux autres fiches ayant
-- été supprimées pour éprouver la cascade), et aucune salle n'y joue — le
-- remplacement de plateau qu'on va y faire ne peut donc pas fausser une manche
-- en cours. Son propriétaire est déjà celui qui appelait `set_duo_options`.

select lives_ok(
  format($$select public.set_duo_plateau(%L, %L::jsonb, %L)$$,
         'da000000-0000-4000-8000-00000000000c',
         '[{"item_id": "da000004-0000-4000-8000-0000000000c1"},
           {"libelle": "Café gourmand"},
           {"libelle": "Assiette du jour"}]',
         'da000001-0000-4000-8000-000000000001'),
  'DUO-S75 set_duo_plateau pose un plateau MIXTE en UN SEUL appel');

select is(
  (select pg_catalog.string_agg(
            coalesce(o.item_id::text, o.libelle), ' | ' order by o.ordre)
     from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000c'),
  'da000004-0000-4000-8000-0000000000c1 | Café gourmand | Assiette du jour',
  'DUO-S76 … dans l''ORDRE DU TABLEAU, chaque place avec son origine');

select ok(
  public.duo_jouable('da000000-0000-4000-8000-00000000000c'),
  'DUO-S77 … et le plateau ainsi posé est JOUABLE');

-- LE JOURNAL PORTE LE GESTE, sous le même nom d'action que `set_duo_options` :
-- c'est le même geste commerçant, et deux noms selon la RPC empruntée
-- couperaient en deux un historique qui se lit par organisation.
select ok(
  exists (select 1 from public.audit_logs a
           where a.organization_id = 'da000000-0000-4000-8000-00000000000c'
             and a.action = 'duo.options_set'
             and a.metadata->>'options' = '3'),
  'DUO-S78 … et le journal porte le geste, sous « duo.options_set »');

-- ── L'ATOMICITÉ, QUI EST TOUT L'OBJET DE CETTE FONCTION ──
--
-- L'écriture par table faisait `delete` puis `insert` en DEUX allers-retours :
-- une panne entre les deux laissait le plateau VIDE. Ici, un refus quel qu'il
-- soit doit laisser le plateau PRÉCÉDENT intact — c'est la propriété qu'on
-- achète, et la seule manière de la prouver est de faire échouer un appel après
-- le point où l'ancienne écriture avait déjà supprimé.
select throws_ok(
  format($$select public.set_duo_plateau(%L, %L::jsonb, %L)$$,
         'da000000-0000-4000-8000-00000000000c',
         '[{"libelle": "Un début honnête"},
           {"item_id": "da000004-0000-4000-8000-0000000000b1"}]',
         'da000001-0000-4000-8000-000000000001'),
  '22023', 'unknown duo option item',
  'DUO-S79 une FICHE DU VOISIN est refusée — du même refus qu''une fiche inconnue');

select is(
  (select pg_catalog.string_agg(
            coalesce(o.item_id::text, o.libelle), ' | ' order by o.ordre)
     from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000c'),
  'da000004-0000-4000-8000-0000000000c1 | Café gourmand | Assiette du jour',
  'DUO-S80 … ET LE PLATEAU PRÉCÉDENT EST INTACT : l''écriture est ATOMIQUE');

-- LE MÊME CONSTAT SUR UN REFUS QUI VIENT DE LA TABLE ET NON DE LA FONCTION.
-- `duo_options_libelle_valide` n'est PAS recopiée dans la RPC (une seule
-- autorité, pas de dérive) : c'est le `check` qui tranche, et il abandonne la
-- transaction ENTIÈRE. L'atomicité ne dépend donc pas de l'exhaustivité des
-- validations écrites en amont, et c'est ce que cette paire prouve.
select throws_ok(
  format($$select public.set_duo_plateau(%L, %L::jsonb, %L)$$,
         'da000000-0000-4000-8000-00000000000c',
         '[{"libelle": "Correct"}, {"libelle": " blanc en tête"}]',
         'da000001-0000-4000-8000-000000000001'),
  '23514', null,
  'DUO-S81 un libellé mal formé est refusé par la CONTRAINTE, seule autorité');

select is(
  (select pg_catalog.count(*)::int from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000c'),
  3,
  'DUO-S82 … et le plateau précédent est encore là, entier');

-- ── LES REFUS NOMMÉS ──
select throws_ok(
  format($$select public.set_duo_plateau(%L, %L::jsonb, %L)$$,
         'da000000-0000-4000-8000-00000000000c', '[{"libelle": "Seule"}]',
         'da000001-0000-4000-8000-000000000001'),
  '22023', 'invalid duo options count',
  'DUO-S83 moins de DEUX places : refus nommé');

select throws_ok(
  format($$select public.set_duo_plateau(%L, %L::jsonb, %L)$$,
         'da000000-0000-4000-8000-00000000000c',
         '[{"libelle":"a"},{"libelle":"b"},{"libelle":"c"},
           {"libelle":"d"},{"libelle":"e"},{"libelle":"f"},{"libelle":"g"}]',
         'da000001-0000-4000-8000-000000000001'),
  '22023', 'invalid duo options count',
  'DUO-S84 plus de SIX places : refus nommé');

select throws_ok(
  format($$select public.set_duo_plateau(%L, %L::jsonb, %L)$$,
         'da000000-0000-4000-8000-00000000000c',
         '[{"item_id": "da000004-0000-4000-8000-0000000000c1", "libelle": "Les deux"},
           {"libelle": "Correct"}]',
         'da000001-0000-4000-8000-000000000001'),
  '22023', 'invalid duo option origin',
  'DUO-S85 LES DEUX ORIGINES sur une place : refus nommé (règle de la contrainte, dite)');

select throws_ok(
  format($$select public.set_duo_plateau(%L, %L::jsonb, %L)$$,
         'da000000-0000-4000-8000-00000000000c',
         '[{}, {"libelle": "Correct"}]',
         'da000001-0000-4000-8000-000000000001'),
  '22023', 'invalid duo option origin',
  'DUO-S86 AUCUNE ORIGINE sur une place : même refus');

select throws_ok(
  format($$select public.set_duo_plateau(%L, %L::jsonb, %L)$$,
         'da000000-0000-4000-8000-00000000000c',
         '[{"item_id": "da000004-0000-4000-8000-0000000000c1"},
           {"item_id": "da000004-0000-4000-8000-0000000000c1"}]',
         'da000001-0000-4000-8000-000000000001'),
  '22023', 'duplicate duo option item',
  'DUO-S87 DEUX FOIS LA MÊME FICHE : refus nommé, avant la violation d''unicité');

select throws_ok(
  format($$select public.set_duo_plateau(%L, %L::jsonb, %L)$$,
         'da000000-0000-4000-8000-00000000000c',
         '[{"libelle": "Jumeau"}, {"libelle": "Jumeau"}]',
         'da000001-0000-4000-8000-000000000001'),
  '22023', 'duplicate duo option libelle',
  'DUO-S88 DEUX FOIS LE MÊME LIBELLÉ : refus nommé (deux places du même nom rendent l''accord indécidable)');

select throws_ok(
  format($$select public.set_duo_plateau(%L, %L::jsonb, %L)$$,
         'da000000-0000-4000-8000-00000000000c', '{"pas": "un tableau"}',
         'da000001-0000-4000-8000-000000000001'),
  '22023', 'invalid duo options payload',
  'DUO-S89 un document qui n''est pas un TABLEAU : refus nommé');

select throws_ok(
  format($$select public.set_duo_plateau(%L, %L::jsonb, %L)$$,
         'da000000-0000-4000-8000-00000000000c',
         '[{"item_id": "pas-un-uuid"}, {"libelle": "Correct"}]',
         'da000001-0000-4000-8000-000000000001'),
  '22023', 'invalid duo option item',
  'DUO-S90 un identifiant MALFORMÉ : refus nommé, jamais la 22P02 du moteur');

-- L'ACTEUR EST VÉRIFIÉ EN SQL, ET AVANT LA SÉLECTION : un non-habilité ne doit
-- rien apprendre du catalogue qu'il désigne, pas même par la forme du refus.
select throws_ok(
  format($$select public.set_duo_plateau(%L, %L::jsonb, %L)$$,
         'da000000-0000-4000-8000-00000000000c',
         '[{"libelle": "Intrus un"}, {"libelle": "Intrus deux"}]',
         'da000001-0000-4000-8000-000000000002'),
  '42501', 'not authorized',
  'DUO-S91 le propriétaire du VOISIN ne compose pas ce plateau');

select is(
  (select pg_catalog.count(*)::int from public.duo_options o
    where o.organization_id = 'da000000-0000-4000-8000-00000000000c'),
  3,
  'DUO-S92 … et son refus n''a rien effacé non plus');


-- ── 8.5 LES DROITS DES OBJETS NEUFS ──────────────────────────
--
-- Le défaut qui a coûté cinq lots cette semaine, dans sa forme « fonction » :
-- le défaut de Postgres est `execute` à PUBLIC, et une `security definer`
-- laissée à PUBLIC offre une surface qui n'a pas à exister.

select ok(
  pg_catalog.has_function_privilege(
    'service_role', 'public.duo_choose_option(uuid, text, uuid)', 'EXECUTE'),
  'DUO-S93 duo_choose_option : service_role OUI');
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated', 'public.duo_choose_option(uuid, text, uuid)', 'EXECUTE'),
  'DUO-S94 duo_choose_option : authenticated NON');
select ok(
  not pg_catalog.has_function_privilege(
    'anon', 'public.duo_choose_option(uuid, text, uuid)', 'EXECUTE'),
  'DUO-S95 duo_choose_option : anon NON');

select ok(
  pg_catalog.has_function_privilege(
    'service_role', 'public.set_duo_plateau(uuid, jsonb, uuid)', 'EXECUTE'),
  'DUO-S96 set_duo_plateau : service_role OUI');
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated', 'public.set_duo_plateau(uuid, jsonb, uuid)', 'EXECUTE'),
  'DUO-S97 set_duo_plateau : authenticated NON');
select ok(
  not pg_catalog.has_function_privilege(
    'anon', 'public.set_duo_plateau(uuid, jsonb, uuid)', 'EXECUTE'),
  'DUO-S98 set_duo_plateau : anon NON');

-- LA PORTE D'HIER GARDE SON DROIT. `create or replace` préserve l'ACL, mais un
-- `drop` accidentel la ramènerait au défaut PUBLIC : on le constate.
select ok(
  pg_catalog.has_function_privilege(
    'service_role', 'public.duo_choose(uuid, text, uuid)', 'EXECUTE'),
  'DUO-S99 la porte d''hier garde son droit : l''application déployée l''appelle encore');

-- ── LA COLONNE NEUVE, DANS LE RÉGIME DE SA TABLE ──
--
-- `duo_choices` est en régime TABLE PUR — contrairement à `duo_options`, dont
-- le régime MIXTE occupe §7. `option_id` hérite donc de tout, et RIEN n'a été
-- accordé : c'est ce que ces deux assertions constatent, l'une sur l'héritage,
-- l'autre sur le régime dont il découle. Poser un grant de colonne ici aurait
-- été le contresens exactement inverse de celui de DUO-1.
select ok(
  pg_catalog.has_column_privilege(
    'service_role', 'public.duo_choices', 'option_id', 'INSERT'),
  'DUO-S100 service_role ÉCRIT option_id (hérité du grant de TABLE, rien n''a été accordé)');

select ok(
  not exists (
    select 1 from pg_catalog.pg_attribute a
     where a.attrelid = 'public.duo_choices'::regclass
       and a.attnum > 0 and not a.attisdropped and a.attacl is not null),
  'DUO-S101 … et duo_choices n''a AUCUN grant de colonne : le régime est bien celui de la TABLE');

select ok(
  not pg_catalog.has_column_privilege(
    'anon', 'public.duo_choices', 'option_id', 'SELECT'),
  'DUO-S102 anon ne lit pas option_id');
select ok(
  not pg_catalog.has_column_privilege(
    'authenticated', 'public.duo_choices', 'option_id', 'SELECT'),
  'DUO-S103 authenticated non plus : le sceau est du ressort des RPC');



-- ── 8.6 LE REPLI SUR LA FICHE, ÉPROUVÉ POUR DE VRAI ─────────
--
-- `duo_state` tranche l'accord SUR LA PLACE quand les deux sceaux la portent,
-- et SUR LA FICHE sinon — l'expression d'avant DUO-4, conservée mot pour mot.
-- Ce repli n'est pas décoratif : il porte DEUX cas réels.
--
--   · le sceau posé AVANT ce lot, qui n'a pas de `option_id` ;
--   · la manche traversée par un REMPLACEMENT DE PLATEAU — le `on delete set
--     null` de la FK vide alors les places scellées, tandis qu'`item_id`, qui
--     pointe vers `vitrine_items`, survit.
--
-- Les deux se constatent de la même manière : une place à nul sur un sceau
-- existant. On la produit ici À LA MAIN plutôt que par un remplacement, pour
-- que l'assertion porte sur le REPLI et non sur la cascade — celle-ci a ses
-- propres preuves en §3.
--
-- Cette sous-section est en FIN de fichier parce qu'elle MUTE les sceaux de la
-- salle MA : la placer plus haut ferait porter les assertions de §8.2 sur des
-- lignes déjà retouchées.

update public.duo_choices c
   set option_id = null
  from public.duo_rounds r
 where r.id = c.round_id
   and r.lobby_id = (select (j->>'lobby_id')::uuid from d4 where nom = 'ma');

insert into d4 values ('mavue2', public.duo_state(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'ma'), repeat('ca', 32)));

select is((select j->'accord' from d4 where nom = 'mavue2'), 'true'::jsonb,
  'DUO-S104 UN SCEAU SANS PLACE garde le verdict d''hier : le repli sur item_id tient');

-- ET IL TIENT AUSSI DANS L'AUTRE SENS. Sans cette seconde assertion, DUO-S104
-- serait vert le jour où le repli rendrait « vrai » pour tout le monde.
update public.duo_choices c
   set option_id = null
  from public.duo_rounds r
 where r.id = c.round_id
   and r.lobby_id = (select (j->>'lobby_id')::uuid from d4 where nom = 'mb');

insert into d4 values ('mbvue2', public.duo_state(
  (select (j->>'lobby_id')::uuid from d4 where nom = 'mb'), repeat('da', 32)));

select is((select j->'accord' from d4 where nom = 'mbvue2'), 'false'::jsonb,
  'DUO-S105 … et sait toujours dire NON : une fiche contre un libellé sans place reste un désaccord');

select * from finish();
rollback;
