-- ============================================================
-- Lastchance — Plancher de cooldown en mode `staff`
--
-- MOYEN-1 (contre-revue sécurité du Passeport de fidélité) — le jeton
-- de check-in est REJOUABLE dans sa fenêtre.
--
-- En mode `staff`, la page joueur affiche un QR portant un jeton signé
-- HMAC de courte durée (LOYALTY_CHECKIN_TTL_MS = 180 000 ms,
-- src/lib/loyalty-checkin.ts). Ce jeton n'est PAS à usage unique : il
-- ne porte pas de `jti` et rien en base ne mémorise sa consommation.
-- Le plancher de cooldown posé en 20260725150000 exemptait justement le
-- mode `staff` (`validation_mode <> 'rotating_code' or ...`), et l'UI
-- propose « Aucune limite » (min_stamp_interval_seconds = 0) en mode
-- caisse. Conséquence : sur un programme staff à cooldown 0, un même
-- jeton vaut N tampons pendant 3 minutes — double-tap du caissier, deux
-- postes qui scannent le même écran, employé complice qui repasse la
-- photo du QR. Assez pour décrocher un palier `lot` (code FIDELITE-…,
-- stock décrémenté) sans visite réelle. Seul le défaut 24 h protégeait :
-- une valeur par défaut, pas une garantie structurelle.
--
-- → plancher DUR de 180 s en mode `staff`, au moins égal à la TTL du
--   jeton. Le rejeu ne peut plus produire un second tampon : le premier
--   tampon est nécessairement postérieur à l'émission du jeton, donc son
--   cooldown (fin = tampon + 180 s) expire APRÈS le jeton lui-même
--   (émission + 180 s). La fenêtre exploitable est vide.
--
-- Alternative écartée : un `jti` à usage unique (table de jetons
-- consommés + unicité) autoriserait un cooldown 0, mais ajoute du
-- stockage, une purge et un chemin d'écriture supplémentaire avant la
-- validation. Le plancher est plus simple et plus robuste pour une GA.
--
-- La contrainte conditionnelle de 20260725150000 était nommée
-- `loyalty_programs_rotating_cooldown_floor_check` et ne couvrait que le
-- code tournant. On la remplace par UNE contrainte couvrant les deux
-- modes, renommée en conséquence (`loyalty_programs_cooldown_floor_check`) :
--   - `rotating_code` : >= 300 s ET >= rotating_period_seconds (inchangé) ;
--   - `staff`         : >= 180 s (nouveau).
--
-- Données existantes : l'UPDATE de mise en conformité ci-dessous relève
-- les programmes `staff` sous le plancher (dont le programme du seed E2E,
-- à 0). Il resserre uniquement, il ne relâche aucun réglage, et il est
-- idempotent. Sans lui l'ajout de la contrainte échouerait.
-- ============================================================

-- ── Mise en conformité des données existantes ────────────────
update public.loyalty_programs
   set min_stamp_interval_seconds = 180
 where validation_mode = 'staff'
   and min_stamp_interval_seconds < 180;

-- ── Plancher de cooldown, désormais pour les DEUX modes ──────
-- Écrit en conjonction d'implications, même style que la contrainte
-- remplacée : chaque mode porte son propre plancher, et un mode ajouté
-- plus tard resterait libre tant qu'on ne l'ajoute pas ici.
alter table public.loyalty_programs
  drop constraint if exists loyalty_programs_rotating_cooldown_floor_check;
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
     or min_stamp_interval_seconds >= 180)
  );

comment on column public.loyalty_programs.min_stamp_interval_seconds is
  'Cooldown anti-abus entre deux tampons d''un même passeport (défaut 24 h). Plancher imposé par mode (loyalty_programs_cooldown_floor_check) : rotating_code = greatest(rotating_period_seconds, 300) — un code observé ne se rejoue pas en boucle ; staff = 180 s, au moins la TTL du jeton de check-in (LOYALTY_CHECKIN_TTL_MS) — ce jeton n''étant pas à usage unique, un plancher plus court laisserait un rejeu intra-fenêtre valoir un second tampon.';
