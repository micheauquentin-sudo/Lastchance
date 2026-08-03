-- ============================================================
-- 20260902120000 — la disparition d'une source ANNULE son lot au registre
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LE DÉFAUT ET SA FERMETURE (sections 1 et 2). On établit d'abord la
--      PRÉMISSE — le lot est « active » au portefeuille du client — puis on
--      joue le geste réel du commerçant (suppression de la campagne), et on
--      prouve les DEUX moitiés de l'arbitrage : la ligne de registre SURVIT
--      (la trace, le rapport hebdomadaire, la purge de rétention) ET elle
--      passe à « cancelled » (le client lit une explication, pas une
--      disparition). Sans la prémisse, « cancelled » ne prouverait rien.
--   2. CE QUE LE MARQUAGE NE RÉÉCRIT PAS (section 3). C'était le vrai risque
--      du geste : un lot DÉJÀ REMIS annulé après coup réécrirait un fait, et
--      une annulation déjà motivée perdrait le seul motif qu'elle porte.
--   3. QUE LA CAISSE Y GAGNE (section 4) : `redeem_reward_by_code` rend
--      désormais « cancelled » — le message « Ce lot a été annulé » — là où
--      elle rendait « source_missing ».
--   4. QUE RIEN NE RÉACTIVE LA LIGNE (section 6), et pas seulement que
--      `cancelled_at` y reste : que la synchro rejouée n'écrit RIEN.
--   5. Une seconde famille et une cascade à deux niveaux (section 5).
--   6. QUE LA RÉTENTION NE PARLE PAS AU NOM DU COMMERÇANT (sections 7 à 9),
--      ajouté après la revue de sécurité. Le marquage a DEUX causes, et les
--      confondre coûtait deux fois : la purge RGPD, qui supprime la ligne
--      source sur le SEUL critère d'âge, armait le trigger — donc rendait la
--      ligne de registre « terminée », donc purgeable la nuit même, alors
--      qu'elle était protégée À VIE avant que ce trigger n'existe (sept
--      familles sur neuf n'ont aucune expiration) ; et l'écran du client
--      imputait au commerçant un geste qu'il n'avait pas fait. La section 8
--      joue la purge réelle du module chasse, la 9 prouve les deux issues
--      OPPOSÉES d'un même passage de la purge du registre.
--
-- Toutes les assertions sont scopées à l'organisation ou aux codes de test :
-- ce fichier doit passer sur base VIDE comme sur base SEMÉE.
-- ============================================================
-- Plan CHIFFRÉ et non `no_plan()` : un fichier qui MEURT avant `finish()` rend
-- « aucun plan trouvé », ce que rien ne distingue d'un succès.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ══ 0. Les dix jumeaux à la suppression existent ════════════
-- Un par table source, en miroir des dix triggers d'insertion/mise à jour.
select has_trigger('public', 'participations', 'participations_reward_issuance_delete', 'la disparition d''une participation est suivie');
select has_trigger('public', 'hunt_completions', 'hunt_completions_reward_issuance_delete', 'la disparition d''une complétion de chasse est suivie');
select has_trigger('public', 'loyalty_rewards', 'loyalty_rewards_reward_issuance_delete', 'la disparition d''une récompense de fidélité est suivie');
select has_trigger('public', 'jackpot_wins', 'jackpot_wins_reward_issuance_delete', 'la disparition d''un gain jackpot est suivie');
select has_trigger('public', 'event_wins', 'event_wins_reward_issuance_delete', 'la disparition d''un gain d''événement est suivie');
select has_trigger('public', 'calendar_openings', 'calendar_openings_reward_issuance_delete', 'la disparition d''une case de calendrier est suivie');
select has_trigger('public', 'calendar_rewards', 'calendar_rewards_reward_issuance_delete', 'la disparition d''une récompense d''assiduité est suivie');
select has_trigger('public', 'referral_rewards', 'referral_rewards_reward_issuance_delete', 'la disparition d''une récompense de parrainage est suivie');
select has_trigger('public', 'quiz_rewards', 'quiz_rewards_reward_issuance_delete', 'la disparition d''une récompense de quiz est suivie');
select has_trigger('public', 'contest_awards', 'contest_awards_reward_issuance_delete', 'la disparition d''une récompense de pronostics est suivie');

-- ── Fixtures ────────────────────────────────────────────────
insert into auth.users (
  id, aud, role, email, encrypted_password, created_at, updated_at
) values (
  'da000000-0000-4000-8000-00000000a001',
  'authenticated', 'authenticated', 'cashier-del@tap.local', '', now(), now()
);

insert into public.organizations (id, name, slug) values
  ('da000000-0000-4000-8000-000000000001', 'Suppression TAP', 'tap-suppression');

insert into public.organization_members (organization_id, user_id, role) values
  ('da000000-0000-4000-8000-000000000001',
   'da000000-0000-4000-8000-00000000a001', 'cashier');

insert into public.campaigns (id, organization_id, name, status) values
  ('da000000-0000-4000-8000-000000000010',
   'da000000-0000-4000-8000-000000000001', 'Campagne supprimée', 'active');

insert into public.wheels (id, organization_id, campaign_id, name, play_limit) values
  ('da000000-0000-4000-8000-000000000020',
   'da000000-0000-4000-8000-000000000001',
   'da000000-0000-4000-8000-000000000010', 'Roue supprimée', 'unlimited');

insert into public.prizes (id, organization_id, wheel_id, label, stock) values
  ('da000000-0000-4000-8000-000000000030',
   'da000000-0000-4000-8000-000000000001',
   'da000000-0000-4000-8000-000000000020', 'Café offert', 100);

-- L'identité du joueur est posée AVANT l'émission : c'est ce qui permet au
-- miroir de résoudre `player_id`, donc au portefeuille de voir le lot. Sans
-- elle, la section 2 verdirait sur une absence de ligne au lieu d'un état.
select is(
  (select count(*) from public.resolve_player_identity(
     repeat('7c', 32), 'da000000-0000-4000-8000-000000000001',
     'campaign', 'da000000-0000-4000-8000-000000000010',
     repeat('a5', 32), 'direct', null)),
  1::bigint, 'le joueur, son appareil et son pont legacy sont créés');

-- Quatre lots de la même roue, quatre états à l'entrée : encore dû, déjà
-- remis, déjà annulé avec son motif, et un dont le laissez-passer Wallet est
-- déjà révoqué.
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id,
  first_name, email, accepted_terms, redeem_code, player_key
) values
  ('da000000-0000-4000-8000-000000000101',
   'da000000-0000-4000-8000-000000000001',
   'da000000-0000-4000-8000-000000000010',
   'da000000-0000-4000-8000-000000000020',
   'da000000-0000-4000-8000-000000000030',
   'Alice', 'alice-del@tap.local', true, 'GAIN-ACTIF111', repeat('a5', 32)),
  ('da000000-0000-4000-8000-000000000102',
   'da000000-0000-4000-8000-000000000001',
   'da000000-0000-4000-8000-000000000010',
   'da000000-0000-4000-8000-000000000020',
   'da000000-0000-4000-8000-000000000030',
   'Bob', 'bob-del@tap.local', true, 'GAIN-REMIS222', repeat('b5', 32)),
  ('da000000-0000-4000-8000-000000000103',
   'da000000-0000-4000-8000-000000000001',
   'da000000-0000-4000-8000-000000000010',
   'da000000-0000-4000-8000-000000000020',
   'da000000-0000-4000-8000-000000000030',
   'Carol', 'carol-del@tap.local', true, 'GAIN-ANNUL333', repeat('c5', 32)),
  ('da000000-0000-4000-8000-000000000104',
   'da000000-0000-4000-8000-000000000001',
   'da000000-0000-4000-8000-000000000010',
   'da000000-0000-4000-8000-000000000020',
   'da000000-0000-4000-8000-000000000030',
   'Dan', 'dan-del@tap.local', true, 'GAIN-REVOK444', repeat('d5', 32));

