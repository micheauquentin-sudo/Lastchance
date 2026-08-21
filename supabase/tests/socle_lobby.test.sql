-- ============================================================
-- LE SOCLE DE SESSION JOUEUR TIENT SES PROMESSES (L16)
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. DUO NE NÉGOCIE PAS SA CAPACITÉ. On demande sept places, on en obtient
--      deux, et l'écriture directe d'un duo à cinq est refusée PAR LA BASE.
--   2. LE QUOTA D'ORGANISATION EXISTE EN SQL (ADR-109 §A4, garde 2). Vingt
--      lobbies actifs passent, le vingt et unième est refusé — et le verrou
--      d'avis sur lequel repose ce comptage est DÉTENU par la transaction.
--      Le quota est PAR ORGANISATION : la voisine saturée n'empêche rien.
--   2 bis. IL NE COMPTE QUE LES SALLES HABITÉES OU RÉCENTES (revue L16). Les
--      trois branches sont ISOLÉES une par une : vingt salles vides et vieilles
--      ne bloquent RIEN, vingt salles verrouillées à un seul membre bloquent,
--      vingt salles à deux membres bloquent. Chaque scénario est construit pour
--      qu'une SEULE branche du prédicat puisse le rendre vrai — sans quoi un
--      vert dirait « le quota marche » sans dire laquelle des trois marche.
--   2 ter. LA VITRINE DOIT ÊTRE PUBLIÉE. Le droit `vitrine` ne suffit pas : une
--      vitrine éteinte n'a pas d'adresse publique, donc pas de jeux. La garde
--      tient PAR LA BASE, et la publier débloque la création — ce qui prouve que
--      c'est bien elle qui refusait.
--   3. LA CAPACITÉ TIENT jusqu'au douzième et refuse le treizième.
--   4. REJOINDRE DEUX FOIS REND LE MÊME DOCUMENT, au caractère près, et
--      n'écrit pas de seconde place.
--   5. UN CODE MORT NE SE DISTINGUE PAS D'UN CODE INVENTÉ. Expiré, clos,
--      malformé, jamais né : QUATRE documents identiques. C'est la propriété
--      centrale du lot — sans elle, six caractères suffisent à énumérer la vie
--      sociale des commerces d'à côté.
--   6. LE CODE DE PARTAGE NE SORT QUE POUR L'HÔTE, et aucun hash de jeton ne
--      sort pour personne.
--   7. L'HÔTE QUI PART FERME LA SALLE ; partir deux fois rend le même document
--      qu'être parti une fois, et qu'un inconnu qui n'est jamais entré.
--   7 bis. L'HÔTE RETIRE PAR RANG, et lui seul. Le refus opposé à un autre
--      membre est INDISTINCT de celui d'un lobby inventé ; l'hôte ne se retire
--      pas lui-même ; une partie verrouillée ne se re-négocie pas ; un rang
--      inoccupé rend un succès muet. Et l'arbitrage est prouvé des DEUX côtés :
--      la personne retirée ne revient pas toute seule, mais rien ne l'empêche
--      de rejoindre à neuf — c'est un retrait de place, pas un bannissement.
--   8. LE VERROUILLAGE PROLONGE, ET LA PROLONGATION EST BORNÉE. Sur un lobby
--      né il y a vingt-trois heures, `now() + 4 h` est rabattu à
--      `created_at + 24 h` — la garde 3 d'ADR-109 §A4 mord pour de vrai.
--   9. LA PURGE DATE DU DERNIER INSTANT CONNU (ADR-111) : elle efface ce qui
--      est mort depuis plus de vingt-quatre heures, et laisse intact ce qui est
--      mort depuis vingt-trois — y compris un lobby CLOS dont la date de mort
--      est encore devant.
--  10. ACL ET RLS. Les deux tables portent la RLS et ZÉRO policy, `anon` et
--      `authenticated` n'y gardent AUCUN privilège (`references` / `trigger` /
--      `truncate` compris), les SEPT RPC sont à `service_role` et à lui seul, et
--      la formule du rang n'est exécutable par AUCUN rôle applicatif.
--  11. LA RÈGLE CATALOGUE CHECK ⇒ EXECUTE ne peut pas mordre ici : aucun
--      `check` des deux tables n'appelle une fonction du dépôt.
--  12. LE LOCATAIRE TIENT PAR LA BASE. La FK composite refuse un membre
--      rattaché à une autre organisation que son lobby.
--
-- ── CE QUE CE FICHIER NE PROUVE PAS, ET IL FAUT LE DIRE ──
--
-- pgTAP tourne dans UNE session et UNE transaction : il ne peut pas lancer deux
-- `create_player_lobby` réellement simultanés. Ce qui est prouvé ici, c'est (a)
-- que le vingt et unième appel VOIT les vingt premiers — la propriété qui casse
-- si le comptage et la décision ne sont pas le même geste — et (b) que le
-- verrou d'avis attendu EST détenu, sur la clé exacte. La sérialisation
-- elle-même est une propriété de `pg_advisory_xact_lock` ; prétendre la
-- démontrer ici serait un vert qui ne prouve rien.
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
-- A : SERVIE — droit `vitrine` par OCTROI daté vivant (seul chemin ouvert en
--     bêta, 20261001120000). C'est elle qui porte tous les parcours.
-- B : VOISINE, servie elle aussi — c'est sur elle que le quota est saturé, et
--     sans son droit « la voisine n'empêche rien » se confondrait avec « la
--     voisine n'a pas le module ».
-- C : SANS le droit.
-- D : AVEC le droit, mais vitrine NON PUBLIÉE. Sans elle, « pas le module » et
--     « vitrine éteinte » se confondraient dans le même refus sans qu'on sache
--     lequel des deux mord.
-- E, F, G : les trois saturations du quota durci, une par branche du prédicat
--     (vides et vieilles / verrouillées / habitées). Elles sont SÉPARÉES parce
--     qu'un quota est par organisation : les mélanger ferait compter ensemble
--     des salles que la RPC compte séparément.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('6b0b1e00-0000-4000-8000-00000000000a', 'Lobby A', 'tap-lobby-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('6b0b1e00-0000-4000-8000-00000000000b', 'Lobby B', 'tap-lobby-b',
   'active', 'starter', 'Europe/Paris', 6),
  ('6b0b1e00-0000-4000-8000-00000000000c', 'Lobby C', 'tap-lobby-c',
   'active', 'starter', 'Europe/Paris', 6),
  ('6b0b1e00-0000-4000-8000-00000000000d', 'Lobby D', 'tap-lobby-d',
   'active', 'starter', 'Europe/Paris', 6),
  ('6b0b1e00-0000-4000-8000-00000000000e', 'Lobby E', 'tap-lobby-e',
   'active', 'starter', 'Europe/Paris', 6),
  ('6b0b1e00-0000-4000-8000-00000000000f', 'Lobby F', 'tap-lobby-f',
   'active', 'starter', 'Europe/Paris', 6),
  ('6b0b1e00-0000-4000-8000-000000000010', 'Lobby G', 'tap-lobby-g',
   'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
select o.id, 'vitrine', 'pass', 'backoffice',
       now() - interval '1 day', now() + interval '365 days'
  from (values
    ('6b0b1e00-0000-4000-8000-00000000000a'::uuid),
    ('6b0b1e00-0000-4000-8000-00000000000b'::uuid),
    ('6b0b1e00-0000-4000-8000-00000000000d'::uuid),
    ('6b0b1e00-0000-4000-8000-00000000000e'::uuid),
    ('6b0b1e00-0000-4000-8000-00000000000f'::uuid),
    ('6b0b1e00-0000-4000-8000-000000000010'::uuid)) as o(id);

-- LA VITRINE, ET SA PUBLICATION. `create_player_lobby` exige les DEUX (le droit
-- ET `published`), donc sans ces lignes tout ce fichier rendrait `unavailable`.
-- L'ordre compte : `vitrine_settings_guard_publication` refuse la TRANSITION
-- vers `published = true` à qui n'a pas le droit — les octrois ci-dessus doivent
-- donc précéder ces inserts, et C n'a volontairement aucune vitrine.
insert into public.vitrine_settings (organization_id, slug, published)
values
  ('6b0b1e00-0000-4000-8000-00000000000a', 'tap-vitrine-lobby-a', true),
  ('6b0b1e00-0000-4000-8000-00000000000b', 'tap-vitrine-lobby-b', true),
  -- D : la vitrine EXISTE et reste ÉTEINTE. C'est le cas que le droit seul ne
  -- distingue pas.
  ('6b0b1e00-0000-4000-8000-00000000000d', 'tap-vitrine-lobby-d', false),
  ('6b0b1e00-0000-4000-8000-00000000000e', 'tap-vitrine-lobby-e', true),
  ('6b0b1e00-0000-4000-8000-00000000000f', 'tap-vitrine-lobby-f', true),
  ('6b0b1e00-0000-4000-8000-000000000010', 'tap-vitrine-lobby-g', true);

create temporary table lb (nom text primary key, j jsonb);


-- ════════════════════════════════════════════════════════════
-- 1. DUO NE NÉGOCIE PAS SA CAPACITÉ
-- ════════════════════════════════════════════════════════════

insert into lb values ('duo', public.create_player_lobby(
  '6b0b1e00-0000-4000-8000-00000000000a', 'duo', 7,
  repeat('a1', 32), 'Hôte Duo'));

select is((select j->>'state' from lb where nom = 'duo'), 'created',
  'DUO-1 un duo s''ouvre');
select is(
  (select l.capacite from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'duo')),
  2,
  'DUO-2 sept places demandées, DEUX accordées : la capacité du duo est figée');
