# Architecture — Lastchance

SaaS multi-tenant de gamification pour commerces. V1 livrée : parcours
joueur complet (QR → roue → gain), espace commerçant, facturation Stripe.

## Vue d'ensemble

```
Joueur (mobile)                       Commerçant (desktop/mobile)
     │                                        │
     │ scan QR                                │ login Supabase Auth
     ▼                                        ▼
/play/[slug]  ──spin/claim──►  Server Actions  ◄──  /dashboard/*
     │                              │
     │   (client admin,             │   (client SSR + RLS,
     │    validations Zod,          │    session cookies)
     │    claim token HMAC)         │
     ▼                              ▼
              Supabase PostgreSQL (RLS multi-tenant)
                       ▲
   Stripe ──webhook──► │ ◄──emails── Resend
```

## Structure du code

```
src/
├── app/
│   ├── page.tsx                  # Landing
│   ├── (auth)/                   # login, signup, auth/confirm
│   ├── onboarding/               # Création de l'organisation
│   ├── dashboard/                # Espace commerçant (protégé)
│   │   ├── campaigns/[id]/wheel/ # Config roue + lots
│   │   ├── participations/       # Liste + export CSV + validation
│   │   ├── qr-codes/             # Génération / téléchargement
│   │   └── settings/             # Abonnement Stripe
│   ├── play/[slug]/              # Parcours joueur public
│   └── api/stripe/webhook/       # Sync statut abonnement
├── actions/                      # Server Actions (auth, campaigns,
│                                 #   prizes, play, qr-codes,
│                                 #   participations, billing)
├── components/                   # ui/ (génériques), dashboard/,
│                                 #   wheel/ (WheelSvg partagé), auth/
├── lib/
│   ├── supabase/                 # client (browser) / server (SSR) /
│   │                             #   admin (service role, server-only)
│   ├── spin.ts                   # Tirage pondéré, fenêtres de jeu,
│   │                             #   claim token HMAC, player_key
│   ├── play-context.ts           # Validation QR→campagne→org→roue
│   ├── stripe.ts                 # PLANS extensible + mapping statuts
│   ├── resend.ts                 # Email de gain (best-effort)
│   └── validations/              # Schémas Zod par domaine
├── types/database.ts             # Miroir TS du schéma SQL
└── proxy.ts                      # Session refresh + protection routes

supabase/migrations/              # Schéma SQL versionné (source de vérité)
```

## Base de données

- `organizations` — tenant ; statut d'abonnement synchronisé par Stripe
- `organization_members` — user ↔ org (rôle owner/staff)
- `campaigns` → `wheels` (1:1) → `prizes` (poids relatif, stock, perdant)
- `qr_codes` — slug public → `/play/[slug]`, compteur de scans
- `spins` — chaque lancer, tracé AU SPIN (anti re-jeu)
- `participations` — formulaire post-gain, `spin_id UNIQUE`
  (anti-double-claim), consentements horodatés
- `stripe_events` — idempotence webhooks

**RLS** : `is_org_member(org_id)` sur toutes les tables métier. Le
parcours public passe exclusivement par le client service-role côté
serveur avec validations explicites ; l'anon key n'accède à rien.

## Flux du spin (anti-triche)

1. `spinWheel(slug)` valide : QR existe, campagne active + dates,
   abonnement trialing/active, roue ≥ 2 lots.
2. Limite de jeu par `player_key` = SHA-256(sel + IP + UA) sur la table
   `spins` — fenêtres once / daily / weekly.
3. Tirage pondéré côté serveur (`pickWeightedIndex`), stock réservé
   atomiquement (`decrement_prize_stock`), re-tirage si course.
4. Le résultat renvoyé au client contient un **claim token HMAC**
   (15 min) ; les poids ne quittent jamais le serveur.
5. `claimPrize(token, formulaire)` vérifie le token, insère la
   participation (contrainte UNIQUE = pas de double claim), envoie
   l'email, retourne le code `GAIN-XXXX`.

## Facturation

- 1 offre (Starter, 14 j d'essai) — `PLANS` dans `lib/stripe.ts` est
  extensible sans autre changement.
- Checkout → webhook `customer.subscription.*` → mise à jour de
  `organizations.subscription_status` → gating automatique :
  `/play` refuse les orgs inactives, bannière dans le dashboard.

## Conventions

- Toute entrée serveur passe par un schéma Zod (`lib/validations/`)
- Server Actions retournent `ActionResult<T>` (`{ok:true,data}|{ok:false,error}`)
- Erreurs logguées `console.error("[domaine] contexte:", …)` (Vercel logs)
- Fichiers kebab-case, composants PascalCase, commits `feat:/fix:/docs:`
