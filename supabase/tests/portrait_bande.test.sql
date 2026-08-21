-- ============================================================
-- PORTRAIT DE LA BANDE TIENT SES PROMESSES (L18)
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. LE COMMERÇANT CHOISIT SON PACK, et lui seul. `set_bande_pack` refuse le
--      caissier, refuse le propriétaire d'en face, refuse un pack inventé, et
--      journalise ce qu'il accepte — c'est ce geste qui peut allumer le taquin.
--   2. LE TIRAGE EST STABLE. Le même lobby reçoit toujours le même programme,
--      un autre lobby en reçoit un autre, et les N clés sont distinctes. Sans
--      cela, `bande_next` ne pourrait pas retrouver la question suivante.
--   3. LE SECRET DU VOTE. C'est LA propriété du lot, et elle est prouvée DEUX
--      FOIS : sur le JEU DE CLÉS (sept, et la liste est close) et sur le TEXTE
--      du document — aucun `voter_token_hash` n'y figure, à aucun moment de la
--      partie, ni avant ni après la révélation. Avec ses CONTRÔLES DE PORTÉE :
--      les mêmes expressions doivent TROUVER ce qu'elles cherchent là où il
--      doit se trouver, sans quoi elles seraient vertes par vacuité.
--   4. AUCUN RÉSULTAT AVANT LA RÉVÉLATION. `resultats` est `null` tant que la
--      question est ouverte, et le pseudo choisi par l'autre ne se lit nulle
--      part hors de la liste des participants — où tout le monde figure.
--   5. LA RÉVÉLATION EST AUTOMATIQUE AU DERNIER VOTE, dans la même transaction.
--      Le PASSE compte au DÉNOMINATEUR et à rien d'autre : c'est lui qui
--      verrouille la question, et il ne donne sa voix à personne.
--   6. LE POURCENTAGE EST EXACT, calculé sur le dénominateur FIGÉ : trois voix
--      sur cinq présents font 60 %, l'exemple du cahier.
--   7. LE DÉNOMINATEUR EST FIGÉ. Une question dont un présent ne vote pas ne se
--      révèle JAMAIS toute seule ; l'hôte la clôt, les non-votants restent des
--      abstentions, et le dénominateur ne bouge pas. Le tour suivant en re-fige
--      un neuf.
--   8. LE VOTE EST SCELLÉ. Rejouer le même est idempotent ; en désigner un
--      autre, ou passer après avoir voté, est refusé ET n'écrit rien.
--   9. ON NE VOTE PAS POUR SOI, et le refus est INDISTINCT de celui d'une cible
--      inventée ou d'une cible d'une autre salle.
--  10. LES ÉGALITÉS SORTENT TOUTES. Deux ex æquo à 50 % sont deux lignes.
--  11. LA CIBLE PEUT MOURIR, LE VOTE RESTE. Le pseudo est GRAVÉ au moment du
--      geste : supprimer le membre vide son identifiant et laisse son nom,
--      dans le résultat comme dans le récapitulatif.
--  12. LA FIN FERME LA SALLE, et l'écran de fin lui survit.
--  13. LE PORTRAIT EST DE SESSION. Seuls les tours RÉVÉLÉS y entrent — sans
--      quoi `bande_recap` aurait été une porte dérobée sur la question en
--      cours — seuls les NOMMÉS y figurent, et la purge l'emporte en cascade.
--  14. LES ACL. service_role seul sur les sept RPC, personne sur les deux
--      aides ; `anon` et `authenticated` nus sur les trois tables de partie,
--      `references` / `trigger` / `truncate` compris (leçon SEC-4).
--
-- ── CE QUE CE FICHIER NE PROUVE PAS, ET IL FAUT LE DIRE ──
--
-- pgTAP tourne dans UNE session et UNE transaction : il ne peut pas lancer deux
-- `bande_start` réellement simultanés. Ce qui est prouvé ici, c'est (a) que le
-- second appel VOIT le premier — la propriété qui casse si la création et la
-- lecture ne sont pas le même geste — et (b) que le verrou d'avis attendu EST
-- détenu, sur la clé exacte, recalculée ici comme dans la RPC. La sérialisation
-- elle-même est une propriété de `pg_advisory_xact_lock` ; prétendre la
-- démontrer ici serait un vert qui ne prouve rien. Motif socle_lobby.test.sql
-- et duo_miroir.test.sql, et la même honnêteté.
--
-- IL NE PROUVE PAS NON PLUS QU'UN JOUEUR PEUT PARTIR EN COURS DE PARTIE, parce
-- que le produit ne le permet pas : `leave_player_lobby` rend `locked` sans
-- rien écrire et `kick_player_lobby` exige `status = 'lobby'`. Le retrait de
-- membre est donc éprouvé par une SUPPRESSION DIRECTE, et c'est dit là où elle
-- est faite (§11) : ce qu'on éprouve alors est la garde `on delete set null`,
-- qui existe pour le lot À VENIR qui ajoutera ce retrait.
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
-- A : LE COMMERCE QUI JOUE. Vitrine publiée, module `vitrine` par octroi daté
--     vivant (seul chemin ouvert en bêta) — `create_player_lobby` exige les
--     deux.
-- B : LE VOISIN. Servi lui aussi, avec sa propre salle : sans elle, « la cible
--     d'une autre salle est refusée » se confondrait avec « cette salle
--     n'existe pas ».
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('b0000000-0000-4000-8000-00000000000a', 'Bande A', 'tap-bande-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('b0000000-0000-4000-8000-00000000000b', 'Bande B', 'tap-bande-b',
   'active', 'starter', 'Europe/Paris', 6);

-- LES ACTEURS. `set_bande_pack` vérifie l'appartenance EN SQL, donc il faut de
-- vrais membres : un propriétaire et un éditeur chez A (les deux habilités), un
-- CAISSIER chez A (le refus qui prouve que le RÔLE est lu, et pas seulement
-- l'appartenance), et un propriétaire chez B (celui qui prouve que le LOCATAIRE
-- est comparé — il est habilité, mais pas ici).
insert into auth.users (id, email) values
  ('b0000001-0000-4000-8000-000000000001', 'proprio-a@tap-bande.local'),
  ('b0000001-0000-4000-8000-000000000002', 'editeur-a@tap-bande.local'),
  ('b0000001-0000-4000-8000-000000000003', 'caissier-a@tap-bande.local'),
  ('b0000001-0000-4000-8000-000000000004', 'proprio-b@tap-bande.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('b0000000-0000-4000-8000-00000000000a',
   'b0000001-0000-4000-8000-000000000001', 'owner'),
  ('b0000000-0000-4000-8000-00000000000a',
   'b0000001-0000-4000-8000-000000000002', 'editor'),
  ('b0000000-0000-4000-8000-00000000000a',
   'b0000001-0000-4000-8000-000000000003', 'cashier'),
  ('b0000000-0000-4000-8000-00000000000b',
   'b0000001-0000-4000-8000-000000000004', 'owner');

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
select o.id, 'vitrine', 'pass', 'backoffice',
       now() - interval '1 day', now() + interval '365 days'
  from (values
    ('b0000000-0000-4000-8000-00000000000a'::uuid),
    ('b0000000-0000-4000-8000-00000000000b'::uuid)) as o(id);

-- LA VITRINE, ET SA PUBLICATION. L'ordre compte :
-- `vitrine_settings_guard_publication` refuse la TRANSITION vers
-- `published = true` à qui n'a pas le droit, donc les octrois ci-dessus doivent
-- précéder ces inserts.
insert into public.vitrine_settings (organization_id, slug, published)
values
  ('b0000000-0000-4000-8000-00000000000a', 'tap-vitrine-bande-a', true),
  ('b0000000-0000-4000-8000-00000000000b', 'tap-vitrine-bande-b', true);

-- La mécanique du fichier : chaque RPC est appelée UNE SEULE FOIS, son document
-- mémorisé ici, et toutes les assertions relisent la table — jamais la RPC.
-- Motif socle_lobby.test.sql / duo_miroir.test.sql : sans cela, on éprouverait
-- la stabilité de la base au lieu du contrat de la fonction.
create temporary table pb (nom text primary key, j jsonb);


-- ════════════════════════════════════════════════════════════
-- 1. LE COMMERÇANT CHOISIT SON PACK
-- ════════════════════════════════════════════════════════════

insert into pb values ('pack1', public.set_bande_pack(
  'b0000000-0000-4000-8000-00000000000a', 'equipe',
  'b0000001-0000-4000-8000-000000000001'));

select is(
  (select j from pb where nom = 'pack1'),
  '{"state": "ok", "pack": "equipe"}'::jsonb,
  'PACK-1 le propriétaire pose un pack, et le document dit lequel');
select is(
  (select s.pack from public.bande_settings s
    where s.organization_id = 'b0000000-0000-4000-8000-00000000000a'),
  'equipe',
  'PACK-2 … et la ligne NAÎT de la RPC (bande_settings n''accorde aucun insert)');

-- L'ÉDITEUR AUSSI. C'est le même partage que les policies de la table, et il
-- est vérifié sur les DEUX rôles habilités plutôt que sur le seul propriétaire.
insert into pb values ('pack2', public.set_bande_pack(
  'b0000000-0000-4000-8000-00000000000a', 'taquin',
  'b0000001-0000-4000-8000-000000000002'));
select is(
  (select j->>'pack' from pb where nom = 'pack2'), 'taquin',
  'PACK-3 l''éditeur aussi — et c''est lui qui peut allumer le taquin');

-- ── LES REFUS D'ACTEUR ───────────────────────────────────────
select throws_ok(
  $$select public.set_bande_pack(
      'b0000000-0000-4000-8000-00000000000a', 'amis',
      'b0000001-0000-4000-8000-000000000003')$$,
  '42501',
  'not authorized',
  'PACK-4 le CAISSIER est refusé : choisir le ton du jeu n''est pas un geste de comptoir');
select throws_ok(
  $$select public.set_bande_pack(
      'b0000000-0000-4000-8000-00000000000a', 'amis',
      'b0000001-0000-4000-8000-000000000004')$$,
  '42501',
  'not authorized',
  'PACK-5 le propriétaire D''EN FACE est refusé : le locataire est comparé');
