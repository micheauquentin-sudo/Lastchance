"use client";

import { cn } from "@/lib/utils";
import { useFavoris } from "@/components/vitrine/favoris";
import { textesVitrine } from "@/components/vitrine/langue";
import type { LangueVitrine, SecteurVitrine } from "@/lib/vitrine";
import type { AllureResolue } from "@/components/vitrine/theme";

/**
 * LA BARRE BASSE — trois repères, sous le pouce.
 *
 * ── ELLE NAVIGUE, ELLE N'EST PAS DÉCORATIVE ──
 *
 * La maquette de référence dessine cette barre sans lui donner de rôle. Un
 * bandeau permanent qui occupe le bas de l'écran d'un téléphone et ne répond
 * pas au doigt est pire que pas de bandeau : il coûte de la hauteur ET il fait
 * douter du reste de la page. Les trois boutons font donc chacun quelque chose
 * de vérifiable.
 *
 *  · « Accueil » remonte en haut. Sur une carte de soixante plats, c'est le
 *    geste le plus fréquent, et le seul que le navigateur ne donne pas.
 *  · « Infos » descend au pied de page, là où vivent les liens et l'histoire.
 *  · « Favoris » saute au premier plat marqué — et se désactive quand il n'y
 *    en a aucun, plutôt que d'afficher un compteur inerte.
 *
 * ── ELLE LIT LE MÊME MAGASIN DE FAVORIS QUE LES FICHES ──
 *
 * `useFavoris` est un magasin de MODULE : la barre s'y abonne sans qu'aucun
 * état ne soit remonté dans la page. Faire redescendre le compte depuis un
 * parent aurait obligé à rendre la page entière cliente pour un chiffre.
 *
 * ── AUCUN `position: fixed` ──
 *
 * `sticky bottom-0` dans le flux : une barre `fixed` se superpose au dernier
 * plat de la carte, que plus rien ne peut alors faire défiler au-dessus d'elle.
 * L'espaceur en bas de page (`page.tsx`) réserve sa hauteur.
 */
export function BarreBasseVitrine({
  slug,
  lang,
  secteur,
  allure,
  ancrePied,
}: {
  slug: string;
  lang: LangueVitrine;
  secteur: SecteurVitrine;
  allure: AllureResolue;
  /** L'`id` du pied de page — la cible du bouton « Infos ». */
  ancrePied: string;
}) {
  const t = textesVitrine(lang, secteur);
  const favoris = useFavoris(slug);

  const versLeHaut = () =>
    window.scrollTo({ top: 0, behavior: "smooth" });

  const versLePied = () =>
    document.getElementById(ancrePied)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

  /**
   * Le PREMIER favori DANS L'ORDRE DE LA PAGE, et non le premier posé.
   *
   * `Set` conserve l'ordre d'insertion — donc l'ordre des clics, qui n'a aucun
   * rapport avec l'ordre de la carte. Sauter au dernier plat coché parce qu'il
   * a été coché en premier ferait remonter le visiteur au hasard. On demande
   * donc au DOM, qui est la seule source de l'ordre affiché.
   */
  const versLesFavoris = () => {
    if (favoris.nombre === 0) return;
    const cible = [...document.querySelectorAll<HTMLElement>("[id^='fiche-']")].find(
      (el) => favoris.ids.has(el.id.slice("fiche-".length)),
    );
    cible?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const pleine = allure.barreBasse === "pleine";

  return (
    <div
      style={{ padding: "var(--vitrine-barre-pad)" }}
      className={cn(
        "sticky bottom-0 z-20",
        // Le dégradé fait disparaître le contenu SOUS la barre au lieu de le
        // couper net : sans lui, un plat tranché en deux par un bord franc se
        // lit comme un défaut d'affichage.
        !pleine &&
          "bg-gradient-to-t from-[var(--vitrine-secondary)] from-55% to-transparent",
      )}
    >
      <nav
        aria-label={t.nosCartes}
        style={{
          borderRadius: "var(--vitrine-barre-rad)",
          background: "var(--vitrine-carte-fond)",
        }}
        className="flex items-center gap-2 p-[7px] shadow-[0_8px_26px_rgba(0,0,0,0.16)]"
      >
        <BoutonBarre
          glyphe="☰"
          libelle={t.liens}
          onClick={versLePied}
        />
        <BoutonBarre
          glyphe="⌂"
          libelle={t.histoire}
          onClick={versLeHaut}
          principal
        />
        <BoutonBarre
          glyphe={favoris.nombre > 0 ? "♥" : "♡"}
          // Le compte est DANS le libellé visible et non dans une pastille à
          // part : « Favoris (3) » se lit et s'entend d'un coup, là où un
          // badge superposé demande de relier deux éléments.
          libelle={`${lang === "en" ? "Favourites" : "Favoris"} (${favoris.nombre})`}
          onClick={versLesFavoris}
          desactive={favoris.nombre === 0}
        />
      </nav>
    </div>
  );
}

function BoutonBarre({
  glyphe,
  libelle,
  onClick,
  principal = false,
  desactive = false,
}: {
  glyphe: string;
  libelle: string;
  onClick: () => void;
  principal?: boolean;
  desactive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactive}
      style={principal ? { borderRadius: "var(--vitrine-barre-rad)" } : undefined}
      className={cn(
        // `min-h-11` : cible tactile d'au moins 44 px, sur la barre que le
        // pouce atteint le plus vite et vise le moins bien.
        "flex min-h-11 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-1.5",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vitrine-primary)]",
        principal
          ? "flex-[1.2] bg-[var(--vitrine-primary)] text-[var(--vitrine-sur-primary)]"
          : "text-[var(--vitrine-sur-secondary)]",
        // `disabled:` seul aurait suffi au navigateur, pas à l'œil : un bouton
        // éteint qui garde son contraste se lit comme un bouton cassé.
        desactive && "cursor-default opacity-40",
      )}
    >
      <span aria-hidden className="text-[15px] leading-tight">
        {glyphe}
      </span>
      <span className="text-[10.5px] font-semibold leading-[1.4]">{libelle}</span>
    </button>
  );
}
