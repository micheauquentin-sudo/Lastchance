-- ============================================================
-- Lastchance — Durcissement : jeton d'étape de chasse ≥ 16 car.
--
-- La contrainte d'origine (treasure_hunts, 20260724120000) tolérait
-- 8 caractères (^[A-Za-z0-9-]{8,64}$) alors que l'application génère
-- toujours randomCode(16) (createHuntStep, src/actions/hunts.ts). On
-- resserre le plancher à 16 pour couper court à tout futur code-path
-- qui écrirait un jeton court, plus devinable — défense en profondeur
-- (finding FAIBLE, docs/bugs.md), sans autre effet fonctionnel.
--
-- La contrainte inline est nommée par Postgres hunt_steps_token_check
-- (convention <table>_<colonne>_check) ; on la remplace en place, même
-- style que les resserrements de rôles (00019). Les jetons existants
-- font 16 caractères (seed E2E aligné, prod = randomCode(16)) : la
-- revalidation à l'ajout de contrainte passe sans NOT VALID.
-- ============================================================
alter table public.hunt_steps
  drop constraint if exists hunt_steps_token_check;
alter table public.hunt_steps
  add constraint hunt_steps_token_check
  check (token ~ '^[A-Za-z0-9-]{16,64}$');