update public.participations set redeemed_at = now()
 where id = 'da000000-0000-4000-8000-000000000102';

select is(
  public.cancel_participation(
    'da000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000103',
    'annulé au comptoir'),
  true, 'le lot de Carol est annulé par la voie métier, avec son motif');

-- Laissez-passer Wallet déjà révoqué : le marquage ne doit pas le redemander.
update public.reward_issuances
   set wallet_status = 'revoked', wallet_updated_at = now()
 where code = 'GAIN-REVOK444';

-- ══ 1. La prémisse : le lot est encore dû ═══════════════════
select is(
  (select status from public.player_wallet(repeat('7c', 32), 50)
    where code = 'GAIN-ACTIF111'),
  'active',
  'AVANT la suppression, le client lit « à retirer » — c''est la prémisse du défaut');
select is(
  (select count(*) from public.participations
    where id = 'da000000-0000-4000-8000-000000000101'),
  1::bigint, 'et sa ligne source existe');

-- ══ 2. Le geste réel du commerçant ══════════════════════════
-- Suppression de la campagne : la cascade emporte roue, lots et participations.
delete from public.campaigns
 where id = 'da000000-0000-4000-8000-000000000010';

select is(
  (select count(*) from public.participations
    where id = 'da000000-0000-4000-8000-000000000101'),
  0::bigint, 'la cascade a bien emporté la ligne source');

