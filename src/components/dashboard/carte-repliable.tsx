"use client";

import { useEffect, useState } from "react";

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
 * 4. **Le statut ne se lit JAMAIS à la seule couleur.** La pastille verte ou
 *    rouge est `aria-hidden` ; le sens (« complet » / « il manque quelque
 *    chose ») vit dans l'`aria-label` du bouton. Un emoji nu ou un point coloré
 *    seul est exactement ce que le scan axe d'`atelier-modules.spec.ts` refuse.
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
  /** Verdict de la tuile — rendu en pastille ET dit dans l'`aria-label`. */
  statut?: "complet" | "incomplet";
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

  // Le nom accessible du bouton porte TOUT ce que la pastille dit en couleur :
  // « 3. Dotation — complet ». C'est la seule version lisible au lecteur
  // d'écran, les deux pastilles étant `aria-hidden`.
  const nomAccessible = [
    numero !== undefined ? `${numero}. ` : "",
    titre,
    statut === "complet"
      ? " — complet"
      : statut === "incomplet"
        ? " — il manque quelque chose"
        : "",
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

  const pastilleStatut =
    statut === undefined ? null : (
      <span
        aria-hidden
        className={`h-3 w-3 shrink-0 rounded-full border-2 border-k-ink ${
          statut === "complet" ? "bg-k-green" : "bg-k-orange"
        }`}
      />
    );

  if (!ouvert) {
    return (
      <div id={id} className="scroll-mt-24">
        <button
          type="button"
          aria-expanded={false}
          aria-label={`Développer « ${nomAccessible} »`}
          onClick={() => setOuvert(true)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-k-ink bg-white px-6 py-3 text-left shadow-[4px_4px_0_rgba(33,29,22,0.9)] transition-colors hover:bg-k-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-k-ink focus-visible:ring-offset-2"
        >
          <span className="flex min-w-0 items-center gap-3">
            {pastilleNumero}
            {pastilleStatut}
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-black text-k-ink">{titre}</span>
              {resume ? (
                <span className="truncate text-sm font-bold text-k-body">
                  {resume}
                </span>
              ) : null}
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-lg font-black text-k-ink">
            +
          </span>
        </button>
      </div>
    );
  }

  return (
    <div id={id} className="relative scroll-mt-24">
      {/* EN DÉBORD du coin haut-gauche, jamais DANS la marge `p-6` : le bloc
          enveloppé y place déjà son `<h2>` (24 px du bord, 28 px de haut) et
          une pastille posée dans la marge le chevaucherait. Le débord de 8 px
          la met devant le titre sans rien déplacer ni recouvrir. */}
      {(pastilleNumero || pastilleStatut) && (
        <span className="absolute -left-2 -top-2 z-10 flex items-center gap-2">
          {pastilleNumero}
          {pastilleStatut}
        </span>
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
