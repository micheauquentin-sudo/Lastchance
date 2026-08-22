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
--   2 quater. CHAQUE JEU DEMANDE SA PROPRE CLÉ (20261020120000). `vitrine` ne
--      les ouvre plus : un salon `bande` exige `bande`, un salon `duo` exige
--      `duo`. Prouvé DANS LES DEUX SENS, sur deux organisations servies et
--      publiées qui ne portent qu'une clé de jeu chacune — celle qui se voit
--      refuser un jeu ouvre l'autre à la ligne suivante, donc aucun refus ne
--      peut être imputé au droit `vitrine`, à la publication ni au quota. Et les
--      QUATRE causes de refus rendent UN SEUL document, au caractère près.
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
--   8. LE VERROUILLAGE PROLONGE D'UNE HEURE — et c'était quatre. Ramené à la
--      contre-revue L16 : le prédicat du quota ne peut pas être durci
--      utilement (aucun prédicat ne sépare N cookies de N personnes), donc
--      c'est la DURÉE du déni qu'on coupe. LA PROLONGATION RESTE BORNÉE : sur
--      un lobby né il y a vingt-trois heures et demie, `now() + 1 h` est
--      rabattu à `created_at + 24 h` — la garde 3 d'ADR-109 §A4 mord pour de
--      vrai, dans une fenêtre simplement plus étroite qu'avant.
--   9. LA PURGE DATE DU DERNIER INSTANT CONNU (ADR-111) : elle efface ce qui
--      est mort depuis plus de vingt-quatre heures, et laisse intact ce qui est
--      mort depuis vingt-trois — y compris un lobby CLOS dont la date de mort
--      est encore devant.
--  10. ACL ET RLS. Les deux tables portent la RLS et ZÉRO policy, `anon` et
--      `authenticated` n'y gardent AUCUN privilège (`references` / `trigger` /
--      `truncate` compris), les NEUF RPC sont à `service_role` et à lui seul, et
--      la formule du rang n'est exécutable par AUCUN rôle applicatif.
--  11. LA RÈGLE CATALOGUE CHECK ⇒ EXECUTE ne peut pas mordre ici : aucun
--      `check` des deux tables n'appelle une fonction du dépôt.
--  12. LE LOCATAIRE TIENT PAR LA BASE. La FK composite refuse un membre
--      rattaché à une autre organisation que son lobby.
--  13. LE COMMERÇANT VOIT SES SALLES, ET RIEN D'AUTRE (`org_player_lobbies`).
--      L'isolation inter-organisation est prouvée dans les DEUX SENS et sur
--      l'ENSEMBLE EXACT des identifiants, pas sur un échantillon. Le jeu de
--      clés du document est mesuré au caractère près : six clés, donc AUCUN
--      pseudo, AUCUN code de partage, AUCUNE empreinte de jeton. La liste est
--      PLUS LARGE que le quota — les salles vieilles et vides, invisibles au
--      quota, y figurent, parce que c'est exactement la forme d'une
--      salle-squat. Et la borne de cinquante coupe dans un ensemble
--      TOTALEMENT ORDONNÉ, départage par `id` compris.
--  14. LE COMMERÇANT FERME UNE SALLE (`close_player_lobby_as_org`), et c'est
--      ce geste qui rend le déni RÉVERSIBLE. Nominal, VERROUILLÉE comprise —
--      l'attaque démontrée produit précisément une salle verrouillée —, la
--      place rendue au quota À L'INSTANT, l'idempotence muette, et CINQ refus
--      qui ne se distinguent pas — acteur absent, caissier, membre habilité
--      d'une AUTRE maison, salle inconnue, salle du voisin — assertés sur le
--      SQLSTATE **et** sur le message.
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
-- H : la BORNE de `org_player_lobbies`. Cinquante-cinq salles vivantes, écrites
--     EN DIRECT — passer par la RPC aurait demandé de contourner le quota trois
--     fois de suite pour prouver une propriété qui n'a rien à voir avec lui.
--     Elle n'a ni module ni vitrine : la lecture de supervision n'en demande
--     pas, et le vérifier ici coûte une ligne.
-- I, J : LES DEUX TÉMOINS D'UNE CLÉ PAR PRODUIT (20261020120000). Servies toutes
--     les deux — droit `vitrine` vivant, vitrine PUBLIÉE — mais ne portant
--     qu'UN SEUL des deux droits de jeu : I a `duo` sans `bande`, J a `bande`
--     sans `duo`. Chacune est le CONTRÔLE DE PORTÉE de l'autre refus : la même
--     organisation qui se voit refuser un jeu ouvre l'autre dans la ligne
--     suivante, donc le refus ne peut être imputé ni au droit `vitrine`, ni à la
--     publication, ni au quota.
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
   'active', 'starter', 'Europe/Paris', 6),
  ('6b0b1e00-0000-4000-8000-000000000011', 'Lobby H', 'tap-lobby-h',
   'active', 'starter', 'Europe/Paris', 6),
  ('6b0b1e00-0000-4000-8000-000000000012', 'Lobby I', 'tap-lobby-i',
   'active', 'starter', 'Europe/Paris', 6),
  ('6b0b1e00-0000-4000-8000-000000000013', 'Lobby J', 'tap-lobby-j',
   'active', 'starter', 'Europe/Paris', 6),
  -- K : LA BOULANGERIE. Les deux jeux, aucune Vitrine — ni droit, ni ligne
  -- `vitrine_settings`. Ce cas etait IMPOSSIBLE avant 20261022120000 : la garde
  -- exigeait la carte. C'est lui que le lot existe pour rendre jouable.
  ('6b0b1e00-0000-4000-8000-000000000014', 'Lobby K', 'tap-lobby-k',
   'active', 'starter', 'Europe/Paris', 6);

