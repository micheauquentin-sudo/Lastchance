-- ============================================================
-- RÉSERVER UNE UNITÉ DE STOCK RÉELLE — et le Drop anti-gaspi (RES-5, lot L9)
--
-- Bloquer un objet PHYSIQUE — la dernière part de tarte, trois invendus à
-- 19 h — jusqu'à une heure dite, et le retirer en caisse. Le « Drop » n'est pas
-- un second mécanisme : c'est une offre dont la fenêtre de retrait est courte
-- et proche. Une seule table le porte, un seul jeu de RPC le sert.
--
-- ── UNE RÉSERVATION DE STOCK N'EST PAS UN GAIN DE JEU ──
--
-- Elle n'est tirée au sort par rien, elle ne récompense aucune performance, et
-- elle ne doit apparaître dans AUCUNE statistique de jeu du commerçant. C'est
-- pour cela que cette famille N'ENTRE PAS dans `track_reward_issuance_analytics`
-- (20260805160000:897) ni dans `experience_economic_policies`
-- (20260805190000:1300) — voir la section 4, qui explique pourquoi ces deux
-- extensions-là sont REFUSÉES alors que les six autres sont faites. Elle entre
-- au registre universel pour UNE raison et une seule : le code se présente au
-- comptoir, et le comptoir n'a qu'une porte.
--
-- ── LES CINQ INVARIANTS QUE CE FICHIER REND VRAIS ──
--
--   1. UNE UNITÉ BLOQUÉE N'EST JAMAIS ATTRIBUÉE DEUX FOIS. Le restant se
--      DÉRIVE — `stock_total` moins les prises VIVANTES — sous un verrou d'avis
--      porté par l'offre. Aucun compteur dénormalisé, donc rien à maintenir
--      d'accord.
--   2. L'EXPIRATION ET L'ANNULATION RESTITUENT L'UNITÉ, EXACTEMENT UNE FOIS —
--      et sans qu'aucune ligne ne soit décrémentée ni qu'aucun travail de fond
--      ne tourne. Une prise dont la fenêtre est passée cesse simplement d'être
--      comptée. C'EST LA LEÇON DE L8 : l'arithmétique remplace la compensation.
--      Il n'y a AUCUN job de remise en stock, AUCUN compteur à rattraper, donc
--      aucune occasion de restituer deux fois.
--   3. UNE UNITÉ CONSOMMÉE NE REVIENT PAS. `redeemed` compte pour toujours dans
--      le restant : c'est la seule fin qui a fait sortir l'objet du magasin.
--   4. LE RETRAIT PASSE PAR LA CAISSE UNIVERSELLE, ET UNE SEULE FOIS. Le code
--      `RESA-` est routé par `redeem_reward_by_code` comme les neuf familles
--      qui précèdent ; la seconde présentation rend `already_redeemed`.
--   5. LE VOISIN EST MUET. RLS org-scopée, FK composites tenant, et des RPC qui
--      rendent la MÊME réponse pour une offre inconnue et pour une offre d'une
--      autre organisation.
--
-- ── LA TABLE DES PRISES EST L'AUTORITÉ, LE REGISTRE EST UN MIROIR ──
--
-- `reservation_stock_holds` décide seule du stock. Le registre ne compte rien,
-- ne décrémente rien, n'arbitre rien : il porte le code pour que la caisse le
-- trouve, et l'échéance pour qu'elle le refuse à temps. C'est la règle du
-- registre depuis 20260805150000:7 (« ne touche jamais au stock »), et cette
-- famille-ci ne l'assouplit pas.
--
-- ── DEUX BORNES DE TEMPS, ET ELLES NE SERVENT PAS À LA MÊME CHOSE ──
--
-- DÉCISION, écrite ici parce qu'elle n'allait pas de soi : LA PRISE EST
-- POSSIBLE DÈS QUE L'OFFRE EST `open`, Y COMPRIS AVANT LE DÉBUT DE LA FENÊTRE ;
-- LE RETRAIT N'EST POSSIBLE QUE DANS LA FENÊTRE. C'est tout l'intérêt du
-- Drop : on annonce à 15 h que trois parts partent entre 19 h et 20 h, et les
-- gens les bloquent dans l'après-midi. Interdire la prise avant la fenêtre
-- aurait réduit le Drop à une course de vitesse à l'ouverture — exactement ce
-- que « anti-gaspi » ne veut pas dire. Interdire le retrait hors fenêtre est en
-- revanche le cœur du service : le commerçant a promis une plage d'accueil, pas
-- une créance permanente sur son stock.
--
-- Les deux bornes du retrait sont donc portées SÉPARÉMENT, et c'est délibéré :
--   * la borne HAUTE est `redeem_expires_at`, GRAVÉE sur la prise à l'émission
--     et miroitée en `reward_issuances.expires_at` — le moteur universel la
--     applique déjà, sans une ligne de code nouvelle (`expired`) ;
--   * la borne BASSE vit dans `redeem_stock_hold`, le bras source. Voir la
--     section 9 pour l'arbitrage complet : il a été envisagé d'ajouter une
--     colonne `redeem_not_before` au registre, et il a été ÉCARTÉ.
--
-- ── CE QUE CE FICHIER NE FAIT PAS, VOLONTAIREMENT ──
--
--   * AUCUNE synchronisation avec une caisse ou un logiciel de stock, AUCUN
--     stock temps réel. Le commerçant saisit un nombre FINI, et ce nombre est la
--     seule vérité. Le cahier l'exclut nommément, et pour une bonne raison : une
--     promesse de temps réel qu'aucun système ne tient produit des unités
--     vendues deux fois, ce que l'invariant n°1 interdit.
--   * AUCUNE RPC de retrait exposée au comptoir. La caisse a UNE porte, et
--     c'est `redeem_reward_by_code`. `redeem_stock_hold` existe comme BRAS
--     SOURCE de ce routeur — exactement le rôle de `redeem_contest_award` et de
--     ses huit frères — et non comme un second point d'entrée.
--   * AUCUNE page, AUCUNE server action, AUCUN email : couche applicative.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Les offres de stock
--
-- `stock_total` est FINI et OBLIGATOIRE. Un stock illimité n'est pas une offre
-- anti-gaspi, c'est une promesse sans objet : tout l'intérêt du module est que
-- le restant descende à zéro et que la page le dise. Le plafond de 500 n'est
-- pas une limite technique — c'est la borne au-delà de laquelle « réserver une
-- unité » cesse d'avoir un sens de comptoir.
--
-- LE « DROP » N'A PAS DE COLONNE. Une offre dont `window_starts_at` est proche
-- et la fenêtre courte EST un Drop ; une offre à fenêtre large est une réserve
-- ordinaire. Ajouter un booléen `is_drop` aurait créé une seconde vérité à
-- tenir d'accord avec les dates, sans rien changer au comportement.
-- ────────────────────────────────────────────────────────────

create table public.reservation_stock_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  title text not null
    check (pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 120),
  description text
    check (description is null or pg_catalog.char_length(description) <= 400),
  -- FINI, STRICTEMENT POSITIF, BORNÉ. Voir l'en-tête de section.
  stock_total integer not null check (stock_total between 1 and 500),
  window_starts_at timestamptz not null,
  window_ends_at timestamptz not null,
  -- Combien d'unités UNE personne peut bloquer sur CETTE offre. 1 par défaut —
  -- c'est le sens du module — et 3 au plus : au-delà, une personne préempte un
  -- Drop entier et le partage cesse d'en être un.
  per_player_limit integer not null default 1
    check (per_player_limit between 1 and 3),
  status text not null default 'draft'
    check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint reservation_stock_offers_window_check
    check (window_ends_at > window_starts_at),
  -- Cible de la FK composite de `reservation_stock_holds`.
  unique (id, organization_id)
);

comment on table public.reservation_stock_offers is
  'Offre de stock réel d''une organisation (RES-5) : N unités d''un objet '
  'PHYSIQUE, à retirer en caisse dans une fenêtre annoncée. Le « Drop » '
  'anti-gaspi est simplement une offre à fenêtre courte et proche — il n''a pas '
  'de colonne à lui. STRICTEMENT org-scopée et réservée aux ÉDITEURS (motif '
  'reservation_activities) : aucune policy anon, le joueur ne lit ces lignes '
  'QUE par une RPC service_role. Le stock n''est JAMAIS décompté ici : le '
  'restant se déduit des prises vivantes, sous verrou, dans hold_stock_offer.';
comment on column public.reservation_stock_offers.stock_total is
  'Nombre FINI d''unités réellement mises de côté. Jamais décrémenté : c''est '
  'le TOTAL, et le restant s''en déduit. Aucune synchronisation avec une caisse '
  'ou un logiciel de stock — le cahier RES-5 l''exclut, et une promesse de '
  'temps réel que rien ne tient vendrait la même unité deux fois.';
comment on column public.reservation_stock_offers.window_starts_at is
  'Début de la FENÊTRE DE RETRAIT. La PRISE, elle, est ouverte dès que le '
  'statut vaut `open` — y compris des heures avant : c''est ce qui distingue un '
  'Drop annoncé d''une course de vitesse à l''ouverture.';
comment on column public.reservation_stock_offers.status is
  'draft (invisible du joueur) → open (réservable) → closed (le commerçant a '
  'fermé les prises). Fermer ne touche à AUCUNE prise déjà tenue : les gens qui '
  'ont bloqué leur part viennent la chercher.';

create index reservation_stock_offers_org_window_idx
  on public.reservation_stock_offers (organization_id, window_starts_at desc);


-- ────────────────────────────────────────────────────────────
-- 2. Les prises
--
-- ── L'IDENTITÉ, L'EMAIL ET SON CONSENTEMENT ──
--
-- Motif EXACT du module (20261002120000 §3) : empreinte SHA-256 du cookie
-- joueur, jamais le jeton brut ; email FACULTATIF porté par la prise ;
-- ÉQUIVALENCE email ⇔ consentement, parce qu'une adresse sans consentement est
-- une donnée personnelle conservée sans base, et un consentement sans adresse
-- ne consent à rien. La purge efface donc les deux d'un seul geste (section 13).
--
-- ── POURQUOI `redeem_expires_at` EST UNE COLONNE, ET NON UNE JOINTURE ──
--
-- Doctrine 20260904120000 : « échéance GRAVÉE à l'émission, lue sur la ligne
-- émise, jamais recalculée depuis la parente ». Si le miroir lisait
-- `offers.window_ends_at` à chaque passage, un commerçant qui décale sa fenêtre
-- déplacerait l'échéance de prises DÉJÀ CONSENTIES — la preuve du client
-- bougerait sous lui. La colonne fige ce qui a été promis au moment où ça a
-- été promis.
--
-- ── `expired` EST DANS LA LISTE, ET RIEN NE L'ÉCRIT ──
--
-- Il faut le dire franchement : en L9, AUCUN chemin ne pose `status =
-- 'expired'`. L'expiration est ARITHMÉTIQUE — une prise `held` dont la fenêtre
-- est passée cesse d'être comptée, et c'est tout. La valeur est admise pour
-- qu'un balayage explicite, s'il naît un jour, ait un état où atterrir sans
-- migration. Le prédicat de comptage (section 8) ne s'appuie JAMAIS dessus : il
-- compte `held` non échue et `redeemed`, donc une ligne `expired` n'est comptée
-- ni avant ni après qu'on l'ait écrite. Les deux lectures restent cohérentes,
-- ce qui est la seule chose qui doive rester vraie.
-- ────────────────────────────────────────────────────────────

