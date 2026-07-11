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

## V1.2 — Après le pilote (à prioriser selon retours)
- [ ] Scan caméra du code gain côté staff (la saisie rapide existe)
- [ ] Multi-roues par campagne / planification horaire
- [ ] Emails marketing vers les opt-in (segments, exports)
- [ ] Offres Stripe multiples (Pro : quotas, multi-établissements)
- [ ] Captcha systématique si abus constaté (Turnstile déjà opt-in)
- [ ] Suppression/anonymisation RGPD self-service

## V2 — Croissance
- [ ] Autres mécaniques de jeu (grattage, jackpot)
- [ ] Rôles staff avec permissions réduites
- [ ] API publique / intégrations (POS, CRM)
- [ ] Facturation à l'usage

## Blockers actuels
- Aucun côté code. Pour la mise en production : créer les comptes
  Supabase / Stripe / Resend et renseigner les variables d'environnement
  (voir README).
