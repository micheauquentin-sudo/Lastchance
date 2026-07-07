# Checkpoint — Lastchance

## Dernier jalon : V1.2 — réglages de jeu par campagne ✅
**Date** : 2026-07-07 (nuit)
**Contenu** :
- Les actions d'engagement se configurent désormais **par campagne**
  (page campagne, carte « Actions avant de jouer ») — plus dans Réglages.
- Nouvelle carte « Après le gain » par campagne : demander email et/ou
  téléphone avant d'afficher le code (ou rien → code direct, participation
  anonyme), compte à rebours optionnel (10-600 s) avant masquage du code.
- `claimPrize` revalide les exigences côté serveur ; participation avec
  email/prénom nullable + colonne phone ; email de gain envoyé seulement
  si email collecté ; export CSV avec téléphone.
**Migration à appliquer en prod** : `00004_campaign_play_settings.sql`
(après la 00003 ; recopie la config org existante sur les campagnes puis
supprime organizations.engagement).
**Vérifié** : build ✓, lint ✓, 26 tests ✓.

## Jalon précédent : V1.1 — retours du premier déploiement ✅
**Date** : 2026-07-07 (soir)
**Contenu** : app déployée en prod par l'utilisateur (Supabase + Stripe +
Vercel opérationnels, « tout fonctionne »). Trois évolutions livrées suite
aux premiers tests réels :
1. **Email de gain fiabilisé** — logs détaillés `[resend]` (variable
   manquante, id d'envoi, erreur exacte) + guide de dépannage README.
   Cause la plus probable côté prod : env vars Resend absentes de Vercel
   ou domaine non vérifié (mode test = envoi uniquement au propriétaire).
2. **Actions d'engagement pré-spin** — newsletter / Instagram / TikTok /
   avis Google, configurables par le commerçant (Réglages), gate côté
   joueur, revalidation serveur, table `newsletter_subscribers` + export
   CSV, traçabilité `spins.engagement_action`.
3. **Essai 7 jours** (au lieu de 14) — `organizations.trial_ends_at`,
   gating : essai expiré = QR codes toujours créables mais campagnes non
   activables et roues publiques désactivées. Bannières dashboard
   (jours restants / essai terminé). Checkout Stripe : reprend les jours
   d'essai restants (pas de réarmement).
**Migration à appliquer en prod** : `00003_engagement_and_trial.sql`.
**Vérifié** : build ✓, lint ✓, 26 tests unitaires ✓.

## Jalon précédent : V1 MVP complète ✅
**Date** : 2026-07-07
**Contenu** : les 11 étapes du plan V1 sont livrées, vérifiées
(build/lint/15 tests unitaires/tests SQL RLS) et poussées sur
`claude/project-template-init-gvkmn5`.

### Critères de succès du /goal
- [x] Architecture propre (plan validé puis implémenté)
- [x] Base de données bien conçue (8 tables, RLS, fonctions atomiques)
- [x] Authentification sécurisée (Supabase SSR + proxy)
- [x] Système multi-tenant (organization_id partout + RLS testée)
- [x] Dashboard administrateur (5 sections)
- [x] Roue entièrement configurable (lots, poids, stocks, couleurs)
- [x] Parcours utilisateur complet (scan → roue → formulaire → gain)
- [x] Génération de QR Code (PNG téléchargeable + compteur)
- [x] Stripe fonctionnel (checkout, webhook, sync, gating)
- [x] Déployable sur Vercel (guide README ; nécessite les clés services)

## Prochain jalon suggéré : Pilote réel
1. Provisionner Supabase/Stripe/Resend (15 min, guide README)
2. Déployer sur Vercel
3. Tester le parcours complet en conditions réelles
4. Premier commerce pilote → alimenter la roadmap V1.1

## Historique
- 2026-07-06 : Initialisation projet (docs + mémoire)
- 2026-07-06→07 : Développement V1 complet (11 étapes, 1 commit/étape)
