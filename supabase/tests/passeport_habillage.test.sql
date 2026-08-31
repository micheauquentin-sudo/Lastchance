-- ============================================================
-- L'HABILLAGE DU PASSEPORT — 20261116120000 (FID-3a)
--
-- Trois familles d'assertions, et la troisième est celle qui a manqué
-- trois fois cette semaine :
--
--   PH-1..7   la FORME  — la colonne existe, n'accepte qu'un objet, et
--                         l'ABSENCE d'habillage reste un état valide.
--   PH-8..12  les DROITS — colonne par colonne sur cette table : une
--                         colonne neuve n'hérite de rien, et PostgREST
--                         refuse le `select` ENTIER s'il en manque un.
--   PH-13..15 le CLOISONNEMENT — le grant dit quelles COLONNES, la policy
--                         dit quelles LIGNES. On vérifie la seconde en
--                         ÉCRIVANT depuis une vraie session marchande,
--                         pas en lisant le catalogue.
-- ============================================================

begin;
select plan(15);


-- ────────────────────────────────────────────────────────────
-- Fixtures — deux organisations voisines, un éditeur dans chacune.
--
-- Le voisin naît DÉJÀ HABILLÉ (`espace`) : sans cela, « le style du voisin
-- n'a pas changé » serait vrai parce qu'il valait null des deux côtés, et
-- l'assertion PH-14 passerait sans rien prouver.
-- ────────────────────────────────────────────────────────────

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1d30000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'editeur-fid3a@test.local', '', now(), now()),
  ('f1d30000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'voisin-fid3a@test.local', '', now(), now());

insert into public.organizations (id, name, slug) values
  ('f1d30000-0000-4000-8000-0000000000a1', 'Passeport FID3A',
   'fid3a-a-' || pg_catalog.substr(gen_random_uuid()::text, 1, 8)),
  ('f1d30000-0000-4000-8000-0000000000a2', 'Passeport FID3A Voisin',
   'fid3a-b-' || pg_catalog.substr(gen_random_uuid()::text, 1, 8));

insert into public.organization_members (organization_id, user_id, role) values
  ('f1d30000-0000-4000-8000-0000000000a1', 'f1d30000-0000-4000-8000-000000000001', 'editor'),
  ('f1d30000-0000-4000-8000-0000000000a2', 'f1d30000-0000-4000-8000-000000000002', 'editor');

insert into public.loyalty_programs
  (id, organization_id, name, silver_threshold, gold_threshold)
values
  ('f1d30000-0000-4000-8000-0000000000b1', 'f1d30000-0000-4000-8000-0000000000a1',
   'Passeport de la maison', 5, 10),
  ('f1d30000-0000-4000-8000-0000000000b2', 'f1d30000-0000-4000-8000-0000000000a2',
   'Passeport du voisin', 5, 10);

update public.loyalty_programs
   set style = '{"fond": "espace"}'::jsonb
 where id = 'f1d30000-0000-4000-8000-0000000000b2';


-- ────────────────────────────────────────────────────────────
-- PH-1..2 · LA COLONNE EXISTE, ET L'ABSENCE DE CHOIX EST UN ÉTAT
--
-- Nullable délibérément : `null` = « aucun habillage choisi », donc le
-- rendu par défaut — celui que tous les programmes déjà en production
-- affichent aujourd'hui, sans réécriture de ligne.
-- ────────────────────────────────────────────────────────────

select has_column(
  'public', 'loyalty_programs', 'style',
  'PH-1 · loyalty_programs.style existe — le passeport peut enfin être habillé'
);

select col_is_null(
  'public', 'loyalty_programs', 'style',
  'PH-2 · style est nullable : ne rien choisir reste un état valide, pas une erreur'
);


-- ────────────────────────────────────────────────────────────
-- PH-3..6 · LE CHECK NE PARLE QUE DE LA FORME
--
-- Un OBJET, et rien d'autre — c'est ce qui donne un sens à `style ->> 'fond'`.
-- Aucune énumération des fonds : le catalogue (`FOND_KEYS`,
-- src/lib/fonds-ecran.ts) bouge, et le graver ici invaliderait des lignes
-- déjà enregistrées au premier retrait d'image.
--
-- PH-3 le montre : `fond_invente_qui_nexiste_pas` est acceptée par la BASE.
-- C'est le schéma zod qui refuse une clé inconnue à l'écriture, et qui
-- retombe sur « pas de fond » à la lecture.
-- ────────────────────────────────────────────────────────────

select lives_ok(
  $$update public.loyalty_programs
       set style = '{"fond": "fond_invente_qui_nexiste_pas", "couleur": "#211d16"}'::jsonb
     where id = 'f1d30000-0000-4000-8000-0000000000b1'$$,
  'PH-3 · un objet passe, clés libres comprises — la base valide la forme, le code valide le contenu'
);

select throws_ok(
  $$update public.loyalty_programs
       set style = '["espace"]'::jsonb
     where id = 'f1d30000-0000-4000-8000-0000000000b1'$$,
  '23514',
  null,
  'PH-4 · un TABLEAU est refusé : style ->> ''fond'' n''aurait aucun sens dessus'
);

select throws_ok(
  $$update public.loyalty_programs
       set style = '"espace"'::jsonb
     where id = 'f1d30000-0000-4000-8000-0000000000b1'$$,
  '23514',
  null,
  'PH-5 · un SCALAIRE est refusé — un fond seul n''est pas un habillage'
);

-- Le piège de forme le plus discret : `'null'::jsonb` n'est PAS le NULL SQL.
-- C'est un scalaire JSON, il traverse un `is null` sans le déclencher, et il
-- ferait échouer toute lecture qui suppose un objet.
select throws_ok(
  $$update public.loyalty_programs
       set style = 'null'::jsonb
     where id = 'f1d30000-0000-4000-8000-0000000000b1'$$,
  '23514',
  null,
  'PH-6 · le null JSON est refusé : il n''est pas le NULL SQL et ne vaut pas « aucun choix »'
);


-- ────────────────────────────────────────────────────────────
-- PH-7 · UN PROGRAMME SANS STYLE RESTE PARFAITEMENT LISIBLE
--
-- L'absence d'habillage n'est pas une anomalie à réparer : c'est l'état de
-- tous les programmes existants au moment où cette migration s'applique.
-- ────────────────────────────────────────────────────────────

do $$
begin
  insert into public.loyalty_programs
    (id, organization_id, name, silver_threshold, gold_threshold)
  values
    ('f1d30000-0000-4000-8000-0000000000b3', 'f1d30000-0000-4000-8000-0000000000a1',
     'Passeport jamais habille', 5, 10);
end
$$;

select is(
  (select style is null and name = 'Passeport jamais habille'
     from public.loyalty_programs
    where id = 'f1d30000-0000-4000-8000-0000000000b3'),
  true,
  'PH-7 · un programme créé sans style vaut null et se relit sans erreur — habillage par défaut'
);


-- ────────────────────────────────────────────────────────────
-- PH-8..10 · LES DROITS DE LECTURE ET D'ÉCRITURE
--
-- `loyalty_programs` accorde COLONNE PAR COLONNE (20260725120000 : le secret
-- du code tournant ne doit jamais sortir). Une colonne ajoutée ensuite
-- n'hérite de rien — c'est exactement ce qui a cassé `jackpot_campaign_id`
-- (20261112130000, réparé par 20261112150000) : PostgREST refuse le `select`
-- ENTIER, et le dashboard rend une page introuvable.
-- ────────────────────────────────────────────────────────────

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.loyalty_programs', 'style', 'SELECT'),
  'PH-8 · style est LISIBLE par authenticated : sans lui l''écran de configuration disparaît en entier'
);

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.loyalty_programs', 'style', 'UPDATE'),
  'PH-9 · style est MODIFIABLE par authenticated — c''est l''éditeur qui enregistre l''habillage'
);

