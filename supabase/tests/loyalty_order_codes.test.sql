-- ============================================================
-- QR de commande unique (cahier §7) — ce que ce fichier PROUVE :
--
--   0. LA PORTE, lue dans le CATALOGUE. Deux moitiés indissociables, parce
--      qu'ADR-082 mord précisément entre les deux : l'ANCIENNE signature
--      4-aire n'existe plus (une surcharge oubliée resterait appelable avec
--      l'ancien comportement), et la NOUVELLE 5-aire est refermée (une
--      fonction fraîchement créée naît avec EXECUTE à PUBLIC).
--   1. USAGE UNIQUE. Un jeton consommé ne retamponne rien — ni pour le même
--      passeport, ni pour un autre. C'est LA règle du §7, et rien d'autre
--      dans le schéma ne la porte : `loyalty_stamps` n'a aucun index
--      d'unicité (20260725120000:186-187).
--   2. CLOISONNEMENT. Un jeton d'un autre commerçant rend le MÊME
--      `order_invalid` qu'un jeton inventé — pas d'oracle — et reste
--      intact chez son propriétaire.
--   3. CONTOURNEMENT DU COOLDOWN, dans les deux sens. Deux commandes le même
--      jour valent deux tampons ; ET le contournement ne fuit PAS vers le
--      code tournant, qui continue de rendre `too_soon` dans la fenêtre.
--      C'est la moitié qu'on oublie : élargir une exception sans vérifier
--      qu'elle reste bornée revient à supprimer la règle.
--   4. NON-RÉGRESSION rotating/staff. Les appels à 3 et 4 valeurs traversent
--      désormais la NOUVELLE signature (par le `default null`) et se
--      comportent à l'identique. C'est l'assertion la plus importante du
--      fichier : le module tourne en production.
--   5. UN PROGRAMME EN PAUSE NE BRÛLE PAS LE JETON. Le client dont la
--      livraison arrive pendant une pause ne perd pas son tampon.
--   6. RLS réelle : l'éditeur émet chez lui et pas chez le voisin, le
--      caissier lit, l'éditeur d'à côté ne voit rien, l'anonyme est refusé.
--
-- ── CE QUE CE FICHIER NE PEUT PAS PROUVER, ET C'EST ÉCRIT ICI ──
--
-- `supabase test db` s'exécute en tant que `postgres`, SUPERUTILISATEUR :
-- les GRANTS ne le contraignent pas et la RLS ne s'applique pas. La
-- fermeture de la fonction à `anon` est donc éprouvée par
-- `has_function_privilege` — qui interroge le catalogue — et JAMAIS par une
-- tentative d'appel. Confondre les deux ferait croire à une preuve de
-- fermeture là où il n'y en a aucune. La section 6 descend explicitement de
-- superutilisateur (`set local role authenticated`) pour éprouver la RLS
-- pour de vrai.
--
-- Même remarque pour la garde `auth.role() = 'service_role'` : sous
-- `postgres`, `auth.role()` est null et la fonction LÈVE. La revendication
-- de rôle est donc posée à la main, comme le fait PostgREST.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
-- Plan EXPLICITE, et non `no_plan()` : seul le plan distingue « tout est
-- vert » de « le fichier s'est arrêté avant d'avoir tout demandé ». La
-- section 6 descend de superutilisateur — une erreur de plomberie y
-- interromprait le fichier en silence.
select plan(71);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ════════════════════════════════════════════════════════════
-- 0. LA PORTE, LUE DANS LE CATALOGUE (ADR-082)
-- ════════════════════════════════════════════════════════════

-- L'ANCIENNE signature. `to_regprocedure` rend NULL au lieu de lever quand
-- la fonction n'existe pas : c'est la seule façon d'interroger l'absence.
-- `has_function_privilege` sur une signature disparue LÈVERAIT, et le
-- fichier échouerait sur une erreur au lieu de rendre un verdict.
select is(
  pg_catalog.to_regprocedure('public.record_loyalty_stamp(uuid,text,text,uuid)')::text,
  null,
  'la signature 4-aire N''EXISTE PLUS (drop explicite, pas un create or replace)'
);

