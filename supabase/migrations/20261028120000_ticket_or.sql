-- ════════════════════════════════════════════════════════════
-- LE TICKET D'OR (TKT-1) — une visite d'aujourd'hui donne une
-- raison de revenir
--
-- Le staff constate une visite ou un achat et remet un ticket ; le client
-- l'ouvre AU PROCHAIN PASSAGE, tire une fois, et retire son lot en caisse.
--
--
-- ── UN JEU COMME UN AUTRE, DONC DANS LE SOCLE ─────────────
--
-- Décision propriétaire du 2026-08-23 : le Ticket d'Or n'a pas de clé produit
-- à lui. Il est gardé par `org_has_module_access(…, 'wheel')` — la clé de
-- l'OFFRE DE BASE, la seule ligne du `case` qui vaille `true` sans add-on. Il
-- entre donc dans les cinq offres d'un coup, comme les jeux rapides, sans
-- toucher ni au catalogue d'offres, ni à Stripe, ni au back-office.
--
-- Ce que ça évite : une quatorzième valeur dans `org_has_module_access`, une
-- colonne `addon_ticket`, un produit Stripe, une ligne d'offre et un miroir de
-- back-office — pour un jeu que personne n'achète séparément.
--
--
-- ── LE TIRAGE EST DIRECT, SANS ROUE ───────────────────────
--
-- Arbitrage du 2026-08-23. Le serveur tire dans un stock DÉDIÉ et annonce le
-- lot ; il n'accorde pas un tour de roue. Le coût assumé est un second moteur
-- de tirage, tenu ici en une seule fonction et pesé par `poids` comme celui de
-- la roue.
--
--
-- ── UN QR STATIQUE NE PROUVE JAMAIS UN ACHAT ──────────────
--
-- C'est la phrase du cahier, et elle décide la forme du ticket. Le code n'est
-- pas déductible : dix caractères d'un alphabet sans I, O, 0 ni 1 — 32^10, et
-- lisible à voix haute au comptoir. Il est ÉMIS PAR LE STAFF, jamais par le
-- client : `emettre_ticket_or` exige `is_org_member`, c'est-à-dire une session
-- authentifiée du commerce.
--
-- Une capture d'écran ne sert donc à rien : le code est à usage unique
-- (`tire_le` est posé sous verrou), et le rejouer rend `deja_tire`.
--
--
-- ── LE LOT VA AU REGISTRE UNIVERSEL ───────────────────────
--
-- `reward_issuances` (20260805150000) accueille l'émission : le portefeuille,
-- l'historique et les mesures le lisent déjà. Trois `check` de cette table
-- apprennent donc une dixième source, et la CAISSE UNIVERSELLE une dixième
-- branche — le comptoir n'a rien de nouveau à apprendre.
-- ════════════════════════════════════════════════════════════

-- ── 1. LE REGISTRE APPREND UNE ONZIÈME SOURCE ───────────────
--
-- `drop` puis `add` : un `check` ne se modifie pas en place, il se remplace en
-- entier. Le texte ci-dessous est donc repris de sa DERNIÈRE définition —
-- `20261010120000_reserver_stock.sql`, qui a ajouté la dixième famille
-- (`reserver_stock` / `RESA-`) — et non de la fondatrice 20260805150000.
--
-- ── LA GARDE CI-DESSOUS EXISTE PARCE QUE J'AI FAILLI ME TROMPER ──
--
-- La première version de cette migration recopiait 20260805150000 : elle
-- SUPPRIMAIT `reserver_stock` des trois `check`, en silence, et les prises de
-- stock Réserver auraient cessé d'entrer au registre. Le fichier de L10 le
-- disait déjà en toutes lettres — « ce bloc se dérive, il ne recopie pas ».
--
-- On ne peut pas dériver un `check` par substitution comme on dérive une
-- fonction : `pg_get_constraintdef` rend une forme normalisée que Postgres a
-- réécrite. On fait donc l'inverse — on ÉNONCE ce qu'on attend de la
-- définition vivante, et on refuse d'avancer si elle a changé. Une onzième
-- famille ajoutée d'ici là fera rougir cette migration plutôt que disparaître.

