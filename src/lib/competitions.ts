/**
 * Catalogue des compétitions du module Pronostics.
 *
 * Chaque compétition embarque ses participants (équipes ou joueurs)
 * avec leur « vignette » : drapeau emoji pour les nations et les
 * joueurs, initiales + couleur pour les clubs. Le commerçant compose
 * ses matchs en deux clics, sans rien saisir à la main.
 *
 * Focus France pour l'instant ; la compétition « Autre / Match isolé »
 * couvre déjà les demandes ponctuelles (boxe, match amical…) avec des
 * participants libres.
 */

export interface CompetitionEntry {
  key: string;
  name: string;
  /** Vignette : drapeau emoji (nations/joueurs) — vide pour les clubs. */
  flag?: string;
  /** Initiales de la vignette club. */
  short?: string;
  /** Couleur de la vignette club. */
  color?: string;
}

export interface Competition {
  key: string;
  label: string;
  sport: string;
  icon: string;
  /** teams : score de match (buts/points) — players : score en sets. */
  kind: "teams" | "players";
  /** Le match nul est-il possible ? (désactive l'aide « nul » sinon). */
  drawAllowed: boolean;
  /** Libellé du score pour guider la saisie. */
  scoreLabel: string;
  entries: CompetitionEntry[];
}

const nation = (key: string, name: string, flag: string): CompetitionEntry => ({ key, name, flag });
const club = (key: string, name: string, short: string, color: string): CompetitionEntry => ({ key, name, short, color });
const player = (key: string, name: string, flag: string): CompetitionEntry => ({ key, name, flag });

