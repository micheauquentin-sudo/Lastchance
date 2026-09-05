-- ============================================================
-- LES PSEUDOS DE PRONOSTICS DÉJÀ EN BASE — 20261205120000
--
-- CE QUE CE FICHIER DOIT PROUVER, ET DANS QUEL ORDRE
--
--  1. LA RÈGLE, sur la fonction qui l'incarne. `repair_player_alias` EST le
--     nettoyage : la migration ne fait que l'appliquer. On éprouve donc la
--     fonction, jamais une paraphrase — une garde qui redirait la règle
--     autrement resterait verte le jour où la règle change.
--  2. LA BASE AU REPOS. Aucune ligne de `contest_players` ne diffère de sa
--     forme réparée. C'est la seule assertion qui prouve que l'UPDATE de la
--     migration a réellement TOURNÉ, et pas seulement qu'il compile.
--  3. LA PORTE, sur les contraintes RÉELLES — celles que la migration a
--     posées, pas des jumelles recréées ici. 25 caractères et un caractère de
--     contrôle sont refusés ; 24 caractères propres passent.
--  4. LES LIGNES HISTORIQUES. Les contraintes tombent (DDL transactionnel,
--     tout est annulé au ROLLBACK), on sème du sale comme la production en
--     portait, et on rejoue l'UPDATE de la migration sur ces lignes.
--
-- ── POURQUOI LE CONTRE-EXEMPLE COMPTE AUTANT QUE LE CAS SALE ──
--
-- Un nettoyage qui renommerait TOUT LE MONDE en « Joueur xxxxxx » passerait
-- toutes les assertions « le sale est nettoyé ». AP-15 et AP-20 sont là pour
-- ça : « Jean-Luc » reste « Jean-Luc », et un pseudo de 24 caractères propres
-- entre en base. Sans eux, ce fichier verdirait sur une fonctionnalité
-- détruite.
--
-- ── CE QUE CE FICHIER NE PROUVE PAS ──
--
-- Rien sur la projection en lecture TypeScript : c'est la troisième couche,
-- gardée par `src/lib/pronostics-alias-public.test.tsx`. Ici, la base.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ════════════════════════════════════════════════════════════
-- 1. LA RÈGLE — `sanitize_player_alias` et `repair_player_alias`
-- ════════════════════════════════════════════════════════════

-- U+202E RIGHT-TO-LEFT OVERRIDE : celui qui inversait l'affichage du
-- classement public et permettait d'imiter le pseudo d'un autre joueur.
select is(
  public.sanitize_player_alias('Cam' || chr(8238) || 'ille'),
  'Camille',
  'AP-1 · le codet bidirectionnel est RETIRÉ, le pseudo reste lisible'
);

select is(
  public.sanitize_player_alias('Jean-Luc'),
  'Jean-Luc',
  'AP-2 · un pseudo légitime traverse le nettoyeur inchangé'
);

-- Les contrôles deviennent des ESPACES, jamais rien : « Jean<LF>Luc » est deux
-- mots, et les recoller en « JeanLuc » changerait le pseudo au lieu de le
-- nettoyer.
select is(
  public.sanitize_player_alias('Jean' || chr(10) || 'Luc'),
  'Jean Luc',
  'AP-3 · un saut de ligne devient une espace, il ne recolle pas les mots'
);

select is(
  public.sanitize_player_alias('  Jean   Luc  '),
  'Jean Luc',
  'AP-4 · bords rognés et espaces internes repliés (formateur partagé)'
);

select is(
  public.sanitize_player_alias(repeat('a', 30)),
  repeat('a', 24),
  'AP-5 · au-delà de 24 le pseudo est tronqué, pas rejeté'
);

select is(
  public.sanitize_player_alias(chr(8203) || chr(65279) || chr(8206)),
  '',
  'AP-6 · un pseudo entièrement invisible ne laisse rien'
);

select is(
  public.sanitize_player_alias(null),
  '',
  'AP-7 · null ne fait pas exploser le nettoyeur'
);

