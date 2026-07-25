-- ============================================================
-- Place de marché de campagnes (20260802120000) — modèles PRIVÉS.
--
-- Ce fichier a UN sujet principal : un modèle de campagne n'existe que
-- pour son organisation. Tout le reste (bornes du blueprint, unicité du
-- nom, attribution, cascades) est secondaire. L'ordre des sections suit
-- cette priorité : contraintes de table d'abord (rôle propriétaire),
-- puis le comportement réel des policies sous les rôles `authenticated`
-- et `anon`, puis les cascades.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ── Terrain : deux organisations étanches ────────────────────
insert into public.organizations (id, name, slug) values
  ('ea000000-0000-4000-8000-000000000001', 'Org A', 'tap-tpl-a'),
  ('ea000000-0000-4000-8000-000000000002', 'Org B', 'tap-tpl-b');

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('ea000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated',
   'owner-a@taptpl.local', '', now(), now()),
  ('ea000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated',
   'cashier-a@taptpl.local', '', now(), now()),
  ('ea000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated',
   'editor-b@taptpl.local', '', now(), now());

insert into public.organization_members (organization_id, user_id, role) values
  ('ea000000-0000-4000-8000-000000000001',
   'ea000000-0000-4000-8000-0000000000a1', 'owner'),
  ('ea000000-0000-4000-8000-000000000001',
   'ea000000-0000-4000-8000-0000000000a2', 'cashier'),
  ('ea000000-0000-4000-8000-000000000002',
   'ea000000-0000-4000-8000-0000000000b1', 'editor');

insert into public.campaigns (id, organization_id, name, status) values
  ('ea000000-0000-4000-8000-000000000011',
   'ea000000-0000-4000-8000-000000000001', 'Noël A', 'active'),
  ('ea000000-0000-4000-8000-000000000012',
   'ea000000-0000-4000-8000-000000000002', 'Noël B', 'active');

insert into public.campaign_templates
  (id, organization_id, name, description, blueprint, source_campaign_id, created_by)
values
  ('ea000000-0000-4000-8000-000000000021',
   'ea000000-0000-4000-8000-000000000001', 'Modèle A',
   'Recette de Noël de l''organisation A',
   -- Blueprint DÉLIBÉRÉMENT porteur d'un secret de jeu de défi : c'est ce
   -- que la recopie de wheels.skill_config met dans cette table, et donc
   -- ce qu'aucun non-éditeur ne doit pouvoir lire (section e).
   '{"game_type":"mystery_word","style":{},"prizes":[],"emails":{},
     "skill_config":{"mystery_word":{"word":"NOISETTE"}}}'::jsonb,
   'ea000000-0000-4000-8000-000000000011',
   'ea000000-0000-4000-8000-0000000000a1'),
  ('ea000000-0000-4000-8000-000000000022',
   'ea000000-0000-4000-8000-000000000002', 'Modèle B', null,
   '{"game_type":"scratch","style":{},"prizes":[],"emails":{}}'::jsonb,
   'ea000000-0000-4000-8000-000000000012',
   'ea000000-0000-4000-8000-0000000000b1');

-- ══════════════════════════════════════════════════════════════
-- (a) Bornes du blueprint
-- ══════════════════════════════════════════════════════════════
-- Un blueprint volumineux mais raisonnable passe (~8 Ko de texte) : la
-- borne ne doit pas gêner un modèle réel avec ses textes d'email.
select lives_ok(
  $$insert into public.campaign_templates (organization_id, name, blueprint)
    values ('ea000000-0000-4000-8000-000000000001', 'Modèle volumineux',
            jsonb_build_object('emails', repeat('texte de relance ', 500)))$$,
  'un blueprint réaliste (~8 Ko) est accepté'
);

-- Contenu à FORTE ENTROPIE : la borne doit se mesurer sur la taille réelle
-- du document, pas sur un `repeat` que pglz réduirait à rien si
-- pg_column_size était appliqué après compression.
-- NB : surtout PAS `gen_random_bytes(50000)` — pgcrypto plafonne cette
-- fonction à 1024 octets par appel et lève `39000 Length not in range`,
-- donc l'insertion échouait AVANT d'atteindre la contrainte (le test
-- passait pour la mauvaise raison en local, et tombait en CI).
-- 2000 × 32 caractères de md5 ≈ 64 Ko, largement au-delà des 32 Ko.
select throws_ok(
  $$insert into public.campaign_templates (organization_id, name, blueprint)
    values ('ea000000-0000-4000-8000-000000000001', 'Modèle obèse',
            jsonb_build_object(
              'emails',
              (select string_agg(md5(random()::text || g::text), '')
                 from generate_series(1, 2000) g)))$$,
  '23514', null,
  'blueprint au-delà de 32 Ko refusé (borne de taille finie)'
);

