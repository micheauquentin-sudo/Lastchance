# Rapport de préparation — Bêta privée

**Date** : 2026-07-10 (mis à jour après la passe branding & personnalisation)
**Verdict** : ✅ **Le projet est prêt pour une bêta privée** chez un premier commerce.

## Périmètre fonctionnel vérifié

| Domaine | État | Détail |
| --- | --- | --- |
| Dashboard | ✅ | Vue d'ensemble : scans, tours, gains, participations, **gains à valider (cliquable)**, taux de gagnants, répartition des gains par lot |
| Campagnes | ✅ | CRUD, statuts, config engagement / données collectées / compte à rebours, **stats par campagne** (tours, gains, à valider) |
| Roue | ✅ | Segments visuels égaux, probabilités jamais exposées, **personnalisation complète** (presets, anneau, ampoules, moyeu, pointeur, polices, fond, bouton, accroche) avec aperçu fidèle |
| Lots | ✅ | Poids, stocks, couleurs, lots perdants, activation |
| QR codes | ✅ | Génération PNG 512px, compteur de scans, **éditeur d'affiche A4** (modèles, couleurs, polices, textes, logo) |
| Branding | ✅ | **Logo commerçant** sur la page de jeu et l'affiche (upload Réglages) |
| Caisse | ✅ | **Page dédiée de validation** : saisie du code normalisée, verdict immédiat, un tap pour valider |
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

## Passe branding & personnalisation (2026-07-10, après-midi)

1. **Logo commerçant** — upload dans Réglages (PNG/JPEG/WebP, 2 Mo,
   bucket Storage public dédié), affiché à vos clients au-dessus de la
   roue après le scan, et disponible sur l'affiche.
2. **Roue 100 % personnalisable** — 6 styles prêts à l'emploi
   (Classique, Néon, Luxe, Pastel, Minimal, Festif) qui se mélangent :
   on part d'un preset puis on ajuste chaque détail — anneau, ampoules,
   bordures, texte des lots, moyeu, pointeur, police (7 choix), fond de
   page, bouton, accroche. L'aperçu de l'éditeur est identique à ce que
   voit le client. Le style est validé par schéma côté serveur (aucune
   valeur arbitraire ne part en base) et la page /play ne charge que la
   police réellement sélectionnée.
3. **Éditeur d'affiche** — chaque QR code a son affiche : 4 modèles,
   fond dégradé, couleurs, polices, tous les textes éditables (titre,
   sous-titre, 3 étapes, mention), taille du QR, logo/nom/étapes
   affichables. Sauvegarde par QR, impression A4 propre (seule
   l'affiche sort à l'impression).
4. **Page Caisse** — le staff tape le code (toutes les variantes de
   saisie sont normalisées), voit le lot et valide en un geste ; les
   codes déjà utilisés sont signalés en orange.
5. **Rate limiting Upstash** (optionnel) — REST pur sans dépendance,
   activé par deux variables d'env, repli automatique sur le compteur
   en base.
6. **E2E Playwright** — parcours joueur complet (chargement, spin,
   résultat, code de retrait, slug inexistant) + garde anti-fuite des
   probabilités. S'exécute contre un staging via `E2E_BASE_URL` +
   `E2E_PLAY_SLUG`, skip proprement sinon.

**Migration à appliquer** : `00006_branding_and_customization.sql`
(logo, style de roue, affiche, bucket `logos`).

## Vérifications

| Contrôle | Résultat |
| --- | --- |
| `npm test` | ✅ 87 tests, 11 fichiers (styles de roue, affiche, Upstash, codes caisse…) |
| `npm run typecheck` | ✅ 0 erreur |
| `npm run lint` | ✅ 0 erreur |
| `npm run build` | ✅ 19 routes, build production OK |
| `npx playwright test --list` | ✅ 3 scénarios E2E prêts (exécution sur staging) |

Limite connue : les E2E nécessitent un environnement avec Supabase
configuré (`E2E_BASE_URL` + `E2E_PLAY_SLUG`) — ils ne tournent pas dans
le CI sans staging. L'upload de logo et l'éditeur d'affiche ont été
vérifiés par tests unitaires + build ; à re-vérifier à la main lors du
déploiement staging (checklist ci-dessous).

## Reste à faire avant d'inviter le commerçant (opérationnel, hors code)

1. Créer les comptes Supabase / Stripe / Resend et renseigner les
   variables d'environnement (checklist complète dans le README) —
   appliquer les migrations **jusqu'à 00006 incluse**.
2. Déployer sur Vercel, mettre à jour le webhook Stripe et les Redirect
   URLs Supabase avec l'URL de production.
3. Vérifier le domaine d'envoi dans Resend (sinon les emails de gain ne
   partent qu'au propriétaire du compte).
4. Sur le staging : uploader un logo, personnaliser la roue et une
   affiche, imprimer, puis dérouler `npm run test:e2e` avec
   `E2E_BASE_URL` + `E2E_PLAY_SLUG`.
5. Créer l'affiche de chaque QR depuis « QR codes → Créer l'affiche »
   et l'imprimer.

## Recommandations pour la bêta

- Suivre chaque jour « Gains à valider » sur le dashboard : c'est le
  signal que le jeu tourne et que le personnel valide bien en caisse.
- Recueillir les retours sur la limite de jeu et le compte à rebours du
  code — les deux réglages les plus sensibles côté client final.
- Ne pas activer Turnstile au départ ; le rate limiting en base suffit
  pour un pilote mono-établissement.
