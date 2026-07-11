# Démonstration interactive (à venir)

Emplacement réservé pour la démo jouable : QR animé → roue → gain →
formulaire → dashboard qui se met à jour.

Intégration prévue :
- composant serveur `<InteractiveDemo />` avec îlots clients pour la roue
  et le formulaire (aucune donnée réelle : tout est simulé côté client) ;
- inséré dans `src/app/page.tsx` juste après `<Hero />` (emplacement
  commenté) — la roue CSS du hero est alors remplacée par la démo ;
- la roue SVG peut être portée depuis l'app
  (`src/components/wheel/wheel-svg.tsx`, composant pur sans état) sans
  créer de dépendance runtime entre les deux projets (copie assumée).
