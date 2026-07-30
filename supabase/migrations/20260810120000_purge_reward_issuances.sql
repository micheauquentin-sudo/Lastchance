-- ============================================================
-- Lastchance — Rétention du REGISTRE UNIVERSEL DES RÉCOMPENSES
--
-- ── Le trou ──
--
-- `reward_issuances` n'avait NI purge NI propagation de suppression. Les dix
-- triggers de miroir (`20260805150000:643-672`) sont `after insert or update` —
-- jamais `after delete` — et `source_id` est polymorphe, sans clé étrangère :
-- rien ne relie mécaniquement la ligne de registre à la ligne source.
--
-- Conséquence : quand la purge RGPD d'un module supprime ses données, le
-- registre CONSERVE indéfiniment le code de retrait, le libellé du lot, le
-- panier encaissé et l'identifiant du caissier qui l'a remis. Le `player_id`
-- est bien neutralisé (`on delete set null`), mais le reste survit.
--
-- **Aggravé par la migration 20260807120000**, qui vient d'y rétro-alimenter
-- tout le parc historique : le registre est passé d'un miroir des émissions
-- récentes à une copie de l'intégralité de l'historique. J'ai écrit cette
-- rétro-alimentation sans voir qu'elle atterrissait dans une table sans
-- rétention.
--
-- ── La règle retenue, et pourquoi celle-là ──
--
-- Miroir exact de `purge_expired_experience_events` : la rétention déclarée par
-- l'organisation, repli à 13 mois quand elle n'en a pas déclaré, plafond à
-- 24 mois. Choisir la MÊME fenêtre que les purges de module fait de cette purge
-- la propagation qu'aucune clé étrangère ne peut assurer : la ligne source et
-- son miroir disparaissent au même âge, sans avoir à poser dix triggers
-- `after delete` sur dix tables.
--
-- ── La réserve qui compte ──
--
-- On ne supprime JAMAIS un lot encore encaissable. Un code non remis, non
-- annulé et non expiré reste au registre quel que soit son âge : le supprimer
-- ferait dire « code introuvable » à un caissier tenant un lot valide — très
-- exactement le symptôme que le registre existe pour éviter, et celui contre
-- lequel tout ce chantier s'est battu.
--
-- Un lot est purgeable s'il est TERMINÉ : remis, annulé, ou expiré. Sans date
-- d'expiration ET jamais remis, il reste — c'est le cas d'un lot à durée
-- illimitée, que seul le commerçant peut clore.
-- ============================================================

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
       or r.cancelled_at is not null
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
  'Purge RGPD du registre universel : lignes TERMINÉES (remises, annulées ou expirées) au-delà de la rétention de l''organisation (repli 13 mois, plafond 24). Un lot encore encaissable n''est jamais supprimé. Appelée par le cron purge-data.';
