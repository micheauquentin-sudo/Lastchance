# Roadmap — Lastchance

## V1 — MVP SaaS (✅ livrée)
**Objectif** : MVP robuste testable chez un premier commerce réel.

- [x] Architecture propre (Next.js App Router + Server Actions)
- [x] Base de données multi-tenant + RLS (testée sur PostgreSQL 16)
- [x] Authentification Supabase + onboarding organisation
- [x] Dashboard commerçant (campagnes, roue, lots, stats)
- [x] Roue entièrement configurable (poids, stocks, couleurs, perdants)
- [x] Parcours joueur complet (spin serveur → formulaire RGPD → code)
- [x] Génération de QR codes (PNG imprimables, compteur de scans)
- [x] Participations : validation des gains, export CSV
- [x] Stripe : checkout, portail, webhook, gating automatique
- [x] Emails de gain (Resend) + analytics (PostHog)
- [x] Prêt pour déploiement Vercel (guide dans README)

## V1 polish — Préparation bêta privée (✅ 2026-07-10)
**Objectif** : lisser l'usage quotidien du commerçant avant le pilote.

- [x] Participations : filtre « À valider / Récupérés » + recherche par
      code, prénom ou email (terme neutralisé contre l'injection PostgREST)
- [x] Dashboard : carte « Gains à valider » cliquable + taux de gagnants
- [x] Liste des campagnes : tours joués, gains et « à valider » par campagne
- [x] QR codes : affiche A4 imprimable (`/poster/[id]`, route protégée)
- [x] Tests unitaires ajoutés (`utils.test.ts` : sanitisation de recherche,
      slugify, codes de gain)

## V1.1 — Branding & personnalisation (✅ 2026-07-10)
**Objectif** : que la roue et l'affiche ressemblent au commerce, pas au SaaS.

- [x] Logo d'établissement (upload dans Réglages, Supabase Storage,
      affiché sur /play après le scan et sur l'affiche)
- [x] Personnalisation complète de la roue : 6 presets mélangeables
      (Classique, Néon, Luxe, Pastel, Minimal, Festif) + réglage fin de
      chaque détail — anneau (5 styles), ampoules (2 couleurs), bordures
      de segments, texte des lots, moyeu (4 styles), pointeur (3 formes),
      7 polices (Google Fonts chargées à la demande), fond de page,
      dégradé du bouton, accroche personnalisée — aperçu fidèle en direct
- [x] Éditeur d'affiche (`/poster/[id]`) : 4 modèles, fond dégradé,
      couleurs texte/accent, polices, tous les textes éditables, taille
      du QR, logo/nom/étapes affichables — sauvegarde par QR code,
      impression A4 (seule l'affiche sort)
- [x] Page Caisse (`/dashboard/redeem`) : validation d'un code en un
      geste, mobile-first, codes normalisés (« gain ab2c » → GAIN-AB2C)
- [x] Rate limiting renforcé Upstash (opt-in par env, REST sans
      dépendance, repli automatique sur le compteur en base)
- [x] Tests E2E Playwright du parcours joueur (skip propre sans env de
      staging ; vérifie aussi que les probabilités ne fuitent pas)

## V1.1.1 — Landing marketing premium (✅ 2026-07-11)
**Objectif** : faire ressentir la valeur du produit dès les premières
secondes et inspirer confiance aux commerçants (référence : Stripe,
Linear, Vercel). Aucune logique métier touchée.

- [x] Refonte complète de la page d'accueil en dark premium : hero avec
      la vraie roue du produit (composant partagé avec /play) en rotation
      lente + cartes flottantes du parcours joueur
- [x] Header sticky avec flou, ancres de sections et menu mobile
      accessible (aria-expanded, Échap, scroll verrouillé)
- [x] Sections marketing : cibles commerces, « Comment ça marche » en
      3 étapes, grille de 6 fonctionnalités, aperçu stylisé du dashboard,
      tarif unique (29 €/mois, 7 jours d'essai), FAQ en accordéons, CTA
      final
- [x] Animations et micro-interactions : entrées au chargement,
      révélations au scroll (IntersectionObserver), survols des cartes et
      boutons, balayage lumineux sur le CTA — le tout neutralisé par
      `prefers-reduced-motion`
- [x] Accessibilité : lien d'évitement, landmarks, focus visibles,
      contrastes AA sur fond sombre ; responsive vérifié (390 px → 1440 px,
      captures Playwright)

## V1.1.2 — Landing v2, identité unique en mouvement (✅ 2026-07-11)
**Objectif** : une identité unique (pas un template SaaS), sobre,
moderne et fidèle à la direction artistique du jeu, avec un site
« en mouvement » quand le visiteur se déplace.

- [x] Direction artistique moderne : noir profond, accents
      violet/fuchsia, Geist en titres, serif italique Fraunces réservée
      à l'accent du hero, grain photographique léger
- [x] Roue-horizon épurée qui tourne au rythme du scroll
      (rAF, sans re-render ; vérifié : 0° → 126° après 900 px)
- [x] Ticker infini des lots, manifeste qui s'allume mot à mot au
      scroll, étapes éditoriales à grands numéros en contour
- [x] Micro-interactions : cartes inclinables, halo doré suivant le
      curseur (tarifs), CTA magnétique avec balayage lumineux
- [x] `prefers-reduced-motion` neutralise toutes les animations ;
      accessibilité et responsive conservés (captures 390 px / 1440 px)

## V1.1.3 — Landing v3, thème clair ludique + hero interactif (✅ 2026-07-11)
**Objectif** : reproduire fidèlement une maquette de référence (thème
clair chaleureux, roue + téléphone), avec une roue qui tourne pour de
vrai et un écran de téléphone interactif.

- [x] Direction artistique claire et chaleureuse : fond dégradé
      rose/magenta → pêche/crème, titres Poppins, accent italique
      Fraunces, palette orange/rose/ambre, étincelles décoratives
- [x] Hero interactif sur mesure : roue SVG (bezel sombre, ampoules,
      moyeu « Last Chance. », pointeur doré) en rotation lente
      permanente + lancer animé jusqu'au lot ; le téléphone pilote la
      démo (bouton « Tourner la roue » → état en cours → résultat avec
      code de gain + bouton Rejouer). QR décoratif déterministe.
      Vérifié Playwright : rotation réelle + écran passant au résultat,
      cohérent avec la position de la roue
- [x] Barre de confiance (4 atouts), « Comment ça marche » en 3 étapes
      avec flèches pointillées animées et visuels (présentoir QR,
      téléphone-roue, carte stats), grille fonctionnalités
- [x] Aperçu dashboard complet : sidebar, 4 KPI, courbe des
      participations (SVG) + donut « Top gains » avec légende
- [x] Tarif unique, FAQ, CTA final dégradé, footer — tous en thème clair
- [x] `prefers-reduced-motion` neutralise roue, étincelles et flèches ;
      accessibilité (dropdown Ressources, focus, skip link) et responsive
      vérifiés (390 px / 1440 px)

## V1.3 — Back-office d'administration (✅ 2026-07-12)
**Objectif** : une console interne réservée à l'équipe LastChance,
totalement séparée de l'app commerçant (design sombre type Stripe /
Vercel / Supabase Studio). Voir [docs/admin-backoffice.md](./admin-backoffice.md).

- [x] 8 modules : Dashboard (MRR/ARR, abonnements, stats), Commerçants
      (liste + fiche + actions), Support, Stripe, Analytics, Audit Logs,
      Monitoring, Paramètres
- [x] RBAC 5 rôles (Super Admin, Admin, Support, Finance, Lecture seule)
      avec matrice de permissions unique et testée (13 cas)
- [x] Sécurité : tables verrouillées (RLS sans policy, service role
      only), double barrière (session + admin_users actif), garde de
      page + garde d'action, validation zod
- [x] Anti-escalade : rôle ≤ le sien, pas d'auto-gestion, dernier
      super_admin protégé (anti-verrouillage)
- [x] Audit complet des actions sensibles (acteur, cible, avant/après, IP)
- [x] Amorçage du premier super_admin par fonction SQL dédiée
- [x] Vérifié : typecheck, lint, 126 tests, build (routes /admin
      dynamiques), captures desktop + mobile

## V1.4 — Fidélisation & différenciation (✅ 2026-07-12)
**Objectif** : fermer la boucle de fidélisation (la donnée collectée sert
enfin à quelque chose), donner une vue relationnelle des clients, mettre
en avant l'absence de review-gating comme argument commercial, et
diversifier la mécanique de jeu. Voir l'analyse concurrentielle qui a
motivé ces choix (comparaison directe avec les solutions du marché
positionnées sur « avis Google contre roue »).

- [x] **Newsletter** — `/dashboard/newsletter` : composer + historique
      d'envois, emails par lots (Resend batch API), désinscription en un
      clic (jeton HMAC signé, sans expiration, sans session), rate limit
      anti-abus (5 envois/jour/org). Compteur d'abonnés actifs affiché
      dans Participations avec lien direct.
- [x] **Profil client** — `/dashboard/customers` : agrégat des gains par
      email (RPC `org_customer_profiles`, vérification d'appartenance
      intégrée), segments actionnables (Nouveau / Fidèle / À relancer
      avec lien direct vers la newsletter).
- [x] **Argument anti review-gating** — section dédiée sur la landing
      (« Un jeu honnête, pas un piège à avis ») expliquant le risque réel
      (règles Google Business Profile) pris par les solutions qui
      conditionnent le gain à un avis. Différenciateur déjà présent dans
      le produit, jusqu'ici enterré en pied de page.
- [x] **Carte à gratter** — deuxième mécanique de jeu, entièrement
      découplée du tirage serveur (`wheels.game_type`, aucun changement
      au flux anti-triche/claim). Canvas HTML avec grattage tactile/souris
      (composite `destination-out`, révélation auto à 50 % gratté) +
      bouton « Révéler directement » pour l'accessibilité. Sélecteur
      Roue/Carte dans les réglages de campagne.
- [x] Vérifié : typecheck, lint, 130 tests, build (nouvelles routes
      dynamiques), geste de grattage simulé et révélation confirmée
      (Playwright), captures desktop de la landing et des réglages.

## V1.5 — Studio créatif & Pronostics (✅ 2026-07-18)

- [x] Preset de roue Kermesse aligné sur la direction artistique du produit.
- [x] Studio QR : huit motifs, quatre styles d'yeux, dégradés, logo réglable,
      bannière et export PNG jusqu'à 2048 px, avec garde de contraste.
- [x] Éditeur d'affiche libre : calques, glisser-déposer, redimensionnement,
      rotation, 18 formes, images rognables, 28 polices et quatre modèles.
- [x] Addon Pronostics : compétitions cataloguées ou libres, inscription,
      grilles, résultats, classement, barème et récompenses.
- [x] Durcissement : Turnstile, PII owner-only, intégrité multi-tenant,
      fermeture et scoring transactionnels, consentement et purge RGPD.

## V1.6 — Pronostics avancé & Automatisations commerçant (✅ 2026-07-21)
**Objectif** : faire vivre un championnat en boutique (ligues, écran TV,
saisie sans friction) et donner au commerçant des automatismes qui
travaillent pour lui (budget, programmation, stock, cycle de vie client).

- [x] Pronostics — saisie rapide des matchs en lot (1 à 30, tout-ou-rien,
      duplication de date, erreurs par ligne)
- [x] Pronostics — barre de progression « X/Y pronostics complétés »
- [x] Pronostics — mode TV plein écran (`/pronos/[slug]/tv`, polling 45 s,
      rotation de pages, podium ; JSON public top 30 sans PII, cache CDN
      30 s — ADR-022)
- [x] Pronostics — ligues privées (création, code d'invitation, quitter,
      classement re-numéroté 1..n — ADR-020, rate limits dédiés)
- [x] Campagnes — programmation automatique (`auto_schedule`, pg_cron SQL
      direct toutes les 10 min selon starts_at/ends_at)
- [x] Campagnes — budget de gains avec pause automatique à l'atteinte et
      relance manuelle (ADR-018)
- [x] Lots — seuil d'alerte stock + email commerçant (trigger réarmé au
      restock)
- [x] 3 scénarios cycle de vie client (gain non retiré, inactifs 30/60 j,
      post-retrait) dédupliqués par `email_log`, cron quotidien 09:30
- [x] Scénario anniversaire à double consentement (case dédiée sous
      l'opt-in marketing, fuseau de l'organisation — ADR-019)
- [x] Revue sécurité passée (0 critique/élevé) ; finding moyen corrigé :
      garde owner/editor sur `updateCampaignAutomation` et
      `resumeCampaignAfterBudget`

**Suites ouvertes** :
- [ ] Arbitrage produit reengage / scénario inactive (coexistence assumée
      avec avertissement UI — ADR-021)
- [ ] Minimisation `birth_date` (jour + mois suffiraient — ADR-019)
- [ ] Durcissement : ne poser `birth_date` que sur une ligne créée par le
      claim (FAIBLE assumé, docs/bugs.md)
- [ ] CI : exécuter pgTAP (`supabase test db`) et les 73 E2E Playwright
      (non exécutés localement, Docker absent — `--list` OK)

## V1.7 — Chasse au trésor multi-QR (✅ 2026-07-22)
**Objectif** : un nouveau module de jeu (comparable à Pronostics) — un
parcours de QR codes à travers la boutique ou le quartier, menant à un lot
final retiré en caisse.

- [x] Addon d'organisation `addon_hunts` (miroir d'`addon_pronostics`),
      activé depuis le back-office admin, gating `hasHuntsAccess` (ADR-023)
- [x] Chasse de 2 à 10 étapes, ordre libre ou imposé, fenêtre de dates
      optionnelle, indice optionnel révélé après chaque étape, délai minimal
      optionnel entre scans (anti-partage, sans géolocalisation — ADR-026)
- [x] Parcours joueur `/hunt/[token]` : scan → « Valider mon passage »
      (POST, anti-prefetch) → tampon + indice → complétion. Identité par
      cookie HTTP-only + hash (miroir contest, aucune PII)
- [x] `record_hunt_scan` atomique sous verrou de chasse : tampon idempotent,
      ordre, délai, complétion + code `CHASSE-…` + stock optionnel dans une
      transaction
- [x] Récompense = lot direct avec code de retrait (pas de roue — ADR-023) ;
      email de rappel optionnel à usage unique (ADR-024)
- [x] Caisse unifiée roue/chasse (`CashierMatch` discriminé par `source`) ;
      remise par RPC dédiée `redeem_hunt_completion` (atomique, auditée)
- [x] Éditeur commerçant (chasse, étapes, réordonnancement, affiches QR par
      étape), back-office addon, purge RGPD `purge_expired_hunt_players`
- [x] CI : `hunts.test.sql` (pgTAP) + `e2e/hunt.spec.ts` (parcours complet +
      scans axe-core) ajoutés ; `automation.test.sql` rebranché au job pgTAP
- [x] Revue sécurité passée : 1 ÉLEVÉ corrigé (claim email à usage unique),
      1 MOYEN corrigé (rate-limit de scan recalibré pour IP partagée — ADR-025)

**Suites ouvertes** :
- [ ] Multi-commerçants partenaires (chasse de quartier, multi-tenant
      croisé — reporté, ADR-027)
- [ ] Mini-jeux d'étape (au-delà du simple tampon)
- [ ] Récompenses intermédiaires (paliers avant le lot final)
- [ ] Défaut `min_scan_interval_seconds` > 0 à l'étude (ADR-026)

## V1.8 — Passeport de fidélité ludique (✅ 2026-07-22, GA 2026-07-23)
**Objectif** : un module de fidélisation (comparable à Pronostics/Chasse) — le
client cumule des visites sur un passeport dématérialisé, débloque des niveaux
et des paliers récompensés en boutique. **Livré en production, qualité GA.**

- [x] Addon d'organisation `addon_loyalty` (miroir d'`addon_hunts`), activé
      depuis le back-office admin, gating `hasLoyaltyAccess` (ADR-028)
- [x] Cumul de visites → tampon numérique ; niveaux bronze/argent/or calqués
      sur le compteur (seuils configurables)
- [x] Deux modes de validation au choix du commerçant : code tournant type
      TOTP sur écran comptoir (secret jamais exposé) et validation staff
      owner/editor/cashier en caisse ; cooldown anti-abus (ADR-030)
- [x] Paliers à récompense MIXTE, tous à STOCK FINI OBLIGATOIRE et palier ≥
      visite 2 : lot direct (code `FIDELITE-…` remis en caisse) ou tour de roue
      offert (grant à usage unique → tirage atomique → flux de gain normal, code
      `GAIN-…`) (ADR-028, ADR-029, ADR-031)
- [x] Parcours joueur `/passeport/[programId]` (identité cookie HTTP-only +
      hash, aucune PII), écran comptoir, éditeur commerçant, caisse unifiée
      (`source: 'loyalty'`), back-office addon, purge RGPD
      `purge_expired_loyalty_members`
- [x] CI : `loyalty.test.sql` (pgTAP) + `e2e/loyalty.spec.ts` (parcours + scan
      axe-core, smoke 404) ; `security_acl.test.sql` étendu
- [x] Durcissement pré-GA (8 revues sécurité, 2026-07-22 → 2026-07-23) : jeton
      de check-in signé TTL 3 min en mode staff (au lieu du bearer 180 j
      photographiable), planchers de cooldown durcis en base (staff 300 s,
      rotating `max(2 × période, 300 s)`), verrous économiques (stock fini,
      palier ≥ 2, bornes du palier spin), retrait des seaux « kill-switch »
      (ADR-030, ADR-031, ADR-032 — détail docs/bugs.md)
- [x] Revue sécurité : verdict GA, 0 finding bloquant ; perte maximale bornée
      ≈ 150 € par les verrous économiques

**Suites ouvertes** :
- [ ] Purge de la dette rate-limit `hunt` / `prono` / `spin` (seaux `failClosed`
      sur clé partagée — ADR-032 ; en cours dans un chantier séparé)
- [ ] Séries de visites (streak) et bonus d'assiduité
- [ ] Multiplicateurs / missions heures creuses
- [ ] Collection / badges à débloquer
- [ ] Bonus multi-établissements (multi-tenant croisé — reporté avec ADR-028)

## V1.44 — L'assistant de création, dormant sans clé (✅ 2026-08-06, branche `chantier/ia-assistant-creation`, sans migration)

**Objectif** : point 5 (dernier) de l'ordre impératif du cahier (§9.5) —
assistant de création (§6 du cahier). **L'ordre impératif du cahier est
désormais complet, ses cinq points livrés.**

Aide au choix et **trois idées de campagne éditables**, sortie structurée
côté serveur, sans PII joueur, sans publication ni paiement ni action
automatique — l'IA propose, le commerçant valide. Aucune migration : le
type de commerce et l'objectif sont des champs de formulaire éphémères, les
idées sont des blueprints appliqués via le chemin d'application existant.

- **Appel REST direct à l'API Messages d'Anthropic, sans SDK** — aucune
  dépendance ajoutée, aucun passage supply-chain. Modèle économique
  **claude-haiku-4-5** en constante nommée. `src/lib/ia-provider.ts` :
  `getIaProvider()` / `isIaConfigured()` calqués sur `getSmsProvider()` /
  `isSmsConfigured()` — la clé `ANTHROPIC_API_KEY` vient de l'environnement
  et de nulle part ailleurs, jamais journalisée, jamais renvoyée à un
  écran ; `import "server-only"` garantit qu'aucun bundle client ne
  l'embarque. `stop_reason` vérifié avant lecture de `content` ; sur
  non-200 ou refus, liste vide, corps d'erreur brut jamais relayé. Timeout
  dur 20 s.
- **Dormant sans clé** : `getIaProvider()` rend `null`, `isIaConfigured()`
  rend `false`, l'action refuse « Assistant indisponible » (jamais « clé
  absente ») avant tout `fetch` ; l'UI n'affiche aucun bouton (« Assistant
  de création — bientôt »). La feature s'allume à la pose de la clé par le
  propriétaire, comme la vente d'add-ons s'allume à la pose des prix
  Stripe.
- **Sortie structurée validée par le schéma métier existant** :
  `campaignBlueprintSchema` (zod, déjà revalidé aux deux bouts) sert de
  contrat. Dériver un JSON Schema depuis zod s'est révélé impraticable
  (`superRefine` et bornes non supportés par les structured outputs) →
  prompt + parse + `safeParse` idée par idée ; une idée invalide est
  écartée, jamais rendue telle quelle.
- **PII blanc-listée à la main** : le prompt ne reçoit qu'un littéral
  composé champ par champ (nom du commerce, type saisi, objectif enum),
  jamais l'objet `Organization` entier (`stripe_customer_id`,
  `webhook_secret`, `webhook_url`, `comp_access_note`), jamais de donnée
  joueur. Vérifié avec une organisation porteuse de secrets-appâts : le
  corps envoyé à Anthropic ne les contient pas.
- **Rate limit** : `iaSuggestionRequest` (org+user, 10/h, `failClosed` —
  légitime par ADR-032, opérateur authentifié, pas de clé partagée
  publique) et `iaSuggestionOrg` (org, 30/h, borne le coût par siège sur un
  compte à plusieurs éditeurs).
- **Application** : « Appliquer » une idée passe par `applyCampaignTemplate`,
  qui gagne une troisième source `blueprint` (mutuellement exclusive avec
  `templateKey`/`templateId`), toujours revalidée par
  `campaignBlueprintSchema` avant écriture (garde intacte) — crée un
  brouillon inerte (`status draft`, `auto_schedule false`, emails inertes),
  rien de publié.
- Greffe UI sur la galerie de modèles
  (`src/app/dashboard/campaigns/page.tsx`), qui portait déjà la promesse
  « rien n'est publié, aucun email envoyé, vous relisez puis activez ».

**Revue sécurité (lecture seule) : GO, 0 critique / élevé / moyen, 3 INFO
non bloquants** — voir `docs/bugs.md` : INFO-1 `applyCampaignTemplate` sans
seau par opérateur (pré-existant, les chemins `templateKey`/`templateId`
l'admettaient déjà, ce chemin n'appelle pas le modèle donc aucun coût
Anthropic, intra-tenant) ; INFO-2 le texte du modèle est affiché puis
stocké, borné par le schéma et échappé par React (pas de XSS stocké, pas de
traversée de tenant) ; INFO-3 pas de garde de rôle UI sur le panneau
(cohérent avec la galerie, l'action refuse le caissier côté serveur). Aucun
corrigé — durcissements optionnels de motifs déjà présents ailleurs.

**Preuve** : typecheck 0, lint 0, `casts:check` 0, migrations:check 120 /
tête `20260916120000` (aucun SQL ajouté), `sql:check` ok, **221 fichiers /
3579 tests**, build vert. pgTAP non rejoué (aucun SQL dans ce lot).

**Risque résiduel assumé** : la feature est dormante — aucun appel réel à
Anthropic n'a été éprouvé de bout en bout (pas de clé en CI ni en
production) ; la pose de `ANTHROPIC_API_KEY` est un geste propriétaire.
ADR-088.

## V1.43 — Passeport post-jeu et QR de commande unique (✅ 2026-08-06, branche `chantier/passeport-post-jeu`, migrations `20260915120000` et `20260916120000`)

