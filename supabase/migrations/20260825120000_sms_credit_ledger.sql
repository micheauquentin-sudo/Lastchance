-- ============================================================
-- Lastchance — le crédit SMS : un solde, un grand livre, et l'impossibilité
--                               structurelle qu'ils divergent
-- ============================================================
--
-- Catalogue vivant vérifié AVANT écriture (`grep -l "function public.<nom>"`
-- dans supabase/migrations) :
--   sms_credit_entries_apply            → 0 fichier
--   sms_credit_entries_append_only      → 0 fichier
--   sms_credits_balance_is_ledger_only  → 0 fichier
--   credit_sms_balance                  → 0 fichier
--   debit_sms_credit                    → 0 fichier
--   refund_sms_credit                   → 0 fichier
--   set_sms_unit_cost                   → 0 fichier
-- Création pure. AUCUNE fonction ni table existante n'est redéfinie ou altérée
-- ici — pas même `sms_log`. Le branchement du débit sur le chemin d'envoi est
-- fait une seule fois, dans 20260826120000, avec la redéfinition unique de
-- `claim_sms_delivery` et de `finish_sms_delivery`.
--
--
-- ══ LES TROIS PROPRIÉTÉS NON NÉGOCIABLES ═══════════════════════
--
-- ── (1) ON N'ENVOIE JAMAIS À CRÉDIT NUL ────────────────────
--
-- Le danger n'est pas le contrôle manquant, c'est le contrôle qui passe DEUX
-- FOIS. Deux workers lisent « solde = 1 » à la même milliseconde, tous deux
-- concluent « je peux », tous deux envoient : le commerçant a payé un SMS et
-- en a reçu deux à sa facture, et le solde vaut -1.
--
-- Trois verrous superposés, du plus fort au plus faible, et ils sont
-- délibérément redondants :
--
--   a) `check (balance_units >= 0)` sur le solde. C'est le seul qui rende le
--      découvert IMPOSSIBLE plutôt qu'improbable. Il ne dépend d'aucune
--      discipline d'appel : même un chemin futur qui oublierait le verrou se
--      heurterait à lui. Précédent maison : `progression_player_seasons.
--      keys_balance` (20260805200000:244), même forme, même raison.
--
--   b) `select … for update` sur la ligne de solde, pris AVANT la lecture.
--      C'est lui qui transforme l'erreur en refus PROPRE : le second
--      appelant attend, relit un solde à 0, et rend « n'envoyez pas » au lieu
--      de lever une violation de contrainte que l'appelant devrait
--      interpréter. Sans (a) il serait suffisant ; sans (b), (a) suffirait à
--      protéger la donnée mais l'appelant recevrait une exception.
--
--   c) Le débit et la réservation du journal vivent dans LA MÊME
--      TRANSACTION (`claim_sms_delivery`, 20260826120000). Un débit validé
--      avec une réservation perdue facturerait un SMS jamais parti ; une
--      réservation validée avec un débit perdu enverrait gratuitement.
--
-- ── POURQUOI UNE TABLE DE SOLDE DÉDIÉE, ET NON UNE COLONNE
--    SUR `organizations` ──
--
-- Parce que la ligne de solde est LA CIBLE DU VERROU. Poser le solde sur
-- `organizations` ferait prendre un `for update` sur la ligne d'organisation
-- à chaque SMS — c'est-à-dire sérialiser, derrière l'envoi de SMS, toute
-- écriture concurrente sur l'organisation (abonnement Stripe, addons,
-- réglages). Le verrou doit être aussi étroit que la ressource contestée.
--
-- ── (2) UN ÉCHEC DÉFINITIF REMBOURSE, UN ÉCHEC TEMPORAIRE NON ──
--
-- La distinction est portée par l'ÉTAT du journal, pas par un drapeau :
--   `failed`        échec temporaire — sera rejoué, le crédit reste consommé
--   `undeliverable` échec définitif  — remboursé, et NON rejouable
-- (les deux états sont ajoutés à `sms_log` par 20260826120000, qui est aussi
-- l'unique endroit où `finish_sms_delivery` est redéfinie.)
--
-- Le crédit est débité UNE FOIS PAR `dedup_key`, jamais à chaque tentative :
-- une reprise après échec temporaire réutilise le crédit déjà consommé. Sinon
-- trois tentatives sur un opérateur en panne factureraient trois SMS pour un
-- seul message. C'est `sms_log.credit_entry_id` (20260826120000) qui porte ce
-- « une fois » : non nul = déjà payé.
--
-- Le remboursement est structurellement unique : `reverses_entry_id` porte un
-- index unique. Un second remboursement du même mouvement ne peut PAS
-- s'écrire — ce n'est pas une garde applicative qu'un appelant distrait
-- contournerait, c'est une contrainte.
--
-- ── (3) LE SOLDE NE SE RECALCULE PAS, ET NE PEUT PAS DIVERGER ──
--
-- Recalculer `sum(delta_units)` à chaque lecture serait juste et lent :
-- l'agrégat grandit sans fin alors qu'on le lit à chaque SMS.
--
-- Le solde est donc MATÉRIALISÉ. La question devient : comment garantir qu'il
-- ne ment pas ? La réponse habituelle est « en faisant attention », et c'est
-- celle qui échoue — il suffit d'un `update sms_credits set balance_units`
-- écrit un soir dans un script de correction.
--
-- Ici la garantie est STRUCTURELLE, en trois triggers :
--
--   • `sms_credit_entries_apply`           le SEUL écrivain du solde. Chaque
--                                          ligne du grand livre applique son
--                                          delta, immédiatement.
--   • `sms_credits_balance_is_ledger_only` REFUSE tout autre mouvement du
--                                          solde, y compris à `service_role`,
--                                          y compris à l'insertion (un solde
--                                          naît à zéro) ET Y COMPRIS À LA
--                                          SUPPRESSION. Il n'autorise que la
--                                          fenêtre d'un seul `update`, ouverte
--                                          et refermée par le trigger
--                                          ci-dessus.
--   • `sms_credit_entries_append_only`     le grand livre ne se modifie ni ne
--                                          s'efface. Sans lui, effacer une
--                                          ligne ferait diverger le solde de
--                                          sa somme sans qu'aucune garde ne
--                                          s'en aperçoive. Même principe que
--                                          `admin_audit_no_delete`.
--
-- Divergence = solde ≠ somme du grand livre. Avec ces trois triggers il
-- n'existe AUCUN chemin, applicatif ou manuel, qui produise l'un sans
-- l'autre. Le test le prouve dans les deux sens : il vérifie l'égalité après
-- une séquence de mouvements, ET il vérifie que les portes de la divergence
-- sont fermées (contrôles négatifs).
--
-- ⚠️ « AUCUN CHEMIN » A ÉTÉ FAUX, ET IL FAUT LE DIRE ICI PLUTÔT QUE DE LE
-- RÉÉCRIRE EN SILENCE. Le trigger du solde ne couvrait que `insert or update`,
-- et `service_role` avait le `delete` : `delete from sms_credits where …` puis
-- un crédit de 10 recréaient la ligne à zéro, le commerçant voyant 10 au lieu
-- de 1010 pendant que le grand livre gardait ses 1000. Le sens est CONTRE le
-- commerçant et on ne pouvait pas fabriquer du crédit — mais un relecteur qui
-- lit « aucun chemin » n'ira pas chercher celui-là, et c'est précisément à quoi
-- sert cette phrase. La couverture `delete` et le retrait du `grant`
-- ci-dessous ferment cette porte ; l'affirmation redevient vraie.
--
-- ── LE COÛT : GELÉ SUR LE MOUVEMENT, JAMAIS RECALCULÉ ──────
--
-- `unit_cost_micros` est copié sur CHAQUE ligne du grand livre au moment où
-- elle s'écrit. Le tarif courant vit sur `sms_credits` et sert de valeur par
-- défaut ; le changer n'affecte QUE les mouvements futurs.
--
-- Rejouer un tarif global sur l'historique réécrirait la facturation d'envois
-- déjà payés — c'est la même faute que le libellé de récompense recalculé
-- (20260814120000), à ceci près qu'elle porterait sur de l'argent. Un
-- remboursement rend donc EXACTEMENT le coût de la ligne qu'il annule, lu sur
-- cette ligne, jamais retarifé.
--
-- Unité : le MICRO d'unité monétaire (1 € = 1 000 000 micros). Pourquoi pas
-- les centimes entiers du reste du projet (`*_cents`) : le prix de référence
-- retenu est 0,045 €, soit 4,5 centimes — non représentable en centimes
-- entiers. Pourquoi pas un `numeric` : le nom `micros` rend l'unité
-- impossible à confondre à la lecture, alors qu'un `numeric` nommé « cents »
-- se serait fait arrondir par le premier appelant qui l'aurait pris pour un
-- entier.
-- ============================================================

