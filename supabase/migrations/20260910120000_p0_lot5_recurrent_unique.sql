-- ============================================================
-- P0 lot 5 — UN SEUL RÉCURRENT VIVANT PAR MODULE, ET LE REJEU RESTE INOFFENSIF
--
-- Suite de 20260908120000 (lot 4), qui a livré l'octroi par paiement et son
-- idempotence. Ce lot-ci ouvre la vente en ligne des DEUX add-ons mensuels
-- (« Passeport des habitués », « Bouche-à-oreille »), fermée jusqu'ici par
-- `venteEnLigneOuverte` (ADR-079). Il livre la seule pièce que le webhook ne
-- peut pas porter lui-même : l'unicité du récurrent vivant.
--
-- ── LE DÉFAUT QUE L'INDEX FERME, ET POURQUOI IL N'EST PAS RATTRAPABLE ──
--
-- L'index du lot 4 porte sur `(organization_id, source_reference)`. Il rend un
-- REJEU inoffensif — même session, même octroi — mais il ne dit rien de DEUX
-- ACHATS distincts : deux sessions de checkout portent deux identifiants, donc
-- deux octrois, donc deux prélèvements mensuels sur le même module. Un double
-- clic suffit, la fenêtre étant celle qui sépare la vérification faite par
-- l'écran du moment où le webhook écrit.
--
-- Ce n'est pas seulement une facturation en double. À la résiliation de l'un
-- des deux abonnements, RIEN NE DISTINGUE quel octroi révoquer :
-- `source_reference` porte un identifiant de SESSION, jamais d'abonnement. Le
-- webhook devrait deviner, et se tromperait une fois sur deux.
--
-- Avec « un seul récurrent vivant », `(organisation, module, kind = recurring,
-- non révoqué)` désigne EXACTEMENT une ligne : l'ambiguïté disparaît, et il
-- devient inutile de persister l'identifiant d'abonnement Stripe.
--
-- ── CE QUE L'INDEX N'INTERDIT PAS, ET C'EST LE POINT DÉLICAT ──
--
-- Le RACHAT APRÈS RÉSILIATION. Un commerçant qui résilie en janvier et reprend
-- en mars doit pouvoir le faire. L'octroi de janvier étant révoqué, il sort du
-- prédicat partiel et ne compte plus. Le blocage porte sur le CUMUL, jamais sur
-- le retour — un index total l'aurait interdit à vie.
--
-- ── POURQUOI LE PRÉDICAT NE PARLE PAS DU TEMPS ──
--
-- « Vivant » au sens de `org_has_live_module_grant` s'écrit
-- `revoked_at is null and starts_at is not null and starts_at <= now
--  and (ends_at is null or ends_at > now)`. Un prédicat d'index doit être
-- IMMUABLE : `now()` y est interdit. Le prédicat retenu est donc la projection
-- intemporelle de cette définition pour un récurrent — dont les termes
-- (`src/lib/octroi-termes.ts`) posent délibérément `starts_at` à l'achat et
-- `ends_at` à null, précisément pour qu'une fin à trente jours ne coupe pas le
-- module au premier renouvellement.
--
-- L'écart est du bon côté : le prédicat est plus LARGE que « vivant ». Il
-- couvre aussi un récurrent au `starts_at` futur ou nul, qui n'est pas encore
-- vivant mais le deviendra. Refuser un doublon un peu tôt vaut mieux que le
-- laisser naître pour le découvrir au premier prélèvement.
--
-- ── L'INDEX COUVRE LES DEUX SOURCES, LA RÉVOCATION UNE SEULE ──
--
-- Le prédicat ne filtre PAS sur `source` : l'invariant « un commerçant n'a pas
-- deux fois le même module en récurrent » ne dépend pas de qui l'a posé, et un
-- octroi offert par le back-office est un droit aussi réel qu'un octroi payé.
--
-- La révocation par webhook, elle, filtre sur `source = 'stripe'`
-- (src/app/api/stripe/webhook/route.ts). Sans ce filtre, la résiliation d'un
-- abonnement Stripe révoquerait un octroi OFFERT que Stripe n'a jamais
-- gouverné. Les deux portées sont donc volontairement différentes, et
-- l'asymétrie est sûre : l'index garantit qu'il y a au plus une ligne, le
-- filtre garantit qu'on ne touche pas celle qui ne nous appartient pas.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ──
--
--   * Aucun montant, aucune durée, aucun Price ID — même interdit qu'au lot 4.
--   * Aucune colonne d'identifiant d'abonnement Stripe : l'unicité la rend
--     inutile, et une colonne ajoutée « au cas où » devient une seconde source
--     de vérité que personne ne maintient.
--   * Aucune purge des doublons existants : il n'y en a pas, la vente des
--     mensuels étant restée fermée depuis l'origine. Si l'index refusait de se
--     créer, ce serait la preuve du contraire — et il vaut mieux le savoir à la
--     migration qu'au premier double prélèvement.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. L'unicité du récurrent vivant
-- ────────────────────────────────────────────────────────────

