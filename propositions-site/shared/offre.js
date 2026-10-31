/*
 * OFFRE LASTCHANCE — source unique des deux maquettes.
 *
 * Instantané de `src/lib/plans.ts` (PACKAGING_VERSION "2026-09-a") et de
 * `src/platform/experiences/catalog.ts`, relevé le 2026-10-22.
 *
 * Aucun prix n'est écrit dans le HTML des maquettes : tout est rendu depuis
 * ce fichier. À l'intégration dans l'app Next, ce fichier DISPARAÎT au profit
 * d'un import direct de `PLAN_TIERS` / `ADDON_OFFERS` / `EXPERIENCE_CATALOG`
 * (règle 7 du brief frontend : jamais de seconde source de vérité).
 */
window.LC_OFFRE = (function () {
  const MODULES = {
    core: { label: "15 mini-jeux", desc: "Roue, grattage et mini-jeux pour acquérir et convertir.", objectif: "Acquérir" },
    referral: { label: "Parrainage", desc: "Transformez vos clients en ambassadeurs avec des paliers.", objectif: "Acquérir" },
    loyalty: { label: "Passeport fidélité", desc: "Récompensez les visites répétées et les habitudes durables.", objectif: "Fidéliser" },
    calendar: { label: "Calendrier surprise", desc: "Créez un rendez-vous quotidien et une récompense d'assiduité.", objectif: "Fidéliser" },
    events: { label: "Écran géant live", desc: "Animez une salle en temps réel avec écran et téléphones.", objectif: "Animer en direct" },
    pronostics: { label: "Pronostics", desc: "Faites vivre les matchs de la saison avant, pendant et après.", objectif: "Animer en direct" },
    jackpot: { label: "Jackpot collectif", desc: "Fédérez les participants autour d'une jauge et d'un tirage.", objectif: "Animer en direct" },
    quiz: { label: "Quiz", desc: "Composez un parcours de questions, autonome ou animé.", objectif: "Animer en direct" },
    hunts: { label: "Chasse au QR", desc: "Reliez plusieurs lieux et faites progresser le trafic physique.", objectif: "Créer du trafic" },
    duo: { label: "Duo Miroir", desc: "Un jeu à deux, jouable à table.", objectif: "Animer en direct" },
    bande: { label: "Portrait de la Bande", desc: "Un jeu de groupe, jouable à table.", objectif: "Animer en direct" },
    vitrine: { label: "Vitrine QR bilingue", desc: "Votre carte publique bilingue, au QR code.", objectif: "Se faire lire" },
    reserver: { label: "Moments & Ateliers", desc: "Ateliers, dégustations, invitations, offres de dernière minute.", objectif: "Se faire réserver" },
    rendez_vous: { label: "Prise de RDV", desc: "Prise de rendez-vous : créneaux, agenda, ajout au calendrier du client.", objectif: "Se faire réserver" },
  };

  // Ordre = ordre de prix croissant (PLAN_TIERS).
  const FORMULES = [
    {
      id: "core", nom: "Coup d'envoi", prix: 29, essai: 7, jauge: 100,
      promesse: "Lancer une animation",
      tagline: "Lancer une animation : le jeu qui fait revenir vos clients, en libre-service.",
      droits: ["core", "duo", "bande"],
      points: [
        "15 mini-jeux et QR codes illimités",
        "Duo Miroir et Portrait de la Bande, jouables à table",
        "Lots remis en caisse avec code sécurisé",
        "Studio créatif et affiches prêtes à imprimer",
        "Emails automatiques et relances clients",
      ],
    },
    {
      id: "engagement", nom: "Le Club", prix: 59, essai: 7, jauge: 100,
      promesse: "Fidéliser",
      tagline: "Fidéliser : installer l'habitude — fidélité, rendez-vous, bouche-à-oreille.",
      droits: ["core", "duo", "bande", "loyalty", "calendar", "referral", "hunts", "quiz"],
      points: [
        "Passeport fidélité digital (tampons & récompenses)",
        "Calendrier surprise (cadeaux & rendez-vous quotidien)",
        "Programme de parrainage (ambassadeurs & bouche-à-oreille)",
        "Quiz interactifs & Chasse au QR code",
        "Tout Coup d'envoi inclus (15 mini-jeux & scans illimités)",
      ],
    },
    {
      id: "place", nom: "Sur Place", prix: 79, essai: 7, jauge: 100,
      promesse: "Se faire lire et réserver",
      tagline: "Se faire lire et réserver : votre carte au QR code et votre agenda, dans un seul abonnement.",
      droits: ["core", "duo", "bande", "vitrine", "reserver", "rendez_vous", "quiz"],
      points: [
        "Prise de rendez-vous en ligne (agenda & créneaux)",
        "Moments & ateliers (réservations & offres spéciales)",
        "Vitrine & carte numérique au QR code (bilingue)",
        "Quiz & animations à table (Duo Miroir, Portrait)",
        "Tout Coup d'envoi inclus (15 mini-jeux & scans illimités)",
      ],
    },
    {
      id: "live", nom: "Le Grand Jeu", prix: 89, essai: 7, jauge: 250,
      promesse: "Animer régulièrement",
      tagline: "Animer régulièrement : soirées, compétitions, temps réel dans votre salle.",
      droits: ["core", "duo", "bande", "events", "pronostics", "jackpot", "quiz"],
      points: [
        "Écran géant live (250 joueurs simultanés en salle)",
        "Pronostics sportifs & de match avant/pendant/après",
        "Jackpot collectif avec jauge commune et tirage",
        "Quiz de salle en direct avec télécommande animateur",
        "Tout Coup d'envoi inclus (15 mini-jeux & scans illimités)",
      ],
    },
    {
      id: "full", nom: "La Totale", prix: 129, essai: 7, jauge: 250,
      promesse: "Réunir toutes les briques",
      tagline: "Réunir toutes les briques : toute la plateforme, sans arbitrage entre modules.",
      droits: ["core", "duo", "bande", "pronostics", "hunts", "loyalty", "jackpot", "events", "calendar", "quiz", "referral", "vitrine", "reserver", "rendez_vous"],
      points: [
        "Le Club + Sur Place + Le Grand Jeu réunis",
        "Passeport fidélité, Parrainage & Calendrier surprise",
        "Agenda de rendez-vous, Réservations & Vitrine QR",
        "Grand écran de salle (250 pers.), Pronostics & Jackpot",
        "Accès à tout nouveau module et mini-jeu inclus",
      ],
    },
  ];

  const OPTIONS = {
    // Lignes ajoutées à un abonnement en cours (soldStandalone: false).
    ligneAbonnement: [
      { id: "vitrine", nom: "Vitrine", prix: 20, regle: "S'ajoute à une offre en cours. Sans engagement." },
      { id: "reserver", nom: "Moments", prix: 20, regle: "S'ajoute à une offre en cours. Sans engagement." },
      { id: "rendez_vous", nom: "Réservation", prix: 20, regle: "S'ajoute à une offre en cours. Sans engagement." },
    ],
    // Mensuelles, achetables sans abonnement.
    mensuelles: [
      { id: "loyalty", nom: "Passeport des habitués", prix: 19, regle: "Récurrent, sans engagement." },
      { id: "referral", nom: "Bouche-à-oreille / Parrainage", prix: 12, regle: "Récurrent, sans engagement." },
      { id: "duo", nom: "Duo Miroir", prix: 12, regle: "Déjà compris dans les cinq offres : ne s'achète que sans abonnement." },
      { id: "bande", nom: "Portrait de la Bande", prix: 12, regle: "Déjà compris dans les cinq offres : ne s'achète que sans abonnement." },
    ],
    // Achats uniques.
    ponctuelles: [
      { id: "hunts", nom: "Chasse au QR", prix: 29, duree: "30 jours d'usage", regle: "Activable dans les 90 jours suivant l'achat." },
      { id: "calendar", nom: "Calendrier à surprises", prix: 29, duree: "1 campagne, 31 jours max.", regle: "Activable dans les 90 jours suivant l'achat." },
      { id: "quiz", nom: "Quiz express", prix: 15, duree: "7 jours d'usage", regle: "Activable dans les 90 jours suivant l'achat." },
      { id: "jackpot", nom: "Cagnotte collective", prix: 29, duree: "30 jours d'usage", regle: "Activable dans les 90 jours suivant l'achat." },
      { id: "pronostics", nom: "Saison de pronostics", prix: 39, duree: "1 compétition, jusqu'à 12 mois", regle: "Le droit court jusqu'à 7 jours après la finale." },
    ],
    soiree: {
      nom: "Soirée en jeu",
      regle: "Pass autonome : Coup d'envoi, Événements et Quiz inclus. 7 jours de préparation, puis 24 heures de jeu.",
      paliers: [
        { joueurs: 10, prix: 9 },
        { joueurs: 30, prix: 19 },
        { joueurs: 50, prix: 29 },
      ],
    },
  };

  const euro = (n) => `${n} €`;
  const label = (droit) => (MODULES[droit] ? MODULES[droit].label : droit);

  return { MODULES, FORMULES, OPTIONS, euro, label, version: "2026-09-a" };
})();
