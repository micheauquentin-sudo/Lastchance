"use client";

import { useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { StyleCartesVitrine, VitrineCarteView } from "@/lib/vitrine";
import { FicheVitrine } from "@/components/vitrine/fiche-vitrine";

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
}: {
  /** Cartes ACTIVES, déjà ordonnées par le serveur. */
  cartes: VitrineCarteView[];
  styleCartes: StyleCartesVitrine;
}) {
  const rechercheId = useId();
  const [carteActiveId, setCarteActiveId] = useState<string | null>(
    cartes[0]?.id ?? null,
  );
  const [recherche, setRecherche] = useState("");
  const conteneurRef = useRef<HTMLDivElement>(null);

  const carte =
    cartes.find((c) => c.id === carteActiveId) ?? cartes[0] ?? null;

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

  if (!carte) return null;

  const changerDeCarte = (id: string) => {
    setCarteActiveId(id);
    // La recherche NE SURVIT PAS au changement de carte : un filtre invisible
    // parce qu'on regarde ailleurs fait croire que la carte est vide.
    setRecherche("");
    conteneurRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div ref={conteneurRef} className="scroll-mt-4">
      {cartes.length >= 2 ? (
        <nav aria-label="Nos cartes" className="mb-5">
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
          Rechercher dans {carte.nom}
        </label>
        <input
          id={rechercheId}
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Un plat, un ingrédient…"
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
              ? "Aucun résultat dans cette carte."
              : `${trouvees} résultat${trouvees > 1 ? "s" : ""}`
            : ""}
        </p>
      </div>

      {rubriques.length >= 2 ? (
        <nav aria-label="Rubriques" className="mb-6">
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
          {recherche.trim()
            ? "Aucun plat ne correspond à votre recherche."
            : "Cette carte est en cours de préparation."}
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
              <ul
                className={cn(
                  styleCartes === "grille"
                    ? "grid gap-3 sm:grid-cols-2"
                    : "space-y-3",
                )}
              >
                {rubrique.fiches.map((fiche) => (
                  <li key={fiche.id}>
                    <FicheVitrine fiche={fiche} styleCartes={styleCartes} />
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

/** Minuscules, sans accents : « Crème brûlée » se trouve en tapant « creme ». */
function normaliser(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
