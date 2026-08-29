/**
 * LEXIQUE MOT → EMOJI — suggestion, jamais imposition.
 *
 * Le commerçant tape « Bouteille de vin », on lui PROPOSE 🍷 sous le champ.
 * Il clique, ou il ignore. Rien n'est écrit sans son geste : c'est l'arbitrage
 * du chantier, et il explique tout le reste de ce fichier.
 *
 * ── MODULE PUR ──────────────────────────────────────────────────────────
 *
 * Ni base, ni DOM, ni React. Il se teste en millisecondes et se réutilise
 * partout (éditeur de lots, futurs formulaires de campagne, templates).
 *
 * ── MOT ENTIER, JAMAIS SOUS-CHAÎNE ──────────────────────────────────────
 *
 * La tentation est d'écrire `texte.includes("vin")`. Elle coûte cher : un lot
 * « Article vintage » se verrait proposer 🍷, et « Sac en cuir DIVIN » aussi.
 * Une suggestion absurde est PIRE que pas de suggestion — elle apprend au
 * commerçant à ignorer la rangée entière. On indexe donc des MOTS, découpés
 * sur la ponctuation, et on ne devine jamais au hasard : rien ne correspond,
 * on ne rend rien.
 *
 * ── UN EMOJI PAR ENTRÉE, SANS SÉLECTEUR DE VARIATION ────────────────────
 *
 * Chaque entrée porte un emoji dont le codet de base se rend déjà en couleur,
 * sans `U+FE0F` (VARIATION SELECTOR-16) et sans séquence ZWJ. Ce n'est pas une
 * coquetterie typographique : ce dépôt a déjà perdu une session sur un test
 * Playwright qui expirait sans nom de locator, parce qu'un `U+FE0F` invisible
 * s'était glissé dans un nom accessible (post-mortem dans
 * `e2e/event-remote-cycle.spec.ts`). Playwright normalise les espaces, pas les
 * sélecteurs de variation. Les emoji qui EXIGENT un VS16 pour s'afficher en
 * couleur (❄️, 🏷️, ✈️, 🎟️…) sont donc simplement absents de ce lexique, au
 * profit d'un voisin autonome. Un test parcourt les entrées et fait échouer la
 * suite si l'un d'eux réapparaît.
 *
 * Corollaire côté rendu : l'emoji va TOUJOURS dans un élément à part,
 * `aria-hidden`, jamais concaténé au libellé.
 *
 * ── ORIENTATION ─────────────────────────────────────────────────────────
 *
 * Commerce de proximité français : boissons, nourriture, boutiques, services,
 * récompenses. Les mots-clés sont écrits DÉJÀ NORMALISÉS (minuscules, sans
 * accent) — un test le vérifie, parce qu'un « café » accentué dans la table ne
 * serait jamais atteint par la recherche.
 */

export interface EntreeLexique {
  /** L'emoji suggéré. Un seul codet visible, sans VS16 ni ZWJ. */
  readonly emoji: string;
  /** Mots-clés déjà normalisés. Le pluriel simple est géré à la recherche. */
  readonly mots: readonly string[];
}

/**
 * LE LEXIQUE.
 *
 * Un mot-clé n'appartient qu'à UNE entrée (test d'unicité) : deux entrées qui
 * se disputent « peche » rendraient la suggestion dépendante de l'ordre du
 * tableau, donc imprévisible. Quand un mot est réellement ambigu, on tranche
 * ici, une fois, en faveur de l'usage le plus probable sur une étiquette de lot.
 */
