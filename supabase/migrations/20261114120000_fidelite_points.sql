-- ============================================================
-- FID-2a — LA FIDÉLITÉ PASSE AUX POINTS (côté base)
--
-- Le passeport comptait des VISITES et déclenchait des paliers à un SEUIL :
-- à la 5ᵉ visite, le café tombait tout seul. Il compte désormais des POINTS,
-- et les points sont une MONNAIE : une visite en rapporte 100, un cadeau en
-- COÛTE N, débités quand le client l'échange. Le client repart avec le solde
-- restant et peut ré-accumuler — ce que le modèle à seuil ne savait pas faire,
-- puisqu'un palier franchi l'était pour toujours.
--
-- ── L'ARBITRAGE : DEUX COMPTEURS, ET POURQUOI ─────────────────
--
-- Ce n'est PAS une évidence, c'est un choix, et il se paie en colonnes.
--
-- Un solde de monnaie DESCEND. Si le niveau bronze/argent/or se lisait sur ce
-- solde, un client « or » redeviendrait « bronze » en encaissant son café —
-- puni d'avoir utilisé ce qu'il avait mérité. Le statut est une RECONNAISSANCE
-- de fidélité cumulée ; la monnaie est un POUVOIR D'ACHAT. Les confondre dans
-- un seul entier rend l'un des deux faux.
--
-- D'où deux compteurs sur loyalty_members :
--   · `points_balance`       — le solde dépensable. Monte de 100 par visite,
--                              descend de `cost_points` à chaque échange.
--   · `points_earned_total`  — le cumul gagné depuis toujours. Monte, ne
--                              descend JAMAIS. C'est LUI, et lui seul, qui
--                              porte bronze/argent/or.
--
-- `visit_count` RESTE et continue d'être incrémenté : il compte des visites,
-- ce qui garde un sens propre (« 12 passages ») et s'affiche tel quel. Il
-- n'est simplement plus l'assiette du niveau.
--
-- ── CE QUI REPART DE ZÉRO, ET CE QUI EST CONVERTI ─────────────
--
-- Décision du propriétaire, deux traitements OPPOSÉS et c'est voulu :
--
--   · LES CLIENTS repartent à zéro. Aucune reprise des visites existantes :
--     `points_balance` et `points_earned_total` naissent à 0 pour tout le
--     monde, y compris un habitué à 40 visites. CONSÉQUENCE À DIRE TOUT
--     HAUT : son `tier` retombera à 'bronze' au prochain tampon, puisque le
--     niveau se lit maintenant sur un cumul de points qui vaut 0. C'est le
--     prix accepté de la remise à plat. L'historique `loyalty_stamps` n'est
--     PAS touché — un recalcul rétroactif reste donc possible plus tard, et
--     c'est précisément pour ça qu'on n'y touche pas.
--
--   · LA CONFIGURATION DU COMMERÇANT, elle, est convertie ×100. Un palier à
--     5 visites devient 500 points, un seuil argent à 5 devient 500. Le
--     commerçant ne refait pas sa configuration.
--
-- ── CE LOT EST ADDITIF. LA PRODUCTION CONTINUE DE TOURNER ─────
--
-- `record_loyalty_stamp` CONTINUE d'émettre les récompenses au franchissement
-- des paliers, exactement comme aujourd'hui. C'est le lot suivant qui retirera
-- cette émission, quand l'écran saura échanger. La retirer ici laisserait le
-- passeport sans aucune récompense entre les deux lots.
--
-- Conséquence de la transition, et elle est dans le bon sens : le `not exists`
-- du franchissement regarde TOUTES les récompenses du palier, offertes comme
-- achetées. Un client qui achète son café avec ses points ne le recevra donc
-- pas une seconde fois en franchissant le seuil. Rien à modifier pour ça —
-- c'est le comportement du code existant, laissé mot pour mot.
--
-- ── LA SEULE CONTRAINTE RELÂCHÉE, ET SON REMPLAÇANT ───────────
--
-- `loyalty_rewards` portait `unique (member_id, milestone_id)` : « un palier
-- gagné une seule fois par passeport ». Cette règle est le modèle à SEUIL
-- écrit en SQL, et elle est incompatible avec une monnaie — un client qui
-- ré-accumule 500 points doit pouvoir racheter le même café.
--
-- Elle n'est pas supprimée, elle est RESTREINTE À SON CHEMIN D'ORIGINE :
-- l'index partiel `where request_id is null` la conserve mot pour mot pour les
-- récompenses ÉMISES PAR UN TAMPON (elles n'ont pas de `request_id`), et ne
-- dit plus rien des récompenses ACHETÉES (elles en ont un). Sur toutes les
-- lignes existantes, `request_id` est null : la garantie d'hier est donc
-- intacte sur la totalité des données d'hier.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 0. GARDE DE FILIATION — à lire AVANT de toucher à la fonction
--
-- `record_loyalty_stamp` est réécrite en entier plus bas, parce qu'une
-- fonction ne se modifie pas par morceaux. Le corps repris doit donc être
-- celui de sa DERNIÈRE définition, sinon ce fichier supprime en silence le
-- travail des migrations intermédiaires — c'est arrivé le 2026-08-23 sur
-- `org_has_module_access`, et il a fallu une migration de réparation.
--
-- LA DÉFINITION VIVANTE EST CELLE DE 20260915120000 (« QR de commande »),
-- signature à CINQ paramètres — PAS celle de 20260725200000, qui était la
-- dernière des trois réécritures de juillet mais que 20260915120000 a DROP-ée
-- puis recréée avec `p_order_token`. La garde ci-dessous vérifie exactement
-- ça : si le corps vivant ne parle pas de jeton de commande, il n'est pas
-- celui qu'on croit, et on refuse d'appliquer.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_src text;
begin
  select p.prosrc into strict v_src
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'record_loyalty_stamp';

  -- DÉJÀ POSÉE : rien à vérifier (motif de 20261026120000).
  if pg_catalog.strpos(v_src, 'points_earned_total') > 0 then
    return;
  end if;

  -- Les trois marqueurs du QR de commande. Leur absence signifie qu'une
  -- migration postérieure a réécrit la fonction autrement, et que le corps
  -- ci-dessous en supprimerait le travail.
  if pg_catalog.strpos(v_src, 'p_order_token') = 0
     or pg_catalog.strpos(v_src, 'order_invalid') = 0
     or pg_catalog.strpos(v_src, 'loyalty_order_codes') = 0
  then
    raise exception
      'record_loyalty_stamp ne porte pas le jeton de commande de 20260915120000 : la definition vivante n est pas celle attendue, et ce fichier en supprimerait le travail';
  end if;

  -- Le plancher économique de 20260725190000 doit lui aussi être présent : il
  -- a survécu au DROP de 20260915120000 parce que son corps était repris
  -- verbatim. S'il manque, la filiation est rompue plus haut dans la chaîne.
  if pg_catalog.strpos(v_src, 'is_new_member') = 0
     or pg_catalog.strpos(v_src, 'reward_claimed_count') = 0
  then
    raise exception
      'record_loyalty_stamp a perdu les verrous economiques de 20260725190000 : filiation rompue, application refusee';
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 1. LES SEUILS DE NIVEAU PASSENT EN POINTS (×100, en place)
--
-- Gardé par l'absence de `loyalty_members.points_balance` : c'est le marqueur
-- « cette migration n'a pas encore tourné ». Une conversion ×100 n'est pas
-- idempotente — la rejouer multiplierait par 10 000.
--
-- Les CHECK existants (`>= 1`, `gold > silver`) survivent à la conversion :
-- ils n'ont pas de borne haute, et ×100 préserve l'ordre strict.
-- ────────────────────────────────────────────────────────────

do $migration$
begin
  if exists (
    select 1
      from pg_catalog.pg_attribute a
     where a.attrelid = 'public.loyalty_members'::regclass
       and a.attname = 'points_balance'
       and not a.attisdropped
  ) then
    return;
  end if;

  update public.loyalty_programs
     set silver_threshold = silver_threshold * 100,
         gold_threshold = gold_threshold * 100;
end
$migration$;

-- LES DÉFAUTS AUSSI, et ce n'est pas un détail cosmétique. Ils valaient 5 et
-- 10 VISITES. Laissés tels quels, tout programme créé après cette migration
-- naîtrait avec un seuil or à 10 POINTS — c'est-à-dire OR dès le premier
-- tampon, qui en rapporte 100. Le niveau cesserait de vouloir dire quoi que ce
-- soit sur chaque nouveau programme, sans qu'aucune donnée existante ne soit
-- fausse : le genre de défaut qu'aucune relecture de ligne à ligne n'attrape.
alter table public.loyalty_programs
  alter column silver_threshold set default 500,
  alter column gold_threshold set default 1000;

comment on column public.loyalty_programs.silver_threshold is
  'Seuil du niveau ARGENT, en POINTS depuis FID-2a (100 points = 1 visite ; '
  'les valeurs existantes ont été converties ×100 par 20261114120000). Se lit '
  'sur loyalty_members.points_earned_total — le CUMUL gagné, jamais le solde : '
  'dépenser ses points ne fait pas perdre son niveau.';

comment on column public.loyalty_programs.gold_threshold is
  'Seuil du niveau OR, en POINTS depuis FID-2a (100 points = 1 visite ; '
  'valeurs existantes converties ×100 par 20261114120000). Se lit sur '
  'loyalty_members.points_earned_total, jamais sur points_balance.';


-- ────────────────────────────────────────────────────────────
-- 2. LES DEUX COMPTEURS DU MEMBRE
--
-- `default 0` et pas de reprise : c'est la décision, pas un oubli.
-- ────────────────────────────────────────────────────────────

alter table public.loyalty_members
  add column if not exists points_balance integer not null default 0
    check (points_balance >= 0),
  add column if not exists points_earned_total integer not null default 0
    check (points_earned_total >= 0);

comment on column public.loyalty_members.points_balance is
  'SOLDE dépensable, en points. +100 par visite (record_loyalty_stamp), '
  '−cost_points à chaque échange (spend_loyalty_points). MONTE ET DESCEND : '
  'ne jamais y lire un niveau. RPC-only — aucun droit d''écriture accordé à '
  'une session marchande.';

comment on column public.loyalty_members.points_earned_total is
  'CUMUL gagné depuis toujours, en points. +100 par visite, JAMAIS décrémenté '
  'par un échange. C''est l''assiette du niveau bronze/argent/or : sans ce '
  'second compteur, un client perdrait son statut « or » en encaissant son '
  'café. Reparti de zéro à FID-2a pour tous les passeports existants '
  '(loyalty_stamps reste intact, un recalcul rétroactif reste possible).';

comment on column public.loyalty_members.visit_count is
  'Nombre de VISITES validées. Toujours incrémenté par record_loyalty_stamp — '
  'il compte des passages, ce qui garde un sens et s''affiche. N''est PLUS '
  'l''assiette du niveau depuis FID-2a : voir points_earned_total.';


-- ────────────────────────────────────────────────────────────
-- 3. LE PRIX D'UN PALIER
--
-- Backfill `visit_count * 100` : c'est la conversion de la configuration du
-- commerçant, décidée plus haut. `where cost_points is null` rend le backfill
-- idempotent par construction.
--
-- L'unicité : `unique (program_id, visit_count)` existait pour que deux
-- paliers ne se déclenchent pas au même seuil. Le même besoin porte
-- maintenant sur le PRIX — deux cadeaux au même tarif seraient
-- indistinguables au moment de l'échange, et le client ne saurait pas lequel
-- il achète.
-- ────────────────────────────────────────────────────────────

alter table public.loyalty_milestones
  add column if not exists cost_points integer;

update public.loyalty_milestones
   set cost_points = visit_count * 100
 where cost_points is null;

-- ── POURQUOI PAS `set not null`, ET CE QUI LE REMPLACE ──
--
-- `not null` était l'intention, et il a fallu y renoncer pour une raison
-- mesurée, pas supposée : une colonne NOT NULL SANS DÉFAUT devient
-- OBLIGATOIRE dans le type `Insert` engendré par `supabase gen types`.
-- `npx tsc --noEmit` passe alors au rouge sur `src/actions/loyalty.ts:520`,
-- qui insère un palier sans prix — et chaque autre écrivain devrait fournir un
-- `cost_points` calculé en TypeScript, c'est-à-dire recopier la règle du ×100
-- hors de la base, juste avant le lot qui la rendra caduque.
--
-- Aucun défaut de colonne ne s'en sort non plus : une constante repricerait à
-- tort un palier configuré à 5 visites, et Postgres l'appliquerait AVANT le
-- trigger, qui ne verrait donc jamais de null à dériver.
--
-- CE DÉPÔT A DÉJÀ TRANCHÉ CE CAS EXACT, deux tables plus haut :
-- `loyalty_programs.rotating_secret` est NULLABLE avec, en commentaire
-- d'origine, « colonne laissée nullable pour une insertion sans ce champ (le
-- trigger garantit la présence en pratique) ». Même situation, même réponse.
--
-- La garantie n'est donc pas dans un `not null` : elle est dans le trigger
-- ci-dessous, qui remplit TOUTE valeur nulle — à l'insertion comme à la mise à
-- jour — et dans les assertions pgTAP qui le prouvent. Le lot qui apprendra à
-- l'éditeur à écrire un prix pourra, lui, poser le `not null` sans rien casser.
alter table public.loyalty_milestones
  drop constraint if exists loyalty_milestones_cost_points_check;
