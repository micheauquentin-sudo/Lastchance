-- ============================================================
-- 20260817120000 — hunt_settlement_preview
--
-- La fonction ne lit rien de secret et n'écrit rien. Ce qu'il faut prouver
-- n'est donc pas qu'elle « marche », mais qu'elle DIT VRAI : le chiffre
-- qu'elle annonce doit être exactement celui que `settle_hunt_completions`
-- accordera juste après, dans la même situation. Un écart dans un sens fait
-- émettre des codes que le commerçant n'avait pas vus venir ; dans l'autre, il
-- lui fait renoncer à un geste inoffensif. Les deux sont des mensonges.
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LA PARITÉ (section 7), mesurée et non affirmée : sur la même chasse, on
--      lit la prévision, on supprime réellement l'étape, on appelle le solde,
--      et les deux nombres doivent être ÉGAUX — stock fini compris, puis à
--      nouveau après relèvement du stock, puis à zéro sur l'appel idempotent.
--      C'est la seule assertion qui garde vraiment la promesse de la fonction.
--   2. LES CINQ GARDES DE CONTEXTE (section 6). `settle_hunt_completions` a
--      déjà payé le prix d'une parité AFFIRMÉE trois fois et écrite nulle part
--      (20260815120000, en-tête). La prévision porte les mêmes gardes, et
--      chacune est éteinte à son tour sur une chasse où DEUX joueurs sont
--      éligibles et le stock illimité : une garde qui saute ne rend pas 0 dans
--      le vide, elle annonce 2. Le CONTRÔLE POSITIF final rouvre tout et
--      redonne 2, ce qui interdit à la section d'être verte pour une raison
--      étrangère (par exemple une fonction qui rendrait toujours 0).
--   3. QUE L'ÉTAPE VISÉE COMPTE VRAIMENT (section 3). Deux joueurs à trois
--      tampons chacun, mais pas les mêmes : retirer l'étape 4 en rend un
--      éligible, retirer l'étape 3 rend l'AUTRE éligible. Une fonction qui
--      compterait les tampons sans exclure `p_removed_step_id` rendrait le
--      même chiffre dans les deux cas — et surestimerait le coût du clic.
--   4. La borne de stock, à l'unité près, y compris le reliquat NÉGATIF (stock
--      abaissé sous le nombre déjà émis) qui doit valoir 0 et non -2.
--   5. Le cloisonnement : un caissier et le propriétaire d'une AUTRE
--      organisation obtiennent 0 là où le propriétaire obtient 2.
--
-- ── POURQUOI LES REFUS SE MESURENT EN VALEUR, PAS EN EXCEPTION ─
-- La fonction rend `0` sur refus, jamais une exception : lever distinguerait
-- « cette chasse n'existe pas » de « elle existe, chez quelqu'un d'autre ».
-- C'est la doctrine de `record_hunt_scan` (20260724120000:294), reprise par
-- les deux fonctions de 20260815120000. Les assertions portent donc sur la
-- valeur rendue.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ────────────────────────────────────────────────
-- Deux organisations : la seconde n'existe que pour prouver le cloisonnement.
insert into public.organizations (id, name, slug, addon_hunts) values
  ('d9000000-0000-4000-8000-000000000001', 'Org Prévision', 'tap-prevision',   true),
  ('d9000000-0000-4000-8000-000000000002', 'Org Voisine',   'tap-prevision-2', true);