-- LES ACTEURS. `close_player_lobby_as_org` vérifie l'appartenance EN SQL, donc
-- il faut de vrais membres : un propriétaire et un éditeur chez A (les deux
-- habilités), un CAISSIER chez A (le refus qui prouve que le rôle est lu, et pas
-- seulement l'appartenance), et un propriétaire chez B (celui qui prouve que le
-- locataire est comparé — il est habilité, mais pas ici).
insert into auth.users (id, email) values
  ('6b0b1e01-0000-4000-8000-000000000001', 'proprio-a@tap-lobby.local'),
  ('6b0b1e01-0000-4000-8000-000000000002', 'editeur-a@tap-lobby.local'),
  ('6b0b1e01-0000-4000-8000-000000000003', 'caissier-a@tap-lobby.local'),
  ('6b0b1e01-0000-4000-8000-000000000004', 'proprio-b@tap-lobby.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('6b0b1e00-0000-4000-8000-00000000000a',
   '6b0b1e01-0000-4000-8000-000000000001', 'owner'),
  ('6b0b1e00-0000-4000-8000-00000000000a',
   '6b0b1e01-0000-4000-8000-000000000002', 'editor'),
  ('6b0b1e00-0000-4000-8000-00000000000a',
   '6b0b1e01-0000-4000-8000-000000000003', 'cashier'),
  ('6b0b1e00-0000-4000-8000-00000000000b',
   '6b0b1e01-0000-4000-8000-000000000004', 'owner');

-- LA CLÉ DU JEU, ET ELLE SEULE, DEPUIS 20261022120000. `create_player_lobby`
-- a cessé d'exiger `vitrine` : les salons sont devenus des jeux du socle,
-- présents dans les cinq offres (ADR-119). Le droit `vitrine` reste semé
-- ci-dessous parce que d'autres assertions de ce fichier passent par la Vitrine
-- publique ; il n'est simplement plus ce qui ouvre un salon. La clé qui décide
-- est celle du JEU demandé, dérivée de
-- `p_kind`. Ces six organisations ouvrent des salons des DEUX sortes, elles
-- portent donc les deux clés de jeu. `reserver` n'est PAS semé : aucune
-- assertion de ce fichier ne le demande, et un octroi de trop rendrait vert le
-- jour où la garde du salon retomberait sur la mauvaise clé.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
select o.id, m.module, 'pass', 'backoffice',
       now() - interval '1 day', now() + interval '365 days'
  from (values
    ('6b0b1e00-0000-4000-8000-00000000000a'::uuid),
    ('6b0b1e00-0000-4000-8000-00000000000b'::uuid),
    ('6b0b1e00-0000-4000-8000-00000000000d'::uuid),
    ('6b0b1e00-0000-4000-8000-00000000000e'::uuid),
    ('6b0b1e00-0000-4000-8000-00000000000f'::uuid),
    ('6b0b1e00-0000-4000-8000-000000000010'::uuid)) as o(id)
 cross join (values ('vitrine'), ('duo'), ('bande')) as m(module);

-- I ET J : UN SEUL DROIT DE JEU CHACUNE. C'est toute la fixture — et c'est ce
-- déséquilibre, et lui seul, que les assertions DROIT-3 à DROIT-8 lisent.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('6b0b1e00-0000-4000-8000-000000000012', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('6b0b1e00-0000-4000-8000-000000000012', 'duo', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('6b0b1e00-0000-4000-8000-000000000013', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('6b0b1e00-0000-4000-8000-000000000013', 'bande', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  -- K porte les deux JEUX et rien d'autre : pas de `vitrine`, volontairement.
  ('6b0b1e00-0000-4000-8000-000000000014', 'duo', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('6b0b1e00-0000-4000-8000-000000000014', 'bande', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

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
  ('6b0b1e00-0000-4000-8000-000000000010', 'tap-vitrine-lobby-g', true),
  -- I ET J SONT PUBLIÉES. Sans cela leur refus se confondrait avec celui de D,
  -- et DROIT-4 comme DROIT-7 prouveraient « vitrine éteinte » en croyant
  -- prouver « pas le droit du jeu ».
  ('6b0b1e00-0000-4000-8000-000000000012', 'tap-vitrine-lobby-i', true),
  ('6b0b1e00-0000-4000-8000-000000000013', 'tap-vitrine-lobby-j', true);

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

-- ── UNE CLÉ PAR PRODUIT (20261020120000) ────────────────────
-- Le droit `vitrine` ne suffit plus : chaque JEU demande le sien. I a `duo` et
-- pas `bande` ; J a `bande` et pas `duo`. Les deux sont servies et publiées, ce
-- qui fait de chacune le contrôle de portée de son propre refus.
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-000000000012', 'bande', 4,
     repeat('e1', 32), 'Sans bande'))->>'state',
  'unavailable',
  'DROIT-3 le droit `vitrine` n''ouvre PAS un salon Portrait de la Bande : il faut `bande`');
select is(
  public.create_player_lobby(
    '6b0b1e00-0000-4000-8000-000000000012', 'bande', 4,
    repeat('e1', 32), 'Sans bande'),
  public.create_player_lobby(
    'facade00-0000-4000-8000-000000000000', 'bande', 4,
    repeat('e1', 32), 'Sans bande'),
  'DROIT-4 … et le refus est le MÊME document qu''« organisation inconnue » : la clé manquante ne se lit pas de dehors');
-- LE CONTRÔLE DE PORTÉE : la MÊME organisation, au MÊME instant, ouvre un duo.
-- Sans lui, DROIT-3 serait vert le jour où I échouerait pour une tout autre
-- raison — un quota, une vitrine éteinte, une fixture oubliée.
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-000000000012', 'duo', 2,
     repeat('e2', 32), 'Avec duo'))->>'state',
  'created',
  'DROIT-5 … et c''est bien `bande` qui manquait : la même organisation ouvre un Duo Miroir');