alter table public.loyalty_milestones
  add constraint loyalty_milestones_cost_points_check
    check (cost_points is null or cost_points >= 1);

create unique index if not exists loyalty_milestones_program_cost_idx
  on public.loyalty_milestones (program_id, cost_points);

comment on column public.loyalty_milestones.cost_points is
  'PRIX du palier, en points, débité du solde du client à l''échange. '
  'AUTORITÉ depuis FID-2a. Converti ×100 depuis visit_count à la migration. '
  'Nullable au niveau de la COLONNE seulement : le trigger '
  'loyalty_milestones_derive_cost remplit toute valeur nulle avant écriture — '
  'même choix que loyalty_programs.rotating_secret, et pour la même raison '
  '(une colonne NOT NULL sans défaut devient obligatoire dans le type Insert '
  'engendré, et casse tous les écrivains existants).';

comment on column public.loyalty_milestones.visit_count is
  'HISTORIQUE : nombre de visites qui DÉCLENCHAIT le palier dans le modèle à '
  'seuil. Conservé parce que record_loyalty_stamp s''en sert encore pendant la '
  'transition (l''émission au franchissement n''est retirée qu''au lot '
  'suivant), et parce qu''il reste l''unité que l''écran commerçant affiche. '
  'L''AUTORITÉ SUR LE PRIX EST cost_points, pas cette colonne.';

