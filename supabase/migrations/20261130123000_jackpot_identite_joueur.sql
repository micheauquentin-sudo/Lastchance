-- ============================================================
-- LastChance — Le jackpot cesse de dédoubler ses joueurs (ID-8a)
-- ============================================================
--
-- ── LE DÉFAUT, EN PRODUCTION AUJOURD'HUI ──
--
-- `attach_loyalty_stamp_to_jackpot` (20261112130000:137-228) injecte
-- `loyalty_members.token_hash` DIRECTEMENT comme `jackpot_players.token_hash`.
-- Ça « marche » pour une seule raison : les deux modules hachent leur jeton
-- avec le même `hashPlayerToken` (SHA-256 nu) et contrôlent le même format
-- `^[0-9a-f]{64}$`. Ce n'est pas un pont d'identité, c'est une CLÉ RECOPIÉE
-- d'un monde à l'autre — deux espaces de nommage qui se ressemblent, pas deux
-- noms de la même personne.
--
-- Conséquence, une personne, deux joueurs : tamponnée au comptoir elle entre
-- dans la cagnotte sous son empreinte FIDÉLITÉ ; en ouvrant `/jackpot/<slug>`
-- sur le même téléphone elle entre sous son empreinte JACKPOT. Deux lignes
-- `jackpot_players`, deux `participation_count`, deux cooldowns indépendants,
-- et surtout DEUX JEUX D'ENTRÉES au tirage.
--
-- ── CE QU'ON FAIT, ET POURQUOI MAINTENANT ──
--
-- Le propriétaire a tranché : DÉDUPLIQUER. Une personne, une ligne. Il a été
-- prévenu qu'un joueur qui avait deux jeux d'entrées en perd un — et il n'a
-- aucun client en production, donc la déduplication ne lèse personne. C'est
-- exactement la fenêtre où ce geste est gratuit ; il ne le sera plus.
--
-- ── COMMENT LA SOURCE EST TARIE : PAR LE SOCLE, PAS PAR UN NOUVEAU TUYAU ──
--
-- Trois voies existaient.
--
--   · APPELER `resolve_player_identity` DEPUIS LE TRIGGER. Fermée par sa
--     signature : elle EXIGE `p_device_token_hash`, l'empreinte du cookie
--     `lc-player` du navigateur. Un tampon de caisse n'en a aucune — c'est un
--     employé qui scanne le QR d'un client, il n'y a pas de navigateur joueur
--     dans cette transaction. Lui passer l'empreinte fidélité en guise
--     d'empreinte d'appareil créerait un `player_devices` fantôme par membre
--     de passeport : on remplacerait un dédoublement par un autre, un cran
--     plus profond.
--   · HACHER AUTREMENT (préfixer le hachage d'un sel « jackpot: »). Fabrique
--     une empreinte jackpot DIFFÉRENTE et STABLE, donc supprime la collision
--     — et ne relie toujours RIEN : le même client sur `/jackpot/<slug>`
--     présenterait encore une troisième empreinte, celle de son cookie. On
--     aurait deux joueurs au lieu de deux, avec une fausse impression de
--     propreté.
--   · LIRE L'IDENTITÉ DÉJÀ CONNUE. C'est celle-ci. Le socle sait déjà relier
--     une empreinte historique à une personne : `player_legacy_identities`
--     porte le pont, et `jackpot` est une famille admise du `check` depuis
--     20260805140000. Le trigger DEMANDE donc au socle quelle est l'empreinte
--     jackpot de cette personne, au lieu de la fabriquer.
--
-- Et quand le socle ne sait pas — parce que la personne n'a jamais été pontée
-- côté passeport — le trigger retombe sur le comportement d'hier. Refuser le
-- tampon pour un défaut de comptabilité d'identité ferait échouer la CAISSE ;
-- aucun dédoublement ne vaut ça.
--
-- ── CE QUI A ÉTÉ LU DANS LE CATALOGUE VIVANT AVANT D'ÉCRIRE ──
--
-- Les fonctions de ce dépôt sont réécrites par patchs successifs et plusieurs
-- l'ont été depuis leur fichier d'origine. §0 vérifie les marqueurs de la
-- forme VIVANTE (`pg_get_functiondef`), jamais ceux des migrations qui les ont
-- créées.
--
-- ── CE QUE CE FICHIER NE TOUCHE PAS ──
--
-- `guard_linked_jackpot_campaign` (20261112130000:97-130) interdit à une
-- campagne liée de quitter `validation_mode = 'staff'`. Le verrou pris plus
-- bas est un `select … for update` : il ne modifie AUCUNE colonne de
-- `jackpot_campaigns`, donc ce garde ne se déclenche jamais et
-- « a linked jackpot must keep staff validation » ne peut pas sortir d'ici.
--
-- Aucune table n'est créée, aucune RLS n'est ouverte, aucun `drop`. Le code
-- applicatif n'est pas touché : ce que le lot suivant devra appeler est écrit
-- en §7.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 0. FILIATION — lue dans le catalogue vivant
--
-- ON VÉRIFIE LES MARQUEURS À PRÉSERVER, JAMAIS L'ABSENCE DE CE QU'ON AJOUTE :
-- une garde écrite à l'envers ferait échouer le premier `supabase db reset`
-- venu, sur une base où ce fichier n'est évidemment pas encore appliqué. La
-- seule mention du NEUF est le test d'idempotence, qui SORT sans bruit.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'attach_loyalty_stamp_to_jackpot';

  if pg_catalog.strpos(v_def, 'jackpot_identity_for_player') > 0 then
    -- Déjà appliquée : on sort sans bruit (motif 20261026120000 / 20261128120000).
    return;
  end if;

  -- LA RECOPIE QU'ON REMPLACE. Si `m.token_hash` n'est plus la source de
  -- l'empreinte jackpot, quelqu'un a déjà touché à ce chemin et ce fichier
  -- écraserait son travail.
  if pg_catalog.strpos(v_def, 'm.token_hash') = 0
     or pg_catalog.strpos(v_def, 'v_member_hash') = 0 then
    raise exception
      'public.attach_loyalty_stamp_to_jackpot ne derive plus l empreinte jackpot de m.token_hash : sa forme vivante a change depuis 20261112130000 et la recopier ici effacerait ce changement. Relire le catalogue avant de rejouer cette migration.';
  end if;

  -- LA PROVENANCE, qu'on GARDE mot pour mot. C'est elle qui rend
  -- « un tampon ne devient jamais deux entrees de tirage » vraie ; la
  -- transposer suppose qu'elle est encore là.
  if pg_catalog.strpos(v_def, 'loyalty_stamp_id is null') = 0
     or pg_catalog.strpos(v_def, 'linked jackpot participant missing') = 0 then
    raise exception
      'public.attach_loyalty_stamp_to_jackpot a perdu le rattachement de provenance (loyalty_stamp_id) : la forme vivante n est pas celle que ce fichier transpose.';
  end if;

  -- LE GARDE-FOU ÉCONOMIQUE qu'on garde : un tampon accepté dont la
  -- participation n'est pas enregistrée ANNULE la transaction.
  if pg_catalog.strpos(v_def, 'linked jackpot participation was not recorded') = 0 then
    raise exception
      'public.attach_loyalty_stamp_to_jackpot n annule plus la transaction quand la participation n est pas enregistree : sa forme vivante a change.';
  end if;

  -- ── `record_jackpot_participation`, qu'on NE réécrit PAS ──
  --
  -- Ce fichier ne la touche pas et repose entièrement sur deux de ses
  -- propriétés. Une affirmation qui décide d'une INACTION se vérifie comme une
  -- autre (motif 20261128120000 §0).
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'record_jackpot_participation';

  -- (1) L'INVARIANT DE CONFIDENTIALITÉ. Le code de retrait n'est renvoyé qu'au
  -- gagnant RÉEL, et cette comparaison porte sur l'empreinte que ce fichier
  -- change. Si elle disparaissait, changer la clé fuiterait le code.
  if pg_catalog.strpos(v_def, 'v_winner = p_player_token_hash') = 0 then
    raise exception
      'public.record_jackpot_participation ne compare plus le gagnant a l appelant (v_winner = p_player_token_hash) : changer l empreinte du joueur rendrait le code JACKPOT- visible a un tiers.';
  end if;

  -- (2) LE VERROU DE CAMPAGNE. C'est le rendez-vous que la déduplication
  -- ci-dessous prend pour se sérialiser avec les participations et avec le
  -- tirage par cron. S'il n'est plus là, la déduplication n'est plus atomique.
  if pg_catalog.strpos(v_def, 'for update of c') = 0 then
    raise exception
      'public.record_jackpot_participation ne verrouille plus la ligne de campagne : la deduplication ne pourrait plus se serialiser avec les participations concurrentes.';
  end if;

  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'run_jackpot_date_draws';

  -- (3) LE MÊME VERROU, CÔTÉ CRON. `run_jackpot_date_draws` tourne toutes les
  -- 5 minutes et lit `player_token_hash` : sans son `for update of c`, la
  -- réécriture des entrées pourrait être coupée en plein tirage.
  if pg_catalog.strpos(v_def, 'for update of c') = 0 then
    raise exception
      'public.run_jackpot_date_draws ne verrouille plus la ligne de campagne : le tirage par cron pourrait lire des empreintes en cours de reecriture.';
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 1. L'EMPREINTE JACKPOT CANONIQUE D'UNE PERSONNE
--
-- UNE SEULE RÈGLE, ÉCRITE UNE SEULE FOIS. Le trigger (§3) et la
-- déduplication (§4) doivent choisir LA MÊME empreinte, sinon le premier
-- redédoublerait ce que la seconde vient de réunir. Deux copies de la règle
-- auraient divergé au premier correctif.
--
-- L'ORDRE, ET SON DÉPARTAGE :
--   1. les empreintes qui portent une LIGNE JOUEUR d'abord — ce sont elles qui
--      tiennent le cooldown et le compteur, donc celles que le pot connaît ;
--   2. parmi elles, la PLUS ANCIENNE (`created_at`) : c'est la première entrée
--      de cette personne dans la campagne, celle qui porte le plus d'histoire,
--      et elle ne bouge plus ;
--   3. à défaut de toute ligne joueur — cas des EMPREINTES ORPHELINES, dont le
--      joueur a été effacé par `purge_expired_jackpot_players` sans que ses
--      entrées ni ses gains le soient — la plus ancienne empreinte pontée ;
--   4. et EN DERNIER RESSORT L'EMPREINTE ELLE-MÊME, par ordre croissant.
--
-- LE POINT 4 N'EST PAS UNE FIORITURE, ET IL A ÉTÉ TROUVÉ PAR LE TEST. Un
-- premier jet départageait par `jackpot_players.id` : deux lignes créées dans
-- LA MÊME TRANSACTION portent le même `created_at` — `now()` y est constant —
-- et le survivant se retrouvait donc désigné par un `uuid` ALÉATOIRE. La
-- déduplication rendait un résultat différent d'une exécution à l'autre, et
-- son idempotence ne tenait qu'à la chance. L'empreinte, elle, est un ordre
-- TOTAL et STABLE : arbitraire sur une égalité, mais toujours le même.
--
-- Le cas 3 n'est pas théorique : c'est exactement ce que la purge RGPD laisse
-- derrière elle, et c'est pourquoi cette fonction ne JOINT pas
-- `jackpot_players` mais s'y adosse en `left join`.
-- ────────────────────────────────────────────────────────────

create or replace function public.jackpot_identity_for_player(
  p_player_id uuid,
  p_organization_id uuid,
  p_campaign_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pli.legacy_identity_hash
    from public.player_legacy_identities pli
    left join public.jackpot_players jp
      on jp.campaign_id = p_campaign_id
     and jp.token_hash = pli.legacy_identity_hash
   where pli.player_id = p_player_id
     and pli.organization_id = p_organization_id
     and pli.experience_kind = 'jackpot'
     and pli.experience_id = p_campaign_id
   order by (jp.id is null),
            jp.created_at asc nulls last,
            pli.first_seen_at asc,
            pli.legacy_identity_hash asc
   limit 1
$$;

comment on function public.jackpot_identity_for_player(uuid, uuid, uuid) is
  'L''empreinte jackpot CANONIQUE d''une personne sur une campagne, ou NULL si '
  'le socle n''en connaît aucune. Règle unique, partagée par le trigger de '
  'fidélité et par la déduplication : une ligne joueur d''abord, la plus '
  'ancienne ensuite, à défaut la plus ancienne empreinte pontée. Lecture '
  'seule ; ne rend jamais l''empreinte d''une autre personne.';


-- ────────────────────────────────────────────────────────────
-- 2. POSER LE PONT — une empreinte jackpot devient celle d'une personne
--
-- POURQUOI PAS `resolve_player_identity` : elle exige l'empreinte de
-- l'APPAREIL, et les deux appelants d'ici n'en ont pas. Le trigger de caisse
-- n'a aucun navigateur joueur dans sa transaction ; la déduplication travaille
-- sur des empreintes déjà en base, dont l'appareil d'origine est inconnu et
-- souvent perdu.
--
-- LE MÊME VERROU CONSULTATIF que `resolve_player_identity` (20260805140000),
-- à la clé près : `player-legacy:<org>:<famille>:<experience>:<empreinte>`.
-- C'est ce qui empêche une pose de pont concurrente de créer deux adhésions
-- pour la même personne. On ne prend QUE celui-là — jamais le verrou
-- d'appareil — donc aucun cycle d'attente n'est possible avec elle.
--
-- ELLE LÈVE quand l'empreinte appartient déjà à quelqu'un d'autre, au lieu de
-- la déplacer en silence : réunir deux personnes est une décision, et elle a
-- déjà son outil (`merge_player_identities`, 20261118120000). Les deux
-- appelants d'ici écartent ce cas AVANT d'appeler.
-- ────────────────────────────────────────────────────────────

create or replace function public.link_jackpot_legacy_identity(
  p_player_id uuid,
  p_organization_id uuid,
  p_campaign_id uuid,
  p_legacy_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_membership_id uuid;
  v_experience_membership_id uuid;
  v_owner uuid;
begin
  if p_legacy_hash is null or p_legacy_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid jackpot legacy identity hash' using errcode = '22023';
  end if;
  if p_player_id is null or p_organization_id is null or p_campaign_id is null then
    raise exception 'player, organization and campaign are required'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.players p
     where p.id = p_player_id and p.status = 'active'
  ) then
    raise exception 'player is unknown or blocked' using errcode = '23503';
  end if;
  -- ISOLATION : la campagne doit appartenir au locataire annoncé. Sans ce
  -- contrôle, un appel de service mal formé ponterait l'empreinte d'un joueur
  -- sur la campagne d'un voisin.
  if not exists (
    select 1 from public.jackpot_campaigns c
     where c.id = p_campaign_id
       and c.organization_id = p_organization_id
  ) then
    raise exception 'jackpot campaign does not belong to organization'
      using errcode = '23503';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player-legacy:'
        || p_organization_id::text || ':jackpot:'
        || p_campaign_id::text || ':'
        || p_legacy_hash,
      0
    )
  );

  select pli.player_id, pli.experience_membership_id
    into v_owner, v_experience_membership_id
    from public.player_legacy_identities pli
   where pli.organization_id = p_organization_id
     and pli.experience_kind = 'jackpot'
     and pli.experience_id = p_campaign_id
     and pli.legacy_identity_hash = p_legacy_hash;

  if found then
    if v_owner <> p_player_id then
      raise exception 'jackpot legacy identity is linked to another player'
        using errcode = '23505';
    end if;
    update public.player_legacy_identities pli
       set last_seen_at = pg_catalog.now()
     where pli.experience_membership_id = v_experience_membership_id
       and pli.legacy_identity_hash = p_legacy_hash;
    return v_experience_membership_id;
  end if;

  insert into public.player_organization_memberships (player_id, organization_id)
  values (p_player_id, p_organization_id)
  on conflict (player_id, organization_id)
    do update set last_seen_at = pg_catalog.now()
  returning id into v_org_membership_id;

  insert into public.player_experience_memberships (
    organization_membership_id, player_id, organization_id,
    experience_kind, experience_id, acquisition_source
  ) values (
    v_org_membership_id, p_player_id, p_organization_id,
    'jackpot', p_campaign_id, 'unknown'
  )
  on conflict (organization_id, experience_kind, experience_id, player_id)
    do update set last_seen_at = pg_catalog.now()
  returning id into v_experience_membership_id;

  insert into public.player_legacy_identities (
    experience_membership_id, player_id, organization_id,
    experience_kind, experience_id, legacy_identity_hash
  ) values (
    v_experience_membership_id, p_player_id, p_organization_id,
    'jackpot', p_campaign_id, p_legacy_hash
  );

  return v_experience_membership_id;