-- L'ARBITRAGE, première moitié : la ligne de registre SURVIT. C'est elle que
-- le rapport hebdomadaire compte comme « lot émis » et que la purge de
-- rétention emportera le moment venu.
select is(
  (select count(*) from public.reward_issuances
    where code = 'GAIN-ACTIF111'),
  1::bigint,
  'la ligne de registre survit : la trace de ce qui a été émis n''est pas détruite');

-- Seconde moitié : elle n'est plus encaissable, et elle le DIT.
select results_eq(
  $$select cancelled_at is not null, cancelled_reason
      from public.reward_issuances where code = 'GAIN-ACTIF111'$$,
  $$values (true, 'source supprimée'::text)$$,
  'la disparition de la source annule le lot et nomme la raison');

select is(
  (select wallet_status from public.reward_issuances where code = 'GAIN-ACTIF111'),
  'revocation_requested',
  'le laissez-passer Wallet est mis en révocation, comme sur toute fin de cycle');

select is(
  (select count(*) from public.player_wallet(repeat('7c', 32), 50)
    where code = 'GAIN-ACTIF111'),
  1::bigint,
  'le lot ne DISPARAÎT pas du portefeuille : un gain qui s''évapore ferait croire à un produit cassé');
select is(
  (select status from public.player_wallet(repeat('7c', 32), 50)
    where code = 'GAIN-ACTIF111'),
  'cancelled',
  'le client lit « Annulé » — un état que son écran sait déjà rendre');

-- ══ 3. Ce que le marquage ne réécrit pas ════════════════════
select results_eq(
  $$select redeemed_at is not null, cancelled_at is null
      from public.reward_issuances where code = 'GAIN-REMIS222'$$,
  $$values (true, true)$$,
  'un lot DÉJÀ REMIS reste « retiré » : l''annuler réécrirait un fait');

select is(
  (select cancelled_reason from public.reward_issuances where code = 'GAIN-ANNUL333'),
  'annulé au comptoir',
  'une annulation déjà motivée garde SON motif — le premier est toujours le plus précis');

select results_eq(
  $$select cancelled_at is not null, wallet_status
      from public.reward_issuances where code = 'GAIN-REVOK444'$$,
  $$values (true, 'revoked'::text)$$,
  'un laissez-passer déjà révoqué n''est pas re-révoqué, mais le lot est bien annulé');

-- ══ 4. Ce que la caisse en dit ══════════════════════════════
-- Sans marquage, le registre rendait `source_missing` (la RPC legacy ne trouve
-- plus rien). Avec lui, l'état est lu AVANT toute route legacy.
select results_eq(
  $$select state, redeemed_now
      from public.redeem_reward_by_code(
        'da000000-0000-4000-8000-000000000001',
        'GAIN-ACTIF111',
        'da000000-0000-4000-8000-00000000a001')$$,
  $$values ('cancelled'::text, false)$$,
  'le comptoir a de quoi dire « Ce lot a été annulé » au lieu d''un refus muet');

-- ══ 5. Seconde famille, cascade à DEUX niveaux ══════════════
-- La chasse ne descend pas directement vers `hunt_completions` : elle passe
-- par `hunt_players`. Le trigger est posé sur la table qui porte le code, donc
-- il suit la cascade quel que soit l'étage supprimé.
insert into public.hunts (id, organization_id, name, status, reward_label) values
  ('da000000-0000-4000-8000-000000000040',
   'da000000-0000-4000-8000-000000000001', 'Chasse supprimée', 'active', 'Trophée');
insert into public.hunt_players (id, hunt_id, organization_id, token_hash) values
  ('da000000-0000-4000-8000-000000000041',
   'da000000-0000-4000-8000-000000000040',
   'da000000-0000-4000-8000-000000000001', repeat('e5', 32));
insert into public.hunt_completions (
  id, hunt_id, organization_id, player_id, code
) values (
  'da000000-0000-4000-8000-000000000042',
  'da000000-0000-4000-8000-000000000040',
  'da000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000041', 'CHASSE-ABCD2345');

