-- ============================================================
-- Lastchance — le rapport du lundi
-- ============================================================
--
-- Catalogue vivant vérifié avant écriture : `org_weekly_digest` n'existe
-- nulle part (`grep -l "function public.org_weekly_digest"` → 0 fichier).
-- Cette migration la CRÉE ; elle ne redéfinit rien.
--
-- En revanche `org_prize_funnel` existe en DEUX exemplaires
-- (20260722150000 puis 20260809120000) : c'est la seconde qui fait foi, et
-- c'est elle qui a été lue pour décider ci-dessous. Lire la première aurait
-- fait manquer la NULLification des montants hors éditeur, ajoutée après coup.
--
--
-- ── 1. POURQUOI UNE RPC DE PLUS, ET PAS `org_prize_funnel` ───
--
-- `org_prize_funnel(uuid, integer)` a été lue en entier avant d'écrire. Elle
-- ne suffit pas, pour trois raisons distinctes — aucune n'étant un défaut de
-- sa part, elle répond simplement à une autre question :
--
--   a) ELLE NE VOIT QUE LA ROUE. Ses six volumes sortent de `spins` et
--      `participations`. Les huit autres familles — chasse, fidélité,
--      jackpot, événement, calendrier, parrainage, quiz, pronostics — lui
--      sont invisibles. Un commerçant dont l'activité de la semaine est un
--      calendrier de l'Avent recevrait un rapport à zéro partout. On lit donc
--      `reward_issuances`, le registre universel, qui porte les neuf.
--
--   b) ELLE NE COMPTE AUCUN JOUEUR. Elle compte des tours et des lots. « 40
--      lots remis » ne dit pas si c'est 40 personnes ou 4 habitués.
--
--   c) ELLE NE COMPARE RIEN. Elle décrit UNE fenêtre. Or c'est la comparaison
--      qui donne son sens au chiffre : « 40 lots » ne veut rien dire, « 40
--      lots contre 25 la semaine dernière » se lit d'un coup d'œil. Appeler
--      `org_prize_funnel` deux fois coûterait deux allers-retours et deux
--      autorisations, pour un résultat toujours amputé de (a) et (b).
--
-- Ce qui est REPRIS d'elle, délibérément et à l'identique : la garde
-- d'autorisation, la NULLification des montants hors éditeur, et le bornage
-- de `p_days`. Trois RPC voisines qui divergeraient sur ces règles-là seraient
-- pires que la duplication qu'on évite.
--
--
-- ── 2. LES MONTANTS ─────────────────────────────────────────
--
-- Cette RPC est appelée par un cron en `service_role`, donc SANS rôle
-- applicatif : `is_org_editor()` y est faux par construction, et la garde
-- `auth.role() = 'service_role'` lui rend tout. C'est correct pour le cron —
-- mais cela veut dire que **la base ne peut plus protéger le montant à ce
-- stade**. Le tri redevient la responsabilité de l'APPELANT.
--
-- Écrit noir sur blanc, puisque c'est la demande : le worker `weekly-digest`
-- ne doit adresser le rapport CHIFFRÉ qu'aux membres `owner`/`editor` de
-- l'organisation. `basket_cents` est une donnée de marge — la policy
-- « prizes: editors » la refuse à un caissier, et un e-mail ne doit pas être
-- le contournement de cette policy. Un caissier destinataire recevrait un
-- rapport de VOLUMES, jamais de montants.
--
-- La garde reste néanmoins posée ici aussi (montants `null` hors éditeur),
-- pour le cas où un jour la RPC serait appelée depuis une session : une
-- défense qui ne tient que par la discipline de son appelant n'en est pas une.
--
--
-- ── 3. LE SENS DE L'OPT-OUT, ET SON MOTIF ───────────────────
--
-- Choix : `weekly_digest boolean not null default true` — OPT-OUT.
--
-- Le projet porte déjà les deux sens, et ils ne sont pas interchangeables :
--
--   `notify_on_win`  default TRUE  — e-mail au PROPRIÉTAIRE sur SES données ;
--   `auto_reengage`  default FALSE — e-mail à des JOUEURS tiers (marketing).
--
-- Le rapport du lundi est du premier type, sans ambiguïté : destinataire = le
-- titulaire du compte, contenu = l'activité de sa propre boutique, finalité =
-- l'exécution du service qu'il paie. Ce n'est pas de la prospection, et le
-- consentement du RGPD ne s'y applique pas de la même façon.
--
-- L'argument inverse a été pesé et n'est pas rejeté à la légère : un e-mail
-- hebdomadaire non sollicité se solde en désabonnement GLOBAL, et on perd
-- alors aussi les e-mails transactionnels qui comptent. C'est un risque réel.
-- Il est traité par le REGISTRE, pas par le défaut : un réglage visible dans
-- les Réglages (au même endroit que `notify_on_win`) et un lien de
-- désinscription dans chaque envoi valent mieux qu'un rapport à `false` que
-- personne n'active jamais — un rapport qu'on ne reçoit pas ne sert à rien, et
-- un réglage par défaut à `false` est, en pratique, la fonctionnalité éteinte.
--
-- À RELAYER À L'APPELANT : le worker doit filtrer sur ce booléen ET honorer
-- une désinscription. Sans cela le réglage est décoratif.
-- ============================================================