create table public.reservation_stock_holds (
  id uuid primary key default gen_random_uuid(),
  -- Colonne NUE : seule la FK COMPOSITE ci-dessous relie la prise à son offre.
  -- Une FK simple en plus n'ajouterait rien et ferait rougir
  -- fk_composites_couverture.test.sql.
  offer_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  player_key_hash text not null,
  email text
    check (email is null
           or (pg_catalog.char_length(email) <= 254
               and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  consent_transactional_at timestamptz,
  -- Code de comptoir, PRÉFIXÉ pour le registre universel. L'alphabet sans
  -- ambiguïté (ni I/O/0/1) est un sous-ensemble de [A-Z0-9], donc la forme est
  -- d'office compatible avec `reward_issuances_code_shape`. Posé par le trigger
  -- SECURITY DEFINER de la section 3, jamais par le client.
  code text not null check (code ~ '^RESA-[A-HJ-NP-Z2-9]{8}$'),
  status text not null default 'held'
    check (status in ('held', 'redeemed', 'cancelled', 'expired')),
  -- ÉCHÉANCE GRAVÉE : recopie de `window_ends_at` au moment de la prise.
  redeem_expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  basket_cents integer
    check (basket_cents is null or basket_cents between 0 and 100000000),
  cancelled_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),

  -- ── ÉTATS COHÉRENTS ──
  -- ÉQUIVALENCES et non implications, motif `reservations` : une implication
  -- simple laissait passer `status = 'held'` avec un `redeemed_at` posé, soit
  -- un retrait réel qu'aucun écran ne montre.
  constraint reservation_stock_holds_redeem_state
    check ((status = 'redeemed') = (redeemed_at is not null)),
  constraint reservation_stock_holds_cancel_state
    check ((status = 'cancelled') = (cancelled_at is not null)),
  -- XOR terminal (patron reward_issuances_terminal_state) : les deux nuls =
  -- prise vivante ; un seul posé = fin. Jamais les deux.
  constraint reservation_stock_holds_terminal_state
    check (cancelled_at is null or redeemed_at is null),
  constraint reservation_stock_holds_redeemer_state
    check (redeemed_by is null or redeemed_at is not null),
  -- LE PANIER NE VIT QU'AVEC LE RETRAIT, exactement comme
  -- `reward_issuances_basket_state` : un montant sans retrait est un chiffre
  -- d'affaires attribué à une vente qui n'a pas eu lieu.
  constraint reservation_stock_holds_basket_state
    check (basket_cents is null or redeemed_at is not null),
  constraint reservation_stock_holds_consent_state
    check ((email is not null) = (consent_transactional_at is not null)),
  -- L'empreinte, OU le marqueur de purge, et rien d'autre (motif
  -- reservations_player_key_shape).
  constraint reservation_stock_holds_player_key_shape
    check (player_key_hash ~ '^[0-9a-f]{64}$'
           or player_key_hash = 'purge:' || id::text),
  -- Le code ne vaut que dans son organisation. C'est aussi la portée qu'applique
  -- l'index unique `(organization_id, code)` du registre : deux commerçants ont
  -- le droit d'émettre le même, et aucune famille ne peut collisionner avec une
  -- autre puisque les préfixes diffèrent.
  constraint reservation_stock_holds_org_code_unique
    unique (organization_id, code),
  foreign key (offer_id, organization_id)
    references public.reservation_stock_offers(id, organization_id)
      on delete cascade
);

comment on table public.reservation_stock_holds is
  'Unité de stock BLOQUÉE par un joueur sur une offre (RES-5). AUTORITÉ du '
  'stock : le registre universel en est le miroir et ne décide de rien. '
  'Identité PSEUDONYME (hash SHA-256 du cookie). Écriture exclusivement par les '
  'RPC service_role — aucun grant insert/update/delete à `authenticated` : le '
  'restant, l''annulation et le retrait sont serveur-autoritaires. La colonne '
  '`email` est HORS du grant de colonnes du commerçant.';
comment on column public.reservation_stock_holds.status is
  'held → redeemed (retiré en caisse) | cancelled (rendu par le joueur). '
  '`expired` est ADMIS mais AUCUN chemin de L9 ne l''écrit : une prise dont la '
  'fenêtre est passée cesse d''être comptée par arithmétique, sans qu''aucune '
  'ligne ne change d''état — c''est ce qui rend la restitution exactement '
  'unique, faute de geste à répéter.';
comment on column public.reservation_stock_holds.redeem_expires_at is
  'Échéance GRAVÉE à la prise depuis `window_ends_at` de l''offre, jamais '
  'recalculée (doctrine 20260904120000). Miroitée en '
  '`reward_issuances.expires_at` : c''est elle que la caisse universelle '
  'applique pour refuser un retrait APRÈS la fenêtre. La borne AVANT est '
  'portée par redeem_stock_hold — voir la section 9.';

-- « Le restant de cette offre » : le seul chemin de comptage, et il porte
-- `offer_id` en tête parce que c'est par là qu'on l'interroge toujours.
create index reservation_stock_holds_offer_status_idx
  on public.reservation_stock_holds (offer_id, status);
-- « Mes prises chez ce commerçant » : le chemin de lecture joueur.
create index reservation_stock_holds_org_player_idx
  on public.reservation_stock_holds (organization_id, player_key_hash);
create index reservation_stock_holds_org_created_idx
  on public.reservation_stock_holds (organization_id, created_at desc);


-- ────────────────────────────────────────────────────────────
-- 3. Génération du code et gravure de l'échéance (service-authoritative)
--
-- Patron `reservations_set_code` (20261002120000:323) à deux différences près :
-- le PRÉFIXE `RESA-`, imposé par le registre universel, et la gravure de
-- l'échéance dans le même passage — les deux valeurs viennent de la base, aucune
-- ne peut être choisie par l'appelant.
--
-- LE CODE DE L'APPELANT EST ÉCRASÉ, TOUJOURS, et pour la raison écrite en
-- 20261002120000:312 : laisser choisir un identifiant de comptoir à qui sait
-- écrire dans la table ferait reposer son imprévisibilité sur la discipline de
-- l'appelant plutôt que sur la base.
--
-- L'ÉCHÉANCE, ELLE, EST RESPECTÉE SI ELLE EST DÉJÀ POSÉE — motif inverse, et
-- c'est celui de `set_reward_redeem_expiry` (20260904120000:352) : une reprise
-- de données ou une RPC future doit pouvoir poser une échéance particulière
-- sans que ce trigger la lui reprenne. La colonne étant `not null`, le cas
-- courant est de toute façon la gravure.
--
-- POURQUOI PAS `set_reward_redeem_expiry`, LE GRAVEUR GÉNÉRIQUE : il est de
-- forme « TTL EN JOURS » — il calcule `now() + make_interval(days => …)` depuis
-- une colonne `code_ttl_days` de la parente (20260904120000:396). Ici
-- l'échéance est un INSTANT ABSOLU déjà écrit sur l'offre. Lui ajouter une
-- branche aurait tordu son contrat pour un cas qui n'est pas le sien ; la
-- doctrine qu'il porte — graver à l'émission — est respectée à la lettre.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservation_stock_holds_set_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  for attempt in 1..12 loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || pg_catalog.substr(
        v_alphabet,
        pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1,
        1
      );
    end loop;
    v_code := 'RESA-' || v_code;
    if not exists (
      select 1 from public.reservation_stock_holds h
       where h.organization_id = new.organization_id
         and h.code = v_code
    ) then
      new.code := v_code;
      return new;
    end if;
  end loop;
  raise exception 'stock hold code generation exhausted';
end;
$$;

revoke all on function public.reservation_stock_holds_set_code()
  from public, anon, authenticated;

create trigger reservation_stock_holds_set_code
  before insert on public.reservation_stock_holds
  for each row execute function public.reservation_stock_holds_set_code();


create or replace function public.reservation_stock_holds_grave_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ends_at timestamptz;
begin
  if new.redeem_expires_at is not null then
    return new;
  end if;

  select o.window_ends_at into v_ends_at
    from public.reservation_stock_offers o
   where o.id = new.offer_id
     and o.organization_id = new.organization_id;

  if v_ends_at is null then
    -- La FK composite garantit l'existence de l'offre ; ce refus explicite
    -- couvre l'ordre d'exécution (le trigger précède la vérification de la FK)
    -- et refuse de graver une échéance nulle sur une colonne `not null`.
    raise exception 'stock offer % not found for hold expiry', new.offer_id
      using errcode = '23503';
  end if;

  new.redeem_expires_at := v_ends_at;
  return new;
end;
$$;

revoke all on function public.reservation_stock_holds_grave_expiry()
  from public, anon, authenticated;

-- APRÈS le poseur de code dans l'ordre alphabétique des noms de triggers
-- (`…_grave_expiry` < `…_set_code`) : les deux sont indépendants — l'un écrit
-- `code`, l'autre `redeem_expires_at` — donc leur ordre n'a aucune incidence.
create trigger reservation_stock_holds_grave_expiry
  before insert on public.reservation_stock_holds
  for each row execute function public.reservation_stock_holds_grave_expiry();


-- ────────────────────────────────────────────────────────────
-- 4. L'ÉTAT TERMINAL NE SE QUITTE PAS
--
-- Patron `reservation_waitlist_freeze_terminal` (20261004120000:447), et c'est
-- LUI qui rend l'exactly-once vrai sur les transitions terminales.
--
-- Les contraintes d'état interdisent DEUX fins ; elles n'interdisent pas de
-- revenir de `cancelled` à `held` en effaçant la date. C'est exactement le trou
-- par lequel une unité consommée repartirait dans le restant : rejeu de
-- migration, balayage écrit deux fois, écriture maladroite — et la même part
-- est vendue une seconde fois.
--
-- CE QU'IL LAISSE PASSER, ET IL LE DOIT : `email`, `consent_transactional_at`
-- et `player_key_hash`, par où passe la purge RGPD (section 13). Un gel total
-- aurait rendu la purge impossible sur les prises retirées — c'est-à-dire sur
-- celles qui ont le plus de valeur pour le commerçant, donc sur celles qui
-- restent le plus longtemps.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservation_stock_holds_freeze_terminal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('redeemed', 'cancelled', 'expired')
     and (new.status is distinct from old.status
          or new.redeemed_at is distinct from old.redeemed_at
          or new.redeemed_by is distinct from old.redeemed_by
          or new.basket_cents is distinct from old.basket_cents
          or new.cancelled_at is distinct from old.cancelled_at
          or new.redeem_expires_at is distinct from old.redeem_expires_at
          or new.offer_id is distinct from old.offer_id
          or new.code is distinct from old.code)
  then
    raise exception
      'stock hold % is terminal (%) and cannot be reopened', old.id, old.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.reservation_stock_holds_freeze_terminal()
  from public, anon, authenticated;

create trigger reservation_stock_holds_freeze_terminal
  before update on public.reservation_stock_holds
  for each row execute function public.reservation_stock_holds_freeze_terminal();


-- ────────────────────────────────────────────────────────────
-- 5. RLS et grants
--
-- Motif « campaign_templates: editors » pour l'offre ; lecture MEMBRE pour les
-- prises, parce que le CAISSIER doit voir qui vient chercher quoi — c'est son
-- écran de comptoir — là où il n'a rien à faire du catalogue d'offres.
-- ────────────────────────────────────────────────────────────

alter table public.reservation_stock_offers enable row level security;
alter table public.reservation_stock_holds enable row level security;

-- Les privilèges par défaut de Supabase servent anon/authenticated sur toute
-- nouvelle table de `public` : on repart de zéro. anon n'est JAMAIS re-servi.
revoke all on table public.reservation_stock_offers
  from public, anon, authenticated;
revoke all on table public.reservation_stock_holds
  from public, anon, authenticated;

create policy "reservation_stock_offers: editors" on public.reservation_stock_offers
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- LECTURE SEULE, et pour TOUS les membres (caissier compris). AUCUNE policy
-- d'écriture, délibérément : une policy `for all` ici aurait rendu le restant
-- contournable par un simple PostgREST — un éditeur aurait pu insérer la
-- 6e prise d'une offre de 5, et l'invariant n°1 serait tombé sans qu'aucune RPC
-- soit en cause.
create policy "reservation_stock_holds: members read" on public.reservation_stock_holds
  for select to authenticated
  using (public.is_org_member(organization_id));

-- AUCUN `grant delete` sur les offres : la cascade de la FK composite
-- emporterait les prises — donc les preuves de retrait — sans qu'aucun écran
-- n'ait compté ce qui allait disparaître. Motif et raison identiques à
-- 20261002120000:405. `status = 'closed'` ferme sans rien effacer.
grant select on table public.reservation_stock_offers to authenticated;
grant insert (organization_id, title, description, stock_total,
              window_starts_at, window_ends_at, per_player_limit, status)
  on public.reservation_stock_offers to authenticated;
grant update (title, description, stock_total,
              window_starts_at, window_ends_at, per_player_limit, status)
  on public.reservation_stock_offers to authenticated;

-- GRANT DE COLONNES, et `email` n'y est PAS. Le commerçant lit son comptoir —
-- qui a bloqué quoi, avec quel code, retiré ou non, pour quel panier ;
-- l'adresse n'existe que pour l'envoi transactionnel côté serveur.
-- Conséquence à connaître avant d'écrire la requête applicative : un `select *`
-- PostgREST sera REFUSÉ EN ENTIER sur cette table.
grant select (
  id, offer_id, organization_id, player_key_hash, consent_transactional_at,
  code, status, redeem_expires_at, redeemed_at, redeemed_by, basket_cents,
  cancelled_at, created_at
) on public.reservation_stock_holds to authenticated;


-- ────────────────────────────────────────────────────────────
-- 6. LE REGISTRE UNIVERSEL — la 10e famille
--
-- Cartographie établie en L3 (20261002120000:42-46 : « le rapprochement RESA-
-- viendra en L9 »). Six sites SQL portent la famille, et DEUX autres sont
-- refusés — les refus sont écrits ici parce qu'un site oublié et un site écarté
-- se ressemblent trop pour qu'on laisse le lecteur deviner lequel c'est.
--
--   ① le `check` de `source_type`                         (ci-dessous)
--   ② `reward_issuances_code_shape`                       (ci-dessous)
--   ③ `reward_issuances_source_code_match`                (ci-dessous)
--   ④ le filtre d'entrée de `redeem_reward_by_code`       (section 10)
--   ⑤ la branche d'émission de `sync_reward_issuance`     (section 7)
--   ⑥ les deux triggers, miroir et jumeau-à-la-suppression (section 8)
--
-- ── LES DEUX SITES REFUSÉS, ET POURQUOI ──
--
--   ✗ `experience_economic_policies` (20260805190000:1300). Cette table plafonne
--     le NOMBRE de récompenses qu'une expérience peut émettre. Le stock est déjà
--     plafonné par `stock_total`, sous verrou, et c'est l'invariant n°1 de ce
--     fichier. Y ajouter la famille aurait créé un SECOND plafond sur la MÊME
--     quantité, réglable ailleurs, capable de contredire le premier — et le
--     module entier est bâti sur le refus d'avoir deux vérités sur une seule
--     grandeur. `apply_economic_distribution_policy` reste sans effet : elle
--     sort par `if not found then return new` faute de ligne de politique, ce
--     qu'aucune écriture ne peut créer puisque le `check` de cette table-là
--     n'admet pas la famille.
--   ✗ `track_reward_issuance_analytics` (20260805160000:897). Elle alimente les
--     statistiques de JEU. Une réservation de stock n'est pas un gain de jeu —
--     c'est la première phrase de ce fichier et un critère dur du cahier. L'y
--     verser aurait fait entrer des parts de tarte dans le taux de conversion
--     des roues. La fonction sort en silence sur une famille inconnue
--     (`if v_kind is null then return new`), ce qui est ici le comportement
--     VOULU et non une perte à réparer.
-- ────────────────────────────────────────────────────────────

-- ① Le `check` de `source_type`. La contrainte est ANONYME dans la définition
-- d'origine (20260805150000:15) : Postgres l'a donc nommée
-- `reward_issuances_source_type_check`. `if exists` parce qu'un nom implicite
-- est une convention et non une garantie — si elle n'est pas là sous ce nom, la
-- migration doit s'arrêter net plutôt que d'ajouter une seconde contrainte à
-- côté de la première.
do $migration$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.reward_issuances'::regclass
       and conname = 'reward_issuances_source_type_check'
  ) then
    raise exception
      'reward_issuances_source_type_check est introuvable : la contrainte de '
      'famille a été renommée, cette migration décrirait un schéma qui n''existe plus';
  end if;
