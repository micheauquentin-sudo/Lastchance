import Link from "next/link";
import { useId } from "react";
import { Card } from "@/components/ui/card";
import type { ConseilCommercant } from "@/lib/conseiller-commercant";

type ConseillerPanelProps = {
  conseils: ConseilCommercant[];
};

/**
 * Conseiller commerçant : un panneau sobre et informatif qui affiche des
 * conseils calculés côté serveur (actions utiles, modules pertinents,
 * découvertes). Décision propriétaire : ton NEUTRE, factuel, sans incitation
 * commerciale — le texte vient du backend, ce composant ne le réécrit jamais.
 *
 * Aucun appel externe, aucune IA : le composant ne fait que rendre la liste.
 *
 * Une liste vide n'est pas une carte vide : il n'y a rien d'utile à dire, donc
 * le panneau disparaît (rend `null`) plutôt que d'afficher un encart creux.
 *
 * Un `href` n'est rendu que s'il est fourni : le backend l'a déjà filtré par
 * rôle (`lienSelonRole`), ce composant ne fabrique aucune destination et ne
 * transforme jamais un conseil sans lien en bouton mort.
 */
export function ConseillerPanel({ conseils }: ConseillerPanelProps) {
  const headingId = useId();
  if (conseils.length === 0) return null;

  // `priorite` : plus haut = plus urgent (contrat backend), donc affiché en
  // premier. Le backend rend déjà la liste ordonnée ; on la re-trie par sûreté,
  // dans le MÊME sens, sur une copie défensive pour ne pas muter la prop.
  const ordonnes = [...conseils].sort((a, b) => b.priorite - a.priorite);

  return (
    <section aria-labelledby={headingId} className="mb-8">
      <Card className="space-y-4 bg-k-bg">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-k-orange">
            Conseiller
          </p>
          <h2 id={headingId} className="mt-1 text-xl font-black text-k-ink">
            Conseils
          </h2>
          <p className="mt-1 text-sm font-bold text-k-body">
            Des repères utiles pour tirer parti de votre espace.
          </p>
        </div>

        <ul className="space-y-3">
          {ordonnes.map((conseil) => (
            <li
              key={conseil.key}
              className="flex items-start gap-3 rounded-2xl border-2 border-k-ink/30 bg-white p-3"
            >
              <CategorieBadge categorie={conseil.categorie} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-k-body">
                  {conseil.texte}
                </span>
                {conseil.href && (
                  <Link
                    href={conseil.href}
                    aria-label={`${libelleLien(conseil.categorie)} : ${conseil.texte}`}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-black text-k-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
                  >
                    {libelleLien(conseil.categorie)}
                    <svg
                      aria-hidden
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <path
                        d="M3 8h10M9 4l4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** Le libellé du lien suit la nature du conseil, sans impératif commercial. */
function libelleLien(categorie: ConseilCommercant["categorie"]): string {
  return categorie === "module" || categorie === "decouverte" ? "Ouvrir" : "Voir";
}

/**
 * Une puce discrète distingue les trois natures de conseil sans surcharge :
 * un petit libellé neutre suffit à situer le conseil.
 */
function CategorieBadge({
  categorie,
}: {
  categorie: ConseilCommercant["categorie"];
}) {
  const { label, tone } = CATEGORIES[categorie];
  return (
    <span
      className={`shrink-0 rounded-full border-2 border-k-ink px-2 py-0.5 text-xs font-black text-k-ink ${tone}`}
    >
      {label}
    </span>
  );
}

const CATEGORIES: Record<
  ConseilCommercant["categorie"],
  { label: string; tone: string }
> = {
  operationnel: { label: "À faire", tone: "bg-white" },
  module: { label: "Module", tone: "bg-k-yellow/40" },
  decouverte: { label: "À découvrir", tone: "bg-k-green/30" },
};
