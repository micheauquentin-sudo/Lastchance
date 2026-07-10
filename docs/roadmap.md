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
