# Back-office d'administration — LastChance

Console interne, **totalement séparée** de l'app commerçant (`/dashboard`),
réservée à l'équipe LastChance. Design sombre « console » inspiré de Stripe
Dashboard, Vercel et Supabase Studio.

Route racine : **`/admin`**.

## Site à part (séparation par domaine)

Le back-office est servi comme un **site distinct**, sur son propre domaine, et
n'apparaît **jamais** sur le site client :

- Variable d'environnement **`ADMIN_HOSTS`** = liste d'hôtes admin séparés par
  des virgules (ex. `admin.lastchance.app`).
- Sur le **domaine client** (`lastchance.app`), toute URL `/admin*` renvoie un
  **404** — le back-office est invisible et non découvrable.
- Sur le **domaine admin** (`admin.lastchance.app`), l'app commerçant n'est pas
  servie : toute URL hors `/admin` redirige vers `/admin`.
- La séparation est appliquée **au bord** (`src/proxy.ts`) avant tout rendu, et
  s'ajoute aux gardes RBAC/session déjà en place.

En dev mono-domaine (sans `ADMIN_HOSTS`), `/admin` reste accessible en local ;
un hôte `admin.localhost` est traité comme domaine admin pour tester la
séparation. **En production, `ADMIN_HOSTS` doit être renseigné.**

## Architecture

```
src/app/admin/
  login/page.tsx              Connexion admin dédiée (hors garde)
  unauthorized/page.tsx       403 (admin connecté sans la permission)
  actions.ts                  adminLogin / adminLogout
  (protected)/                Groupe gardé par le layout
    layout.tsx                requireAdmin() + shell (sidebar + topbar)
    page.tsx                  Dashboard (MRR, abonnements, stats)
    merchants/                Liste + fiche + actions
    support/                  Files de suivi
    stripe/                   Facturation / abonnements
    analytics/                Séries d'activité
    audit/                    Journal d'audit
    monitoring/               État de santé
    settings/                 Équipe admin + rôles

src/lib/admin/
  rbac.ts        Rôles, matrice de permissions, gardes anti-escalade (PUR, testé)
  auth.ts        getAdminUser, requireAdmin (page), authorizeAction (action)
  audit.ts       logAdminAction → admin_audit_logs
  data.ts        Accès LECTURE via service role (métriques, listes)

src/components/admin/   UI sombre (ui.tsx, sidebar, formulaires clients)
src/types/admin.ts      Types + libellés de rôles
supabase/migrations/00010_admin_backoffice.sql
```

## Rôles & permissions

| Permission          | Super Admin | Admin | Support | Finance | Lecture seule |
|---------------------|:-----------:|:-----:|:-------:|:-------:|:-------------:|
| dashboard.view      | ✅ | ✅ | ✅ | ✅ | ✅ |
| merchants.view      | ✅ | ✅ | ✅ | ✅ | ✅ |
| merchants.edit      | ✅ | ✅ | — | — | — |
| merchants.suspend   | ✅ | ✅ | — | — | — |
| support.view/reply  | ✅ | ✅ | ✅ | — | view seul |
| stripe.view/manage  | ✅ | ✅ | — | ✅ | view seul |
| analytics.view      | ✅ | ✅ | ✅ | ✅ | ✅ |
| audit.view          | ✅ | ✅ | — | ✅ | ✅ |
| monitoring.view     | ✅ | ✅ | ✅ | ✅ | ✅ |
| settings.view       | ✅ | ✅ | — | — | — |
| admins.manage       | ✅ | — | — | — | — |

La matrice complète est dans `src/lib/admin/rbac.ts` (source de vérité unique).

## Sécurité (défense en profondeur)

1. **Tables verrouillées** — `admin_users`, `admin_audit_logs`, `admin_notes`
   ont la RLS activée **sans aucune policy** : inaccessibles via la clé anon /
   une session commerçant. Seul le code serveur du back-office y accède, via la
   service role key.
2. **Double barrière d'accès** — une session Supabase valide **et** un
   enregistrement `admin_users` actif. Un compte commerçant valide ne donne
   aucun accès (login refusé + journalisé).
3. **Garde de page** — chaque page appelle `requireAdmin(permission)` :
   redirige vers `/admin/login` (non admin) ou `/admin/unauthorized` (permission
   manquante). Le layout `(protected)` exige déjà un admin actif.
4. **Garde d'action** — chaque server action mutante appelle
   `authorizeAction(permission)` **avant** toute écriture, indépendamment de
   l'UI (le masquage des boutons n'est qu'un confort). Entrées validées par zod.
5. **Anti-escalade de privilèges** (helpers purs et testés) :
   - on ne peut pas attribuer un rôle supérieur au sien (`canAssignRole`) ;
   - on ne gère pas un compte de rang supérieur, ni soi-même (`canManageAdmin`) ;
   - le **dernier super_admin actif** ne peut être ni rétrogradé ni désactivé
     (anti-verrouillage).
6. **Audit** — toute action sensible (login, changement de statut/plan/rôle,
   activation/désactivation, note) est journalisée dans `admin_audit_logs`
   (acteur, rôle, cible, avant/après, IP). Le journal survit à la suppression
   de l'admin (email conservé).

## Amorçage du premier super admin

Aucun super_admin ne peut être créé depuis l'UI tant qu'il n'en existe aucun.
Après avoir créé le compte Supabase correspondant, exécuter en base :

```sql
select public.grant_first_super_admin('equipe@lastchance.app');
```

La fonction refuse d'agir s'il existe déjà un super_admin actif (amorçage
unique). Les membres suivants sont ajoutés depuis **Paramètres → Inviter**.

## Tests

`src/lib/admin/rbac.test.ts` couvre la matrice de permissions et toutes les
gardes anti-escalade (13 cas). Lancer : `npm test`.
