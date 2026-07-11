# Simulateur ROI (à venir)

Emplacement réservé pour le simulateur de retour sur investissement.

Le moteur de calcul existe déjà : `src/lib/roi.ts` (fonctions pures,
hypothèses centralisées dans `ASSUMPTIONS`). Le composant à créer est un
îlot client (`"use client"`) : 4 champs (clients/jour, panier moyen,
fréquence de retour, nombre d'établissements) branchés sur `computeRoi()`,
résultats animés. À insérer dans `src/app/page.tsx` après `<Benefits />`.
