-- ============================================================
-- LA LISTE D'ATTENTE APPREND L'EFFECTIF, ET « UNE TABLE S'EST LIBÉRÉE » (RDV-8)
--
-- ── CE QUE L'EXISTANT NE SAIT PAS FAIRE ──
--
-- RDV-6 a posé `reservation_waitlist_entries.party_size` (1..30, défaut 1) et
-- N'A RIEN ÉCRIT DEDANS : `waitlist_join` — le seul chemin d'inscription —
-- ignore l'effectif. Toute la file d'une salle vaut donc « 1 personne », ce qui
-- est faux pour presque tout le monde.
--
-- Et `reservation_offer_next` (20261007120000) fait avancer la file en comptant
-- des PLACES : `capacity - réservations - offres`. C'est le modèle des
-- MOMENTS — un atelier de douze places, douze inscrits. Il ne veut rien dire
-- dans une salle. Une annulation n'y libère pas « une place » : elle libère UNE
-- TABLE, de quatre couverts ou de deux, et la personne qui attend pour six ne
-- peut pas la prendre. Appelée sur une activité `rendez_vous`, elle proposerait
-- la place au premier de la file quel que soit son groupe, puis
-- `claim_waitlist_offer` — qui n'affecte aucune table — se ferait refuser par
-- le trigger `reservations_require_table`. Une offre impossible à honorer.
--
-- ── LE CHOIX : NOTIFIER, PAS TENIR ──
--
-- Ce fichier n'ajoute AUCUNE tenue de table. `reservation_table_freed_targets`
-- rend la liste des personnes dont l'effectif TIENT dans ce qui vient de se
-- libérer ; la couche applicative les prévient par email, et la PREMIÈRE qui
-- revient prend la table par `reserve_table`, sous le verrou d'avis qui existe
-- déjà.
--
-- L'alternative — réserver la table à un seul, pendant deux heures — a été
-- écartée pour trois raisons. Elle aurait demandé une colonne `table_id` sur la
-- liste d'attente, un `create or replace` de `claim_waitlist_offer` (cent
-- cinquante lignes recopiées, et ce dépôt a déjà perdu un patch de production à
-- ce jeu-là), et surtout elle GÈLE la table : si la personne prévenue ne rouvre
-- pas son email, la salle reste vide un vendredi soir. Un restaurant rappelle
-- plusieurs personnes et sert la première qui répond. L'email doit le dire
-- franchement : premier arrivé, premier servi.
--
-- ── UNE FONCTION NOUVELLE, JAMAIS UN PARAMÈTRE AJOUTÉ ──
--
-- `waitlist_join` garde sa signature à cinq arguments. Lui ajouter un sixième
-- paramètre À DÉFAUT aurait créé une surcharge AMBIGUË avec les appels
-- existants à cinq arguments — Postgres ne tranche pas, il lève à l'exécution.
-- `waitlist_join_table` est donc une fonction à part, dont l'ordre des
-- paramètres est calqué sur `reserve_table`.
--
-- ── LE DROIT VÉRIFIÉ EST `rendez_vous`, ET NON `vitrine` ──
--
-- Les RPC du socle Réserver interrogent encore `vitrine` — héritage d'avant la
-- clé par produit. Mais une salle se vend avec « Réservation », et gater sa
-- liste d'attente sur la Vitrine l'aurait rendue muette chez qui n'a acheté que
-- ce module-là. `reserve_table` (RDV-6) a déjà fait ce choix ; les deux
-- fonctions d'ici l'imitent.
--
-- ── CE QUE CE FICHIER NE FAIT PAS ──
--
--   * AUCUNE modification de `waitlist_join`, `reservation_offer_next` ni
--     `claim_waitlist_offer`. Elles continuent de servir les MOMENTS à
--     l'identique.
--   * AUCUN test « le créneau est-il complet ? » dans `waitlist_join_table`,
--     contrairement à `waitlist_join` qui rend `not_full`. Ce test-là compte
--     des PLACES (`capacity - taken - held`), c'est-à-dire précisément l'unité
--     qui ne veut rien dire dans une salle. Le refus qui conduit à la file est
--     déjà rendu par `reserve_table` : elle répond `full` quand aucune table
--     libre n'est assez grande, et c'est L'ÉCRAN qui enchaîne sur la file avec
--     l'effectif en main.
--   * AUCUN envoi d'email : `reservation_table_freed_targets` rend QUI
--     prévenir, l'expédition est du ressort de la couche applicative.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. `waitlist_join_table` — REJOINDRE LA FILE D'UNE SALLE, AVEC SON EFFECTIF
--
-- Corps de `waitlist_join` (dernière définition, 20261007120000) repris garde
-- pour garde, à quatre différences près :
--
--   1. `p_party_size` est OBLIGATOIRE et borné 1..30 → `invalid_party_size`,
--      même mot et même forme de réponse que `reserve_table`.
--   2. Le mode de l'activité doit être `rendez_vous` : c'est la fonction de la
--      SALLE, `waitlist_join` reste celle des Moments.
--   3. Le droit vérifié est `rendez_vous` (voir l'en-tête).
--   4. L'idempotence MET À JOUR l'effectif au lieu de le figer : une famille
--      qui passe de quatre à six doit pouvoir le corriger sans quitter la file
--      puis y revenir — ce qui lui ferait perdre son rang.
--
-- Et un test en moins, délibérément : `not_full`. Voir l'en-tête.
-- ────────────────────────────────────────────────────────────

create or replace function public.waitlist_join_table(
  p_organization_id uuid,
  p_slot_id uuid,
  p_player_key_hash text,
  p_party_size integer,
  p_email text default null,
  p_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.reservation_slots%rowtype;
  v_activity public.reservation_activities%rowtype;
  v_existing public.reservations%rowtype;
  v_entry public.reservation_waitlist_entries%rowtype;
  v_email text;
  v_live integer;
  v_plafond integer;
  v_position integer;
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
  if p_party_size is null or p_party_size not between 1 and 30 then
    return pg_catalog.jsonb_build_object('state', 'invalid_party_size');
  end if;

  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null
     and (pg_catalog.char_length(v_email) > 254
          or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  then
    return pg_catalog.jsonb_build_object('state', 'invalid_email');
  end if;

  -- MÊME VERROU QUE `waitlist_join`, et non celui de `reserve_table` : ce qui
  -- se dispute ici n'est pas une table mais le plafond et l'unicité de la file,
  -- tous deux PAR CRÉNEAU. Aucune table n'est retenue — voir l'en-tête.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_slot:' || p_organization_id::text || ':' || p_slot_id::text,
      0)
  );

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = p_slot_id
     and s.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select a.* into v_activity
    from public.reservation_activities a
   where a.id = v_slot.activity_id
     and a.organization_id = v_slot.organization_id;

  -- REFUS INDISTINCTS, comme dans le socle : activité coupée ou introuvable,
  -- mode incorrect, créneau non ouvert, créneau passé, organisation sans le
  -- droit — tous rendent `unavailable`. La file ne doit pas devenir l'oracle
  -- que la réservation refuse d'être ; ce point d'entrée est ouvert à Internet.
  --
  -- `coalesce(v_activity.active, false)` ET NON un `if not found` : c'est le
  -- motif de `reserve_table`, et il tient même si l'activité manque, auquel cas
  -- toutes les comparaisons suivantes rendraient `null`.
  if not coalesce(v_activity.active, false)
     or v_activity.booking_mode <> 'rendez_vous'
     or v_slot.status <> 'open'
     or v_slot.starts_at <= pg_catalog.now()
     or not public.org_has_module_access(v_slot.organization_id, 'rendez_vous')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- IDEMPOTENCE #1 — il est déjà attablé sur ce créneau. Le laisser entrer dans
  -- la file le ferait prévenir, à la prochaine annulation, pour une table qu'il
  -- occupe déjà.
  select r.* into v_existing
    from public.reservations r
   where r.slot_id = p_slot_id
     and r.organization_id = p_organization_id
     and r.player_key_hash = p_player_key_hash
     and r.status in ('confirmed', 'checked_in')
   limit 1;
  if found then
    return pg_catalog.jsonb_build_object(
      'state', 'already_reserved',
      'reservation_id', v_existing.id,
      'code', v_existing.code,
      'status', v_existing.status,
      'party_size', v_existing.party_size
    );
  end if;

  -- IDEMPOTENCE #2 — il est déjà dans la file. On rend son RANG plutôt qu'une
  -- erreur : un double clic ou un rechargement ne doit pas ressembler à un
  -- refus, et l'index unique partiel refuserait de toute façon la seconde ligne.
  --
  -- ET ON CORRIGE L'EFFECTIF. C'est la seule divergence de fond avec
  -- `waitlist_join` : « nous serons six, finalement » doit pouvoir se dire sans
  -- quitter la file — ce qui coûterait le rang — et sans créer une seconde
  -- entrée, que l'index refuse. Le rang, lui, ne bouge pas : `created_at` n'est
  -- pas réécrit. La date d'inscription reste la date d'inscription.
  select w.* into v_entry
    from public.reservation_waitlist_entries w
   where w.slot_id = p_slot_id
     and w.organization_id = p_organization_id
     and w.player_key_hash = p_player_key_hash
     and w.status in ('waiting', 'offered');
  if found then
    if v_entry.party_size is distinct from p_party_size then
      update public.reservation_waitlist_entries w
         set party_size = p_party_size
       where w.id = v_entry.id
         and w.organization_id = p_organization_id
      returning w.* into v_entry;
    end if;

    select pg_catalog.count(*)::integer + 1 into v_position
      from public.reservation_waitlist_entries w2
     where w2.slot_id = p_slot_id
       and w2.status in ('waiting', 'offered')
       and (w2.created_at, w2.id) < (v_entry.created_at, v_entry.id);

    return pg_catalog.jsonb_build_object(
      'state', 'already_waiting',
      'entry_id', v_entry.id,
      'status', v_entry.status,
      'position', v_position,
      'party_size', v_entry.party_size,
      'offer_expires_at', v_entry.offer_expires_at
    );
  end if;

  -- ── LA FILE A UN PLAFOND ──
  -- Repris À L'IDENTIQUE de `waitlist_join`, formule comprise. Il compte des
  -- LIGNES et non des personnes, parce qu'il borne un stockage de données
  -- personnelles et une longueur de file annoncée — deux choses qui se comptent
  -- en inscrits. ON COMPTE LE MÊME ENSEMBLE QUE L'INDEX UNIQUE PARTIEL
  -- `…_live_idx` — `waiting` ET `offered`, sans regarder l'échéance : le
  -- plafond ne doit pas dépendre de la ponctualité d'un cron.
  select pg_catalog.count(*)::integer into v_live
    from public.reservation_waitlist_entries w
   where w.slot_id = p_slot_id
     and w.status in ('waiting', 'offered');

  v_plafond := least(greatest(2 * v_slot.capacity, 4), 50);

  if v_live >= v_plafond then
    return pg_catalog.jsonb_build_object(
      'state', 'waitlist_full',
      'capacity', v_plafond
    );
  end if;

  insert into public.reservation_waitlist_entries (
    slot_id, organization_id, player_key_hash, email,
    consent_transactional_at, party_size
  ) values (
    v_slot.id,
    v_slot.organization_id,
    p_player_key_hash,
    case when coalesce(p_consent, false) then v_email end,
    case when coalesce(p_consent, false) and v_email is not null
         then pg_catalog.now() end,
    p_party_size
  )
  returning * into v_entry;

  select pg_catalog.count(*)::integer into v_position
    from public.reservation_waitlist_entries w2
   where w2.slot_id = p_slot_id
     and w2.status in ('waiting', 'offered');

  return pg_catalog.jsonb_build_object(
    'state', 'joined',
    'entry_id', v_entry.id,
    'status', v_entry.status,
    'position', v_position,
    'party_size', v_entry.party_size,
    'offer_expires_at', null
  );
end;
$$;

comment on function public.waitlist_join_table(uuid, uuid, text, integer, text, boolean) is
  'Rejoint la liste d''attente d''un créneau de SALLE (booking_mode = '
  '`rendez_vous`) EN DISANT COMBIEN ILS SERONT — la colonne `party_size` posée '
  'par RDV-6, que rien n''écrivait. Fonction DISTINCTE de `waitlist_join` et non '
  'un sixième paramètre : une surcharge à défaut aurait été ambiguë avec les '
  'appels à cinq arguments. Mêmes gardes que `waitlist_join` (organisation, '
  'forme de l''empreinte, forme et longueur de l''adresse, plafond de file, '
  'refus indistincts sous `unavailable`), à quatre différences : effectif borné '
  '1..30 → `invalid_party_size` ; l''activité DOIT être en `rendez_vous` ; le '
  'droit vérifié est `rendez_vous` et non `vitrine`, parce qu''une salle se vend '
  'avec ce module-là ; et re-appeler MET À JOUR l''effectif de l''entrée '
  'existante sans toucher au rang. PAS de test `not_full` : celui de '
  '`waitlist_join` compte des PLACES, unité qui ne veut rien dire dans une '
  'salle — c''est `reserve_table` qui rend `full` et conduit ici. ÉTAT DE '
  'SUCCÈS : `joined` (et NON `waiting` comme `waitlist_join`), avec l''effectif '
  'dans la charge utile.';

revoke all on function public.waitlist_join_table(uuid, uuid, text, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.waitlist_join_table(uuid, uuid, text, integer, text, boolean)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 2. `reservation_table_freed_targets` — QUI PRÉVENIR, ET PERSONNE D'AUTRE
--
-- Rend, pour un créneau d'une activité `rendez_vous`, les entrées en attente
-- dont l'effectif tient dans la plus grande table LIBRE sur la fenêtre
-- d'occupation de ce créneau.
--
-- `stable` : elle ne modifie RIEN. Aucune offre n'est posée, aucune échéance
-- n'est armée, aucune table n'est retenue — c'est tout le sujet de l'en-tête.
--
-- Trois filtres qui ne sont pas négociables :
--   * `status = 'waiting'` — une entrée déjà proposée, déjà servie ou partie
--     n'attend plus.
--   * `player_key_hash not like 'purge:%'` — même motif que
--     `reservation_offer_next` : une identité effacée ne se prévient pas.
--   * `email is not null` — l'équivalence adresse ⇔ consentement est tenue par
--     `reservation_waitlist_consent_state`. Une adresse en base est donc DÉJÀ
--     une adresse consentie, et une entrée sans adresse n'est pas joignable.
--
-- ── POURQUOI ELLE REND L'ADRESSE ──
--
-- `email` n'est PAS dans le grant de colonnes de la table (20261004120000:516),
-- et ce fichier ne l'y met pas. La fonction est `security definer`, réservée à
-- `service_role`, et c'est le SEUL chemin par lequel l'adresse sort — pour un
-- envoi transactionnel, jamais pour un écran.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservation_table_freed_targets(
  p_organization_id uuid,
  p_slot_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slot public.reservation_slots%rowtype;
  v_activity public.reservation_activities%rowtype;
  v_turn integer;
  v_max_party integer;
  v_targets jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = p_slot_id
     and s.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select a.* into v_activity
    from public.reservation_activities a
   where a.id = v_slot.activity_id
     and a.organization_id = v_slot.organization_id;

  -- LES MÊMES CONDITIONS QUE `waitlist_join_table` ci-dessus, sous le même mot
  -- muet, et pour la même raison.
  if not coalesce(v_activity.active, false)
     or v_activity.booking_mode <> 'rendez_vous'
     or v_slot.status <> 'open'
     or v_slot.starts_at <= pg_catalog.now()
     or not public.org_has_module_access(v_slot.organization_id, 'rendez_vous')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_turn := coalesce(v_activity.table_turn_minutes, 90);

  -- LE PLUS GRAND EFFECTIF PLAÇABLE, miroir exact de `reservation_tables_state`
  -- (20261108120000, section 9) : la plus grande table LIBRE, jamais la somme
  -- des couverts restants. Douze couverts libres sur six tables de deux ne
  -- prennent pas un groupe de quatre. Le chevauchement se lit sur des
  -- INSTANTS — `a < fin_b and b < fin_a` — jamais sur des créneaux.
  select coalesce(pg_catalog.max(t.seats), 0) into v_max_party
    from public.reservation_tables t
   where t.activity_id = v_activity.id
     and t.organization_id = v_activity.organization_id
     and t.active
     and not exists (
       select 1
         from public.reservations r
         join public.reservation_slots rs
           on rs.id = r.slot_id
          and rs.organization_id = r.organization_id
        where r.table_id = t.id
          and r.status in ('confirmed', 'checked_in')
          and rs.starts_at < v_slot.starts_at
            + pg_catalog.make_interval(mins => v_turn)
          and v_slot.starts_at < rs.starts_at
            + pg_catalog.make_interval(mins => v_turn)
     );

  if v_max_party = 0 then
    -- RIEN NE S'EST LIBÉRÉ, et le cas est normal : l'annulation portait sur un
    -- créneau dont toutes les tables restent prises par d'autres services qui
    -- le chevauchent. On rend une liste VIDE plutôt qu'`unavailable` — il n'y a
    -- pas d'erreur, il n'y a personne à prévenir.
    return pg_catalog.jsonb_build_object(
      'state', 'ok',
      'max_party', 0,
      'starts_at', v_slot.starts_at,
      'activity_name', v_activity.name,
      'targets', '[]'::jsonb
    );
  end if;

  -- FIFO STRICT sur `created_at`, départagé par `id` : le même ordre que celui
  -- de la file elle-même (`reservation_waitlist_next_idx`). L'AGRÉGAT PORTE SON
  -- PROPRE `order by` SUR LES COLONNES BRUTES — trier le JSON produit serait
  -- comparer des horodatages sous forme de TEXTE, ce qui ne tient que tant que
  -- le décalage horaire est identique pour toutes les lignes.
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'entry_id', f.id,
               'email', f.email,
               'party_size', f.party_size,
               'created_at', f.created_at
             )
             order by f.created_at, f.id
           ),
           '[]'::jsonb)
    into v_targets
    from (
      select w.id, w.email, w.party_size, w.created_at
        from public.reservation_waitlist_entries w
       where w.slot_id = p_slot_id
         and w.organization_id = p_organization_id
         and w.status = 'waiting'
         and w.player_key_hash not like 'purge:%'
         and w.email is not null
         -- L'EFFECTIF EST LE FILTRE. Prévenir une tablée de six qu'une table de
         -- deux s'est libérée, c'est la faire revenir pour un refus.
         and w.party_size <= v_max_party
       order by w.created_at, w.id
       -- Une annulation ne libère qu'une table : au-delà d'une poignée de
       -- rappels, on ne prévient plus, on spamme.
       limit 20
    ) f;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'max_party', v_max_party,
    'starts_at', v_slot.starts_at,
    'activity_name', v_activity.name,
    'targets', v_targets
  );
