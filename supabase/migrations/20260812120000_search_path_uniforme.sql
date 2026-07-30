-- ============================================================
-- Lastchance — `search_path = ''` sur les 22 dernières fonctions
--
-- ── Ce que ce chantier EST, et ce qu'il n'est PAS ──
--
-- Ce n'est **pas** un correctif de faille, et il ne faut pas le présenter
-- ainsi. L'attaque que `search_path` protège — masquer un objet dans un schéma
-- résolu implicitement — exige de pouvoir CRÉER dans ce schéma. Mesuré sur ce
-- projet : `anon`, `authenticated` et `service_role` ont tous `CREATE = false`
-- sur `public`. La porte était déjà fermée.
--
-- C'est du durcissement en profondeur, et surtout un gain d'INVARIANT : après
-- cette migration, 100 % des fonctions du schéma `public` portent
-- `search_path = ''`. Un écart futur devient détectable par une seule requête
-- sur `pg_proc.proconfig`, au lieu d'une liste de 22 exceptions à retenir. Une
-- règle vérifiable vaut mieux qu'une liste dans une tête.
--
-- ── Pourquoi `alter function` et JAMAIS `drop` ──
--
-- `is_org_member` et `is_org_owner` sont référencés par des policies réparties
-- sur dix-neuf fichiers de migration. Un `drop function … cascade` supprimerait
-- ces policies EN SILENCE et laisserait les tables en RLS actif avec zéro
-- policy — c'est-à-dire tout le produit marchand fermé, sans une seule erreur
-- à l'écran. `alter function` préserve l'OID et donc toutes les dépendances.
--
-- ── Pourquoi c'est sûr : la vérification, pas la conviction ──
--
-- Passer à `''` casse toute fonction dont le corps référence un objet sans le
-- qualifier. Les 22 corps ont été lus dans le CATALOGUE VIVANT (`pg_proc`), et
-- non dans les migrations d'origine — sept d'entre elles ont une définition
-- d'origine périmée, dont `org_team_members`, dont l'archive porte encore
-- `is_org_member` là où la version vivante exige `is_org_owner`.
--
-- Résultat : aucun symbole nu. Les seules constructions qui en avaient l'air
-- sont, vérification faite, `extract(epoch from now())` (syntaxe), `join
-- lateral (` (sous-requête), `from base` (CTE) et `returning … into <var>`
-- (variable plpgsql). Tous les appels de fonction nus appartiennent à
-- `pg_catalog`, qui reste résolu quel que soit le `search_path`.
--
-- **La preuve empirique existait déjà** : `is_org_editor` (00019) a le même
-- corps, sur la même table, avec le même `auth.uid()`, et tourne en production
-- sous `search_path = ''` depuis des semaines — avec 119 références de policy,
-- soit plus que `is_org_member` (81) et `is_org_owner` (33) réunis.
--
-- ── Le contrôle négatif qui rend ce chantier réfutable ──
--
-- Si `''` cassait `is_org_member`, le prédicat renverrait `false` partout et le
-- produit se FERMERAIT : `security_acl.test.sql` s'effondrerait. Une suite
-- pgTAP intégralement verte après cette migration est donc la démonstration —
-- et non l'absence d'erreur au déploiement, qui ne prouverait rien.
-- ============================================================

alter function public.accept_team_invitation(p_invitation_id uuid) set search_path = '';
alter function public.admin_participations_daily(p_days integer) set search_path = '';
alter function public.admin_top_merchants(p_limit integer) set search_path = '';
alter function public.admin_user_id_by_email(p_email text) set search_path = '';
alter function public.campaign_prize_performance(p_campaign_id uuid) set search_path = '';
alter function public.check_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer) set search_path = '';
alter function public.create_campaign_with_defaults(org_id uuid, campaign_name text, wheel_style jsonb, default_prizes jsonb) set search_path = '';
alter function public.create_organization(org_name text, org_slug text) set search_path = '';
alter function public.decrement_prize_stock(p_prize_id uuid) set search_path = '';
alter function public.grant_first_super_admin(p_email text) set search_path = '';
alter function public.increment_qr_scan(p_slug text) set search_path = '';

-- Les deux prédicats de la RLS du produit. Rien de particulier à faire ici :
-- c'est le `drop` qui aurait été catastrophique, pas l'`alter`.
alter function public.is_org_member(org_id uuid) set search_path = '';
alter function public.is_org_owner(org_id uuid) set search_path = '';

alter function public.lookup_redeem_code(p_organization_id uuid, p_redeem_code text) set search_path = '';
alter function public.org_customer_profiles(p_organization_id uuid) set search_path = '';
alter function public.org_reengagement_targets(p_organization_id uuid, p_inactive_days integer, p_cooldown_days integer) set search_path = '';
alter function public.org_segment_counts(p_organization_id uuid) set search_path = '';
alter function public.org_segment_emails(p_organization_id uuid, p_segment text, p_loyal_wins integer, p_inactive_days integer) set search_path = '';
alter function public.org_team_members(p_organization_id uuid) set search_path = '';
alter function public.prune_rate_limits(p_older_than_seconds integer) set search_path = '';
alter function public.redeem_participation(p_organization_id uuid, p_participation_id uuid) set search_path = '';
alter function public.restore_prize_stock(p_prize_id uuid) set search_path = '';
