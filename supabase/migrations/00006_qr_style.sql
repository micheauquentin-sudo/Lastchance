-- Personnalisation visuelle des QR codes (couleurs + logo du commerce).
-- Le logo est stocké en data URL PNG (normalisé et réduit côté client,
-- ~256px), ce qui évite un bucket de stockage dédié pour la V1.

-- Idempotent (if not exists) : la collision de version avec l'ancienne
-- migration 00006_branding_and_customization laissait la base dans un
-- état partiel selon l'ordre d'application — voir 00007.
alter table public.qr_codes
  add column if not exists style jsonb not null default '{}'::jsonb;

comment on column public.qr_codes.style is
  'Personnalisation du QR : { dark, light, logo (data URL PNG) }';