insert into auth.users (id, email) values
  ('d9000000-0000-4000-8000-0000000000a1', 'proprio@tap-prevision.local'),
  ('d9000000-0000-4000-8000-0000000000a2', 'editeur@tap-prevision.local'),
  ('d9000000-0000-4000-8000-0000000000a3', 'caissier@tap-prevision.local'),
  ('d9000000-0000-4000-8000-0000000000b1', 'proprio@tap-prevision-2.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('d9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-0000000000a1', 'owner'),
  ('d9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-0000000000a2', 'editor'),
  ('d9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-0000000000a3', 'cashier'),
  ('d9000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-0000000000b1', 'owner');

-- ── La chasse du scénario réel ──────────────────────────────
-- 4 étapes, active, dans sa fenêtre, addon allumé, stock ILLIMITÉ
-- (`reward_stock` à null est le défaut du champ — c'est exactement la
-- situation qui rend le chiffre alarmant).
insert into public.hunts (
  id, organization_id, name, status, order_mode, reward_label, reward_stock
) values (
  'd9000000-0000-4000-8000-000000000010',
  'd9000000-0000-4000-8000-000000000001',
  'Chasse du marché', 'active', 'free', 'Panier garni', null
);

insert into public.hunt_steps (id, hunt_id, organization_id, position, label, token) values
  ('d9000000-0000-4000-8000-000000000011', 'd9000000-0000-4000-8000-000000000010',
   'd9000000-0000-4000-8000-000000000001', 1, 'Entrée',   'TAPPREVSTEP00001'),
  ('d9000000-0000-4000-8000-000000000012', 'd9000000-0000-4000-8000-000000000010',
   'd9000000-0000-4000-8000-000000000001', 2, 'Étal',     'TAPPREVSTEP00002'),
  ('d9000000-0000-4000-8000-000000000013', 'd9000000-0000-4000-8000-000000000010',
   'd9000000-0000-4000-8000-000000000001', 3, 'Fromager', 'TAPPREVSTEP00003'),
  -- L'étape que le commerçant s'apprête à retirer.
  ('d9000000-0000-4000-8000-000000000014', 'd9000000-0000-4000-8000-000000000010',
   'd9000000-0000-4000-8000-000000000001', 4, 'Cave',     'TAPPREVSTEP00004');

insert into public.hunt_players (id, hunt_id, organization_id, token_hash, created_at) values
  -- P1 et P5 : tampons 1-2-3. Retirer l'étape 4 les rend complets.
  ('d9000000-0000-4000-8000-0000000000f1', 'd9000000-0000-4000-8000-000000000010',
   'd9000000-0000-4000-8000-000000000001', repeat('a', 64), now() - interval '5 hours'),
  -- P2 : tampons 1-2-4. MÊME NOMBRE de tampons que P1, mais pas les mêmes —
  -- retirer l'étape 4 lui en RETIRE un : il reste à 2 pour 3 étapes.
  ('d9000000-0000-4000-8000-0000000000f2', 'd9000000-0000-4000-8000-000000000010',
   'd9000000-0000-4000-8000-000000000001', repeat('b', 64), now() - interval '4 hours'),
  -- P3 : un seul tampon. Jamais éligible.
  ('d9000000-0000-4000-8000-0000000000f3', 'd9000000-0000-4000-8000-000000000010',
   'd9000000-0000-4000-8000-000000000001', repeat('c', 64), now() - interval '3 hours'),
  -- P4 : aucun tampon. Ni « en cours », ni éligible.
  ('d9000000-0000-4000-8000-0000000000f4', 'd9000000-0000-4000-8000-000000000010',
   'd9000000-0000-4000-8000-000000000001', repeat('d', 64), now() - interval '2 hours'),
  ('d9000000-0000-4000-8000-0000000000f5', 'd9000000-0000-4000-8000-000000000010',
   'd9000000-0000-4000-8000-000000000001', repeat('e', 64), now() - interval '1 hour');

-- P1 et P5 : étapes 1-2-3.
insert into public.hunt_scans (hunt_id, organization_id, player_id, step_id)
select 'd9000000-0000-4000-8000-000000000010',
       'd9000000-0000-4000-8000-000000000001', p.id, s.id
  from (values ('d9000000-0000-4000-8000-0000000000f1'::uuid),
               ('d9000000-0000-4000-8000-0000000000f5'::uuid)) as p(id)
 cross join (values ('d9000000-0000-4000-8000-000000000011'::uuid),
                    ('d9000000-0000-4000-8000-000000000012'::uuid),
                    ('d9000000-0000-4000-8000-000000000013'::uuid)) as s(id);

-- P2 : étapes 1-2-4.
insert into public.hunt_scans (hunt_id, organization_id, player_id, step_id)
select 'd9000000-0000-4000-8000-000000000010',
       'd9000000-0000-4000-8000-000000000001',
       'd9000000-0000-4000-8000-0000000000f2', s.id
  from (values ('d9000000-0000-4000-8000-000000000011'::uuid),
               ('d9000000-0000-4000-8000-000000000012'::uuid),
               ('d9000000-0000-4000-8000-000000000014'::uuid)) as s(id);

-- P3 : étape 1 seulement.
insert into public.hunt_scans (hunt_id, organization_id, player_id, step_id)
values ('d9000000-0000-4000-8000-000000000010',
        'd9000000-0000-4000-8000-000000000001',
        'd9000000-0000-4000-8000-0000000000f3',
        'd9000000-0000-4000-8000-000000000011');

-- ══ 1. ACL de fonction ═══════════════════════════════════════
select ok(not has_function_privilege('anon',
  'public.hunt_settlement_preview(uuid,uuid)', 'execute'),
  'anon ne peut pas prévoir le solde d''une chasse');
select ok(has_function_privilege('authenticated',
  'public.hunt_settlement_preview(uuid,uuid)', 'execute'),
  'un utilisateur authentifié peut l''appeler (le prédicat filtre ensuite)');
-- Sous service_role, auth.uid() est nul : is_org_editor est structurellement
-- faux et la fonction rendrait toujours 0. Le grant a été retiré plutôt que de
-- laisser croire à un chemin d'appel qui n'existe pas. Ce revoke doit être
-- ÉCRIT — `revoke … from public, anon` ne retire pas service_role, que
-- Supabase accorde par `alter default privileges`.
select ok(not has_function_privilege('service_role',
  'public.hunt_settlement_preview(uuid,uuid)', 'execute'),
  'pas de grant service_role : sans auth.uid() la fonction ne peut rien calculer');

-- La fonction ne doit rien écrire : `stable` l'interdit au niveau du moteur.
select is((select provolatile from pg_proc
            where oid = 'public.hunt_settlement_preview(uuid,uuid)'::regprocedure),
  's'::"char",
  'la prévision est STABLE — une lecture, jamais une émission de code');

-- ══ 2. Le chiffre nominal ════════════════════════════════════
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);

