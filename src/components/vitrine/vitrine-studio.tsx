"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import { saveVitrineSettings } from "@/actions/vitrine";
import { ApercuStudio } from "@/components/vitrine/studio/apercu";
import { ChampsCachesStudio } from "@/components/vitrine/studio/champs-caches";
import {
  basculerBloc,
  etatInitialStudio,
  type EtatStudio,
} from "@/components/vitrine/studio/etat";
import { PageIdentiteStudio } from "@/components/vitrine/studio/page-identite";
import { PageCarteStudio } from "@/components/vitrine/studio/page-carte";
import { PageALaUneStudio } from "@/components/vitrine/studio/page-alaune";
import { PageJeuxStudio } from "@/components/vitrine/studio/page-jeux";
import { PanneauAllure } from "@/components/vitrine/studio/panneau-allure";
import {
  PAGES_STUDIO,
  parsePageStudio,
  type PageStudio,
} from "@/components/vitrine/studio/pages";
import type {
  AllureVitrine,
  SecteurVitrine,
  ThemeVitrine,
  VitrineCarteView,
  ContenuVitrineView,
  VitrineLiensView,
} from "@/lib/vitrine";

/**
 * LE STUDIO DE LA VITRINE — l'écran central de configuration (VIT-17 → VIT-20).
 *
 * ── POURQUOI UNE PAGE ENTIÈRE, HORS DU TABLEAU DE BORD ──
 *
 * Personnaliser une page se fait EN LA REGARDANT. Cette route vit hors de
 * `/dashboard`, exactement comme `/poster/[id]` : ce n'est pas une astuce de
 * mise en page, c'est ce qui fait disparaître la colonne de navigation et rend
 * l'écran entier à l'aperçu.
 *
 * ── CE FICHIER EST UNE COQUILLE, ET IL LE RESTE ──
 *
 * Il tient trois choses et rien d'autre : l'état des réglages, la charge utile
 * du formulaire, et la page affichée. Chaque page vit dans SON fichier
 * (`studio/page-*.tsx`), la colonne de droite dans le sien, l'aperçu dans le
 * sien.
 *
 * Ce n'est pas du rangement : sans cette découpe, chaque lot du chantier
 * « le studio devient l'écran central » aurait modifié le même fichier, donc
 * se serait attendu l'un l'autre. Là, ils sont disjoints.
 *
 * ── UN SEUL FORMULAIRE, VIDE, ET C'EST LA CLÉ DE TOUT ──
 *
 * Le studio héberge des blocs qui ont LEUR PROPRE action serveur : le logo, la
 * bannière, bientôt la carte et les liens sociaux. Chacun porte donc son
 * `<form>`. Or un `<form>` dans un `<form>` n'est pas du HTML valide : le
 * navigateur déplie en silence, l'hydratation échoue, et TOUTE l'interactivité
 * de l'écran tombe — le défaut livré en VIT-16, que garde
 * `reglages-formulaires.test.tsx`.
 *
 * La sortie est dans le HTML lui-même : un champ peut appartenir à un
 * formulaire QUI NE LE CONTIENT PAS, par l'attribut `form`. Le formulaire de
 * réglages est donc réduit à ses champs cachés, posé en VOISIN de la mise en
 * page ; le bouton « Enregistrer » le vise par son identifiant. Les autres
 * formulaires sont ses frères, jamais ses descendants.
 *
 * ── ET AUCUN CONTRÔLE VISIBLE NE PORTE DE `name` ──
 *
 * Une page qu'on quitte est DÉMONTÉE. Si ses champs portaient leur `name`,
 * aller composer sa carte ferait disparaître l'accroche du formulaire, et
 * l'enregistrement suivant l'effacerait — exactement le défaut que VIT-19
 * vient de fermer côté serveur, réintroduit par la navigation. La charge utile
 * est donc rendue en entier, à chaque rendu, depuis l'état : voir
 * `ChampsCachesStudio`.
 */
const ID_FORMULAIRE = "studio-reglages";

