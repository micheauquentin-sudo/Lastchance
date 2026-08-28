-- ============================================================
-- CALENDRIER — LE FOND D'ÉCRAN DEVIENT UN CHOIX DU COMMERÇANT
-- ============================================================
--
-- ── Ce que ça répare ──
--
-- Le fond plein cadre de la page suivie `/calendar/<slug>` était DÉDUIT du
-- thème saisonnier (`fondPourTheme`, src/lib/fonds-ecran.ts) : choisir la
-- palette « Noël » imposait l'illustration de Noël, et un commerçant qui
-- voulait les couleurs de Noël sur la photo « Restaurant » n'avait aucun
-- chemin. La roue le permet depuis longtemps (`wheel_style.fond`) ; le
-- calendrier était le seul module suivi à ne pas l'offrir.
--
-- ── TROIS ÉTATS, ET LE `null` EST LE PLUS IMPORTANT ──
--
--   null      → « suivre le thème » — le comportement d'AVANT cette migration.
--               C'est le défaut, et il n'y a donc AUCUNE reprise de données :
--               les calendriers existants continuent d'afficher exactement ce
--               qu'ils affichaient hier.
--   'aucun'   → aucune image ; seul le motif CSS du thème reste. C'est un
--               choix, pas une absence de choix : `null` ne peut pas le dire.
--   <clé>     → l'une des dix illustrations livrées dans `public/fonds/`.
--
-- La liste est RECOPIÉE ici et non déduite : le CHECK est le dernier rempart
-- avant qu'une clé inconnue n'atteigne le `src` d'une balise `<img>` servie à
-- un joueur anonyme. Ajouter un fond demandera donc de toucher les deux
-- endroits — c'est le prix, assumé, d'une garde qui tient en base.
--
-- ── Ce que ce fichier NE fait pas ──
--
-- Il ne touche pas à `calendar_public_state` : le réglage est lu par
-- `loadCalendarPublicContext`, qui interroge déjà `calendars` pour résoudre le
-- slug. Le faire transiter par la RPC aurait coûté un `create or replace` d'une
-- fonction de 90 lignes pour une colonne que l'appelant a déjà sous la main.

alter table public.calendars
  add column if not exists fond_key text
    check (
      fond_key is null
      or fond_key in (
        'aucun',
        'prairie', 'noel', 'saint_valentin', 'anniversaire', 'soldes',
        'festival', 'musique', 'football', 'restaurant', 'espace'
      )
    );

comment on column public.calendars.fond_key is
  'Fond d''écran plein cadre de la page suivie. null : suivre le thème saisonnier (défaut, comportement historique). ''aucun'' : aucune image, motif CSS du thème seul. Sinon, l''une des dix clés de public/fonds/ (cf. FOND_KEYS, src/lib/fonds-ecran.ts). Le CHECK est la dernière garde avant le src d''une image servie à un joueur anonyme.';

-- ════════════════════════════════════════════════════════════
-- La liste blanche d'UPDATE, réémise en entier
-- ════════════════════════════════════════════════════════════
-- `grant update (col)` s'AJOUTE aux privilèges déjà accordés ; réémettre la
-- liste complète laisse néanmoins le fichier lisible comme l'état voulu —
-- même geste que 20260904120000 pour `code_ttl_days`.
--
-- Rien en INSERT : aucun formulaire de CRÉATION ne propose ce réglage, et le
-- défaut `null` (« suivre le thème ») est exactement ce qu'un calendrier neuf
-- doit valoir. Une colonne insérable qu'aucun chemin n'insère est une porte
-- qu'on ouvre sans raison.
--
-- `status` reste absent : il n'est écrivable que par `set_calendar_status`
-- depuis 20260905120000, et cette migration ne le rouvre pas.
grant update (name, theme, start_date, timezone, day_count,
              public_slug, merchant_content,
              completion_reward_label, completion_reward_details,
              completion_reward_stock, code_ttl_days, fond_key, updated_at)
  on public.calendars to authenticated;
