-- ============================================================
-- FID-2b — LE TAMPON NE DISTRIBUE PLUS RIEN
--
-- FID-2a (20261114120000) a fait des points une MONNAIE : une visite en
-- rapporte 100, un palier en COÛTE `cost_points`, et `spend_loyalty_points`
-- débite puis émet la récompense. Ce lot-là était ADDITIF À DESSEIN —
-- `record_loyalty_stamp` continuait d'émettre au franchissement d'un seuil,
-- pour que la production ne se retrouve pas sans aucune récompense entre les
-- deux livraisons.
--
-- Les deux mécanismes ne peuvent pas cohabiter plus longtemps. Tant qu'ils
-- coexistent, un client peut RECEVOIR le café tout seul à la 2ᵉ visite ET
-- l'ACHETER avec ses 200 points : le commerçant paie deux fois le même
-- cadeau, et le prix qu'il a fixé ne veut plus rien dire. Ce lot ferme la
-- première voie. L'ÉCHANGE DEVIENT LA SEULE VOIE D'ÉMISSION.
--
-- ── CE QUI CHANGE, ET C'EST TOUT ─────────────────────────────
--
-- `record_loyalty_stamp` perd son unique bloc d'émission : la boucle qui
-- parcourait les paliers franchis, décomptait `reward_claimed_count` et
-- insérait une ligne `loyalty_rewards` (code `FIDELITE-…` ou `grant_token`).
--
-- ELLE GARDE TOUT LE RESTE, ligne pour ligne : la porte addon + statut, le
-- code tournant et sa fenêtre de deux périodes, le jeton de commande et sa
-- consommation atomique, le mode staff, le cooldown, la création du
-- passeport et `is_new_member`, l'incrément de `visit_count`, le CRÉDIT des
-- 100 points aux deux compteurs, le recalcul du niveau sur le cumul, et
-- l'insertion du tampon — donc la participation jackpot, qui pend au trigger
-- `loyalty_stamps_attach_jackpot` (20261112130000) et n'est pas touchée ici.
--
-- ── LA CLÉ `milestones_reached` RESTE, TOUJOURS VIDE ─────────
--
-- C'est un choix, pas un oubli. Trois appelants la lisent
-- (`src/lib/loyalty.ts`, `loyalty-passport.tsx`, `loyalty-staff-stamp.tsx`)
-- et tous se contentent d'un tableau vide : ils n'affichent rien. La retirer
-- du jsonb ne changerait rien pour eux — leur `Array.isArray` retombe déjà
-- sur `[]` — mais casserait le contrat pendant que l'écran d'échange se
-- livre. Elle disparaîtra quand plus aucun appelant ne la lira ; d'ici là,
-- elle dit la vérité : AUCUN palier n'est atteint par un tampon.
--
-- `next_milestone` reste aussi, inchangé et calculé sur `visit_count` :
-- l'écran s'en sert encore comme repère de progression.
--
-- ── LES CODES DÉJÀ EN CIRCULATION RESTENT VALABLES ───────────
--
-- Aucune ligne `loyalty_rewards` n'est touchée, aucune n'est expirée, et
-- `redeem_loyalty_reward` n'est pas modifiée. Un client qui a son
-- `FIDELITE-…` en poche — gagné hier au franchissement d'un seuil — le
-- présente en caisse et il est accepté, exactement comme avant. Les
-- `grant_token` de tours offerts se consomment de même par
-- `consume_loyalty_spin_grant`. On arrête d'en ÉMETTRE ; on n'annule pas ce
-- qui a été promis.
--
-- Conséquence à dire tout haut : `reward_claimed_count` ne monte plus que
-- par l'échange. Le stock d'un palier redevient donc entièrement disponible
-- pour les achats, aux exemplaires déjà émis près.
--
-- ── CE QUE CE LOT NE FAIT PAS, ET POURQUOI ───────────────────
--
-- Le trigger `loyalty_milestones_derive_cost` (20261114120000, §3) RESTE EN
-- PLACE. Il est transitoire — il dérive `cost_points` de `visit_count × 100`
-- tant que l'éditeur de programme n'écrit pas de prix — et c'est précisément
-- pour ça qu'on ne le retire pas ici : l'écran commerçant peut ne pas encore
-- savoir écrire un prix, et sans le trigger un palier créé après ce lot
-- naîtrait sans prix. Un palier sans prix, maintenant que l'échange est la
-- seule voie, est un palier INACHETABLE : la récompense disparaîtrait des
-- deux côtés à la fois. Il se retirera au lot qui bascule l'éditeur, pas
-- avant.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 0. GARDE DE FILIATION — à lire AVANT de toucher à la fonction
--
-- `record_loyalty_stamp` se réécrit en entier, parce qu'une fonction ne se
-- modifie pas par morceaux. Le corps repris ci-dessous doit donc être celui
-- de sa DERNIÈRE définition, sinon ce fichier supprime en silence le travail
-- des migrations intermédiaires — c'est arrivé le 2026-08-23 sur
-- `org_has_module_access`, et il a fallu une migration de réparation.
--
-- CETTE FONCTION A ÉTÉ RÉÉCRITE SIX FOIS, ET LA DERNIÈRE N'EST PAS CELLE
-- QU'ON CROIT : 20260725120000 (origine), puis 20260725180000, 20260725190000
-- et 20260725200000 ; puis 20260915120000 l'a DROP-ée et recréée à CINQ
-- paramètres pour le jeton de commande ; puis 20261114120000 l'a réécrite
-- pour le crédit des points. LA DÉFINITION VIVANTE EST CELLE DE
-- 20261114120000, et le corps ci-dessous en est repris VERBATIM, moins la
-- boucle d'émission.
--
-- La garde vérifie les DEUX apports qu'une mauvaise filiation effacerait
-- sans bruit :
--   · le CRÉDIT DES POINTS de 20261114120000 — sans lui, un tampon ne
--     rapporterait plus rien et la monnaie n'aurait plus de source ;
--   · le JETON DE COMMANDE de 20260915120000 — c'est exactement ce qu'une
--     mauvaise filiation aurait effacé, et rien d'autre ne le garde ici.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_src text;
begin
  select p.prosrc into strict v_src
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'record_loyalty_stamp';

  -- DÉJÀ POSÉE : rien à vérifier (motif de 20261026120000).
  if pg_catalog.strpos(v_src, 'FID-2b') > 0 then
    return;
  end if;

  -- Le crédit des points de 20261114120000. `v_points_per_visit` est la
  -- constante qui le porte, `points_earned_total` le compteur qui tient le
  -- niveau : les deux, sinon la filiation est rompue.
  if pg_catalog.strpos(v_src, 'v_points_per_visit') = 0
     or pg_catalog.strpos(v_src, 'points_earned_total') = 0
  then
    raise exception
      'record_loyalty_stamp ne porte pas le credit des points de 20261114120000 : la definition vivante n est pas celle attendue, et ce fichier en supprimerait le travail';
  end if;

  -- Le jeton de commande de 20260915120000, ses trois marqueurs.
  if pg_catalog.strpos(v_src, 'p_order_token') = 0
     or pg_catalog.strpos(v_src, 'order_invalid') = 0
     or pg_catalog.strpos(v_src, 'loyalty_order_codes') = 0
  then
    raise exception
      'record_loyalty_stamp ne porte pas le jeton de commande de 20260915120000 : la definition vivante n est pas celle attendue, et ce fichier en supprimerait le travail';
  end if;

  -- Le plancher économique de 20260725190000 : `is_new_member` a survécu au
  -- DROP de 20260915120000 parce que le corps y était repris verbatim. S'il
  -- manque, la filiation est rompue plus haut dans la chaîne.
  --
  -- (`reward_claimed_count` servait de second marqueur à 20261114120000 : il
  -- ne peut PLUS l'être ici, puisque c'est précisément ce que ce fichier
  -- retire de la fonction.)
  if pg_catalog.strpos(v_src, 'is_new_member') = 0 then
    raise exception
      'record_loyalty_stamp a perdu le drapeau is_new_member de 20260725190000 : filiation rompue, application refusee';
  end if;

  -- L'émission doit ENCORE être là au moment où on la retire. Si elle a déjà
  -- disparu, ce n'est pas ce fichier qui l'a enlevée : quelqu'un d'autre a
  -- réécrit la fonction, et on ne sait plus ce qu'on remplace.
  if pg_catalog.strpos(v_src, 'FIDELITE-') = 0 then
    raise exception
      'record_loyalty_stamp n emet deja plus de code de retrait alors que FID-2b n est pas pose : la definition vivante est inconnue, application refusee';
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 1. `record_loyalty_stamp` SANS L'ÉMISSION
--
-- Corps repris VERBATIM de 20261114120000, UN seul retrait : la boucle
-- d'attribution des paliers franchis. Les huit variables qui n'y servaient
-- qu'à elle (`v_reached`, `v_ms`, `v_alphabet`, `v_code`, `v_grant`,
-- `v_bytes`, `i`, `attempt`) partent avec elle.
--
-- L'arité ne change pas : `create or replace` suffit, et il n'y a aucune
-- surcharge à laisser derrière (piège de 20260915120000).
-- ────────────────────────────────────────────────────────────