export function VitrineStudio({
  slug,
  identiteInitiale,
  themeInitial,
  cartes,
  liens,
  contenus,
  duoPossede,
  bandePossede,
  nbFichesDuo,
  peutEditer,
}: {
  slug: string;
  identiteInitiale: {
    nom: string;
    logoUrl: string | null;
    coverPath: string | null;
    coverAlt: string | null;
    accroche: string;
    histoire: string;
    horaires: string;
    badge: string;
    secteur: SecteurVitrine;
  };
  themeInitial: ThemeVitrine;
  cartes: VitrineCarteView[];
  liens: VitrineLiensView;
  contenus: ContenuVitrineView[];
  /** Le droit du JEU, pas celui de la vitrine — clé par produit (20261020120000). */
  duoPossede: boolean;
  bandePossede: boolean;
  /** Le COMPTE, pas le plateau : il décide du « prêt / pas prêt » du bilan. */
  nbFichesDuo: number;
  peutEditer: boolean;
}) {
  const [page, setPage] = useState<PageStudio>(() => parsePageStudio(null));
  const [etat, setEtat] = useState<EtatStudio>(() =>
    etatInitialStudio(themeInitial, {
      secteur: identiteInitiale.secteur,
      accroche: identiteInitiale.accroche,
      histoire: identiteInitiale.histoire,
      horaires: identiteInitiale.horaires,
      badge: identiteInitiale.badge,
    }),
  );

  const { state, pending, onSubmit } = useActionForm(saveVitrineSettings, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Vitrine enregistrée.",
  });

  const majEtat = (patch: Partial<EtatStudio>) =>
    setEtat((e) => ({ ...e, ...patch }));

  const majAllure = <K extends keyof AllureVitrine>(
    cle: K,
    valeur: AllureVitrine[K],
  ) => setEtat((e) => ({ ...e, allure: { ...e.allure, [cle]: valeur } }));

  return (
    <div className="min-h-dvh bg-k-bg">
      {/* LE FORMULAIRE DE RÉGLAGES — VIDE DE MISE EN PAGE, PLEIN DE CHAMPS.
          Il est le VOISIN de la mise en page, jamais son parent : c'est ce qui
          autorise les formulaires du logo, de la bannière et de la carte à
          coexister sans imbrication. */}
      <form id={ID_FORMULAIRE} onSubmit={onSubmit} className="hidden">
        <ChampsCachesStudio etat={etat} />
      </form>

      <div className="sticky top-0 z-40 border-b-2 border-k-ink bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/dashboard/vitrine"
              className="rounded-xl border-2 border-k-ink bg-white px-3 py-1.5 text-sm font-black text-k-ink hover:bg-k-yellow"
            >
              ← Retour
            </Link>
            <span className="truncate text-sm font-black text-k-ink">
              Mon studio
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FieldError message={state && !state.ok ? state.error : undefined} />
            {peutEditer ? (
              <Button type="submit" form={ID_FORMULAIRE} disabled={pending}>
                {pending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            ) : null}
          </div>
        </div>

        {/* LE FIL DES PAGES — des BOUTONS, pas des liens. Changer de page ne
            doit pas naviguer : l'état vit en mémoire, et une navigation le
            perdrait avec tout ce que le commerçant est en train d'essayer. */}
        <nav
          aria-label="Pages du studio"
          className="flex gap-1 overflow-x-auto px-4 pb-2 sm:px-6"
        >
          {PAGES_STUDIO.map((p) => (
            <button
              key={p.cle}
              type="button"
              onClick={() => setPage(p.cle)}
              aria-current={page === p.cle ? "page" : undefined}
              className={
                page === p.cle
                  ? "shrink-0 rounded-xl border-2 border-k-ink bg-k-ink px-3 py-1.5 text-xs font-black text-white"
                  : "shrink-0 rounded-xl border-2 border-k-ink/20 bg-white px-3 py-1.5 text-xs font-black text-k-ink hover:border-k-ink"
              }
            >
              {p.titre}
            </button>
          ))}
        </nav>
      </div>

      {/* LES TROIS COLONNES — chacune défile CHEZ ELLE.
          Sans `overflow-hidden` au-dessus, régler une couleur en bas du panneau
          droit fait défiler l'aperçu hors de l'écran : on règle alors ce qu'on
          ne voit plus. Motif de `poster-editor`. */}
      <div className="flex flex-col gap-4 p-4 lg:h-[calc(100dvh-104px)] lg:flex-row lg:items-stretch lg:overflow-hidden">
        <aside className="w-full shrink-0 space-y-4 overflow-y-auto rounded-2xl border-2 border-k-ink bg-white p-4 lg:h-full lg:w-[340px]">
          {page === "identite" ? (
            <PageIdentiteStudio
              etat={etat}
              majEtat={majEtat}
              logoUrl={identiteInitiale.logoUrl}
              coverPath={identiteInitiale.coverPath}
              coverAlt={identiteInitiale.coverAlt}
              peutEditer={peutEditer}
            />
          ) : null}
          {page === "carte" ? (
            <PageCarteStudio
              nbCartes={cartes.length}
              cartes={cartes}
              peutEditer={peutEditer}
            />
          ) : null}
          {page === "alaune" ? (
            <PageALaUneStudio
              contenus={contenus}
              liens={liens}
              socialVisible={etat.blocs.includes("social")}
              onSocialVisible={(v) =>
                majEtat({ blocs: basculerBloc(etat.blocs, "social", v) })
              }
              peutEditer={peutEditer}
            />
          ) : null}
          {page === "jeux" ? (
            <PageJeuxStudio
              jeuxVisibles={etat.blocs.includes("experiences")}
              duoPossede={duoPossede}
              bandePossede={bandePossede}
              nbFichesDuo={nbFichesDuo}
              themeInitial={themeInitial}
              secteur={etat.secteur}
              peutEditer={peutEditer}
            />
          ) : null}
        </aside>

        <ApercuStudio
          etat={etat}
          themeBase={themeInitial}
          nom={identiteInitiale.nom}
          logoUrl={identiteInitiale.logoUrl}
          coverPath={identiteInitiale.coverPath}
          coverAlt={identiteInitiale.coverAlt}
          cartes={cartes}
          liens={liens}
          slug={slug}
        />

        <PanneauAllure
          etat={etat}
          majAllure={majAllure}
          majEtat={majEtat}
          peutEditer={peutEditer}
        />
      </div>
    </div>
  );
}