-- ── 1. L'opt-out ────────────────────────────────────────────
alter table public.organizations
  add column if not exists weekly_digest boolean not null default true;

comment on column public.organizations.weekly_digest is
  'Rapport hebdomadaire d''activité au propriétaire (lundi matin). Opt-out, comme notify_on_win : le destinataire est le titulaire du compte et le contenu ses propres données. Désactivable dans Réglages.';

-- `organizations` n'accorde à `authenticated` qu'une LISTE EXPLICITE de
-- colonnes (00017) : sans cette ligne le réglage serait invisible de l'écran
-- qui doit le montrer, et le commerçant ne pourrait pas se désinscrire. On
-- ajoute la seule colonne nouvelle, sans retoucher les autres.
grant select (weekly_digest) on public.organizations to authenticated;

-- ── 2. L'agrégation ─────────────────────────────────────────
create or replace function public.org_weekly_digest(
  p_organization_id uuid,
  p_days integer default 7
)
returns table (
  period_days integer,
  players bigint,
  rewards_issued bigint,
  rewards_redeemed bigint,
  basket_cents bigint,
  prev_players bigint,
  prev_rewards_issued bigint,
  prev_rewards_redeemed bigint,
  prev_basket_cents bigint,
  top_rewards jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_now timestamptz;
  v_since timestamptz;
  v_prev_since timestamptz;
  v_montants boolean;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_member(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;

  -- Même règle qu'`org_prize_funnel` : volumes pour tout membre, montants
  -- pour les éditeurs et le service_role. `null` et non `0` — un zéro se
  -- lirait comme une mesure, alors que c'est une absence de droit.
  v_montants := coalesce(auth.role(), '') = 'service_role'
                or public.is_org_editor(p_organization_id);

  -- Bornage identique à `org_prize_funnel`. Le défaut est 7 (une semaine) et
  -- non 30 : cette RPC sert un rapport HEBDOMADAIRE.
  v_days := least(greatest(coalesce(p_days, 7), 1), 365);
  v_now := pg_catalog.now();
  v_since := v_now - pg_catalog.make_interval(days => v_days);
  -- La fenêtre précédente a EXACTEMENT la même durée : comparer 7 jours à 30
  -- produirait une baisse spectaculaire et fausse.
  v_prev_since := v_now - pg_catalog.make_interval(days => v_days * 2);

  return query
  select
    v_days,

    -- Joueurs DISTINCTS. `reward_issuances` ne sait pas les compter — il ne
    -- connaît que les gagnants, et son `player_id` est creux par construction
    -- (rempli seulement si le pont legacy existait à l'émission). On lit donc
    -- `experience_events`, seule table qui porte une identité de joueur sur
    -- les neuf familles, en dédupliquant sur l'identité centrale QUAND elle
    -- existe et sur le hash d'appareil sinon.
    --
    -- Fenêtré sur `occurred_at` et non `created_at` : c'est l'heure du GESTE
    -- du joueur, et non celle de son ingestion — un événement rattrapé le
    -- lundi serait sinon compté dans la semaine suivante. C'est aussi la
    -- seule des deux colonnes indexée (six index, tous sur `occurred_at`).
    (select pg_catalog.count(distinct coalesce(e.player_id::text, e.player_key))
       from public.experience_events e
      where e.organization_id = p_organization_id
        and e.occurred_at >= v_since and e.occurred_at < v_now
        and e.event_name in ('experience_started', 'experience_completed')
        and coalesce(e.player_id::text, e.player_key) is not null),

    -- Lots ÉMIS et lots REMIS, les neuf familles. Un lot annulé reste émis :
    -- il a bien été gagné, et le masquer ferait mentir la comparaison.
    (select pg_catalog.count(*) from public.reward_issuances r
      where r.organization_id = p_organization_id
        and r.issued_at >= v_since and r.issued_at < v_now),
    (select pg_catalog.count(*) from public.reward_issuances r
      where r.organization_id = p_organization_id
        and r.redeemed_at >= v_since and r.redeemed_at < v_now),

    -- Panier attribuable : cumulé sur les lots RETIRÉS dans la fenêtre, et
    -- daté sur `redeemed_at` et non `issued_at` — le panier n'existe qu'au
    -- passage en caisse, l'imputer à la semaine de l'émission décalerait le
    -- chiffre d'affaires d'une semaine.
    case when v_montants then
      (select coalesce(pg_catalog.sum(r.basket_cents), 0)::bigint
         from public.reward_issuances r
        where r.organization_id = p_organization_id
          and r.redeemed_at >= v_since and r.redeemed_at < v_now) end,

    -- ── Fenêtre précédente, mêmes définitions ────────────────
    (select pg_catalog.count(distinct coalesce(e.player_id::text, e.player_key))
       from public.experience_events e
      where e.organization_id = p_organization_id
        and e.occurred_at >= v_prev_since and e.occurred_at < v_since
        and e.event_name in ('experience_started', 'experience_completed')
        and coalesce(e.player_id::text, e.player_key) is not null),
    (select pg_catalog.count(*) from public.reward_issuances r
      where r.organization_id = p_organization_id
        and r.issued_at >= v_prev_since and r.issued_at < v_since),
    (select pg_catalog.count(*) from public.reward_issuances r
      where r.organization_id = p_organization_id
        and r.redeemed_at >= v_prev_since and r.redeemed_at < v_since),
    case when v_montants then
      (select coalesce(pg_catalog.sum(r.basket_cents), 0)::bigint
         from public.reward_issuances r
        where r.organization_id = p_organization_id
          and r.redeemed_at >= v_prev_since and r.redeemed_at < v_since) end,

    -- Lots les plus gagnés — le libellé GRAVÉ du registre (20260814120000),
    -- jamais celui de la table parente : le rapport doit nommer ce que le
    -- client a gagné, pas ce que le lot s'appelle aujourd'hui.
    --
    -- AUCUN CODE DE RETRAIT ICI. Ce bloc part dans un e-mail ; un code y
    -- serait un secret porteur recopié dans une boîte aux lettres.
    (select coalesce(
       pg_catalog.jsonb_agg(
         pg_catalog.jsonb_build_object('label', t.label, 'count', t.n)
         order by t.n desc, t.label
       ),
       '[]'::jsonb)
       from (
         select r.label as label, pg_catalog.count(*) as n
           from public.reward_issuances r
          where r.organization_id = p_organization_id
            and r.issued_at >= v_since and r.issued_at < v_now
            and coalesce(r.label, '') <> ''
          group by r.label
          order by pg_catalog.count(*) desc, r.label
          limit 5
       ) t);
end;
$$;

comment on function public.org_weekly_digest(uuid, integer) is
  'Rapport hebdomadaire en UN aller-retour : joueurs distincts, lots émis/remis, panier attribuable, top 5 des lots (libellé gravé), et la même mesure sur la période précédente. Couvre les NEUF familles via reward_issuances, là où org_prize_funnel ne voit que la roue. Volumes visibles de tout membre ; montants NULLifiés hors éditeur. AUCUN code de retrait n''est rendu — la sortie part dans un e-mail. Appelée en service_role par le cron : c''est alors à l''APPELANT de n''adresser les montants qu''aux owner/editor.';

-- ADR-049 : `revoke … from public, anon` NE RETIRE PAS `service_role` —
-- Supabase le redonne par `alter default privileges`. Ici on le VEUT (le cron
-- appelle en service_role) ; on l'écrit donc explicitement au lieu de le
-- laisser à un défaut invisible, et on retire tout le reste.
revoke all on function public.org_weekly_digest(uuid, integer)
  from public, anon;
grant execute on function public.org_weekly_digest(uuid, integer)
  to authenticated, service_role;

-- ── 3. Le worker ────────────────────────────────────────────
--
-- `ops_worker_runs.worker` est une CLÉ ÉTRANGÈRE vers cette table
-- (20260805240000). Un heartbeat portant un nom absent d'ici est refusé par
-- la base — et `startWorkerRunSafely` avale son échec PAR CONCEPTION, pour
-- ne pas faire tomber un cron sur un défaut d'observabilité. Sans cette
-- ligne, le rapport partirait chaque lundi sans laisser la moindre trace :
-- l'échec silencieux exact que `20260819120000` documente.
--
-- Période 604800 s = 7 jours, le maximum admis par la contrainte
-- (`expected_period_seconds between 60 and 604800`) — un hebdomadaire est
-- littéralement le plus long heartbeat que ce registre sache exprimer.
--
-- Tolérance 691200 s = 8 jours, soit UN JOUR PLEIN de battement. Motif : la
-- contrainte impose `tolerance >= period`, donc 604800 serait le minimum
-- légal — mais une tolérance égale à la période déclare malade un worker
-- simplement parti avec une heure de retard, ce que le plan Hobby de Vercel
-- (« dans l'heure ») rend banal. Les six crons quotidiens prennent +6 h sur
-- 24 h ; +24 h sur 7 j est le même geste à l'échelle de la cadence : assez
-- pour absorber un décalage d'ordonnancement, trop peu pour laisser passer un
-- lundi entier sans rapport.
--
-- `enabled = false` : ce worker n'a JAMAIS tourné, et `ops_workers_health()`
-- déclare `never_succeeded` — donc non sain — tout worker supervisé sans
-- succès. L'activer ici rendrait l'objectif de service rouge dès
-- l'application de la migration, en production comme sur toute base neuve
-- (CI, poste de développement), pour une raison qui n'est pas un incident.
--
-- PRÉCISION QUI CORRIGE UNE ATTENTE : `20260820120000` ne le rallumera PAS
-- toute seule. Sa règle est un UPDATE conditionnel qui s'exécute UNE FOIS, à
-- sa propre position — et cette position est ANTÉRIEURE à la présente
-- migration. Sur une base neuve elle passe avant que `weekly-digest` existe ;
-- sur une base déjà à jour elle ne rejouera jamais. Le passage en supervision
-- se fera donc par un UPDATE d'exploitation une fois le premier succès
-- constaté, ou par une future migration rejouant la même règle générale.
insert into public.ops_worker_definitions (
  worker, expected_period_seconds, tolerance_seconds, enabled
) values
  ('weekly-digest', 604800, 691200, false)
on conflict (worker) do nothing;