-- ── Le prix suit la configuration tant que l'écran parle en visites ──
--
-- TRANSITOIRE, et à retirer au lot qui apprend à l'écran à écrire un prix.
--
-- Sans ce trigger, `cost_points not null` casserait TOUT écrivain existant :
-- `src/actions/loyalty.ts` insère un palier sans ce champ, `supabase/seed.sql`
-- aussi, et `experience-relance.ts` recopie des paliers d'un programme à
-- l'autre. La production tomberait à l'application de cette migration, ce que
-- ce lot s'interdit.
--
-- Il fait DEUX choses, et rien d'autre :
--   · toute valeur NULLE — à l'insertion comme à la mise à jour — est
--     remplacée par `visit_count * 100`. C'est CE point qui remplace le
--     `not null` auquel on a renoncé plus haut : une ligne sans prix ne peut
--     pas exister, parce qu'elle est remplie avant d'être écrite.
--   · à la modification du nombre de visites SANS toucher au prix, refait la
--     même dérivation — sinon un palier passé de 5 à 10 visites resterait
--     facturé 500 points, et le commerçant n'aurait aucun moyen de le voir.
-- Dès que l'appelant fournit un prix explicite, le trigger ne fait plus rien.
create or replace function public.loyalty_milestones_derive_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cost_points is null then
    new.cost_points := new.visit_count * 100;
  elsif tg_op = 'UPDATE'
        and new.visit_count is distinct from old.visit_count
        and new.cost_points is not distinct from old.cost_points then
    new.cost_points := new.visit_count * 100;
  end if;
  return new;
end;
$$;

-- CREATE FUNCTION accorde l'EXECUTE à PUBLIC : le retirer tout de suite, sinon
-- l'audit générique de security_acl.test.sql rougit (même oubli que
-- 20260722160000 et 20260804120000 sur les fonctions trigger jumelles).
revoke all on function public.loyalty_milestones_derive_cost()
  from public, anon, authenticated;

comment on function public.loyalty_milestones_derive_cost() is
  'TRANSITOIRE (FID-2a) : dérive cost_points depuis visit_count × 100 tant que '
  'l''écran commerçant configure des visites et non des points. À retirer '
  'quand l''éditeur de programme écrira le prix lui-même.';

drop trigger if exists loyalty_milestones_derive_cost on public.loyalty_milestones;
create trigger loyalty_milestones_derive_cost
  before insert or update on public.loyalty_milestones
  for each row execute function public.loyalty_milestones_derive_cost();


-- ────────────────────────────────────────────────────────────
-- 4. LA RÉCOMPENSE ACHETÉE : IDEMPOTENCE ET PRIX PAYÉ
--
-- `request_id` : identifiant d'INTENTION fourni par l'appelant. Deux appels
-- qui le partagent sont le MÊME échange — un double-clic, un réseau qui
-- repart — et rendent la même récompense sans débiter deux fois. Sa présence
-- distingue aussi une récompense ACHETÉE (request_id non null) d'une
-- récompense OFFERTE par un tampon (request_id null), et c'est cette
-- distinction que l'index partiel plus bas exploite.
--
-- `spent_points` : le montant réellement débité, gravé sur la ligne. Sans lui,
-- un `cost_points` modifié par le commerçant rendrait impossible de dire ce
-- qui a été payé pour cette récompense-là.
-- ────────────────────────────────────────────────────────────

alter table public.loyalty_rewards
  add column if not exists request_id uuid,
  add column if not exists spent_points integer;

alter table public.loyalty_rewards
  drop constraint if exists loyalty_rewards_spend_pair_check;
alter table public.loyalty_rewards
  add constraint loyalty_rewards_spend_pair_check
    check (
      (request_id is null and spent_points is null)
      or (request_id is not null and spent_points >= 1)
    );

