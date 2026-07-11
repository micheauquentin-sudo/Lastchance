-- Personnalisation visuelle des QR codes (couleurs + logo du commerce).
-- Le logo est stocké en data URL PNG (normalisé et réduit côté client,
-- ~256px), ce qui évite un bucket de stockage dédié pour la V1.

alter table public.qr_codes
  add column style jsonb not null default '{}'::jsonb;

comment on column public.qr_codes.style is
  'Personnalisation du QR : { dark, light, logo (data URL PNG) }';
