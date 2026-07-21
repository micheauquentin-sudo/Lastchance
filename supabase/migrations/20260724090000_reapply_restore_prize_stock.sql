-- ============================================================
-- Lastchance — Réapplication de restore_prize_stock
--
-- Dérive constatée en PROD (CI run 29863687838) : la migration
-- 00008 est marquée appliquée dans l'historique remote, mais la
-- fonction public.restore_prize_stock est absente du schéma PROD
-- (elle existe bien en local, où les migrations font foi).
-- Cette migration réapplique à l'identique le contenu de
-- 00008_restore_prize_stock.sql : `create or replace` + revoke,
-- idempotent et sans danger là où la fonction existe déjà.
--
-- Rappel du rôle : le spin réserve le stock d'un lot AVANT
-- d'enregistrer le spin (decrement_prize_stock, atomique). Si
-- l'insertion du spin échoue ensuite (incident base), cette
-- fonction restitue la réservation. SECURITY DEFINER, service
-- role uniquement (exécution révoquée pour anon / authenticated).
-- ============================================================

create or replace function public.restore_prize_stock(p_prize_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  -- stock null = illimité : rien à restituer.
  update public.prizes
  set stock = stock + 1
  where id = p_prize_id and stock is not null;
$$;

revoke execute on function public.restore_prize_stock(uuid) from anon, authenticated;
