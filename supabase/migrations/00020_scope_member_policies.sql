-- ============================================================
-- LastChance — Les politiques métier ne doivent pas être évaluées par anon
-- ============================================================
-- Une policy créée sans clause TO s'applique à PUBLIC. Après la révocation
-- d'EXECUTE sur les helpers is_org_* pour anon, PostgreSQL pouvait donc lever
-- une erreur au lieu de simplement masquer les lignes. Les policies reposant
-- sur l'identité d'un membre sont exclusivement destinées à authenticated.

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and 'public' = any(roles)
      and (
        coalesce(qual, '') ~ 'is_org_(member|owner|editor)'
        or coalesce(with_check, '') ~ 'is_org_(member|owner|editor)'
      )
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