select throws_ok(
  $$select public.set_bande_pack(
      'b0000000-0000-4000-8000-00000000000a', 'amis', null)$$,
  '42501',
  'not authorized',
  'PACK-6 un acteur ABSENT est refusé — l''audit ne prend pas de déclaration sur l''honneur');

-- ── LES REFUS DE PACK ────────────────────────────────────────
select throws_ok(
  $$select public.set_bande_pack(
      'b0000000-0000-4000-8000-00000000000a', 'mechant',
      'b0000001-0000-4000-8000-000000000001')$$,
  '22023',
  'unknown bande pack',
  'PACK-7 un pack INVENTÉ lève un refus LISIBLE, il ne tombe pas sur le check');
select throws_ok(
  $$select public.set_bande_pack(
      'b0000000-0000-4000-8000-00000000000a', null,
      'b0000001-0000-4000-8000-000000000001')$$,
  '22023',
  'unknown bande pack',
  'PACK-8 … et un pack NUL emprunte le même refus');
select throws_ok(
  $$select public.set_bande_pack(null, 'amis',
      'b0000001-0000-4000-8000-000000000001')$$,
  '22023',
  'organization required',
  'PACK-9 une organisation absente est un bogue d''appelant, et il se dit fort');

-- AUCUN DE CES CINQ REFUS N'A RIEN ÉCRIT. Sans cette assertion, un refus qui
-- lèverait APRÈS avoir écrit passerait les cinq précédentes.
select is(
  (select s.pack from public.bande_settings s
    where s.organization_id = 'b0000000-0000-4000-8000-00000000000a'),
  'taquin',
  'PACK-10 aucun des cinq refus n''a touché le réglage');

-- ── LE JOURNAL ───────────────────────────────────────────────
select is(
  (select pg_catalog.count(*)::integer from public.audit_logs a
    where a.organization_id = 'b0000000-0000-4000-8000-00000000000a'
      and a.action = 'bande.pack_set'),
  2,
  'PACK-11 le journal porte les DEUX gestes acceptés, et eux seuls');
-- L'ASSERTION PORTE SUR L'ENSEMBLE DES VALEURS, PAS SUR « LA DERNIÈRE ». Une
-- première version lisait `order by created_at desc, id desc limit 1` et
-- passait sur base vide, échouait sur base semée : `created_at` vaut `now()`,
-- l'instant de DÉBUT DE TRANSACTION, donc les trois lignes du fichier portent
-- la MÊME date à la microseconde près, et le départage retombait sur l'ordre
-- ARBITRAIRE des uuid. C'est exactement la leçon `org_segment_emails`
-- (20260930120000) : une borne posée sur un ensemble non totalement ordonné
-- coupe dans un sous-ensemble arbitraire. Ici il n'y a rien à ordonner — ce
-- qu'on veut savoir, c'est que la valeur est journalisée, pas laquelle est
-- arrivée en dernier.
select is(
  (select pg_catalog.string_agg(a.metadata->>'pack', ',' order by a.metadata->>'pack')
     from public.audit_logs a
    where a.organization_id = 'b0000000-0000-4000-8000-00000000000a'
      and a.action = 'bande.pack_set'),
  'equipe,taquin',
  'PACK-12 … et il porte LA VALEUR : « qui a allumé le taquin » se lit ici');

-- On repose `equipe` pour la suite : c'est le pack que la partie jouera, et
-- l'assertion START-2 le retrouvera COPIÉ dans la partie.
insert into pb values ('pack3', public.set_bande_pack(
  'b0000000-0000-4000-8000-00000000000a', 'equipe',
  'b0000001-0000-4000-8000-000000000001'));


-- ════════════════════════════════════════════════════════════
-- 2. LES CLÉS ET LE TIRAGE
-- ════════════════════════════════════════════════════════════

select is(
  (select pg_catalog.count(*)::integer
     from (values ('amis'), ('duo'), ('equipe'), ('anniversaire'), ('taquin'))
          as p(cle)
    where pg_catalog.array_length(public.bande_pack_questions(p.cle), 1) = 12),
  5,
  'TIR-1 les cinq packs du check portent DOUZE clés chacun');
select is(
  public.bande_pack_questions('inconnu'),
  '{}'::text[],
  'TIR-2 un pack inconnu rend un tableau VIDE et ne lève pas : le check refuse déjà les clés inventées');

-- LA STABILITÉ, ET C'EST ELLE QUI REND `bande_next` POSSIBLE.
select is(
  public.bande_questions_tirees(
    'equipe', 'b0000009-0000-4000-8000-000000000001', 6),
  public.bande_questions_tirees(
    'equipe', 'b0000009-0000-4000-8000-000000000001', 6),
  'TIR-3 le tirage est STABLE : deux appels rendent le MÊME programme');
select isnt(
  public.bande_questions_tirees(
    'equipe', 'b0000009-0000-4000-8000-000000000001', 6),
  public.bande_questions_tirees(
    'equipe', 'b0000009-0000-4000-8000-000000000002', 6),
  'TIR-4 … et il dépend de la SALLE : deux salles du même pack jouent deux programmes');
select is(
  (select pg_catalog.count(distinct x)::integer
     from pg_catalog.unnest(public.bande_questions_tirees(
       'equipe', 'b0000009-0000-4000-8000-000000000001', 6)) as t(x)),
  6,
  'TIR-5 les six clés tirées sont DISTINCTES');
select ok(
  (select bool_and(x = any(public.bande_pack_questions('equipe')))
     from pg_catalog.unnest(public.bande_questions_tirees(
       'equipe', 'b0000009-0000-4000-8000-000000000001', 6)) as t(x)),
  'TIR-6 … et toutes appartiennent au pack demandé');


-- ════════════════════════════════════════════════════════════
-- 3. LES SALLES — on passe par les VRAIES RPC de L16
--
-- Écrire les lobbies en direct aurait été plus court, et aurait prouvé moins :
-- ce lot repose sur le socle, et le faire passer par `create` / `join` / `lock`
-- vérifie au passage que les deux s'emboîtent.
--
-- LES PSEUDOS SONT VOLONTAIREMENT UNIQUES ET IMPROBABLES. Les assertions
-- d'invisibilité cherchent une SOUS-CHAÎNE dans le document : un pseudo banal
-- (« Hôte ») s'y trouverait par accident, et l'assertion rougirait sans qu'aucun
-- secret n'ait fui. « Bande Charlie » n'apparaît nulle part ailleurs dans le
-- schéma, ni dans le seed.
-- ════════════════════════════════════════════════════════════

-- S1 — CINQ JOUEURS. C'est la salle de l'exemple du cahier : trois voix sur
-- cinq présents, 60 %.
insert into pb values ('s1', public.create_player_lobby(
  'b0000000-0000-4000-8000-00000000000a', 'bande', 6,
  repeat('a1', 32), 'Bande Alpha'));
insert into pb values ('s1j2', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 's1'),
  repeat('a2', 32), 'Bande Bravo'));
insert into pb values ('s1j3', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 's1'),
  repeat('a3', 32), 'Bande Charlie'));
insert into pb values ('s1j4', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 's1'),
  repeat('a4', 32), 'Bande Delta'));
insert into pb values ('s1j5', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 's1'),
  repeat('a5', 32), 'Bande Echo'));
insert into pb values ('s1l', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a1', 32)));

select is((select j->>'state' from pb where nom = 's1'), 'created',
  'SALLE-1 la salle bande s''ouvre');
select is((select j->>'state' from pb where nom = 's1j5'), 'joined',
  'SALLE-2 … cinq joueurs y entrent');
select is((select j->>'state' from pb where nom = 's1l'), 'locked',
  'SALLE-3 … et l''hôte ferme la porte : la partie peut commencer');

-- S2 — QUATRE JOUEURS, pour l'ÉGALITÉ.
insert into pb values ('s2', public.create_player_lobby(
  'b0000000-0000-4000-8000-00000000000a', 'bande', 6,
  repeat('c1', 32), 'Bande India'));
insert into pb values ('s2j2', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 's2'),
  repeat('c2', 32), 'Bande Juliett'));
insert into pb values ('s2j3', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 's2'),
  repeat('c3', 32), 'Bande Kilo'));
insert into pb values ('s2j4', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 's2'),
  repeat('c4', 32), 'Bande Lima'));
insert into pb values ('s2l', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from pb where nom = 's2'), repeat('c1', 32)));

-- S3 — TROIS JOUEURS, pour le SCEAU, le DÉNOMINATEUR FIGÉ et le NOM GRAVÉ.
insert into pb values ('s3', public.create_player_lobby(
  'b0000000-0000-4000-8000-00000000000a', 'bande', 6,
  repeat('d1', 32), 'Bande Foxtrot'));
insert into pb values ('s3j2', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 's3'),
  repeat('d2', 32), 'Bande Golf'));
insert into pb values ('s3j3', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 's3'),
  repeat('d3', 32), 'Bande Hotel'));
insert into pb values ('s3l', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32)));

-- S4 — DEUX JOUEURS, la partie qu'on déroule jusqu'au récapitulatif.
insert into pb values ('s4', public.create_player_lobby(
  'b0000000-0000-4000-8000-00000000000a', 'bande', 6,
  repeat('e1', 32), 'Bande Mike'));
insert into pb values ('s4j2', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 's4'),
  repeat('e2', 32), 'Bande November'));
insert into pb values ('s4l', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from pb where nom = 's4'), repeat('e1', 32)));

-- SSOLO — DEUX JOUEURS, verrouillée, puis RÉDUITE À UN. C'est la seule façon
-- d'obtenir une salle `locked` à un seul membre en passant par les vraies RPC :
-- `lock_player_lobby` refuse de verrouiller à un, et `kick_player_lobby` exige
-- `status = 'lobby'`. On retire donc AVANT de verrouiller.
insert into pb values ('ssolo', public.create_player_lobby(
  'b0000000-0000-4000-8000-00000000000a', 'bande', 6,
  repeat('f1', 32), 'Bande Oscar'));
insert into pb values ('ssoloj', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 'ssolo'),
  repeat('f2', 32), 'Bande Papa'));

