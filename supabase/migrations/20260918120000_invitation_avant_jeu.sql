-- ============================================================
-- Invitation avant-jeu — noter la page Google, suivre Instagram / TikTok
--
-- Le commerçant peut proposer au joueur, AVANT un jeu instantané, de noter sa
-- page Google et/ou de le suivre sur Instagram ou TikTok. L'invitation est
-- NON BLOQUANTE : elle s'affiche, le joueur passe outre s'il le veut, et le
-- jeu se déroule identiquement dans les deux cas. Aucune règle de tirage,
-- aucun octroi, aucune éligibilité n'en dépend — c'est un écran, pas une
-- porte.
--
-- DEUX NIVEAUX, ET C'EST LE CŒUR DU MODÈLE :
--
--   * les LIENS vivent sur l'ORGANISATION. Une page Google, un compte
--     Instagram, un compte TikTok sont la propriété de l'établissement, pas
--     d'une campagne : les recopier par campagne obligerait le commerçant à
--     les ressaisir à chaque nouveau jeu et ferait diverger silencieusement
--     les campagnes le jour d'un changement de compte.
--
--   * l'ACTIVATION vit sur la CAMPAGNE (`prejeu_invitation`). Proposer
--     l'invitation sur l'opération de Noël et pas sur celle des soldes est un
--     choix par opération.
--
-- POURQUOI PAS `organizations.engagement` : cette colonne A EXISTÉ (00003)
-- puis a été DÉPLACÉE sur `campaigns` (00004) quand l'engagement était une
-- PORTE — une condition à franchir pour jouer. Ce n'est plus le modèle ici :
-- `campaigns.engagement` reste ce qu'elle est, l'invitation avant-jeu est un
-- objet distinct qui ne conditionne rien. Réutiliser le nom aurait fait
-- porter deux sémantiques opposées (bloquante / non bloquante) au même
-- champ ; le premier lecteur à ne pas connaître l'histoire aurait tranché
-- dans le mauvais sens.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : aucune nouvelle table, donc aucune
-- policy RLS neuve. `organizations` et `campaigns` sont déjà sous RLS et
-- leurs policies portent sur la LIGNE — une colonne ajoutée hérite de
-- l'isolation existante. Ce qui ne s'hérite pas, en revanche, ce sont les
-- GRANTS DE COLONNE : c'est tout l'objet des sections 2 et 4 ci-dessous.
-- ============================================================

-- ── 1. Les liens, au niveau organisation ────────────────────
--
-- `not null default ''` plutôt que `null` : trois colonnes optionnelles dont
-- « non renseigné » se lit d'une seule façon. Un mélange NULL / '' obligerait
-- chaque lecture à traiter les deux, et l'app finirait par en oublier un.
--
-- Le CHECK est posé À PART et NOMMÉ À LA MAIN, comme 20260917120000 l'a fait
-- pour `contests_theme_check` et pour la raison qu'il documente : un CHECK
-- écrit en ligne reçoit un nom DEVINÉ par Postgres, et l'élargissement
-- suivant doit deviner ce nom à son tour. Ici l'élargissement est prévisible
-- — une plateforme de plus, une longueur revue — donc la contrainte se nomme
-- tout de suite.
--
-- `https://` EXIGÉ, pas `https?://` : ces liens sont rendus au joueur dans un
-- contexte mobile, et un lien `http://` y est au mieux réécrit, au pire
-- bloqué. Le quiz accepte `https?://` pour ses images (20260803120000:590) ;
-- la méta-progression exige `https://` (20260805200000:178). C'est la
-- seconde qui fait autorité pour un lien SORTANT CLIQUÉ.
alter table public.organizations
  add column if not exists google_review_url text not null default '';
alter table public.organizations
  add column if not exists instagram_url text not null default '';
alter table public.organizations
  add column if not exists tiktok_url text not null default '';

alter table public.organizations
  drop constraint if exists organizations_google_review_url_check;
alter table public.organizations
  add constraint organizations_google_review_url_check
  check (google_review_url = ''
         or (google_review_url ~ '^https://'
             and char_length(google_review_url) <= 300));

alter table public.organizations
  drop constraint if exists organizations_instagram_url_check;
alter table public.organizations
  add constraint organizations_instagram_url_check
  check (instagram_url = ''
         or (instagram_url ~ '^https://'
             and char_length(instagram_url) <= 300));

alter table public.organizations
  drop constraint if exists organizations_tiktok_url_check;
alter table public.organizations
  add constraint organizations_tiktok_url_check
  check (tiktok_url = ''
         or (tiktok_url ~ '^https://'
             and char_length(tiktok_url) <= 300));

comment on column public.organizations.google_review_url is
  'Lien vers la page d''avis Google de l''établissement, affiché aux joueurs avant un jeu instantané. Invitation NON bloquante : le joueur peut passer outre, le jeu est identique dans les deux cas. Propriété de l''établissement (le lien), activée par campagne (campaigns.prejeu_invitation). '''' = non renseigné. Écriture serveur uniquement, après garde owner.';

comment on column public.organizations.instagram_url is
  'Lien vers le compte Instagram de l''établissement, affiché aux joueurs avant un jeu instantané. Invitation NON bloquante : aucun suivi n''est vérifié ni exigé, rien ne conditionne le tirage. '''' = non renseigné. Écriture serveur uniquement, après garde owner.';