select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  2, 'retirer l''étape 4 rendrait DEUX joueurs complets (P1 et P5)');

-- Sans suppression, personne n'est complet : c'est bien le RACCOURCISSEMENT
-- qui fabrique les gagnants, et le chiffre le dit.
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010', null),
  0, 'sans étape retirée, aucun joueur n''est complet — le solde n''accorderait rien');

-- ══ 3. L'ÉTAPE VISÉE COMPTE — pas seulement leur nombre ══════
-- P1/P5 et P2 ont TROIS tampons chacun. Une fonction qui compterait les
-- tampons sans exclure `p_removed_step_id` rendrait le même chiffre pour les
-- deux suppressions ci-dessous. Ce sont ces deux assertions, ensemble, qui
-- prouvent que la simulation porte bien sur l'étape désignée.
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000013'),
  1, 'retirer l''étape 3 rend complet P2 (1-2-4), et lui seul — pas les mêmes tampons');

select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000011'),
  0, 'retirer l''étape 1 ne rend personne complet : tout le monde l''avait tamponnée');

-- Une étape inconnue (ou d'une autre chasse) se comporte comme `null` : rien
-- n'est retiré. Aucun oracle — le résultat ne distingue pas une étape d'autrui
-- d'une étape inexistante.
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-0000000000ee'),
  0, 'une étape inconnue ne retire rien — même réponse qu''un identifiant nul');

select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-0000000000ff',
    'd9000000-0000-4000-8000-000000000014'),
  0, 'une chasse inconnue rend 0 sans rien révéler');