**Objectif** : point 4 de l'ordre impératif du cahier (§9.4) — Passeport de
fidélité post-jeu et QR de commande unique (§7 du cahier).

**C1 — Passeport post-jeu.** Après un jeu — gagné **et** perdu, le cahier ne
distingue pas et le perdant est celui qu'on veut retenir — une carte propose
de créer/continuer un Passeport de fidélité. Elle est strictement
navigationnelle : un lien vers `/passeport/<programId>`, jamais de tampon
(« un lien partagé ne tamponne jamais » est vrai par construction). Action
publique `invitationPasseport({organizationId})`, calquée sur
`getPlayerProgression` — lecture unique bornée, anti-oracle (org inconnue ≡
org sans programme ≡ module fermé, même `null` dans les trois cas), sortie au
plus `{programId, programName}`, jamais de secret. Composant
`ProposerPasseport` monté sur 8 ancrages (7 modules — roue/RedeemCodeScreen,
quiz, chasse, calendrier, jackpot, événement, pronostics — plus les 13 jeux
de révélation via la plomberie `organizationId`), garde un-exemplaire-par-page
(un filleul gagnant voyait la carte deux fois). Le parrainage reste au gain
seul, sans écran de fin distinct.

**C2 — QR de commande unique.** Livraison/e-commerce : une carte/QR/code
**unique par commande** crée/continue le Passeport et ajoute un tampon une
seule fois ; un code générique reste à zéro tampon. Migration
`20260915120000` : table `loyalty_order_codes` (jeton
`^[A-Za-z0-9-]{8,64}$`, copié de `hunt_steps`, RLS `is_org_editor`/
`is_org_member`) ; `record_loyalty_stamp` passe en 5-aires avec
`p_order_token` — usage unique **atomique**
(`update … where consumed_at is null returning`), le jeton **contourne le
cooldown** (décision produit : l'anti-abus est l'usage unique, pas le
cooldown), nouvel état `order_invalid`. Trouvailles DB : dix tables
d'émission de récompenses et non neuf (le calendrier en porte deux) ; une FK
composite en cascade aurait fait de la purge RGPD une machine à ressusciter
des jetons dépensés — FK simple `on delete set null`, c'est `consumed_at` qui
porte la règle ; ADR-082 appliquée frontalement (drop de la 4-aire,
réémission des revoke/grant, vérifiée au catalogue). Côté app :
`stampLoyaltyOrder` (copie trait pour trait de `stampLoyaltyVisit` — seau
`failClosed` identité avant SQL, Turnstile identité inconnue, IP observation
fail-open), `createLoyaltyOrderCodes` (owner/editor, 1..100), page publique
`/commande/[token]` mobile-first, export PNG par lot côté marchand. Défaut
trouvé par son propre test anti-oracle : un jeton inconnu tombait sur le
challenge Turnstile **avant** toute RPC — « résous un captcha » révélait
l'existence du jeton ; refus et succès empruntent désormais le même escalier.

**Revue sécurité (lecture seule) : GO, 0 critique, 0 élevé, 2 MOYEN + 3
FAIBLE — les cinq fermés avant fusion.**
- MOYEN 1 : le `Set-Cookie` `lc-loyalty-<programId>` (dont le nom livre
  l'UUID) était posé sur jeton valide avant tout refus, distinguant
  valide/invalide sans résoudre de captcha. Fermé par pose différée après
  franchissement du challenge (`resolvePassportIdentityDeferred`) ; la limite
  résiduelle a été réécrite — le vrai distingueur est le 404/200 de la page,
  ouvert à tous, identique à `/hunt`, préexistant et assumé.
- MOYEN 2 : `/commande` était le seul chargeur public du lot sans compteur de
  pression. Fermé par `observerPressionIp` fail-open (règle
  `loyaltyOrderPageIp`, calquée sur `huntStepIp`).
- FAIBLE : commentaire Turnstile faux, corrigé en vérité de commentaire
  (motif systémique préexistant : play/pronostics/quiz/jackpot) ; révocation
  d'un jeton dépensé possible par delete+réinsertion, fermée par
  `revoke delete from authenticated` (MVP explicitement sans révocation) ; le
  `label` (champ libre) survivait à la purge RGPD, fermé en migration
  `20260916120000` (`create or replace` à signature identique, sans piège
  ADR-082).

**Preuve** : typecheck 0, lint 0, `casts:check` 0, `sql:check` ok,
migrations:check 120 / tête `20260916120000`, **218 fichiers / 3554 tests**,
build vert, pgTAP **55 fichiers / 3143 assertions** PASS (base vide et
semée), `security:audit-db` 540. Preuve mesurée de l'embed PostgREST sur base
réelle (HTTP 200, FK composite résolue) : `/commande` ne rend pas de 404
silencieux.

**Risques résiduels assumés** : le 404/200 de la page `/commande` reste
ouvert (identique à `/hunt`) ; ni péremption ni révocation des jetons en
MVP ; le jeton voyage dans l'URL (PostHog le reçoit si consenti, comme
`/hunt` — pas de fuite Referer, `Referrer-Policy` strict). ADR-086, ADR-087.

**Reste ouvert** : aucun paiement réel mené de bout en bout — les 14 prix
live sont posés et le webhook écoute ses six événements, mais la chaîne
complète (carte → webhook → octroi → Démarrer → module ouvert) n'a jamais
tourné d'un trait. Et deux gestes propriétaire : révoquer la clé `rk_live_`
et le jeton de contournement Vercel.

## V1.42 — Le dashboard guidé : Centre d'animation, Carte de l'Aventure, Relancer une formule (✅ 2026-08-06, branche `chantier/dashboard-guide`, migration `20260914120000`)

**Objectif** : point 3 de l'ordre impératif du cahier (§9) — cinq décisions
produit du §5 confirmées : création guidée, Carte de l'Aventure, Relancer
une formule, Tableau d'équipe, Centre d'animation.

**Cinq « starters » Codex retrouvés, quatre intégrés.** Des composants purs
non commités, dans des worktrees git datées du 2026-08-03 (base non-ancêtre
de `main`), ont été archivés puis repris pour quatre décisions. Le
cinquième (carte de partage publique) était **obsolète** : PublicShare l'a
dépassé en V1.37. Défauts corrigés à l'intégration : apostrophes JSX
bloquant le lint, français non accentué, étiquettes malhonnêtes (« QR à
tester » → « QR jamais scannés », le compteur n'étant qu'un proxy
`scan_count = 0` ; « Stocks faibles » restreint à la roue, seul module où le
seuil existe), prédicat de navigation dupliqué, section qui disparaissait
au lieu d'un état vide.

- [x] **`org_animation_center_counts`** — RPC unique plutôt que dix-huit
      comptages, security definer, `is_org_editor` en premier geste,
      REVOKE/GRANT réémis (ADR-082 appliquée une seconde fois), pgTAP
      29 assertions dont l'ACL prouvée au catalogue. La chasse SQL a trouvé
      dix tables d'émission de récompenses et non neuf (le calendrier en
      porte deux) ; sept familles sur neuf prouvent l'annulation par
      l'absence de ligne, `cancelled_at` n'existant que sur les
      participations ; trois exclusions de plus que prévu évitaient un
      compteur à 18 quand la caisse en sert 10.
- [x] **Carte de l'Aventure** (`src/lib/experience-lifecycle.ts`) — projection
      des états hétérogènes des 8 modules (referral exclu, sans statut
      propre) vers les 5 phases du cahier. Un état manquait : **« prête »**
      (publiée mais pas jouable — programmée, en pause, fenêtre fermée) ;
      confondu avec « en cours », la Carte aurait affiché une page
      inatteignable comme ouverte. Seul l'événement porte réellement la
      répétition (sessions de lobby).
- [x] **Centre d'animation** (`src/lib/centre-animation-server.ts`) —
      compteurs par la RPC (le caissier n'appelle rien), Tableau d'équipe
      dérivé (jamais de chiffre inventé), chaque lien passe par
      `lienSelonRole`.
- [x] **Relancer une formule** (`src/lib/experience-relance.ts`,
      `src/actions/experience-relance.ts`) — sérialiseur instance→blueprint
      pour 6 des 8 kinds (structure et réglages seulement, `.strict()`,
      jamais participants/gains/scans), puis create+publish+apply par le
      moteur transactionnel existant. Ni campagnes (Dupliquer existe), ni
      jackpot (économie active non portable). Les IDs d'options de quiz
      divergeaient entre `OPTION_ID_PATTERN` et le schéma blueprint — un
      quiz réel aurait été refusé à sa propre relance ; renumérotés avec
      remappage de `correct_option_id`. `contest_matches` porte deux FK vers
      `contests`, embed désambiguïsé.
- [x] Composants : `AnimationCenter` (6 tuiles, liens fournis par le
      parent), `TeamActionBoard`, `GuidedJourney` (5 étapes, jamais de lien
      sur blocked), `RelaunchFormulaCard`, `RelanceErreur`, `InfoBulle`
      (pattern `details`/`aria-describedby`, zéro JS client) ajoutée aux 8
      formulaires de création.
- [x] Intégration : `/dashboard` (Centre + Tableau, 3e branche du
      `Promise.all` existant), Carte sur 8 pages de détail, Relance sur 6,
      gardes de couverture « surface sans chemin ». E2E
      `e2e/dashboard-home.spec.ts` (owner voit les 6 tuiles, l'éditeur perd
      le lien propriétaire avec l'explication, le caissier reste redirigé).

**Revue sécurité — GO, 0 CRITIQUE, 0 ÉLEVÉ, 2 MOYEN, tous deux fermés avant
fusion** : les refus de relance étaient des clics morts (`relance_error`
écrit dans l'URL, jamais lu — `RelanceErreur role="alert"` posé sur 6
pages) ; le discriminant anti-création-en-masse (seau 10 s) venait du
client, supprimant le seul frein réel — dérivé côté serveur, le `requestId`
client ne sert plus qu'à l'idempotence. 3 INFO consignés, dont un
préexistant au lot (jetons d'étape de chasse lisibles par le rôle caisse) —
pas une régression de ce lot, ouvert dans `docs/bugs.md`.

**Preuve** : typecheck 0, lint 0, `casts:check` 0, build vert, **212
fichiers / 3460 tests** (mesurés sur l'arbre final, correctifs MOYEN compris),
pgTAP 53 fichiers / 3049 assertions (base vide ET semée), `security:audit-db`
535, `migrations:check` synchronisée. ADR-085.

**Reste ouvert** : plafond de relance = 1 blueprint/10 s/source (un vrai
rate-limit dashboard serait un chantier à part) ; le brouillon relancé
porte le nom de la source, seul le blueprint porte « Relance de … » ;
`relancerFormule` hérite du contrôle d'entitlement du moteur (add-on expiré
→ refus, alors que V1.35 permettrait un brouillon) ; E2E `dashboard-home`
jouée localement sur `desktop-smoke` seulement.

## V1.41 — La classe du champ non rendu est fermée par ses propriétés, pas par sa forme (✅ 2026-08-06, branche `chantier/formulaires-null-classe`)

**Objectif** : fermer la classe que V1.38 avait décrite et non close — `entierOptionnel`
rejetait `null`, et `formData.get` en rend un pour tout champ non **rendu**. Aucune
migration.

**Deux modes de panne, pas un.** V1.38/V1.39 n'avaient fermé que le bruyant (rejet
Zod, message opaque). Le mesurer a montré un second mode, silencieux :
`z.coerce.number()` sans `.nullable()` convertit `null` en `0` (`Number(null) === 0`),
sans erreur. **26 violations mesurées — 3 bruyantes, 23 silencieuses.** Le mode
silencieux ne frappait que les champs dont la borne basse descend à 0 : un
`min(1)` refusait `null` **par accident** (0 < 1) — la même faute était muette ou
bruyante selon une borne sans rapport avec elle.

**Les plus coûteuses** : les trois cooldowns anti-rejeu (chasse, fidélité,
jackpot), où 0 est une valeur métier (« anti-partage désactivé ») — un champ non
rendu désarmait la protection en la faisant passer pour un choix du commerçant.
Et `weight` (`prizes.ts`) : un lot de poids 0, jamais tiré, sans erreur ; le
barème de pronostics remis à 0.

**Le point unique** : `src/lib/validations/champ-formulaire.ts`, sept primitives
(`texteOptionnel`, `entierOptionnel` — remontée d'`admin.ts` —, `entierRequis`,
`nonRenduVaut`, `absentSiNonRendu`, `caseACochee`, `nombreRequis`,
`videSiNonRendu`). 62 déclarations converties sur 12 modules, 98 `??`
d'appelant supprimés — 5 survivent, chacun commenté (4 sur champs obligatoires,
1 où `undefined` ≠ `null` par conception). 45 tests.

**Le verrou tient au comportement, pas au texte** :
`champ-formulaire-coverage.test.ts` vérifie ce que les schémas **font** — deux
invariants comportementaux sur 300+ champs de 24 modules, énumérés depuis les
modules — pas leur forme textuelle. Une garde textuelle rougit sur un simple
retour à la ligne et ne voit pas le mode silencieux, qui ne s'écrit ni avec
`.optional()` ni avec `.default(`. L'invariant B (« un champ requis refuse
`null` ») n'a aucune exclusion ; les 37 exclusions de l'invariant A (schémas
JSON-only : blueprints, webhooks…) portent chacune une raison écrite et une
détection des exclusions mortes. Deux contrôles négatifs joués et restaurés :
`.nullable()` retiré → invariant A rouge sur `hunts` ; `weight` ramené à
`z.coerce.number()` → invariant B rouge sur les 3 chemins `prizes`.

**Risque résiduel assumé, écrit** : un champ **rendu** mais **vidé** (`""`)
vaut toujours 0 par coercition sur les entiers requis — comportement d'origine,
hors classe (le champ a été rendu), et le changer refuserait des enregistrements
aujourd'hui acceptés. Documenté dans `nombreRequis`.

**Preuve** : typecheck 0, lint 0, `casts:check` 0, `migrations:check` ok (117,
aucune migration dans ce lot — pgTAP non rejoué), `sql:check` ok, **197 fichiers
/ 3303 tests** (+45), build vert. ADR-084.

**Reste ouvert** : aucun.

## V1.40 — Les dernières dettes : la chasse par étape, une valeur plutôt qu'une nullabilité, et le vocabulaire aligné (✅ 2026-08-06, branches `chantier/dernieres-dettes` et `chantier/outcome-et-vocabulaire`)

**Objectif** : vider le tableau des restes consignés. Migrations `20260912120000`
et `20260913120000`.

**Le retour de `grant_module_from_payment` porte une VALEUR** (ADR-082) :
- La RPC distinguait ses trois issues par la **nullabilité** de `grant_id` — or
  Postgres ne transporte pas la nullabilité des colonnes d'un `returns table`.
  Le générateur écrivait `grant_id: string` non-nullable, le webhook compensait
  par un cast d'apparence redondante, et une garde textuelle empêchait qu'on le
  supprime : **on protégeait un correctif au lieu d'ôter la cause**.
- `outcome text` vaut désormais `'created' | 'replayed' | 'refused'`. `created`
  disparaît — il était exactement `outcome = 'created'`, donc une seconde
  écriture d'un même fait.
- **`DROP` + `CREATE` emporte les privilèges**, et c'est la trouvaille la plus
  coûteuse : après recréation, `has_function_privilege('public', …)` repasse à
  `true`. Sans réémission des `REVOKE`, une fonction `security definer` **qui
  octroie des modules payants** redevenait appelable par `anon`.
- Un trou que l'ancien encodage ne pouvait pas voir est fermé : `created` étant
  booléen, **tout ce qui n'était pas `true` — ligne absente comprise —
  retombait sur « rejeu »**. Le double paiement se serait tu.

**La chasse au trésor compte par étape** (ADR-083) — et **le grain était déjà
tranché** : pour `events`, `resource_id` portait déjà un sous-objet. Ni colonne
ni table ajoutée.

**Le vocabulaire est aligné de bout en bout** : `/api/scan` → `/api/page-opens`,
`ScanBeacon` → `PageOpenBeacon`. **Renommage sec, aucun alias** — le compteur ne
facture rien et n'autorise rien ; un alias qu'on oublie de retirer devient
permanent. Deux détails qui auraient cassé en silence : `src/proxy.ts` excluait
`api/scan` du middleware, et côté `sendBeacon` **un 404 est indiscernable d'un
204** — un test vérifie désormais que le chemin appelé existe.

**Preuve** : typecheck 0, lint 0, `casts:check` 0, build vert, **194 fichiers /
3258 tests**, pgTAP **52 fichiers / 3020 assertions**, `security:audit-db` 535.

## V1.39 — Trois silences fermés, et le QR se met à compter (✅ 2026-08-05, branches `chantier/formdata-null` et `chantier/scans-et-typage`)

**Objectif** : les points restés ouverts de V1.38. Migration `20260911120000`.

- **Un champ non rendu n'est pas un champ vide.** `FormData.get` rend `null` —
  pas `undefined` — pour un champ absent du DOM, que `.default()` rejette.
  **Aucun octroi `recurring` n'était créable depuis le back-office.** Corrigé
  **au schéma** : l'audit a montré que la correction chez l'appelant avait exigé
  un `??` sur **131 sites** et en avait quand même laissé fuir un.
- **Un argument de RPC mal orthographié ne compile plus** là où il coûte de
  l'argent. `rpcStrict` s'appuie sur un mappé homomorphe qui réarme le contrôle
  de propriétés excédentaires. **5 appels couverts, pas 116** — ceux du chemin
  de paiement.
- **Un add-on mensuel impayé restait ouvert POUR TOUJOURS.** `hasActiveAccess`
  teste `live_module_grants` **avant** le statut d'abonnement : un octroi vivant
  court-circuitait les 14 jours de grâce. Il reçoit désormais une **échéance**,
  levée automatiquement au retour en `active`.
- **Le QR compte ses ouvertures** sur six modules, avec le nom honnête.

**Preuve** : **194 fichiers / 3254 tests**, pgTAP 51 fichiers / 2993 assertions.

## V1.38 — Le QR universel est couvert, et le back-office pouvait ne créer aucun octroi (✅ 2026-08-05, branche `chantier/qr-restants`)

**Objectif** : fermer le §4 du cahier et le dernier point actionnable de V1.37.
Aucune migration.

**Le §4 est couvert : huit modules équipés, le neuvième justifié.**
- **Fidélité** — le plus démuni des neuf : le dashboard n'exposait son URL
  publique **nulle part**. URL sur l'ID (`loyalty_programs` n'a pas de slug),
  garde `status === "active"` miroir de `loadLoyaltyContext`.
- **Événement** — URL sur le `join_code`, **pas l'UUID** : celui que la salle lit
  à voix haute, sans quoi la même soirée aurait deux adresses. `event-qr.tsx`
  lu et non modifié, avec un test qui garde la séparation — data-URL projetée
  *pendant* la soirée contre affiche imprimée *avant*.
- **Parrainage — pas de QR, décidé et écrit.** Aucune route dédiée ; le lien est
  `/play/[slug]?ref=<code>`, fabriqué **côté joueur**. Sans `?ref=` c'est le QR
  de campagne déjà existant ; avec un `?ref=` choisi par le commerçant, **tous
  les scans arrivent parrainés par la même personne**, versant les récompenses à
  un compte arbitraire. Deux assertions rougiront si une route `/parrainage/…`
  apparaît : la décision se rejouera au lieu de se perdre.

**Le back-office dit pourquoi il refuse — et pouvait n'en créer aucun.**
- **Le défaut trouvé en route était plus grave que celui qu'on corrigeait** :
  `formData.get` rend `null` pour un champ **non rendu**, que
  `entierOptionnel` (`z.string().default("")`) rejette. Le panneau n'affiche
  « durée » que pour un pass immédiat — **aucun octroi `recurring` n'était
  créable depuis le back-office**.
- **PostgREST ne transmet pas `constraint_name`** : on reconnaît le refus par
  `code === "23505"` **et** l'identifiant de l'index dans le message, jamais la
  phrase — elle est traduite et ses délimiteurs changent de locale en locale.
- **Preuve sur un vrai `23505`**, relevée sur la base plutôt que supposée, et
  gravée dans le test.

**Preuve** : typecheck 0, lint 0, `casts:check` 0, build vert, **191 fichiers /
3207 tests**.

**Reste ouvert** :
- [x] ~~`entierOptionnel` rejette toujours `null` — le correctif est **local à
      une action**. C'est une classe, non auditée.~~ Fermée en V1.41 : la
      classe entière (26 violations, dont 23 silencieuses) est close par
      `champ-formulaire.ts` et sa garde comportementale.
- [ ] Les 10 prix Stripe sont en **test** ; la chaîne complète n'a pas été
      éprouvée de bout en bout, et le passage en live attend cette preuve.

## V1.37 — Les huit add-ons sont vendables, le QR gagne trois modules, et deux silences de type sont fermés (✅ 2026-08-05, branches `chantier/trois-suites` et `chantier/trois-lots`)

**Objectif** : fermer ce que V1.36 laissait ouvert, et le point 2 de l'ordre
impératif du cahier (§9). Migration `20260910120000`.

**Les deux add-ons mensuels sont ouverts** (ADR-081) — décision produit du
propriétaire : *un commerçant ne peut pas racheter un add-on mensuel déjà actif*.
- Cette règle **supprime le problème au lieu de le tracer** : `(organisation,
  module)` devient la clé de révocation, donc aucun identifiant d'abonnement
  Stripe n'a besoin d'être persisté. La colonne et son index prévus disparaissent
  du plan.
- **Index unique partiel** à prédicat immuable — la garde doit tenir en base :
  entre la vérification de l'action et l'écriture du webhook, un double clic
  ouvre une fenêtre où deux paiements partent.
- `partitionnerPrix` sépare les prix **avant** toute résolution : un abonnement
  de pass ne voit jamais `apply_stripe_subscription_event_v2`.
- `grant_module_from_payment` gagne une **troisième issue** `(null, false)` —
  sans elle, l'index aurait fait répondre 500 en boucle sur un conflit définitif.

**Le QR passe de 2 modules sur 9 à 5** : `PublicShare` généralise
`contest-share.tsx` (supprimé, non doublé) et sert quiz, pronostics, calendrier
et jackpot. L'arbitrage : expérience non publiée → **aucun QR produit**, parce
qu'un QR imprimé et collé en vitrine survit à la page qui l'a produit.

**Deux silences de type fermés** :
- Les clients Supabase **serveur** sont typés — 82 erreurs révélées, 82 fermées
  en cinq gestes distincts, dont 48 corrigées **à la racine** en un seul endroit.
  Trois zones aveugles closes, dont `runProgressionEditorRpc` où 13 appels
  passaient sans aucune vérification du nom de RPC ni des arguments.
- `database.contract.test.ts` compare désormais la **nullabilité**, pas
  seulement les noms de colonnes. La garde est **prouvée sur l'état historique**
  du dépôt : rejouée contre le commit d'avant le correctif, elle nomme
  `home_score` et `away_score`.

