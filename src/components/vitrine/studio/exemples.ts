import type {
  SecteurVitrine,
  VitrineCarteView,
  VitrineFicheView,
  VitrineRubriqueView,
} from "@/lib/vitrine";

/**
 * LES CARTES D'EXEMPLE DU STUDIO (VIT-24) — DE LA DÉMONSTRATION, JAMAIS DE LA
 * DONNÉE.
 *
 * ── LE PROBLÈME QU'ELLES RÈGLENT ──
 *
 * Un commerçant qui règle son allure au premier jour n'a rien à regarder : il
 * choisit un style de fiche, une densité d'onglets et une couleur devant un
 * aperçu vide, puis découvre le résultat une fois sa carte saisie — c'est-à-dire
 * trop tard pour changer d'avis sans tout reprendre. Ces cartes remplissent
 * l'aperçu le temps d'un coup d'œil.
 *
 * ── ÉCARTÉ : LES PRÉCHARGER DANS LA CARTE ──
 *
 * La demande initiale était « préchargé par thème ». Semer ces fiches dans
 * `vitrine_cartes` aurait donné un commerçant qui publie « Tartare de bœuf »
 * sans l'avoir écrit, et une suppression à faire à la main sur chaque vitrine
 * créée. La variante retenue est un INTERRUPTEUR d'aperçu : ces objets ne sont
 * jamais sérialisés dans le formulaire, jamais postés, jamais écrits en base.
 * Ils vivent le temps d'un rendu, et le commerçant qui a déjà deux plats peut
 * quand même les appeler pour juger une densité.
 *
 * ── ÉCARTÉ : UN GÉNÉRATEUR ──
 *
 * Tirer des noms au hasard aurait rendu l'aperçu instable entre deux rendus —
 * or on compare précisément deux réglages sur le MÊME contenu. Ce sont des
 * constantes, et `cartesExemple` rend toujours la même chose pour un secteur.
 *
 * ── PAS UNE SEULE PHOTO ──
 *
 * `photo_path` vaut `null` partout. Nous n'avons aucune image d'exemple à
 * servir : un chemin de Storage inventé donnerait des vignettes cassées, ce qui
 * est pire que rien. C'est aussi ce qui rend l'exemple HONNÊTE sur le réglage
 * « Initiale si pas de photo », qu'on ne pourrait pas juger sur des fiches
 * toutes illustrées.
 *
 * ── LE VOCABULAIRE SUIT LE MÉTIER ──
 *
 * Un fleuriste n'a pas de « plats ». Chaque secteur des sept de
 * `VITRINE_SECTEURS` a son jeu, dans les mots de `MOTS_SECTEUR`
 * (`src/components/vitrine/langue.ts`) : des bouquets chez le fleuriste, des
 * coupes chez le coiffeur, des chambres à l'hôtel. Un exemple qui parle du
 * métier d'un autre est exactement ce qui fait refermer l'aperçu.
 */

/**
 * LE PRÉFIXE DES IDENTIFIANTS FACTICES.
 *
 * Les vrais identifiants sont des UUID. Celui-ci n'en est pas un et ne peut pas
 * le devenir : « exemple- » n'appartient pas à l'alphabet hexadécimal, la
 * longueur ne tombe pas juste, et un UUID ne porte pas de mot lisible. Une
 * collision avec une ligne réelle est donc impossible, et un identifiant qui
 * atterrirait par erreur dans une requête se repère À L'ŒIL dans un log plutôt
 * que de ressembler à une clé légitime introuvable.
 */
export const PREFIXE_EXEMPLE = "exemple-";

/** Fabrique une fiche : tout ce qui n'est pas dit vaut le neutre le plus sobre. */
function fiche(
  cle: string,
  nom: string,
  description: string,
  prix: string,
  ordre: number,
): VitrineFicheView {
  return {
    id: `${PREFIXE_EXEMPLE}${cle}`,
    nom,
    description,
    prix_affiche: prix,
    // Voir l'en-tête : aucune image, volontairement.
    photo_path: null,
    photo_alt: null,
    // Ni facettes, ni porte, ni badge, ni allergène : ces réglages-là se jugent
    // sur SA carte à lui, pas sur une démonstration. Les y mettre aurait laissé
    // croire que la Boussole est déjà branchée.
    facettes: [],
    action: null,
    badges: [],
    allergenes: [],
    disponible: true,
    ordre,
  };
}

