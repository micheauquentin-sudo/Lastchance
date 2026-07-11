-- ============================================================
-- Lastchance — Compensation de stock
--
-- Le spin réserve le stock d'un lot AVANT d'enregistrer le spin
-- (decrement_prize_stock, atomique). Si l'insertion du spin échoue
-- ensuite (incident base), la réservation était perdue : le lot
-- comptait une unité de stock de moins sans gagnant. Cette fonction
-- restitue la réservation dans ce chemin d'erreur.
--
-- Comme decrement_prize_stock : SECURITY DEFINER, service role
-- uniquement (exécution révoquée pour anon / authenticated).
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