-- ══ 4. La borne de stock, à l'unité près ═════════════════════
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set reward_stock = 1
 where id = 'd9000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  1, 'stock de 1 : la prévision annonce 1 code, pas 2 — comme la boucle du solde');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set reward_stock = 5, reward_claimed_count = 5
 where id = 'd9000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  0, 'stock épuisé : aucun code ne partirait, la suppression est inoffensive');

-- Reliquat NÉGATIF : le commerçant a abaissé son stock sous le nombre déjà
-- émis. La soustraction nue rendrait -2, ce qui s'afficherait tel quel dans le
-- refus. La boucle du solde, elle, sortirait au premier tour : c'est 0.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set reward_stock = 3, reward_claimed_count = 5
 where id = 'd9000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  0, 'reliquat négatif (stock abaissé sous les lots déjà émis) : 0, jamais un nombre négatif');

-- Retour à un stock large : les deux éligibles reviennent.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set reward_stock = null, reward_claimed_count = 0
 where id = 'd9000000-0000-4000-8000-000000000010';

-- Un joueur DÉJÀ soldé ne recompte pas.
insert into public.hunt_completions (hunt_id, organization_id, player_id, code)
values ('d9000000-0000-4000-8000-000000000010',
        'd9000000-0000-4000-8000-000000000001',
        'd9000000-0000-4000-8000-0000000000f5', 'CHASSE-PRVWXYZ2');
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  1, 'P5 a déjà sa complétion : la prévision ne le compte pas une seconde fois');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
delete from public.hunt_completions
 where code = 'CHASSE-PRVWXYZ2';

-- ══ 5. Cloisonnement ═════════════════════════════════════════
-- Le caissier obtient 0 là où le propriétaire obtient 2 : c'est cet ÉCART qui
-- prouve le refus, pas une exception.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a3"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  0, 'un CAISSIER ne prévoit rien (is_org_editor), là où le propriétaire lit 2');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000b1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  0, 'le propriétaire d''une AUTRE organisation ne lit rien — et ne distingue pas cette chasse d''une inexistante');

-- Un ÉDITEUR passe : la garde n'est pas trop étroite (le dashboard est ouvert
-- aux éditeurs, une garde trop serrée casserait le produit).
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a2"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  2, 'un ÉDITEUR lit bien la prévision — is_org_editor, pas is_org_owner');

-- ══ 6. LES CINQ GARDES DE CONTEXTE ═══════════════════════════
-- LE CONTRÔLE NÉGATIF DU FICHIER. Chaque garde est éteinte à son tour sur la
-- chasse où DEUX joueurs sont éligibles et le stock illimité : si l'une d'elles
-- manquait au corps de la fonction, l'assertion correspondante lirait 2 et
-- tomberait. Le contrôle POSITIF (f) rouvre tout et redonne 2 — sans lui, les
-- cinq refus seraient verts même sur une fonction qui rendrait toujours 0.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);

-- (a) BROUILLON — le cœur du scénario : c'est l'état dans lequel l'éditeur met
--     sa chasse pour pouvoir en retirer les étapes sans le plancher des 2.
--     Le solde n'accordera RIEN ; annoncer 2 ici ferait renoncer le commerçant
--     à un geste inoffensif.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set status = 'draft'
 where id = 'd9000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  0, 'chasse en BROUILLON : 0 code prévu, alors que 2 joueurs sont complets et le stock illimité');

-- (b) ARCHIVÉE
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set status = 'archived'
 where id = 'd9000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  0, 'chasse ARCHIVÉE : 0 code prévu');

-- (c) ACTIVE mais pas encore ouverte
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set status = 'active', starts_at = now() + interval '2 days'
 where id = 'd9000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  0, 'chasse pas encore OUVERTE (starts_at futur) : 0 code prévu');

-- (d) ACTIVE mais fenêtre close
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set starts_at = null, ends_at = now() - interval '1 hour'
 where id = 'd9000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  0, 'chasse dont la fenêtre est CLOSE (ends_at passé) : 0 code prévu');

-- (e) ACTIVE, dans sa fenêtre, mais MODULE DÉSACTIVÉ
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set ends_at = null
 where id = 'd9000000-0000-4000-8000-000000000010';
