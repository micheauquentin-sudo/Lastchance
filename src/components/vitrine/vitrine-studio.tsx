"use client";

import { useEffect, useRef, useState } from "react";
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
import { cartesExemple } from "@/components/vitrine/studio/exemples";
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
  const [exemples, setExemples] = useState(false);
  const [etat, setEtat] = useState<EtatStudio>(() =>
    etatInitialStudio(themeInitial, {
      secteur: identiteInitiale.secteur,
      accroche: identiteInitiale.accroche,
      histoire: identiteInitiale.histoire,
      horaires: identiteInitiale.horaires,
      badge: identiteInitiale.badge,
    }),
  );

  /**
   * L'ENREGISTREMENT EST AUTOMATIQUE (VIT-30) — et c'est un RENVERSEMENT.
   *
   * VIT-17 puis ADR-137 posaient l'inverse en toutes lettres : « rien n'est
   * enregistré tant qu'on n'a pas enregistré », au nom de la promesse d'un
   * studio — essayer sans conséquence. L'argument se tenait ; il a été démenti
   * par l'usage, et c'est le propriétaire qui l'a tranché : « il faut un
   * enregistrement automatique à chaque changement afin de ne rien perdre ».
   *
   * Ce que l'argument d'origine n'avait pas vu : on ne règle pas une vitrine
   * d'un trait. On ouvre le studio, on bouge trois curseurs, on part voir un
   * client, on revient. Un travail perdu parce qu'on n'a pas cliqué coûte
   * infiniment plus cher qu'un essai enregistré — d'autant que la vitrine
   * PUBLIÉE est la seule chose qu'un client voit, et qu'un essai malheureux
   * s'y corrige en trois secondes.
   *
   * ── PAS DE TOAST, ET C'EST NÉCESSAIRE ──
   *
   * Un message à chaque frappe rendrait l'écran inutilisable. L'état
   * d'enregistrement se lit désormais dans le bandeau, en une ligne discrète —
   * la même information, sans l'interruption.
   */
  const { state, pending, onSubmit } = useActionForm(saveVitrineSettings, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  const formulaire = useRef<HTMLFormElement | null>(null);
  const premierRendu = useRef(true);

  // DÉRIVÉ, JAMAIS STOCKÉ. Une première version gardait l'heure du dernier
  // succès dans un état posé depuis un effet — ce qu'ESLint refuse à juste
  // titre : un état qui ne fait que recopier une autre valeur finit par en
  // diverger. `state` porte déjà le dernier verdict du SERVEUR, et c'est lui
  // qui compte — pas ce que l'écran a tenté d'envoyer.
  const dejaEnregistre = state?.ok === true;

  useEffect(() => {
    // OUVRIR LE STUDIO N'ÉCRIT RIEN. Sans cette garde, le simple affichage
    // poserait en base l'état résolu — donc les vingt-cinq défauts d'allure —
    // sur une vitrine dont le commerçant n'a rien touché. C'est exactement le
    // piège que VIT-19 a passé un lot à défaire.
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }
    if (!peutEditer) return;

    // LE DÉLAI EST CE QUI REND LA CHOSE TENABLE : un curseur d'allure émet une
    // valeur par pixel parcouru. Sans lui, traverser « Arrondi » enverrait
    // vingt-quatre écritures. `useActionForm` sait déjà rejouer une soumission
    // arrivée pendant qu'une autre vole — le débours ne fait que réduire le
    // nombre de départs.
    const t = setTimeout(() => {
      formulaire.current?.requestSubmit();
    }, 1200);
    return () => clearTimeout(t);
  }, [etat, peutEditer]);


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
      <form
        id={ID_FORMULAIRE}
        ref={formulaire}
        onSubmit={onSubmit}
        className="hidden"
      >
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
              <>
                {/* L'ÉTAT SE LIT, IL NE S'INTERROMPT PAS. `aria-live="polite"`
                    et non `assertive` : un lecteur d'écran doit l'annoncer
                    entre deux phrases, jamais couper celle en cours. */}
                <span
                  aria-live="polite"
                  className="text-xs font-semibold text-zinc-500"
                >
                  {pending
                    ? "Enregistrement…"
                    : dejaEnregistre
                      ? "Modifications enregistrées"
                      : "Enregistrement automatique"}
                </span>
                {/* LE BOUTON RESTE, MÊME AVEC L'AUTOMATISME. Il sert à qui
                    veut partir tout de suite : cliquer envoie sans attendre le
                    délai, et donne la certitude que rien n'est en vol. */}
                <Button type="submit" form={ID_FORMULAIRE} disabled={pending}>
                  {pending ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {/* L'INTERRUPTEUR D'EXEMPLES (VIT-28) — dans le BANDEAU, pas dans une
            page.

            Il ne dépend d'aucune page : on veut juger une densité en réglant
            l'allure, un style de fiche en composant sa carte, une couleur en
            choisissant ses jeux. Le poser dans « La carte » aurait obligé à
            quitter ce qu'on règle pour aller allumer de quoi le regarder.

            IL N'ENTRE PAS DANS `EtatStudio`, et c'est délibéré : cet état-là
            est ce qui PART au serveur (`ChampsCachesStudio` le sérialise en
            entier). Une préférence d'affichage n'a rien à y faire — l'y mettre
            aurait été le premier pas vers un réglage de confort enregistré
            sans que personne l'ait demandé. */}
        <div className="flex flex-wrap items-center gap-3 px-4 pb-2 sm:px-6">
          <label className="flex items-center gap-2 text-xs font-black text-k-ink">
            <input
              type="checkbox"
              checked={exemples}
              onChange={(e) => setExemples(e.target.checked)}
              className="size-4 shrink-0 accent-k-orange-text"
            />
            Voir avec des exemples
          </label>
          <span className="text-xs text-zinc-500">
            Remplit l&apos;aperçu de fiches de votre métier, le temps de juger un
            style. Jamais enregistrées.
          </span>
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
        {/* LA COLONNE DE GAUCHE S'ÉLARGIT POUR LA CARTE, ET SEULEMENT POUR
            ELLE (VIT-26).

            Les trois autres pages tiennent dans 340 px : ce sont des champs et
            des cases, à un seul niveau. L'éditeur de carte, lui, est imbriqué
            sur trois rangs — carte, rubrique, fiche — et chaque rang mange sa
            marge : le formulaire d'une fiche dépliée finissait à ~195 px, ce
            qui reste utilisable mais se saisit mal.

            ÉCARTÉ : élargir partout. La largeur perdue est prise à l'APERÇU,
            qui est la raison d'être de cet écran ; la payer sur les trois
            pages qui n'en ont pas besoin aurait été un mauvais échange.

            ÉCARTÉ AUSSI : passer cette page à deux colonnes en masquant
            l'allure. Régler une densité ou une taille de photo se fait EN
            REGARDANT une vraie carte — c'est précisément sur cette page que la
            colonne de droite sert le plus. */}
        <aside
          className={`w-full shrink-0 space-y-4 overflow-y-auto rounded-2xl border-2 border-k-ink bg-white p-4 lg:h-full ${
            page === "carte" ? "lg:w-[540px]" : "lg:w-[420px]"
          }`}
        >
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
          cartes={exemples ? cartesExemple(etat.secteur) : cartes}
          liens={liens}
          slug={slug}
          exemples={exemples}
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
