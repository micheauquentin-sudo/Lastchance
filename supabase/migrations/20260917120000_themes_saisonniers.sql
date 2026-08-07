-- ============================================================
-- Thèmes saisonniers — les pronostics en gagnent un, le calendrier
-- gagne la Saint-Valentin
--
-- 1. `contests.theme`. Le championnat de pronostics est le SEUL module de
--    création sans habillage saisonnier : ni colonne, ni jetons. Il reçoit
--    ici la MÊME palette que le calendrier (20260728120000, ligne 92) et non
--    une liste à lui — deux vocabulaires pour la même idée obligeraient
--    chaque écran à savoir lequel il regarde, et le premier thème ajouté
--    d'un côté manquerait de l'autre.
--
--    Le quiz, lui, NE CHANGE PAS (20260803120000, ligne 457). Ses clés
--    ('gourmand', 'degustation', 'culture'…) nomment un USAGE MÉTIER, pas
--    une saison : les aligner ferait proposer « Noël » à un quiz de
--    dégustation et « dégustation » à un calendrier de l'Avent. Deux
--    domaines qui se ressemblent ne sont pas le même domaine.
--
-- 2. `saint_valentin` rejoint la palette. Elle manquait aux cinq clés
--    d'origine alors qu'elle est, après Noël, la saison la plus évidente
--    pour un commerce. Le CHECK du calendrier est donc élargi.
--
-- Côté base ce n'est qu'un champ d'affichage : aucune règle métier n'en
-- dépend, aucune valeur existante n'est touchée (on n'AJOUTE que des
-- valeurs permises, l'ancien domaine reste inclus dans le nouveau), et la
-- déclinaison visuelle « carton » vit côté UI.
-- ============================================================

-- ── 1. Les pronostics portent un thème ──────────────────────
-- `not null default` : les championnats existants basculent tous sur
-- « neutre », c'est-à-dire l'apparence qu'ils ont déjà aujourd'hui — la
-- colonne est neuve, aucun écran ne peut régresser.
alter table public.contests
  add column if not exists theme text not null default 'neutre';

-- Le CHECK est posé À PART et NOMMÉ, contrairement à celui du calendrier
-- que 20260728120000 a écrit en ligne dans son `create table`. La
-- section 3 ci-dessous paie exactement le prix de ce raccourci : elle doit
-- deviner le nom que Postgres a choisi pour pouvoir l'élargir. Une
-- contrainte nommée à la main s'élargit sans deviner quoi que ce soit.
alter table public.contests
  drop constraint if exists contests_theme_check;
alter table public.contests
  add constraint contests_theme_check
  check (theme in ('neutre', 'noel', 'saint_valentin', 'anniversaire',
                   'soldes', 'festival'));

comment on column public.contests.theme is
  'Thème saisonnier d''affichage (défaut « neutre »). MÊME palette que public.calendars.theme — à ne pas confondre avec public.quizzes.theme, qui nomme un usage métier (gourmand, dégustation, culture…) et non une saison. Aucune règle métier n''en dépend : la déclinaison visuelle est côté UI.';

-- ── 2. Le réglage est ATTEIGNABLE ───────────────────────────
-- INSERT : rien à faire, et c'est vérifié plutôt que supposé. `contests`
-- reçoit son insertion AU NIVEAU TABLE depuis 00022 (ligne 134,
-- `grant select, insert, update, delete on public.contests, …`) et rien ne
-- l'a revoquée depuis : 00023 n'a retiré `insert` que sur contest_players
-- et contest_predictions (lignes 222-223), 20260719040000 n'a retiré que
-- `delete` (ligne 24). Une colonne neuve est donc insérable d'office et un
-- `grant insert (theme)` n'ajouterait rien — il donnerait seulement
-- l'illusion, au lecteur suivant, que cette table est en liste blanche à
-- l'insertion comme `calendars`. Elle ne l'est pas.
--
-- UPDATE : liste blanche, en revanche. 00023 (ligne 227) puis
-- 20260721150000 (ligne 400) ont revoqué l'UPDATE de table pour ne rendre
-- que des colonnes nommées — `status` et `rewards` ne s'écrivent plus qu'à
-- travers `set_contest_status` et les RPC de règlement, qui portent les
-- règles métier et l'audit.
--
-- La liste est réémise EN ENTIER. Un `grant update (col)` supplémentaire
-- s'AJOUTE aux privilèges déjà là plutôt que de les remplacer — l'écrire
-- en entier ne change donc rien à l'effet, mais laisse le fichier lisible
-- comme l'état voulu, exactement ce qu'ont fait 20260804120000 (ligne 139)
-- et 20260904120000 (ligne 236) avant lui.
--
-- État visé, et rien de plus : `theme` rejoint les réglages libres, cadré
-- par le CHECK ci-dessus et par la RLS `is_org_editor` existante (policy
-- « contests: editors », 00022 ligne 114 — jamais redéfinie depuis). Un
-- champ d'affichage borné par un CHECK ne justifie pas une RPC dédiée.
-- `status`, `rewards`, `slug`, `competition_key` et `finalized_at` restent
-- HORS liste.
grant update (name, collect_email, collect_phone, code_ttl_seconds, theme)
  on public.contests to authenticated;

-- ── 3. Le calendrier gagne la Saint-Valentin ────────────────
-- La contrainte d'origine est posée EN LIGNE dans le `create table`
-- (20260728120000, lignes 91-92) : Postgres l'a donc nommée par sa règle
-- <table>_<colonne>_check, soit `calendars_theme_check`. Un CHECK ne
-- s'élargit pas sur place — on le retire et on le repose sous le même nom,
-- la nouvelle clé en plus.
--
-- Aucune ligne existante ne peut être invalidée par ce remplacement : le
-- domaine ne fait que grandir. Le `drop … if exists` couvre le cas d'une
-- base où la contrainte porterait déjà un autre nom (aucune connue), et
-- l'`add` la repose dans tous les cas.
alter table public.calendars
  drop constraint if exists calendars_theme_check;
alter table public.calendars
  add constraint calendars_theme_check
  check (theme in ('neutre', 'noel', 'saint_valentin', 'anniversaire',
                   'soldes', 'festival'));

comment on column public.calendars.theme is
  'Thème saisonnier d''affichage (défaut « neutre »). MÊME palette que public.contests.theme depuis 20260917120000 : toute clé ajoutée ici doit l''être là-bas, et réciproquement.';

-- Les privilèges du calendrier n'ont RIEN à recevoir : `theme` figure déjà
-- dans les deux listes blanches, réémises en dernier lieu par
-- 20260904120000 (lignes 237-246). C'est une valeur de plus dans un domaine
-- déjà atteignable, pas une colonne de plus.
