-- ============================================================
-- Lastchance — Un lot dont la source a été PURGÉE finit par se taire
--
-- ── Le trou, et il est ouvert par le correctif précédent ──
--
-- `20260902120000` a fermé un défaut réel (une ligne de registre orpheline que
-- le client lisait « à retirer » pendant que la caisse la refusait) et, pour ne
-- pas transformer un correctif d'affichage en annulateur de masse, il a EXCLU
-- de la purge du registre les annulations dont la cause est la rétention :
--
--     and r.cancelled_reason is distinct from 'source purgée'
--
-- Cette clause n'a pas d'échéance. Or `sync_reward_issuance` écrit
-- `null::timestamptz as expires_at` pour HUIT de ses dix branches
-- (20260805150000:320,350,383,412,441,474,518,554 — hunt, loyalty, jackpot,
-- event, calendar ×2, referral, quiz) ; seules la roue et les pronostics
-- reportent une échéance, et encore : `participations.redeem_expires_at` et
-- `contest_awards.redeem_expires_at` sont nullables tous les deux.
--
-- Conséquence mesurable : pour ces sept familles, une ligne annulée par la
-- rétention n'est terminale pour AUCUNE des trois branches du prédicat — ni
-- remise, ni expirée, ni annulée-par-décision. Aucun chemin ne la supprime
-- jamais. Elle porte un `player_id`, et il n'existe aucune purge de
-- `public.players` : la ligne reste rattachable à une personne, sans fin.
--
-- ── L'arbitrage : ni conservation infinie, ni destruction immédiate ──
--
-- Les deux bornes sont réelles et il ne faut sacrifier ni l'une ni l'autre.
--
--   * On ne redétruit pas ce que 20260902120000 protège. La raison de cette
--     protection tient : au moment où la purge du module emporte la source, le
--     lot était peut-être ENCORE DÛ — sept familles sur neuf n'ayant aucune
--     échéance, rien ne l'avait clos, et le client détient toujours son code.
--   * Mais après ce moment, la ligne est DÉFINITIVEMENT INENCAISSABLE, et par
--     deux chemins indépendants : `routeRedeemCode` relit la table parente et
--     ne la trouve plus, et `redeem_reward_by_code` refuse sur `cancelled_at`
--     avant même de regarder ailleurs. Sa seule valeur restante est
--     d'EXPLIQUER — au client qui ouvre `/portefeuille`, au caissier qui a le
--     client en face. Une explication a de la valeur ; elle n'en a pas
--     indéfiniment, et une donnée personnelle conservée sans fin est
--     exactement ce que la rétention cherche à éviter.
--
-- Donc : un délai de grâce. Ce que ce fichier ajoute est une échéance à
-- l'EXPLICATION, pas une réouverture de la destruction du lot.
--
-- ── LA DURÉE : trois mois, et pourquoi celle-là ──
--
-- Une durée arbitraire non justifiée est le reproche que ce dépôt fait à ses
-- propres migrations. Les trois appuis sont mesurés dans ce dépôt, pas
-- inventés ici :
--
--   1. C'est la plus longue vie que ce produit accorde JAMAIS à un code de
--      retrait. `contests.code_ttl_seconds` est borné à 7 776 000 s
--      (20260804120000:125), soit 90 jours — le délai maximal qu'un commerçant
--      peut poser entre la clôture d'un championnat et le comptoir.
--      L'explication survit donc, par construction, au plus long délai que le
--      produit demande jamais à un client de respecter.
--   2. C'est le quart de la fenêtre de rétention la plus COURTE qu'un
--      commerçant puisse réellement déclarer : le formulaire n'offre que 12,
--      24, 36 mois ou « illimité » (`data-retention-form.tsx:8-13`).
--      L'explication ne devient donc jamais la part dominante de la vie de la
--      ligne, quelle que soit l'organisation.
--   3. C'est une durée PROPRE À CE BUT, et non `data_retention_months`
--      réappliquée. La fenêtre déclarée par l'organisation gouverne la
--      légitimité de la trace d'une PARTICIPATION ; expliquer une annulation
--      est une autre finalité, et lui donner sa propre durée — plus courte —
--      est la seule lecture qui ne fasse pas garder trois ans une explication
--      à une organisation qui a déclaré 36 mois.
--
-- L'unité est le MOIS et non le jour, par homogénéité avec le reste de la
-- fonction, qui ne compte qu'en mois.
--
-- ── LE POINT DE DÉPART : `cancelled_at`, jamais `issued_at` ──
--
-- La ligne devient une explication à l'instant où elle est annulée : c'est
-- cette horloge-là qui doit courir. `issued_at` serait le mauvais repère, et
-- pas seulement par élégance — il est DÉJÀ épuisé au moment de l'annulation
-- pour la famille la plus fréquente : `sync_reward_issuance` reporte
-- `participations.created_at` dans `issued_at`, et c'est le critère EXACT que
-- `purge_expired_personal_data` vient d'appliquer pour supprimer la source.
-- Ancrer la grâce sur `issued_at` la rendrait donc nulle pour la roue et
-- rouvrirait, dès le passage suivant du cron, très exactement le trou fermé le
-- 2026-08-03.
--
-- La grâce est ANDée avec le critère d'âge existant, jamais substituée : la
-- ligne doit satisfaire les DEUX. Le délai réel est donc le maximum des deux
-- horloges. C'est le sens conservateur, et il compte pour les familles où
-- l'émission suit de loin la création de la ligne joueur (une chasse commencée
-- il y a treize mois, complétée le mois dernier : la grâce sera écoulée bien
-- avant le critère d'âge, et c'est lui qui commandera).
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS, dit ici plutôt que découvert ──
--
--   * Elle ne donne d'échéance à aucune des sept familles. Un lot de ces
--     familles NON annulé et jamais remis reste conservé sans fin, comme le
--     veut 20260810120000 (« que seul le commerçant peut clore »). Seul le
--     sous-ensemble « source purgée » est borné ici.
--   * Elle ne change rien à la roue et aux pronostics quand leur échéance est
--     passée : la troisième branche du prédicat les emportait déjà et continue
--     de le faire, sans attendre la grâce. La grâce ne les concerne que si leur
--     `expires_at` est nul ou encore à venir.
--   * Elle ne touche ni `public.players`, ni le `player_id` porté par la ligne.
--     Ce qui est borné ici, c'est la ligne de registre, pas l'identité derrière.
-- ============================================================

