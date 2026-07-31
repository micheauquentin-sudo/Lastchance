-- ============================================================
-- 20260815120000 — settle_hunt_completions / hunt_players_in_progress /
--                  set_team_member_role
--
-- Ces trois fonctions sont arrivées sans un seul test SQL. Deux d'entre elles
-- ne sont pas des lectures : `settle_hunt_completions` ÉMET DES CODES DE
-- RETRAIT RÉELS (préfixe CHASSE-, décrémente un stock, ouvre un droit en
-- caisse) sans qu'aucun joueur n'ait fait le moindre geste, et
-- `set_team_member_role` change une AUTORISATION. Ce qu'il faut prouver n'est
-- donc pas d'abord qu'elles marchent, mais ce qu'elles REFUSENT de faire.
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LES QUATRE GARDES DE CONTEXTE (section 8). La première version de la
--      migration affirmait trois fois « elle accorde exactement ce que le
--      prochain scan aurait accordé » sans porter aucune des quatre gardes de
--      `record_hunt_scan` : addon, statut, `starts_at`, `ends_at`. Comme
--      `hunts.reward_stock` vaut `null` — ILLIMITÉ — par défaut, et comme rien
--      n'interdit de repasser une chasse en brouillon puis d'en retirer les
--      étapes, un éditeur pouvait faire émettre un code à tout joueur ayant UN
--      SEUL tampon, sans plafond. La section 8 tient chaque garde séparément,
--      et se termine par un CONTRÔLE POSITIF : les mêmes joueurs, la même
--      chasse, le même stock illimité — seul le contexte change — et là, deux
--      codes partent. Sans ce contrôle, « rend 0 » ne prouverait rien.
--   2. `settle_hunt_completions` n'invente aucun droit : un joueur incomplet
--      n'obtient rien, un joueur déjà soldé n'obtient pas un second code, et le
--      stock est respecté à l'unité près (le code va au plus ancien).
--   3. LA GARDE DE LA CHASSE SANS ÉTAPE. Sans `if v_total < 1 then return 0`,
--      `done >= total` est vrai pour un joueur à ZÉRO tampon. La chasse
--      fixture de la section 4 est délibérément `active`, dans sa fenêtre et
--      son addon allumé : `v_total < 1` est alors la SEULE chose qui la
--      protège, donc la seule que le sabotage puisse faire tomber.
--   4. Le cloisonnement : ni un caissier, ni un propriétaire d'une AUTRE
--      organisation ne soldent une chasse — et un propriétaire de A ne touche
--      pas au rôle d'un membre de B.
--   5. « Jamais le dernier propriétaire » : la borne qui empêche une
--      organisation de devenir inadministrable, sans retour par le produit.
--
-- ── POURQUOI LES REFUS SE MESURENT EN EFFET, PAS EN EXCEPTION ─
-- Les deux fonctions de chasse rendent `0` sur refus d'autorisation, et non
-- une exception : lever distinguerait « cette chasse n'existe pas » de « elle
-- existe, chez quelqu'un d'autre ». Les assertions portent donc sur ce qui a
-- été ÉMIS, ce qui est de toute façon la propriété qui compte — un refus qui
-- laisse un code derrière lui n'est pas un refus.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ────────────────────────────────────────────────
-- Deux organisations : la seconde n'existe que pour prouver le cloisonnement.
insert into public.organizations (id, name, slug, addon_hunts) values
  ('d7000000-0000-4000-8000-000000000001', 'Org Solde',   'tap-solde',   true),
  ('d7000000-0000-4000-8000-000000000002', 'Org Voisine', 'tap-solde-2', true);

