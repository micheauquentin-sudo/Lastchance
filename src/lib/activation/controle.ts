/**
 * UN POINT DE LISTE DE VÉRIFICATION — la forme partagée par tous les modules.
 *
 * Sept modules calculent une liste « peut-on ouvrir ? », et sept déclaraient
 * leur propre type pour la décrire — dont deux, jackpot et événement, sous le
 * MÊME nom `ControleActivation`, à la virgule près. Deux déclarations du même
 * nom pour la même chose, c'est déjà une occasion de les faire diverger sans
 * s'en apercevoir.
 *
 * Ce qui reste propre à chaque module, ce sont les CLÉS D'ÉTAPE (`etape`) :
 * d'où le paramètre de type, qui laisse `ControleQuiz` n'accepter que des
 * étapes de quiz et `ControleContest` que des étapes de championnat.
 */

/** Le tronc commun : ce qui est vérifié, le verdict, et où le corriger. */
export interface PointControle<E extends string = string> {
  cle: string;
  ok: boolean;
  titre: string;
  detail: string;
  /** Clé d'étape de l'atelier qui corrige ce point, quand elle existe. */
  etape?: E;
}

/**
 * Un point de vérification qui sait s'il BLOQUE.
 *
 * `bloquant` sépare ce que le SERVEUR refuse de ce que l'écran RACONTE : un
 * stock à zéro empêche l'ouverture, une URL publique vide ne l'empêche pas
 * (elle est générée à l'activation) mais mérite d'être dite avant d'imprimer
 * un QR. Mélanger les deux ferait lire « il manque quelque chose » là où rien
 * ne manque.
 */
export interface ControleActivation<E extends string = string>
  extends PointControle<E> {
  bloquant: boolean;
}