-- ── 1. Le solde matérialisé ─────────────────────────────────
create table if not exists public.sms_credits (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,

  -- LE verrou de la propriété (1). Voir l'en-tête : il rend le découvert
  -- impossible, indépendamment de toute discipline d'appel.
  balance_units integer not null default 0
    check (balance_units >= 0),

  -- Tarif COURANT, valeur par défaut des mouvements à venir. Ce n'est pas le
  -- tarif de l'historique : chaque ligne du grand livre porte le sien.
  -- 45 000 micros = 0,045 € — prix de référence du crédit prépayé retenu au
  -- moment de l'écriture de cette migration. C'est un point de départ
  -- ajustable par organisation, pas une vérité gravée.
  unit_cost_micros integer not null default 45000
    check (unit_cost_micros between 0 and 10000000),

  currency text not null default 'EUR'
    check (currency ~ '^[A-Z]{3}$'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sms_credits is
  'Solde SMS MATÉRIALISÉ d''une organisation, en unités (1 unité = 1 SMS). Table dédiée et non colonne sur organizations : cette ligne est la CIBLE DU VERROU pris à chaque envoi, et sérialiser les envois derrière la ligne d''organisation bloquerait aussi Stripe, les addons et les réglages. Le solde ne se modifie QUE par une écriture au grand livre (trigger sms_credits_balance_is_ledger_only) — il ne peut donc pas diverger de sa somme.';
comment on column public.sms_credits.balance_units is
  'Solde matérialisé, jamais recalculé à la lecture. `>= 0` en CHECK : c''est le seul verrou qui rende le découvert IMPOSSIBLE plutôt qu''improbable, y compris pour un chemin futur qui oublierait le `for update`.';
comment on column public.sms_credits.unit_cost_micros is
  'Tarif COURANT en micros d''unité monétaire (1 € = 1 000 000 ; 0,045 € = 45000). Sert de valeur par défaut aux mouvements FUTURS. L''historique n''est jamais retarifé : chaque ligne du grand livre gèle le coût qui lui a été appliqué.';

alter table public.sms_credits enable row level security;
revoke all on table public.sms_credits from public, anon, authenticated, service_role;
-- Lecture propriétaire : c'est de la facturation. Même porte que
-- `sms_consents` et `sms_log`. Pas d'UPDATE pour `authenticated` — le solde
-- n'est pas éditable, même par son propriétaire.
grant select on table public.sms_credits to authenticated;
create policy sms_credits_owner_read on public.sms_credits
  for select to authenticated
  using (public.is_org_owner(organization_id));
-- PAS de `delete` : supprimer la ligne de solde puis la laisser renaître à
-- zéro fait diverger le solde de son grand livre, dans le dos de tout le monde.
-- Voir le trigger `sms_credits_balance_is_ledger_only`, qui couvre les trois
-- opérations.
grant select, insert, update on table public.sms_credits to service_role;

-- ── 2. Le grand livre ───────────────────────────────────────
create table if not exists public.sms_credit_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  -- Signé. `<> 0` : un mouvement nul n'est pas un mouvement, c'est du bruit
  -- dans un journal qui sert de preuve de facturation.
  delta_units integer not null check (delta_units <> 0),

  --   purchase    achat de crédits par le commerçant
  --   send        consommation d'un SMS
  --   refund      remboursement d'un échec DÉFINITIF (jamais temporaire)
  --   expiry      péremption de crédits (aucun appelant aujourd'hui : le
  --               prestataire retenu vend des crédits sans expiration ; le
  --               motif existe pour que le jour où un tarif expirant est
  --               choisi, la donnée soit déjà distinguable d'une consommation)
  --   adjustment  geste commercial ou correction manuelle, dans les deux sens
  reason text not null
    check (reason in ('purchase', 'send', 'refund', 'expiry', 'adjustment')),

  -- LE COÛT RÉELLEMENT APPLIQUÉ, gelé ici. Voir l'en-tête.
  unit_cost_micros integer not null
    check (unit_cost_micros between 0 and 10000000),
  currency text not null
    check (currency ~ '^[A-Z]{3}$'),

  -- Le tarif varie par pays : on conserve la destination qui l'a déterminé,
  -- sinon le coût gelé devient un nombre sans explication le jour où on le
  -- relit pour une réclamation.
  destination_country text
    check (destination_country is null or destination_country ~ '^[A-Z]{2}$'),

  -- Rattachement au fait qui a causé le mouvement : `dedup_key` du journal
  -- pour un envoi, référence de paiement pour un achat.
  reference text
    check (reference is null or char_length(reference) between 1 and 200),

  -- Le mouvement annulé, pour un remboursement. L'index unique ci-dessous en
  -- fait la garantie d'unicité du remboursement.
  --
  -- `on delete cascade` et non `restrict`, pour une raison qui n'apparaît
  -- qu'en déroulant la suppression d'une organisation : la cascade efface le
  -- mouvement d'envoi ET son remboursement, et un `restrict` refuserait
  -- d'effacer l'envoi tant que le remboursement le désigne. La suppression
  -- d'organisation — donc l'effacement RGPD — échouerait sur une auto-
  -- référence. Hors de ce cas, aucune suppression n'atteint jamais cette
  -- table : le trigger append-only les refuse toutes.
  reverses_entry_id uuid
    references public.sms_credit_entries(id) on delete cascade,

  created_at timestamptz not null default now(),

  -- Le signe DÉCOULE du motif. Sans cette contrainte, un « achat » négatif ou
  -- un « envoi » positif seraient acceptés, et le grand livre cesserait
  -- d'être lisible : on ne pourrait plus sommer les achats sans relire chaque
  -- signe. `adjustment` est le seul motif volontairement libre — c'est sa
  -- définition.
  constraint sms_credit_entries_sign_matches_reason check (
    case reason
      when 'purchase' then delta_units > 0
      when 'send'     then delta_units < 0
      when 'refund'   then delta_units > 0 and reverses_entry_id is not null
      when 'expiry'   then delta_units < 0
      else true
    end
  ),
  -- Un rattachement d'annulation sur autre chose qu'un remboursement serait
  -- un lien dont personne ne connaîtrait le sens.
  constraint sms_credit_entries_reversal_is_refund check (
    reverses_entry_id is null or reason = 'refund'
  ),
  -- Une ligne ne s'annule pas elle-même.
  constraint sms_credit_entries_no_self_reversal check (
    reverses_entry_id is null or reverses_entry_id <> id
  )
);

-- ⚠️ L'UNICITÉ DU REMBOURSEMENT, en contrainte et non en garde applicative.
-- Un accusé d'échec définitif rejoué deux fois par le prestataire — cas
-- ordinaire, pas hypothétique — créditerait sinon deux fois le commerçant.
create unique index if not exists sms_credit_entries_one_reversal
  on public.sms_credit_entries (reverses_entry_id)
  where reverses_entry_id is not null;

create index if not exists sms_credit_entries_org_created_idx
  on public.sms_credit_entries (organization_id, created_at desc);
create index if not exists sms_credit_entries_org_reason_idx
  on public.sms_credit_entries (organization_id, reason, created_at desc);

comment on table public.sms_credit_entries is
  'Grand livre du crédit SMS : un mouvement daté, signé, motivé, et portant LE COÛT RÉELLEMENT APPLIQUÉ. Append-only (trigger sms_credit_entries_append_only) — sans cela, effacer une ligne ferait diverger le solde de sa somme sans qu''aucune garde ne s''en aperçoive. Seul écrivain du solde matérialisé, via sms_credit_entries_apply.';
comment on column public.sms_credit_entries.unit_cost_micros is
  'Coût GELÉ du mouvement, en micros (1 € = 1 000 000). Jamais recalculé : rejouer un tarif global sur l''historique réécrirait la facturation d''envois déjà payés. Un remboursement rend exactement le coût de la ligne qu''il annule, lu sur cette ligne.';
comment on column public.sms_credit_entries.reverses_entry_id is
  'Mouvement annulé par ce remboursement. Index unique partiel : un même mouvement ne peut PAS être remboursé deux fois, y compris si le prestataire rejoue son accusé d''échec. Contrainte, pas garde applicative.';

alter table public.sms_credit_entries enable row level security;
revoke all on table public.sms_credit_entries
  from public, anon, authenticated, service_role;
grant select on table public.sms_credit_entries to authenticated;
create policy sms_credit_entries_owner_read on public.sms_credit_entries
  for select to authenticated
  using (public.is_org_owner(organization_id));
-- Pas de DELETE pour `service_role` : la suppression d'une ligne du grand
-- livre est le geste que le trigger append-only refuse, et lui retirer le
-- privilège rend le refus visible une porte plus tôt.
grant select, insert on table public.sms_credit_entries to service_role;

-- ── 3. LE SEUL ÉCRIVAIN DU SOLDE ────────────────────────────
--
-- Applique le delta au solde matérialisé. La fenêtre d'écriture est ouverte
-- par un réglage de session (`lastchance.sms_credit_apply`) puis REFERMÉE
-- immédiatement après l'`update` : le drapeau est transactionnel, et le
-- laisser levé autoriserait n'importe quelle écriture directe du solde
-- pendant le reste de la transaction. C'est une porte, pas un interrupteur.
create or replace function public.sms_credit_entries_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('lastchance.sms_credit_apply', '1', true);

  update public.sms_credits c
     set balance_units = c.balance_units + new.delta_units
   where c.organization_id = new.organization_id;

  if not found then
    -- Refuser plutôt qu'insérer : un mouvement sur une organisation sans
    -- ligne de solde signale un appelant qui a sauté `credit_sms_balance`.
    -- Créer la ligne ici masquerait ce défaut d'appel.
    raise exception
      'aucun solde SMS pour l''organisation % : le grand livre ne peut pas s''appliquer',
      new.organization_id;
  end if;

  perform pg_catalog.set_config('lastchance.sms_credit_apply', '', true);
  return new;
end;
$$;

revoke all on function public.sms_credit_entries_apply()
  from public, anon, authenticated, service_role;

create trigger sms_credit_entries_apply
  after insert on public.sms_credit_entries
  for each row execute function public.sms_credit_entries_apply();

-- ── 4. LA PORTE FERMÉE : le solde ne bouge que par le livre ──
--
-- Le geste que ce trigger refuse est banal et c'est ce qui le rend dangereux :
-- `update sms_credits set balance_units = 500 where organization_id = …`,
-- écrit un soir pour dépanner un commerçant. Il fait diverger le solde de son
-- grand livre SILENCIEUSEMENT — aucune contrainte ne s'en aperçoit, et la
-- divergence ne se découvre qu'à la première réclamation de facture.
--
-- L'INSERT est gardé aussi : sans cela, `insert into sms_credits
-- (organization_id, balance_units) values (…, 1000)` créerait mille SMS à
-- partir de rien, sans une ligne au journal.
create or replace function public.sms_credits_balance_is_ledger_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.balance_units, 0) <> 0 then
      raise exception
        'un solde SMS naît à zéro : créditez par credit_sms_balance, qui écrit au grand livre';
    end if;
    return new;
  end if;

  -- LE DELETE, gardé pour la même raison que l'UPDATE et non par symétrie :
  -- supprimer la ligne de solde ne « remet pas à zéro », elle fait REPARTIR de
  -- zéro un compteur dont le grand livre, lui, garde toute l'histoire. Le
  -- prochain crédit recrée la ligne et le commerçant lit 10 là où la somme des
  -- mouvements dit 1010.
  --
  -- Même tolérance que `sms_credit_entries_append_only` : la cascade de
  -- suppression d'organisation doit passer, sinon une contrainte de
  -- facturation bloquerait un effacement RGPD. Postgres efface la ligne
  -- parente AVANT de déclencher la cascade — ce test est donc faux pour toute
  -- suppression manuelle, et vrai pour la seule cascade.
  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.organizations o where o.id = old.organization_id
    ) then
      raise exception
        'le solde SMS ne s''efface pas tant que l''organisation existe : le recréer le ferait repartir à zéro pendant que le grand livre garde ses lignes';
    end if;
    return old;
  end if;

  if new.balance_units is distinct from old.balance_units
     and coalesce(pg_catalog.current_setting('lastchance.sms_credit_apply', true), '') <> '1' then
    raise exception
      'le solde SMS ne se modifie que par une écriture au grand livre (tenté : % → %)',
      old.balance_units, new.balance_units;
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke all on function public.sms_credits_balance_is_ledger_only()
  from public, anon, authenticated, service_role;

create trigger sms_credits_balance_is_ledger_only
  before insert or update or delete on public.sms_credits
  for each row execute function public.sms_credits_balance_is_ledger_only();

-- ── 5. Le grand livre ne se réécrit pas ─────────────────────
--
-- ⚠️ L'EXCEPTION À LA RÈGLE, ET POURQUOI ELLE N'EN EST PAS UNE.
--
-- Un refus inconditionnel rendrait une organisation INDESTRUCTIBLE : la
-- suppression d'`organizations` cascade sur cette table, la cascade est un
-- DELETE, et ce trigger le refuserait — c'est-à-dire qu'une contrainte de
-- facturation bloquerait un effacement RGPD. Le défaut serait invisible
-- jusqu'à la première demande de suppression de compte.
--
-- La suppression n'est donc tolérée que si l'organisation N'EXISTE PLUS.
-- Postgres efface la ligne parente AVANT de déclencher la cascade, si bien que
-- ce test est faux pour toute suppression manuelle et vrai pour la seule
-- cascade. La règle réelle est donc : « le grand livre ne s'efface pas tant
-- que l'organisation existe », ce qui est exactement ce qu'on veut dire.
create or replace function public.sms_credit_entries_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.organizations o where o.id = old.organization_id
    ) then
      raise exception
        'le grand livre du crédit SMS est en ajout seul : suppression refusée tant que l''organisation existe';
    end if;
    -- L'organisation a disparu : c'est la cascade, on la laisse passer.
    return old;
  end if;

  raise exception
    'le grand livre du crédit SMS est en ajout seul : ni modification ni suppression (tenté : %)',
    tg_op;
end;
$$;

revoke all on function public.sms_credit_entries_append_only()
  from public, anon, authenticated, service_role;

create trigger sms_credit_entries_append_only
  before update or delete on public.sms_credit_entries
  for each row execute function public.sms_credit_entries_append_only();

-- ── 6. Créditer ─────────────────────────────────────────────
create or replace function public.credit_sms_balance(
  p_organization_id uuid,
  p_units integer,
  p_reason text default 'purchase',
  p_unit_cost_micros integer default null,
  p_reference text default null,
  p_destination_country text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_cost integer;
  v_currency text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  if p_reason not in ('purchase', 'adjustment') then
    -- `refund` passe par `refund_sms_credit`, qui seul sait relire le coût de
    -- la ligne annulée ; `send` et `expiry` sont des débits. Laisser passer
    -- `refund` ici permettrait un remboursement sans rattachement, donc
    -- reproductible à volonté — c'est la porte que l'index unique sur
    -- `reverses_entry_id` existe pour fermer.
    raise exception 'motif de crédit SMS invalide : % (attendu purchase ou adjustment)', p_reason;
  end if;

  if coalesce(p_units, 0) <= 0 then
    raise exception 'un crédit SMS porte un nombre d''unités strictement positif (reçu : %)',
      coalesce(p_units, 0);
  end if;

  -- La ligne de solde naît ici, à zéro. `on conflict do nothing` plutôt qu'un
  -- test d'existence : deux achats concurrents pour une organisation neuve
  -- tomberaient sinon tous deux dans la branche « elle n'existe pas », et l'un
  -- des deux lèverait une violation d'unicité.
  insert into public.sms_credits (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  select c.unit_cost_micros, c.currency into v_cost, v_currency
    from public.sms_credits c
   where c.organization_id = p_organization_id
   for update;

  if v_cost is null then
    raise exception 'organisation inconnue pour le crédit SMS : %', p_organization_id;
  end if;

  -- Le coût passé prime sur le tarif courant : c'est le prix réellement payé
  -- pour CE lot de crédits, et c'est lui qui doit être gelé.
  v_cost := coalesce(p_unit_cost_micros, v_cost);

  insert into public.sms_credit_entries (
    organization_id, delta_units, reason,
    unit_cost_micros, currency, destination_country, reference
  ) values (
    p_organization_id, p_units, p_reason,
    v_cost, v_currency, pg_catalog.upper(p_destination_country), p_reference
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

comment on function public.credit_sms_balance(uuid, integer, text, integer, text, text) is
  'Crédite des SMS (purchase ou adjustment) et rend l''identifiant du mouvement. Crée la ligne de solde à ZÉRO si besoin — le solde ne bouge ensuite que par le grand livre. `refund` est REFUSÉ ici : il n''existe que par refund_sms_credit, seul à savoir relire le coût gelé de la ligne annulée, et seul soumis à l''unicité de rattachement. Le coût passé est gelé sur le mouvement. service_role uniquement.';

revoke all on function public.credit_sms_balance(uuid, integer, text, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.credit_sms_balance(uuid, integer, text, integer, text, text)
  to service_role;

-- ── 7. Débiter — LE POINT CHAUD ─────────────────────────────
--
-- Rend l'identifiant du mouvement si le débit a eu lieu, NULL si le solde est
-- insuffisant. Null et non exception : « pas assez de crédit » est un état
-- ordinaire du système, pas une anomalie, et l'appelant doit pouvoir en tirer
-- un refus propre sans avaler une exception qui masquerait les vraies.
--
-- SEUL APPELANT LÉGITIME : `claim_sms_delivery` (20260826120000), qui l'invoque
-- dans la même transaction que la réservation du journal. Débiter ailleurs
-- facturerait un SMS que rien n'enverrait.
--
-- L'ORDRE DES DEUX PREMIÈRES INSTRUCTIONS EST LA PROPRIÉTÉ : `for update`
-- AVANT toute décision. Lire le solde puis verrouiller laisserait entre les
-- deux la fenêtre exacte où deux appelants concluent tous deux « je peux ».
-- ⚠️ PAS DE `p_unit_cost_micros` ICI, ET C'EST UNE DÉCISION.
--
-- La version d'origine acceptait un coût de l'APPELANT et le gelait tel quel au
-- grand livre. Les unités valant toujours 1, le solde restait juste ; seul le
-- MONTANT — celui qui sert de preuve de facturation — était pilotable depuis
-- l'extérieur.
--
-- Motif du choix « figer » plutôt que « documenter comme entrée de confiance » :
--   • aucun tarif par destination n'existe. `destination_country` est
--     CONSERVÉ pour expliquer le coût gelé, il ne le DÉTERMINE pas : rien dans
--     le schéma ne fait correspondre un pays à un prix. Le paramètre n'avait
--     donc aucun emploi légitime aujourd'hui, et un paramètre sans emploi
--     légitime dans un journal de facturation est une entrée à sécuriser pour
--     rien ;
--   • le jour où un tarif par destination arrivera, il prendra la forme d'une
--     TABLE lue ici, comme `sms_credits.unit_cost_micros` l'est déjà — pas
--     celle d'un nombre transmis par le worker. Garder le paramètre
--     « en prévision » aurait figé la mauvaise forme.
--
-- `credit_sms_balance` GARDE le sien : un achat porte légitimement le prix
-- réellement payé, il vient d'un chemin d'administration ou de Stripe, et il ne
-- décrit pas une consommation mais une transaction extérieure.
create or replace function public.debit_sms_credit(
  p_organization_id uuid,
  p_units integer default 1,
  p_reference text default null,
  p_destination_country text default 'FR'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_balance integer;
  v_cost integer;
  v_currency text;
  v_units integer := greatest(coalesce(p_units, 1), 1);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  -- ⚠️ LE VERROU, pris avant la lecture du solde. Un second appelant attend
  -- ici que le premier valide, puis relit un solde déjà décrémenté. C'est ce
  -- qui fait que deux débits concurrents sous un solde de 1 rendent un
  -- succès et un refus, jamais deux succès.
  --
  -- Aucune ligne = aucun crédit jamais acheté = pas d'envoi. On ne CRÉE pas
  -- la ligne ici : un débit ne doit pas pouvoir inventer un compte.
  select c.balance_units, c.unit_cost_micros, c.currency
    into v_balance, v_cost, v_currency
    from public.sms_credits c
   where c.organization_id = p_organization_id
   for update;

  if v_balance is null then
    return null;
  end if;

  if v_balance < v_units then
    return null;
  end if;

  -- `v_cost` est celui de `sms_credits.unit_cost_micros`, lu ci-dessus sous le
  -- verrou. Aucune autre origine possible : voir l'en-tête de la fonction.

  -- Le trigger applique le delta au solde. Si le solde passait sous zéro —
  -- ce que le verrou rend déjà impossible — le CHECK lèverait plutôt que de
  -- laisser passer.
  insert into public.sms_credit_entries (
    organization_id, delta_units, reason,
    unit_cost_micros, currency, destination_country, reference
  ) values (
    p_organization_id, -v_units, 'send',
    v_cost, v_currency, pg_catalog.upper(coalesce(p_destination_country, 'FR')), p_reference
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

comment on function public.debit_sms_credit(uuid, integer, text, text) is
  'Débite des unités SMS. Rend l''identifiant du mouvement, ou NULL si le solde est insuffisant — « pas assez de crédit » est un état ordinaire, pas une anomalie, et une exception masquerait les vraies. Prend un `for update` sur la ligne de solde AVANT de lire : deux débits concurrents sous un solde de 1 rendent un succès et un refus, jamais deux succès. Ne crée jamais la ligne de solde : un débit n''invente pas un compte. LE COÛT N''EST PAS UN PARAMÈTRE : il est lu sur sms_credits.unit_cost_micros sous le verrou, jamais transmis par l''appelant — le montant gelé au grand livre sert de preuve de facturation. SEUL APPELANT LÉGITIME : claim_sms_delivery, dans la même transaction que la réservation. service_role uniquement.';

revoke all on function public.debit_sms_credit(uuid, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.debit_sms_credit(uuid, integer, text, text)
  to service_role;

-- ── 8. Rembourser un échec DÉFINITIF ────────────────────────
--
-- Rend l'identifiant du mouvement de remboursement, ou NULL s'il n'y a rien à
-- rembourser (mouvement inconnu, déjà remboursé, ou qui n'était pas un envoi).
--
-- Ce qu'il ne fait PAS, et c'est le point : il ne retarife pas. Le coût rendu
-- est celui gelé sur la ligne annulée. Un changement de tarif entre l'envoi et
-- l'échec ne doit rien changer au montant rendu — sinon un commerçant serait
-- remboursé plus ou moins que ce qu'il a payé, selon la date de la panne de
-- l'opérateur.
create or replace function public.refund_sms_credit(
  p_entry_id uuid,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.sms_credit_entries;
  v_refund_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select * into v_src
    from public.sms_credit_entries e
   where e.id = p_entry_id
     and e.reason = 'send';

  if v_src.id is null then
    return null;
  end if;

  -- Sortie précoce sur un remboursement déjà écrit. L'index unique la rendrait
  -- de toute façon impossible, mais il lèverait une violation d'unicité là où
  -- l'appelant attend un simple « rien à faire » : un accusé d'échec rejoué
  -- par le prestataire est un cas nominal, pas une erreur.
  if exists (
    select 1 from public.sms_credit_entries r
     where r.reverses_entry_id = v_src.id
  ) then
    return null;
  end if;

  -- Le solde est verrouillé avant d'écrire, comme au débit : un remboursement
  -- concurrent d'un envoi ne doit pas croiser un autre mouvement à mi-chemin.
  perform 1 from public.sms_credits c
   where c.organization_id = v_src.organization_id
   for update;

  insert into public.sms_credit_entries (
    organization_id, delta_units, reason,
    unit_cost_micros, currency, destination_country,
    reference, reverses_entry_id
  ) values (
    v_src.organization_id, -v_src.delta_units, 'refund',
    -- Coût GELÉ relu sur la ligne annulée, jamais retarifé.
    v_src.unit_cost_micros, v_src.currency, v_src.destination_country,
    coalesce(p_reference, v_src.reference), v_src.id
  )
  returning id into v_refund_id;

  return v_refund_id;
end;
$$;

comment on function public.refund_sms_credit(uuid, text) is
  'Rembourse un mouvement d''envoi après un échec DÉFINITIF. Rend NULL si le mouvement est inconnu, déjà remboursé, ou n''était pas un envoi — un accusé d''échec rejoué par le prestataire est un cas nominal, pas une erreur. NE RETARIFE PAS : le montant rendu est le coût gelé sur la ligne annulée, sinon un commerçant serait remboursé selon la date de la panne de l''opérateur. Un échec TEMPORAIRE ne passe jamais ici : il sera rejoué et réutilise le crédit déjà consommé. service_role uniquement.';

revoke all on function public.refund_sms_credit(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.refund_sms_credit(uuid, text) to service_role;

-- ── 9. Changer le tarif courant ─────────────────────────────
--
-- N'affecte QUE les mouvements futurs, par construction : cette fonction
-- n'écrit que sur `sms_credits`, et aucune ligne du grand livre n'est
-- accessible en écriture (trigger append-only).
create or replace function public.set_sms_unit_cost(
  p_organization_id uuid,
  p_unit_cost_micros integer,
  p_currency text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_touched integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  if p_unit_cost_micros is null or p_unit_cost_micros < 0 or p_unit_cost_micros > 10000000 then
    raise exception 'tarif SMS hors bornes : % micros (0 à 10 000 000)', p_unit_cost_micros;
  end if;

  insert into public.sms_credits (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  update public.sms_credits c
     set unit_cost_micros = p_unit_cost_micros,
         currency = coalesce(pg_catalog.upper(p_currency), c.currency)
   where c.organization_id = p_organization_id;

  get diagnostics v_touched = row_count;
  return v_touched > 0;
end;
$$;

comment on function public.set_sms_unit_cost(uuid, integer, text) is
  'Change le tarif COURANT du SMS pour une organisation, en micros (1 € = 1 000 000). N''affecte que les mouvements FUTURS, par construction : le grand livre est en ajout seul, aucune ligne passée n''est réécrite. service_role uniquement.';

revoke all on function public.set_sms_unit_cost(uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_sms_unit_cost(uuid, integer, text) to service_role;