insert into auth.users (id, email) values
  ('d7000000-0000-4000-8000-0000000000a1', 'proprio@tap-solde.local'),
  ('d7000000-0000-4000-8000-0000000000a2', 'editeur@tap-solde.local'),
  ('d7000000-0000-4000-8000-0000000000a3', 'caissier@tap-solde.local'),
  ('d7000000-0000-4000-8000-0000000000a4', 'proprio2@tap-solde.local'),
  ('d7000000-0000-4000-8000-0000000000b1', 'proprio@tap-solde-2.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('d7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-0000000000a1', 'owner'),
  ('d7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-0000000000a2', 'editor'),
  ('d7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-0000000000a3', 'cashier'),
  ('d7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-0000000000b1', 'owner');

-- La chasse du scénario réel : 4 étapes, dont une va être retirée. Active,
-- sans borne de dates, addon allumé — le contexte est ouvert, pour que les
-- sections 3 à 7 mesurent le comportement de solde et rien d'autre.
insert into public.hunts (
  id, organization_id, name, status, order_mode, reward_label, reward_stock
) values (
  'd7000000-0000-4000-8000-000000000010',
  'd7000000-0000-4000-8000-000000000001',
  'Chasse du quartier', 'active', 'free', 'Trésor', 1
);

insert into public.hunt_steps (id, hunt_id, organization_id, position, label, token) values
  ('d7000000-0000-4000-8000-000000000011', 'd7000000-0000-4000-8000-000000000010',
   'd7000000-0000-4000-8000-000000000001', 1, 'Comptoir', 'TAPSOLDESTEP0001'),
  ('d7000000-0000-4000-8000-000000000012', 'd7000000-0000-4000-8000-000000000010',
   'd7000000-0000-4000-8000-000000000001', 2, 'Vitrine',  'TAPSOLDESTEP0002'),
  ('d7000000-0000-4000-8000-000000000013', 'd7000000-0000-4000-8000-000000000010',
   'd7000000-0000-4000-8000-000000000001', 3, 'Terrasse', 'TAPSOLDESTEP0003'),
  -- L'étape que le commerçant va supprimer.
  ('d7000000-0000-4000-8000-000000000014', 'd7000000-0000-4000-8000-000000000010',
   'd7000000-0000-4000-8000-000000000001', 4, 'Cave',     'TAPSOLDESTEP0004');

-- Quatre joueurs d'âges différents : l'ordre d'attribution sous stock fini est
-- `created_at asc`, il faut donc qu'il soit observable.
insert into public.hunt_players (id, hunt_id, organization_id, token_hash, created_at) values
  ('d7000000-0000-4000-8000-0000000000f1', 'd7000000-0000-4000-8000-000000000010',
   'd7000000-0000-4000-8000-000000000001', repeat('a', 64), now() - interval '3 hours'),
  ('d7000000-0000-4000-8000-0000000000f2', 'd7000000-0000-4000-8000-000000000010',
   'd7000000-0000-4000-8000-000000000001', repeat('b', 64), now() - interval '2 hours'),
  ('d7000000-0000-4000-8000-0000000000f3', 'd7000000-0000-4000-8000-000000000010',
   'd7000000-0000-4000-8000-000000000001', repeat('c', 64), now() - interval '1 hour'),
  -- P4 n'a JAMAIS scanné : ni « en cours », ni éligible au solde.
  ('d7000000-0000-4000-8000-0000000000f4', 'd7000000-0000-4000-8000-000000000010',
   'd7000000-0000-4000-8000-000000000001', repeat('d', 64), now());

-- P1 et P2 ont tamponné les étapes 1-2-3 (pas la 4) ; P3 n'a que la 1.
insert into public.hunt_scans (hunt_id, organization_id, player_id, step_id)
select 'd7000000-0000-4000-8000-000000000010',
       'd7000000-0000-4000-8000-000000000001',
       p.id, s.id
  from (values ('d7000000-0000-4000-8000-0000000000f1'::uuid),
               ('d7000000-0000-4000-8000-0000000000f2'::uuid)) as p(id)
 cross join (values ('d7000000-0000-4000-8000-000000000011'::uuid),
                    ('d7000000-0000-4000-8000-000000000012'::uuid),
                    ('d7000000-0000-4000-8000-000000000013'::uuid)) as s(id);

insert into public.hunt_scans (hunt_id, organization_id, player_id, step_id)
values ('d7000000-0000-4000-8000-000000000010',
        'd7000000-0000-4000-8000-000000000001',
        'd7000000-0000-4000-8000-0000000000f3',
        'd7000000-0000-4000-8000-000000000011');

-- LE GESTE QUI DÉCLENCHE TOUT : le commerçant retire l'étape 4. Les tampons
-- des trois autres survivent (`hunt_scans.step_id` ne cascade que sur SA
-- ligne) : P1 et P2 passent silencieusement à 3 tampons pour 3 étapes, sans
-- ligne `hunt_completions` — la complétion n'est calculée que pendant un scan.
delete from public.hunt_steps
 where id = 'd7000000-0000-4000-8000-000000000014';

-- Chasse SANS AUCUNE ÉTAPE, avec un joueur à zéro tampon. Elle est ACTIVE et
-- son addon est allumé : c'est délibéré. Si elle était en brouillon, les
-- gardes de contexte la protégeraient déjà et le sabotage de `v_total < 1` ne
-- ferait rien tomber — le test serait vert sans rien garder.
insert into public.hunts (
  id, organization_id, name, status, reward_label, reward_stock
) values (
  'd7000000-0000-4000-8000-000000000020',
  'd7000000-0000-4000-8000-000000000001',
  'Chasse vide', 'active', 'Rien', null
);
insert into public.hunt_players (id, hunt_id, organization_id, token_hash) values
  ('d7000000-0000-4000-8000-0000000000e1', 'd7000000-0000-4000-8000-000000000020',
   'd7000000-0000-4000-8000-000000000001', repeat('e', 64));

-- ══ 1. ACL de fonction : rien n'est ouvert à anon ════════════
select ok(not has_function_privilege('anon',
  'public.settle_hunt_completions(uuid)', 'execute'),
  'anon ne peut pas solder une chasse — la fonction émet des codes réels');
select ok(has_function_privilege('authenticated',
  'public.settle_hunt_completions(uuid)', 'execute'),
  'un utilisateur authentifié peut l''appeler (le prédicat filtre ensuite)');
-- Sous service_role, auth.uid() est nul : is_org_editor est structurellement
-- faux et la fonction rendrait toujours 0. Le grant a été retiré plutôt que de
-- laisser croire à un chemin d'appel qui n'existe pas.
select ok(not has_function_privilege('service_role',
  'public.settle_hunt_completions(uuid)', 'execute'),
  'pas de grant service_role : sans auth.uid() la fonction ne peut rien faire');

select ok(not has_function_privilege('anon',
  'public.hunt_players_in_progress(uuid)', 'execute'),
  'anon ne peut pas compter les joueurs d''une chasse');
select ok(has_function_privilege('authenticated',
  'public.hunt_players_in_progress(uuid)', 'execute'),
  'un utilisateur authentifié peut compter (le prédicat filtre ensuite)');
select ok(not has_function_privilege('service_role',
  'public.hunt_players_in_progress(uuid)', 'execute'),
  'pas de grant service_role non plus, même raison');

select ok(not has_function_privilege('anon',
  'public.set_team_member_role(uuid,uuid,text)', 'execute'),
  'anon ne peut pas changer un rôle');
select ok(has_function_privilege('authenticated',
  'public.set_team_member_role(uuid,uuid,text)', 'execute'),
  'un utilisateur authentifié peut l''appeler (le prédicat filtre ensuite)');
select ok(not has_function_privilege('service_role',
  'public.set_team_member_role(uuid,uuid,text)', 'execute'),
  'service_role explicitement révoqué là aussi — is_org_owner y est structurellement faux');

-- ══ 2. hunt_players_in_progress ══════════════════════════════
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);