select throws_ok(
  $$insert into public.campaign_templates (organization_id, name, blueprint)
    values ('ea000000-0000-4000-8000-000000000001', 'Modèle scalaire',
            '"pas un objet"'::jsonb)$$,
  '23514', null,
  'un blueprint qui n''est pas un objet jsonb est refusé'
);

select throws_ok(
  $$insert into public.campaign_templates (organization_id, name, blueprint)
    values ('ea000000-0000-4000-8000-000000000001', '   ', '{}'::jsonb)$$,
  '23514', null,
  'un nom vide (ou blanc) est refusé'
);

select throws_ok(
  $$insert into public.campaign_templates (organization_id, name, description, blueprint)
    values ('ea000000-0000-4000-8000-000000000001', 'Description trop longue',
            repeat('d', 301), '{}'::jsonb)$$,
  '23514', null,
  'une description au-delà de 300 caractères est refusée'
);

-- ══════════════════════════════════════════════════════════════
-- (b) Unicité du nom PAR organisation
-- ══════════════════════════════════════════════════════════════
select throws_ok(
  $$insert into public.campaign_templates (organization_id, name, blueprint)
    values ('ea000000-0000-4000-8000-000000000001', 'Modèle A', '{}'::jsonb)$$,
  '23505', null,
  'deux modèles du même nom dans la même organisation sont refusés'
);
select lives_ok(
  $$insert into public.campaign_templates (organization_id, name, blueprint)
    values ('ea000000-0000-4000-8000-000000000002', 'Modèle A', '{}'::jsonb)$$,
  'le même nom est libre dans une AUTRE organisation (unicité org-scopée)'
);
delete from public.campaign_templates
 where organization_id = 'ea000000-0000-4000-8000-000000000002'
   and name = 'Modèle A';

-- ══════════════════════════════════════════════════════════════
-- (c) FK composite tenant : la campagne source reste dans l'org
-- ══════════════════════════════════════════════════════════════
select throws_ok(
  $$insert into public.campaign_templates
      (organization_id, name, blueprint, source_campaign_id)
    values ('ea000000-0000-4000-8000-000000000001', 'Source volée',
            '{}'::jsonb, 'ea000000-0000-4000-8000-000000000012')$$,
  '23503', null,
  'un modèle ne peut pas déclarer pour source la campagne d''une autre organisation'
);

-- ══════════════════════════════════════════════════════════════
-- (d) ACL déclarées : anon nulle part, colonnes verrouillées
-- ══════════════════════════════════════════════════════════════
select ok(
  not has_table_privilege('anon', 'public.campaign_templates', 'SELECT'),
  'anon n''a aucun privilège de lecture sur la table'
);
select ok(
  not has_table_privilege('anon', 'public.campaign_templates', 'INSERT'),
  'anon n''a aucun privilège d''écriture sur la table'
);
-- INVARIANT CENTRAL, vérifié sur les policies RÉELLES : aucune policy de
-- cette table ne s'applique à anon ni à public. Une future policy
-- « partage public » ferait tomber ce test — c'est le but.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'campaign_templates'
      and ('anon' = any (roles::text[]) or 'public' = any (roles::text[]))),
  0,
  'aucune policy de campaign_templates n''est ouverte à anon ou public'
);
select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.campaign_templates'::regclass),
  'la RLS est activée sur campaign_templates'
);
select ok(
  not has_column_privilege('authenticated', 'public.campaign_templates',
    'organization_id', 'UPDATE'),
  'organization_id n''est jamais modifiable par une session marchande'
);
select ok(
  not has_column_privilege('authenticated', 'public.campaign_templates',
    'created_by', 'INSERT'),
  'created_by n''est pas fourni par le client (posé par le trigger)'
);
select ok(
  has_column_privilege('authenticated', 'public.campaign_templates',
    'blueprint', 'UPDATE'),
  'le commerçant modifie bien le blueprint de ses modèles'
);

-- ══════════════════════════════════════════════════════════════
-- (e) Comportement réel des policies (rôle authenticated)
-- ══════════════════════════════════════════════════════════════
set local role authenticated;