select ok(
  (select j->>'join_code' from lb where nom = 'duo') ~ '^[A-HJ-NP-Z2-9]{6}$',
  'DUO-3 le code de partage suit l''alphabet sans I/O/0/1');
select is(
  (select l.expires_at - l.created_at from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'duo')),
  interval '30 minutes',
  'DUO-4 le TTL de création est de trente minutes (ADR-109 §A4, garde 3)');

insert into lb values ('duo2', public.join_player_lobby(
  (select j->>'join_code' from lb where nom = 'duo'),
  repeat('a2', 32), 'Second'));
select is((select j->>'state' from lb where nom = 'duo2'), 'joined',
  'DUO-5 le second entre');
select is((select j->>'rang' from lb where nom = 'duo2'), '2',
  'DUO-6 il est deuxième — l''hôte est membre de son propre lobby, donc rang 1');
select is(
  (public.join_player_lobby(
     (select j->>'join_code' from lb where nom = 'duo'),
     repeat('a3', 32), 'Troisième'))->>'state',
  'full',
  'DUO-7 le troisième est refusé : un Duo Miroir sans miroir n''existe pas');

-- LE `check` DE LA TABLE, et pas seulement la RPC : un duo à cinq places est
-- refusé même par écriture directe.
select throws_ok(
  $$insert into public.player_lobbies
      (organization_id, kind, capacite, creator_token_hash, expires_at)
    values ('6b0b1e00-0000-4000-8000-00000000000a', 'duo', 5,
            repeat('a4', 32), now() + interval '10 minutes')$$,
  '23514', null,
  'DUO-8 la base elle-même refuse un duo à cinq places');

-- Le plafond dur de vingt-quatre heures est un `check`, pas une politesse.
select throws_ok(
  $$insert into public.player_lobbies
      (organization_id, kind, capacite, creator_token_hash, created_at, expires_at)
    values ('6b0b1e00-0000-4000-8000-00000000000a', 'bande', 4,
            repeat('a5', 32), now(), now() + interval '25 hours')$$,
  '23514', null,
  'TTL-1 aucun lobby ne peut naître avec plus de vingt-quatre heures devant lui');


-- ════════════════════════════════════════════════════════════
-- 2. LE QUOTA PAR ORGANISATION (ADR-109 §A4, garde 2)
-- ════════════════════════════════════════════════════════════

do $$
declare
  i integer;
  r jsonb;
begin
  for i in 1..20 loop
    r := public.create_player_lobby(
      '6b0b1e00-0000-4000-8000-00000000000b', 'bande', 4,
      lpad(to_hex(200000 + i), 64, '0'), 'Hote ' || i);
    if r->>'state' <> 'created' then
      raise exception 'fixture quota : le lobby % a été refusé (%)', i, r;
    end if;
  end loop;
end $$;

select is(
  (select pg_catalog.count(*)::integer from public.player_lobbies l
    where l.organization_id = '6b0b1e00-0000-4000-8000-00000000000b'),
  20,
  'QUOTA-1 vingt lobbies actifs sont acceptés');
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-00000000000b', 'bande', 4,
     repeat('bb', 32), 'Vingt et un'))->>'state',
  'quota',
  'QUOTA-2 le vingt et unième est refusé, et il le dit LISIBLEMENT');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobbies l
    where l.organization_id = '6b0b1e00-0000-4000-8000-00000000000b'),
  20,
  'QUOTA-3 le refus n''a rien écrit');

-- LE VERROU SUR LEQUEL REPOSE CE COMPTAGE. Sans lui, vingt appels simultanés
-- liraient tous « dix-neuf actifs » et ouvriraient tous leur lobby : le quota
-- n'existerait que sur le papier. La clé est construite ici EXACTEMENT comme
-- dans la RPC — si l'une des deux change, cette assertion rougit.
with k as (
  select pg_catalog.hashtextextended(
    'player_lobby:' || '6b0b1e00-0000-4000-8000-00000000000b', 0) as v
)
select ok(
  exists (
    select 1 from pg_locks l, k
     where l.locktype = 'advisory'
       and l.objsubid = 1
       and l.classid::bigint = ((k.v >> 32) & 4294967295)
       and l.objid::bigint = (k.v & 4294967295)
  ),
  'QUOTA-4 le verrou d''avis (organisation) est détenu par la transaction');

-- LE QUOTA EST PAR ORGANISATION. La voisine est pleine ; A ouvre quand même.
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-00000000000a', 'bande', 4,
     repeat('ac', 32), 'Voisin serein'))->>'state',
  'created',
  'QUOTA-5 la saturation de la voisine n''empêche rien chez A');

-- SANS LE MODULE, RIEN — et le refus est le même mot que « organisation
-- inconnue » : personne n'apprend ici qui a payé quoi.
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-00000000000c', 'bande', 4,
     repeat('cc', 32), 'Sans droit'))->>'state',
  'unavailable',
  'DROIT-1 une organisation sans le module vitrine n''ouvre aucun lobby');