-- Le rendu PUBLIC du passeport ne passe pas par `anon` : src/lib/loyalty-context.ts
-- lit avec `createAdminClient`, donc le rôle service_role, couvert par le grant
-- DE TABLE de 20260725120000. On le vérifie plutôt que de le supposer.
select ok(
  pg_catalog.has_column_privilege(
    'service_role', 'public.loyalty_programs', 'style', 'SELECT'),
  'PH-10 · style est lisible par service_role — c''est par lui que la page joueur peint l''habillage'
);


-- ────────────────────────────────────────────────────────────
-- PH-11..12 · CE QUI DOIT RESTER FERMÉ À `anon`
-- ────────────────────────────────────────────────────────────

select ok(
  not pg_catalog.has_column_privilege(
    'anon', 'public.loyalty_programs', 'style', 'SELECT'),
  'PH-11 · anon ne LIT pas style : le passeport n''expose rien en direct'
);

select ok(
  not pg_catalog.has_column_privilege(
    'anon', 'public.loyalty_programs', 'style', 'UPDATE'),
  'PH-12 · anon ne MODIFIE pas style : personne ne rhabille le passeport d''un commerçant'
);


-- ────────────────────────────────────────────────────────────
-- PH-13..14 · LE CLOISONNEMENT, ÉCRIT DEPUIS UNE VRAIE SESSION
--
-- Les cinq assertions ci-dessus lisent le CATALOGUE : elles prouvent qu'un
-- droit de colonne existe, jamais qu'il s'arrête au bon tenant. Celles-ci
-- ÉCRIVENT, sous le rôle `authenticated` et l'identité d'un éditeur réel.
--
-- Le contrôle NÉGATIF est le seul qui compte vraiment, et il ne lève pas
-- d'exception : la policy `using (is_org_editor(organization_id))` rend la
-- ligne du voisin INVISIBLE à l'update, qui touche donc zéro ligne et rend
-- un succès silencieux. La preuve est donc la valeur d'APRÈS, relue hors
-- session — pas l'absence d'erreur.
--
-- Le contrôle POSITIF qui le précède est ce qui empêche PH-14 d'être vrai
-- pour la mauvaise raison : sans lui, un grant oublié ferait échouer les
-- DEUX écritures et la suite resterait verte.
-- ────────────────────────────────────────────────────────────