/** Fabrique une rubrique. Les ordres sont posés ici, jamais à la main. */
function rubrique(
  cle: string,
  nom: string,
  ordre: number,
  fiches: VitrineFicheView[],
): VitrineRubriqueView {
  return {
    id: `${PREFIXE_EXEMPLE}${cle}`,
    nom,
    ordre,
    action: null,
    fiches,
  };
}

function carte(
  cle: string,
  nom: string,
  ordre: number,
  categories: VitrineRubriqueView[],
): VitrineCarteView {
  return {
    id: `${PREFIXE_EXEMPLE}${cle}`,
    nom,
    ordre,
    // `active` est toujours `true` : la RPC publique ne rend jamais autre chose,
    // et un exemple inactif montrerait un état que l'écran public ne connaît pas.
    active: true,
    categories,
  };
}

/**
 * DEUX CARTES, DEUX À TROIS RUBRIQUES, TROIS À QUATRE FICHES.
 *
 * Le dosage est délibéré : il faut deux cartes pour voir le sélecteur d'onglets
 * apparaître, plusieurs rubriques pour juger le sommaire, et assez de fiches
 * pour lire une densité. Au-delà, on ne juge plus un style — on fait défiler.
 */
const EXEMPLES: Record<SecteurVitrine, VitrineCarteView[]> = {
  restaurant: [
    carte("resto-midi", "Carte du midi", 0, [
      rubrique("resto-entrees", "Entrées", 0, [
        fiche(
          "resto-e1",
          "Velouté de potimarron",
          "Crème de châtaigne, huile de noisette.",
          "7,00 €",
          0,
        ),
        fiche(
          "resto-e2",
          "Œuf parfait",
          "Poireaux fondants, lard grillé.",
          "9,00 €",
          1,
        ),
        fiche(
          "resto-e3",
          "Salade de saison",
          "Jeunes pousses, noix, comté.",
          "8,50 €",
          2,
        ),
      ]),
      rubrique("resto-plats", "Plats", 1, [
        fiche(
          "resto-p1",
          "Suprême de volaille",
          "Jus corsé, purée maison.",
          "18,00 €",
          0,
        ),
        fiche(
          "resto-p2",
          "Dos de cabillaud",
          "Beurre blanc, légumes du marché.",
          "21,00 €",
          1,
        ),
        fiche(
          "resto-p3",
          "Risotto aux champignons",
          "Parmesan affiné, herbes fraîches.",
          "16,00 €",
          2,
        ),
        fiche(
          "resto-p4",
          "Entrecôte grillée",
          "Frites maison, sauce au poivre.",
          "24,00 €",
          3,
        ),
      ]),
      rubrique("resto-desserts", "Desserts", 2, [
        fiche("resto-d1", "Tarte du jour", "Selon l'humeur du chef.", "7,00 €", 0),
        fiche(
          "resto-d2",
          "Mousse au chocolat",
          "Chocolat noir 70 %, fleur de sel.",
          "7,50 €",
          1,
        ),
        fiche("resto-d3", "Café gourmand", "Trois douceurs et un café.", "8,00 €", 2),
      ]),
    ]),
    carte("resto-boissons", "Boissons", 1, [
      rubrique("resto-vins", "Vins au verre", 0, [
        fiche("resto-v1", "Blanc sec", "Loire, 12 cl.", "5,50 €", 0),
        fiche("resto-v2", "Rouge fruité", "Rhône, 12 cl.", "5,50 €", 1),
        fiche("resto-v3", "Rosé de Provence", "12 cl.", "5,00 €", 2),
      ]),
      rubrique("resto-sans-alcool", "Sans alcool", 1, [
        fiche("resto-s1", "Limonade artisanale", "Citron, gingembre.", "4,50 €", 0),
        fiche("resto-s2", "Jus de pomme", "Verger local, 25 cl.", "4,00 €", 1),
        fiche("resto-s3", "Café filtre", "Torréfaction de la semaine.", "2,50 €", 2),
      ]),
    ]),
  ],

  bar: [
    carte("bar-cocktails", "Cocktails", 0, [
      rubrique("bar-signatures", "Nos signatures", 0, [
        fiche(
          "bar-c1",
          "Spritz maison",
          "Amer artisanal, bulles, orange sanguine.",
          "9,00 €",
          0,
        ),
        fiche("bar-c2", "Vieux Carré", "Whisky de seigle, vermouth.", "12,00 €", 1),
        fiche("bar-c3", "Basil Smash", "Gin, basilic frais, citron.", "11,00 €", 2),
        fiche("bar-c4", "Negroni", "Gin, campari, vermouth rouge.", "10,00 €", 3),
      ]),
      rubrique("bar-sans-alcool", "Sans alcool", 1, [
        fiche("bar-n1", "Virgin mojito", "Menthe, citron vert, sucre de canne.", "7,00 €", 0),
        fiche("bar-n2", "Limonade au romarin", "Maison, servie très fraîche.", "6,00 €", 1),
        fiche("bar-n3", "Thé glacé pêche", "Infusé à froid.", "6,00 €", 2),
      ]),
    ]),
    carte("bar-planches", "À grignoter", 1, [
      rubrique("bar-planches-salees", "Planches", 0, [
        fiche("bar-p1", "Planche mixte", "Charcuterie et fromages affinés.", "16,00 €", 0),
        fiche("bar-p2", "Planche végétarienne", "Légumes grillés, houmous.", "13,00 €", 1),
        fiche("bar-p3", "Bruschettas", "Trois pièces, tomate et burrata.", "9,00 €", 2),
      ]),
      rubrique("bar-snacks", "Petites faims", 1, [
        fiche("bar-s1", "Olives marinées", "Herbes et zeste de citron.", "4,00 €", 0),
        fiche("bar-s2", "Amandes grillées", "Fleur de sel.", "4,00 €", 1),
        fiche("bar-s3", "Frites de patate douce", "Sauce au yaourt.", "7,00 €", 2),
      ]),
    ]),
  ],

  coiffeur: [
    carte("coif-coupes", "Coupes", 0, [
      rubrique("coif-femme", "Femme", 0, [
        fiche("coif-f1", "Coupe et brushing", "Shampoing, coupe, coiffage.", "45,00 €", 0),
        fiche("coif-f2", "Coupe seule", "Sur cheveux lavés.", "32,00 €", 1),
        fiche("coif-f3", "Brushing", "Cheveux mi-longs.", "25,00 €", 2),
      ]),
      rubrique("coif-homme", "Homme", 1, [
        fiche("coif-h1", "Coupe classique", "Ciseaux et tondeuse.", "24,00 €", 0),
        fiche("coif-h2", "Coupe et barbe", "Taille et contour au rasoir.", "34,00 €", 1),
        fiche("coif-h3", "Taille de barbe", "Serviette chaude comprise.", "18,00 €", 2),
      ]),
      rubrique("coif-enfant", "Enfant", 2, [
        fiche("coif-e1", "Jusqu'à 6 ans", "Coupe en douceur.", "15,00 €", 0),
        fiche("coif-e2", "De 7 à 12 ans", "Coupe et coiffage.", "19,00 €", 1),
        fiche("coif-e3", "Frange seule", "Retouche entre deux visites.", "8,00 €", 2),
      ]),
    ]),
    carte("coif-couleurs", "Couleurs et soins", 1, [
      rubrique("coif-couleur", "Couleur", 0, [
        fiche("coif-c1", "Couleur racines", "Application et rinçage.", "48,00 €", 0),
        fiche("coif-c2", "Balayage", "Éclaircissement progressif.", "85,00 €", 1),
        fiche("coif-c3", "Mèches", "Sur cheveux mi-longs.", "70,00 €", 2),
        fiche("coif-c4", "Patine", "Ravive la nuance.", "35,00 €", 3),
      ]),
      rubrique("coif-soins", "Soins", 1, [
        fiche("coif-s1", "Soin profond", "Masque et massage du cuir chevelu.", "22,00 €", 0),
        fiche("coif-s2", "Soin botox capillaire", "Cheveux abîmés.", "40,00 €", 1),
        fiche("coif-s3", "Rituel brillance", "Finition à froid.", "18,00 €", 2),
      ]),
    ]),
  ],

  fleuriste: [
    carte("fleur-bouquets", "Bouquets", 0, [
      rubrique("fleur-saison", "De saison", 0, [
        fiche("fleur-b1", "Bouquet du marché", "Composé le matin même.", "25,00 €", 0),
        fiche("fleur-b2", "Brassée champêtre", "Fleurs des champs, ton clair.", "35,00 €", 1),
        fiche("fleur-b3", "Bouquet rond pastel", "Roses et renoncules.", "45,00 €", 2),
      ]),
      rubrique("fleur-occasions", "Grandes occasions", 1, [
        fiche("fleur-o1", "Bouquet d'anniversaire", "Coloré, papier kraft.", "40,00 €", 0),
        fiche("fleur-o2", "Composition de mariage", "Sur rendez-vous.", "Sur devis", 1),
        fiche("fleur-o3", "Gerbe de deuil", "Tons blancs et verts.", "70,00 €", 2),
        fiche("fleur-o4", "Bouquet de naissance", "Fleurs douces et pastel.", "38,00 €", 3),
      ]),
    ]),
    carte("fleur-plantes", "Plantes et objets", 1, [
      rubrique("fleur-interieur", "Plantes d'intérieur", 0, [
        fiche("fleur-p1", "Monstera", "Pot en terre cuite compris.", "32,00 €", 0),
        fiche("fleur-p2", "Orchidée blanche", "Deux tiges.", "28,00 €", 1),
        fiche("fleur-p3", "Succulentes", "Trio en pots assortis.", "18,00 €", 2),
      ]),
      rubrique("fleur-accessoires", "Accessoires", 1, [
        fiche("fleur-a1", "Vase en verre soufflé", "Fait main.", "34,00 €", 0),
        fiche("fleur-a2", "Cache-pot céramique", "Trois tailles.", "22,00 €", 1),
        fiche("fleur-a3", "Carte et emballage", "Message à la main.", "3,00 €", 2),
      ]),
    ]),
  ],

  hotel: [
    carte("hotel-chambres", "Chambres", 0, [
      rubrique("hotel-classiques", "Classiques", 0, [
        fiche("hotel-c1", "Chambre simple", "Lit simple, douche, 14 m².", "89,00 €", 0),
        fiche("hotel-c2", "Chambre double", "Lit queen size, 18 m².", "119,00 €", 1),
        fiche("hotel-c3", "Chambre twin", "Deux lits simples, 20 m².", "125,00 €", 2),
      ]),
      rubrique("hotel-superieures", "Supérieures", 1, [
        fiche("hotel-s1", "Chambre avec balcon", "Vue sur la cour, 24 m².", "159,00 €", 0),
        fiche("hotel-s2", "Junior suite", "Coin salon, 32 m².", "199,00 €", 1),
        fiche("hotel-s3", "Suite familiale", "Deux chambres, 45 m².", "249,00 €", 2),
      ]),
    ]),
    carte("hotel-services", "Services", 1, [
      rubrique("hotel-petit-dej", "Petit-déjeuner", 0, [
        fiche("hotel-pd1", "Buffet continental", "Servi de 7 h à 10 h 30.", "16,00 €", 0),
        fiche("hotel-pd2", "Petit-déjeuner en chambre", "À commander la veille.", "22,00 €", 1),
        fiche("hotel-pd3", "Formule express", "Café et viennoiserie.", "9,00 €", 2),
      ]),
      rubrique("hotel-sejour", "Pendant le séjour", 1, [
        fiche("hotel-se1", "Parking privé", "Par nuit, sur réservation.", "14,00 €", 0),
        fiche("hotel-se2", "Départ tardif", "Jusqu'à 15 h, selon disponibilité.", "25,00 €", 1),
        fiche("hotel-se3", "Blanchisserie", "Retour sous 24 h.", "Sur demande", 2),
      ]),
    ]),
  ],

  spa: [
    carte("spa-soins", "Soins du visage et du corps", 0, [
      rubrique("spa-visage", "Visage", 0, [
        fiche("spa-v1", "Soin éclat", "Nettoyage, gommage, masque — 45 min.", "65,00 €", 0),
        fiche("spa-v2", "Soin hydratation", "Peaux sèches — 60 min.", "80,00 €", 1),
        fiche("spa-v3", "Soin anti-âge", "Massage liftant — 75 min.", "105,00 €", 2),
      ]),
      rubrique("spa-corps", "Corps", 1, [
        fiche("spa-c1", "Modelage relaxant", "Huile chaude — 60 min.", "85,00 €", 0),
        fiche("spa-c2", "Massage dos et nuque", "Ciblé — 30 min.", "50,00 €", 1),
        fiche("spa-c3", "Gommage au sel", "Suivi d'un enveloppement — 45 min.", "70,00 €", 2),
        fiche("spa-c4", "Réflexologie plantaire", "45 min.", "60,00 €", 3),
      ]),
    ]),
    carte("spa-rituels", "Rituels et forfaits", 1, [
      rubrique("spa-duo", "À deux", 0, [
        fiche("spa-d1", "Parenthèse duo", "Deux modelages en cabine double.", "170,00 €", 0),
        fiche("spa-d2", "Rituel bien-être", "Sauna, gommage, modelage.", "210,00 €", 1),
        fiche("spa-d3", "Accès spa", "Deux heures, hammam compris.", "45,00 €", 2),
      ]),
      rubrique("spa-forfaits", "Forfaits", 1, [
        fiche("spa-f1", "Carte cinq soins", "Valable un an.", "380,00 €", 0),
        fiche("spa-f2", "Journée détente", "Soins, déjeuner léger et accès spa.", "245,00 €", 1),
        fiche("spa-f3", "Bon cadeau", "Montant libre.", "Au choix", 2),
      ]),
    ]),
  ],

  // LE NEUTRE. Il ne doit ressembler ni à un restaurant ni à un salon : un
  // commerçant qui n'a pas dit son métier doit voir des ARTICLES, pas les plats
  // d'un autre.
  commerce: [
    carte("com-catalogue", "Notre sélection", 0, [
      rubrique("com-nouveautes", "Nouveautés", 0, [
        fiche("com-n1", "Article vedette", "Le plus demandé ce mois-ci.", "29,00 €", 0),
        fiche("com-n2", "Arrivage de saison", "Quantité limitée.", "19,50 €", 1),
        fiche("com-n3", "Édition locale", "Fabriqué dans la région.", "34,00 €", 2),
      ]),
      rubrique("com-classiques", "Nos classiques", 1, [
        fiche("com-c1", "Le grand format", "Notre référence historique.", "45,00 €", 0),
        fiche("com-c2", "Le format découverte", "Pour essayer.", "12,00 €", 1),
        fiche("com-c3", "Le coffret", "Trois articles assortis.", "55,00 €", 2),
        fiche("com-c4", "La recharge", "Pour prolonger sans racheter.", "16,00 €", 3),
      ]),
    ]),
    carte("com-services", "Services", 1, [
      rubrique("com-boutique", "En boutique", 0, [
        fiche("com-b1", "Emballage cadeau", "Offert dès 30 € d'achat.", "Offert", 0),
        fiche("com-b2", "Retrait sur place", "Prêt sous deux heures.", "Gratuit", 1),
        fiche("com-b3", "Conseil personnalisé", "Sur rendez-vous.", "Gratuit", 2),
      ]),
      rubrique("com-apres-vente", "Après l'achat", 1, [
        fiche("com-a1", "Échange sous 30 jours", "Ticket à conserver.", "Gratuit", 0),
        fiche("com-a2", "Réparation", "Devis avant intervention.", "Sur devis", 1),
        fiche("com-a3", "Carte de fidélité", "Un tampon par passage.", "Gratuite", 2),
      ]),
    ]),
  ],
};

/**
 * LES CARTES D'EXEMPLE D'UN SECTEUR — fonction PURE, jamais enregistrée.
 *
 * L'appelant reçoit une COPIE PROFONDE et non la constante : l'aperçu monte les
 * vrais composants publics, et l'un d'eux pourrait trier ses fiches sur place.
 * Une mutation sur la constante partagée aurait alors modifié l'exemple pour
 * tout le reste de la session, sans que rien ne le dise.
 */
export function cartesExemple(secteur: SecteurVitrine): VitrineCarteView[] {
  return EXEMPLES[secteur].map((c) => ({
    ...c,
    categories: c.categories.map((r) => ({
      ...r,
      fiches: r.fiches.map((f) => ({ ...f })),
    })),
  }));
}
