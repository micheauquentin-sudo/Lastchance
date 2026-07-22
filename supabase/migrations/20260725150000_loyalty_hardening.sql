-- ============================================================
-- Lastchance — Durcissement du Passeport de fidélité
--
-- Deux findings de la revue sécurité du module (migration d'origine
-- 20260725120000_loyalty_passport), volet base de données.
--
-- FAIBLE-1 — cooldown à 0 + mode `rotating_code` = amplification du
--   relais de code. Le code tournant reste valide ~3 périodes (fenêtre
--   ±1 dans record_loyalty_stamp) : une SEULE observation du code, si le
--   cooldown vaut 0, se rejoue jusqu'au plafond du seau anti-abus du
--   membre (30/h côté app) et gonfle un passeport jusqu'à un palier sans
--   la moindre visite réelle. Le défaut du module (24 h) est sûr ; c'est
--   le réglage 0 qui ouvre l'amplification.
--   → plancher de cooldown CONDITIONNEL au mode : en `rotating_code`, au
--     moins une période de rotation et au moins 300 s. Le mode `staff`
--     reste libre (0 compris) : la validation humaine en caisse EST la
--     preuve de visite, le cooldown n'y est qu'un confort.
--
-- MOYEN-1 (volet SQL) — période de rotation jusqu'à 3600 s : le même
--   triplet de codes reste acceptable ~3 h, ce qui multiplie d'autant les
--   essais utiles d'un devineur (≈1,6 %/IP/fenêtre selon la revue) et
--   allonge la fenêtre de relais d'un code observé.
--   → plafond ramené à 300 s (5 min). Le plancher 15 s est conservé.
--
-- Les CHECK inline de 20260725120000 sont nommés par Postgres selon la
-- convention <table>_<colonne>_check : on les remplace en place, même
-- style que 20260724140000 (jeton d'étape de chasse). La contrainte
-- conditionnelle croise deux colonnes : contrainte de table nommée
-- explicitement.
--
-- Données existantes : le seed E2E et les fixtures pgTAP sont en mode
-- `staff` (cooldown 0, exempté) ou déjà conformes (période 60 s /
-- cooldown 24 h). Les deux UPDATE de mise en conformité ci-dessous
-- couvrent d'éventuels programmes marchands réels avant l'ajout des
-- contraintes — sans eux la migration échouerait sur la revalidation.
-- Ils resserrent des réglages (ils n'en relâchent aucun) et sont
-- idempotents.
-- ============================================================

-- ── Mise en conformité des données existantes ────────────────
-- Période trop longue : ramenée au nouveau plafond.
update public.loyalty_programs
   set rotating_period_seconds = 300
 where rotating_period_seconds > 300;

-- Cooldown sous le plancher en mode code tournant : relevé au plancher
-- (le mode staff n'est pas touché).
update public.loyalty_programs
   set min_stamp_interval_seconds = greatest(rotating_period_seconds, 300)
 where validation_mode = 'rotating_code'
   and min_stamp_interval_seconds < greatest(rotating_period_seconds, 300);

-- ── FIX 2 : période de rotation plafonnée à 5 min ────────────
alter table public.loyalty_programs
  drop constraint if exists loyalty_programs_rotating_period_seconds_check;
alter table public.loyalty_programs
  add constraint loyalty_programs_rotating_period_seconds_check
  check (rotating_period_seconds between 15 and 300);

-- ── FIX 1 : plancher de cooldown en mode code tournant ───────
-- Plancher = greatest(période, 300) écrit en conjonction (« au moins
-- 300 s ET au moins une rotation complète ») : expression strictement
-- équivalente, sans appel de fonction dans la contrainte. Avec le
-- plafond de période ci-dessus le plancher effectif vaut 300 s
-- aujourd'hui, mais la formule garde son sens si ce plafond bouge.
alter table public.loyalty_programs
  drop constraint if exists loyalty_programs_rotating_cooldown_floor_check;
alter table public.loyalty_programs
  add constraint loyalty_programs_rotating_cooldown_floor_check
  check (
    validation_mode <> 'rotating_code'
    or (min_stamp_interval_seconds >= 300
        and min_stamp_interval_seconds >= rotating_period_seconds)
  );

comment on column public.loyalty_programs.min_stamp_interval_seconds is
  'Cooldown anti-abus entre deux tampons d''un même passeport (0 = désactivé, défaut 24 h). En mode rotating_code, plancher imposé à greatest(rotating_period_seconds, 300) : un code observé ne peut pas être rejoué en boucle.';

comment on column public.loyalty_programs.rotating_period_seconds is
  'Période de rotation du code tournant (15 à 300 s). Plafond volontairement bas : le code reste acceptable ~3 périodes (tolérance ±1), donc une période longue allonge d''autant la fenêtre de devinette et de relais.';
