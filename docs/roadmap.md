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
      mais le joueur ne les voit que depuis la roue
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
