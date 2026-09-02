-- ============================================================
-- LES HORAIRES STRUCTURÉS DE LA VITRINE (VIT-31)
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. LE VALIDATEUR EST FERMÉ AUX DEUX RANGS. Huitième jour, jour manquant,
--      clé inconnue dans un créneau, heure malformée, `de >= a`, quatrième
--      créneau : tout est refusé, et `null` reste accepté — c'est la
--      compatibilité, pas une tolérance.
--   2. LE REFUS ARRIVE PAR LA CONTRAINTE, donc en 23514, donc avant la base.
--      Un validateur juste mais non branché serait une décoration.
--   3. LA COLONNE S'ÉCRIT VRAIMENT. C'est le piège RDV-12 : sur
--      `vitrine_settings`, `select` est de TABLE et `update` est COLONNE PAR
--      COLONNE. Une colonne neuve est donc lisible par héritage et MUETTE en
--      écriture tant qu'aucun `grant update` nommé ne la couvre — et ce défaut
--      ne casse rien de visible, l'action réussit et n'écrit pas.
--   4. LES DEUX ÉTATS PUBLIENT LA CLÉ, et le fuseau publié est celui de
--      L'ORGANISATION. Sans lui, « ouvert à l'instant T » se calculerait dans
--      le fuseau du VISITEUR : faux pour un touriste, faux d'une heure deux
--      fois par an. L'organisation de référence est ici à `Indian/Reunion`,
--      justement pour qu'une valeur codée en dur ne puisse pas passer.
--   5. LA COMPATIBILITÉ EST INTACTE. Une vitrine sans horaires structurés rend
--      la clé À `null` — la FORME du document ne dépend pas de son contenu,
--      motif des six listes de VIT-3 — et son `horaires_texte` comme son
--      `badge_ouverture` sortent exactement comme avant ce lot.
--   6. `horaires` N'EST PAS TRADUISIBLE. Un tableau de `HH:MM` ne se traduit
--      pas, et `vitrine_champs_traduisibles` ne doit pas grossir : le sélecteur
--      de langue s'ouvre sur un SEUIL de couverture, et un champ de plus au
--      dénominateur ferait retomber sous le seuil toutes les vitrines déjà
--      traduites, sans que personne n'ait rien fait.
--
-- ── CE QUE CE FICHIER NE PROUVE PAS, ET IL FAUT LE DIRE ──
--
-- Il ne prouve RIEN du calcul « ouvert / fermé ». Ce calcul n'existe pas en
-- SQL et ne doit pas y exister : il dépend de l'instant, donc d'une fonction
-- qu'on ne peut pas éprouver sans lui passer l'instant. Il vit dans
-- `src/lib/vitrine-horaires.ts` et il est éprouvé dans
-- `src/lib/vitrine-horaires.test.ts`, sur des instants FIXES.
--
-- Les données sont créées ICI, pas empruntées au seed : le fichier doit passer
-- sur une base VIDE comme sur une base SEMÉE.
-- ============================================================

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);


