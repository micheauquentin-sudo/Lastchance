/**
 * Ce qu'un opérateur doit avoir sous les yeux avant de déposer une déclaration
 * d'expéditeur SMS au registre AF2M.
 *
 * POURQUOI CE MODULE EXISTE. Un propriétaire saisit librement onze caractères
 * A-Z0-9 : rien, dans le produit, n'empêche de demander `COLISSIMO`, `AMELI`
 * ou `MONBANQUE`. Le seul rempart est l'œil de l'opérateur au moment de
 * déposer la déclaration — encore faut-il qu'il ait sous les yeux ce qu'il
 * doit comparer.
 *
 * ⚠️ CE QUE `measureSenderLikeness` NE FAIT PAS, ET QU'ELLE A PRÉTENDU FAIRE.
 * Cet en-tête annonçait qu'elle attrapait les noms empruntés à un tiers, et le
 * cas nommé était `MONBANQUE`. C'est FAUX, mesuré par la contre-revue : les
 * DEUX valeurs comparées — `organizations.name` et l'identifiant demandé —
 * sont saisies par le même commerçant, la seconde des semaines après la
 * première. Celui qui veut `MONBANQUE` s'inscrit sous « Mon Banque » et
 * obtient un score de 1,0 : le bandeau ne s'allume JAMAIS pour le cas qu'il
 * prétendait couvrir. Une mesure qui compare deux champs libres du même
 * auteur ne détecte pas une intention, elle détecte une INCOHÉRENCE — un
 * commerçant qui se contredit lui-même.
 *
 * CE QUE LA MESURE FAIT VRAIMENT, et c'est tout ce qu'on lui demande
 * désormais : repérer un écart grossier entre les deux valeurs, pour que
 * l'opérateur les lise côte à côte plutôt que de faire défiler une liste. Le
 * rempart reste son œil ; le rôle de l'écran est de lui MONTRER ce qu'il doit
 * comparer, pas de lui donner un score qui l'invite à ne plus regarder.
 *
 * ON N'EMPILE PAS D'HEURISTIQUES POUR SAUVER LA PRÉTENTION. Aucune mesure de
 * ressemblance ne peut trancher entre « Mon Banque, salon de coiffure » et une
 * usurpation : l'information manquante n'est pas dans les chaînes. Ce qui
 * attrape le cas nommé est une LISTE (`matchesNotoriousSender` ci-dessous),
 * parce qu'elle porte le fait extérieur que la mesure n'a pas — que ces noms
 * appartiennent déjà à quelqu'un.
 *
 * CE MODULE NE REFUSE RIEN, ET NE DOIT JAMAIS LE FAIRE. « Le Petit Jardin »
 * peut légitimement demander `LEPTJARDIN`, et une enseigne peut porter un nom
 * d'usage absent de sa raison sociale. Un refus automatique bloquerait des
 * demandes valides. Les deux signaux sont destinés à un humain, pas à une
 * garde.
 *
 * Il vit ici et non dans le composant : le motif d'origine — « ce dépôt n'a
 * pas d'environnement de rendu React » — a cessé d'être vrai le 2026-08-04,
 * mais une comparaison de chaînes se teste sur ses entrées et n'a aucune
 * raison d'exiger le montage d'un écran pour être vérifiée.
 */

/** Le seuil au-delà duquel on n'attire plus l'attention de l'opérateur. */
export const SMS_SENDER_LIKENESS_THRESHOLD = 0.7;

export interface SmsSenderLikeness {
  /** Part des caractères de l'identifiant retrouvés, dans l'ordre, dans le nom. */
  score: number;
  /** `false` = à regarder de près. Jamais « à refuser ». */
  resembles: boolean;
  /** Le nom commercial réduit au même alphabet que l'identifiant. */
  normalizedName: string;
}

/** Marques diacritiques combinantes, isolées par la normalisation NFD. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Réduit une chaîne à l'alphabet d'un expéditeur alphanumérique : majuscules
 * non accentuées et chiffres. « Café Déjà-Vu » devient `CAFEDEJAVU`.
 */
export function normalizeForSenderComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Mesure retenue : la plus longue sous-séquence commune, rapportée à la
 * LONGUEUR DE L'IDENTIFIANT.
 *
 * Elle répond exactement à la question de l'opérateur — « cet identifiant
 * est-il fait des lettres du nom commercial, dans leur ordre ? » — et couvre
 * du même coup les deux façons légitimes d'abréger : la contraction
 * (`LEPTJARDIN` dans `LEPETITJARDIN`) et l'acronyme (`LPJ`).
 *
 * Elle ne tombe bas sur `AMELI` ou `COLISSIMO` que si le nom commercial
 * enregistré, lui, ne leur ressemble pas — ce qui n'est pas garanti, les deux
 * champs venant du même commerçant. C'est `matchesNotoriousSender` qui porte
 * ce cas, pas ce score.
 *
 * Le dénominateur est l'identifiant et non le nom : un identifiant qui ajoute
 * des lettres au nom (`CHEZBOBSHOP` pour « Chez Bob ») descend sous le seuil
 * et sera signalé. C'est voulu — un signal de plus coûte un regard, un signal
 * de moins coûte une usurpation déclarée.
 */