-- SDUO — bon socle, mauvais jeu.
insert into pb values ('sduo', public.create_player_lobby(
  'b0000000-0000-4000-8000-00000000000a', 'duo', 2,
  repeat('0a', 32), 'Bande Quebec'));
insert into pb values ('sduoj', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 'sduo'),
  repeat('0b', 32), 'Bande Romeo'));
insert into pb values ('sduol', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from pb where nom = 'sduo'), repeat('0a', 32)));

-- SOUV — jamais verrouillée : l'hôte n'a pas fermé la porte.
insert into pb values ('souv', public.create_player_lobby(
  'b0000000-0000-4000-8000-00000000000a', 'bande', 6,
  repeat('1c', 32), 'Bande Sierra'));
insert into pb values ('souvj', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 'souv'),
  repeat('1d', 32), 'Bande Tango'));

-- SB — LA SALLE DU VOISIN. Elle porte la cible « d'une autre salle » qu'on
-- tentera de nommer depuis S3.
insert into pb values ('sb', public.create_player_lobby(
  'b0000000-0000-4000-8000-00000000000b', 'bande', 6,
  repeat('b1', 32), 'Bande Uniform'));
insert into pb values ('sbj', public.join_player_lobby(
  (select j->>'join_code' from pb where nom = 'sb'),
  repeat('b2', 32), 'Bande Victor'));
insert into pb values ('sbl', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from pb where nom = 'sb'), repeat('b1', 32)));

-- Les identifiants de membres, résolus UNE FOIS. Toutes les assertions qui
-- suivent les relisent ici plutôt que de refaire la jointure : une résolution
-- par assertion aurait fini par désigner quelqu'un d'autre le jour où le rang
-- change.
create temporary table pbm (nom text primary key, id uuid);
insert into pbm
select x.nom, m.id
  from (values
    ('alpha', 'a1'), ('bravo', 'a2'), ('charlie', 'a3'),
    ('delta', 'a4'), ('echo', 'a5')) as x(nom, h)
  join public.player_lobby_members m
    on m.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's1')
   and m.token_hash = repeat(x.h, 32);
insert into pbm
select x.nom, m.id
  from (values
    ('india', 'c1'), ('juliett', 'c2'), ('kilo', 'c3'), ('lima', 'c4'))
       as x(nom, h)
  join public.player_lobby_members m
    on m.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's2')
   and m.token_hash = repeat(x.h, 32);
insert into pbm
select x.nom, m.id
  from (values ('foxtrot', 'd1'), ('golf', 'd2'), ('hotel', 'd3'))
       as x(nom, h)
  join public.player_lobby_members m
    on m.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's3')
   and m.token_hash = repeat(x.h, 32);
insert into pbm
select x.nom, m.id
  from (values ('mike', 'e1'), ('november', 'e2')) as x(nom, h)
  join public.player_lobby_members m
    on m.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's4')
   and m.token_hash = repeat(x.h, 32);
insert into pbm
select 'victor', m.id
  from public.player_lobby_members m
 where m.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 'sb')
   and m.token_hash = repeat('b2', 32);


-- ════════════════════════════════════════════════════════════
-- 4. `bande_start` — IDEMPOTENTE, ET SES REFUS
-- ════════════════════════════════════════════════════════════