-- ── Fixtures ─────────────────────────────────────────────────
-- A : la vitrine de référence, AVEC horaires structurés. Son fuseau n'est PAS
--     celui de la métropole, et c'est délibéré : `Europe/Paris` est le défaut
--     de la colonne, donc la seule valeur qu'une clé codée en dur pourrait
--     imiter par accident.
-- B : la vitrine TÉMOIN, sans horaires structurés. Elle est ce que sont toutes
--     les vitrines existantes le jour de ce lot, et elle ne doit pas bouger.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('f7000000-0000-4000-8000-00000000000a', 'Horaires A', 'tap-horaires-a',
   'active', 'starter', 'Indian/Reunion', 6),
  ('f7000000-0000-4000-8000-00000000000b', 'Horaires B', 'tap-horaires-b',
   'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('f7000000-0000-4000-8000-00000000000a', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('f7000000-0000-4000-8000-00000000000b', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

insert into public.vitrine_settings
  (id, organization_id, slug, published, horaires_texte, badge_ouverture)
values
  ('f7100000-0000-4000-8000-00000000000a',
   'f7000000-0000-4000-8000-00000000000a', 'tap-horaires-avec', true,
   'Du mardi au dimanche, service continu l''été', 'Ouvert · 12h–23h'),
  ('f7100000-0000-4000-8000-00000000000b',
   'f7000000-0000-4000-8000-00000000000b', 'tap-horaires-sans', true,
   'Sur rendez-vous', 'Sur rendez-vous');


-- ────────────────────────────────────────────────────────────
-- VH-1..11 · LE VALIDATEUR, FERMÉ AUX DEUX RANGS
--
-- `null` d'abord : c'est le cas qui décide de la compatibilité de tout le lot.
-- Le refuser aurait empêché d'enregistrer toute vitrine qui n'a rien structuré
-- — c'est-à-dire toutes celles qui existent.
-- ────────────────────────────────────────────────────────────

select ok(public.is_valid_vitrine_horaires(null),
  'VH-1 · `null` est ACCEPTÉ : « rien n''a été structuré » est l''état de toutes les vitrines existantes');

select ok(public.is_valid_vitrine_horaires(
  '{"lundi":[],
    "mardi":[{"de":"09:00","a":"12:30"},{"de":"14:00","a":"23:00"}],
    "mercredi":[],"jeudi":[],"vendredi":[],"samedi":[],"dimanche":[]}'::jsonb),
  'VH-2 · une semaine complète, deux créneaux le mardi et six jours fermés, est acceptée');

select ok(not public.is_valid_vitrine_horaires(
  '{"lundi":[],"mardi":[],"mercredi":[],"jeudi":[],"vendredi":[],"samedi":[],
    "dimanche":[],"lundi_ferie":[]}'::jsonb),
  'VH-3 · un HUITIÈME jour est refusé : le vocabulaire est fermé, une clé qu''aucun écran ne lit ne s''écrit pas');

select ok(not public.is_valid_vitrine_horaires(
  '{"lundi":[],"mardi":[],"mercredi":[],"jeudi":[],"vendredi":[],"samedi":[]}'::jsonb),
  'VH-4 · un jour MANQUANT est refusé : sans cela « fermé le dimanche » et « rien dit du dimanche » deviendraient indiscernables');

select ok(not public.is_valid_vitrine_horaires(
  '{"lundi":[{"de":"09:00","a":"12:00","note":"sur réservation"}],
    "mardi":[],"mercredi":[],"jeudi":[],"vendredi":[],"samedi":[],"dimanche":[]}'::jsonb),
  'VH-5 · une clé INCONNUE dans un créneau est refusée — le second rang est fermé, comme dans is_valid_vitrine_theme');

select ok(not public.is_valid_vitrine_horaires(
  '{"lundi":[{"de":"9:00","a":"12:00"}],
    "mardi":[],"mercredi":[],"jeudi":[],"vendredi":[],"samedi":[],"dimanche":[]}'::jsonb),
  'VH-6 · « 9:00 » est refusé : le zéro en tête est ce qui fait que l''ordre du texte EST l''ordre de l''horloge');

select ok(not public.is_valid_vitrine_horaires(
  '{"lundi":[{"de":"18:00","a":"24:00"}],
    "mardi":[],"mercredi":[],"jeudi":[],"vendredi":[],"samedi":[],"dimanche":[]}'::jsonb),
  'VH-7 · « 24:00 » est refusé : minuit s''écrit 00:00 le lendemain, sans quoi deux écritures diraient le même instant');

select ok(not public.is_valid_vitrine_horaires(
  '{"lundi":[{"de":"12:00","a":"12:00"}],
    "mardi":[],"mercredi":[],"jeudi":[],"vendredi":[],"samedi":[],"dimanche":[]}'::jsonb),
  'VH-8 · `de = a` est refusé : un créneau de durée nulle n''ouvre rien et ferait afficher « ouvert » une seconde');

select ok(not public.is_valid_vitrine_horaires(
  '{"lundi":[{"de":"18:00","a":"02:00"}],
    "mardi":[],"mercredi":[],"jeudi":[],"vendredi":[],"samedi":[],"dimanche":[]}'::jsonb),
  'VH-9 · `de > a` est refusé : un créneau NE FRANCHIT PAS MINUIT, le bar de nuit s''écrit en deux créneaux sur deux jours');

select ok(not public.is_valid_vitrine_horaires(
  '{"lundi":[{"de":"08:00","a":"09:00"},{"de":"10:00","a":"11:00"},
             {"de":"12:00","a":"13:00"},{"de":"14:00","a":"15:00"}],
    "mardi":[],"mercredi":[],"jeudi":[],"vendredi":[],"samedi":[],"dimanche":[]}'::jsonb),
  'VH-10 · un QUATRIÈME créneau est refusé : trois suffisent au commerce qui coupe deux fois, et la borne se lit à l''écran');