-- Le compte des surcharges. Si `create or replace` avait été employé sur une
-- arité différente, il y en aurait DEUX : l'ancienne (toujours appelable,
-- sans jeton de commande) et la neuve. Le diff ne montre jamais ce défaut.
select is(
  (select count(*)::int from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_loyalty_stamp'),
  1,
  'record_loyalty_stamp n''a qu''UNE surcharge (aucune ancienne survivante)'
);

-- La signature vivante, NOMS COMPRIS. `pg_get_function_identity_arguments`
-- rend la forme d'un ALTER FUNCTION, donc les noms de paramètres — et c'est
-- une bonne nouvelle : le code applicatif appelle cette RPC en arguments
-- NOMMÉS (`admin.rpc("record_loyalty_stamp", { p_program_id: … })`,
-- src/actions/loyalty.ts). Renommer un paramètre casserait l'appel sans
-- toucher une seule ligne de TypeScript ; cette assertion l'attrape.
select is(
  (select pg_catalog.pg_get_function_identity_arguments(p.oid)
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_loyalty_stamp'),
  'p_program_id uuid, p_member_token_hash text, p_rotating_code text, p_validated_by uuid, p_order_token text',
  'la seule surcharge vivante est la 5-aire, aux noms de paramètres attendus'
);

select is(
  (select p.prosecdef from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_loyalty_stamp'),
  true,
  'record_loyalty_stamp est toujours security definer'
);

select is(
  (select pg_catalog.array_to_string(p.proconfig, ',') from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_loyalty_stamp'),
  'search_path=""',
  'record_loyalty_stamp fige son search_path a la chaine vide'
);

select is(
  has_function_privilege('anon',
    'public.record_loyalty_stamp(uuid,text,text,uuid,text)', 'EXECUTE'),
  false,
  'anon ne peut pas executer la nouvelle signature'
);

select is(
  has_function_privilege('authenticated',
    'public.record_loyalty_stamp(uuid,text,text,uuid,text)', 'EXECUTE'),
  false,
  'authenticated ne peut pas executer la nouvelle signature'
);

select is(
  has_function_privilege('service_role',
    'public.record_loyalty_stamp(uuid,text,text,uuid,text)', 'EXECUTE'),
  true,
  'service_role peut executer la nouvelle signature'
);

-- PUBLIC, lu DIRECTEMENT dans l'ACL. Deux moitiés indissociables :
--   · `proacl is not null` — une ACL NULLE signifie « privilèges par
--     DÉFAUT », c'est-à-dire EXECUTE à PUBLIC. C'est exactement l'état
--     d'une fonction fraîchement créée dont on a oublié le `revoke`, et
--     `aclexplode(null)` rend zéro ligne : sans cette première moitié, la
--     seconde verdirait précisément dans le cas qu'elle doit attraper.
--   · aucune entrée de grantee 0 (0 = PUBLIC dans pg_authid).
select isnt(
  (select p.proacl from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_loyalty_stamp'),
  null,
  'l''ACL est POSEE — une ACL nulle vaudrait EXECUTE a PUBLIC par defaut'
);

select is(
  (select count(*)::int
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join lateral pg_catalog.aclexplode(p.proacl) a
    where n.nspname = 'public'
      and p.proname = 'record_loyalty_stamp'
      and a.grantee = 0),
  0,
  'PUBLIC ne porte aucun privilege sur record_loyalty_stamp (grantee 0)'
);

-- ── La table ────────────────────────────────────────────────
select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.loyalty_order_codes'::regclass),
  'la RLS est activee sur loyalty_order_codes'
);

-- INVARIANT : aucune policy ouverte à anon ni à public. Le parcours joueur
-- passe par le service role ; une future policy « lecture publique du QR »
-- ferait tomber ce test, et c'est le but.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'loyalty_order_codes'
      and ('anon' = any (roles::text[]) or 'public' = any (roles::text[]))),
  0,
  'aucune policy de loyalty_order_codes n''est ouverte a anon ou public'
);

select ok(
  not has_table_privilege('anon', 'public.loyalty_order_codes', 'SELECT'),
  'anon ne lit pas les codes de commande'
);
select ok(
  not has_table_privilege('anon', 'public.loyalty_order_codes', 'INSERT'),
  'anon ne forge pas de code de commande'
);

-- LES DEUX COLONNES QUI PORTENT LA RÈGLE, fermées à la session marchande —
-- en écriture ET à l'insertion. `consumed_at` remis à null rendrait un
-- jeton dépensé réutilisable ; fourni à l'insertion, il permettrait de
-- pré-brûler le jeton d'un client.
select ok(
  not has_column_privilege('authenticated', 'public.loyalty_order_codes',
    'consumed_at', 'UPDATE'),
  'consumed_at n''est jamais modifiable par une session marchande'
);
select ok(
  not has_column_privilege('authenticated', 'public.loyalty_order_codes',
    'consumed_at', 'INSERT'),
  'consumed_at n''est pas fourni a l''insertion (pas de pre-consommation)'
);
select ok(
  not has_column_privilege('authenticated', 'public.loyalty_order_codes',
    'consumed_member_id', 'UPDATE'),
  'consumed_member_id est RPC-only'
);
select ok(
  not has_column_privilege('authenticated', 'public.loyalty_order_codes',
    'token', 'UPDATE'),
  'le jeton n''est pas reecrit apres emission'
);
select ok(
  has_column_privilege('authenticated', 'public.loyalty_order_codes',
    'label', 'UPDATE'),
  'le commercant corrige la reference de commande'
);
select ok(
  has_table_privilege('service_role', 'public.loyalty_order_codes', 'UPDATE'),
  'le service role consomme les codes'
);

-- La FK de consumed_member_id est SIMPLE et `on delete set null`. Une
-- cascade ressusciterait des jetons dépensés à chaque purge RGPD, un
-- `set null` composite ferait ÉCHOUER la purge (program_id est not null).
select is(
  (select c.confdeltype from pg_constraint c
    where c.conrelid = 'public.loyalty_order_codes'::regclass
      and c.confrelid = 'public.loyalty_members'::regclass),
  'n',
  'consumed_member_id : on delete SET NULL (ni cascade, ni composite)'
);

-- ════════════════════════════════════════════════════════════
-- FIXTURES — deux organisations étanches
-- ════════════════════════════════════════════════════════════
insert into public.organizations (id, name, slug, addon_loyalty) values
  ('cb000000-0000-4000-8000-000000000001', 'Boutique A', 'tap-loc-a', true),
  ('cb000000-0000-4000-8000-000000000002', 'Boutique B', 'tap-loc-b', true);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('cb000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated',
   'owner-a@taploc.local', '', now(), now()),
  ('cb000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated',
   'cashier-a@taploc.local', '', now(), now()),
  ('cb000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated',
   'owner-b@taploc.local', '', now(), now());

insert into public.organization_members (organization_id, user_id, role) values
  ('cb000000-0000-4000-8000-000000000001',
   'cb000000-0000-4000-8000-0000000000a1', 'owner'),
  ('cb000000-0000-4000-8000-000000000001',
   'cb000000-0000-4000-8000-0000000000a2', 'cashier'),
  ('cb000000-0000-4000-8000-000000000002',
   'cb000000-0000-4000-8000-0000000000b1', 'owner');

-- Programme A1 : code tournant, secret connu, cooldown 24 h. Les seuils sont
-- posés hors d'atteinte (5 / 9) pour qu'aucune assertion de ce fichier ne
-- dépende d'un changement de niveau.
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode,
  rotating_secret, rotating_period_seconds, min_stamp_interval_seconds,
  silver_threshold, gold_threshold
) values (
  'cb000000-0000-4000-8000-000000000011',
  'cb000000-0000-4000-8000-000000000001',
  'Passeport livraison', 'active', 'rotating_code',
  decode('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex'),
  60, 86400, 5, 9
);

-- Programme A2 : validation staff (non-régression du chemin staff).
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode, min_stamp_interval_seconds
) values (
  'cb000000-0000-4000-8000-000000000012',
  'cb000000-0000-4000-8000-000000000001',
  'Passeport comptoir', 'active', 'staff', 300
);

