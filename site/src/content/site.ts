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
  { href: LOGIN_URL, label: "Connexion", external: true },
] as const;
