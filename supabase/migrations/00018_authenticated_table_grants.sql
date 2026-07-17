-- ============================================================
-- LastChance — Privilèges de tables explicites pour PostgREST
-- ============================================================
-- Les RLS filtrent les lignes, mais PostgreSQL exige aussi un privilège de
-- table. Une reconstruction locale ne doit pas dépendre des grants implicites
-- d'un projet Supabase créé depuis le Dashboard.

-- Lecture de l'organisation et de la liste des appartenances. Le secret
-- webhook reste exclu par les grants de colonnes posés dans 00017.
grant select on public.organization_members to authenticated;
grant delete on public.organization_members to authenticated;

-- Outils opérationnels accessibles aux membres. Les politiques RLS imposent
-- l'organisation active ; owner et staff peuvent gérer campagnes, roues,
-- lots et QR.
grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.wheels to authenticated;
grant select, insert, update, delete on public.prizes to authenticated;
grant select, insert, update, delete on public.qr_codes to authenticated;
grant select on public.spins to authenticated;

-- Données personnelles : privilèges SQL nécessaires à PostgREST, puis
-- politiques owner-only de 00017. Le staff utilise uniquement les RPC caisse.
grant select, update, delete on public.participations to authenticated;
grant select, delete on public.newsletter_subscribers to authenticated;
grant select, insert on public.newsletter_campaigns to authenticated;
grant select on public.audit_logs to authenticated;

-- Gestion d'équipe owner-only via les politiques de 00015/00017.
grant select, insert, update, delete on public.team_invitations to authenticated;

-- Les tables internes (stripe_events, rate_limits, admin_*) restent sans
-- privilèges authenticated et sont exclusivement utilisées via service_role.
