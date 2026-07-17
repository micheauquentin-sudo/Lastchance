# Audit de sécurité reproductible — LastChance

Ce document ne déclare pas que l'application est « sûre » sur la seule base
d'une revue de code. Il décrit les contrôles automatisés exécutés contre une
vraie instance PostgreSQL/Supabase reconstruite depuis les migrations.

## Source de vérité

- Schéma et permissions : `supabase/migrations/00001…00018`.
- Audit base : `supabase/tests/security_acl.test.sql`.
- Tests applicatifs : fichiers `*.test.ts` exécutés par Vitest.
- CI : job `database-security` dans `.github/workflows/ci.yml`.

Le rapport est vert uniquement si la base peut être reconstruite depuis zéro et
si tous les contrôles pgTAP réussissent. Un nombre de tests écrit dans ce fichier
n'est pas une preuve : la sortie de CI du commit concerné est le résultat faisant
foi.

## Exécution locale

Prérequis : Docker et la CLI Supabase.

```bash
supabase start
npm run security:audit-db
```

Pour repartir d'une base locale propre :

```bash
supabase db reset
npm run security:audit-db
```

`supabase db reset` est destructif uniquement pour la base locale. Ne jamais
lancer `--linked` contre la production pour cet audit.

## Contrôles réellement exécutés

### ACL des fonctions

L'audit interroge `has_function_privilege`, `pg_proc`, `pg_default_acl` et
`aclexplode` afin de vérifier les permissions effectives, pas seulement le texte
des migrations.

- `PUBLIC` et `anon` ne peuvent appeler aucune primitive interne.
- `authenticated` ne peut ni modifier les stocks, ni incrémenter les scans, ni
  purger les rate limits.
- `service_role` peut appeler les primitives serveur nécessaires.
- Les RPC utilisateur sont accordées explicitement et individuellement.
- Les futures fonctions du schéma `public` n'accordent pas `EXECUTE` à
  `PUBLIC`, `anon` ou `authenticated` par défaut.

### RLS et RBAC

L'audit crée deux utilisateurs réels dans `auth.users`, une organisation, une
campagne, une roue, un lot et une participation, puis change réellement de rôle
PostgreSQL/JWT.

Il prouve qu'un `staff` :

- ne peut pas énumérer les participations contenant les PII ;
- ne peut pas lire la base newsletter ;
- ne peut pas modifier le statut d'abonnement ;
- peut rechercher un code de gain précis via la RPC de caisse minimale ;
- peut valider la remise de ce gain.

Il prouve qu'un `owner` peut lire les participations et la newsletter de son
organisation. Les pages et Server Actions appliquent la même matrice : caisse,
campagnes et QR pour le staff ; CRM, exports, newsletter, équipe, intégrations,
confidentialité et Stripe pour le propriétaire.

### Intégrité multi-tenant

Des clés étrangères composites imposent le même `organization_id` pour :

```text
campagne → roue → lot
QR → campagne
spin → campagne → roue → lot
participation → campagne → roue → lot
```

Les gardes applicatives du parcours public restent en place, mais une erreur de
code ne peut plus créer une relation inter-tenant acceptée par PostgreSQL.

### Quota d'organisations

`create_organization()` prend un verrou transactionnel par utilisateur et
refuse la création si celui-ci possède déjà une organisation. Les appartenances
`staff` multiples restent autorisées. Les invitations d'équipe ne peuvent
attribuer que le rôle `staff`.

## Contrôles applicatifs complémentaires

- Tirage et poids côté serveur ; claim HMAC à durée limitée.
- Secrets distincts pour claims, invitations et désinscriptions, avec fallback
  de rotation vers l'ancien secret.
- Rate limiting atomique ; fail-closed pour spin et scans.
- Turnstile obligatoire en production sauf opt-out explicite documenté.
- Validation SSRF des webhooks : HTTPS/443, pas d'identifiants, résolution DNS,
  refus des IP privées/réservées, connexion épinglée sur l'IP vérifiée avec SNI
  TLS du domaine et aucune redirection.
- IP de rate limiting issue prioritairement des en-têtes Cloudflare/Vercel,
  normalisée et non choisie depuis le premier élément X-Forwarded-For.
- CSP à nonce sans `unsafe-inline` pour `/dashboard` et `/admin`; CSP statique
  conservée sur `/play` afin de préserver l'ISR.
- Signatures Stripe, idempotence, anti-injection CSV et journaux d'audit.

## Limites résiduelles explicites

- `/play` conserve `script-src 'unsafe-inline'` pour l'hydratation statique ISR.
- L'épinglage ferme le DNS rebinding applicatif ; un proxy d'egress reste
  recommandé pour imposer aussi une politique réseau indépendante du code.
- Une empreinte IP/UA n'est pas une identité forte ; Turnstile constitue la
  barrière anti-automatisation obligatoire en production.
- Cet audit ne remplace pas un test d'intrusion externe, une revue de la
  configuration du projet Supabase distant, ni un exercice de restauration.

## Checklist de déploiement

1. Avant la migration, vérifier qu'aucun utilisateur n'est propriétaire de
   plusieurs organisations :

   ```sql
   select user_id, count(*)
   from public.organization_members
   where role = 'owner'
   group by user_id
   having count(*) > 1;
   ```

   La requête doit retourner zéro ligne ; sinon il faut résoudre ces doublons
   métier avant de créer l'index unique.
2. Appliquer `00017_security_acl_rbac_integrity.sql`, puis
   `00018_authenticated_table_grants.sql` en staging.
3. Exécuter `supabase test db --linked` uniquement sur le projet de staging.
4. Définir des valeurs indépendantes pour `CLAIM_TOKEN_SECRET`,
   `TEAM_INVITE_TOKEN_SECRET` et `UNSUBSCRIBE_TOKEN_SECRET`.
5. Conserver `SPIN_TOKEN_SECRET` pendant la fenêtre de migration, puis le faire
   tourner après expiration des invitations existantes.
6. Configurer les deux clés Turnstile et vérifier un spin réel.
7. Vérifier les alertes Sentry sur les tags `security_event`.
8. Appliquer la migration en production et relancer les requêtes ACL en lecture.
