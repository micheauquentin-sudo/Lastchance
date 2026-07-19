# Validation physique des QR LastChance

La planche accessible depuis **Dashboard → QR codes → Tester les styles**
génère 38 variantes du même lien : les 32 couples motif × yeux, les cinq
préréglages (dégradés et cadres compris) et le style réellement enregistré.

## Matériel minimal

| Cible | Appareil / logiciel | Versions à relever |
| --- | --- | --- |
| iOS | iPhone physique, app Appareil photo et lecteur du Centre de contrôle | modèle, iOS, navigateur ouvert |
| Android Google | Pixel physique, Appareil photo / Google Lens | modèle, Android, version caméra |
| Android Samsung | Galaxy physique, Appareil photo Samsung | modèle, Android / One UI |
| Papier | laser N&B, jet d'encre couleur | imprimante, pilote, qualité, papier |

L'émulation navigateur ne remplace pas ces appareils : elle valide le rendu,
pas l'optique, l'autofocus ni le décodeur de la caméra.

## Procédure

1. Ouvrir une planche rattachée à une campagne active et attendre que toutes
   les cartes soient affichées.
2. Tester chaque variante directement à l'écran sur iOS puis Android, à 20,
   50 et 100 cm, avec lumière normale puis faible.
3. Imprimer à **100 % / taille réelle**, sans option « Ajuster à la page ».
4. Refaire les scans sur papier mat puis brillant, en lumière normale et avec
   reflet volontaire. Tester aussi une impression N&B.
5. Pour chaque scan, vérifier que l'URL `/play/<slug>` attendue s'ouvre, que la
   campagne est identifiable et qu'aucune redirection inattendue n'apparaît.
6. Marquer une variante en échec après trois tentatives ou plus de deux
   secondes avant reconnaissance.

## Relevé

| Variante | iOS écran | Pixel écran | Galaxy écran | Laser N&B | Jet couleur | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `square-square` | ☐ | ☐ | ☐ | ☐ | ☐ | |
| `rounded-rounded` | ☐ | ☐ | ☐ | ☐ | ☐ | |
| `dots-circle` | ☐ | ☐ | ☐ | ☐ | ☐ | |
| `diamond-square` | ☐ | ☐ | ☐ | ☐ | ☐ | |
| `fluid-leaf` | ☐ | ☐ | ☐ | ☐ | ☐ | |
| `lines-h-rounded` | ☐ | ☐ | ☐ | ☐ | ☐ | |
| `lines-v-rounded` | ☐ | ☐ | ☐ | ☐ | ☐ | |
| `classy-leaf` | ☐ | ☐ | ☐ | ☐ | ☐ | |
| autres variantes de la planche | ☐ | ☐ | ☐ | ☐ | ☐ | joindre le relevé complet |

Conserver le PDF imprimé, les modèles d'appareils et une photo des échecs dans
le ticket de validation avant de déclarer une version « testée physiquement ».
