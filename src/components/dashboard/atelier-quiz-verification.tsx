import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  definitionEtapeQuiz,
  hrefEtapeQuiz,
} from "@/components/dashboard/atelier-quiz-etapes";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import {
  verificationQuiz,
  type EntreeVerificationQuiz,
} from "@/lib/activation/quiz";

/**
 * ÉTAPE 4 — « La vérification » du quiz. N'ÉCRIT RIEN, NE PUBLIE PAS.
 *
 * Les trois points bloquants sont EXACTEMENT ceux que l'action `setQuizStatus`
 * applique — même module, `src/lib/activation/quiz.ts` —, mais ils sont
 * calculés AVANT le clic. S'y ajoutent les avertissements que le serveur ne
 * regarde pas : une roue offerte qui ne peut rien distribuer, un stock déjà
 * consommé, un tirage différé qui attend un geste.
 *
 * Le CTA renvoie sur `#statut` de la vue suivi : un seul écran publie.
 */
export function AtelierQuizVerification({
  quizId,
  entree,
}: {
  quizId: string;
  entree: EntreeVerificationQuiz;
}) {
  const etat = verificationQuiz(entree);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-k-ink">Tout est-il prêt ?</h2>
        <p className="mt-1 text-sm font-semibold text-k-body">
          Calculé sur ce qui est ENREGISTRÉ, pas sur ce que vous venez de taper.
          Chaque point en rouge renvoie à l&apos;étape qui le corrige.
        </p>
      </div>

      <ul className="space-y-2">
        {etat.controles.map((controle) => {
          const alerte = !controle.ok && !controle.bloquant;
          return (
            <li
              key={controle.cle}
              className={`flex gap-3 rounded-2xl border-2 p-3 ${
                controle.ok
                  ? "border-k-ink/25 bg-white"
                  : alerte
                    ? "border-amber-400 bg-amber-50"
                    : "border-red-700/60 bg-red-50"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-k-ink text-sm font-black ${
                  controle.ok
                    ? "bg-k-green text-k-bg"
                    : alerte
                      ? "bg-white text-amber-700"
                      : "bg-white text-red-700"
                }`}
              >
                {controle.ok ? "✓" : alerte ? "!" : "✗"}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-k-ink">
                  <span className="sr-only">
                    {controle.ok
                      ? "Prêt : "
                      : alerte
                        ? "À savoir : "
                        : "À corriger : "}
                  </span>
                  {controle.titre}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-k-body">
                  {controle.detail}
                </p>
                {!controle.ok && controle.etape && (
                  <Link
                    href={hrefEtapeQuiz(quizId, controle.etape)}
                    className="mt-2 inline-block text-sm font-black text-k-ink underline underline-offset-2"
                  >
                    Corriger à l&apos;étape «{" "}
                    {definitionEtapeQuiz(controle.etape).titre} »
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <InfoBulle
        id="aide-verification-quiz"
        resume="Qu'est-ce qui empêche vraiment d'ouvrir ?"
      >
        Les points en rouge, et eux seuls : le serveur refuse l&apos;ouverture
        tant qu&apos;il manque une question, le libellé du lot ou son stock. Les
        points orange n&apos;empêchent rien — ils décrivent ce que vos clients
        rencontreraient si vous ouvriez malgré tout.
      </InfoBulle>

      {etat.toutPret ? (
        <div className="rounded-2xl border-2 border-k-ink bg-k-green/30 p-4">
          <p className="text-sm font-black text-k-ink">
            Rien ne manque. Il ne reste qu&apos;à ouvrir le quiz à vos clients.
          </p>
          <Link
            href={`/dashboard/quiz/${quizId}#statut`}
            className="k-btn-sm mt-3 inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
          >
            Tout est prêt — Ouvrir aux joueurs
          </Link>
          <p className="mt-2 text-xs font-bold text-k-body">
            L&apos;ouverture se fait sur le suivi du quiz : c&apos;est le seul
            endroit qui publie.
          </p>
        </div>
      ) : (
        <p className="rounded-2xl border-2 border-k-ink/25 bg-k-bg p-4 text-sm font-bold text-k-body">
          Corrigez les points en rouge, puis revenez ici. L&apos;ouverture se
          fait depuis{" "}
          <Link
            href={`/dashboard/quiz/${quizId}#statut`}
            className="font-black text-k-ink underline underline-offset-2"
          >
            le suivi du quiz
          </Link>
          .
        </p>
      )}
    </Card>
  );
}
