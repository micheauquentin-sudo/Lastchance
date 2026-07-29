-- ============================================================
-- Création de campagne TRANSACTIONNELLE — create_campaign_with_defaults
--
-- Le défaut corrigé : trois écritures séparées (campagne, roue, lots) sans
-- transaction laissaient une campagne SANS ROUE quand la deuxième échouait.
-- Ce que ces tests prouvent, dans l'ordre d'importance :
--   1. le contrôle d'accès rejoue EXACTEMENT la policy RLS VIVANTE
--      (« campaigns/wheels/prizes: editors », donc `is_org_editor`) — la
--      première version de ce test affirmait `is_org_member` en citant une
--      policy que 00019 avait supprimée, et n'avait AUCUNE fixture caissier :
--      c'est ce trou qui a laissé passer une escalade de privilège ;
--   2. rien n'est écrit quand un paramètre est refusé — l'atomicité ;
--   3. le nominal crée bien les trois objets liés, avec le style transmis.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures : deux organisations, un membre dans la première ────
insert into public.organizations (id, name, slug)
values
  ('c0000000-0000-4000-8000-000000000001', 'Org Campagne', 'tap-campagne'),
  ('c0000000-0000-4000-8000-000000000002', 'Org Voisine', 'tap-voisine');

insert into auth.users (id, email)
values ('c0000000-0000-4000-8000-0000000000a1', 'membre@tap.local');

insert into public.organization_members (organization_id, user_id, role)
values (
  'c0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-0000000000a1',
  'owner'
);

-- ── 1. ACL : la fonction n'est pas ouverte à anon ────────────────
select ok(
  not has_function_privilege(
    'anon',
    'public.create_campaign_with_defaults(uuid, text, jsonb, jsonb)',
    'execute'
  ),
  'anon ne peut pas créer de campagne'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_campaign_with_defaults(uuid, text, jsonb, jsonb)',
    'execute'
  ),
  'un utilisateur authentifié peut appeler la fonction (le prédicat filtre ensuite)'
);

-- ── 2. Contrôle d'accès : rejoue la policy, pas plus large ───────
-- Le membre n'appartient qu'à la première organisation : viser la seconde
-- doit échouer, MÊME en security definer.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c0000000-0000-4000-8000-0000000000a1"}',
  true
);

select throws_ok(
  $$select public.create_campaign_with_defaults(
      'c0000000-0000-4000-8000-000000000002'::uuid, 'Chez le voisin')$$,
  'accès refusé',
  'un membre ne peut pas créer de campagne dans une organisation qui n''est pas la sienne'
);

-- ── 2 bis. LE CAISSIER EST EXCLU — contrôle négatif de l'escalade ─
-- Les trois tables écrites par cette fonction (campaigns, wheels, prizes)
-- sont fermées au caissier par « …: editors » (00019:66-88). Tant que la
-- création passait par le client de session, la RLS le refusait ; la RPC
-- `security definer` l'a rouvert pendant deux migrations en gardant avec
-- `is_org_member`. Ce test est ce qui manquait pour l'attraper.
insert into auth.users (id, email)
values ('c0000000-0000-4000-8000-0000000000a2', 'caissier@tap.local');

insert into public.organization_members (organization_id, user_id, role)
values (
  'c0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-0000000000a2',
  'cashier'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c0000000-0000-4000-8000-0000000000a2"}',
  true
);

select throws_ok(
  $$select public.create_campaign_with_defaults(
      'c0000000-0000-4000-8000-000000000001'::uuid, 'Campagne du caissier')$$,
  'accès refusé',
  'un CAISSIER de l''organisation ne peut pas créer de campagne — la RPC ne doit jamais être plus large que la RLS'
);

select is(
  (select count(*)::int from public.campaigns
   where organization_id = 'c0000000-0000-4000-8000-000000000001'),
  0,
  'et son refus n''a rien écrit'
);

-- Un ÉDITEUR, lui, doit passer : une garde trop étroite casserait le produit
-- aussi sûrement qu'une garde trop large l'ouvrait.
insert into auth.users (id, email)
values ('c0000000-0000-4000-8000-0000000000a3', 'editeur@tap.local');