**Le défaut réel trouvé en route** : `ContestPrediction.home_score` était déclaré
`number` alors que la migration l'avait rendu nullable le 2026-08-01 — le type
contredisait son propre commentaire, et le `null` voyageait jusqu'à l'affichage
joueur.

**Preuve** : typecheck 0, lint 0, `casts:check` vert, build vert, **190 fichiers
/ 3178 tests**, pgTAP `module_grant_recurring` **21 assertions** (150 avec ses
voisins), 114 migrations avec `EXPECTED_MIGRATION` synchronisée. ADR-081 ;
ADR-079 marquée comme levée.

**Reste ouvert** :
- [ ] `STRIPE_PRICE_ID_PASS_*` à poser — **geste du propriétaire**, sans quoi
      aucun bouton n'apparaît.
- [ ] Fidélité, événement et parrainage n'ont toujours pas de QR commerçant.
- [ ] Un mensuel `past_due` reste ouvert jusqu'à l'annulation Stripe (délibéré).
- [ ] Le back-office rend un message opaque sur un cumul de récurrent refusé.

## V1.36 — P0.4 : un paiement crée un octroi, et six add-ons deviennent achetables seuls (✅ 2026-08-05, branche `chantier/p0-4-achat-octrois`)

**Objectif** : fermer la limite que le lot P0.2 laissait ouverte et que
`docs/codex-handoff.md` nommait explicitement — « aucun flux de paiement/webhook
ne crée encore ces octrois ». Migration `20260908120000`.

**Le côté réception, livré en premier** :
- **Un paiement crée un octroi, et le rejeu n'en crée pas deux.** La RPC
  `grant_module_from_payment` insère par `on conflict do nothing` sur un index
  partiel `(organization_id, source_reference) where source = 'stripe'`. Elle ne
  MET PAS À JOUR sur conflit : un `do update` aurait rendu `created = false`
  tout en redatant la fenêtre de la durée écoulée depuis l'achat. Stripe rejoue
  ses webhooks ; sans cette garde, une Chasse payée trente jours en ouvrait
  soixante — et l'erreur allant dans le sens du client, personne ne la signale.
- **Les termes viennent du catalogue, jamais du paiement.** `octroi-termes.ts`
  traduit les quatre modèles de facturation en fenêtres. Les lire dans la
  metadata Stripe aurait laissé le client choisir combien de temps il a payé.
- **Deux fenêtres distinctes, et elles ne courent pas ensemble** : `activate_by`
  borne le moment où l'octroi peut démarrer, `starts_at`/`ends_at` la période où
  il ouvre le module. « 29 € / 30 jours, activable dans les 90 jours » décrit
  deux durées, pas une.
- **Les huit contextes publics renseignent `live_module_grants`** — le reste
  ouvert de V1.35 est fermé : un module ouvert par un octroi seul est désormais
  visible du **joueur**, pas seulement du commerçant.

**Le côté émission, livré ensuite** :
- `octroi-checkout.ts` résout le prix Stripe d'un add-on, sous des variables
  **distinctes** de celles de l'abonnement (`STRIPE_PRICE_ID_PASS_*` contre
  `STRIPE_PRICE_ID_ADDON_*`). Deux produits, deux prix, deux variables.
- `createAddonCheckoutSession` ouvre le tunnel. Propriétaire seulement (§3 du
  cahier) ; cinq refus distincts vérifient qu'**aucune session n'est créée**.
- `/dashboard/settings/modules` montre les huit options. Visible d'un éditeur,
  qui y lit « demandez au propriétaire » plutôt qu'une redirection.

**Le geste qui manquait, trouvé sur une question du propriétaire** (« les durées
ne sont pas toutes les mêmes ») — migration `20260909120000`, ADR-080 :
- **Cinq add-ons sur six encaissaient sans rien ouvrir.** `starts_at: null` est
  délibéré (les 30 jours payés ne doivent pas courir pendant que le commerçant
  rédige ses lots), mais **rien ne faisait sortir l'octroi de `pending`** — seul
  le back-office posait `starts_at`, à la main. Seule la Saison de pronostics,
  qui démarre à l'achat, fonctionnait.
- **Et les durées n'étaient lues par personne** : `activeDays` (30/31/7/30) et
  `preparationDays` + `playHours` (7 j + 24 h) n'apparaissaient que dans
  l'affichage du tarif. Le défaut était invisible à typecheck, lint, 3121 tests,
  build et pgTAP : chaque pièce était correcte séparément, c'est le **geste** qui
  les relie qui manquait.
- `activate_module_grant` (RPC `service_role`) + `termesActivation`, symétrique
  de `termesDepuisCatalogue` : l'un traduit un **achat** en fenêtre d'activation,
  l'autre un **démarrage** en fenêtre de jeu. Les deux durées du §2 sont enfin
  distinctes **et toutes deux appliquées** — 30, 31, 7, 30 jours, et **8 jours**
  pour la Soirée en jeu.
- **Bouton explicite** et non démarrage à la publication : le compteur partirait
  sinon sur une publication faite « pour voir », et rien ne rend une durée payée.
  La date de fin est annoncée **avant** le clic.
- Cloisonnement **dans le `where`** de la RPC : un identifiant d'octroi trouvé
  dans un journal ne désigne rien chez un autre commerçant.

**Ce que ce lot NE fait pas, et pourquoi** :
- [ ] **Les deux add-ons mensuels ne sont pas vendables** (« Passeport des
      habitués », « Bouche-à-oreille »). Un `recurring-monthly` créerait un
      abonnement Stripe séparé dont le prix est inconnu de
      `resolveStripeEntitlements` → 500 en boucle. Et la correction évidente est
      **pire** : ignorer ce prix ferait retomber la résolution sur `PLANS[0]` et
      écraserait le plan payé de l'organisation. Fermé en amont par
      `venteEnLigneOuverte` — voir ADR-079 et `docs/bugs.md`.
- [ ] **Aucun produit ni prix Stripe n'est créé.** Le cahier l'interdit sans
      accord (§2 et « Bloqué »). Sans variable, `addonAchetableEnLigne` rend
      `false` et aucun bouton n'apparaît : le code est livrable à froid, la
      vente s'allume quand le propriétaire pose les prix.

**Preuve** : suite complète **187 fichiers / 3126 tests** verts, typecheck 0,
lint 0, build vert avec `/dashboard/settings/modules` compilée, pgTAP
`module_grant_payment` **19 assertions** et `module_grant_activation`
**14 assertions** PASS sur base réelle (ligne de base mesurée : 47 fichiers de
test sur `main`, 49 avec ce lot). ADR-079, ADR-080.

## V1.35 — P0.3 : découvrir, préparer, publier — et le droit d'un module cesse d'avoir huit lieux de réponse (✅ 2026-08-04, branche `chantier/p0-3-capacites-modules`)

**Objectif** : le lot P0.3 proposé par Codex dans `docs/codex-handoff.md` —
rendre le dashboard cohérent avec le droit effectif. **Aucune migration** : la
base portait déjà toutes les gardes depuis les lots P0.1 et P0.2.

- **LE DÉFAUT TROUVÉ EN ROUTE, ET IL RENDAIT LA SUITE ININSTALLABLE.** Le
  droit effectif d'un module était écrit **huit fois**. Le lot 2 (migration
  `20260907120000`) a fait de « tout add-on peut être acheté seul » une règle
  de base — `org_has_module_access` accorde le module dès qu'un octroi daté est
  vivant, sans exiger ni abonnement ni booléen `addon_*`. **Six** des huit
  fonctions TypeScript ont reçu cette branche : celles de `subscription.ts`.
  `hasQuizAccess` et `hasReferralAccess` vivent dans `quiz-context.ts` et
  `referral-context.ts` et ne l'ont pas reçue. **Le commerçant qui achetait le
  seul Quiz express ou le seul Bouche-à-oreille obtenait de Postgres le droit
  de publier son module, et de l'écran un refus** — exactement le module qu'il
  venait de payer, et le seul qu'il ait payé.
- **Leur en-tête disait pourquoi** : elles étaient définies là parce que « le
  fichier `subscription.ts` relève de l'agent stripe-billing ». Une frontière
  de **répartition du travail**, pas de domaine. Elle a tenu jusqu'à ce qu'une
  règle change et ne soit corrigée que là où on la voyait. La règle est retirée
  des huit et concentrée dans `droitEffectifModule` ; les huit fonctions
  restent comme **façades** (quatre-vingts appelants les nomment).
- **LE CHARGEUR QUI MANQUAIT AU LOT 2.** Le champ `live_module_grants` était
  optionnel et **personne ne le renseignait** — son propre docstring écrivait
  déjà la conséquence (« un appelant qui ne renseigne pas ce champ refusera un
  droit que la base accorde »). Ce n'était donc pas une capacité à moitié
  faite : sa moitié **visible refusait ce que sa moitié invisible accordait**.
  `chargerOctroisVivants` est branché sur `getUserAndOrg`, seul entonnoir du
  dashboard ; douze gardes d'action en bénéficient sans être touchées.
- **LES TROIS CAPACITÉS EXISTENT** (`canExplore` / `canEditDraft` /
  `canPublish`), qui n'étaient nulle part — le seul `canPublish` du dépôt
  concernait la publication d'une *version de blueprint*. Le module ne décide
  pas du droit : `droitEffectif` est une **entrée**, sinon on refabriquerait la
  seconde source de vérité qu'on vient de supprimer.
- **SEPT PAGES S'OUVRENT.** Sans le droit, elles rendaient **uniquement** une
  carte d'offre : le commerçant devait payer pour voir ce qu'il payait. Le mur
  devient un bandeau, la page continue en dessous. **`createContest` était la
  seule action des neuf à garder la CRÉATION** et non la publication : corrigée
  dans le sens du cahier §3.
- **Le quota d'un brouillon gratuit borne une COURTOISIE, pas une recette** —
  huit actions l'appliquent côté serveur avec le même calcul que l'écran, et le
  contourner ne donne qu'un second brouillon, jamais une expérience publiée.
  D'où l'absence délibérée de contrepartie SQL.
- **Trois gardes neuves, toutes dérivées** : `MODULE_ADDON_COLUMN` comparée au
  `case p_module` **lu** dans la migration ; `RESSOURCE_MODULE` comparée aux
  neuf `create trigger … guard_module_publication(...)` ; et la couverture du
  quota, où le parrainage est le **seul exempté avec son motif écrit** (pas de
  création, un réglage booléen par campagne).
- **LES GARDES ONT MORDU LEUR AUTEUR TROIS FOIS**, et c'est leur intérêt : la
  garde de parité a rendu son `throw` de non-vacuité sur un `indexOf("end\n")`
  face à des fins de ligne **CRLF** (sans lui : table vide, 12 verts qui ne
  comparent rien) ; la garde de couverture a rougi six fois sur des guillemets
  simples qu'aucun lint ne signalait ; et un `tsc | head && echo OK` a affiché
  **OK au-dessus de cinq erreurs réelles** — treizième forme du motif « le
  détecteur ment » : un code de sortie avalé par un tube.

**Preuve** : typecheck 0, lint 0 sur tout le dépôt, build vert (Windows),
**181 fichiers / 3049 tests** verts (+22). Deux contrôles négatifs joués avec
leur protocole, copies prises AVANT sabotage, restaurations vérifiées à
l'octet (1 rouge / 11 verts ; 1 rouge / 42 verts).

**Reste ouvert, écrit et non arrondi** : les **huit contextes PUBLICS**
chargent leur organisation par leur propre requête et ne renseignent pas
`live_module_grants` — un module ouvert par un octroi seul reste fermé au
**joueur**. Écrit dans le docstring du chargeur, à l'endroit exact où
quelqu'un croirait tenir une couverture complète. Sans effet aujourd'hui
(aucun chemin d'achat ne crée d'octroi, seul le back-office en pose) ; à
fermer dans le lot suivant, faute de quoi la première vente d'add-on autonome
produira des pages de jeu introuvables.

## V1.34 — Les deux dernières dettes de `docs/bugs.md`, fermées (✅ 2026-08-04, branche `chantier/deux-derniers-ouverts`)
**Objectif** : solder les deux seules entrées encore ouvertes du journal des
bugs. Aucune migration.

- **La phrase d'annulation en caisse est RENDUE, plus seulement écrite.**
  `WheelResult` et `ContestResult` sont montés contre des doubles. **Cette
  dette était une impossibilité et est devenue faisable la veille** : son motif
  écrit était « ce dépôt n'a aucun environnement de rendu React », mort avec
  V1.33 — ce qui justifiait de ne pas faire était devenu ce qui permettait de
  faire, sans que personne le remarque.

- **La justification d'origine était fausse, et la mesure l'a dit.** Il était
  écrit que la garde textuelle serait aveugle à la disparition de la phrase :
  elle rend 1 rouge / 18 verts. L'écart réel tient à un **autre** sabotage —
  la phrase *présente mais inatteignable* (`{false && …}`), où la textuelle
  rend **19 verts, 0 rouge** quand le rendu rend 2 rouges. La frontière
  d'ADR-074 est désormais mesurée sur ce couple, plus citée.

- **Les dix-neuf compteurs d'IP passent par un seul chemin.** Le compte exact
  est **19**, pas « une vingtaine ». Un **helper** (`observerPressionIp`)
  plutôt que dix-neuf transformations : le motif faisait six lignes réparties
  dans douze fichiers, et c'est cette dispersion qui les avait désynchronisées.
  Il n'est pas plus court, il est **impossible à oublier à moitié**. La
  migration est **invisible en supervision** — clé identique au caractère près
  quand l'IP est mesurée ; seul le trafic versé dans `…:unknown` change de
  série.

- **Neuf sites ne sont délibérément PAS migrés** : ce sont des `rateLimit`,
  donc des **refus**, et ADR-032 interdit qu'une clé partagée en porte un.

- **L'obstacle documenté était réel et plus petit qu'annoncé** : 79 tests dans
  11 fichiers, mesuré. Huit venaient de mocks ne fournissant que
  `clientIpFromHeaders` ; trois étaient des gardes dont la **regex** avait
  vieilli, pas la garantie.

- **LE CONTRÔLE NÉGATIF A TROUVÉ UN TROU QUE LA RELECTURE N'AURAIT PAS VU** :
  étiquetage du helper neutralisé → **210 verts, 0 rouge**. Dix-neuf sites
  venaient d'être migrés vers une fonction concentrant la règle de tout le
  dépôt, et **rien ne la testait** — la classe de défaut que ce dépôt se
  reproche, reproduite en la corrigeant. Garde ajoutée ; même sabotage rejoué
  → **1 rouge / 5 verts**, nommant le défaut exact.

**Preuve** : typecheck 0, lint 0, build vert (Windows), **172 fichiers / 2886
tests** (+6), restaurations vérifiées à l'octet depuis des copies prises AVANT
sabotage. **`docs/bugs.md` ne porte plus aucune entrée OUVERTE.**

## V1.33 — Ce dépôt sait rendre du React en test, et la roue porte le lien (✅ 2026-08-04, branche `chantier/lien-roue-et-rendu`)
**Objectif** : les deux restes ouverts de V1.32, dont le second était
structurel. Aucune migration.

- **« Faute d'environnement de rendu React » n'était pas un aveu de paresse
  mais un FAIT de configuration** — `vitest.config.ts` n'incluait que
  `src/**/*.test.ts` et tournait en `environment: "node"`. Conséquence que
  personne n'avait écrite : un test de composant n'y était pas *rouge*, **il
  n'était pas collecté**. Levé par `happy-dom` + `@testing-library/react` et
  `.tsx` dans `include` (ADR-076).

- **`node` reste le défaut, et c'est délibéré.** Les ~2860 tests de logique
  n'ont aucun besoin d'un DOM ; un fichier qui rend un composant demande le
  sien par `// @vitest-environment happy-dom`. Mesuré : **+17 s** d'environnement
  sur la suite, pour trois fichiers — le coût est payé par ceux qui en
  profitent et par personne d'autre.

- **La roue porte le lien, et pas là où V1.32 l'avait annoncé.** V1.32 parlait
  de « ses trois écrans » ; en les ouvrant, les trois délèguent au **même**
  composant, `RedeemCodeScreen`, point de passage de **huit** surfaces (quatre
  écrans de roue/skill, quatre tours offerts). Un seul point d'insertion au
  lieu de trois, huit surfaces couvertes au lieu de quatre. Le lien est posé
  dans **ses deux vues** — la seconde étant la plus utile : sur le code expiré,
  « rapprochez-vous du staff » laissait le client sans rien à regarder alors
  que ses **autres** lots sont peut-être encore bons.

- **Pourquoi le rendu était ici NÉCESSAIRE, et pas seulement souhaitable.** Les
  deux vues sont mutuellement exclusives : un import unique en tête de fichier
  satisfait une garde textuelle même si le lien n'est posé que dans l'une.
  Démonstration chiffrée — sabotage de la **seule** vue expirée, import laissé
  en place (`grep` : 2 → 1) : **une garde textuelle serait restée verte**, le
  test de rendu rend **1 rouge / 3 verts** en désignant la vue exacte.

- **Les gardes textuelles sont CONSERVÉES, sans exception.** Leur angle mort
  est le bon : elles **se dérivent du système de fichiers**, donc elles
  attrapent l'écran écrit demain — c'est ce qui avait trouvé les pronostics
  manquants. Deux gagnent même un motif plus fort qu'avant : celles de
  `player-wallet-screen` ferment des interdits d'**absence**, or un rendu ne
  prouve jamais qu'une chose n'existe nulle part.

- **Le piège central de V1.32 est enfin gardé** : le champ **caché** de
  `CodeTtlDaysField`, maillon dont dépendaient les deux gardes du chantier
  précédent, que personne ne vérifiait — ce qu'il faut mesurer est *ce que le
  navigateur enverrait*. Sept assertions, dont celle qui grave le défaut réel :
  une colonne non chargée rend une case vide, donc **effacerait**.

- **QUINZE commentaires devenus faux, corrigés en place** (plus deux
  documents) — le motif que ce dépôt se reproche depuis cinq chantiers.
  **Aucune conclusion n'est annulée** : les modules purs restent extraits, pour
  une raison qui ne dépendait pas de la contrainte.

- **DEUX erreurs de méthode, et la seconde est la plus instructive du lot.**
  (a) Ma première assertion de nom accessible lisait `textContent` — le rendu
  l'a fait rougir, et il avait raison : `textContent` inclut `aria-hidden`, que
  l'algorithme accname **exclut**. (b) **J'ai d'abord annoncé DOUZE, et le
  chiffre était faux** : mon recensement passait par `grep … | head -12`, donc
  le plafond a rendu exactement douze lignes et j'ai lu ce plafond comme un
  total. Trois fichiers de code et deux documents sont restés faux, publiés
  comme corrigés dans un commit, une PR et quatre documents. **C'est une
  occurrence NEUVE du motif « le détecteur ment »** : ni un sabotage qui ne
  mord pas, ni un détecteur muet — un **plafond d'affichage lu comme une
  mesure**. Le contrôle qui l'a rattrapé n'était pas un test mais une question
  (« il ne reste plus rien ? ») suivie d'un recomptage sans plafond. Règle
  retenue : **un compte qu'on publie ne se lit jamais sur une sortie
  tronquée** — `wc -l` avant `head`, toujours.