select is(public.hunt_players_in_progress('d7000000-0000-4000-8000-000000000010'),
  3, '3 joueurs en cours — P4, qui n''a jamais scanné, n''en est pas un');
select is(public.hunt_players_in_progress('d7000000-0000-4000-8000-000000000020'),
  0, 'la chasse vide n''a personne en cours');
select is(public.hunt_players_in_progress('d7000000-0000-4000-8000-0000000000ff'),
  0, 'une chasse inconnue rend 0 sans rien révéler');

-- Le caissier obtient 0 là où le propriétaire obtient 3 : c'est cet ÉCART qui
-- prouve le refus, pas une exception.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a3"}', true);
select is(public.hunt_players_in_progress('d7000000-0000-4000-8000-000000000010'),
  0, 'un CAISSIER ne voit pas les joueurs en cours (is_org_editor), là où le propriétaire en voit 3');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000b1"}', true);
select is(public.hunt_players_in_progress('d7000000-0000-4000-8000-000000000010'),
  0, 'le propriétaire d''une AUTRE organisation n''en voit aucun — et ne distingue pas cette chasse d''une inexistante');

-- ══ 3. settle_hunt_completions — ce qu'elle REFUSE ═══════════
-- Le contexte est délibérément « chargé » : deux joueurs sont éligibles à
-- l'instant où ces refus sont testés. Une garde qui saute n'échoue pas dans le
-- vide, elle émet des codes — et le comptage qui suit le dit.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a3"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000010'),
  0, 'un CAISSIER ne solde rien — la RPC n''est jamais plus large que la RLS');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000b1"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000010'),
  0, 'le propriétaire d''une AUTRE organisation ne solde pas cette chasse');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.hunt_completions
             where hunt_id = 'd7000000-0000-4000-8000-000000000010'),
  0::bigint, 'aucun code émis par les deux refus — alors que 2 joueurs étaient éligibles');
