-- ============================================================
-- Partage après jeu — rendre le bloc « Faites gagner vos proches » réglable
--
-- Après une partie, /play affiche un bloc de partage générique (composant
-- `ShareInvite`) invitant le joueur à faire connaître le jeu autour de lui.
-- Ce bloc était rendu SANS AUCUN RÉGLAGE COMMERÇANT : il s'affichait sur
-- toutes les campagnes, de toutes les organisations, sans qu'aucun écran ne
-- permette de l'éteindre. Cette migration lui donne son interrupteur.
--
-- POURQUOI PAR CAMPAGNE, ET NON PAR ORGANISATION : c'est le même arbitrage
-- que 20260918120000 a tranché pour `prejeu_invitation`, et il tombe ici
-- entièrement du côté campagne. Il n'y a pas de « lien » ni d'actif partagé
-- à ranger sur l'organisation — le partage est générique, il ne pointe vers
-- aucun compte à renseigner. Ne reste que l'activation, et proposer le
-- partage sur l'opération de Noël mais pas sur un jeu interne de formation
-- est un choix par opération.
--
-- POURQUOI PAS `referral_programs.enabled` : ce sont DEUX OBJETS DISTINCTS
-- qu'il ne faut pas fondre. `referral_programs.enabled` gouverne le
-- PARRAINAGE RÉCOMPENSÉ — un filleul suivi, une contrepartie octroyée, donc
-- une mécanique de gain avec ses règles. `share_enabled` ne gouverne qu'un
-- bloc d'affichage : rien n'est suivi, rien n'est octroyé, rien ne change au
-- tirage. Les brancher sur le même booléen forcerait le commerçant qui veut
-- simplement laisser ses joueurs partager à ouvrir un programme de
-- parrainage, et inversement — deux réglages sans rapport, un seul bouton.
--
-- POURQUOI `default true`, alors que `prejeu_invitation` est `default false` :
-- les deux défauts disent la même chose — « ne change rien à l'existant » —
-- et c'est l'existant qui diffère. L'invitation avant-jeu était une
-- fonctionnalité NEUVE : la mettre à `true` aurait ajouté un écran à des
-- campagnes qui ne l'avaient jamais demandé. Le partage après jeu, lui,
-- S'AFFICHE DÉJÀ partout aujourd'hui : le mettre à `false` l'aurait retiré
-- en silence de toutes les campagnes en production le jour du déploiement.
-- Un défaut n'est pas une préférence produit, c'est la valeur qui préserve
-- le comportement observé.
--
-- PORTÉE : toutes les mécaniques servies par /play — la roue, les treize
-- jeux de révélation et les six jeux de défi (skill-gated). Le bloc est
-- post-partie et commun à toutes ; un booléen unique par campagne suffit
-- donc, il n'y a pas de variante par mécanique à prévoir.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : aucune table neuve, donc aucune
-- policy RLS neuve. `campaigns` est déjà sous RLS et ses policies portent
-- sur la LIGNE — une colonne ajoutée hérite de l'isolation existante. Ce
-- qui ne s'hérite pas, ce sont les GRANTS DE COLONNE : voir la section 2.
-- ============================================================

-- ── 1. L'activation, au niveau campagne ─────────────────────
alter table public.campaigns
  add column if not exists share_enabled boolean not null default true;

comment on column public.campaigns.share_enabled is
  'Affiche ou non, APRÈS la partie, le bloc de partage générique « Faites gagner vos proches » (composant ShareInvite sur /play). Vaut pour TOUTES les mécaniques : roue, jeux de révélation, jeux de défi. À NE PAS CONFONDRE avec referral_programs.enabled, qui gouverne le parrainage RÉCOMPENSÉ (filleul suivi, contrepartie octroyée) : ce booléen-ci ne suit rien et n''octroie rien, c''est un réglage d''affichage — ni porte, ni condition d''octroi, aucun effet sur le tirage. default true = le comportement historique (bloc toujours affiché) est conservé pour les campagnes existantes.';

-- ── 2. L'activation est ÉCRIVABLE par le dashboard ──────────
--
-- `campaigns` n'accorde PAS l'UPDATE au niveau table : 00018 le faisait, mais
-- 20260905120000 puis 20260906120000 l'ont révoqué pour le re-donner colonne
-- par colonne (c'est ainsi que `status` a été fermé à l'écriture directe).
-- Conséquence en deux temps, documentée en détail en 20260918120000 §4 :
--   * SELECT et INSERT restent des privilèges de TABLE — la colonne neuve est
--     lisible et insérable d'office. Un `grant select (share_enabled)`
--     n'ajouterait rien et laisserait croire que `campaigns` est en liste
--     blanche à la lecture. Elle ne l'est pas.
--   * UPDATE est en liste blanche de COLONNES — la colonne neuve n'y est pas,
--     donc elle n'est PAS écrivable tant qu'on ne l'ajoute pas. Sans la ligne
--     ci-dessous, l'interrupteur du dashboard échouerait à l'enregistrement.
--
-- Grant ADDITIF plutôt que réémission de la liste : un `grant update (col)`
-- mord contre un jeu de grants déjà par colonne. Réémettre la liste complète
-- recopierait un inventaire que ce lot ne gouverne pas et l'écraserait en
-- silence si un autre chantier l'a fait bouger entre-temps.
--
-- Écrivable par le marchand, comme `collect_email`, `engagement` ou
-- `prejeu_invitation` : réglage d'opération qui ne publie rien et n'ouvre
-- aucun accès. Le fermer n'apporterait qu'un aller-retour serveur de plus.
grant update (share_enabled) on public.campaigns to authenticated;