**Preuve** : typecheck 0, lint 0, build vert (Windows), **170 fichiers / 2876
tests** (+3 fichiers, +14), casts:check OK, test:casts 4/4, migrations:check
108 fichiers, sql:check OK, `npm audit --omit=dev` **0 vulnérabilité**.
Contrôle négatif avec protocole (1 rouge / 3 verts), restauration vérifiée à
l'octet depuis une copie prise AVANT sabotage. ADR-076 ; ADR-074 reçoit un
addendum (sa doctrine est inchangée, son périmètre s'étend aux composants).

## V1.32 — L'échéance des lots devient réglable, et le portefeuille cesse d'être atteignable par personne (✅ 2026-08-04, branche `chantier/echeance-lots`)
**Objectif** : la question laissée au propriétaire par V1.31 — les sept
familles sans échéance — est tranchée, et le réglage descend jusqu'au client.
Quatre lots : la migration `20260904120000` et le câblage des sept actions
(livrés par la session précédente), puis les écrans commerçant et le chemin du
joueur (ce qui suit).

- **Le commerçant règle l'échéance depuis ses sept éditeurs.** Un composant
  partagé `CodeTtlDaysField`, et non sept blocs recopiés : la phrase qui
  explique qu'un code déjà émis garde son échéance est la même partout. Ce qui
  diffère par famille est passé en argument — l'instant d'où court le délai
  (fin de chasse, palier atteint, tirage, fin de session, ouverture de case,
  filleul validé, quiz terminé), jamais « à partir du passage en caisse » : le
  décompte part de l'**émission**.

- **TROIS PAGES SUR SEPT NE LISAIENT PAS CE QU'ELLES RÉÉCRIVAIENT** — jackpot,
  fidélité, calendrier sélectionnaient leurs colonnes une par une sans
  `code_ttl_days`. Le champ s'affichait vide, le commerçant relisait « Sans
  limite » là où il avait réglé 30 jours, et le premier enregistrement du même
  formulaire reposait `''` — donc **effaçait réellement le réglage**, sans
  message et sans trace. La garde d'écriture du lot précédent (`formData.has`)
  était **intacte** pendant tout ce temps : elle recevait une clé présente et
  une valeur vide, exactement le geste « efface », indistinguable du geste
  volontaire. **Une garde posée au bon endroit ne protège de rien quand c'est
  l'alimentation du formulaire qui manque.**

- **Et `tsc` ne pouvait pas l'attraper** : les trois pages castent le résultat
  PostgREST vers des interfaces qui déclarent toutes `code_ttl_days: number |
  null`. TypeScript ne relie pas une chaîne de `select()` à une interface — il
  croit la colonne présente, l'exécution rend `undefined`, et le champ confond
  légitimement « jamais chargée » avec « pas d'échéance ». Aucun type ne sépare
  ces deux cas puisque c'est l'interface elle-même qui ment. D'où une garde
  mécanique **qui se dérive** (tables ← migration, éditeurs ← qui importe le
  composant, pages ← qui importe un éditeur), et qui résout les constantes de
  colonnes du fichier — deux des trois pages fautives passaient par là.

- **Le portefeuille du client était complet et atteignable par personne.**
  `/portefeuille` rassemble déjà les lots des neuf familles, lit leur échéance
  dans le **registre** (`reward_issuances.expires_at`) et distingue « À
  retirer », « expire bientôt » et « Expiré » — mais son adresse n'apparaissait
  **dans aucun fichier du produit sauf le sien**. Le motif déjà reproché
  plusieurs fois ici — une capacité livrée sans chemin applicatif pour
  l'atteindre — pris du côté de l'écran et non de la base.

- **La date n'est PAS recopiée sous chaque code, et c'est le point.** La voie
  évidente était d'écrire l'échéance sur les sept écrans de gain. Écartée :
  quatre des sept contextes passent par une RPC `*_public_state` qui ne rend
  pas la colonne, et surtout la relire ailleurs que dans le registre
  fabriquerait une **seconde source de vérité pour une date que la caisse
  tranche** — la caisse lit le registre, pas les tables d'émission. Huit liens
  « Mes récompenses » envoient le client là où la date est déjà lue au bon
  endroit.

- **La garde a trouvé un huitième écran pendant que le travail s'écrivait.**
  Les écrans de gain ne se dérivent d'aucun dossier — ce qui les définit est
  une propriété de sens. La liste écrite à la main est donc **confrontée** au
  texte qu'ils portent tous, et la confrontation a immédiatement rougi : les
  **pronostics** manquaient. Ce n'est pas une garde qui valide un travail fini,
  c'est une garde qui l'a corrigé — la liste à la main aurait livré sept écrans
  sur huit.

**Reste OUVERT, écrit et non arrondi** : la **roue** ne porte pas le lien. Ses
trois écrans disent « présentez cet ÉCRAN au comptoir », le gain y étant
l'écran lui-même, et `claim-form` porte déjà son propre traitement d'échéance
(compte à rebours, « Ce code n'est plus valable »). Le critère retenu est net
et vérifiable — un code de retrait affiché en toutes lettres — plutôt
qu'extensible au jugé ; le lien y resterait utile.

**Preuve** : typecheck 0, lint 0, build vert (Windows), **167 fichiers / 2862
tests**, casts:check OK, test:casts 4/4, test:sql 12/12, test:migrations 9/9,
sql:check OK, migrations:check **108 fichiers**, `EXPECTED_MIGRATION`
synchronisée. Deux contrôles négatifs joués avec leur protocole (1 rouge / 1
vert, puis 1 rouge / 2 verts) — **le second n'a pas mordu au premier essai**
(`perl -pi` avec `\n$` sur des fins de ligne CRLF, `grep -c` rendant 1 au lieu
de 0), repris en `perl -0pi` avec `\r?\n`. **Trou assumé** : pgTAP n'a pas été
rejoué sur cette branche — les deux lots ne touchent aucun SQL, et la
migration porte déjà son fichier `reward_expiry_days.test.sql` inscrit en CI
(44 fichiers sur disque, 44 inscrits).

## V1.31 — Régler ce qui reste dans bugs.md : trois dettes fermées, quatre étiquettes « OUVERT » qui mentaient (✅ 2026-08-03, branche `chantier/solde-bugs`)
**Objectif** : demande du propriétaire — « règle ce qui reste dans
`docs/bugs.md` ». Sept entrées y portaient « OUVERT ». Le travail n'était donc
pas seulement de corriger du code : c'était que **plus aucune entrée « OUVERT »
ne soit en réalité une décision déguisée**, une étiquette qui fait croire à un
correctif en attente et déplace le travail vers un problème que personne
n'entend résoudre. Aucune migration sur cette branche.

- [x] **Le seau `huntRecall` ne bornait pas un débit, et rien n'était posé à
      côté** — sa clé contient le sha256 de la **valeur** d'un cookie que le
      porteur fait tourner à chaque requête : les deux gardes amont ne
      regardent que le NOM, le hash est neuf à chaque coup, aucun seau ne se
      remplit. Il borne un porteur **coopératif**, et reste conservé pour cela.
      Ce qui change : un `observeSharedKey` sur (chasse, IP), seau
      `huntRecallIp`, **fail-open**, intercalé **entre la garde 2 et la garde
      3** — exactement la population que la garde 3 prétendait borner.
      Application directe du terme moyen d'ADR-073 : ADR-032 proscrit de
      *refuser* sur une clé partagée, elle *prescrit* un compteur large et
      fail-open. **Le `failClosed: false` d'ADR-070 est intact** : un compteur
      ne refuse rien. **Seau propre et non réutilisation de `huntStepIp`**,
      bien que les deux chargeurs servent la **même requête** — le rappel ne
      tourne qu'après le refus du chargeur d'étape, qui a déjà compté ; une
      clé commune compterait un passage pour deux. Séparés, **leur rapport est
      l'information** : la part du trafic d'une chasse qui retombe sur le
      repli.
- [x] **`WheelResult` et `ContestResult` rendaient « annulé » sans cause** — le
      caissier lisait deux vocabulaires selon le chemin qui l'avait servi.
      `phraseCaisseAnnulation("merchant")` sous les deux badges, **sans aucune
      lecture fabriquée de `cancelled_source`** : atteindre ces branches prouve
      que la ligne parente **vit**, or purge et cascade la font disparaître et
      la caisse retombe alors sur la carte du registre. Le paramètre est typé
      `CauseAnnulation` — élargir le vocabulaire fait échouer `tsc` plutôt que
      de laisser ces cartes muettes.
- [x] **`clientIpFromHeaders` rendait `"unknown"` et agrégeait tous les
      visiteurs dans un seau unique** — à un seuil calibré pour un seul d'entre
      eux. Fermé pour les **deux compteurs chasse** par `pressionParIp` (module
      pur neuf) : clé `ip-non-mesuree`, événement suffixé `.ip_non_mesuree`.
      **Arbitrage : compter quand même plutôt que s'abstenir** — s'abstenir
      aurait jeté la **détection** avec l'attribution, alors que sous un débit
      réel l'agrégat franchit le seuil et reste le seul signal là où aucun
      proxy n'est déclaré. Deux séries qu'aucun tableau de bord ne peut
      confondre, ni par clé ni par nom. **ADR-075.**
- [x] **Quatre entrées requalifiées : ce ne sont pas des dettes** — le repli
      `merchant` indistinguable (alignement **délibéré** caisse/portefeuille,
      ADR-072 : deux écrans qui parlent au même client ne doivent pas se
      contredire) ; le calibrage hérité (**trois seuils, une seule origine**,
      `huntScanIp` → `huntStepIp` → `huntRecallIp` — aucun trafic réel à
      mesurer, une seule organisation en production) ; les deux sentinelles
      textuelles de `cancelled_reason` (elles ne décident plus rien, et les
      refuser au formulaire serait un palliatif qui ne couvre pas le `PATCH`
      PostgREST **en laissant croire à une garde**) ; et les sept familles sans
      échéance pour les lots **non annulés**, présentée comme une **question au
      propriétaire** — donner une expiration à un lot de chasse ou de fidélité
      change ce que le client peut encaisser, c'est un arbitrage produit.

**Ce que ce chantier ouvre, écrit et non arrondi** :
- La **vingtaine d'autres `observeSharedKey` clés sur l'IP** (quiz, calendrier,
  jackpot, fidélité, parrainage, événement, pronostics, skill, play,
  méta-progression) concatènent toujours l'IP brute et retombent dans le seau
  agrégé `…:unknown`. **Écrit dans le docstring de `pressionParIp`** plutôt que
  présenté comme une garde transverse. Les migrer casserait plusieurs gardes
  **textuelles** existantes (`quiz.test.ts`, `calendar.test.ts`,
  `referral.test.ts` matchent la source à la regex) — c'est un chantier.
- La garde de la phrase d'annulation est **textuelle** (ADR-074) : elle prouve
  qu'une phrase est écrite à côté de chaque badge, jamais qu'elle est
  **rendue** — aucun environnement de rendu React dans ce dépôt.

**Enseignement de méthode, versé aux Notes de docs/bugs.md** : un sabotage par
`perl -0pi` **n'a pas mordu** (regex multiligne), et le `git checkout --` de
nettoyage qui a suivi **a écrasé le travail en cours** — restauré depuis une
copie prise avant sabotage. **Douzième** occurrence du motif « le détecteur
ment » sur les cinq derniers chantiers, mais la **première où le nettoyage du
contrôle négatif est lui-même dangereux**. La leçon n'est pas « ne pas
saboter » : c'est **prendre la copie avant**, et **ne jamais nettoyer un
sabotage par un `git checkout --` sur un fichier qu'on est en train
d'éditer**.

**Preuve** : typecheck 0, lint 0, casts:check OK, test:casts 4/4, build vert
(Windows), **163 fichiers / 2827 tests** (+32), test:sql 12/12,
migrations:check 107 fichiers, test:migrations 9/9, sql:check OK, pgTAP **43
fichiers / 2669 assertions PASS, base vide ET semée** — *exactement le chiffre
de `main`*, aucune migration sur cette branche. Contrôles négatifs rejoués par
QA et confirmés : compteur de rappel neutralisé → 2 rouges / 76 verts ;
étiquetage retiré → 4 rouges / 74 verts ; phrase retirée → 1 rouge / 77 verts ;
intégrité de la suite revérifiée après l'incident par comptage des `it()`
fichier par fichier. **Seul trou** : les E2E n'ont pas été exécutés (ils figent
WSL) ; vérifié par mesure qu'aucun spec n'asserte les textes ni le markup
modifiés, mais ce n'est pas une exécution.

## V1.30 — Les trois derniers ouverts du dépôt, fermés : une explication a une échéance, une garde textuelle ne prouve rien (✅ 2026-08-03, branche `chantier/derniers-ouverts`)
**Objectif** : fermer les **trois derniers points ouverts** consignés dans
docs/bugs.md par le chantier de la veille. Pas une fonctionnalité — la
liquidation d'un reliquat, et l'occasion de constater que deux de ces trois
points n'étaient pas des dettes de code mais des **raisonnements sautés**.

- [x] **Un lot dont la source a été purgée n'était clos par rien** —
      `sync_reward_issuance` écrit `null` en échéance pour sept familles sur
      neuf, et la protection posée la veille n'avait pas de terme : la ligne
      n'était terminale pour aucune branche du prédicat de purge, donc
      **jamais supprimée**, alors qu'elle porte un `player_id`. Fermé par un
      **délai de grâce** (migration `20260903120000`, ADR-071) : la ligne
      n'est plus encaissable dès que sa source disparaît, sa seule valeur
      restante est d'**expliquer**, et une explication a une échéance —
      **bornée** par `least(3 mois, fenêtre de rétention de l'organisation)`,
      courant depuis `cancelled_at` et ANDée au critère d'âge.
- [x] **`loadHuntStepContext` n'était borné par rien, et le seau bloquant est
      REFUSÉ — la revue a confirmé ce refus** — le jeton d'étape est sur un QR
      de vitrine (un seau dessus ferme la chasse à tout le lieu) et le cookie
      n'existe pas au premier scan, or le premier scan **est** le produit : le
      seau aurait siégé sur la seule route que l'abuseur ne prend jamais. À la
      place, le coût public est **mesuré** — 3 lectures `service_role` sans
      cookie, 4 avec un cookie arbitraire, 6 pour un joueur retrouvé ; les
      documents annonçaient « ~4 » sans que personne ait compté — et un
      `observeSharedKey` sur l'IP rend l'amplification visible **sans jamais
      rien refuser** (ADR-073).
- [x] **Deux gardes ne prouvaient pas ce qu'on croyait** —
      `player-identity-coverage.test.ts` était **textuelle** : un `void 0 &&`
      la laissait verte. Elle est conservée (elle se dérive du dossier, donc un
      cinquième module d'offre y arrive tout seul) et complétée par un test qui
      **exécute** les quatre chemins de tour offert ; **l'écart entre les deux
      fichiers EST la démonstration** — 4 rouges contre 0 sur le même sabotage
      (ADR-074). Et les deux littéraux SQL sont désormais vérifiés dans
      `pg_proc`, pas dans un fichier de migration.

**Revue sécurité — GO** : 0 CRITIQUE, 0 ÉLEVÉ, 4 MOYEN, 2 FAIBLE, 3 INFO, tous
corrigés. Les quatre MOYEN portent tous sur le travail de ce chantier, pas sur
du code ancien.

- **ADR-069 retournée contre elle-même** : la cause d'annulation se dérivait de
  `cancelled_reason`, **le champ de texte libre du commerçant** que cette même
  ADR disait ne pas publier. Un `editor` saisissant exactement `source purgée`
  — au formulaire ou par un `PATCH` PostgREST qui ne passe même pas par
  l'audit — faisait dire au caissier, au client en face, « ce n'est une
  décision de personne ». Fermé par une colonne dédiée `cancelled_source`,
  fiable **non par un contrôle mais par une absence** : aucun chemin
  applicatif ne la nomme (ADR-072).
- **Les deux appuis chiffrés du délai étaient faux**, et gravés dans un
  `comment on function` : `contests.code_ttl_seconds` est nullable (« sans
  limite ») et les sept familles concernées n'ont aucune échéance ; le
  `<select>` 12/24/36 mois est du **client**, la frontière serveur accepte
  1 mois — trois mois y auraient été le **triple** de la rétention. Appuis
  retirés, trois mois assumé comme arbitrage produit, la **borne** seule
  énoncée (ADR-071).
- **ADR-032 citée à contresens** : « l'IP est proscrite » — l'ADR proscrit le
  **refus** sur une clé partagée et **prescrit** à la place un compteur large
  et fail-open, que le dépôt implémentait déjà deux fonctions plus loin. Le
  raisonnement sautait le terme moyen, et ce saut a laissé la page sans mesure
  pendant quatre chantiers (ADR-073).
- **La grâce va au collatéral, jamais à la décision** : elle est étendue à
  `source_deleted` sur un motif **factuel** et non d'équité — avant la
  migration de la veille, la disparition de la source laissait la ligne non
  terminale, donc jamais purgée, **pour les deux causes** ; l'asymétrie
  suivait le contour du risque nommé par la revue précédente, pas un principe.

**Reste ouvert, écrit et non refermé** : `WheelResult` et `ContestResult`
rendent encore « annulé » sans cause ; les sept familles sans échéance le
restent pour les lots **non annulés**, que rien ne clôt jamais ;
`clientIpFromHeaders` rend `"unknown"` hors proxy déclaré, donc le nouveau
compteur ne mesure quelque chose que là où `TRUSTED_PROXY_PROVIDER`/`VERCEL`
est posé (fail-open, inoffensif, mais un zéro n'est pas une absence d'abus) ;
le repli `merchant` est **indistinguable** entre « annulation à la main » et
« cause illisible », alignement délibéré entre caisse et portefeuille ; le
calibrage du compteur (200 / 10 min) est **hérité sans mesure propre** à cette
page ; et `cancelled_reason` porte toujours les deux sentinelles, qui ne
décident plus rien mais restent un texte imitable.

**Enseignement de méthode, qui prolonge celui des trois chantiers précédents** :
deux détecteurs muets de plus, et **ce sont les VERTS qui les ont démasqués** —
cumul **onze** occurrences sur les cinq derniers chantiers, avec onze causes
toutes différentes. Les deux nouvelles : un `psql -f /mnt/c/…` exécuté **dans**
le conteneur, où ce chemin n'existe pas (0 rouge **ET** 0 vert — c'est le zéro
vert qui a parlé) ; et un `perl -0777` qui n'a pas mordu, rendant exactement la
ligne de base, indistinguable d'un correctif inutile. **Second point, neuf** :
QA n'a pas reproduit un chiffre annoncé par un agent (4 rouges au lieu de 7) et
**l'a dit plutôt que de l'arrondir** ; le sabotage exact n'étant pas décrit, la
preuve n'était pas rejouable. D'où la règle ajoutée : **un contrôle négatif se
rapporte avec son protocole** — quel sabotage, sur quelle ligne — pas seulement
avec son résultat.

**Preuve** : typecheck 0, lint 0, casts:check OK, test:casts 4/4, build vert
(Windows), **163 fichiers / 2818 tests**, test:sql 12/12, migrations:check
**107 fichiers, head `20260903120000`**, test:migrations 9/9, sql:check OK,
pgTAP **43 fichiers / 2669 assertions PASS, base vide ET semée**,
`database.generated.ts` régénéré en `--local` avec un diff de 0 ligne, `ci.yml`
croisé dans les deux sens (43/43, aucun orphelin). **Seul trou : les E2E n'ont
pas été exécutés** — ils figent WSL ; la branche ne modifie aucun fichier de
`e2e/` et aucun spec n'asserte de cause d'annulation (vérifié par balayage),
mais ce n'est pas une exécution. La CI tranchera.

## V1.29 — Un lot dont la source disparaît est ANNULÉ, jamais effacé — quatre résidus soldés sur six (✅ 2026-08-03, branche `chantier/residus-chasse`)
**Objectif** : fermer les résidus que le chantier précédent avait consignés
ouverts (docs/bugs.md). Six entrées, **quatre fermées** ; les deux restantes
sont des **décisions** et non des dettes, reformulées comme telles.

- [x] **Le portefeuille du client cesse de promettre un lot que la caisse
      refuse** — les dix triggers de miroir du registre étaient
      `after insert or update`, jamais `delete` : une source supprimée laissait
      sa ligne de registre orpheline, « À retirer » sur `/portefeuille` et
      « Code introuvable » au comptoir. Migration `20260902120000`, arbitrage
      **marquer plutôt que détruire** (ADR-068) : l'état `cancelled` existait
      déjà de bout en bout, donc le client lit une explication au lieu de
      constater une disparition, et le rapport du lundi ne voit pas le chiffre
      d'une semaine passée baisser après coup.
- [x] **La rétention ne parle plus au nom du commerçant, et ne détruit plus un
      lot qu'elle vient d'annuler** — les deux MOYEN de la revue sécurité,
      tous deux **conséquences non déclarées de la migration elle-même**. La
      purge RGPD supprime sur le seul critère d'âge : le nouveau trigger la
      transformait en annulateur de masse, une ligne annulée étant purgeable
      la nuit même alors qu'elle était protégée à vie avant. Et un motif unique
      pour trois causes aurait fait affirmer à un caissier, **au client en
      face**, que son patron avait supprimé l'opération. Cause normalisée à
      vocabulaire fermé (ADR-069) — pas le `cancelled_reason` libre, écarté
      après vérification : c'est du texte saisi par le commerçant.
- [x] **La caisse distingue « annulé » d'« introuvable »** — `routeRedeemCode`
      rendait `null` sans jamais atteindre `tryUniversalRedeem` : le bon
      message existait, il n'était pas atteint, et un vrai gagnant recevait le
      même refus qu'un code inventé.
- [x] **Un lot de roue gagné par un TOUR OFFERT rejoint son portefeuille** —
      le pont d'identité `campaign` n'était posé par personne. Il est relu
      **sur le spin**, jamais sur l'appelant : même source que celle que le
      miroir interrogera (ADR-066, Consequences corrigées).
- [x] **Le pont d'identité cesse d'être muet, et le rappel de chasse est
      borné** — traces sur les quatre sorties en échec, **étouffées par
      fenêtre et par cause** (sans quoi une panne générale produisait un
      événement Sentry et un `insert` `ops_metrics` par requête joueur) ; trois
      gardes sur `loadHuntRecallContext`, dont un seau délibérément
      `failClosed: false` — fermer ce chemin sur une panne d'infrastructure
      rendrait une chasse close **moins** accessible qu'une chasse ouverte, au
      moment précis où son seul recours est cette page (ADR-070).

**Revue sécurité — GO, réserves levées** : 0 CRITIQUE, 0 ÉLEVÉ, 2 MOYEN,
4 FAIBLE, 3 INFO, tous corrigés.

**Reste ouvert, écrit et non masqué** : sept familles sur neuf n'ont aucune
expiration au registre, donc un lot annulé par purge y est conservé
indéfiniment (restauration du comportement d'avant, mais rien ne clôt jamais
ces lignes) ; `loadHuntStepContext` reste non borné sur la même page, ce qui
relativise le seau posé ; le seau `huntRecall` ne borne qu'un porteur
coopératif, sa clé étant un cookie que le porteur contrôle — la phrase a été
corrigée plutôt qu'une fausse garde ajoutée ; `WheelResult` et `ContestResult`
rendent « annulé » sans cause ; et **deux gardes ne prouvent pas ce qu'on
croit** (la garde des littéraux SQL compare au fichier de migration et jamais à
`pg_proc` ; `player-identity-coverage.test.ts` est textuelle — QA a neutralisé
un appel par `void 0 &&` sans la faire rougir).

**Enseignement de méthode, qui prolonge celui du 2026-08-02** : deux contrôles
négatifs de plus ont rendu 0 rouge sans que le code soit en cause — cumul de
**neuf** sur les quatre derniers chantiers. Causes nouvelles : un `perl` qui
n'avait pas mordu sur une ligne accentuée (deux fois), et un **détecteur muet**
(`psql` sans `-t -A`, rendant 0 en ligne de base comme après sabotage). D'où la
pratique adoptée : **compter les VERTS autant que les rouges** — c'est le
compte des verts qui distingue « le correctif est inutile » de « le détecteur
ne mesure rien ». Second point : ne pas faire tourner QA et la revue sécurité
en parallèle, la revue ayant observé dans l'arbre des marqueurs `SABOTAGE`
transitoires.

**Preuve** : typecheck 0, lint 0, casts:check OK, test:casts 4/4, build vert
(Windows), 162 fichiers / 2795 tests, test:sql 12/12, migrations:check
106 fichiers, test:migrations 9/9, sql:check OK, pgTAP 43 fichiers /
2649 assertions PASS (base vide ET semée), `database.generated.ts` régénéré en
`--local` avec un diff de 0 ligne. **Les E2E n'ont pas été exécutés** (ils
figent WSL) — la branche ne touche aucun fichier de `e2e/` et aucun spec
n'asserte de texte d'annulation, mais ce n'est pas une exécution : la CI
tranchera. Seul trou du chantier.

## V1.28 — Chasse par parcours vécu : 19 défauts fermés, dont six gestes d'entretien qui détruisaient des codes en main (✅ 2026-08-02, branche `chantier/chasse-parcours`)
**Objectif** : cinq parcours vécus balayés (joueur/roue, joueur/autres modules,
caisse, socle commerçant, éditeurs), règle d'admission stricte « il fait X, il
attend Y, il obtient Z », puis réfutation adversariale de chaque trouvaille.
102 pistes examinées, 20 retenues, **19 confirmées et fermées, 1 réfutée**. Le
rapport de chasse complet — preuves et motifs de réfutation — est conservé tel
quel dans `docs/chasse-parcours-2026-08-02.md`.

- [x] **Six gestes d'entretien ne détruisent plus les codes qu'un client tient
      en main** — suppression d'une roue, d'une chasse, d'un calendrier, d'un
      quiz, d'un palier et d'un programme de fidélité cascadaient en silence
      sur les codes émis et non retirés. Chacune reçoit la garde déjà écrite un
      cran au-dessus pour la campagne : compter les codes en attente, refuser
      tant que la case n'est pas cochée, **et nommer le chiffre**. Décision de
      comptage et de refus extraite dans `src/lib/codes-en-attente.ts`
      (ADR-063) ; les six entrent au registre
      `destructive-confirm-coverage.test.ts`.
- [x] **Le stock d'un lot n'est plus recrédité par une correction de coquille**
      — `prizes.stock` est le RESTANT ; toute sauvegarde de la ligne le
      réécrivait à sa valeur d'il y a une heure. Compare-and-swap sous témoin
      `stock_seen` de ce que le champ AFFICHAIT (ADR-065).
- [x] **La description d'un lot émis est gravée comme son libellé l'est depuis
      `20260814120000`** — migration `20260901120000_freeze_reward_details.sql`,
      gel de la seule clé `reward_details` de `metadata`, sur la VALEUR et non
      sur la présence de la clé (ADR-064). En attendant qu'elle soit appliquée,
      la caisse retire la description plutôt que d'en afficher une périmée.