update public.organizations set addon_hunts = false
 where id = 'd9000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  0, 'module Chasse DÉSACTIVÉ : 0 code prévu — le solde n''en émettrait aucun non plus');

-- (f) CONTRÔLE POSITIF — mêmes joueurs, même chasse, même stock illimité :
--     seul le contexte est rouvert.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.organizations set addon_hunts = true
 where id = 'd9000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000010',
    'd9000000-0000-4000-8000-000000000014'),
  2, 'CONTRÔLE POSITIF : contexte rouvert, la prévision retrouve ses 2 codes');

-- La garde « plus aucune étape » : retirer la dernière étape d'une chasse à
-- une seule étape. Sans `v_total < 1`, `done >= total` vaudrait « 0 >= 0 » et
-- tout joueur sans complétion serait annoncé gagnant.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.hunts (
  id, organization_id, name, status, reward_label, reward_stock
) values (
  'd9000000-0000-4000-8000-000000000020',
  'd9000000-0000-4000-8000-000000000001',
  'Chasse à une étape', 'active', 'Rien', null
);
insert into public.hunt_steps (id, hunt_id, organization_id, position, label, token) values
  ('d9000000-0000-4000-8000-000000000021', 'd9000000-0000-4000-8000-000000000020',
   'd9000000-0000-4000-8000-000000000001', 1, 'Unique', 'TAPPREVSOLO00001');
insert into public.hunt_players (id, hunt_id, organization_id, token_hash) values
  ('d9000000-0000-4000-8000-0000000000e1', 'd9000000-0000-4000-8000-000000000020',
   'd9000000-0000-4000-8000-000000000001', repeat('7', 64));
insert into public.hunt_scans (hunt_id, organization_id, player_id, step_id)
values ('d9000000-0000-4000-8000-000000000020',
        'd9000000-0000-4000-8000-000000000001',
        'd9000000-0000-4000-8000-0000000000e1',
        'd9000000-0000-4000-8000-000000000021');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000020',
    'd9000000-0000-4000-8000-000000000021'),
  0, 'retirer la SEULE étape d''une chasse : 0 — sans étape, le solde n''accorde rien');
-- Contrôle positif jumeau : le même joueur, la même chasse, mais l'étape visée
-- n'est pas la sienne — il reste complet et la prévision le voit.
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000020', null),
  1, 'CONTRÔLE POSITIF : sans suppression, ce joueur EST complet (1 tampon / 1 étape)');

-- ══ 7. LA PARITÉ AVEC LE SOLDE — mesurée, pas affirmée ═══════
-- Chasse dédiée : on lit la prévision, on supprime RÉELLEMENT l'étape, on
-- appelle `settle_hunt_completions`, et les deux nombres doivent être égaux.
-- Le stock est fini (1 pour 2 éligibles) pour que la borne soit exercée des
-- deux côtés : c'est là que deux implémentations différentes divergeraient.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.hunts (
  id, organization_id, name, status, order_mode, reward_label, reward_stock
) values (
  'd9000000-0000-4000-8000-000000000030',
  'd9000000-0000-4000-8000-000000000001',
  'Chasse de parité', 'active', 'free', 'Trésor', 1
);
insert into public.hunt_steps (id, hunt_id, organization_id, position, label, token) values
  ('d9000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000030',
   'd9000000-0000-4000-8000-000000000001', 1, 'Porte',   'TAPPREVPAR000001'),
  ('d9000000-0000-4000-8000-000000000032', 'd9000000-0000-4000-8000-000000000030',
   'd9000000-0000-4000-8000-000000000001', 2, 'Cellier', 'TAPPREVPAR000002'),
  ('d9000000-0000-4000-8000-000000000033', 'd9000000-0000-4000-8000-000000000030',
   'd9000000-0000-4000-8000-000000000001', 3, 'Grenier', 'TAPPREVPAR000003');