export const COMPETITIONS: Competition[] = [
  {
    key: "six-nations",
    label: "Tournoi des 6 Nations",
    sport: "Rugby",
    icon: "🏉",
    kind: "teams",
    drawAllowed: true,
    scoreLabel: "points",
    entries: [
      nation("fra", "France", "🇫🇷"),
      nation("eng", "Angleterre", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"),
      nation("irl", "Irlande", "🇮🇪"),
      nation("sco", "Écosse", "🏴󠁧󠁢󠁳󠁣󠁴󠁿"),
      nation("wal", "Pays de Galles", "🏴󠁧󠁢󠁷󠁬󠁳󠁿"),
      nation("ita", "Italie", "🇮🇹"),
    ],
  },
  {
    key: "cdm-foot",
    label: "Coupe du monde de football",
    sport: "Football",
    icon: "⚽",
    kind: "teams",
    drawAllowed: true,
    scoreLabel: "buts",
    entries: [
      nation("fra", "France", "🇫🇷"),
      nation("bra", "Brésil", "🇧🇷"),
      nation("arg", "Argentine", "🇦🇷"),
      nation("esp", "Espagne", "🇪🇸"),
      nation("eng", "Angleterre", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"),
      nation("ger", "Allemagne", "🇩🇪"),
      nation("por", "Portugal", "🇵🇹"),
      nation("ned", "Pays-Bas", "🇳🇱"),
      nation("bel", "Belgique", "🇧🇪"),
      nation("ita", "Italie", "🇮🇹"),
      nation("cro", "Croatie", "🇭🇷"),
      nation("uru", "Uruguay", "🇺🇾"),
      nation("col", "Colombie", "🇨🇴"),
      nation("mex", "Mexique", "🇲🇽"),
      nation("usa", "États-Unis", "🇺🇸"),
      nation("can", "Canada", "🇨🇦"),
      nation("jpn", "Japon", "🇯🇵"),
      nation("kor", "Corée du Sud", "🇰🇷"),
      nation("mar", "Maroc", "🇲🇦"),
      nation("sen", "Sénégal", "🇸🇳"),
      nation("civ", "Côte d'Ivoire", "🇨🇮"),
      nation("alg", "Algérie", "🇩🇿"),
      nation("tun", "Tunisie", "🇹🇳"),
      nation("egy", "Égypte", "🇪🇬"),
      nation("gha", "Ghana", "🇬🇭"),
      nation("cmr", "Cameroun", "🇨🇲"),
      nation("sui", "Suisse", "🇨🇭"),
      nation("aut", "Autriche", "🇦🇹"),
      nation("pol", "Pologne", "🇵🇱"),
      nation("den", "Danemark", "🇩🇰"),
      nation("nor", "Norvège", "🇳🇴"),
      nation("sco", "Écosse", "🏴󠁧󠁢󠁳󠁣󠁴󠁿"),
      nation("ecu", "Équateur", "🇪🇨"),
      nation("par", "Paraguay", "🇵🇾"),
      nation("aus", "Australie", "🇦🇺"),
      nation("ksa", "Arabie saoudite", "🇸🇦"),
    ],
  },
  {
    key: "euro-foot",
    label: "Championnat d'Europe de football",
    sport: "Football",
    icon: "🏆",
    kind: "teams",
    drawAllowed: true,
    scoreLabel: "buts",
    entries: [
      nation("fra", "France", "🇫🇷"),
      nation("esp", "Espagne", "🇪🇸"),
      nation("eng", "Angleterre", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"),
      nation("ger", "Allemagne", "🇩🇪"),
      nation("por", "Portugal", "🇵🇹"),
      nation("ita", "Italie", "🇮🇹"),
      nation("ned", "Pays-Bas", "🇳🇱"),
      nation("bel", "Belgique", "🇧🇪"),
      nation("cro", "Croatie", "🇭🇷"),
      nation("sui", "Suisse", "🇨🇭"),
      nation("aut", "Autriche", "🇦🇹"),
      nation("den", "Danemark", "🇩🇰"),
      nation("pol", "Pologne", "🇵🇱"),
      nation("tur", "Turquie", "🇹🇷"),
      nation("cze", "Tchéquie", "🇨🇿"),
      nation("srb", "Serbie", "🇷🇸"),
      nation("ukr", "Ukraine", "🇺🇦"),
      nation("hun", "Hongrie", "🇭🇺"),
      nation("sco", "Écosse", "🏴󠁧󠁢󠁳󠁣󠁴󠁿"),
      nation("slo", "Slovénie", "🇸🇮"),
      nation("rou", "Roumanie", "🇷🇴"),
      nation("geo", "Géorgie", "🇬🇪"),
      nation("alb", "Albanie", "🇦🇱"),
      nation("svk", "Slovaquie", "🇸🇰"),
    ],
  },
  {
    key: "cdm-rugby",
    label: "Coupe du monde de rugby",
    sport: "Rugby",
    icon: "🏉",
    kind: "teams",
    drawAllowed: true,
    scoreLabel: "points",
    entries: [
      nation("fra", "France", "🇫🇷"),
      nation("nzl", "Nouvelle-Zélande", "🇳🇿"),
      nation("rsa", "Afrique du Sud", "🇿🇦"),
      nation("irl", "Irlande", "🇮🇪"),
      nation("eng", "Angleterre", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"),
      nation("sco", "Écosse", "🏴󠁧󠁢󠁳󠁣󠁴󠁿"),
      nation("wal", "Pays de Galles", "🏴󠁧󠁢󠁷󠁬󠁳󠁿"),
      nation("ita", "Italie", "🇮🇹"),
      nation("arg", "Argentine", "🇦🇷"),
      nation("aus", "Australie", "🇦🇺"),
      nation("fij", "Fidji", "🇫🇯"),
      nation("jpn", "Japon", "🇯🇵"),
      nation("geo", "Géorgie", "🇬🇪"),
      nation("sam", "Samoa", "🇼🇸"),
      nation("ton", "Tonga", "🇹🇴"),
      nation("uru", "Uruguay", "🇺🇾"),
      nation("por", "Portugal", "🇵🇹"),
      nation("usa", "États-Unis", "🇺🇸"),
    ],
  },
  {
    key: "ligue1",
    label: "Ligue 1",
    sport: "Football",
    icon: "🇫🇷",
    kind: "teams",
    drawAllowed: true,
    scoreLabel: "buts",
    entries: [
      club("psg", "Paris Saint-Germain", "PSG", "#004170"),
      club("om", "Olympique de Marseille", "OM", "#00a1e0"),
      club("ol", "Olympique Lyonnais", "OL", "#d21f26"),
      club("asm", "AS Monaco", "ASM", "#e30613"),
      club("losc", "LOSC Lille", "LIL", "#dc0a12"),
      club("ogcn", "OGC Nice", "NIC", "#c8102e"),
      club("rcl", "RC Lens", "RCL", "#ffd400"),
      club("srfc", "Stade Rennais", "REN", "#e13327"),
      club("rcsa", "RC Strasbourg", "STR", "#00a1de"),
      club("tfc", "Toulouse FC", "TFC", "#6a2c91"),
      club("fcn", "FC Nantes", "NAN", "#fcd405"),
      club("sb29", "Stade Brestois", "BRE", "#e2001a"),
      club("hac", "Le Havre AC", "HAC", "#95c8f0"),
      club("aja", "AJ Auxerre", "AJA", "#003e7e"),
      club("sco", "Angers SCO", "ANG", "#000000"),
      club("fcm", "FC Metz", "MET", "#8b0304"),
      club("fcl", "FC Lorient", "LOR", "#f36f21"),
      club("pfc", "Paris FC", "PFC", "#00417a"),
    ],
  },
  {
    key: "ldc",
    label: "Ligue des champions",
    sport: "Football",
    icon: "⭐",
    kind: "teams",
    drawAllowed: true,
    scoreLabel: "buts",
    entries: [
      club("psg", "Paris Saint-Germain", "PSG", "#004170"),
      club("om", "Olympique de Marseille", "OM", "#00a1e0"),
      club("asm", "AS Monaco", "ASM", "#e30613"),
      club("rma", "Real Madrid", "RMA", "#febe10"),
      club("fcb", "FC Barcelone", "BAR", "#a50044"),
      club("atm", "Atlético de Madrid", "ATM", "#cb3524"),
      club("bay", "Bayern Munich", "BAY", "#dc052d"),
      club("bvb", "Borussia Dortmund", "BVB", "#fde100"),
      club("b04", "Bayer Leverkusen", "LEV", "#e32221"),
      club("mci", "Manchester City", "MCI", "#6cabdd"),
      club("ars", "Arsenal", "ARS", "#ef0107"),
      club("liv", "Liverpool", "LIV", "#c8102e"),
      club("che", "Chelsea", "CHE", "#034694"),
      club("tot", "Tottenham", "TOT", "#132257"),
      club("new", "Newcastle", "NEW", "#241f20"),
      club("int", "Inter Milan", "INT", "#0068a8"),
      club("acm", "AC Milan", "MIL", "#fb090b"),
      club("juv", "Juventus", "JUV", "#000000"),
      club("nap", "Naples", "NAP", "#12a0d7"),
      club("ata", "Atalanta", "ATA", "#1e71b8"),
      club("ben", "Benfica", "BEN", "#e83030"),
      club("por", "FC Porto", "POR", "#00428c"),
      club("spo", "Sporting", "SPO", "#008057"),
      club("aja", "Ajax", "AJX", "#d2122e"),
      club("psv", "PSV Eindhoven", "PSV", "#ed1c24"),
    ],
  },
  {
    key: "roland-garros",
    label: "Roland-Garros",
    sport: "Tennis",
    icon: "🎾",
    kind: "players",
    drawAllowed: false,
    scoreLabel: "sets",
    entries: [
      player("sinner", "Jannik Sinner", "🇮🇹"),
      player("alcaraz", "Carlos Alcaraz", "🇪🇸"),
      player("djokovic", "Novak Djokovic", "🇷🇸"),
      player("zverev", "Alexander Zverev", "🇩🇪"),
      player("fritz", "Taylor Fritz", "🇺🇸"),
      player("draper", "Jack Draper", "🇬🇧"),
      player("musetti", "Lorenzo Musetti", "🇮🇹"),
      player("rune", "Holger Rune", "🇩🇰"),
      player("ruud", "Casper Ruud", "🇳🇴"),
      player("deminaur", "Alex de Minaur", "🇦🇺"),
      player("tsitsipas", "Stefanos Tsitsipas", "🇬🇷"),
      player("fils", "Arthur Fils", "🇫🇷"),
      player("humbert", "Ugo Humbert", "🇫🇷"),
      player("moutet", "Corentin Moutet", "🇫🇷"),
      player("rinderknech", "Arthur Rinderknech", "🇫🇷"),
      player("sabalenka", "Aryna Sabalenka", "🏳️"),
      player("swiatek", "Iga Świątek", "🇵🇱"),
      player("gauff", "Coco Gauff", "🇺🇸"),
      player("rybakina", "Elena Rybakina", "🇰🇿"),
      player("pegula", "Jessica Pegula", "🇺🇸"),
      player("paolini", "Jasmine Paolini", "🇮🇹"),
      player("badosa", "Paula Badosa", "🇪🇸"),
      player("garcia", "Caroline Garcia", "🇫🇷"),
      player("boisson", "Loïs Boisson", "🇫🇷"),
    ],
  },
  {
    key: "custom",
    label: "Autre / Match isolé",
    sport: "Tous sports",
    icon: "✨",
    kind: "teams",
    drawAllowed: true,
    scoreLabel: "points",
    entries: [],
  },
];

export function getCompetition(key: string): Competition | undefined {
  return COMPETITIONS.find((c) => c.key === key);
}

export function getEntry(
  competition: Competition,
  entryKey: string,
): CompetitionEntry | undefined {
  return competition.entries.find((e) => e.key === entryKey);
}
