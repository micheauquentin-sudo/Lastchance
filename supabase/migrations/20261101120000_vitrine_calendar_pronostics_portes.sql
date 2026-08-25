-- Les portes Vitrine doivent uniquement annoncer une experience que le joueur
-- peut ouvrir. Ce patch conserve les gardes produit deja installees sur la
-- fonction vivante, puis ajoute Calendrier et Pronostics au contrat public.

do $migration$
declare
  v_def text;
  v_ancre constant text :=
    '      ''experiences'', pg_catalog.jsonb_build_object(' || E'\n'
    || '        ''quiz'', v_quiz,' || E'\n'
    || '        ''duo'', v_duo' || E'\n'
    || '      )';
  v_neuf constant text :=
    '      ''experiences'', pg_catalog.jsonb_build_object(' || E'\n'
    || '        ''quiz'', v_quiz,' || E'\n'
    || '        ''duo'', v_duo,' || E'\n'
    || '        ''calendars'', (' || E'\n'
    || '          select coalesce(' || E'\n'
    || '            pg_catalog.jsonb_agg(' || E'\n'
    || '              pg_catalog.jsonb_build_object(''slug'', x.slug, ''titre'', x.titre)' || E'\n'
    || '              order by x.titre, x.id),' || E'\n'
    || '            ''[]''::jsonb)' || E'\n'
    || '          from (' || E'\n'
    || '            select c.id, c.public_slug as slug, c.name as titre' || E'\n'
    || '              from public.calendars c' || E'\n'
    || '             where c.organization_id = v_settings.organization_id' || E'\n'
    || '               and c.status = ''active''' || E'\n'
    || '               and public.org_has_module_access(v_settings.organization_id, ''calendar'')' || E'\n'
    || '             order by c.name, c.id' || E'\n'
    || '             limit c_max_portes' || E'\n'
    || '          ) x' || E'\n'
    || '        ),' || E'\n'
    || '        ''pronostics'', (' || E'\n'
    || '          select coalesce(' || E'\n'
    || '            pg_catalog.jsonb_agg(' || E'\n'
    || '              pg_catalog.jsonb_build_object(''slug'', x.slug, ''titre'', x.titre)' || E'\n'
    || '              order by x.titre, x.id),' || E'\n'
    || '            ''[]''::jsonb)' || E'\n'
    || '          from (' || E'\n'
    || '            select c.id, c.slug, c.name as titre' || E'\n'
    || '              from public.contests c' || E'\n'
    || '             where c.organization_id = v_settings.organization_id' || E'\n'
    || '               and c.status in (''active'', ''finished'')' || E'\n'
    || '               and public.org_has_module_access_for_resource(' || E'\n'
    || '                     v_settings.organization_id, ''pronostics'', c.id)' || E'\n'
    || '             order by c.name, c.id' || E'\n'
    || '             limit c_max_portes' || E'\n'
    || '          ) x' || E'\n'
    || '        )' || E'\n'
    || '      )';
  v_hits integer;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state';

  v_hits := (pg_catalog.length(v_def)
             - pg_catalog.length(pg_catalog.replace(v_def, v_ancre, '')))
            / pg_catalog.length(v_ancre);

  if v_hits <> 1 then
    raise exception
      'vitrine_public_state contient % occurrence(s) de son contrat experiences au lieu d''une seule : migration arretee pour ne pas ecraser une garde existante',
      v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_ancre, v_neuf);
end
$migration$;

do $verification$
declare
  v_calendar integer;
  v_pronostics integer;
begin
  select pg_catalog.count(*)::integer into v_calendar
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state'
     and p.prosrc ~ 'org_has_module_access\(v_settings\.organization_id, ''calendar''\)';
  if v_calendar <> 1 then
    raise exception 'vitrine_public_state ne garde pas ses calendriers par le droit calendar';
  end if;

  select pg_catalog.count(*)::integer into v_pronostics
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state'
     and p.prosrc ~ 'org_has_module_access_for_resource\(\s*v_settings\.organization_id, ''pronostics'', c\.id\)';
  if v_pronostics <> 1 then
    raise exception 'vitrine_public_state ne garde pas ses pronostics par ressource';
  end if;
end
$verification$;