insert into pb values ('st1', public.bande_start(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a1', 32)));
insert into pb values ('st1bis', public.bande_start(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a2', 32)));

select is((select j->>'state' from pb where nom = 'st1'), 'ok',
  'START-1 la partie s''ouvre');
select is((select j->>'pack' from pb where nom = 'st1'), 'equipe',
  'START-2 … avec le pack du commerce, COPIÉ');
select is(
  (select j - 'partie_id' from pb where nom = 'st1'),
  '{"pack": "equipe", "state": "ok", "position": 1, "nb_questions": 6}'::jsonb,
  'START-3 … six questions, et l''on est à la première');

-- L'IDEMPOTENCE : le SECOND téléphone ouvre la même partie, et il n'en existe
-- qu'UNE. C'est l'arbitrage écrit en contrainte, prouvé sur l'objet.
select is(
  (select j->'partie_id' from pb where nom = 'st1'),
  (select j->'partie_id' from pb where nom = 'st1bis'),
  'START-4 le second appel rend la MÊME partie : bande_start est idempotente');
select is(
  (select pg_catalog.count(*)::integer from public.bande_parties p
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's1')),
  1,
  'START-5 … et il n''existe qu''UNE partie pour cette salle');

-- LE VERROU SUR LEQUEL REPOSE CETTE IDEMPOTENCE. La clé est construite ici
-- EXACTEMENT comme dans la RPC — si l'une des deux change, cette assertion
-- rougit. C'est aussi la MÊME clé que celle de L16 et de L17.
with k as (
  select pg_catalog.hashtextextended(
    'player_lobby:' || 'b0000000-0000-4000-8000-00000000000a' || ':'
      || (select (j->>'lobby_id') from pb where nom = 's1'), 0) as v
)
select ok(
  exists (
    select 1 from pg_locks l, k
     where l.locktype = 'advisory'
       and l.objsubid = 1
       and l.classid::bigint = ((k.v >> 32) & 4294967295)
       and l.objid::bigint = (k.v & 4294967295)
  ),
  'START-6 le verrou d''avis (organisation + lobby) est détenu, sur la clé de L16');

-- LE TOUR 1 EXISTE, avec son dénominateur FIGÉ et la PREMIÈRE clé du programme.
select is(
  (select t.denominateur from public.bande_tours t
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's1')
      and t.position = 1),
  5,
  'START-7 le tour 1 fige le nombre de PRÉSENTS : cinq');
select is(
  (select t.question_cle from public.bande_tours t
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's1')
      and t.position = 1),
  (public.bande_questions_tirees(
     'equipe',
     (select (j->>'lobby_id')::uuid from pb where nom = 's1'), 6))[1],
  'START-8 … et sa question est la PREMIÈRE du programme tiré');

-- ── LES REFUS ────────────────────────────────────────────────
select is(
  public.bande_start(
    (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('99', 32)),
  '{"state": "unavailable"}'::jsonb,
  'START-9 un NON-MEMBRE est refusé');
select is(
  public.bande_start(
    (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('99', 32)),
  public.bande_start('b0000009-0000-4000-8000-0000000000ff', repeat('99', 32)),
  'START-10 … et son refus est INDISTINCT de celui d''un lobby inventé');
select is(
  public.bande_start(
    (select (j->>'lobby_id')::uuid from pb where nom = 'sduo'), repeat('0a', 32)),
  '{"state": "unavailable"}'::jsonb,
  'START-11 une salle « duo » est refusée : bon socle, mauvais jeu');
select is(
  public.bande_start(
    (select (j->>'lobby_id')::uuid from pb where nom = 'souv'), repeat('1c', 32)),
  '{"state": "unavailable"}'::jsonb,
  'START-12 une salle NON VERROUILLÉE est refusée : la porte n''est pas fermée');
select is(
  public.bande_start(null, repeat('a1', 32)),
  '{"state": "unavailable"}'::jsonb,
  'START-13 un identifiant absent reçoit le même refus muet');
select throws_ok(
  $$select public.bande_start(
      'b0000009-0000-4000-8000-0000000000ff', 'pas-un-hash')$$,
  '22023',
  'invalid player key',
  'START-14 un jeton MAL FORMÉ est un bogue d''appelant, et il se dit fort');

-- LA BORNE DES DEUX MEMBRES. On retire Papa AVANT de verrouiller (kick exige
-- `status = 'lobby'`), puis on verrouille en direct : `lock_player_lobby`
-- refuserait à un seul, et c'est précisément l'état qu'on veut éprouver ici.
insert into pb values ('ssolok', public.kick_player_lobby(
  (select (j->>'lobby_id')::uuid from pb where nom = 'ssolo'),
  repeat('f1', 32), 2));
update public.player_lobbies l
   set status = 'locked'
 where l.id = (select (j->>'lobby_id')::uuid from pb where nom = 'ssolo');
select is(
  (select j->'kicked' from pb where nom = 'ssolok'), 'true'::jsonb,
  'START-15 (mise en place) la place de Papa est libérée avant le verrouillage');
select is(
  public.bande_start(
    (select (j->>'lobby_id')::uuid from pb where nom = 'ssolo'),
    repeat('f1', 32)),
  '{"state": "unavailable"}'::jsonb,
  'START-16 une salle verrouillée à UN SEUL membre est refusée : personne à nommer');
select is(
  (select pg_catalog.count(*)::integer from public.bande_parties p
    where p.lobby_id
      = (select (j->>'lobby_id')::uuid from pb where nom = 'ssolo')),
  0,
  'START-17 … et ce refus n''a créé aucune partie');


-- ════════════════════════════════════════════════════════════
-- 5. LE SECRET DU VOTE — LE CŒUR DU LOT
--
-- Alpha nomme Charlie. Personne d'autre n'a voté. Ce qu'on éprouve ici, c'est
-- que rien dans le document rendu à un TIERS ne dit ni qui a voté, ni pour qui.
-- ════════════════════════════════════════════════════════════

insert into pb values ('v_alpha', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a1', 32),
  (select id from pbm where nom = 'charlie')));

select is(
  (select j from pb where nom = 'v_alpha'),
  '{"state": "ok", "scelle": true, "revelee": false}'::jsonb,
  'SEC-1 le vote est scellé, et la question n''est pas révélée : il en manque quatre');

-- La vue d'ECHO, qui n'a rien voté. C'est elle que toutes les assertions
-- d'invisibilité relisent.
insert into pb values ('vue_echo', public.bande_state(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a5', 32)));

-- ── LA PREUVE, PREMIÈRE MOITIÉ : LE JEU DE CLÉS ──────────────
-- L'assertion porte sur l'ENSEMBLE EXACT des clés, et non sur l'absence de
-- `resultats` : « pas de resultats » serait vert le jour où une SECONDE donnée
-- réservée apparaîtrait sous un autre nom. Sept clés, et la liste est close —
-- une huitième se paiera du prix de cette assertion, donc consciemment.
select is(
  (select pg_catalog.string_agg(k, ',' order by k)
     from pb, pg_catalog.jsonb_object_keys(j) as k
    where nom = 'vue_echo'),
  'mon_vote,participants,partie,resultats,salle_close,state,tour',
  'SEC-2 le document porte SEPT clés, et la liste est close');
select is(
  (select pg_catalog.string_agg(k, ',' order by k)
     from pb, pg_catalog.jsonb_object_keys(j->'tour') as k
    where nom = 'vue_echo'),
  'denominateur,position,question_cle,status,votes_exprimes',
  'SEC-3 le sous-document `tour` en porte CINQ, et la liste est close aussi');
select is(
  (select j->'resultats' from pb where nom = 'vue_echo'),
  'null'::jsonb,
  'SEC-4 `resultats` est NULL : aucun résultat avant la révélation');
select is(
  (select j->'tour'->'votes_exprimes' from pb where nom = 'vue_echo'),
  '1'::jsonb,
  'SEC-5 `votes_exprimes` dit COMBIEN ont répondu — l''attente invisible du cahier');
select is(
  (select j->'mon_vote' from pb where nom = 'vue_echo'),
  'null'::jsonb,
  'SEC-6 … et Echo, qui n''a pas voté, n''a pas de vote à lui');

-- ── LA PREUVE, DEUXIÈME MOITIÉ : POUR QUI, DANS LE TEXTE ─────
-- Le jeu de clés seul ne suffit pas : une clé mal nommée qui transporterait la
-- cible de l'autre passerait SEC-2. On cherche donc la SOUS-CHAÎNE, et sur les
-- DEUX désignations — le pseudo et l'identifiant de membre.
--
-- `- 'participants'` EST NÉCESSAIRE, ET C'EST TOUTE LA SUBTILITÉ. La liste des
-- participants contient forcément « Bande Charlie » : c'est une des cinq
-- personnes présentes, et l'écran doit pouvoir la proposer au vote. Chercher la
-- chaîne dans le document ENTIER rougirait toujours, et n'aurait rien prouvé.
-- Ce qui doit être vrai, c'est qu'aucune clé HORS de cette liste ne DÉSIGNE la
-- personne choisie par Alpha — c'est-à-dire que rien ne la distingue des quatre
-- autres.
select ok(
  ((select j from pb where nom = 'vue_echo') - 'participants')::text
    not like '%Bande Charlie%',
  'SEC-7 hors de la liste des participants, le PSEUDO nommé par Alpha ne se lit nulle part');
select ok(
  ((select j from pb where nom = 'vue_echo') - 'participants')::text
    not like '%' || (select id::text from pbm where nom = 'charlie') || '%',
  'SEC-8 … ni son IDENTIFIANT : pas même chiffré, pas même en compte');

-- ── LA PREUVE, TROISIÈME MOITIÉ : QUI, DANS LE TEXTE ─────────
-- C'est la promesse du cahier — « les personnes qui ont voté ne sont jamais
-- révélées » — et elle porte sur le document ENTIER, `participants` comprise :
-- un `voter_token_hash` n'a aucune raison d'y figurer, où que ce soit.
select ok(
  (select bool_and((select j from pb where nom = 'vue_echo')::text
                     not like '%' || repeat(h, 32) || '%')
     from (values ('a1'), ('a2'), ('a3'), ('a4'), ('a5')) as t(h)),
  'SEC-9 AUCUN des cinq jetons de votant ne figure dans le document');

-- ── LES TROIS CONTRÔLES DE PORTÉE ────────────────────────────
-- Sans eux, SEC-7, SEC-8 et SEC-9 seraient vertes le jour où `bande_state`
-- rendrait un document vide, ou le jour où la fixture cesserait de nommer ses
-- gens ainsi. On prouve que les MÊMES expressions trouvent bien ce qu'elles
-- cherchent quand cela DOIT s'y trouver.
insert into pb values ('vue_alpha', public.bande_state(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a1', 32)));
select ok(
  ((select j from pb where nom = 'vue_alpha') - 'participants')::text
    like '%Bande Charlie%',
  'SEC-10 CONTRÔLE DE PORTÉE : la même expression TROUVE le pseudo dans le mon_vote d''Alpha');
select ok(
  ((select j from pb where nom = 'vue_alpha') - 'participants')::text
    like '%' || (select id::text from pbm where nom = 'charlie') || '%',
  'SEC-11 CONTRÔLE DE PORTÉE : … et son identifiant, au même endroit');
select ok(
  exists (select 1 from public.bande_votes v
           where v.voter_token_hash = repeat('a1', 32)),
  'SEC-12 CONTRÔLE DE PORTÉE : le jeton cherché par SEC-9 EST bien écrit en base');

select is(
  (select j->'mon_vote'->>'cible_pseudo' from pb where nom = 'vue_alpha'),
  'Bande Charlie',
  'SEC-13 mon PROPRE vote m''est toujours rendu, avec le nom gravé');

-- ── LE REFUS DE `bande_state` ────────────────────────────────
select is(
  public.bande_state(
    (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('99', 32)),
  '{"state": "unavailable"}'::jsonb,
  'SEC-14 un NON-MEMBRE ne lit rien de la partie');
select is(
  public.bande_state(
    (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('99', 32)),
  public.bande_state('b0000009-0000-4000-8000-0000000000ff', repeat('99', 32)),
  'SEC-15 … et son refus est INDISTINCT de celui d''un lobby inventé');


-- ════════════════════════════════════════════════════════════
-- 6. LA RÉVÉLATION AUTOMATIQUE, LE PASSE, ET LE POURCENTAGE
--
-- Bravo et Delta nomment Charlie à leur tour ; Charlie et Echo PASSENT. Cinq
-- gestes sur cinq présents : la question se verrouille au dernier, dans la même
-- transaction.
-- ════════════════════════════════════════════════════════════

insert into pb values ('v_bravo', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a2', 32),
  (select id from pbm where nom = 'charlie')));
insert into pb values ('v_delta', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a4', 32),
  (select id from pbm where nom = 'charlie')));
insert into pb values ('v_charlie', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a3', 32),
  null));

-- QUATRE GESTES SUR CINQ : toujours rien. C'est l'assertion qui sépare « la
-- révélation vient quand tous ont voté » de « la révélation vient quand
-- quelqu'un vote ».
insert into pb values ('vue_4', public.bande_state(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a5', 32)));
select is(
  (select j->'resultats' from pb where nom = 'vue_4'), 'null'::jsonb,
  'REV-1 à QUATRE gestes sur cinq, `resultats` est encore NULL');
select is(
  (select j->'tour'->'votes_exprimes' from pb where nom = 'vue_4'), '4'::jsonb,
  'REV-2 … et le compte, lui, a bien monté à quatre (les passes y sont)');
select is(
  (select j->'revelee' from pb where nom = 'v_charlie'), 'false'::jsonb,
  'REV-3 … le PASSE de Charlie n''a pas révélé : il en manquait un');

insert into pb values ('v_echo', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a5', 32),
  null));

select is(
  (select j from pb where nom = 'v_echo'),
  '{"state": "ok", "scelle": true, "revelee": true}'::jsonb,
  'REV-4 le CINQUIÈME geste révèle, et il le dit');
select is(
  (select t.status from public.bande_tours t
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's1')
      and t.position = 1),
  'revelee',
  'REV-5 … dans la MÊME transaction que le vote : aucun cron, aucun appel de suivi');
select ok(
  (select t.revealed_at is not null from public.bande_tours t
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's1')
      and t.position = 1),
  'REV-6 … et `revealed_at` est posé (l''équivalence du check tient)');

insert into pb values ('vue_rev', public.bande_state(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a5', 32)));

-- L'EXEMPLE DU CAHIER, MOT POUR MOT : « 60 % · 3 personnes sur 5 ».
select is(
  (select j->'resultats' from pb where nom = 'vue_rev'),
  ('[{"voix": 3, "pourcentage": 60, "cible_pseudo": "Bande Charlie", '
   || '"cible_member_id": "'
   || (select id::text from pbm where nom = 'charlie') || '"}]')::jsonb,
  'REV-7 trois voix sur cinq présents, 60 % : l''exemple du cahier, calculé par le serveur');
select is(
  (select pg_catalog.jsonb_array_length(j->'resultats') from pb where nom = 'vue_rev'),
  1,
  'REV-8 UNE seule ligne : les deux PASSES ne donnent leur voix à personne');
select is(
  (select j->'tour'->'denominateur' from pb where nom = 'vue_rev'), '5'::jsonb,
  'REV-9 … mais ils comptent au DÉNOMINATEUR : cinq, pas trois');
select is(
  (select j->'tour'->'votes_exprimes' from pb where nom = 'vue_rev'), '5'::jsonb,
  'REV-10 … et le compte des gestes vaut le dénominateur, ce qui est la condition de la révélation');
select is(
  (select j->'salle_close' from pb where nom = 'vue_rev'), 'false'::jsonb,
  'REV-11 la salle n''est PAS close : il reste cinq questions');

-- LA PROMESSE TIENT APRÈS LA RÉVÉLATION AUSSI. C'est la différence avec L17,
-- où la révélation montre les deux choix côte à côte : ici elle montre un
-- décompte, et jamais un votant.
select ok(
  (select bool_and((select j from pb where nom = 'vue_rev')::text
                     not like '%' || repeat(h, 32) || '%')
     from (values ('a1'), ('a2'), ('a3'), ('a4'), ('a5')) as t(h)),
  'REV-12 APRÈS la révélation, aucun jeton de votant ne figure encore dans le document');

-- LE VOTE APRÈS RÉVÉLATION EST REFUSÉ. Le tour n'est plus `ouverte`.
select is(
  public.bande_vote(
    (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a1', 32),
    (select id from pbm where nom = 'bravo')),
  '{"state": "unavailable"}'::jsonb,
  'REV-13 on ne vote plus sur une question révélée');


-- ════════════════════════════════════════════════════════════
-- 7. LE VOTE EST SCELLÉ — sur S3, dont la question reste OUVERTE
--
-- La salle S3 est celle où le sceau s'éprouve : une salle révélée sortirait en
-- `unavailable` deux gardes plus haut et laisserait la branche du sceau non
-- couverte. C'est la leçon `GRAVE-9a` de L17, rejouée ici.
-- ════════════════════════════════════════════════════════════

insert into pb values ('st3', public.bande_start(
  (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32)));
insert into pb values ('sc1', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32),
  (select id from pbm where nom = 'golf')));
insert into pb values ('sc2', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32),
  (select id from pbm where nom = 'golf')));

select is((select j->>'state' from pb where nom = 'sc1'), 'ok',
  'SCEAU-1 Foxtrot nomme Golf');
select is(
  (select j from pb where nom = 'sc2'),
  '{"state": "ok", "scelle": true, "revelee": false}'::jsonb,
  'SCEAU-2 rejouer le MÊME vote est idempotent : le double-clic ne punit pas');
select is(
  (select pg_catalog.count(*)::integer from public.bande_votes v
     join public.bande_tours t on t.id = v.tour_id
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's3')
      and v.voter_token_hash = repeat('d1', 32)),
  1,
  'SCEAU-3 … et il n''y a toujours qu''UNE ligne de vote');

select is(
  public.bande_vote(
    (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32),
    (select id from pbm where nom = 'hotel')),
  '{"state": "scelle"}'::jsonb,
  'SCEAU-4 en désigner un AUTRE est refusé : on n''attend pas le compte pour changer d''avis');
select is(
  public.bande_vote(
    (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32),
    null),
  '{"state": "scelle"}'::jsonb,
  'SCEAU-5 PASSER après avoir voté est refusé aussi : c''est la seconde moitié de la comparaison');
select is(
  (select v.cible_pseudo from public.bande_votes v
     join public.bande_tours t on t.id = v.tour_id
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's3')
      and v.voter_token_hash = repeat('d1', 32)),
  'Bande Golf',
  'SCEAU-6 … et AUCUN des deux refus n''a rien écrit : le vote est toujours Golf');

-- ── LES TROIS REFUS DE CIBLE, ET LEUR INDISTINCTION ──────────
select is(
  public.bande_vote(
    (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d2', 32),
    (select id from pbm where nom = 'golf')),
  '{"state": "unavailable"}'::jsonb,
  'SCEAU-7 ON NE VOTE PAS POUR SOI : Golf ne peut pas se nommer');
select is(
  public.bande_vote(
    (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d2', 32),
    'b0000009-0000-4000-8000-0000000000ee'),
  '{"state": "unavailable"}'::jsonb,
  'SCEAU-8 … et une cible INVENTÉE reçoit exactement le même refus');
select is(
  public.bande_vote(
    (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d2', 32),
    (select id from pbm where nom = 'victor')),
  '{"state": "unavailable"}'::jsonb,
  'SCEAU-9 … et une cible de la salle DU VOISIN aussi : la RPC n''est pas un annuaire');
select is(
  public.bande_vote(
    (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d2', 32),
    (select id from pbm where nom = 'alpha')),
  '{"state": "unavailable"}'::jsonb,
  'SCEAU-10 … et une cible d''une AUTRE SALLE DU MÊME commerce n''y échappe pas');
select is(
  (select pg_catalog.count(*)::integer from public.bande_votes v
     join public.bande_tours t on t.id = v.tour_id
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's3')),
  1,
  'SCEAU-11 aucun de ces quatre refus n''a écrit de vote');

-- LE REFUS D'UN NON-MEMBRE, indistinct lui aussi.
select is(
  public.bande_vote(
    (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('99', 32),
    (select id from pbm where nom = 'golf')),
  '{"state": "unavailable"}'::jsonb,
  'SCEAU-12 un NON-MEMBRE ne vote pas, et son refus est le même mot');


-- ════════════════════════════════════════════════════════════
-- 8. LE DÉNOMINATEUR EST FIGÉ, ET L'HÔTE CLÔT
--
-- Golf nomme Hotel. Deux gestes sur trois présents : la révélation automatique
-- n'arrivera JAMAIS si Hotel ne vote pas — c'est le cas réel du téléphone qu'on
-- referme, et c'est pour lui que le bouton de l'hôte existe.
-- ════════════════════════════════════════════════════════════

insert into pb values ('sc_golf', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d2', 32),
  (select id from pbm where nom = 'hotel')));

insert into pb values ('vue_s3_2', public.bande_state(
  (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32)));
select is(
  (select j->'tour'->'denominateur' from pb where nom = 'vue_s3_2'), '3'::jsonb,
  'FIGE-1 le dénominateur du tour vaut TROIS, figé à son ouverture');
select is(
  (select j->'tour'->'status' from pb where nom = 'vue_s3_2'), '"ouverte"'::jsonb,
  'FIGE-2 … donc à deux gestes sur trois, la question reste OUVERTE pour toujours');
select is(
  (select j->'resultats' from pb where nom = 'vue_s3_2'), 'null'::jsonb,
  'FIGE-3 … et il n''y a toujours aucun résultat');

-- UN MEMBRE ORDINAIRE NE FORCE RIEN.
select is(
  public.bande_reveal(
    (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d2', 32)),
  '{"state": "unavailable"}'::jsonb,
  'FIGE-4 un membre ORDINAIRE ne peut pas clore la question');
select is(
  (select t.status from public.bande_tours t
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's3')
      and t.position = 1),
  'ouverte',
  'FIGE-5 … et ce refus n''a rien clos');

insert into pb values ('rev_s3', public.bande_reveal(
  (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32)));
insert into pb values ('rev_s3bis', public.bande_reveal(
  (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32)));

select is(
  (select j from pb where nom = 'rev_s3'),
  '{"state": "ok", "revelee": true}'::jsonb,
  'FIGE-6 L''HÔTE, lui, clôt la question');
select is(
  (select j from pb where nom = 'rev_s3bis'),
  '{"state": "ok", "revelee": true}'::jsonb,
  'FIGE-7 … et il peut cliquer deux fois : bande_reveal est IDEMPOTENTE');

insert into pb values ('vue_s3_rev', public.bande_state(
  (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32)));
select is(
  (select j->'tour'->'denominateur' from pb where nom = 'vue_s3_rev'), '3'::jsonb,
  'FIGE-8 LE DÉNOMINATEUR N''A PAS BOUGÉ : le non-votant reste une ABSTENTION');
select is(
  (select j->'tour'->'votes_exprimes' from pb where nom = 'vue_s3_rev'), '2'::jsonb,
  'FIGE-9 … deux gestes exprimés sur trois, et le document dit les deux nombres');
-- LE POURCENTAGE EST CALCULÉ SUR TROIS, PAS SUR DEUX. Recalculer sur les seuls
-- votants aurait affiché 50 % / 50 %, soit deux fois un chiffre faux.
select is(
  (select pg_catalog.string_agg(
            (r->>'cible_pseudo') || '=' || (r->>'pourcentage'), ',' order by r->>'cible_pseudo')
     from pb, pg_catalog.jsonb_array_elements(j->'resultats') as r
    where nom = 'vue_s3_rev'),
  'Bande Golf=33,Bande Hotel=33',
  'FIGE-10 … et les pourcentages sont calculés sur TROIS : 33 %, pas 50 %');


-- ════════════════════════════════════════════════════════════
-- 9. LA CIBLE PEUT MOURIR, LE VOTE RESTE
--
-- ON LE PROUVE PAR UNE SUPPRESSION DIRECTE, et il faut dire pourquoi : AUCUNE
-- RPC ne retire un membre d'une partie commencée aujourd'hui
-- (`leave_player_lobby` rend `locked` sans rien écrire, `kick_player_lobby`
-- exige `status = 'lobby'`). La garde `on delete set null` n'existe donc pas
-- contre un geste ouvert : elle existe pour le lot À VENIR qui ajoutera ce
-- retrait — et c'est justement parce qu'aucun test de produit ne l'atteindrait
-- qu'elle doit être éprouvée ici, sur la contrainte elle-même.
-- ════════════════════════════════════════════════════════════

delete from public.player_lobby_members m
 where m.id = (select id from pbm where nom = 'hotel');

select is(
  (select pg_catalog.count(*)::integer from public.bande_votes v
     join public.bande_tours t on t.id = v.tour_id
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's3')),
  2,
  'GRAVE-1 le vote qui désignait Hotel N''A PAS ÉTÉ EFFACÉ par son départ');
select is(
  (select v.cible_member_id from public.bande_votes v
    where v.voter_token_hash = repeat('d2', 32)),
  null::uuid,
  'GRAVE-2 … son IDENTITÉ est partie (`on delete set null`, colonne nommée)');
select is(
  (select v.cible_pseudo from public.bande_votes v
    where v.voter_token_hash = repeat('d2', 32)),
  'Bande Hotel',
  'GRAVE-3 … et son NOM est resté : gravé au moment du geste');
select is(
  (select v.organization_id from public.bande_votes v
    where v.voter_token_hash = repeat('d2', 32)),
  'b0000000-0000-4000-8000-00000000000a'::uuid,
  'GRAVE-4 … et `organization_id`, lui, n''a PAS été vidé : la liste de colonnes fait son office');

insert into pb values ('vue_s3_mort', public.bande_state(
  (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32)));
select is(
  (select pg_catalog.string_agg(
            (r->>'cible_pseudo') || '=' || coalesce(r->>'cible_member_id', 'nul'),
            ',' order by r->>'cible_pseudo')
     from pb, pg_catalog.jsonb_array_elements(j->'resultats') as r
    where nom = 'vue_s3_mort'),
  'Bande Golf=' || (select id::text from pbm where nom = 'golf')
    || ',Bande Hotel=nul',
  'GRAVE-5 le résultat DÉJÀ RÉVÉLÉ n''a pas changé : le nom reste, l''identité est nulle');
select is(
  (select j->'tour'->'denominateur' from pb where nom = 'vue_s3_mort'), '3'::jsonb,
  'GRAVE-6 … et le dénominateur d''un tour révélé ne bouge toujours pas');

-- ── LE TOUR SUIVANT RE-FIGE ──────────────────────────────────
-- C'est le seul endroit où un départ se résout, et il faut une liste de
-- présents qui ait VRAIMENT bougé pour le montrer : la suppression ci-dessus la
-- fait passer de trois à deux.
select is(
  public.bande_next(
    (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d2', 32)),
  '{"state": "unavailable"}'::jsonb,
  'SUITE-1 un membre ORDINAIRE ne passe pas à la question suivante');
insert into pb values ('next_s3', public.bande_next(
  (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32)));
select is(
  (select j from pb where nom = 'next_s3'),
  '{"state": "ok", "status": "en_cours", "position": 2}'::jsonb,
  'SUITE-2 l''hôte passe à la question 2');
select is(
  (select t.denominateur from public.bande_tours t
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's3')
      and t.position = 2),
  2,
  'SUITE-3 … et le tour 2 RE-FIGE le dénominateur à DEUX : le départ se résout ICI');
select is(
  (select t.denominateur from public.bande_tours t
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's3')
      and t.position = 1),
  3,
  'SUITE-4 … pendant que le tour 1 garde son TROIS, pour toujours');
select is(
  (select t.question_cle from public.bande_tours t
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's3')
      and t.position = 2),
  (public.bande_questions_tirees(
     'equipe',
     (select (j->>'lobby_id')::uuid from pb where nom = 's3'), 6))[2],
  'SUITE-5 … et sa question est la DEUXIÈME du même programme, recalculé à l''identique');

-- L'IDEMPOTENCE DE `bande_next` : le tour qu'on vient de créer est OUVERT, donc
-- un second appel refuse. Il est impossible de sauter une question.
select is(
  public.bande_next(
    (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32)),
  '{"state": "unavailable"}'::jsonb,
  'SUITE-6 un SECOND appel refuse : on ne saute pas une question en cliquant deux fois');
select is(
  (select p.position from public.bande_parties p
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's3')),
  2,
  'SUITE-7 … et la partie est bien restée à la question 2');


-- ════════════════════════════════════════════════════════════
-- 10. L'ÉGALITÉ — tous les ex æquo sortent
-- ════════════════════════════════════════════════════════════

insert into pb values ('st2', public.bande_start(
  (select (j->>'lobby_id')::uuid from pb where nom = 's2'), repeat('c1', 32)));
insert into pb values ('e1', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's2'), repeat('c1', 32),
  (select id from pbm where nom = 'juliett')));
