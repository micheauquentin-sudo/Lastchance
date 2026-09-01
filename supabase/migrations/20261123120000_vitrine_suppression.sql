-- ════════════════════════════════════════════════════════════
-- VITRINE — LA SUPPRESSION, PAR UNE PORTE QUI JOURNALISE (VIT-14)
--
-- Demande du propriétaire : un bouton « Supprimer la vitrine » en pied de
-- l'écran, au même titre que « Supprimer le jeu » sur les éditeurs de jeu.
--
-- ── CE QUE CE FICHIER N'AJOUTE PAS : UN DROIT DE SUPPRESSION ──
--
-- `security_acl.test.sql` porte depuis VIT-1a l'assertion « merchant cannot
-- delete their storefront settings — unpublishing is enough », et elle RESTE
-- vraie après ce lot : `authenticated` n'obtient toujours aucun `delete` sur
-- `vitrine_settings`. Ce qui change, c'est qu'il existe désormais UNE porte,
-- `security definer`, qui vérifie le rôle et écrit une ligne d'audit — le même
-- arbitrage que `set_vitrine_slug`, pour la même raison : l'adresse publique
-- engage des QR déjà imprimés, et ce genre de geste ne doit pas pouvoir se
-- faire sans laisser de trace.
--
-- ── POURQUOI UNE RPC ET NON SEPT SUPPRESSIONS DEPUIS L'ACTION ──
--
-- Une vitrine vit dans SEPT tables, et aucune ne référence `vitrine_settings` :
-- elles pendent toutes à l'organisation. Supprimer la ligne de réglages depuis
-- le code aurait donc laissé le catalogue ORPHELIN — des cartes et des fiches
-- rattachées à une vitrine qui n'existe plus, invisibles et indestructibles.
--
-- Et sept suppressions successives depuis le client JavaScript ne sont pas
-- atomiques : une coupure au milieu laisse une vitrine à moitié effacée, dans
-- un état que rien ne sait décrire. Ici, tout tient dans une transaction.
--
-- ── CE QUE LA SUPPRESSION EMPORTE, ET CE QU'ELLE LIBÈRE ──
--
-- Les sept tables, mesures d'audience comprises — c'est le calque de
-- « Supprimer la campagne », qui emporte roue, lots, QR et participations.
--
-- ET ELLE LIBÈRE LE SLUG. C'est la conséquence lourde, elle est assumée et
-- elle doit être dite à l'écran : les QR déjà imprimés tombent en 404, et
-- l'adresse redevient disponible pour un autre commerce. C'est exactement ce
-- que fait la suppression d'une campagne avec ses QR.
-- ════════════════════════════════════════════════════════════

create or replace function public.delete_vitrine(
  p_organization_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id  uuid;
  v_slug      text;
  v_cartes    integer;
  v_rubriques integer;
  v_fiches    integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  -- MÊME GARDE DE FORME QUE `set_vitrine_slug`, mot pour mot : l'acteur vient
  -- de la session de l'appelant et sa forme est vérifiée AVANT le cast, pour
  -- qu'une valeur libre ne fasse pas lever un 22P02 illisible.
  if p_actor is null
     or p_actor <> pg_catalog.btrim(p_actor)
     or p_actor !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_actor_id := p_actor::uuid;

  -- OWNER SEUL, PAS L'EDITOR. `set_vitrine_slug` accepte les deux parce que
  -- changer une adresse se répare en la remettant ; ceci ne se répare pas. Un
  -- éditeur peut écrire toute la carte, il ne peut pas la faire disparaître.
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor_id
       and om.role = 'owner'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select s.slug into v_slug
    from public.vitrine_settings s
   where s.organization_id = p_organization_id;

  -- RIEN À SUPPRIMER N'EST PAS UNE ERREUR. Deux onglets ouverts, deux clics :
  -- le second doit rendre un état lisible, pas une exception que l'écran
  -- traduirait en « Suppression impossible » sur une vitrine déjà supprimée.
  if v_slug is null then
    return pg_catalog.jsonb_build_object('state', 'absente');
  end if;

  -- LES COMPTES SONT PRIS AVANT, pour le journal : après, il n'y a plus rien à
  -- compter, et une ligne d'audit qui ne dit pas ce qui a disparu ne sert qu'à
  -- dater le geste.
  select pg_catalog.count(*) into v_cartes
    from public.vitrine_menus where organization_id = p_organization_id;
  select pg_catalog.count(*) into v_rubriques
    from public.vitrine_categories where organization_id = p_organization_id;
  select pg_catalog.count(*) into v_fiches
    from public.vitrine_items where organization_id = p_organization_id;

  -- L'ORDRE EST CELUI DES DÉPENDANCES, du plus feuille au plus racine : les
  -- fiches avant les rubriques, les rubriques avant les cartes. Les clés
  -- étrangères internes au module l'imposent, et s'en remettre à un `cascade`
  -- qui n'existe peut-être pas aurait rendu ce fichier faux le jour où l'une
  -- d'elles change.
  delete from public.vitrine_translations where organization_id = p_organization_id;
  delete from public.vitrine_items        where organization_id = p_organization_id;
  delete from public.vitrine_categories   where organization_id = p_organization_id;
  delete from public.vitrine_menus        where organization_id = p_organization_id;
  delete from public.vitrine_contenus     where organization_id = p_organization_id;
  delete from public.vitrine_mesures      where organization_id = p_organization_id;
  delete from public.vitrine_settings     where organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor, 'vitrine.deleted',
          -- CE QUE LE JOURNAL RETIENT : l'adresse LIBÉRÉE — de quoi expliquer
          -- un QR devenu muet, et de quoi savoir qui l'a rendue disponible — et
          -- le volume de ce qui a disparu. Ni les noms de plats, ni le thème :
          -- un journal n'est pas une sauvegarde.
          pg_catalog.jsonb_build_object(
            'slug', v_slug,
            'cartes', v_cartes,
            'rubriques', v_rubriques,
            'fiches', v_fiches));

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'slug', v_slug,
    'cartes', v_cartes,
    'rubriques', v_rubriques,
    'fiches', v_fiches);
end;
$$;

comment on function public.delete_vitrine(uuid, text) is
  'Supprime la Vitrine d''une organisation (VIT-14) : les sept tables du '
  'module, mesures d''audience comprises, en UNE transaction. LIBÈRE LE SLUG — '
  'les QR déjà imprimés tombent en 404 et l''adresse redevient disponible ; '
  'c''est assumé, et l''écran le dit. N''ajoute AUCUN droit de suppression : '
  '`authenticated` n''a toujours pas de `delete` sur `vitrine_settings`, et '
  'cette porte vérifie le rôle OWNER (pas editor : le geste ne se répare pas) '
  'puis journalise dans `audit_logs`. Rend {state: absente} sans lever quand '
  'il n''y a rien à supprimer — deux clics ne doivent pas produire une erreur.';

revoke all on function public.delete_vitrine(uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_vitrine(uuid, text) to service_role;