select is((select reward_claimed_count from public.hunts
             where id = 'd7000000-0000-4000-8000-000000000010'),
  0, 'et le stock n''a pas bougé');

-- ══ 4. LA GARDE DE LA CHASSE SANS ÉTAPE ══════════════════════
-- `done >= total` vaut « 0 >= 0 » pour un joueur qui n'a rien fait. Sans
-- `v_total < 1`, toute identité fabriquée sur une chasse sans étape repart
-- avec un code de retrait valable en caisse. La chasse est active et son
-- addon allumé : cette garde est la seule qui la protège.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000020'),
  0, 'une chasse SANS ÉTAPE ne solde rien, même active et avec un joueur inscrit');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.hunt_completions
             where hunt_id = 'd7000000-0000-4000-8000-000000000020'),
  0::bigint, 'et le joueur à ZÉRO tampon n''a reçu aucun code');

-- ══ 5. Nominal : exactement ce que le prochain scan aurait donné ══
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000010'),
  1, 'stock de 1 : une seule complétion accordée, bien que DEUX joueurs soient complets');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.hunt_completions
             where hunt_id = 'd7000000-0000-4000-8000-000000000010'),
  1::bigint, 'une ligne de complétion, pas deux');
select is((select player_id from public.hunt_completions
             where hunt_id = 'd7000000-0000-4000-8000-000000000010'),
  'd7000000-0000-4000-8000-0000000000f1'::uuid,
  'le code va au joueur le PLUS ANCIEN (order by created_at asc)');
select matches((select code from public.hunt_completions
                  where hunt_id = 'd7000000-0000-4000-8000-000000000010'),
  '^CHASSE-[A-HJ-NP-Z2-9]{8}$',
  'code au format CHASSE-XXXXXXXX (alphabet sans I/O/0/1), comme record_hunt_scan');
select is((select reward_claimed_count from public.hunts
             where id = 'd7000000-0000-4000-8000-000000000010'),
  1, 'le compteur de lots émis avance d''exactement 1');

-- Le stock est atteint : le second joueur complet reste sans code.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000010'),
  0, 'stock épuisé : le second appel n''accorde rien');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.hunt_completions
             where player_id = 'd7000000-0000-4000-8000-0000000000f2'),
  0::bigint, 'le joueur complet mais hors stock n''a toujours rien');