end;
$$;

comment on function public.link_jackpot_legacy_identity(uuid, uuid, uuid, text) is
  'Rattache une empreinte jackpot historique à une personne, en créant au '
  'besoin son adhésion au locataire et à la campagne. Le chemin de pont des '
  'appelants SANS empreinte d''appareil (trigger de caisse, déduplication), '
  'là où resolve_player_identity sert le navigateur. Lève 23505 si '
  'l''empreinte appartient déjà à une autre personne.';


-- ────────────────────────────────────────────────────────────
-- 3. LA SOURCE EST TARIE — le tampon de caisse cesse de recopier l'empreinte
--
-- Transposition MINIMALE de la forme vivante : seule la valeur passée à
-- `record_jackpot_participation` change, plus la pose du pont. Le mode staff,
-- le validateur obligatoire, le garde d'addon, l'annulation sur participation
-- non enregistrée et le rattachement de provenance sont recopiés tels quels.
--
-- L'ORDRE DES TROIS GESTES est voulu : on RÉSOUT l'identité, on POSE le pont,
-- puis on enregistre. Poser le pont avant l'écriture du pot fait échouer tôt
-- un état d'identité incohérent, avant d'avoir touché à la jauge commune.
--
-- LE PONT NE PEUT PAS FAIRE ÉCHOUER LA CAISSE. `link_jackpot_legacy_identity`
-- lève quand l'empreinte appartient à quelqu'un d'autre ; ici, ce cas est
-- ÉCARTÉ AVANT l'appel plutôt que rattrapé après. Un `exception when others`
-- aurait avalé du même geste les vraies pannes.
-- ────────────────────────────────────────────────────────────

