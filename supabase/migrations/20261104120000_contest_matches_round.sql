-- ============================================================
-- PRONOSTICS — LA JOURNÉE DE CHAMPIONNAT SUR CHAQUE MATCH
-- ============================================================
--
-- ── CE QUE ÇA RÉPARE ──
--
-- La grille du joueur listait les matchs à la file, triés par coup d'envoi.
-- On passait donc du dimanche 30 août au jeudi 3 septembre sans la moindre
-- séparation, alors que ce sont DEUX journées de championnat : l'unité dans
-- laquelle un calendrier de football se lit, se commente et se pronostique.
--
-- Le fournisseur la donne déjà (`intRound`), on ne la gardait simplement pas.
--
-- ── POURQUOI `null` EST UNE VALEUR LÉGITIME, ET LE RESTERA ──
--
-- Trois familles de matchs n'ont pas de journée :
--   · ceux importés AVANT cette migration — la prochaine synchronisation la
--     leur posera, mais ils doivent rester affichables d'ici là ;
--   · ceux saisis À LA MAIN par le commerçant (compétition « Autre / Match
--     isolé », boxe, match amical) — il n'y a pas de journée à inventer ;
--   · ceux d'une coupe dont le fournisseur ne numérote pas les tours.
--
-- L'écran les regroupe donc à part au lieu de leur fabriquer un numéro. Un
-- `not null default 1` aurait rangé un match de boxe dans une « 1re journée »
-- qui n'existe pas.
--
-- ── AUCUN DROIT NOUVEAU ──
--
-- `update` est révoqué sur cette table pour `authenticated` depuis 00023 : la
-- colonne est écrite par le service role, à l'import. Rien à accorder.

alter table public.contest_matches
  add column if not exists round integer
    check (round is null or round between 1 and 99);

comment on column public.contest_matches.round is
  'Journée de championnat, telle que la donne le fournisseur (intRound). null : match sans journée — saisi à la main, tour de coupe non numéroté, ou importé avant 20261104120000 (la synchronisation suivante la pose). L''écran joueur groupe par journée et réunit les null dans un groupe à part plutôt que de leur inventer un numéro.';

-- Index de tri : la grille lit les matchs d'un championnat groupés par
-- journée puis par coup d'envoi. Sans lui, chaque affichage de la page joueur
-- trie en mémoire une grille qui peut compter 300 matchs après un import de
-- saison complète.
create index if not exists contest_matches_contest_round_idx
  on public.contest_matches (contest_id, round, kickoff_at);