-- L'idempotence, en base et pas seulement dans le corps de la RPC : deux
-- transactions concurrentes portant le même request_id ne peuvent pas toutes
-- deux insérer. Le verrou du membre les sérialise déjà ; cet index est la
-- ceinture qui tient si le verrou est un jour déplacé.
create unique index if not exists loyalty_rewards_member_request_idx
  on public.loyalty_rewards (member_id, request_id)
  where request_id is not null;

-- ── La contrainte d'hier, restreinte à son chemin d'origine ──
--
-- `unique (member_id, milestone_id)` interdisait de gagner deux fois le même
-- palier. Dans un modèle de MONNAIE, racheter le même café est le
-- comportement NORMAL. On conserve la règle telle quelle pour les récompenses
-- offertes par un tampon (`request_id is null`) — toutes les lignes existantes
-- en font partie, la garantie d'hier est donc intacte sur les données
-- d'hier — et on la lève pour les récompenses achetées.
--
-- `record_loyalty_stamp` ne dépend PAS de cette contrainte pour éviter la
-- double émission : elle s'en garde par un `not exists` explicite, qui reste
-- en place et reste correct.
alter table public.loyalty_rewards
  drop constraint if exists loyalty_rewards_member_id_milestone_id_key;

create unique index if not exists loyalty_rewards_earned_once_idx
  on public.loyalty_rewards (member_id, milestone_id)
  where request_id is null;

comment on column public.loyalty_rewards.request_id is
  'Identifiant d''intention d''un ÉCHANGE (spend_loyalty_points). Null pour une '
  'récompense offerte au franchissement d''un palier. Rejouer le même '
  'request_id rend la même récompense sans second débit.';

comment on column public.loyalty_rewards.spent_points is
  'Points réellement débités pour cette récompense. Null quand elle a été '
  'offerte par un tampon. Gravé à l''émission : un cost_points modifié plus '
  'tard ne réécrit pas l''histoire.';


-- ────────────────────────────────────────────────────────────
-- 5. LES GRANTS — ET LA GARDE QUI PROUVE QU'ILS ONT PRIS
--
-- Sur ces tables les droits sont accordés COLONNE PAR COLONNE. Une colonne
-- neuve n'hérite de RIEN, et PostgREST refuse EN ENTIER un `select` qui touche
-- une colonne non accordée : l'écran ne se dégrade pas, il DISPARAÎT. Ce
-- dépôt a perdu six lots sur exactement ce défaut (20261112120000 raconte le
-- dernier), et un `grant` sans effet — mauvais rôle, colonne mal
-- orthographiée — ne lève pas : il passe, et la panne reste intacte pendant
-- que le fichier passe pour appliqué. D'où la garde.
--
-- CE QUI EST DÉJÀ COUVERT, ET POURQUOI :
--   · `loyalty_members` et `loyalty_rewards` portent un `grant select` de
--     TABLE (20260725120000:305-307). Un privilège de table couvre les
--     colonnes ajoutées ensuite : `points_balance`, `points_earned_total`,
--     `request_id` et `spent_points` sont donc lisibles sans rien ajouter.
--     La garde le VÉRIFIE quand même — c'est une propriété de Postgres, pas
--     une intention écrite dans ce fichier, et elle doit rester vraie.
--   · `loyalty_milestones` : `grant select, insert, delete` de TABLE couvre
--     la lecture et l'insertion de `cost_points`. Mais l'UPDATE y est
--     accordé colonne par colonne (20260725120000:301) : sans la ligne
--     ci-dessous, un commerçant pourrait créer un palier tarifé et ne jamais
--     pouvoir en corriger le prix.
-- ────────────────────────────────────────────────────────────

grant update (cost_points) on public.loyalty_milestones to authenticated;

do $migration$
begin
  -- Lecture des quatre colonnes neuves côté commerçant (dashboard, caisse).
  if not pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_members', 'points_balance', 'SELECT')
     or not pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_members', 'points_earned_total', 'SELECT')
  then
    raise exception
      'loyalty_members : les compteurs de points ne sont pas lisibles par authenticated — PostgREST refuserait le select ENTIER et la fiche client disparaitrait';
  end if;

  if not pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_rewards', 'request_id', 'SELECT')
     or not pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_rewards', 'spent_points', 'SELECT')
  then
    raise exception
      'loyalty_rewards : request_id / spent_points ne sont pas lisibles par authenticated — l historique des echanges disparaitrait de la caisse';
  end if;

  -- Le prix d'un palier se lit, s'insère ET se corrige.
  if not pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_milestones', 'cost_points', 'SELECT')
     or not pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_milestones', 'cost_points', 'INSERT')
     or not pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_milestones', 'cost_points', 'UPDATE')
  then
    raise exception
      'loyalty_milestones.cost_points n est pas lisible/inserable/modifiable par authenticated : l editeur de programme ne pourrait pas tarifer un palier';
  end if;

  -- Le service role écrit les compteurs : c'est lui qui porte les RPC.
  if not pg_catalog.has_column_privilege(
       'service_role', 'public.loyalty_members', 'points_balance', 'UPDATE')
     or not pg_catalog.has_column_privilege(
       'service_role', 'public.loyalty_rewards', 'request_id', 'INSERT')
  then
    raise exception
      'service_role ne peut pas ecrire les points : les deux RPC echoueraient a l execution';
  end if;

  -- ── CONTRÔLES NÉGATIFS ──
  --
  -- La monnaie est RPC-only. Si une session marchande pouvait écrire un
  -- solde, le commerçant — ou n'importe quel jeton d'éditeur volé —
  -- s'offrirait des points sans passer par un tampon, et `points_earned_total`
  -- cesserait d'être un cumul pour devenir une valeur déclarative.
  -- `loyalty_members` n'a qu'un `grant select` : rien ici n'ouvre d'écriture,
  -- et cette garde est là pour que ça reste vrai après le prochain fichier.
  if pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_members', 'points_balance', 'UPDATE')
     or pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_members', 'points_earned_total', 'UPDATE')
  then
    raise exception
      'loyalty_members : un compteur de points est devenu modifiable depuis une session — la monnaie ne serait plus gagnee, elle serait declaree';
  end if;

  -- Le prix payé est un fait historique, pas un champ de formulaire.
  if pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_rewards', 'spent_points', 'UPDATE')
     or pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_rewards', 'request_id', 'UPDATE')
  then
    raise exception
      'loyalty_rewards : spent_points ou request_id est devenu modifiable depuis une session — l historique des echanges serait reecrivable';
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 6. `record_loyalty_stamp` CRÉDITE LES POINTS
--
-- Corps repris VERBATIM de 20260915120000 (définition vivante, voir la garde
-- de filiation en section 0), TROIS changements et rien d'autre :
--
--   1. Le tampon crédite 100 points aux DEUX compteurs, en plus d'incrémenter
--      `visit_count` comme avant.
--   2. Le niveau se recalcule sur `points_earned_total` et non plus sur
--      `visit_count` — les deux branches, celle du tampon accepté ET celle du
--      cooldown (`too_soon`), qui recalculait elle aussi.
--   3. Les deux compteurs sont remontés dans la réponse jsonb, dans les deux
--      branches. AJOUT de clés uniquement : le contrat existant est intact,
--      et les appelants qui ne les lisent pas ne voient aucune différence.
--
-- CE QUI NE CHANGE PAS, ET C'EST DÉLIBÉRÉ : l'émission des récompenses au
-- franchissement des paliers reste là, à l'identique. C'est le lot suivant qui
-- la retire, quand l'écran saura échanger. La retirer ici priverait le
-- passeport de toute récompense entre les deux lots.
--
-- L'arité ne change pas : `create or replace` suffit, et il n'y a pas de
-- surcharge à laisser derrière (piège de 20260915120000).
-- ────────────────────────────────────────────────────────────