end
$migration$;

alter table public.reward_issuances
  drop constraint reward_issuances_source_type_check;
alter table public.reward_issuances
  add constraint reward_issuances_source_type_check check (
    source_type in (
      'wheel', 'hunt', 'loyalty', 'jackpot', 'event',
      'calendar', 'referral', 'quiz', 'contest', 'reserver_stock'
    )
  );

-- ② La forme du code. Le corps reste PERMISSIF pour la raison écrite en
-- 20260805150000:58-75 (le miroir ne doit jamais avoir de veto sur l'autorité) ;
-- seul le préfixe s'ajoute.
alter table public.reward_issuances
  drop constraint reward_issuances_code_shape;
alter table public.reward_issuances
  add constraint reward_issuances_code_shape check (
    code is null or code ~
      '^(GAIN|CHASSE|FIDELITE|JACKPOT|EVENT|CADEAU|PARRAIN|QUIZ|PRONO|RESA)-[A-Z0-9]{4,32}$'
  );

-- ③ La correspondance famille ↔ préfixe. Le `else false` est un deny-by-default :
-- sans cette branche, TOUTE écriture de la 10e famille portant un code serait
-- refusée — et le refus viendrait du registre, dans la transaction de la prise,
-- donc la prise elle-même échouerait.
alter table public.reward_issuances
  drop constraint reward_issuances_source_code_match;
alter table public.reward_issuances
  add constraint reward_issuances_source_code_match check (
    code is null or case source_type
      when 'wheel' then code ~ '^GAIN-'
      when 'hunt' then code ~ '^CHASSE-'
      when 'loyalty' then code ~ '^FIDELITE-'
      when 'jackpot' then code ~ '^JACKPOT-'
      when 'event' then code ~ '^EVENT-'
      when 'calendar' then code ~ '^CADEAU-'
      when 'referral' then code ~ '^PARRAIN-'
      when 'quiz' then code ~ '^QUIZ-'
      when 'contest' then code ~ '^PRONO-'
      when 'reserver_stock' then code ~ '^RESA-'
      else false
    end
  );


-- ────────────────────────────────────────────────────────────
-- 7. La branche d'émission de `sync_reward_issuance`
--
-- ⚠️ CE BLOC SE DÉRIVE, IL NE RECOPIE PAS — ET C'EST OBLIGATOIRE ICI, PAS
-- SEULEMENT PRÉFÉRABLE.
--
-- `sync_reward_issuance` a été LIVE-MUTÉE par 20260904120000:490-558 : ce
-- fichier-là lit la définition installée, y applique huit substitutions ancrées
-- et la rejoue. LE CORPS EN BASE NE CORRESPOND DONC PLUS AU TEXTE DE
-- 20260805150000. Un `create or replace` recopiant l'original augmenté d'une
-- branche RENDRAIT NULLE L'ÉCHÉANCE DES HUIT FAMILLES GRAVÉES — huit familles
-- dont les lots cesseraient d'expirer, en silence, sans qu'aucun test de ce
-- fichier ne le voie puisqu'il ne parle que de la dixième.
--
-- On lit donc la définition VIVANTE, on insère UNE branche devant le `else`
-- deny-by-default, et on rejoue. Deux gardes, comptées et non arrondies :
--   1. l'ancre est présente EXACTEMENT une fois avant substitution ;
--   2. la branche neuve est bien dans le corps INSTALLÉ après coup.
--
-- L'ANCRE EST LE `else` D'ERREUR, et c'est le seul point de la fonction qui ne
-- dépende d'aucune famille existante : ancrer sur la dernière branche
-- (`contest_awards`) aurait fait dépendre cette migration de l'ordre des
-- branches, que rien ne garantit.
--
-- LA BRANCHE NE REND JAMAIS `null::timestamptz as expires_at` : c'est la marque
-- que la garde de complétude de 20260904120000:544-554 compte, et une branche
-- qui la porterait ferait échouer tout rejeu de ce contrôle.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def text;
  v_motif constant text :=
    '  else' || E'\n'
    || '    raise exception ''unsupported reward legacy table''' || E'\n'
    || '      using errcode = ''22023'';' || E'\n'
    || '  end if;';
  v_branche constant text :=
    '  elsif p_legacy_table = ''reservation_stock_holds'' then' || E'\n'
    || '    select' || E'\n'
    || '      sh.organization_id,' || E'\n'
    || '      public.reward_player_from_legacy(' || E'\n'
    || '        sh.organization_id, ''reserver_stock'', sh.offer_id, sh.player_key_hash' || E'\n'
    || '      ) as player_id,' || E'\n'
    || '      ''reserver_stock''::text as source_type,' || E'\n'
    || '      sh.offer_id as experience_id,' || E'\n'
    || '      null::uuid as reward_definition_id,' || E'\n'
    || '      sh.code,' || E'\n'
    || '      coalesce(so.title, '''') as label,' || E'\n'
    || '      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(' || E'\n'
    || '        ''legacy_table'', ''reservation_stock_holds'',' || E'\n'
    || '        ''experience_label'', so.title,' || E'\n'
    || '        ''window_starts_at'', so.window_starts_at,' || E'\n'
    || '        ''window_ends_at'', so.window_ends_at' || E'\n'
    || '      )) as metadata,' || E'\n'
    || '      sh.created_at as issued_at,' || E'\n'
    || '      -- ÉCHÉANCE GRAVÉE À L''ÉMISSION (20260904120000) : lue sur la' || E'\n'
    || '      -- ligne émise, jamais recalculée depuis la parente.' || E'\n'
    || '      sh.redeem_expires_at as expires_at,' || E'\n'
    || '      sh.redeemed_at,' || E'\n'
    || '      sh.redeemed_by::text as redeemed_by,' || E'\n'
    || '      sh.cancelled_at,' || E'\n'
    || '      null::text as cancelled_reason,' || E'\n'
    || '      sh.basket_cents' || E'\n'
    || '      into v' || E'\n'
    || '      from public.reservation_stock_holds sh' || E'\n'
    || '      join public.reservation_stock_offers so' || E'\n'
    || '        on so.id = sh.offer_id' || E'\n'
    || '       and so.organization_id = sh.organization_id' || E'\n'
    || '     where sh.id = p_source_id;' || E'\n'
    || v_motif;
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into strict v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'sync_reward_issuance';

  v_hits := (pg_catalog.length(v_def)
             - pg_catalog.length(pg_catalog.replace(v_def, v_motif, '')))
            / pg_catalog.length(v_motif);
  if v_hits <> 1 then
    raise exception
      'sync_reward_issuance porte % occurrence(s) du « else » de famille inconnue au lieu d''une seule : la fonction a changé, cette migration décrirait du code qui n''existe plus',
      v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_motif, v_branche);
end
$migration$;

do $migration$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'sync_reward_issuance'
      and p.prosrc like '%reservation_stock_holds%'
  ) then
    raise exception
      'la branche reservation_stock_holds n''est pas dans le corps INSTALLÉ de sync_reward_issuance';
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 8. Les deux triggers de registre
--
-- Motif EXACT des dix jumeaux existants. Deux différences de vocabulaire à
-- ne pas confondre, et elles sont dans le dépôt depuis 20260902120000:227 :
--   * le trigger de MIROIR reçoit le NOM DE LA TABLE legacy ;
--   * le trigger de SUPPRESSION reçoit le `source_type` du registre.
--
-- `after insert or update` et non `after insert` seul : c'est ce qui fait que le
-- retrait — un `update` de la prise — se propage au registre sans qu'aucune RPC
-- n'ait à y écrire. Le panier et l'acteur suivent le même chemin.
-- ────────────────────────────────────────────────────────────

create trigger reservation_stock_holds_reward_issuance
after insert or update on public.reservation_stock_holds
for each row execute function
  public.mirror_reward_issuance('reservation_stock_holds');

create trigger reservation_stock_holds_reward_issuance_delete
after delete on public.reservation_stock_holds
for each row execute function
  public.cancel_reward_issuance_on_source_delete('reserver_stock');


-- ────────────────────────────────────────────────────────────
-- 9. L'IDENTITÉ JOUEUR — la 10e famille d'expérience
--
-- ── POURQUOI IL FAUT Y TOUCHER ──
--
-- Le cahier exige que la réservation soit RETROUVABLE DANS LE PORTEFEUILLE.
-- `player_wallet` (20260903120000:479) filtre sur `reward_issuances.player_id`,
-- que `sync_reward_issuance` résout par `reward_player_from_legacy` — laquelle
-- lit `player_legacy_identities`, dont l'existence même dépend d'une ligne de
-- `player_experience_memberships`, dont `experience_kind` porte un `check`
-- FERMÉ à neuf valeurs (20260805140000:99) ET un trigger de portée qui vérifie
-- que l'expérience appartient bien à l'organisation (20260805140000:292).
--
-- Sans ces deux extensions, le pont ne peut pas exister, `player_id` reste nul,
-- et la prise n'apparaît JAMAIS au portefeuille. L'émission, elle, fonctionne
-- quand même — `reward_player_from_legacy` est explicitement tolérante
-- (20260805150000:147) — c'est donc un défaut qui ne se serait vu qu'à
-- l'écran du joueur, sur une donnée qu'il est le seul à regarder.
--
-- L'EXPÉRIENCE EST L'OFFRE, pas l'organisation ni l'activité : c'est l'objet
-- sur lequel le joueur revient, et le grain auquel le registre range déjà
-- `experience_id`.
--
-- ⚠️ MIROIR TYPESCRIPT À FAIRE SUIVRE, HORS DE CE PÉRIMÈTRE :
-- `PLAYER_EXPERIENCE_KINDS` (src/lib/player-identity.ts:15) est la même liste
-- côté applicatif, et c'est elle que valide le schéma Zod du pont. Tant qu'elle
-- ne porte pas `reserver_stock`, aucune server action ne peut CRÉER le pont —
-- la base l'accepterait, l'application ne le proposera pas.
-- ────────────────────────────────────────────────────────────

alter table public.player_experience_memberships
  drop constraint player_experience_memberships_experience_kind_check;
alter table public.player_experience_memberships
  add constraint player_experience_memberships_experience_kind_check check (
    experience_kind in (
      'campaign', 'hunt', 'loyalty', 'jackpot', 'event',
      'calendar', 'referral', 'contest', 'quiz', 'reserver_stock'
    )
  );

-- Le validateur de portée. Son `return false` final est un deny-by-default :
-- sans cette branche, le `check` ci-dessus autoriserait la valeur et le trigger
-- refuserait la ligne — une contradiction dont le message d'erreur
-- (« player experience does not belong to organization ») aurait envoyé
-- chercher très loin de la cause.
create or replace function public.player_experience_scope_is_valid(
  p_experience_kind text,
  p_experience_id uuid,
  p_organization_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_experience_kind = 'campaign' then
    return exists (
      select 1 from public.campaigns c
       where c.id = p_experience_id
         and c.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'hunt' then
    return exists (
      select 1 from public.hunts h
       where h.id = p_experience_id
         and h.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'loyalty' then
    return exists (
      select 1 from public.loyalty_programs l
       where l.id = p_experience_id
         and l.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'jackpot' then
    return exists (
      select 1 from public.jackpot_campaigns j
       where j.id = p_experience_id
         and j.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'event' then
    return exists (
      select 1 from public.event_sessions e
       where e.id = p_experience_id
         and e.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'calendar' then
    return exists (
      select 1 from public.calendars c
       where c.id = p_experience_id
         and c.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'referral' then
    return exists (
      select 1 from public.referral_programs r
       where r.id = p_experience_id
         and r.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'contest' then
    return exists (
      select 1 from public.contests c
       where c.id = p_experience_id
         and c.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'quiz' then
    return exists (
      select 1 from public.quizzes q
       where q.id = p_experience_id
         and q.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'reserver_stock' then
    return exists (
      select 1 from public.reservation_stock_offers o
       where o.id = p_experience_id
         and o.organization_id = p_organization_id
    );
  end if;
  return false;
end;
$$;


-- ────────────────────────────────────────────────────────────
-- 10. `redeem_stock_hold` — le BRAS SOURCE de la caisse universelle
--
-- Ce n'est PAS un second point d'entrée de comptoir. C'est le pendant de
-- `redeem_contest_award` et de ses huit frères : `redeem_reward_by_code` route
-- vers lui, il applique les règles métier de SA famille et rend `redeemed_now`.
-- Le contrat du routeur (20260805150000:674) est respecté : la ligne source est
-- verrouillée AVANT que le registre ne soit touché.
--
-- ── OÙ VIT LA BORNE BASSE DE LA FENÊTRE, ET POURQUOI ICI ──
--
-- La borne HAUTE est déjà appliquée par le moteur universel, qui lit
-- `reward_issuances.expires_at` et rend `expired`. Il fallait décider où placer
-- la borne BASSE — « pas avant `window_starts_at` ». Deux options ont été
-- pesées :
--
--   (a) UNE COLONNE `redeem_not_before` SUR `reward_issuances`, symétrique
--       d'`expires_at`, lue par le routeur. ÉCARTÉE. Elle aurait donné au
--       registre une seconde sémantique temporelle utilisée par UNE seule
--       famille sur dix, et le registre ne conserve que « ce qui est un
--       invariant DU REGISTRE » (20260805150000:69). Son coût réel n'était pas
--       la colonne : c'était les seize paramètres d'`upsert_reward_issuance`, la
--       branche de chaque famille de `sync_reward_issuance` et le corps
--       live-muté de la section 7 — soit un rayon d'action de neuf familles pour
--       une règle qui n'en concerne qu'une.
--
--   (b) LA GARDE DANS LE BRAS SOURCE. RETENUE. Le commentaire du routeur dit
--       exactement cela de lui-même : il « route vers la RPC legacy autoritaire,
--       QUI CONSERVE SEULE LES RÈGLES MÉTIER » (20260805150000:891). Une fenêtre
--       de retrait promise par un commerçant est une règle métier de Réserver,
--       pas une propriété du registre.
--
-- CONSÉQUENCE ASSUMÉE, ET ELLE DOIT ÊTRE RELAYÉE À LA COUCHE APPLICATIVE : un
-- retrait tenté AVANT la fenêtre rend l'état `source_refused` — le bras refuse,
-- donc `redeemed_now` est faux et la source est trouvée. Le registre n'a pas de
-- mot pour « trop tôt », et lui en inventer un était précisément l'option (a).
-- C'est au comptoir qu'il faut phraser « retrait à partir de 19 h », à partir de
-- `stock_offers_staff_state`, qui rend la fenêtre.
--
-- LA PRISE ANNULÉE ET LA PRISE DÉJÀ RETIRÉE ne sont pas traitées ici : le
-- routeur les a déjà écartées sur le registre (`cancelled`, `already_redeemed`)
-- avant d'appeler ce bras, parce que le miroir porte les deux dates.
-- ────────────────────────────────────────────────────────────

create or replace function public.redeem_stock_hold(
  p_organization_id uuid,
  p_code text,
  p_actor text,
  p_basket_cents integer default null
)
returns table(
  id uuid, code text, status text, redeemed_at timestamptz,
  redeemed_now boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_actor_id uuid;
  v_hold public.reservation_stock_holds%rowtype;
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_actor is null
     or p_actor <> pg_catalog.btrim(p_actor)
     or p_actor !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_actor_id := p_actor::uuid;
  -- Les TROIS rôles marchands remettent une unité : c'est un geste de comptoir.
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor_id
       and om.role in ('owner', 'editor', 'cashier')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_basket_cents is not null
     and p_basket_cents not between 0 and 100000000 then
    raise exception 'invalid basket' using errcode = '22023';
  end if;

  v_code := pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')));

  select h.* into v_hold
    from public.reservation_stock_holds h
   where h.organization_id = p_organization_id
     and h.code = v_code;
  if not found then
    return;
  end if;

  -- MÊME CLÉ DE VERROU que hold_stock_offer et cancel_stock_hold : sans elle,
  -- le retrait et l'annulation d'une même prise cesseraient de se sérialiser, et
  -- une unité pourrait être rendue au restant à l'instant où elle sort du
  -- magasin.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_stock_offer:' || v_hold.organization_id::text
        || ':' || v_hold.offer_id::text,
      0)
  );

  update public.reservation_stock_holds h
     set status = 'redeemed',
         redeemed_at = pg_catalog.now(),
         redeemed_by = v_actor_id,
         basket_cents = p_basket_cents
   where h.id = v_hold.id
     -- Deny-by-default : SEULE une prise vivante se retire. Couvre l'annulée,
     -- couvre la déjà-retirée (idempotence), et couvrira tout statut ajouté
     -- plus tard sans qu'on y repense.
     and h.status = 'held'
     -- LA FENÊTRE. La borne haute est ceinture ET bretelles : le routeur l'a
     -- déjà appliquée depuis le registre, mais un bras source qui ne la porterait
     -- pas deviendrait faux le jour où quelqu'un l'appelle autrement.
     and pg_catalog.now() >= (
       select o.window_starts_at
         from public.reservation_stock_offers o
        where o.id = h.offer_id
          and o.organization_id = h.organization_id
     )
     and pg_catalog.now() < h.redeem_expires_at
  returning h.id into v_id;

  if v_id is not null then
    insert into public.audit_logs (organization_id, actor, action, metadata)
    values (p_organization_id, p_actor, 'reservation.stock_redeem',
            pg_catalog.jsonb_build_object('hold_id', v_id));
  end if;

  -- La ligne est rendue même quand rien n'a été consommé : le routeur a besoin
  -- de savoir que la SOURCE EXISTE (`found`) pour distinguer `source_missing` de
  -- `source_refused`.
  return query
  select h.id, h.code, h.status, h.redeemed_at,
         (h.id is not distinct from v_id)
    from public.reservation_stock_holds h
   where h.id = v_hold.id;
end;
$$;

comment on function public.redeem_stock_hold(uuid, text, text, integer) is
  'BRAS SOURCE de redeem_reward_by_code pour la famille `reserver_stock` — PAS '
  'un point d''entrée de comptoir : la caisse n''a qu''une porte, et c''est le '
  'routeur universel. Org-scopée, acteur vérifié membre owner/editor/cashier EN '
  'SQL, idempotente (`redeemed_now` distingue le geste de sa répétition), '
  'auditée sous `reservation.stock_redeem`. BORNÉE PAR LA FENÊTRE DE RETRAIT '
  'aux DEUX bouts : la borne haute double celle que le registre applique déjà '
  'via `expires_at`, la borne basse n''existe QUE là — un retrait tenté avant '
  '`window_starts_at` ressort du routeur en `source_refused`. Hors fenêtre, la '
  'prise n''est PAS consommée.';

revoke all on function public.redeem_stock_hold(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.redeem_stock_hold(uuid, text, text, integer)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 11. Le routeur universel apprend la 10e famille
--
-- MÊME TECHNIQUE QU'EN SECTION 7, et pour une raison plus faible mais réelle :
-- `redeem_reward_by_code` n'a PAS été live-mutée, donc la recopier serait
-- possible. Elle fait deux cent dix lignes et porte neuf branches de routage ;
-- la recopier pour changer deux endroits créerait la seconde source de vérité
-- que ce dépôt a nommée « la classe de défaut la plus coûteuse du projet »
-- (20260904120000:462-467). Deux substitutions ancrées, deux gardes de compte.
--
-- LE PANIER N'A PAS BESOIN D'UNE TROISIÈME SUBSTITUTION. Le routeur ne recopie
-- `p_basket_cents` dans le registre que pour `wheel` et `contest`
-- (20260805150000:819) ; pour cette famille il n'en a pas besoin, parce que le
-- bras source l'écrit sur LA PRISE et que le trigger de miroir — qui suit les
-- `update` — le propage au registre de lui-même. L'autorité écrit, le miroir
-- suit : c'est la règle de la famille, et elle évite ici de toucher une
-- expression partagée par les neuf autres.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def text;
  -- ANCRE 1 : le filtre d'entrée, strictement aligné sur
  -- `reward_issuances_code_shape` (§ ② de la section 6). Un filtre plus étroit
  -- que la contrainte rendrait des prises réelles introuvables en caisse.
  v_motif_regex constant text :=
    '''^(GAIN|CHASSE|FIDELITE|JACKPOT|EVENT|CADEAU|PARRAIN|QUIZ|PRONO)-[A-Z0-9]{4,32}$''';
  v_grave_regex constant text :=
    '''^(GAIN|CHASSE|FIDELITE|JACKPOT|EVENT|CADEAU|PARRAIN|QUIZ|PRONO|RESA)-[A-Z0-9]{4,32}$''';
  -- ANCRE 2 : la fin de la chaîne de routage. On insère la branche AVANT le
  -- `end if;` qui la clôt.
  v_motif_route constant text :=
    '        ) r limit 1;' || E'\n'
    || '    end if;' || E'\n'
    || '    v_source_found := found;';
  v_grave_route constant text :=
    '        ) r limit 1;' || E'\n'
    || '    elsif v_issue.source_type = ''reserver_stock'' then' || E'\n'
    || '      select r.redeemed_now into v_legacy_redeemed' || E'\n'
    || '        from public.redeem_stock_hold(' || E'\n'
    || '          p_organization_id, v_code, p_actor, p_basket_cents' || E'\n'
    || '        ) r limit 1;' || E'\n'
    || '    end if;' || E'\n'
    || '    v_source_found := found;';
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into strict v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'redeem_reward_by_code';

  v_hits := (pg_catalog.length(v_def)
             - pg_catalog.length(pg_catalog.replace(v_def, v_motif_regex, '')))
            / pg_catalog.length(v_motif_regex);
  if v_hits <> 1 then
    raise exception
      'redeem_reward_by_code porte % occurrence(s) du filtre de préfixes au lieu d''une seule',
      v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_motif_regex, v_grave_regex);

  v_hits := (pg_catalog.length(v_def)
             - pg_catalog.length(pg_catalog.replace(v_def, v_motif_route, '')))
            / pg_catalog.length(v_motif_route);
  if v_hits <> 1 then
    raise exception
      'redeem_reward_by_code porte % occurrence(s) de la fin de chaîne de routage au lieu d''une seule',
      v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_motif_route, v_grave_route);

  execute v_def;
end
$migration$;

do $migration$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'redeem_reward_by_code'
      and p.prosrc like '%redeem_stock_hold%'
      and p.prosrc like '%RESA%'
  ) then
    raise exception
      'le routage RESA- n''est pas dans le corps INSTALLÉ de redeem_reward_by_code';
  end if;
end
$migration$;

-- Les privilèges partent-ils avec un `create or replace` ? NON — c'est un
-- remplacement, pas une re-création, donc l'ACL survit. Ces deux ordres sont
-- donc redondants ; ils sont écrits parce que la fonction vient d'être rejouée
-- depuis une définition dérivée, et qu'une garantie d'ACL qui repose sur « ça
-- n'a pas dû changer » n'est pas une garantie. pgTAP le vérifie (ACL).
revoke all on function public.redeem_reward_by_code(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.redeem_reward_by_code(uuid, text, text, integer)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 12. Les RPC joueur et comptoir
-- ────────────────────────────────────────────────────────────

-- ── `hold_stock_offer` — le seul chemin par lequel une unité se bloque ──
--
-- ── LE RESTANT SE DÉRIVE, ET LE VERROU EST CE QUI LE REND VRAI ──
--
-- `remaining = stock_total − (prises « held » NON ÉCHUES + prises « redeemed »)`.
-- Lu et écrit sous le MÊME verrou d'avis, donc deux prises simultanées sur la
-- dernière unité ne peuvent pas toutes deux voir « il en reste une ».
--
-- POURQUOI CETTE LISTE D'ÉTATS, EXACTEMENT :
--   * `held` NON ÉCHUE compte — c'est la réservation en cours ;
--   * `held` ÉCHUE ne compte plus — L'UNITÉ EST RESTITUÉE, par arithmétique et
--     sans qu'aucune ligne ne bouge. C'est la leçon L8 : il n'y a pas de geste
--     de restitution, donc pas de geste à faire deux fois ;
--   * `redeemed` compte POUR TOUJOURS, même passé la fenêtre — l'objet est
--     sorti du magasin, et l'oublier remettrait en vente une part mangée ;
--   * `cancelled` ne compte pas — l'unité est réellement rendue ;
--   * `expired`, que rien n'écrit en L9, ne compte pas non plus : la liste est
--     positive, donc un état inconnu n'entre jamais dans le décompte par défaut.
--
-- ── POURQUOI AUCUN INDEX UNIQUE NE GARDE `per_player_limit` ──
--
-- Il faut le dire, parce que le module a l'habitude inverse : `reservations`
-- porte un index unique partiel en plus de son comptage sous verrou. Ici c'est
-- IMPOSSIBLE — la borne ne vit pas sur la prise mais sur l'OFFRE, et un index
-- ne peut pas lire une colonne d'une autre table. Le comptage sous verrou est
-- donc la seule garantie, et c'est le MÊME verrou que celui du restant : les
-- deux bornes sont franchies ou refusées dans le même instantané.
--
-- ORDRE DES REFUS, ET IL COMPTE (motif `reserve_slot`) : le plafond par
-- personne est évalué AVANT le restant. Quelqu'un qui a déjà sa part sur une
-- offre épuisée doit retrouver SA prise, pas s'entendre dire « épuisé » sur une
-- unité qu'il détient.
create or replace function public.hold_stock_offer(
  p_organization_id uuid,
  p_offer_id uuid,
  p_player_key_hash text,
  p_email text default null,
  p_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.reservation_stock_offers%rowtype;
  v_email text;
  v_mine integer;
  v_existing public.reservation_stock_holds%rowtype;
  v_taken integer;
  v_row public.reservation_stock_holds%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null
     and (pg_catalog.char_length(v_email) > 254
          or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  then
    return pg_catalog.jsonb_build_object('state', 'invalid_email');
  end if;

  -- LE VERROU D'ABORD, LA LECTURE ENSUITE — motif `reserve_slot` : tout ce qui
  -- décide, `stock_total` compris, est lu dans le même instantané que le
  -- comptage. Un éditeur qui abaisse son stock entre les deux ne peut pas faire
  -- accorder une unité sur l'ancien chiffre.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_stock_offer:' || p_organization_id::text
        || ':' || p_offer_id::text,
      0)
  );

  select o.* into v_offer
    from public.reservation_stock_offers o
   where o.id = p_offer_id
     and o.organization_id = p_organization_id;

  -- UN SEUL ÉTAT POUR CINQ REFUS : offre inexistante, offre d'une AUTRE
  -- organisation, offre non ouverte, fenêtre déjà passée, organisation sans le
  -- droit `vitrine`. Les distinguer donnerait à un appelant public un oracle
  -- sur l'existence d'une offre et sur l'état commercial d'une organisation qui
  -- n'est pas la sienne — même arbitrage que `reserve_slot`.
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LA PRISE EST OUVERTE DÈS `open`, SANS ATTENDRE LE DÉBUT DE LA FENÊTRE :
  -- c'est la décision de l'en-tête, et c'est ce qui fait exister le Drop
  -- annoncé. Seule la FIN de fenêtre ferme la prise — bloquer une unité qu'on
  -- ne pourra jamais retirer serait une promesse sans issue.
  if v_offer.status <> 'open'
     or v_offer.window_ends_at <= pg_catalog.now()
     -- DÉFENSE EN PROFONDEUR : la couche applicative vérifiera ce droit pour
     -- rendre au commerçant un message utile ; ici il empêche que la fermeture
     -- d'un abonnement laisse une page de réservation ouverte en écriture.
     or not public.org_has_module_access(v_offer.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE PLAFOND PAR PERSONNE, ÉVALUÉ AVANT LE RESTANT. Même prédicat d'états que
  -- le comptage global — deux listes qui divergeraient rendraient « déjà pris »
  -- sur une prise que le restant ne voit plus.
  select pg_catalog.count(*)::integer into v_mine
    from public.reservation_stock_holds h
   where h.offer_id = p_offer_id
     and h.player_key_hash = p_player_key_hash
     and (
       (h.status = 'held' and h.redeem_expires_at > pg_catalog.now())
       or h.status = 'redeemed'
     );

  if v_mine >= v_offer.per_player_limit then
    -- IDEMPOTENT plutôt que fautif : on rend LA prise vivante la plus récente,
    -- avec son code et son statut, pour que la page puisse l'afficher au lieu
    -- d'un refus que le joueur ne comprendrait pas — il tient l'objet.
    -- TRI STABLE, `id` COMPRIS. `created_at` vaut `now()`, c'est-à-dire
    -- l'instant de la TRANSACTION : deux prises posées dans la même transaction
    -- portent la MÊME date à la microseconde près, et `order by created_at desc`
    -- seul rendrait alors l'une ou l'autre au gré du plan d'exécution. Le joueur
    -- verrait son code changer d'un rafraîchissement à l'autre, sans que rien
    -- n'ait bougé. Même départage que le rang de `reservation_public_state`.
    select h.* into v_existing
      from public.reservation_stock_holds h
     where h.offer_id = p_offer_id
       and h.player_key_hash = p_player_key_hash
       and (
         (h.status = 'held' and h.redeem_expires_at > pg_catalog.now())
         or h.status = 'redeemed'
       )
     order by h.created_at desc, h.id desc
     limit 1;
    return pg_catalog.jsonb_build_object(
      'state', 'already_held',
      'hold_id', v_existing.id,
      'code', v_existing.code,
      'status', v_existing.status,
      'per_player_limit', v_offer.per_player_limit
    );
  end if;

  -- LE RESTANT. Cette liste d'états et celle du plafond ci-dessus sont la
  -- même — les modifier ensemble.
  select pg_catalog.count(*)::integer into v_taken
    from public.reservation_stock_holds h
   where h.offer_id = p_offer_id
     and (
       (h.status = 'held' and h.redeem_expires_at > pg_catalog.now())
       or h.status = 'redeemed'
     );

  if v_taken >= v_offer.stock_total then
    -- `remaining: 0` ET RIEN D'AUTRE. Pas de « il en reste chez le voisin », pas
    -- de date de réapprovisionnement : le module ne sait rien du stock réel
    -- au-delà de ce nombre, et un oracle inventé se ferait démentir au comptoir.
    return pg_catalog.jsonb_build_object(
      'state', 'sold_out',
      'remaining', 0
    );
  end if;

  insert into public.reservation_stock_holds (
    offer_id, organization_id, player_key_hash, email, consent_transactional_at
  ) values (
    v_offer.id,
    v_offer.organization_id,
    p_player_key_hash,
    -- L'ADRESSE N'EST CONSERVÉE QUE SI ELLE EST CONSENTIE — motif
    -- `reserve_slot` : une donnée personnelle sans finalité ne se stocke pas
    -- « au cas où », et la contrainte d'équivalence refuserait la ligne.
    case when coalesce(p_consent, false) then v_email end,
    case when coalesce(p_consent, false) and v_email is not null
         then pg_catalog.now() end
  )
  returning * into v_row;

  return pg_catalog.jsonb_build_object(
    'state', 'held',
    'hold_id', v_row.id,
    'code', v_row.code,
    'window_starts_at', v_offer.window_starts_at,
    'window_ends_at', v_offer.window_ends_at,
    'redeem_expires_at', v_row.redeem_expires_at,
    'remaining', v_offer.stock_total - (v_taken + 1)
  );
end;
$$;

comment on function public.hold_stock_offer(uuid, uuid, text, text, boolean) is
  'Bloque UNE unité de stock sur une offre, DANS UNE ORGANISATION DONNÉE. '
  'Atomique : verrou d''avis sur l''offre, puis lecture de l''offre ET comptage '
  'des prises vivantes sous ce verrou — aucune unité n''est attribuée deux '
  'fois. Le restant se DÉDUIT (`stock_total` moins les prises `held` non échues '
  'et `redeemed`) : une prise expirée ou annulée restitue son unité par '
  'ARITHMÉTIQUE, sans job de réapprovisionnement et sans compteur à compenser — '
  'donc exactement une fois. Idempotente au plafond `per_player_limit` '
  '(rend `already_held` et la prise existante). Rend `sold_out` avec '
  '`remaining: 0` et RIEN de plus, `invalid_email` sur une adresse malformée, '
  'et `unavailable` — indistinctement — pour une offre inexistante, d''une '
  'AUTRE organisation, non ouverte, à fenêtre déjà passée, ou dont '
  'l''organisation n''a pas le droit `vitrine`. LA PRISE EST POSSIBLE DÈS QUE '
  'L''OFFRE EST OUVERTE, y compris avant le début de la fenêtre : c''est le '
  'retrait, et lui seul, qui est borné par la fenêtre.';

revoke all on function public.hold_stock_offer(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.hold_stock_offer(uuid, uuid, text, text, boolean)
  to service_role;


-- ── `cancel_stock_hold` — l'unité revient à l'offre ──
--
-- AUTORISATION PAR POSSESSION : le couple (identifiant, empreinte du cookie)
-- fait foi, motif `cancel_reservation`. Aucune organisation en paramètre — la
-- connaître n'ajouterait rien, et l'empreinte seule rend l'énumération sans
-- objet.
--
-- LE VERROU EST LE MÊME QUE CELUI DE `hold_stock_offer`, organisation comprise :
-- deux clés divergentes ne se verrouilleraient pas mutuellement, et l'unité
-- pourrait être reprise par quelqu'un d'autre pendant qu'elle est rendue.
--
-- ANNULER APRÈS LA FENÊTRE EST REFUSÉ (`too_late`), et ce n'est pas une
-- formalité : passé la fenêtre, l'unité est DÉJÀ revenue au restant par
-- arithmétique, donc l'annulation ne rendrait rien — elle ne ferait que
-- transformer un NON-RETRAIT en désistement dans les compteurs du commerçant.
-- Or « combien de gens ont bloqué sans venir » est la seule mesure que RES-5
-- lui promet sur le gaspillage. Même borne, lue dans l'autre sens, que celle du
-- retrait. Précédent exact : `cancel_reservation` et son `too_late`.
create or replace function public.cancel_stock_hold(
  p_hold_id uuid,
  p_player_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer_id uuid;
  v_org_id uuid;
  v_row public.reservation_stock_holds%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Cette garde de forme est aussi ce qui rend une ligne PURGÉE inatteignable :
  -- son `player_key_hash` vaut alors `purge:<id>`, qui ne peut pas la franchir.
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  -- Lecture SANS verrou, pour connaître l'offre ET SON ORGANISATION — les deux
  -- moitiés de la clé. Rien n'est décidé dessus : tout est relu sous le verrou.
  select h.offer_id, h.organization_id into v_offer_id, v_org_id
    from public.reservation_stock_holds h
   where h.id = p_hold_id
     and h.player_key_hash = p_player_key_hash
     and h.player_key_hash not like 'purge:%';
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_stock_offer:' || v_org_id::text || ':' || v_offer_id::text,
      0)
  );

  select h.* into v_row
    from public.reservation_stock_holds h
   where h.id = p_hold_id
     and h.player_key_hash = p_player_key_hash
     and h.player_key_hash not like 'purge:%';
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- UNE UNITÉ RETIRÉE NE S'ANNULE PAS. L'objet est sorti du magasin ; réécrire
  -- l'histoire remettrait en vente une part mangée, et la contrainte terminale
  -- refuserait la ligne de toute façon.
  if v_row.status = 'redeemed' then
    return pg_catalog.jsonb_build_object(
      'state', 'already_redeemed',
      'hold_id', v_row.id
    );
  end if;

  -- IDEMPOTENCE, ET AVANT `too_late` : une prise déjà annulée le reste, que sa
  -- fenêtre soit passée ou non, et `cancelled_at` n'est pas repoussé à chaque
  -- appel. C'est CE point qui rend la restitution unique côté annulation —
  -- rejouer l'appel n'écrit rien.
  if v_row.status = 'cancelled' then
    return pg_catalog.jsonb_build_object(
      'state', 'cancelled',
      'hold_id', v_row.id,
      'cancelled_at', v_row.cancelled_at
    );
  end if;

  if v_row.redeem_expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object(
      'state', 'too_late',
      'hold_id', v_row.id,
      'redeem_expires_at', v_row.redeem_expires_at
    );
  end if;

  update public.reservation_stock_holds
     set status = 'cancelled',
         cancelled_at = pg_catalog.now()
   where id = v_row.id
     -- Ceinture sous le verrou : la condition d'état est REPOSÉE dans le `where`
     -- pour que deux appels concurrents ne puissent pas tous deux écrire.
     and status = 'held'
  returning * into v_row;

  return pg_catalog.jsonb_build_object(
    'state', 'cancelled',
    'hold_id', v_row.id,
    'cancelled_at', v_row.cancelled_at
  );
end;
$$;

comment on function public.cancel_stock_hold(uuid, text) is
  'Rend une unité bloquée, sur preuve de possession (identifiant + empreinte du '
  'cookie joueur). IDEMPOTENTE : la seconde annulation n''écrit rien et ne '
  'repousse pas `cancelled_at` — c''est ce qui rend la restitution exactement '
  'unique. Refuse `already_redeemed` sur une unité déjà retirée, `too_late` '
  'passé la fenêtre (l''unité y est DÉJÀ revenue au restant par arithmétique : '
  'annuler ne rendrait rien et transformerait un non-retrait en désistement '
  'dans les compteurs du commerçant), et `unknown` sur une ligne purgée. Libère '
  'l''unité SANS décrémenter quoi que ce soit, sous le MÊME verrou d''avis que '
  'hold_stock_offer.';

revoke all on function public.cancel_stock_hold(uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_stock_hold(uuid, text)
  to service_role;


-- ── `stock_offer_public_state` — la page publique d'une offre ──
--
-- `p_player_key_hash` est FACULTATIF : un visiteur qui n'a pas encore de cookie
-- doit pouvoir lire le restant. Fourni, il fait apparaître `my_hold`.
--
-- LE RESTANT RENDU ICI EST HONNÊTE MAIS NON VERROUILLÉ, et il faut le dire :
-- c'est une PHOTO, pas une réservation. Entre cette lecture et un appel à
-- `hold_stock_offer`, le nombre peut tomber à zéro — c'est `hold_stock_offer`,
-- sous verrou, qui décide seule. Rendre ici un chiffre verrouillé aurait
-- sérialisé toutes les consultations d'une page publique derrière la même clé,
-- pour une garantie qui ne survit de toute façon pas au retour réseau.
create or replace function public.stock_offer_public_state(
  p_offer_id uuid,
  p_player_key_hash text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_offer public.reservation_stock_offers%rowtype;
  v_taken integer;
  v_mine jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Fourni, il doit être BIEN FORMÉ — une valeur libre atteindrait le marqueur
  -- de purge. Absent, la lecture reste ouverte : c'est une page publique.
  if p_player_key_hash is not null
     and p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  select o.* into v_offer
    from public.reservation_stock_offers o
   where o.id = p_offer_id;

  -- MÊME MUTISME que hold_stock_offer : offre inconnue, offre en brouillon,
  -- organisation sans le droit. `closed` est SERVIE, délibérément — les gens qui
  -- ont déjà bloqué leur part doivent continuer à lire leur code et l'heure.
  if not found
     or v_offer.status = 'draft'
     or not public.org_has_module_access(v_offer.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select pg_catalog.count(*)::integer into v_taken
    from public.reservation_stock_holds h
   where h.offer_id = v_offer.id
     and (
       (h.status = 'held' and h.redeem_expires_at > pg_catalog.now())
       or h.status = 'redeemed'
     );

  if p_player_key_hash is not null then
    select pg_catalog.jsonb_build_object(
             'hold_id', h.id,
             'code', h.code,
             'status', h.status,
             'redeem_expires_at', h.redeem_expires_at
           )
      into v_mine
      from public.reservation_stock_holds h
     where h.offer_id = v_offer.id
       and h.player_key_hash = p_player_key_hash
       and h.player_key_hash not like 'purge:%'
       and h.status in ('held', 'redeemed')
     -- Tri stable, `id` compris — même raison que `hold_stock_offer` : deux
     -- prises de la même transaction partagent `created_at` à l'identique.
     order by h.created_at desc, h.id desc
     limit 1;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'offer_id', v_offer.id,
    'title', v_offer.title,
    'description', v_offer.description,
    'status', v_offer.status,
    'window_starts_at', v_offer.window_starts_at,
    'window_ends_at', v_offer.window_ends_at,
    'per_player_limit', v_offer.per_player_limit,
    -- `greatest(…, 0)` : le restant ne descend pas sous zéro même si le
    -- commerçant abaisse `stock_total` sous le nombre de prises déjà tenues.
    -- Un négatif affiché serait une invitation à croire à un bogue là où il n'y
    -- a qu'une décision commerciale.
    'remaining', greatest(v_offer.stock_total - v_taken, 0),
    'my_hold', v_mine
  );
end;
$$;

comment on function public.stock_offer_public_state(uuid, text) is
  'État public d''une offre de stock : titre, fenêtre de retrait, restant '
  'HONNÊTE et — si l''empreinte du cookie est fournie — la prise du joueur '
  '{code, statut, échéance}. L''empreinte est FACULTATIVE : un visiteur sans '
  'cookie lit quand même le restant. Le restant est une PHOTO non verrouillée, '
  'jamais une réservation : seule hold_stock_offer tranche, sous verrou. Rend '
  '`unavailable` — indistinctement — pour une offre inconnue, en brouillon, ou '
  'dont l''organisation n''a pas le droit `vitrine` ; une offre `closed` est '
  'SERVIE, pour que les prises déjà tenues restent lisibles.';

revoke all on function public.stock_offer_public_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.stock_offer_public_state(uuid, text)
  to service_role;


-- ── `stock_offers_staff_state` — le comptoir voit ses quotas ──
--
-- Les quatre nombres que le cahier exige côté staff : combien d'unités au
-- total, combien tenues MAINTENANT, combien retirées, et combien de prises se
-- sont éteintes sans que personne ne vienne. Ce dernier — `expired_count` — est
-- entièrement DÉRIVÉ (`held` dont la fenêtre est passée) : c'est la mesure du
-- gaspillage évité qui ne l'a pas été, et elle n'existe dans aucune colonne.
create or replace function public.stock_offers_staff_state(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'offer_id', o.id,
        'title', o.title,
        -- LA DESCRIPTION EST RENDUE PARCE QUE LE PANNEAU LA RÉÉCRIT.
        --
        -- Ce n'est pas un ornement d'affichage : le formulaire d'édition du
        -- commerçant poste TOUS les champs de l'offre, `description` comprise.
        -- Sans elle ici, le champ se préremplissait vide et le premier
        -- enregistrement EFFAÇAIT la description — un texte que personne n'avait
        -- demandé de supprimer, sans confirmation et sans moyen de le retrouver.
        -- La règle du dépôt est « un champ non rendu ne réécrit pas » ; ici le
        -- champ EST rendu, donc c'est sa valeur qu'il faut lui donner à lire.
        'description', o.description,
        'status', o.status,
        'window_starts_at', o.window_starts_at,
        'window_ends_at', o.window_ends_at,
        'stock_total', o.stock_total,
        'per_player_limit', o.per_player_limit,
        'held_count', c.held_count,
        'redeemed_count', c.redeemed_count,
        'expired_count', c.expired_count,
        'cancelled_count', c.cancelled_count,
        'remaining',
          greatest(o.stock_total - (c.held_count + c.redeemed_count), 0)
      )
      order by o.window_starts_at desc
    ),
    '[]'::jsonb
  ) into v_items
    from public.reservation_stock_offers o
    cross join lateral (
      select
        pg_catalog.count(*) filter (
          where h.status = 'held' and h.redeem_expires_at > pg_catalog.now()
        )::integer as held_count,
        pg_catalog.count(*) filter (where h.status = 'redeemed')::integer
          as redeemed_count,
        -- DÉRIVÉ, et c'est tout l'objet du module : aucune ligne ne porte cet
        -- état. Une prise `held` dont la fenêtre est passée a rendu son unité
        -- sans qu'on la touche, et se compte ici pour que le commerçant sache
        -- combien de gens n'ont pas honoré leur réservation.
        pg_catalog.count(*) filter (
          where h.status = 'held' and h.redeem_expires_at <= pg_catalog.now()
        )::integer as expired_count,
        pg_catalog.count(*) filter (where h.status = 'cancelled')::integer
          as cancelled_count
      from public.reservation_stock_holds h
     where h.offer_id = o.id
       and h.organization_id = o.organization_id
    ) c
   where o.organization_id = p_organization_id;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'offers', v_items
  );
end;
$$;

comment on function public.stock_offers_staff_state(uuid) is
  'Offres de stock d''une organisation et leurs compteurs, pour l''écran de '
  'comptoir : tenues MAINTENANT, retirées, ÉTEINTES SANS RETRAIT et annulées, '
  'plus le restant. Rend AUSSI `description`, parce que le panneau d''édition '
  'réécrit ce champ : sans lui, le formulaire le préremplissait vide et le '
  'premier enregistrement effaçait le texte. `expired_count` est entièrement DÉRIVÉ — aucune ligne ne '
  'porte cet état — et mesure les prises que personne n''est venu chercher. '
  'N''expose ni l''email ni l''empreinte des joueurs : la preuve de retrait '
  '(qui, quand, quel panier) se lit sur la table, ouverte en lecture à tous les '
  'membres.';

revoke all on function public.stock_offers_staff_state(uuid)
  from public, anon, authenticated;
grant execute on function public.stock_offers_staff_state(uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 13. `reservation_public_state` — le joueur retrouve sa part
--
-- CORPS DE 20261007120000 (section 10) RECOPIÉ, SIGNATURE ET TYPE DE RETOUR
-- INCHANGÉS. Une clé s'ajoute au document : `stockHolds`.
--
-- CE QUI Y ENTRE : les prises VIVANTES (`held` non échue) et les RÉCENTES
-- (`redeemed` ou échue depuis moins de 24 h). Une prise retirée hier doit
-- rester lisible un moment — c'est la preuve que le joueur est venu — mais
-- l'historique complet n'a pas sa place sur une page d'accueil : le portefeuille
-- (`player_wallet`) le porte déjà, et il est fait pour ça.
--
-- LES DEUX LECTURES NE FONT PAS DOUBLON. `player_wallet` est GLOBAL (toutes
-- organisations, par le pont d'identité) et sert la page « mes récompenses » ;
-- `reservation_public_state` est borné À CETTE ORGANISATION et sert la page du
-- commerce. Un joueur sans pont d'identité résolu voit quand même ses prises
-- ici — et c'est nécessaire, puisque le pont est créé par la couche applicative
-- qui n'est pas encore câblée.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservation_public_state(
  p_organization_id uuid,
  p_player_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_items jsonb;
  v_waitlist jsonb;
  v_stock jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  select o.timezone into v_timezone
    from public.organizations o
   where o.id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_timezone is null or not public.is_valid_timezone(v_timezone) then
    v_timezone := 'Europe/Paris';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'reservation_id', r.id,
        'code', r.code,
        'status', r.status,
        'created_at', r.created_at,
        'cancelled_at', r.cancelled_at,
        'checked_in_at', r.checked_in_at,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'activity_name', a.name,
        'party_size', r.party_size
      )
      order by s.starts_at desc
    ),
    '[]'::jsonb
  ) into v_items
    from public.reservations r
    join public.reservation_slots s
      on s.id = r.slot_id
     and s.organization_id = p_organization_id
    join public.reservation_activities a
      on a.id = s.activity_id
     and a.organization_id = p_organization_id
   where r.organization_id = p_organization_id
     and r.player_key_hash = p_player_key_hash
     and r.player_key_hash not like 'purge:%';

  -- LA FILE. Le RANG est recalculé ici, à la lecture, exactement comme la
  -- capacité : il compte les entrées vivantes du même créneau inscrites avant
  -- celle-ci. La comparaison de LIGNES `(created_at, id) < (…)` départage deux
  -- inscriptions de la même milliseconde de façon stable.
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'entry_id', w.id,
        'slot_id', w.slot_id,
        'status', w.status,
        'created_at', w.created_at,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'activity_name', a.name,
        'offer_expires_at', w.offer_expires_at,
        'offer_live',
          w.status = 'offered' and w.offer_expires_at > pg_catalog.now(),
        'position', (
          select pg_catalog.count(*)::integer + 1
            from public.reservation_waitlist_entries w2
           where w2.slot_id = w.slot_id
             and w2.status in ('waiting', 'offered')
             and (w2.created_at, w2.id) < (w.created_at, w.id)
        )
      )
      order by s.starts_at asc
    ),
    '[]'::jsonb
  ) into v_waitlist
    from public.reservation_waitlist_entries w
    join public.reservation_slots s
      on s.id = w.slot_id
     and s.organization_id = p_organization_id
    join public.reservation_activities a
      on a.id = s.activity_id
     and a.organization_id = p_organization_id
   where w.organization_id = p_organization_id
     and w.player_key_hash = p_player_key_hash
     and w.player_key_hash not like 'purge:%'
     and w.status in ('waiting', 'offered');

  -- LES PRISES DE STOCK (RES-5). `expired` est calculé À LA LECTURE et rendu au
  -- client : la ligne, elle, reste `held`. Sans ce champ, la page afficherait
  -- « réservé » sur une part que le commerçant a déjà remise en vente.
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'hold_id', h.id,
        'offer_id', h.offer_id,
        'code', h.code,
        'status', h.status,
        'expired', h.status = 'held' and h.redeem_expires_at <= pg_catalog.now(),
        'created_at', h.created_at,
        'redeemed_at', h.redeemed_at,
        'redeem_expires_at', h.redeem_expires_at,
        'title', o.title,
        'window_starts_at', o.window_starts_at,
        'window_ends_at', o.window_ends_at
      )
      order by o.window_starts_at desc
    ),
    '[]'::jsonb
  ) into v_stock
    from public.reservation_stock_holds h
    join public.reservation_stock_offers o
      on o.id = h.offer_id
     and o.organization_id = p_organization_id
   where h.organization_id = p_organization_id
     and h.player_key_hash = p_player_key_hash
     and h.player_key_hash not like 'purge:%'
     -- VIVANTES ou RÉCENTES. La borne de 24 h porte sur l'échéance, pas sur la
     -- création : c'est la fin de la fenêtre qui rend la prise sans objet.
     and (
       h.status = 'held'
       or h.status = 'redeemed'
       or h.redeem_expires_at > pg_catalog.now() - interval '24 hours'
     )
     and (
       h.status <> 'cancelled'
       or h.cancelled_at > pg_catalog.now() - interval '24 hours'
     );

  -- NI l'email NI l'empreinte ne sortent d'ici — ni des réservations, ni de la
  -- file, ni des prises de stock.
  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'timezone', v_timezone,
    'reservations', v_items,
    'waitlist', v_waitlist,
    'stockHolds', v_stock
  );
end;
$$;

comment on function public.reservation_public_state(uuid, text) is
  'Réservations, entrées de liste prioritaire VIVANTES et PRISES DE STOCK '
  '(RES-5) d''une identité pseudonyme CHEZ UNE organisation — le joueur '
  'retrouve son statut, son créneau, son code, SA TAILLE (`party_size`), son '
  'RANG, son offre en cours et ses unités bloquées sans compte. Bornée à '
  'l''organisation : l''empreinte du cookie est globale, et une réponse non '
  'bornée exposerait sur la page d''un commerce ce que la personne a réservé '
  'chez un autre. Le rang est recalculé à la lecture, jamais stocké ; '
  '`offer_live` et `expired` sont tranchés PAR LE SERVEUR — une prise dont la '
  'fenêtre est passée est rendue `expired: true` alors que sa ligne reste '
  '`held`, parce que son unité est DÉJÀ revenue au restant. Le FORMAT de '
  'l''activité n''entre PAS ici. N''expose ni l''email ni l''empreinte.';

revoke all on function public.reservation_public_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reservation_public_state(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 14. Purge RGPD — corps VERBATIM de 20261006120000, +1 geste
--
-- Même forme que les gestes (d) à (g) : la SIGNATURE NE BOUGE PAS, et la ligne
-- reste. Combien d'unités ont été bloquées, retirées, gâchées — c'est le bilan
-- anti-gaspi du commerçant, il n'appartient pas à la personne. Trois colonnes
-- partent : l'adresse, son consentement (l'équivalence de la table refuserait
-- d'ailleurs de n'en effacer qu'un) et le lien à l'appareil.
--
-- AUCUNE FERMETURE D'ÉTAT ICI, contrairement au geste (f) de la file. Une prise
-- `held` purgée n'occupe RIEN : passé sa fenêtre elle a déjà cessé d'être
-- comptée, par la même arithmétique qui gouverne tout ce fichier. Il n'y a donc
-- pas d'équivalent du « `waiting` immortel » que (f) devait clore — et c'est un
-- bénéfice direct du choix de ne tenir aucun compteur.
--
-- CE QUE CE GESTE NE FAIT PAS, ET IL FAUT LE SAVOIR : il ne retire PAS la prise
-- du portefeuille. L'`update` réveille bien le miroir de la section 8, et
-- `reward_player_from_legacy` ne retrouve plus de pont sur une empreinte devenue
-- `purge:<id>` — mais `upsert_reward_issuance` écrit
-- `player_id = coalesce(excluded.player_id, reward_issuances.player_id)`
-- (20260805150000:216) : le lien DÉJÀ résolu est PRÉSERVÉ, jamais repris. Ce
-- n'est pas un oubli, c'est le contrat du registre — il a sa propre rétention,
-- tenue par `purge_expired_reward_issuances` (20260902120000), et le
-- portefeuille est adossé à l'identité pseudonyme centrale, pas à l'empreinte
-- legacy que ce geste-ci neutralise. Ce que (h) efface, c'est ce que la TABLE
-- DES PRISES sait de la personne : son adresse, son consentement, et le lien
-- entre ses prises. Écrire l'inverse ici serait commode et faux.
-- ────────────────────────────────────────────────────────────

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

    -- (c) Les PARTIES : la ligne reste, le LIEN entre les parties d'une même
    -- personne meurt.
    update public.spins
       set player_key = 'purge:' || id
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and player_key not like 'purge:%';

    -- (d) Les RÉSERVATIONS (20261002120000) : la ligne reste — remplissage et
    -- arrivées appartiennent au commerçant — l'adresse, son consentement et le
    -- lien à l'appareil s'effacent.
    update public.reservations
       set email = null,
           consent_transactional_at = null,
           player_key_hash = 'purge:' || id::text
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and (email is not null
             or consent_transactional_at is not null
             or player_key_hash not like 'purge:%');

    -- (e) La LISTE PRIORITAIRE (20261004120000) : même geste, même raison. Le
    -- rang tenu et l'issue de l'offre restent — ils racontent le remplissage,
    -- pas la personne — l'adresse, son consentement et le lien à l'appareil
    -- s'effacent d'un seul geste (l'équivalence email/consentement de la table
    -- refuserait d'ailleurs de n'en effacer qu'un). Le garde `not like` rend le
    -- passage idempotent.
    update public.reservation_waitlist_entries
       set email = null,
           consent_transactional_at = null,
           player_key_hash = 'purge:' || id::text
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and (email is not null
             or consent_transactional_at is not null
             or player_key_hash not like 'purge:%');

    -- (f) La FILE SEREINE (20261005120000) : même geste, augmenté du PRÉNOM —
    -- un nom de personne est la donnée la plus directement identifiante de
    -- cette table, et il part avec les trois autres. La ligne reste : combien
    -- de gens ont attendu, combien sont partis, combien ne se sont pas
    -- présentés, c'est la seule mesure que RES-3 promet au commerçant.
    --
    -- ET L'ENTRÉE ENCORE VIVANTE EST FERMÉE — `left`, l'issue qui n'affirme
    -- rien sur la personne et la seule qui n'exige pas d'appel préalable. Sans
    -- ce geste, une entrée `waiting` ou `called` purgée occupait une ligne du
    -- plafond POUR TOUJOURS : son empreinte n'est plus une empreinte, donc
    -- `queue_leave` ne l'atteint plus, et rien d'autre ne la clôt. Voir
    -- l'en-tête de section pour le choix de l'issue et celui de la date.
    --
    -- Les deux `case` lisent l'état AVANT mise à jour : dans un `set`, le côté
    -- droit voit toujours la ligne d'origine.
    update public.reservation_queue_entries
       set display_name = null,
           email = null,
           consent_transactional_at = null,
           player_key_hash = 'purge:' || id::text,
           status = case when status in ('waiting', 'called')
                         then 'left' else status end,
           -- DERNIER INSTANT CONNU, jamais `now()` : sinon les compteurs du
           -- jour de `queue_staff_state` afficheraient au commerçant une volée
           -- d'abandons vieux de plusieurs mois, le matin du passage du cron.
           resolved_at = case when status in ('waiting', 'called')
                              then coalesce(called_at, created_at)
                              else resolved_at end
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and (display_name is not null
             or email is not null
             or consent_transactional_at is not null
             or player_key_hash not like 'purge:%'
             -- Sans ce disjoint, une ligne déjà purgée mais restée vivante ne
             -- serait jamais fermée : l'idempotence la sauterait.
             or status in ('waiting', 'called'));

    -- (g) LES SESSIONS D'ATTENTE ACTIVE (20261006120000) : la ligne reste — la
    -- mesure « ouverture et complétion des animations d'attente » appartient au
    -- commerçant — le lien à l'appareil s'efface. Le jeton d'octroi reste, et il
    -- est inoffensif : il ne vaut QUE présenté avec l'empreinte qui vient d'être
    -- neutralisée. L'effacer seul serait de toute façon refusé par
    -- `…_pause_state`, qui est une équivalence.
    update public.reservation_wait_sessions
       set player_key_hash = 'purge:' || id::text
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and player_key_hash not like 'purge:%';

    -- (h) LES PRISES DE STOCK (20261010120000) : même geste que (d) et (e). La
    -- ligne reste — combien d'unités bloquées, retirées, gâchées est le bilan
    -- anti-gaspi du commerçant — l'adresse, son consentement et le lien à
    -- l'appareil s'effacent ensemble. AUCUNE fermeture d'état n'est nécessaire,
    -- contrairement à (f) : une prise purgée n'immobilise rien, puisque son
    -- unité est revenue au restant à la seconde où sa fenêtre est passée.
    update public.reservation_stock_holds
       set email = null,
           consent_transactional_at = null,
           player_key_hash = 'purge:' || id::text
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and (email is not null
             or consent_transactional_at is not null
             or player_key_hash not like 'purge:%');
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
