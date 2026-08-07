import Link from "next/link";
import type { ReactNode } from "react";

/**
 * L'EN-TÊTE COMMUN DES ÉCRANS DU TABLEAU DE BORD.
 *
 * ── CE QU'IL RÉPARE ──
 *
 * Chaque page réinventait son en-tête : trois graisses de titre différentes
 * (`text-2xl font-bold`, `text-2xl font-black`, `text-3xl font-black`), un
 * lien de retour tantôt présent tantôt absent, et surtout AUCUN repère de
 * niveau — le commerçant n'avait que la pastille jaune du menu pour savoir où
 * il était, et elle s'éteint sur les treize routes qui ne sont pas au menu.
 *
 * ── LE SUR-TITRE EST LE NOM DU GROUPE DE MENU, PAS UN SLOGAN ──
 *
 * « Vos animations », « Outils », « Gestion » : les mêmes mots que les titres
 * de section de `DashboardNav`. C'est le fil d'Ariane le plus court possible —
 * une zone, un écran — et il reste juste même quand aucune entrée de menu
 * n'est allumée.
 *
 * Le titre, lui, doit être le LIBELLÉ DU MENU, mot pour mot : cliquer sur
 * « Jeux instantanés » et lire « Campagnes » faisait douter d'avoir cliqué au
 * bon endroit.
 */
export function PageHeader({
  surtitre,
  titre,
  sousTitre,
  retour,
  actions,
}: {
  /** Zone du produit : le titre du groupe de menu qui contient cet écran. */
  surtitre?: string;
  /** Le libellé de l'entrée de menu, à l'identique. */
  titre: string;
  /** Une phrase : ce que le commerçant fait ici, en langage de commerce. */
  sousTitre?: ReactNode;
  /**
   * Remontée d'un écran, pour les routes sans entrée de menu. Le `href` doit
   * déjà avoir été filtré par `lienSelonRole` côté appelant : un retour qui
   * refoule celui qui le clique est pire que pas de retour du tout.
   */
  retour?: { href: string; label: string };
  /** Bouton principal de l'écran (création, export…). */
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8">
      {retour ? (
        <Link
          href={retour.href}
          className="mb-3 inline-block text-sm font-bold text-k-body hover:text-k-ink"
        >
          ← {retour.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          {surtitre ? (
            <p className="mb-1 text-xs font-black uppercase tracking-[0.16em] text-k-orange-text">
              {surtitre}
            </p>
          ) : null}
          <h1 className="text-2xl font-black text-k-ink">{titre}</h1>
          {sousTitre ? (
            <p className="mt-1 text-sm font-semibold text-k-body">{sousTitre}</p>
          ) : null}
        </div>
        {/* PAS DE `shrink-0` ICI, ET C'EST LE POINT. Un item flex `shrink-0`
            de largeur auto est dimensionné à sa contribution MAX-CONTENT :
            les formulaires de création montés dans ce slot contiennent une
            InfoBulle dont le paragraphe était alors mesuré sur UNE SEULE
            LIGNE — plusieurs milliers de pixels, et une barre de défilement
            horizontale sur toute la page (aucun `overflow-x` ne la retenait).
            Avec le rétrécissement par défaut (1) l'item peut redescendre vers
            son min-content et le parent `flex-wrap` le renvoie à la ligne. */}
        {actions ? <div className="min-w-0 max-w-full">{actions}</div> : null}
      </div>
    </header>
  );
}
