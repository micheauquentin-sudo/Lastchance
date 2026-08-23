"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cn } from "@/lib/utils";
import type {
  ActionVitrine,
  LangueVitrine,
  StyleCartesVitrine,
  VitrineCarteView,
} from "@/lib/vitrine";
import { PorteVitrine } from "@/components/vitrine/porte-vitrine";
import { FicheVitrine } from "@/components/vitrine/fiche-vitrine";
import { TEXTES_VITRINE } from "@/components/vitrine/langue";

/**
 * LE CATALOGUE PUBLIC — cartes, rubriques, fiches.
 *
 * ── POURQUOI C'EST LE SEUL BLOC CLIENT DE LA PAGE ──
 *
 * L'identité, l'histoire, les horaires et les liens sont du texte : ils sont
 * rendus par le serveur et ne coûtent rien au téléphone du client attablé. Trois
 * choses seulement ont besoin d'état — l'onglet de carte, la recherche, le
 * défilement vers une rubrique — et elles vivent ici, dans un composant unique.
 * En découper trois aurait fait remonter l'état dans un quatrième.
 *
 * ── LES ONGLETS N'APPARAISSENT QU'À PARTIR DE DEUX CARTES ──
 *
 * Un onglet unique n'est pas une navigation, c'est un titre déguisé en bouton :
 * il fait chercher où sont les autres. Le commerçant qui n'a qu'une carte
 * obtient donc la carte, directement.
 *
 * Ce sont des BOUTONS `aria-pressed` et non un `role="tablist"` : un vrai motif
 * d'onglets impose la navigation par flèches et un `tabpanel` par onglet, pour
 * un contenu qui est ici une simple liste filtrée. `aria-pressed` dit
 * exactement ce qui se passe — « Carte du midi, activé » — sans promettre un
 * clavier qu'on n'implémente pas.
 *
 * ── LA RECHERCHE EST LOCALE, ET C'EST TOUT CE QU'ELLE DOIT ÊTRE ──
 *
 * Le benchmark la cite parmi les gestes attendus d'une carte QR. Elle porte sur
 * la carte AFFICHÉE — pas sur toutes : chercher « vin » dans la carte du midi
 * et recevoir des résultats de la carte des vins ferait basculer d'onglet sans
 * qu'on l'ait demandé. Accents ignorés : personne ne tape « crème brûlée » avec
 * ses deux accents sur un clavier de téléphone.
 */
