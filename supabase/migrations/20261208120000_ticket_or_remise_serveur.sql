-- ============================================================
-- TICKET D'OR — LA REMISE REDEVIENT UN GESTE DU SERVEUR (TKT-1)
--
-- CE QUE LA MIGRATION 20261028120000 A LAISSÉ OUVERT. Elle a donné à
-- `redeem_ticket_or` la forme de ses neuf sœurs — (organisation, code, acteur)
-- → `redeemed_now` — mais pas leur ACL : elle l'a accordée à `authenticated`
-- (`:538`) là où toutes les autres remises sont réservées à `service_role`.
--
-- POURQUOI C'EST UN TROU, et non une simple asymétrie. La fonction dérive son
-- autorisation de `p_actor`, un paramètre fourni par l'APPELANT : elle vérifie
-- que cet acteur est bien membre du commerce, jamais que l'appelant EST cet
-- acteur. `auth.uid()` n'apparaît nulle part dans le corps. Or `cashier`,
-- `editor` et `owner` sont tous des sessions `authenticated` : n'importe quelle
-- session marchande — y compris celle d'un commerce voisin — pouvait donc
-- appeler la RPC en passant l'identifiant d'un membre du commerce visé et
-- remettre ses lots. L'identifiant d'un membre n'est pas un secret.
--
-- CE QU'ON FAIT, ET CE QU'ON NE FAIT PAS. La correction de fond serait de
-- dériver l'acteur d'`auth.uid()` au lieu de le recevoir. Elle change la
-- sémantique d'une signature que la caisse universelle appelle, et ce n'est pas
-- nécessaire ici : PERSONNE n'appelle `redeem_ticket_or` depuis l'application
-- (seule occurrence dans `src/` : le type généré). Le chemin vivant du comptoir
-- passe par `redeem_reward_by_code`, en `service_role`, avec un `p_actor`
-- dérivé de la session serveur — et c'est ce routeur qui appelle la fonction
-- ci-dessous. Retirer le grant ferme donc le trou sans rien casser.
--
-- DEUX VERROUS PLUTÔT QU'UN. Le `revoke` seul suffirait ; la garde
-- `auth.role() = 'service_role'` est ajoutée au corps parce qu'une ACL est un
-- état de la base, qu'un `grant` malencontreux peut rendre à `authenticated`
-- sans que rien ne le signale. La garde, elle, voyage avec la fonction. C'est
-- exactement le dispositif de `redeem_reward_by_code`
-- (20260805150000 `:709-711` pour la garde, 20261010120000 `:1218-1221` pour
-- l'ACL), et il n'y a aucune raison que la dixième branche en ait un plus
-- faible que les neuf autres.
--
-- L'APPEL DEPUIS LE ROUTEUR RESTE VALIDE : `auth.role()` lit le GUC de la
-- requête, que `security definer` ne change pas — le routeur exigeant déjà
-- `service_role`, la garde ci-dessous est vraie quand il appelle. Et l'EXECUTE
-- interne est vérifié avec les droits du PROPRIÉTAIRE de la fonction
-- appelante, pas ceux de l'appelant : le `revoke` ne coupe pas ce chemin.
-- ============================================================

-- Corps repris à l'identique de 20261028120000 `:466-527` — seule la garde
-- d'entrée est neuve. Rien d'autre ne bouge : `for update`, `where redeemed_at
-- is null` et le `v_remis := found` sont exactement ceux que pgTAP couvre déjà
-- (CAISSE-2/3/4), et les rejouer autrement aurait été le vrai risque.
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
  -- LA REMISE EST UN GESTE DU SERVEUR, JAMAIS D'UNE SESSION DE NAVIGATEUR.
  -- `p_actor` dit QUI remet ; il ne prouve pas que l'appelant est cette
  -- personne. Seul le serveur applicatif, qui a déjà vérifié la session, a le
  -- droit de l'affirmer.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

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
  'session `service_role` a le droit d''affirmer.';

-- `create or replace` NE TOUCHE PAS L'ACL — c'est un remplacement, pas une
-- re-création. Ces ordres sont donc le cœur du correctif, pas une formalité :
-- sans eux la fonction resterait exécutable par toute session marchande.
revoke all on function public.redeem_ticket_or(uuid, text, text) from public;
revoke all on function public.redeem_ticket_or(uuid, text, text) from anon;
revoke all on function public.redeem_ticket_or(uuid, text, text) from authenticated;
grant execute on function public.redeem_ticket_or(uuid, text, text) to service_role;