select is(
  public.create_player_lobby(
    '6b0b1e00-0000-4000-8000-00000000000c', 'bande', 4,
    repeat('cc', 32), 'Sans droit'),
  public.create_player_lobby(
    'facade00-0000-4000-8000-000000000000', 'bande', 4,
    repeat('cc', 32), 'Sans droit'),
  'DROIT-2 « pas le module » et « organisation inconnue » rendent le MÊME document');

-- LA VITRINE DOIT ÊTRE PUBLIÉE, et pas seulement le droit vivant. D a payé, D
-- n'a rien allumé : ses jeux n'existent pour personne.
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-00000000000d', 'bande', 4,
     repeat('d0', 32), 'Vitrine éteinte'))->>'state',
  'unavailable',
  'PUB-1 une vitrine NON PUBLIÉE n''ouvre aucun lobby, même avec le droit');
select is(
  public.create_player_lobby(
    '6b0b1e00-0000-4000-8000-00000000000d', 'bande', 4,
    repeat('d0', 32), 'Vitrine éteinte'),
  public.create_player_lobby(
    'facade00-0000-4000-8000-000000000000', 'bande', 4,
    repeat('d0', 32), 'Vitrine éteinte'),
  'PUB-2 … et le refus est le MÊME document qu''« organisation inconnue »');

-- LE CONTRÔLE DE PORTÉE de PUB-1 : sans lui, l'assertion serait verte le jour
-- où D échouerait pour une tout autre raison. On allume la vitrine, et rien
-- d'autre — si la création passe alors, c'est bien `published` qui refusait.
update public.vitrine_settings
   set published = true
 where organization_id = '6b0b1e00-0000-4000-8000-00000000000d';
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-00000000000d', 'bande', 4,
     repeat('d0', 32), 'Vitrine allumée'))->>'state',
  'created',
  'PUB-3 publier la vitrine débloque la création : c''est bien elle qui refusait');


-- ════════════════════════════════════════════════════════════
-- 2 bis. LE QUOTA NE COMPTE QUE LES SALLES HABITÉES OU RÉCENTES
--
-- Durci à la revue L16 (ADR-109 §A4 amendé : garde IP observatoire, donc le
-- quota est le SEUL refus effectif du lot). Le prédicat a trois branches, et
-- chacune est isolée par une organisation À ELLE :
--
--   E — vingt salles VIDES et VIEILLES : aucune branche ne les retient.
--   F — vingt salles VERROUILLÉES, vieilles, à UN seul membre : seul `locked`.
--   G — vingt salles à DEUX membres, vieilles, non verrouillées : seul l'EXISTS.
--
-- Chaque scénario est bâti pour qu'une SEULE branche puisse le rendre vrai. Un
-- test qui saturerait vingt salles « fraîches, pleines et verrouillées » serait
-- vert avec n'importe laquelle des trois — et le resterait après en avoir cassé
-- deux.
-- ════════════════════════════════════════════════════════════

-- ── E : vingt salles vides ────────────────────────────────────
do $$
declare
  i integer;
  r jsonb;
begin
  for i in 1..20 loop
    r := public.create_player_lobby(
      '6b0b1e00-0000-4000-8000-00000000000e', 'bande', 4,
      lpad(to_hex(400000 + i), 64, '0'), 'Hote E ' || i);
    if r->>'state' <> 'created' then
      raise exception 'fixture E : la création % a été refusée (%)', i, r;
    end if;
  end loop;
end $$;

-- L'ORDRE DE CES DEUX ASSERTIONS EST LA DÉMONSTRATION. Fraîches, les vingt
-- salles vides SATURENT — c'est la branche « récente », et elle est ce qui
-- empêche une rafale simultanée de passer entre les gouttes.
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-00000000000e', 'bande', 4,
     repeat('4e', 32), 'Vingt et un pressé'))->>'state',
  'quota',
  'E1-1 vingt salles vides mais RÉCENTES saturent : la rafale ne passe pas');

-- On recule la naissance de quinze minutes, et RIEN D'AUTRE : `expires_at` ne
-- bouge pas, donc les vingt salles restent VIVANTES (nées il y a 15 min, mortes
-- dans 15). La seule chose qui a changé, c'est qu'elles ont passé la fenêtre.
update public.player_lobbies
   set created_at = created_at - interval '15 minutes'
 where organization_id = '6b0b1e00-0000-4000-8000-00000000000e';

select is(
  (select pg_catalog.count(*)::integer from public.player_lobbies l
    where l.organization_id = '6b0b1e00-0000-4000-8000-00000000000e'
      and l.status = 'lobby'
      and l.expires_at > now()
      and l.created_at <= now() - interval '10 minutes'
      and (select pg_catalog.count(*) from public.player_lobby_members m
            where m.lobby_id = l.id) = 1),
  20,
  'E1-2 les vingt salles de E sont VIVANTES, vieilles et vides : aucune branche ne les retient');
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-00000000000e', 'bande', 4,
     repeat('4f', 32), 'Vingt et un serein'))->>'state',
  'created',
  'E1-3 … donc la création PASSE : le quota n''est plus son propre levier de déni');

-- ── F : vingt salles verrouillées, à un seul membre ───────────
do $$
declare
  i integer;
  r jsonb;
  v_hote text;
  v_id uuid;
begin
  for i in 1..20 loop
    v_hote := lpad(to_hex(500000 + i), 64, '0');
    r := public.create_player_lobby(
      '6b0b1e00-0000-4000-8000-00000000000f', 'bande', 4, v_hote, 'Hote F ' || i);
    if r->>'state' <> 'created' then
      raise exception 'fixture F : la création % a été refusée (%)', i, r;
    end if;
    v_id := (r->>'lobby_id')::uuid;
    -- Un second membre, UNIQUEMENT parce que verrouiller l'exige.
    r := public.join_player_lobby(
      r->>'join_code', lpad(to_hex(510000 + i), 64, '0'), 'Invite F ' || i);
    if r->>'state' <> 'joined' then
      raise exception 'fixture F : l''entrée % a été refusée (%)', i, r;
    end if;
    r := public.lock_player_lobby(v_id, v_hote);
    if r->>'state' <> 'locked' then
      raise exception 'fixture F : le verrouillage % a été refusé (%)', i, r;
    end if;
  end loop;
end $$;

-- LE SECOND MEMBRE PART EN DIRECT. Aucune RPC ne retire personne d'une salle
-- verrouillée — c'est justement la garde de `kick`/`leave` — et c'est ce qu'on
-- veut ici : des salles que SEUL leur statut peut faire compter.
delete from public.player_lobby_members m
 using public.player_lobbies l
 where l.id = m.lobby_id
   and l.organization_id = '6b0b1e00-0000-4000-8000-00000000000f'
   and m.token_hash <> l.creator_token_hash;

update public.player_lobbies
   set created_at = created_at - interval '15 minutes'
 where organization_id = '6b0b1e00-0000-4000-8000-00000000000f';