insert into pb values ('e2', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's2'), repeat('c3', 32),
  (select id from pbm where nom = 'juliett')));
insert into pb values ('e3', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's2'), repeat('c2', 32),
  (select id from pbm where nom = 'india')));
insert into pb values ('e4', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's2'), repeat('c4', 32),
  (select id from pbm where nom = 'india')));

insert into pb values ('vue_egal', public.bande_state(
  (select (j->>'lobby_id')::uuid from pb where nom = 's2'), repeat('c1', 32)));

select is(
  (select j->'revelee' from pb where nom = 'e4'), 'true'::jsonb,
  'EGAL-1 quatre gestes sur quatre présents : la question se verrouille');
select is(
  (select pg_catalog.jsonb_array_length(j->'resultats') from pb where nom = 'vue_egal'),
  2,
  'EGAL-2 DEUX lignes de résultat : aucun ex æquo n''est écarté');
select is(
  (select pg_catalog.string_agg(
            (r->>'cible_pseudo') || '=' || (r->>'voix') || '/' || (r->>'pourcentage'),
            ',' order by r->>'cible_pseudo')
     from pb, pg_catalog.jsonb_array_elements(j->'resultats') as r
    where nom = 'vue_egal'),
  'Bande India=2/50,Bande Juliett=2/50',
  'EGAL-3 … deux voix chacun, 50 % chacun, et rien ne désigne un gagnant');
