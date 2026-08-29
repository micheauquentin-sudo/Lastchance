-- ============================================================
-- Passeport -> Jackpot collectif : ACL de configuration marchand
--
-- La relation a été ajoutée après les grants colonne par colonne du
-- passeport. Sans ces deux droits ciblés, PostgREST refuse la lecture du
-- détail et le dashboard la transforme à tort en page introuvable.
-- ============================================================

grant select (jackpot_campaign_id)
  on public.loyalty_programs to authenticated;

grant update (jackpot_campaign_id)
  on public.loyalty_programs to authenticated;
