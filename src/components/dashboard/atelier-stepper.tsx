import Link from "next/link";
import {
  etapeVoisine,
  type EtapeAtelier,
} from "@/components/dashboard/atelier-etapes";

/**
 * Le poids visuel d'un bouton, repris de `src/components/ui/button.tsx` : le
 * suivant est le geste principal (encre sur jaune), le précédent le geste de
 * retour (encre sur blanc). Deux couples encre-sur-fond-clair uniquement — les
 * scans axe tournent sur CHAQUE étape des huit ateliers.
 */
const BASE_LIEN_ETAPE =
  "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-k-ink px-4 py-2.5 text-sm font-black text-k-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink";

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
  const resumeCourant = etapes.find((e) => e.cle === courante)?.resume;

  return (
    <>
      {/* ── DES CASES ÉTROITES, POUR EN FAIRE TENIR PLUS ──
          Chaque case portait son résumé : « La mécanique, l'éventuel défi et
          la limite de participation. » Trois lignes de texte par étape, dans
          une grille bornée à cinq colonnes — le fil occupait la moitié de
          l'écran avant qu'on ait lu la première ligne de l'étape, et il ne
          pouvait pas grossir sans devenir un mur.

          Le résumé sort donc du fil : il ne concerne QUE l'étape ouverte, et
          il s'affiche juste en dessous, une fois. Les cases se réduisent au
          numéro et au titre.

          `auto-fit` plutôt qu'un nombre de colonnes en dur : le fil sert des
          ateliers de deux à huit étapes (la cagnotte en a deux, la roue en
          aura sept). Une grille fixée à cinq étirait les courts et repliait
          les longs ; celle-ci pose autant de colonnes que la largeur en
          accepte, à partir de 9 rem par case. */}
      <nav aria-label="Étapes de l'atelier" className="mb-4">
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
          {etapes.map((etape, index) => {
            const active = etape.cle === courante;
            return (
              <li key={etape.cle}>
                <Link
                  href={hrefPour(etape.cle)}
                  aria-current={active ? "step" : undefined}
                  className={`flex h-full items-center gap-2.5 rounded-2xl border-2 px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink ${
                    active
                      ? "border-k-ink bg-k-yellow text-k-ink shadow-[3px_3px_0_rgba(33,29,22,0.9)]"
                      : "border-k-ink/40 bg-white text-k-body hover:border-k-ink hover:bg-k-yellow/30"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-k-ink text-sm font-black ${
                      active ? "bg-white text-k-ink" : "bg-k-bg text-k-ink"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 text-sm font-black">
                    {etape.titre}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
      {/* LE RÉSUMÉ DE L'ÉTAPE OUVERTE, une fois, et hors du fil.
          Un `<p>` nu : surtout PAS un second conteneur nommé « Étape… », que
          `atelier-stepper.test.tsx` interdit — le fil au-dessus est la seule
          navigation nommée, et l'étape a déjà sa `<section>` côté page. */}
      {resumeCourant && (
        <p className="mb-5 text-sm font-bold text-k-body">{resumeCourant}</p>
      )}
      <AtelierNavigationEtape
        precedente={etapeVoisine(etapes, courante, -1)}
        suivante={etapeVoisine(etapes, courante, 1)}
        hrefPour={hrefPour}
        position="haut"
      />
    </>
  );
}

/**
 * Précédent / suivant, en plus du fil du haut. Rendu DEUX fois par étape :
 * sous le fil (`position="haut"`) et en pied d'étape (`position="bas"`).
 *
 * Deux chemins pour le même geste, volontairement : le fil sert à SAUTER, ces
 * liens servent à AVANCER — c'est le mouvement du commerçant qui déroule son
 * atelier pour la première fois, sur un téléphone. Le doublon haut/bas existe
 * parce qu'une étape longue enterrait le seul « suivant » sous un écran de
 * formulaire : on ne trouve pas la sortie d'une pièce dont on ne voit pas le
 * fond.
 *
 * Ces liens ne portent NI rôle de navigation, NI `aria-current` : le fil
 * au-dessus est la seule navigation nommée « Étapes de l'atelier », et la seule
 * à désigner l'étape courante.
 */
export function AtelierNavigationEtape({
  precedente,
  suivante,
  hrefPour,
  position = "bas",
}: {
  precedente: EtapeAtelier | null;
  suivante: EtapeAtelier | null;
  hrefPour: (cle: string) => string;
  /** « haut » se pose sous le fil des étapes, « bas » ferme l'étape. */
  position?: "haut" | "bas";
}) {
  if (!precedente && !suivante) return null;

  const habillage =
    position === "haut"
      ? "mb-6 border-b-2 border-k-ink/15 pb-4"
      : "mt-6 border-t-2 border-k-ink/15 pt-4";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 ${habillage}`}
    >
      {precedente ? (
        <Link
          href={hrefPour(precedente.cle)}
          className={`${BASE_LIEN_ETAPE} bg-white hover:bg-k-yellow/30`}
        >
          ← {precedente.titre}
        </Link>
      ) : (
        <span />
      )}
      {suivante ? (
        <Link
          href={hrefPour(suivante.cle)}
          className={`k-btn-sm ${BASE_LIEN_ETAPE} bg-k-yellow sm:min-w-[12rem]`}
        >
          Passer à {suivante.titre} →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
