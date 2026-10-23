/* ==========================================================================
   SOURCE DE VÉRITÉ DU CODEBASE GIT — LASTCHANCE (window.LC_CODEBASE)
   Miroir strict des fichiers du dépôt Git :
   - src/lib/wheel-style.ts (WHEEL_PRESETS_AMBIANCE, WHEEL_PRESETS_UNIVERS, SLOT_SYMBOL_SETS, RING_STYLES, etc.)
   - src/lib/fonds-ecran.ts (FOND_KEYS, FOND_LABELS)
   - src/components/ui/theme-lavis.ts (LAVIS_SAISON)
   - src/lib/vitrine.ts & src/components/vitrine/studio/exemples.ts (VITRINE_SECTEURS, VITRINE_PRESETS_SECTEUR, EXEMPLES, VITRINE_ALLURE_ENUMS, ETAPES_STUDIO)
   - src/lib/competitions.ts & src/components/dashboard/contest-event-kinds.ts & src/components/pronos/contest-theme.ts
   - src/components/dashboard/loyalty-settings-presets.ts & src/lib/loyalty-style.ts
   - src/lib/module-capabilities.ts (canExplore, canEditDraft, canPublish)
   ========================================================================== */
(function (global) {
  /* ── 1. LES 10 FONDS D'ÉCRAN THÉMATIQUES (src/lib/fonds-ecran.ts) ── */
  const FOND_KEYS = [
    "prairie",
    "noel",
    "saint_valentin",
    "anniversaire",
    "soldes",
    "festival",
    "musique",
    "football",
    "restaurant",
    "espace",
  ];

  const FOND_LABELS = {
    prairie: "Prairie du trèfle",
    noel: "Noël",
    saint_valentin: "Saint-Valentin",
    anniversaire: "Anniversaire",
    soldes: "Soldes & boutique",
    festival: "Fête foraine",
    musique: "Scène musicale",
    football: "Football",
    restaurant: "Restaurant",
    espace: "Espace",
  };

  /* ── 2. LAVIS SAISONNIERS (src/components/ui/theme-lavis.ts) ── */
  const LAVIS_SAISON = {
    neutre: "#fdf6e3",
    noel: "#e6f2e6",
    saint_valentin: "#fdeaf0",
    anniversaire: "#fdf1d8",
    soldes: "#fdeadb",
    festival: "#e7edfb",
    prairie: "#eaf5df",
    musique: "#eceff5",
    football: "#e4f1e6",
    restaurant: "#fbecd4",
    espace: "#e8eef9",
  };

  /* ── 3. LES 18 PRESETS DE LA ROUE & DE /PLAY (src/lib/wheel-style.ts) ── */
  const WHEEL_PRESETS_AMBIANCE = [
    {
      key: "kermesse",
      family: "ambiance",
      label: "Kermesse (Style maison)",
      swatch: ["#fcca59", "#f296bd", "#211d16"],
      style: {
        pageTheme: "kermesse",
        ring: "classic",
        ringColor: "#fcca59",
        lights: true,
        lightColorA: "#fdf6e3",
        lightColorB: "#fcca59",
        segmentBorderColor: "#211d16",
        segmentBorderWidth: 3,
        labelColor: "#fdf6e3",
        labelOutline: true,
        hub: "disc",
        hubColor: "#fdf6e3",
        pointer: "triangle",
        pointerColor: "#f5793b",
        font: "rounded",
        bgFrom: "#4a4238",
        bgTo: "#211d16",
        buttonFrom: "#f5793b",
        buttonTo: "#fcca59",
        cartoonAnimations: false,
      },
    },
    {
      key: "classic",
      family: "ambiance",
      label: "Classique",
      swatch: ["#7c3aed", "#d946ef", "#ffd34d"],
      style: {
        pageTheme: "nuit",
        ring: "classic",
        ringColor: "#7c3aed",
        lights: true,
        lightColorA: "#ffffff",
        lightColorB: "#ffd34d",
        segmentBorderColor: "#000000",
        segmentBorderWidth: 2,
        labelColor: "auto",
        labelOutline: true,
        hub: "none",
        hubColor: "#ffffff",
        pointer: "triangle",
        pointerColor: "#a78bfa",
        font: "sans",
        bgFrom: "#2e1065",
        bgTo: "#000000",
        buttonFrom: "#7c3aed",
        buttonTo: "#d946ef",
        cartoonAnimations: false,
      },
    },
    {
      key: "neon",
      family: "ambiance",
      label: "Néon",
      swatch: ["#22d3ee", "#f0abfc", "#0f172a"],
      style: {
        pageTheme: "nuit",
        ring: "neon",
        ringColor: "#22d3ee",
        lights: true,
        lightColorA: "#22d3ee",
        lightColorB: "#f0abfc",
        segmentBorderColor: "#67e8f9",
        segmentBorderWidth: 1.5,
        labelColor: "auto",
        labelOutline: true,
        hub: "disc",
        hubColor: "#0f172a",
        pointer: "arrow",
        pointerColor: "#22d3ee",
        font: "impact",
        bgFrom: "#172554",
        bgTo: "#020617",
        buttonFrom: "#06b6d4",
        buttonTo: "#d946ef",
        cartoonAnimations: false,
      },
    },
    {
      key: "luxe",
      family: "ambiance",
      label: "Luxe",
      swatch: ["#ca8a04", "#1c1917", "#f5e6c4"],
      style: {
        pageTheme: "nuit",
        ring: "gold",
        ringColor: "#ca8a04",
        lights: false,
        lightColorA: "#ffffff",
        lightColorB: "#ca8a04",
        segmentBorderColor: "#ca8a04",
        segmentBorderWidth: 1,
        labelColor: "#f5e6c4",
        labelOutline: false,
        hub: "disc",
        hubColor: "#ca8a04",
        pointer: "pin",
        pointerColor: "#ca8a04",
        font: "elegant",
        bgFrom: "#292524",
        bgTo: "#0c0a09",
        buttonFrom: "#ca8a04",
        buttonTo: "#92400e",
        cartoonAnimations: false,
      },
    },
    {
      key: "candy",
      family: "ambiance",
      label: "Pastel",
      swatch: ["#f9a8d4", "#fde68a", "#ffffff"],
      style: {
        pageTheme: "nuit",
        ring: "minimal",
        ringColor: "#ffffff",
        lights: false,
        lightColorA: "#ffffff",
        lightColorB: "#fde68a",
        segmentBorderColor: "#ffffff",
        segmentBorderWidth: 4,
        labelColor: "#500724",
        labelOutline: false,
        hub: "disc",
        hubColor: "#ffffff",
        pointer: "pin",
        pointerColor: "#ec4899",
        font: "rounded",
        bgFrom: "#fbcfe8",
        bgTo: "#fda4af",
        buttonFrom: "#ec4899",
        buttonTo: "#f97316",
        cartoonAnimations: false,
      },
    },
    {
      key: "minimal",
      family: "ambiance",
      label: "Minimal",
      swatch: ["#18181b", "#e4e4e7", "#ffffff"],
      style: {
        pageTheme: "nuit",
        ring: "none",
        lights: false,
        lightColorA: "#ffffff",
        lightColorB: "#e4e4e7",
        segmentBorderColor: "#ffffff",
        segmentBorderWidth: 1.5,
        labelColor: "auto",
        labelOutline: false,
        hub: "dot",
        hubColor: "#18181b",
        pointer: "triangle",
        pointerColor: "#18181b",
        font: "modern",
        bgFrom: "#3f3f46",
        bgTo: "#18181b",
        buttonFrom: "#18181b",
        buttonTo: "#3f3f46",
        cartoonAnimations: false,
      },
    },
    {
      key: "fiesta",
      family: "ambiance",
      label: "Festif",
      swatch: ["#ef4444", "#facc15", "#22c55e"],
      style: {
        pageTheme: "nuit",
        ring: "classic",
        ringColor: "#facc15",
        lights: true,
        lightColorA: "#facc15",
        lightColorB: "#ef4444",
        segmentBorderColor: "#7f1d1d",
        segmentBorderWidth: 2.5,
        labelColor: "auto",
        labelOutline: true,
        hub: "target",
        hubColor: "#facc15",
        pointer: "triangle",
        pointerColor: "#facc15",
        font: "impact",
        bgFrom: "#7f1d1d",
        bgTo: "#1c0505",
        buttonFrom: "#ef4444",
        buttonTo: "#f97316",
        cartoonAnimations: false,
      },
    },
    {
      key: "cartoon",
      family: "ambiance",
      label: "Cartoon",
      swatch: ["#facc15", "#ef4444", "#3b82f6"],
      style: {
        pageTheme: "nuit",
        ring: "classic",
        ringColor: "#ef4444",
        lights: true,
        lightColorA: "#ffffff",
        lightColorB: "#facc15",
        segmentBorderColor: "#000000",
        segmentBorderWidth: 4,
        labelColor: "#ffffff",
        labelOutline: true,
        hub: "disc",
        hubColor: "#ffffff",
        pointer: "arrow",
        pointerColor: "#facc15",
        font: "rounded",
        bgFrom: "#fef08a",
        bgTo: "#f59e0b",
        buttonFrom: "#3b82f6",
        buttonTo: "#1d4ed8",
        cartoonAnimations: true,
      },
    },
  ];

  const WHEEL_PRESETS_UNIVERS = [
    {
      key: "noel",
      family: "univers",
      label: "🎄 Noël",
      swatch: ["#2b6b47", "#c33b34", "#f2c14e"],
      style: {
        pageTheme: "kermesse",
        fond: "noel",
        ring: "classic",
        ringColor: "#f2c14e",
        lights: true,
        pointerColor: "#c33b34",
        buttonFrom: "#c33b34",
        buttonTo: "#2b6b47",
        bgFrom: "#e6f2e6",
        bgTo: "#bcd9c6",
      },
    },
    {
      key: "saint_valentin",
      family: "univers",
      label: "💘 Saint-Valentin",
      swatch: ["#f7c6d9", "#d94a6a", "#5aa15f"],
      style: {
        pageTheme: "kermesse",
        fond: "saint_valentin",
        ring: "classic",
        ringColor: "#f7c6d9",
        lights: true,
        pointerColor: "#d94a6a",
        buttonFrom: "#d94a6a",
        buttonTo: "#f296bd",
        bgFrom: "#fdeaf0",
        bgTo: "#f7c0c6",
      },
    },
    {
      key: "anniversaire",
      family: "univers",
      label: "🎉 Anniversaire",
      swatch: ["#7cb342", "#f7ea9e", "#f28fa8"],
      style: {
        pageTheme: "kermesse",
        fond: "anniversaire",
        ring: "classic",
        ringColor: "#f296bd",
        lights: true,
        pointerColor: "#e14b3b",
        buttonFrom: "#f296bd",
        buttonTo: "#fcca59",
        bgFrom: "#fdf1d8",
        bgTo: "#f9cece",
      },
    },
    {
      key: "soldes",
      family: "univers",
      label: "💯 Soldes & boutique",
      swatch: ["#f5793b", "#c0392b", "#f0b429"],
      style: {
        pageTheme: "kermesse",
        fond: "soldes",
        ring: "classic",
        ringColor: "#f0b429",
        lights: true,
        pointerColor: "#c0392b",
        buttonFrom: "#f5793b",
        buttonTo: "#f0b429",
        bgFrom: "#fdeadb",
        bgTo: "#fbcfb5",
      },
    },
    {
      key: "festival",
      family: "univers",
      label: "🎪 Fête foraine",
      swatch: ["#d9534f", "#f2c94c", "#6fae3f"],
      style: {
        pageTheme: "kermesse",
        fond: "festival",
        ring: "classic",
        ringColor: "#f2c94c",
        lights: true,
        lightColorA: "#fdf6e3",
        lightColorB: "#f2c94c",
        pointerColor: "#d9534f",
        buttonFrom: "#d9534f",
        buttonTo: "#f2c94c",
        bgFrom: "#e7edfb",
        bgTo: "#d0ddf9",
      },
    },
    {
      key: "musique",
      family: "univers",
      label: "🎵 Scène musicale",
      swatch: ["#b79bf0", "#e0a92a", "#6aa84f"],
      style: {
        pageTheme: "kermesse",
        fond: "musique",
        ring: "classic",
        ringColor: "#b79bf0",
        lights: true,
        pointerColor: "#b79bf0",
        buttonFrom: "#b79bf0",
        buttonTo: "#e0a92a",
        bgFrom: "#eceff5",
        bgTo: "#d6e0f5",
      },
    },
    {
      key: "football",
      family: "univers",
      label: "⚽ Football",
      swatch: ["#267f53", "#e8a020", "#ffffff"],
      style: {
        pageTheme: "kermesse",
        fond: "football",
        ring: "classic",
        ringColor: "#e8a020",
        lights: true,
        segmentBorderColor: "#ffffff",
        pointerColor: "#e8a020",
        buttonFrom: "#267f53",
        buttonTo: "#4f9e3f",
        bgFrom: "#e4f1e6",
        bgTo: "#bedac9",
      },
    },
    {
      key: "restaurant",
      family: "univers",
      label: "🍽️ Restaurant",
      swatch: ["#c0392b", "#f0c14b", "#4f8f3f"],
      style: {
        pageTheme: "kermesse",
        fond: "restaurant",
        ring: "classic",
        ringColor: "#f0c14b",
        lights: true,
        pointerColor: "#c0392b",
        buttonFrom: "#c0392b",
        buttonTo: "#f5793b",
        bgFrom: "#fbecd4",
        bgTo: "#fad3b2",
      },
    },
    {
      key: "espace",
      family: "univers",
      label: "🚀 Espace",
      swatch: ["#7b3fa0", "#f5d547", "#1b1246"],
      style: {
        pageTheme: "nuit",
        fond: "espace",
        ring: "neon",
        ringColor: "#9b4dca",
        lights: true,
        pointerColor: "#f5d547",
        buttonFrom: "#7b3fa0",
        buttonTo: "#d9a441",
        bgFrom: "#2e1065",
        bgTo: "#0b0620",
      },
    },
    {
      key: "prairie",
      family: "univers",
      label: "🍀 Prairie du trèfle",
      swatch: ["#7cbf4a", "#f5efc0", "#f2c14e"],
      style: {
        pageTheme: "kermesse",
        fond: "prairie",
        ring: "classic",
        ringColor: "#f2c14e",
        lights: true,
        pointerColor: "#f2c14e",
        buttonFrom: "#4f9c3a",
        buttonTo: "#7cbf4a",
        bgFrom: "#eaf5df",
        bgTo: "#cfe6b6",
      },
    },
  ];

  const WHEEL_PRESETS = [...WHEEL_PRESETS_AMBIANCE, ...WHEEL_PRESETS_UNIVERS];

  const SLOT_SYMBOL_SETS = {
    fruits: { label: "Fruits & Diamants", symbols: ["🍒", "🍋", "🔔", "⭐", "🍀", "💎"] },
    fete: { label: "Fête & Cadeaux", symbols: ["🎈", "🎉", "🎂", "🍭", "🎁", "🎪"] },
    bijoux: { label: "Bijoux & Couronnes", symbols: ["💎", "👑", "💍", "🏆", "✨", "🥇"] },
  };

  /* ── 4. LES 15 MÉCANIQUES DE JEUX INSTANTANÉS (src/platform/experiences/catalog.ts) ── */
  const INSTANT_MECHANICS = [
    // 9 Jeux de Hasard
    { key: "wheel", family: "hasard", emoji: "🎡", label: "Roue de la fortune", short: "Roue", desc: "Le joueur lance la roue et découvre immédiatement sur quel segment l'aiguille s'arrête.", secret: false },
    { key: "scratch", family: "hasard", emoji: "🎟️", label: "Carte à gratter", short: "Grattage", desc: "Une couche métallisée à gratter du bout du doigt sur l'écran pour révéler le lot.", secret: false },
    { key: "flip_card", family: "hasard", emoji: "🃏", label: "Carte retournée", short: "Carte retournée", desc: "Trois cartes mystères posées face cachée : le joueur en retourne une.", secret: false },
    { key: "cups", family: "hasard", emoji: "🥤", label: "Bonneteau (3 gobelets)", short: "3 Gobelets", desc: "La bille se glisse sous l'un des 3 gobelets mélangés sous les yeux du joueur.", secret: false },
    { key: "slot", family: "hasard", emoji: "🎰", label: "Machine à sous", short: "Machine à sous", desc: "Trois rouleaux animés (Fruits, Fête ou Bijoux) à aligner pour déclencher le gain.", secret: false },
    { key: "memory", family: "hasard", emoji: "🧩", label: "Memory", short: "Memory", desc: "Retournez les cartes deux par deux pour associer les paires identiques.", secret: true },
    { key: "chest", family: "hasard", emoji: "🧰", label: "Coffre à choisir", short: "3 Coffres", desc: "Trois coffres verrouillés : le joueur choisit lequel ouvrir avec sa clé.", secret: false },
    { key: "dice", family: "hasard", emoji: "🎲", label: "Lancer de dé", short: "Lancer de dé", desc: "Jet de dé dynamique sur le tapis de jeu pour atteindre le score gagnant.", secret: false },
    { key: "draw_card", family: "hasard", emoji: "🎴", label: "Tirage d'une carte", short: "Pioche carte", desc: "Piochez la carte du dessus dans le paquet fraîchement battu.", secret: false },
    // 6 Jeux d'Adresse (Skill-gated : défi à réussir avant le tirage)
    { key: "rps", family: "adresse", emoji: "✂️", label: "Pierre-feuille-ciseaux", short: "Pierre-Feuille", desc: "Remportez le duel rapide contre le téléphone pour déverrouiller le tirage.", secret: false },
    { key: "reflex", family: "adresse", emoji: "⚡", label: "Jeu de réflexe", short: "Réflexe", desc: "Touchez les cibles dès qu'elles s'allument avant la fin du compte à rebours.", secret: false },
    { key: "gauge", family: "adresse", emoji: "🎯", label: "Jauge à arrêter", short: "Jauge précision", desc: "Bloquez l'indicateur oscillant pile dans la zone verte pour ouvrir le tirage.", secret: false },
    { key: "puzzle", family: "adresse", emoji: "🖼️", label: "Puzzle simple", short: "Puzzle", desc: "Remettez les tuiles dans le bon ordre pour reconstituer l'image.", secret: true },
    { key: "mystery_word", family: "adresse", emoji: "🔤", label: "Mot mystère", short: "Mot mystère", desc: "Devinez le mot caché choisi par le commerçant lettre par lettre.", secret: true },
    { key: "estimate", family: "adresse", emoji: "🔢", label: "Estimation d'un nombre", short: "Juste nombre", desc: "Trouvez le nombre secret grâce aux indices « Plus haut / Plus bas ».", secret: true },
  ];

  /* ── 5. VITRINE : LES 7 SECTEURS, PALETTES, EXEMPLES & 9 ÉTAPES (src/lib/vitrine.ts & exemples.ts) ── */
  const VITRINE_SECTEURS = {
    restaurant: {
      key: "restaurant",
      label: "Restaurant",
      icon: "🍽️",
      primary: "#7D3C11",
      secondary: "#FAF6EC",
      heading: "elegant",
      body: "sans",
      defaultNom: "Bistrot L'Étoile",
      defaultAccroche: "Cuisine de marché, produits frais & vins de vignerons.",
      defaultHistoire: "Chaque matin, notre brigade compose l'ardoise au gré des arrivages de nos producteurs locaux.",
      defaultBadge: "Ouvert · 12h–14h30 & 19h–22h30",
      motCartes: "Nos cartes",
      cartes: [
        {
          nom: "Carte du midi",
          rubriques: [
            {
              nom: "Entrées",
              fiches: [
                { nom: "Velouté de potimarron", description: "Crème de châtaigne, huile de noisette.", prix: "7,00 €", badges: ["vegetarien", "fait_maison"] },
                { nom: "Œuf parfait", description: "Poireaux fondants, lard grillé.", prix: "9,00 €", badges: ["traditionnel"] },
                { nom: "Salade de saison", description: "Jeunes pousses, noix, comté.", prix: "8,50 €", badges: ["sain"] },
              ],
            },
            {
              nom: "Plats",
              fiches: [
                { nom: "Suprême de volaille", description: "Jus corsé, purée maison.", prix: "18,00 €", badges: ["fait_maison"] },
                { nom: "Dos de cabillaud", description: "Beurre blanc, légumes du marché.", prix: "21,00 €", badges: ["sain"] },
                { nom: "Entrecôte grillée", description: "Frites maison, sauce au poivre.", prix: "24,00 €", badges: ["grille"] },
              ],
            },
          ],
        },
        {
          nom: "Boissons",
          rubriques: [
            {
              nom: "Vins & Sans alcool",
              fiches: [
                { nom: "Blanc sec de Loire", description: "Verre 12 cl.", prix: "5,50 €", badges: [] },
                { nom: "Limonade artisanale", description: "Citron bio, gingembre frais.", prix: "4,50 €", badges: ["fait_maison"] },
              ],
            },
          ],
        },
      ],
    },
    bar: {
      key: "bar",
      label: "Bar, café",
      icon: "🍹",
      primary: "#B4762A",
      secondary: "#F2F1EE",
      heading: "impact",
      body: "sans",
      defaultNom: "Le Comptoir Doré",
      defaultAccroche: "Cocktails signatures, bières artisanales & planches à partager.",
      defaultHistoire: "Un lieu vivant du café du matin jusqu'au dernier verre entre amis.",
      defaultBadge: "Ouvert · 17h–01h",
      motCartes: "Nos cartes",
      cartes: [
        {
          nom: "Cocktails",
          rubriques: [
            {
              nom: "Nos signatures",
              fiches: [
                { nom: "Spritz maison", description: "Amer artisanal, bulles, orange sanguine.", prix: "9,00 €", badges: ["nouveau"] },
                { nom: "Basil Smash", description: "Gin, basilic frais, citron vert.", prix: "11,00 €", badges: ["fait_maison"] },
                { nom: "Virgin Mojito", description: "Menthe fraîche, citron vert, sucre de canne.", prix: "7,00 €", badges: ["sain"] },
              ],
            },
          ],
        },
        {
          nom: "À grignoter",
          rubriques: [
            {
              nom: "Planches",
              fiches: [
                { nom: "Planche mixte", description: "Charcuterie et fromages affinés.", prix: "16,00 €", badges: ["traditionnel"] },
                { nom: "Planche végétarienne", description: "Légumes grillés, houmous maison.", prix: "13,00 €", badges: ["vegetarien", "fait_maison"] },
              ],
            },
          ],
        },
      ],
    },
    coiffeur: {
      key: "coiffeur",
      label: "Coiffeur, barbier",
      icon: "✂️",
      primary: "#7A1F2B",
      secondary: "#FDFBF6",
      heading: "modern",
      body: "sans",
      defaultNom: "Atelier Ciseaux & Style",
      defaultAccroche: "Coupes sur mesure, colorations végétales & taille de barbe.",
      defaultHistoire: "Une équipe passionnée qui prend le temps de vous conseiller selon la nature de vos cheveux.",
      defaultBadge: "Ouvert du mardi au samedi · 9h30–19h",
      motCartes: "Nos prestations",
      cartes: [
        {
          nom: "Coupes",
          rubriques: [
            {
              nom: "Femme & Homme",
              fiches: [
                { nom: "Coupe et brushing", description: "Shampoing, coupe personnalisée, coiffage.", prix: "45,00 €", badges: [] },
                { nom: "Coupe et barbe", description: "Taille et contour au rasoir, serviette chaude.", prix: "34,00 €", badges: ["traditionnel"] },
                { nom: "Coupe classique", description: "Ciseaux et tondeuse.", prix: "24,00 €", badges: [] },
              ],
            },
          ],
        },
        {
          nom: "Couleurs et soins",
          rubriques: [
            {
              nom: "Couleur & Soin",
              fiches: [
                { nom: "Balayage signature", description: "Éclaircissement progressif naturel.", prix: "85,00 €", badges: ["nouveau"] },
                { nom: "Soin profond", description: "Masque et massage du cuir chevelu.", prix: "22,00 €", badges: ["sain"] },
              ],
            },
          ],
        },
      ],
    },
    fleuriste: {
      key: "fleuriste",
      label: "Fleuriste",
      icon: "💐",
      primary: "#1F4B3F",
      secondary: "#EFF2EA",
      heading: "elegant",
      body: "sans",
      defaultNom: "Maison Botanique",
      defaultAccroche: "Bouquets de saison, fleurs séchées & plantes d'intérieur.",
      defaultHistoire: "Nous composons chaque bouquet à la main avec des fleurs fraîches choisies chaque matin.",
      defaultBadge: "Ouvert · 9h–19h30",
      motCartes: "Nos créations",
      cartes: [
        {
          nom: "Bouquets",
          rubriques: [
            {
              nom: "De saison",
              fiches: [
                { nom: "Bouquet du marché", description: "Composé le matin même selon l'arrivage.", prix: "25,00 €", badges: ["nouveau"] },
                { nom: "Brassée champêtre", description: "Fleurs des champs, ton clair.", prix: "35,00 €", badges: ["fait_maison"] },
                { nom: "Bouquet rond pastel", description: "Roses et renoncules.", prix: "45,00 €", badges: [] },
              ],
            },
          ],
        },
        {
          nom: "Plantes et objets",
          rubriques: [
            {
              nom: "Plantes d'intérieur",
              fiches: [
                { nom: "Monstera", description: "Pot en terre cuite compris.", prix: "32,00 €", badges: [] },
                { nom: "Orchidée blanche", description: "Deux tiges fleuries.", prix: "28,00 €", badges: [] },
              ],
            },
          ],
        },
      ],
    },
    hotel: {
      key: "hotel",
      label: "Hôtel, chambres d'hôtes",
      icon: "🛎️",
      primary: "#1B3A5C",
      secondary: "#FDFBF6",
      heading: "elegant",
      body: "sans",
      defaultNom: "Hôtel Le Pavillon Bleu",
      defaultAccroche: "Chambres de charme, petit-déjeuner gourmand & conciergerie.",
      defaultHistoire: "Au cœur du quartier historique, profitez d'un séjour paisible et d'un accueil personnalisé.",
      defaultBadge: "Réception 24h/24",
      motCartes: "Nos chambres & services",
      cartes: [
        {
          nom: "Chambres",
          rubriques: [
            {
              nom: "Nos catégories",
              fiches: [
                { nom: "Chambre Classique", description: "Lit Queen size, vue cour intérieure calme.", prix: "110 € / nuit", badges: [] },
                { nom: "Suite Terrasse", description: "Salon privé et terrasse ensoleillée.", prix: "185 € / nuit", badges: ["nouveau"] },
              ],
            },
          ],
        },
        {
          nom: "Services & Petit-déjeuner",
          rubriques: [
            {
              nom: "Gourmandises",
              fiches: [
                { nom: "Buffet Petit-déjeuner", description: "Viennoiseries artisanales, jus pressés, œufs bio.", prix: "16,00 €", badges: ["fait_maison"] },
              ],
            },
          ],
        },
      ],
    },
    spa: {
      key: "spa",
      label: "Spa, institut",
      icon: "🧖‍♀️",
      primary: "#1F4B3F",
      secondary: "#F8EFEA",
      heading: "elegant",
      body: "rounded",
      defaultNom: "L'Instant Sérénité Spa",
      defaultAccroche: "Massages du monde, soins visage & parenthèse bien-être.",
      defaultHistoire: "Un cocon apaisant dédié à la détente du corps et de l'esprit.",
      defaultBadge: "Sur rendez-vous · 10h–20h",
      motCartes: "Nos soins",
      cartes: [
        {
          nom: "Soins & Massages",
          rubriques: [
            {
              nom: "Rituels Corps",
              fiches: [
                { nom: "Massage Californien (1h)", description: "Huiles chaudes bio, détente profonde.", prix: "75,00 €", badges: ["sain"] },
                { nom: "Soin Visage Éclat (45 min)", description: "Nettoyage doux, masque hydratant et modelage.", prix: "58,00 €", badges: ["nouveau"] },
              ],
            },
          ],
        },
      ],
    },
    commerce: {
      key: "commerce",
      label: "Autre commerce",
      icon: "🏪",
      primary: "#7D3C11",
      secondary: "#FAF6EC",
      heading: "elegant",
      body: "sans",
      defaultNom: "La Boutique du Quartier",
      defaultAccroche: "Sélection coup de cœur, conseils personnalisés & nouveautés chaque semaine.",
      defaultHistoire: "Nous sélectionnons avec soin des produits durables et originaux pour le quotidien.",
      defaultBadge: "Ouvert du mardi au samedi · 10h–19h",
      motCartes: "Notre catalogue",
      cartes: [
        {
          nom: "Sélection du moment",
          rubriques: [
            {
              nom: "Nouveautés",
              fiches: [
                { nom: "Coffret Découverte", description: "Idée cadeau prête à offrir, emballage soigné.", prix: "29,00 €", badges: ["nouveau"] },
                { nom: "Création Artisanale", description: "Série limitée fabriquée en atelier.", prix: "42,00 €", badges: ["fait_maison"] },
              ],
            },
          ],
        },
      ],
    },
  };

  const VITRINE_BADGES_FR = {
    vegetarien: "🥗 Végétarien",
    vegan: "🌱 Vegan",
    epice: "🌶️ Épicé",
    traditionnel: "🍲 Traditionnel",
    sain: "🍃 Sain",
    grille: "🔥 Grillé",
    nouveau: "✨ Nouveau",
    fait_maison: "🏠 Fait maison",
  };

  /* ── 6. PRONOSTICS : COMPÉTITIONS & 11 MODÈLES D'ÉVÉNEMENT (src/lib/competitions.ts & contest-event-kinds.ts) ── */
  const COMPETITIONS = [
    {
      key: "ldc",
      label: "Ligue des champions",
      sport: "Football",
      icon: "⭐",
      scoreLabel: "buts",
      matches: [
        { t1: "Paris Saint-Germain", flag1: "🔵🔴", s1: 2, t2: "Real Madrid", flag2: "👑⚪", s2: 1 },
        { t1: "FC Barcelone", flag1: "🔵🔴", s1: 2, t2: "Bayern Munich", flag2: "🔴⚪", s2: 2 },
      ],
    },
    {
      key: "ligue1",
      label: "Ligue 1 (34 journées)",
      sport: "Football",
      icon: "🇫🇷",
      scoreLabel: "buts",
      matches: [
        { t1: "Olympique de Marseille", flag1: "⚪🔵", s1: 2, t2: "AS Monaco", flag2: "🔴⚪", s2: 1 },
        { t1: "LOSC Lille", flag1: "🔴⚪", s1: 1, t2: "Olympique Lyonnais", flag2: "🔵🔴", s2: 1 },
      ],
    },
    {
      key: "cdm-foot",
      label: "Coupe du monde de football",
      sport: "Football",
      icon: "⚽",
      scoreLabel: "buts",
      matches: [
        { t1: "France", flag1: "🇫🇷", s1: 2, t2: "Brésil", flag2: "🇧🇷", s2: 1 },
        { t1: "Espagne", flag1: "🇪🇸", s1: 1, t2: "Argentine", flag2: "🇦🇷", s2: 1 },
      ],
    },
    {
      key: "six-nations",
      label: "Tournoi des 6 Nations",
      sport: "Rugby",
      icon: "🏉",
      scoreLabel: "points",
      matches: [
        { t1: "France", flag1: "🇫🇷", s1: 27, t2: "Angleterre", flag2: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", s2: 21 },
        { t1: "Irlande", flag1: "🇮🇪", s1: 24, t2: "Écosse", flag2: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", s2: 18 },
      ],
    },
    {
      key: "top14",
      label: "Top 14 Rugby",
      sport: "Rugby",
      icon: "🏉",
      scoreLabel: "points",
      matches: [
        { t1: "Stade Toulousain", flag1: "🔴⚫", s1: 28, t2: "Bordeaux-Bègles", flag2: "🍷⚪", s2: 22 },
        { t1: "Stade Rochelais", flag1: "🟡⚫", s1: 23, t2: "RC Toulon", flag2: "🔴⚫", s2: 19 },
      ],
    },
    {
      key: "roland-garros",
      label: "Roland-Garros",
      sport: "Tennis",
      icon: "🎾",
      scoreLabel: "sets",
      matches: [
        { t1: "Carlos Alcaraz", flag1: "🇪🇸", s1: 3, t2: "Jannik Sinner", flag2: "🇮🇹", s2: 2 },
        { t1: "Arthur Fils", flag1: "🇫🇷", s1: 3, t2: "Alexander Zverev", flag2: "🇩🇪", s2: 1 },
      ],
    },
  ];

  const EVENT_KINDS = [
    { key: "football", label: "Sport (Calendrier officiel)", icon: "🏅", usesCompetition: true, hint: "Football, rugby, tennis… Matchs à pronostiquer sur le score." },
    { key: "ceremony", label: "Cérémonie (César, Oscars…)", icon: "🏆", usesCompetition: false, hint: "Vos clients parient sur les lauréats d'une grande cérémonie.", prompt: "Qui remporte le prix principal ?" },
    { key: "eurovision", label: "Eurovision", icon: "🎤", usesCompetition: false, hint: "Soirée Eurovision : le pays vainqueur et le score final.", prompt: "Quel pays remporte l'Eurovision ?" },
    { key: "emission", label: "Finale d'une émission (Top Chef…)", icon: "📺", usesCompetition: false, hint: "Finale d'une émission TV : le gagnant et l'audience.", prompt: "Qui remporte la grande finale ?" },
    { key: "culinaire", label: "Concours culinaire", icon: "🍽️", usesCompetition: false, hint: "Concours de cuisine : le meilleur plat et la note du vainqueur.", prompt: "Quel plat remporte le concours ?" },
    { key: "tournoi", label: "Tournoi local / E-sport", icon: "🏓", usesCompetition: false, hint: "Tournoi du quartier, club ou compétition E-sport.", prompt: "Quel sera le podium du tournoi ?" },
    { key: "entreprise", label: "Compétition d'entreprise", icon: "🏢", usesCompetition: false, hint: "Challenge entre équipes ou services : podium final.", prompt: "Quelle équipe remporte l'épreuve reine ?" },
    { key: "course", label: "Course", icon: "🏁", usesCompetition: false, hint: "Résultat d'une course : l'ordre d'arrivée sur le podium.", prompt: "Qui franchit la ligne d'arrivée en premier ?" },
    { key: "remise_prix", label: "Remise de prix", icon: "🎖️", usesCompetition: false, hint: "Vos clients désignent le lauréat avant l'annonce.", prompt: "Qui reçoit le prix du public ?" },
    { key: "election", label: "Élection associative / locale", icon: "🗳️", usesCompetition: false, hint: "Qui sera élu et avec quelle participation.", prompt: "Qui sera élu ?" },
  ];

  /* ── 7. GESTIONNAIRE DE CACHE LOCAL & TUNNEL DE CONVERSION (canExplore / canEditDraft / canPublish) ── */
  const STORAGE_KEY_DRAFTS = "lc_studio_drafts_v1";
  const STORAGE_KEY_AUTH = "lc_studio_auth_v1";

  const DEFAULT_DRAFTS = {
    updatedAt: null,
    lastModule: "vitrine",
    vitrine: {
      secteur: "restaurant",
      nom: "Bistrot L'Étoile",
      slug: "bistrot-letoile",
      accroche: "Cuisine de marché, produits frais & vins de vignerons.",
      histoire: "Chaque matin, notre brigade compose l'ardoise au gré des arrivages de nos producteurs locaux.",
      badge: "Ouvert · 12h–14h30 & 19h–22h30",
      horairesTexte: "Mardi au Samedi : 12h00–14h30 et 19h00–22h30. Fermé dimanche soir et lundi.",
      exemplesActifs: true,
      primary: "#7D3C11",
      secondary: "#FAF6EC",
      heading: "elegant",
      body: "sans",
      styleCartes: "liste",
      motif: "diagonales",
      densite: "standard",
      styleFiche: "ombre",
      stylePrix: "accent",
      styleOnglets: "segmentes",
      barreBasse: "flottante",
      rayon: 13,
      blocs: ["accroche", "histoire", "cartes", "horaires", "reserver", "experiences"],
      jeux: { duo: true, bande: false, quiz: true, calendars: false, pronostics: true, loyalty: true },
      customFiches: [
        { nom: "Formule Déjeuner du Marché", description: "Entrée + Plat ou Plat + Dessert, produits frais du jour.", prix: "19,00 €", badge: "fait_maison", action: "reserver" },
      ],
    },
    roue: {
      name: "Jeu Instantané de Bienvenue",
      gameType: "wheel",
      playLimit: "daily",
      preset: "kermesse",
      pageTheme: "kermesse",
      fond: "festival",
      ring: "classic",
      ringColor: "#fcca59",
      pointer: "triangle",
      pointerColor: "#f5793b",
      buttonFrom: "#f5793b",
      buttonTo: "#fcca59",
      bgFrom: "#4a4238",
      bgTo: "#211d16",
      slotSymbols: "fruits",
      objectColor: "#fcca59",
      codeTtlDays: 14,
      requireEmail: true,
      lots: [
        { label: "-15 % sur votre visite", weight: 35, stock: 50, isWinning: true, color: "#fcca59" },
        { label: "Café ou Douceur offerte", weight: 30, stock: 40, isWinning: true, color: "#f296bd" },
        { label: "Cadeau Découverte VIP", weight: 15, stock: 15, isWinning: true, color: "#99b7f5" },
        { label: "Perdu · Retentez demain !", weight: 20, stock: 999, isWinning: false, color: "#f3ead3" },
      ],
    },
    pronostics: {
      title: "Le Grand Concours des Habitués",
      eventKind: "football",
      competition: "ldc",
      theme: "football",
      fond: "football",
      exactScorePts: 10,
      winnerPts: 5,
      subsidiaryQuestion: "Combien de buts seront marqués au total sur cette journée ?",
      rankPrizes: [
        { rank: "🥇 1er du classement", reward: "Table VIP ou Bon d'achat de 50 €" },
        { rank: "🥈 2e du classement", reward: "Coffret Découverte (valeur 25 €)" },
        { rank: "🥉 3e du classement", reward: "Remise privilège de -20 %" },
      ],
    },
    fidelite: {
      name: "Passeport des Habitués",
      validationMode: "rotating_code",
      rotatingPeriodSeconds: 60,
      cooldownSeconds: 3600,
      fond: "prairie",
      silverPoints: 500,
      goldPoints: 1500,
      linkJackpot: true,
      jackpotName: "Cagnotte Collective du Mois (Objectif 100 passages)",
      enableReferral: true,
      referralFriendReward: "-10 % de bienvenue dès la 1re visite",
      referralSponsorReward: "+200 points fidélité (2 visites offertes)",
      milestones: [
        { costPoints: 300, label: "Douceur ou Boisson au choix (3 visites)", stock: 50 },
        { costPoints: 500, label: "Remise Privilège -20 % (5 visites · Palier Argent)", stock: 50 },
        { costPoints: 1000, label: "Cadeau Signature VIP (10 visites)", stock: 50 },
      ],
    },
  };

  const DEFAULT_AUTH = {
    status: "guest", // "guest" | "free_account" | "subscribed"
    email: "",
    orgName: "",
    planKey: "sur_place",
    publishedModules: {},
  };

  function loadDrafts() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY_DRAFTS);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_DRAFTS));
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_DRAFTS,
        ...parsed,
        vitrine: { ...DEFAULT_DRAFTS.vitrine, ...(parsed.vitrine || {}) },
        roue: { ...DEFAULT_DRAFTS.roue, ...(parsed.roue || {}) },
        pronostics: { ...DEFAULT_DRAFTS.pronostics, ...(parsed.pronostics || {}) },
        fidelite: { ...DEFAULT_DRAFTS.fidelite, ...(parsed.fidelite || {}) },
      };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_DRAFTS));
    }
  }

  function saveDrafts(drafts) {
    try {
      drafts.updatedAt = new Date().toISOString();
      global.localStorage.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(drafts));
    } catch {
      // Ignore storage quota errors
    }
    return drafts;
  }

  function hasCustomDraft() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY_DRAFTS);
      return Boolean(raw);
    } catch {
      return false;
    }
  }

  function loadAuth() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY_AUTH);
      if (!raw) return { ...DEFAULT_AUTH };
      return { ...DEFAULT_AUTH, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_AUTH };
    }
  }

  function saveAuth(auth) {
    try {
      global.localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(auth));
    } catch {
      // Ignore
    }
    return auth;
  }

  /**
   * Miroir de `capacitesModule` (src/lib/module-capabilities.ts) :
   * - canExplore : toujours true
   * - canEditDraft : true (1 brouillon gratuit mémorisé en cache ou sur le compte)
   * - canPublish : true uniquement lorsque `auth.status === "subscribed"`
   */
  function getModuleCapabilities(moduleKey) {
    const auth = loadAuth();
    const isSubscribed = auth.status === "subscribed";
    const isAccount = auth.status === "free_account" || isSubscribed;
    return {
      canExplore: true,
      canEditDraft: true,
      canPublish: isSubscribed,
      isAccount,
      auth,
    };
  }

  global.LC_CODEBASE = {
    FOND_KEYS,
    FOND_LABELS,
    LAVIS_SAISON,
    WHEEL_PRESETS_AMBIANCE,
    WHEEL_PRESETS_UNIVERS,
    WHEEL_PRESETS,
    SLOT_SYMBOL_SETS,
    INSTANT_MECHANICS,
    VITRINE_SECTEURS,
    VITRINE_BADGES_FR,
    COMPETITIONS,
    EVENT_KINDS,
    DEFAULT_DRAFTS,
    loadDrafts,
    saveDrafts,
    hasCustomDraft,
    loadAuth,
    saveAuth,
    getModuleCapabilities,
  };
})(window);
