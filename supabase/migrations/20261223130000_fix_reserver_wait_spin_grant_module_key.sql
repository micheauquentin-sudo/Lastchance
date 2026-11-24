-- ============================================================================
-- Restaure la clé de module `reserver` sur `consume_reserver_wait_spin_grant`
--
-- `20261020120000_cle_par_produit.sql` avait migré en place (via
-- `pg_get_functiondef`) la garde `org_has_module_access(..., 'vitrine')` de
-- `consume_reserver_wait_spin_grant` vers `'reserver'`.
-- `20261223120000_audit_gongo_remediation.sql` ayant été dérivée de la
-- définition d'origine (`20261006120000`) puis déjà appliquée en production,
-- cette migration avant restaure strictement la garde `'reserver'` en place.
-- ============================================================================

do $migration$
declare
  v_motif constant text := 'org_has_module_access\(([^,]+), ''vitrine''\)';
  v_neuf  constant text := 'org_has_module_access(\1, ''reserver'')';
  v_oid   oid;
  v_def   text;
  v_hits  integer;
begin
  select p.oid, pg_catalog.pg_get_functiondef(p.oid)
    into strict v_oid, v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'consume_reserver_wait_spin_grant';

  select pg_catalog.count(*)::integer into v_hits
    from pg_catalog.regexp_matches(v_def, v_motif, 'g');

  if v_hits <> 1 then
    raise exception
      'consume_reserver_wait_spin_grant() porte % occurrence(s) de la garde `vitrine` au lieu d''une seule',
      v_hits;
  end if;

  execute pg_catalog.regexp_replace(v_def, v_motif, v_neuf);

  revoke all on function public.consume_reserver_wait_spin_grant(uuid, text, text)
    from public, anon, authenticated;
  grant execute on function public.consume_reserver_wait_spin_grant(uuid, text, text)
    to service_role;
end
$migration$;
