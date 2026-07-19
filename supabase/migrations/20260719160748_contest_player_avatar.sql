-- ============================================================
-- Lastchance — Pseudo et avatar des joueurs de pronostics
--
-- first_name sert déjà de pseudo affiché au classement. On ajoute
-- l'avatar : une clé courte pointant vers une illustration cartoon du
-- catalogue applicatif (aucune URL, aucun upload — pas de PII, pas de
-- surface d'abus). Vide = avatar par défaut.
-- ============================================================

alter table public.contest_players
  add column if not exists avatar text not null default '';

comment on column public.contest_players.avatar is
  'Clé d''avatar cartoon (catalogue applicatif). Vide = avatar par défaut.';

alter table public.contest_players
  add constraint contest_players_avatar_format_check
    check (avatar = '' or avatar ~ '^[a-z]{1,20}$') not valid;
alter table public.contest_players
  validate constraint contest_players_avatar_format_check;