create or replace function public.record_loyalty_stamp(
  p_program_id uuid,
  p_member_token_hash text,
  p_rotating_code text default null,
  p_validated_by uuid default null,
  p_order_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.loyalty_programs%rowtype;
  v_member public.loyalty_members%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_code_in text;
  v_counter bigint;
  v_mac bytea;
  v_off integer;
  v_bin bigint;
  v_ok boolean;
  d integer;
  v_is_new boolean := false;
  v_new_count integer;
  v_tier text;
  v_reached jsonb := '[]'::jsonb;
  v_ms public.loyalty_milestones%rowtype;
  v_next_visit integer;
  v_next_type text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_grant text;
  v_bytes bytea;
  i integer;
  attempt integer;
  v_order_id uuid;
  v_by_order boolean := false;
  -- FID-2a : une visite vaut 100 points. Constante et non réglage — le prix
  -- des paliers est le seul curseur du commerçant, et deux curseurs pour un
  -- même arbitrage rendraient les conversions ×100 de cette migration fausses.
  v_points_per_visit constant integer := 100;
  v_new_balance integer;
  v_new_earned integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_member_token_hash is null or p_member_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member token';
  end if;

  -- Verrou sur le programme : fige réglages, stock des paliers et sérialise
  -- l'attribution des récompenses. Réponse 'unavailable' identique quel que
  -- soit le motif (addon coupé, brouillon, archivé) : pas d'oracle.
  select p.* into v_prog
    from public.loyalty_programs p
    join public.organizations o on o.id = p.organization_id
   where p.id = p_program_id
     and o.addon_loyalty
   for update of p;
  if not found or v_prog.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Validation selon l'entrée (AVANT toute création de passeport : une
  -- entrée refusée n'inscrit personne).
  if p_order_token is not null then
    -- QR de commande : consommation ATOMIQUE. `consumed_at is null` dans le
    -- WHERE est la clause qui interdit le second tampon — la relire avant
    -- d'y toucher, c'est elle qui tient la règle produit du §7.
    update public.loyalty_order_codes
       set consumed_at = v_now
     where token = p_order_token
       and program_id = v_prog.id
       and consumed_at is null
    returning id into v_order_id;
    if v_order_id is null then
      -- Inconnu, déjà servi, ou d'un autre programme : réponse unique.
      return pg_catalog.jsonb_build_object('state', 'order_invalid');
    end if;
    v_by_order := true;
  elsif v_prog.validation_mode = 'rotating_code' then
    v_code_in := pg_catalog.regexp_replace(coalesce(p_rotating_code, ''), '\D', '', 'g');
    if pg_catalog.length(v_code_in) <> 6 then
      return pg_catalog.jsonb_build_object('state', 'invalid_code');
    end if;
    v_counter := pg_catalog.floor(extract(epoch from v_now) / v_prog.rotating_period_seconds)::bigint;
    v_ok := false;
    -- Tolérance de DEUX fenêtres : la courante et la précédente (voir
    -- 20260725180000). La durée d'acceptation d'un code vaut donc
    -- 2 · rotating_period_seconds, bornée par le cooldown via
    -- loyalty_programs_cooldown_floor_check.
    for d in -1..0 loop
      v_mac := extensions.hmac(pg_catalog.int8send(v_counter + d), v_prog.rotating_secret, 'sha1');
      v_off := pg_catalog.get_byte(v_mac, 19) & 15;
      v_bin := ((pg_catalog.get_byte(v_mac, v_off) & 127)::bigint * 16777216)
             + (pg_catalog.get_byte(v_mac, v_off + 1)::bigint * 65536)
             + (pg_catalog.get_byte(v_mac, v_off + 2)::bigint * 256)
             + (pg_catalog.get_byte(v_mac, v_off + 3)::bigint);
      if pg_catalog.lpad((v_bin % 1000000)::text, 6, '0') = v_code_in then
        v_ok := true;
        exit;
      end if;
    end loop;
    if not v_ok then
      return pg_catalog.jsonb_build_object('state', 'invalid_code');
    end if;
  else
    -- Mode staff : l'appelant DOIT fournir l'identité du validateur
    -- (l'action backend l'a authentifié comme membre autorisé). Ferme le
    -- chemin public (p_validated_by null) sur un programme staff.
    if p_validated_by is null then
      return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;
  end if;

  -- Passeport créé à la première visite (aucune PII). FOUND immédiatement
  -- après l'INSERT distingue la CRÉATION (1 ligne affectée) du simple accès à
  -- un passeport existant (conflit → 0 ligne) : source de vérité de
  -- `is_new_member`.
  insert into public.loyalty_members (program_id, organization_id, token_hash)
  values (v_prog.id, v_prog.organization_id, p_member_token_hash)
  on conflict (program_id, token_hash) do nothing;
  v_is_new := found;

  select m.* into v_member
    from public.loyalty_members m
   where m.program_id = v_prog.id and m.token_hash = p_member_token_hash
   for update;

  -- Traçabilité du jeton de commande : le passeport vient peut-être de
  -- naître, son id n'existait pas à la consommation. Le verrou reste
  -- `consumed_at`, posé plus haut — ceci n'est qu'un lien.
  if v_by_order then
    update public.loyalty_order_codes
       set consumed_member_id = v_member.id
     where id = v_order_id;
  end if;

  -- Cooldown depuis le dernier tampon (anti-abus) — SAUF par jeton de
  -- commande : deux commandes le même jour sont deux visites légitimes, et
  -- l'usage unique du jeton tient déjà l'anti-abus (en-tête de migration).
  if not v_by_order
     and v_member.last_stamp_at is not null
     and v_prog.min_stamp_interval_seconds > 0
     and v_member.last_stamp_at
         + pg_catalog.make_interval(secs => v_prog.min_stamp_interval_seconds) > v_now then
    return pg_catalog.jsonb_build_object(
      'state', 'too_soon',
      'retry_in_seconds', pg_catalog.ceil(extract(epoch from
        v_member.last_stamp_at
        + pg_catalog.make_interval(secs => v_prog.min_stamp_interval_seconds)
        - v_now))::integer,
      'program', pg_catalog.jsonb_build_object(
        'id', v_prog.id, 'name', v_prog.name,
        'validation_mode', v_prog.validation_mode),
      'visit_count', v_member.visit_count,
      'points_balance', v_member.points_balance,
      'points_earned_total', v_member.points_earned_total,
      'is_new_member', v_is_new,
      -- FID-2a : le niveau se lit sur le CUMUL, jamais sur le solde.
      'tier', case
        when v_member.points_earned_total >= v_prog.gold_threshold then 'gold'
        when v_member.points_earned_total >= v_prog.silver_threshold then 'silver'
        else 'bronze' end,
      'tier_thresholds', pg_catalog.jsonb_build_object(
        'silver', v_prog.silver_threshold, 'gold', v_prog.gold_threshold)
    );
  end if;

  -- Visite validée : incrément des visites, CRÉDIT des points, recalcul du
  -- niveau sur le cumul, puis tampon.
  v_new_count := v_member.visit_count + 1;
  v_new_balance := v_member.points_balance + v_points_per_visit;
  v_new_earned := v_member.points_earned_total + v_points_per_visit;
  v_tier := case
    when v_new_earned >= v_prog.gold_threshold then 'gold'
    when v_new_earned >= v_prog.silver_threshold then 'silver'
    else 'bronze' end;
  update public.loyalty_members
     set visit_count = v_new_count,
         points_balance = v_new_balance,
         points_earned_total = v_new_earned,
         last_stamp_at = v_now,
         tier = v_tier
   where id = v_member.id;
  insert into public.loyalty_stamps
    (member_id, program_id, organization_id, stamped_at, mode, validated_by)
  values (v_member.id, v_prog.id, v_prog.organization_id, v_now,
          case when v_by_order then 'order_code' else v_prog.validation_mode end,
          p_validated_by);

  -- Paliers nouvellement atteints (visit_count <= total ET pas déjà gagnés).
  -- Sous le verrou du programme : l'attribution (stock + code/grant) est
  -- sérialisée, sans double émission. Le plancher visit_count >= 2 garantit
  -- qu'un premier tampon (v_new_count = 1) ne sélectionne jamais rien.
  --
  -- FID-2a : ce bloc est CONSERVÉ MOT POUR MOT, `not exists` compris. Il
  -- regarde TOUTES les récompenses du palier, offertes comme achetées — donc
  -- un client qui a déjà acheté son café avec ses points ne le recevra pas une
  -- seconde fois au franchissement. C'est le comportement le moins coûteux
  -- pour le commerçant, et il ne demande aucune modification ici.
  for v_ms in
    select ms.* from public.loyalty_milestones ms
     where ms.program_id = v_prog.id
       and ms.visit_count <= v_new_count
       and not exists (
         select 1 from public.loyalty_rewards r
          where r.member_id = v_member.id and r.milestone_id = ms.id
       )
     order by ms.visit_count
  loop
    -- Rupture de stock — COMMUNE aux deux types de palier. Un lot épuisé
    -- n'émet pas de code, un palier spin épuisé n'émet pas de tour offert :
    -- dans les deux cas le palier est signalé, aucune récompense n'est créée
    -- (échec propre), et le passeport supplémentaire ne rapporte plus rien.
    -- C'est ce qui donne au stock choisi par le commerçant la valeur de
    -- PLAFOND DE PERTE annoncée dans l'éditeur de programme.
    if coalesce(v_ms.reward_stock, 0) <= v_ms.reward_claimed_count then
      v_reached := v_reached || pg_catalog.jsonb_build_object(
        'milestone_id', v_ms.id, 'visit_count', v_ms.visit_count,
        'reward_type', v_ms.reward_type, 'out_of_stock', true,
        'reward_label', v_ms.reward_label);
      continue;
    end if;
    update public.loyalty_milestones
       set reward_claimed_count = reward_claimed_count + 1
     where id = v_ms.id;

    if v_ms.reward_type = 'lot' then
      v_code := null;
      for attempt in 1..8 loop
        v_bytes := extensions.gen_random_bytes(8);
        v_code := 'FIDELITE-';
        for i in 0..7 loop
          v_code := v_code || pg_catalog.substr(
            v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
        end loop;
        begin
          insert into public.loyalty_rewards
            (member_id, program_id, organization_id, milestone_id,
             reward_type, code, earned_at)
          values (v_member.id, v_prog.id, v_prog.organization_id, v_ms.id,
                  'lot', v_code, v_now);
          exit;
        exception when unique_violation then
          -- Collision de code (le verrou programme exclut un double palier).
          v_code := null;
        end;
      end loop;
      if v_code is null then
        raise exception 'code generation exhausted';
      end if;
      v_reached := v_reached || pg_catalog.jsonb_build_object(
        'milestone_id', v_ms.id, 'visit_count', v_ms.visit_count,
        'reward_type', 'lot', 'code', v_code,
        'reward_label', v_ms.reward_label, 'reward_details', v_ms.reward_details);
    else
      -- Tour de roue offert : grant_token à usage unique, décompté du stock
      -- du palier au même titre qu'un code de retrait.
      v_grant := null;
      for attempt in 1..8 loop
        v_grant := pg_catalog.encode(extensions.gen_random_bytes(24), 'hex');
        begin
          insert into public.loyalty_rewards
            (member_id, program_id, organization_id, milestone_id,
             reward_type, grant_token, earned_at)
          values (v_member.id, v_prog.id, v_prog.organization_id, v_ms.id,
                  'spin', v_grant, v_now);
          exit;
        exception when unique_violation then
          v_grant := null;
        end;
      end loop;
      if v_grant is null then
        raise exception 'grant generation exhausted';
      end if;
      v_reached := v_reached || pg_catalog.jsonb_build_object(
        'milestone_id', v_ms.id, 'visit_count', v_ms.visit_count,
        'reward_type', 'spin', 'target_wheel_id', v_ms.target_wheel_id,
        'grant_token', v_grant);
    end if;
  end loop;

  -- Prochain palier (le plus proche strictement au-dessus).
  select ms.visit_count, ms.reward_type into v_next_visit, v_next_type
    from public.loyalty_milestones ms
   where ms.program_id = v_prog.id and ms.visit_count > v_new_count
   order by ms.visit_count
   limit 1;

  return pg_catalog.jsonb_build_object(
    'state', 'stamped',
    'program', pg_catalog.jsonb_build_object(
      'id', v_prog.id, 'name', v_prog.name,
      'validation_mode', v_prog.validation_mode),
    'visit_count', v_new_count,
    'points_earned', v_points_per_visit,
    'points_balance', v_new_balance,
    'points_earned_total', v_new_earned,
    'tier', v_tier,
    'tier_thresholds', pg_catalog.jsonb_build_object(
      'silver', v_prog.silver_threshold, 'gold', v_prog.gold_threshold),
    'is_new_member', v_is_new,
    'milestones_reached', v_reached,
    'next_milestone', case when v_next_visit is null then null
      else pg_catalog.jsonb_build_object(
        'visit_count', v_next_visit, 'reward_type', v_next_type) end
  );
end;
$$;

-- L'arité est inchangée, donc `create or replace` a conservé l'ACL existante.
-- Ces deux lignes sont une CEINTURE, pas une redite : si un jour l'arité
-- change, l'ACL repart vierge (EXECUTE à PUBLIC) et c'est ici que ça se
-- referme.
revoke all on function public.record_loyalty_stamp(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_loyalty_stamp(uuid, text, text, uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 7. `spend_loyalty_points` — LE CŒUR DU LOT
--
-- Le client échange des points contre un palier. C'est la seule voie par
-- laquelle une récompense s'ACHÈTE, et elle est atomique de bout en bout.
--
-- ── L'ORDRE DES OPÉRATIONS, ET POURQUOI IL EST CELUI-LÀ ──
--
--   1. Programme + addon, sous verrou : fige les réglages et le stock des
--      paliers, exactement comme record_loyalty_stamp.
--   2. Membre, SOUS VERROU (`for update`). Sans lui, deux clics simultanés
--      lisent le même solde, le trouvent suffisant tous les deux, débitent
--      une fois et servent DEUX cadeaux.
--   3. IDEMPOTENCE, sous ce verrou : un `request_id` déjà vu rend la MÊME
--      récompense. C'est ce qui protège du double-clic et du réseau qui
--      repart — deux évènements bien plus fréquents que la concurrence vraie.
--      Placée avant toute vérification, elle rend un rejeu insensible à un
--      solde depuis descendu ou à un stock depuis épuisé : un rejeu n'est pas
--      un nouvel achat, c'est la relecture d'un achat déjà conclu.
--   4. Palier, RESTREINT AU PROGRAMME : un palier d'un autre commerçant rend
--      `unknown_milestone`, le même état qu'un identifiant inventé. Pas
--      d'oracle inter-tenant.
--   5. Solde, puis stock. Débit, compteur, émission.
--
-- ── LES ÉTATS SONT NOMMÉS ──
--
-- `spent` | `insufficient_points` | `out_of_stock` | `unknown_milestone` |
-- `inactive` | `not_a_member`. Jamais un `false` muet : l'écran doit pouvoir
-- dire au client CE QUI s'est passé, et « il manque 120 points » n'est pas
-- « ce cadeau est épuisé ».
--
-- Le montant débité est GRAVÉ sur la récompense (`spent_points`) : sans lui,
-- un prix modifié par le commerçant rendrait impossible de dire ce qui a été
-- payé pour cette ligne-là.
-- ────────────────────────────────────────────────────────────

create or replace function public.spend_loyalty_points(
  p_program_id uuid,
  p_member_token_hash text,
  p_milestone_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.loyalty_programs%rowtype;
  v_member public.loyalty_members%rowtype;
  v_ms public.loyalty_milestones%rowtype;
  v_reward public.loyalty_rewards%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_grant text;
  v_bytes bytea;
  i integer;
  attempt integer;
  v_new_balance integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_member_token_hash is null or p_member_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member token';
  end if;
  -- Sans identifiant d'intention, il n'y a pas d'idempotence possible : on
  -- refuse plutôt que de servir un achat qu'un rejeu doublerait.
  if p_request_id is null then
    raise exception 'request id required';
  end if;

  select p.* into v_prog
    from public.loyalty_programs p
    join public.organizations o on o.id = p.organization_id
   where p.id = p_program_id
     and o.addon_loyalty
   for update of p;
  if not found or v_prog.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'inactive');
  end if;

  -- VERROU DU MEMBRE — la ligne de défense contre le double débit.
  select m.* into v_member
    from public.loyalty_members m
   where m.program_id = v_prog.id
     and m.token_hash = p_member_token_hash
   for update;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'not_a_member');
  end if;

  -- IDEMPOTENCE : le même request_id rend la même récompense, sans second
  -- débit et sans second décompte de stock.
  select r.* into v_reward
    from public.loyalty_rewards r
   where r.member_id = v_member.id
     and r.request_id = p_request_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'state', 'spent',
      'idempotent', true,
      'reward_id', v_reward.id,
      'milestone_id', v_reward.milestone_id,
      'reward_type', v_reward.reward_type,
      'code', v_reward.code,
      'grant_token', v_reward.grant_token,
      'spent_points', v_reward.spent_points,
      'points_balance', v_member.points_balance,
      'points_earned_total', v_member.points_earned_total
    );
  end if;

  -- Palier du PROGRAMME COURANT uniquement : un palier d'une autre
  -- organisation est indiscernable d'un identifiant inventé.
  select ms.* into v_ms
    from public.loyalty_milestones ms
   where ms.id = p_milestone_id
     and ms.program_id = v_prog.id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown_milestone');
  end if;

  if v_member.points_balance < v_ms.cost_points then
    return pg_catalog.jsonb_build_object(
      'state', 'insufficient_points',
      'points_balance', v_member.points_balance,
      'points_earned_total', v_member.points_earned_total,
      'cost_points', v_ms.cost_points,
      'points_missing', v_ms.cost_points - v_member.points_balance
    );
  end if;

  -- Même règle de stock que l'émission au franchissement : un stock null vaut
  -- ZÉRO disponible (verrou économique de 20260725190000 — tout palier porte
  -- un stock fini, c'est le plafond de perte du programme).
  if coalesce(v_ms.reward_stock, 0) <= v_ms.reward_claimed_count then
    return pg_catalog.jsonb_build_object(
      'state', 'out_of_stock',
      'points_balance', v_member.points_balance,
      'points_earned_total', v_member.points_earned_total,
      'cost_points', v_ms.cost_points
    );
  end if;

  -- DÉBIT. `points_earned_total` n'est PAS touché : c'est tout l'objet des
  -- deux compteurs — le client paie sans perdre son niveau.
  v_new_balance := v_member.points_balance - v_ms.cost_points;
  update public.loyalty_members
     set points_balance = v_new_balance
   where id = v_member.id;

  -- « Décrémenter le stock » s'écrit ici comme partout dans ce module :
  -- reward_stock est le PLAFOND choisi par le commerçant, reward_claimed_count
  -- le consommé. C'est le second qui monte.
  update public.loyalty_milestones
     set reward_claimed_count = reward_claimed_count + 1
   where id = v_ms.id;

  if v_ms.reward_type = 'lot' then
    -- Génération de code reprise de record_loyalty_stamp : même alphabet sans
    -- I/O/0/1, même préfixe, mêmes 8 tentatives. `redeem_loyalty_reward` ne
    -- fait aucune différence entre un code offert et un code acheté.
    v_code := null;
    for attempt in 1..8 loop
      v_bytes := extensions.gen_random_bytes(8);
      v_code := 'FIDELITE-';
      for i in 0..7 loop
        v_code := v_code || pg_catalog.substr(
          v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
      end loop;
      begin
        insert into public.loyalty_rewards
          (member_id, program_id, organization_id, milestone_id,
           reward_type, code, earned_at, request_id, spent_points)
        values (v_member.id, v_prog.id, v_prog.organization_id, v_ms.id,
                'lot', v_code, v_now, p_request_id, v_ms.cost_points)
        returning * into v_reward;
        exit;
      exception when unique_violation then
        v_code := null;
      end;
    end loop;
    if v_code is null then
      raise exception 'code generation exhausted';
    end if;
  else
    v_grant := null;
    for attempt in 1..8 loop
      v_grant := pg_catalog.encode(extensions.gen_random_bytes(24), 'hex');
      begin
        insert into public.loyalty_rewards
          (member_id, program_id, organization_id, milestone_id,
           reward_type, grant_token, earned_at, request_id, spent_points)
        values (v_member.id, v_prog.id, v_prog.organization_id, v_ms.id,
                'spin', v_grant, v_now, p_request_id, v_ms.cost_points)
        returning * into v_reward;
        exit;
      exception when unique_violation then
        v_grant := null;
      end;
    end loop;
    if v_grant is null then
      raise exception 'grant generation exhausted';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'spent',
    'idempotent', false,
    'reward_id', v_reward.id,
    'milestone_id', v_ms.id,
    'reward_type', v_ms.reward_type,
    'reward_label', v_ms.reward_label,
    'reward_details', v_ms.reward_details,
    'target_wheel_id', v_ms.target_wheel_id,
    'code', v_code,
    'grant_token', v_grant,
    'spent_points', v_ms.cost_points,
    'points_balance', v_new_balance,
    'points_earned_total', v_member.points_earned_total,
    'tier', v_member.tier
  );
end;
$$;

comment on function public.spend_loyalty_points(uuid, text, uuid, uuid) is
  'ÉCHANGE de points contre un palier (FID-2a). Atomique sous verrou du '
  'membre, idempotente par p_request_id. Débite points_balance, laisse '
  'points_earned_total intact — dépenser ne fait pas perdre son niveau. États '
  'nommés : spent | insufficient_points | out_of_stock | unknown_milestone | '
  'inactive | not_a_member.';

-- La fonction VIENT D'ÊTRE CRÉÉE : son ACL est vierge, c'est-à-dire EXECUTE à
-- PUBLIC. Ces deux instructions sont la SEULE chose qui referme la porte —
-- sans elles, `anon` pourrait dépenser les points de n'importe quel passeport
-- dont il connaîtrait le hash de jeton.
revoke all on function public.spend_loyalty_points(uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.spend_loyalty_points(uuid, text, uuid, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 8. GARDE FINALE — les ACL des deux RPC sont-elles effectives ?
--
-- Un `revoke` mal ciblé ne lève pas davantage qu'un `grant` sans effet.
-- ────────────────────────────────────────────────────────────

do $migration$
begin
  if pg_catalog.has_function_privilege(
       'anon', 'public.spend_loyalty_points(uuid, text, uuid, uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.spend_loyalty_points(uuid, text, uuid, uuid)', 'EXECUTE')
  then
    raise exception
      'spend_loyalty_points est executable par anon ou authenticated : n importe qui pourrait depenser les points d un passeport';
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role', 'public.spend_loyalty_points(uuid, text, uuid, uuid)', 'EXECUTE')
  then
    raise exception
      'spend_loyalty_points n est pas executable par service_role : l echange serait injouable';
  end if;

  if pg_catalog.has_function_privilege(
       'anon', 'public.record_loyalty_stamp(uuid, text, text, uuid, text)', 'EXECUTE')
  then
    raise exception
      'record_loyalty_stamp est redevenue executable par anon';
  end if;
end
$migration$;