export const LEXIQUE_EMOJI: readonly EntreeLexique[] = [
  // ── Boissons ──────────────────────────────────────────────────────────
  { emoji: "🍷", mots: ["vin", "pinard", "bordeaux", "beaujolais", "vignoble"] },
  { emoji: "🥂", mots: ["champagne", "cremant", "mousseux", "prosecco"] },
  { emoji: "🍺", mots: ["biere", "pinte", "ipa", "brasserie"] },
  { emoji: "🍻", mots: ["apero", "aperitif", "happy"] },
  { emoji: "🥃", mots: ["whisky", "rhum", "cognac", "armagnac", "digestif"] },
  { emoji: "🍸", mots: ["martini", "spritz", "vermouth"] },
  { emoji: "🍹", mots: ["cocktail", "mojito", "punch", "sangria"] },
  { emoji: "☕", mots: ["cafe", "expresso", "espresso", "cappuccino", "latte", "moka"] },
  { emoji: "🍵", mots: ["the", "infusion", "tisane", "matcha"] },
  { emoji: "🧃", mots: ["jus", "smoothie", "nectar"] },
  { emoji: "🥤", mots: ["soda", "limonade", "milkshake", "boisson"] },
  { emoji: "🧋", mots: ["boba", "bubble"] },
  { emoji: "🥛", mots: ["lait", "laitier"] },
  { emoji: "🍶", mots: ["sake"] },
  { emoji: "💧", mots: ["eau", "hydratation", "source"] },

  // ── Boulangerie, pâtisserie, sucré ────────────────────────────────────
  { emoji: "🥖", mots: ["baguette", "pain", "boulangerie", "boulanger"] },
  { emoji: "🥐", mots: ["croissant", "viennoiserie", "brioche"] },
  { emoji: "🍞", mots: ["toast", "tartine"] },
  { emoji: "🥯", mots: ["bagel"] },
  { emoji: "🥨", mots: ["bretzel"] },
  { emoji: "🧇", mots: ["gaufre"] },
  { emoji: "🥞", mots: ["pancake"] },
  { emoji: "🫓", mots: ["crepe", "galette", "blini"] },
  { emoji: "🎂", mots: ["gateau", "anniversaire", "patisserie", "patissier"] },
  { emoji: "🧁", mots: ["cupcake", "muffin", "madeleine"] },
  { emoji: "🥧", mots: ["tarte", "tourte", "quiche", "clafoutis"] },
  { emoji: "🍰", mots: ["dessert", "gourmandise", "entremets"] },
  { emoji: "🍩", mots: ["donut", "beignet", "chouquette"] },
  { emoji: "🍪", mots: ["cookie", "biscuit", "sable", "speculoos"] },
  { emoji: "🍮", mots: ["flan", "creme", "pudding"] },
  { emoji: "🍨", mots: ["glace", "sorbet", "sundae", "glacier"] },
  { emoji: "🍭", mots: ["bonbon", "sucette", "confiserie"] },
  { emoji: "🍬", mots: ["caramel", "nougat", "guimauve", "chamallow"] },
  { emoji: "🍫", mots: ["chocolat", "cacao", "praline"] },
  { emoji: "🍯", mots: ["miel"] },
  { emoji: "🧈", mots: ["beurre"] },
  { emoji: "🥣", mots: ["bol", "muesli", "granola"] },

  // ── Plats ─────────────────────────────────────────────────────────────
  { emoji: "🧀", mots: ["fromage", "comte", "camembert", "roquefort", "raclette", "chevre"] },
  { emoji: "🍕", mots: ["pizza", "pizzeria", "calzone"] },
  { emoji: "🍔", mots: ["burger", "hamburger", "cheeseburger"] },
  { emoji: "🌭", mots: ["hotdog", "saucisse"] },
  { emoji: "🍟", mots: ["frite"] },
  { emoji: "🥗", mots: ["salade", "crudite"] },
  { emoji: "🍝", mots: ["pate", "spaghetti", "lasagne", "ravioli", "tagliatelle"] },
  { emoji: "🍣", mots: ["sushi", "maki", "sashimi", "poke"] },
  { emoji: "🥟", mots: ["gyoza", "dumpling", "nem"] },
  { emoji: "🌮", mots: ["taco", "burrito", "fajita"] },
  { emoji: "🥙", mots: ["kebab", "durum", "wrap"] },
  { emoji: "🥪", mots: ["sandwich", "panini", "croque"] },
  { emoji: "🧆", mots: ["falafel", "houmous"] },
  { emoji: "🍜", mots: ["ramen", "nouille", "pho", "udon"] },
  { emoji: "🍲", mots: ["soupe", "potage", "tajine", "bouillon"] },
  { emoji: "🍛", mots: ["curry", "colombo"] },
  { emoji: "🍚", mots: ["riz", "risotto"] },
  { emoji: "🥘", mots: ["paella", "cassoulet"] },
  { emoji: "🍳", mots: ["oeuf", "omelette", "brunch"] },
  { emoji: "🥓", mots: ["bacon", "lard"] },
  { emoji: "🍴", mots: ["restaurant", "menu", "repas", "diner", "dejeuner", "formule", "plat", "couvert", "bistrot", "traiteur"] },
  { emoji: "🔥", mots: ["barbecue", "grill", "braise", "plancha"] },

  // ── Viandes, poissons, produits ───────────────────────────────────────
  { emoji: "🥩", mots: ["steak", "viande", "entrecote", "boucherie", "boucher", "bavette"] },
  { emoji: "🍖", mots: ["grillade", "rotisserie", "brochette"] },
  { emoji: "🍗", mots: ["poulet", "volaille", "dinde"] },
  { emoji: "🐷", mots: ["porc", "cochon", "charcuterie"] },
  { emoji: "🐮", mots: ["boeuf", "vache"] },
  { emoji: "🐑", mots: ["agneau", "mouton"] },
  { emoji: "🦆", mots: ["canard", "magret", "foie"] },
  { emoji: "🐟", mots: ["poisson", "poissonnerie", "saumon", "cabillaud", "truite"] },
  { emoji: "🦐", mots: ["crevette", "gambas", "langoustine"] },
  { emoji: "🦞", mots: ["homard", "langouste"] },
  { emoji: "🦀", mots: ["crabe", "tourteau"] },
  { emoji: "🦑", mots: ["calamar", "encornet"] },
  { emoji: "🐙", mots: ["poulpe", "pieuvre"] },
  { emoji: "🦪", mots: ["huitre", "coquillage"] },

  // ── Fruits et légumes ─────────────────────────────────────────────────
  { emoji: "🥕", mots: ["legume", "carotte", "primeur", "maraicher"] },
  { emoji: "🍅", mots: ["tomate"] },
  { emoji: "🥬", mots: ["chou", "epinard", "laitue"] },
  { emoji: "🥦", mots: ["brocoli"] },
  { emoji: "🥒", mots: ["concombre", "cornichon"] },
  { emoji: "🫑", mots: ["poivron"] },
  { emoji: "🍄", mots: ["champignon", "truffe"] },
  { emoji: "🌽", mots: ["mais"] },
  { emoji: "🥑", mots: ["avocat", "guacamole"] },
  { emoji: "🧄", mots: ["ail"] },
  { emoji: "🧅", mots: ["oignon", "echalote"] },
  { emoji: "🫘", mots: ["haricot", "lentille", "pois"] },
  { emoji: "🧂", mots: ["sel", "epice", "condiment"] },
  { emoji: "🫒", mots: ["olive", "tapenade"] },
  { emoji: "🥫", mots: ["conserve", "bocal", "confit"] },
  { emoji: "🍎", mots: ["pomme", "cidre"] },
  { emoji: "🍐", mots: ["poire"] },
  { emoji: "🍇", mots: ["raisin"] },
  { emoji: "🍓", mots: ["fraise", "framboise", "mure"] },
  { emoji: "🫐", mots: ["myrtille", "cassis"] },
  { emoji: "🍒", mots: ["cerise"] },
  { emoji: "🍑", mots: ["peche", "abricot", "nectarine"] },
  { emoji: "🍊", mots: ["orange", "mandarine", "clementine"] },
  { emoji: "🍋", mots: ["citron", "agrume"] },
  { emoji: "🍌", mots: ["banane"] },
  { emoji: "🍉", mots: ["pasteque"] },
  { emoji: "🍈", mots: ["melon"] },
  { emoji: "🍍", mots: ["ananas"] },
  { emoji: "🥭", mots: ["mangue", "papaye"] },
  { emoji: "🥝", mots: ["kiwi"] },
  { emoji: "🥥", mots: ["coco"] },
  { emoji: "🌰", mots: ["chataigne", "marron"] },
  { emoji: "🥜", mots: ["cacahuete", "arachide", "noix", "amande", "noisette", "pistache"] },
  { emoji: "🌾", mots: ["ferme", "agriculture", "cereale", "ble", "fermier"] },
  { emoji: "🚜", mots: ["tracteur", "recolte"] },
  { emoji: "🌿", mots: ["bio", "naturel", "herboristerie", "aromate"] },

  // ── Boutiques et objets ───────────────────────────────────────────────
  { emoji: "💐", mots: ["fleur", "bouquet", "fleuriste", "rose", "tulipe"] },
  { emoji: "🌱", mots: ["plante", "jardin", "jardinerie", "graine", "bouture"] },
  { emoji: "🌳", mots: ["arbre", "foret"] },
  { emoji: "📚", mots: ["livre", "librairie", "roman", "bouquin", "lecture"] },
  { emoji: "📰", mots: ["journal", "magazine", "presse"] },
  { emoji: "📝", mots: ["papeterie", "cahier", "stylo", "ecriture"] },
  { emoji: "📄", mots: ["impression", "imprimerie", "affiche", "flyer"] },
  { emoji: "👕", mots: ["tshirt", "vetement", "chemise", "pull", "polo", "sweat"] },
  { emoji: "👗", mots: ["robe", "jupe", "mode"] },
  { emoji: "👖", mots: ["jean", "pantalon", "short"] },
  { emoji: "🧥", mots: ["manteau", "veste", "blouson", "doudoune"] },
  { emoji: "🧦", mots: ["chaussette", "collant"] },
  { emoji: "👟", mots: ["sneaker", "chaussure", "botte", "mocassin"] },
  { emoji: "👜", mots: ["sac", "maroquinerie", "cabas", "pochette"] },
  { emoji: "💍", mots: ["bague", "bijou", "bijouterie", "alliance", "joaillerie"] },
  { emoji: "⌚", mots: ["montre", "horlogerie"] },
  { emoji: "👓", mots: ["lunette", "opticien", "optique", "vue"] },
  { emoji: "💎", mots: ["diamant", "luxe", "precieux"] },
  { emoji: "🧵", mots: ["couture", "mercerie", "tricot", "laine", "retouche"] },
  { emoji: "🧸", mots: ["jouet", "peluche", "doudou"] },
  { emoji: "🍼", mots: ["bebe", "puericulture", "biberon"] },
  { emoji: "🪑", mots: ["meuble", "mobilier", "chaise", "fauteuil"] },
  { emoji: "🏠", mots: ["maison", "immobilier", "logement", "appartement", "deco", "decoration"] },
  { emoji: "🔑", mots: ["cle", "serrurier", "serrurerie"] },
  { emoji: "🐶", mots: ["chien", "chiot", "canin", "toiletteur", "toilettage"] },
  { emoji: "🐱", mots: ["chat", "chaton", "felin"] },
  { emoji: "🐾", mots: ["animal", "animalerie", "croquette", "veterinaire"] },
  { emoji: "🐝", mots: ["abeille", "ruche"] },
  { emoji: "🦋", mots: ["papillon", "printemps"] },
  { emoji: "🦁", mots: ["zoo", "safari"] },
  { emoji: "🐴", mots: ["cheval", "equitation", "poney"] },

  // ── Beauté, soin, bien-être ───────────────────────────────────────────
  { emoji: "💇", mots: ["coiffure", "coiffeur", "coupe", "brushing", "shampoing", "meche"] },
  { emoji: "💈", mots: ["barbier", "barbe", "rasage"] },
  { emoji: "💅", mots: ["ongle", "manucure", "pedicure", "vernis"] },
  { emoji: "💄", mots: ["maquillage", "cosmetique", "gloss"] },
  { emoji: "🧴", mots: ["soin", "lotion", "serum", "hydratant"] },
  { emoji: "🧼", mots: ["savon", "savonnerie"] },
  { emoji: "🌺", mots: ["parfum", "parfumerie", "fragrance"] },
  { emoji: "🛁", mots: ["bain", "spa", "hammam", "jacuzzi", "sauna"] },
  { emoji: "💆", mots: ["massage", "masseur", "relaxation", "detente"] },
  { emoji: "🧘", mots: ["yoga", "meditation", "pilates", "sophrologie", "zen"] },
  { emoji: "💉", mots: ["tatouage", "tatoueur", "piercing"] },
  { emoji: "💊", mots: ["pharmacie", "medicament", "vitamine", "complement"] },
  { emoji: "🦷", mots: ["dentiste", "dent", "dentaire", "orthodontie"] },
  { emoji: "🩺", mots: ["sante", "medecin", "consultation", "osteopathe", "kine"] },

  // ── Sport et loisirs ──────────────────────────────────────────────────
  { emoji: "💪", mots: ["musculation", "muscu", "fitness", "gym", "coaching", "sport"] },
  { emoji: "🏃", mots: ["running", "jogging", "marathon", "footing"] },
  { emoji: "🚴", mots: ["velo", "cyclisme", "vtt", "bicyclette"] },
  { emoji: "🏊", mots: ["piscine", "natation", "nage"] },
  { emoji: "⚽", mots: ["football", "foot", "futsal"] },
  { emoji: "🎾", mots: ["tennis", "padel", "raquette"] },
  { emoji: "🎳", mots: ["bowling", "quille"] },
  { emoji: "🎯", mots: ["flechette", "cible"] },
  { emoji: "🎱", mots: ["billard", "snooker"] },
  { emoji: "🥊", mots: ["boxe", "gant"] },
  { emoji: "🥋", mots: ["judo", "karate", "taekwondo"] },
  { emoji: "⛳", mots: ["golf", "putting"] },
  { emoji: "🎿", mots: ["ski", "montagne"] },
  { emoji: "🏂", mots: ["snowboard"] },
  { emoji: "🏄", mots: ["surf", "planche", "bodyboard"] },
  { emoji: "🤿", mots: ["plongee", "snorkeling"] },
  { emoji: "🛼", mots: ["roller", "patin"] },
  { emoji: "🛹", mots: ["skate", "skateboard"] },
  { emoji: "🧩", mots: ["puzzle", "enigme", "escape"] },
  { emoji: "🎲", mots: ["hasard", "tirage", "loterie"] },
  { emoji: "🎮", mots: ["jeu", "gaming", "console", "manette", "arcade"] },
  { emoji: "🧠", mots: ["memoire", "quiz", "cerveau", "culture"] },
  { emoji: "🎢", mots: ["parc", "attraction", "manege"] },
  { emoji: "🎪", mots: ["cirque", "kermesse", "chapiteau"] },

  // ── Culture et sorties ────────────────────────────────────────────────
  { emoji: "🍿", mots: ["popcorn"] },
  { emoji: "🎬", mots: ["cinema", "film", "seance", "projection"] },
  { emoji: "🎭", mots: ["theatre", "spectacle", "comedie"] },
  { emoji: "🎵", mots: ["musique", "concert", "disque", "vinyle", "playlist"] },
  { emoji: "🎤", mots: ["karaoke", "micro", "chant"] },
  { emoji: "🎸", mots: ["guitare", "rock"] },
  { emoji: "🎹", mots: ["piano", "clavier"] },
  { emoji: "🥁", mots: ["percussion", "tambour"] },
  { emoji: "🎺", mots: ["trompette", "fanfare"] },
  { emoji: "🎻", mots: ["violon", "classique"] },
  { emoji: "🎧", mots: ["casque", "audio", "podcast", "ecouteur"] },
  { emoji: "📻", mots: ["radio", "emission"] },
  { emoji: "📺", mots: ["television", "serie"] },
  { emoji: "📷", mots: ["photo", "photographe", "photographie", "portrait", "shooting"] },
  { emoji: "🎨", mots: ["peinture", "dessin", "art", "atelier", "galerie", "artiste"] },
  { emoji: "🏰", mots: ["chateau", "visite", "monument"] },
  { emoji: "🎓", mots: ["cours", "formation", "stage", "ecole", "diplome", "tutorat"] },

  // ── Mobilité et voyage ────────────────────────────────────────────────
  { emoji: "🚗", mots: ["voiture", "auto", "automobile", "garage", "mecanique", "carrosserie"] },
  { emoji: "🛵", mots: ["moto", "scooter"] },
  { emoji: "🛴", mots: ["trottinette"] },
  { emoji: "🚌", mots: ["bus", "navette", "transport"] },
  { emoji: "🚕", mots: ["taxi", "vtc", "chauffeur"] },
  { emoji: "🚚", mots: ["camion", "demenagement", "transporteur"] },
  { emoji: "⛽", mots: ["essence", "carburant", "station"] },
  { emoji: "⛵", mots: ["bateau", "voile", "croisiere"] },
  { emoji: "🧳", mots: ["voyage", "valise", "bagage", "sejour", "vacances"] },
  { emoji: "🏨", mots: ["hotel", "chambre", "nuitee", "gite"] },
  { emoji: "⛺", mots: ["camping", "tente", "bivouac"] },
  { emoji: "🚀", mots: ["fusee", "boost", "lancement"] },

  // ── Services et maison ────────────────────────────────────────────────
  { emoji: "🔧", mots: ["outil", "bricolage", "reparation", "plombier", "plomberie"] },
  { emoji: "🔌", mots: ["electricite", "electricien", "branchement"] },
  { emoji: "🔋", mots: ["batterie", "recharge", "energie"] },
  { emoji: "🧽", mots: ["lavage", "nettoyage", "menage", "pressing", "laverie"] },
  { emoji: "🚿", mots: ["douche", "sanitaire"] },
  { emoji: "🔒", mots: ["securite", "alarme", "protection"] },
  { emoji: "💻", mots: ["informatique", "ordinateur", "laptop"] },
  { emoji: "📱", mots: ["telephone", "smartphone", "mobile", "coque"] },
  { emoji: "📧", mots: ["email", "mail", "newsletter", "courriel"] },
  { emoji: "📞", mots: ["appel", "contact", "hotline"] },
  { emoji: "📦", mots: ["colis", "livraison", "expedition"] },
  { emoji: "🥡", mots: ["emporter", "vente"] },
  { emoji: "🏦", mots: ["banque", "assurance"] },
  { emoji: "🧾", mots: ["facture", "recu", "addition", "note"] },
  { emoji: "🌍", mots: ["ecologie", "planete", "durable"] },

  // ── Récompenses, commerce, temps ──────────────────────────────────────
  { emoji: "🎁", mots: ["cadeau", "surprise", "coffret"] },
  { emoji: "🎫", mots: ["ticket", "billet", "place", "entree", "coupon"] },
  { emoji: "💸", mots: ["reduction", "remise", "promo", "promotion", "solde", "destockage"] },
  { emoji: "💰", mots: ["bon", "cagnotte", "economie", "cashback", "gratuit", "offert"] },
  { emoji: "💶", mots: ["euro", "prix", "tarif", "budget"] },
  { emoji: "💳", mots: ["carte", "fidelite", "abonnement", "paiement"] },
  { emoji: "🛒", mots: ["panier", "course", "caddie", "supermarche", "epicerie", "superette"] },
  { emoji: "🏪", mots: ["commerce", "enseigne", "boutique", "magasin"] },
  { emoji: "📍", mots: ["adresse", "lieu", "quartier"] },
  { emoji: "🏆", mots: ["trophee", "champion", "victoire", "podium", "concours"] },
  { emoji: "🥇", mots: ["medaille", "premier"] },
  { emoji: "👑", mots: ["roi", "couronne", "vip", "premium"] },
  { emoji: "⭐", mots: ["etoile", "favori"] },
  { emoji: "✨", mots: ["nouveaute", "brillant", "magie"] },
  { emoji: "🍀", mots: ["chance", "trefle"] },
  { emoji: "🎉", mots: ["fete", "celebration", "festif", "soiree"] },
  { emoji: "🎊", mots: ["confetti", "cotillon"] },
  { emoji: "🎈", mots: ["ballon", "gonflable"] },
  { emoji: "🎀", mots: ["ruban", "emballage"] },
  { emoji: "💒", mots: ["mariage", "noce"] },
  { emoji: "💖", mots: ["amour", "valentin", "coeur"] },
  { emoji: "👶", mots: ["enfant", "kids", "junior"] },
  { emoji: "🎄", mots: ["noel", "sapin", "avent"] },
  { emoji: "⛄", mots: ["hiver", "neige"] },
  { emoji: "🎃", mots: ["halloween", "citrouille"] },
  { emoji: "🐣", mots: ["paques", "poussin"] },
  { emoji: "🍁", mots: ["automne", "erable"] },
  { emoji: "🌞", mots: ["ete", "soleil", "bronzage"] },
  { emoji: "📅", mots: ["calendrier", "agenda", "reservation"] },
  { emoji: "⏰", mots: ["horaire", "reveil", "minute", "chrono"] },
  { emoji: "🔔", mots: ["cloche", "rappel", "alerte"] },
  { emoji: "📣", mots: ["annonce", "communication"] },
  { emoji: "💡", mots: ["idee", "ampoule", "conseil", "astuce"] },
  { emoji: "🔍", mots: ["recherche", "loupe", "detail"] },
];