select ok(not public.is_valid_vitrine_horaires(
  '{"lundi":{"de":"09:00","a":"12:00"},
    "mardi":[],"mercredi":[],"jeudi":[],"vendredi":[],"samedi":[],"dimanche":[]}'::jsonb),
  'VH-11 · un jour qui n''est pas un TABLEAU est refusé AVANT toute lecture de créneau : jsonb_array_elements aurait levé au lieu de refuser');


-- ────────────────────────────────────────────────────────────
-- VH-12..13 · LA CONTRAINTE, ET NON LE SEUL VALIDATEUR
--
-- Un validateur juste mais non branché est une décoration. Ces deux
-- assertions passent par la TABLE : le refus doit arriver en 23514.
-- ────────────────────────────────────────────────────────────

select throws_ok(
  $$update public.vitrine_settings
       set horaires = '{"lundi":[{"de":"09:00","a":"12:00"}],"mardi":[],
                        "mercredi":[],"jeudi":[],"vendredi":[],"samedi":[],
                        "dimanche":[],"lundi_ferie":[]}'::jsonb
     where slug = 'tap-horaires-avec'$$,
  '23514',
  null,
  'VH-12 · la CONTRAINTE de colonne refuse un huitième jour : le validateur est branché, pas seulement écrit'
);

update public.vitrine_settings
   set horaires = '{"lundi":[],
                    "mardi":[{"de":"09:00","a":"12:30"},{"de":"14:00","a":"23:00"}],
                    "mercredi":[],"jeudi":[],"vendredi":[],"samedi":[],"dimanche":[]}'::jsonb
 where slug = 'tap-horaires-avec';

select is(
  (select horaires -> 'mardi' -> 1 ->> 'a'
     from public.vitrine_settings where slug = 'tap-horaires-avec'),
  '23:00',
  'VH-13 · une semaine valide s''écrit et se relit : la contrainte laisse passer ce qu''elle doit laisser passer'
);


-- ────────────────────────────────────────────────────────────
-- VH-14..16 · LE DROIT D'ÉCRITURE — LE PIÈGE RDV-12
--
-- Sans `grant update (horaires)`, `saveVitrineSettings` échoue sur
-- « permission denied for column » — ou, si l'action écrit colonne par
-- colonne, réussit en n'écrivant PAS les horaires. Le second cas est le pire :
-- le commerçant repart en croyant sa semaine enregistrée.
-- ────────────────────────────────────────────────────────────

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.vitrine_settings', 'horaires', 'UPDATE'),
  'VH-14 · horaires SE MODIFIE : sans ce grant nommé, le lot entier serait inerte et l''enregistrement muet'
);

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.vitrine_settings', 'horaires', 'SELECT'),
  'VH-15 · horaires SE LIT : le grant de TABLE le couvre, et s''il devenait un grant de colonnes qui l''oublie, PostgREST refuserait le select entier'
);