-- L'ORDRE EST TOTAL. Sans le départage par pseudo, deux ex æquo sortiraient
-- dans l'ordre où le regroupement les a trouvés — donc pas le même sur deux
-- écrans, ni sur deux exécutions.
select is(
  (select j->'resultats'->0->>'cible_pseudo' from pb where nom = 'vue_egal'),
  'Bande India',
  'EGAL-4 … et l''ordre est TOTAL : à voix égales, le pseudo départage');


-- ════════════════════════════════════════════════════════════
-- 11. LA FIN — LE RÉCAPITULATIF FERME LA SALLE
--
-- S4, deux joueurs. Une vraie question jouée (pour que le portrait ait un
-- contenu), puis l'hôte déroule les cinq suivantes.
-- ════════════════════════════════════════════════════════════

insert into pb values ('st4', public.bande_start(
  (select (j->>'lobby_id')::uuid from pb where nom = 's4'), repeat('e1', 32)));
insert into pb values ('f1', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's4'), repeat('e1', 32),
  (select id from pbm where nom = 'november')));
insert into pb values ('f2', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's4'), repeat('e2', 32),
  (select id from pbm where nom = 'mike')));

-- On mémorise la date de mort AVANT la fermeture : FIN-4 vérifie que fermer ne
-- PROLONGE jamais.
create temporary table pb_ttl as
select l.expires_at
  from public.player_lobbies l
 where l.id = (select (j->>'lobby_id')::uuid from pb where nom = 's4');

-- Les questions 2 à 6, closes par l'hôte sans que personne ne vote. Une boucle
-- plutôt que dix appels recopiés : ce qu'on éprouve est la SORTIE de la boucle,
-- pas chacun de ses tours.
do $$
declare
  v_lobby uuid;
  i integer;
begin
  select l.id into v_lobby
    from public.player_lobbies l
   where l.join_code = (select j->>'join_code' from pb where nom = 's4');
  for i in 1..5 loop
    perform public.bande_next(v_lobby, repeat('e1', 32));
    perform public.bande_reveal(v_lobby, repeat('e1', 32));
  end loop;
end;
$$;

select is(
  (select p.position from public.bande_parties p
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's4')),
  6,
  'FIN-1 (mise en place) la partie est arrivée à sa sixième et dernière question');

insert into pb values ('fin', public.bande_next(
  (select (j->>'lobby_id')::uuid from pb where nom = 's4'), repeat('e1', 32)));

select is(
  (select j from pb where nom = 'fin'),
  '{"state": "ok", "status": "recap", "position": 6}'::jsonb,
  'FIN-2 le dernier passage rend le RÉCAPITULATIF');
select is(
  (select p.status from public.bande_parties p
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's4')),
  'recap',
  'FIN-3 … la partie est en `recap`');
select is(
  (select l.status from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from pb where nom = 's4')),
  'closed',
  'FIN-4 … ET LA SALLE EST CLOSE, dans la même transaction');
select ok(
  (select l.expires_at <= (select expires_at from pb_ttl)
     from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from pb where nom = 's4')),
  'FIN-5 … et fermer n''a pas PROLONGÉ sa date de mort (least, jamais greatest)');
select is(
  (select pg_catalog.count(*)::integer from public.bande_tours t
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's4')),
  6,
  'FIN-6 … et la partie compte bien SIX questions, pas une de plus');

-- L'ÉCRAN DE FIN SURVIT À LA FERMETURE. C'est la raison pour laquelle
-- `bande_state` n'exige ni salle vivante ni salle ouverte.
insert into pb values ('vue_fin', public.bande_state(
  (select (j->>'lobby_id')::uuid from pb where nom = 's4'), repeat('e2', 32)));
select is(
  (select j->>'state' from pb where nom = 'vue_fin'), 'ok',
  'FIN-7 `bande_state` répond ENCORE sur une salle close : l''écran de fin lui survit');
select is(
  (select j->'salle_close' from pb where nom = 'vue_fin'), 'true'::jsonb,
  'FIN-8 … et le fait VOYAGE jusqu''au joueur par `salle_close`');
select is(
  public.bande_start(
    (select (j->>'lobby_id')::uuid from pb where nom = 's4'),
    repeat('e2', 32))->>'state',
  'ok',
  'FIN-9 … et `bande_start` rend encore la partie, pour l''onglet qu''on recharge');

select is(
  public.bande_vote(
    (select (j->>'lobby_id')::uuid from pb where nom = 's4'), repeat('e1', 32),
    (select id from pbm where nom = 'november')),
  '{"state": "unavailable"}'::jsonb,
  'FIN-10 on ne vote plus dans une salle close');
select is(
  public.bande_next(
    (select (j->>'lobby_id')::uuid from pb where nom = 's4'), repeat('e1', 32)),
  '{"state": "unavailable"}'::jsonb,
  'FIN-11 … et l''on ne passe plus à une question suivante qui n''existe pas');


-- ════════════════════════════════════════════════════════════
-- 12. LE PORTRAIT DE SESSION
-- ════════════════════════════════════════════════════════════

