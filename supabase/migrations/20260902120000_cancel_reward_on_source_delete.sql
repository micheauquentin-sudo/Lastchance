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
--   3. **La trace n'est pas éternelle pour autant.** Une ligne annulée PAR LE
--      GESTE DU COMMERÇANT est TERMINÉE au sens de
--      `purge_expired_reward_issuances` (20260810120000:68-72) et devient
--      purgeable à l'échéance de rétention de l'organisation. Mieux : cette
--      migration-ci EST la propagation de suppression dont l'en-tête de
--      20260810120000 constatait l'absence — elle n'avait pu proposer qu'une
--      fenêtre de temps en guise de remplacement. Voir la section
--      « DEUX CAUSES » ci-dessous : cette phrase ne vaut QUE pour le geste du
--      commerçant, et c'est la correction principale apportée à ce fichier.
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
-- ── DEUX CAUSES, ET POURQUOI IL FAUT LES SÉPARER ──
--
-- Première rédaction de ce fichier : un motif unique, `'source supprimée'`,
-- pour TOUTE disparition de source. C'était faux sur deux plans à la fois, et
-- la revue de sécurité l'a mesuré avant que ce fichier n'atteigne `main`.
--
-- **Fait 1 — la purge de rétention supprime la ligne SOURCE sur le seul
-- critère d'âge.** `purge_expired_personal_data` (20260826120000:809-812)
-- efface `participations` sans regarder ni `redeemed_at` ni l'expiration ; même
-- forme pour `purge_expired_hunt_players`, `purge_expired_loyalty_members`,
-- `purge_expired_calendar_players` et `purge_expired_contest_players`, dont les
-- cascades emportent `hunt_completions`, `loyalty_rewards`, `calendar_openings`,
-- `calendar_rewards` et `contest_awards`.
--
-- **Fait 2 — `organizations.data_retention_months` vaut `default 12`**
-- (00019:18). Ce n'est pas un opt-in : chaque organisation purge.
--
-- **Fait 3 — sept familles sur neuf n'ont AUCUNE expiration au registre.**
-- `sync_reward_issuance` écrit `null::timestamptz as expires_at` pour hunt,
-- loyalty, jackpot, event, calendar (×2), referral et quiz
-- (20260805150000:320,350,383,412,441,474,518,554). Seuls `wheel` et `contest`
-- portent une échéance. Un `CHASSE-` jamais retiré est donc ÉTERNELLEMENT
-- « encore encaissable » au sens du prédicat de purge.
--
-- Composés, ces trois faits font de la RÉTENTION un déclencheur d'annulation :
-- un `CHASSE-` gagné en mars 2027 et jamais retiré voit, en mars 2028,
-- `purge_expired_hunt_players` supprimer sa ligne joueur sur l'âge seul, la
-- cascade emporter `hunt_completions`, le trigger ci-dessous poser
-- `cancelled_at` — et la ligne de registre devient TERMINÉE, donc purgeable la
-- nuit même (les deux purges tournent dans le même `Promise.all`, ordre non
-- déterministe). **Avant ce fichier, cette ligne était protégée à vie.**
--
-- ⚠️ **L'invariant de 20260810120000 devient donc CONDITIONNEL, et son en-tête
-- ne peut pas le dire** — il est sur `main`, ses octets sont comparés par
-- `scripts/check-migration-order.mjs`, une correction en place y est refusée.
-- C'est donc ici que la phrase est corrigée. Cet en-tête-là affirme, § « La
-- réserve qui compte » : « On ne supprime JAMAIS un lot encore encaissable. »
-- La phrase reste vraie APRÈS ce fichier, mais elle ne l'est plus par la seule
-- vertu du prédicat qu'elle commente : elle repose désormais AUSSI sur la
-- clause `cancelled_reason is distinct from 'source purgée'` ajoutée plus bas.
-- Sans cette clause, ce fichier aurait rendu cet en-tête MENSONGER — un motif
-- que ce dépôt a déjà payé trois fois.
--
-- **La séparation, et pourquoi par un réglage de session.** Le motif est un
-- champ libre de 300 caractères (20260722150000:32-33) : il peut donc porter la
-- distinction sans changement de schéma. Reste à la connaître au moment du
-- trigger, qui ne voit qu'un `old` — jamais le pourquoi. On reprend le motif
-- déjà employé par ce dépôt pour exactement ce besoin :
-- `lastchance.audit_maintenance`, posé par `purge_expired_personal_data`
-- (20260826120000:856) et lu par `admin_audit_immutable` (00019:572) pour
-- distinguer une purge d'une écriture ordinaire sur une table append-only.
--
-- Un réglage JUMEAU est donc introduit, `lastchance.purge_maintenance`, et non
-- une réutilisation du premier : les deux drapeaux répondent à deux questions
-- différentes (« ai-je le droit d'écrire ici » contre « pourquoi cette ligne
-- disparaît »), et `purge_expired_personal_data` éteint le sien AVANT la fin de
-- son corps — le confondre lierait la véracité d'un motif à la position d'un
-- `set_config` dans une fonction que ce fichier ne possède pas.
--
-- **`alter function … set` a été essayé EN PREMIER, et il est REFUSÉ. Mesuré,
-- pas supposé.** C'était la voie élégante : elle posait le réglage sans toucher
-- un seul corps de fonction, Postgres l'appliquant à l'entrée et le restaurant
-- à la sortie. Les deux formes échouent avec le même message :
--
--     ERROR: permission denied to set parameter "lastchance.purge_maintenance"
--
-- Ce n'est PAS une affaire de guillemets — la forme non quotée, seule correcte
-- au regard de la grammaire (`var_name '.' ColId`), rend la même erreur. La
-- cause est le modèle de rôles de Supabase : `postgres`, sous lequel tournent
-- les migrations, n'est pas superutilisateur, et fixer un paramètre CUSTOM
-- (simple « placeholder » qu'aucune extension n'a déclaré) par
-- `alter function … set` l'exige. Une migration qui l'aurait tenté aurait
-- échoué EN ENTIER, et c'est très exactement ce qui s'est passé au premier
-- `db reset` : les dix triggers, la purge corrigée et le portefeuille n'ont
-- jamais existé, silencieusement, derrière un `Result: FAIL` qui ne nommait que
-- les tests.
--
-- On revient donc à `set_config(…, is_local => true)` posé DANS le corps — qui,
-- lui, ne demande aucun privilège particulier, et qui est exactement ce que
-- `purge_expired_personal_data` fait déjà pour `audit_maintenance` depuis
-- 20260826120000. Le mécanisme n'est pas neuf dans ce dépôt : il est éprouvé en
-- production.
--
-- ⚠️ **Conséquence à connaître avant de relire ces cinq fonctions.** Leur
-- définition vivante DÉMÉNAGE dans ce fichier. `grep -l "function
-- public.purge_expired_hunt_players"` rend désormais DEUX fichiers, et c'est
-- celui-ci qui fait foi — la règle du catalogue vivant s'applique, elle a déjà
-- coûté deux défauts à ce dépôt. Les cinq corps ci-dessous n'ont PAS été
-- recopiés à la main : ils ont été extraits de leur fichier d'origine, une
-- seule ligne y a été insérée, et l'aller-retour (retirer cette ligne redonne
-- l'octet près le bloc d'origine) a été vérifié pour les cinq.
--
-- **Les quatre purges qui n'en ont PAS besoin, vérifiées et non supposées :**
--   * `purge_expired_quiz_players` et `purge_expired_referral_data`
--     ANONYMISENT (`update`) et ne suppriment rien — aucun trigger `after
--     delete` ne peut donc s'y déclencher ;
--   * `purge_expired_jackpot_players` supprime `jackpot_players`, mais
--     `jackpot_wins` n'a AUCUNE clé étrangère vers cette table — c'est écrit et
--     voulu (20260726120000:232-234 : « l'entrée gagnante reste un
--     enregistrement anonyme et vérifiable même après purge du joueur
--     dormant ») ;
--   * `purge_expired_event_sessions` supprime `event_players`, alors que
--     `event_wins` référence `event_sessions` — que cette purge ne touche pas.
--   Ces deux dernières familles sont STRUCTURELLEMENT hors d'atteinte : leur
--   registre anonyme de gains survit déjà à la purge du joueur.
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
         -- DEUX CAUSES, jamais confondues (voir l'en-tête). Le geste
         -- d'entretien du commerçant est confirmé par un humain qui a coché une
         -- case nommant les codes en jeu ; la purge de rétention est
         -- automatique et ne demande rien à personne. Les afficher pareil
         -- ferait dire au comptoir, en face du client et en 2028, que son
         -- patron a supprimé l'opération — alors que c'est le RGPD qui a
         -- travaillé. Ce n'est pas une fuite, c'est une régression de véracité
         -- sur le point de contact le plus sensible du produit.
         --
         -- Ces deux littéraux sont le VOCABULAIRE de ce fichier : ils sont
         -- relus par `purge_expired_reward_issuances` et par `player_wallet`,
         -- tous deux redéfinis plus bas dans CE fichier — les trois occurrences
         -- se relisent donc ensemble, sans table de correspondance séparée.
         cancelled_reason = case
           when pg_catalog.current_setting(
                  'lastchance.purge_maintenance', true) = 'on'
             then 'source purgée'
           else 'source supprimée'
         end,
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
     -- Cloison d'organisation. Aucun chemin d'exploitation n'a été trouvé sans
     -- elle — l'index unique `(source_type, source_id)` est global et
     -- `source_id` vaut toujours la clé primaire de la source — mais la
     -- propriété reposait alors sur l'improbabilité d'une collision d'uuid ET
     -- sur l'absence de désynchronisation entre `reward_issuances.
     -- organization_id` et l'organisation de la ligne source. Cette seconde
     -- hypothèse a DÉJÀ été prise en défaut dans ce dépôt, sur `contest_awards`.
     -- Les dix tables sources portent toutes `organization_id` : la garde rend
     -- la cloison structurelle au lieu de probabiliste, sans coût.
     and ri.organization_id = old.organization_id
     and ri.redeemed_at is null
     and ri.cancelled_at is null;
  return old;
end;
$$;

comment on function public.cancel_reward_issuance_on_source_delete() is
  'Jumeau à la SUPPRESSION des dix triggers de miroir : quand une ligne source disparaît, sa ligne de registre est ANNULÉE et non détruite — le client lit « Annulé » au lieu de voir son lot s''évaporer, la caisse refuse en le disant, et le rapport hebdomadaire garde le lot comme émis. DEUX CAUSES, jamais confondues : « source supprimée » = geste d''entretien du commerçant, confirmé par un humain, ligne purgeable à l''échéance de rétention ; « source purgée » = la rétention RGPD a emporté la ligne source sur le seul critère d''âge, sans que personne ne décide d''annuler — la ligne de registre est alors EXCLUE de la purge du registre, parce que le lot est encore dû et que sept familles sur neuf n''ont aucune expiration. La cause vient du réglage lastchance.purge_maintenance, posé par alter function sur les cinq purges qui suppriment une source. Scopé à l''organisation. Ne touche jamais un lot déjà remis ni une annulation déjà motivée.';

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

-- ============================================================
-- Les CINQ purges qui suppriment une ligne source se nomment
-- ============================================================
--
-- `alter function … set` pose le réglage à l'entrée de la fonction et le
-- restaure à la sortie : rien à éteindre, rien à oublier, et aucun corps de
-- fonction recopié (voir l'en-tête, § « DEUX CAUSES »). Le nom porte un point,
-- c'est donc une « customized option » au sens de Postgres — elle n'a pas
-- besoin d'être déclarée, et `current_setting(…, true)` rend NULL partout
-- ailleurs, ce qui fait retomber le trigger sur « source supprimée ».
--
-- La liste n'est pas énumérative par confort : c'est l'ensemble EXACT des
-- purges dont une suppression atteint l'une des dix tables porteuses d'un
-- trigger, vérifié table par table contre les clés étrangères réelles. Les
-- quatre autres purges de module sont hors d'atteinte, et l'en-tête dit
-- pourquoi pour chacune.
-- Aucun `off` n'est posé en fin de corps, contrairement à ce que fait
-- `audit_maintenance` : `is_local => true` borne le réglage à la TRANSACTION,
-- et une purge appelée en RPC est seule dans la sienne. `audit_maintenance`,
-- lui, doit s'éteindre parce qu'il ROUVRE une table append-only au milieu d'une
-- fonction qui continue ensuite à écrire ailleurs — ici il n'y a rien à
-- refermer, le drapeau ne donne aucun droit, il ne fait que nommer une cause.
--
-- Les `revoke`/`grant` d'origine ne sont pas réécrits : `create or replace`
-- conserve les privilèges et le commentaire de la fonction remplacée. Seul un
-- `drop` les emporterait, et il n'y en a aucun ici.

-- purge_expired_personal_data — corps VERBATIM de 20260826120000, +1 ligne.
create or replace function public.purge_expired_personal_data()
returns table(organizations_processed bigint, participations_deleted bigint, subscribers_deleted bigint)
language plpgsql security definer set search_path = '' as $$
declare r record; p_count bigint := 0; s_count bigint := 0; n bigint := 0; c bigint;
begin
  perform pg_catalog.set_config('lastchance.purge_maintenance', 'on', true);
  for r in select id, data_retention_months from public.organizations
           where data_retention_months is not null loop
    n := n + 1;
    delete from public.participations
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; p_count := p_count + c;
    delete from public.newsletter_subscribers
      where organization_id = r.id and unsubscribed_at is not null
        and unsubscribed_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; s_count := s_count + c;
    delete from public.email_log
      where organization_id = r.id
        and sent_at < now() - make_interval(months => r.data_retention_months);

    -- (a) Le journal SMS : la ligne reste, la personne s'efface.
    update public.sms_log
       set recipient = '000000',
           last_error = null,
           updated_at = pg_catalog.clock_timestamp()
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and (recipient <> '000000' or last_error is not null);

    -- (b1) Consentement jamais retiré et périmé : supprimé.
    delete from public.sms_consents
      where organization_id = r.id
        and revoked_at is null
        and consented_at < now() - make_interval(months => r.data_retention_months);

    -- (b2) Consentement RETIRÉ : conservé — c'est la preuve d'opposition — et
    -- réduit à ce qui permet d'honorer cette opposition.
    update public.sms_consents
       set phone = phone_key,
           consent_source = null,
           revoked_reason = null
      where organization_id = r.id
        and revoked_at is not null
        and revoked_at < now() - make_interval(months => r.data_retention_months)
        and phone_key ~ '^\+?[0-9 .()\-]{6,20}$'
        and (phone <> phone_key or consent_source is not null
             or revoked_reason is not null);
  end loop;
  delete from public.webhook_deliveries
    where (delivered_at is not null or attempts >= 12)
      and created_at < pg_catalog.now() - interval '30 days';
  delete from public.admin_sessions
    where expires_at < pg_catalog.now() - interval '30 days';
  -- L'événement d'audit reste probant, mais l'email et l'IP cessent
  -- d'identifier une personne après 24 mois.
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'on', true);
  update public.admin_audit_logs set actor_email = '[anonymisé]', ip = null,
    metadata = metadata - 'email' - 'target_email'
    where created_at < pg_catalog.now() - interval '24 months'
      and (actor_email <> '[anonymisé]' or ip is not null);
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'off', true);
  delete from public.admin_notes where created_at < pg_catalog.now() - interval '24 months';
  return query select n, p_count, s_count;
end
$$;

-- purge_expired_hunt_players — corps VERBATIM de 20260724120000, +1 ligne.
create or replace function public.purge_expired_hunt_players()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  perform pg_catalog.set_config('lastchance.purge_maintenance', 'on', true);
  delete from public.hunt_players p
  using public.organizations o
  where p.organization_id = o.id
    and o.data_retention_months is not null
    and p.created_at < pg_catalog.now()
      - pg_catalog.make_interval(months => o.data_retention_months);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- purge_expired_loyalty_members — corps VERBATIM de 20260725120000, +1 ligne.
create or replace function public.purge_expired_loyalty_members()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  perform pg_catalog.set_config('lastchance.purge_maintenance', 'on', true);
  delete from public.loyalty_members m
  using public.organizations o
  where m.organization_id = o.id
    and o.data_retention_months is not null
    and coalesce(m.last_stamp_at, m.created_at) < pg_catalog.now()
      - pg_catalog.make_interval(months => o.data_retention_months);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- purge_expired_calendar_players — corps VERBATIM de 20260728120000, +1 ligne.
create or replace function public.purge_expired_calendar_players()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  perform pg_catalog.set_config('lastchance.purge_maintenance', 'on', true);
  delete from public.calendar_players pl
  using public.calendars c, public.organizations o
  where pl.calendar_id = c.id
    and c.organization_id = o.id
    and c.status = 'archived'
    and o.data_retention_months is not null
    and pl.created_at < pg_catalog.now()
      - pg_catalog.make_interval(months => o.data_retention_months);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- purge_expired_contest_players — corps VERBATIM de 00023, +1 ligne.
create or replace function public.purge_expired_contest_players()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  perform pg_catalog.set_config('lastchance.purge_maintenance', 'on', true);
  delete from public.contest_players p
  using public.organizations o
  where p.organization_id = o.id
    and o.data_retention_months is not null
    and p.created_at < pg_catalog.now()
      - pg_catalog.make_interval(months => o.data_retention_months);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ============================================================
-- La purge du registre cesse de détruire ce qu'elle promettait de garder
-- ============================================================
--
-- Seule la clause d'annulation change, et elle change PEU : une annulation ne
-- vaut « terminé » que si elle a été DÉCIDÉE. Les deux autres branches sont
-- reprises à l'identique de 20260810120000, y compris l'expiration — un lot
-- « source purgée » qui est PAR AILLEURS expiré redevient purgeable, parce
-- qu'il n'est alors plus dû à personne. C'est pourquoi la garde est placée
-- DANS la branche d'annulation et non en tête du prédicat : en tête, elle
-- aurait aussi protégé les lots expirés, et fait de `wheel` et `contest` — les
-- deux seules familles qui portent une échéance — des familles à rétention
-- infinie.
--
-- `is distinct from` et non `<>` : `cancelled_reason` est nullable, et une
-- annulation sans motif doit rester purgeable.
create or replace function public.purge_expired_reward_issuances()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.reward_issuances r
  using public.organizations o
   where o.id = r.organization_id
     -- Même fenêtre que les purges de module : c'est ce qui fait office de
     -- propagation là où aucune FK ne relie le miroir à sa source.
     and r.issued_at < pg_catalog.now() - pg_catalog.make_interval(
       months => least(greatest(coalesce(o.data_retention_months, 13), 1), 24)
     )
     -- ET terminé. Un lot encore encaissable survit à sa rétention : le perdre
     -- transformerait une purge de confidentialité en perte de valeur pour le
     -- client qui détient le code.
     and (
       r.redeemed_at is not null
       -- Une annulation ne vaut « terminé » que si elle a été DÉCIDÉE. Quand
       -- c'est la rétention elle-même qui a fait disparaître la ligne source,
       -- personne n'a annulé quoi que ce soit : le client détient toujours un
       -- code, et sept familles sur neuf n'ont aucune expiration qui viendrait
       -- le clore. Sans cette clause, la purge deviendrait son propre
       -- déclencheur et détruirait en une nuit le lot qu'elle promet de garder.
       or (r.cancelled_at is not null
           and r.cancelled_reason is distinct from 'source purgée')
       or (r.expires_at is not null and r.expires_at < pg_catalog.now())
     );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_reward_issuances()
  from public, anon, authenticated;
grant execute on function public.purge_expired_reward_issuances() to service_role;

comment on function public.purge_expired_reward_issuances() is
  'Purge RGPD du registre universel : lignes TERMINÉES au-delà de la rétention de l''organisation (repli 13 mois, plafond 24). Est TERMINÉE une ligne remise, expirée, ou annulée PAR UNE DÉCISION. Une ligne annulée parce que la rétention a emporté sa source (cancelled_reason = « source purgée ») n''est PAS terminée : le client détient encore son code et sept familles sur neuf n''ont aucune expiration — sans cette réserve la purge deviendrait son propre déclencheur. Un lot encore encaissable n''est jamais supprimé. Appelée par le cron purge-data.';

-- ============================================================
-- Le portefeuille cesse d'imputer au commerçant un geste automatique
-- ============================================================
--
-- L'écran affiche aujourd'hui un texte FIXE — « Annulé · Le commerçant a annulé
-- ce lot. » — parce que la RPC ne rendait aucune cause. Après la correction
-- ci-dessus, ce texte serait faux pour toute annulation issue de la rétention.
--
-- ⚠️ **Ce qui est rendu est une CAUSE NORMALISÉE, pas `cancelled_reason`.**
-- C'était la voie évidente et elle est écartée délibérément : ce champ est du
-- TEXTE LIBRE SAISI PAR LE COMMERÇANT (300 caractères, `cancelParticipation`
-- le lit d'un formulaire et le passe à `cancel_participation`). Le rendre ici
-- publierait des notes internes — « suspicion de fraude », « client
-- indésirable » — sur la page que le CLIENT ouvre depuis son téléphone. Le
-- portefeuille est précisément la surface dont le commentaire de
-- `player_wallet` dit qu'elle ne doit rendre que ce dont le client a besoin.
-- L'écran n'a besoin que de savoir QUI a agi ; il l'obtient sans qu'aucune
-- phrase écrite par un commerçant ne traverse la frontière.
--
-- Vocabulaire fermé, trois valeurs, `null` quand le lot n'est pas annulé :
--   * `purged`        — la rétention a emporté la source. Aucun humain n'a
--                       décidé. C'est LE cas qui ne doit pas être imputé au
--                       commerçant.
--   * `source_deleted` — geste d'entretien du commerçant (ADR-063), confirmé
--                       par une case qui nommait les codes en jeu.
--   * `merchant`      — annulation explicite d'un lot, motif à l'appui.
--
-- `drop` puis `create` — pas `create or replace` : ajouter une colonne à un
-- `returns table` CHANGE le type de retour, et Postgres refuse (42P13). C'est
-- le geste déjà employé seize fois dans ce dépôt pour la même raison, dont
-- `ops_workers_health` (20260805240000:378). Il ne détruit aucune donnée — une
-- fonction n'en porte pas — et les droits sont reposés juste après, ce qui est
-- obligatoire : le `drop` emporte aussi les `grant`.
drop function if exists public.player_wallet(text, integer);

create or replace function public.player_wallet(
  p_token_hash text,
  p_limit integer default 50
)
returns table (
  organization_id uuid,
  organization_name text,
  source_type text,
  label text,
  code text,
  status text,
  cancelled_cause text,
  issued_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_limit integer;
begin
  -- Forme du hash contrôlée AVANT toute lecture : un paramètre malformé est
  -- une absence de résultat, jamais une erreur qui distinguerait « hash
  -- inconnu » de « hash mal formé ».
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  -- Bornage du volume : un portefeuille est une page, pas un export.
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 200);

  -- Prédicat de validité d'appareil, en DEUX moitiés : l'appareil n'est pas
  -- révoqué (ou l'est mais reste en grâce, le temps qu'une rotation de jeton
  -- s'achève) ET LE JOUEUR EST ACTIF.
  --
  -- ⚠️ CE COMMENTAIRE A DÉJÀ MENTI, et c'est pour cela qu'il dit le prédicat
  -- en entier plutôt que d'en citer une ligne. Il annonçait un prédicat
  -- « repris à l'identique de 20260805140000:711 » alors que cette ligne-là
  -- n'est que la clause `revoked_at` : elle appartient à une requête dont la
  -- jointure porte `p.status = 'active'` SEIZE LIGNES PLUS HAUT (`:693-695`).
  -- Citer par numéro de ligne avait isolé la moitié du prédicat, et la moitié
  -- manquante était la garde de blocage. Ce chemin est le seul des huit qui
  -- sert des CODES DE RETRAIT ENCAISSABLES : un joueur bloqué y aurait lu des
  -- droits au porteur qu'un commerçant lui a précisément retirés.
  select d.player_id into v_player_id
    from public.player_devices d
    join public.players p
      on p.id = d.player_id
     and p.status = 'active'
   where d.token_hash = p_token_hash
     and (d.revoked_at is null or d.grace_expires_at > pg_catalog.now())
   limit 1;

  if v_player_id is null then
    return;
  end if;

  return query
  select
    r.organization_id,
    o.name,
    r.source_type,
    -- Libellé GRAVÉ (20260814120000) : ce que le client a gagné, et non ce
    -- que la récompense s'appelle aujourd'hui. Lire la table parente ferait
    -- afficher « Croissant offert » sur un lot gagné comme « Café offert ».
    r.label,
    r.code,
    -- États mutuellement exclusifs, dans l'ordre où ils priment. `redeemed`
    -- et `cancelled` sont déjà exclusifs par contrainte
    -- (`reward_issuances_terminal_state`) ; l'expiration ne s'évalue qu'en
    -- l'absence des deux — un lot retiré avant sa date reste « retiré », et
    -- l'afficher « expiré » ferait croire à un droit perdu.
    case
      when r.redeemed_at is not null then 'redeemed'
      when r.cancelled_at is not null then 'cancelled'
      when r.expires_at is not null and r.expires_at <= pg_catalog.now() then 'expired'
      else 'active'
    end as status,
    -- Cause NORMALISÉE : aucun texte écrit par un commerçant ne franchit cette
    -- frontière (voir le bloc de commentaire ci-dessus). Les deux littéraux
    -- comparés sont le vocabulaire posé par
    -- `cancel_reward_issuance_on_source_delete`, plus haut dans CE fichier.
    case
      when r.cancelled_at is null then null
      when r.cancelled_reason = 'source purgée' then 'purged'
      when r.cancelled_reason = 'source supprimée' then 'source_deleted'
      else 'merchant'
    end as cancelled_cause,
    r.issued_at,
    r.expires_at
    from public.reward_issuances r
    join public.organizations o on o.id = r.organization_id
   where r.player_id = v_player_id
     and r.code is not null
   -- Groupé par organisation : le client lit « chez qui », puis « quoi ». Le
   -- tri porte le regroupement, l'appelant n'a qu'à découper sur le nom.
   order by o.name, r.issued_at desc
   limit v_limit;
end;
$$;

comment on function public.player_wallet(text, integer) is
  'Portefeuille d''un joueur : ses récompenses des neuf familles, groupées par organisation (tri nom puis date), avec le libellé GRAVÉ, l''échéance, l''état (active/redeemed/cancelled/expired) et, quand l''état est cancelled, la CAUSE normalisée (purged / source_deleted / merchant). La cause est un vocabulaire fermé et NON le champ cancelled_reason : celui-ci est du texte libre saisi par le commerçant, qu''on ne publie pas sur l''écran du client. Entrée = le sha256 du cookie lc-player, jamais un identifiant de joueur : aucun jeton ne doit circuler en URL, un lien partageable listant des codes serait une fuite. LE CODE DE RETRAIT EST UN SECRET PORTEUR : il est rendu parce que le client en a besoin, mais ne doit JAMAIS être journalisé — ni Sentry, ni journal applicatif, ni ops_metrics, ni analytique. Appareil révoqué hors grâce = zéro ligne, joueur bloqué = zéro ligne. service_role uniquement : la page est publique, l''appel est serveur.';

-- ADR-049 : les trois rôles sont révoqués explicitement. `revoke … from
-- public, anon` seul laisserait `authenticated` ET `service_role` en place,
-- réaccordés par l'`alter default privileges` que Supabase pose à
-- l'initialisation du projet.
revoke all on function public.player_wallet(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.player_wallet(text, integer) to service_role;