insert into public.hunt_players (id, hunt_id, organization_id, token_hash, created_at) values
  ('d9000000-0000-4000-8000-0000000000c1', 'd9000000-0000-4000-8000-000000000030',
   'd9000000-0000-4000-8000-000000000001', repeat('1', 64), now() - interval '3 hours'),
  ('d9000000-0000-4000-8000-0000000000c2', 'd9000000-0000-4000-8000-000000000030',
   'd9000000-0000-4000-8000-000000000001', repeat('2', 64), now() - interval '2 hours'),
  ('d9000000-0000-4000-8000-0000000000c3', 'd9000000-0000-4000-8000-000000000030',
   'd9000000-0000-4000-8000-000000000001', repeat('3', 64), now() - interval '1 hour');
-- Q1 et Q2 : étapes 1-2. Q3 : étape 1 seulement.
insert into public.hunt_scans (hunt_id, organization_id, player_id, step_id)
select 'd9000000-0000-4000-8000-000000000030',
       'd9000000-0000-4000-8000-000000000001', p.id, s.id
  from (values ('d9000000-0000-4000-8000-0000000000c1'::uuid),
               ('d9000000-0000-4000-8000-0000000000c2'::uuid)) as p(id)
 cross join (values ('d9000000-0000-4000-8000-000000000031'::uuid),
                    ('d9000000-0000-4000-8000-000000000032'::uuid)) as s(id);
insert into public.hunt_scans (hunt_id, organization_id, player_id, step_id)
values ('d9000000-0000-4000-8000-000000000030',
        'd9000000-0000-4000-8000-000000000001',
        'd9000000-0000-4000-8000-0000000000c3',
        'd9000000-0000-4000-8000-000000000031');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000030',
    'd9000000-0000-4000-8000-000000000033'),
  1, 'prévision : 2 joueurs deviendraient complets, mais le stock n''en couvre qu''UN');

-- LE GESTE RÉEL. `hunt_scans.step_id` cascade : les tampons de l'étape 3
-- disparaissent, ceux des étapes 1 et 2 survivent.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
delete from public.hunt_steps
 where id = 'd9000000-0000-4000-8000-000000000033';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.settle_hunt_completions('d9000000-0000-4000-8000-000000000030'),
  1, 'PARITÉ : le solde accorde exactement ce que la prévision avait annoncé (1)');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.hunt_completions
             where hunt_id = 'd9000000-0000-4000-8000-000000000030'),
  1::bigint, 'un seul code émis, celui qui était annoncé');

-- Second tour : le stock est relevé, le second joueur complet devient
-- accessible. La prévision (sans nouvelle suppression) doit annoncer 1, et le
-- solde en accorder 1.
update public.hunts set reward_stock = 5
 where id = 'd9000000-0000-4000-8000-000000000030';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d9000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000030', null),
  1, 'stock relevé : la prévision annonce le second joueur complet');
select is(public.settle_hunt_completions('d9000000-0000-4000-8000-000000000030'),
  1, 'PARITÉ (2) : le solde en accorde exactement 1');

-- Troisième tour : plus personne. Les deux fonctions doivent dire zéro
-- ensemble — une prévision qui resterait à 1 ferait renoncer le commerçant.
select is(public.hunt_settlement_preview(
    'd9000000-0000-4000-8000-000000000030', null),
  0, 'plus aucun joueur complet non soldé : la prévision retombe à 0');
select is(public.settle_hunt_completions('d9000000-0000-4000-8000-000000000030'),
  0, 'PARITÉ (3) : le solde n''accorde rien non plus');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.hunt_completions
             where hunt_id = 'd9000000-0000-4000-8000-000000000030'),
  2::bigint, 'deux complétions au total, jamais une de plus');
select is((select count(*) from public.hunt_completions
             where player_id = 'd9000000-0000-4000-8000-0000000000c3'),
  0::bigint, 'Q3, qui n''a qu''un tampon sur deux, n''a RIEN — ni annoncé, ni émis');
select is((select reward_claimed_count from public.hunts
             where id = 'd9000000-0000-4000-8000-000000000030'),
  2, 'le stock consommé correspond exactement aux codes annoncés');

select * from finish();
rollback;