- [x] **Le joueur retrouve son gain** — reprise de gain écrasée sur la roue
      (seul des quatre parcours à n'avoir jamais reçu la correction du
      2026-07-29) ; claim non idempotent (une coupure réseau après le commit
      privait le joueur de son code à jamais — le rejeu rend désormais le code
      déjà émis, ADR-067) ; SMS de code de retrait jamais envoyé au premier
      gain d'un couple (organisation, numéro) ; code de chasse perdu à la fin
      de la fenêtre ; pont d'identité posé pour pronostics et parrainage, les
      deux familles qui manquaient au portefeuille et aux missions de saison
      (ADR-066).
- [x] **La caisse dit ce qu'elle sait** — le badge vert de confirmation est
      attaché au GESTE (`?remis=1`) et non à l'horloge : un second porteur d'un
      code consommé depuis moins de 90 s recevait l'ordre de servir un
      deuxième lot ; refus de caisse daté au fuseau de l'établissement et non à
      celui du serveur.
- [x] **Les écrans cessent de renvoyer sur un mur** — « Voir les offres » et
      « Gains à valider » ne sont plus des liens pour un `editor` (règle portée
      par la DESTINATION, `src/lib/liens-proprietaire.ts`) ; « votre essai
      gratuit est terminé » n'est plus dit à un résilié ; la ligne « Essai
      gratuit : 7 jours » n'est plus affichée à un abonné ; un checkout refusé
      ouvre le portail qu'il nomme au lieu de renvoyer vers un bouton absent ;
      la duplication d'une campagne emporte enfin son plafond de dépense.

**Revue sécurité — GO sous réserve, réserves levées le jour même** : 1 ÉLEVÉ,
3 MOYEN, 2 FAIBLE, 4 INFO, tous corrigés. L'ÉLEVÉ portait sur les correctifs
eux-mêmes : la garde de suppression de roue comptait les participations avec le
client RLS, dont la policy de lecture est owner-only, alors que l'action laisse
un `editor` agir — pour lui la garde rendait « aucun code », donc aucune case et
aucun chiffre, et la suppression passait en silence. **Le propriétaire, lui,
voyait le refus** : le défaut était invisible à qui ne teste qu'avec un compte
owner (ADR-063).

**La trouvaille réfutée, consignée pour ne pas la rouvrir** :
`meta-progression-invisible-hors-roue` — le fait est exact, la qualification ne
l'est pas : c'est une limitation décidée (ADR-044) et déjà portée par l'item
« Étendre la visibilité du panneau joueur » ci-dessous, auquel un seul élément
neuf est versé.

Preuve : typecheck 0, lint 0, casts:check OK, test:casts 4/4, build vert
(Windows), **161 fichiers / 2741 tests**, test:sql 12/12, migrations:check
105 fichiers (head `20260901120000`, `EXPECTED_MIGRATION` synchronisée),
test:migrations 9/9, sql:check OK, pgTAP **42 fichiers / 2609 assertions PASS**
(base vide ET semée). **Le seul trou réel : les E2E n'ont pas été exécutés** —
ils figent WSL sous la charge (piège 9 de CLAUDE.md) ; c'est la CI qui
tranchera. Reste ouvert : voir docs/bugs.md (portefeuille sans jointure source,
pont d'identité d'un tour offert, `loadHuntRecallContext` sans rate-limit,
reprise déterministe sur appareil partagé, pannes d'identité avalées, rejeu sans
renvoi compté et non réémis). ADR-063 à ADR-067.

## V1.27 — Activer la cadence rapide de la file en un clic, sans manipuler `CRON_SECRET` (✅ 2026-08-01, branche `chantier/cadence-file`, commits `f7aa3fd`, `fe36d6b`)
**Objectif** : le point §5bis de `docs/production-readiness.md` demandait au
propriétaire de poser à la main deux secrets Vault (`jobs_worker_url`,
`sync_contests_secret`) pour faire passer la file de jobs SMS d'un passage
quotidien à un passage toutes les 5 minutes. Poser `jobs_worker_url` exige de
recopier `CRON_SECRET` — un secret d'exploitation qui n'a aucune raison de
transiter par un presse-papier humain.

- [x] **Action `enableWorkerFastCadence`** — lit `CRON_SECRET` et l'URL de
      l'application dans son propre environnement serveur (jamais depuis le
      client) et les dépose au Vault via RPC. Permission dédiée
      `monitoring.cadence`, super_admin seul, `requireFresh`, refus tracé.
      URL refusée si non-https ou si elle désigne un hôte local/privé
      (loopback, `10/172.16-31/192.168/169.254`, `.local`) — module pur
      `src/lib/admin/worker-cadence.ts`. Le secret n'apparaît dans aucune
      sortie (journal, erreur) : seul le SQLSTATE Postgres est journalisé.
- [x] **Panneau « Cadence des workers »** (`/admin/monitoring`) — piloté par
      le registre `ops_worker_definitions`, pas par des chiffres recopiés ;
      trois états (quotidienne / 5 minutes / inconnue si non supervisé) ;
      dit la conséquence produit (délai du code de retrait SMS) plutôt
      qu'un drapeau technique ; ni URL ni secret ni nom d'entrée Vault ne
      transitent jusqu'à l'écran.
- [x] **RPC d'écriture au Vault** (`set_worker_vault_secrets`, migration
      `20260831120000_worker_vault_write.sql`) — n'écrit que dans les deux
      entrées Vault que le registre `ops_worker_definitions` désigne pour
      le worker demandé ; un refus prévisible (worker inconnu, prérequis
      Vault absents, valeur vide) est rendu comme statut, jamais levé, pour
      ne pas imprimer `CRON_SECRET` dans les journaux Postgres — seul le
      refus d'autorisation lève. `also_affects_workers` nomme le worker
      voisin dont l'entrée Vault est partagée. Reste requis, hors code : la
      migration doit être **appliquée en production**, puis le bouton doit
      encore être **cliqué** par le propriétaire — tant que l'un des deux
      n'a pas eu lieu, la file continue de tourner une fois par jour. Voir
      `docs/production-readiness.md` §5bis.

Preuve (lot RPC + backend + écran) : typecheck 0, lint 0, casts:check OK,
test:casts OK, build vert, npm test 146 fichiers / 2516 tests, pgTAP (WSL)
41 fichiers / 2592 assertions PASS (base vide et semée), migrations:check
OK, test:migrations 9/9, sql:check OK. Revue sécurité de la RPC (lecture
seule, HEAD `1d30c6b`) : GO, 0 CRITIQUE, 0 ÉLEVÉ, 1 MOYEN (rien n'empêche
d'armer la cadence depuis un déploiement non-production — correctif
proposé, non livré), 4 INFO. ADR-062 (et addendum).