/** Nombre d'emoji rendus par défaut : une rangée qui tient sur un mobile. */
const MAX_PAR_DEFAUT = 4;

/**
 * Index mot → emoji, construit une seule fois au premier appel.
 *
 * Un `Map` et non un balayage du tableau : `emojisPour` est appelé à CHAQUE
 * frappe dans le champ du nom du lot.
 */
let indexMots: Map<string, string> | null = null;

function index(): Map<string, string> {
  if (indexMots) return indexMots;
  const map = new Map<string, string>();
  for (const entree of LEXIQUE_EMOJI) {
    for (const mot of entree.mots) {
      // Première entrée gagnante : le test d'unicité garantit qu'il n'y a pas
      // de collision, ce `if` n'est qu'une ceinture pour un lexique édité vite.
      if (!map.has(mot)) map.set(mot, entree.emoji);
    }
  }
  indexMots = map;
  return map;
}

/**
 * Découpe un texte libre en mots comparables au lexique.
 *
 * Minuscules, ligatures dépliées (`œ` → `oe` : NFD ne les décompose PAS, et
 * « cœur » resterait introuvable), accents retirés, tout le reste traité comme
 * un séparateur — apostrophes et traits d'union compris, pour que « bon d'achat »
 * et « pain-surprise » rendent bien leurs mots.
 */
