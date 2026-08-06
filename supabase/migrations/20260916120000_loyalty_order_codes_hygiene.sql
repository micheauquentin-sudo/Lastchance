-- ============================================================
-- QR de commande — deux dettes d'hygiène du lot C (revue sécurité)
--
-- FAIBLE 2 — LA RÉSURRECTION DU PAUVRE. 20260915120000 accordait `delete` à
-- `authenticated` en le nommant « la révocation du pauvre » (en-tête, lignes
-- 39-44). Mais un éditeur peut LIRE le jeton d'une ligne consommée (policy
-- member select), la SUPPRIMER, puis la RÉINSÉRER avec le même token : la
-- nouvelle ligne repart avec `consumed_at is null`, et le QR déjà distribué
-- retamponne. La portée est strictement intra-tenant (RLS is_org_editor + FK
-- composite + unicité globale du token), mais le cycle delete/insert défait le
-- SEUL verrou du §7 — `consumed_at`. Le lot est un MVP explicitement SANS
-- révocation (même en-tête) : on RETIRE le droit `delete` plutôt que d'ajouter
-- un statut « annulé ». Pas de révocation du tout est cohérent ; une
-- révocation qui ressuscite ne l'est pas. Aucun code applicatif ne supprimait
-- cette table (les seuls `.delete()` de src/actions/loyalty.ts portent sur
-- loyalty_programs et loyalty_milestones) — le retrait ne casse aucun appelant.
-- `service_role` GARDE `delete` : il en a besoin pour la cascade et l'admin.
--
-- FAIBLE 3 — LE LABEL SURVIT À LA PURGE RGPD. `purge_expired_loyalty_members`
-- efface les passeports dormants ; la FK simple `on delete set null` met
-- `consumed_member_id` à null mais LAISSE la ligne loyalty_order_codes avec son
-- `label`. Ce champ est LIBRE (120 car.) — l'écran suggère « CMD-2026-0412 »
-- mais rien n'interdit un nom ou une adresse. Ce n'est pas une fuite (label
-- n'est ni exposé par ORDER_CODE_COLUMNS ni par OrderCodeContext), c'est un
-- défaut de RÉTENTION : rien ne purge cette table. On étend donc la purge pour
-- effacer `label` des codes CONSOMMÉS au-delà de la fenêtre de rétention de
-- l'organisation, en gardant `consumed_at` — le verrou anti-rejeu doit
-- survivre à l'oubli du client (« un jeton dépensé le reste »).
--
-- ── POURQUOI `create or replace` ET NON `drop` + `create` (ADR-082) ──────────
-- La signature de `purge_expired_loyalty_members()` NE CHANGE PAS (zéro arg,
-- retourne bigint). Un `create or replace` sur une signature identique
-- PRÉSERVE l'ACL : les `revoke all … from public, anon, authenticated` +
-- `grant execute … to service_role` posés en 20260725120000 restent en vigueur.
-- Un `drop function` les emporterait (EXECUTE reviendrait à PUBLIC) — c'est
-- exactement le piège ADR-082, et le contourner ici, c'est simplement NE PAS
-- droper. Le pgTAP relit malgré tout l'ACL au catalogue, par sécurité.
--
-- Le corps est repris VERBATIM de la dernière définition (20260902120000:456,
-- « corps VERBATIM de 20260725120000, +1 ligne » — le set_config du drapeau
-- lastchance.purge_maintenance), avec une SEULE addition : l'UPDATE qui efface
-- les labels. L'addition ne touche pas `v_deleted` : la fonction retourne
-- toujours le nombre de PASSEPORTS supprimés (le cron somme cette valeur).
-- ============================================================

-- ── FAIBLE 2 : retrait du droit delete pour la session marchande ─────────────
revoke delete on table public.loyalty_order_codes from authenticated;

-- Le commentaire de table corrige « la révocation du pauvre » : il n'y a
-- désormais AUCUNE révocation en MVP, et c'est un choix cohérent (le droit
-- delete a été retiré ici parce qu'il ressuscitait un jeton dépensé).
comment on table public.loyalty_order_codes is
  'QR de commande à usage unique (livraison/e-commerce) : un jeton non devinable par commande, consommé UNE SEULE FOIS par record_loyalty_stamp pour créer ou continuer un passeport. Le jeton contourne le cooldown du programme — deux commandes le même jour valent deux tampons — parce que l''anti-abus est porté par consumed_at, pas par min_stamp_interval_seconds. Pas d''expiration NI de révocation en MVP : le droit delete d''authenticated a été RETIRÉ en 20260916120000 parce que le cycle delete/réinsertion du même token remettait consumed_at à null et ressuscitait un jeton déjà dépensé (seul service_role conserve delete). Le label des codes CONSOMMÉS est effacé par purge_expired_loyalty_members au-delà de data_retention_months (RGPD), consumed_at étant conservé.';

-- ── FAIBLE 3 : la purge efface le label des codes consommés hors rétention ───
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

  -- FAIBLE 3 (RGPD) : effacer le SEUL champ libre d'un code CONSOMMÉ au-delà
  -- de la rétention. Fenêtre calquée MOT POUR MOT sur la purge des passeports
  -- ci-dessus, mais bornée par consumed_at — la « dernière activité » d'un
  -- code est sa consommation. On garde consumed_at (le verrou du §7 : un jeton
  -- dépensé le reste) et le token (tirage aléatoire, jamais de PII). Les codes
  -- NON consommés (à distribuer) sont intouchés : `consumed_at is not null` les
  -- exclut. data_retention_months null = pas de purge (opt-in commerçant),
  -- comme pour les passeports. Sous auth.uid() null (cron), le trigger d'audit
  -- de la table no-ope : aucun bruit dans audit_logs.
  update public.loyalty_order_codes c
     set label = null
    from public.organizations o
   where c.organization_id = o.id
     and c.consumed_at is not null
     and c.label is not null
     and o.data_retention_months is not null
     and c.consumed_at < pg_catalog.now()
       - pg_catalog.make_interval(months => o.data_retention_months);

  return v_deleted;
end;
$$;

-- ADR-082 : signature identique ⇒ `create or replace` conserve l'ACL héritée
-- (revoke public/anon/authenticated + grant execute service_role, 20260725120000).
-- Aucune réémission nécessaire ; le pgTAP le vérifie au catalogue.
