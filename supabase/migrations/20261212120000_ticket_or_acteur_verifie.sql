-- ============================================================
-- TICKET D'OR — L'ACTEUR NOMMÉ EST CONFRONTÉ À L'IDENTITÉ DE L'APPEL (TKT-2)
--
-- CE QUE 20261208120000 A FERMÉ, ET CE QU'ELLE A LAISSÉ. Elle a retiré le
-- grant `authenticated` et posé la garde `auth.role() = 'service_role'` : plus
-- aucune session de navigateur n'atteint la fonction. L'ACCÈS est fermé.
--
-- LA FAIBLESSE DE CONCEPTION, elle, est restée intacte : `redeem_ticket_or`
-- dérive son autorisation de `p_actor`, un paramètre CHOISI PAR L'APPELANT,
-- que rien ne confronte à l'identité portée par la requête. Elle vérifie que
-- cet acteur tient un comptoir du commerce ; elle ne vérifie jamais que
-- l'appelant EST cet acteur. `auth.uid()` n'apparaît nulle part dans le corps
-- d'origine (20261028120000 `:473-487`) ni dans sa reprise de 20261208120000.
--
-- ── POURQUOI ON NE DÉRIVE PAS L'ACTEUR D'`auth.uid()` TOUT COURT ──
--
-- Ce serait la correction évidente, et elle serait FAUSSE ICI. Sous
-- `service_role` — le seul appelant vivant, le routeur universel — le JWT ne
-- porte AUCUN `sub` : `auth.uid()` y vaut null. Dériver l'acteur de cette
-- valeur reviendrait à n'avoir plus d'acteur du tout, et la fonction ne
-- pourrait plus vérifier l'appartenance qui fait toute sa valeur en caisse.
--
-- Le modèle est donc celui de `redeem_reward_by_code` (20260805150000
-- `:709-711`), et il est explicite : sous `service_role`, `p_actor` est un
-- LIBELLÉ D'AUDIT que le serveur applicatif a le droit d'affirmer parce qu'il
-- a déjà vérifié la session. C'est ce contrat qu'on garde.
--
-- ── CE QU'ON AJOUTE, ET CE QUE ÇA VAUT EXACTEMENT ──
--
-- Une seule règle : SI l'appel porte une identité (`auth.uid()` non nul),
-- ALORS cette identité doit être celle que `p_actor` nomme. Un appel sans
-- identité (le serveur) garde le contrat de libellé d'audit ; un appel
-- porteur d'identité ne peut plus en nommer une autre.
--
-- HONNÊTETÉ SUR LA PORTÉE, parce qu'une défense qu'on croit active alors
-- qu'elle dort est pire qu'aucune défense. Aujourd'hui cette règle ne se
-- déclenche JAMAIS en production : la garde `service_role` du dessus refuse
-- déjà toute session `authenticated`, et un JWT `service_role` ne porte pas de
-- `sub`. Sa valeur est entièrement dans le FUTUR — le jour où quelqu'un
-- relâche la garde de rôle pour laisser la caisse appeler directement, ou
-- rétablit un grant, la primitive reste juste SANS qu'il ait à y penser. Les
-- neuf sœurs n'ont pas cette propriété ; celle-ci l'a.
--
-- LA SIGNATURE NE BOUGE PAS. Le routeur universel appelle
-- `redeem_ticket_or(uuid, text, text)` et continuera de le faire : `create or
-- replace`, aucun `drop`, aucune ACL touchée (celle de 20261208120000 reste en
-- vigueur — les ordres sont réaffirmés en fin de fichier par principe).
-- ============================================================

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
  -- Lue UNE fois : `auth.uid()` est `stable`, mais la lire deux fois inviterait
  -- à croire qu'elle peut changer entre les deux gardes.
  v_jwt_actor uuid;
  v_remis boolean;
begin
  -- LA REMISE EST UN GESTE DU SERVEUR, JAMAIS D'UNE SESSION DE NAVIGATEUR.
  -- `p_actor` dit QUI remet ; il ne prouve pas que l'appelant est cette
  -- personne. Seul le serveur applicatif, qui a déjà vérifié la session, a le
  -- droit de l'affirmer. (20261208120000)
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_actor is null or pg_catalog.length(p_actor) = 0 then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_actor := p_actor::uuid;

  -- ── L'ACTEUR NOMMÉ EST CONFRONTÉ À L'IDENTITÉ DE L'APPEL (TKT-2) ──
  --
  -- La règle, et rien de plus : un appel qui PORTE une identité ne peut pas en
  -- nommer une autre. Un appel qui n'en porte pas — le routeur en
  -- `service_role`, dont le JWT n'a pas de `sub` — conserve `p_actor` comme
  -- libellé d'audit, exactement comme `redeem_reward_by_code`.
  --
  -- Écrit dans ce sens (`is not null and <>`) et non « uid = actor » : la
  -- seconde forme exigerait un `sub` que le seul appelant vivant n'a pas, et
  -- fermerait la caisse au lieu de la protéger.
  v_jwt_actor := auth.uid();
  if v_jwt_actor is not null and v_jwt_actor <> v_actor then
    raise exception 'not authorized' using errcode = '42501';
  end if;

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
  'historique, le registre EST sa source. RÉSERVÉE AU SERVEUR depuis '
  '20261208120000 : l''autorisation se dérive de `p_actor`, que seule une '
  'session `service_role` a le droit d''affirmer. Depuis 20261212120000 '
  '(TKT-2), ce libellé d''audit est CONFRONTÉ à l''identité de l''appel : si '
  '`auth.uid()` est non nul, il doit valoir `p_actor`. Défense en profondeur — '
  'inerte tant que la garde de rôle tient, juste si elle tombe.';

-- L'ACL survit à un `create or replace` ; ces ordres la réaffirment parce
-- qu'une garantie qui repose sur « ça n'a pas dû changer » n'en est pas une.
-- Identiques à 20261208120000. pgTAP les vérifie (security_acl).
revoke all on function public.redeem_ticket_or(uuid, text, text) from public;
revoke all on function public.redeem_ticket_or(uuid, text, text) from anon;
revoke all on function public.redeem_ticket_or(uuid, text, text) from authenticated;
grant execute on function public.redeem_ticket_or(uuid, text, text) to service_role;