-- Programme B1 : chez le VOISIN. Sert la preuve de cloisonnement.
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode,
  rotating_secret, rotating_period_seconds, min_stamp_interval_seconds
) values (
  'cb000000-0000-4000-8000-000000000013',
  'cb000000-0000-4000-8000-000000000002',
  'Passeport voisin', 'active', 'rotating_code',
  decode('ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100', 'hex'),
  60, 86400
);

-- Palier LOT à 2 visites sur A1 : prouve qu'un tampon de commande est un
-- tampon À PART ENTIÈRE — il déclenche les récompenses comme les autres.
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type,
  reward_label, reward_stock, position
) values (
  'cb000000-0000-4000-8000-000000000021',
  'cb000000-0000-4000-8000-000000000011',
  'cb000000-0000-4000-8000-000000000001', 2, 'lot', 'Café offert', 5, 0
);

-- Codes de commande. Le jeton respecte l'alphabet de hunt_steps.token.
insert into public.loyalty_order_codes (id, program_id, organization_id, token, label) values
  ('cb000000-0000-4000-8000-000000000031',
   'cb000000-0000-4000-8000-000000000011',
   'cb000000-0000-4000-8000-000000000001', 'CMD-AAAA1111', 'Commande 1'),
  ('cb000000-0000-4000-8000-000000000032',
   'cb000000-0000-4000-8000-000000000011',
   'cb000000-0000-4000-8000-000000000001', 'CMD-AAAA2222', 'Commande 2'),
  ('cb000000-0000-4000-8000-000000000033',
   'cb000000-0000-4000-8000-000000000011',
   'cb000000-0000-4000-8000-000000000001', 'CMD-AAAA3333', 'Commande 3'),
  ('cb000000-0000-4000-8000-000000000034',
   'cb000000-0000-4000-8000-000000000011',
   'cb000000-0000-4000-8000-000000000001', 'CMD-AAAA4444', 'Commande 4'),
  -- Chez le voisin.
  ('cb000000-0000-4000-8000-000000000035',
   'cb000000-0000-4000-8000-000000000013',
   'cb000000-0000-4000-8000-000000000002', 'CMD-BBBB1111', 'Commande voisine');