set local role authenticated;
set local "request.jwt.claim.sub" = 'f1d30000-0000-4000-8000-000000000001';

-- Chez soi : autorisé.
update public.loyalty_programs
   set style = '{"fond": "restaurant"}'::jsonb
 where id = 'f1d30000-0000-4000-8000-0000000000b1';

-- Chez le voisin : la policy borne la ligne, l'update ne trouve rien.
update public.loyalty_programs
   set style = '{"fond": "noel"}'::jsonb
 where id = 'f1d30000-0000-4000-8000-0000000000b2';

reset role;

select is(
  (select style ->> 'fond' from public.loyalty_programs
    where id = 'f1d30000-0000-4000-8000-0000000000b1'),
  'restaurant',
  'PH-13 · un éditeur habille SON passeport — le droit de colonne et la policy le laissent passer'
);

select is(
  (select style ->> 'fond' from public.loyalty_programs
    where id = 'f1d30000-0000-4000-8000-0000000000b2'),
  'espace',
  'PH-14 · il n''habille PAS celui du voisin : la policy borne la ligne, le style d''origine tient'
);


-- ────────────────────────────────────────────────────────────
-- PH-15 · CE QUE CE CHANTIER NE DEVAIT PAS OUVRIR
--
-- `rotating_secret` n'a rien à voir avec l'habillage — et c'est justement
-- pourquoi il est vérifié ici : FID-3a manipule la liste des grants de
-- colonnes de cette table, et une liste de grants se manipule mal. Un secret
-- lisible par une session marchande rendrait falsifiable tout code de
-- validation du comptoir.
-- ────────────────────────────────────────────────────────────

select ok(
  not pg_catalog.has_column_privilege(
    'authenticated', 'public.loyalty_programs', 'rotating_secret', 'SELECT'),
  'PH-15 · rotating_secret reste hors de portée d''une session marchande'
);


select * from finish();
rollback;