select is(
  (select cancelled_at from public.reward_issuances where code = 'CHASSE-ABCD2345'),
  null::timestamptz, 'le lot de chasse est encaissable avant la suppression');

delete from public.hunts where id = 'da000000-0000-4000-8000-000000000040';

select results_eq(
  $$select count(*)::bigint, bool_and(cancelled_at is not null)
      from public.reward_issuances where code = 'CHASSE-ABCD2345'$$,
  $$values (1::bigint, true)$$,
  'une cascade à deux niveaux annule aussi, et sans détruire');

-- ══ 6. Rien ne réactive la ligne marquée ════════════════════
-- `sync_reward_issuance` est le SEUL appelant de l'upsert qui remettrait
-- `cancelled_at` à la valeur de la source. Rejoué sur une source morte, il
-- doit non seulement laisser l'annulation en place, mais n'écrire RIEN.
create temporary table tap_avant_resync on commit drop as
  select updated_at from public.reward_issuances where code = 'GAIN-ACTIF111';

select lives_ok(
  $$select public.sync_reward_issuance(
      'participations', 'da000000-0000-4000-8000-000000000101')$$,
  'rejouer la synchro sur une source morte ne lève pas');

select results_eq(
  $$select r.cancelled_at is not null, r.updated_at = a.updated_at
      from public.reward_issuances r, tap_avant_resync a
     where r.code = 'GAIN-ACTIF111'$$,
  $$values (true, true)$$,
  'la synchro rejouée ne réactive pas le lot — et n''écrit rien du tout');

-- ══ 7. La CAUSE est nommée, et la cloison d'organisation ════
-- Le portefeuille rend une cause NORMALISÉE, jamais `cancelled_reason` — ce
-- champ est du texte libre saisi par le commerçant, qu'on ne publie pas sur
-- l'écran du client.
select is(
  (select cancelled_cause from public.player_wallet(repeat('7c', 32), 50)
    where code = 'GAIN-ACTIF111'),
  'source_deleted',
  'le geste du commerçant est nommé comme tel au portefeuille');

-- Cloison d'organisation (FAIBLE 3). Elle ne peut pas être prouvée par une
-- collision réelle : `reward_issuances_source_unique` porte
-- `(source_type, source_id)` SANS l'organisation, donc deux lignes de deux
-- organisations ne peuvent pas partager un `source_id`. L'assertion est donc
-- structurelle, et c'est la seule honnête — le durcissement vise le jour où
-- `reward_issuances.organization_id` se désynchronise de l'organisation de la
-- ligne source, écart déjà constaté dans ce dépôt sur `contest_awards`.
-- `alike` et non `like` : pgTAP nomme ainsi son assertion de motif LIKE parce
-- que `like` est un mot réservé du SQL — appelé tel quel, il ne rend pas un
-- rouge mais TUE le fichier (« function like(text, unknown, unknown) does not
-- exist »), donc onze assertions non jouées derrière un plan incomplet.
select alike(
  pg_get_functiondef(
    'public.cancel_reward_issuance_on_source_delete()'::regprocedure),
  '%ri.organization_id = old.organization_id%',
  'le marquage est scopé à l''organisation de la ligne source');

-- ══ 8. La rétention ne parle PAS au nom du commerçant ═══════
-- Le cas que la première rédaction de 20260902120000 confondait avec le geste
-- d'entretien : `purge_expired_hunt_players` supprime la ligne joueur sur le
-- SEUL critère d'âge, la cascade emporte `hunt_completions`, et le trigger
-- s'arme. Personne n'a rien annulé — le client détient toujours son code.
insert into public.hunts (id, organization_id, name, status, reward_label) values
  ('da000000-0000-4000-8000-000000000050',
   'da000000-0000-4000-8000-000000000001', 'Chasse purgée', 'active', 'Médaille');

-- Le joueur est ponté sur LE MÊME appareil qu'Alice : c'est ce qui met le lot
-- dans son portefeuille, donc ce qui rend la cause LISIBLE PAR LE CLIENT.
-- Sans ce pont, on ne prouverait que l'état en base, pas ce qu'il lit.
select is(
  (select count(*) from public.resolve_player_identity(
     repeat('7c', 32), 'da000000-0000-4000-8000-000000000001',
     'hunt', 'da000000-0000-4000-8000-000000000050',
     repeat('f5', 32), 'direct', null)),
  1::bigint, 'le joueur de la chasse purgée partage l''appareil d''Alice');