select is(
  (select pg_catalog.count(*)::integer from public.player_lobbies l
    where l.organization_id = '6b0b1e00-0000-4000-8000-00000000000f'
      and l.status = 'locked'
      and l.expires_at > now()
      and l.created_at <= now() - interval '10 minutes'
      and (select pg_catalog.count(*) from public.player_lobby_members m
            where m.lobby_id = l.id) = 1),
  20,
  'E1-4 les vingt salles de F sont verrouillées, vieilles et à UN membre : seul le statut peut les compter');
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-00000000000f', 'bande', 4,
     repeat('5f', 32), 'Vingt et un'))->>'state',
  'quota',
  'E1-5 une partie commencée occupe sa place : vingt verrouillées saturent');

-- ── G : vingt salles habitées, non verrouillées ───────────────
do $$
declare
  i integer;
  r jsonb;
begin
  for i in 1..20 loop
    r := public.create_player_lobby(
      '6b0b1e00-0000-4000-8000-000000000010', 'bande', 4,
      lpad(to_hex(600000 + i), 64, '0'), 'Hote G ' || i);
    if r->>'state' <> 'created' then
      raise exception 'fixture G : la création % a été refusée (%)', i, r;
    end if;
    r := public.join_player_lobby(
      r->>'join_code', lpad(to_hex(610000 + i), 64, '0'), 'Invite G ' || i);
    if r->>'state' <> 'joined' then
      raise exception 'fixture G : l''entrée % a été refusée (%)', i, r;
    end if;
  end loop;
end $$;

update public.player_lobbies
   set created_at = created_at - interval '15 minutes'
 where organization_id = '6b0b1e00-0000-4000-8000-000000000010';

select is(
  (select pg_catalog.count(*)::integer from public.player_lobbies l
    where l.organization_id = '6b0b1e00-0000-4000-8000-000000000010'
      and l.status = 'lobby'
      and l.expires_at > now()
      and l.created_at <= now() - interval '10 minutes'
      and (select pg_catalog.count(*) from public.player_lobby_members m
            where m.lobby_id = l.id) = 2),
  20,
  'E1-6 les vingt salles de G sont vieilles, ouvertes et à DEUX membres : seul l''EXISTS peut les compter');
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-000000000010', 'bande', 4,
     repeat('60', 32), 'Vingt et un'))->>'state',
  'quota',
  'E1-7 une salle où quelqu''un est entré est vivante quel que soit son âge : elles saturent');

-- LE QUOTA RESTE PAR ORGANISATION, y compris après le durcissement : trois
-- voisines saturées de trois façons différentes n'empêchent rien chez E.
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-00000000000e', 'bande', 4,
     repeat('4a', 32), 'Voisin serein'))->>'state',
  'created',
  'E1-8 trois voisines saturées n''empêchent toujours rien chez la quatrième');


-- ════════════════════════════════════════════════════════════
-- 3. LA CAPACITÉ : douze oui, treize non
-- ════════════════════════════════════════════════════════════

insert into lb values ('cap', public.create_player_lobby(
  '6b0b1e00-0000-4000-8000-00000000000a', 'bande', 12,
  repeat('ca', 32), 'Hôte Bande'));

do $$
declare
  i integer;
  r jsonb;
  v_code text;
begin
  select j->>'join_code' into v_code from lb where nom = 'cap';
  -- L'hôte est déjà le membre 1 : la boucle amène les membres 2 à 11.
  for i in 2..11 loop
    r := public.join_player_lobby(
      v_code, lpad(to_hex(300000 + i), 64, '0'), 'Membre ' || i);
    if r->>'state' <> 'joined' then
      raise exception 'fixture capacité : le membre % a été refusé (%)', i, r;
    end if;
  end loop;
end $$;

insert into lb values ('cap12', public.join_player_lobby(
  (select j->>'join_code' from lb where nom = 'cap'),
  repeat('c1', 32), 'Douzième'));
select is((select j->>'state' from lb where nom = 'cap12'), 'joined',
  'CAP-1 le douzième entre');
select is((select j->>'rang' from lb where nom = 'cap12'), '12',
  'CAP-2 et il est douzième — le rang suit l''ordre d''arrivée, pas l''ordre des uuid');
select is(
  (public.join_player_lobby(
     (select j->>'join_code' from lb where nom = 'cap'),
     repeat('c2', 32), 'Treizième'))->>'state',
  'full',
  'CAP-3 le treizième est refusé');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobby_members m
    where m.lobby_id = (select (j->>'lobby_id')::uuid from lb where nom = 'cap')),
  12,
  'CAP-4 le refus n''a rien écrit');

-- LE VERROU DU LOBBY, celui qui rend ce comptage vrai.
with k as (
  select pg_catalog.hashtextextended(
    'player_lobby:' || '6b0b1e00-0000-4000-8000-00000000000a' || ':'
      || (select (j->>'lobby_id') from lb where nom = 'cap'), 0) as v
)
select ok(
  exists (
    select 1 from pg_locks l, k
     where l.locktype = 'advisory'
       and l.objsubid = 1
       and l.classid::bigint = ((k.v >> 32) & 4294967295)
       and l.objid::bigint = (k.v & 4294967295)
  ),
  'CAP-5 le verrou d''avis (organisation + lobby) est détenu par la transaction');


-- ════════════════════════════════════════════════════════════
-- 4. REJOINDRE DEUX FOIS
-- ════════════════════════════════════════════════════════════

insert into lb values ('salon', public.create_player_lobby(
  '6b0b1e00-0000-4000-8000-00000000000a', 'bande', 4,
  repeat('b1', 32), 'Hôte Salon'));

insert into lb values ('salon2a', public.join_player_lobby(
  (select j->>'join_code' from lb where nom = 'salon'),
  repeat('b2', 32), 'Invité'));
insert into lb values ('salon2b', public.join_player_lobby(
  (select j->>'join_code' from lb where nom = 'salon'),
  repeat('b2', 32), 'Un tout autre pseudo'));

select is(
  (select j from lb where nom = 'salon2a'),
  (select j from lb where nom = 'salon2b'),
  'IDEM-1 rejoindre deux fois rend le MÊME document, au caractère près');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobby_members m
    where m.lobby_id = (select (j->>'lobby_id')::uuid from lb where nom = 'salon')),
  2,
  'IDEM-2 et n''écrit pas de seconde place');
select is(
  (select m.pseudo from public.player_lobby_members m
    where m.lobby_id = (select (j->>'lobby_id')::uuid from lb where nom = 'salon')
      and m.token_hash = repeat('b2', 32)),
  'Invité',
  'IDEM-3 le second appel n''écrase pas le pseudo : « le même état » veut dire le même');


-- ════════════════════════════════════════════════════════════
-- 5. `lobby_state` — le code à l'hôte, les hash à personne
-- ════════════════════════════════════════════════════════════

