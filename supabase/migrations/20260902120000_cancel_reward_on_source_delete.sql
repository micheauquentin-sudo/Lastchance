-- ============================================================
-- LastChance — la disparition d'une source ANNULE son lot au registre,
-- elle ne l'efface pas
-- ============================================================
--
-- ── Le défaut ──
--
-- `reward_issuances.source_id` n'a AUCUNE clé étrangère (20260805150000:21) :
-- il est polymorphe, il désigne dix tables. Rien ne relie donc mécaniquement
-- la ligne de registre à sa ligne source, et les dix triggers de miroir
-- (20260805150000:643-672) sont `after insert or update`, JAMAIS `delete`.
--
-- Quand un commerçant supprime une roue, une chasse, un calendrier, un quiz,
-- un palier ou un programme de fidélité, la cascade emporte la ligne source et
-- LA LIGNE DE REGISTRE SURVIT, orpheline. Le client lit toujours son lot
-- « À retirer » dans son portefeuille — `player_wallet` (20260822120000:236-266)
-- lit `reward_issuances` sans jointure sur la source — pendant que la caisse
-- lui répond « Code introuvable » : `routeRedeemCode` résout le hit du registre
-- en relisant la table legacy, ne la trouve pas, et rend `null`.
--
-- Les six gardes d'ADR-063 réduisent la fréquence du cas — le commerçant est
-- averti et doit cocher une case qui NOMME le nombre de codes en jeu. Elles ne
-- le ferment pas : la suppression reste possible, et voulue, une fois la case
-- cochée.
--
-- ── L'arbitrage : MARQUER, jamais détruire ──
--
-- Deux voies existaient. Supprimer la ligne de registre avec sa source aurait
-- rétabli la cohérence en une ligne de SQL. C'est le MARQUAGE qui est retenu,
-- pour quatre raisons dont trois sont mesurables dans ce dépôt :
--
--   1. **L'état existe déjà, de bout en bout.** `player_wallet` calcule quatre
--      états dont `cancelled` (20260822120000:251-256), et l'écran du client
--      l'affiche déjà : pastille « Annulé », mention « Le commerçant a annulé
--      ce lot. », code déclassé du gros caractère au corps de texte
--      (`player-wallet-screen.tsx`). Le client lit donc une EXPLICATION là où
--      la suppression lui aurait fait constater une disparition — et un lot
--      gagné qui s'évapore d'un portefeuille, c'est un produit qui a l'air
--      cassé. Cette migration ne demande aucune ligne d'écran.
--   2. **Supprimer réécrirait des rapports déjà envoyés.** `org_weekly_digest`
--      (20260821120000:176-183) compte les lots ÉMIS sur `reward_issuances`, et
--      dit dans son propre commentaire pourquoi : « Un lot annulé reste émis :
--      il a bien été gagné, et le masquer ferait mentir la comparaison. »
--      Détruire la ligne ferait baisser après coup le chiffre d'une semaine
--      passée, sur le seul document que le commerçant reçoit chaque lundi.
--   3. **La trace n'est pas éternelle pour autant.** Une ligne annulée est
--      TERMINÉE au sens de `purge_expired_reward_issuances` (20260810120000:68-72)
--      et devient purgeable à l'échéance de rétention de l'organisation. Mieux :
--      cette migration-ci EST la propagation de suppression dont l'en-tête de
--      20260810120000 constatait l'absence — elle n'avait pu proposer qu'une
--      fenêtre de temps en guise de remplacement.
--   4. **La caisse a déjà l'issue cohérente câblée.** `redeem_reward_by_code`
--      (20260805150000:758-759) lit `cancelled_at` AVANT toute route legacy et
--      rend l'état `cancelled`, que la caisse traduit en « Ce lot a été annulé »
--      (`universalRedeemFailure`). Marquer branche ce message ; supprimer
--      aurait laissé le comptoir sur son « Code introuvable ».
--
-- Ce que le marquage NE ferme PAS, et qu'il ne faut pas croire fermé : le
-- CHEMIN DE RECHERCHE de la caisse reste inchangé. `routeRedeemCode` rend
-- toujours `null` quand le registre connaît le code mais que la table legacy
-- ne le porte plus, donc le caissier lit encore « Code introuvable » au lieu
-- de « Ce lot a été annulé » — le message juste existe, il n'est simplement
-- pas atteint. C'est un correctif applicatif, hors de portée d'une migration.
--
-- ── Rien ne réactive la ligne marquée — vérifié, non supposé ──
--
--   * `upsert_reward_issuance` est la SEULE voie qui remet `cancelled_at` à la
--     valeur de la source (donc à null), et `sync_reward_issuance` en est le
--     seul appelant (20260805150000:610, unique occurrence). Or celui-ci sort
--     par `if not found then return` dès que sa ligne source est absente — ce
--     qui est le cas ici par construction : elle vient d'être détruite.
--   * `resync_reward_issuance_player_ids()` (20260822120000) rejoue
--     `sync_reward_issuance` sur les lignes à `player_id` nul : même sortie,
--     aucune écriture.
--   * `redeem_reward_by_code` n'écrit jamais `cancelled_at` : son seul UPDATE
--     touche `redeemed_by`, `basket_cents` et l'état Wallet.
--   * `purge_expired_reward_issuances` ne fait que SUPPRIMER.
--
-- La seule voie qui rouvrirait la ligne serait la réapparition d'une ligne
-- source portant le MÊME uuid : la synchro repasserait et le lot redeviendrait
-- actif. C'est le comportement voulu — le lot existe à nouveau — et
-- `gen_random_uuid()` rend le cas inatteignable par accident.
--
-- ── Deux gardes sur l'UPDATE, et pourquoi chacune ──
--
--   * `redeemed_at is null` : un lot DÉJÀ REMIS reste « retiré ». L'annuler
--     réécrirait un fait — le client a eu son lot — et violerait
--     `reward_issuances_terminal_state`, qui interdit les deux dates ensemble.
--   * `cancelled_at is null` : une annulation déjà enregistrée garde SON motif.
--     La première est toujours la plus précise (« annulé au comptoir » vaut
--     mieux que « source supprimée »), et l'écraser ferait perdre la seule
--     information que porte cette colonne.
--
-- `wallet_status` suit exactement la règle de `upsert_reward_issuance` sur une
-- transition terminale : demande de révocation depuis `not_requested`,
-- `active` ou `failed`, et jamais depuis `revoked` — un laissez-passer déjà
-- révoqué ne se re-révoque pas.
--
-- ── Pourquoi `for each row`, comme les dix triggers jumeaux ──
--
-- Le coût est borné et connu : un UPDATE par ligne supprimée, résolu par
-- l'index unique `reward_issuances_source_unique (source_type, source_id)`.
-- C'est STRICTEMENT MOINS que ce que le miroir d'insertion fait déjà sur les
-- mêmes tables, où chaque ligne déclenche un select multi-jointure suivi d'un
-- upsert. Un `for each statement` avec table de transition serait plus rapide
-- sur une grosse cascade, mais ce dépôt n'utilise `referencing` nulle part :
-- on ne fait pas entrer un mécanisme neuf par la porte d'un correctif, sur le
-- chemin d'une suppression déjà bornée par la confirmation d'ADR-063.
-- ============================================================