-- Le commerçant relève le stock : P2 est soldé, P3 (incomplet) ne l'est pas.
update public.hunts set reward_stock = 5
 where id = 'd7000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000010'),
  1, 'stock relevé : le second joueur complet obtient son code');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.hunt_completions
             where player_id = 'd7000000-0000-4000-8000-0000000000f2'),
  1::bigint, 'P2 a bien sa complétion');
select is((select count(*) from public.hunt_completions
             where player_id = 'd7000000-0000-4000-8000-0000000000f3'),
  0::bigint, 'P3, qui n''a qu''un tampon sur trois, n''a RIEN — la fonction n''invente aucun droit');
select is((select count(*) from public.hunt_completions
             where player_id = 'd7000000-0000-4000-8000-0000000000f4'),
  0::bigint, 'P4, qui n''a jamais scanné, n''a rien non plus');
select is((select reward_claimed_count from public.hunts
             where id = 'd7000000-0000-4000-8000-000000000010'),
  2, 'deux lots décomptés au total');

-- ══ 6. IDEMPOTENCE : rappelée, elle n'accorde rien de plus ═══
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000010'),
  0, 'troisième appel : rien de plus, malgré du stock disponible');
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000010'),
  0, 'quatrième appel : toujours rien (un joueur déjà soldé ne l''est pas deux fois)');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.hunt_completions
             where hunt_id = 'd7000000-0000-4000-8000-000000000010'),
  2::bigint, 'toujours exactement deux complétions');
select is((select reward_claimed_count from public.hunts
             where id = 'd7000000-0000-4000-8000-000000000010'),
  2, 'et le stock n''a pas dérivé');
select is((select count(distinct code) from public.hunt_completions
             where hunt_id = 'd7000000-0000-4000-8000-000000000010'),
  2::bigint, 'les deux codes émis sont distincts');

-- Le décompte « en cours » suit : seul P3 reste en chemin.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.hunt_players_in_progress('d7000000-0000-4000-8000-000000000010'),
  1, 'après le solde, seul le joueur encore incomplet est « en cours »');

-- ══ 7. Un ÉDITEUR passe — la garde n'est pas trop étroite ════
-- P3 termine son parcours en base ; c'est l'éditeur, pas le propriétaire, qui
-- solde. Une garde trop serrée casserait le produit aussi sûrement qu'une
-- garde trop large l'ouvrirait.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.hunt_scans (hunt_id, organization_id, player_id, step_id) values
  ('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000001',
   'd7000000-0000-4000-8000-0000000000f3', 'd7000000-0000-4000-8000-000000000012'),
  ('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000001',
   'd7000000-0000-4000-8000-0000000000f3', 'd7000000-0000-4000-8000-000000000013');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a2"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000010'),
  1, 'un ÉDITEUR solde bien — is_org_editor, pas is_org_owner');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.hunt_completions
             where hunt_id = 'd7000000-0000-4000-8000-000000000010'),
  3::bigint, 'trois complétions au total');

-- ══ 8. LES QUATRE GARDES DE CONTEXTE (E1) ════════════════════
-- Chasse dédiée, montée pour reproduire le scénario du rapport de sécurité :
-- `reward_stock` à NULL — ILLIMITÉ, et c'est le défaut du champ —, deux
-- joueurs complets. Chaque garde est éteinte à son tour et doit rendre 0 ;
-- le CONTRÔLE POSITIF final rouvre tout et fait partir les deux codes, ce qui
-- interdit à cette section d'être verte pour une raison étrangère.
insert into public.hunts (
  id, organization_id, name, status, reward_label, reward_stock
) values (
  'd7000000-0000-4000-8000-000000000030',
  'd7000000-0000-4000-8000-000000000001',
  'Chasse à contexte', 'draft', 'Trésor sans plafond', null
);
insert into public.hunt_steps (id, hunt_id, organization_id, position, label, token) values
  ('d7000000-0000-4000-8000-000000000031', 'd7000000-0000-4000-8000-000000000030',
   'd7000000-0000-4000-8000-000000000001', 1, 'Porte',   'TAPSOLDECTX00001'),
  ('d7000000-0000-4000-8000-000000000032', 'd7000000-0000-4000-8000-000000000030',
   'd7000000-0000-4000-8000-000000000001', 2, 'Cellier', 'TAPSOLDECTX00002');
