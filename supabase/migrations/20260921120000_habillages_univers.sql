-- ============================================================
-- Habillages d'univers — la palette partagée passe de 6 à 11 clés
--
-- Le propriétaire a fourni dix fonds cartoon (public/fonds/, un par clé
-- sauf « neutre » qui est l'absence de fond). Cinq d'entre eux n'ont
-- aujourd'hui aucune clé pour les désigner : `prairie`, `musique`,
-- `football`, `restaurant`, `espace`. Ce fichier les ajoute AUX DEUX
-- CHECK de la palette partagée, et rien d'autre.
--
-- 1. LE VOCABULAIRE S'ÉLARGIT, ET C'EST ASSUMÉ. 20260917120000 appelait
--    ce champ un « thème saisonnier » parce que ses six clés nommaient
--    toutes une saison ou un moment de l'année. Les cinq nouvelles n'en
--    nomment aucune : une prairie, un stade, un restaurant ne sont pas
--    des dates. Le concept devient donc « habillage saisonnier OU
--    d'univers » — les deux `comment on column` sont réécrits en
--    conséquence (section 3), plutôt que de laisser un commentaire
--    décrire un domaine qu'il ne couvre plus.
--
--    Ce qui NE change pas, c'est la règle que 20260917120000 a posée :
--    `contests.theme` et `calendars.theme` partagent UN SEUL domaine,
--    donc toute clé ajoutée d'un côté doit l'être de l'autre. C'est
--    précisément ce que fait ce fichier, dans le même commit.
--
-- 2. LE QUIZ NE BOUGE TOUJOURS PAS (`quizzes_theme_check`,
--    20260803120000). Ses clés nomment un USAGE MÉTIER (gourmand,
--    dégustation, culture…), pas un décor. La raison écrite en 2026-09-17
--    tient mot pour mot : aligner les deux ferait proposer « espace » à un
--    quiz de dégustation et « dégustation » à un calendrier de l'Avent.
--
-- 3. LA ROUE N'A RIEN À RECEVOIR ICI. Son habillage passe par le JSONB
--    `wheels.style`, qui n'a pas de domaine énuméré en base — aucune
--    contrainte à élargir, donc aucune ligne dans cette migration.
--
-- Côté base ce reste un champ d'affichage : aucune règle métier n'en
-- dépend, et AUCUNE LIGNE EXISTANTE N'EST INVALIDÉE — le domaine ne fait
-- que GRANDIR, l'ancien reste inclus dans le nouveau. C'est la même
-- justification qu'en 20260917120000 (l. 89-92), et elle est ce qui
-- autorise un drop/recreate de CHECK sans validation préalable des
-- données.
-- ============================================================

-- ── 1. Les pronostics : la palette élargie ──────────────────
-- Contrainte NOMMÉE à la main par 20260917120000 (l. 40-45), et jamais
-- redéfinie depuis : on la retire et on la repose sous le même nom, les
-- cinq clés en plus. Les six premières gardent leur ordre d'origine et
-- les nouvelles sont ajoutées à la suite — le diff se lit alors comme
-- « cinq valeurs ajoutées » plutôt que comme une réécriture.
alter table public.contests
  drop constraint if exists contests_theme_check;
alter table public.contests
  add constraint contests_theme_check
  check (theme in ('neutre', 'noel', 'saint_valentin', 'anniversaire',
                   'soldes', 'festival', 'prairie', 'musique', 'football',
                   'restaurant', 'espace'));

-- ── 2. Le calendrier : exactement la même liste ─────────────
-- Même geste, même liste, dans le même ordre. Une divergence entre les
-- deux `check (…)` ci-dessus et ci-dessous est LE défaut que ce chantier
-- peut produire : le test pgTAP énumère donc les onze clés une par une
-- sur CHAQUE table plutôt que de vérifier que « le CHECK existe ».
alter table public.calendars
  drop constraint if exists calendars_theme_check;
alter table public.calendars
  add constraint calendars_theme_check
  check (theme in ('neutre', 'noel', 'saint_valentin', 'anniversaire',
                   'soldes', 'festival', 'prairie', 'musique', 'football',
                   'restaurant', 'espace'));

-- ── 3. Les commentaires disent le domaine réel ──────────────
comment on column public.contests.theme is
  'Habillage saisonnier ou d''univers (défaut « neutre »). MÊME palette que public.calendars.theme — à ne pas confondre avec public.quizzes.theme, qui nomme un usage métier (gourmand, dégustation, culture…) et relève d''un troisième domaine. Aucune règle métier n''en dépend : la déclinaison visuelle est côté UI.';

comment on column public.calendars.theme is
  'Habillage saisonnier ou d''univers (défaut « neutre »). MÊME palette que public.contests.theme depuis 20260917120000, élargie aux univers par 20260921120000 : toute clé ajoutée ici doit l''être là-bas, et réciproquement.';

-- ── 4. Aucun grant, et c'est vérifié plutôt que supposé ─────
-- `theme` figure DÉJÀ dans les listes blanches des deux tables :
-- 20260917120000 (l. 79-80) pour l'UPDATE de `contests`, dont l'INSERT
-- est au niveau table depuis 00022 ; 20260904120000 (l. 237-246) pour
-- l'INSERT et l'UPDATE de `calendars`. Ce sont cinq valeurs de plus dans
-- un domaine déjà atteignable, pas des colonnes de plus — un `grant`
-- ici n'ajouterait rien et laisserait croire au lecteur suivant que
-- l'ajout d'une clé de palette exige un privilège. Les assertions de
-- privilège du test pgTAP gardent cette propriété.
