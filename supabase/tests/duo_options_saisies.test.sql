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
-- ── CE QUE CE FICHIER NE PROUVE PAS, ET IL FAUT LE DIRE ──
--
-- Il ne prouve PAS qu'une option saisie est CHOISISSABLE. `duo_choose` valide
-- encore le choix par `o.item_id = p_item_id`, qu'un `item_id` nul n'égale
-- jamais : une option saisie s'affiche mais ne se scelle pas encore. C'est un
-- manque connu et documenté (migration 20261126120000, §4), pas un oubli — et
-- écrire ici une assertion qui le contournerait donnerait un vert qui ment.
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

select * from finish();
rollback;