export function motsDe(texte: string): string[] {
  return texte
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((mot) => mot.length > 0);
}

/**
 * Formes à essayer pour un mot : la forme telle quelle, puis le singulier
 * simple. « vins » → « vin », « bijoux » → « bijou », « journaux » → « journal ».
 *
 * Le seuil de longueur évite de raboter des mots courts légitimes (« jus »,
 * « riz », « pain » n'ont rien à perdre à ne pas être dépluralisés).
 */
function formes(mot: string): string[] {
  const candidats = [mot];
  if (mot.length > 4 && mot.endsWith("aux")) {
    candidats.push(`${mot.slice(0, -3)}al`);
  }
  if (mot.length > 3 && (mot.endsWith("s") || mot.endsWith("x"))) {
    candidats.push(mot.slice(0, -1));
  }
  return candidats;
}

/**
 * Emoji suggérés pour un texte libre — dans l'ORDRE des mots du texte.
 *
 * L'ordre compte : le commerçant relit sa propre saisie de gauche à droite, et
 * une rangée qui suit ce fil se comprend sans effort. Sans doublon (« Vin et
 * bouteille de vin » ne propose 🍷 qu'une fois), plafonnée à `max`.
 *
 * Rend `[]` quand rien ne correspond. C'est un résultat, pas un échec : on ne
 * devine JAMAIS au hasard, un emoji sans rapport étant pire que pas d'emoji.
 */
