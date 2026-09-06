-- ============================================================
-- LE MOTEUR DE TIRAGE LIT ENFIN L'ÉTAT DE LA CAMPAGNE
--
-- `perform_atomic_spin` ne lisait NI `campaigns.status`, NI `starts_at`, NI
-- `ends_at`. Sa seule lecture de `campaigns` était la garde de chaîne de
-- ressources (« cette roue appartient-elle bien à cette campagne, elle-même à
-- cette organisation ? ») : une jointure d'APPARTENANCE, jamais d'ÉTAT.
--
-- Le statut et la fenêtre étaient donc tranchés dans un SEUL endroit, et cet
-- endroit est l'application : `src/lib/play-context.ts` (cascade de refus,
-- `status !== 'active'` puis `campaignWindowState`), appelée en tête de
-- `src/actions/play.ts`.
--
--
-- ── LA FENÊTRE RÉELLE, CALIBRÉE HONNÊTEMENT ──────────────────
--
-- Entre ce verdict applicatif et l'appel de la RPC il reste, dans l'ordre :
-- la vérification Turnstile, un compteur de pression IP, puis deux seaux de
-- limitation sur l'identité joueur — soit trois à quatre allers-retours
-- SERVEUR. La fenêtre de course est de cet ordre : une centaine de
-- millisecondes, quelques secondes au pire d'un seau lent.
--
-- Ce N'EST PAS la durée du défi anti-robot joué par l'humain : le jeton
-- Turnstile est obtenu CÔTÉ CLIENT, avant même que la server action ne
-- démarre ; `verifyTurnstile` ne fait que le valider auprès de Cloudflare.
-- Personne ne reste « quinze secondes dans la porte ».
--
-- C'est donc de la DÉFENSE EN PROFONDEUR sur une course étroite, pas la
-- fermeture d'une porte grande ouverte : un commerçant qui met sa campagne en
-- pause pendant qu'un joueur traverse ces quatre appels voyait, jusqu'ici, ce
-- tirage-là aboutir — un lot de plus distribué, décompté du stock et du budget,
-- après le geste d'arrêt. Un seul, et seulement pour les parties déjà en vol.
-- Le geste vaut quand même d'être respecté à l'instant du tirage : c'est le
-- seul endroit où le lot est réellement engagé.
--
--
-- ── CE QUI N'EST DÉLIBÉRÉMENT PAS RECOPIÉ ICI ────────────────
--
-- L'ÉTAT D'ABONNEMENT. `hasActiveAccess` combine `subscription_status`,
-- `trial_ends_at`, `past_due_since`, l'accès offert et les droits par module.
-- Le transcrire en SQL créerait une SECONDE source de vérité sur un prédicat
-- vivant, qui bouge à chaque évolution de la grille tarifaire — exactement la
-- dette que `access_parity.test.sql` surveille déjà ailleurs sans pouvoir
-- l'empêcher. Statut et dates, eux, sont trois colonnes stables, et ils
-- portent le geste que le commerçant déclenche lui-même (« mettre en pause »,
-- « programmer une fin »).
--
-- UN `for update` SUR LA CAMPAGNE. Un verrou de ligne sur `campaigns`
-- sérialiserait TOUS les joueurs d'une même campagne les uns derrière les
-- autres, alors que le verrou consultatif actuel ne sérialise qu'un joueur avec
-- lui-même (`wheel_id` + `player_key`). On échangerait une course de quelques
-- centaines de millisecondes contre une file d'attente sur le chemin le plus
-- chaud du produit. Une simple lecture dans la MÊME transaction que l'écriture
-- suffit à fermer la course décrite : la pause committée avant ce `select` est
-- vue, celle committée après ne l'est pas — et dans ce second cas le tirage
-- avait de toute façon commencé avant le geste.
--
--
-- ── LA FORME DU REFUS : UNE LIGNE, PAS UNE EXCEPTION ─────────
--
-- La fonction refuse déjà de deux façons, et elles ne sont pas
-- interchangeables. Elle LÈVE (`invalid player key`, `invalid play resource
-- chain`) sur ce qui ne peut pas arriver à un appelant légitime : une clé
-- malformée ou une chaîne roue → campagne → organisation incohérente sont des
-- corruptions, pas des issues de jeu. Elle REND UNE LIGNE portant
-- `denial_reason` (`limit_reached`, `no_prize`) sur ce qui est une issue de jeu
-- ordinaire, que l'appelant doit traduire en message.
--
-- Une campagne en pause est de la seconde espèce : c'est un état normal, voulu
-- par le commerçant. Le refus prend donc la MÊME forme que les deux autres —
-- `spin_id` null, `denial_reason` renseigné — et surtout PAS une exception, qui
-- serait remontée en « Une erreur est survenue » par les deux appelants.
--
-- CE QUE LES DEUX APPELANTS EN FONT AUJOURD'HUI, vérifié et assumé :
-- `src/actions/play.ts:280` et `src/actions/skill.ts:342` ne connaissent que
-- `limit_reached` et retombent, pour tout autre motif, sur « Plus aucun lot
-- disponible pour le moment. » Ni écran cassé, ni message vide — un message
-- IMPRÉCIS dans un cas rare, ce qui est le bon compromis pour une garde de
-- dernier recours : le message JUSTE (« Cette campagne n'est pas active »)
-- reste rendu par `play-context.ts` sur le chemin normal, qui couvre tous les
-- cas sauf la course. Le motif est néanmoins DISTINCT de `no_prize` et non
-- fondu dedans : c'est ce qui permet de distinguer « rupture de stock » de
-- « campagne fermée » en base, dans les tests et dans une future traduction
-- côté appelant. Confondre les deux rendrait le test de ce fichier incapable
-- de prouver quoi que ce soit.
--
--
-- ── OÙ LA GARDE SE PLACE, ET POURQUOI PAS PLUS HAUT ──────────
--
-- APRÈS le rejeu idempotent (JOB-8, 20260927120000), et c'est le seul piège de
-- ce correctif. Un rejeu rend l'issue d'un spin DÉJÀ matérialisé : le stock est
-- déjà décrémenté, le gain déjà acquis, le lot déjà engagé. Refuser ce
-- rejeu-là parce que la campagne s'est fermée entre-temps ferait perdre au
-- joueur un lot qu'il a gagné pendant qu'elle était ouverte — la fermeture
-- n'annule pas rétroactivement un tirage passé. C'est la même erreur, à un
-- étage près, que celle décrite dans l'en-tête de JOB-8 pour `limit_reached`.
--
-- La garde vit donc SOUS le verrou consultatif (le rejeu en a besoin), ce qui
-- coûte la prise d'un verrou avant un refus. Négligeable : un verrou
-- consultatif transactionnel est un compteur en mémoire partagée, relâché au
-- `commit`, et ce chemin est par construction rare.
--
-- AVANT `limit_reached`, en revanche, et là c'est le message qui décide : à un
-- joueur d'une campagne terminée, « Vous avez déjà joué aujourd'hui, revenez
-- demain ! » est un mensonge — il n'y aura pas de demain sur cette campagne.
-- Cet ordre reproduit aussi celui de la cascade applicative, où le statut et la
-- fenêtre sont tranchés avant toute considération de limite de jeu.
--
--
-- ── LE PRÉDICAT DE FENÊTRE EST LE MIROIR DE `campaignWindowState` ──
--
-- `src/lib/campaign-window.ts` : `scheduled` si `starts_at > now`, `ended` si
-- `ends_at < now`, `open` sinon — bornes NULL comprises comme « pas de borne ».
-- Les comparaisons sont strictes des deux côtés, comme en TypeScript. Les deux
-- états sont fondus en un seul motif ici : l'appelant ne les distingue pas, et
-- deux motifs pour un même message auraient créé une différence que personne
-- ne lit.
--
-- Cette recopie est assumée et bornée à trois comparaisons de dates, là où
-- l'abonnement était refusé plus haut : ce sont des colonnes, pas un prédicat
-- métier composé. Le test `tirage_campagne_fermee.test.sql` éprouve le
-- COMPORTEMENT (aucun spin, aucun stock consommé), pas le texte du corps —
-- une réécriture équivalente reste verte, une régression rougit.
-- ============================================================

-- Signature INCHANGÉE (8 arguments) : aucun `drop` n'est nécessaire, et le
-- `create or replace` conserve propriétaire et ACL. Les `revoke`/`grant` sont
-- néanmoins réémis en fin de fichier, comme le fait chaque redéfinition de
-- cette fonction depuis 00019 — la garde `security_acl.test.sql` lit l'état
-- réel, pas l'intention.
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
  v_status text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
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

  -- La campagne était DÉJÀ jointe ici, pour son appartenance à l'organisation.
  -- On lui demande maintenant aussi son état : trois colonnes de plus dans le
  -- `select ... into` EXISTANT, aucune requête supplémentaire, aucun
  -- aller-retour de plus sur le chemin le plus chaud du produit.
  select w.play_limit, o.timezone, c.status, c.starts_at, c.ends_at
    into v_limit, v_timezone, v_status, v_starts_at, v_ends_at
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

  -- ── L'ÉTAT DE LA CAMPAGNE, LU À L'INSTANT DU TIRAGE (cf. en-tête) ──
  -- Sous le verrou parce que le rejeu ci-dessus en a besoin et doit passer en
  -- premier ; avant `limit_reached` parce qu'« revenez demain » est faux sur une
  -- campagne terminée. Miroir de `campaignWindowState` : bornes nulles = pas de
  -- borne, comparaisons strictes.
  if v_status is distinct from 'active'
     or (v_starts_at is not null and v_starts_at > pg_catalog.now())
     or (v_ends_at is not null and v_ends_at < pg_catalog.now()) then
    return query select null::uuid, null::uuid, false,
                        'campaign_closed', null::timestamptz;
    return;
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
  --
  -- La garde de campagne le précède désormais aussi, et c'est voulu : sur une
  -- campagne fermée il n'y a plus rien à brute-forcer, donc plus aucune raison
  -- de consommer la participation du joueur pour un défi qui ne peut plus rien
  -- lui rapporter.
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

    -- LA RÉSERVATION QUI DÉCIDE DE TOUT — éprouvée par
    -- `tirage_stock_dernier_lot.test.sql` (20261210120000), qui force le second
    -- passage de cette boucle au lieu de se contenter de relire ce texte. Le
    -- `and stock > 0` n'est pas une ceinture : le `select` ci-dessus a lu un
    -- instantané, et entre les deux une autre transaction a pu prendre le
    -- dernier exemplaire. Si la ligne a été prise, `found` est faux et on
    -- RE-TIRE — sans quoi le dernier lot partirait deux fois.
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
  'Moteur de tirage : état de la campagne, éligibilité (play_limit + fenêtre au '
  'fuseau de l''org), tirage cryptographique pondéré, réservation de stock et '
  'insertion du spin en UNE transaction sérialisée par joueur (verrou '
  'consultatif). '
  '`p_force_losing` : échec d''un défi skill-gated — spin perdant forcé qui '
  'consomme la participation sans toucher au stock (20260731120000). '
  '`p_idempotency_key` (20260927120000) : nonce OPTIONNEL ; un second appel '
  'portant la même clé, pour le même joueur et la même roue, rend l''issue du '
  'premier sans rien écrire ni décrémenter. La recherche se fait SOUS le verrou '
  'et AVANT la garde de limite — après, le rejeu se ferait refuser en '
  '« limit_reached » et le joueur perdrait son lot. Un rejeu de PERTE rend '
  'prize_id null (la base ne stocke pas le segment perdant montré) : réservé '
  'aux appelants dont l''issue de perte est uniforme, ce qu''est le chemin '
  'skill-gated et ce que la roue n''est pas. '
  'Motif `campaign_closed` (20261210120000) : statut différent d''`active` ou '
  'instant hors de [starts_at, ends_at], LU À L''INSTANT DU TIRAGE. Défense en '
  'profondeur — le chemin normal refuse déjà, avec un message précis, dans '
  'play-context.ts ; cette garde ne rattrape que les parties déjà en vol au '
  'moment de la mise en pause (trois à quatre allers-retours serveur). Placée '
  'APRÈS le rejeu idempotent : une campagne fermée n''annule pas un tirage '
  'déjà matérialisé. L''état d''ABONNEMENT n''est volontairement pas recopié '
  'ici (hasActiveAccess reste seul juge). service_role uniquement.';

revoke all on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text)
  from public, anon, authenticated;
grant execute on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text)
  to service_role;