select ok(
  not pg_catalog.has_column_privilege(
    'anon', 'public.vitrine_settings', 'horaires', 'UPDATE'),
  'VH-16 · anon ne modifie rien, horaires compris : le visiteur ne règle pas la semaine du commerce'
);


-- ────────────────────────────────────────────────────────────
-- VH-17..19 · LES DEUX ÉTATS PUBLIENT CE QU'IL FAUT POUR CALCULER
--
-- Les horaires SEULS ne suffisent pas : « ouvert » se calcule dans le fuseau
-- du COMMERCE. VH-18 le prouve sur une organisation qui n'est PAS à Paris,
-- pour qu'une valeur codée en dur ne puisse pas passer inaperçue.
-- ────────────────────────────────────────────────────────────

select is(
  (public.vitrine_public_state('tap-horaires-avec')
     -> 'identite' -> 'horaires' -> 'mardi' -> 1 ->> 'a'),
  '23:00',
  'VH-17 · vitrine_public_state publie les horaires structurés dans `identite`'
);

select is(
  (public.vitrine_public_state('tap-horaires-avec')
     -> 'identite' ->> 'timezone'),
  'Indian/Reunion',
  'VH-18 · le fuseau publié est celui de L''ORGANISATION : sans lui, « ouvert » se calculerait dans le fuseau du visiteur'
);

select is(
  (public.vitrine_dashboard_state('f7000000-0000-4000-8000-00000000000a')
     -> 'settings' -> 'horaires' -> 'mardi' -> 1 ->> 'a'),
  '23:00',
  'VH-19 · vitrine_dashboard_state publie les horaires : l''atelier relit ce qu''il écrit, sinon le formulaire se vide à chaque rechargement'
);


-- ────────────────────────────────────────────────────────────
-- VH-20..21 · LA COMPATIBILITÉ, SUR LA VITRINE TÉMOIN
--
-- Elle n'a rien structuré, comme toutes les vitrines existantes. La CLÉ
-- existe quand même — la forme du document ne dépend pas de son contenu, motif
-- des six listes de VIT-3 — et tout le reste sort inchangé.
-- ────────────────────────────────────────────────────────────

select is(
  (public.vitrine_public_state('tap-horaires-sans')
     -> 'identite' -> 'horaires')::text,
  'null',
  'VH-20 · sans horaires structurés, la clé EXISTE et vaut null : une clé qui apparaît et disparaît se teste à chaque lecture'
);

select is(
  (public.vitrine_public_state('tap-horaires-sans')
     -> 'identite' ->> 'horaires_texte')
  || ' / ' ||
  (public.vitrine_public_state('tap-horaires-sans')
     -> 'identite' ->> 'badge_ouverture'),
  'Sur rendez-vous / Sur rendez-vous',
  'VH-21 · le texte libre et la pastille écrite à la main sortent INCHANGÉS : aucune vitrine existante ne change d''apparence'
);


-- ────────────────────────────────────────────────────────────
-- VH-22 · `horaires` N'EST PAS TRADUISIBLE, ET C'EST UN INVARIANT
--
-- Un tableau de `HH:MM` ne se traduit pas. L'ajouter à
-- `vitrine_champs_traduisibles` aurait grossi le DÉNOMINATEUR de la couverture,
-- donc fait retomber sous le seuil du sélecteur de langue toutes les vitrines
-- déjà traduites — sans que personne n'ait rien fait. C'est exactement
-- l'avertissement écrit au-dessus du calcul de couverture dans
-- vitrine_public_state.
-- ────────────────────────────────────────────────────────────

select is(
  (select pg_catalog.count(*)::integer
     from public.vitrine_champs_traduisibles(
            'f7000000-0000-4000-8000-00000000000a', true) c
    where c.champ = 'horaires'),
  0,
  'VH-22 · `horaires` n''entre PAS dans les champs traduisibles : le seuil du sélecteur de langue ne bouge pas'
);


select * from finish();
rollback;
