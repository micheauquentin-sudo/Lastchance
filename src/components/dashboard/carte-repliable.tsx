"use client";

import { useEffect, useState } from "react";

import type { StatutTuile } from "@/lib/checklist/tuiles";

/**
 * LES TROIS TONS DU VERDICT, ÉCRITS UNE FOIS.
 *
 * Le fond est PASTEL et l'encre reste `k-ink` (#211d16) — le patron de
 * `src/components/ui/status-badge.tsx` : il tient AA très largement sur les
 * trois fonds. Le point plein et le liseré gauche, eux, portent la couleur
 * franche : décoratifs et `aria-hidden`, aucun seuil de texte ne s'y applique.
 *
 * Les trois libellés sont écrits DU POINT DE VUE DU COMMERÇANT, pas du calcul :
 * « Obligatoire manquant » dit qu'on ne peut pas ouvrir aux joueurs, « À
 * compléter » qu'il reste quelque chose à regarder sans que cela empêche quoi
 * que ce soit.
 */
const TONS: Record<
  StatutTuile,
  {
    libelle: string;
    suffixe: string;
    fond: string;
    point: string;
    lisere: string;
  }
> = {
  complet: {
    libelle: "Complet",
    suffixe: "complet",
    fond: "bg-k-green/25",
    point: "bg-k-green",
    lisere: "border-l-k-green",
  },
  attention: {
    libelle: "À compléter",
    suffixe: "à compléter",
    fond: "bg-amber-100",
    point: "bg-k-orange",
    lisere: "border-l-k-orange",
  },
  incomplet: {
    libelle: "Obligatoire manquant",
    suffixe: "obligatoire manquant",
    fond: "bg-red-100",
    point: "bg-red-600",
    lisere: "border-l-red-600",
  },
};

/**
 * UN BLOC DE LA PAGE DÉTAIL, REPLIABLE — SANS TOUCHER À SON CONTENU.
 *
 * La page d'un jeu instantané empile dix blocs pleine largeur : le commerçant
 * qui vient régler une seule chose scrolle à travers tout le reste. Ce
 * composant ENVELOPPE un bloc existant (sa `<Card>`, son `<h2>`) et lui ajoute
 * un bouton de repli. Le bloc enveloppé n'est PAS modifié : il ne sait pas
 * qu'il est repliable.
 *
 * ── QUATRE CONTRAINTES QUI ONT DICTÉ LA FORME ──
 *
 * 1. **Ouvert par défaut.** Les E2E cliquent dans ces blocs sans les déplier
 *    (`e2e/referral.spec.ts` : heading « Parrainage ludique » visible puis
 *    « Enregistrer »), et les ancres `#suivi` / `#reglages` doivent mener à du
 *    contenu VISIBLE — une ancre qui saute sur une barre fermée ne raconte rien.
 * 2. **Pas de `<details>`/`<summary>`.** Chromium retire le rôle `heading` aux
 *    descendants d'un `<summary>` : les `getByRole("heading", …)` des E2E
 *    tomberaient sur des blocs pourtant affichés. D'où un bouton
 *    `aria-expanded` explicite.
 * 3. **Le titre replié est un `<span>`, jamais un `<h2>`.** Le bloc enveloppé
 *    porte déjà son `<h2>` du même nom ; deux headings identiques feraient
 *    échouer les locators par nom accessible dès que le bloc est ouvert.
 * 4. **Le statut ne se lit JAMAIS à la seule couleur.** Il s'écrit en toutes
 *    lettres dans un badge (« Complet » / « À compléter » / « Obligatoire
 *    manquant ») ET dans l'`aria-label` du bouton ; seuls le point coloré du
 *    badge et le liseré gauche sont décoratifs, donc `aria-hidden`. Un point
 *    coloré seul est exactement ce que le scan axe d'`atelier-modules.spec.ts`
 *    refuse — et un point vert seul est ce qui a fait afficher « complet » sur
 *    une campagne sans le moindre QR code.
 *
 * ── L'ANCRE ROUVRE LE BLOC ──
 *
 * `#statut`, `#suivi`, `#reglages`, `#qr`, `#relance` sont visés par la Carte
 * de l'Aventure, par les CTA de l'atelier et par plusieurs specs E2E. Le jour
 * où un bloc naît replié, sauter dessus ne montrerait qu'une barre fermée :
 * ce composant force donc l'ouverture quand l'ancre de l'URL est la sienne, au
 * montage ET à chaque `hashchange` (cliquer deux fois le même lien ne
 * renavigue pas — seul l'événement se répète).
 *
 * L'état n'est pas persisté : replier puis naviguer rouvre tout. C'est déjà le
 * comportement des `<details>` du produit, assumé plutôt que contourné par un
 * stockage local que rien ne viendrait purger.
 */
