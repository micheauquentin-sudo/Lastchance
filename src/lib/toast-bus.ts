/**
 * ÉMETTEUR DE TOASTS — un magasin de module, sans Provider.
 *
 * ── Pourquoi pas un contexte React ──
 *
 * Le point de montage naturel d'un toast global est `src/app/dashboard/layout.tsx`,
 * qui est un **Server Component** : il lit les cookies, l'organisation active et
 * l'état d'abonnement. Y poser un `createContext` obligerait à le faire basculer
 * en composant client — c'est-à-dire à envoyer au navigateur tout le calcul
 * d'accès qui vit dedans, et à perdre la lecture serveur qui le rend possible.
 *
 * Le dépôt n'a d'ailleurs AUCUN `createContext` : ce n'est pas un oubli, c'est
 * la conséquence d'un layout serveur. Un magasin de module suit la même logique
 * — le layout monte un simple îlot client (`<ToastEnregistrement />`), et
 * l'émetteur est importé directement par qui annonce, sans arbre à traverser.
 *
 * ── Le contrat avec `useSyncExternalStore` ──
 *
 * `lireToasts` DOIT rendre la même référence tant que rien n'a changé, sinon
 * React re-rend en boucle. Le tableau n'est donc jamais muté : il est remplacé,
 * et seulement quand la liste change réellement. `retirerToast` sur un
 * identifiant absent ne notifie personne — c'est ce qui rend l'auto-effacement
 * idempotent face à un double effet.
 *
 * ── Côté serveur, rien ──
 *
 * L'état de module est PARTAGÉ entre les requêtes sur le serveur : un toast qui
 * y serait annoncé s'afficherait chez un autre commerçant. `annoncerToast`
 * n'est appelé que depuis des gestionnaires d'événements (donc jamais au rendu
 * serveur), et l'instantané serveur rend une constante vide — l'hydratation
 * part toujours de zéro.
 */

export type TonToast = "succes" | "erreur";

export interface Toast {
  id: number;
  message: string;
  ton: TonToast;
}

/** Au-delà, les plus anciens sortent : une pile de toasts masque l'écran. */
export const MAX_TOASTS = 3;

const VIDE: readonly Toast[] = [];

let toasts: readonly Toast[] = VIDE;
let dernierId = 0;
const abonnes = new Set<() => void>();

function notifier(): void {
  // Copie : un abonné qui se désabonne pendant la notification ne doit pas
  // faire sauter le suivant.
  for (const abonne of [...abonnes]) abonne();
}

/** Abonnement au sens de `useSyncExternalStore` ; rend son désabonnement. */
export function abonnerToast(ecouter: () => void): () => void {
  abonnes.add(ecouter);
  return () => {
    abonnes.delete(ecouter);
  };
}

/** Instantané client. Référence stable tant que la liste ne change pas. */
export function lireToasts(): readonly Toast[] {
  return toasts;
}

/** Instantané serveur : toujours vide, voir l'en-tête. */
export function lireToastsServeur(): readonly Toast[] {
  return VIDE;
}

/**
 * Annonce un message. Rend l'identifiant attribué, ce qui permet de le retirer
 * avant son expiration.
 */
export function annoncerToast({
  message,
  ton = "succes",
}: {
  message: string;
  ton?: TonToast;
}): number {
  dernierId += 1;
  const toast: Toast = { id: dernierId, message, ton };
  toasts = [...toasts, toast].slice(-MAX_TOASTS);
  notifier();
  return toast.id;
}

/** Retire un toast. Sans effet — et sans notification — s'il n'existe plus. */
export function retirerToast(id: number): void {
  const restants = toasts.filter((toast) => toast.id !== id);
  if (restants.length === toasts.length) return;
  toasts = restants.length === 0 ? VIDE : restants;
  notifier();
}

/** Remise à zéro. Pour les tests : l'état de module survit d'un cas à l'autre. */
export function viderToasts(): void {
  if (toasts.length > 0) {
    toasts = VIDE;
    notifier();
  }
  dernierId = 0;
}