do $migration$
declare
  v_def text;
begin
  select pg_catalog.pg_get_constraintdef(c.oid) into strict v_def
    from pg_catalog.pg_constraint c
   where c.conname = 'reward_issuances_source_type_check';

  -- DÉJÀ POSÉE : rien à faire. Motif de 20261026120000.
  if pg_catalog.strpos(v_def, 'ticket_or') > 0 then
    return;
  end if;

  if pg_catalog.strpos(v_def, 'reserver_stock') = 0 then
    raise exception
      'reward_issuances_source_type_check ne porte pas `reserver_stock` : la definition vivante n est pas celle de 20261010120000, et ce fichier en supprimerait une famille';
  end if;

  -- DIX familles attendues, donc DIX `::text` — un par élément du tableau que
  -- Postgres rend normalisé. Une onzième signifierait qu une migration
  -- posterieure en a ajoute une que le texte ci-dessous ne connait pas, et
  -- qu il la supprimerait.
  --
  -- CETTE LIGNE A COMPTE ONZE, ET LA GARDE A FAIT FEU EN PRODUCTION. Elle n a
  -- rien laisse passer — la migration a echoue en entier, ce qui est
  -- exactement son role — mais elle n avait jamais ete exercee en local : la
  -- base de developpement portait deja `ticket_or`, donc le `return` anticipe
  -- ci-dessus court-circuitait le comptage. Une garde qu on n a pas vue
  -- refuser est une garde qu on n a pas testee.
  if (pg_catalog.length(v_def)
      - pg_catalog.length(pg_catalog.replace(v_def, '::text', ''))) / 6 <> 10 then
    raise exception
      'reward_issuances_source_type_check ne porte pas les dix familles attendues : % ', v_def;
  end if;
end
$migration$;

alter table public.reward_issuances
  drop constraint if exists reward_issuances_source_type_check;

alter table public.reward_issuances
  add constraint reward_issuances_source_type_check check (
    source_type in (
      'wheel', 'hunt', 'loyalty', 'jackpot', 'event',
      'calendar', 'referral', 'quiz', 'contest', 'reserver_stock',
      'ticket_or'
    )
  );

alter table public.reward_issuances
  drop constraint if exists reward_issuances_code_shape;

alter table public.reward_issuances
  add constraint reward_issuances_code_shape check (
    code is null or code ~
      '^(GAIN|CHASSE|FIDELITE|JACKPOT|EVENT|CADEAU|PARRAIN|QUIZ|PRONO|RESA|TICKET)-[A-Z0-9]{4,32}$'
  );

alter table public.reward_issuances
  drop constraint if exists reward_issuances_source_code_match;

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
      when 'ticket_or' then code ~ '^TICKET-'
      else false
    end
  );

-- ── 2. LE STOCK, PESÉ COMME CELUI DE LA ROUE ────────────────

create table if not exists public.tickets_or_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  libelle text not null
    check (pg_catalog.char_length(pg_catalog.btrim(libelle)) between 1 and 120),
  -- MÊME SÉMANTIQUE QUE `prizes.weight` : un poids nul retire le lot du tirage
  -- sans le supprimer — c'est ainsi qu'on met un lot de côté sans perdre son
  -- libellé.
  poids integer not null default 1 check (poids between 0 and 1000),
  -- `null` = illimité. Le distinguer de 0 est le point : 0 signifie « épuisé »,
  -- `null` signifie « je ne compte pas » — un café offert n'a pas de stock.
  stock integer check (stock is null or stock >= 0),
  actif boolean not null default true,
  ordre integer not null default 0 check (ordre between 0 and 999),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists tickets_or_lots_org_idx
  on public.tickets_or_lots (organization_id, ordre);

