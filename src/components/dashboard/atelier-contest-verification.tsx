import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  definitionEtapeContest,
  hrefEtapeContest,
} from "@/components/dashboard/atelier-contest-etapes";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import {
  construireVerificationContest,
  type EntreeVerificationContest,
} from "@/lib/activation/pronostics";

/**
 * ÉTAPE 6 — « La vérification ». N'ÉCRIT RIEN, NE PUBLIE PAS.
 *
 * Elle ne porte aucun bouton d'ouverture, comme l'étape 5 de l'atelier du jeu :
 * un seul écran publie — la vue suivi du championnat (`#statut`) — et un seul
 * geste y mène. Deux boutons « Ouvrir aux joueurs » à deux endroits, ce sont
 * deux vérités sur l'état d'une animation.
 */
export function AtelierContestVerification({
  entree,
}: {
  entree: EntreeVerificationContest;
}) {
  const etat = construireVerificationContest(entree);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-k-ink">Tout est-il prêt ?</h2>
        <p className="mt-1 text-sm font-semibold text-k-body">
          Cinq points, calculés sur l&apos;état réel de votre championnat.
          Chaque point en rouge renvoie à l&apos;étape qui le corrige.
        </p>
      </div>

      <ul className="space-y-2">
        {etat.controles.map((controle) => (
          <li
            key={controle.cle}
            className={`flex gap-3 rounded-2xl border-2 p-3 ${
              controle.ok
                ? "border-k-ink/25 bg-white"
                : "border-red-700/60 bg-red-50"
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
                  href={hrefEtapeContest(entree.contestId, controle.etape)}
                  className="mt-2 inline-block text-sm font-black text-k-ink underline underline-offset-2"
                >
                  {`Corriger à l'étape « ${definitionEtapeContest(controle.etape).titre} »`}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      <InfoBulle
        id="aide-verification-pronostics"
        resume="Cette liste empêche-t-elle d'ouvrir le championnat ?"
      >
        Non, et c&apos;est volontaire : ouvrir aux joueurs reste possible même
        avec un point en rouge — vous saurez simplement lequel. Rien ne vérifie
        ces points côté serveur : un championnat sans match, sans question et
        sans lot s&apos;ouvre sans broncher, et vos clients découvrent une page
        vide. Cette liste relit ce qui est ENREGISTRÉ, pas ce que vous venez de
        taper.
      </InfoBulle>

      {etat.toutPret ? (
        <div className="rounded-2xl border-2 border-k-ink bg-k-green/30 p-4">
          <p className="text-sm font-black text-k-ink">
            Rien ne manque. Il ne reste qu&apos;à ouvrir le championnat à vos
            clients.
          </p>
          <Link
            href={etat.ctaHref}
            className="k-btn-sm mt-3 inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
          >
            Tout est prêt — Ouvrir aux joueurs
          </Link>
          <p className="mt-2 text-xs font-bold text-k-body">
            L&apos;ouverture se fait sur le suivi du championnat : c&apos;est le
            seul endroit qui publie.
          </p>
        </div>
      ) : (
        <p className="rounded-2xl border-2 border-k-ink/25 bg-k-bg p-4 text-sm font-bold text-k-body">
          Corrigez les points en rouge, puis revenez ici. Vous pouvez tout de
          même ouvrir le championnat depuis{" "}
          <Link
            href={etat.ctaHref}
            className="font-black text-k-ink underline underline-offset-2"
          >
            le suivi du championnat
          </Link>{" "}
          — rien ne vous en empêche, mais vos clients rencontreront ce qui est
          listé ci-dessus.
        </p>
      )}
    </Card>
  );
}
