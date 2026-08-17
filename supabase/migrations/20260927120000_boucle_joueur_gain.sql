-- ============================================================
-- LA BOUCLE JOUEUR → GAIN SE FERME (wagon 3 du train d'audit)
--
-- Deux fuites du même parcours, corrigées ici parce qu'elles vivent toutes
-- deux dans le moteur de tirage — donc en SQL, et nulle part ailleurs.
--
--   JOU-1. La reprise d'un gain perdu en route s'arrêtait à 30 MINUTES
--          (`recoverPendingWin`, src/actions/play.ts : `cutoff = now - 30 min`).
--          Passé ce délai, un joueur dont la réponse réseau s'est perdue ne
--          revoyait JAMAIS son lot, alors que le stock avait été décrémenté et
--          que le spin restait `claimed = false` en base : lot payé par le
--          commerçant, jamais remis, et aucune trace du problème côté joueur.
--          La reprise couvre désormais TOUTE la fenêtre de `play_limit` —
--          exactement la période pendant laquelle le joueur ne peut de toute
--          façon pas rejouer. Arbitrage propriétaire.
--
--   JOB-8. `perform_atomic_spin` n'avait AUCUNE clé d'idempotence. Un double
--          envoi (double-clic, reprise réseau, retry d'un client) produisait
--          DEUX spins et DEUX décrémentations de stock pour une seule
--          participation voulue. La fonction accepte maintenant un nonce
--          optionnel : le second appel rend l'issue du premier sans rien
--          écrire.
--
-- ── POURQUOI LE CALCUL DE FENÊTRE N'A PAS DE MIROIR TYPESCRIPT ──
--
-- Il aurait été plus simple d'écrire la borne dans `recoverPendingWin` : une
-- soustraction de date en TS, et l'affaire semblait faite. C'est refusé, et
-- c'est le fond de JOU-1. La fenêtre de jeu est déjà définie une fois, dans
-- `perform_atomic_spin` (20260731120000:126-141), avec le fuseau de
-- l'organisation, `date_trunc` ISO pour la semaine et la clé `play_window_key`
-- que l'index unique `spins_one_per_window_idx` fait respecter. Un second
-- calcul en TS, c'est deux vérités qui divergent au premier changement de
-- règle — et la divergence serait SILENCIEUSE : elle ne se verrait qu'au
-- moment où un joueur perd son lot. Le calcul reste donc en SQL, en UN seul
-- endroit, et la reprise devient une RPC.
--
-- Les expressions de fenêtre ci-dessous sont RECOPIÉES de
-- `perform_atomic_spin` (20260731120000:126-141, la définition VIVANTE). Toute
-- évolution de la règle doit toucher les deux fonctions du même fichier — le
-- test pgTAP `boucle_joueur_gain.test.sql` compare les issues, pas les
-- sources : c'est lui qui rougit si elles s'écartent.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. JOB-8 · LA CLÉ D'IDEMPOTENCE, ET SON UNICITÉ
-- ════════════════════════════════════════════════════════════
--
-- Colonne NULLABLE et sans défaut : tous les spins déjà en base, et tous les
-- appelants qui ne passent pas de nonce (la roue, le grattage, les jeux de
-- révélation), restent exactement où ils sont. La clé n'existe que pour les
-- appels qui en demandent une.
alter table public.spins
  add column if not exists idempotency_key text;

comment on column public.spins.idempotency_key is
  'Nonce d''idempotence de l''appel qui a produit ce spin (JOB-8, '
  '20260927120000). Null : appel sans nonce — le cas de tous les spins '
  'antérieurs et de la roue classique. Non null : un second '
  'perform_atomic_spin portant la MÊME clé rend l''issue de celui-ci sans rien '
  'réécrire ni décrémenter. Fourni par le serveur (nonce signé du défi), '
  'jamais par le client.';

-- UNICITÉ GLOBALE, et c'est un choix. La clé identifie UNE tentative, pas « une
-- tentative de ce joueur » : deux lignes ne peuvent pas la porter, même sous
-- deux joueurs différents. Conséquence voulue — un nonce rejoué par quelqu'un
-- d'autre ne peut pas produire un second spin ; il se heurte à cet index
-- (23505) au lieu de passer.
--
-- Index PARTIEL : les millions de spins sans nonce ne pèsent pas dedans, et
-- l'unicité ne s'applique qu'aux lignes qui portent une clé (`null` n'étant de
-- toute façon pas unique au sens de Postgres, le `where` est ici une économie
-- de taille, pas une correction de sémantique).
--
-- C'est aussi le chemin d'accès du rejeu : la recherche par clé ci-dessous
-- passe par cet index. Garde ET index de lecture, une seule structure.
create unique index if not exists spins_idempotency_key_idx
  on public.spins(idempotency_key)
  where idempotency_key is not null;


-- ════════════════════════════════════════════════════════════
-- 2. JOB-8 · perform_atomic_spin CONSOMME LE NONCE
-- ════════════════════════════════════════════════════════════
--
-- Corps repris à l'identique de 20260731120000:84-227 (la définition VIVANTE),
-- hors le nouveau paramètre, la recherche de rejeu et les deux `insert` qui
-- portent désormais la clé. Même remarque qu'alors, et même geste : Postgres
-- refuse deux surcharges devenues appelables avec le même nombre d'arguments
-- via un défaut (« function is not unique »), on DROP donc la 7-args avant de
-- recréer en 8-args. Les corps plpgsql appelants se relient au runtime, aucun
-- DROP en cascade.
--
-- ── OÙ SE PLACE LA RECHERCHE, ET POURQUOI C'EST LE CŒUR DU CORRECTIF ──
--
-- SOUS le verrou consultatif, et AVANT la garde `limit_reached`. Les deux
-- positions sont contraintes :
--
--   • sous le verrou (`pg_advisory_xact_lock`, sérialisé par wheel_id +
--     player_key), sinon deux requêtes concurrentes portant le même nonce
--     lisent toutes les deux « aucune ligne » et insèrent toutes les deux. La
--     course insert/rejeu est exactement celle que le verrou ferme déjà pour
--     la garde de fenêtre ;
--
--   • avant `limit_reached`, sinon le rejeu est INUTILE dans le seul cas où il
--     sert. Un spin déjà matérialisé occupe la fenêtre : le second appel
--     tomberait sur « vous avez déjà joué » au lieu de rendre le lot gagné.
--     C'est le piège de ce correctif — une clé d'idempotence posée après la
--     garde de limite transforme un rejeu en refus, et le joueur perd son lot
--     avec un message qui a l'air normal.
--
-- ── CE QUE LE REJEU NE PEUT PAS REPRODUIRE, ET POURQUOI C'EST SANS EFFET ──
--
-- Le premier appel rend, pour un tirage PERDANT, l'id du segment perdant tiré
-- (20260731120000:222-225 : « le lot perdant est retourné au serveur pour
-- restituer le bon libellé, mais n'est volontairement pas référencé par le
-- spin en base »). La base ne stocke donc pas quel segment perdant a été
-- montré : un rejeu rend `prize_id` null là où le premier appel rendait cet id.
--
-- Sans effet sur l'unique appelant qui passera un nonce — les défis
-- skill-gated (`src/actions/skill.ts`) : leur issue de perte est UNIFORME et
-- volontairement sans libellé (défense contre l'oracle de justesse), donc ils
-- ignorent `prize_id` dès que `is_losing` est vrai. La roue
-- (`src/actions/play.ts`), elle, EXIGE de retrouver le lot dans son contexte
-- public et ne tolérerait pas ce null — et elle ne passe aucun nonce (défaut
-- null), donc elle ne rejoue jamais. Cette asymétrie est la raison pour
-- laquelle le nonce reste OPTIONNEL au lieu d'être imposé à tous.
--
-- ── LA RECHERCHE EST BORNÉE AU JOUEUR, ET C'EST UNE PROPRIÉTÉ DE SÉCURITÉ ──
--
-- `wheel_id` + `player_key` + clé, jamais la clé seule. Une recherche par clé
-- seule rendrait le spin_id d'AUTRUI à qui présenterait son nonce — or ce
-- spin_id est précisément ce que le serveur signe en jeton de retrait : ce
-- serait un vol de lot en une requête. Ainsi bornée, une clé étrangère ne
-- trouve rien, puis se heurte à l'index unique : ni fuite, ni double tirage.
drop function if exists public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean);

create or replace function public.perform_atomic_spin(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_wheel_id uuid,
  p_player_key text,
  p_engagement_action text,
  p_source text,
  p_force_losing boolean default false,
  p_idempotency_key text default null
)
returns table (
  spin_id uuid,
  prize_id uuid,
  is_losing boolean,
  denial_reason text,
  next_eligible_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_limit text;
  v_timezone text;
  v_local_now timestamp;
  v_window_key text;
  v_window_start timestamptz;
  v_next timestamptz;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
  v_replay record;
begin
  if p_player_key is null or length(p_player_key) < 32 then
    raise exception 'invalid player key';
  end if;

  select w.play_limit, o.timezone into v_limit, v_timezone
  from public.wheels w
  join public.campaigns c on c.id = w.campaign_id and c.organization_id = w.organization_id
  join public.organizations o on o.id = w.organization_id
  where w.id = p_wheel_id and w.campaign_id = p_campaign_id
    and w.organization_id = p_organization_id;
  if not found then raise exception 'invalid play resource chain'; end if;

  v_local_now := pg_catalog.now() at time zone v_timezone;
  if v_limit = 'once' then
    v_window_key := 'once';
    v_window_start := 'epoch'::timestamptz;
  elsif v_limit = 'daily' then
    v_window_key := 'day:' || to_char(v_local_now, 'YYYY-MM-DD');
    v_window_start := date_trunc('day', v_local_now) at time zone v_timezone;
    v_next := (date_trunc('day', v_local_now) + interval '1 day') at time zone v_timezone;
  elsif v_limit = 'weekly' then
    v_window_key := 'week:' || to_char(v_local_now, 'IYYY-IW');
    v_window_start := date_trunc('week', v_local_now) at time zone v_timezone;
    v_next := (date_trunc('week', v_local_now) + interval '1 week') at time zone v_timezone;
  else
    v_window_key := null;
    v_window_start := null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_wheel_id::text || ':' || p_player_key, 0)
  );

  -- ── JOB-8 · REJEU IDEMPOTENT (cf. en-tête pour la position et la portée) ──
  -- L'issue rendue est celle de la LIGNE, donc identique à la première réponse
  -- pour un gain comme pour une perte forcée. `next_eligible_at` reste null :
  -- un rejeu doit être indiscernable du premier appel, pas plus bavard que lui.
  if p_idempotency_key is not null then
    select s.id, s.prize_id, s.is_losing into v_replay
    from public.spins s
    where s.idempotency_key = p_idempotency_key
      and s.wheel_id = p_wheel_id
      and s.player_key = p_player_key;
    if found then
      return query select v_replay.id, v_replay.prize_id, v_replay.is_losing,
                          null::text, null::timestamptz;
      return;
    end if;
  end if;

  if v_window_start is not null and exists (
    select 1 from public.spins s
    where s.wheel_id = p_wheel_id and s.player_key = p_player_key
      and s.created_at >= v_window_start
  ) then
    return query select null::uuid, null::uuid, false, 'limit_reached', v_next;
    return;
  end if;

  -- Chemin SKILL-GATED (échec de défi) : le backend a évalué le défi côté
  -- serveur et il a ÉCHOUÉ. On matérialise un spin PERDANT forcé qui CONSOMME
  -- la participation / play_limit (anti-brute-force : une tentative ratée
  -- compte comme un jeu — crucial pour mystery_word/estimate), SANS toucher au
  -- stock ni créer de gain. Le tirage pondéré n'a lieu que sur SUCCÈS (appel
  -- standard, p_force_losing = false). La garde limit_reached ci-dessus
  -- s'applique déjà : impossible de ré-essayer dans la même fenêtre.
  if p_force_losing then
    insert into public.spins(
      organization_id, campaign_id, wheel_id, prize_id, is_losing,
      player_key, engagement_action, source, play_window_key, idempotency_key
    ) values (
      p_organization_id, p_campaign_id, p_wheel_id, null, true,
      p_player_key, p_engagement_action,
      case when p_source = 'share' then 'share' else 'direct' end,
      v_window_key, p_idempotency_key
    ) returning id into v_spin_id;
    return query select v_spin_id, null::uuid, true, null::text, null::timestamptz;
    return;
  end if;

  loop
    -- (Correctif 42702) : alias `p.` — `is_losing` sans alias entrait en
    -- collision avec la colonne de sortie homonyme du returns table.
    select coalesce(sum(p.weight), 0)::bigint into v_total
    from public.prizes p
    where p.wheel_id = p_wheel_id and p.organization_id = p_organization_id
      and p.is_active and p.weight > 0
      and (p.is_losing or p.stock is null or p.stock > 0);
    if v_total <= 0 then
      return query select null::uuid, null::uuid, false, 'no_prize', null::timestamptz;
      return;
    end if;

    v_random := extensions.gen_random_bytes(4);
    v_pick := mod(
      (get_byte(v_random, 0)::bigint * 16777216
       + get_byte(v_random, 1)::bigint * 65536
       + get_byte(v_random, 2)::bigint * 256
       + get_byte(v_random, 3)::bigint),
      v_total
    );
    select q.* into v_prize from (
      select p.*, sum(p.weight) over(order by p.position, p.created_at, p.id) as ceiling
      from public.prizes p
      where p.wheel_id = p_wheel_id and p.organization_id = p_organization_id
        and p.is_active and p.weight > 0 and (p.is_losing or p.stock is null or p.stock > 0)
    ) q where q.ceiling > v_pick order by q.ceiling limit 1;

    if v_prize.is_losing or v_prize.stock is null then exit; end if;
    update public.prizes set stock = stock - 1
      where id = v_prize.id and stock > 0;
    if found then exit; end if;
  end loop;

  insert into public.spins(
    organization_id, campaign_id, wheel_id, prize_id, is_losing,
    player_key, engagement_action, source, play_window_key, idempotency_key
  ) values (
    p_organization_id, p_campaign_id, p_wheel_id,
    case when v_prize.is_losing then null else v_prize.id end,
    v_prize.is_losing, p_player_key, p_engagement_action,
    case when p_source = 'share' then 'share' else 'direct' end,
    v_window_key, p_idempotency_key
  ) returning id into v_spin_id;

  -- Le lot perdant est retourné au serveur pour restituer le bon libellé,
  -- mais n'est volontairement pas référencé par le spin en base.
  return query select v_spin_id, v_prize.id,
    v_prize.is_losing, null::text, null::timestamptz;
