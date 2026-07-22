-- ============================================================
-- Lastchance — Plancher de cooldown `staff` porté de 180 à 300 s
--
-- INFO-A (contre-vérification sécurité du Passeport de fidélité) —
-- alignement base / Zod / UI, et suppression d'un cas limite.
--
-- 20260725160000 a posé le plancher `staff` à EXACTEMENT 180 s, soit
-- exactement la TTL du jeton de check-in (LOYALTY_CHECKIN_TTL_MS,
-- src/lib/loyalty-checkin.ts). Le raisonnement tient au sens strict —
-- le premier tampon est postérieur à l'émission du jeton, donc la fin
-- de cooldown (tampon + 180 s) tombe APRÈS l'expiration du jeton
-- (émission + 180 s) — mais la marge est nulle : elle ne dépend que de
-- l'écart d'horloge entre l'instance qui a signé le jeton et celle qui
-- horodate le tampon. Une dérive de quelques secondes entre instances
-- applicatives rouvre une fenêtre de rejeu, pour un second tampon.
--
-- Par ailleurs l'UI propose 300 s comme réglage le plus permissif en
-- mode caisse et la validation Zod impose déjà 180 : la base était le
-- maillon le plus permissif, et l'UPDATE de conformité de la migration
-- précédente a posé les programmes existants PILE sur 180 — ils y
-- restent tant que le commerçant ne réenregistre pas son formulaire.
--
-- → plancher `staff` porté à 300 s. Marge de 120 s sur la TTL du jeton,
--   valeur identique au plancher `rotating_code`, cohérente avec l'UI.
--   La branche `rotating_code` est inchangée (>= 300 ET >= période).
--
-- Effet de bord assumé : les deux planchers valant désormais 300 s, une
-- bascule `staff` → `rotating_code` d'un programme conforme ne peut plus
-- violer le plancher rotating (le plafond de période étant lui-même à
-- 300 s depuis 20260725150000). Le test pgTAP correspondant est ajusté.
--
-- Données existantes : l'UPDATE ci-dessous relève les programmes `staff`
-- sous 300 s (dont ceux posés à 180 par 20260725160000, et le programme
-- du seed E2E). Il resserre uniquement, ne relâche aucun réglage, et est
-- idempotent. Sans lui l'ajout de la contrainte échouerait.
-- ============================================================

-- ── Mise en conformité des données existantes ────────────────
update public.loyalty_programs
   set min_stamp_interval_seconds = 300
 where validation_mode = 'staff'
   and min_stamp_interval_seconds < 300;

-- ── Plancher de cooldown : 300 s dans les deux modes ─────────
-- Même nom de contrainte qu'en 20260725160000, remplacée en place
-- (drop/add), même style en conjonction d'implications : chaque mode
-- porte son propre plancher, et un mode ajouté plus tard resterait
-- libre tant qu'on ne l'ajoute pas ici.
alter table public.loyalty_programs
  drop constraint if exists loyalty_programs_cooldown_floor_check;
alter table public.loyalty_programs
  add constraint loyalty_programs_cooldown_floor_check
  check (
    (validation_mode <> 'rotating_code'
     or (min_stamp_interval_seconds >= 300
         and min_stamp_interval_seconds >= rotating_period_seconds))
    and
    (validation_mode <> 'staff'
     or min_stamp_interval_seconds >= 300)
  );

comment on column public.loyalty_programs.min_stamp_interval_seconds is
  'Cooldown anti-abus entre deux tampons d''un même passeport (défaut 24 h). Plancher de 300 s imposé dans les deux modes par loyalty_programs_cooldown_floor_check : rotating_code = greatest(rotating_period_seconds, 300) — un code observé ne se rejoue pas en boucle ; staff = 300 s, soit la TTL du jeton de check-in (LOYALTY_CHECKIN_TTL_MS = 180 s) plus 120 s de marge — ce jeton n''étant pas à usage unique, un plancher égal ou inférieur à sa TTL laisserait un écart d''horloge entre instances rouvrir une fenêtre de rejeu.';
