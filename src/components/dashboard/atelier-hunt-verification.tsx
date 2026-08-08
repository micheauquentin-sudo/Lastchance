import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  definitionEtapeChasse,
  hrefEtapeChasse,
} from "@/components/dashboard/atelier-hunt-etapes";
import {
  construireVerificationChasse,
  type EntreeVerificationChasse,
} from "@/lib/activation/hunts";
import { InfoBulle } from "@/components/dashboard/info-bulle";

/**
 * ÉTAPE 4 — « La vérification » de la chasse. N'ÉCRIT RIEN, NE PUBLIE PAS.
 *
 * Un seul écran ouvre une chasse aux joueurs : la vue suivi, ancre `#statut`.
 * Deux boutons « Ouvrir aux joueurs » à deux endroits, ce serait deux vérités
 * sur l'état d'une animation. Ici on vérifie, puis on renvoie.
 */
export function AtelierVerificationChasse({
  entree,
}: {
  entree: EntreeVerificationChasse;
}) {
  const etat = construireVerificationChasse(entree);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-k-ink">Tout est-il prêt ?</h2>
        <p className="mt-1 text-sm font-semibold text-k-body">
          Quatre points, calculés sur l&apos;état réel de votre chasse. Chaque
          point en rouge renvoie à l&apos;étape qui le corrige.
        </p>
      </div>

      <ul className="space-y-2">
        {etat.controles.map((controle) => (
          <li
            key={controle.cle}
            className={`flex gap-3 rounded-2xl border-2 p-3 ${
              controle.ok ? "border-k-ink/25 bg-white" : "border-red-700/60 bg-red-50"
            }`}
          >
            <span
              aria-hidden
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-k-ink text-sm font-black ${
                controle.ok ? "bg-k-green text-k-bg" : "bg-white text-red-700"
              }`}
            >
              {controle.ok ? "✓" : "✗"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-k-ink">
                <span className="sr-only">
                  {controle.ok ? "Prêt : " : "À corriger : "}
                </span>
                {controle.titre}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-k-body">
                {controle.detail}
              </p>
              {!controle.ok && (
                <Link
                  href={hrefEtapeChasse(entree.huntId, controle.etape)}
                  className="mt-2 inline-block text-sm font-black text-k-ink underline underline-offset-2"
                >
                  Corriger à l&apos;étape «{" "}
                  {definitionEtapeChasse(controle.etape).titre} »
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      <InfoBulle
        id="aide-verification-chasse"
        resume="Que vérifie cette liste, exactement ?"
      >
        Elle relit ce qui est enregistré, pas ce que vous venez de taper. Les
        deux premiers points sont ceux que l&apos;ouverture aux joueurs exige
        vraiment ; les deux autres sont des pièges que rien ne bloque — un stock
        épuisé, une date de fin dépassée. Elle n&apos;empêche rien : ouvrir
        reste possible avec un point en rouge, vous saurez simplement lequel.
      </InfoBulle>

      {etat.toutPret ? (
        <div className="rounded-2xl border-2 border-k-ink bg-k-green/30 p-4">
          <p className="text-sm font-black text-k-ink">
            Rien ne manque. Il ne reste qu&apos;à ouvrir la chasse à vos clients.
          </p>
          <Link
            href={etat.ctaHref}
            className="k-btn-sm mt-3 inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
          >
            Tout est prêt — Ouvrir aux joueurs
          </Link>
          <p className="mt-2 text-xs font-bold text-k-body">
            L&apos;ouverture se fait sur l&apos;écran de suivi de la chasse :
            c&apos;est le seul endroit qui publie.
          </p>
        </div>
      ) : (
        <p className="rounded-2xl border-2 border-k-ink/25 bg-k-bg p-4 text-sm font-bold text-k-body">
          Corrigez les points en rouge, puis revenez ici. Vous pouvez tout de
          même ouvrir la chasse depuis{" "}
          <Link
            href={etat.ctaHref}
            className="font-black text-k-ink underline underline-offset-2"
          >
            l&apos;écran de suivi
          </Link>{" "}
          — rien ne vous en empêche, mais vos joueurs rencontreront ce qui est
          listé ci-dessus.
        </p>
      )}
    </Card>
  );
}