- [x] **Fermeture du MOYEN, même jour, même branche** (commits `b97f344`,
      `4bfa714`, `8c87128`) — `checkCadenceEnvironment` (module pur) refuse
      d'armer si `VERCEL_ENV ≠ production` (absente = refus) et compare
      l'hôte de `NEXT_PUBLIC_APP_URL` à `VERCEL_PROJECT_PRODUCTION_URL`
      quand Vercel l'expose, seul angle attrapant une `APP_URL` périmée sur
      une vraie production ; placée après la garde d'URL pour que le
      message le plus précis gagne. Ce qu'elle ne couvre pas
      (`VERCEL_PROJECT_PRODUCTION_URL` non vérifiée à l'exécution sur ce
      projet) est rendu à l'audit (`production_host_verified`), pas caché.
      Au passage : la justification d'origine du refus « rendu, jamais
      levé » (fuite de `CRON_SECRET` dans les journaux Postgres) était
      **fausse** — mesurée (`log_parameter_max_length_on_error = 0`) et
      corrigée aux quatre endroits qui la portaient ; le design est gardé
      pour une raison différente (un refus prévisible n'a rien à faire dans
      un journal d'erreur). Et l'avertissement pré-clic du panneau
      sous-déclarait le worker voisin dont l'entrée Vault partagée est
      aussi réécrite (`ops.ts` filtrait par `vault_url_secret` seul) —
      filtre retiré. Deux contrôles négatifs joués : garde d'environnement
      neutralisée → 14 rouges, filtre réintroduit → 2 rouges. Preuve :
      typecheck 0, lint 0, build vert, 146 fichiers / 2537 tests, pgTAP 41
      fichiers / 2592 assertions PASS (base vide et semée). ADR-062
      (second addendum), docs/bugs.md, docs/production-readiness.md.

**Corrigé le 2026-08-02 — la prémisse de ce chantier était fausse,
mesurée et non déduite.** La sonde `production-health.yml` (commit
`46c33dc`, 17h36 UTC) prouve que le worker `jobs` répondait déjà
`healthy` avec un battement inférieur à 15 min alors que le seul filet
Vercel passe à 04h20 UTC, treize heures plus tôt : les deux secrets
Vault existaient déjà en production et `lastchance-jobs-worker` tournait
déjà toutes les 5 minutes avant l'ouverture de ce chantier. Le panneau
livré n'est donc pas un déblocage mais une **rotation** par-dessus une
configuration qui fonctionne — le risque s'inverse, un mauvais armement
casse une file qui tourne plutôt que d'en débloquer une inerte. ADR-062
(troisième addendum), docs/bugs.md, docs/production-readiness.md §5bis
(le geste de pose des secrets Vault est retiré de la liste des choses à
faire).

## V1.26 — Solder les ouverts : 27 affirmations relues contre le code vivant (✅ 2026-08-01, branche `chantier/solder-les-ouverts`, commit `ff8a722`)
**Objectif** : pas une nouvelle fonctionnalité — vérifier, une par une, les
affirmations laissées « ouvertes » ou « géantes » par les audits précédents
(surtout l'audit `router.refresh` du 2026-07-30) contre le code réellement en
place, corriger ce qui l'était encore, et refermer ce que la documentation
avait laissé traîner comme ouvert alors que le code l'avait déjà fermé.
**C'est la quatrième fois que ce dépôt paie cette forme de dette** (voir
docs/bugs.md, section Notes).

- [x] **9 confirmées, corrigées** — 7 bascules d'état sans `reloadOnSuccess`
      sur des surfaces réellement ouvertes (statut de championnat, module
      calendrier au back-office, suspension d'un commerçant, modération d'un
      joueur en direct, remise de récompense pronostics, résultat de
      match/question), plus deux corrections documentaires (un gain de
      23 h 30 ne part pas instantanément — il reste soumis au cron
      quotidien ; la mention STOP sans numéro court a bien un correctif de
      code depuis PR #82, contrairement à ce que docs/bugs.md affirmait).
      Garde mécanique ajoutée : `src/lib/use-action-form-bascule.test.ts`
      (14 bascules, 5 contrôles négatifs).
- [x] **15 affirmations déjà closes** par des chantiers antérieurs sans que
      ce dépôt l'ait enregistré — 9 bascules qui portaient déjà
      `reloadOnSuccess`, les deux réordonnancements (quiz, chasse, fermés le
      2026-07-30 par `src/lib/ordre-optimiste.ts`), l'artefact d'axe sur
      `/play`, les couleurs libres, le jeton du kicker.
- [x] **3 affirmations fausses dès l'origine** — le doublon de ligue
      (`contest-leagues.tsx`, le résultat est porté par `state`, pas par un
      rafraîchissement), l'exemple ambre choisi pour illustrer les couleurs
      hostiles (il passe le seuil, recalculé), et l'affirmation que le SMS
      facture toujours 1 crédit par envoi (fermé depuis ADR-058).
- [ ] **Reste ouvert, sans changement** : les 32 « gênants » de l'audit
      d'origine n'ont eu qu'une seule passe sans réfutation ; aucun taux
      d'échec n'a été mesuré hors du module progression.

Preuve : typecheck 0, lint 0, casts:check OK, test:casts 4/4, build Windows
OK, migrations:check 103 fichiers, test:migrations 9/9, sql:check OK,
test:sql 12/12, 143 fichiers / 2422 tests unitaires. Détail : docs/bugs.md.

## V1.25 — Rendre le canal SMS réellement utilisable (✅ 2026-08-01, branche `feat/canal-sms-utilisable`)
**Objectif** : corriger ce que V1.24 avait de trop généreux — le canal SMS
livré n'avait **aucun appelant** pour ses quatre RPC d'expéditeur, donc
`sms_sender_for_send` rendait toujours `null` et aucun SMS ne pouvait
partir. Documenté ici sans l'adoucir : une documentation qui décrit une
capacité que le code n'a pas encore est exactement le défaut que ce dépôt a
déjà corrigé trois fois.

- [x] **Le canal était inerte, maintenant il ne l'est plus** — deux surfaces
      manquantes ajoutées : l'écran commerçant `/dashboard/settings/sms`
      (demande d'expéditeur, solde, grand livre, packs Stripe) et le panneau
      back-office (déclaration AF2M, refus/suspension, crédit manuel). Sans
      elles, `declare_sms_sender` n'était jamais appelée
- [x] **Le multi-segment, tranché** — le grand livre débite désormais ce que
      Brevo facture réellement, pas un forfait d'une unité par message
      (ADR-058). `smsSegments()` calcule côté serveur, dans la même
      transaction que la réservation ; `sms.segment_mismatch` rend
      l'hypothèse mesurable plutôt que présumée
- [x] **Achat de crédits en libre-service** — packs Stripe (100/500/2000),
      catalogue piloté par variables d'environnement, un pack sans variable
      n'est pas proposé plutôt que d'échouer au clic. Webhook
      `checkout.session.completed` crédite via `credit_sms_balance`,
      idempotent par l'entrée déjà prise dans `stripe_events`
- [x] **Numéro court du STOP, nommable** — `SMS_STOP_SHORTCODE` optionnelle ;
      posée, le texte de consentement le cite ; absente, comportement
      inchangé (le compte Brevo n'est pas encore ouvert)
- [x] **Revue sécurité, puis correctifs** — 0 CRITIQUE, 2 ÉLEVÉ, 2 MOYEN,
      3 INFO trouvés en lecture seule ; les 2 ÉLEVÉ et les 2 MOYEN
      **corrigés le même jour** (migration `20260828120000_sms_findings.sql`,
      commits `9f9cc3f`, `088daf2`) — voir `docs/bugs.md` et ADR-059. Une
      contre-revue des correctifs a trouvé 4 résidus (un contournement par
      changement de nom, une sanction qui redevient invisible après
      retrait, un crédit back-office non fidèle sur doublon, aucune
      fenêtre horaire légale sur les SMS) — **3 clos au troisième tour**,
      voir ci-dessous.
- [x] **Troisième tour, sur contre-revue** (2026-08-01, commits `301d04f`,
      `05754be`, `5bfe506`) — la sanction porte désormais sur le droit
      d'émettre d'une **organisation**, pas sur un nom d'expéditeur
      (migration `20260829120000`) : redemander sous un autre nom, ou
      relever une suspension via le formulaire de déclaration, sont
      refusés. Un expéditeur `suspended` puis `retired` reste affiché
      comme sanctionné sur les deux écrans (`sms-sender-state.ts`) au lieu
      de redevenir un no-op muet. Les deux appelants de
      `credit_sms_balance` lisent désormais `created` et distinguent un
      crédit d'un rejeu, en base (signature change en
      `(entry_id, created)`) et à l'écran (ambre, pas vert). **Trouvé au
      passage, par la mesure et non l'hypothèse** : la file de jobs tourne
      une fois par jour (`vercel.json`), pas toutes les 5 minutes comme
      sept commentaires l'affirmaient — un code de retrait peut arriver
      jusqu'à 24h après le gain ; la fenêtre horaire légale posée dans un
      module pur (`src/lib/sms-window.ts`, ADR-060) s'applique désormais
      dans le worker avant tout débit. La question laissée ouverte —
      fenêtre sans distinction de nature du message — est tranchée au
      quatrième tour ci-dessous.
- [x] **Quatrième et dernier tour** (2026-08-01, commits `31268a0`,
      `76b257f`, `e432b20`) — trois lots. **SQL** : le trigger de
      renommage d'expéditeur protégeait déjà le registre
      (`declared → pending`) mais pas la sanction — renommer un
      expéditeur `suspended` le laissait retomber en `pending`, levant la
      suspension sans qu'aucun humain ne l'ait décidée ; garde posée sur
      `old.status = 'suspended' or new.status = 'suspended'`
      (migration `20260830120000`). **Backend** : le code de retrait
      devient **transactionnel** (`marketing: false`, ADR-061) — la
      question laissée ouverte au troisième tour est tranchée par le
      client, un gain de 23h30 part à 23h30 ; un report de fenêtre pour un
      futur SMS publicitaire devient un état `deferred` qui ne consomme
      plus le budget de reprise des pannes (plafond d'âge 7 jours) ; les
      lignes `sms_log` figées en `sending` au-delà de 24h sont désormais
      comptées (`sms.stale_sending`), jamais remboursées automatiquement —
      on ne sait pas si Brevo a reçu. **Écrans** : le bandeau
      `/dashboard/settings/sms` distingue enfin « aucun expéditeur
      utilisable » (rouge) de « les SMS partent malgré une suspension
      ailleurs » (ambre) ; le délai d'attente affiché est borné aux 7 jours
      réels plutôt que « n'est pas perdu ».

**Preuve (troisième tour)** : pgTAP base vide et semée, 40 fichiers /
2 543 assertions PASS ; npm test 142 fichiers / 2 384 tests PASS ;
typecheck 0 ; lint 0 ; build vert. Trois contrôles négatifs joués :
fuseau remplacé par UTC (4 rouges), garde horaire désarmée (3 rouges),
`created` forcé à vrai chez les deux appelants (2 rouges), garde de
sanction retirée (8 rouges), distinction suspendu/retiré supprimée
(5 rouges). Contre-revue du troisième tour : 0 CRITIQUE, 0 ÉLEVÉ, 2 MOYEN
(consignés `docs/bugs.md`), 10 scénarios d'attaque tentés et réfutés.

**Preuve (quatrième tour)** : pgTAP 40 fichiers / 2 563 assertions PASS
(base vide et semée) ; npm test 142 fichiers / 2 409 tests PASS ;
typecheck 0 ; lint 0 ; build vert (Windows) ; `migrations:check` OK,
103 migrations. Trois contrôles négatifs joués et restaurés : code de
retrait repassé `marketing: true` (1 rouge nommé), trigger de renommage
sabordé et vérifié appliqué dans `pg_proc` (4 rouges nommés), garde de
fenêtre horaire désactivée (7 rouges). Contre-revue du quatrième tour :
0 CRITIQUE, 0 ÉLEVÉ, 0 MOYEN, 5 INFO (texte d'écran et une confirmation
Brevo à faire à l'ouverture du compte) — GO. Le canal SMS n'a plus de
résidu ouvert de sécurité ou de fonctionnement ; les gestes restants
(compte Brevo, cron à 5 min) appartiennent au propriétaire, voir
`docs/production-readiness.md`.

**Preuve (livraison initiale + tour 2)** : pgTAP base vide et semée,
39 fichiers / 2 487 assertions PASS ; npm test 140 fichiers / 2 339 tests
PASS ; typecheck 0 ; lint 0 ; build vert, `/dashboard/settings/sms` dans
la liste des routes. Six contrôles négatifs joués au total (2 sur les
correctifs de sécurité, 4 sur la livraison initiale — segments,
expéditeur, deux côtés Stripe), chacun rouge précisément sur la propriété
visée puis restauré vert.

## V1.24 — Le rapport du lundi, le portefeuille du client, et le canal SMS (✅ 2026-08-01, PR #80)
**Objectif** : trois fonctionnalités demandées par le client, six migrations,
un canal réglementé de bout en bout.

- [x] **Le rapport du lundi** — e-mail hebdomadaire au commerçant (joueurs,
      lots remis, panier attribuable, podium, comparaison à la semaine
      précédente). `org_prize_funnel` ne suffisait pas (roue seule, aucun
      joueur compté, aucune comparaison) ; `org_weekly_digest` lit les neuf
      familles du registre universel en un aller-retour. Seuil de la semaine
      vide **auto-limitant** : envoi seulement si la semaine écoulée OU la
      précédente porte de l'activité — un « 0/0 » chaque lundi tue l'e-mail,
      une chute à zéro après une semaine active reste l'alerte la plus utile
      de l'année, et deux rapports vides ne peuvent jamais se suivre. Montants
      réservés aux owner/editor, garde entièrement applicative (le cron
      appelle la RPC en `service_role`, sans rôle applicatif à protéger côté
      base)
- [x] **Le portefeuille du client** — `/portefeuille`, un lien qui rassemble
      tous les gains d'un joueur toutes familles confondues, lu depuis le
      registre universel des récompenses. **Aucun jeton dans l'URL** : la
      page lit le cookie de l'appareil qui a scanné, garantie tenue par le
      compilateur (`loadPlayerWallet()`/`PortefeuillePage()` ne prennent
      aucun argument). Code de retrait jamais journalisé
- [x] **Le canal SMS** — prestataire Brevo, crédit prépayé à l'unité, sans
      abonnement ni expiration. Expéditeur alphanumérique ≤ 11 caractères
      conforme au nom commercial déclaré (charte AF2M) ; ne peut recevoir de
      réponse, le STOP arrive par le numéro court du prestataire via route
      webhook dédiée. Solde matérialisé + grand livre en ajout seul
      (3 triggers, non-divergence structurelle), coût stocké en micros.
      Premier producteur branché : un gagnant qui laisse son téléphone plutôt
      que son e-mail reçoit désormais son code
- [x] **Le crédit ne peut pas découvrir, prouvé et non affirmé** — sous un
      solde de 1, deux envois concurrents rendent un succès et un refus avec
      un seul mouvement au grand livre (second appel chronométré à 2 174 ms,
      il a réellement attendu le verrou) ; sous un solde de 2, les deux
      passent
- [x] **`not_enough_credits` classé avant le statut HTTP** — Brevo répond 400
      aussi bien pour un quota épuisé que pour un numéro invalide ; classé sur
      le statut seul, un quota épuisé aurait été remboursé ET interdit à
      jamais de renvoi
- [x] **Normalisation E.164 en colonne calculée** — `0612345678` et
      `+33612345678` comptaient pour deux consentements distincts, un STOP
      sur l'un ne valait pas pour l'autre
- [x] **Sept findings de revue sécurité, tous corrigés** — dont
      `player_wallet` qui ne vérifiait pas le joueur actif (commentaire citant
      une ligne au lieu de relire la requête entière) et deux migrations dont
      l'en-tête affirmait à tort qu'« aucun chemin » ne contournait leurs
      gardes (un `delete` non couvert par les triggers dans les deux cas)
- [x] **Texte de consentement réécrit une fois et une seule** — ne nommait ni
      le responsable du traitement ni le destinataire du STOP ; réécrit sur
      place plutôt qu'en `v2` car aucun consentement n'existe encore

**Assumé / reste ouvert** : le multi-segment (le grand livre débite 1 crédit,
Brevo facture par segment) ; la mention STOP sans numéro court tant que le
compte Brevo n'existe pas ; l'achat de crédits par Stripe (back-office
plateforme seul aujourd'hui) ; `BREVO_API_KEY`/`BREVO_WEBHOOK_SECRET` à poser ;
le worker `weekly-digest` inscrit mais non supervisé tant qu'il n'a pas un
premier succès ; `credit_sms_balance` doit être appelée au moins une fois pour
que le canal soit essayable.

**Constat, non technique** : la production a été mesurée pendant ce chantier —
1 organisation, 1 compte utilisateur, 1 participation, 4 spins, 2 lignes au
registre, abonnement en essai. C'est le compte de test du propriétaire ; il
n'y a aucun commerçant réel derrière quinze modules, plus de 2 200 tests et
99 migrations.

**Preuve** : pgTAP 37 fichiers / 2 402 assertions (base vide et semée),
137 fichiers / 2 233 tests, typecheck 0, lint 0, CI verte sur les sept
contrôles.

## V1.23 — Les deux derniers résidus : invitations en vol et permutation de libellés (✅ 2026-08-01, PR #78)
**Objectif** : clore les deux derniers résidus consignés dans `docs/bugs.md`,
dont un vrai défaut.

- [x] **Deux invitations vivantes pour la même adresse** — `team_invitations`
      ne porte aucune unicité sur (organisation, e-mail) ; réinviter (le
      geste naturel après une erreur de rôle) créait une seconde invitation
      valide sans révoquer la première. En ouvrant la plus ancienne, le
      collègue entrait avec le rôle qu'on venait de corriger.
      `inviteTeamMember` révoque désormais les invitations non acceptées de
      la même adresse avant d'envoyer la nouvelle (mécanisme `revoked_at`
      déjà en place, jamais appelé sur ce chemin)
- [x] **Permuter deux libellés réécrivait le sens des réponses données** —
      une réponse enregistrée désigne un bouton, pas un texte ; le gel du
      libellé livré plus tôt laisse la correction de coquille gratuite, mais
      une permutation d'options laisse les réponses en place en changeant ce
      qu'elles signifient. Refusée quand l'ensemble des libellés (triés) est
      identique mais leur ordre/affectation change, tant que des réponses
      existent
- [x] **Garde séparée du registre des quatre suppressions** — inscrite puis
      retirée du registre de convergence des confirmations destructives (il
      ne détruit rien, son marqueur doit différer) ; voir ADR-054
- [x] **Six sabotages joués avec témoin**, dont un qui rejoue le geste
      trop large du premier essai et fait tomber les quatre tests protégeant
      la correction de coquille

**Assumé** : navigateurs Playwright non installés sur Windows pour forcer la
reproduction du flaky de la caisse — impact produit déjà réfuté, le test
s'instrumente lui-même pour le prochain passage.

**Preuve** : 124 fichiers / 2 007 tests, typecheck 0, lint 0, CI verte sur
les sept contrôles.

## V1.22 — Superviser les workers dont le heartbeat a fait ses preuves (✅ 2026-07-31, PR #76)
**Objectif** : dernier point ouvert de la V1.20 — six crons quotidiens
déposaient des heartbeats depuis des semaines sans être supervisés.

- [x] **Six crons hors de l'objectif de service** — `20260805240000` avait
      inscrit `automations`, `calendar-reminders`, `jackpot-draws`,
      `purge-data`, `reengage` et `webhooks` à `enabled = false` avec un
      motif juste à l'époque (« aucune route n'écrit encore de
      heartbeat »). Mesuré, pas supposé : les six appellent tous
      `startWorkerRunSafely` / `finishWorkerRunSafely` depuis. Une purge
      RGPD qui échouerait chaque nuit ne réveillerait personne
- [x] **Une règle, pas une liste** — migration `20260820120000`, un
      `UPDATE` conditionnel qui supervise tout worker ayant déjà déposé un
      succès, général et non énumératif (`expire-trials` reste `false`
      jusqu'à son premier succès), sans effet sur une base neuve (CI,
      poste de développement). Voir ADR-053
- [x] **Contrôle négatif joué en deux tours** — le premier ne prouvait
      rien (`2>/dev/null` sur l'insertion du heartbeat de test, la
      commande dont l'échec était l'information cherchée) ; refait sans
      redirection, concluant sur six sondes numérotées
- [x] **Une assertion retirée parce qu'elle avait tort** — « aucun succès
      n'est enregistré » mesurait en réalité l'état après les propres
      insertions du fichier de test ; retirée plutôt que rafistolée

**Preuve** : pgTAP 31 fichiers / 2 079 assertions PASS sur base vide et
semée ; Vitest 123 fichiers / 1 997 tests ; typecheck 0 ; lint 0 ; 93
migrations, `EXPECTED_MIGRATION` à jour dans `src/lib/release.ts`.

## V1.21 — Le flaky de la caisse tranché, et trois documents qui mentaient (✅ 2026-07-31, PR #75)
**Objectif** : dernier point ouvert du socle (le flaky `player-win.spec.ts`),
plus trois documents dont le contenu ne décrivait plus le code.

- [x] **Le flaky de la caisse innocenté par lecture, pas par supposition**
      — `player-win.spec.ts` tombait par intermittence sur « panier absent
      après un retrait réussi ». Les trois étages applicatifs sont sains :
      le champ est non contrôlé (sa valeur vit dans le DOM), le hook
      construit son `FormData` au moment du submit, et les deux chemins de
      remise persistent le panier jusqu'à `participations.basket_cents`.
      Comme `parseBasketToCents("")` rend `null`, la seule lecture
      possible est un champ vide au clic
- [x] **Deux gestes sur le test** — attendre l'hydratation avant de
      saisir ; une assertion qui échoue désormais au moment du clic,
      distinguant course client et défaut serveur
- [x] **Non reproduit, dit tel quel** — la sonde a été écrite et lancée,
      WSL a gelé deux fois sous la charge du build avant de rendre un
      chiffre ; la cause reste déduite, pas mesurée
- [x] **Trois documents faux corrigés** — la roadmap annonçait le
      créateur de quiz « non poussé / non déployé » (réserve jamais levée
      alors qu'elle se tranchait en une commande) pendant que CLAUDE.md le
      décrivait déjà comme livré ; idem pour la place de marché de
      campagnes (V1.15) ; `docs/bugs.md` annonçait « trois formulaires
      restent exposés » dont la caisse, corrigés depuis le second tour
      (PR #52→#59)

**Preuve** : pgTAP 31 fichiers / 2 079 assertions PASS sur base vide et
semée ; Vitest 123 fichiers / 1 997 tests ; typecheck 0 ; lint 0.

## V1.20 — L'autorité de Stripe s'arrête avec l'abonnement, et un essai non confirmé finit résilié (✅ 2026-07-31, PR #73)
**Objectif** : deux points laissés ouverts par la V1.19, plus une demande du
client (« qu'un essai soit résilié si Stripe ne remonte pas de paiement
actif »).

- [x] **`protect_stripe_managed_entitlements` ignorait `active`** — un
      commerçant résilié restait « géré par Stripe » à vie pour un accès
      offert, alors qu'il en est la cible naturelle. Corrigé par
      `and e.active` (migration `20260818120000`). Les deux `throws_ok` de
      `subscription_entitlements.test.sql` qui protégeaient ce prédicat ont
      été remontés sur l'abonnement vivant (avant résiliation), avec un
      miroir après résiliation qui relit la valeur et la frontière
      `past_due` contrôlée séparément. `org_effective_entitlements` porte le
      même défaut et n'est délibérément pas corrigée (aucun appelant
      applicatif). Voir ADR-051
- [x] **Cron `expire-trials`** — un essai expiré sans souscription restait
      `trialing` indéfiniment (mensonge de statut, pas de trou d'accès).
      Trois garde-fous : Stripe interrogé avant chaque bascule, une panne
      Stripe ne résilie personne, un abonnement vivant chez Stripe avec un
      statut local `trialing` est un webhook perdu et se remonte au lieu de
      se résilier. 18 lecteurs de `trialing` audités, 7 modifiés. Voir
      ADR-052
- [x] **Deux résidus repris à la main** — `ops_worker_runs.worker` (clé
      étrangère) exigeait une ligne de registre pour `expire-trials`, sans
      quoi son heartbeat échouait en silence ; `resolveStripeEntitlements`
      rendait un couple non auto-cohérent (`[]` → plan `core` sans droits),
      corrigé en semant les droits du plan retenu
- [x] **Erreur introduite puis corrigée dans le chantier** — la migration du
      registre ajoute un 9ᵉ worker, `ops_monitoring.test.sql` épinglait
      « les huit workers » en dur : CI rouge, corrigé en nommant la
      différence (`results_eq`) plutôt qu'en comptant

**Reste ouvert, décision explicite, non prise dans ce chantier** :
- [ ] les sept crons quotidiens sont inscrits mais non supervisés
      (`enabled = false`), `expire-trials` compris — lever la supervision
      est un `UPDATE`, pas une migration, une fois le premier passage
      constaté en production

**Preuve** : pgTAP 31 fichiers / 2 079 assertions PASS sur base vide et
semée ; Vitest 123 fichiers / 1 997 tests ; typecheck 0 ; lint 0 ; 92
migrations, `EXPECTED_MIGRATION` à jour dans `src/lib/release.ts`.

## V1.19 — Le second passage sur les trouvailles laissées de côté par un plafond de workflow (✅ 2026-07-31, PR #72)
**Objectif** : la chasse aux bugs par parcours vécu du 2026-07-31 avait rendu
33 trouvailles, mais le traitement n'en avait retenu que 14
(`serieux.slice(0, 14)`, précédé d'un `filter(gravite !== 'mineur')`) et « 14
confirmées » a été rapporté comme un bilan complet. Ce chantier reprend les
15 trouvailles sérieuses laissées de côté, en réfutation adversariale avant
tout correctif.

- [x] **Réfutation adversariale des 15 trouvailles** — 11 tiennent, 4 sont
      fausses (plafond de dépense qui se déclenche bien, essai expiré qui est
      le paywall délibéré, compte à rebours qui est ADR-017, dates UTC déjà
      corrigées par la PR #71). Détail : docs/bugs.md
- [x] **ÉLEVÉ — `settle_hunt_completions` sans aucune des quatre gardes de
      contexte** de `record_hunt_scan` (addon, statut, fenêtre) : un simple
      éditeur pouvait vider une chasse à une seule étape et faire émettre des
      centaines de codes `CHASSE-` réels sans plafond. Gardes ajoutées ;
      effet de bord fermé (le solde d'une étape retirée en brouillon ne
      partait plus, rattrapé à la réactivation) ; `hunt_settlement_preview`
      ajoutée pour que le refus de suppression d'étape nomme le nombre de
      codes qui seraient émis, pas seulement le nombre de joueurs en cours ;
      même défaut de forme trouvé et corrigé sur le calendrier
      (`calendar_players.opened_count`)
- [x] **« Avoir un client Stripe » n'est pas « avoir un abonnement »** — le
      bouton d'abonnement pouvait disparaître définitivement après un retour
      sur la page Stripe, `past_due` ne coupait jamais l'accès (action admin
      qui omettait `past_due_since`), le bandeau inventait une cause d'échec,
      un accès offert avec module échouait sans dire pourquoi. Voir ADR-050
- [x] **Le dashboard affirmait « Active » sur une campagne injouable** —
      `status` stocké vs jouabilité dérivée (fenêtre `starts_at`/`ends_at`),
      divergence structurelle sur les dix modèles de galerie
      (`auto_schedule: false`). Prédicat extrait et partagé. Checklist
      d'accueil corrigée pour les non-propriétaires dans le même geste
- [x] **Quatre gestes d'entretien qui coinçaient un humain** — calendrier
      (réduction de grille détruisant des ouvertures), événement live
      (édition de question effaçant les réponses), chasse au trésor (écran
      fermant la porte qu'un correctif SQL laissait ouverte), équipe (rôle
      d'un collègue inchangeable — nouvelle RPC `set_team_member_role`)
- [x] **Le coût d'un lot ne se saisissait qu'au second temps** — lecture du
      `FormData` de création oubliait `cost_cents`/`value_cents`, présents
      dans le schéma et lus par la modification
- [x] **Le 404 du panel envoyait chercher une cause inexistante** — le
      message, pas la coupure elle-même (délibérée, ADR existant,
      verrouillée par test) : sept pages de module renvoyaient un « vérifiez
      le sélecteur d'organisation » sans rapport avec l'expiration d'essai
- [x] **Supprimer une session d'événement live emportait les lots non
      retirés** — `event_wins` en cascade, confirmation ajoutée nommant le
      nombre de lots en jeu
- [x] **`revoke all … from public, anon` ne retire pas `service_role`** —
      écart documentation/base mesuré en base (217/231 fonctions),
      **pas une escalade** (`service_role` contourne déjà la RLS). Voir
      ADR-049 pour le raisonnement et la vérification

**Reste ouvert, décisions explicites, non prises dans ce chantier** :
- [x] `protect_stripe_managed_entitlements` ne filtrait pas son `exists` sur
      `active` — traité en V1.20 (PR #73)
- [ ] `calendar_players.opened_count` reste désaligné dans le cas général
      après une réduction de grille (le recompte corrige l'affichage, pas la
      conséquence sur des récompenses déjà distribuées)
- [ ] aucun rattrapage rétroactif global des chasses au trésor
- [ ] les invitations d'équipe déjà en vol au moment d'un changement de rôle
      restent silencieuses
- [ ] les 77 sites restants portant l'idiome `revoke … from public, anon`
      sans révoquer `service_role` explicitement ne sont pas touchés

**Preuve** : pgTAP 31 fichiers / 2 069 assertions PASS sur base vide et
semée (2 031 avant) ; Vitest 122 fichiers / 1 966 tests ; typecheck 0 ; lint
0 ; build vert ; 90 migrations, `EXPECTED_MIGRATION` à jour dans
`src/lib/release.ts`. Trois sabotages de harnais rencontrés et corrigés en
route (deux mouraient au démarrage en comptant onze faux rouges chacun ; un
troisième restait vert sur un sabotage réellement appliqué et a révélé que le
cas dangereux réel était l'inverse de celui supposé).

## V1.18 — Méta-progression branchée (✅ 2026-07-27, **en production**, E2E réécrit et vert)
**Objectif** : brancher un module de gamification transversale (missions,
collections, badges, clés, coffres, saisons) dont **1 713 lignes de SQL
dormaient** — 14 tables `progression_*` et 13 fonctions, aucune RPC appelée,
aucune UI. C'était la seule fondation entièrement morte du projet et le n°1
du backlog de l'audit 3 (item 13). Voir ADR-044 et ADR-045.

> **État de livraison au 2026-07-27** : branche `chantier/audit-3` poussée,
> **PR #29 entièrement verte (6/6 jobs)** après 13 passages CI. Dernier
> commit `c131340`. Migrations `20260805200000` / `20260805210000` /
> `20260805220000` non fusionnées sur `main`, donc non appliquées en
> production à ce stade.
>
> **13 passages CI ont trouvé 8 défauts qu'aucune relecture n'avait vus**
> (fonctions SQL inappelables, ambiguïté de colonne, veto du registre
> universel sur les tables legacy, double ligne Stripe, pagination Stripe,
> contraste a11y du bouton `danger`, harnais E2E Stripe désaligné, suite
> pgTAP sans contexte d'appel — détail dans docs/bugs.md), **et une erreur de
> diagnostic personnelle** : `router.refresh()` (`15364ee`) prétendait
> résoudre un écran vide alors qu'il créait lui-même le blocage — annulé par
> `c131340` après relecture d'une trace Playwright.
>
> **Fait produit découvert au passage, puis corrigé le même jour** : l'item 5
> du backlog (identité joueur unifiée) a un temps été requalifié en
> **prérequis** de ce module — `experience_started`/`experience_completed`,
> émis par le spin, ne portaient que `player_key`, jamais `player_id` ; le
> moteur renonçait à sa première garde, aucune mission ne progressait depuis
> la roue (ADR-045). **La cause posée alors était fausse** : la résolution
> `player_id` existait déjà (`append_experience_event_internal`), le vrai
> défaut était un ordre d'écriture. Corrigé par `a963583` (trigger
> `AFTER INSERT` sur `player_legacy_identities`) — voir ADR-045 (addendum) et
> plus bas.

- [x] **Le moteur est un trigger, pas un appel** — `apply_meta_progression_event()`
      branché sur `experience_events` : les missions progressent depuis les
      9 expériences existantes **sans une seule ligne applicative**. Brancher
      ce module a livré la lecture, l'écriture de configuration et
      l'ouverture de coffre — jamais la progression elle-même, qui tournait
      déjà
- [x] **DB — 3 migrations** : `20260805200000_meta_progression.sql`
      (1 713 l., préexistante, 14 tables / 13 fonctions) ;
      `20260805210000_meta_progression_lifecycle.sql` (1 566 l., `bf2c3d3`) —
      18 fonctions : clôture / archivage / suppression de saison, édition et
      suppression **bornées au brouillon**, sel serveur
      `progression_chests.loot_seed` (le tirage était
      `md5(request_id ‖ item.id)` avec un `request_id` **fourni par le
      client**, meulable hors ligne), table `progression_engine_failures`,
      purge corrigée ; `20260805220000_meta_progression_hardening.sql`
      (1 380 l., `3174cbd`) — suites de la revue de sécurité
- [x] **Backend** — `src/lib/meta-progression.ts`,
      `src/lib/validations/meta-progression.ts`,
      `src/actions/meta-progression.ts` (**27 RPC exposées**), seaux de
      rate-limit `progressionDevice` / `progressionPlayerAction` /
      `progressionPublicIp`, 9e RPC de purge dans le cron `purge-data`, sonde
      SLO du journal moteur dans `src/lib/admin/ops.ts`
- [x] **Frontend** — éditeur `/dashboard/progression`, panneau joueur greffé
      au parcours public **existant** `/play/[slug]` (**aucune nouvelle
      surface publique** : la progression est scopée par organisation, sans
      objet propre à adresser par une URL)
- [x] **Invariant NON MONÉTAIRE** — clés, badges, objets et coffres sont des
      marqueurs d'engagement : aucun code de caisse, aucune ligne
      `reward_issuances`, aucune colonne `*_cents`. Vérifié par **grep
      inverse** : aucun autre module ne lit ces tables
- [x] **Interrupteur d'arrêt** — `set_progression_mission_enabled` /
      `set_progression_chest_enabled`, seul geste autorisé sur une saison
      lancée, ne touchent que `enabled`, jamais les règles ni les dotations
- [x] **Tests** — **1 304 tests unitaires**, pgTAP `meta_progression.test.sql`
      (**293 assertions**) + `security_acl.test.sql` (**506**),
      `e2e/progression.spec.ts` — **exécutés via la PR #29** : 22/22 suites
      pgTAP, 1 781 assertions, E2E verts (voir plus bas)
- [x] **Revue sécurité : GO conditionnel**, 0 CRITIQUE, 0 ÉLEVÉ. 3 MOYEN
      corrigés : **M1** seau `failClosed` composé sur l'`organizationId`
      **fourni par le client** (débit non borné avec un cookie, rafale
      invisible au monitoring car le compteur d'observabilité était appelé
      après le contrôle d'organisation) → seau sur la seule clé d'identité,
      consommé en amont, observation hissée avant le contrôle ; **M2**
      commentaire d'invariant **faux** sur `org_progression_snapshot`
      (affirmait qu'un caissier lisait strictement moins qu'un visiteur —
      infirmé sur 4 points) → branche `seasons` passée à `is_org_editor`,
      commentaire réécrit ; **M3** aucun interrupteur d'arrêt → livré (voir
      ci-dessus). 5 FAIBLE corrigés dont **F1** (relecture d'idempotence
      ignorant `chest_id`) et **F2** (`progression_engine_failures` sans
      lecteur)
- [x] `ef721aa` — CLI Supabase en devDependency (inspection distante possible,
      pas les modes `--local`)
- [x] `792f2a3` — CI **réparatrice** : la garde anti-dérive des types publie
      le snapshot régénéré en artefact `database-generated-types` au lieu de
      le jeter (seul chemin praticable pour rafraîchir
      `src/types/database.generated.ts`, périmé depuis 9 migrations)

> ✅ **Preuve obtenue au 2026-07-27** : la branche a été poussée, la PR #29
> ouverte, et **13 passages CI** l'ont fait passer du rouge au vert. État
> final : **22/22 suites pgTAP, 1 781 assertions, E2E verts, 1 304 tests
> unitaires, snapshot de types à jour** (récupéré depuis l'artefact
> `database-generated-types` de `792f2a3`, `48fa440`). `e2e/progression.spec.ts`
> contenait deux défauts dans une même assertion (un `getByRole("heading")`
> sur un `<p role="group">`, et un libellé attendu sans le mot « maintenant »),
> tous deux trouvés par **relecture du markup**, aucun par exécution
> (`793100a`). L'exécution elle-même a trouvé **8 autres défauts**, dans
> d'autres migrations et modules du même chantier — voir docs/bugs.md pour le
> détail commit par commit (`4c6a010`, `c0d5549`, `573c724`, `4e899c7`,
> `03be9ea`, `3409544`, `4ecf165`, `6973d13`).
>
> ⚠️ **Deux erreurs personnelles commises pendant ce durcissement, à
> consigner honnêtement** : (1) `15364ee` diagnostiquait un écran vide comme
> un défaut de rafraîchissement et ajoutait `router.refresh()` — appelé dans
> `startTransition`, il maintenait `pending` vrai jusqu'au rendu serveur
> complet et réinitialisait les champs non contrôlés du formulaire suivant,
> **créant** le blocage qu'il prétendait résoudre ; annulé par `c131340` après
> relecture d'une trace Playwright montrant le bouton figé sur
> « Enregistrement… ». (2) `602d4eb` sur-généralisait à quatre sélecteurs
> l'égalité stricte prouvée sur un seul nom par le markup ; corrigé par
> `20ff8e8`.
>
> ✅ **Prérequis d'identité (ADR-045) traité le 2026-07-27 par `a963583`** :
> `experience_started`/`experience_completed` (émis par le spin) ne portaient
> que `player_key`, jamais `player_id` — établi en local contre un vrai
> Postgres (`c131340`), la cause avancée alors (« les deux systèmes ne se
> rencontrent jamais ») était fausse. La résolution existait déjà
> (`append_experience_event_internal`) ; le vrai défaut était un ordre
> d'écriture, corrigé par un trigger `AFTER INSERT` sur
> `player_legacy_identities` (`20260805230000`). `supabase test db` →
> 1 804 assertions PASS (1 781 avant), contrôle négatif concluant. **La
> méta-progression progresse désormais dès le premier tour de roue.** Voir
> item 5 de `docs/audit-3-backlog.md`, traité, et ADR-045 (addendum).
>
> ⚠️ **Ce constat « E2E verts » est dépassé, à ne pas répéter.** Une fois
> `e2e/progression.spec.ts` réactivé (`a8c31c7`, voir « Suites ouvertes »
> ci-dessous), le bloc `describe.serial` s'est révélé instable et le client a
> choisi de le garder actif et rouge (`ba0cdbf`) : **la PR #29 est rouge sur
> ce seul point**, 5 jobs verts sur 6.

**Suites ouvertes** :
- [ ] **Fusionner la PR #29 sur `main`** et vérifier l'application des
      migrations en production
- [x] **Réactiver `e2e/progression.spec.ts`** — fait (`a8c31c7`), le
      `test.fixme` n'avait plus de raison d'être depuis `a963583`. **Résultat :
      instable**, pas vert — le bloc `describe.serial` « cycle de vie complet »
      échoue de façon mobile (titre de saison, collection, objet, mission,
      réactivation, coffre) sur six passages CI consécutifs, avec un code
      identique à chaque fois. Ce n'est pas un défaut applicatif (1 804
      assertions pgTAP dont un contrôle négatif, parcours passé intégralement
      plusieurs fois) mais la longueur de la chaîne : treize étapes serveur en
      série sur un seul projet. **Décision client (`ba0cdbf`) : garder ce test
      actif et rouge plutôt que de le neutraliser** — la PR #29 reste rouge sur
      ce seul point. Détail : docs/bugs.md
- [ ] **Fiabiliser `e2e/progression.spec.ts` par un seed en base** — la
      correction juste identifiée (pas une retouche) : semer la configuration
      de saison directement en base et ne faire porter à l'E2E que les
      comportements d'écran, au lieu d'enchaîner treize créations pilotées à
      l'écran sur un seul projet. Chantier dédié, non commencé
- [ ] **Étendre la visibilité du panneau joueur** au-delà de la roue : les
      14 jeux rapides, le passeport, le calendrier, le quiz, la chasse, le
      jackpot et l'événement live font déjà progresser les missions en base,
      mais le joueur ne les voit que depuis la roue.
      **Versé le 2026-08-02** (chasse par parcours vécu, trouvaille réfutée en
      tant que défaut — la limitation est décidée, ADR-044) : l'éditeur de
      saison laisse cocher les neuf familles sans avertir qu'aucune surface
      hors roue ne rendra le panneau ; un commerçant sans campagne de roue
      configure donc une saison que personne ne pourra consulter ni encaisser.
      L'avertissement dans l'éditeur est le geste le moins cher de cet item
- [ ] Résidus assumés (docs/bugs.md) : seau par appareil borné à un cookie,
      pas un humain ; `observeProgressionPressure` toujours keyée sur
      l'`organizationId` client (plafonné en amont) ; sonde F2 sans test
      dédié ; pas de garde d'addon (monétisation reportée) ;
      couverture E2E de l'interrupteur **coffre** écartée (miroir de la
      mission) ; branche `mission already has player progress` inatteignable
      aujourd'hui ; réordonnancement des objets de collection non exposé en UI
- [ ] 4 sous-items hors périmètre, en attente d'arbitrage produit : parcours
      personnalisés, validation d'achat POS/ticket, défis entre équipes,
      campagnes réseau — aucune des 14 tables ne les porte

## V1.17 — Encaissement en caisse des récompenses de pronostics (✅ 2026-07-25, poussée)
**Objectif** : combler une **anomalie fonctionnelle en production**. Les
pronostics émettaient déjà un code `PRONO-…` (`contest_awards.code`, posé par
`finalize_contest`), le joueur le voyait et l'interface lui disait de le
présenter en caisse — mais `lookupRedeemCode` ne routait que **8 sources** et le
seul chemin de remise, `set_contest_award_status`, exige `is_org_editor` : **un
caissier ne pouvait pas remettre le lot**. Voir ADR-043.

> **État de livraison au 2026-07-25 (fin de journée)** : les 6 commits
> `e310606` → `f873b77` ont été **POUSSÉS** — `origin/main` = `f873b77`.
> L'application de la migration `20260804120000` **en production reste non
> vérifiée**. L'écart local/distant porte désormais sur le chantier suivant
> (audit 3, branche `chantier/audit-3`), pas sur celui-ci.

- [x] **DB** (`e310606`) — migration `20260804120000_contest_award_redemption.sql` :
      `contest_awards.delivered_at` **renommée `redeemed_at`** (une seule colonne
      de vérité, alignée sur les 7 modules frères) + `redeemed_by`,
      `basket_cents`, `redeem_expires_at` ; CHECK
      `(status = 'delivered') = (redeemed_at is not null)` ; index unique
      `(organization_id, code)` ; `contests.code_ttl_seconds` (nullable, borné
      **3 600 s à 7 776 000 s**, borne volontairement différente de celle des
      campagnes — le décompte part de la CLÔTURE du championnat, pas du passage
      en caisse) + trigger figeant l'échéance à l'émission ; RPC
      `redeem_contest_award` atomique / idempotente / auditée / org-scopée,
      `service_role` seule. `EXPECTED_MIGRATION` bumpé dans le même commit
- [x] **Backend** (`700a253`) — `normalizeContestCode` (`src/lib/utils.ts`),
      `lookupContestAwardByCode`, `redeemContestAward` et routage **9e source**
      dans `src/actions/participations.ts` (`CashierMatch { source: 'contest' }`),
      `code_ttl_seconds` ajouté aux validations Zod
      (`src/lib/validations/pronostics.ts`, bornes miroir du CHECK SQL)
- [x] **Frontend** (`0a95ae8`) — `ContestResult` + `ContestRedeemButton` dans la
      caisse `/dashboard/redeem`, palmarès du championnat enrichi (quand / par
      qui / quel panier), réglage d'expiration **en jours** dans les paramètres du
      championnat, échéance du code affichée au joueur sur `/pronos/[slug]`
- [x] **E2E** (`931c21b`) — `e2e/pronostics.spec.ts` : boucle complète clôture →
      le joueur lit son code → saisie en caisse → remise validée avec panier →
      **seconde tentative refusée**, assertée sur les DEUX faces (caisse et joueur)
- [x] **Correctifs de finition** — `76c72dc` : le formulaire n'écrase plus un TTL
      non représentable en jours entiers ; `f873b77` (**M1** de la revue +
      durcissement) : jointures org-scopées dans la RPC et contrôle de doublons
      explicite avant la création de l'index unique
- [x] **Revue sécurité : GO conditionnel**, aucun CRITIQUE ni ÉLEVÉ. **M1** —
      fuite potentielle du nom du championnat et du **prénom du gagnant** d'une
      autre organisation si `contest_awards.organization_id` se désynchronisait
      de `contests` → corrigé, et **étendu à l'`UPDATE`** : ne scoper que la
      lecture aurait produit un état PIRE (lot consommé et audité pendant que la
      caisse affiche « code inconnu »)
- [x] QA : **1 147 tests ✓**, typecheck ✓, lint ✓, build ✓

> ⚠️ **Trou réel du chantier** : les **43 assertions pgTAP** de
> `supabase/tests/contest_awards.test.sql` et les **4** de l'audit ACL central
> **n'ont JAMAIS été exécutées** (ni Docker ni CLI Supabase disponibles en
> local) — elles ne seront prouvées qu'au job `database-security` de la CI.

**Suites ouvertes** :
- [ ] **Pousser et déployer** : `origin/main` est resté à `eb3193d` (2026-07-25
      10:47) alors que le chantier s'achève à `f873b77` (2026-07-25 16:49) ;
      migration `20260804120000` à appliquer avant le code
- [ ] **M2 — jeton `cashier:lookup` consommé par famille de codes** : une saisie
      NUE de 8 caractères consomme **9** jetons et ramène le caissier à
      ~3 recherches/minute, le refus s'affichant « code introuvable » sur un lot
      valide. Correctif **écrit et vert (1 222 tests) mais NON COMMITÉ** :
      `src/actions/participations.ts` porte 495 lignes mêlant ce correctif et le
      chantier « registre universel » en cours. À reprendre quand l'arbre sera au
      propre — concerne les **9** sources, pas seulement les pronostics
- [ ] Résidus assumés (docs/bugs.md) : dérogation éditeur à l'expiration, absence
      de garde `hasPronosticsAccess` sur la remise (cohérente avec les 8 autres
      sources), bascule de tie-break sur les codes nus, lot **annulé** encore
      présenté comme encaissable au joueur, refus de remise non audités,
      `finalize_contest` sans boucle anti-collision, `set_contest_award_status`
      scopé sans revérifier `contests`

## V1.16 — Créateur de quiz (✅ 2026-07-25, **en production**)
**Objectif** : demande client — un **créateur de quiz** jouable depuis un QR ou
un lien, en libre-service. Usages visés : restaurant (questions sur la cuisine),
cave / bar (dégustation), salon professionnel (les exposants), boutique
(découverte des produits), musée (parcours culturel), entreprise (team building),
club sportif. Le client a précisé que « le moteur des pronostics pourra être
réutilisé pour une grande partie du classement ».

> ✅ **CLOS LE 2026-07-31 — le module est en production, constaté et non
> présumé.** `npx supabase migration list --linked` rend `20260803120000` au
> **`remote`** comme au `local`. La migration est appliquée ; V1.15 (place de
> marché, `20260802120000`) l'est également.
>
> **Cette entrée a menti pendant six jours, et c'est ce qui vaut d'être
> retenu.** Elle a d'abord affirmé « seul chantier NON POUSSÉ / NON DÉPLOYÉ »
> — vrai le jour même. Une première correction, le soir, a constaté le push
> mais a laissé ouvert « l'application de la migration en production reste non
> vérifiée ». Cette réserve n'a plus jamais été levée, alors qu'elle se
> tranchait en une commande. Pendant ce temps `CLAUDE.md` décrivait le module
> comme livré : **deux documents du même dépôt se contredisaient sur un fait
> vérifiable**, et personne ne pouvait dire lequel croire.
>
> Une réserve qu'on n'a pas les moyens de lever, on l'écrit. Une réserve qui
> se lève en une commande, on la lève.

- [x] **3 arbitrages client** — ADR-040 : (1) **module DÉDIÉ**, ni un
      `event_kind` des pronostics ni une extension de l'événement live —
      l'intention « je crée un quiz » est distincte, et la **sémantique de la
      vérité diffère** (dans un pronostic la réponse est inconnue de tous jusqu'au
      résultat ; dans un quiz elle existe DÈS la création, donc la non-fuite
      change de nature), tout comme le cycle de vie (`event_sessions` =
      SYNCHRONE, l'organisateur lance chaque question ; `quizzes` = ASYNCHRONE, le
      JOUEUR démarre chaque question) ; (2) les **7 types de questions** demandés ;
      (3) les **5 modes de récompense** demandés
- [x] **Modélisation — 4 formes de réponse, pas 7 types** :
      `question_type in ('choice','number','ranking','text')` (LE MOTEUR) +
      **2 dimensions transversales** (`time_limit_seconds`, `image_url`) + un
      champ **`preset`** libre de forme qui porte les 7 modèles d'interface
      (`multiple_choice`, `true_false`, `mystery_image`, `estimate`, `timed`,
      `ranking`, `free_prediction`). Un type « chronométré » aurait interdit le
      « choix multiple chronométré », pourtant l'usage le plus courant ;
      « vrai/faux » n'est qu'un choix à 2 options ; « image mystère » est un
      média. Même couple `event_kind`/`question_type` que les pronostics, et
      `choice`/`number`/`ranking` **réutilisent leurs validateurs**
      (`is_valid_contest_options`/`is_valid_contest_answer`) — seule la réponse
      libre est du code neuf. **Ajouter un 8e modèle = une entrée de catalogue,
      sans migration**
- [x] **DB** — migration `20260803120000_quizzes.sql` : `addon_quiz` + 5 tables
      (`quizzes`, `quiz_questions`, `quiz_players`, `quiz_answers`,
      `quiz_rewards`), 16 fonctions dont **10 RPC `service_role`**, `spins.source`
      étendu à `'quiz'` ; pgTAP `quizzes.test.sql` + 5 lignes RLS et 10 assertions
      dans l'audit ACL central
- [x] **Backend** — `src/lib/quiz.ts` (mappers PURS), `src/lib/quiz-context.ts`,
      `src/lib/validations/quiz.ts`, `src/actions/quiz.ts` (parcours public
      rejoindre / présenter / répondre / terminer / tour offert / polling /
      classement + CRUD commerçant) ; caisse **8e préfixe `QUIZ-`**, rate-limit
      ADR-032, purge RGPD branchée au cron `purge-data`
- [x] **6 invariants de sécurité** : non-fuite de la bonne réponse en **3 couches**
      (RPC → mapper → type jouable sans champ de vérité), **chronomètre
      inforgeable** (aucune RPC n'accepte de paramètre de temps, `elapsed_ms`
      calculé en base, `started_at` posé une seule fois et gelé y compris pour le
      `service_role`), **une seule réponse immuable** par (joueur, question),
      **tirage idempotent** (3 verrous indépendants), **stock fini obligatoire**
      dès qu'un mode émet (ADR-031), **multi-tenant / ADR-032**
- [x] **Frontend** — éditeur (`src/app/dashboard/quiz/*`,
      `src/components/dashboard/quiz-*`) : les 7 modèles pilotés par
      `quizFormShape`, bonne réponse saisie sous bandeau 🔒, dotation des 5 modes
      et bouton de tirage ; parcours joueur (`src/app/quiz/[slug]`,
      `src/components/quiz/*`) : sas « je suis prêt·e », questions une par une,
      correction immédiate, écran de fin, classement, partage, code `QUIZ-…` ou
      tour de roue offert ; a11y (`role="timer"` sans région live,
      `role="status"`, clavier, motion-reduce)
- [x] **Revue sécurité : GO conditionnel → tout corrigé** (`fe1e57b`) —
      **E1 (ÉLEVÉ, bloquant)** : le mode `instant` émettait le lot **sans qu'aucune
      réponse existe** (rejoindre + terminer = un code ; l'identité étant un
      cookie gratuit, une boucle vidait le stock depuis une seule IP) → émission
      conditionnée à la complétion réelle ; **E2 (ÉLEVÉ, Sybil)** : une passe
      jetable collecte le corrigé COMPLET, puis chaque identité neuve franchit le
      seuil → **Turnstile sur le SEUL appel émetteur** (`finishQuiz`) et seulement
      si un lot est en jeu, rien sur join/start/submit (ADR-032) ;
      **M1 (RGPD)** : email persisté sans consentement → refus explicite ;
      **M2 (RGPD)** : purge laissant les réponses LIBRES (PII) → neutralisées ;
      **M3 (piège irréversible)** : un tirage à vide posait `draw_state='done'` à
      0 gagnant et **figeait la dotation** → drapeau posé seulement après émission
      réelle, état `no_participants`, tirage relançable
- [x] **Défaut de PRODUCTION corrigé au passage** (`b483740`) : la base portait
      **8 addons**, le back-office n'en exposait que **6** et
      `src/lib/admin/data.ts` ne LISAIT même pas les deux manquantes — le module
      **Parrainage, en production, ne pouvait être activé pour AUCUN commerçant**.
      Les 8 sont désormais basculables et lues
- [x] QA : E2E `e2e/quiz.spec.ts` (parcours complet + double passage en caisse ;
      absence des vérités prouvée sur `page.content()`, payload RSC compris) +
      seed déterministe + 6 gardes de chemin ; typecheck ✓, lint ✓, 1116 tests ✓

**Suites ouvertes** :
- [ ] **Pousser et déployer** (migration `20260803120000` + code ;
      EXPECTED_MIGRATION déjà à `20260803120000`)
- [ ] Résidus assumés (docs/bugs.md) : Sybil économique borné par
      `reward_stock` seul, aucune borne minimale de temps humain en SQL,
      `out_of_stock` terminal, purge par anonymisation, tour offert insensible à
      l'état de la roue cible, prénom non modéré au classement
- [ ] `setMerchantCompAccess` (accès offert) ne couvre que 4 des 8 addons —
      incohérence préexistante à reprendre

## V1.15 — Place de marché de campagnes (✅ 2026-07-25, **en production**)
**Objectif** : demande client — le commerçant part d'un MODÈLE au lieu de
configurer une campagne de zéro. Dix modèles (Saint-Valentin, Halloween, Noël,
ouverture de boutique, anniversaire, match de football, fête des Mères, happy
hour, soldes, lancement de produit), chacun portant **7 promesses** : le visuel,
le jeu, les textes, les récompenses suggérées, les emails, la durée, les règles.

> ✅ Construit, QA verte, revue sécurité GO après correctif, **et en
> production** : `20260802120000` figure au `remote` comme au `local`
> (constaté le 2026-07-31, `supabase migration list --linked`).
>
> La réserve précédente — « l'application effective de la migration n'a pas été
> revérifiée » — a survécu six jours à côté d'un `CLAUDE.md` qui décrivait le
> module comme livré. Elle se levait en une commande. Même remarque qu'en
> V1.16 : une réserve qu'on peut lever, on la lève ; sinon deux documents du
> même dépôt finissent par se contredire sur un fait vérifiable.

- [x] **3 arbitrages client** — ADR-039 : (1) **catalogue Lastchance EN CODE**
      (10 modèles versionnés) **+ modèles PRIVÉS** enregistrés par le
      commerçant, visibles de sa seule organisation ; **pas** de place de marché
      partagée entre commerçants (écartée : modération, isolation du contenu
      publié, propriété des visuels — projet à part) ; (2) appliquer un modèle
      crée une campagne **EN BROUILLON complète** (relue, ajustée et activée par
      le commerçant) ; (3) emails fournis en **TEXTES, jamais activés**
- [x] **DB** — migration `20260802120000_campaign_templates.sql` : table
      `campaign_templates` (modèles privés seulement — `name` unique par
      organisation, `description`, `blueprint jsonb` **objet borné à 32 Ko**,
      `source_campaign_id`, `created_by` posé par trigger depuis la session).
      Isolation : policy unique `campaign_templates: editors`, **FK composite**
      `(source_campaign_id, organization_id) → campaigns(id, organization_id)`,
      `organization_id` hors du grant UPDATE, aucune policy `anon`/`public` ;
      pgTAP `campaign_templates.test.sql` avec **sentinelle** qui échoue si une
      policy venait à citer `anon`/`public`
- [x] **Backend** — `src/lib/campaign-templates.ts` (module pur : type
      `CampaignBlueprint`, `blueprintToDraft`, les 10 modèles),
      `src/lib/validations/campaign-templates.ts` (Zod : la base ne garantit que
      « objet jsonb ≤ 32 Ko », la FORME est validée là, dans les DEUX chemins),
      `src/actions/campaign-templates.ts` (`applyCampaignTemplate`,
      `saveCampaignAsTemplate`, `deleteCampaignTemplate`)
- [x] **3 invariants d'innocuité** (le cœur du design) : **BROUILLON INERTE**
      (`status: 'draft'` ET `auto_schedule: false` verrouillé au niveau du TYPE —
      sans lui le cron `run_campaign_schedule()` aurait publié la campagne tout
      seul dès `starts_at` ; aucun champ `status`/`auto_schedule`/`starts_at`/
      `ends_at` dans le schéma Zod) ; **AUCUN ENVOI** (`automation_settings`,
      `enqueueJob`, `@/lib/resend` absents du chemin ; un modèle enregistré part
      avec `emails: []`) ; **MULTI-TENANT** (organisation et rôle de la session,
      modèle privé lu avec le client de SESSION sous RLS + filtre organisation
      explicite, aucun `createAdminClient`)
- [x] **Frontend** — galerie serveur en deux sections (« Modèles Lastchance » /
      « Mes modèles »), aperçu des 7 promesses en **lecture défensive** (un
      blueprint d'une version antérieure s'affiche en dégradé au lieu de casser
      la page), enregistrement d'une campagne comme modèle et suppression
- [x] **Revue sécurité : GO, 0 bloquant — 1 MOYEN corrigé** (`4457b20`) : le
      blueprint recopie `wheels.skill_config`, donc les **SECRETS des jeux de
      défi** (mot mystère, nombre cible, ordre du puzzle) ; la lecture ouverte à
      `is_org_member` les faisait passer d'« éditeurs seulement » à « toute
      l'équipe, **CAISSIERS compris** » (avec en effet de bord poids, stocks,
      `cost_cents` et budget) → policy unique **`campaign_templates: editors`**,
      miroir de `campaigns: editors` ; pgTAP inversé (le caissier ne lit rien) +
      assertion de non-fuite du secret + contre-épreuve éditeur ;
      `campaign_templates` rejoint l'audit RLS central. INFO : `budget_cents` en
      `min(1)` (le CHECK SQL exige `> 0`)
- [x] QA : 29 tests d'action (invariants BROUILLON et INNOCUITÉ
      **mutation-testés**) + E2E `e2e/campaign-templates.spec.ts` (modèle →
      brouillon, preuve prise sur l'ÉTAT réel et non sur un message) ;
      1021 tests ✓, typecheck ✓, lint ✓

**Suites ouvertes** :
- [ ] Vérifier l'application de la migration `20260802120000` en production
      (code poussé le 2026-07-25 ; EXPECTED_MIGRATION est depuis passé à
      `20260803120000` avec V1.16)
- [ ] Résidus assumés (docs/bugs.md) : blueprint privé pouvant décrire une roue
      sans lot perdant, application non transactionnelle (brouillon orphelin),
      ni quota ni rate-limit sur les deux actions, secret de défi dupliqué dans
      le blueprint, capture de la seule roue principale, « Utiliser ce modèle »
      visible pour un caissier qui ne peut pas l'appliquer
- [ ] Place de marché PARTAGÉE entre commerçants (écartée ici — modération,
      isolation du contenu publié, propriété des visuels)

## V1.14 — Pronostics au-delà du sport (✅ 2026-07-24, **en production**)
**Objectif** : demande client — le moteur de pronostics cesse d'être
football-centré. Il doit servir à tout événement à résultat (cérémonie,
Eurovision, élection interne, remise de prix, compétition d'entreprise, concours
culinaire, finale d'émission, tournoi local, course, e-sport) sur le modèle
`événement → questions prédictives → date de verrouillage → résultat → barème →
classement → récompenses`. **Le football devient un modèle préconfiguré, pas le
cœur technique.**

> ⚠️ **Au 2026-07-24, seul chantier du projet NON DÉPLOYÉ** : construit, QA
> verte, revue sécurité passée de NO-GO à corrigé — mais les 8 commits
> (`4973736` → `f09ee89`) étaient LOCAUX et la migration `20260801120000`
> n'était pas appliquée en production.
> **Au 2026-07-25, ces commits sont présents sur `origin/main`** (donc poussés) ;
> le seul chantier NON POUSSÉ est désormais V1.15. L'application effective de la
> migration en production n'a pas été revérifiée.

- [x] **4 types de questions** (`contest_matches.question_type`) : `score`
      (deux camps — le football historique, inchangé), `choice` (choix unique),
      `ranking` (ordre d'un top N), `number` (estimation) — ADR-038
- [x] **DB** — migration `20260801120000_generic_contests.sql` : `contests`
      (`event_kind` défaut `football`, `default_locks_at`, `scoring` étendu) ;
      `contest_matches` devient le REGISTRE DE QUESTIONS (`question_type`,
      `prompt`, `options`, `correct_answer`, `ranking_size`, `locks_at`) ;
      `contest_predictions` (scores NULLABLE + `answer jsonb`) ; RPC
      `submit_contest_answer`, `set_contest_question_result`,
      `update_contest_generic_scoring`, `update_contest_event_settings` ;
      barème par type en SQL ; pgTAP `generic_contests.test.sql`
- [x] **Verrouillage par question** avec date par défaut au niveau de
      l'événement : `score → coalesce(locks_at, kickoff_at)`,
      `générique → coalesce(locks_at, default_locks_at, kickoff_at)` — posé
      dans les 4 fonctions SQL concernées ET dans le miroir TS
      `effectiveLocksAt` ; champ masqué côté UI pour le football
- [x] **Backend** — barème générique TS (miroir du SQL), validations Zod par
      type, actions questions/réponses/résultat, `publicCorrectAnswer` (point
      de sérialisation UNIQUE de la bonne réponse)
- [x] **Frontend** — création d'événement typée, réglages de verrouillage
      éditables après création (événement reporté, audités), constructeur de
      questions typées, saisie du résultat par type, parcours joueur générique,
      `ranking-picker`
- [x] **11 modèles + `custom`** (`contest-event-kinds.ts`) : `football`,
      `ceremony`, `eurovision`, `election`, `remise_prix`, `entreprise`,
      `culinaire`, `emission`, `tournoi`, `course`, `esport` — questions
      suggérées et barème conseillé, **aucune option factice écrite** (les
      listes restent saisies par le commerçant) ; synchro du fournisseur de
      calendriers réservée au football (double verrou)
- [x] **Revue sécurité : NO-GO conditionnel → corrigé** (`f3c5752`). GO franc
      sur le volet générique ; blocage sur la NON-RÉGRESSION football —
      **E1 (ÉLEVÉ)** : le backfill `locks_at = kickoff_at` figeait la fenêtre à
      l'instant de la migration alors que la synchro ne met à jour que
      `kickoff_at` (match reporté → pronostics fermés silencieusement sur un
      match non joué ; match avancé → base acceptant un pronostic pendant la
      rencontre) → backfill supprimé, repli sur `kickoff_at` ;
      **M1 (MOYEN)** : `default_locks_at` primait sur `kickoff_at` pour tous les
      types (une date par défaut fermait d'un coup tout un championnat importé)
      → jamais appliquée à une question `score` ; volet UI du même correctif
      (`f09ee89`) : le champ « verrouillage par défaut » est masqué sur le
      modèle football
- [x] CI : E2E `e2e/pronostics-generic.spec.ts` + seed `E2EPRONO3` ; pgTAP
      « match reporté / avancé / date par défaut ignorée » ; 5 tests TS

**Suites ouvertes** :
- [x] **Poussée le 2026-07-25** (les 8 commits sont sur `origin/main`) —
      **reste à confirmer** l'application de la migration `20260801120000` en
      production
- [ ] M2 : `update_contest_event_settings` peut rouvrir une question dont
      `locks_at` est NULL en déplaçant `default_locks_at` (résidu assumé,
      docs/bugs.md)
- [ ] Départage d'ex æquo (`exact_count` / `diff_count`) par TYPE et non par
      palier — imprécis seulement sur un événement mixte (ADR-013)
- [ ] Rapatrier les nouvelles RPC dans l'audit ACL central
      `security_acl.test.sql` (I4)
- [ ] Durcir `tiebreaker_answer` (chargé dans le contexte public, jamais
      transmis — I5, pré-existant)
- [ ] Trancher la fragilité E2E PRÉ-EXISTANTE `e2e/pronostics.spec.ts:40`
      (locator page-wide `/Enregistré|Modifier/` ambigu avec le bouton
      « Modifier » permanent du hub joueur)

## V1.13 — Jeux rapides : moteur de tirage partagé + jeux skill-gated (✅ 2026-07-24)
**Objectif** : demande client — ajouter BEAUCOUP de mini-jeux qui partagent le même
moteur de campagne (« ajouter un jeu = ajouter une interface »). Formaliser le point
d'extension existant `wheels.game_type` (V1.4) en socle et le décliner en 13 nouveaux
jeux, en 2 vagues. **Vague 1 (7 jeux de révélation) ET vague 2 (6 jeux de défi
skill-gated) EN PRODUCTION.**

- [x] **Socle `<GameShell>`** extrait du grattage (`game-shell.tsx`) : factorise les
      états idle / gagné / perdu / bloqué et mutualise `spinWheel` / réclamation /
      partage / captcha / analytics / thèmes. Chaque jeu = `games/<jeu>-reveal.tsx`
      (animation) + `<jeu>-experience.tsx` (~12 lignes)
- [x] **Vague 1 — 7 jeux de RÉVÉLATION** (`flip_card`, `cups`, `slot`, `memory`,
      `chest`, `dice`, `draw_card`) : migration `20260730120000_quick_games_reveal.sql`
      (extension `wheels_game_type_check`). SERVEUR-AUTORITATIF — le lot vient de
      `spinWheel`, l'interaction ne fait que RÉVÉLER l'`outcome` (cosmétique, aucun
      poids au client). **Déployée** ; revue sécurité vague 1 : GO 0 bloquant (ADR-037)
- [x] **Vague 2 — 6 jeux de DÉFI *skill-gated*** (`rps`, `reflex`, `gauge`, `puzzle`,
      `mystery_word`, `estimate`) : migration `20260731120000_quick_games_skill.sql`
      (`game_type` étendu, colonne `skill_config jsonb` à SECRETS server-only,
      `perform_atomic_spin` recréée en 7-args avec `p_force_losing` — corps normal
      identique, zéro régression). Socle `<SkillGameShell>` à 2 temps +
      `games/<jeu>-challenge.tsx` (ADR-037)
- [x] **Moteur à 2 temps** (`src/lib/skill.ts` + `src/actions/skill.ts`) :
      `startSkillChallenge` présente le défi (vue publique sans secret) + jeton HMAC
      domaine-séparé `skill-challenge:` lié device ; `submitSkillChallenge` ÉVALUE le
      défi CÔTÉ SERVEUR puis `perform_atomic_spin(p_force_losing => !succeeded)`
      (réussite → tirage normal, échec → spin perdant forcé) — participation consommée
      dans les deux cas (anti-brute-force)
- [x] Éditeur commerçant `wheel-settings.tsx` (sélecteur + sous-formulaire « Réglages
      du défi », secrets marqués) ; correctif d'un manque vague 1 (`ac27384`) :
      `updateWheel` refusait les nouveaux `game_type` → enum complet
- [x] Revue sécurité vague 2 : **NO-GO initial (1 ÉLEVÉ + 1 MOYEN) → corrigés → GO**
      (`8a3c60e`) — ÉLEVÉ : garde `isSkillGameType` dans `spinWheelInner` contre le
      contournement du défi par appel direct ; MOYEN : `unlimited` interdit pour les
      jeux à secret + oracle `succeeded` retiré de la réponse cliente. QA verte
- [x] Commits `d957f46`→`5710641` (vague 1), `125eb99`→`8a3c60e` (vague 2) ;
      EXPECTED_MIGRATION bumpé à `20260731120000`

**Suites ouvertes** :
- [ ] Vérification serveur de `reflex` / `gauge` (réussite *client-reported*
      aujourd'hui, bornée par l'économie ADR-031 — docs/bugs.md)
- [ ] CI : pgTAP `quick_games_skill.test.sql` + E2E `skill-games.spec.ts` (Docker
      absent en local)
- [ ] Ré-essai après erreur transitoire au submit d'un défi (le composant se
      verrouille aujourd'hui ; recharger relance un défi — docs/bugs.md)

## V1.12 — Parrainage ludique (✅ 2026-07-24)
**Objectif** : un levier de croissance greffé sur les campagnes ROUE — un joueur
satisfait devient PARRAIN et invite ses proches ; chaque filleul qui vient JOUER
fait progresser une jauge d'« équipe » partagée et débloque des récompenses.
**En production** (revue sécurité GO sans finding bloquant, QA verte).

- [x] Addon d'organisation `addon_referral` (miroir d'`addon_calendar`), activé
      depuis le back-office admin, gating `hasReferralAccess` ; opt-in PAR CAMPAGNE
      (`referral_programs.enabled`) sur les campagnes roue (ADR-036)
- [x] Parrain : code partageable `PR-…` → lien `/play/[slug]?ref=PR-…` (aucune
      nouvelle surface publique) ; panneau parrain sur la roue (CTA, partage,
      jauge/coffre/équipe)
- [x] Preuve = PARTICIPATION réelle, jamais un clic : `validate_referral` exige un
      `proof_spin_id` (spin réel du device filleul, non forgeable/non rejouable/
      unique), appelé APRÈS le spin — un lien ouvert sans jouer ne vaut rien (ADR-036)
- [x] Récompenses en CONFIG LIBRE, 3 versements indépendants (`none`/`spin`/`lot`) :
      parrain (par filleul), filleul (bienvenue), coffre collectif au seuil
      (`chest_threshold`, défaut 3) ; `lot` = code `PARRAIN-…` à STOCK FINI (ADR-031),
      `spin` = tour de roue offert (`spins.source = 'referral'`, ADR-029)
- [x] « Équipe » = parrain+filleuls à jauge/coffre PARTAGÉS, débloqué une seule fois
      au seuil ; PAS de classement (coopératif, pas compétitif)
- [x] Anti-abus 100 % serveur borné par l'économie : self/boucle directe bloqués,
      1 filleul/campagne/device, fenêtre `window_days`, plafond `sponsor_max_filleuls`,
      no-oracle (`rejected` unique) + défense en profondeur (`referral_public_state`
      re-gate) ; rate-limit ADR-032 (failClosed device, IP fail-open observe)
- [x] Caisse unifiée `source: 'referral'` (7e préfixe `PARRAIN-`,
      `redeem_referral_reward`, org-scopée/auditée) ; purge RGPD
      `purge_expired_referral_data` (cron purge-data)
- [x] Migration `20260729120000`, ADR-036 ; fix `getUserAndOrg` (sélectionnait tous
      les addons sauf `addon_referral`)
- [x] CI : `referral.test.sql` (pgTAP) + `e2e/referral.spec.ts` (éditeur, parrain+
      lien, filleul post-spin, caisse double-retrait, axe) + seed `PARRAIN-E2ECHEST`
- [x] Revue sécurité passée : verdict GO, 0 finding bloquant ; perte maximale bornée
      par le stock fini

**Suites ouvertes** :
- [ ] Câblage best-effort de l'email filleul au claim (activerait la dédup email SQL,
      aujourd'hui inerte car `validateReferral` précède la collecte d'email — ADR-036)
- [ ] Multi-commerces sur un même programme de parrainage (multi-tenant croisé)
- [ ] Parrainage sur d'autres mécaniques que la roue (chasse, jackpot, calendrier)

## V1.11 — Calendrier de l'Avent & campagnes quotidiennes (✅ 2026-07-23)
**Objectif** : un module de gamification QUOTIDIEN à mécanique ANNUELLE — le
joueur, venu par le lien/QR du commerce, revient chaque jour ouvrir UNE case
(Avent, semaine anniversaire, compte à rebours, 7 jours de cadeaux, festival,
lancement produit, semaine soldes) ou suit le calendrier à distance via un rappel
email. **En production** (revue finale passée sans finding bloquant).

- [x] Addon d'organisation `addon_calendar` (miroir d'`addon_events`), activé
      depuis le back-office admin, gating `hasCalendarAccess` (ADR-035)
- [x] 4 types de case (`content` / `lot` code `CADEAU-…` / `spin` tour de roue
      offert, ADR-029) + récompense d'assiduité finale (toutes cases ouvertes) ;
      stock fini OBLIGATOIRE (ADR-031) ; case spéciale partageable
- [x] Gating temporel SERVEUR-AUTORITATIF : `open_calendar_box` tranche `now()`
      (base) vs `unlock_at` dérivé serveur (minuit civil du fuseau, DST-robuste
      via `Intl`) — ouvrir une case en avance est impossible
- [x] Non-fuite du contenu d'une case non ouverte : quadruple défense
      (`calendar_public_state` sans contenu + mapper null + `too_early` muet +
      RLS/grants)
- [x] Page publique suivable `/calendar/[slug]` installable (PWA, manifest par
      calendrier), 5 thèmes carton (neutre/noël/anniversaire/soldes/festival)
- [x] Rappel quotidien opt-in via cron `/api/cron/calendar-reminders`
      (`15 9 * * *`, dédup `email_log`) qui relaie l'archivage des calendriers
      écoulés ; caisse unifiée (`source: 'calendar'`, `redeem_calendar_reward`,
      6 préfixes au total) ; purge RGPD `purge_expired_calendar_players`
- [x] Migration `20260728120000`, ADR-035 ; correctif anti-spoiler (`5c4d89f`)
      limitant le préchargement des roues aux cases déjà ouvertes ; 775 tests
- [x] CI : `calendar.test.sql` (pgTAP) + `e2e/calendar.spec.ts` (grille + axe)

**Suites ouvertes** :
- [ ] Multi-commerces sur un même calendrier (multi-tenant croisé — reporté)
- [ ] Restreindre l'exposition des `dayIds` futurs (aujourd'hui neutralisée par
      `too_early` sans contenu — ADR-035, limite V1 assumée)
- [ ] Archivage/purge sans opt-in commerçant (aujourd'hui conditionnés à
      `data_retention_months` — ADR-035)
- [ ] Autres calendriers récurrents (hebdomadaire, mensuel) au-delà de l'annuel

## V1.10 — Mode événement en direct (✅ 2026-07-23)
**Objectif** : une animation LIVE dans le commerce (bar, salle, séminaire) — un
organisateur enchaîne des questions face à un public, l'écran de la salle affiche
la question, chaque client répond sur son téléphone, un classement s'actualise en
direct. **En production** (revue sécurité passée sans finding bloquant).
- [x] Addon `addon_events` + gating `hasEventsAccess` + toggle back-office
- [x] Moteur « question » générique : quiz / sondage / pronostic (un seul chemin)
- [x] Séparation CONTENU (`event_games`/`questions`/`options`) et RUN
      (`event_sessions`/`players`/`answers`/`wins`)
- [x] Machine à états serveur `lobby→question_active→question_locked→reveal→leaderboard→ended`
- [x] 3 interfaces synchronisées : écran public, téléphone joueur (pseudo+avatar), télécommande orga
- [x] Invariant non-fuite de la bonne réponse (4 défenses) + scoring serveur-autoritatif
- [x] Transport : polling primaire (`event_public_state`) + Realtime ping-only activable
- [x] Podium à l'écran + lot `EVENT-` (stock fini, ADR-031) en caisse unifiée
- [x] Migration `20260727120000`, ADR-034 — CI verte, déployé

**Suites ouvertes (V2)** :
- [ ] Autres modes greffés sur le squelette : blind test (question + média audio),
      bingo, roue géante pilotée depuis l'écran, bataille 2 équipes
- [ ] Tirage au sort parmi les participants (en plus du podium au score)
- [ ] Turnstile optionnel au 1er join (anti-sybil, clé identité — ADR-032) pour les événements à fort enjeu
- [ ] Activation du transport Realtime en production (`EVENTS_REALTIME_ENABLED`)
- [ ] Titre de session/jeu exposé aux surfaces publiques
- [ ] Multi-commerces sur un même événement (multi-tenant croisé)

## V1.9 — Jackpot collectif (✅ 2026-07-23)
**Objectif** : une nouvelle mécanique de jeu — une CAGNOTTE COLLECTIVE : tous
les clients d'un commerce alimentent une même jauge partagée (chaque
participation validée = +1), et le gain se déclenche au niveau de cette jauge.
**En production** (revue sécurité passée, 2 bloquants corrigés et
vérifiés).

- [x] Addon d'organisation `addon_jackpot` (miroir d'`addon_loyalty`), activé
      depuis le back-office admin, gating `hasJackpotAccess` (ADR-033)
- [x] Jauge PARTAGÉE `current_count` incrémentée sous verrou de campagne,
      affichée en temps réel ; montant d'affichage croissant cosmétique
- [x] Anti-triche réutilisé du Passeport (ADR-030) : `validation_mode`
      `rotating_code` (code TOTP sur écran comptoir) ou `staff` (jeton de
      check-in signé, domaine `jackpot-checkin:`), cooldown par joueur ≥ 300 s
- [x] 3 modes de tirage (`draw_mode`) : `threshold_draw` (auto au seuil),
      `rescan_win` (armé → chance instantanée par scan), `date_draw`
      (cron `jackpot-draws`)
- [x] Tirage ATOMIQUE (verrou + `unique(campaign_id, cycle)`) et VÉRIFIABLE
      (`draw_seed` journalisé, `gen_random_bytes`) ; récompense = lot unique
      `JACKPOT-…` en caisse ; stock fini OBLIGATOIRE (ADR-031)
- [x] Page publique suivable `/jackpot/[id]` installable (PWA, manifest par
      campagne) + bloc contenu commerçant ; écran comptoir temps réel ;
      caisse unifiée (`source: 'jackpot'`, RPC `redeem_jackpot_prize`)
- [x] `record_jackpot_participation` (tout atomique sous verrou), purge RGPD
      `purge_expired_jackpot_players` (conserve les hashes anonymes de tirage)
- [x] CI : `jackpot.test.sql` (pgTAP) + `e2e/jackpot.spec.ts` (page suivable :
      affichage + axe + 404) ; `security_acl.test.sql` étendu
- [x] Revue sécurité passée : CRITIQUE-1 corrigé (code du gagnant fuité au
      déclencheur du seuil → code réservé au gagnant, 2 couches) + ÉLEVÉ-1
      corrigé (date_draw re-tirait à chaque cron → tirage unique)

**Suites ouvertes** :
- [ ] Multi-commerces sur une même jauge (multi-tenant croisé — reporté, ADR-033)
- [ ] État « tirage effectué » sur la page publique après un `date_draw`
- [ ] Stopper les participations après `draw_at` (aujourd'hui elles
      incrémentent la jauge cosmétique sans gain — limite V1 assumée)
- [ ] Stock résiduel d'un `date_draw` non distribué (tirage unique — limite V1)

## Quick wins maintenabilité & accessibilité (✅ 2026-07-21)
Issus de l'audit maintenabilité (commits `a5fc2cb`, `b7db502` ; 324 tests,
build OK).

- [x] **Types Supabase générés** : snapshot commité
      `src/types/database.generated.ts` (`npm run types:generate`, source
      `--linked`) + garde CI anti-dérive dans le job `database-security`
      (régénération `--local` puis `git diff --exit-code -I 'PostgrestVersion'`).
      Nouveau réflexe dev : migration → `npm run types:generate` → commit,
      sinon CI rouge. `src/types/database.ts` reste maintenu à la main
      (en-tête ajouté) ; migration progressive vers les types générés.
- [x] **A11y roue** : `prefers-reduced-motion` respecté — durée du spin
      réduite à la source (4400 → 300 ms, 1 tour, easing linéaire) via hook
      matchMedia sans mismatch d'hydratation (`play-experience.tsx`, prop
      `reducedMotion` de `wheel-svg.tsx`). Carte à gratter vérifiée non
      concernée.
- [x] **A11y onglets Player Hub** : pattern WAI-ARIA Tabs complet — roving
      tabIndex, ArrowLeft/Right avec wrap, Home/End, focus suivant la
      sélection. Helper pur `src/components/pronos/tab-nav.ts` + 8 tests.

### Volet 2 — accessibilité (✅ 2026-07-21)
Commits `ce2eb78`, `bc9615c`, `028717d` (338 tests, build OK ; exécution
réelle des scans axe à confirmer au premier run CI E2E). Le bloc
accessibilité de l'audit est désormais entièrement traité.

- [x] **Contraste automatique roue** : `src/lib/contrast.ts`
      (luminance/ratio WCAG), `labelColor: "auto"` par défaut des styles
      vierges uniquement (hex existants intacts), calcul par segment dans
      `wheel-svg.tsx`, case « Contraste auto » + avertissement < 3:1 dans
      le Studio.
- [x] **Lien d'évitement** : `src/components/ui/skip-link.tsx`, posé sur
      landing, dashboard, `/play/[slug]` et `/pronos/[slug]`
      (`<main id="contenu" tabIndex={-1}>`).
- [x] **axe-core dans Playwright** : `@axe-core/playwright`, helper
      `e2e/axe.ts` (échec serious/critical, moderate/minor loggées, zéro
      règle exclue) ; scans intégrés aux specs player-win, pronostics,
      roles + spec dédiée `e2e/a11y.spec.ts` pour la landing.
- [x] **Vraies violations corrigées au passage** (`bc9615c`) :
      3 contrastes `bg-k-green` sur la landing (texte passé à 4.59:1) +
      `aria-label` sur l'input code du poste caisse.

## Refactoring opportuniste (règles au fil de l'eau)
Issues de l'audit maintenabilité (2026-07-21). À appliquer **quand on
retouche le fichier concerné**, jamais en big-bang :

- [ ] Découper `src/actions/pronostics.ts` (1480 l) par domaine :
      matches / leagues / player
- [ ] Découper `src/lib/resend.ts` (888 l) par domaine d'email
- [ ] Découper `poster-editor.tsx` (807 l) et `src/app/page.tsx` (990 l)
- [ ] Extraire les avatars de `src/lib/avatars.tsx` (786 l) en catalogue lazy
- [ ] Migrer progressivement `src/types/database.ts` (manuel) vers les types
      générés `database.generated.ts`
- [x] Ajouter axe-core aux tests Playwright (✅ 2026-07-21, volet 2 a11y)

**Reportés en arbitrage produit** :
- [ ] Undo/redo + autosave des éditeurs (selon feedback bêta)
- [ ] Dédup marketing app/site + prix partagés Stripe ↔ site + domaine
      canonique (avant ouverture publique)
- [x] Contraste automatique des segments de roue (✅ 2026-07-21, finalement
      livré au volet 2 a11y)

## V1.2 — Après le pilote (à prioriser selon retours)
- [x] Scan caméra du code gain côté staff (scanner en caisse : BarcodeDetector
      natif + repli jsQR, Permissions-Policy camera=(self), E2E dédié avec
      flux caméra simulé)
- [x] Multi-roues par campagne / planification horaire (roues multiples
      avec planning heures/jours via `selectActiveWheel` ; programmation
      de campagne ajoutée en V1.6)
- [x] Segments et automatisations sur la newsletter (segments livrés avec
      la file de travaux ; scénarios automatisés livrés en V1.6)
- [ ] Offres Stripe multiples (Pro : quotas, multi-établissements)
- [x] Captcha Turnstile obligatoire en production, sauf opt-out explicite
- [ ] Suppression/anonymisation RGPD self-service

## V2 — Croissance
- [x] Autres mécaniques de jeu (jackpot collectif — V1.9, ✅ 2026-07-23)
- [x] Rôles staff avec permissions réduites (caisse, campagnes et QR)
- [ ] API publique / intégrations (POS, CRM)
- [ ] Facturation à l'usage

## Blockers actuels
- Aucun. La production tourne (déploiement Vercel manuel via `vercel --prod`,
  plan Hobby : crons quotidiens uniquement) ; comptes Supabase / Stripe /
  Resend créés et variables d'environnement renseignées.
