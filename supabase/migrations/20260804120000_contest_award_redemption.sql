-- ============================================================
-- Lastchance — Encaissement en caisse des récompenses de pronostics
--
-- Constat : contest_awards porte déjà un code PRONO-… généré à la
-- clôture (finalize_contest), le joueur le voit et l'UI lui dit de le
-- présenter en caisse. Mais le moteur d'encaissement ne connaissait que
-- 8 sources (wheel / hunt / loyalty / jackpot / event / calendar /
-- referral / quiz) : les pronostics n'avaient QUE
-- set_contest_award_status, réservée à is_org_editor — un caissier ne
-- pouvait pas remettre le lot. On comble le trou.
--
-- 1. Une seule colonne de vérité pour la remise : delivered_at devient
--    redeemed_at, aligné sur les 7 modules frères (quiz_rewards,
--    calendar_rewards…), plutôt que deux horodatages qui divergent.
-- 2. Expiration SERVEUR du code, sur le modèle de la roue : TTL au
--    niveau du championnat, échéance figée en base à l'émission,
--    VÉRIFIÉE par la RPC de remise (une capture d'écran ne suffit pas).
-- 3. redeem_contest_award : la caisse (service_role), org-scopée,
--    idempotente, auditée, indistinguable pour un code inconnu.
-- 4. set_contest_award_status reste l'outil de l'ÉDITEUR (annulation
--    motivée, remise depuis le dashboard) : deux chemins, deux ACL.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Cycle de vie de la récompense
-- ────────────────────────────────────────────────────────────
alter table public.contest_awards
  rename column delivered_at to redeemed_at;

comment on column public.contest_awards.redeemed_at is
  'Remise effective du lot (null : jamais remis). Colonne de vérité unique, alignée sur quiz_rewards.redeemed_at.';

alter table public.contest_awards
  add column if not exists redeemed_by text
    check (redeemed_by is null or char_length(redeemed_by) <= 120),
  add column if not exists basket_cents integer
    check (basket_cents is null or basket_cents >= 0),
  add column if not exists redeem_expires_at timestamptz;

comment on column public.contest_awards.redeemed_by is
  'Acteur de la remise (caissier ou membre de l''équipe) — miroir de quiz_rewards.redeemed_by.';
comment on column public.contest_awards.basket_cents is
  'Montant du panier saisi en caisse à la remise (facultatif) — revenu attribuable, comme participations.basket_cents.';
comment on column public.contest_awards.redeem_expires_at is
  'Expiration SERVEUR du code de retrait (null : sans limite). Vérifiée par redeem_contest_award.';

-- Normalisation défensive AVANT la contrainte. En théorie aucune ligne
-- ne dévie (finalize_contest insère pending/null, set_contest_award_status
-- n'agit que sur du pending et pose l'horodatage avec le statut), mais on
-- ne pose pas une contrainte d'intégrité sur une hypothèse.
update public.contest_awards
   set redeemed_at = created_at
 where status = 'delivered' and redeemed_at is null;
-- Le statut fait foi : un lot annulé ou en attente n'a pas d'horodatage
-- de remise.
update public.contest_awards
   set redeemed_at = null
 where status <> 'delivered' and redeemed_at is not null;

-- L'état incohérent (« remis sans date », « daté sans être remis »)
-- devient IMPOSSIBLE : les deux chemins d'écriture (RPC caisse et RPC
-- éditeur) sont contraints par la base, pas par la discipline du code.
alter table public.contest_awards
  add constraint contest_awards_delivered_consistency
  check ((status = 'delivered') = (redeemed_at is not null));

