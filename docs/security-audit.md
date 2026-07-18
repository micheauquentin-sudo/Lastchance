# Audit de sécurité reproductible — LastChance

Ce document décrit des contrôles exécutables sur le schéma réel. Il ne
transforme pas une revue de code en garantie absolue et ne remplace pas un test
d'intrusion externe.

## Source de vérité et exécution

- migrations : `supabase/migrations/00001…00023` ;
- audit pgTAP : `supabase/tests/security_acl.test.sql` ;
- CI : job `database-security` de `.github/workflows/ci.yml`.

Avec Docker et la CLI Supabase :

```bash
supabase start
supabase db reset
npm run security:audit-db
```

`supabase db reset` ne doit viser que la base locale. Le résultat de la CI du
commit fait foi : le fichier SQL n'est pas, à lui seul, une preuve.

## Ce que pgTAP vérifie réellement

L'audit lit `has_schema_privilege`, `has_table_privilege`,
`has_function_privilege`, `pg_proc`, `pg_default_acl`, `pg_policies` et les
contraintes installées.

- `anon` et `authenticated` ne peuvent pas créer d'objet dans `public` ni
  masquer une dépendance d'une fonction `SECURITY DEFINER`.
- `PUBLIC` n'a aucun `EXECUTE` sur les fonctions applicatives, y compris par
  privilège par défaut.
- Tirage atomique, claim, validation de code, file webhook, purge et primitives
  de stock restent réservés à `service_role`.
- RLS est active sur les PII, les audits, les invitations, les sessions admin
  et la file de webhooks.
- Les clés étrangères composites interdisent toute chaîne campagne/roue/lot/
  spin/participation ou championnat/match/joueur/pronostic traversant deux
  organisations.
- L'index unique de propriétaire et l'index de fenêtre de jeu sont présents.

L'audit crée ensuite de vrais utilisateurs `owner`, `editor` et `cashier`,
change le rôle PostgreSQL et le sujet JWT, puis exécute les requêtes. Il prouve
notamment que :

- `cashier` ne voit ni campagnes, ni participations, ni newsletter ;
- `editor` gère campagnes/roues/lots/QR, sans accéder aux PII ;
- une mutation directe de l'éditeur est auditée par trigger ;
- `owner` peut lire les données de son organisation ;
- `editor` ne peut pas lire les coordonnées ni les grilles des joueurs de
  pronostics, alors que les RPC de résultat restent disponibles et bornées ;
- les anciennes RPC de caisse trop larges sont révoquées.

## Invariants complémentaires

- Aucun renseignement personnel ni compte n'est demandé avant le tirage. Un
  identifiant aléatoire HTTP-only sert à la limite, avec rate limiting réseau
  et Turnstile obligatoire par défaut en production.
- Limite, tirage cryptographique, stock et spin sont une transaction verrouillée.
- Claim, code de retrait de 40 bits, opt-in newsletter et outbox webhook sont
  une autre transaction verrouillée.
- Stripe est signé, idempotent, ordonné par date d'événement et relit l'objet
  d'abonnement courant.
- Les webhooks sortants sont HTTPS/443, protégés contre SSRF et DNS rebinding,
  signés, identifiés et rejoués avec backoff.
- Sessions admin par connexion, expiration absolue et fenêtre sudo sont
  appliquées sans imposer MFA/AAL2.
- Les images sont décodées, bornées, redimensionnées et ré-encodées avant
  stockage ; les exports CSV neutralisent les formules et ne sont pas mis en cache.
- La rétention par défaut est de 12 mois ; les identifiants d'audit admin sont
  anonymisés après 24 mois.

## Frontières qui restent externes au dépôt

- configuration effective du projet Supabase, des Redirect URLs, des secrets,
  de Stripe, Turnstile, Vercel et des domaines DNS ;
- politique réseau d'egress indépendante du code ;
- test d'intrusion authentifié et exercice de restauration ;
- tests E2E complets, qui exigent un environnement staging et un QR actif.

La CI ajoute aussi `npm audit`, CodeQL `security-extended`, l'audit des
dépendances de PR et les mises à jour Dependabot hebdomadaires.
