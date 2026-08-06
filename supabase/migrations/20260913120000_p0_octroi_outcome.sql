-- ============================================================
-- LA TROISIÈME ISSUE CESSE D'ÊTRE UNE ABSENCE, ET DEVIENT UN MOT
--
-- Suite de 20260908120000 (lot 4, l'octroi par paiement) et de 20260910120000
-- (lot 5, le refus de cumul). Ces deux-là ont donné à
-- `grant_module_from_payment` TROIS issues et deux colonnes pour les dire :
--
--     (id,   true)   → octroi créé
--     (id,   false)  → REJEU du même paiement, bénin
--     (null, false)  → REFUS de cumul, un autre paiement tient déjà ce module
--                      en récurrent. Deux sessions encaissées, un remboursement
--                      dû : le cas le plus cher de la table.
--
-- La troisième se lisait donc à la NULLITÉ de `grant_id`. Et c'est là que le
-- montage se retourne contre lui-même.
--
-- ── POURQUOI L'ENCODAGE PRÉCÉDENT NE POUVAIT PAS TENIR ──
--
-- `src/types/database.generated.ts` déclarait :
--
--     Returns: { created: boolean; grant_id: string }[]     ← NON-NULLABLE
--
-- Ce n'est pas un défaut du générateur. Postgres ne transporte pas la
-- nullabilité des colonnes d'un `returns table` — `pg_proc.proallargtypes` ne
-- porte que des types — et rien dans le catalogue ne permet de la déduire.
-- AUCUNE régénération n'aurait corrigé ce type : il était faux par
-- construction, et il l'aurait été à chaque régénération future.
--
-- Le webhook compensait par un cast explicite vers `grant_id: string | null`.
-- Un cast qui ÉLARGIT un type que le générateur donne déjà pour non-nullable a
-- toutes les apparences d'une redondance : le geste naturel du lecteur suivant
-- est de le supprimer. `grant_id` redevenait alors non-nullable, la condition
-- `!ligne.grant_id` devenait inatteignable, et la branche du double paiement
-- mourait SANS QU'AUCUN TEST NE ROUGISSE — tous les cas nominaux passent.
--
-- Un test textuel gardait donc le cast. Mais garder un correctif n'est pas
-- supprimer le piège : c'est ajouter une pièce de plus à entretenir, et faire
-- reposer la détection du double débit sur une expression régulière.
--
-- ── CE QUE CETTE MIGRATION CHANGE, ET C'EST TOUT ──
--
-- La distinction passe d'une NULLITÉ à une VALEUR :
--
--     (id,   'created')
--     (id,   'replayed')
--     (null, 'refused')
--
-- `outcome text` est une colonne comme une autre : le générateur la voit, la
-- rend en `string`, et ce `string` est VRAI. Plus rien à corriger, donc plus
-- rien à protéger. L'appelant compare trois littéraux au lieu de tester une
-- absence, et une issue qu'il ne connaîtrait pas devient visible au lieu de se
-- confondre avec la plus bénigne des trois.
--
-- ── POURQUOI `created` DISPARAÎT AU LIEU DE COHABITER ──
--
-- `created` valait exactement `outcome = 'created'`. Le garder à côté
-- d'`outcome`, ce serait deux écritures du même fait, donc deux choses à tenir
-- d'accord — et le jour où elles divergent, c'est la branche du remboursement
-- qui se trompe. `grant_id` reste, lui, parce qu'il porte quelque chose
-- qu'`outcome` ne dit pas : QUEL octroi. Le webhook l'écrit au journal d'audit.
--
-- Il reste null sur `refused` — il n'y a alors aucun octroi à nommer — mais
-- plus AUCUNE branche ne repose là-dessus. Le type généré continuera de dire
-- `string` ; il ne ment plus à personne, parce que plus personne ne l'interroge
-- sur ce point.
--
-- ── POURQUOI `text` ET NON UN ENUM POSTGRES ──
--
-- Un enum donnerait au générateur une vraie union TypeScript plutôt qu'un
-- `string`, ce qui est tentant. Mais une valeur d'enum ne se retire pas, et
-- chaque issue nouvelle coûterait une migration ET une régénération de types.
-- Le même verrou s'obtient à l'endroit où il compte — la frontière TypeScript,
-- où le webhook filtre les trois littéraux et CRIE sur tout le reste. On paie
-- alors la contrainte une fois, là où elle sert, sans figer le vocabulaire de
-- la base.
--
-- ── POURQUOI UN `drop` ET NON UN `create or replace` ──
--
-- Mesuré sur la base locale (Postgres 15.8), pas supposé. `create or replace`
-- avec une colonne de retour EN PLUS, comme avec une colonne RENOMMÉE ET
-- RETYPÉE, rend le même refus :
--
--     ERROR:  cannot change return type of existing function
--     DETAIL:  Row type defined by OUT parameters is different.
--     HINT:  Use DROP FUNCTION grant_module_from_payment(...) first.
--
-- Le lot 5 avait pu se contenter d'un `create or replace` parce qu'il ne
-- touchait QUE le corps, à signature identique — c'était même son argument pour
-- ne pas régénérer les types. Ici la signature bouge : le `drop` est obligé, et
-- `src/types/database.generated.ts` DOIT être régénéré.
--
-- ── ET CE QUE LE `drop` EMPORTE AVEC LUI, QUI N'EST PAS ÉVIDENT ──
--
-- Les privilèges. Vérifié sur la même base : après `drop` puis `create`,
-- `has_function_privilege('public', …, 'EXECUTE')` repasse à TRUE — Postgres
-- accorde EXECUTE à PUBLIC par défaut sur toute fonction neuve, et la
-- révocation du lot 4 ne survit pas à la suppression de l'objet qu'elle visait.
-- Sans les trois dernières lignes de ce fichier, une fonction `security
-- definer` qui OCTROIE DES DROITS PAYANTS redeviendrait appelable par `anon` et
-- `authenticated` via PostgREST. La garde `auth.role() = 'service_role'` du
-- corps la rattraperait — mais faire reposer sur elle seule ce que les
-- privilèges doivent porter, c'est retirer une des deux serrures.
-- ============================================================

drop function if exists public.grant_module_from_payment(
  uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid);

create function public.grant_module_from_payment(
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
returns table (grant_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_contrainte text;
begin
  -- Même idiome que `declare_sms_sender` et les autres portes service_role du
  -- dépôt. Ce refus-ci LÈVE, contrairement aux deux issues non nominales plus
  -- bas : un appelant non autorisé est un événement de sécurité, qui doit
  -- laisser une trace, et ce chemin est inatteignable depuis l'application
  -- légitime.
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
    -- LA VIOLATION EST IDENTIFIÉE PAR SON NOM, LES AUTRES REMONTENT. Rattraper
    -- `unique_violation` en bloc avalerait n'importe quelle unicité future de
    -- la table, y compris une qui signalerait un vrai défaut. Postgres met le
    -- nom de l'index dans `constraint_name` sur une violation d'index unique.
    get stacked diagnostics v_contrainte = constraint_name;
    if v_contrainte is distinct from 'organization_module_grants_recurrent_vivant_idx' then
      raise;
    end if;
    -- CUMUL REFUSÉ. Un AUTRE paiement tient déjà ce module en récurrent : le
    -- commerçant a été débité pour un droit qu'il possède déjà. On ne rend PAS
    -- l'octroi vivant existant — le nommer ferait ressembler un double débit à
    -- un succès, et `outcome` suffit désormais à dire lequel des deux c'est.
    return query select null::uuid, 'refused'::text;
    return;
  end;

  if v_id is not null then
    return query select v_id, 'created'::text;
    return;
  end if;

  -- REJEU : l'octroi existe déjà pour ce paiement. On rend le sien, et surtout
  -- on ne le MET PAS À JOUR — les termes d'un octroi sont une promesse faite au
  -- client au moment de l'achat (le lot 2 les gèle par trigger), et un rejeu ne
  -- doit pas pouvoir les redater. Un webhook rejoué trois jours plus tard
  -- recalculerait sinon une fenêtre décalée de trois jours.
  select g.id into v_id
    from public.organization_module_grants g
   where g.organization_id = p_organization_id
     and g.source = 'stripe'
     and g.source_reference = p_source_reference;

  return query select v_id, 'replayed'::text;
end;
$$;

comment on function public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid) is
  'Crée l''octroi daté correspondant à un paiement Stripe, et rend '
  '(grant_id, outcome). TROIS issues, portées par une VALEUR et non par une '
  'nullité : ''created'' = octroi créé ; ''replayed'' = même paiement rejoué, '
  'sans redater l''octroi existant ; ''refused'' = un AUTRE paiement tient déjà '
  'ce module en récurrent (organization_module_grants_recurrent_vivant_idx), '
  'donc un débit sans contrepartie — l''appelant doit crier, pas acquitter en '
  'silence. `created boolean` a été retiré : il valait exactement '
  'outcome = ''created'', et deux écritures d''un même fait finissent par '
  'diverger. `grant_id` reste parce qu''il dit QUEL octroi, ce qu''outcome ne '
  'dit pas ; il est null sur ''refused'', mais plus aucune branche ne repose '
  'sur cette nullité — Postgres ne la transporte pas jusqu''aux types générés. '
  'Ne LÈVE ni sur un rejeu ni sur un refus : le webhook doit pouvoir acquitter, '
  'aucun rejeu ne réparant un conflit définitif. Elle lève sur appelant non '
  'service_role et sur référence de paiement absente. L''idempotence tient aux '
  'index uniques, pas à une lecture préalable — un select suivi d''un insert '
  'laisse une fenêtre que deux livraisons simultanées traversent toutes les '
  'deux (ADR-059).';

-- OBLIGATOIRE APRÈS UN `drop` : Postgres accorde EXECUTE à PUBLIC par défaut
-- sur toute fonction neuve, et la révocation du lot 4 est morte avec l'ancienne
-- fonction. Sans ces deux lignes, la porte de service serait ouverte à `anon`.
revoke all on function public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid)
  to service_role;