insert into pb values ('recap_s1', public.bande_recap(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a5', 32)));

select is(
  (select pg_catalog.jsonb_array_length(j->'portrait') from pb where nom = 'recap_s1'),
  1,
  'RECAP-1 seuls les NOMMÉS figurent : une ligne, pas cinq');
select is(
  (select j->'portrait'->0->>'cible_pseudo' from pb where nom = 'recap_s1'),
  'Bande Charlie',
  'RECAP-2 … et c''est bien celui que la tablée a nommé');
select is(
  (select j->'portrait'->0->'fois_nomme' from pb where nom = 'recap_s1'), '3'::jsonb,
  'RECAP-3 … nommé TROIS fois');
select is(
  (select j->'portrait'->0->'questions' from pb where nom = 'recap_s1'),
  pg_catalog.to_jsonb(array[
    (public.bande_questions_tirees(
       'equipe',
       (select (j->>'lobby_id')::uuid from pb where nom = 's1'), 6))[1]]),
  'RECAP-4 … sur LA question révélée, désignée par sa clé');

-- LA PORTE DÉROBÉE QUI N'EN EST PAS UNE. On ouvre la question 2 de S1 et Alpha
-- y nomme Delta : le portrait ne doit PAS le voir, parce que la question n'est
-- pas révélée. Sans cette garde, `bande_recap` aurait dit ce que `bande_state`
-- refuse de dire.
insert into pb values ('next_s1', public.bande_next(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a1', 32)));
insert into pb values ('v2_alpha', public.bande_vote(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a1', 32),
  (select id from pbm where nom = 'delta')));
insert into pb values ('recap_s1bis', public.bande_recap(
  (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('a5', 32)));

select is(
  (select j from pb where nom = 'recap_s1bis'),
  (select j from pb where nom = 'recap_s1'),
  'RECAP-5 un vote sur une question OUVERTE n''entre PAS au portrait : pas de porte dérobée');
select ok(
  (select j from pb where nom = 'recap_s1bis')::text not like '%Bande Delta%',
  'RECAP-6 … et le nom qu''Alpha vient de nommer ne s''y lit nulle part');

-- LE PORTRAIT NE DIT PAS QUI A NOMMÉ.
select ok(
  (select bool_and((select j from pb where nom = 'recap_s1bis')::text
                     not like '%' || repeat(h, 32) || '%')
     from (values ('a1'), ('a2'), ('a3'), ('a4'), ('a5')) as t(h)),
  'RECAP-7 aucun jeton de votant ne figure au portrait');

-- LE NOM GRAVÉ SURVIT AU RETRAIT DU MEMBRE, ici aussi.
insert into pb values ('recap_s3', public.bande_recap(
  (select (j->>'lobby_id')::uuid from pb where nom = 's3'), repeat('d1', 32)));
select is(
  (select pg_catalog.string_agg(
            (r->>'cible_pseudo') || '=' || coalesce(r->>'cible_member_id', 'nul'),
            ',' order by r->>'cible_pseudo')
     from pb, pg_catalog.jsonb_array_elements(j->'portrait') as r
    where nom = 'recap_s3'),
  'Bande Golf=' || (select id::text from pbm where nom = 'golf')
    || ',Bande Hotel=nul',
  'RECAP-8 le membre RETIRÉ garde son nom au portrait, avec une identité nulle');

-- LES REFUS.
select is(
  public.bande_recap(
    (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('99', 32)),
  '{"state": "unavailable"}'::jsonb,
  'RECAP-9 un NON-MEMBRE ne lit pas le portrait');
select is(
  public.bande_recap(
    (select (j->>'lobby_id')::uuid from pb where nom = 's1'), repeat('99', 32)),
  public.bande_recap('b0000009-0000-4000-8000-0000000000ff', repeat('99', 32)),
  'RECAP-10 … et son refus est INDISTINCT de celui d''un lobby inventé');
select is(
  public.bande_recap(
    (select (j->>'lobby_id')::uuid from pb where nom = 'souv'), repeat('1c', 32)),
  '{"state": "unavailable"}'::jsonb,
  'RECAP-11 une salle sans partie n''a pas de portrait');


-- ════════════════════════════════════════════════════════════
-- 13. LA PURGE — LE PORTRAIT NE SURVIT PAS À LA SALLE
--
-- La cascade part de `player_lobbies`, donc c'est exactement ce que
-- `purge_expired_lobbies` déclenche quand elle efface une salle morte (le
-- calendrier de la purge, lui, est éprouvé par socle_lobby.test.sql). On
-- supprime la salle S4, close et finie, et l'on vérifie que TOUT son portrait
-- part avec elle — et que celui des autres ne bouge pas.
-- ════════════════════════════════════════════════════════════

select is(
  (select pg_catalog.count(*)::integer from public.bande_votes v
     join public.bande_tours t on t.id = v.tour_id
     join public.bande_parties p on p.id = t.partie_id
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's4')),
  2,
  'PURGE-1 (mise en place) la partie de S4 porte bien ses deux votes');

create temporary table pb_avant as
select (select pg_catalog.count(*)::integer from public.bande_parties) as parties,
       (select pg_catalog.count(*)::integer from public.bande_tours) as tours,
       (select pg_catalog.count(*)::integer from public.bande_votes) as votes;

delete from public.player_lobbies l
 where l.id = (select (j->>'lobby_id')::uuid from pb where nom = 's4');

select is(
  (select pg_catalog.count(*)::integer from public.bande_parties p
    where p.lobby_id = (select (j->>'lobby_id')::uuid from pb where nom = 's4')),
  0,
  'PURGE-2 la salle effacée emporte SA partie');
select is(
  (select pg_catalog.count(*)::integer from public.bande_tours),
  (select tours - 6 from pb_avant),
  'PURGE-3 … et ses six questions');
select is(
  (select pg_catalog.count(*)::integer from public.bande_votes),
  (select votes - 2 from pb_avant),
  'PURGE-4 … et ses deux votes : rien du portrait ne survit à la salle');
select is(
  (select pg_catalog.count(*)::integer from public.bande_parties),
  (select parties - 1 from pb_avant),
  'PURGE-5 … et la cascade est BORNÉE : les autres salles sont intactes');
select ok(
  exists (select 1 from public.bande_parties p
           where p.lobby_id
             = (select (j->>'lobby_id')::uuid from pb where nom = 's1')),
  'PURGE-6 … S1 est toujours là, avec sa partie');


-- ════════════════════════════════════════════════════════════
-- 14. LA FORME DES CONTRAINTES
-- ════════════════════════════════════════════════════════════

select ok(
  exists (select 1 from pg_catalog.pg_constraint con
           where con.conrelid = 'public.player_lobby_members'::regclass
             and con.conname = 'player_lobby_members_id_org_unique'),
  'FK-1 la clé candidate (id, organization_id) a été posée sur player_lobby_members');
select is(
  (select con.confdeltype from pg_catalog.pg_constraint con
    where con.conrelid = 'public.bande_votes'::regclass
      and con.confrelid = 'public.player_lobby_members'::regclass),
  'n',
  'FK-2 la FK vers le membre est en SET NULL, jamais en cascade');
select is(
  (select pg_catalog.string_agg(distinct con.confdeltype, ',')
     from pg_catalog.pg_constraint con
    where con.conrelid in ('public.bande_parties'::regclass,
                           'public.bande_tours'::regclass)
      and con.contype = 'f'),
  'c',
  'FK-3 … tandis que celles de la partie et des tours sont toutes en CASCADE');

-- LA FK DÉFÉRÉE, ET POURQUOI ELLE EST ÉPINGLÉE ICI. PURGE-2 à PURGE-6 ne
-- passent que grâce à elle : sans `deferrable initially deferred`, supprimer un
-- lobby dont un vote désigne encore un membre VIVANT lève une violation de
-- cette FK — la cascade des membres déclenche le `set null`, donc un UPDATE,
-- donc une re-vérification, et la cascade des parties a déjà emporté le tour.
-- Une assertion sur le COMPORTEMENT (la purge) sans assertion sur la CAUSE
-- laisserait quelqu'un « nettoyer » cet attribut et ne comprendre la panne
-- qu'en relisant six cents lignes de test.
select ok(
  (select con.condeferrable and con.condeferred
     from pg_catalog.pg_constraint con
    where con.conrelid = 'public.bande_votes'::regclass
      and con.confrelid = 'public.bande_tours'::regclass),
  'FK-4 la FK du vote vers le tour est DEFERRABLE INITIALLY DEFERRED : c''est elle qui rend la purge possible');

-- LA FORME DE LA CLÉ DE QUESTION. Un check de FORME et non de LISTE : c'est ce
-- qui permet de retirer une question de `bande-packs.ts` sans migration.
select throws_ok(
  $$insert into public.bande_tours
      (partie_id, organization_id, position, question_cle, denominateur)
    select p.id, p.organization_id, 8, 'PAS UNE CLE', 2
      from public.bande_parties p limit 1$$,
  '23514',
  null::text,
  'FORME-1 une clé de question mal formée est refusée par le check');
-- LA CIBLE EXISTE VRAIMENT (Alpha) et le jeton est neuf : seul le `check` peut
-- rougir ici, ni la FK ni l'unicité. Une assertion qui pourrait échouer pour
-- trois raisons n'en prouve aucune.
select throws_ok(
  $$insert into public.bande_votes
      (tour_id, organization_id, voter_token_hash, cible_member_id, cible_pseudo)
    select t.id, t.organization_id, repeat('7f', 32),
           (select id from pbm where nom = 'alpha'), null
      from public.bande_tours t limit 1$$,
  '23514',
  null::text,
  'FORME-2 une identité de cible SANS nom gravé est refusée : identité ⇒ nom');


-- ════════════════════════════════════════════════════════════
-- 15. RLS, GRANTS ET ACL
-- ════════════════════════════════════════════════════════════

select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.bande_settings'::regclass),
  'ACL-1 bande_settings porte la RLS');
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.bande_parties'::regclass),
  'ACL-2 bande_parties porte la RLS');
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.bande_tours'::regclass),
  'ACL-3 bande_tours porte la RLS');
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.bande_votes'::regclass),
  'ACL-4 bande_votes porte la RLS');

-- LES TROIS TABLES DE PARTIE SONT NUES POUR TOUT LE MONDE SAUF service_role.
-- L'ACL est lue EXHAUSTIVEMENT par `aclexplode` et non privilège par privilège :
-- `select`, `insert`, `update`, `delete` sont ceux auxquels on pense, mais
-- `references`, `trigger` et `truncate` sont ceux qu'on oublie (leçon SEC-4,
-- wagon 7) — et `references` suffit à apprendre la forme d'une table.
--
-- BANDE_VOTES EST LA PLUS IMPORTANTE DES TROIS : c'est elle qui porte QUI A
-- VOTÉ QUOI. Une lecture ouverte à `authenticated` aurait donné au commerçant
-- exactement ce que toute la migration existe pour lui refuser.
select is(
  (select coalesce(pg_catalog.string_agg(
            acl.privilege_type || '@' || acl.grantee::regrole::text, ',' order by 1), '')
     from pg_catalog.pg_class c,
          lateral pg_catalog.aclexplode(
            coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) as acl
    where c.oid = 'public.bande_parties'::regclass
      and acl.grantee::regrole::text in ('anon', 'authenticated', 'public')),
  '',
  'ACL-5 bande_parties : anon et authenticated n''ont AUCUN privilège, references/trigger/truncate compris');
select is(
  (select coalesce(pg_catalog.string_agg(
            acl.privilege_type || '@' || acl.grantee::regrole::text, ',' order by 1), '')
     from pg_catalog.pg_class c,
          lateral pg_catalog.aclexplode(
            coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) as acl
    where c.oid = 'public.bande_tours'::regclass
      and acl.grantee::regrole::text in ('anon', 'authenticated', 'public')),
  '',
  'ACL-6 bande_tours : idem');
