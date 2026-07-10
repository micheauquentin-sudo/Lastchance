-- ════════════════════════════════════════════════════════════
-- 00007 — Branding commerçant & personnalisation
--   · logo d'établissement (affiché sur la page /play)
--   · style de roue entièrement personnalisable (jsonb)
--   · configuration d'affiche par QR code (éditeur d'affiche)
--   · bucket Storage public "logos" (upload via service role)
--
-- Historique : ce fichier était numéroté 00006, en collision avec
-- 00006_qr_style.sql — la version étant la clé primaire de
-- supabase_migrations.schema_migrations, une seule des deux
-- migrations s'appliquait (bug « Enregistrement impossible » sur
-- l'éditeur d'affiche et l'éditeur de roue : colonnes absentes).
-- Renuméroté 00007 et rendu idempotent (add column if not exists)
-- pour converger quel que soit l'état de la base.
-- ════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 1. Logo de l'établissement
-- ────────────────────────────────────────────────────────────

alter table public.organizations
  add column if not exists logo_url text
  check (logo_url is null or char_length(logo_url) <= 500);

-- ────────────────────────────────────────────────────────────
-- 2. Style de roue (anneau, lumières, segments, moyeu,
--    pointeur, police, fond de page, bouton…)
--    Validé côté serveur par zod (src/lib/wheel-style.ts) ;
--    la contrainte de taille bloque seulement l'abus.
-- ────────────────────────────────────────────────────────────

alter table public.wheels
  add column if not exists style jsonb not null default '{}'::jsonb
  check (pg_column_size(style) <= 8192);

-- ────────────────────────────────────────────────────────────
-- 3. Affiche personnalisée par QR code (éditeur d'affiche)
-- ────────────────────────────────────────────────────────────

alter table public.qr_codes
  add column if not exists poster jsonb not null default '{}'::jsonb
  check (pg_column_size(poster) <= 16384);

-- ────────────────────────────────────────────────────────────
-- 4. Bucket Storage "logos" — lecture publique.
--    Les uploads passent exclusivement par le service role
--    (server action qui vérifie l'appartenance à l'organisation),
--    donc aucune policy d'écriture pour anon/authenticated.
-- ────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos',
  'logos',
  true,
  2097152, -- 2 Mo
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;