export function measureSenderLikeness(
  organizationName: string,
  senderId: string,
): SmsSenderLikeness {
  const name = normalizeForSenderComparison(organizationName);
  const sender = normalizeForSenderComparison(senderId);

  if (sender.length === 0) {
    // Rien à comparer : on ne crie pas au loup sur une saisie vide.
    return { score: 1, resembles: true, normalizedName: name };
  }
  if (name.length === 0) {
    return { score: 0, resembles: false, normalizedName: name };
  }

  const score = longestCommonSubsequence(name, sender) / sender.length;
  return {
    score,
    resembles: score >= SMS_SENDER_LIKENESS_THRESHOLD,
    normalizedName: name,
  };
}

/* ────────────────────────────────────────────────────────────
 * LES NOMS QUI APPARTIENNENT DÉJÀ À QUELQU'UN
 *
 * Le fait extérieur que le score ne peut pas avoir. Ces identifiants sont
 * ceux dont l'usurpation cause un vrai dommage — un SMS signé `AMELI` ou
 * `COLISSIMO` est le motif d'hameçonnage le plus courant en France, et c'est
 * la plateforme, pas le commerçant, qui répond devant le registre.
 *
 * TROIS PROPRIÉTÉS À TENIR EN L'ÉTENDANT :
 *
 *   · elle SIGNALE, elle ne refuse pas. Un commerçant peut légitimement
 *     s'appeler « La Poste du Coin » ; l'opérateur tranche.
 *   · les faux positifs sont ACCEPTÉS et coûtent un regard. `AMELI` est
 *     cherché en sous-chaîne, donc une boulangerie « Amélie » sera signalée.
 *     C'est le sens de ce module : un signal de trop coûte un coup d'œil, un
 *     signal de moins coûte une usurpation déclarée.
 *   · les jetons courts sont cherchés en ÉGALITÉ STRICTE, jamais en
 *     sous-chaîne. Sans cette règle, `CAF` allumerait tous les cafés du
 *     produit et le bandeau deviendrait du bruit qu'on n'ouvre plus.
 * ──────────────────────────────────────────────────────────── */

/** En deçà de cette longueur, un jeton n'est cherché qu'en égalité stricte. */
const NOTORIOUS_SUBSTRING_MIN_LENGTH = 5;

const NOTORIOUS_SENDERS: ReadonlyArray<{
  tokens: readonly string[];
  category: string;
}> = [
  {
    category: "un service public",
    tokens: [
      "AMELI",
      "IMPOTS",
      "URSSAF",
      "ANTAI",
      "ANTS",
      "CPAM",
      "CAF",
      "MSA",
      "GOUV",
      "FRANCETRAVAIL",
      "POLEEMPLOI",
      "SECUSOCIALE",
    ],
  },
  {
    category: "une banque ou un service de paiement",
    tokens: [
      "BANQUE",
      "BANK",
      "CREDIT",
      "CAISSEEP",
      "SOCGEN",
      "BNP",
      "LCL",
      "BOURSO",
      "REVOLUT",
      "PAYPAL",
      "LYDIA",
      "CARTEBLEUE",
    ],
  },
  {
    category: "un transporteur",
    tokens: [
      "COLISSIMO",
      "CHRONOPOST",
      "LAPOSTE",
      "MONDIALRELAY",
      "RELAISCOLIS",
      "COLIS",
      "DHL",
      "UPS",
      "GLS",
      "DPD",
      "FEDEX",
    ],
  },
];

/**
 * L'identifiant demandé emprunte-t-il un nom notoirement usurpé ?
 *
 * Rend la CATÉGORIE et non un booléen : « ressemble à un service public » et
 * « ressemble à un transporteur » n'appellent pas la même vérification de la
 * part de l'opérateur.
 */
export function matchesNotoriousSender(senderId: string): string | null {
  const sender = normalizeForSenderComparison(senderId);
  if (sender.length === 0) return null;

  for (const { tokens, category } of NOTORIOUS_SENDERS) {
    for (const token of tokens) {
      const hit =
        token.length >= NOTORIOUS_SUBSTRING_MIN_LENGTH
          ? sender.includes(token)
          : sender === token;
      if (hit) return category;
    }
  }
  return null;
}

/**
 * LCS classique, en O(|a| x |b|) — les deux chaînes font au plus quelques
 * dizaines de caractères (11 pour un expéditeur alphanumérique).
 */
function longestCommonSubsequence(a: string, b: string): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  let current = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] =
        a[i - 1] === b[j - 1]
          ? previous[j - 1] + 1
          : Math.max(previous[j], current[j - 1]);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }

  return previous[b.length];
}
