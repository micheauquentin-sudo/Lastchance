-- ════════════════════════════════════════════════════════════
-- ACL — QUATORZE PRIVILÈGES QUE LA PRODUCTION AVAIT ET QUE LE DÉPÔT IGNORAIT
--
-- Trouvés par `supabase db diff --linked` en marge de VIT-13, puis confirmés :
-- ces quatorze privilèges de table existent en PRODUCTION et sont ABSENTS de la
-- base construite à partir des migrations. Le dépôt ne les décrivait donc pas,
-- personne ne les avait décidés, et aucune garde ne les voyait.
--
-- ── CE QUE C'EST, ET CE QUE CE N'EST PAS ──
--
-- Ce N'EST PAS une porte ouverte. La RLS est active sur les sept tables, et
-- c'est elle qui décide réellement. `audit_logs` en est l'exemple : elle porte
-- `delete` et `update` pour `authenticated` en production, mais UNE SEULE
-- politique — « audit: owner select », en SELECT. Sous RLS, une commande sans
-- politique qui l'autorise est refusée : personne ne peut effacer un journal
-- d'audit aujourd'hui.
--
-- C'EST de la défense en profondeur ÉRODÉE. Le jour où l'on ajoute une
-- politique `for all` un peu large sur l'une de ces tables — le geste le plus
-- banal du monde — le privilège est déjà là pour l'accompagner, et personne ne
-- pense à le chercher. Le `grant` est la seconde serrure ; elle doit être
-- fermée quand elle n'est pas utilisée.
--
-- ── POURQUOI RÉVOQUER EST SÛR, ET COMMENT ON LE SAIT ──
--
-- Trois preuves, dans l'ordre de force croissante.
--
--  1. La base LOCALE, construite à partir des seules migrations, n'a AUCUN de
--     ces quatorze privilèges. La CI tourne dessus — pgTAP, ACL, et la suite
--     E2E Playwright complète — et passe au vert.
--  2. L'audit du code : toutes les écritures applicatives sur `spins`,
--     `participations`, `audit_logs` et `organizations` passent par le client
--     `admin` (service_role), que ce fichier ne touche pas.
--  3. La SEULE écriture faite depuis la session de l'utilisateur sur ces sept
--     tables est `organization_members` en DELETE (`src/actions/team.ts`), et
--     elle n'est pas révoquée ici. La liste ci-dessous a été établie par
--     différence avec l'usage réel, pas par principe.
--
-- ── `revoke` EST IDEMPOTENT ──
--
-- Révoquer un privilège non accordé ne lève pas : ce fichier est donc sans
-- effet sur toute base déjà conforme — la locale, la CI, et la production une
-- fois qu'elle l'aura reçu.
--
-- La garde qui empêche le retour de cette dérive vit dans
-- `supabase/tests/security_acl.test.sql`.
-- ════════════════════════════════════════════════════════════

-- Le journal d'audit ne s'écrit QUE par service_role (`src/lib/audit.ts`), et
-- un journal que la partie auditée peut effacer n'est pas un journal.
revoke insert, update, delete on table public.audit_logs from authenticated;

-- Les campagnes se créent en session (insert, conservé) mais se pilotent par
-- service_role : `envoyerCampagne` passe par `admin`.
revoke update, delete on table public.newsletter_campaigns from authenticated;

-- Les inscrits arrivent par le jeu, le quiz et la chasse — tous côté serveur,
-- tous par `admin`. La désinscription publique aussi.
revoke insert, update on table public.newsletter_subscribers from authenticated;

-- L'ajout d'un membre passe par l'invitation (jeton + RPC). Le RETRAIT, lui,
-- se fait bien en session : il n'est PAS révoqué.
revoke insert on table public.organization_members from authenticated;

-- Une organisation naît à l'inscription et meurt par la fermeture de compte,
-- toutes deux côté serveur. Sa MISE À JOUR aussi : fuseau, notifications,
-- rétention et webhook passent tous par service_role, et `authenticated` n'a
-- aucun update sur cette table — ni au niveau table, ni au niveau colonne.
-- Cette ligne disait le contraire dans sa première version ; c'est la garde
-- ajoutée à security_acl.test.sql qui a rendu l'erreur visible.
revoke insert, delete on table public.organizations from authenticated;

-- Participations et tours de roue sont écrits par le parcours joueur, qui est
-- anonyme et passe par service_role.
revoke insert on table public.participations from authenticated;
revoke insert, update, delete on table public.spins from authenticated;