comment on column public.organizations.tiktok_url is
  'Lien vers le compte TikTok de l''établissement, affiché aux joueurs avant un jeu instantané. Invitation NON bloquante : aucun suivi n''est vérifié ni exigé, rien ne conditionne le tirage. '''' = non renseigné. Écriture serveur uniquement, après garde owner.';

-- ── 2. Les liens sont LISIBLES du dashboard ─────────────────
--
-- `organizations` n'accorde à `authenticated` qu'une LISTE EXPLICITE de
-- colonnes depuis 00017 (lignes 87-92) : il n'y a AUCUN privilège de table,
-- et une colonne ajoutée ensuite est invisible tant qu'elle n'est pas nommée
-- ici. Vérifié sur le catalogue vivant avant d'écrire cette ligne, et non
-- déduit de la migration d'origine :
--   has_table_privilege('authenticated','public.organizations','SELECT') → f
--   relacl = {…,authenticated=Dxtm/postgres,…}   (ni r, ni a, ni w, ni d)
-- Sans ce grant, l'écran de Réglages qui doit afficher les trois liens lirait
-- trois NULL sans la moindre erreur — le réglage serait muet, pas cassé.
--
-- AUCUN `grant update`, ET C'EST DÉLIBÉRÉ. 00017 (lignes 80-92) a fermé
-- l'écriture directe des réglages d'organisation par les membres : la table
-- ne porte aucune policy UPDATE (asserté security_acl.test.sql:581) et
-- `authenticated` n'a pas un seul privilège UPDATE de colonne. L'écriture de
-- ces trois liens passe donc par le serveur en service_role APRÈS garde
-- owner, comme tous les autres réglages. Un `grant update` ici rendrait un
-- membre `editor` — voire `cashier` — capable de réécrire l'adresse vers
-- laquelle on envoie les joueurs, ce qui est exactement le geste qu'un
-- attaquant ayant obtenu un compte secondaire chercherait à faire.
grant select (google_review_url, instagram_url, tiktok_url)
  on public.organizations to authenticated;

-- ── 3. L'activation, au niveau campagne ─────────────────────
--
-- `default false` : aucune campagne existante ne change de comportement. Le
-- commerçant active l'invitation quand il a saisi ses liens, jamais avant.
alter table public.campaigns
  add column if not exists prejeu_invitation boolean not null default false;

comment on column public.campaigns.prejeu_invitation is
  'Propose au joueur, AVANT le jeu instantané, de noter la page Google et/ou de suivre les comptes sociaux de l''établissement (organizations.google_review_url / instagram_url / tiktok_url). Invitation NON bloquante : le joueur passe outre s''il le veut et le tirage est identique dans les deux cas — ce booléen n''est ni une porte, ni une condition d''octroi. Sans lien renseigné côté organisation, l''activation n''affiche rien.';

-- ── 4. L'activation est ÉCRIVABLE par le dashboard ──────────
--
-- ATTENTION, LA CARTOGRAPHIE D'ENTRÉE ÉTAIT PÉRIMÉE ICI : 00018 (ligne 16)
-- accordait bien `select, insert, update, delete` AU NIVEAU TABLE sur
-- `campaigns`, mais 20260905120000 (ligne 295) puis 20260906120000
-- (ligne 297) ont RÉVOQUÉ l'UPDATE de table pour le re-donner colonne par
-- colonne — c'est ainsi que `status` a été fermé à l'écriture directe. État
-- constaté sur le catalogue vivant :
--   has_table_privilege('authenticated','public.campaigns','UPDATE')  → f
--   has_table_privilege('authenticated','public.campaigns','SELECT')  → t
--   has_table_privilege('authenticated','public.campaigns','INSERT')  → t
--   relacl = {…,authenticated=ardDxtm/postgres,…}   (a, r, d — pas de w)
--
-- CONSÉQUENCE EN DEUX TEMPS, et les deux comptent :
--   * SELECT et INSERT restent des privilèges de TABLE : la colonne neuve est
--     lisible et insérable d'office. Un `grant select (prejeu_invitation)`
--     n'ajouterait rien et laisserait croire au lecteur suivant que
--     `campaigns` est en liste blanche à la lecture. Elle ne l'est pas.
--   * UPDATE est en liste blanche de COLONNES : la colonne neuve n'y est pas,
--     donc elle n'est PAS écrivable tant qu'on ne l'ajoute pas. Sans la ligne
--     ci-dessous, l'interrupteur du dashboard échouerait à l'enregistrement.
--
-- Le grant est ADDITIF plutôt qu'une réémission de la liste des douze. Un
-- `grant update (col)` mord contre un jeu de grants déjà par colonne (c'est
-- le cas symétrique de celui mesuré en 20260906120000 : ce qui ne mord pas,
-- c'est une RÉVOCATION de colonne contre un grant de TABLE). Réémettre les
-- treize colonnes recopierait une liste que ce lot ne gouverne pas, et
-- l'écraserait en silence si un autre chantier l'a fait bouger entre-temps.
--
-- `prejeu_invitation` est écrivable par le marchand — contrairement aux liens
-- de la section 2 — parce qu'elle est un réglage d'opération de même nature
-- que `collect_email`, `collect_phone` ou `engagement`, déjà dans la liste.
-- Elle ne publie rien et n'ouvre aucun accès : la fermer n'apporterait rien
-- qu'un aller-retour serveur de plus.
grant update (prejeu_invitation) on public.campaigns to authenticated;