export function CatalogueVitrine({
  cartes,
  styleCartes,
  lang,
  porteOuverte,
}: {
  /** Cartes ACTIVES, déjà ordonnées par le serveur. */
  cartes: VitrineCarteView[];
  styleCartes: StyleCartesVitrine;
  /**
   * La langue RÉELLEMENT SERVIE. Les noms de cartes, de rubriques et de fiches
   * arrivent déjà traduits par le SQL — cette prop ne pilote que le chrome de
   * l'écran (libellé de recherche, compte de résultats, états vides).
   */
  lang: LangueVitrine;
  /**
   * VIT-10 : cette porte a-t-elle vraiment quelque chose derrière ?
   *
   * La question se tranche AU-DESSUS, avec `portes` et l'état de la Boussole,
   * et descend en fonction. La faire descendre en DONNÉES aurait obligé chaque
   * rang du catalogue à porter `portes` entier pour n'en lire qu'un booléen.
   */
  porteOuverte: (action: ActionVitrine) => boolean;
}) {
  const t = TEXTES_VITRINE[lang];
  const rechercheId = useId();
  /**
   * `null` tant que le visiteur n'a rien choisi — ce n'est PAS « la première
   * carte ». La distinction porte l'ancre : un choix explicite doit primer sur
   * le fragment, et le fragment sur le défaut.
   */
  const [carteChoisieId, setCarteChoisieId] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const conteneurRef = useRef<HTMLDivElement>(null);

  /**
   * L'ANCRE D'OUVERTURE — ce qui fait qu'un QR contextuel ouvre la bonne carte.
   *
   * ── POURQUOI UN FRAGMENT ET PAS UN `searchParams` ──
   *
   * `/v/{slug}` est en ISR (`revalidate = 60`). Lire un `?carte=…` ferait
   * retomber la page en rendu par requête et supprimerait le cache — une
   * lecture de base par scan, sur une adresse publique balayable. Un fragment,
   * lui, N'EST JAMAIS ENVOYÉ AU SERVEUR : tous les QR imprimés — porte, tables,
   * chevalets — pointent sur la même url mise en cache, et le contexte se
   * résout ici, dans le navigateur.
   *
   * ── `useSyncExternalStore` ET NON UN EFFET QUI POSE UN ÉTAT ──
   *
   * L'URL est un système EXTERNE à React. La lire dans un `useState` initial
   * donnerait un rendu client différent du HTML servi (erreur d'hydratation) ;
   * la lire dans un effet qui appelle `setState` déclenche le rendu en cascade
   * que `react-hooks/set-state-in-effect` interdit — à raison. Ce hook existe
   * exactement pour ce cas : instantané serveur vide, instantané client réel,
   * et l'abonnement à `hashchange` fait suivre un second QR scanné sans quitter
   * la page.
   */
  const fragment = useSyncExternalStore(
    sAbonnerAuFragment,
    lireFragment,
    () => "",
  );
  const ancre = decoderFragment(fragment);

  const carteVisee = useMemo(() => {
    if (ancre.startsWith("carte-")) {
      const id = ancre.slice("carte-".length);
      return cartes.find((c) => c.id === id) ?? null;
    }
    if (ancre.startsWith("fiche-")) {
      const id = ancre.slice("fiche-".length);
      return (
        cartes.find((c) =>
          c.categories.some((r) => r.fiches.some((f) => f.id === id)),
        ) ?? null
      );
    }
    return null;
  }, [ancre, cartes]);

  const carte =
    cartes.find((c) => c.id === carteChoisieId) ??
    carteVisee ??
    cartes[0] ??
    null;

  const rubriques = useMemo(() => {
    if (!carte) return [];
    const terme = normaliser(recherche);
    if (!terme) return carte.categories;
    return carte.categories
      .map((rubrique) => ({
        ...rubrique,
        fiches: rubrique.fiches.filter((fiche) =>
          `${normaliser(fiche.nom)} ${normaliser(fiche.description ?? "")}`.includes(
            terme,
          ),
        ),
      }))
      .filter((rubrique) => rubrique.fiches.length > 0);
  }, [carte, recherche]);

  const trouvees = rubriques.reduce((n, r) => n + r.fiches.length, 0);

  /**
   * LE DÉFILEMENT, une fois la bonne carte rendue.
   *
   * Le navigateur ne peut pas le faire seul : à l'ouverture, la fiche visée
   * n'est dans le DOM que si sa carte est active, ce qui vient d'être décidé
   * ci-dessus. Cet effet ne pose AUCUN état — il ne fait que pousser vers un
   * système externe (le défilement), ce qui est le rôle d'un effet.
   */
  const carteRendueId = carte?.id;
  useEffect(() => {
    if (!ancre) return;
    document.getElementById(ancre)?.scrollIntoView({ block: "start" });
  }, [ancre, carteRendueId]);

  if (!carte) return null;

  const changerDeCarte = (id: string) => {
    setCarteChoisieId(id);
    // La recherche NE SURVIT PAS au changement de carte : un filtre invisible
    // parce qu'on regarde ailleurs fait croire que la carte est vide.
    setRecherche("");
    conteneurRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    // `id="carte-{id}"` sur le conteneur de la carte AFFICHÉE : l'ancre d'un QR
    // contextuel ne vaut que pour la carte ouverte, et l'effet ci-dessus l'a
    // justement ouverte avant que le défilement ne cherche l'élément.
    <div ref={conteneurRef} id={`carte-${carte.id}`} className="scroll-mt-4">
      {cartes.length >= 2 ? (
        <nav aria-label={t.nosCartes} className="mb-5">
          {/* Défilement horizontal plutôt que retour à la ligne : sept cartes
              empilées sur trois lignes repoussent le contenu hors de l'écran
              d'un téléphone, qui est l'écran de référence ici. */}
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {cartes.map((c) => {
              const active = c.id === carte.id;
              return (
                <li key={c.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => changerDeCarte(c.id)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vitrine-primary)]",
                      active
                        ? "border-[var(--vitrine-primary)] bg-[var(--vitrine-primary)] text-[var(--vitrine-sur-primary)]"
                        : "border-[var(--vitrine-primary)]/30 text-[var(--vitrine-sur-secondary)]",
                    )}
                  >
                    {c.nom}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      <div className="mb-5">
        <label
          htmlFor={rechercheId}
          className="mb-1.5 block text-sm font-semibold text-[var(--vitrine-sur-secondary)]"
        >
          {t.rechercherDans(carte.nom)}
        </label>
        <input
          id={rechercheId}
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t.recherchePlaceholder}
          // `text-base` et non `text-sm` : sous 16 px, iOS zoome à la mise au
          // point du champ et le client perd la page qu'il lisait.
          className="w-full rounded-xl border border-[var(--vitrine-primary)]/30 bg-white/70 px-4 py-3 text-base text-[var(--vitrine-sur-secondary)] placeholder:text-[var(--vitrine-sur-secondary)]/50 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--vitrine-primary)]"
        />
        {/* Le compte est annoncé, pas seulement affiché : sans lui, une
            recherche sans résultat ne se signale par rien à qui n'a pas la
            liste sous les yeux. */}
        <p
          aria-live="polite"
          className="mt-1.5 min-h-5 text-sm text-[var(--vitrine-sur-secondary)]/70"
        >
          {recherche.trim()
            ? trouvees === 0
              ? t.aucunResultat
              : t.compteResultats(trouvees)
            : ""}
        </p>
      </div>

      {rubriques.length >= 2 ? (
        <nav aria-label={t.rubriques} className="mb-6">
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {rubriques.map((rubrique) => (
              <li key={rubrique.id} className="shrink-0">
                <a
                  href={`#rubrique-${rubrique.id}`}
                  onClick={(e) => {
                    // Le `href` reste : sans JavaScript, l'ancre fonctionne
                    // quand même. Avec, on le remplace par un défilement doux —
                    // un saut sec sur une carte longue fait perdre le fil.
                    const cible = document.getElementById(
                      `rubrique-${rubrique.id}`,
                    );
                    if (!cible) return;
                    e.preventDefault();
                    cible.scrollIntoView({ behavior: "smooth", block: "start" });
                    // Le focus SUIT le défilement : sinon la tabulation
                    // suivante repartirait du haut de la page.
                    cible.focus({ preventScroll: true });
                  }}
                  className="inline-block rounded-full border border-[var(--vitrine-primary)]/25 px-3 py-1.5 text-sm font-medium text-[var(--vitrine-sur-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vitrine-primary)]"
                >
                  {rubrique.nom}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {rubriques.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--vitrine-primary)]/30 px-4 py-10 text-center text-sm text-[var(--vitrine-sur-secondary)]/70">
          {recherche.trim() ? t.aucunPlat : t.carteEnPreparation}
        </p>
      ) : (
        <div className="space-y-8">
          {rubriques.map((rubrique) => (
            <section
              key={rubrique.id}
              id={`rubrique-${rubrique.id}`}
              tabIndex={-1}
              aria-labelledby={`rubrique-titre-${rubrique.id}`}
              className="scroll-mt-4 outline-none"
            >
              <h2
                id={`rubrique-titre-${rubrique.id}`}
                className="mb-3 font-[family-name:var(--vitrine-titre)] text-lg font-bold uppercase tracking-[0.12em] text-[var(--vitrine-primary)]"
              >
                {rubrique.nom}
              </h2>

              {/* LA PORTE DE LA RUBRIQUE (VIT-10) : sous le titre, au-dessus
                  des fiches. Une rubrique entière peut ouvrir une porte que
                  ses plats ne portent pas individuellement — « nos formules »
                  vers Réserver, par exemple. */}
              {rubrique.action ? (
                <div className="mb-3">
                  <PorteVitrine
                    action={rubrique.action}
                    ouverte={porteOuverte(rubrique.action)}
                  />
                </div>
              ) : null}
              <ul
                className={cn(
                  styleCartes === "grille"
                    ? "grid gap-3 sm:grid-cols-2"
                    : "space-y-3",
                )}
              >
                {rubrique.fiches.map((fiche) => (
                  <li key={fiche.id}>
                    <FicheVitrine
                      fiche={fiche}
                      styleCartes={styleCartes}
                      lang={lang}
                      porteOuverte={porteOuverte}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * L'ABONNEMENT AU FRAGMENT — définis au niveau du module, et pas dans le
 * composant : `useSyncExternalStore` compare les fonctions par identité, et
 * deux clôtures recréées à chaque rendu le feraient se réabonner sans fin.
 */
function sAbonnerAuFragment(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function lireFragment(): string {
  return window.location.hash;
}

/**
 * Le fragment vient du VISITEUR — barre d'adresse, lien posté n'importe où.
 * `decodeURIComponent` lève `URIError` sur toute séquence de pourcentage
 * incomplète (`#%`, `#%zz`), et cet appel vit dans le corps de rendu : sans
 * garde, deux caractères dans un lien partagé remplacent la vitrine entière
 * par l'écran d'erreur (revue L12, M1). Repli : la chaîne brute — les ancres
 * réelles (`carte-{uuid}`) n'ont pas de `%`, un fragment indécodable ne
 * matchera simplement rien.
 */
export function decoderFragment(fragment: string): string {
  if (!fragment) return "";
  const brut = fragment.slice(1);
  try {
    return decodeURIComponent(brut);
  } catch {
    return brut;
  }
}

/** Minuscules, sans accents : « Crème brûlée » se trouve en tapant « creme ». */
function normaliser(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