create or replace function public.purge_expired_reward_issuances()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
  -- Délai de grâce de l'EXPLICATION — voir l'en-tête pour les trois appuis.
  -- Il court depuis `cancelled_at`, s'applique au seul motif « source purgée »,
  -- et se conjugue au critère d'âge : jamais à sa place.
  v_grace_explication constant interval := pg_catalog.make_interval(months => 3);
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
       -- Une annulation ne vaut « terminé » que si elle a été DÉCIDÉE — OU si
       -- l'explication qu'elle porte a fait son temps. Quand c'est la rétention
       -- qui a fait disparaître la ligne source, personne n'a annulé quoi que
       -- ce soit : le client détient toujours un code et sept familles sur neuf
       -- n'ont aucune expiration qui viendrait le clore. La ligne reste donc,
       -- non pour être encaissée — elle ne peut plus l'être — mais pour dire au
       -- client et au caissier ce qui s'est passé. Passé le délai de grâce,
       -- cette explication n'explique plus rien d'actuel, et la garder revient
       -- à conserver sans fin une ligne rattachable à une personne.
       or (r.cancelled_at is not null
           and (r.cancelled_reason is distinct from 'source purgée'
                or r.cancelled_at < pg_catalog.now() - v_grace_explication))
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
  'Purge RGPD du registre universel : lignes TERMINÉES au-delà de la rétention de l''organisation (repli 13 mois, plafond 24). Est TERMINÉE une ligne remise, expirée, annulée PAR UNE DÉCISION, ou annulée par la rétention depuis plus de TROIS MOIS. Une ligne annulée parce que la rétention a emporté sa source (cancelled_reason = « source purgée ») n''est pas encaissable et ne le redeviendra pas : elle est conservée trois mois à compter de cancelled_at pour EXPLIQUER au client et au caissier ce qui s''est passé, puis supprimée — trois mois étant la plus longue vie qu''un code de retrait puisse avoir dans ce produit (contests.code_ttl_seconds <= 7776000 s) et le quart de la plus courte rétention déclarable. Le délai s''ajoute au critère d''âge, il ne s''y substitue pas. Un lot encore encaissable n''est jamais supprimé. Appelée par le cron purge-data.';
