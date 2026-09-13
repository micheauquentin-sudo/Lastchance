-- budget_spent_cents est une autorite serveur : le claim l'incremente dans
-- claim_winning_spin. L'ancien re-grant colonne par colonne permettait encore
-- a un editeur authentifie de le remettre a zero via PostgREST, puis de rendre
-- artificiellement du budget disponible aux tirages suivants.
revoke update (budget_spent_cents)
  on table public.campaigns
  from authenticated, anon;
