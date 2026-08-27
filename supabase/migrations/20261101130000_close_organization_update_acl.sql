-- Les réglages et droits d'une organisation ne sont jamais écrits depuis une
-- session PostgREST marchande. Depuis 00017, l'application passe par une
-- action serveur qui vérifie le propriétaire puis utilise service_role.
--
-- L'ACL effective conservait pourtant un UPDATE de table pour authenticated.
-- Sans policy UPDATE il ne permettait pas encore d'écrire une ligne, mais il
-- annulait la liste blanche de colonnes et transformait toute future policy en
-- porte vers les liens sociaux, les droits payants et les champs Stripe.
revoke update on table public.organizations from authenticated;

-- Le rôle d'un membre se change uniquement par set_team_member_role : la RPC
-- vérifie le propriétaire, borne la cible à editor|cashier et protège le
-- dernier owner. Un UPDATE direct contournerait précisément ces trois gardes.
revoke update on table public.organization_members from authenticated;