insert into public.hunt_players (id, hunt_id, organization_id, token_hash) values
  ('d7000000-0000-4000-8000-0000000000c1', 'd7000000-0000-4000-8000-000000000030',
   'd7000000-0000-4000-8000-000000000001', repeat('1', 64)),
  ('d7000000-0000-4000-8000-0000000000c2', 'd7000000-0000-4000-8000-000000000030',
   'd7000000-0000-4000-8000-000000000001', repeat('2', 64));
insert into public.hunt_scans (hunt_id, organization_id, player_id, step_id)
select 'd7000000-0000-4000-8000-000000000030',
       'd7000000-0000-4000-8000-000000000001', p.id, s.id
  from (values ('d7000000-0000-4000-8000-0000000000c1'::uuid),
               ('d7000000-0000-4000-8000-0000000000c2'::uuid)) as p(id)
 cross join (values ('d7000000-0000-4000-8000-000000000031'::uuid),
                    ('d7000000-0000-4000-8000-000000000032'::uuid)) as s(id);

-- (a) BROUILLON — le cœur du scénario : c'est l'état dans lequel l'éditeur met
--     sa chasse pour pouvoir en retirer les étapes sans le plancher des 2.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000030'),
  0, 'chasse en BROUILLON : aucun code, alors que 2 joueurs sont complets et le stock illimité');

-- (b) ARCHIVÉE
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set status = 'archived'
 where id = 'd7000000-0000-4000-8000-000000000030';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000030'),
  0, 'chasse ARCHIVÉE : aucun code');

-- (c) ACTIVE mais pas encore ouverte (`starts_at` dans le futur)
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set status = 'active', starts_at = now() + interval '2 days'
 where id = 'd7000000-0000-4000-8000-000000000030';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000030'),
  0, 'chasse pas encore OUVERTE (starts_at futur) : aucun code');

-- (d) ACTIVE mais fenêtre close (`ends_at` dans le passé)
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set starts_at = null, ends_at = now() - interval '1 hour'
 where id = 'd7000000-0000-4000-8000-000000000030';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000030'),
  0, 'chasse dont la fenêtre est CLOSE (ends_at passé) : aucun code');

-- (e) ACTIVE, dans sa fenêtre, mais MODULE DÉSACTIVÉ
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set ends_at = null
 where id = 'd7000000-0000-4000-8000-000000000030';
update public.organizations set addon_hunts = false
 where id = 'd7000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000030'),
  0, 'module Chasse DÉSACTIVÉ : aucun code — un commerçant qui ne paie plus n''en frappe pas');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.hunt_completions
             where hunt_id = 'd7000000-0000-4000-8000-000000000030'),
  0::bigint, 'les cinq contextes fermés n''ont RIEN émis en tout');
select is((select reward_claimed_count from public.hunts
             where id = 'd7000000-0000-4000-8000-000000000030'),
  0, 'et le compteur de la chasse n''a pas bougé');

-- (f) CONTRÔLE POSITIF — mêmes joueurs, même chasse, même stock illimité :
--     seul le contexte est rouvert. Sans cette assertion, les cinq
--     précédentes seraient vertes même si la fonction ne faisait plus rien.
update public.organizations set addon_hunts = true
 where id = 'd7000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.settle_hunt_completions('d7000000-0000-4000-8000-000000000030'),
  2, 'CONTRÔLE POSITIF : contexte rouvert, les deux joueurs complets sont soldés');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.hunt_completions
             where hunt_id = 'd7000000-0000-4000-8000-000000000030'),
  2::bigint, 'deux codes, tirés du même stock illimité que les cinq refus');

