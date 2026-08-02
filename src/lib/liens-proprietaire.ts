import type { MemberRole } from "@/types/database";

/**
 * Les écrans du tableau de bord réservés au PROPRIÉTAIRE, et ce qu'un lien vers
 * eux doit devenir pour les autres.
 *
 * ── Le défaut, deux fois, dans deux écrans différents ──
 *
 * Un collègue invité en « Campagnes et caisse » (rôle `editor`) ouvre
 * « Découvrir » — le lien est dans SON menu — et clique le bouton jaune « Voir
 * les offres » d'un module non actif. `/dashboard/settings` renvoie tout
 * non-propriétaire sur `/dashboard` : il retombe sur « Vue d'ensemble », sans un
 * mot. Le clic paraît mort. Même chose depuis la tuile « Gains à valider » de
 * Vue d'ensemble, qui l'expédie en « Caisse », un écran qu'il n'a pas demandé.
 *
 * Le mécanisme correct existait déjà à deux endroits — `canManageBilling` de
 * `PlanUpsell`, `ownerOnly` de la checklist d'accueil. Il n'a jamais été porté
 * sur ces trois liens-ci. Une garde par écran plutôt qu'une garde par lien est
 * une garde qu'on oublie au lien suivant : la règle est donc portée par la
 * DESTINATION, une seule fois, et le test qui l'accompagne dérive la liste des
 * pages réellement gardées pour qu'aucune ne puisse y manquer en silence.
 *
 * Ce que cela ne change PAS : l'écran reste affiché, la carte reste lisible, la
 * valeur reste visible. Seul le lien disparaît, remplacé — côté appelant — par
 * la phrase qui dit à qui s'adresser.
 *
 * ── CE MODULE EST DÉCORATIF. CE N'EST PAS UNE GARDE. ────────
 *
 * À écrire noir sur blanc, parce que son vocabulaire (« réservé au
 * propriétaire », « selon le rôle ») invite à le lire comme une autorisation :
 * il ne protège RIEN. Ses quatre appelants sont tous des rendus de lien
 * (`discover/page.tsx`, `dashboard/page.tsx`, `experience-blueprint-gallery`),
 * et taper l'URL à la main contourne évidemment un lien qu'on n'affiche pas.
 *
 * Ce qui protège réellement, ce sont les `redirect` que chacune des pages
 * listées porte dans son propre corps — ils sont là, ils restent là, et retirer
 * ce module ne les affaiblirait pas d'un pouce. Corollaire à retenir avant
 * d'ajouter un chemin ci-dessous : y inscrire une page NE LA GARDE PAS. Le
 * contrôle dérivé qui accompagne ce module vérifie l'inverse — que toute page
 * inscrite ici porte bien son propre refus.
 */
export const CHEMINS_PROPRIETAIRE = [
  "/dashboard/customers",
  "/dashboard/newsletter",
  "/dashboard/participations",
  "/dashboard/settings",
  "/dashboard/settings/sms",
] as const;

/*
 * `/dashboard/team` n'y figure PAS, et c'est le contrôle dérivé qui l'a dit :
 * cette page refuse l'éditeur en le lui EXPLIQUANT (« la gestion de l'équipe
 * est réservée au propriétaire du compte »), au lieu de le renvoyer ailleurs.
 * Un lien vers elle informe donc plutôt qu'il ne trompe — c'est exactement le
 * comportement que ce module sert à obtenir, il n'y a rien à couper.
 */

/**
 * Le chemin mène-t-il à un écran qui refuse ce rôle en silence ?
 *
 * Comparaison sur le CHEMIN seul : les liens du produit portent des paramètres
 * (`?statut=a-valider`) et des ancres (`#subscription`) qui ne changent rien au
 * refus. `/dashboard/settings/automations` ouvert à l'éditeur ne doit pas être
 * pris pour `/dashboard/settings` : le préfixe ne suffit donc pas, l'égalité
 * fait foi.
 */
export function estReserveAuProprietaire(href: string): boolean {
  const chemin = href.split("?")[0].split("#")[0].replace(/\/+$/, "");
  return (CHEMINS_PROPRIETAIRE as readonly string[]).includes(chemin);
}

/**
 * `href` si le rôle peut réellement ouvrir cette page, `null` sinon.
 *
 * `null` et non un lien désactivé : un lien qu'on peut cliquer et qui ne fait
 * rien est exactement ce qu'on répare ici.
 */
export function lienSelonRole(
  href: string,
  role: MemberRole | null | undefined,
): string | null {
  if (!estReserveAuProprietaire(href)) return href;
  return role === "owner" ? href : null;
}
