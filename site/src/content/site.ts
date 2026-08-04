/**
 * Configuration éditoriale du site : liens, navigation, coordonnées.
 * Le site vitrine est indépendant de l'application — seul APP_URL les
 * relie (boutons « Essai gratuit » et « Connexion »).
 */

export const SITE_NAME = "LastChance";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.lastchance.app";

/** URL de l'application commerçant (inscription / connexion). */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://app.lastchance.app";

export const SIGNUP_URL = `${APP_URL}/signup`;
export const LOGIN_URL = `${APP_URL}/login`;

export const CONTACT_EMAIL = "contact@lastchance.app";

/**
 * Souscription en ligne ouverte ou non. Le site vitrine ne connaît pas Stripe :
 * il est déployé séparément et ne voit ni `STRIPE_SECRET_KEY` ni les price IDs.
 * Il ne PEUT donc pas déduire si le paiement fonctionne — c'est une déclaration
 * du propriétaire, pas une détection.
 *
 * ── LE DÉFAUT EST FERMÉ, ET C'EST DÉLIBÉRÉ ──
 *
 * Il faut poser `NEXT_PUBLIC_CHECKOUT_ENABLED="true"` pour ouvrir la
 * souscription ; toute autre valeur, et l'absence de valeur, renvoient vers
 * /contact. La règle générale : entre un visiteur qui écrit au lieu d'acheter
 * et un visiteur qui atteint un paiement cassé, seul le second est perdu — et
 * il l'est au pire moment, carte en main. Un oubli de configuration doit
 * dégrader vers le formulaire, jamais vers l'erreur.
 *
 * Aucun price ID n'existe à ce jour (`.env.example`, section Stripe : les
 * quatre variables d'offre sont vides) : ouvrir ce drapeau AVANT de les créer
 * casse le parcours d'achat.
 */
export const CHECKOUT_ENABLED =
  process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === "true";

export const NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/tarifs", label: "Tarifs" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

export const FOOTER_LINKS = [
  { href: "/tarifs", label: "Tarifs" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
  { href: `${APP_URL}/privacy`, label: "Confidentialité", external: true },
  { href: `${APP_URL}/cookies`, label: "Cookies", external: true },
  { href: `${APP_URL}/legal`, label: "Mentions légales", external: true },
  { href: LOGIN_URL, label: "Connexion", external: true },
] as const;