create unique index if not exists organization_module_grants_recurrent_vivant_idx
  on public.organization_module_grants (organization_id, module)
  where kind = 'recurring'
    and revoked_at is null
    and ends_at is null;

comment on index public.organization_module_grants_recurrent_vivant_idx is
  'Un seul octroi RÉCURRENT vivant par (organisation, module). Ferme la course '
  'du double clic — deux sessions de checkout portent deux références, donc '
  'échappent à organization_module_grants_stripe_ref_idx — et rend la '
  'résiliation non ambiguë : sans elle, rien ne dirait lequel des deux octrois '
  'révoquer, source_reference portant une session et jamais un abonnement. '
  'PARTIEL sur les non révoqués et sans terme : le rachat APRÈS résiliation '
  'reste permis, seul le cumul est interdit.';

-- ────────────────────────────────────────────────────────────
-- 2. La RPC apprend à REFUSER un cumul sans faire échouer le webhook
--
-- Signature INCHANGÉE — mêmes arguments, mêmes défauts, même
-- `returns table (grant_id, created)`. Seul le corps bouge, donc
-- `src/types/database.generated.ts` n'a rien à recevoir de ce lot.
--
-- ── POURQUOI LA VIOLATION EST RATTRAPÉE ICI ET NON LAISSÉE MONTER ──
--
-- Sans ce rattrapage, le second paiement d'un double clic ferait lever la RPC,
-- donc répondre 500 au webhook, donc RETENTER Stripe pendant trois jours avant
-- de désactiver le point d'entrée — ce qui couperait aussi la synchronisation
-- des abonnements principaux. Or aucun rejeu ne réparera jamais ce conflit :
-- l'octroi concurrent restera là. Retenter un état définitif est le pire des
-- deux mondes.
--
-- ── LE REFUS SE DISTINGUE DU REJEU, ET C'EST LE CŒUR DU GESTE ──
--
--   * rejeu   → (grant_id de l'octroi existant, false)  : même paiement, rien
--               à faire, tout va bien ;
--   * refus   → (null, false)                           : un AUTRE paiement a
--               déjà ouvert ce module en récurrent. Le commerçant a été débité
--               pour un droit qu'il possède déjà.
--
-- `grant_id` null est impossible dans le chemin de rejeu (il est lu sur la
-- ligne en conflit), donc l'encodage n'est pas ambigu. L'appelant DOIT crier
-- sur ce cas : c'est un remboursement à faire, pas une idempotence qui marche.
-- C'est aussi pourquoi on ne rend pas ici l'octroi vivant existant — le rendre
-- ferait passer un double débit pour un succès.
--
-- ── LA VIOLATION EST IDENTIFIÉE PAR SON NOM, LES AUTRES REMONTENT ──
--
-- Rattraper `unique_violation` en bloc avalerait n'importe quelle unicité
-- future de la table, y compris une qui signalerait un vrai défaut. On lit donc
-- `constraint_name` — Postgres y met le nom de l'index sur une violation
-- d'index unique — et tout ce qui n'est pas le nôtre est RELEVÉ tel quel.
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
  v_contrainte text;
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

  begin
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
  exception when unique_violation then
    get stacked diagnostics v_contrainte = constraint_name;
    if v_contrainte is distinct from 'organization_module_grants_recurrent_vivant_idx' then
      raise;
    end if;
    -- CUMUL REFUSÉ. `null` en `grant_id` dit à l'appelant que ce n'est PAS un
    -- rejeu : un autre paiement tient déjà ce module en récurrent.
    return query select null::uuid, false;
    return;
  end;

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
  '(grant_id, created). Trois issues et non deux : (id, true) = créé ; '
  '(id, false) = REJEU du même paiement, sans redater l''octroi existant ; '
  '(null, false) = REFUS de cumul, un autre paiement tient déjà ce module en '
  'récurrent (organization_module_grants_recurrent_vivant_idx). Le troisième '
  'cas est un débit sans contrepartie : l''appelant doit crier, pas acquitter '
  'en silence. Le rejeu ne redate pas — les termes sont une promesse faite à '
  'l''achat, un webhook rejoué plus tard décalerait la fenêtre. L''idempotence '
  'tient aux index uniques, pas à une lecture préalable — un select suivi d''un '
  'insert laisse une fenêtre que deux livraisons simultanées traversent toutes '
  'les deux (ADR-059).';

revoke all on function public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid)
  to service_role;
