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

## V1.1 — Après le pilote (à prioriser selon retours)
- [ ] Vérification de code gain côté staff (page mobile dédiée / scan)
- [ ] Personnalisation visuelle de la roue par le commerçant (thème, logo)
- [ ] Multi-roues par campagne / planification horaire
- [ ] Emails marketing vers les opt-in (segments, exports)
- [ ] Offres Stripe multiples (Pro : quotas, multi-établissements)
- [ ] Rate limiting renforcé (Upstash) + captcha si abus constaté
- [ ] Suppression/anonymisation RGPD self-service
- [ ] Tests E2E Playwright sur le parcours joueur

## V2 — Croissance
- [ ] Autres mécaniques de jeu (grattage, jackpot)
- [ ] Rôles staff avec permissions réduites
- [ ] API publique / intégrations (POS, CRM)
- [ ] Facturation à l'usage

## Blockers actuels
- Aucun côté code. Pour la mise en production : créer les comptes
  Supabase / Stripe / Resend et renseigner les variables d'environnement
  (voir README).
