-- ============================================================
-- P0 lot 4 — UN PAIEMENT CRÉE UN OCTROI, ET LE REJEU N'EN CRÉE PAS DEUX
--
-- Suite de 20260907120000 (lot 2), qui a livré la table des octrois datés, sa
-- garde et son miroir TypeScript — mais AUCUN chemin d'achat. Depuis, la seule
-- façon d'obtenir un octroi est qu'un super-admin le pose à la main. Le cahier
-- (docs/codex-handoff.md §2) vend pourtant huit add-ons autonomes, dont cinq à
-- durée fixe : « 29 EUR / 30 jours, activable dans les 90 jours ».
--
-- Cette migration livre la seule pièce que le webhook Stripe ne peut pas
-- porter lui-même : l'INSERTION IDEMPOTENTE.
--
-- ── POURQUOI L'IDEMPOTENCE DESCEND EN BASE, ET NE RESTE PAS DANS L'APPELANT ──
--
-- C'est exactement le raisonnement d'ADR-059, écrit pour le crédit SMS et
-- vérifié depuis : `supabase-js` rend `{ error }` de la même façon pour un
-- rollback et pour une coupure réseau survenue APRÈS le commit. Un appelant qui
-- lirait cette erreur pour décider de réessayer ne peut pas distinguer « rien
-- n'a été écrit » de « tout a été écrit et je ne l'ai pas su ». Stripe, lui,
-- réessaie ses webhooks — donc le second cas arrive.
--
-- Sans garde en base, un réessai crée un SECOND octroi : le commerçant paie une
-- Chasse au trésor et en reçoit deux, soit soixante jours pour trente payés.
-- L'erreur va dans le sens du client, ce qui la rend d'autant plus durable :
-- personne ne la signale.
--
-- La garde est donc un INDEX UNIQUE, pas une vérification préalable. Un
-- `select` puis un `insert` laissent une fenêtre entre les deux, et deux
-- livraisons simultanées du même événement la traversent toutes les deux.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS, DÉLIBÉRÉMENT ──
--
--   * Aucun montant, aucune durée, aucun Price ID. Le cahier l'interdit
--     explicitement tant que les tarifs ne sont pas revalidés commercialement,
--     et les graver en base obligerait à une migration pour changer un prix.
--     Les deux fenêtres arrivent CALCULÉES par l'appelant, qui les tire du
--     catalogue (`src/lib/plans.ts`) et jamais du client.
--   * Aucune décision de démarrage. La RPC pose ce qu'on lui donne ; c'est le
--     catalogue qui dit si l'add-on démarre tout de suite (récurrent) ou
--     attend une activation (pass).
--   * Aucun accès `authenticated`. Un octroi est ce qui décide de ce qui est
--     payé : le seul appelant est le webhook, en `service_role`.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. L'unicité qui rend le rejeu inoffensif
--
-- PARTIEL sur `source = 'stripe'`, et c'est le point : les octrois de
-- back-office n'ont pas de référence de paiement, et plusieurs peuvent
-- légitimement porter `source_reference` null ou la même note. Un index total
-- les aurait empêchés de coexister pour fermer un trou qui ne les concerne pas.
-- ────────────────────────────────────────────────────────────

create unique index if not exists organization_module_grants_stripe_ref_idx
  on public.organization_module_grants (organization_id, source_reference)
  where source = 'stripe' and source_reference is not null;

comment on index public.organization_module_grants_stripe_ref_idx is
  'Rend le rejeu d''un webhook Stripe inoffensif : une même référence de '
  'paiement ne peut pas créer deux octrois pour une organisation. PARTIEL — '
  'les octrois de back-office n''ont pas de référence et doivent pouvoir '
  'coexister.';

-- ────────────────────────────────────────────────────────────
-- 2. La RPC d'octroi par paiement
--
-- Rend `(grant_id, created)` et NE LÈVE PAS sur un rejeu. Le webhook doit
-- pouvoir répondre 200 à un événement déjà traité : lever le ferait réessayer
-- indéfiniment sur un état pourtant correct.
--
-- Elle lève en revanche sur un appelant non autorisé — c'est un événement de
-- sécurité, qui doit laisser une trace, et ce chemin est inatteignable depuis
-- l'application légitime.
-- ────────────────────────────────────────────────────────────

create or replace function public.grant_module_from_payment(
  p_organization_id uuid,
  p_module text,
  p_kind text,
  p_source_reference text,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_activate_by timestamptz default null,
  p_capacity integer default null,
  p_resource_id uuid default null
)
returns table (grant_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Même idiome que `declare_sms_sender` et les autres portes service_role du
  -- dépôt. Ce refus-ci LÈVE, contrairement à celui du rejeu plus bas : un
  -- appelant non autorisé est un événement de sécurité, qui doit laisser une
  -- trace, et ce chemin est inatteignable depuis l'application légitime.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'grant_module_from_payment: service_role requis'
      using errcode = '42501';
  end if;

  -- Une référence de paiement est OBLIGATOIRE ici. C'est elle, et elle seule,
  -- qui rend l'index unique opérant : sans elle, l'index partiel ne mord pas
  -- et chaque rejeu créerait un octroi. Un octroi sans référence relève du
  -- back-office, pas de cette fonction.
  if p_source_reference is null or pg_catalog.length(pg_catalog.btrim(p_source_reference)) = 0 then
    raise exception 'grant_module_from_payment: référence de paiement requise'
      using errcode = '22023';
  end if;

  insert into public.organization_module_grants (
    organization_id, module, kind, source, source_reference,
    starts_at, ends_at, activate_by, capacity, resource_id
  )
  values (
    p_organization_id, p_module, p_kind, 'stripe', p_source_reference,
    p_starts_at, p_ends_at, p_activate_by, p_capacity, p_resource_id
  )
  on conflict (organization_id, source_reference)
    where source = 'stripe' and source_reference is not null
    do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  -- CONFLIT : l'octroi existe déjà pour ce paiement. On rend le sien, et
  -- surtout on ne le MET PAS À JOUR — les termes d'un octroi sont une promesse
  -- faite au client au moment de l'achat (le lot 2 les gèle par trigger), et un
  -- rejeu ne doit pas pouvoir les redater. Un webhook rejoué trois jours plus
  -- tard recalculerait sinon une fenêtre décalée de trois jours.
  select g.id into v_id
    from public.organization_module_grants g
   where g.organization_id = p_organization_id
     and g.source = 'stripe'
     and g.source_reference = p_source_reference;

  return query select v_id, false;
end;
$$;

comment on function public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid) is
  'Crée l''octroi daté correspondant à un paiement Stripe, et rend '
  '(grant_id, created). Le rejeu d''un même paiement rend created = false SANS '
  'lever et SANS redater l''octroi existant : les termes sont une promesse '
  'faite à l''achat, un webhook rejoué plus tard décalerait la fenêtre. '
  'L''idempotence tient à l''index unique partiel, pas à une lecture préalable '
  '— un select suivi d''un insert laisse une fenêtre que deux livraisons '
  'simultanées du même événement traversent toutes les deux (ADR-059).';

revoke all on function public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid)
  to service_role;
