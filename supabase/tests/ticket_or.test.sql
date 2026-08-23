-- ============================================================
-- LE TICKET D'OR (TKT-1) — ce que le serveur refuse, et pourquoi
--
-- Quatre propriétés portent ce lot, et ce fichier ne teste qu'elles :
--
--   1. LE CLIENT NE PEUT PAS S'ÉMETTRE UN TICKET. `emettre_ticket_or` exige
--      une session du commerce ; sans elle, aucun code n'existe.
--   2. UN CODE NE SERT QU'UNE FOIS. C'est la promesse « une capture d'écran
--      ne prouve rien » : le second appel rend `deja_tire`, jamais un lot.
--   3. LE STOCK NE PASSE PAS SOUS ZÉRO. Le dernier exemplaire part une fois.
--   4. LE POINT D'ENTRÉE PUBLIC N'EST PAS UN ORACLE. Un code inventé et le
--      code d'un commerce sans offre rendent le MÊME document.
--
-- Ce qui n'est PAS testé ici, et volontairement : la concurrence réelle. Un
-- `for update` ne se prouve pas dans une transaction unique — pgTAP n'a qu'une
-- session. La garde est lisible dans la fonction, et le `update … where
-- stock > 0` la double au niveau du stock, lui vérifiable ci-dessous.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
-- A : commerce ACTIF — l'offre de base ouvre le Ticket d'Or.
-- B : commerce SANS OFFRE — `subscription_status` inactif : rien ne s'ouvre.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('d1000000-0000-4000-8000-00000000000a', 'Ticket A', 'tap-ticket-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('d1000000-0000-4000-8000-00000000000b', 'Ticket B', 'tap-ticket-b',
   'canceled', 'starter', 'Europe/Paris', 6);

insert into auth.users
  (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('d1000000-0000-4000-8000-000000000f01', 'authenticated', 'authenticated',
   'proprio-ticket-a@test.local', '', now(), now()),
  ('d1000000-0000-4000-8000-000000000f02', 'authenticated', 'authenticated',
   'proprio-ticket-b@test.local', '', now(), now());

insert into public.organization_members (organization_id, user_id, role) values
  ('d1000000-0000-4000-8000-00000000000a',
   'd1000000-0000-4000-8000-000000000f01', 'owner'),
  ('d1000000-0000-4000-8000-00000000000b',
   'd1000000-0000-4000-8000-000000000f02', 'owner');

-- UN SEUL LOT, UN SEUL EXEMPLAIRE : c'est ce qui rend l'épuisement observable.
insert into public.tickets_or_lots
  (id, organization_id, libelle, poids, stock, actif, ordre)
values
  ('d1000000-0000-4000-8000-0000000000c1',
   'd1000000-0000-4000-8000-00000000000a', 'Un café offert', 10, 1, true, 0);

-- ══ 1. LE CLIENT NE S'ÉMET RIEN ═════════════════════════════

select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  public.emettre_ticket_or('d1000000-0000-4000-8000-00000000000a') ->> 'state',
  'not_authorized',
  'ÉMISSION-1 sans session de commerce, aucun ticket : « un QR statique ne prouve jamais un achat » commence ici'
);

-- Le voisin non plus : être membre d'UN commerce n'ouvre pas celui d'à côté.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000f02"}', true);

select is(
  public.emettre_ticket_or('d1000000-0000-4000-8000-00000000000a') ->> 'state',
  'not_authorized',
  'ÉMISSION-2 le propriétaire du commerce voisin ne peut pas émettre ici'
);

-- Son PROPRE commerce le refuse aussi, mais pour une autre raison : pas d'offre.
select is(
  public.emettre_ticket_or('d1000000-0000-4000-8000-00000000000b') ->> 'state',
  'no_access',
  'ÉMISSION-3 sans offre active, le jeu du socle reste fermé — et le refus est DISTINCT de celui d''appartenance'
);

-- ══ 2. LE STAFF ÉMET, ET LE CODE EST DE LA BONNE FORME ══════

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000f01"}', true);

create temporary table t_emission on commit drop as
select public.emettre_ticket_or('d1000000-0000-4000-8000-00000000000a') as doc;