select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-000000000013', 'duo', 2,
     repeat('e3', 32), 'Sans duo'))->>'state',
  'unavailable',
  'DROIT-6 symétriquement, le droit `vitrine` n''ouvre PAS un Duo Miroir : il faut `duo`');
select is(
  public.create_player_lobby(
    '6b0b1e00-0000-4000-8000-000000000013', 'duo', 2,
    repeat('e3', 32), 'Sans duo'),
  public.create_player_lobby(
    'facade00-0000-4000-8000-000000000000', 'duo', 2,
    repeat('e3', 32), 'Sans duo'),
  'DROIT-7 … même document, même indistinction');
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-000000000013', 'bande', 4,
     repeat('e4', 32), 'Avec bande'))->>'state',
  'created',
  'DROIT-8 … et c''est bien `duo` qui manquait : la même organisation ouvre un Portrait de la Bande');

-- LES REFUS SONT UN SEUL DOCUMENT, et ils sont TROIS depuis 20261022120000 :
-- organisation inconnue, aucun droit, la clé de l'AUTRE jeu. « Vitrine éteinte »
-- a quitté cette liste — ce n'est plus un refus mais le cas normal d'un commerce
-- sans carte, et PUB-1 le prouve juste en dessous.
--
-- La propriété reste tenue par la STRUCTURE de la garde — un `if`, un `return`
-- — et non par un accord entre branches. C'est elle qui empêche de sonder
-- l'existence d'une organisation depuis dehors.
select is(
  (select count(distinct j)::int from (values
     (public.create_player_lobby('facade00-0000-4000-8000-000000000000', 'bande', 4,
        repeat('e5', 32), 'Témoin')),
     (public.create_player_lobby('6b0b1e00-0000-4000-8000-00000000000c', 'bande', 4,
        repeat('e5', 32), 'Témoin')),
     (public.create_player_lobby('6b0b1e00-0000-4000-8000-000000000012', 'bande', 4,
        repeat('e5', 32), 'Témoin'))) as t(j)),
  1,
  'DROIT-9 les TROIS refus rendent un seul et même document, au caractère près');

-- LA VITRINE N'EST PLUS UNE CONDITION (20261022120000, ADR-119).
--
-- Ces assertions ont dit l'inverse jusqu'au 2026-08-22 : « une vitrine non
-- publiée n'ouvre aucun lobby, même avec le droit ». C'était juste tant que les
-- salons SE VENDAIENT avec la carte. Ils sont devenus des jeux du socle, donc
-- présents chez des commerces qui n'auront jamais de carte — et les laisser
-- derrière elle rendait le jeu « inclus » et injouable.
--
-- D a le droit et une vitrine ÉTEINTE : il ouvre.
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-00000000000d', 'bande', 4,
     repeat('d0', 32), 'Vitrine éteinte'))->>'state',
  'created',
  'PUB-1 une vitrine non publiée n''empêche plus rien : le droit du jeu suffit');

-- K N'A AUCUNE VITRINE DU TOUT — ni droit, ni ligne. C'est la boulangerie sur
-- Coup d'envoi, et c'est L'ASSERTION QUI PORTE LE LOT : sans elle, PUB-1 seule
-- resterait verte le jour où la garde retomberait sur l'existence d'une ligne
-- `vitrine_settings`, éteinte ou non.
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-000000000014', 'duo', 2,
     repeat('d1', 32), 'Sans vitrine'))->>'state',
  'created',
  'PUB-2 un commerce SANS aucune vitrine ouvre un salon : le droit du jeu suffit');

-- LE CONTRÔLE DE PORTÉE : ce qu'on vérifie ici est que le refus tient toujours
-- à la clé du jeu et à rien d'autre. C, qui n'a ni vitrine ni droit de jeu,
-- reste refusée — sinon le lot aurait ouvert la porte à tout le monde.
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-00000000000c', 'duo', 2,
     repeat('d2', 32), 'Ni vitrine ni jeu'))->>'state',
  'unavailable',
  'PUB-3 … mais sans la clé du jeu, l''absence de vitrine n''ouvre rien non plus');


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

-- ── LE TTL NOMINAL DU VERROUILLAGE : UNE HEURE ────────────────
--
-- Ramené de quatre heures à une à la contre-revue L16, contrepartie du finding
-- E-1 : le prédicat du quota ne peut pas être durci utilement, donc c'est la
-- DURÉE du déni qu'on coupe. Le lobby est FRAIS, donc `least` ne rabat rien —
-- ce qui est mesuré ici est bien la valeur choisie, et non la borne des
-- vingt-quatre heures. C'est `vieux`, juste en dessous, qui prouve la borne.
insert into lb values ('frais', public.create_player_lobby(
  '6b0b1e00-0000-4000-8000-00000000000a', 'bande', 4,
  repeat('81', 32), 'Hôte Frais'));
