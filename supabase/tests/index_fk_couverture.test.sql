-- ============================================================
-- COUVERTURE D'INDEX DES CLÉS ÉTRANGÈRES (IDX-1, wagon 4)
--
-- Postgres crée un index pour une clé PRIMAIRE ou une contrainte UNIQUE,
-- jamais pour une clé ÉTRANGÈRE. La colonne qui référence est donc nue par
-- défaut, et deux chemins très ordinaires y balaient alors la table entière :
-- le `on delete cascade` du parent, et le `count(*) … where fk = …` d'un
-- tableau de bord.
--
-- ── CE QUE CE FICHIER NE PROUVE PAS ──
--
-- Aucun gain de performance. Rien n'a été mesuré — ni EXPLAIN, ni benchmark —
-- et l'audit dont ce constat est issu le dit lui-même (angle mort 4). Ce
-- fichier prouve une SEULE chose : les six index existent et portent le nom
-- sous lequel les migrations les désignent. C'est une garde de non-régression,
-- pas une preuve de rapidité, et personne ne doit lui faire dire autre chose.
--
-- ── POURQUOI SIX, ET PAS TRENTE-HUIT ──
--
-- L'audit annonçait « 38 FK sans index de tête ». Ce recensement n'a pas été
-- rejoué, et sa seule désignation contrôlée s'est révélée FAUSSE :
-- `contest_awards.contest_id` est servi par `unique (contest_id, rank)`
-- (20260721150000:531). Les six colonnes ci-dessous ont été lues une par une
-- dans les migrations qui les créent ; élargir au-delà serait une décision de
-- périmètre déguisée en évidence.
--
-- ── POURQUOI UN FICHIER À PART ──
--
-- Le sujet n'est pas le contrôle d'accès : ces index ne gardent rien et
-- n'isolent aucun tenant. Les mettre dans `security_acl.test.sql` mêlerait deux
-- lectures qui n'ont pas la même raison de rougir.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- ── `spins` : deux FK sur quatre index, aucune servie ────────
-- Les quatre index de la table portent sur (wheel_id, player_key, created_at),
-- (organization_id), (wheel_id, player_key, play_window_key) et
-- (idempotency_key). `campaign_id` est pourtant le chemin d'`org_campaign_stats`
-- (00019:635-636), qui compte les tours de roue campagne par campagne à chaque
-- ouverture du tableau de bord.
select has_index('public', 'spins', 'spins_campaign_idx',
  'spins.campaign_id porte un index de tete (org_campaign_stats compte par campagne)');
select has_index('public', 'spins', 'spins_prize_idx',
  'spins.prize_id porte un index de tete (prizes on delete set null)');

-- ── `participations` : cinq index, aucun sur le lot ──────────
select has_index('public', 'participations', 'participations_prize_idx',
  'participations.prize_id porte un index de tete');

-- ── Pronostics : les trois FK réellement découvertes ─────────
-- `contest_awards` porte bien `unique (contest_id, player_id)`, mais son index
-- de tête est `contest_id` : rien ne mène de `player_id` vers la table, et
-- c'est pourtant par lui que cascade la suppression d'un joueur.
select has_index('public', 'contest_awards', 'contest_awards_player_idx',
  'contest_awards.player_id porte un index de tete (cascade contest_players)');
select has_index('public', 'contest_final_standings', 'contest_final_standings_player_idx',
  'contest_final_standings.player_id porte un index de tete');
-- Seule table du module à ne pas avoir eu son index d'organisation, quand
-- `contest_awards` a le sien depuis 20260721150000:539.
select has_index('public', 'contest_final_standings', 'contest_final_standings_org_idx',
  'contest_final_standings.organization_id porte un index de tete');

select * from finish();
rollback;
