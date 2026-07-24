-- ============================================================
-- Lastchance — Jeux rapides · VAGUE 1 (jeux de RÉVÉLATION)
--
-- `wheels.game_type` est le point d'extension des mécaniques de jeu : chaque
-- valeur = une PRÉSENTATION du même moteur de tirage. Roue et grattage
-- partagent déjà spinWheel / atomic_spin / claimPrize (lots, poids, stocks,
-- éligibilité, thème, consentement, partage). Les jeux de révélation
-- réutilisent TOUT ce moteur — seule l'UI change, aucune nouvelle table.
--
-- On étend donc simplement le registre en ajoutant 7 valeurs de révélation,
-- en conservant 'wheel' et 'scratch'. Le CHECK reste un strict sur-ensemble :
-- aucune ligne existante ne peut le violer.
--
-- (Les 6 mécaniques SKILL — rps, reflex, gauge, puzzle, mystery_word,
--  estimate — viendront en vague 2 avec leur propre moteur.)
--
-- Réutilise le nom auto-généré de la contrainte inline créée en migration
-- 00012 (`add column ... check (...)`) : wheels_game_type_check.
-- ============================================================

alter table public.wheels
  drop constraint if exists wheels_game_type_check;

alter table public.wheels
  add constraint wheels_game_type_check check (
    game_type in (
      'wheel', 'scratch',
      'flip_card', 'cups', 'slot', 'memory', 'chest', 'dice', 'draw_card'
    )
  );