select is(
  (select coalesce(pg_catalog.string_agg(
            acl.privilege_type || '@' || acl.grantee::regrole::text, ',' order by 1), '')
     from pg_catalog.pg_class c,
          lateral pg_catalog.aclexplode(
            coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) as acl
    where c.oid = 'public.bande_votes'::regclass
      and acl.grantee::regrole::text in ('anon', 'authenticated', 'public')),
  '',
  'ACL-7 bande_votes : idem — et c''est la table qui porte QUI A VOTÉ QUOI');

-- LA TABLE DE CONFIGURATION, ELLE, EST LISIBLE PAR LES MEMBRES.
select ok(
  has_table_privilege('authenticated', 'public.bande_settings', 'SELECT'),
  'ACL-8 bande_settings est LISIBLE par authenticated (la policy filtre le locataire)');
select is(
  (select coalesce(pg_catalog.string_agg(
            acl.privilege_type, ',' order by acl.privilege_type), '')
     from pg_catalog.pg_class c,
          lateral pg_catalog.aclexplode(
            coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) as acl
    where c.oid = 'public.bande_settings'::regclass
      and acl.grantee::regrole::text = 'anon'),
  '',
  'ACL-9 … et anon n''y a RIEN');
-- AUCUN `grant insert` — motif duo_settings / vitrine_settings, et c'est ce qui
-- force le passage par set_bande_pack, qui journalise.
select ok(
  not has_table_privilege('authenticated', 'public.bande_settings', 'INSERT'),
  'ACL-10 bande_settings n''accorde AUCUN insert : la ligne naît de la RPC, qui audite');
select is(
  (select coalesce(pg_catalog.string_agg(
            a.attname, ',' order by a.attname), '')
     from pg_catalog.pg_class c
     join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0
    where c.oid = 'public.bande_settings'::regclass
      and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
  'pack',
  'ACL-11 … et la SEULE colonne écrivable est `pack` : le locataire ne se corrige pas');

-- LES SEPT RPC : service_role seul. Le motif est triplé par fonction — vrai
-- pour service_role, faux pour authenticated, faux pour anon.
select ok(has_function_privilege('service_role', 'public.set_bande_pack(uuid,text,uuid)', 'EXECUTE'),
  'ACL-12 set_bande_pack : service_role OUI');
select ok(not has_function_privilege('authenticated', 'public.set_bande_pack(uuid,text,uuid)', 'EXECUTE'),
  'ACL-13 set_bande_pack : authenticated NON');
select ok(not has_function_privilege('anon', 'public.set_bande_pack(uuid,text,uuid)', 'EXECUTE'),
  'ACL-14 set_bande_pack : anon NON');

select ok(has_function_privilege('service_role', 'public.bande_start(uuid,text)', 'EXECUTE'),
  'ACL-15 bande_start : service_role OUI');
select ok(not has_function_privilege('authenticated', 'public.bande_start(uuid,text)', 'EXECUTE'),
  'ACL-16 bande_start : authenticated NON');
select ok(not has_function_privilege('anon', 'public.bande_start(uuid,text)', 'EXECUTE'),
  'ACL-17 bande_start : anon NON');

select ok(has_function_privilege('service_role', 'public.bande_vote(uuid,text,uuid)', 'EXECUTE'),
  'ACL-18 bande_vote : service_role OUI');
select ok(not has_function_privilege('authenticated', 'public.bande_vote(uuid,text,uuid)', 'EXECUTE'),
  'ACL-19 bande_vote : authenticated NON');
select ok(not has_function_privilege('anon', 'public.bande_vote(uuid,text,uuid)', 'EXECUTE'),
  'ACL-20 bande_vote : anon NON');

select ok(has_function_privilege('service_role', 'public.bande_reveal(uuid,text)', 'EXECUTE'),
  'ACL-21 bande_reveal : service_role OUI');
select ok(not has_function_privilege('authenticated', 'public.bande_reveal(uuid,text)', 'EXECUTE'),
  'ACL-22 bande_reveal : authenticated NON');
select ok(not has_function_privilege('anon', 'public.bande_reveal(uuid,text)', 'EXECUTE'),
  'ACL-23 bande_reveal : anon NON');

select ok(has_function_privilege('service_role', 'public.bande_next(uuid,text)', 'EXECUTE'),
  'ACL-24 bande_next : service_role OUI');
select ok(not has_function_privilege('authenticated', 'public.bande_next(uuid,text)', 'EXECUTE'),
  'ACL-25 bande_next : authenticated NON');
select ok(not has_function_privilege('anon', 'public.bande_next(uuid,text)', 'EXECUTE'),
  'ACL-26 bande_next : anon NON');

select ok(has_function_privilege('service_role', 'public.bande_state(uuid,text)', 'EXECUTE'),
  'ACL-27 bande_state : service_role OUI');
select ok(not has_function_privilege('authenticated', 'public.bande_state(uuid,text)', 'EXECUTE'),
  'ACL-28 bande_state : authenticated NON');
select ok(not has_function_privilege('anon', 'public.bande_state(uuid,text)', 'EXECUTE'),
  'ACL-29 bande_state : anon NON');

select ok(has_function_privilege('service_role', 'public.bande_recap(uuid,text)', 'EXECUTE'),
  'ACL-30 bande_recap : service_role OUI');
select ok(not has_function_privilege('authenticated', 'public.bande_recap(uuid,text)', 'EXECUTE'),
  'ACL-31 bande_recap : authenticated NON');
select ok(not has_function_privilege('anon', 'public.bande_recap(uuid,text)', 'EXECUTE'),
  'ACL-32 bande_recap : anon NON');

-- LES DEUX AIDES INTERNES NE SONT RENDUES À PERSONNE, service_role compris :
-- elles n'ont de sens qu'à l'intérieur des RPC, qui les exécutent avec les
-- privilèges de leur propriétaire (motif player_lobby_rang / duo_jouable).
select ok(not has_function_privilege('service_role', 'public.bande_pack_questions(text)', 'EXECUTE'),
  'ACL-33 bande_pack_questions n''est rendue à PERSONNE, service_role compris');
select ok(not has_function_privilege('authenticated', 'public.bande_pack_questions(text)', 'EXECUTE'),
  'ACL-34 … ni à authenticated');
select ok(not has_function_privilege('service_role', 'public.bande_questions_tirees(text,uuid,integer)', 'EXECUTE'),
  'ACL-35 bande_questions_tirees non plus : c''est un tirage partagé, pas un point d''entrée');

-- LES NEUF FONCTIONS PORTENT `search_path = ''`. La garde globale
-- (search_path_invariant.test.sql) le vérifie sur tout le schéma ; on le vérifie
-- ICI aussi, parce qu'une garde globale nomme la faute sans dire de quel lot
-- elle vient.
select is(
  (select coalesce(pg_catalog.string_agg(p.proname, ',' order by p.proname), '')
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_bande_pack', 'bande_start', 'bande_vote',
                        'bande_reveal', 'bande_next', 'bande_state',
                        'bande_recap', 'bande_pack_questions',
                        'bande_questions_tirees')
      -- LE PRÉDICAT EST CELUI DE `search_path_invariant.test.sql`, à la lettre :
      -- « aucun search_path du tout » OU « search_path = public ». Comparer à un
      -- littéral `search_path=` supposerait de deviner comment Postgres CITE la
      -- chaîne vide dans proconfig — il écrit `search_path=""` — et une garde
      -- qui repose sur une supposition de format n'en est pas une.
      and (p.proconfig is null
           or not exists (select 1 from pg_catalog.unnest(p.proconfig) c
                           where c like 'search_path=%')
           or 'search_path=public' = any(p.proconfig))),
  '',
  'ACL-36 les neuf fonctions du lot portent un search_path, et ce n''est pas `public`');

-- ── LA RÈGLE CATALOGUE : CHECK ⇒ EXECUTE ─────────────────────
-- Une contrainte `check` s'évalue sous le rôle qui ÉCRIT la table. Toute
-- fonction qu'elle appelle doit donc être exécutable par ce rôle, sinon
-- l'insertion casse à l'exécution alors que le DDL s'est appliqué sans bruit.
-- Règle du dépôt, rejouée ici sur le schéma entier : ce lot ajoute une table
-- écrite par `authenticated` (bande_settings), donc il est exactement dans la
-- classe de bug qu'elle attrape.
select is(
  (select coalesce(pg_catalog.string_agg(distinct
       c.relname || '.' || con.conname || ' → ' || p.proname
         || ' [' || r.roleoid::regrole::text || ']', ', '), '')
     from pg_constraint con
     join pg_class c on c.oid = con.conrelid
     join pg_namespace n on n.oid = c.relnamespace
     join pg_depend dep
       on dep.classid = 'pg_constraint'::regclass
      and dep.objid = con.oid
      and dep.refclassid = 'pg_proc'::regclass
     join pg_proc p on p.oid = dep.refobjid
     cross join (values ('anon'::regrole::oid),
                        ('authenticated'::regrole::oid)) as r(roleoid)
    where n.nspname = 'public'
      and con.contype = 'c'
      and (has_any_column_privilege(r.roleoid, c.oid, 'INSERT')
        or has_any_column_privilege(r.roleoid, c.oid, 'UPDATE'))
      and not has_function_privilege(r.roleoid, p.oid, 'EXECUTE')),
  '',
  'ACL-37 toute fonction appelée par un check est exécutable par les rôles qui écrivent la table');
select cmp_ok(
  (select count(*)::int
     from pg_constraint con
     join pg_class c on c.oid = con.conrelid
     join pg_namespace n on n.oid = c.relnamespace
     join pg_depend dep
       on dep.classid = 'pg_constraint'::regclass
      and dep.objid = con.oid
      and dep.refclassid = 'pg_proc'::regclass
    where n.nspname = 'public' and con.contype = 'c'),
  '>=', 10,
  'ACL-38 … et la règle porte bien sur un ensemble NON VIDE de contraintes');

select * from finish();
rollback;
