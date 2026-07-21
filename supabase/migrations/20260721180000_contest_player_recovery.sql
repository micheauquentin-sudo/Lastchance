-- ============================================================
-- Lastchance — Récupération d'identité joueur Pronostics (audit #6)
--
-- L'identité joueur tient à un cookie httpOnly de 180 jours : cookie
-- effacé ou téléphone changé = grille inaccessible, email « déjà
-- inscrit ». Le lien magique par email répare ça :
--   demande → jeton haché à usage unique (30 min) → confirmation →
--   ROTATION du jeton appareil (les anciens appareils sont déconnectés)
--   → cookie reposé → récupération journalisée dans audit_logs.
-- Une nouvelle demande invalide les jetons précédents du joueur.
-- ============================================================

create table public.contest_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references public.contest_players(id) on delete cascade,
  -- Seul le hash SHA-256 est stocké : un dump de la base ne permet pas
  -- d'usurper un lien de récupération.
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (contest_id, token_hash)
);

comment on table public.contest_recovery_tokens is
  'Jetons de récupération d''identité joueur (lien magique email) : hachés, expirants, à usage unique. Service role uniquement.';

create index contest_recovery_tokens_player_idx
  on public.contest_recovery_tokens (player_id);

alter table public.contest_recovery_tokens enable row level security;
revoke all on table public.contest_recovery_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.contest_recovery_tokens to service_role;