-- La remise se fait par (organisation, code) : cette lecture doit désigner
-- AU PLUS une ligne. L'unicité existante n'était que par championnat —
-- deux championnats d'une même organisation pouvaient théoriquement porter
-- le même code, et l'UPDATE de la caisse en aurait remis deux d'un coup.
--
-- CONTRÔLE PRÉ-DÉPLOIEMENT. `if not exists` ne protège que de la
-- RE-création : si des doublons préexistent en production, l'index échoue
-- sur un « could not create unique index » qui ne dit ni combien de lignes
-- sont en cause ni quoi en faire. On lève donc d'abord une erreur
-- explicite et actionnable, pour qu'un échec d'application se diagnostique
-- en une lecture du message.
do $$
declare
  v_dupes integer;
begin
  select count(*) into v_dupes
  from (
    select 1
      from public.contest_awards
     group by organization_id, code
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception
      'contest_awards : % couple(s) (organization_id, code) en double — l''index unique contest_awards_org_code_uniq ne peut pas être créé',
      v_dupes
      using hint =
        'Lister les doublons : select organization_id, code, count(*) '
        || 'from public.contest_awards group by 1, 2 having count(*) > 1; '
        || 'puis régénérer le code des lots NON ENCORE REMIS (status = ''pending'') '
        || 'de chaque groupe avant de rejouer la migration. '
        || 'Ne jamais toucher au code d''un lot déjà remis : il est référencé par l''audit.';
  end if;
end
$$;

create unique index if not exists contest_awards_org_code_uniq
  on public.contest_awards (organization_id, code);

-- ────────────────────────────────────────────────────────────
-- 2. Expiration du code de retrait
-- ────────────────────────────────────────────────────────────
-- Même nom, même unité (secondes) et même trigger que
-- campaigns.code_ttl_seconds, mais BORNES DÉLIBÉRÉMENT DIFFÉRENTES —
-- ce n'est pas une erreur de copie :
--   · campagnes (roue) : 10 s à 600 s. Le décompte part quand le joueur
--     vient de gagner et se trouve DEVANT la caisse ; la fenêtre courte
--     est justement ce qui empêche de réutiliser une capture d'écran.
--   · pronostics : 1 h à 90 j. Le décompte part de la CLÔTURE du
--     championnat, pas d'un joueur présent en boutique. Le gagnant doit
--     être prévenu puis se déplacer : toute borne de l'ordre de la minute
--     expirerait 100 % des codes avant le premier retrait possible.
-- `null` (défaut, et valeur de toutes les lignes existantes) = pas
-- d'expiration : rien ne casse tant que la colonne n'est pas renseignée.
alter table public.contests
  add column if not exists code_ttl_seconds integer
    check (code_ttl_seconds is null
           or code_ttl_seconds between 3600 and 7776000);

comment on column public.contests.code_ttl_seconds is
  'Durée de validité du code de retrait, en secondes (null : sans limite). Bornes 1 h à 90 j — plus larges que campaigns.code_ttl_seconds car le décompte part de la clôture du championnat, pas du passage en caisse.';

-- Le réglage doit être ATTEIGNABLE, sinon l'expiration est du code mort :
-- 20260721150000 a réduit l'UPDATE de `contests` à une liste blanche de
-- colonnes, il faut donc l'y ajouter explicitement. Un simple entier borné
-- par un CHECK et cadré par la RLS existante ne justifie pas une RPC
-- dédiée (contrairement à `status` / `rewards`, qui portent des règles
-- métier et un audit). La liste blanche est réémise en entier : un
-- `grant update (col)` supplémentaire s'ajoute aux privilèges déjà là,
-- il ne les remplace pas.
grant update (name, collect_email, collect_phone, code_ttl_seconds)
  on public.contests to authenticated;

-- À chaque émission : l'échéance est figée en base à l'insertion —
-- calque de set_participation_redeem_expiry.
create or replace function public.set_contest_award_redeem_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ttl integer;
begin
  if new.redeem_expires_at is null then
    select c.code_ttl_seconds into v_ttl
      from public.contests c where c.id = new.contest_id;
    if v_ttl is not null then
      new.redeem_expires_at := pg_catalog.now()
        + pg_catalog.make_interval(secs => v_ttl);
    end if;
  end if;
  return new;
end;
$$;

-- CREATE FUNCTION accorde l'EXECUTE à PUBLIC par défaut : le retirer tout
-- de suite (le trigger n'a besoin d'aucun droit d'appel côté clients).
-- Sans ça, l'audit générique pgTAP « PUBLIC has no EXECUTE on public
-- functions » échoue — c'est l'oubli qu'a dû corriger 20260722160000 sur
-- la fonction trigger jumelle set_participation_redeem_expiry.
revoke all on function public.set_contest_award_redeem_expiry()
  from public, anon, authenticated;

drop trigger if exists contest_awards_set_redeem_expiry on public.contest_awards;
create trigger contest_awards_set_redeem_expiry
  before insert on public.contest_awards
  for each row execute function public.set_contest_award_redeem_expiry();

-- ────────────────────────────────────────────────────────────
-- 3. RPC caisse : remise d'un lot de pronostics
-- ────────────────────────────────────────────────────────────
-- Miroir de redeem_quiz_reward / redeem_by_code : recherche + validation
-- + audit atomiques, actor obligatoire, org-scopée. Un code inconnu, déjà
-- remis, annulé, expiré, ou appartenant à une AUTRE organisation ne
-- provoque aucune remise — et pour l'inconnu comme pour le cross-org la
-- réponse est INDISTINGUABLE (aucune ligne : pas d'oracle d'existence).
create or replace function public.redeem_contest_award(
  p_organization_id uuid,
  p_code text,
  p_actor text,
  p_basket_cents integer default null
)
returns table(
  id uuid, code text, created_at timestamptz, redeemed_at timestamptz,
  redeem_expires_at timestamptz, status text, rank integer,
  reward_label text, contest_name text, player_name text,
  basket_cents integer, redeemed_now boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_id uuid;
begin
  if p_actor is null or pg_catalog.length(p_actor) = 0 then
    raise exception 'actor required';
  end if;
  if p_basket_cents is not null and p_basket_cents < 0 then
    raise exception 'invalid basket';
  end if;
  -- `coalesce` nu : construction du parseur, pas une fonction du catalogue
  -- (cf. 20260721190000) — la qualifier compilerait mais échouerait à
  -- l'exécution. Sans danger sous search_path = ''.
  v_code := pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')));

  update public.contest_awards a
     set status = 'delivered',
         redeemed_at = pg_catalog.now(),
         redeemed_by = p_actor,
         basket_cents = p_basket_cents
   where a.organization_id = p_organization_id
     and a.code = v_code
     -- Le championnat ET le joueur doivent AUSSI appartenir à
     -- l'organisation qui encaisse. contest_awards.organization_id est
     -- censé être redondant avec eux (finalize_contest les écrit depuis
     -- le même appel), mais RIEN en base ne le garantit — ni CHECK ni
     -- trigger — et service_role peut mettre à jour la table. On ne fait
     -- donc pas confiance à la seule colonne dénormalisée : un lot
     -- désaligné (ré-affectation, fusion d'organisations, correctif
     -- manuel) n'est PAS remis, et la lecture finale ci-dessous applique
     -- exactement le même filtre — sinon l'UPDATE consommerait le lot
     -- pendant que la caisse afficherait « code inconnu ».
     and exists (
           select 1 from public.contests c
            where c.id = a.contest_id
              and c.organization_id = p_organization_id)
     and exists (
           select 1 from public.contest_players pl
            where pl.id = a.player_id
              and pl.organization_id = p_organization_id)
     -- Idempotence : le second appel ne matche plus rien.
     and a.redeemed_at is null
     -- Deny-by-default : seul un lot EN ATTENTE se remet. Couvre le refus
     -- des lots annulés par le commerçant, et refusera aussi tout statut
     -- ajouté plus tard sans qu'on y repense.
     and a.status = 'pending'
     -- L'expiration fait foi ICI : un code photographié ne passe plus une
     -- fois l'échéance atteinte.
     and (a.redeem_expires_at is null or a.redeem_expires_at > pg_catalog.now())
  returning a.id into v_id;

  if v_id is not null then
    insert into public.audit_logs (organization_id, actor, action, metadata)
    values (p_organization_id, p_actor, 'contest.award.redeem',
            pg_catalog.jsonb_build_object(
              'award_id', v_id, 'basket_cents', p_basket_cents));
  end if;

  -- Renvoyé dans tous les cas où le code existe chez CETTE organisation :
  -- la caisse doit pouvoir expliquer un refus (déjà remis, annulé, expiré).
  --
  -- Les DEUX jointures sont org-scopées, pas seulement contest_awards :
  -- c.name (le championnat) et pl.first_name (le PRÉNOM DU GAGNANT) sont
  -- les deux champs affichés au comptoir. Se reposer sur la seule
  -- redondance de a.organization_id ferait fuiter ces données d'une autre
  -- organisation dès la première désynchronisation. Filtre identique à
  -- celui de l'UPDATE ci-dessus, et au chemin de lecture jumeau
  -- lookupContestAwardByCode.
  return query
  select a.id, a.code, a.created_at, a.redeemed_at, a.redeem_expires_at,
         a.status, a.rank, a.reward_label, c.name, pl.first_name,
         a.basket_cents, (a.id is not distinct from v_id)
    from public.contest_awards a
    join public.contests c
      on c.id = a.contest_id
     and c.organization_id = p_organization_id
    join public.contest_players pl
      on pl.id = a.player_id
     and pl.organization_id = p_organization_id
   where a.organization_id = p_organization_id
     and a.code = v_code
   limit 1;
end;
$$;

comment on function public.redeem_contest_award(uuid, text, text, integer) is
  'Remise en caisse d''un code PRONO-… : org-scopée, actor obligatoire, idempotente, refuse les lots annulés ou expirés, auditée, réponse indistinguable pour un code inconnu ou d''une autre organisation.';

revoke all on function public.redeem_contest_award(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.redeem_contest_award(uuid, text, text, integer)
  to service_role;

-- ────────────────────────────────────────────────────────────
-- 4. Machine à états ÉDITEUR — suit le renommage
-- ────────────────────────────────────────────────────────────
-- Inchangée par ailleurs : annuler un lot (motif ≥ 10 caractères) et le
-- marquer remis depuis le dashboard restent des décisions d'éditeur. La
-- caisse, elle, passe par redeem_contest_award (service_role).
create or replace function public.set_contest_award_status(
  p_organization_id uuid,
  p_award_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_contest uuid;
  v_player uuid;
  v_actor text;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('delivered', 'cancelled') then
    raise exception 'invalid status';
  end if;
  v_actor := coalesce(auth.uid()::text, auth.role(), 'system');

  select a.status, a.contest_id, a.player_id
    into v_current, v_contest, v_player
  from public.contest_awards a
  where a.id = p_award_id and a.organization_id = p_organization_id
  for update;
  if not found then return false; end if;
  if v_current <> 'pending' then
    raise exception 'award already settled';
  end if;
  if p_status = 'cancelled'
     and (p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 10)
  then
    raise exception 'locked: reason required';
  end if;

  update public.contest_awards
  set status = p_status,
      redeemed_at = case when p_status = 'delivered' then pg_catalog.now() end,
      redeemed_by = case when p_status = 'delivered' then v_actor end
  where id = p_award_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    v_actor,
    case when p_status = 'delivered'
      then 'contest.award.deliver' else 'contest.award.cancel' end,
    pg_catalog.jsonb_build_object(
      'contest_id', v_contest,
      'award_id', p_award_id,
      'player_id', v_player,
      'reason', case when p_status = 'cancelled' then pg_catalog.btrim(p_reason) end
    )
  );
  return true;
end;
$$;

revoke all on function public.set_contest_award_status(uuid,uuid,text,text)
  from public, anon;
grant execute on function public.set_contest_award_status(uuid,uuid,text,text)
  to authenticated, service_role;