-- Antériorité : au-delà des 12 mois de rétention par défaut de l'organisation
-- (00019:18 — jamais renseignée sur cette fixture, donc c'est bien le défaut
-- qui s'applique, comme chez tout commerçant).
insert into public.hunt_players (
  id, hunt_id, organization_id, token_hash, created_at
) values (
  'da000000-0000-4000-8000-000000000051',
  'da000000-0000-4000-8000-000000000050',
  'da000000-0000-4000-8000-000000000001',
  repeat('f5', 32), now() - interval '20 months');

insert into public.hunt_completions (
  id, hunt_id, organization_id, player_id, code
) values (
  'da000000-0000-4000-8000-000000000052',
  'da000000-0000-4000-8000-000000000050',
  'da000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000051', 'CHASSE-PURG2345');

-- LA PRÉMISSE : sans elle, « survit à la purge » ne prouverait rien — une
-- ligne jamais encaissable survivrait tout aussi bien.
select is(
  (select status from public.player_wallet(repeat('7c', 32), 50)
    where code = 'CHASSE-PURG2345'),
  'active',
  'AVANT la purge, le client lit « à retirer » sur son lot de chasse');

select lives_ok(
  $$select public.purge_expired_hunt_players()$$,
  'la purge de rétention du module chasse s''exécute');

select is(
  (select count(*) from public.hunt_completions
    where code = 'CHASSE-PURG2345'),
  0::bigint,
  'la cascade de la purge a bien emporté la ligne source');

-- LE POINT DE BASCULE. Le motif distingue la rétention du geste humain.
select results_eq(
  $$select cancelled_at is not null, cancelled_reason
      from public.reward_issuances where code = 'CHASSE-PURG2345'$$,
  $$values (true, 'source purgée'::text)$$,
  'la rétention nomme SA cause, et n''emprunte pas celle du commerçant');

-- MOYEN 2, vu depuis l'écran : le caissier et le client ne doivent pas lire
-- que le commerçant a supprimé l'opération, parce qu'il n'a rien fait.
select results_eq(
  $$select status, cancelled_cause
      from public.player_wallet(repeat('7c', 32), 50)
     where code = 'CHASSE-PURG2345'$$,
  $$values ('cancelled'::text, 'purged'::text)$$,
  'le client lit une cause AUTOMATIQUE, jamais un geste imputé au commerçant');

-- ══ 9. La purge du registre : deux issues opposées ══════════
-- Un seul passage de `purge_expired_reward_issuances`, trois sorts distincts.
-- C'est la propagation de suppression que 20260810120000 déclarait manquante,
-- MAIS bornée : une annulation ne vaut « terminé » que si elle a été DÉCIDÉE.
insert into public.reward_issuances (
  organization_id, source_type, source_id, code, label, issued_at
) values (
  'da000000-0000-4000-8000-000000000001',
  'wheel', 'da000000-0000-4000-8000-0000000001ff', 'GAIN-VIEUX55',
  'Lot ancien encore dû', now() - interval '20 months');

update public.reward_issuances set issued_at = now() - interval '20 months'
 where code in ('GAIN-ACTIF111', 'CHASSE-ABCD2345', 'CHASSE-PURG2345');

select lives_ok(
  $$select public.purge_expired_reward_issuances()$$,
  'la purge de rétention du registre s''exécute');

select is(
  (select count(*) from public.reward_issuances
    where code in ('GAIN-ACTIF111', 'CHASSE-ABCD2345')),
  0::bigint,
  'les lots annulés par un GESTE du commerçant sont purgeables à l''échéance');

-- LE CŒUR DE MOYEN 1. Avant correction, cette ligne était détruite la nuit
-- même où la rétention emportait sa source — alors qu'elle était protégée À VIE
-- avant que le trigger n'existe. Sept familles sur neuf n'ayant AUCUNE
-- expiration, rien d'autre ne l'aurait jamais close.
select is(
  (select count(*) from public.reward_issuances where code = 'CHASSE-PURG2345'),
  1::bigint,
  'un lot ENCORE DÛ dont la rétention a emporté la source n''est PAS détruit');

-- Contrôle de portée : la règle de 20260810120000 tient toujours. Un lot
-- ENCORE DÛ survit à sa rétention — le perdre transformerait une purge de
-- confidentialité en perte de valeur pour le client qui détient le code.
select is(
  (select count(*) from public.reward_issuances where code = 'GAIN-VIEUX55'),
  1::bigint,
  'un lot encore encaissable survit à sa rétention, marquage ou pas');

select * from finish();
rollback;
