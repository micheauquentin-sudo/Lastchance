# Benchmark public — volume de traduction Vitrine

Date de mesure : 2026-08-19.

## Faits observés

Les comptes ci-dessous portent sur le contenu alimentaire affiché d'une carte
publique : rubriques, noms de plats, descriptions et mentions alimentaires.
Ils excluent prix, navigation, coordonnées, marketing, mentions légales et
boissons/vins. Les pages et PDF ne fournissent pas toujours un texte structuré :
les comptes sont donc arrondis et servent de repère, pas de statistique
nationale.

| Carte publique | Mots | Caractères |
| --- | ---: | ---: |
| [Paris Canal](https://www.pariscanal.com/wp-content/uploads/2024/11/CARTE-MENU_EB1FR.pdf) | ~84 | ~550 |
| [L'Office](https://lofficerestaurant.com/la-carte-en-pdf/) | ~77 | ~500 |
| [L'Atelier Gourmand](https://lateliergourmand-restaurant.com/wp-content/uploads/2025/02/carte-d-HIVER-03.02.2025.pdf) | ~230 | ~1 500 |
| [La Table de Flo](https://latabledeflo-boulogne.com/notre-carte/) | ~280 | ~1 850 |
| [L'Embrun](https://www.lembrunrestaurant.fr/index.php/carte-1/notre-carte.html) | ~320 | ~2 150 |
| [Envies](https://www.envies-restaurant.com/fr/la-carte) | ~260 | ~1 800 |
| [Le Descartes](https://www.ledescartes.fr/) | ~620 | ~4 000 |
| [El Nacional](https://www.elnacional.fr/wp-content/uploads/2026/04/CARTE-EL-NACIONAL_FR_WEB-2026-PRINTEMPS.pdf) | ~780 | ~5 200 |
| [Taj Mahal](https://www.restaurant-taj-mahal-le-mans.fr/la-carte/) | ~630 | ~4 300 |
| [Brasserie Barbès](https://www.brasseriebarbes.com/wp-content/uploads/2025/12/MENU_GROUPE_-BRASSERIE_BARBES.pdf) | ~100 | ~700 |

Médiane de cet échantillon : ~270 mots et ~1 800 caractères. La fourchette
observée est ~77–780 mots et ~0,5–5,2 k caractères.

Google Cloud Translation NMT accorde les premiers 500 000 caractères par mois,
puis facture 20 USD par million de caractères. Le volume est compté par langue
cible ; espaces et balises envoyés comptent aussi. Source :
[tarification officielle Google Cloud Translation](https://cloud.google.com/products/translate/pricing).

La DGCCRF rappelle que les allergènes doivent être renseignés par écrit et que
l'information doit correspondre à ce qui est servi. Ils ne doivent donc jamais
être déduits du texte d'un plat :
[information allergènes](https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/faq-coupe-du-monde-de-sport-concerts-festivals-competitions-en-france-les-reponses-vos-questions).

## Inférences pour LastChance Vitrine

Une hypothèse de planification prudente est **2 000 caractères traduisibles par
Vitrine**, une fois les boissons/vins exclus. Pour 50 commerces et l'anglais :

- 100 000 caractères sans réemploi global ; coût initial estimé : 0 USD.
- ~85 000 caractères avec 15 % de réemploi global ; coût initial estimé : 0 USD.
- 10 % de contenu modifié sur le mois : ~8 500 caractères avec cette même
  hypothèse de réemploi ; coût estimé : 0 USD.

Le cache global ne doit couvrir que des champs contrôlés et exacts : catégories,
labels de régime, noms normalisés des 14 allergènes et ingrédients structurés
(`veau`, `beurre`, `pommes de terre`). Les titres, descriptions, noms signature,
prix, origine, disponibilité et associations plat→allergène restent dans un
cache privé par organisation et version de contenu. Un mot commun dans un plat
ne rend pas le plat entier gratuit : une traduction externe n'est évitée que
lorsque l'unité complète demandée est déjà en cache.
