# LastChance — Site vitrine

Site officiel de LastChance. **Projet indépendant** de l'application
commerçant (racine du repo) : dépendances, build et déploiement séparés.
Seule la variable `NEXT_PUBLIC_APP_URL` le relie à l'app (boutons
« Essai gratuit » et « Connexion »).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4. 100 % statique :
aucune base de données, aucun secret, aucune API.

## Démarrer

```bash
cd site
npm install
npm run dev        # http://localhost:3001
```

Vérifications : `npm run typecheck`, `npm run lint`, `npm run build`.

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | URL de l'application (CTA inscription/connexion) | `https://app.lastchance.app` |
| `NEXT_PUBLIC_SITE_URL` | URL canonique du site (SEO, sitemap) | `https://www.lastchance.app` |

## Architecture

```
src/
  app/                  Pages : / , /tarifs , /faq , /contact
                        + layout, sitemap, robots, not-found
  components/
    ui/                 Primitives (Container, ButtonLink, Card, Section, Logo)
    layout/             Header sticky, Footer, NavLinks (état actif)
    sections/           Sections de l'accueil (Hero, HowItWorks, Benefits,
                        UseCases, FaqAccordion, FinalCta)
    demo/               [réservé] démonstration interactive — voir README
    roi/                [réservé] simulateur ROI — voir README
    dashboard/          [réservé] dashboard démo — voir README
  content/              Tout le contenu éditorial (textes, nav, FAQ, tarifs)
                        — modifiable sans toucher aux composants
  lib/
    roi.ts              Moteur du futur simulateur (pur, hypothèses centralisées)
    utils.ts            cn()
```

## Principes

- **Contenu séparé des composants** : tout texte vit dans `src/content/`.
- **Système de design en tokens** (`app/globals.css`, bloc `@theme`) :
  couleurs sémantiques (`brand`, `ink`, `surface`…), rayons, ombres.
  Changer la direction artistique = changer les tokens.
- **Server Components par défaut** ; le client est réservé aux îlots qui
  en ont besoin (`NavLinks`, et demain la démo/le simulateur).
- **Zéro JS superflu** : FAQ en `<details>` natif, roue du hero en CSS
  pur, animations CSS respectant `prefers-reduced-motion`.
- **SEO** : metadata par page, canonical, Open Graph, sitemap, robots,
  JSON-LD `FAQPage`.

## Étapes suivantes prévues

1. Démonstration interactive (`components/demo/`) après le Hero.
2. Simulateur ROI (`components/roi/` + `lib/roi.ts`) après « Pourquoi ».
3. Dashboard démo explorable (`components/dashboard/`).
4. Témoignages et logos clients (structure `content/` prête à étendre).
