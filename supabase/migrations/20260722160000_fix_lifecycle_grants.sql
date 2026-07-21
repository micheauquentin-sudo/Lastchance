-- ============================================================
-- Lastchance — Correctif : ACL de la fonction trigger du cycle du gain
--
-- 20260722150000 créait set_participation_redeem_expiry() sans retirer
-- l'EXECUTE par défaut accordé à PUBLIC — l'audit générique pgTAP
-- (« PUBLIC has no EXECUTE on public functions ») le refuse à juste
-- titre. Le trigger n'a besoin d'aucun droit d'appel côté clients.
-- ============================================================

revoke all on function public.set_participation_redeem_expiry()
  from public, anon, authenticated;
