-- ============================================================
-- P0 lot 4 (suite) — UN OCTROI ACHETÉ PEUT ENFIN DÉMARRER
--
-- Suite de 20260908120000, qui a livré l'octroi PAR PAIEMENT. Ce lot-là posait
-- délibérément `starts_at = null` pour les achats uniques : « l'octroi est
-- acheté, pas démarré », sans quoi les trente jours payés s'écouleraient
-- pendant que le commerçant rédige ses lots.
--
-- IL MANQUAIT LE GESTE INVERSE. Aucune RPC, aucun trigger, aucune action ne
-- faisait sortir un octroi de l'état `pending` — seul le back-office pouvait
-- poser `starts_at`, à la main. Cinq add-ons sur six encaissaient donc sans
-- rien ouvrir : le commerçant payait 29 EUR pour une Chasse au trésor et
-- `chargerOctroisVivants` continuait de l'exclure (`starts_at is null`).
--
-- ── POURQUOI LES DATES ARRIVENT D'EN HAUT ET NE SONT PAS CALCULÉES ICI ──
--
-- Même partage que `grant_module_from_payment` : les durées vivent dans le
-- catalogue TypeScript (`src/lib/plans.ts`), et « 30 jours », « 7 jours »,
-- « 7 jours de préparation puis 24 heures » ne se recopient pas en SQL sans
-- créer une seconde source qui divergera au premier changement de tarif.
--
-- La contrepartie est que cette fonction ne peut PAS faire confiance aux dates
-- qu'elle reçoit — d'où la porte `service_role`, identique à celle de
-- `grant_module_from_payment` : seul un chemin serveur, après
-- `requireOrganizationOwner`, les calcule. Aucun rôle applicatif ne peut
-- l'appeler, donc personne ne peut se poser une fin dans dix ans.
--
-- ── CE QUE LE TRIGGER DE GEL FAIT DÉJÀ, ET QU'ON NE REFAIT PAS ──
--
-- `freeze_module_grant_terms` (lot 2) refuse `starts_at` valeur → autre valeur
-- tout en laissant passer null → valeur. La double activation est donc
-- impossible **en base**, indépendamment de cette fonction. On rend malgré tout
-- un verdict plutôt que de laisser remonter l'exception : l'appelant est un
-- écran, et « ce pass a déjà démarré » n'est pas une panne.
-- ============================================================

create or replace function public.activate_module_grant(
  p_organization_id uuid,
  p_grant_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_now timestamptz default pg_catalog.now()
)
returns table (activated boolean, state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant public.organization_module_grants%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'activate_module_grant: service_role requis'
      using errcode = '42501';
  end if;

  -- LE CLOISONNEMENT EST DANS LE `where`, PAS DANS UNE VÉRIFICATION APRÈS
  -- COUP. Charger par le seul `p_grant_id` puis comparer l'organisation
  -- laisserait la fonction lire la ligne d'un autre commerçant avant de
  -- refuser ; ici, un identifiant d'octroi volé ne DÉSIGNE simplement rien.
  select * into v_grant
    from public.organization_module_grants g
   where g.id = p_grant_id
     and g.organization_id = p_organization_id;

  if not found then
    return query select false, 'introuvable'::text;
    return;
  end if;

  if v_grant.revoked_at is not null then
    return query select false, 'revoked'::text;
    return;
  end if;

  -- DÉJÀ DÉMARRÉ : pas une erreur. Un double clic, un retour arrière ou un
  -- rejeu de formulaire doivent rendre le même verdict que le premier appel,
  -- et surtout ne pas redater la fenêtre — ce que le trigger de gel refuserait
  -- de toute façon, mais par une exception que l'écran ne saurait pas dire.
  if v_grant.starts_at is not null then
    return query select false, 'deja_demarre'::text;
    return;
  end if;

  -- LA FENÊTRE D'ACTIVATION EST UNE PROMESSE COMMERCIALE, DONC UNE GARDE.
  -- « Activable dans les 90 jours » (30 pour la Soirée en jeu) : passé ce
  -- délai, le pass n'ouvre plus rien. Le vérifier ici et pas seulement à
  -- l'écran, parce qu'une server action reste POSTable en direct.
  if v_grant.activate_by is not null and v_grant.activate_by <= p_now then
    return query select false, 'activation_expired'::text;
    return;
  end if;

  update public.organization_module_grants
     set starts_at = p_starts_at,
         ends_at = p_ends_at
   where id = v_grant.id;

  return query select true, 'active'::text;
end;
$$;

comment on function public.activate_module_grant(uuid, uuid, timestamptz, timestamptz, timestamptz) is
  'Fait démarrer un octroi acheté et resté `pending`. Rend (activated, state) '
  'et NE LÈVE PAS sur un rejeu : un double clic doit rendre le même verdict '
  'que le premier appel. Les dates viennent du catalogue TypeScript, jamais '
  'du client — d''où la porte service_role, comme grant_module_from_payment.';

revoke all on function public.activate_module_grant(uuid, uuid, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
