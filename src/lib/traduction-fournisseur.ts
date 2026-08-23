import "server-only";

/**
 * VIT-6 — LE FOURNISSEUR DE TRADUCTION, DERRIÈRE UNE PORTE.
 *
 * ── POURQUOI UN ADAPTATEUR POUR UN SEUL FOURNISSEUR ──
 *
 * Cloud Translation **Basic** suffit à la première version : du texte structuré,
 * français vers anglais, sans glossaire ni traitement par lot. Advanced coûte
 * plus cher et n'apporterait rien tant qu'aucun vocabulaire métier n'est à
 * imposer. Mais le jour où il en faudra un, c'est CETTE interface qui change de
 * corps — pas les appelants, pas l'action, pas l'écran.
 *
 * ── LA CLÉ NE FRANCHIT JAMAIS LA FRONTIÈRE CLIENT ──
 *
 * `server-only` en tête, et `GOOGLE_TRANSLATE_API_KEY` SANS préfixe
 * `NEXT_PUBLIC_` : le préfixe l'aurait inlinée dans le bundle du navigateur,
 * c'est-à-dire publiée. Google facture au caractère — une clé publique est une
 * facture ouverte.
 *
 * ── L'ARRÊT EST PROPRE, ET IL EST TESTÉ PAR CONSTRUCTION ──
 *
 * Sans clé, `fournisseurConfigure()` rend `null` et l'appelant le dit à
 * l'écran : « la traduction automatique n'est pas activée ». Rien ne plante,
 * rien n'est écrit, et la Vitrine continue de servir le français — le repli
 * prévu par le modèle, pas un mode dégradé inventé pour l'occasion.
 */

/** Ce que sait faire un fournisseur, et rien de plus. */
export interface FournisseurTraduction {
  /** Nom court, pour les journaux et le message rendu au commerçant. */
  readonly nom: string;
  /**
   * Traduit des textes DANS L'ORDRE. Le contrat est strict : autant de sorties
   * que d'entrées, à la même position. Un fournisseur qui réordonne ou omet
   * ferait écrire la traduction d'un plat sur un autre — d'où la vérification
   * de longueur à la lecture de la réponse.
   */
  traduire(textes: string[], source: string, cible: string): Promise<string[]>;
}

/**
 * Le plafond d'UN appel, en caractères. Google facture au caractère : cette
 * borne est la limite de dépense de la première version.
 *
 * 20 000 couvre très largement une carte de restaurant complète (soixante
 * plats avec descriptions tournent autour de 6 000). Au-delà, l'appel s'arrête
 * proprement et le commerçant relance — ce qui rend la dépense visible plutôt
 * qu'automatique.
 */
export const TRADUCTION_CARACTERES_MAX = 20_000;

/** Le plafond d'UN appel, en champs. Double borne : la longueur ET le nombre. */
export const TRADUCTION_CHAMPS_MAX = 150;

/** Textes par requête. Google accepte un tableau ; un par requête serait absurde. */
export const TRADUCTION_LOT = 24;

/** Au-delà, l'appel est abandonné : un écran de commerçant n'attend pas. */
export const TRADUCTION_TIMEOUT_MS = 15_000;

const POINT_ENTREE = "https://translation.googleapis.com/language/translate/v2";

/**
 * Google réencode quelques caractères même en `format=text`.
 *
 * Laisser passer `&#39;` écrirait « l&#39;entrée » sur une carte publique. Les
 * cinq entités traitées sont celles que l'API produit réellement.
 */
export function desechapperGoogle(valeur: string): string {
  return valeur
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&");
}

/**
 * La réponse de Google → des textes, ou `null` si elle n'a pas la forme promise.
 *
 * `attendus` est vérifié : une réponse plus courte que la demande ferait
 * décaler les traductions d'un cran, et le plat suivant recevrait la
 * description du précédent. Mieux vaut tout refuser que tout décaler.
 */
export function lireReponseGoogle(
  brut: unknown,
  attendus: number,
): string[] | null {
  if (typeof brut !== "object" || brut === null) return null;
  const data = (brut as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const liste = (data as { translations?: unknown }).translations;
  if (!Array.isArray(liste) || liste.length !== attendus) return null;

  const sortie: string[] = [];
  for (const entree of liste) {
    if (typeof entree !== "object" || entree === null) return null;
    const texte = (entree as { translatedText?: unknown }).translatedText;
    if (typeof texte !== "string") return null;
    sortie.push(desechapperGoogle(texte));
  }
  return sortie;
}

/** Cloud Translation Basic. Une seule dépendance : `fetch`. */
export function fournisseurGoogleBasic(cle: string): FournisseurTraduction {
  return {
    nom: "google-basic",
    async traduire(textes, source, cible) {
      if (textes.length === 0) return [];

      const reponse = await fetch(`${POINT_ENTREE}?key=${encodeURIComponent(cle)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          q: textes,
          source,
          target: cible,
          // `text` et non `html` : les champs de Vitrine sont du texte nu, et
          // demander du HTML aurait fait revenir des balises dans une accroche.
          format: "text",
        }),
        signal: AbortSignal.timeout(TRADUCTION_TIMEOUT_MS),
        // Aucune mise en cache HTTP : le cache du produit est
        // `vitrine_translations`, en base, avec sa version source. Un second
        // cache sans version aurait servi une traduction périmée sans le savoir.
        cache: "no-store",
      });

      if (!reponse.ok) {
        throw new Error(`fournisseur ${reponse.status}`);
      }

      const lu = lireReponseGoogle(await reponse.json(), textes.length);
      if (!lu) throw new Error("réponse illisible du fournisseur");
      return lu;
    },
  };
}

/**
 * Le fournisseur configuré, ou `null` quand la clé n'est pas posée.
 *
 * `null` n'est PAS une erreur : c'est l'état normal d'un environnement où la
 * traduction automatique n'a pas été activée. L'appelant le dit en une phrase
 * et n'écrit rien.
 */
export function fournisseurConfigure(): FournisseurTraduction | null {
  const cle = process.env.GOOGLE_TRANSLATE_API_KEY;
  return cle && cle.trim() ? fournisseurGoogleBasic(cle.trim()) : null;
}