insert into lb values ('frais2', public.join_player_lobby(
  (select j->>'join_code' from lb where nom = 'frais'),
  repeat('82', 32), 'Compagnon Frais'));
select is((select j->>'state' from lb where nom = 'frais2'), 'joined',
  'TTL-2 fixture : la salle fraîche a deux membres, elle est donc verrouillable');
select is(
  (public.lock_player_lobby(
     (select (j->>'lobby_id')::uuid from lb where nom = 'frais'),
     repeat('81', 32)))->>'state',
  'locked',
  'TTL-3 l''hôte ferme la porte d''une salle fraîche');
select is(
  (select l.expires_at - l.created_at from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'frais')),
  interval '1 hour',
  'TTL-4 le verrouillage porte la date de mort à UNE HEURE, et non plus à quatre');

-- Un lobby NÉ IL Y A VINGT-TROIS HEURES ET DEMIE, encore vivant pour trente
-- minutes. C'est le seul cas où `now() + 1 h` dépasse `created_at + 24 h`, donc
-- le seul qui prouve que la borne mord. Vingt-trois heures suffisaient du temps
-- des quatre heures ; avec une heure, la fenêtre s'est resserrée d'autant, et
-- une demi-heure de marge est ce qui SÉPARE ce scénario du cas nominal — à
-- vingt-trois heures pile, `now() + 1 h` et `created_at + 24 h` seraient ÉGAUX
-- et l'assertion serait verte sans que `least` ait rien rabattu.
insert into lb values ('vieux', public.create_player_lobby(
  '6b0b1e00-0000-4000-8000-00000000000a', 'bande', 4,
  repeat('11', 32), 'Hôte Vieux'));
insert into lb values ('vieux2', public.join_player_lobby(
  (select j->>'join_code' from lb where nom = 'vieux'),
  repeat('12', 32), 'Compagnon'));
update public.player_lobbies
   set created_at = now() - interval '23 hours 30 minutes'
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
  < now() + interval '1 hour',
  'LOCK-6 … donc bien en deçà de l''heure demandée : `least` a rabattu');

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
-- 11. LE COMMERÇANT VOIT SES SALLES — ET RIEN D'AUTRE
--
-- Contrepartie du finding E-1, volet VISIBLE. Ce que ces assertions prouvent :
-- le document ne contient que six clés (donc ni pseudo, ni code de partage, ni
-- empreinte), l'isolation inter-organisation tient sur l'ENSEMBLE EXACT des
-- identifiants et dans les DEUX SENS, la liste est délibérément PLUS LARGE que
-- le quota, et la borne de cinquante coupe dans un ensemble totalement ordonné.
-- ════════════════════════════════════════════════════════════

-- H : cinquante-cinq salles vivantes, écrites EN DIRECT. Le quota n'est pas le
-- sujet ici, et le contourner trois fois pour arriver à cinquante-cinq aurait
-- fait dépendre une propriété de tri d'une propriété de comptage.
insert into public.player_lobbies
  (organization_id, kind, capacite, creator_token_hash, expires_at)
select '6b0b1e00-0000-4000-8000-000000000011', 'bande', 4,
       lpad(to_hex(700000 + g.i), 64, '0'),
       now() + interval '30 minutes'
  from generate_series(1, 55) as g(i);

-- ── LE JEU DE CLÉS, MESURÉ ────────────────────────────────────
-- L'assertion porte sur l'ENSEMBLE EXACT des clés, et non sur l'absence de
-- trois d'entre elles : « pas de pseudo, pas de join_code, pas de token » serait
-- vert le jour où une QUATRIÈME donnée personnelle apparaîtrait. Six clés, et
-- la liste est close.
select is(
  (select pg_catalog.string_agg(distinct k.nom, ',' order by k.nom)
     from pg_catalog.jsonb_array_elements(
            public.org_player_lobbies(
              '6b0b1e00-0000-4000-8000-00000000000a')->'lobbies') as t(e),
          lateral pg_catalog.jsonb_object_keys(t.e) as k(nom)),
  'created_at,expires_at,id,kind,membres,status',
  'ORG-1 le document porte SIX clés, et la liste est close');

-- LES TROIS ABSENCES, VÉRIFIÉES SUR LES VALEURS et pas seulement sur les noms :
-- une clé mal nommée qui transporterait un code de partage passerait ORG-1.
select ok(
  public.org_player_lobbies('6b0b1e00-0000-4000-8000-00000000000a')::text
    not like '%' || (select j->>'join_code' from lb where nom = 'kick') || '%',
  'ORG-2 aucun code de partage ne se lit dans le document : cet écran n''est pas un annuaire de codes');
select ok(
  public.org_player_lobbies('6b0b1e00-0000-4000-8000-00000000000a')::text
    not like '%' || repeat('71', 32) || '%',
  'ORG-3 ni aucune empreinte de jeton');
select ok(
  public.org_player_lobbies('6b0b1e00-0000-4000-8000-00000000000a')::text
    not like '%Hôte Kick%',
  'ORG-4 ni aucun pseudo : le commerçant supervise des salles, il n''espionne pas ses clients');