create temporary table tap_r (r jsonb) on commit drop;

-- ════════════════════════════════════════════════════════════
-- 1. USAGE UNIQUE — la règle du §7
-- ════════════════════════════════════════════════════════════
insert into tap_r select public.record_loyalty_stamp(
  p_program_id => 'cb000000-0000-4000-8000-000000000011',
  p_member_token_hash => repeat('1', 64),
  p_order_token => 'CMD-AAAA1111');
select is((select r->>'state' from tap_r), 'stamped',
  'un jeton de commande neuf tamponne');
select is((select r->>'visit_count' from tap_r), '1',
  'première visite comptée');
select is((select r->>'is_new_member' from tap_r), 'true',
  'le passeport est CRÉÉ par le jeton de commande (§7 : « crée/continue »)');

select is(
  (select count(*)::int from public.loyalty_order_codes
    where token = 'CMD-AAAA1111' and consumed_at is not null),
  1, 'le jeton est marqué consommé');
select is(
  (select oc.consumed_member_id from public.loyalty_order_codes oc
    where oc.token = 'CMD-AAAA1111'),
  (select m.id from public.loyalty_members
     m where m.token_hash = repeat('1', 64)),
  'le jeton est relié au passeport qu''il vient de créer');

-- La PROVENANCE est journalisée pour ce qu'elle est. Écrire ici le
-- validation_mode du programme ferait passer une livraison pour un passage
-- en boutique dans les statistiques du commerçant.
select is(
  (select s.mode from public.loyalty_stamps s
     join public.loyalty_members m on m.id = s.member_id
    where m.token_hash = repeat('1', 64)),
  'order_code',
  'le tampon est journalisé mode = order_code (ni rotating_code, ni staff)');

