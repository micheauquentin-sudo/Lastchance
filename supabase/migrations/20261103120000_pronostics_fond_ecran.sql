-- ============================================================
-- PRONOSTICS — LE FOND D'ÉCRAN DEVIENT UN CHOIX DU COMMERÇANT
-- ============================================================
--
-- Miroir EXACT de `calendars.fond_key` (20261102120000), et c'est délibéré :
-- les deux modules partagent la palette saisonnière (`SeasonalTheme`), le shell
-- joueur (`PlayerPageShell`) et la table des dix illustrations. Leur donner
-- deux vocabulaires de réglage aurait été deux vérités pour une seule question.
--
-- ── LES TROIS ÉTATS, ET POURQUOI DEUX N'AURAIENT PAS SUFFI ──
--
--   null      → « suivre le thème » — le comportement d'AVANT cette migration,
--               donc aucune reprise de données : un championnat existant
--               affiche exactement ce qu'il affichait hier.
--   'aucun'   → aucune image ; seul le motif CSS du thème reste. C'est un
--               CHOIX, que `null` ne peut pas exprimer — sans lui, le
--               commerçant qui retire le fond d'un thème qui en a un le voit
--               revenir au rechargement.
--   <clé>     → l'une des dix illustrations de `public/fonds/`.
--
-- La liste est RECOPIÉE et non déduite : ce CHECK est le dernier rempart avant
-- qu'une clé inconnue n'atteigne le `src` d'une image servie à un joueur
-- anonyme. Ajouter un fond demandera de toucher les deux endroits — c'est le
-- prix, assumé, d'une garde qui tient en base.

alter table public.contests
  add column if not exists fond_key text
    check (
      fond_key is null
      or fond_key in (
        'aucun',
        'prairie', 'noel', 'saint_valentin', 'anniversaire', 'soldes',
        'festival', 'musique', 'football', 'restaurant', 'espace'
      )
    );

comment on column public.contests.fond_key is
  'Fond d''écran plein cadre de la page joueur. null : suivre le thème saisonnier (défaut, comportement historique). ''aucun'' : aucune image, motif CSS du thème seul. Sinon, l''une des dix clés de public/fonds/ (cf. FOND_KEYS, src/lib/fonds-ecran.ts). Miroir de calendars.fond_key (20261102120000).';

-- ════════════════════════════════════════════════════════════
-- La liste blanche d'UPDATE, réémise en entier
-- ════════════════════════════════════════════════════════════
-- `grant update (col)` s'AJOUTE aux privilèges déjà accordés ; réémettre la
-- liste complète laisse le fichier lisible comme l'état voulu — même geste que
-- 20260904120000 pour `code_ttl_seconds`.
--
-- Rien en INSERT : aucun formulaire de CRÉATION ne propose ce réglage, et le
-- défaut `null` (« suivre le thème ») est exactement ce qu'un championnat neuf
-- doit valoir.
--
-- LA LISTE EST CELLE DE 20260917120000, PLUS `fond_key`, ET RIEN D'AUTRE.
-- C'est le point délicat de ce fichier : `grant update (col)` AJOUTE des
-- privilèges, il n'en retire aucun. Réémettre une liste « plausible » plutôt
-- que la liste RÉELLE ouvrirait donc en écriture directe des colonnes que ce
-- module garde derrière des RPC — `rewards`, `scoring`, `tiebreaker_answer`
-- (barème et palmarès, écrits sous motif journalisé), `competition_key` et
-- `event_kind` (dont dépend l'import de calendrier), `last_synced_at`
-- (supervision). `status` et `finalized_at` restent hors liste pour la même
-- raison depuis 00023.
--
-- Autrement dit : cette migration n'ajoute qu'UN droit, celui d'écrire un
-- fond d'écran.
grant update (name, collect_email, collect_phone, code_ttl_seconds, theme,
              fond_key)
  on public.contests to authenticated;