end;
$$;

comment on function public.reservation_table_freed_targets(uuid, uuid) is
  'Qui prévenir quand une table se libère sur un créneau de SALLE. Rend les '
  'entrées en attente dont l''effectif TIENT dans la plus grande table LIBRE — '
  'jamais la somme des couverts restants — en ordre FIFO, vingt au plus. NE '
  'TIENT RIEN et NE MODIFIE RIEN (`stable`) : la première personne qui revient '
  'prend la table par `reserve_table`, sous le verrou d''avis. Tenir la table '
  'pour une seule personne l''aurait gelée le temps qu''elle rouvre son email. '
  'Ignore les entrées `offered`, terminées, purgées (`purge:%`) et sans '
  'adresse. Rend l''ADRESSE, seul chemin par lequel elle sort — pour un envoi '
  'transactionnel, jamais pour un écran : `email` reste hors du grant de '
  'colonnes de la table. Droit vérifié : `rendez_vous`, comme `reserve_table`.';

revoke all on function public.reservation_table_freed_targets(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reservation_table_freed_targets(uuid, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 3. L'EFFECTIF SE LIT — la lacune que RDV-6 avait laissée derrière lui
--
-- RDV-6 a ajouté `reservation_waitlist_entries.party_size` et n'a PAS accordé
-- sa lecture. Sur cette table comme sur `reservations`, ce n'est pas un
-- détail : les droits y sont accordés COLONNE PAR COLONNE
-- (20261004120000:516), parce que `email` doit rester hors de portée du
-- commerçant — une colonne neuve n'hérite donc de rien. Vérifié sur la base
-- locale avant d'écrire ces lignes :
--   has_column_privilege('authenticated', …, 'party_size', 'SELECT') → false
--
-- C'est EXACTEMENT la panne que RDV-7 a réparée pour `reservations.table_id`,
-- au même endroit et pour la même raison. Elle vaut d'être refermée avec la
-- fonction qui remplit enfin la colonne : sans ce grant, le commerçant lit la
-- file d'attente de sa salle sans jamais savoir combien ils seront. Et PIRE —
-- PostgREST refuse en ENTIER un `select` qui touche une colonne non
-- accordée : nommer `party_size` dans la requête de la file la casserait tout
-- entière, et la panne se lirait « la liste d'attente a disparu ».
--
-- Un `grant select (…)` est ADDITIF en Postgres : les treize colonnes déjà
-- accordées en 20261004120000 restent accordées, et `email` reste dehors.
-- ────────────────────────────────────────────────────────────

grant select (party_size) on public.reservation_waitlist_entries to authenticated;

do $migration$
declare
  v_accorde boolean;
begin
  select pg_catalog.has_column_privilege(
           'authenticated', 'public.reservation_waitlist_entries', 'party_size',
           'SELECT')
    into v_accorde;

  if not v_accorde then
    raise exception
      'public.reservation_waitlist_entries.party_size n est toujours pas lisible : la file d attente d une salle resterait muette sur les effectifs';
  end if;

  -- Et la garde qui compte vraiment, jumelle de celle de RDV-7 : elle ne
  -- défend pas contre ce fichier, qui n'accorde qu'une colonne, mais contre le
  -- PROCHAIN. Le jour où quelqu'un écrira `grant select on table … to
  -- authenticated` — geste banal ailleurs — l'adresse de chaque personne en
  -- attente deviendrait lisible par tout membre de l'organisation, sans
  -- qu'aucun test applicatif ne le remarque.
  select pg_catalog.has_column_privilege(
           'authenticated', 'public.reservation_waitlist_entries', 'email',
           'SELECT')
    into v_accorde;

  if v_accorde then
    raise exception
      'public.reservation_waitlist_entries.email est devenu lisible par authenticated : le grant de colonnes de 20261004120000 a ete remplace par un grant de table';
  end if;
end
$migration$;

comment on column public.reservation_waitlist_entries.party_size is
  'Effectif souhaité. Sans lui, une place libérée serait offerte au premier de '
  'la file quel que soit son groupe — une table de deux proposée à six, '
  'refusée, et laissée vide pendant que le suivant attend. ÉCRIT par '
  '`waitlist_join_table` depuis RDV-8 ; `waitlist_join` (les Moments) laisse le '
  'défaut à 1. Lisible par les membres depuis RDV-8 également : RDV-6 avait '
  'posé la colonne sans l''ajouter au grant de colonnes de la table.';