create or replace function public.attach_loyalty_stamp_to_jackpot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_member_hash text;
  v_player_id uuid;
  v_jackpot_hash text;
  v_result jsonb;
  v_state text;
  v_participant_id uuid;
begin
  -- Les commandes et le code tournant restent des parcours distincts : seul le
  -- scan QR caisse d'un passeport, avec un validateur authentifie, alimente le
  -- pot commun.
  if new.mode <> 'staff' or new.validated_by is null then
    return new;
  end if;

  select p.jackpot_campaign_id, m.token_hash
    into v_campaign_id, v_member_hash
    from public.loyalty_programs p
    join public.loyalty_members m
      on m.id = new.member_id
     and m.program_id = new.program_id
     and m.organization_id = new.organization_id
   where p.id = new.program_id
     and p.organization_id = new.organization_id;

  if v_campaign_id is null or v_member_hash is null then
    return new;
  end if;

  -- Un lien est conserve pour faciliter une reactivation, mais un Jackpot
  -- arrete ne doit jamais empecher la fidelite de fonctionner.
  if not exists (
    select 1
      from public.jackpot_campaigns c
      join public.organizations o on o.id = c.organization_id
     where c.id = v_campaign_id
       and c.organization_id = new.organization_id
       and c.status = 'active'
       and c.validation_mode = 'staff'
       and o.addon_jackpot
  ) then
    return new;
  end if;

  -- ── L'IDENTITÉ JACKPOT DE CETTE PERSONNE, ET NON SON EMPREINTE FIDÉLITÉ ──
  --
  -- On part de l'empreinte fidélité pour retrouver la PERSONNE (le pont posé
  -- côté passeport), puis on demande au socle son empreinte jackpot canonique.
  -- C'est ce chaînon qui remplace la recopie : `v_member_hash` ne sert plus
  -- que de point d'entrée dans le socle.
  select pli.player_id into v_player_id
    from public.player_legacy_identities pli
   where pli.organization_id = new.organization_id
     and pli.experience_kind = 'loyalty'
     and pli.experience_id = new.program_id
     and pli.legacy_identity_hash = v_member_hash;

  if v_player_id is not null then
    v_jackpot_hash := public.jackpot_identity_for_player(
      v_player_id, new.organization_id, v_campaign_id);
  end if;

  -- LE REPLI, ET IL EST DÉLIBÉRÉ. Personne inconnue du socle, ou connue mais
  -- sans aucune empreinte jackpot : on retombe sur le comportement d'hier.
  -- Refuser le tampon ferait échouer la CAISSE pour un défaut de comptabilité
  -- d'identité — et cette empreinte-là est aussitôt pontée ci-dessous, donc
  -- elle ne se dédouble qu'une fois, jamais deux.
  v_jackpot_hash := coalesce(v_jackpot_hash, v_member_hash);

  -- ── LE PONT, POSÉ TANT QUE LA PERSONNE EST CONNUE ──
  --
  -- C'est lui qui FERME la boucle : la prochaine ouverture de `/jackpot/<slug>`
  -- par ce même client retrouvera cette empreinte au lieu d'en fabriquer une
  -- seconde. Sans lui, tarir la source ne servirait qu'au deuxième tampon.
  --
  -- L'empreinte déjà pontée à quelqu'un d'AUTRE est écartée ici, sans lever :
  -- réunir deux personnes est une décision qui a son outil, et la caisse n'est
  -- pas l'endroit où la prendre.
  if v_player_id is not null and not exists (
    select 1
      from public.player_legacy_identities pli
     where pli.organization_id = new.organization_id
       and pli.experience_kind = 'jackpot'
       and pli.experience_id = v_campaign_id
       and pli.legacy_identity_hash = v_jackpot_hash
       and pli.player_id <> v_player_id
  ) then
    perform public.link_jackpot_legacy_identity(
      v_player_id, new.organization_id, v_campaign_id, v_jackpot_hash);
  end if;

  v_result := public.record_jackpot_participation(
    v_campaign_id,
    v_jackpot_hash,
    null,
    new.validated_by
  );
  v_state := v_result ->> 'state';

  -- La garde de configuration rend too_soon impossible pour un tampon valide.
  -- S'il apparaissait malgre tout, on annule la transaction : mieux vaut un
  -- refus explicite que promettre une participation qui n'a pas eu lieu.
  if v_state <> 'recorded' then
    raise exception 'linked jackpot participation was not recorded';
  end if;

  -- record_jackpot_participation tient le verrou de campagne jusqu'au commit.
  -- La derniere entree de ce joueur est donc exactement celle qu'il vient de
  -- creer; le predicate loyalty_stamp_id is null preserve la provenance.
  select pt.id into v_participant_id
    from public.jackpot_participants pt
   where pt.campaign_id = v_campaign_id
     and pt.organization_id = new.organization_id
     and pt.player_token_hash = v_jackpot_hash
     and pt.loyalty_stamp_id is null
   order by pt.created_at desc, pt.id desc
   limit 1
   for update;

  if v_participant_id is null then
    raise exception 'linked jackpot participant missing';
  end if;

  update public.jackpot_participants
     set loyalty_stamp_id = new.id
   where id = v_participant_id;

  return new;
