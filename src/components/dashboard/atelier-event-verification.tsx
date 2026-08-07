import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  hrefEtapeEvenement,
  titreEtapeEvenement,
} from "@/components/dashboard/atelier-event-etapes";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import {
  construireActivationEvent,
  type EntreeActivationEvent,
} from "@/lib/activation/events";

/**
 * DERNIÈRE ÉTAPE — « La vérification ». N'ÉCRIT RIEN, NE PUBLIE RIEN.
 *
 * Le verdict vient de `src/lib/activation/events.ts`, le MÊME module que celui
 * qu'appelle `setEventGameStatus` : ce que la liste affiche est ce que le
 * serveur opposerait. Le reste — une salle sans lot, un jeu encore fermé — ne
 * bloque rien mais coûte une soirée, et se lit ici plutôt que sur place.
 */
export function AtelierEventVerification({
  gameId,
  entree,
}: {
  gameId: string;
  entree: EntreeActivationEvent;
}) {
  const etat = construireActivationEvent(entree);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-k-ink">Tout est-il prêt ?</h2>
        <p className="mt-1 text-sm font-semibold text-k-body">
          Ces points sont calculés sur l&apos;état enregistré de votre jeu.
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
                : controle.bloquant
                  ? "border-red-700/60 bg-red-50"
                  : "border-amber-500/60 bg-amber-50"
            }`}
          >
            <span
              aria-hidden
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-k-ink text-sm font-black ${
                controle.ok
                  ? "bg-k-green text-k-bg"
                  : controle.bloquant
                    ? "bg-white text-red-700"
                    : "bg-white text-amber-700"
              }`}
            >
              {controle.ok ? "✓" : controle.bloquant ? "✗" : "!"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-k-ink">
                <span className="sr-only">
                  {controle.ok
                    ? "Prêt : "
                    : controle.bloquant
                      ? "À corriger : "
                      : "À savoir : "}
                </span>
                {controle.titre}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-k-body">
                {controle.detail}
              </p>
              {!controle.ok && controle.etape && (
                <Link
                  href={hrefEtapeEvenement(gameId, controle.etape)}
                  className="mt-2 inline-block text-sm font-black text-k-ink underline underline-offset-2"
                >
                  Corriger à l&apos;étape « {titreEtapeEvenement(controle.etape)} »
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border-2 border-k-ink/25 bg-k-bg p-4">
        <p className="text-sm font-black text-k-ink">Bon à savoir</p>
        <ul className="mt-2 space-y-1.5">
          {etat.rappels.map((rappel) => (
            <li key={rappel} className="text-sm font-semibold text-k-body">
              — {rappel}
            </li>
          ))}
        </ul>
      </div>

      <InfoBulle
        id="aide-verification-evenement"
        resume="Que vérifie cette liste, exactement ?"
      >
        Un seul point empêche réellement d&apos;ouvrir le jeu : au moins une
        question. Les points en orange n&apos;empêchent rien — une session sans
        lot s&apos;anime très bien, mais son podium n&apos;émet aucun code de
        retrait, et cela ne se découvre qu&apos;à la fin de la soirée.
      </InfoBulle>

      {etat.toutPret ? (
        <div className="rounded-2xl border-2 border-k-ink bg-k-green/30 p-4">
          <p className="text-sm font-black text-k-ink">
            Rien ne bloque l&apos;ouverture du jeu.
          </p>
          <Link
            href={`/dashboard/events/${gameId}#statut`}
            className="k-btn-sm mt-3 inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
          >
            Tout est prêt — Ouvrir aux joueurs
          </Link>
          <p className="mt-2 text-xs font-bold text-k-body">
            L&apos;ouverture se fait sur la page de suivi : c&apos;est le seul
            endroit qui publie.
          </p>
        </div>
      ) : (
        <p className="rounded-2xl border-2 border-k-ink/25 bg-k-bg p-4 text-sm font-bold text-k-body">
          Corrigez les points en rouge, puis revenez ici. Tant qu&apos;ils
          subsistent, l&apos;ouverture sera refusée depuis{" "}
          <Link
            href={`/dashboard/events/${gameId}#statut`}
            className="font-black text-k-ink underline underline-offset-2"
          >
            la page de suivi
          </Link>{" "}
          — avec ce message : « {etat.blocage} »
        </p>
      )}
    </Card>
  );
}