export function emojisPour(texte: string, max: number = MAX_PAR_DEFAUT): string[] {
  if (max <= 0) return [];
  const table = index();
  const trouves: string[] = [];
  for (const mot of motsDe(texte)) {
    for (const forme of formes(mot)) {
      const emoji = table.get(forme);
      if (!emoji) continue;
      if (!trouves.includes(emoji)) trouves.push(emoji);
      break;
    }
    if (trouves.length >= max) break;
  }
  return trouves.slice(0, max);
}

/** Ensemble des emoji du lexique, pour la validation d'écriture. */
let emojiConnus: Set<string> | null = null;

/**
 * L'emoji fait-il partie du lexique ?
 *
 * La validation serveur s'appuie dessus : le seul chemin d'écriture prévu est
 * un bouton de la rangée de suggestions, dont les valeurs sortent d'ici. Un
 * `formData` forgé ne peut donc pas glisser un texte arbitraire dans une
 * colonne rendue à tous les joueurs de la roue — le champ reste une ICÔNE, pas
 * un second libellé libre.
 */
export function estEmojiConnu(valeur: string): boolean {
  if (!emojiConnus) {
    emojiConnus = new Set(LEXIQUE_EMOJI.map((entree) => entree.emoji));
  }
  return emojiConnus.has(valeur);
}

/**
 * Le mot qui NOMME un emoji du lexique — pour les noms accessibles.
 *
 * Le bouton de suggestion ne peut pas s'appeler « 🍷 » : un emoji dans un nom
 * accessible se lit mal et casse les locators. Il s'appelle « Choisir l'icône
 * vin », et ce mot vient d'ici — le premier mot-clé de l'entrée, qui est aussi
 * le plus courant.
 */
export function motPourEmoji(emoji: string): string | null {
  const entree = LEXIQUE_EMOJI.find((e) => e.emoji === emoji);
  return entree?.mots[0] ?? null;
}