-- Le lien entre les deux fonctions, et la raison d'être de la liste de codets
-- recopiée à l'identique : ce que le nettoyeur laisse passer, le filtre doit
-- l'accepter. Sans cette assertion, les deux listes pourraient diverger et
-- tout pseudo « nettoyé » retomberait silencieusement sur l'alias neutre.
select ok(
  public.player_alias_is_allowed(
    public.sanitize_player_alias('Cam' || chr(8238) || 'ille' || chr(8203))
  ),
  'AP-8 · la forme nettoyée est ACCEPTÉE par player_alias_is_allowed'
);

select is(
  public.repair_player_alias('Cam' || chr(8238) || 'ille',
                             'd3c00000-0000-4000-8000-000000000003'),
  'Camille',
  'AP-9 · réparable : on garde le pseudo du joueur, on ne le renomme pas'
);

-- L'alias neutre est DÉRIVÉ de l'identifiant de la ligne : six hexadécimaux,
-- que le test recompose pour prouver qu'il ne s'agit pas d'un mot fixe.
select is(
  public.repair_player_alias(chr(8203), 'd3c00000-0000-4000-8000-000000000003'),
  'Joueur d3c000',
  'AP-10 · irréparable : alias neutre dérivé de l''identifiant de la ligne'
);

select is(
  public.repair_player_alias(chr(8203), 'd3c00000-0000-4000-8000-000000000003'),
  public.repair_player_alias(chr(8203), 'd3c00000-0000-4000-8000-000000000003'),
  'AP-11 · STABLE : deux exécutions rendent le même pseudo'
);

-- Le pendant d'AP-11, et le seul qui distingue « stable » de « constant » :
-- une fonction qui rendrait toujours le même mot passerait AP-11.
select isnt(
  public.repair_player_alias(chr(8203), 'd3c00000-0000-4000-8000-000000000003'),
  public.repair_player_alias(chr(8203), 'd5e00000-0000-4000-8000-000000000005'),
  'AP-12 · deux lignes différentes reçoivent deux alias neutres différents'
);

select ok(
  public.player_alias_is_allowed(
    public.repair_player_alias(chr(8203), 'd5e00000-0000-4000-8000-000000000005')
  ),
  'AP-13 · l''alias neutre passe lui-même le filtre (aucun mot bloqué en hexa)'
);

-- Une injure est NETTOYABLE au sens des caractères, mais reste refusée par le
-- filtre : la troncature ne la sauve pas, elle bascule sur le neutre.
select is(
  public.repair_player_alias('Connard', 'd5e00000-0000-4000-8000-000000000005'),
  'Joueur d5e000',
  'AP-14 · un pseudo refusé pour son SENS bascule aussi sur le neutre'
);

-- `immutable` n'est pas cosmétique : c'est ce qui autorise l'appel depuis un
-- CHECK et depuis un index. Un `random()` glissé dans le neutre rendrait la
-- fonction volatile ET l'alias instable — deux défauts pour un.
select is(
  (select p.provolatile
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'repair_player_alias'),
  'i'::"char",
  'AP-15 · repair_player_alias est IMMUTABLE'
);

-- ════════════════════════════════════════════════════════════
-- 2. LA BASE AU REPOS — la migration a bien tourné
-- ════════════════════════════════════════════════════════════
--
-- Posée AVANT toute fixture de ce fichier, donc sur les seules lignes que la
-- migration puis le seed ont laissées.

select is(
  (select count(*)::int
     from public.contest_players p
    where p.first_name is distinct from public.repair_player_alias(p.first_name, p.id)),
  0,
  'AP-16 · aucune ligne rescapée : first_name est partout sa forme réparée'
);

-- ════════════════════════════════════════════════════════════
-- 3. LA PORTE — les contraintes RÉELLES de la migration
-- ════════════════════════════════════════════════════════════

insert into public.organizations (id, name, slug, addon_pronostics)
values ('d0000000-0000-4000-8000-000000000001', 'Test Alias', 'tap-alias', true);

insert into public.contests (id, organization_id, slug, name, competition_key, status)
values ('d0000000-0000-4000-8000-000000000002',
        'd0000000-0000-4000-8000-000000000001',
        'tap-alias', 'Championnat Alias', 'ligue1', 'active');

