import Link from "next/link";
import type { EtapeAtelier } from "@/components/dashboard/atelier-etapes";

/**
 * LE FIL DES ÉTAPES — Server Component, aucun état, aucun module en dur.
 *
 * Les étapes sont LIBREMENT navigables : rien n'est verrouillé derrière une
 * précédente. Un commerçant qui veut d'abord regarder ses lots n'a pas à
 * inventer une mécanique pour y arriver, et celui qui revient sur son jeu
 * après trois jours retombe où il veut. La seule étape qui juge est celle de
 * vérification, et elle juge l'état réel, pas le chemin parcouru.
 *
 * Le composant ne sait NI quel module il sert, NI comment se fabrique une URL :
 * `hrefPour` lui est passé par la page, qui seule connaît sa base et ses
 * porteurs de query.
 *
 * Vocabulaire visuel repris de la Carte de l'Aventure (pastille numérotée,
 * bordure encre, étape courante sur k-yellow) : c'est le même geste produit,
 * il ne mérite pas un second langage.
 */
export function AtelierStepper({
  etapes,
  courante,
  hrefPour,
}: {
  etapes: readonly EtapeAtelier[];
  courante: string;
  hrefPour: (cle: string) => string;
}) {
  return (
    <nav aria-label="Étapes de l'atelier" className="mb-6">
      <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {etapes.map((etape, index) => {
          const active = etape.cle === courante;
          return (
            <li key={etape.cle}>
              <Link
                href={hrefPour(etape.cle)}
                aria-current={active ? "step" : undefined}
                className={`flex h-full items-center gap-3 rounded-2xl border-2 p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink ${
                  active
                    ? "border-k-ink bg-k-yellow text-k-ink shadow-[3px_3px_0_rgba(33,29,22,0.9)]"
                    : "border-k-ink/40 bg-white text-k-body hover:border-k-ink hover:bg-k-yellow/30"
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-k-ink text-sm font-black ${
                    active ? "bg-white text-k-ink" : "bg-k-bg text-k-ink"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black">{etape.titre}</span>
                  {etape.resume && (
                    <span className="mt-0.5 block text-xs font-bold leading-4">
                      {etape.resume}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Le pied de chaque étape : précédent / suivant, en plus du fil du haut.
 *
 * Deux chemins pour le même geste, volontairement : le fil sert à SAUTER, ces
 * liens servent à AVANCER — c'est le mouvement du commerçant qui déroule son
 * atelier pour la première fois, sur un téléphone, sans remonter en haut de
 * page.
 */
export function AtelierNavigationEtape({
  precedente,
  suivante,
  hrefPour,
}: {
  precedente: EtapeAtelier | null;
  suivante: EtapeAtelier | null;
  hrefPour: (cle: string) => string;
}) {
  if (!precedente && !suivante) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t-2 border-k-ink/15 pt-4">
      {precedente ? (
        <Link
          href={hrefPour(precedente.cle)}
          className="text-sm font-bold text-k-body hover:text-k-ink"
        >
          ← {precedente.titre}
        </Link>
      ) : (
        <span />
      )}
      {suivante ? (
        <Link
          href={hrefPour(suivante.cle)}
          className="text-sm font-bold text-k-body hover:text-k-ink"
        >
          Passer à {suivante.titre} →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