select is(
  (public.lobby_state(
     (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
     repeat('b1', 32)))->>'join_code',
  (select j->>'join_code' from lb where nom = 'salon'),
  'STATE-1 l''hôte voit le code de partage');
select ok(
  (public.lobby_state(
     (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
     repeat('b2', 32)))->>'join_code' is null,
  'STATE-2 un membre ordinaire ne le voit PAS : il n''a pas à rameuter la ville');
select is(
  (public.lobby_state(
     (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
     repeat('b2', 32)))->>'state',
  'ok',
  'STATE-3 il voit tout le reste');
select is(
  (public.lobby_state(
     (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
     repeat('b2', 32)))->'membres',
  '[{"rang": 1, "pseudo": "Hôte Salon", "est_moi": false},
    {"rang": 2, "pseudo": "Invité", "est_moi": true}]'::jsonb,
  'STATE-4 les membres sortent dans l''ordre d''arrivée, et « moi » est juste');

-- L'APPARTENANCE EST EXIGÉE, et son absence rend le refus INDISTINCT de celui
-- d'un lobby qui n'a jamais existé.
select is(
  public.lobby_state(
    (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
    repeat('b3', 32)),
  public.lobby_state(
    '3f3f3f3f-0000-4000-8000-000000000000', repeat('b3', 32)),
  'STATE-5 un non-membre reçoit EXACTEMENT ce que reçoit qui invente un identifiant');
select is(
  (public.lobby_state(
     (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
     repeat('b3', 32)))->>'state',
  'unavailable',
  'STATE-6 … et ce document ne dit rien d''autre');

-- AUCUN HASH NE SORT. Ni le sien, ni celui de l'hôte, ni celui du voisin.
select ok(
  (public.lobby_state(
     (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
     repeat('b1', 32)))::text not like '%' || repeat('b1', 32) || '%',
  'STATE-7 le document ne contient pas le jeton de qui le lit');
select ok(
  (public.lobby_state(
     (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
     repeat('b1', 32)))::text not like '%' || repeat('b2', 32) || '%',
  'STATE-8 ni celui des autres membres');


-- ════════════════════════════════════════════════════════════
-- 6. LE VERROUILLAGE, ET SA BORNE
-- ════════════════════════════════════════════════════════════

-- Un lobby où l'hôte est seul : la porte ne se ferme pas sur une seule personne.
insert into lb values ('seul', public.create_player_lobby(
  '6b0b1e00-0000-4000-8000-00000000000a', 'bande', 4,
  repeat('51', 32), 'Tout seul'));
select is(
  (public.lock_player_lobby(
     (select (j->>'lobby_id')::uuid from lb where nom = 'seul'),
     repeat('51', 32)))->>'state',
  'unavailable',
  'LOCK-1 un hôte seul ne verrouille rien');

-- Un lobby NÉ IL Y A VINGT-TROIS HEURES, encore vivant pour trente minutes.
-- C'est le seul cas où `now() + 4 h` dépasse `created_at + 24 h`, donc le seul
-- qui prouve que la borne mord.
insert into lb values ('vieux', public.create_player_lobby(
  '6b0b1e00-0000-4000-8000-00000000000a', 'bande', 4,
  repeat('11', 32), 'Hôte Vieux'));
insert into lb values ('vieux2', public.join_player_lobby(
  (select j->>'join_code' from lb where nom = 'vieux'),
  repeat('12', 32), 'Compagnon'));
update public.player_lobbies
   set created_at = now() - interval '23 hours'
 where id = (select (j->>'lobby_id')::uuid from lb where nom = 'vieux');

select is(
  (public.lock_player_lobby(
     (select (j->>'lobby_id')::uuid from lb where nom = 'vieux'),
     repeat('12', 32)))->>'state',
  'unavailable',
  'LOCK-2 un membre qui n''est pas l''hôte ne verrouille pas');

insert into lb values ('vieuxlock', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from lb where nom = 'vieux'),
  repeat('11', 32)));
select is((select j->>'state' from lb where nom = 'vieuxlock'), 'locked',
  'LOCK-3 l''hôte ferme la porte');
select is(
  (select l.status from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'vieux')),
  'locked',
  'LOCK-4 et la base le sait');
select is(
  (select l.expires_at - l.created_at from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'vieux')),
  interval '24 hours',
  'LOCK-5 la prolongation est RABATTUE sur created_at + 24 h : la garde 3 mord');
select ok(
  (select l.expires_at from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'vieux'))
  < now() + interval '4 hours',
  'LOCK-6 … donc bien en deçà des quatre heures demandées');

select is(
  (public.lock_player_lobby(
     (select (j->>'lobby_id')::uuid from lb where nom = 'vieux'),
     repeat('11', 32)))->>'state',
  'unavailable',
  'LOCK-7 verrouiller deux fois ne reverrouille rien');

-- LA PORTE FERMÉE L'EST POUR TOUT LE MONDE, y compris pour qui est dedans.
select is(
  (public.join_player_lobby(
     (select j->>'join_code' from lb where nom = 'vieux'),
     repeat('13', 32), 'Retardataire'))->>'state',
  'locked',
  'LOCK-8 on ne rejoint pas un lobby verrouillé');
select is(
  (public.join_player_lobby(
     (select j->>'join_code' from lb where nom = 'vieux'),
     repeat('12', 32), 'Compagnon'))->>'state',
  'locked',
  'LOCK-9 pas même un membre : il lit son état par lobby_state, pas en frappant');

-- EN `locked`, LE DÉPART N'ÉCRIT RIEN. C'est L17 / L18 qui décideront ce qu'un
-- joueur manquant fait à une partie commencée ; ce lot ne décide pas pour eux.
select is(
  (public.leave_player_lobby(
     (select (j->>'lobby_id')::uuid from lb where nom = 'vieux'),
     repeat('12', 32)))->>'state',
  'locked',
  'LOCK-10 partir d''un lobby verrouillé est refusé, et le dit');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobby_members m
    where m.lobby_id = (select (j->>'lobby_id')::uuid from lb where nom = 'vieux')),
  2,
  'LOCK-11 … et n''a retiré personne');


-- ════════════════════════════════════════════════════════════
-- 7. PARTIR — et l'hôte qui ferme la salle
-- ════════════════════════════════════════════════════════════

insert into lb values ('salonpart1', public.leave_player_lobby(
  (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
  repeat('b1', 32)));
select is((select j->>'state' from lb where nom = 'salonpart1'), 'left',
  'LEAVE-1 l''hôte part');
select is(
  (select l.status from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'salon')),
  'closed',
  'LEAVE-2 et la salle ferme : un lobby sans hôte n''attend personne');