-- LE CONTRE-EXEMPLE D'ABORD. Une contrainte qui refuse tout passerait les
-- trois assertions suivantes ; celle-ci est la seule qui prouve que la porte
-- laisse encore entrer.
select lives_ok(
  $q$insert into public.contest_players
       (contest_id, organization_id, token_hash, first_name, accepted_terms)
     values ('d0000000-0000-4000-8000-000000000002',
             'd0000000-0000-4000-8000-000000000001',
             repeat('9', 64), repeat('a', 24), true)$q$,
  'AP-17 · 24 caractères propres entrent en base'
);

select throws_ok(
  $q$insert into public.contest_players
       (contest_id, organization_id, token_hash, first_name, accepted_terms)
     values ('d0000000-0000-4000-8000-000000000002',
             'd0000000-0000-4000-8000-000000000001',
             repeat('8', 64), repeat('a', 25), true)$q$,
  '23514', null,
  'AP-18 · 25 caractères sont refusés, là où 60 passaient'
);

-- Le caractère de CONTRÔLE : seule `contest_players_first_name_alias_check`
-- peut le refuser — la borne de longueur laisse évidemment passer 8 signes.
-- Cette assertion est donc celle qui rougit si la contrainte d'alias saute.
select throws_ok(
  $q$insert into public.contest_players
       (contest_id, organization_id, token_hash, first_name, accepted_terms)
     values ('d0000000-0000-4000-8000-000000000002',
             'd0000000-0000-4000-8000-000000000001',
             repeat('7', 64), 'Cam' || chr(7) || 'ille', true)$q$,
  '23514', null,
  'AP-19 · un caractère de contrôle est refusé à l''écriture'
);

select throws_ok(
  $q$insert into public.contest_players
       (contest_id, organization_id, token_hash, first_name, accepted_terms)
     values ('d0000000-0000-4000-8000-000000000002',
             'd0000000-0000-4000-8000-000000000001',
             repeat('6', 64), 'Cam' || chr(8238) || 'ille', true)$q$,
  '23514', null,
  'AP-20 · U+202E est refusé à l''écriture'
);

select throws_ok(
  $q$insert into public.contest_players
       (contest_id, organization_id, token_hash, first_name, accepted_terms)
     values ('d0000000-0000-4000-8000-000000000002',
             'd0000000-0000-4000-8000-000000000001',
             repeat('5', 64), '', true)$q$,
  '23514', null,
  'AP-21 · le pseudo vide, valeur par DÉFAUT de la colonne, est refusé'
);

-- La borne elle-même, au catalogue. Sans cette assertion, revenir de 24 à 60
-- ne rougirait NULLE PART : la contrainte d'alias refuserait toujours les 25
-- caractères d'AP-18, et le retour en arrière passerait inaperçu.
select ok(
  (select pg_catalog.pg_get_constraintdef(c.oid)
     from pg_catalog.pg_constraint c
     join pg_catalog.pg_class t on t.oid = c.conrelid
     join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'contest_players'
      and c.conname = 'contest_players_identity_length_check') like '%24%',
  'AP-22 · la contrainte de longueur borne first_name à 24'
);

select ok(
  (select pg_catalog.pg_get_constraintdef(c.oid)
     from pg_catalog.pg_constraint c
     join pg_catalog.pg_class t on t.oid = c.conrelid
     join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'contest_players'
      and c.conname = 'contest_players_identity_length_check') not like '%60%',
  'AP-23 · et plus à 60'
);

-- `convalidated` : une contrainte `not valid` jamais validée n'aurait rien
-- éprouvé des lignes existantes — elle ne garderait que l'avenir.
select ok(
  (select bool_and(c.convalidated)
     from pg_catalog.pg_constraint c
     join pg_catalog.pg_class t on t.oid = c.conrelid
     join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'contest_players'
      and c.conname in ('contest_players_identity_length_check',
                        'contest_players_first_name_alias_check')),
  'AP-24 · les deux contraintes sont VALIDÉES, pas seulement posées'
);

select is(
  (select count(*)::int
     from pg_catalog.pg_constraint c
     join pg_catalog.pg_class t on t.oid = c.conrelid
     join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'contest_players'
      and c.conname = 'contest_players_first_name_alias_check'),
  1,
  'AP-25 · la contrainte d''alias existe bien sous son nom'
);