end
$$;

comment on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text) is
  'Moteur de tirage : éligibilité (play_limit + fenêtre au fuseau de l''org), '
  'tirage cryptographique pondéré, réservation de stock et insertion du spin en '
  'UNE transaction sérialisée par joueur (verrou consultatif). '
  '`p_force_losing` : échec d''un défi skill-gated — spin perdant forcé qui '
  'consomme la participation sans toucher au stock (20260731120000). '
  '`p_idempotency_key` (20260927120000) : nonce OPTIONNEL ; un second appel '
  'portant la même clé, pour le même joueur et la même roue, rend l''issue du '
  'premier sans rien écrire ni décrémenter. La recherche se fait SOUS le verrou '
  'et AVANT la garde de limite — après, le rejeu se ferait refuser en '
  '« limit_reached » et le joueur perdrait son lot. Un rejeu de PERTE rend '
  'prize_id null (la base ne stocke pas le segment perdant montré) : réservé '
  'aux appelants dont l''issue de perte est uniforme, ce qu''est le chemin '
  'skill-gated et ce que la roue n''est pas. service_role uniquement.';

revoke all on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text)
  from public, anon, authenticated;
grant execute on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text)
  to service_role;


-- ════════════════════════════════════════════════════════════
-- 3. JOU-1 · LA REPRISE D'UN GAIN NON RÉCLAMÉ
-- ════════════════════════════════════════════════════════════
--
-- Remplace la requête directe de `recoverPendingWin` (src/actions/play.ts) et
-- sa borne de 30 minutes. Rend 0 ou 1 ligne : le gain non réclamé le plus
-- récent de ce joueur sur cette roue, DANS la fenêtre de jeu courante.
--
-- ── LE PRÉDICAT A DEUX BRANCHES, ET LA SECONDE EST UN CORRECTIF À PART ──
--
-- On pourrait croire qu'il suffit de comparer `play_window_key` à la clé
-- courante. C'est faux, et l'erreur aurait été invisible : TOUS les spins ne
-- portent pas de clé de fenêtre. Les moteurs de TOUR OFFERT (fidélité,
-- calendrier, parrainage, quiz) écrivent `play_window_key = null`
-- DÉLIBÉRÉMENT — un tour offert ne doit pas consommer la fenêtre du joueur,
-- sans quoi il entrerait en collision avec `spins_one_per_window_idx` et lui
-- volerait son tour ordinaire.
--
-- Trois de ces moteurs écrivent sous une clé joueur d'un AUTRE domaine (hash
-- du jeton de module : fidélité, calendrier, quiz) — hors de portée d'une
-- reprise de roue, qui interroge la clé anonyme. Mais le PARRAINAGE, lui,
-- écrit sous `anonymousPlayerKey()` exactement (`src/actions/referral.ts:94`
-- → `consume_referral_spin_grant(p_key)` → 20260809120000:222, avec
-- `play_window_key` null). Un gain de parrainage non réclamé porte donc la
-- MÊME clé joueur que la roue et AUCUNE clé de fenêtre : un filtre par clé
-- seule l'aurait perdu, alors que la borne de 30 minutes le retrouvait. On
-- aurait fermé un trou en ouvrant un autre, et personne ne l'aurait vu avant
-- qu'un parrain ne réclame son lot.
--
-- D'où la seconde branche : clé de fenêtre ABSENTE mais `created_at` dans la
-- fenêtre courante, calculée par `v_window_start` — les mêmes expressions que
-- `perform_atomic_spin`. Elle couvre aussi, du même geste, les spins
-- historiques antérieurs à la colonne `play_window_key` (00019).
--
-- ── CE QUE CETTE BRANCHE RESSERRE, ASSUMÉ ──
--
-- Un spin sans clé de fenêtre créé il y a 20 minutes mais de l'autre côté d'une
-- frontière de fenêtre (roue `daily`, gain à 23h50, joueur qui revient à 00h10)
-- n'est plus repris, là où la borne de 30 minutes le rendait. C'est le coût
-- d'un scoping par fenêtre plutôt que par durée glissante, il est borné à cet
-- unique cas de chevauchement, et la trace du gain reste entière en base
-- (`spins.claimed = false`, et le journal du module : `resulting_spin_id` sur
-- referral_rewards). L'inverse — garder un `or created_at >= now() - 30 min` —
-- réintroduirait la durée glissante que JOU-1 supprime.
--
-- ── `unlimited` : AUCUNE BORNE, ET CE N'EST PAS UN DROIT ILLIMITÉ ──
--
-- Sans fenêtre il n'y a rien à borner : on rend le gain non réclamé le plus
-- récent, quel que soit son âge (décision propriétaire). Ce n'est pas une
-- porte ouverte, pour deux raisons qui tiennent ensemble : le stock a DÉJÀ été
-- décrémenté au tirage — le lot est engagé, le laisser expirer sans le remettre
-- fait perdre au commerçant un lot qu'il a déjà payé — et `claim_winning_spin`
-- reste seul juge de la conversion, sous verrou de ligne et refus si
-- `claimed` (20260723110000:97-99). Une reprise ne crée aucun droit : elle
-- retrouve un droit déjà acquis et jamais consommé.
--
-- ── POURQUOI ZÉRO LIGNE PLUTÔT QU'UNE EXCEPTION ──
--
-- Divergence VOLONTAIRE avec `perform_atomic_spin`, qui lève sur une clé
-- joueur malformée ou une chaîne de ressources invalide. Elle ÉCRIT : un spin
-- inattribuable y serait une corruption, l'exception est le bon geste. Celle-ci
-- LIT, sur un chemin de rattrapage : y lever une exception transformerait un
-- cookie douteux en page d'erreur pour un joueur qui a précisément un lot à
-- récupérer. Aucun de ces deux cas n'est atteignable par un client légitime
-- (`anonymousPlayerKey()` rend toujours 64 hexadécimaux, et l'appelant a résolu
-- la roue par son contexte public avant d'appeler).
--
-- Aucun index à créer : `spins_player_window_idx (wheel_id, player_key,
-- created_at desc)` (00002:20-21) sert exactement ce tri.
create or replace function public.recover_pending_spin(
  p_wheel_id uuid,
  p_player_key text
)
returns table (
  spin_id uuid,
  prize_id uuid,
  created_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_limit text;
  v_timezone text;
  v_local_now timestamp;
  v_window_key text;
  v_window_start timestamptz;
begin
  if p_player_key is null or length(p_player_key) < 32 then
    return;
  end if;

  select w.play_limit, o.timezone into v_limit, v_timezone
  from public.wheels w
  join public.organizations o on o.id = w.organization_id
  where w.id = p_wheel_id;
  if not found then return; end if;

  -- RECOPIE de perform_atomic_spin (20260731120000:126-141), volontairement à
  -- l'identique : la clé de fenêtre et son début doivent être calculés par les
  -- MÊMES expressions que celles qui les ont écrits, sinon la reprise cherche
  -- une fenêtre que le moteur n'a jamais posée. `v_next` n'est pas repris — il
  -- ne sert qu'à dire quand rejouer, ce qui n'est pas la question ici.
  v_local_now := pg_catalog.now() at time zone v_timezone;
  if v_limit = 'once' then
    v_window_key := 'once';
    v_window_start := 'epoch'::timestamptz;
  elsif v_limit = 'daily' then
    v_window_key := 'day:' || to_char(v_local_now, 'YYYY-MM-DD');
    v_window_start := date_trunc('day', v_local_now) at time zone v_timezone;
  elsif v_limit = 'weekly' then
    v_window_key := 'week:' || to_char(v_local_now, 'IYYY-IW');
    v_window_start := date_trunc('week', v_local_now) at time zone v_timezone;
  else
    v_window_key := null;
    v_window_start := null;
  end if;

  -- `prize_id is not null` est REDONDANT avec `is_losing = false` pour tout
  -- spin écrit par le moteur, et il est gardé quand même : c'est ce champ que
  -- l'appelant doit retrouver dans son contexte public pour rendre un libellé.
  -- Sans lui, une ligne aberrante ferait rendre une reprise sans lot.
  return query
    select s.id, s.prize_id, s.created_at
    from public.spins s
    where s.wheel_id = p_wheel_id
      and s.player_key = p_player_key
      and s.is_losing = false
      and s.claimed = false
      and s.prize_id is not null
      and (
        v_window_key is null
        or s.play_window_key = v_window_key
        or (s.play_window_key is null and s.created_at >= v_window_start)
      )
    order by s.created_at desc
    limit 1;
end
$$;

comment on function public.recover_pending_spin(uuid,text) is
  'Reprise d''un gain non réclamé (JOU-1, 20260927120000) : 0 ou 1 ligne — le '
  'spin gagnant `claimed = false` le plus récent de ce joueur sur cette roue, '
  'DANS la fenêtre de `play_limit` courante. Remplace la borne de 30 minutes de '
  '`recoverPendingWin`, qui faisait perdre définitivement un lot déjà décompté '
  'du stock dès que la réponse réseau se perdait un peu longtemps. La fenêtre '
  'est calculée par les MÊMES expressions que perform_atomic_spin (fuseau de '
  'l''org, semaine ISO) : ce calcul n''a AUCUN miroir TypeScript, et c''est le '
  'fond du correctif. Deux branches : clé de fenêtre égale à la clé courante, '
  'OU clé absente et created_at dans la fenêtre — cette seconde branche rattrape '
  'les tours OFFERTS, qui écrivent play_window_key null à dessein, dont le '
  'parrainage qui partage la clé joueur de la roue. `unlimited` : aucune borne, '
  'le stock étant déjà engagé et claim_winning_spin restant seul juge de la '
  'conversion. Rend zéro ligne (jamais une exception) sur clé malformée ou roue '
  'inconnue : c''est un chemin de rattrapage, pas une écriture. service_role '
  'uniquement.';

revoke all on function public.recover_pending_spin(uuid,text)
  from public, anon, authenticated;
grant execute on function public.recover_pending_spin(uuid,text) to service_role;