select is(
  (select doc ->> 'state' from t_emission), 'ok',
  'ÉMISSION-4 le propriétaire du commerce émet'
);

select ok(
  (select (doc ->> 'code') ~ '^[A-HJ-NP-Z2-9]{10}$' from t_emission),
  'ÉMISSION-5 le code est de dix caractères, sans I, O, 0 ni 1 — il se lit à voix haute au comptoir'
);

-- ══ 3. LE POINT D'ENTRÉE PUBLIC N'EST PAS UN ORACLE ═════════

select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  public.tirer_ticket_or('ZZZZZZZZZZ') ->> 'state', 'introuvable',
  'PUBLIC-1 un code inventé rend `introuvable`'
);

select is(
  public.tirer_ticket_or('pas-un-code') ->> 'state', 'introuvable',
  'PUBLIC-2 une chaîne mal formée rend LE MÊME document — aucune distinction de forme'
);

-- ══ 4. LE TIRAGE, UNE FOIS ══════════════════════════════════

create temporary table t_tirage on commit drop as
select public.tirer_ticket_or((select doc ->> 'code' from t_emission)) as doc;

select is(
  (select doc ->> 'state' from t_tirage), 'ok',
  'TIRAGE-1 le ticket tire'
);

select is(
  (select doc ->> 'lot' from t_tirage), 'Un café offert',
  'TIRAGE-2 … et rend le lot du stock, décidé côté serveur'
);

select ok(
  (select (doc ->> 'code_retrait') ~ '^TICKET-[A-HJ-NP-Z2-9]{8}$' from t_tirage),
  'TIRAGE-3 le code de RETRAIT porte le préfixe du registre et reste distinct de celui du ticket : le premier prouve le droit de tirer, le second celui d''emporter'
);

select is(
  public.tirer_ticket_or((select doc ->> 'code' from t_emission)) ->> 'state',
  'deja_tire',
  'TIRAGE-4 LE MÊME CODE NE REJOUE PAS — c''est ce qui rend une capture d''écran sans valeur'
);

select is(
  (select stock from public.tickets_or_lots
    where id = 'd1000000-0000-4000-8000-0000000000c1'),
  0,
  'TIRAGE-5 le stock est décrémenté DANS la même transaction'
);

select is(
  (select count(*)::int from public.reward_issuances
    where organization_id = 'd1000000-0000-4000-8000-00000000000a'
      and source_type = 'ticket_or'),
  1,
  'TIRAGE-6 le lot entre au registre UNIVERSEL — le portefeuille et l''historique le lisent déjà'
);

-- ══ 5. LE STOCK NE PASSE PAS SOUS ZÉRO ══════════════════════

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000f01"}', true);

create temporary table t_emission2 on commit drop as
select public.emettre_ticket_or('d1000000-0000-4000-8000-00000000000a') as doc;

select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  public.tirer_ticket_or((select doc ->> 'code' from t_emission2)) ->> 'state',
  'sans_lot',
  'STOCK-1 le dernier exemplaire est parti : le ticket suivant ne tire rien plutôt que d''emporter un lot qui n''existe plus'
);

select is(
  (select stock from public.tickets_or_lots
    where id = 'd1000000-0000-4000-8000-0000000000c1'),
  0,
  'STOCK-2 … et le stock n''est pas passé à -1'
);

-- ══ 6. LA REMISE, PAR LA CAISSE UNIVERSELLE ═════════════════

select throws_ok(
  $$select * from public.redeem_ticket_or(
       'd1000000-0000-4000-8000-00000000000a',
       (select doc ->> 'code_retrait' from t_tirage),
       'd1000000-0000-4000-8000-000000000f02')$$,
  -- QUATRE ARGUMENTS, ET C'EST LE PIÈGE : la forme à trois de `throws_ok`
  -- prend le troisième pour le MESSAGE attendu, pas pour la description. Écrite
  -- à trois, cette assertion comparait « not authorized » à la phrase française
  -- ci-dessous et échouait sur une fonction pourtant correcte.
  '42501',
  'not authorized',
  'CAISSE-1 le propriétaire du commerce voisin ne remet rien ici'
);

