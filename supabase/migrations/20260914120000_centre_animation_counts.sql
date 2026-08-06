-- ============================================================
-- COMPTEURS DU « CENTRE D'ANIMATION » (accueil du dashboard)
--
-- L'accueil commerçant veut afficher cinq chiffres : combien de brouillons
-- dorment, combien d'expériences sont en ligne, combien de QR n'ont jamais été
-- ouverts, combien de lots sont sous leur seuil de stock, et combien de
-- récompenses attendent d'être remises au comptoir.
--
-- ── POURQUOI UNE RPC, ET NON SIX COMPTAGES POSTGREST ──
--
-- Ces cinq chiffres balaient VINGT ET UNE tables (neuf modules publiables, dix
-- tables d'émission de récompenses, `qr_codes`, `prizes`). Compté depuis le
-- client, c'est une vingtaine d'allers-retours PostgREST ajoutés à une page qui
-- en fait déjà deux (`org_dashboard_summary`, `org_experience_analytics`, tous
-- deux en `Promise.all`). Une RPC unique, calquée sur `org_dashboard_summary`
-- (migration 00019), garde le coût à un aller-retour et — c'est le point qui
-- compte le plus — garde le PRÉDICAT en base, à un seul endroit, plutôt que
-- réparti dans six requêtes clientes qui divergeront.
--
-- ── CE QUE « À REMETTRE » VEUT DIRE, ET POURQUOI CE N'EST PAS `redeemed_at
--    IS NULL` ──
--
-- L'inventaire canonique est la page caisse (`src/app/dashboard/redeem/`) : ce
-- qu'elle sait chercher est exactement ce que le commerçant peut remettre. Trois
-- écarts avec un comptage naïf, tous dans le sens de la SURESTIMATION — un
-- chiffre qui promet des remises impossibles :
--
--   1. UN CODE EXPIRÉ NE SE REMET PAS. Les huit moteurs de remise portent
--      depuis 20260904120000 le prédicat `(redeem_expires_at is null or
--      redeem_expires_at > now())` ; la base refuserait. Reproduit mot pour mot
--      ici, au caractère près, pour que le compteur et le refus disent la même
--      chose.
--   2. UNE LIGNE SANS CODE N'EST PAS UNE RÉCOMPENSE. `participations` en
--      fabrique une à chaque tour PERDANT (`redeem_code is null`), une case de
--      calendrier sans lot n'a pas de code, une récompense de fidélité en
--      POINTS non plus (`reward_type <> 'lot'`), ni un versement de parrainage
--      qui n'est pas un lot (`kind <> 'lot'`). Sans ces filtres le compteur
--      annonce des lots qui n'existent pas.
--   3. UNE LIGNE ANNULÉE NE SE REMET PAS — mais l'annulation n'est PAS portée
--      de la même façon partout, et ce n'est pas une négligence : seules deux
--      familles ont un chemin d'annulation par le commerçant, `participations`
--      (colonne `cancelled_at`) et `contest_awards` (`status = 'cancelled'`).
--      Les huit autres n'ont ni l'un ni l'autre, et c'est cohérent : leur
--      annulation ne survient qu'à la DISPARITION de la source (purge de
--      rétention, suppression en cascade — 20260902120000), qui efface la ligne
--      elle-même. Lire une ligne vivante y prouve donc qu'elle n'est pas
--      annulée. C'est exactement ce que fait la page caisse, dont les cartes
--      chasse/fidélité/jackpot/calendrier/événement/parrainage/quiz ne testent
--      que `redeemed_at`.
--
-- ── LA DIXIÈME TABLE ──
--
-- Le calendrier de l'Avent émet par DEUX tables, pas une : `calendar_openings`
-- (la case du jour) et `calendar_rewards` (la récompense d'assiduité). La page
-- caisse les cherche l'une après l'autre et `redeem_calendar_reward` porte deux
-- UPDATE pour cette raison. Ne compter que `calendar_rewards` sous-estimerait
-- silencieusement le travail du comptoir, du côté qui se voit le moins : le
-- commerçant ne saurait pas qu'il a des lots à remettre.
--
-- ── CE QUE LE COMPTEUR DE STOCK COMPTE VRAIMENT ──
--
-- `low_stock_prizes` reproduit le prédicat du trigger `prizes_low_stock_watch`
-- (20260723110000) : `low_stock_threshold is not null and stock is not null and
-- stock <= low_stock_threshold`. Ni plus (pas de filtre `is_active`, pas de
-- filtre sur l'archivage de la campagne : le trigger n'en pose aucun) ni moins.
-- L'égalité est le but : le commerçant qui a reçu l'e-mail d'alerte doit
-- retrouver le MÊME lot dans le chiffre, sinon l'un des deux ment.
--
-- Ce compteur ne connaît que la ROUE — `prizes` est la seule table de lots à
-- porter un seuil. Les huit autres modules n'ont pas d'équivalent, et on ne
-- fabrique pas ici un seuil qui n'existe pas ailleurs : l'écran doit
-- l'étiqueter honnêtement (« lots de la roue »), pas laisser croire à une
-- surveillance de stock générale.
--
-- ── « QR JAMAIS SCANNÉS » N'EST PAS « QR À TESTER » ──
--
-- Aucune colonne ne dit si un QR a été essayé par le commerçant lui-même :
-- `scan_count = 0` est un PROXY. Il dit « personne ne l'a jamais ouvert », ce
-- qui est vrai et utile ; il ne dit pas « il est cassé ». Le libellé doit donc
-- rester descriptif.
-- ============================================================

create or replace function public.org_animation_center_counts(
  p_organization_id uuid
)
returns table (
  drafts integer,
  live_experiences integer,
  qr_never_scanned integer,
  low_stock_prizes integer,
  rewards_to_hand_over integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Même garde que `org_dashboard_summary`, dont cette fonction est le
  -- voisin d'écran : ÉDITEUR, pas simple membre. Un caissier n'a pas à savoir
  -- combien de brouillons dorment dans l'espace de son employeur.
  --
  -- La garde est le premier geste, avant toute lecture : `security definer`
  -- fait tomber la RLS de vingt et une tables, donc rien ne doit être lu avant
  -- qu'on sache qui appelle.
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;

  return query
  with publication as (
    -- Une ligne par module : (brouillons, publiées). Le vocabulaire suit
    -- `RESSOURCE_MODULE` (src/lib/module-resources.ts), lui-même comparé aux
    -- triggers de garde de publication par `module-resources-parity.test.ts`.
    -- Publié = `status = 'active'` pour huit modules, `enabled` pour le neuvième.

    -- roue
    select count(*) filter (where c.status = 'draft')  as brouillons,
           count(*) filter (where c.status = 'active') as publiees
      from public.campaigns c
     where c.organization_id = p_organization_id
    union all
    -- chasse au trésor
    select count(*) filter (where h.status = 'draft'),
           count(*) filter (where h.status = 'active')
      from public.hunts h
     where h.organization_id = p_organization_id
    union all
    -- calendrier de l'Avent
    select count(*) filter (where cal.status = 'draft'),
           count(*) filter (where cal.status = 'active')
      from public.calendars cal
     where cal.organization_id = p_organization_id
    union all
    -- passeport de fidélité
    select count(*) filter (where lp.status = 'draft'),
           count(*) filter (where lp.status = 'active')
      from public.loyalty_programs lp
     where lp.organization_id = p_organization_id
    union all
    -- créateur de quiz
    select count(*) filter (where qz.status = 'draft'),
           count(*) filter (where qz.status = 'active')
      from public.quizzes qz
     where qz.organization_id = p_organization_id
    union all
    -- jackpot collectif
    select count(*) filter (where jc.status = 'draft'),
           count(*) filter (where jc.status = 'active')
      from public.jackpot_campaigns jc
     where jc.organization_id = p_organization_id
    union all
    -- mode événement live
    select count(*) filter (where eg.status = 'draft'),
           count(*) filter (where eg.status = 'active')
      from public.event_games eg
     where eg.organization_id = p_organization_id
    union all
    -- pronostics
    select count(*) filter (where co.status = 'draft'),
           count(*) filter (where co.status = 'active')
      from public.contests co
     where co.organization_id = p_organization_id
    union all
    -- parrainage : un booléen, pas un cycle. Il n'a PAS d'état brouillon —
    -- le 0 est explicite et non un oubli, faute de quoi la ligne se lirait
    -- comme un module dont on aurait négligé de compter les brouillons.
    select 0::bigint,
           count(*) filter (where rp.enabled)
      from public.referral_programs rp
     where rp.organization_id = p_organization_id
  ),
  a_remettre as (
    -- Une ligne par TABLE D'ÉMISSION (dix, pas neuf : le calendrier en a deux).
    -- Chaque branche reproduit ce que la caisse sait chercher — voir l'en-tête.

    -- roue : la seule famille dont le commerçant peut annuler un gain sans
    -- effacer la ligne, d'où `cancelled_at`. `redeem_code is not null` écarte
    -- les tours perdants, qui créent pourtant une participation.
    select count(*) as n
      from public.participations p
     where p.organization_id = p_organization_id
       and p.redeem_code is not null
       and p.redeemed_at is null
       and p.cancelled_at is null
       and (p.redeem_expires_at is null
            or p.redeem_expires_at > pg_catalog.now())
    union all
    -- chasse au trésor
    select count(*)
      from public.hunt_completions hc
     where hc.organization_id = p_organization_id
       and hc.redeemed_at is null
       and (hc.redeem_expires_at is null
            or hc.redeem_expires_at > pg_catalog.now())
    union all
    -- fidélité : `reward_type = 'lot'` — une récompense en POINTS n'est pas un
    -- objet de comptoir et n'a pas de code (la caisse filtre pareil).
    select count(*)
      from public.loyalty_rewards lr
     where lr.organization_id = p_organization_id
       and lr.reward_type = 'lot'
       and lr.code is not null
       and lr.redeemed_at is null
       and (lr.redeem_expires_at is null
            or lr.redeem_expires_at > pg_catalog.now())
    union all
    -- jackpot collectif
    select count(*)
      from public.jackpot_wins jw
     where jw.organization_id = p_organization_id
       and jw.redeemed_at is null
       and (jw.redeem_expires_at is null
            or jw.redeem_expires_at > pg_catalog.now())
    union all
    -- calendrier — case du jour. `code is not null` écarte les cases sans lot
    -- et celles ouvertes en rupture (`out_of_stock`), qui n'émettent pas de code.
    select count(*)
      from public.calendar_openings cop
     where cop.organization_id = p_organization_id
       and cop.code is not null
       and cop.redeemed_at is null
       and (cop.redeem_expires_at is null
            or cop.redeem_expires_at > pg_catalog.now())
    union all
    -- calendrier — récompense d'assiduité
    select count(*)
      from public.calendar_rewards cr
     where cr.organization_id = p_organization_id
       and cr.redeemed_at is null
       and (cr.redeem_expires_at is null
            or cr.redeem_expires_at > pg_catalog.now())
    union all
    -- mode événement live
    select count(*)
      from public.event_wins ew
     where ew.organization_id = p_organization_id
       and ew.redeemed_at is null
       and (ew.redeem_expires_at is null
            or ew.redeem_expires_at > pg_catalog.now())
    union all
    -- parrainage : `kind = 'lot'` — un versement en tours de roue ne se remet
    -- pas au comptoir (la caisse filtre pareil).
    select count(*)
      from public.referral_rewards rr
     where rr.organization_id = p_organization_id
       and rr.kind = 'lot'
       and rr.code is not null
       and rr.redeemed_at is null
       and (rr.redeem_expires_at is null
            or rr.redeem_expires_at > pg_catalog.now())
    union all
    -- quiz : `code is not null` — un lot émis en rupture n'a pas de code.
    select count(*)
      from public.quiz_rewards qr
     where qr.organization_id = p_organization_id
       and qr.code is not null
       and qr.redeemed_at is null
       and (qr.redeem_expires_at is null
            or qr.redeem_expires_at > pg_catalog.now())
    union all
    -- pronostics : annulation portée par `status`, pas par une colonne dédiée.
    -- `status = 'delivered'` ⇔ `redeemed_at is not null` (contrainte de table),
    -- donc `redeemed_at is null` suffit à écarter les lots déjà remis.
    select count(*)
      from public.contest_awards ca
     where ca.organization_id = p_organization_id
       and ca.status <> 'cancelled'
       and ca.redeemed_at is null
       and (ca.redeem_expires_at is null
            or ca.redeem_expires_at > pg_catalog.now())
  )
  -- `coalesce` sur chaque colonne, et ce n'est pas de la superstition :
  -- `returns table` NE TRANSPORTE PAS la nullabilité (ADR-082), donc le
  -- générateur de types écrit `drafts: number` non-nullable. Rendre un `null`
  -- ici ferait mentir un type que personne ne peut corriger côté TypeScript.
  select coalesce((select sum(pu.brouillons) from publication pu), 0)::integer,
         coalesce((select sum(pu.publiees)   from publication pu), 0)::integer,
         (select count(*)
            from public.qr_codes q
           where q.organization_id = p_organization_id
             and q.scan_count = 0)::integer,
         (select count(*)
            from public.prizes pz
           where pz.organization_id = p_organization_id
             and pz.low_stock_threshold is not null
             and pz.stock is not null
             and pz.stock <= pz.low_stock_threshold)::integer,
         coalesce((select sum(ar.n) from a_remettre ar), 0)::integer;
end;
$$;

comment on function public.org_animation_center_counts(uuid) is
  'Cinq compteurs du Centre d''animation de l''accueil commerçant, en un aller-retour : brouillons et expériences publiées sur les neuf modules, QR jamais ouverts (scan_count = 0 — un proxy, pas « QR à tester »), lots de la ROUE sous leur seuil de stock (prédicat de prizes_low_stock_watch, à l''identique), et récompenses restant à remettre au comptoir sur les DIX tables d''émission. « À remettre » reproduit la page caisse : non remis, non annulé (cancelled_at pour la roue, status pour les pronostics ; les huit autres familles n''ont pas de chemin d''annulation qui laisse la ligne en place), non expiré, et porteur d''un code. Gardée par is_org_editor.';

-- ── ACL ──────────────────────────────────────────────────────
-- ADR-082 : une fonction fraîchement créée porte l'EXECUTE par défaut de
-- PUBLIC. Ce couple revoke/grant n'est pas décoratif — sans lui, `anon`
-- (qui hérite de PUBLIC) lirait les compteurs de n'importe quelle organisation
-- sur simple appel PostgREST, la garde interne étant tout ce qui l'en
-- empêcherait... et elle ne s'appuie que sur `auth.uid()`.
--
-- `service_role` reçoit l'EXECUTE par convention de dépôt, mais la garde
-- interne le refuse quand même : `is_org_editor` lit `auth.uid()`, nul pour un
-- appel service. C'est le comportement d'`org_dashboard_summary`, et il est
-- volontaire — cette RPC sert un écran connecté, pas un job.
revoke all on function public.org_animation_center_counts(uuid)
  from public, anon;
grant execute on function public.org_animation_center_counts(uuid)
  to authenticated, service_role;
