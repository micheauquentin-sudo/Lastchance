-- ============================================================
-- Lastchance — le portefeuille du client
-- ============================================================
--
-- Catalogue vivant vérifié : `player_wallet` n'existe nulle part
-- (`grep -l "function public.player_wallet"` → 0 fichier). Création pure.
-- `sync_reward_issuance` n'est PAS redéfinie ici — elle est seulement
-- RAPPELÉE, et son unique définition vit bien dans 20260805150000
-- (vérifié : `grep -l` rend un seul fichier).
--
--
-- ── 1. AUCUN JETON DANS L'URL ───────────────────────────────
--
-- La page se lit depuis le cookie `lc-player` du téléphone qui a scanné, via
-- `peekPlayerDeviceTokenHash()` — qui LIT le cookie sans jamais le poser. La
-- RPC reçoit donc un `token_hash` sha256, jamais un identifiant devinable.
--
-- Un lien partageable serait une fuite, et pas une petite : il listerait des
-- CODES DE RETRAIT, c'est-à-dire des droits au porteur. Transféré, capturé
-- dans un historique de navigation ou un journal de proxy, il donne à un tiers
-- de quoi se présenter en caisse. C'est pourquoi rien ici n'accepte
-- d'identifiant de joueur : le seul point d'entrée est le hash du cookie.
--
--
-- ── 2. LE CODE EST UN SECRET PORTEUR ────────────────────────
--
-- La RPC REND le code — le client en a besoin, c'est la fonctionnalité. Mais
-- il ne doit JAMAIS être journalisé : ni Sentry, ni journal applicatif, ni
-- `ops_metrics`, ni analytique. C'est écrit dans le commentaire de la
-- fonction pour que l'interdiction voyage avec elle, et non dans une note
-- que personne ne relira.
--
--
-- ── 3. QUI PEUT APPELER, ET POURQUOI ────────────────────────
--
-- `service_role` SEUL. La page est publique, mais l'appel se fait côté
-- serveur : c'est ce qui garde la surface à UNE route contrôlée.
--
-- Ouvrir la fonction à `anon` la publierait sur PostgREST, donc à l'Internet.
-- L'argument « le hash est imprévisible » est vrai mais insuffisant : il
-- ferait du `token_hash` un mot de passe transmis en clair par tout client
-- capable d'appeler l'API, et poserait les codes de retrait sur une surface
-- publique où rien n'applique de limitation de débit applicative.
--
-- ADR-049 : `revoke … from public, anon` NE RETIRE PAS `service_role`, mais
-- ne retire pas non plus `authenticated` — Supabase les redonne tous par
-- `alter default privileges`. Les trois sont donc révoqués EXPLICITEMENT
-- ci-dessous, et seul `service_role` est réaccordé.
--
-- `authenticated` est révoqué délibérément : un commerçant connecté n'a
-- aucune raison de lire le portefeuille d'un joueur — ce serait une
-- corrélation inter-organisations, exactement ce que les tables de pont
-- interdisent déjà en étant service-role-only.
-- ============================================================