-- ── LE CONTENU EST JUSTE ──────────────────────────────────────
select is(
  (select (t.e->>'membres')::integer
     from pg_catalog.jsonb_array_elements(
            public.org_player_lobbies(
              '6b0b1e00-0000-4000-8000-00000000000a')->'lobbies') as t(e)
    where (t.e->>'id')::uuid
          = (select (j->>'lobby_id')::uuid from lb where nom = 'cap')),
  12,
  'ORG-5 `membres` compte les gens réellement présents');
select is(
  (select (t.e->>'status')
     from pg_catalog.jsonb_array_elements(
            public.org_player_lobbies(
              '6b0b1e00-0000-4000-8000-00000000000a')->'lobbies') as t(e)
    where (t.e->>'id')::uuid
          = (select (j->>'lobby_id')::uuid from lb where nom = 'vieux')),
  'locked',
  'ORG-6 une salle VERROUILLÉE est listée : une partie en cours occupe la maison');

-- CE QUI N'EST PAS LISTÉ : la salle CLOSE et la salle MORTE. L'expiration est
-- constatée ici comme partout (ADR-111) — `mort` a encore `status = 'lobby'` en
-- base, et c'est bien sa DATE qui la sort de la liste.
select is(
  (select pg_catalog.count(*)::integer
     from pg_catalog.jsonb_array_elements(
            public.org_player_lobbies(
              '6b0b1e00-0000-4000-8000-00000000000a')->'lobbies') as t(e)
    where (t.e->>'id')::uuid in (
      (select (j->>'lobby_id')::uuid from lb where nom = 'salon'),
      (select (j->>'lobby_id')::uuid from lb where nom = 'mort'))),
  0,
  'ORG-7 ni la salle CLOSE ni la salle MORTE n''y figurent');

-- ── PLUS LARGE QUE LE QUOTA, ET C'EST LE POINT ────────────────
-- Les vingt salles de E sont vieilles, vides et vivantes : E1-3 a prouvé
-- qu'elles ne pèsent PAS sur le quota. Elles sont pourtant listées — c'est
-- exactement la forme d'une salle-squat, et un écran qui ne montrerait que ce
-- que le quota compte cacherait précisément ce contre quoi il existe.
select cmp_ok(
  (select pg_catalog.count(*)::integer
     from pg_catalog.jsonb_array_elements(
            public.org_player_lobbies(
              '6b0b1e00-0000-4000-8000-00000000000e')->'lobbies') as t(e)
     join public.player_lobbies l on l.id = (t.e->>'id')::uuid
    where l.status = 'lobby'
      and l.created_at <= now() - interval '10 minutes'
      and (select pg_catalog.count(*) from public.player_lobby_members m
            where m.lobby_id = l.id) = 1),
  '>=', 20,
  'ORG-8 les salles VIEILLES ET VIDES — invisibles au quota — sont bien listées');

-- ── L'ISOLATION, SUR L'ENSEMBLE EXACT ET DANS LES DEUX SENS ───
-- Contrôle de portée d'abord : sans lui, les deux assertions suivantes seraient
-- vertes sur un document vide.
select cmp_ok(
  (select pg_catalog.jsonb_array_length(
            public.org_player_lobbies(
              '6b0b1e00-0000-4000-8000-00000000000a')->'lobbies')),
  '>=', 5,
  'ORG-9 contrôle de portée : A a bien plusieurs salles vivantes à montrer');

select is(
  (select pg_catalog.string_agg(t.e->>'id', ',' order by t.e->>'id')
     from pg_catalog.jsonb_array_elements(
            public.org_player_lobbies(
              '6b0b1e00-0000-4000-8000-00000000000a')->'lobbies') as t(e)),
  (select pg_catalog.string_agg(l.id::text, ',' order by l.id::text)
     from public.player_lobbies l
    where l.organization_id = '6b0b1e00-0000-4000-8000-00000000000a'
      and l.status in ('lobby', 'locked')
      and l.expires_at > now()),
  'ORG-10 la liste d''A est EXACTEMENT l''ensemble de ses salles vivantes : ni une de plus, ni une de moins');
select is(
  (select pg_catalog.string_agg(t.e->>'id', ',' order by t.e->>'id')
     from pg_catalog.jsonb_array_elements(
            public.org_player_lobbies(
              '6b0b1e00-0000-4000-8000-00000000000b')->'lobbies') as t(e)),
  (select pg_catalog.string_agg(l.id::text, ',' order by l.id::text)
     from public.player_lobbies l
    where l.organization_id = '6b0b1e00-0000-4000-8000-00000000000b'
      and l.status in ('lobby', 'locked')
      and l.expires_at > now()),
  'ORG-11 … et celle de B l''ensemble des SIENNES : l''isolation tient dans les deux sens');
select is(
  (select pg_catalog.count(*)::integer
     from pg_catalog.jsonb_array_elements(
            public.org_player_lobbies(
              '6b0b1e00-0000-4000-8000-00000000000a')->'lobbies') as t(e)
     join public.player_lobbies l on l.id = (t.e->>'id')::uuid
    where l.organization_id <> '6b0b1e00-0000-4000-8000-00000000000a'),
  0,
  'ORG-12 aucune salle d''un autre locataire ne se glisse dans la liste d''A');

-- ── LA BORNE, ET SON DÉPARTAGE ────────────────────────────────
select is(
  (select pg_catalog.count(*)::integer from public.player_lobbies l
    where l.organization_id = '6b0b1e00-0000-4000-8000-000000000011'),
  55,
  'ORG-13 contrôle de portée : H porte bien cinquante-cinq salles vivantes');