comment on table public.tickets_or_lots is
  'Les lots tirables d''un Ticket d''Or (TKT-1), pesés comme ceux de la roue. '
  '`stock` null = illimité, 0 = épuisé — deux états distincts. Un `poids` nul '
  'retire du tirage sans supprimer.';

alter table public.tickets_or_lots enable row level security;

-- ── 3. LE TICKET ────────────────────────────────────────────

create table if not exists public.tickets_or (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- ALPHABET SANS AMBIGUÏTÉ : ni I, ni O, ni 0, ni 1. Ce code se lit à voix
  -- haute au comptoir et se retape sur un téléphone ; « 0 ou O » y coûte un
  -- ticket perdu et un client qui insiste.
  code text not null unique
    check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  emis_le timestamptz not null default pg_catalog.now(),
  emis_par uuid references auth.users(id) on delete set null,
  expire_le timestamptz not null,
  tire_le timestamptz,
  lot_id uuid references public.tickets_or_lots(id) on delete set null,
  reward_issuance_id uuid
    references public.reward_issuances(id) on delete set null,
  -- LE TIRAGE EST INDISSOCIABLE DE SON LOT. Un ticket tiré sans lot serait un
  -- gain perdu ; un lot sans tirage, un gain jamais annoncé.
  constraint tickets_or_tirage_coherent check (
    (tire_le is null and lot_id is null)
    or (tire_le is not null and lot_id is not null)
  ),
  constraint tickets_or_expiration check (expire_le > emis_le)
);

create index if not exists tickets_or_org_idx
  on public.tickets_or (organization_id, emis_le desc);

comment on table public.tickets_or is
  'Un droit de tirer UNE FOIS, remis par le staff après une visite constatée '
  '(TKT-1), à ouvrir au prochain passage. Le code n''est pas déductible et ne '
  'sert qu''une fois : `tire_le` est posé sous verrou. Une capture d''écran ne '
  'prouve donc rien — et ne rejoue rien.';

alter table public.tickets_or enable row level security;

-- AUCUNE POLICY sur les deux tables : lecture et écriture passent par les RPC
-- ci-dessous, toutes `security definer`. Une policy de lecture pour `anon`
-- aurait exposé les codes NON TIRÉS d'un commerce à qui sait deviner un
-- identifiant — c'est-à-dire à qui sait tirer à la place du client.

-- ── 4. ÉMETTRE — LE STAFF, ET LUI SEUL ──────────────────────

