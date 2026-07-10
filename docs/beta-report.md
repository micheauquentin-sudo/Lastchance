# Rapport de préparation — Bêta privée

**Date** : 2026-07-10
**Verdict** : ✅ **Le projet est prêt pour une bêta privée** chez un premier commerce.

## Périmètre fonctionnel vérifié

| Domaine | État | Détail |
| --- | --- | --- |
| Dashboard | ✅ | Vue d'ensemble : scans, tours, gains, participations, **gains à valider (cliquable)**, taux de gagnants, répartition des gains par lot |
| Campagnes | ✅ | CRUD, statuts, config engagement / données collectées / compte à rebours, **stats par campagne** (tours, gains, à valider) |
| Roue | ✅ | Aperçu SVG, segments visuels égaux, probabilités jamais exposées au client |
| Lots | ✅ | Poids, stocks, couleurs, lots perdants, activation |
| QR codes | ✅ | Génération PNG 512px, compteur de scans, **affiche A4 imprimable** (`/poster/[id]`) |
| Participations | ✅ | **Recherche code / prénom / email**, **filtre À valider / Récupérés**, filtre campagne, validation en caisse, exports CSV (anti-injection) |
| Emails | ✅ | Email de gain Resend, best-effort (n'échoue jamais la participation), HTML échappé, diagnostic loggé |
| Stripe | ✅ | Checkout, portail, webhook signé + idempotent, gating essai/abonnement |
| UX | ✅ | Parcours joueur mobile-first, messages d'erreur en français, états vides, confirmations destructives |
| Sécurité | ✅ | RLS multi-tenant, spin signé HMAC, rate limiting en base, Turnstile opt-in, journal d'audit (voir docs/security-audit.md) |

## Améliorations livrées dans cette passe (valeur commerçant immédiate)

1. **Participations** — l'écran utilisé en caisse au quotidien :
   filtre « À valider / Récupérés » et recherche élargie au prénom et à
   l'email (le terme est neutralisé avant interpolation dans le filtre
   PostgREST `.or()` — pas d'injection possible).
2. **Dashboard** — carte « Gains à valider » cliquable (mène directement
   à la liste filtrée) et taux de gagnants affiché sous « Tours joués ».
3. **Campagnes** — chaque carte affiche tours joués, gains et gains à
   valider (requêtes de comptage head-only en parallèle, pas de
   rapatriement de lignes).
4. **QR codes** — « Imprimer l'affiche » : page A4 prête à poser en
   salle (QR géant, nom du commerce, mode d'emploi en 3 étapes, mention
   « jeu gratuit sans obligation d'achat »), route protégée par session.

## Vérifications

| Contrôle | Résultat |
| --- | --- |
| `npm test` | ✅ 64 tests, 8 fichiers (dont 9 nouveaux : sanitisation recherche, slugify, codes) |
| `npm run typecheck` | ✅ 0 erreur |
| `npm run lint` | ✅ 0 erreur |
| `npm run build` | ✅ 17 routes, build production OK |

Limite connue : pas de test E2E automatisé du parcours joueur (planifié
V1.1, nécessite une instance Supabase de test). Le parcours a été validé
manuellement lors de la livraison V1.

## Reste à faire avant d'inviter le commerçant (opérationnel, hors code)

1. Créer les comptes Supabase / Stripe / Resend et renseigner les
   variables d'environnement (checklist complète dans le README).
2. Déployer sur Vercel, mettre à jour le webhook Stripe et les Redirect
   URLs Supabase avec l'URL de production.
3. Vérifier le domaine d'envoi dans Resend (sinon les emails de gain ne
   partent qu'au propriétaire du compte).
4. Imprimer les affiches A4 depuis « QR codes → Imprimer l'affiche ».

## Recommandations pour la bêta

- Suivre chaque jour « Gains à valider » sur le dashboard : c'est le
  signal que le jeu tourne et que le personnel valide bien en caisse.
- Recueillir les retours sur la limite de jeu et le compte à rebours du
  code — les deux réglages les plus sensibles côté client final.
- Ne pas activer Turnstile au départ ; le rate limiting en base suffit
  pour un pilote mono-établissement.
