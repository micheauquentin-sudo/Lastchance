-- ============================================================
-- COUVERTURE DES CLÉS ÉTRANGÈRES COMPOSITES (SEC-5, wagon 7)
--
-- Le projet ferme l'appartenance croisée par des clés étrangères COMPOSITES :
-- `wheels_campaign_org_fk` ne vérifie pas seulement que la campagne existe, il
-- vérifie qu'elle appartient à la MÊME organisation que la roue. Une FK simple
-- sur le seul identifiant ne dit rien de ce point : elle laisse la base
-- accepter, si le code appelant se trompe, une ligne du locataire A pointant
-- vers une ligne du locataire B. La RLS ne rattrape pas cela — elle décide de ce
-- qu'une session voit, pas de ce qu'une écriture peut coudre ensemble.
--
-- ── CE QUE CE FICHIER FAIT, ET CE QU'IL NE FAIT PAS ──
--
-- Il ne pose AUCUNE contrainte et n'en corrige aucune : c'est un CAPTEUR. Il
-- énumère, dans le catalogue vivant, les FK d'une colonne unique reliant deux
-- tables porteuses d'`organization_id`, et il exige que cet ensemble soit
-- exactement la liste d'exceptions écrite ci-dessous. Une VINGT-TROISIÈME fera
-- rougir — c'est tout ce qu'on lui demande : qu'aucune nouvelle ne s'ajoute en
-- silence, dans une migration de trois cents lignes que personne ne relit à la
-- loupe.
--
-- ── POURQUOI VINGT-DEUX, QUAND L'AUDIT EN ANNONÇAIT NEUF ──
--
-- Les neuf lignes de l'audit ont DÉRIVÉ : elles ont été relevées à une date, et
-- six modules ont livré depuis. Le catalogue a donc été réinterrogé, et la liste
-- ci-dessous est celle qu'il rend aujourd'hui — pas celle qu'on croyait. C'est
-- précisément la raison d'être de ce fichier : une liste dans un document
-- vieillit sans prévenir, une liste qu'une requête compare rougit le jour où
-- elle se périme.
--
-- ── LE STATUT DE CES VINGT-DEUX EXCEPTIONS ──
--
-- Elles sont ASSUMÉES, pas innocentées. Deux natures s'y mêlent, et il serait
-- malhonnête de les présenter comme une seule :
--
--   · celles où l'appartenance est garantie AILLEURS — l'identifiant n'est
--     jamais fourni par un appelant, il est produit par la RPC `security
--     definer` qui écrit la ligne, dans la même transaction et avec le même
--     `organization_id` ;
--   · celles qui sont de la DETTE — rien d'autre que le code applicatif ne
--     garantit le locataire, et une composite serait posable. Le module
--     pronostics en porte l'essentiel.
--
-- Aucune fuite connue n'en découle : ces colonnes ne sont pas écrites depuis une
-- entrée publique. Mais « pas exploitable aujourd'hui » n'est pas « garanti par
-- la base », et la distinction est notée pour qui reprendra SEC-5 en DDL.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