-- ── 1. Le rattrapage, qui décide de l'utilité du reste ──────
--
-- `reward_issuances.player_id` n'est rempli QUE si le pont
-- `player_legacy_identities` existait À L'INSTANT DE L'ÉMISSION :
-- `reward_player_from_legacy` (20260805150000:148) est `stable` et ne fait que
-- LIRE le pont — l'absence de pont laisse `player_id` à null, définitivement.
--
-- Tout lot gagné avant que le joueur ne soit ponté porte donc `null`, et le
-- portefeuille serait VIDE pour ces clients — c'est-à-dire inutile pour
-- exactement les clients les plus anciens, ceux qui ont le plus de gains.
--
-- ── Pourquoi rejouer la synchro plutôt qu'un UPDATE ciblé ──
--
-- Un `update … set player_id = …` demanderait de réécrire, pour chacune des
-- dix familles, le triplet (experience_kind, experience_id, hash d'identité)
-- à interroger : `participations` passe `p.player_key`, `hunt_completions`
-- passe `hp.token_hash` par une jointure, etc. C'est très exactement la
-- SECONDE SOURCE DE VÉRITÉ que le registre existe pour supprimer, et que
-- 20260807120000 refuse déjà pour la même raison.
--
-- On rejoue donc `sync_reward_issuance`, dont l'`on conflict` porte
-- `player_id = coalesce(excluded.player_id, reward_issuances.player_id)` :
-- il REMPLIT un null si le pont existe aujourd'hui, et n'ÉCRASE jamais une
-- valeur déjà résolue. L'opération est donc idempotente et non destructive.
--
-- Vérifié avant d'écrire, parce que c'était le vrai risque de ce geste : le
-- rejeu ne détruit PAS les libellés gravés. Depuis 20260814120000 la clause
-- porte `label = case when reward_issuances.label = '' then excluded.label
-- else reward_issuances.label end` — un lot déjà émis garde le nom sous
-- lequel le client l'a gagné, même si le commerçant a renommé sa récompense
-- entre-temps. Sans cette vérification, ce rattrapage aurait réécrit tous les
-- libellés à leur valeur du jour et annulé le correctif du 2026-07-31.
--
-- ── Pourquoi on pilote depuis le REGISTRE, et pas depuis les
--    dix tables legacy comme 20260807120000 ──
--
-- 20260807120000 devait CRÉER les lignes manquantes : il lui fallait donc
-- balayer les sources. Ici les lignes existent déjà — seule une colonne est
-- creuse. Piloter depuis `reward_issuances where player_id is null` est
-- strictement plus étroit (on ne touche pas aux lignes déjà résolues, qui
-- sont la majorité) et évite au passage le piège `42703` qui a coûté une
-- migration entière à 20260807120000 : aucun nom de colonne n'est construit
-- dynamiquement ici, donc aucune colonne de code non uniforme
-- (`participations.redeem_code` contre `code` pour les neuf autres) ne peut
-- faire échouer le curseur.
--
-- Le nom de table vient de `metadata->>'legacy_table'`, que
-- `sync_reward_issuance` écrit sur chaque ligne — c'est lui qui distingue
-- `calendar_openings` de `calendar_rewards`, les deux tables qui partagent
-- `source_type = 'calendar'`.
--
-- ⚠️ Cette valeur est une DONNÉE : elle n'est jamais interpolée dans du SQL.
-- Elle est validée contre une liste blanche explicite AVANT d'être passée en
-- PARAMÈTRE à `sync_reward_issuance`, qui la compare par égalité (`if
-- p_legacy_table = 'participations'`) sans SQL dynamique. Une valeur
-- inattendue est comptée et sautée, jamais exécutée.
--
-- Limite assumée et signalée : une ligne legacy qui n'aurait AUCUN miroir
-- (échec individuel du backfill de 20260807120000, compté puis sauté) reste
-- invisible d'ici. C'est un écart antérieur, distinct de celui-ci, et qui se
-- solderait en rejouant 20260807120000 — pas en élargissant cette migration.
do $$
declare
  v_allow constant text[] := array[
    'participations', 'hunt_completions', 'loyalty_rewards', 'jackpot_wins',
    'event_wins', 'calendar_openings', 'calendar_rewards', 'referral_rewards',
    'quiz_rewards', 'contest_awards'
  ];
  r record;
  v_done int := 0;
  v_resolved int := 0;
  v_skipped int := 0;
  v_failed int := 0;
  v_before int;
  v_after int;
  v_total int;
begin
  select count(*) into v_before
    from public.reward_issuances where player_id is not null;
  select count(*) into v_total from public.reward_issuances;

  for r in
    select ri.id, ri.metadata ->> 'legacy_table' as legacy_table, ri.source_id
      from public.reward_issuances ri
     where ri.player_id is null
     order by ri.id
  loop
    if r.legacy_table is null or not (r.legacy_table = any(v_allow)) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    begin
      -- Chaque ligne est isolée : une source incohérente (organisation
      -- supprimée, joueur irrésoluble) est comptée et sautée, elle n'annule
      -- pas le rattrapage des autres.
      perform public.sync_reward_issuance(r.legacy_table, r.source_id);
      v_done := v_done + 1;
    exception when others then
      v_failed := v_failed + 1;
    end;
  end loop;

  select count(*) into v_after
    from public.reward_issuances where player_id is not null;
  v_resolved := v_after - v_before;

  raise notice 'portefeuille — rattrapage player_id : % ligne(s) rejouée(s), % nouvellement résolue(s), % sautée(s), % en échec',
    v_done, v_resolved, v_skipped, v_failed;
  raise notice 'portefeuille — couverture player_id : % / % ligne(s) (avant : %)',
    v_after, v_total, v_before;
end;
$$;

-- ── 2. La lecture ───────────────────────────────────────────
create or replace function public.player_wallet(
  p_token_hash text,
  p_limit integer default 50
)
returns table (
  organization_id uuid,
  organization_name text,
  source_type text,
  label text,
  code text,
  status text,
  issued_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_limit integer;
begin
  -- Forme du hash contrôlée AVANT toute lecture : un paramètre malformé est
  -- une absence de résultat, jamais une erreur qui distinguerait « hash
  -- inconnu » de « hash mal formé ».
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  -- Bornage du volume : un portefeuille est une page, pas un export.
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 200);

  -- Prédicat de validité d'appareil, en DEUX moitiés :
  --   • l'appareil n'est pas révoqué (ou l'est mais reste en grâce, le temps
  --     qu'une rotation de jeton s'achève) ;
  --   • ET LE JOUEUR EST ACTIF.
  --
  -- ⚠️ CE COMMENTAIRE A DÉJÀ MENTI, et c'est pour cela qu'il dit maintenant le
  -- prédicat en entier plutôt que d'en citer une ligne. Il annonçait un
  -- prédicat « repris à l'identique de 20260805140000:711 » alors que cette
  -- ligne-là n'est que la clause `revoked_at` : elle appartient à une requête
  -- dont la jointure porte `p.status = 'active'` SEIZE LIGNES PLUS HAUT
  -- (`:693-695`). Citer par numéro de ligne avait isolé la moitié du prédicat,
  -- et la moitié manquante était la garde de blocage.
  --
  -- Les sept autres chemins qui résolvent un appareil vers des données de
  -- joueur vérifient bien le statut — 20260805140000:693-695,
  -- 20260805200000:1149-1151 et :1335-1337, 20260805210000:452-454 et
  -- :797-799, 20260805220000:436-438, :629-631 et :814-816. Celui-ci était le
  -- seul à ne pas le faire, et c'est celui qui sert des CODES DE RETRAIT
  -- ENCAISSABLES : un joueur bloqué y aurait lu des droits au porteur qu'un
  -- commerçant lui a précisément retirés.
  select d.player_id into v_player_id
    from public.player_devices d
    join public.players p
      on p.id = d.player_id
     and p.status = 'active'
   where d.token_hash = p_token_hash
     and (d.revoked_at is null or d.grace_expires_at > pg_catalog.now())
   limit 1;

  if v_player_id is null then
    return;
  end if;

  return query
  select
    r.organization_id,
    o.name,
    r.source_type,
    -- Libellé GRAVÉ (20260814120000) : ce que le client a gagné, et non ce
    -- que la récompense s'appelle aujourd'hui. Lire la table parente ferait
    -- afficher « Croissant offert » sur un lot gagné comme « Café offert ».
    r.label,
    r.code,
    -- États mutuellement exclusifs, dans l'ordre où ils priment. `redeemed`
    -- et `cancelled` sont déjà exclusifs par contrainte
    -- (`reward_issuances_terminal_state`) ; l'expiration ne s'évalue qu'en
    -- l'absence des deux — un lot retiré avant sa date reste « retiré », et
    -- l'afficher « expiré » ferait croire à un droit perdu.
    case
      when r.redeemed_at is not null then 'redeemed'
      when r.cancelled_at is not null then 'cancelled'
      when r.expires_at is not null and r.expires_at <= pg_catalog.now() then 'expired'
      else 'active'
    end as status,
    r.issued_at,
    r.expires_at
    from public.reward_issuances r
    join public.organizations o on o.id = r.organization_id
   where r.player_id = v_player_id
     and r.code is not null
   -- Groupé par organisation : le client lit « chez qui », puis « quoi ». Le
   -- tri porte le regroupement, l'appelant n'a qu'à découper sur le nom.
   order by o.name, r.issued_at desc
   limit v_limit;
end;
$$;

comment on function public.player_wallet(text, integer) is
  'Portefeuille d''un joueur : ses récompenses des neuf familles, groupées par organisation (tri nom puis date), avec le libellé GRAVÉ, l''échéance et l''état (active/redeemed/cancelled/expired). Entrée = le sha256 du cookie lc-player, jamais un identifiant de joueur : aucun jeton ne doit circuler en URL, un lien partageable listant des codes serait une fuite. LE CODE DE RETRAIT EST UN SECRET PORTEUR : il est rendu parce que le client en a besoin, mais ne doit JAMAIS être journalisé — ni Sentry, ni journal applicatif, ni ops_metrics, ni analytique. Appareil révoqué hors grâce = zéro ligne, joueur bloqué = zéro ligne. service_role uniquement : la page est publique, l''appel est serveur.';

-- ADR-049 : les trois rôles sont révoqués explicitement. `revoke … from
-- public, anon` seul laisserait `authenticated` ET `service_role` en place,
-- réaccordés par l'`alter default privileges` que Supabase pose à
-- l'initialisation du projet.
revoke all on function public.player_wallet(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.player_wallet(text, integer) to service_role;