create or replace function public.cancel_reward_issuance_on_source_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `tg_argv[0]` est le `source_type` du registre, écrit en toutes lettres dans
  -- la déclaration de chaque trigger : c'est une valeur de liste blanche, jamais
  -- du SQL dynamique, et la correspondance table → famille se lit sur la même
  -- ligne que le nom de la table plutôt que dans une table de correspondance
  -- séparée qui pourrait diverger de celle de `sync_reward_issuance`.
  update public.reward_issuances ri
     set cancelled_at = pg_catalog.now(),
         cancelled_reason = 'source supprimée',
         wallet_status = case
           when ri.wallet_status in ('not_requested', 'active', 'failed')
             then 'revocation_requested'
           else ri.wallet_status
         end,
         wallet_updated_at = case
           when ri.wallet_status in ('not_requested', 'active', 'failed')
             then pg_catalog.now()
           else ri.wallet_updated_at
         end,
         updated_at = pg_catalog.now()
   where ri.source_type = tg_argv[0]
     and ri.source_id = old.id
     and ri.redeemed_at is null
     and ri.cancelled_at is null;
  return old;
end;
$$;

comment on function public.cancel_reward_issuance_on_source_delete() is
  'Jumeau à la SUPPRESSION des dix triggers de miroir : quand une ligne source disparaît (geste d''entretien du commerçant, cascade, purge de module), sa ligne de registre est ANNULÉE et non détruite — le client lit « Annulé » au lieu de voir son lot s''évaporer, la caisse refuse en le disant, le rapport hebdomadaire garde le lot comme émis, et la purge de rétention peut enfin l''emporter. Ne touche jamais un lot déjà remis ni une annulation déjà motivée.';

-- Même forme que `mirror_reward_issuance`, son jumeau à l'insertion.
-- `service_role` n'est délibérément pas révoqué : c'est lui qui exécute les
-- suppressions que ce trigger doit suivre, et on ne fait pas dépendre un chemin
-- de production du moment exact où Postgres contrôle EXECUTE sur une fonction
-- de trigger.
revoke all on function public.cancel_reward_issuance_on_source_delete()
  from public, anon, authenticated;

-- Les dix tables sources, dans le MÊME ordre que les dix triggers de miroir
-- (20260805150000:643-672), pour que les deux listes se relisent côte à côte.
-- Les deux tables du calendrier partagent `source_type = 'calendar'` : c'est
-- déjà la règle du registre, leur provenance vit dans `metadata.legacy_table`.
create trigger participations_reward_issuance_delete
after delete on public.participations
for each row execute function
  public.cancel_reward_issuance_on_source_delete('wheel');
create trigger hunt_completions_reward_issuance_delete
after delete on public.hunt_completions
for each row execute function
  public.cancel_reward_issuance_on_source_delete('hunt');
create trigger loyalty_rewards_reward_issuance_delete
after delete on public.loyalty_rewards
for each row execute function
  public.cancel_reward_issuance_on_source_delete('loyalty');
create trigger jackpot_wins_reward_issuance_delete
after delete on public.jackpot_wins
for each row execute function
  public.cancel_reward_issuance_on_source_delete('jackpot');
create trigger event_wins_reward_issuance_delete
after delete on public.event_wins
for each row execute function
  public.cancel_reward_issuance_on_source_delete('event');
create trigger calendar_openings_reward_issuance_delete
after delete on public.calendar_openings
for each row execute function
  public.cancel_reward_issuance_on_source_delete('calendar');
create trigger calendar_rewards_reward_issuance_delete
after delete on public.calendar_rewards
for each row execute function
  public.cancel_reward_issuance_on_source_delete('calendar');
create trigger referral_rewards_reward_issuance_delete
after delete on public.referral_rewards
for each row execute function
  public.cancel_reward_issuance_on_source_delete('referral');
create trigger quiz_rewards_reward_issuance_delete
after delete on public.quiz_rewards
for each row execute function
  public.cancel_reward_issuance_on_source_delete('quiz');
create trigger contest_awards_reward_issuance_delete
after delete on public.contest_awards
for each row execute function
  public.cancel_reward_issuance_on_source_delete('contest');