-- ══ 9. set_team_member_role — ce qu'elle REFUSE ══════════════
-- Ici les refus LÈVENT : `team.ts` lit les messages ('last owner', 'member not
-- found') pour parler au commerçant. Aucun oracle n'est en jeu — l'appelant
-- connaît déjà son organisation et ses membres.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a2"}', true);
select throws_ok(
  $q$select public.set_team_member_role(
       'd7000000-0000-4000-8000-000000000001'::uuid,
       'd7000000-0000-4000-8000-0000000000a3'::uuid, 'editor')$q$,
  'P0001', 'not authorized',
  'un ÉDITEUR ne change pas les rôles — is_org_owner, pas is_org_editor');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a3"}', true);
select throws_ok(
  $q$select public.set_team_member_role(
       'd7000000-0000-4000-8000-000000000001'::uuid,
       'd7000000-0000-4000-8000-0000000000a3'::uuid, 'editor')$q$,
  'P0001', 'not authorized',
  'un CAISSIER ne se promeut pas lui-même éditeur');

-- ── LE CLOISONNEMENT MULTI-TENANT ───────────────────────────
-- L'assertion la plus importante du fichier : le propriétaire de B vise
-- l'organisation A. `is_org_owner(A)` est faux pour lui, la fonction refuse
-- AVANT toute lecture.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000b1"}', true);
select throws_ok(
  $q$select public.set_team_member_role(
       'd7000000-0000-4000-8000-000000000001'::uuid,
       'd7000000-0000-4000-8000-0000000000a3'::uuid, 'editor')$q$,
  'P0001', 'not authorized',
  'le propriétaire de l''organisation B ne touche PAS un membre de A');

-- Et par l'autre bout : viser SA propre organisation avec l'utilisateur d'une
-- autre ne la lui rattache pas.
select throws_ok(
  $q$select public.set_team_member_role(
       'd7000000-0000-4000-8000-000000000002'::uuid,
       'd7000000-0000-4000-8000-0000000000a3'::uuid, 'editor')$q$,
  'P0001', 'member not found',
  'le propriétaire de B ne peut pas s''attribuer un membre de A par sa propre organisation');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select role from public.organization_members
             where organization_id = 'd7000000-0000-4000-8000-000000000001'
               and user_id = 'd7000000-0000-4000-8000-0000000000a3'),
  'cashier', 'après ces quatre refus, le caissier est toujours caissier');

-- ── Le rôle cible est borné : jamais 'owner' par ce chemin ──
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select throws_ok(
  $q$select public.set_team_member_role(
       'd7000000-0000-4000-8000-000000000001'::uuid,
       'd7000000-0000-4000-8000-0000000000a3'::uuid, 'owner')$q$,
  'P0001', 'invalid role',
  'on ne se fabrique pas un second propriétaire par cette RPC');
select throws_ok(
  $q$select public.set_team_member_role(
       'd7000000-0000-4000-8000-000000000001'::uuid,
       'd7000000-0000-4000-8000-0000000000a3'::uuid, 'admin')$q$,
  'P0001', 'invalid role', 'un rôle inventé est refusé');
select throws_ok(
  $q$select public.set_team_member_role(
       'd7000000-0000-4000-8000-000000000001'::uuid,
       'd7000000-0000-4000-8000-0000000000a3'::uuid, null)$q$,
  'P0001', 'invalid role', 'un rôle nul est refusé');
select throws_ok(
  $q$select public.set_team_member_role(
       'd7000000-0000-4000-8000-000000000001'::uuid,
       'd7000000-0000-4000-8000-0000000000b1'::uuid, 'editor')$q$,
  'P0001', 'member not found',
  'une cible qui n''est pas membre de cette organisation est refusée');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select role from public.organization_members
             where organization_id = 'd7000000-0000-4000-8000-000000000001'
               and user_id = 'd7000000-0000-4000-8000-0000000000a3'),
  'cashier', 'aucun de ces refus n''a écrit quoi que ce soit');

-- ══ 10. Nominal : la promotion et la rétrogradation marchent ═
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.set_team_member_role(
    'd7000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-0000000000a3', 'editor'),
  'cashier', 'la promotion rend l''ANCIEN rôle — l''appelant peut dire ce qui a changé');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select role from public.organization_members
             where organization_id = 'd7000000-0000-4000-8000-000000000001'
               and user_id = 'd7000000-0000-4000-8000-0000000000a3'),
  'editor', 'le rôle est écrit en base');