select is(
  (public.lobby_state(
     (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
     repeat('b2', 32)))->>'status',
  'closed',
  'LEAVE-3 le membre resté le voit');

insert into lb values ('salonpart2', public.leave_player_lobby(
  (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
  repeat('b1', 32)));
select is(
  (select j from lb where nom = 'salonpart1'),
  (select j from lb where nom = 'salonpart2'),
  'LEAVE-4 partir deux fois rend le MÊME document');
select is(
  (select j from lb where nom = 'salonpart1'),
  public.leave_player_lobby(
    (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
    repeat('b3', 32)),
  'LEAVE-5 … et qu''un inconnu qui n''est jamais entré : le document ne dit rien du lobby');
select is(
  public.leave_player_lobby(
    '3f3f3f3f-0000-4000-8000-000000000000', repeat('b3', 32)),
  '{"state": "left"}'::jsonb,
  'LEAVE-6 quitter un lobby qui n''existe pas est un succès muet');


-- ════════════════════════════════════════════════════════════
-- 7 bis. L'HÔTE RETIRE PAR RANG
--
-- Le rang, et non le jeton : `lobby_state` ne rend JAMAIS de `token_hash` à
-- l'hôte (STATE-7 / STATE-8), donc lui demander un jeton l'obligerait à posséder
-- ce que la base lui refuse. Ce que ces assertions prouvent, dans l'ordre : le
-- refus indistinct opposé à qui n'est pas l'hôte, le retrait nominal et le
-- DÉCALAGE des rangs qui s'ensuit, l'idempotence sur un rang inoccupé, les deux
-- refus de statut, et enfin l'arbitrage — retrait de place, pas bannissement.
-- ════════════════════════════════════════════════════════════

insert into lb values ('kick', public.create_player_lobby(
  '6b0b1e00-0000-4000-8000-00000000000a', 'bande', 4,
  repeat('71', 32), 'Hôte Kick'));
insert into lb values ('kick2', public.join_player_lobby(
  (select j->>'join_code' from lb where nom = 'kick'),
  repeat('72', 32), 'Deuxième'));
insert into lb values ('kick3', public.join_player_lobby(
  (select j->>'join_code' from lb where nom = 'kick'),
  repeat('73', 32), 'Troisième'));

-- UN MEMBRE ORDINAIRE NE RETIRE PERSONNE, et son refus ne lui apprend rien : le
-- MÊME document que pour un identifiant de lobby inventé.
select is(
  public.kick_player_lobby(
    (select (j->>'lobby_id')::uuid from lb where nom = 'kick'),
    repeat('72', 32), 3),
  public.kick_player_lobby(
    '3f3f3f3f-0000-4000-8000-000000000000', repeat('72', 32), 3),
  'KICK-1 un non-créateur reçoit EXACTEMENT ce que reçoit qui invente un identifiant');
select is(
  (public.kick_player_lobby(
     (select (j->>'lobby_id')::uuid from lb where nom = 'kick'),
     repeat('72', 32), 3))->>'state',
  'unavailable',
  'KICK-2 … et ce document ne dit rien d''autre');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobby_members m
    where m.lobby_id = (select (j->>'lobby_id')::uuid from lb where nom = 'kick')),
  3,
  'KICK-3 … et n''a retiré personne');

-- LE RETRAIT NOMINAL.
select is(
  public.kick_player_lobby(
    (select (j->>'lobby_id')::uuid from lb where nom = 'kick'),
    repeat('71', 32), 2),
  '{"state": "ok", "kicked": true}'::jsonb,
  'KICK-4 l''hôte retire le rang 2, et le document le dit sans détour');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobby_members m
    where m.lobby_id = (select (j->>'lobby_id')::uuid from lb where nom = 'kick')),
  2,
  'KICK-5 la place est libérée');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobby_members m
    where m.lobby_id = (select (j->>'lobby_id')::uuid from lb where nom = 'kick')
      and m.token_hash = repeat('72', 32)),
  0,
  'KICK-6 c''est bien l''occupant du rang 2 qui est parti');

-- LE RANG EST UN ORDRE, DONC IL SE DÉCALE. Le troisième devient deuxième —
-- c'est la conséquence directe d'une formule de rang unique, et c'est ce que
-- l'écran de l'hôte doit relire avant de proposer un second retrait.
select is(
  (public.lobby_state(
     (select (j->>'lobby_id')::uuid from lb where nom = 'kick'),
     repeat('71', 32)))->'membres',
  '[{"rang": 1, "pseudo": "Hôte Kick", "est_moi": true},
    {"rang": 2, "pseudo": "Troisième", "est_moi": false}]'::jsonb,
  'KICK-7 le rang 3 est devenu le rang 2 : la liste se referme derrière le retiré');

-- L'IDEMPOTENCE PORTE SUR UN RANG INOCCUPÉ, et rend un succès muet.
select is(
  public.kick_player_lobby(
    (select (j->>'lobby_id')::uuid from lb where nom = 'kick'),
    repeat('71', 32), 9),
  '{"state": "ok", "kicked": false}'::jsonb,
  'KICK-8 un rang que personne n''occupe est un succès muet, pas une erreur');

-- L'HÔTE NE SE RETIRE PAS LUI-MÊME : ce serait un `leave` déguisé, qui
-- laisserait une salle sans hôte au lieu de la fermer.
select is(
  (public.kick_player_lobby(
     (select (j->>'lobby_id')::uuid from lb where nom = 'kick'),
     repeat('71', 32), 1))->>'state',
  'unavailable',
  'KICK-9 l''hôte ne se retire pas lui-même');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobby_members m
    where m.lobby_id = (select (j->>'lobby_id')::uuid from lb where nom = 'kick')),
  2,
  'KICK-10 … et ce refus non plus n''a rien écrit');

-- UNE PARTIE COMMENCÉE NE SE RE-NÉGOCIE PAS. `vieux` est verrouillé depuis la
-- section 6 ; `salon` est clos depuis la section 7.
select is(
  (public.kick_player_lobby(
     (select (j->>'lobby_id')::uuid from lb where nom = 'vieux'),
     repeat('11', 32), 2))->>'state',
  'unavailable',
  'KICK-11 on ne retire personne d''une salle VERROUILLÉE');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobby_members m
    where m.lobby_id = (select (j->>'lobby_id')::uuid from lb where nom = 'vieux')),
  2,
  'KICK-12 … et la partie garde ses joueurs');
select is(
  (public.kick_player_lobby(
     (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
     repeat('b1', 32), 1))->>'state',
  'unavailable',
  'KICK-13 ni d''une salle CLOSE');

-- ── L'ARBITRAGE, PROUVÉ DES DEUX CÔTÉS ────────────────────────
-- Retrait de PLACE, pas bannissement : la personne ne revient pas toute seule,
-- mais rien ne l'empêche de refaire le geste. Empêcher le retour demanderait une
-- trace persistante des empreintes exclues — un autre lot, à décider comme tel.
select is(
  (public.lobby_state(
     (select (j->>'lobby_id')::uuid from lb where nom = 'kick'),
     repeat('72', 32)))->>'state',
  'unavailable',
  'KICK-14 le retiré ne revient pas tout seul : son ancien cookie ne le désigne plus');
select is(
  (public.join_player_lobby(
     (select j->>'join_code' from lb where nom = 'kick'),
     repeat('72', 32), 'Deuxième'))->>'state',
  'joined',
  'KICK-15 mais il PEUT rejoindre à neuf : c''est un retrait de place, pas un bannissement');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobby_members m
    where m.lobby_id = (select (j->>'lobby_id')::uuid from lb where nom = 'kick')),
  3,
  'KICK-16 … et il reprend une place, la salle étant ouverte et non pleine');


-- ════════════════════════════════════════════════════════════
-- 8. UN CODE MORT NE SE DISTINGUE PAS D'UN CODE INVENTÉ
-- ════════════════════════════════════════════════════════════

insert into lb values ('mort', public.create_player_lobby(
  '6b0b1e00-0000-4000-8000-00000000000a', 'bande', 4,
  repeat('d1', 32), 'Hôte Mort'));
update public.player_lobbies
   set created_at = now() - interval '90 minutes',
       expires_at = now() - interval '60 minutes'
 where id = (select (j->>'lobby_id')::uuid from lb where nom = 'mort');

