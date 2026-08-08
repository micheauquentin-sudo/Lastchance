-- ============================================================
-- Partage après jeu — le quiz public reçoit le même interrupteur
--
-- Miroir de 20260919120000, qui a donné son réglage au bloc de partage de
-- /play. L'audit des autres surfaces a montré que la page publique du quiz
-- porte EXACTEMENT le même défaut : `quiz-experience.tsx` rend deux boutons
-- de partage du lien /quiz/<slug> — « 📣 Défier un ami » (l. 1691) et
-- « Partager mon score » (l. 1368) — sans qu'aucun réglage commerçant ne les
-- gouverne. Ils s'affichent sur tous les quiz, de toutes les organisations,
-- et aucun écran ne permet de les éteindre. Cette migration leur donne leur
-- interrupteur, et le même qu'aux campagnes.
--
-- POURQUOI UNE COLONNE SUR `quizzes`, ET NON UNE RÉUTILISATION DE
-- `campaigns.share_enabled` : les deux surfaces n'ont pas de parente commune.
-- Un quiz n'appartient pas à une campagne — `quizzes` pend directement de
-- l'organisation, et `target_wheel_id` ne pointe une roue que pour l'octroi
-- d'un tour, pas pour l'affichage. Faire lire aux boutons du quiz le réglage
-- d'une campagne obligerait à en désigner une, arbitrairement, sur un module
-- qui n'en a pas. Deux surfaces, deux booléens, même nom.
--
-- POURQUOI `default true`, comme pour `campaigns` : même raison, et c'est la
-- seule qui compte — les boutons S'AFFICHENT DÉJÀ sur tous les quiz en
-- production. Un `default false` les retirerait en silence le jour du
-- déploiement. Le défaut n'est pas une préférence produit, c'est la valeur
-- qui préserve le comportement observé.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : aucune table neuve, donc aucune policy
-- RLS neuve. `quizzes` est déjà sous RLS et ses policies portent sur la LIGNE
-- — une colonne ajoutée hérite de l'isolation existante. Ce qui ne s'hérite
-- pas, ce sont les GRANTS DE COLONNE : voir la section 2, dont le régime
-- DIFFÈRE de celui de `campaigns`.
-- ============================================================

-- ── 1. L'activation, au niveau quiz ─────────────────────────
alter table public.quizzes
  add column if not exists share_enabled boolean not null default true;

comment on column public.quizzes.share_enabled is
  'Affiche ou non, côté joueur, les boutons de partage du LIEN PUBLIC du quiz (/quiz/<slug>) : « Défier un ami » et « Partager mon score » (composant quiz-experience). Miroir de campaigns.share_enabled (20260919120000) : deux surfaces distinctes, deux booléens, parce qu''un quiz ne pend d''aucune campagne. Réglage d''AFFICHAGE uniquement — rien n''est suivi, rien n''est octroyé, aucun effet sur le score, le classement ni le tirage : à ne pas confondre avec le parrainage récompensé (referral_programs.enabled). default true = le comportement historique (boutons toujours affichés) est conservé pour les quiz existants.';

-- ── 2. L'activation est ÉCRIVABLE par le dashboard ──────────
--
-- RÉGIME DE DROITS DE `quizzes`, RELEVÉ SUR LE CATALOGUE VIVANT (et non sur
-- la migration d'origine — `relacl` valait `authenticated=rd/postgres`) :
--   * SELECT : privilège de TABLE (`r`). La colonne neuve est lisible
--     d'office. Un `grant select (share_enabled)` n'ajouterait rien et
--     laisserait croire que `quizzes` est en liste blanche à la lecture.
--     Elle ne l'est pas.
--   * DELETE : privilège de TABLE (`d`). Hors sujet ici.
--   * INSERT et UPDATE : listes blanches de COLONNES, toutes deux —
--     `has_table_privilege(...,'INSERT')` et `(...,'UPDATE')` valent FALSE.
--     Une colonne neuve n'entre dans NI L'UNE NI L'AUTRE toute seule.
--
-- C'EST LÀ QUE `quizzes` DIVERGE DE `campaigns`, et la divergence est le seul
-- point où ce lot n'est pas un calque du précédent. Sur `campaigns`, SELECT
-- et INSERT sont tous deux des privilèges de table : seul l'UPDATE demandait
-- un grant. Ici l'INSERT est en liste blanche depuis l'origine
-- (20260803120000), et le suivant l'a confirmé : 20260904120000 a dû y
-- ajouter `code_ttl_days` explicitement, avec ce motif — « sans elle, le
-- réglage ne serait posable qu'APRÈS création ». On applique le même geste.
--
-- L'INSERT ne débloque rien aujourd'hui : `createQuiz` (src/actions/quiz.ts)
-- n'écrit que `organization_id` et `name`, et une colonne absente d'un INSERT
-- prend son défaut sans qu'aucun droit ne soit exigé sur elle. Il est accordé
-- pour que le jour où une création — ou une duplication de quiz, qui
-- n'existe pas encore — porte le réglage, elle ne bute pas sur un 403 que
-- rien dans le code ne laisserait prévoir.
--
-- Grants ADDITIFS plutôt que réémission des listes, comme en 20260919120000
-- et à la différence de 20260904120000 qui les réémettait en entier : un
-- `grant (col)` s'ajoute à des grants déjà par colonne et mord seul.
-- Réémettre l'inventaire complet recopierait ici un état que ce lot ne
-- gouverne pas — et l'écraserait en silence si un autre chantier l'a fait
-- bouger entre-temps. `status` en est l'exemple vivant : révoqué par
-- 20260905120000, il reviendrait par une réémission distraite.
--
-- Écrivable par le marchand, comme `intro_text` ou `theme` : réglage
-- d'affichage qui ne publie rien et n'ouvre aucun accès. Les colonnes qui
-- portent une règle métier ou un audit (`status`, `reward_claimed_count`,
-- `draw_state`, `drawn_at`) restent hors UPDATE, inchangé.
grant insert (share_enabled) on public.quizzes to authenticated;
grant update (share_enabled) on public.quizzes to authenticated;