select is(
  (select pg_catalog.jsonb_array_length(
            public.org_player_lobbies(
              '6b0b1e00-0000-4000-8000-000000000011')->'lobbies')),
  50,
  'ORG-14 la liste est bornée à CINQUANTE');
-- LE DÉPARTAGE. Les cinquante-cinq salles de H sont nées dans la MÊME
-- transaction, donc elles portent le MÊME `created_at` à la microseconde :
-- sans `id` en second terme, la borne couperait dans un sous-ensemble
-- arbitraire et deux appels n'y verraient pas les mêmes lignes. L'ordre est
-- reconstruit ici EXACTEMENT comme dans la RPC — si l'un des deux change, cette
-- assertion rougit (motif QUOTA-4 pour la clé du verrou).
select is(
  (select pg_catalog.string_agg(t.e->>'id', ',' order by t.e->>'id')
     from pg_catalog.jsonb_array_elements(
            public.org_player_lobbies(
              '6b0b1e00-0000-4000-8000-000000000011')->'lobbies') as t(e)),
  (select pg_catalog.string_agg(u.id::text, ',' order by u.id::text)
     from (select l.id
             from public.player_lobbies l
            where l.organization_id = '6b0b1e00-0000-4000-8000-000000000011'
            order by l.created_at desc, l.id
            limit 50) u),
  'ORG-15 … et ce sont les cinquante PREMIÈRES de l''ordre annoncé, départage par id compris');

-- ── LE DOCUMENT VIDE N'EST PAS UN REFUS ───────────────────────
select is(
  public.org_player_lobbies('6b0b1e00-0000-4000-8000-00000000000c'),
  '{"lobbies": []}'::jsonb,
  'ORG-16 une organisation sans salle rend un document VIDE, pas une erreur');
select is(
  public.org_player_lobbies('6b0b1e00-0000-4000-8000-00000000000c'),
  public.org_player_lobbies('facade00-0000-4000-8000-000000000000'),
  'ORG-17 … et une organisation inconnue rend EXACTEMENT le même');


-- ════════════════════════════════════════════════════════════
-- 12. LE COMMERÇANT FERME UNE SALLE
--
-- Contrepartie du finding E-1, volet RÉVERSIBLE. La démonstration centrale est
-- CLOSE-9/10/11 : B est saturée, on ferme UNE salle, la création repasse — sans
-- cron, sans TTL, à l'instant. Le reste borne le geste : l'acteur est vérifié en
-- SQL, les quatre refus ne se distinguent pas, l'idempotence n'écrit ni ne
-- journalise, et une salle VERROUILLÉE se ferme aussi — c'est la forme même de
-- l'attaque démontrée (`create` + auto-entrée + `lock`).
-- ════════════════════════════════════════════════════════════

-- ── LES CINQ REFUS, ET ILS SONT LE MÊME ───────────────────────
-- Acteur absent, CAISSIER (l'appartenance ne suffit pas, le rôle est lu), acteur
-- habilité mais d'une AUTRE organisation, salle inconnue, salle du VOISIN : même
-- SQLSTATE et même message, donc aucun oracle. Le message est asserté en toutes
-- lettres — un 42501 qui dirait « lobby not found » serait le même code et un
-- oracle quand même.
select throws_ok(
  format($$select public.close_player_lobby_as_org(%L, %L, null::uuid)$$,
    '6b0b1e00-0000-4000-8000-00000000000a',
    (select (j->>'lobby_id')::uuid from lb where nom = 'duo')),
  '42501', 'not authorized',
  'CLOSE-1 un acteur absent est refusé');
select throws_ok(
  format($$select public.close_player_lobby_as_org(%L, %L, %L)$$,
    '6b0b1e00-0000-4000-8000-00000000000a',
    (select (j->>'lobby_id')::uuid from lb where nom = 'duo'),
    '6b0b1e01-0000-4000-8000-000000000003'),
  '42501', 'not authorized',
  'CLOSE-2 le CAISSIER est refusé : fermer interrompt des gens qui jouent, ce n''est pas un geste de comptoir');
select throws_ok(
  format($$select public.close_player_lobby_as_org(%L, %L, %L)$$,
    '6b0b1e00-0000-4000-8000-00000000000a',
    (select (j->>'lobby_id')::uuid from lb where nom = 'duo'),
    '6b0b1e01-0000-4000-8000-000000000004'),
  '42501', 'not authorized',
  'CLOSE-3 le propriétaire de B est refusé chez A : habilité ne veut pas dire habilité PARTOUT');
select throws_ok(
  format($$select public.close_player_lobby_as_org(%L, %L, %L)$$,
    '6b0b1e00-0000-4000-8000-00000000000a',
    '3f3f3f3f-0000-4000-8000-000000000000',
    '6b0b1e01-0000-4000-8000-000000000001'),
  '42501', 'not authorized',
  'CLOSE-4 une salle inventée est refusée');
select throws_ok(
  format($$select public.close_player_lobby_as_org(%L, %L, %L)$$,
    '6b0b1e00-0000-4000-8000-00000000000a',
    (select l.id from public.player_lobbies l
      where l.organization_id = '6b0b1e00-0000-4000-8000-00000000000b'
      order by l.id limit 1),
    '6b0b1e01-0000-4000-8000-000000000001'),
  '42501', 'not authorized',
  'CLOSE-5 la salle du VOISIN est refusée du MÊME mot : personne ne compte l''activité d''en face une requête à la fois');
select is(
  (select l.status from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'duo')),
  'lobby',
  'CLOSE-6 aucun de ces cinq refus n''a rien écrit');