-- La conséquence qui compte vraiment : le prédicat de la RLS suit.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a3"}', true);
select ok(public.is_org_editor('d7000000-0000-4000-8000-000000000001'),
  'l''ex-caissier promu obtient bien is_org_editor (campagnes, roues, lots)');

-- Rétrogradation : c'est ce sens-là que la ré-invitation ne faisait pas.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.set_team_member_role(
    'd7000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-0000000000a2', 'cashier'),
  'editor', 'la rétrogradation rend l''ancien rôle');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a2"}', true);
select ok(not public.is_org_editor('d7000000-0000-4000-8000-000000000001'),
  'l''ex-éditeur rétrogradé PERD is_org_editor — le droit suit vraiment le rôle');
select ok(public.is_org_member('d7000000-0000-4000-8000-000000000001'),
  'il reste membre de l''équipe (caisse), il n''est pas exclu');

-- ══ 11. JAMAIS LE DERNIER PROPRIÉTAIRE ═══════════════════════
-- Sans cette borne, une organisation peut se retrouver sans personne pour
-- l'administrer : plus d'invitation, plus de facturation, plus de réglages, et
-- aucun moyen de revenir en arrière par le produit.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select throws_ok(
  $q$select public.set_team_member_role(
       'd7000000-0000-4000-8000-000000000001'::uuid,
       'd7000000-0000-4000-8000-0000000000a1'::uuid, 'cashier')$q$,
  'P0001', 'last owner',
  'le SEUL propriétaire ne peut pas se rétrograder lui-même');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select role from public.organization_members
             where organization_id = 'd7000000-0000-4000-8000-000000000001'
               and user_id = 'd7000000-0000-4000-8000-0000000000a1'),
  'owner', 'et il est toujours propriétaire après le refus');
select is((select count(*) from public.organization_members
             where organization_id = 'd7000000-0000-4000-8000-000000000001'
               and role = 'owner'),
  1::bigint, 'l''organisation garde exactement un propriétaire');

-- Un second propriétaire arrive (par un autre chemin — cette RPC ne sait pas
-- en fabriquer) : la rétrogradation devient possible.
insert into public.organization_members (organization_id, user_id, role)
values ('d7000000-0000-4000-8000-000000000001',
        'd7000000-0000-4000-8000-0000000000a4', 'owner');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select is(public.set_team_member_role(
    'd7000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-0000000000a1', 'cashier'),
  'owner', 'à deux propriétaires, l''un peut se rétrograder');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.organization_members
             where organization_id = 'd7000000-0000-4000-8000-000000000001'
               and role = 'owner'),
  1::bigint, 'il reste un propriétaire');

-- Et la borne se réarme immédiatement sur celui qui reste.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a4"}', true);
select throws_ok(
  $q$select public.set_team_member_role(
       'd7000000-0000-4000-8000-000000000001'::uuid,
       'd7000000-0000-4000-8000-0000000000a4'::uuid, 'editor')$q$,
  'P0001', 'last owner',
  'le dernier propriétaire restant est protégé à son tour');

-- L'ancien propriétaire rétrogradé ne peut plus administrer : la RPC ne lui
-- laisse pas la main qu'il vient d'abandonner.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d7000000-0000-4000-8000-0000000000a1"}', true);
select throws_ok(
  $q$select public.set_team_member_role(
       'd7000000-0000-4000-8000-000000000001'::uuid,
       'd7000000-0000-4000-8000-0000000000a4'::uuid, 'editor')$q$,
  'P0001', 'not authorized',
  'un propriétaire qui s''est rétrogradé perd immédiatement le droit d''administrer');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.organization_members
             where organization_id = 'd7000000-0000-4000-8000-000000000001'
               and role = 'owner'),
  1::bigint, 'l''organisation reste administrable — c''est tout l''objet de la borne');

select * from finish();
rollback;