select is(
  (select redeemed_now from public.redeem_ticket_or(
     'd1000000-0000-4000-8000-00000000000a',
     (select doc ->> 'code_retrait' from t_tirage),
     'd1000000-0000-4000-8000-000000000f01')),
  true,
  'CAISSE-2 la caisse remet le lot, et le dit REMIS À L''INSTANT'
);

select is(
  (select redeemed_now from public.redeem_ticket_or(
     'd1000000-0000-4000-8000-00000000000a',
     (select doc ->> 'code_retrait' from t_tirage),
     'd1000000-0000-4000-8000-000000000f01')),
  false,
  'CAISSE-3 … et le second passage rend `redeemed_now` FAUX : le comptoir distingue « remis à l''instant » de « déjà remis »'
);

select is(
  (select count(*)::int from public.reward_issuances
    where source_type = 'ticket_or' and redeemed_at is not null),
  1,
  'CAISSE-4 … sans réécrire la date de remise'
);

-- ══ 6 bis. LA CAISSE UNIVERSELLE LE CONNAÎT ════════════════
--
-- C'EST LA PROMESSE « UN JEU COMME UN AUTRE » : le comptoir tape un code dans
-- l'écran de caisse qu'il utilise déjà, sans savoir de quel jeu il vient. Si
-- cette assertion tombe, le Ticket d'Or existe mais reste invisible là où le
-- commerçant travaille — la moitié du lot serait livrée.

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000f01"}', true);

create temporary table t_emission3 on commit drop as
select public.emettre_ticket_or('d1000000-0000-4000-8000-00000000000a') as doc;

-- Un lot neuf, pour que le tirage ait de quoi sortir.
insert into public.tickets_or_lots
  (organization_id, libelle, poids, stock, actif, ordre)
values
  ('d1000000-0000-4000-8000-00000000000a', 'Un dessert offert', 5, null, true, 1);

select set_config('request.jwt.claims', '{"role":"anon"}', true);

create temporary table t_tirage3 on commit drop as
select public.tirer_ticket_or((select doc ->> 'code' from t_emission3)) as doc;

select is(
  (select doc ->> 'state' from t_tirage3), 'ok',
  'CAISSE-5 un second ticket tire sur un lot à stock illimité'
);

-- `service_role` ET NON une session : `redeem_reward_by_code` exige
-- `auth.role() = 'service_role'`, parce qu'elle est appelée par le SERVEUR de
-- l'application après sa propre garde. L'acteur, lui, reste un utilisateur
-- réel — c'est lui que la fonction revérifie membre du commerce.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (select state from public.redeem_reward_by_code(
     'd1000000-0000-4000-8000-00000000000a',
     (select doc ->> 'code_retrait' from t_tirage3),
     'd1000000-0000-4000-8000-000000000f01')),
  'redeemed',
  'CAISSE-6 LA CAISSE UNIVERSELLE remet le lot : le comptoir n''a rien de nouveau à apprendre'
);

-- ══ 7. LES MESURES, ET CE QU'ELLES NE DISENT PAS ════════════

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000f01"}', true);

select is(
  public.tickets_or_state('d1000000-0000-4000-8000-00000000000a') #>> '{mesures,emis}',
  '3',
  'MESURE-1 trois tickets émis sur trente jours'
);

select is(
  public.tickets_or_state('d1000000-0000-4000-8000-00000000000a') #>> '{mesures,remis}',
  '2',
  'MESURE-2 deux lots remis — dont un par la caisse universelle'
);

select ok(
  not (public.tickets_or_state('d1000000-0000-4000-8000-00000000000a')
       -> 'mesures' ? 'panier'),
  'MESURE-3 aucun panier, aucun revenu : la table ne les connaît pas, et le cahier l''interdit'
);

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000f02"}', true);

select is(
  public.tickets_or_state('d1000000-0000-4000-8000-00000000000a') ->> 'state',
  'not_authorized',
  'MESURE-4 le voisin ne lit pas les mesures d''à côté'
);

select * from finish();
rollback;
