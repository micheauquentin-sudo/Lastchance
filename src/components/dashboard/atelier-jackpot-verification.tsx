import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  hrefEtapeJackpot,
  titreEtapeJackpot,
} from "@/components/dashboard/atelier-jackpot-etapes";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import {
  construireActivationJackpot,
  type EntreeActivationJackpot,
} from "@/lib/activation/jackpot";
import type { EtapeAtelier } from "@/components/dashboard/atelier-etapes";

/**
 * DERNIÈRE ÉTAPE — « La vérification ». N'ÉCRIT RIEN, NE PUBLIE RIEN.
 *
 * Elle ne porte aucun bouton « Ouvrir aux joueurs » : un seul écran publie, la
 * page de suivi (`#statut`). Deux boutons d'ouverture à deux endroits, c'est
 * deux vérités sur l'état d'une cagnotte.
 *
 * Ce qu'elle affiche vient de `src/lib/activation/jackpot.ts`, le MÊME module
 * que celui qu'appelle `setJackpotCampaignStatus`. Le commerçant lit donc,
 * avant de cliquer, ce que le serveur lui opposerait — et tous les motifs à la
 * fois, au lieu d'un par tentative.
 */
export function AtelierJackpotVerification({
  campaignId,
  etapes,
  entree,
}: {
  campaignId: string;
  etapes: readonly EtapeAtelier[];
  entree: EntreeActivationJackpot;
}) {
  const etat = construireActivationJackpot(entree);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-k-ink">Tout est-il prêt ?</h2>
        <p className="mt-1 text-sm font-semibold text-k-body">
          Ces points sont calculés sur l&apos;état enregistré de votre cagnotte,
          pas sur ce que vous venez de taper. Chaque point en rouge renvoie à
          l&apos;étape qui le corrige.
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
                  href={hrefEtapeJackpot(campaignId, controle.etape)}
                  className="mt-2 inline-block text-sm font-black text-k-ink underline underline-offset-2"
                >
                  Corriger à l&apos;étape «{" "}
                  {titreEtapeJackpot(etapes, controle.etape)} »
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
        id="aide-verification-jackpot"
        resume="Que vérifie cette liste, exactement ?"
      >
        Les quatre premiers points sont ceux que le serveur oppose réellement au
        moment d&apos;ouvrir : lot nommé, au moins un gagnant prévu, objectif
        d&apos;au moins 1, et une date future en mode « Tirage à date ». Les
        points en orange n&apos;empêchent rien — ils annoncent ce que vos clients
        rencontreraient.
      </InfoBulle>

      {etat.toutPret ? (
        <div className="rounded-2xl border-2 border-k-ink bg-k-green/30 p-4">
          <p className="text-sm font-black text-k-ink">
            Rien ne bloque l&apos;ouverture. Il ne reste qu&apos;à ouvrir la
            cagnotte à vos clients.
          </p>
          <Link
            href={`/dashboard/jackpot/${campaignId}#statut`}
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
            href={`/dashboard/jackpot/${campaignId}#statut`}
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