-- ── LE GESTE NOMINAL ──────────────────────────────────────────
select is(
  public.close_player_lobby_as_org(
    '6b0b1e00-0000-4000-8000-00000000000a',
    (select (j->>'lobby_id')::uuid from lb where nom = 'kick'),
    '6b0b1e01-0000-4000-8000-000000000001'),
  '{"state": "ok", "closed": true}'::jsonb,
  'CLOSE-7 le propriétaire ferme une salle de sa maison');
select is(
  (select l.status from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'kick')),
  'closed',
  'CLOSE-8 et la base le sait');

-- ── LA PLACE EST RENDUE À L'INSTANT ───────────────────────────
-- LE CŒUR DU LOT. B est saturée depuis QUOTA-2 ; on ferme UNE de ses salles et
-- la création repasse, sans qu'aucun cron soit passé et sans attendre aucun TTL.
-- C'est ce que « réversible » veut dire, et c'est ce qui change le rapport de
-- forces : vingt clics défont ce que vingt requêtes ont fait.
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-00000000000b', 'bande', 4,
     repeat('b9', 32), 'Avant fermeture'))->>'state',
  'quota',
  'CLOSE-9 contrôle de portée : B est bien encore saturée');
select is(
  public.close_player_lobby_as_org(
    '6b0b1e00-0000-4000-8000-00000000000b',
    (select l.id from public.player_lobbies l
      where l.organization_id = '6b0b1e00-0000-4000-8000-00000000000b'
        and l.status = 'lobby'
      order by l.id limit 1),
    '6b0b1e01-0000-4000-8000-000000000004'),
  '{"state": "ok", "closed": true}'::jsonb,
  'CLOSE-10 le propriétaire de B ferme UNE salle');
select is(
  (public.create_player_lobby(
     '6b0b1e00-0000-4000-8000-00000000000b', 'bande', 4,
     repeat('b9', 32), 'Après fermeture'))->>'state',
  'created',
  'CLOSE-11 … et la place est rendue À L''INSTANT : la création repasse');

-- ── UNE SALLE VERROUILLÉE SE FERME AUSSI ──────────────────────
-- `kick` et `leave` refusent d'écrire sur une partie commencée, et c'est juste :
-- eux arbitrent entre joueurs. Le commerçant, lui, arbitre chez lui — et
-- l'attaque démontrée produit précisément une salle VERROUILLÉE, donc s'arrêter
-- à « lobby » raterait le seul cas pour lequel cette RPC existe.
select is(
  public.close_player_lobby_as_org(
    '6b0b1e00-0000-4000-8000-00000000000a',
    (select (j->>'lobby_id')::uuid from lb where nom = 'frais'),
    '6b0b1e01-0000-4000-8000-000000000002'),
  '{"state": "ok", "closed": true}'::jsonb,
  'CLOSE-12 l''ÉDITEUR ferme une salle VERROUILLÉE : c''est la forme même de la salle-squat');
select is(
  (select l.status from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'frais')),
  'closed',
  'CLOSE-13 … et la partie s''arrête pour de bon');
-- LES JOUEURS LE CONSTATENT PAR `lobby_state`, sans qu'aucun état nouveau ait eu
-- à exister : la salle rend `closed`, comme quand un hôte s'en va.
select is(
  (public.lobby_state(
     (select (j->>'lobby_id')::uuid from lb where nom = 'frais'),
     repeat('82', 32)))->>'status',
  'closed',
  'CLOSE-14 le joueur resté dedans le voit, et ne lit aucun état inventé pour l''occasion');

-- ── LA DATE DE MORT RECULE, ELLE N'AVANCE JAMAIS (ADR-111) ────
select ok(
  (select l.expires_at from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'frais'))
  < now() + interval '1 hour',
  'CLOSE-15 la date de mort est ramenée à l''instant de la fermeture, pas laissée à l''heure du verrouillage');
select ok(
  (select l.expires_at > l.created_at from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'frais')),
  'CLOSE-16 … et elle reste APRÈS la naissance : clock_timestamp() et non now(), sinon le check tombait sur une salle créée et fermée dans la même transaction');

-- ── L'IDEMPOTENCE N'ÉCRIT RIEN ET NE JOURNALISE RIEN ──────────
select is(
  public.close_player_lobby_as_org(
    '6b0b1e00-0000-4000-8000-00000000000a',
    (select (j->>'lobby_id')::uuid from lb where nom = 'kick'),
    '6b0b1e01-0000-4000-8000-000000000001'),
  '{"state": "ok", "closed": false}'::jsonb,
  'CLOSE-17 fermer une salle DÉJÀ CLOSE est un succès muet, pas une erreur');
-- LA SALLE MORTE AUSSI — et surtout, sa date de mort NE BOUGE PAS. La repousser
-- reculerait sa purge : l'exact contraire de ce que le champ signifie.
create temporary table lb_mort as
  select l.expires_at from public.player_lobbies l
   where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'mort');