insert into public.organization_members (organization_id, user_id, role)
values (
  'c0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-0000000000a3',
  'editor'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c0000000-0000-4000-8000-0000000000a3"}',
  true
);

select lives_ok(
  $$select public.create_campaign_with_defaults(
      'c0000000-0000-4000-8000-000000000001'::uuid, 'Campagne éditeur')$$,
  'un ÉDITEUR crée bien une campagne — la garde n''est pas trop étroite'
);

-- On repasse sur le propriétaire et on efface sa campagne : la suite du
-- fichier compte les campagnes de cette organisation et part de zéro.
delete from public.campaigns
 where organization_id = 'c0000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c0000000-0000-4000-8000-0000000000a1"}',
  true
);

-- ── 3. ATOMICITÉ : un paramètre refusé n'écrit RIEN ──────────────
-- C'est le cœur du correctif. Avant, un échec en cours de route laissait
-- une campagne orpheline ; ici l'exception annule l'insertion déjà faite.
select throws_ok(
  $$select public.create_campaign_with_defaults(
      'c0000000-0000-4000-8000-000000000001'::uuid, '   ')$$,
  'nom de campagne invalide',
  'un nom vide est refusé'
);

select is(
  (select count(*)::int from public.campaigns
   where organization_id = 'c0000000-0000-4000-8000-000000000001'),
  0,
  'aucune campagne orpheline après un refus — la transaction a bien été annulée'
);

-- ── 4. Nominal : les trois objets, liés, avec le style transmis ──
select lives_ok(
  $$select public.create_campaign_with_defaults(
      'c0000000-0000-4000-8000-000000000001'::uuid,
      'Campagne TAP',
      '{"pageTheme":"kermesse"}'::jsonb,
      '[{"label":"Café offert","description":"Un café.","color":"#f59e0b","weight":40,"is_losing":false,"position":0},
        {"label":"Pas de chance","description":"Retentez !","color":"#64748b","weight":30,"is_losing":true,"position":1}]'::jsonb)$$,
  'la création nominale aboutit'
);

select is(
  (select count(*)::int from public.campaigns
   where organization_id = 'c0000000-0000-4000-8000-000000000001'),
  1,
  'une campagne créée'
);

select is(
  (select count(*)::int from public.wheels w
   join public.campaigns c on c.id = w.campaign_id
   where c.organization_id = 'c0000000-0000-4000-8000-000000000001'),
  1,
  'la roue existe et pointe sur la campagne — plus jamais de campagne sans roue'
);

select is(
  (select count(*)::int from public.prizes p
   join public.wheels w on w.id = p.wheel_id
   join public.campaigns c on c.id = w.campaign_id
   where c.organization_id = 'c0000000-0000-4000-8000-000000000001'),
  2,
  'les lots transmis sont posés (2 fournis, 2 créés)'
);

select is(
  (select w.style ->> 'pageTheme' from public.wheels w
   join public.campaigns c on c.id = w.campaign_id
   where c.organization_id = 'c0000000-0000-4000-8000-000000000001'),
  'kermesse',
  'le style fourni par l''appelant est conservé — TypeScript reste la source de vérité'
);

select is(
  (select p.is_losing from public.prizes p
   join public.wheels w on w.id = p.wheel_id
   join public.campaigns c on c.id = w.campaign_id
   where c.organization_id = 'c0000000-0000-4000-8000-000000000001'
     and p.position = 1),
  true,
  'le lot perdant transmis garde son drapeau (conversion jsonb -> boolean correcte)'
);

-- ── 5. Un tableau de lots vide reste cohérent ────────────────────
select lives_ok(
  $$select public.create_campaign_with_defaults(
      'c0000000-0000-4000-8000-000000000001'::uuid, 'Sans lot', '{}'::jsonb, '[]'::jsonb)$$,
  'une campagne sans lot par défaut est acceptée'
);

select is(
  (select count(*)::int from public.wheels w
   join public.campaigns c on c.id = w.campaign_id
   where c.name = 'Sans lot'),
  1,
  'elle a tout de même sa roue'
);

select * from finish();
rollback;
