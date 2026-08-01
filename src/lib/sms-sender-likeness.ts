/**
 * Ressemblance entre le nom commercial d'une organisation et l'identifiant
 * d'expéditeur SMS qu'elle demande.
 *
 * POURQUOI CE MODULE EXISTE. Un propriétaire saisit librement onze caractères
 * A-Z0-9 : rien, dans le produit, n'empêche de demander `COLISSIMO`, `AMELI`
 * ou `MONBANQUE`. Le seul rempart est l'œil de l'opérateur au moment de
 * déposer la déclaration AF2M — encore faut-il qu'il ait sous les yeux ce
 * qu'il doit comparer.
 *
 * CE MODULE NE REFUSE RIEN, ET NE DOIT JAMAIS LE FAIRE. La ressemblance n'est
 * pas calculable de façon fiable : « Le Petit Jardin » peut légitimement
 * demander `LEPTJARDIN`, et une enseigne peut porter un nom d'usage absent de
 * sa raison sociale. Un refus automatique bloquerait des demandes valides.
 * C'est un signal destiné à un humain, pas une garde.
 *
 * Il vit ici et non dans le composant parce que ce dépôt n'a pas
 * d'environnement de rendu React : une logique laissée dans un composant est
 * une logique que personne ne peut vérifier.
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
 * (`LEPTJARDIN` dans `LEPETITJARDIN`) et l'acronyme (`LPJ`). Un nom emprunté
 * ailleurs (`AMELI`, `COLISSIMO`) tombe très bas sans avoir à le lister.
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