select is(
  public.close_player_lobby_as_org(
    '6b0b1e00-0000-4000-8000-00000000000a',
    (select (j->>'lobby_id')::uuid from lb where nom = 'mort'),
    '6b0b1e01-0000-4000-8000-000000000001'),
  '{"state": "ok", "closed": false}'::jsonb,
  'CLOSE-18 fermer une salle MORTE aussi');
select is(
  (select l.expires_at from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from lb where nom = 'mort')),
  (select expires_at from lb_mort),
  'CLOSE-19 … et sa date de mort n''a PAS bougé : repousser un cadavre reculerait sa purge');

-- ── LE JOURNAL PORTE LE GESTE, PAS LES GENS ───────────────────
select is(
  (select a.actor from public.audit_logs a
    where a.action = 'lobby.closed_by_org'
      and a.metadata->>'lobby_id'
          = (select j->>'lobby_id' from lb where nom = 'kick')),
  '6b0b1e01-0000-4000-8000-000000000001',
  'CLOSE-20 la ligne d''audit porte le nom de la personne, vérifié en SQL — pas une déclaration sur l''honneur');
select is(
  (select a.metadata from public.audit_logs a
    where a.action = 'lobby.closed_by_org'
      and a.metadata->>'lobby_id'
          = (select j->>'lobby_id' from lb where nom = 'kick')),
  pg_catalog.jsonb_build_object(
    'lobby_id', (select (j->>'lobby_id')::uuid from lb where nom = 'kick'),
    'statut_avant', 'lobby',
    'membres', 3),
  'CLOSE-21 … le statut d''AVANT et le NOMBRE de gens dedans, et rien de plus');
select is(
  (select pg_catalog.count(*)::integer from public.audit_logs a
    where a.action = 'lobby.closed_by_org'
      and a.metadata->>'lobby_id'
          = (select j->>'lobby_id' from lb where nom = 'kick')),
  1,
  'CLOSE-22 fermer deux fois ne journalise QU''UNE fois : un journal qui compte les non-gestes devient illisible');
select ok(
  (select a.metadata::text from public.audit_logs a
    where a.action = 'lobby.closed_by_org'
      and a.metadata->>'lobby_id'
          = (select j->>'lobby_id' from lb where nom = 'kick'))
  not like '%' || (select j->>'join_code' from lb where nom = 'kick') || '%',
  'CLOSE-23 le journal ne grave pas le code de partage…');
select ok(
  (select a.metadata::text from public.audit_logs a
    where a.action = 'lobby.closed_by_org'
      and a.metadata->>'lobby_id'
          = (select j->>'lobby_id' from lb where nom = 'kick'))
  not like '%Hôte Kick%',
  'CLOSE-24 … ni les pseudos : ce que l''écran refuse de montrer, le journal ne le garde pas non plus');

-- ── ET LA SALLE FERMÉE DISPARAÎT DE L'ÉCRAN ───────────────────
select is(
  (select pg_catalog.count(*)::integer
     from pg_catalog.jsonb_array_elements(
            public.org_player_lobbies(
              '6b0b1e00-0000-4000-8000-00000000000a')->'lobbies') as t(e)
    where (t.e->>'id')::uuid in (
      (select (j->>'lobby_id')::uuid from lb where nom = 'kick'),
      (select (j->>'lobby_id')::uuid from lb where nom = 'frais'))),
  0,
  'CLOSE-25 les deux salles fermées ont quitté l''écran de supervision : les deux RPC racontent la même chose');


-- ════════════════════════════════════════════════════════════
-- 13. ACL, RLS, GRANTS
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

-- LES NEUF RPC : `service_role` et lui seul.
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

-- LES DEUX RPC COMMERÇANT. Le point qui compte : `authenticated` — le rôle des
-- comptes marchands — n'y a PAS accès. Elles sont écrites POUR le commerçant,
-- mais elles passent par le serveur, qui seul sait de quelle organisation il
-- tient l'écran. Les ouvrir à `authenticated` rendrait le `p_organization_id`
-- déclaratif : n'importe quel compte connecté lirait les salles de n'importe
-- quelle maison en changeant un uuid.
select ok(has_function_privilege('service_role', 'public.org_player_lobbies(uuid)', 'EXECUTE'), 'ACL-31 le serveur lit la liste de supervision');
select ok(not has_function_privilege('authenticated', 'public.org_player_lobbies(uuid)', 'EXECUTE'), 'ACL-32 un commerçant ne l''appelle PAS lui-même : le p_organization_id deviendrait déclaratif');
select ok(not has_function_privilege('anon', 'public.org_player_lobbies(uuid)', 'EXECUTE'), 'ACL-33 anon non plus — sinon la clé publique compterait les salles de tout le monde');
select ok(has_function_privilege('service_role', 'public.close_player_lobby_as_org(uuid,uuid,uuid)', 'EXECUTE'), 'ACL-34 le serveur ferme une salle');
select ok(not has_function_privilege('authenticated', 'public.close_player_lobby_as_org(uuid,uuid,uuid)', 'EXECUTE'), 'ACL-35 un commerçant ne l''appelle pas en direct, même habilité');
select ok(not has_function_privilege('anon', 'public.close_player_lobby_as_org(uuid,uuid,uuid)', 'EXECUTE'), 'ACL-36 anon non plus — sinon fermer les salles des autres coûterait une requête');

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
  'ACL-37 aucun check des deux tables n''appelle une fonction du dépôt : rien à accorder, rien à oublier');
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
  'ACL-38 la règle porte bien sur les check réellement posés, pas sur un ensemble vide');

select * from finish();
rollback;