-- Garde de l'assertion elle-même : « ZZZZZZ » doit VRAIMENT être un code que
-- personne ne porte, sinon les trois comparaisons ci-dessous compareraient un
-- refus à un succès sans que rien ne le dise.
select is(
  (select pg_catalog.count(*)::integer from public.player_lobbies l
    where l.join_code = 'ZZZZZZ'),
  0,
  'INDIST-0 aucun lobby ne porte le code témoin');

select is(
  public.join_player_lobby(
    (select j->>'join_code' from lb where nom = 'mort'),
    repeat('e1', 32), 'Curieux'),
  public.join_player_lobby('ZZZZZZ', repeat('e1', 32), 'Curieux'),
  'INDIST-1 un code EXPIRÉ et un code INVENTÉ rendent le MÊME document');
select is(
  public.join_player_lobby(
    (select j->>'join_code' from lb where nom = 'salon'),
    repeat('e1', 32), 'Curieux'),
  public.join_player_lobby('ZZZZZZ', repeat('e1', 32), 'Curieux'),
  'INDIST-2 un code CLOS aussi');
select is(
  public.join_player_lobby('zz', repeat('e1', 32), 'Curieux'),
  public.join_player_lobby('ZZZZZZ', repeat('e1', 32), 'Curieux'),
  'INDIST-3 un code MALFORMÉ aussi : la forme non plus n''est pas un oracle');
select is(
  public.join_player_lobby('ZZZZZZ', repeat('e1', 32), 'Curieux'),
  '{"state": "unavailable"}'::jsonb,
  'INDIST-4 et ce document unique ne dit rien de plus');

-- LE CODE MORT N'EST PAS REJOUABLE, et son porteur légitime le constate aussi.
select is(
  (public.lobby_state(
     (select (j->>'lobby_id')::uuid from lb where nom = 'mort'),
     repeat('d1', 32)))->>'status',
  'expired',
  'ADR111-1 l''expiration est CONSTATÉE à la lecture');
select is(
  (select l.status from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'mort')),
  'lobby',
  'ADR111-2 … et la lecture n''a RIEN écrit : le statut en base n''a pas bougé');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobbies l
    where l.organization_id = '6b0b1e00-0000-4000-8000-00000000000a'
      and l.status in ('lobby', 'locked')
      and l.expires_at > now()),
  (select pg_catalog.count(*)::integer from public.player_lobbies l
    where l.organization_id = '6b0b1e00-0000-4000-8000-00000000000a'
      and l.status in ('lobby', 'locked')) - 1,
  'ADR111-3 un lobby mort cesse de peser sur le quota sans qu''aucun cron l''ait touché');


-- ════════════════════════════════════════════════════════════
-- 9. LA PURGE DATE DU DERNIER INSTANT CONNU (ADR-111)
-- ════════════════════════════════════════════════════════════

insert into public.player_lobbies
  (id, organization_id, kind, status, join_code, capacite,
   creator_token_hash, created_at, expires_at)
values
  -- P1 : mort depuis VINGT-CINQ heures → part.
  ('6b0b1e00-0000-4000-8000-0000000000f1',
   '6b0b1e00-0000-4000-8000-00000000000a', 'bande', 'lobby', 'PURGEA', 4,
   repeat('f1', 32), now() - interval '25 hours 30 minutes',
   now() - interval '25 hours'),
  -- P2 : mort depuis VINGT-TROIS heures → reste. C'est LUI qui prouve que le
  -- seuil est daté sur expires_at et non sur le passage du cron.
  ('6b0b1e00-0000-4000-8000-0000000000f2',
   '6b0b1e00-0000-4000-8000-00000000000a', 'bande', 'lobby', 'PURGEB', 4,
   repeat('f2', 32), now() - interval '23 hours 30 minutes',
   now() - interval '23 hours'),
  -- P3 : CLOS, mais sa date de mort est encore devant → reste. « closed » et
  -- « expired » se datent du MÊME champ, faute d'autre dernier instant connu.
  ('6b0b1e00-0000-4000-8000-0000000000f3',
   '6b0b1e00-0000-4000-8000-00000000000a', 'bande', 'closed', 'PURGEC', 4,
   repeat('f3', 32), now(), now() + interval '10 minutes');

insert into public.player_lobby_members
  (lobby_id, organization_id, token_hash, pseudo)
values
  ('6b0b1e00-0000-4000-8000-0000000000f1',
   '6b0b1e00-0000-4000-8000-00000000000a', repeat('f1', 32), 'Fantôme');

create temporary table lb_avant as
  select pg_catalog.count(*)::integer as n
    from public.player_lobbies l
   where l.organization_id = '6b0b1e00-0000-4000-8000-00000000000a';

select cmp_ok(public.purge_expired_lobbies()::integer, '>=', 1,
  'PURGE-1 la purge efface au moins le lobby mort depuis plus de vingt-quatre heures');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobbies l
    where l.organization_id = '6b0b1e00-0000-4000-8000-00000000000a'),
  (select n - 1 from lb_avant),
  'PURGE-2 EXACTEMENT un lobby d''A est parti');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobbies l
    where l.id = '6b0b1e00-0000-4000-8000-0000000000f1'),
  0,
  'PURGE-3 c''est bien celui qui était mort depuis vingt-cinq heures');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobbies l
    where l.id in ('6b0b1e00-0000-4000-8000-0000000000f2',
                   '6b0b1e00-0000-4000-8000-0000000000f3')),
  2,
  'PURGE-4 celui mort depuis vingt-trois heures et le clos-récent sont intacts');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobby_members m
    where m.lobby_id = '6b0b1e00-0000-4000-8000-0000000000f1'),
  0,
  'PURGE-5 la session privée éphémère part en cascade avec la salle');
select is(
  (select pg_catalog.count(*)::integer from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'cap')),
  1,
  'PURGE-6 les lobbies VIVANTS ne sont pas touchés');


-- ════════════════════════════════════════════════════════════
-- 10. LE LOCATAIRE TIENT PAR LA BASE
-- ════════════════════════════════════════════════════════════

select throws_ok(
  format(
    $$insert into public.player_lobby_members
        (lobby_id, organization_id, token_hash, pseudo)
      values (%L, '6b0b1e00-0000-4000-8000-00000000000b', %L, 'Intrus')$$,
    (select (j->>'lobby_id')::uuid from lb where nom = 'cap'),
    repeat('99', 32)),
  '23503', null,
  'TENANT-1 la FK composite refuse un membre rattaché à une AUTRE organisation');


-- ════════════════════════════════════════════════════════════
-- 11. ACL, RLS, GRANTS
-- ════════════════════════════════════════════════════════════

select ok(
  (select c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'player_lobbies'),
  'ACL-1 player_lobbies porte la row level security');
select ok(
  (select c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'player_lobby_members'),
  'ACL-2 player_lobby_members aussi');
select is(
  (select pg_catalog.count(*)::integer from pg_policies
    where schemaname = 'public'
      and tablename in ('player_lobbies', 'player_lobby_members')),
  0,
  'ACL-3 AUCUNE policy sur les deux tables — service_role et rien d''autre');