-- ════════════════════════════════════════════════════════════
-- 4. LES LIGNES HISTORIQUES — l'UPDATE de la migration, rejoué
-- ════════════════════════════════════════════════════════════
--
-- Les contraintes tombent ICI et pas plus haut : tout ce qui précède les
-- éprouve en place. Le DDL est transactionnel, le ROLLBACK final les rend.
-- C'est le seul moyen de semer ce que la production portait AVANT la
-- migration — la porte, désormais, l'interdit.

alter table public.contest_players
  drop constraint contest_players_identity_length_check;
alter table public.contest_players
  drop constraint contest_players_first_name_alias_check;

insert into public.contest_players
  (id, contest_id, organization_id, token_hash, first_name, accepted_terms)
values
  -- Le cas du lot : un RIGHT-TO-LEFT OVERRIDE au milieu du pseudo.
  ('d1a00000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
   'd0000000-0000-4000-8000-000000000001', repeat('1', 64),
   'Cam' || chr(8238) || 'ille', true),
  -- LE CONTRE-EXEMPLE : rien à nettoyer, rien ne doit bouger.
  ('d2b00000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002',
   'd0000000-0000-4000-8000-000000000001', repeat('2', 64), 'Jean-Luc', true),
  -- Entièrement invisible : ne laisse rien, donc bascule sur le neutre.
  ('d3c00000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002',
   'd0000000-0000-4000-8000-000000000001', repeat('3', 64),
   chr(8203) || chr(65279), true),
  -- Trente caractères : la borne d'avant en laissait passer soixante.
  ('d4d00000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000002',
   'd0000000-0000-4000-8000-000000000001', repeat('4', 64), repeat('z', 30), true),
  -- Refusé pour son sens, pas pour ses caractères.
  ('d5e00000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000002',
   'd0000000-0000-4000-8000-000000000001', repeat('0', 64), 'Connard', true);

-- L'UPDATE de la migration, à l'identique.
update public.contest_players p
   set first_name = public.repair_player_alias(p.first_name, p.id)
 where p.first_name is distinct from public.repair_player_alias(p.first_name, p.id);

select is(
  (select first_name from public.contest_players
    where id = 'd1a00000-0000-4000-8000-000000000001'),
  'Camille',
  'AP-26 · la ligne portant U+202E est nettoyée, et reste « Camille »'
);

select is(
  (select first_name from public.contest_players
    where id = 'd2b00000-0000-4000-8000-000000000002'),
  'Jean-Luc',
  'AP-27 · le pseudo légitime est INCHANGÉ'
);

select is(
  (select first_name from public.contest_players
    where id = 'd3c00000-0000-4000-8000-000000000003'),
  'Joueur d3c000',
  'AP-28 · la ligne devenue vide reçoit l''alias neutre stable de son id'
);

select is(
  (select first_name from public.contest_players
    where id = 'd4d00000-0000-4000-8000-000000000004'),
  repeat('z', 24),
  'AP-29 · les trente caractères sont tronqués à 24, pas remplacés'
);

select is(
  (select first_name from public.contest_players
    where id = 'd5e00000-0000-4000-8000-000000000005'),
  'Joueur d5e000',
  'AP-30 · l''injure bascule sur le neutre de SA ligne, pas sur celui d''une autre'
);

-- Le nettoyage doit être un point fixe : le rejouer sur une base déjà propre
-- ne doit toucher personne. Sans ça, chaque déploiement renommerait des
-- joueurs — et la contrainte, elle, ne s'en apercevrait pas.
update public.contest_players p
   set first_name = public.repair_player_alias(p.first_name, p.id)
 where p.first_name is distinct from public.repair_player_alias(p.first_name, p.id);

select is(
  (select count(*)::int
     from public.contest_players p
    where p.first_name is distinct from public.repair_player_alias(p.first_name, p.id)),
  0,
  'AP-31 · le nettoyage est idempotent : le rejouer ne bouge plus rien'
);

-- Et le résultat entre bien par la porte : les lignes réparées satisfont la
-- contrainte qu'on vient de retirer pour pouvoir les semer.
select is(
  (select count(*)::int
     from public.contest_players p
    where not public.player_alias_is_allowed(p.first_name)),
  0,
  'AP-32 · toutes les lignes réparées passent player_alias_is_allowed'
);

select * from finish();
rollback;