-- ── Le MÊME jeton, une seconde fois : rien ──────────────────
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  p_program_id => 'cb000000-0000-4000-8000-000000000011',
  p_member_token_hash => repeat('1', 64),
  p_order_token => 'CMD-AAAA1111');
select is((select r->>'state' from tap_r), 'order_invalid',
  'jeton déjà consommé : order_invalid');
select is(
  (select visit_count from public.loyalty_members where token_hash = repeat('1', 64)),
  1, 'aucune visite ajoutée par le rejeu');
select is(
  (select count(*)::int from public.loyalty_stamps s
     join public.loyalty_members m on m.id = s.member_id
    where m.token_hash = repeat('1', 64)),
  1, 'UN SEUL tampon en base — loyalty_stamps n''a pourtant aucun index d''unicité');

-- ── Le même jeton, un AUTRE passeport (QR recopié/partagé) ──
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  p_program_id => 'cb000000-0000-4000-8000-000000000011',
  p_member_token_hash => repeat('2', 64),
  p_order_token => 'CMD-AAAA1111');
select is((select r->>'state' from tap_r), 'order_invalid',
  'un jeton consommé ne vaut rien non plus pour un AUTRE passeport');
select is(
  (select count(*)::int from public.loyalty_members where token_hash = repeat('2', 64)),
  0, 'un jeton refusé ne crée AUCUN passeport');

-- ════════════════════════════════════════════════════════════
-- 2. CLOISONNEMENT — le jeton du voisin ne vaut rien ici
-- ════════════════════════════════════════════════════════════
-- Le `where` de la consommation porte program_id : un jeton volé chez un
-- autre commerçant rend le MÊME état qu'un jeton inventé. C'est ce qui
-- interdit de se servir de la RPC comme d'un détecteur de jetons valides.
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  p_program_id => 'cb000000-0000-4000-8000-000000000011',
  p_member_token_hash => repeat('3', 64),
  p_order_token => 'CMD-BBBB1111');
select is((select r->>'state' from tap_r), 'order_invalid',
  'jeton d''un autre commerçant : order_invalid');

delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  p_program_id => 'cb000000-0000-4000-8000-000000000011',
  p_member_token_hash => repeat('3', 64),
  p_order_token => 'CMD-INVENTE-9999');
select is((select r->>'state' from tap_r), 'order_invalid',
  'jeton inventé : MÊME réponse (aucun oracle sur l''existence du jeton)');

select is(
  (select count(*)::int from public.loyalty_order_codes
    where token = 'CMD-BBBB1111' and consumed_at is null),
  1, 'le jeton du voisin reste INTACT chez lui (pas consommé à distance)');
select is(
  (select count(*)::int from public.loyalty_stamps), 1,
  'aucun tampon nulle part — ni chez A, ni chez B');
select is(
  (select count(*)::int from public.loyalty_members where token_hash = repeat('3', 64)),
  0, 'aucun passeport créé par les deux refus');

-- ════════════════════════════════════════════════════════════
-- 3. CONTOURNEMENT DU COOLDOWN — et sa BORNE
-- ════════════════════════════════════════════════════════════
-- Le programme A1 porte un cooldown de 24 h. Deux commandes livrées le même
-- jour sont deux visites légitimes : le jeton passe outre. C'est la décision
-- produit, l'anti-abus étant porté par l'usage unique du jeton.
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  p_program_id => 'cb000000-0000-4000-8000-000000000011',
  p_member_token_hash => repeat('4', 64),
  p_order_token => 'CMD-AAAA2222');