-- AUCUN privilège d'AUCUNE sorte, `references` / `trigger` / `truncate`
-- compris : c'est le `revoke all` de la migration qui mord, pas l'absence de
-- policy (leçon SEC-4, wagon 7).
select is(
  (select coalesce(string_agg(distinct c.relname || ':' || a.privilege_type, ', '), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace,
     lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = 'public'
      and c.relname in ('player_lobbies', 'player_lobby_members')
      and a.grantee in ('authenticated'::regrole::oid, 'anon'::regrole::oid)),
  '',
  'ACL-4 ni anon ni authenticated ne gardent le moindre privilège sur les deux tables');

-- LES SIX RPC : `service_role` et lui seul.
select ok(has_function_privilege('service_role', 'public.create_player_lobby(uuid,text,integer,text,text)', 'EXECUTE'), 'ACL-5 le serveur ouvre un lobby');
select ok(not has_function_privilege('authenticated', 'public.create_player_lobby(uuid,text,integer,text,text)', 'EXECUTE'), 'ACL-6 un commerçant ne peut pas ouvrir un lobby au nom d''un joueur');
select ok(not has_function_privilege('anon', 'public.create_player_lobby(uuid,text,integer,text,text)', 'EXECUTE'), 'ACL-7 anon non plus — sinon le quota se contourne avec la clé publique');
select ok(has_function_privilege('service_role', 'public.join_player_lobby(text,text,text)', 'EXECUTE'), 'ACL-8 le serveur fait entrer');
select ok(not has_function_privilege('authenticated', 'public.join_player_lobby(text,text,text)', 'EXECUTE'), 'ACL-9 un commerçant ne devine pas les codes de ses joueurs');
select ok(not has_function_privilege('anon', 'public.join_player_lobby(text,text,text)', 'EXECUTE'), 'ACL-10 anon ne peut pas énumérer les codes à la clé publique');
select ok(has_function_privilege('service_role', 'public.lobby_state(uuid,text)', 'EXECUTE'), 'ACL-11 le serveur lit l''état');
select ok(not has_function_privilege('authenticated', 'public.lobby_state(uuid,text)', 'EXECUTE'), 'ACL-12 un commerçant ne lit pas les pseudos d''un lobby');
select ok(not has_function_privilege('anon', 'public.lobby_state(uuid,text)', 'EXECUTE'), 'ACL-13 anon non plus');
select ok(has_function_privilege('service_role', 'public.lock_player_lobby(uuid,text)', 'EXECUTE'), 'ACL-14 le serveur verrouille');
select ok(not has_function_privilege('authenticated', 'public.lock_player_lobby(uuid,text)', 'EXECUTE'), 'ACL-15 un commerçant ne ferme pas la porte à la place de l''hôte');
select ok(not has_function_privilege('anon', 'public.lock_player_lobby(uuid,text)', 'EXECUTE'), 'ACL-16 anon non plus');
select ok(has_function_privilege('service_role', 'public.leave_player_lobby(uuid,text)', 'EXECUTE'), 'ACL-17 le serveur fait partir');
select ok(not has_function_privilege('authenticated', 'public.leave_player_lobby(uuid,text)', 'EXECUTE'), 'ACL-18 un commerçant ne sort personne d''un lobby');
select ok(not has_function_privilege('anon', 'public.leave_player_lobby(uuid,text)', 'EXECUTE'), 'ACL-19 anon non plus');
select ok(has_function_privilege('service_role', 'public.kick_player_lobby(uuid,text,integer)', 'EXECUTE'), 'ACL-20 le serveur retire une place');
select ok(not has_function_privilege('authenticated', 'public.kick_player_lobby(uuid,text,integer)', 'EXECUTE'), 'ACL-21 un commerçant ne retire personne à la place de l''hôte');
select ok(not has_function_privilege('anon', 'public.kick_player_lobby(uuid,text,integer)', 'EXECUTE'), 'ACL-22 anon non plus — sinon un rang suffirait à vider une salle');
select ok(has_function_privilege('service_role', 'public.purge_expired_lobbies()', 'EXECUTE'), 'ACL-23 le serveur purge');
select ok(not has_function_privilege('authenticated', 'public.purge_expired_lobbies()', 'EXECUTE'), 'ACL-24 un commerçant ne déclenche pas la purge');
select ok(not has_function_privilege('anon', 'public.purge_expired_lobbies()', 'EXECUTE'), 'ACL-25 anon non plus');

-- LA FORMULE DU RANG n'est exécutable par AUCUN rôle applicatif, `service_role`
-- compris : elle n'a de sens qu'à l'intérieur des RPC (motif
-- `queue_entry_position`).
select ok(not has_function_privilege('service_role', 'public.player_lobby_rang(uuid,timestamp with time zone,uuid)', 'EXECUTE'), 'ACL-26 pas même le serveur n''appelle la formule du rang directement');
select ok(not has_function_privilege('authenticated', 'public.player_lobby_rang(uuid,timestamp with time zone,uuid)', 'EXECUTE'), 'ACL-27 ni un commerçant');
select ok(not has_function_privilege('anon', 'public.player_lobby_rang(uuid,timestamp with time zone,uuid)', 'EXECUTE'), 'ACL-28 ni anon');
select ok(not has_function_privilege('authenticated', 'public.player_lobbies_set_join_code()', 'EXECUTE'), 'ACL-29 la génération de code n''est pas appelable par un commerçant');
select ok(not has_function_privilege('anon', 'public.player_lobbies_set_join_code()', 'EXECUTE'), 'ACL-30 ni par anon');

-- LA RÈGLE CATALOGUE CHECK ⇒ EXECUTE, appliquée aux deux tables neuves. Un
-- `check` s'évalue AVEC LES PRIVILÈGES DU RÔLE QUI ÉCRIT : si l'un d'eux
-- appelait une fonction du dépôt, il faudrait accorder EXECUTE à ce rôle, et
-- l'oublier casserait toute écriture (la classe de bogue qui a frappé deux fois
-- avant 20260930120000). Ici l'attendu est la chaîne vide, et il est MESURÉ :
-- les `check` de ces deux tables n'appellent que des fonctions ÉPINGLÉES du
-- catalogue système (`char_length`, `btrim`), absentes de `pg_depend`.
select is(
  (select coalesce(string_agg(distinct
       c.relname || '.' || con.conname || ' → ' || p.proname, ', '), '')
     from pg_constraint con
     join pg_class c on c.oid = con.conrelid
     join pg_namespace n on n.oid = c.relnamespace
     join pg_depend dep
       on dep.classid = 'pg_constraint'::regclass
      and dep.objid = con.oid
      and dep.refclassid = 'pg_proc'::regclass
     join pg_proc p on p.oid = dep.refobjid
    where n.nspname = 'public'
      and con.contype = 'c'
      and c.relname in ('player_lobbies', 'player_lobby_members')),
  '',
  'ACL-31 aucun check des deux tables n''appelle une fonction du dépôt : rien à accorder, rien à oublier');
-- CONTRÔLE DE PORTÉE : sans lui, l'assertion ci-dessus serait verte le jour où
-- les deux tables disparaîtraient du schéma. Neuf `check` mesurés.
select cmp_ok(
  (select pg_catalog.count(*)::integer
     from pg_constraint con
     join pg_class c on c.oid = con.conrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and con.contype = 'c'
      and c.relname in ('player_lobbies', 'player_lobby_members')),
  '>=', 8,
  'ACL-32 la règle porte bien sur les check réellement posés, pas sur un ensemble vide');

select * from finish();
rollback;
