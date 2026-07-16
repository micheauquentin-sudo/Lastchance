-- ============================================================
-- Lastchance — Améliorations UX (retour personnalisé, compte à
-- rebours, wallet pass, notification de gain, aperçu live, posters)
--
-- Seule la notification de gain nécessite du schéma : les autres
-- fonctions sont client-side (retour personnalisé, compte à rebours,
-- posters) ou calculées à la volée sur des données déjà en base
-- (aperçu live de la roue active, wallet pass).
-- ============================================================

alter table public.organizations
  add column if not exists notify_on_win boolean not null default true;

comment on column public.organizations.notify_on_win is
  'Email au propriétaire à chaque gain réclamé (temps réel). Désactivable dans Réglages.';