export function CarteRepliable({
  titre,
  id,
  numero,
  statut,
  resume,
  children,
  defaultOuvert = true,
}: {
  /** Nom du bloc — repris dans la barre repliée et dans les libellés d'aide. */
  titre: string;
  /** Ancre de la page (`suivi`, `reglages`…) : portée dans les DEUX états. */
  id?: string;
  /** Rang du bloc dans la checklist de la page, affiché en pastille. */
  numero?: number;
  /** Verdict de la tuile — rendu en badge ET dit dans l'`aria-label`. */
  statut?: StatutTuile;
  /** Résumé d'une ligne, visible UNIQUEMENT quand le bloc est replié. */
  resume?: React.ReactNode;
  children: React.ReactNode;
  defaultOuvert?: boolean;
}) {
  const [ouvert, setOuvert] = useState(defaultOuvert);

  useEffect(() => {
    if (!id) return;
    const ouvrirSiVise = () => {
      if (window.location.hash.slice(1) === id) setOuvert(true);
    };
    ouvrirSiVise();
    window.addEventListener("hashchange", ouvrirSiVise);
    return () => window.removeEventListener("hashchange", ouvrirSiVise);
  }, [id]);

  // Le nom accessible du bouton porte TOUT ce que le badge dit en couleur :
  // « 3. Dotation — complet ». Le suffixe vient APRÈS le titre : les motifs
  // E2E (`/Développer «.*Vos jeux/`, helpers.ouvrirTuile) n'en dépendent pas.
  const nomAccessible = [
    numero !== undefined ? `${numero}. ` : "",
    titre,
    statut ? ` — ${TONS[statut].suffixe}` : "",
  ].join("");

  const pastilleNumero =
    numero === undefined ? null : (
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-k-ink bg-k-yellow text-sm font-black leading-none text-k-ink"
      >
        {numero}
      </span>
    );

  // Le badge : point plein DÉCORATIF + libellé LU. C'est le seul endroit où le
  // verdict est visible sans survol ni dépli — un point de 12 px isolé ne l'a
  // jamais été.
  const badgeStatut =
    statut === undefined ? null : (
      <span
        className={`flex shrink-0 items-center gap-1.5 rounded-full border-2 border-k-ink px-2.5 py-0.5 text-xs font-black text-k-ink ${TONS[statut].fond}`}
      >
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${TONS[statut].point}`}
        />
        {TONS[statut].libelle}
      </span>
    );

  // Le liseré gauche : la même information, en périphérie, pour repérer d'un
  // coup d'œil les blocs à traiter dans une page qui en empile dix. Toujours
  // posé — transparent sans statut — pour que les blocs restent alignés.
  const lisere = statut ? TONS[statut].lisere : "border-l-transparent";

  if (!ouvert) {
    return (
      <div id={id} className="scroll-mt-24">
        <button
          type="button"
          aria-expanded={false}
          aria-label={`Développer « ${nomAccessible} »`}
          onClick={() => setOuvert(true)}
          className={`flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-l-4 border-k-ink bg-white px-6 py-3 text-left shadow-[4px_4px_0_rgba(33,29,22,0.9)] transition-colors hover:bg-k-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-k-ink focus-visible:ring-offset-2 ${statut ? TONS[statut].lisere : "border-l-k-ink"}`}
        >
          <span className="flex min-w-0 items-center gap-3">
            {pastilleNumero}
            {/* LE MÊME STYLE QUE DÉPLIÉ — encre nue, sans le trait de
                marqueur, qui n'aurait aucun sens sur une ligne compacte.
                Les deux états ont été surlignés en plein un temps ; sept
                blocs jaunes sur une page faisaient un mur, et c'est le
                propriétaire qui l'a vu à l'écran. */}
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-black text-k-ink">{titre}</span>
              {resume ? (
                <span className="truncate text-sm font-bold text-k-body">
                  {resume}
                </span>
              ) : null}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            {badgeStatut}
            <span aria-hidden className="text-lg font-black text-k-ink">
              +
            </span>
          </span>
        </button>
      </div>
    );
  }

  // ── LE LISERÉ SUIT LE CADRE, il ne le longe plus ──
  //
  // Ce conteneur ne portait qu'un `border-l-4` : une barre DROITE, de la
  // hauteur pleine du bloc, posée contre une carte à coins arrondis. En haut
  // et en bas, le trait dépassait donc là où la carte s'incurve — un angle vif
  // contre une courbe, visible sur chaque bloc ouvert du panel.
  //
  // `rounded-2xl` plus deux bordures transparentes reprennent EXACTEMENT la
  // géométrie de la barre REPLIÉE juste au-dessus (`rounded-2xl border-2
  // border-l-4`) : le trait coloré s'incurve aux quatre coins et épouse la
  // carte. Les deux états ont enfin le même contour.
  //
  // PAS d'`overflow-hidden` : la pastille numérotée déborde volontairement du
  // coin haut-gauche (`-left-2 -top-2`), et le rognage l'amputerait.
  return (
    <div
      id={id}
      className={`relative scroll-mt-24 rounded-2xl border-2 border-transparent border-l-4 ${lisere}`}
    >
      {/* EN DÉBORD du coin haut-gauche, jamais DANS la marge `p-6` : le bloc
          enveloppé y place déjà son `<h2>` (24 px du bord, 28 px de haut) et
          une pastille posée dans la marge le chevaucherait. Le débord de 8 px
          la met devant le titre sans rien déplacer ni recouvrir. */}
      {pastilleNumero && (
        <span className="absolute -left-2 -top-2 z-10 flex items-center gap-2">
          {pastilleNumero}
        </span>
      )}
      {/* À DROITE DU TITRE : le `<h2>` du bloc enveloppé occupe la première
          ligne, le badge se pose sur la même, décalé de la place du bouton de
          repli (32 px + gouttière). */}
      {badgeStatut && (
        <span className="absolute right-14 top-3 z-10">{badgeStatut}</span>
      )}
      {children}
      <button
        type="button"
        aria-expanded
        aria-label={`Réduire « ${nomAccessible} »`}
        onClick={() => setOuvert(false)}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-k-ink bg-white text-lg font-black leading-none text-k-ink transition-colors hover:bg-k-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-k-ink focus-visible:ring-offset-2"
      >
        <span aria-hidden>−</span>
      </button>
    </div>
  );
}