create or replace function public.record_loyalty_stamp(
  p_program_id uuid,
  p_member_token_hash text,
  p_rotating_code text default null,
  p_validated_by uuid default null,
  p_order_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.loyalty_programs%rowtype;
  v_member public.loyalty_members%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_code_in text;
  v_counter bigint;
  v_mac bytea;
  v_off integer;
  v_bin bigint;
  v_ok boolean;
  d integer;
  v_is_new boolean := false;
  v_new_count integer;
  v_tier text;
  v_next_visit integer;
  v_next_type text;
  v_order_id uuid;
  v_by_order boolean := false;
  -- FID-2a : une visite vaut 100 points. Constante et non réglage — le prix
  -- des paliers est le seul curseur du commerçant, et deux curseurs pour un
  -- même arbitrage rendraient les conversions ×100 de cette migration fausses.
  v_points_per_visit constant integer := 100;
  v_new_balance integer;
  v_new_earned integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_member_token_hash is null or p_member_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member token';
  end if;

  -- Verrou sur le programme : fige réglages, stock des paliers et sérialise
  -- l'attribution des récompenses. Réponse 'unavailable' identique quel que
  -- soit le motif (addon coupé, brouillon, archivé) : pas d'oracle.
  select p.* into v_prog
    from public.loyalty_programs p
    join public.organizations o on o.id = p.organization_id
   where p.id = p_program_id
     and o.addon_loyalty
   for update of p;
  if not found or v_prog.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Validation selon l'entrée (AVANT toute création de passeport : une
  -- entrée refusée n'inscrit personne).
  if p_order_token is not null then
    -- QR de commande : consommation ATOMIQUE. `consumed_at is null` dans le
    -- WHERE est la clause qui interdit le second tampon — la relire avant
    -- d'y toucher, c'est elle qui tient la règle produit du §7.
    update public.loyalty_order_codes
       set consumed_at = v_now
     where token = p_order_token
       and program_id = v_prog.id
       and consumed_at is null
    returning id into v_order_id;
    if v_order_id is null then
      -- Inconnu, déjà servi, ou d'un autre programme : réponse unique.
      return pg_catalog.jsonb_build_object('state', 'order_invalid');
    end if;
    v_by_order := true;
  elsif v_prog.validation_mode = 'rotating_code' then
    v_code_in := pg_catalog.regexp_replace(coalesce(p_rotating_code, ''), '\D', '', 'g');
    if pg_catalog.length(v_code_in) <> 6 then
      return pg_catalog.jsonb_build_object('state', 'invalid_code');
    end if;
    v_counter := pg_catalog.floor(extract(epoch from v_now) / v_prog.rotating_period_seconds)::bigint;
    v_ok := false;
    -- Tolérance de DEUX fenêtres : la courante et la précédente (voir
    -- 20260725180000). La durée d'acceptation d'un code vaut donc
    -- 2 · rotating_period_seconds, bornée par le cooldown via
    -- loyalty_programs_cooldown_floor_check.
    for d in -1..0 loop
      v_mac := extensions.hmac(pg_catalog.int8send(v_counter + d), v_prog.rotating_secret, 'sha1');
      v_off := pg_catalog.get_byte(v_mac, 19) & 15;
      v_bin := ((pg_catalog.get_byte(v_mac, v_off) & 127)::bigint * 16777216)
             + (pg_catalog.get_byte(v_mac, v_off + 1)::bigint * 65536)
             + (pg_catalog.get_byte(v_mac, v_off + 2)::bigint * 256)
             + (pg_catalog.get_byte(v_mac, v_off + 3)::bigint);
      if pg_catalog.lpad((v_bin % 1000000)::text, 6, '0') = v_code_in then
        v_ok := true;
        exit;
      end if;
    end loop;
    if not v_ok then
      return pg_catalog.jsonb_build_object('state', 'invalid_code');
    end if;
  else
    -- Mode staff : l'appelant DOIT fournir l'identité du validateur
    -- (l'action backend l'a authentifié comme membre autorisé). Ferme le
    -- chemin public (p_validated_by null) sur un programme staff.
    if p_validated_by is null then
      return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;
  end if;

  -- Passeport créé à la première visite (aucune PII). FOUND immédiatement
  -- après l'INSERT distingue la CRÉATION (1 ligne affectée) du simple accès à
  -- un passeport existant (conflit → 0 ligne) : source de vérité de
  -- `is_new_member`.
  insert into public.loyalty_members (program_id, organization_id, token_hash)
  values (v_prog.id, v_prog.organization_id, p_member_token_hash)
  on conflict (program_id, token_hash) do nothing;
  v_is_new := found;

  select m.* into v_member
    from public.loyalty_members m
   where m.program_id = v_prog.id and m.token_hash = p_member_token_hash
   for update;

  -- Traçabilité du jeton de commande : le passeport vient peut-être de
  -- naître, son id n'existait pas à la consommation. Le verrou reste
  -- `consumed_at`, posé plus haut — ceci n'est qu'un lien.
  if v_by_order then
    update public.loyalty_order_codes
       set consumed_member_id = v_member.id
     where id = v_order_id;
  end if;

  -- Cooldown depuis le dernier tampon (anti-abus) — SAUF par jeton de
  -- commande : deux commandes le même jour sont deux visites légitimes, et
  -- l'usage unique du jeton tient déjà l'anti-abus (en-tête de migration).
  if not v_by_order
     and v_member.last_stamp_at is not null
     and v_prog.min_stamp_interval_seconds > 0
     and v_member.last_stamp_at
         + pg_catalog.make_interval(secs => v_prog.min_stamp_interval_seconds) > v_now then
    return pg_catalog.jsonb_build_object(
      'state', 'too_soon',
      'retry_in_seconds', pg_catalog.ceil(extract(epoch from
        v_member.last_stamp_at
        + pg_catalog.make_interval(secs => v_prog.min_stamp_interval_seconds)
        - v_now))::integer,
      'program', pg_catalog.jsonb_build_object(
        'id', v_prog.id, 'name', v_prog.name,
        'validation_mode', v_prog.validation_mode),
      'visit_count', v_member.visit_count,
      'points_balance', v_member.points_balance,
      'points_earned_total', v_member.points_earned_total,
      'is_new_member', v_is_new,
      -- FID-2a : le niveau se lit sur le CUMUL, jamais sur le solde.
      'tier', case
        when v_member.points_earned_total >= v_prog.gold_threshold then 'gold'
        when v_member.points_earned_total >= v_prog.silver_threshold then 'silver'
        else 'bronze' end,
      'tier_thresholds', pg_catalog.jsonb_build_object(
        'silver', v_prog.silver_threshold, 'gold', v_prog.gold_threshold)
    );
  end if;

  -- Visite validée : incrément des visites, CRÉDIT des points, recalcul du
  -- niveau sur le cumul, puis tampon.
  v_new_count := v_member.visit_count + 1;
  v_new_balance := v_member.points_balance + v_points_per_visit;
  v_new_earned := v_member.points_earned_total + v_points_per_visit;
  v_tier := case
    when v_new_earned >= v_prog.gold_threshold then 'gold'
    when v_new_earned >= v_prog.silver_threshold then 'silver'
    else 'bronze' end;
  update public.loyalty_members
     set visit_count = v_new_count,
         points_balance = v_new_balance,
         points_earned_total = v_new_earned,
         last_stamp_at = v_now,
         tier = v_tier
   where id = v_member.id;
  insert into public.loyalty_stamps
    (member_id, program_id, organization_id, stamped_at, mode, validated_by)
  values (v_member.id, v_prog.id, v_prog.organization_id, v_now,
          case when v_by_order then 'order_code' else v_prog.validation_mode end,
          p_validated_by);

  -- ── FID-2b : PLUS AUCUNE ÉMISSION ICI ──────────────────────
  --
  -- C'est exactement à cet endroit que 20261114120000 parcourait les paliers
  -- dont le seuil de visites venait d'être franchi, décomptait leur stock et
  -- inscrivait une récompense au passeport. Ce bloc est PARTI, et rien ne le
  -- remplace : un tampon crédite des points, il ne distribue pas de cadeau.
  -- La seule voie d'émission est désormais `spend_loyalty_points`, où le
  -- client CHOISIT ce qu'il prend et le paie.
  --
  -- Ne pas le réintroduire « pour ne pas frustrer le client » : les deux
  -- voies ensemble font payer deux fois le même cadeau au commerçant et
  -- vident de tout sens le prix qu'il a fixé. C'est la raison d'être de ce
  -- fichier — l'en-tête la détaille.
  --
  -- Le stock d'un palier n'est donc plus consommé d'ici : seul un achat le
  -- fait bouger. La garde finale de ce fichier vérifie que ce paragraphe dit
  -- vrai, en relisant le corps installé.

  -- Prochain palier (le plus proche strictement au-dessus).
  select ms.visit_count, ms.reward_type into v_next_visit, v_next_type
    from public.loyalty_milestones ms
   where ms.program_id = v_prog.id and ms.visit_count > v_new_count
   order by ms.visit_count
   limit 1;

  return pg_catalog.jsonb_build_object(
    'state', 'stamped',
    'program', pg_catalog.jsonb_build_object(
      'id', v_prog.id, 'name', v_prog.name,
      'validation_mode', v_prog.validation_mode),
    'visit_count', v_new_count,
    'points_earned', v_points_per_visit,
    'points_balance', v_new_balance,
    'points_earned_total', v_new_earned,
    'tier', v_tier,
    'tier_thresholds', pg_catalog.jsonb_build_object(
      'silver', v_prog.silver_threshold, 'gold', v_prog.gold_threshold),
    'is_new_member', v_is_new,
    'milestones_reached', '[]'::jsonb,
    'next_milestone', case when v_next_visit is null then null
      else pg_catalog.jsonb_build_object(
        'visit_count', v_next_visit, 'reward_type', v_next_type) end
  );
end;
$$;

-- L'arité est inchangée, donc `create or replace` a conservé l'ACL existante.
-- Ces deux lignes sont une CEINTURE, pas une redite : si un jour l'arité
-- change, l'ACL repart vierge (EXECUTE à PUBLIC) et c'est ici que ça se
-- referme.
revoke all on function public.record_loyalty_stamp(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_loyalty_stamp(uuid, text, text, uuid, text)
  to service_role;

comment on function public.record_loyalty_stamp(uuid, text, text, uuid, text) is
  'Pose un tampon de fidélité : valide l''entrée (code tournant, jeton de '
  'commande ou validateur staff), crée le passeport au besoin, incrémente '
  'visit_count et CRÉDITE 100 points aux deux compteurs, recalcule le niveau '
  'sur points_earned_total, puis journalise le tampon. NE DISTRIBUE AUCUNE '
  'RÉCOMPENSE depuis FID-2b : la seule voie d''émission est '
  'spend_loyalty_points. La clé milestones_reached du jsonb est conservée '
  'pour les appelants, toujours vide.';


-- ────────────────────────────────────────────────────────────
-- 2. GARDE FINALE — le retrait a-t-il vraiment pris, et rien d'autre ?
--
-- Une garde de filiation dit ce qu'on remplaçait ; celle-ci dit ce qu'on a
-- obtenu. Les deux moitiés comptent autant : « l'émission est partie » ne
-- vaut rien si le jeton de commande est parti avec.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_stamp text;
  v_spend text;
begin
  select p.prosrc into strict v_stamp
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'record_loyalty_stamp';

  -- ── Ce qui doit avoir DISPARU ──
  if pg_catalog.strpos(v_stamp, 'FIDELITE-') > 0
     or pg_catalog.strpos(v_stamp, 'loyalty_rewards') > 0
  then
    raise exception
      'record_loyalty_stamp emet encore des recompenses : le retrait de FID-2b n a pas pris';
  end if;
  if pg_catalog.strpos(v_stamp, 'reward_claimed_count') > 0 then
    raise exception
      'record_loyalty_stamp decompte encore le stock d un palier : le retrait de FID-2b est incomplet';
  end if;

  -- ── Ce qui doit être RESTÉ ──
  -- Le crédit des points : sans lui la monnaie n'a plus de source, et le
  -- passeport ne rapporte plus rien du tout.
  if pg_catalog.strpos(v_stamp, 'v_points_per_visit') = 0
     or pg_catalog.strpos(v_stamp, 'points_earned_total') = 0
  then
    raise exception
      'record_loyalty_stamp ne credite plus les points : FID-2b a emporte le travail de 20261114120000';
  end if;
  -- Le jeton de commande : la fonctionnalité qu'une mauvaise filiation aurait
  -- effacée sans bruit.
  if pg_catalog.strpos(v_stamp, 'p_order_token') = 0
     or pg_catalog.strpos(v_stamp, 'loyalty_order_codes') = 0
     or pg_catalog.strpos(v_stamp, 'order_invalid') = 0
  then
    raise exception
      'record_loyalty_stamp a perdu le jeton de commande : FID-2b a emporte le travail de 20260915120000';
  end if;
  if pg_catalog.strpos(v_stamp, 'is_new_member') = 0 then
    raise exception
      'record_loyalty_stamp a perdu is_new_member : FID-2b a emporte le travail de 20260725190000';
  end if;

  -- ── L'ÉCHANGE EST BIEN LA VOIE RESTANTE ──
  -- Retirer l'émission du tampon sans que l'échange sache émettre laisserait
  -- le passeport sans AUCUNE récompense possible.
  select p.prosrc into strict v_spend
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'spend_loyalty_points';

  if pg_catalog.strpos(v_spend, 'FIDELITE-') = 0
     or pg_catalog.strpos(v_spend, 'loyalty_rewards') = 0
  then
    raise exception
      'spend_loyalty_points n emet pas de recompense : plus aucune voie d emission n existerait apres FID-2b';
  end if;

  -- ── ACL inchangées (l'arité n'a pas bougé, mais on le prouve) ──
  if pg_catalog.has_function_privilege(
       'anon', 'public.record_loyalty_stamp(uuid, text, text, uuid, text)', 'EXECUTE')
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.record_loyalty_stamp(uuid, text, text, uuid, text)', 'EXECUTE')
  then
    raise exception
      'record_loyalty_stamp est redevenue executable par anon ou authenticated';
  end if;
  if not pg_catalog.has_function_privilege(
       'service_role', 'public.record_loyalty_stamp(uuid, text, text, uuid, text)', 'EXECUTE')
  then
    raise exception
      'record_loyalty_stamp n est plus executable par service_role : le tampon serait injouable';
  end if;

  -- ── LE TRIGGER TRANSITOIRE EST TOUJOURS LÀ ──
  -- Il n'est PAS retiré par ce lot (en-tête). Un palier créé sans prix
  -- serait inachetable, et l'échange est désormais la seule voie : sa
  -- disparition prématurée retirerait la récompense des DEUX côtés.
  if not exists (
    select 1 from pg_catalog.pg_trigger t
     where t.tgrelid = 'public.loyalty_milestones'::pg_catalog.regclass
       and t.tgname = 'loyalty_milestones_derive_cost'
       and not t.tgisinternal
  ) then
    raise exception
      'le trigger transitoire loyalty_milestones_derive_cost a disparu : un palier sans prix serait inachetable, et FID-2b vient de fermer l autre voie';
  end if;
end
$migration$;