select is((select r->>'state' from tap_r), 'stamped',
  'premier jeton du jour : tampon');

delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  p_program_id => 'cb000000-0000-4000-8000-000000000011',
  p_member_token_hash => repeat('4', 64),
  p_order_token => 'CMD-AAAA3333');
select is((select r->>'state' from tap_r), 'stamped',
  'SECOND jeton dans la fenêtre de cooldown : tampon quand même (§7)');
select is((select r->>'visit_count' from tap_r), '2',
  'les deux commandes comptent pour deux visites');

-- Un tampon de commande est un tampon À PART ENTIÈRE : il déclenche les
-- paliers. Sans cette assertion, on pourrait livrer un contournement qui
-- incrémente le compteur sans jamais rien faire gagner.
select is((select jsonb_array_length(r->'milestones_reached') from tap_r), 1,
  'le palier de la visite 2 est atteint par un tampon de commande');
select ok(
  (select r->'milestones_reached'->0->>'code' from tap_r) ~ '^FIDELITE-[A-HJ-NP-Z2-9]{8}$',
  'le code de retrait est bien émis sur le chemin « commande »');

-- ── LA BORNE : le contournement ne fuit pas vers l'autre mode ──
-- C'est la moitié qu'on oublie. Si le cooldown avait été neutralisé pour
-- tout le monde au lieu du seul chemin « commande », ce test passerait au
-- vert par erreur — et un code tournant lu au comptoir vaudrait un tampon
-- toutes les minutes.
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'cb000000-0000-4000-8000-000000000011', repeat('4', 64),
  public.current_loyalty_code('cb000000-0000-4000-8000-000000000011'));
select is((select r->>'state' from tap_r), 'too_soon',
  'le code TOURNANT reste soumis au cooldown juste après un tampon de commande');
select is(
  (select visit_count from public.loyalty_members where token_hash = repeat('4', 64)),
  2, 'le refus du code tournant n''incrémente rien');

-- ════════════════════════════════════════════════════════════
-- 4. NON-RÉGRESSION — rotating et staff, par la NOUVELLE signature
-- ════════════════════════════════════════════════════════════
-- Ces appels à 3 et 4 valeurs ne mentionnent PAS p_order_token : ils
-- résolvent vers la 5-aire par son `default null`. C'est exactement ce que
-- fait le code applicatif existant, inchangé.

-- Code de longueur invalide.
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'cb000000-0000-4000-8000-000000000011', repeat('5', 64), '123');
select is((select r->>'state' from tap_r), 'invalid_code',
  'rotating : code trop court → invalid_code (inchangé)');
select is(
  (select count(*)::int from public.loyalty_members where token_hash = repeat('5', 64)),
  0, 'un code refusé n''inscrit toujours personne');

-- Code courant valide.
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'cb000000-0000-4000-8000-000000000011', repeat('5', 64),
  public.current_loyalty_code('cb000000-0000-4000-8000-000000000011'));
select is((select r->>'state' from tap_r), 'stamped',
  'rotating : code courant → stamped (inchangé)');
select is((select r->>'is_new_member' from tap_r), 'true',
  'rotating : le passeport est créé (inchangé)');
select is(
  (select s.mode from public.loyalty_stamps s
     join public.loyalty_members m on m.id = s.member_id
    where m.token_hash = repeat('5', 64)),
  'rotating_code', 'rotating : le tampon reste journalisé rotating_code');

-- Cooldown du chemin normal, toujours en place.
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'cb000000-0000-4000-8000-000000000011', repeat('5', 64),
  public.current_loyalty_code('cb000000-0000-4000-8000-000000000011'));