-- ── 1. Aucune FK simple hors de la liste assumée ─────────────
with tenant as (
  -- « Tenant-scopée » = porte une colonne `organization_id`. C'est la définition
  -- opérationnelle du locataire dans ce schéma, celle sur laquelle la RLS elle-
  -- même s'appuie.
  select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
     and a.attname = 'organization_id' and a.attnum > 0 and not a.attisdropped
   where n.nspname = 'public' and c.relkind = 'r'
),
simple_fk as (
  select con.oid as fk_oid, con.conrelid, con.confrelid,
         src.relname as src, tgt.relname as tgt,
         (select a.attname from pg_attribute a
           where a.attrelid = con.conrelid and a.attnum = con.conkey[1]) as col
    from pg_constraint con
    join tenant src on src.oid = con.conrelid
    join tenant tgt on tgt.oid = con.confrelid
   where con.contype = 'f' and array_length(con.conkey, 1) = 1
),
couverte as (
  -- Une FK simple est COUVERTE si la même paire de tables porte, par ailleurs,
  -- une FK composite qui embarque la même colonne : c'est le patron
  -- `(campaign_id, organization_id)` du projet. La simple subsiste alors — c'est
  -- celle que `references` a créée — mais elle n'est plus seule à décider.
  select s.fk_oid
    from simple_fk s
   where exists (
     select 1 from pg_constraint c2
      where c2.contype = 'f'
        and c2.conrelid = s.conrelid
        and c2.confrelid = s.confrelid
        and array_length(c2.conkey, 1) > 1
        and s.col = any (select a.attname from pg_attribute a
                          where a.attrelid = c2.conrelid
                            and a.attnum = any(c2.conkey))
   )
),
assumees (paire) as (values
  -- ── Le tour de roue produit EN RÉCOMPENSE (7) ──
  -- L'identifiant du spin n'existe pas avant l'appel : il est créé par la RPC
  -- qui écrit la ligne, dans la même transaction et sur la même organisation.
  -- Aucun appelant ne le fournit, donc aucun appelant ne peut le croiser.
  ('calendar_openings.resulting_spin_id -> spins'),
  ('loyalty_rewards.resulting_spin_id -> spins'),
  ('quiz_rewards.resulting_spin_id -> spins'),
  ('referral_rewards.resulting_spin_id -> spins'),
  ('referral_signups.proof_spin_id -> spins'),
  ('participations.spin_id -> spins'),
  -- Cinquième exemplaire du même patron, arrivé avec le Mode Attente active
  -- (RES-4, 20261006120000) : `consume_reserver_wait_spin_grant` crée le spin
  -- puis écrit son identifiant sur la session, dans la même transaction.
  ('reservation_wait_sessions.pause_resulting_spin_id -> spins'),
  -- ── L'état interne d'une session live (2) ──
  -- Écrits par les RPC d'animation, jamais par le joueur ni par le formulaire.
  ('event_sessions.current_question_id -> event_questions'),
  ('event_sessions.prono_correct_option_id -> event_question_options'),
  -- ── Module pronostics : DETTE (7) ──
  -- Trois tables livrées sans le patron composite que `contest_matches` et
  -- `contest_predictions` appliquent pourtant. Rien dans la base n'y garantit le
  -- locataire ; seul le code appelant le fait. À reprendre en DDL, hors capteur.
  ('contest_awards.contest_id -> contests'),
  ('contest_awards.player_id -> contest_players'),
  ('contest_final_standings.contest_id -> contests'),
  ('contest_final_standings.player_id -> contest_players'),
  ('contest_recovery_tokens.contest_id -> contests'),
  ('contest_recovery_tokens.player_id -> contest_players'),
  ('contest_leagues.created_by -> contest_players'),
  -- ── Le reste (7) ──
  -- `email_log.participation_id` et `loyalty_order_codes.consumed_member_id`
  -- sont écrits par des chemins service role ; les deux `sms_*` et les deux
  -- `experience_*`/`economic_*` relient des lignes créées par le même appel.
  -- `sms_credit_entries.reverses_entry_id` est une AUTO-référence : la composite
  -- y serait triviale à poser, et c'est de la dette au même titre.
  ('email_log.participation_id -> participations'),
  ('loyalty_order_codes.consumed_member_id -> loyalty_members'),
  ('economic_policy_events.policy_id -> experience_economic_policies'),
  ('experience_events.reward_issuance_id -> reward_issuances'),
  -- Le Ticket d'Or (TKT-1) pose la même, pour la même raison : `tirer_ticket_or`
  -- crée la récompense puis écrit son identifiant sur le ticket, dans la même
  -- transaction et sur la même organisation. La fermer demanderait un index
  -- unique `(id, organization_id)` sur `reward_issuances` — écrite à chaque gain
  -- des onze familles, et hors du périmètre du Ticket d'Or. Son voisin `lot_id`,
  -- lui, EST fermé par une composite (20261029120000) : les deux tables étaient
  -- neuves, elle ne coûtait rien. Fermer ce qui est gratuit, nommer le reste.
  ('tickets_or.reward_issuance_id -> reward_issuances'),
  ('sms_credit_entries.reverses_entry_id -> sms_credit_entries'),
  ('sms_log.credit_entry_id -> sms_credit_entries')
)
select is(
  (select coalesce(string_agg(s.src || '.' || s.col || ' -> ' || s.tgt, ', '
                              order by s.src, s.col), '')
     from simple_fk s
    where s.fk_oid not in (select fk_oid from couverte)
      and (s.src || '.' || s.col || ' -> ' || s.tgt)
          not in (select paire from assumees)),
  '',
  'aucune FK simple inter-locataire hors de la liste assumée'
);

-- ── 2. CONTRÔLE DE PORTÉE ────────────────────────────────────
-- Sans lui, l'assertion ci-dessus serait vraie sur un ensemble vide : il
-- suffirait que la requête cesse de voir les FK — un `relkind` qui change, une
-- colonne renommée — pour que le capteur verdisse en ne gardant plus rien. Le
-- plancher porte sur l'ensemble EXAMINÉ (les FK d'une seule colonne entre deux
-- tables tenant-scopées), pas sur les exceptions : c'est cet ensemble-là que
-- l'assertion 1 filtre, et donc lui qu'il faut prouver non vide. 35 aujourd'hui.
select cmp_ok(
  (select count(*)::int
     from pg_constraint con
    where con.contype = 'f'
      and array_length(con.conkey, 1) = 1
      and con.conrelid in (
        select c.oid from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid
           and a.attname = 'organization_id' and a.attnum > 0 and not a.attisdropped
         where n.nspname = 'public' and c.relkind = 'r')
      and con.confrelid in (
        select c.oid from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid
           and a.attname = 'organization_id' and a.attnum > 0 and not a.attisdropped
         where n.nspname = 'public' and c.relkind = 'r')),
  '>=', 30,
  'le capteur porte bien sur les ~35 FK simples inter-locataires, pas sur un ensemble vide'
);

select * from finish();
rollback;