-- ── Caissier de l'org A : la bibliothèque n'existe pas pour lui ──
-- FRONTIÈRE DE RÔLE : le blueprint recopie wheels.skill_config, donc les
-- SECRETS des jeux de défi (ici le mot mystère de « Modèle A ») et le
-- paramétrage commercial. wheels/campaigns/prizes sont fermées au
-- caissier (« … : editors » est `for all`, le SELECT compris) ; le modèle
-- qui les recopie doit l'être aussi, sinon la lecture de la table rend le
-- secret par la porte de derrière (`GET /rest/v1/campaign_templates
-- ?select=blueprint` avec son propre jeton de session).
set local "request.jwt.claim.sub" = 'ea000000-0000-4000-8000-0000000000a2';
select is(
  (select count(*)::int from public.campaign_templates),
  0, 'un caissier ne lit AUCUN modèle, pas même ceux de son organisation'
);
select is(
  (select count(*)::int from public.campaign_templates
    where id = 'ea000000-0000-4000-8000-000000000021'),
  0, 'un caissier ne lit pas un modèle de son org même ciblé par son id'
);
select is(
  (select count(*)::int from public.campaign_templates
    where blueprint #>> '{skill_config,mystery_word,word}' is not null),
  0, 'aucun secret de jeu de défi ne fuit vers un caissier via le blueprint'
);
select throws_ok(
  $$insert into public.campaign_templates (organization_id, name, blueprint)
    values ('ea000000-0000-4000-8000-000000000001', 'Modèle du caissier',
            '{}'::jsonb)$$,
  '42501', null,
  'un caissier ne crée pas de modèle (policy éditeur)'
);
with u as (
  update public.campaign_templates set name = 'Détourné'
   where id = 'ea000000-0000-4000-8000-000000000021'
  returning 1
)
select is((select count(*)::int from u), 0,
  'un caissier ne modifie aucun modèle');
with d as (
  delete from public.campaign_templates
   where id = 'ea000000-0000-4000-8000-000000000021'
  returning 1
)
select is((select count(*)::int from d), 0,
  'un caissier ne supprime aucun modèle');

-- ── Propriétaire de l'org A (rang éditeur) : CRUD complet ────
set local "request.jwt.claim.sub" = 'ea000000-0000-4000-8000-0000000000a1';
-- Contre-épreuve du test de fuite ci-dessus : le secret EST bien dans le
-- blueprint, et c'est le RÔLE — pas un blueprint vide — qui le cachait au
-- caissier.
select is(
  (select blueprint #>> '{skill_config,mystery_word,word}'
     from public.campaign_templates
    where id = 'ea000000-0000-4000-8000-000000000021'),
  'NOISETTE'::text,
  'un éditeur lit bien le blueprint complet de son modèle, secret inclus'
);
select is(
  (select count(*)::int from public.campaign_templates),
  2, 'un éditeur lit les modèles de SON organisation (et rien d''autre)'
);
select lives_ok(
  $$insert into public.campaign_templates
      (organization_id, name, blueprint, source_campaign_id)
    values ('ea000000-0000-4000-8000-000000000001', 'Modèle du propriétaire',
            '{"game_type":"flip_card"}'::jsonb,
            'ea000000-0000-4000-8000-000000000011')$$,
  'un éditeur enregistre un modèle dans son organisation'
);
-- L'auteur vient de la SESSION, jamais du corps de la requête.
select is(
  (select created_by from public.campaign_templates
    where organization_id = 'ea000000-0000-4000-8000-000000000001'
      and name = 'Modèle du propriétaire'),
  'ea000000-0000-4000-8000-0000000000a1'::uuid,
  'created_by est posé depuis la session marchande'
);
with u as (
  update public.campaign_templates set name = 'Modèle A (v2)'
   where id = 'ea000000-0000-4000-8000-000000000021'
  returning 1
)
select is((select count(*)::int from u), 1,
  'un éditeur modifie un modèle de son organisation');
-- Déplacer un modèle d'organisation est refusé au niveau du GRANT de
-- colonnes, avant même la policy.
select throws_ok(
  $$update public.campaign_templates
       set organization_id = 'ea000000-0000-4000-8000-000000000002'
     where id = 'ea000000-0000-4000-8000-000000000021'$$,
  '42501', null,
  'un éditeur ne peut pas déplacer un modèle vers une autre organisation'
);

-- ── Éditeur de l'org B : l'org A n'existe pas pour lui ───────
set local "request.jwt.claim.sub" = 'ea000000-0000-4000-8000-0000000000b1';
select is(
  (select count(*)::int from public.campaign_templates
    where organization_id = 'ea000000-0000-4000-8000-000000000001'),
  0, 'ISOLATION : un éditeur de B ne voit AUCUN modèle de A'
);
select is(
  (select count(*)::int from public.campaign_templates
    where id = 'ea000000-0000-4000-8000-000000000021'),
  0, 'ISOLATION : le modèle de A est invisible même ciblé par son id'
);
with u as (
  update public.campaign_templates set name = 'Volé par B'
   where id = 'ea000000-0000-4000-8000-000000000021'
  returning 1
)
select is((select count(*)::int from u), 0,
  'ISOLATION : un éditeur de B ne modifie pas un modèle de A');
with d as (
  delete from public.campaign_templates
   where id = 'ea000000-0000-4000-8000-000000000021'
  returning 1
)
select is((select count(*)::int from d), 0,
  'ISOLATION : un éditeur de B ne supprime pas un modèle de A');
select throws_ok(
  $$insert into public.campaign_templates (organization_id, name, blueprint)
    values ('ea000000-0000-4000-8000-000000000001', 'Injecté par B',
            '{}'::jsonb)$$,
  '42501', null,
  'ISOLATION : un éditeur de B ne crée pas de modèle chez A'
);
select is(
  (select count(*)::int from public.campaign_templates),
  1, 'un éditeur de B ne voit que le modèle de B'
);

-- ── anon : la table n'existe pas ─────────────────────────────
set local role anon;
select throws_ok(
  $$select count(*) from public.campaign_templates$$,
  '42501', 'permission denied for table campaign_templates',
  'un anonyme ne lit pas la bibliothèque de modèles'
);
select throws_ok(
  $$insert into public.campaign_templates (organization_id, name, blueprint)
    values ('ea000000-0000-4000-8000-000000000001', 'Anonyme', '{}'::jsonb)$$,
  '42501', 'permission denied for table campaign_templates',
  'un anonyme n''écrit pas de modèle'
);

reset role;
-- On repasse en session « système » (auth.uid() null), comme une
-- suppression menée par le service role. Sans cela, l'audit des
-- mutations marchandes écrirait dans audit_logs PENDANT la cascade de
-- suppression d'une organisation, et cette écriture référencerait une
-- organisation déjà supprimée.
select set_config('request.jwt.claim.sub', '', true);

-- ══════════════════════════════════════════════════════════════
-- (f) Immuabilité et cascades
-- ══════════════════════════════════════════════════════════════
-- Le garde-fou du trigger vaut aussi pour le service role / le
-- propriétaire de la table, que les GRANTs de colonnes n'arrêtent pas.
select throws_ok(
  $$update public.campaign_templates
       set organization_id = 'ea000000-0000-4000-8000-000000000002'
     where id = 'ea000000-0000-4000-8000-000000000021'$$,
  'P0001', 'organization_id is immutable',
  'un modèle ne change jamais d''organisation'
);
select throws_ok(
  $$update public.campaign_templates
       set created_by = 'ea000000-0000-4000-8000-0000000000b1'
     where id = 'ea000000-0000-4000-8000-000000000021'$$,
  'P0001', 'created_by is immutable',
  'l''auteur d''un modèle n''est pas réattribuable'
);

-- Campagne source supprimée : le lien tombe, le MODÈLE SURVIT (c'est
-- tout l'intérêt du `set null` sur la seule colonne source, un `set
-- null` nu aurait tenté d'annuler organization_id, NOT NULL).
delete from public.campaigns
 where id = 'ea000000-0000-4000-8000-000000000011';
select is(
  (select count(*)::int from public.campaign_templates
    where id = 'ea000000-0000-4000-8000-000000000021'),
  1, 'la suppression de la campagne source ne détruit pas le modèle'
);
select ok(
  (select source_campaign_id is null from public.campaign_templates
    where id = 'ea000000-0000-4000-8000-000000000021'),
  'la suppression de la campagne source coupe seulement la traçabilité'
);

-- Organisation supprimée : sa bibliothèque part avec elle.
delete from public.organizations
 where id = 'ea000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.campaign_templates
    where organization_id = 'ea000000-0000-4000-8000-000000000002'),
  0, 'la suppression d''une organisation emporte ses modèles (cascade)'
);
select ok(
  (select count(*) > 0 from public.campaign_templates
    where organization_id = 'ea000000-0000-4000-8000-000000000001'),
  'la bibliothèque de l''autre organisation est intacte'
);

select * from finish();
rollback;