end;
$$;


-- ────────────────────────────────────────────────────────────
-- 4. DÉDUPLIQUER L'EXISTANT — une personne, une ligne
--
-- ── LE VERROU, ET CE QU'IL PROTÈGE ──
--
-- `run_jackpot_date_draws()` tourne PAR CRON TOUTES LES 5 MINUTES et lit
-- `player_token_hash` pour désigner un gagnant. `record_jackpot_participation`
-- écrit dans les mêmes tables. Les trois se donnent rendez-vous au même
-- endroit : la LIGNE DE CAMPAGNE. Chaque campagne est donc traitée sous son
-- `select … for update`, ce qui rend la réécriture atomique vis-à-vis d'un
-- tirage en vol — un tirage commencé attend, un tirage à venir lit l'état
-- réuni. C'est un `select` : aucune colonne de `jackpot_campaigns` n'est
-- modifiée, donc `guard_linked_jackpot_campaign` ne se déclenche pas.
--
-- ── PHASE A, LE PONT D'ANCIENNETÉ ──
--
-- La base ne peut réunir deux empreintes que si elle sait qu'elles désignent
-- la même personne, et le socle est la SEULE source de cette vérité. Or les
-- empreintes recopiées par l'ancien trigger n'y sont pas : elles sont entrées
-- dans le pot par un chemin qui ne pontait rien.
--
-- Phase A les y fait entrer. Une empreinte de la campagne qui est AUSSI le
-- `token_hash` d'un membre du passeport lié ne peut venir que de la recopie —
-- elle est donc l'empreinte jackpot de la personne de ce membre, et on
-- l'enregistre comme telle.
--
-- ELLE NE JOINT PAS `jackpot_players`, ET C'EST LE POINT. Les EMPREINTES
-- ORPHELINES — `purge_expired_jackpot_players` (20260726120000:909-928)
-- supprime les lignes joueur SANS toucher aux entrées ni aux gains — n'ont
-- plus de ligne joueur du tout. Un rattrapage par jointure sur
-- `jackpot_players` les laisserait derrière, avec leur lot gagné. On énumère
-- donc les empreintes de la campagne par l'UNION des trois tables.
--
-- `distinct on (empreinte)` : deux personnes ne peuvent pas revendiquer la
-- même empreinte dans une même passe. La collision est invraisemblable (le
-- jeton est aléatoire par navigateur) mais elle ferait lever §2 au milieu du
-- rattrapage, et un départage déterministe coûte une ligne.
--
-- ── PHASE B, LA FUSION ──
--
-- Les gains D'ABORD : `jackpot_wins.winner_token_hash` n'a AUCUNE clé
-- étrangère vers `jackpot_players` (20260726120000:228-251, choix assumé — le
-- registre reste anonyme et vérifiable après la purge). Rien ne cascade, rien
-- n'alerte : ne pas réécrire cette colonne ferait DISPARAÎTRE de son écran un
-- lot gagné et non retiré. Le code resterait valable en caisse, et son gagnant
-- ne le verrait plus. C'est la perte la plus dure du lot, donc le premier
-- geste.
--
-- Les entrées ensuite : `jackpot_participants` n'a aucune unicité sur le
-- hachage, la réécriture est directe et réunit les chances au tirage.
-- `loyalty_stamp_id` n'est pas touché, son index unique partiel non plus.
--
-- Les lignes joueur enfin : `unique (campaign_id, token_hash)`
-- (20260726120000:181-195) fait lever 23505 à tout `update` naïf. On SUPPRIME
-- les absorbées, puis on RECALCULE le survivant.
--
-- ── POURQUOI RECALCULER ET NON ADDITIONNER ──
--
-- `participation_count` et `last_participation_at` sont dénormalisés, et la
-- somme serait FAUSSE dans les deux sens. La purge RGPD efface une ligne
-- joueur en laissant ses entrées : le compteur repart de 0 alors que le
-- registre, lui, a tout gardé — additionner sous-compte. Et un joueur purgé
-- puis revenu compterait deux fois son ancienneté s'il avait été recréé.
-- `jackpot_participants` est le REGISTRE, il est réécrit juste au-dessus, et
-- `record_jackpot_participation` incrémente le compteur et insère l'entrée
-- dans la même transaction : `count(*)` sur le registre est donc la seule
-- valeur qui reste vraie quoi qu'il soit arrivé avant.
--
-- `last_participation_at` porte le COOLDOWN, pas une statistique. On prend le
-- MAXIMUM de toutes les lignes réunies et du registre : garder la valeur du
-- seul survivant offrirait au client fusionné un scan immédiat en présentant
-- la fraîcheur de son autre identité.
--
-- ── IDEMPOTENTE ──
--
-- Rejouer ne change rien : Phase A écarte les empreintes déjà pontées, Phase B
-- ne retient que les personnes portant PLUS D'UNE empreinte, et le survivant
-- désigné par §1 ne bouge plus une fois les autres absorbées. Le rapport rendu
-- vaut alors zéro partout — c'est ce que le test vérifie.
-- ────────────────────────────────────────────────────────────