select is((select r->>'state' from tap_r), 'too_soon',
  'rotating : second tampon immédiat → too_soon (inchangé)');
select ok(
  (select (r->>'retry_in_seconds')::int from tap_r) > 0,
  'rotating : retry_in_seconds toujours renseigné');

-- Staff : chemin public fermé sans validateur.
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'cb000000-0000-4000-8000-000000000012', repeat('6', 64));
select is((select r->>'state' from tap_r), 'unavailable',
  'staff : sans p_validated_by → unavailable (chemin public fermé, inchangé)');
select is(
  (select count(*)::int from public.loyalty_members where token_hash = repeat('6', 64)),
  0, 'staff : aucun passeport créé sans validateur');

-- Staff : avec validateur.
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'cb000000-0000-4000-8000-000000000012', repeat('6', 64), null,
  'cb000000-0000-4000-8000-0000000000a1');
select is((select r->>'state' from tap_r), 'stamped',
  'staff : avec p_validated_by → stamped (inchangé)');
select is(
  (select s.validated_by from public.loyalty_stamps s
     join public.loyalty_members m on m.id = s.member_id
    where m.token_hash = repeat('6', 64)),
  'cb000000-0000-4000-8000-0000000000a1'::uuid,
  'staff : le validateur est journalisé (inchangé)');
select is(
  (select s.mode from public.loyalty_stamps s
     join public.loyalty_members m on m.id = s.member_id
    where m.token_hash = repeat('6', 64)),
  'staff', 'staff : le tampon reste journalisé staff');

-- Indisponibilité, chemin normal.
update public.organizations set addon_loyalty = false
 where id = 'cb000000-0000-4000-8000-000000000001';
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'cb000000-0000-4000-8000-000000000011', repeat('7', 64),
  public.current_loyalty_code('cb000000-0000-4000-8000-000000000011'));
select is((select r->>'state' from tap_r), 'unavailable',
  'addon coupé : unavailable (inchangé)');
update public.organizations set addon_loyalty = true
 where id = 'cb000000-0000-4000-8000-000000000001';

-- ════════════════════════════════════════════════════════════
-- 5. UN PROGRAMME EN PAUSE NE BRÛLE PAS LE JETON
-- ════════════════════════════════════════════════════════════
-- La disponibilité est testée AVANT la consommation. Le client dont la
-- livraison arrive pendant une pause ne perd pas son tampon : son QR
-- redevient valable à la réactivation (même principe que le grant de spin).
update public.loyalty_programs set status = 'draft'
 where id = 'cb000000-0000-4000-8000-000000000011';
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  p_program_id => 'cb000000-0000-4000-8000-000000000011',
  p_member_token_hash => repeat('8', 64),
  p_order_token => 'CMD-AAAA4444');
select is((select r->>'state' from tap_r), 'unavailable',
  'programme en pause : unavailable (et pas order_invalid)');
select is(
  (select count(*)::int from public.loyalty_order_codes
    where token = 'CMD-AAAA4444' and consumed_at is null),
  1, 'le jeton n''est PAS brûlé par une pause du programme');

update public.loyalty_programs set status = 'active'
 where id = 'cb000000-0000-4000-8000-000000000011';
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  p_program_id => 'cb000000-0000-4000-8000-000000000011',
  p_member_token_hash => repeat('8', 64),
  p_order_token => 'CMD-AAAA4444');
select is((select r->>'state' from tap_r), 'stamped',
  'à la réactivation, le même jeton tamponne enfin');

-- ── La purge RGPD ne ressuscite pas un jeton dépensé ────────
-- Le motif exact de la FK simple `on delete set null` : la purge coupe le
-- lien vers le passeport SANS toucher consumed_at. Une cascade aurait rendu
-- le jeton reconsommable, un set null composite aurait fait échouer la purge
-- (program_id est not null).
delete from public.loyalty_members where token_hash = repeat('8', 64);
select is(
  (select count(*)::int from public.loyalty_order_codes
    where token = 'CMD-AAAA4444' and consumed_at is not null
      and consumed_member_id is null),
  1, 'passeport purgé : le lien tombe, le jeton RESTE dépensé');

delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  p_program_id => 'cb000000-0000-4000-8000-000000000011',
  p_member_token_hash => repeat('9', 64),
  p_order_token => 'CMD-AAAA4444');
select is((select r->>'state' from tap_r), 'order_invalid',
  'un jeton dépensé le reste après la purge du passeport');

-- ════════════════════════════════════════════════════════════
-- 6. RLS RÉELLE — on descend de superutilisateur
-- ════════════════════════════════════════════════════════════
set local role authenticated;

-- ── L'éditeur de A ──────────────────────────────────────────
set local "request.jwt.claim.sub" = 'cb000000-0000-4000-8000-0000000000a1';
select lives_ok(
  $$insert into public.loyalty_order_codes (organization_id, program_id, token, label)
    values ('cb000000-0000-4000-8000-000000000001',
            'cb000000-0000-4000-8000-000000000011', 'CMD-EDIT-0001', 'Chez moi')$$,
  'un éditeur émet un code de commande sur SON programme'
);
select throws_ok(
  $$insert into public.loyalty_order_codes (organization_id, program_id, token, label)
    values ('cb000000-0000-4000-8000-000000000002',
            'cb000000-0000-4000-8000-000000000013', 'CMD-EDIT-0002', 'Chez le voisin')$$,
  '42501',
  'new row violates row-level security policy for table "loyalty_order_codes"',
  'ISOLATION : un éditeur de A n''émet pas de code chez B'
);
-- A porte 4 jetons de fixture (CMD-AAAA1111..4444) plus celui que l'éditeur
-- vient d'émettre. Le cinquième jeton de fixture appartient à B.
select is(
  (select count(*)::int from public.loyalty_order_codes),
  5, 'l''éditeur de A voit les 4 codes de A + le sien, jamais celui de B'
);

-- ── Le caissier de A : membre, donc lecteur ─────────────────
set local "request.jwt.claim.sub" = 'cb000000-0000-4000-8000-0000000000a2';
select is(
  (select count(*)::int from public.loyalty_order_codes),
  5, 'un caissier LIT les codes de son organisation (policy member select)'
);
select throws_ok(
  $$insert into public.loyalty_order_codes (organization_id, program_id, token, label)
    values ('cb000000-0000-4000-8000-000000000001',
            'cb000000-0000-4000-8000-000000000011', 'CMD-CAISSE-01', 'Caissier')$$,
  '42501',
  'new row violates row-level security policy for table "loyalty_order_codes"',
  'un caissier n''ÉMET pas de code (policy editor write)'
);

-- ── L'éditeur de B : le voisin n'existe pas ─────────────────
set local "request.jwt.claim.sub" = 'cb000000-0000-4000-8000-0000000000b1';
select is(
  (select count(*)::int from public.loyalty_order_codes),
  1, 'un éditeur de B ne voit QUE le code de B'
);
select is(
  (select count(*)::int from public.loyalty_order_codes
    where token like 'CMD-AAAA%'),
  0, 'aucun jeton de A ne fuit vers B, même ciblé'
);

-- ── anon : la table n'existe pas ────────────────────────────
set local role anon;
select throws_ok(
  $$select count(*) from public.loyalty_order_codes$$,
  '42501', 'permission denied for table loyalty_order_codes',
  'un anonyme ne lit pas les codes de commande'
);
select throws_ok(
  $$insert into public.loyalty_order_codes (organization_id, program_id, token)
    values ('cb000000-0000-4000-8000-000000000001',
            'cb000000-0000-4000-8000-000000000011', 'CMD-ANON-0001')$$,
  '42501', 'permission denied for table loyalty_order_codes',
  'un anonyme ne forge pas de code de commande'
);

reset role;

select finish();
rollback;