create or replace function public.emettre_ticket_or(
  p_organization_id uuid,
  p_jours integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_code text;
  v_jours integer;
  v_essai integer := 0;
  v_expire timestamptz;
begin
  -- LA GARDE EST DOUBLE, ET LES DEUX COMPTENT : membre du commerce (donc une
  -- session authentifiée, jamais un client) ET offre active. La seconde sans
  -- la première laisserait n'importe quel compte émettre chez n'importe qui.
  if not public.is_org_member(p_organization_id) then
    return pg_catalog.jsonb_build_object('state', 'not_authorized');
  end if;
  if not public.org_has_module_access(p_organization_id, 'wheel') then
    return pg_catalog.jsonb_build_object('state', 'no_access');
  end if;

  -- 1 à 180 jours. Un ticket sans échéance n'est pas une raison de revenir,
  -- c'est une dette ouverte que le commerce porte indéfiniment.
  v_jours := least(greatest(coalesce(p_jours, 30), 1), 180);
  v_expire := pg_catalog.now() + pg_catalog.make_interval(days => v_jours);

  -- LA COLLISION EST TRAITÉE, PAS ESPÉRÉE. 32^10 la rend improbable, et
  -- « improbable » n'est pas « impossible » : trois essais, puis un refus
  -- lisible plutôt qu'une violation de contrainte remontée telle quelle.
  loop
    v_essai := v_essai + 1;
    select pg_catalog.string_agg(
             pg_catalog.substr(
               'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
               1 + (pg_catalog.floor(pg_catalog.random() * 32))::integer, 1),
             '')
      into v_code
      from pg_catalog.generate_series(1, 10);

    begin
      insert into public.tickets_or
        (organization_id, code, emis_par, expire_le)
      values (p_organization_id, v_code, (select auth.uid()), v_expire);

      return pg_catalog.jsonb_build_object(
        'state', 'ok', 'code', v_code, 'expire_le', v_expire);
    exception when unique_violation then
      if v_essai >= 3 then
        return pg_catalog.jsonb_build_object('state', 'error');
      end if;
    end;
  end loop;
end;
$fn$;

comment on function public.emettre_ticket_or(uuid, integer) is
  'Émet un Ticket d''Or (TKT-1) pour une visite CONSTATÉE par le staff. Exige '
  '`is_org_member` — une session du commerce, jamais un client — et l''offre '
  'de base (`wheel`). Le code est tiré dans un alphabet sans I/O/0/1, à usage '
  'unique, et expire entre 1 et 180 jours.';

revoke all on function public.emettre_ticket_or(uuid, integer) from public;
revoke all on function public.emettre_ticket_or(uuid, integer) from anon;
grant execute on function public.emettre_ticket_or(uuid, integer) to authenticated;
grant execute on function public.emettre_ticket_or(uuid, integer) to service_role;

-- ── 5. TIRER — UNE FOIS, ET LE SERVEUR DÉCIDE ───────────────
--
-- ── POURQUOI `for update` SUR LE TICKET ──
--
-- Deux onglets ouverts sur le même code, ou un double appui, sont la situation
-- NORMALE d'un téléphone au comptoir. Le verrou de ligne fait que le second
-- arrive après le premier et lit `tire_le` déjà posé : il rend `deja_tire`
-- plutôt qu'un second lot.
--
-- ── LE STOCK EST DÉCRÉMENTÉ DANS LA MÊME TRANSACTION ──
--
-- Tirer puis décrémenter en deux temps aurait laissé deux clients emporter le
-- dernier exemplaire. Le `update … where stock > 0` est la garde : s'il ne
-- touche aucune ligne, le lot vient d'être épuisé et on renonce.

create or replace function public.tirer_ticket_or(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ticket public.tickets_or;
  v_lot public.tickets_or_lots;
  v_total integer;
  v_tirage integer;
  v_cumul integer := 0;
  v_issuance uuid;
  v_redeem text;
  v_essai integer := 0;
  v_expire timestamptz;
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{10}$' then
    return pg_catalog.jsonb_build_object('state', 'introuvable');
  end if;

  select * into v_ticket
    from public.tickets_or
   where code = p_code
   for update;

  -- INDISTINCTION : un code inventé et le code d'un commerce dont l'offre a
  -- expiré rendent le MÊME document. Ce point d'entrée est ouvert à Internet.
  if v_ticket.id is null then
    return pg_catalog.jsonb_build_object('state', 'introuvable');
  end if;
  if not public.org_has_module_access(v_ticket.organization_id, 'wheel') then
    return pg_catalog.jsonb_build_object('state', 'introuvable');
  end if;

  if v_ticket.tire_le is not null then
    return pg_catalog.jsonb_build_object('state', 'deja_tire');
  end if;
  if v_ticket.expire_le <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('state', 'expire');
  end if;

  select pg_catalog.sum(poids)::integer into v_total
    from public.tickets_or_lots
   where organization_id = v_ticket.organization_id
     and actif and poids > 0 and (stock is null or stock > 0);

  if coalesce(v_total, 0) = 0 then
    return pg_catalog.jsonb_build_object('state', 'sans_lot');
  end if;

  v_tirage := 1 + (pg_catalog.floor(pg_catalog.random() * v_total))::integer;

  for v_lot in
    select * from public.tickets_or_lots
     where organization_id = v_ticket.organization_id
       and actif and poids > 0 and (stock is null or stock > 0)
     order by ordre, id
  loop
    v_cumul := v_cumul + v_lot.poids;
    exit when v_cumul >= v_tirage;
  end loop;

  -- LE STOCK, SOUS CONDITION. Sans le `and stock > 0`, deux tirages
  -- simultanés sur le dernier exemplaire l'emporteraient tous les deux.
  if v_lot.stock is not null then
    update public.tickets_or_lots
       set stock = stock - 1, updated_at = pg_catalog.now()
     where id = v_lot.id and stock > 0;
    if not found then
      return pg_catalog.jsonb_build_object('state', 'sans_lot');
    end if;
  end if;

  -- LE CODE DE RETRAIT, DISTINCT DE CELUI DU TICKET : le premier prouve le
  -- droit de tirer, le second le droit d'emporter. Les confondre aurait fait
  -- d'une capture d'écran d'avant-tirage une preuve de gain. Le préfixe
  -- `TICKET-` est ce que `reward_issuances_source_code_match` exige.
  loop
    v_essai := v_essai + 1;
    select 'TICKET-' || pg_catalog.string_agg(
             pg_catalog.substr(
               'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
               1 + (pg_catalog.floor(pg_catalog.random() * 32))::integer, 1),
             '')
      into v_redeem
      from pg_catalog.generate_series(1, 8);
    exit when v_essai >= 3 or not exists (
      select 1 from public.reward_issuances
       where organization_id = v_ticket.organization_id and code = v_redeem
    );
  end loop;

  v_expire := pg_catalog.now() + pg_catalog.make_interval(days => 30);

  insert into public.reward_issuances (
    organization_id, source_type, source_id, code, label,
    issued_at, expires_at, metadata
  )
  values (
    v_ticket.organization_id, 'ticket_or', v_ticket.id, v_redeem, v_lot.libelle,
    pg_catalog.now(), v_expire,
    pg_catalog.jsonb_build_object('lot_id', v_lot.id)
  )
  returning id into v_issuance;

  update public.tickets_or
     set tire_le = pg_catalog.now(),
         lot_id = v_lot.id,
         reward_issuance_id = v_issuance
   where id = v_ticket.id;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'lot', v_lot.libelle,
    'code_retrait', v_redeem,
    'expire_le', v_expire
  );
end;
$fn$;

comment on function public.tirer_ticket_or(text) is
  'Tire UNE FOIS le lot d''un Ticket d''Or (TKT-1). Verrou de ligne sur le '
  'ticket : un double appui rend `deja_tire`, jamais un second lot. Le stock '
  'est décrémenté sous condition DANS la même transaction. Rend le MÊME '
  'document `introuvable` pour un code inventé et pour un commerce sans offre '
  '— ce point d''entrée public n''est pas un oracle. Le code de retrait est '
  'DISTINCT de celui du ticket et porte le préfixe `TICKET-` du registre.';

revoke all on function public.tirer_ticket_or(text) from public;
grant execute on function public.tirer_ticket_or(text) to anon;
grant execute on function public.tirer_ticket_or(text) to authenticated;
grant execute on function public.tirer_ticket_or(text) to service_role;

-- ── 6. REMETTRE — LA FORME DES NEUF AUTRES ──────────────────
--
-- Même signature que `redeem_quiz_reward` et ses sœurs : (organisation, code,
-- acteur) → une ligne portant `redeemed_now`. C'est ce que la caisse
-- universelle appelle, et s'en écarter aurait demandé une branche particulière
-- là où il n'en faut aucune.
--
-- ELLE ÉCRIT DANS `reward_issuances` ELLE-MÊME, contrairement à ses sœurs qui
-- écrivent dans leur table historique et laissent un trigger réconcilier : le
-- Ticket d'Or n'a pas de table historique, le registre EST sa source.

create or replace function public.redeem_ticket_or(
  p_organization_id uuid,
  p_code text,
  p_actor text
)
returns table(
  id uuid, code text, label text, redeemed_at timestamptz, redeemed_now boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_code text;
  v_id uuid;
  v_actor uuid;
  v_remis boolean;
begin
  if p_actor is null or pg_catalog.length(p_actor) = 0 then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_actor := p_actor::uuid;

  -- LA CAISSE EST UNE SESSION DU COMMERCE : les trois rôles qui tiennent un
  -- comptoir, exactement comme `redeem_reward_by_code` les vérifie.
  if not exists (
    select 1 from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor
       and om.role in ('owner', 'editor', 'cashier')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_code := pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')));

  select ri.id into v_id
    from public.reward_issuances ri
   where ri.organization_id = p_organization_id
     and ri.code = v_code
     and ri.source_type = 'ticket_or'
   for update;

  if v_id is null then
    return;
  end if;

  -- `where redeemed_at is null` : le second passage ne réécrit pas la date.
  update public.reward_issuances ri
     set redeemed_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where ri.id = v_id
     and ri.redeemed_at is null
     and ri.cancelled_at is null
     and (ri.expires_at is null or ri.expires_at > pg_catalog.now());

  -- `redeemed_now` VIENT DE `found`, JAMAIS D'UNE FENÊTRE DE TEMPS.
  --
  -- La première version comparait `redeemed_at` à `now() - 5 secondes`. Elle
  -- rendait `true` DEUX FOIS de suite, et un test l'a montré : dans une même
  -- transaction, `now()` ne bouge pas — la date écrite au premier appel est
  -- toujours « il y a moins de cinq secondes » au second. Le comptoir aurait
  -- annoncé deux remises pour un seul lot.
  --
  -- `found` dit exactement ce qu'on veut savoir : CET APPEL a-t-il remis ?
  v_remis := found;

  return query
    select ri.id, ri.code, ri.label, ri.redeemed_at, v_remis
      from public.reward_issuances ri
     where ri.id = v_id;
end;
$fn$;

comment on function public.redeem_ticket_or(uuid, text, text) is
  'Remet le lot d''un Ticket d''Or en caisse (TKT-1). MÊME FORME que les neuf '
  'autres `redeem_*` — (organisation, code, acteur) → `redeemed_now` — pour '
  'que la caisse universelle l''appelle sans branche particulière. Écrit dans '
  '`reward_issuances` directement : le Ticket d''Or n''a pas de table '
  'historique, le registre EST sa source.';

revoke all on function public.redeem_ticket_or(uuid, text, text) from public;
revoke all on function public.redeem_ticket_or(uuid, text, text) from anon;
grant execute on function public.redeem_ticket_or(uuid, text, text) to authenticated;
grant execute on function public.redeem_ticket_or(uuid, text, text) to service_role;

-- ── 7. LA CAISSE UNIVERSELLE APPREND LA DIXIÈME BRANCHE ─────
--
-- PATCHÉE EN PLACE, jamais recopiée. C'est la leçon de 20261026120000, et elle
-- vaut ici plus qu'ailleurs : `redeem_reward_by_code` fait deux cents lignes.
-- La lire dans un fichier serait rejouer exactement le défaut qu'on vient de
-- réparer.
--
-- Deux insertions : le filtre d'entrée — sans lui, un code TICKET serait rendu
-- « invalide » alors que le registre a le droit de le stocker — et une branche
-- de plus dans la chaîne de routage.

do $migration$
declare
  v_def text;
  v_filtre_ancien constant text := 'PRONO|RESA)-[A-Z0-9]{4,32}$';
  v_filtre_neuf constant text := 'PRONO|RESA|TICKET)-[A-Z0-9]{4,32}$';
  v_fin_ancienne constant text :=
    '    end if;' || E'\n' || '    v_source_found := found;';
  v_fin_neuve constant text :=
       '    elsif v_issue.source_type = ''ticket_or'' then' || E'\n'
    || '      select r.redeemed_now into v_legacy_redeemed' || E'\n'
    || '        from public.redeem_ticket_or(' || E'\n'
    || '          p_organization_id, v_code, p_actor' || E'\n'
    || '        ) r limit 1;' || E'\n'
    || '    end if;' || E'\n'
    || '    v_source_found := found;';
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'redeem_reward_by_code';

  -- DÉJÀ PATCHÉE : on sort sans bruit. Motif de 20261026120000 — une migration
  -- doit pouvoir se rejouer sur une base déjà à jour.
  if pg_catalog.strpos(v_def, 'redeem_ticket_or') > 0 then
    return;
  end if;

  if pg_catalog.strpos(v_def, v_filtre_ancien) = 0 then
    raise exception
      'redeem_reward_by_code ne porte pas le filtre de code attendu : la fonction a change';
  end if;
  if pg_catalog.strpos(v_def, v_fin_ancienne) = 0 then
    raise exception
      'redeem_reward_by_code ne porte pas la fin de chaine attendue : la fonction a change';
  end if;

  v_def := pg_catalog.replace(v_def, v_filtre_ancien, v_filtre_neuf);
  v_def := pg_catalog.replace(v_def, v_fin_ancienne, v_fin_neuve);
  execute v_def;
end
$migration$;

-- ── 8. L'ETAT, POUR LE TABLEAU DE BORD ──────────────────────
--
-- LES MESURES DU CAHIER : activation (émis), remise (tirés, remis) et ce qui
-- attend au comptoir. Aucune n'attribue un panier ni un revenu — la table ne
-- les connaît pas, et c'est délibéré.

create or replace function public.tickets_or_state(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_depuis timestamptz;
begin
  if p_organization_id is null
     or not public.is_org_member(p_organization_id) then
    return pg_catalog.jsonb_build_object('state', 'not_authorized');
  end if;

  v_depuis := pg_catalog.now() - pg_catalog.make_interval(days => 30);

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'lots', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'id', l.id, 'libelle', l.libelle, 'poids', l.poids,
                 'stock', l.stock, 'actif', l.actif, 'ordre', l.ordre
               ) order by l.ordre, l.id
             )
        from public.tickets_or_lots l
       where l.organization_id = p_organization_id
    ), '[]'::jsonb),
    'mesures', pg_catalog.jsonb_build_object(
      'emis', (select pg_catalog.count(*)::integer
                 from public.tickets_or t
                where t.organization_id = p_organization_id
                  and t.emis_le >= v_depuis),
      'tires', (select pg_catalog.count(*)::integer
                  from public.tickets_or t
                 where t.organization_id = p_organization_id
                   and t.tire_le >= v_depuis),
      'remis', (select pg_catalog.count(*)::integer
                  from public.reward_issuances r
                 where r.organization_id = p_organization_id
                   and r.source_type = 'ticket_or'
                   and r.redeemed_at >= v_depuis),
      -- EN ATTENTE AU COMPTOIR : tiré, pas encore remis, pas encore périmé.
      'a_remettre', (select pg_catalog.count(*)::integer
                       from public.reward_issuances r
                      where r.organization_id = p_organization_id
                        and r.source_type = 'ticket_or'
                        and r.redeemed_at is null
                        and (r.expires_at is null
                             or r.expires_at > pg_catalog.now()))
    )
  );
end;
$fn$;

comment on function public.tickets_or_state(uuid) is
  'Lots et mesures du Ticket d''Or sur 30 jours (TKT-1) : émis, tirés, remis, '
  'à remettre. N''attribue NI panier NI revenu — la table ne les connaît pas.';

revoke all on function public.tickets_or_state(uuid) from public;
revoke all on function public.tickets_or_state(uuid) from anon;
grant execute on function public.tickets_or_state(uuid) to authenticated;
grant execute on function public.tickets_or_state(uuid) to service_role;