create or replace function public.dedupe_jackpot_player_identities(
  p_campaign_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign record;
  v_pont record;
  v_personne record;
  v_survivor text;
  v_absorbed text[];
  v_last timestamptz;
  v_wins integer;
  v_entries integer;
  v_deleted integer;
  v_bridged integer := 0;
  v_persons integer := 0;
  v_players_merged integer := 0;
  v_entries_moved integer := 0;
  v_wins_moved integer := 0;
begin
  for v_campaign in
    select c.id, c.organization_id
      from public.jackpot_campaigns c
     where p_campaign_id is null or c.id = p_campaign_id
     order by c.id
  loop
    -- LE RENDEZ-VOUS. Même ligne que record_jackpot_participation et
    -- run_jackpot_date_draws ; un `select`, donc aucun trigger de campagne.
    perform 1
       from public.jackpot_campaigns c
      where c.id = v_campaign.id
        for update;

    -- ── PHASE A ──
    for v_pont in
      select distinct on (e.empreinte) e.empreinte, pli.player_id
        from (
          select jp.token_hash as empreinte
            from public.jackpot_players jp
           where jp.campaign_id = v_campaign.id
          union
          select pt.player_token_hash
            from public.jackpot_participants pt
           where pt.campaign_id = v_campaign.id
          union
          select w.winner_token_hash
            from public.jackpot_wins w
           where w.campaign_id = v_campaign.id
        ) e
        join public.loyalty_programs lp
          on lp.jackpot_campaign_id = v_campaign.id
         and lp.organization_id = v_campaign.organization_id
        join public.loyalty_members lm
          on lm.program_id = lp.id
         and lm.organization_id = lp.organization_id
         and lm.token_hash = e.empreinte
        join public.player_legacy_identities pli
          on pli.organization_id = lp.organization_id
         and pli.experience_kind = 'loyalty'
         and pli.experience_id = lp.id
         and pli.legacy_identity_hash = lm.token_hash
       where not exists (
         select 1
           from public.player_legacy_identities deja
          where deja.organization_id = v_campaign.organization_id
            and deja.experience_kind = 'jackpot'
            and deja.experience_id = v_campaign.id
            and deja.legacy_identity_hash = e.empreinte
       )
       order by e.empreinte, pli.player_id
    loop
      perform public.link_jackpot_legacy_identity(
        v_pont.player_id,
        v_campaign.organization_id,
        v_campaign.id,
        v_pont.empreinte
      );
      v_bridged := v_bridged + 1;
    end loop;

    -- ── PHASE B ──
    for v_personne in
      select pli.player_id
        from public.player_legacy_identities pli
       where pli.organization_id = v_campaign.organization_id
         and pli.experience_kind = 'jackpot'
         and pli.experience_id = v_campaign.id
       group by pli.player_id
      having pg_catalog.count(*) > 1
       order by pli.player_id
    loop
      v_survivor := public.jackpot_identity_for_player(
        v_personne.player_id, v_campaign.organization_id, v_campaign.id);
      if v_survivor is null then
        continue;
      end if;

      select pg_catalog.array_agg(pli.legacy_identity_hash
               order by pli.legacy_identity_hash)
        into v_absorbed
        from public.player_legacy_identities pli
       where pli.player_id = v_personne.player_id
         and pli.organization_id = v_campaign.organization_id
         and pli.experience_kind = 'jackpot'
         and pli.experience_id = v_campaign.id
         and pli.legacy_identity_hash <> v_survivor;

      if v_absorbed is null
         or pg_catalog.array_length(v_absorbed, 1) is null then
        continue;
      end if;

      -- (1) LES GAINS — aucune FK, aucune cascade, aucune alerte.
      update public.jackpot_wins w
         set winner_token_hash = v_survivor
       where w.campaign_id = v_campaign.id
         and w.winner_token_hash = any(v_absorbed);
      get diagnostics v_wins = row_count;

      -- (2) LES ENTRÉES AU TIRAGE.
      update public.jackpot_participants pt
         set player_token_hash = v_survivor
       where pt.campaign_id = v_campaign.id
         and pt.player_token_hash = any(v_absorbed);
      get diagnostics v_entries = row_count;

      -- (3) LES LIGNES JOUEUR — lire AVANT de supprimer.
      select pg_catalog.max(jp.last_participation_at)
        into v_last
        from public.jackpot_players jp
       where jp.campaign_id = v_campaign.id
         and (jp.token_hash = v_survivor
              or jp.token_hash = any(v_absorbed));

      delete from public.jackpot_players jp
       where jp.campaign_id = v_campaign.id
         and jp.token_hash = any(v_absorbed);
      get diagnostics v_deleted = row_count;

      -- LE RECALCUL SUIT LE REGISTRE, PAS LA SUPPRESSION. Une empreinte
      -- ORPHELINE n'a plus de ligne joueur à supprimer (`v_deleted = 0`) et
      -- lègue pourtant ses entrées au survivant : ne recalculer qu'après une
      -- suppression laisserait le compteur du survivant sous-évalué du nombre
      -- exact d'entrées qu'il vient d'hériter.
      --
      -- Et aucun `update` ne crée de ligne : si la purge a emporté celle du
      -- survivant, on ne ressuscite pas une identité effacée, on réunit
      -- seulement son registre.
      if v_deleted > 0 or v_entries > 0 then
        update public.jackpot_players jp
           set participation_count = (
                 select pg_catalog.count(*)
                   from public.jackpot_participants pt
                  where pt.campaign_id = v_campaign.id
                    and pt.player_token_hash = v_survivor),
               last_participation_at = greatest(
                 v_last,
                 (select pg_catalog.max(pt.created_at)
                    from public.jackpot_participants pt
                   where pt.campaign_id = v_campaign.id
                     and pt.player_token_hash = v_survivor))
         where jp.campaign_id = v_campaign.id
           and jp.token_hash = v_survivor;
      end if;

      -- ON NE COMPTE QUE CE QU'ON A DÉPLACÉ. Une personne dont les empreintes
      -- absorbées ne portent plus rien reste dans `player_legacy_identities`
      -- — c'est voulu, son ancien cookie doit continuer à la désigner — et
      -- repasse donc dans cette boucle à chaque appel. L'incrémenter ici sans
      -- condition ferait rendre `persons_deduped = 1` à un second passage qui
      -- n'a rien changé, et l'idempotence deviendrait invérifiable.
      if v_wins + v_entries + v_deleted > 0 then
        v_persons := v_persons + 1;
        v_wins_moved := v_wins_moved + v_wins;
        v_entries_moved := v_entries_moved + v_entries;
        v_players_merged := v_players_merged + v_deleted;
      end if;
    end loop;
  end loop;

  return pg_catalog.jsonb_build_object(
    'bridged_identities', v_bridged,
    'persons_deduped', v_persons,
    'players_merged', v_players_merged,
    'entries_moved', v_entries_moved,
    'wins_moved', v_wins_moved
  );
end;
$$;

comment on function public.dedupe_jackpot_player_identities(uuid) is
  'Réunit sur une seule empreinte les lignes jackpot d''une même personne : '
  'ponte d''abord les empreintes recopiées par l''ancien trigger de fidélité, '
  'puis réécrit gains, entrées de tirage et ligne joueur (compteurs '
  'RECALCULÉS depuis le registre, cooldown pris au maximum). Idempotente, '
  'sérialisée par le verrou de campagne face au tirage par cron. NULL traite '
  'toutes les campagnes.';


-- ────────────────────────────────────────────────────────────
-- 5. LES DROITS
--
-- Aucune de ces trois fonctions ne doit être atteignable depuis PostgREST :
-- elles lisent et écrivent des empreintes pseudonymes de joueurs, tables que
-- 20260805140000 a fermées à `anon` comme à `authenticated`. Le contrôle
-- négatif de §6 est celui qui compte — un `grant` bien orthographié sur le
-- mauvais rôle ne lève pas.
-- ────────────────────────────────────────────────────────────

revoke all on function public.jackpot_identity_for_player(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.link_jackpot_legacy_identity(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.dedupe_jackpot_player_identities(uuid)
  from public, anon, authenticated;
revoke all on function public.attach_loyalty_stamp_to_jackpot()
  from public, anon, authenticated;

grant execute on function public.jackpot_identity_for_player(uuid, uuid, uuid)
  to service_role;
grant execute on function public.link_jackpot_legacy_identity(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.dedupe_jackpot_player_identities(uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 6. RATTRAPAGE ET GARDE DE SORTIE
--
-- Ce dépôt a perdu six lots sur des fonctions livrées sans droit d'accès : un
-- `grant` sans effet NE LÈVE PAS, il passe, et la panne reste intacte pendant
-- que le fichier passe pour appliqué. La seule parade est de vérifier l'EFFET
-- ici, tant que la transaction peut encore être annulée.
--
-- ⚠️ CE QUE LE RATTRAPAGE PEUT ET NE PEUT PAS FAIRE, ET IL FAUT LE DIRE.
-- Il ponte les empreintes venues de la recopie (Phase A) et réunit tout ce que
-- le socle sait déjà. Mais l'empreinte que le joueur porte dans SON cookie
-- côté `/jackpot/<slug>` n'a jamais été pontée — le module n'a pas encore
-- adopté le socle. Tant que le lot applicatif ne l'a pas fait, la base ne peut
-- pas savoir qu'elle désigne la même personne, et Phase B n'a rien à réunir.
-- C'est pourquoi la fonction est IDEMPOTENTE et publiée : elle est faite pour
-- être rappelée après. Une garde qui exigerait ici un compte de fusions non
-- nul mentirait sur ce que la base peut savoir.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_rapport jsonb;
  v_reste bigint;
  v_role text;
  v_signature text;
  v_def text;
begin
  v_rapport := public.dedupe_jackpot_player_identities(null);
  raise notice 'ID-8a — rattrapage des identites jackpot : %', v_rapport;

  -- (a) NÉGATIF — plus aucune personne ne porte DEUX lignes joueur sur une
  -- même campagne. C'est le dédoublement lui-même, mesuré.
  select pg_catalog.count(*) into v_reste
    from (
      select pli.player_id, pli.experience_id
        from public.player_legacy_identities pli
        join public.jackpot_players jp
          on jp.campaign_id = pli.experience_id
         and jp.token_hash = pli.legacy_identity_hash
       where pli.experience_kind = 'jackpot'
       group by pli.player_id, pli.experience_id
      having pg_catalog.count(*) > 1
    ) d;
  if v_reste > 0 then
    raise exception
      'ID-8a : % personne(s) portent encore deux lignes jackpot_players sur une meme campagne apres deduplication', v_reste;
  end if;

  -- (b) NÉGATIF — aucune entrée de tirage ni aucun gain ne porte plus une
  -- empreinte ABSORBÉE. C'est le contrôle qui attrape un lot gagné laissé
  -- derrière : il ne joint pas jackpot_players, donc il voit aussi les
  -- empreintes orphelines de la purge.
  select pg_catalog.count(*) into v_reste
    from public.player_legacy_identities pli
   where pli.experience_kind = 'jackpot'
     and pli.legacy_identity_hash is distinct from
         public.jackpot_identity_for_player(
           pli.player_id, pli.organization_id, pli.experience_id)
     and (
       exists (
         select 1 from public.jackpot_participants pt
          where pt.campaign_id = pli.experience_id
            and pt.player_token_hash = pli.legacy_identity_hash
       )
       or exists (
         select 1 from public.jackpot_wins w
          where w.campaign_id = pli.experience_id
            and w.winner_token_hash = pli.legacy_identity_hash
       )
     );
  if v_reste > 0 then
    raise exception
      'ID-8a : % empreinte(s) absorbee(s) portent encore des entrees de tirage ou un gain — un lot gagne serait invisible pour son gagnant', v_reste;
  end if;

  -- (c) POSITIF — le serveur peut appeler les trois fonctions. Sans cela, le
  -- lot applicatif qui suit n'aurait aucun chemin de pont, et rien ne le
  -- signalerait avant l'exécution.
  foreach v_signature in array array[
    'public.jackpot_identity_for_player(uuid,uuid,uuid)',
    'public.link_jackpot_legacy_identity(uuid,uuid,uuid,text)',
    'public.dedupe_jackpot_player_identities(uuid)'
  ] loop
    if not pg_catalog.has_function_privilege('service_role', v_signature, 'EXECUTE')
    then
      raise exception
        '% n est pas executable par service_role : le pont d identite jackpot resterait lettre morte', v_signature;
    end if;
    -- (d) NÉGATIF — et c'est le contrôle de fuite. Ces deux rôles sont ceux
    -- que PostgREST endosse pour un visiteur anonyme et pour une session
    -- marchande : l'un d'eux pourrait énumérer ou déplacer des empreintes.
    foreach v_role in array array['anon', 'authenticated'] loop
      if pg_catalog.has_function_privilege(v_role, v_signature, 'EXECUTE') then
        raise exception
          '% est executable par % : des empreintes pseudonymes deviendraient lisibles ou deplacables hors du serveur', v_signature, v_role;
      end if;
    end loop;
  end loop;

  -- (e) POSITIF — la source est REELLEMENT tarie. Le trigger interroge le
  -- socle ; sans ce contrôle, un `create or replace` silencieusement inopérant
  -- laisserait la recopie en place et tout le reste du fichier passerait.
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'attach_loyalty_stamp_to_jackpot';
  if pg_catalog.strpos(v_def, 'jackpot_identity_for_player') = 0
     or pg_catalog.strpos(v_def, 'link_jackpot_legacy_identity') = 0 then
    raise exception
      'public.attach_loyalty_stamp_to_jackpot ne consulte pas le socle d identite : la recopie de l empreinte fidelite est toujours en place.';
  end if;

  -- (f) NÉGATIF — et il n'enregistre PLUS la participation sous l'empreinte
  -- fidélité. Le contrôle (e) verdirait aussi sur une fonction qui consulte le
  -- socle puis enregistre quand même `v_member_hash`.
  --
  -- On cherche l'empreinte SUIVIE D'UNE VIRGULE, et non un appel recopié en
  -- entier : `v_member_hash,` ne peut apparaître qu'en position d'ARGUMENT, et
  -- ce contrôle survit alors à une réindentation de la fonction — une garde
  -- calquée sur la mise en forme rougirait au premier reformatage, pour un
  -- code parfaitement correct.
  if pg_catalog.strpos(v_def, 'v_member_hash,') > 0 then
    raise exception
      'public.attach_loyalty_stamp_to_jackpot passe encore v_member_hash en argument : la cle recopiee atteint toujours le pot.';
  end if;
  if pg_catalog.strpos(v_def, 'v_jackpot_hash,') = 0 then
    raise exception
      'public.attach_loyalty_stamp_to_jackpot n enregistre pas la participation sous l empreinte jackpot resolue.';
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 7. RELAIS APPLICATIF — ce que ce fichier NE PEUT PAS faire
--
-- ⚠️ LE MODULE JACKPOT N'A PAS ENCORE ADOPTÉ LE SOCLE. Ce fichier ferme le
-- chemin de la CAISSE ; celui du NAVIGATEUR reste ouvert. Le lot applicatif
-- doit, sur `/jackpot/<slug>`, faire ce que le passeport, Réserver, le
-- calendrier et les pronostics font déjà :
--
--   1. `resolve_player_identity(<empreinte lc-player>, <org>, 'jackpot',
--      <campagne>, <empreinte du cookie jackpot>, <source>, <qr>)` — pose le
--      pont paresseux du navigateur. `jackpot` est déjà une famille admise,
--      aucune migration n'est nécessaire pour ça.
--   2. `lookup_player_legacy_identities(<empreinte lc-player>, <org>,
--      'jackpot', <campagne>)` — rend TOUTES les empreintes connues de ce
--      joueur, de la plus récente à la plus ancienne, pour le client qui a
--      changé d'appareil.
--   3. `jackpot_identity_for_player(<player>, <org>, <campagne>)` — rend
--      l'empreinte CANONIQUE, celle sous laquelle il faut écrire. C'est la
--      même règle que le trigger de caisse : les deux mondes convergent parce
--      qu'ils appellent la même fonction, pas parce qu'ils appliquent la même
--      convention.
--   4. `dedupe_jackpot_player_identities(<campagne>)` — À RAPPELER UNE FOIS le
--      pont du navigateur posé. C'est à ce moment-là, et pas avant, que la
--      base peut savoir que l'empreinte du cookie et celle de la caisse
--      désignent la même personne.
--
-- ⚠️ AUCUN TYPE NI SCHÉMA ZOD À CHANGER. Aucune table, aucune colonne, aucune
-- valeur d'énumération n'est ajoutée : `src/types/database.generated.ts` ne
-- gagne que les trois signatures de fonctions, et `PLAYER_EXPERIENCE_KINDS`
-- (src/lib/player-identity.ts) porte déjà `jackpot`.
--
-- ⚠️ CE FICHIER NE BASCULE RIEN D'AUTRE. Le passeport garde son empreinte,
-- `merge_player_identities` n'est pas appelée, la purge RGPD n'est pas
-- modifiée, et aucun tirage passé n'est rejoué : un gain déjà attribué change
-- seulement d'empreinte de gagnant, jamais de gagnant.
-- ────────────────────────────────────────────────────────────
