import type { Metadata } from "next";
import Link from "next/link";

import { APP_URL } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmettreTicket } from "@/components/ticket/emettre-ticket";
import { LotsTicket } from "@/components/ticket/lots-ticket";
import { estLotTirable } from "@/lib/ticket-or";
import { loadTicketOr } from "@/lib/ticket-or-context";

/**
 * LE TICKET D'OR — l'écran du commerçant (TKT-1).
 *
 * ── UN JEU DU SOCLE, DONC PAS DE PAGE D'OFFRE ──
 *
 * Aucun encart « passez à l'offre supérieure » : le Ticket d'Or est inclus
 * dans les cinq offres. Le seul refus possible est l'absence d'abonnement
 * actif, et le message le dit sans rien vendre.
 *
 * ── DEUX GESTES, DEUX RÔLES ──
 *
 * ÉMETTRE est un geste de service : tout membre du commerce le fait, caisse
 * comprise — réserver le ticket au propriétaire l'aurait rendu inutilisable
 * aux heures où il n'est pas là. RÉGLER LES LOTS est du paramétrage : réservé
 * au propriétaire et à l'éditeur.
 */
export const metadata: Metadata = {
  title: "Ticket d'Or",
};

/**
 * Le jeu du socle n'a pas d'entrée de catalogue — il n'est ni vendu ni
 * refusable — donc pas de `sousTitreTableauDeBord` à citer. La constante
 * tient au moins les DEUX en-têtes de ce fichier d'accord : celui du refus et
 * celui de l'écran servi disaient déjà la même phrase, recopiée.
 */
const SOUS_TITRE =
  "Un ticket remis après un achat, que le client ouvre à sa prochaine visite et découvre sur place. Réglez d'abord les lots, puis faites scanner le QR au comptoir.";

export default async function TicketOrPage() {
  const ctx = await loadTicketOr();

  if (!ctx.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          surtitre="Vos animations"
          titre="Ticket d'Or"
          sousTitre={SOUS_TITRE}
        />
        <Card className="py-10 text-center">
          <p className="text-sm font-semibold text-k-body">{ctx.error}</p>
        </Card>
      </div>
    );
  }

  const { etat, peutRegler } = ctx;
  // TIRABLE = actif, pesé, et non épuisé. Le prédicat n'est plus recopié ici :
  // il vit dans `estLotTirable`, seule traduction du filtre de
  // `tirer_ticket_or`, et le studio pose la même question avec la même
  // fonction. Deux formulations divergentes, c'était un écran qui annonce
  // « prêt » sur un stock que le tirage refuse (VIT-45).
  const sansLot = !etat.lots.some(estLotTirable);

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre="Vos animations"
        titre="Ticket d'Or"
        sousTitre={SOUS_TITRE}
      />

      <Card>
        <h2>Remettre un ticket</h2>
        <p className="mb-4 mt-2 text-sm text-zinc-500">
          Après une visite ou un achat que vous avez constaté, faites{" "}
          <strong>scanner le QR</strong> au client — ou dictez-lui le code si le
          scan ne prend pas. Il l&apos;ouvrira à son{" "}
          <strong>prochain passage</strong>, verra aussitôt ce qu&apos;il gagne,
          et retirera son lot au comptoir. Un ticket ne sert qu&apos;une fois :
          une capture d&apos;écran ne rejoue rien.
        </p>
        <EmettreTicket sansLot={sansLot} baseUrl={APP_URL} />
      </Card>

      <Card>
        <h2>Ce qu&apos;il y a à gagner</h2>
        <p className="mb-4 mt-2 text-sm text-zinc-500">
          Le tirage est fait par nos serveurs, jamais par le téléphone du
          client. Le poids est une part relative au total ; un lot à poids nul
          ou décoché reste enregistré mais ne sort plus.
        </p>
        <LotsTicket lots={etat.lots} peutRegler={peutRegler} />
      </Card>

      {/* L'ENTRÉE DU STUDIO, et seulement pour qui règle. Un caissier n'y
          trouverait qu'un écran en lecture seule : l'émission, elle, est
          juste au-dessus et lui reste ouverte.

          Le `<h2>` est écrit à la main, comme sur les autres entrées de
          studio : sans lui la carte n'a AUCUN titre dans l'arbre
          d'accessibilité — un lecteur d'écran ne l'annonce pas, et les E2E
          qui cherchent `getByRole("heading")` ne la trouvent pas non plus. */}
      {peutRegler ? (
        <Card>
          <h2 className="font-semibold mb-1">Mon studio</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-sm text-k-body">
              La page de vos clients au centre, les réglages autour. Vos lots,
              leurs chances de sortie, leur stock et ceux qui tournent
              aujourd&apos;hui — tout s&apos;y règle en voyant ce que le client
              découvrira.
            </p>
            <Link
              href="/studio/ticket-or"
              className="shrink-0 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/80"
            >
              Ouvrir le studio
            </Link>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2>Sur les trente derniers jours</h2>
        <p className="mb-4 mt-2 text-sm text-zinc-500">
          Des <strong>tickets</strong> et des <strong>lots</strong>, jamais des
          paniers ni des revenus : rien ici ne mesure ce que la visite a
          rapporté.
        </p>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Mesure libelle="Remis" valeur={etat.mesures.emis} />
          <Mesure libelle="Ouverts" valeur={etat.mesures.tires} />
          <Mesure libelle="Retirés" valeur={etat.mesures.remis} />
          <Mesure libelle="En attente" valeur={etat.mesures.aRemettre} />
        </dl>
      </Card>
    </div>
  );
}

function Mesure({ libelle, valeur }: { libelle: string; valeur: number }) {
  return (
    <div className="rounded-2xl border-2 border-k-ink/15 px-4 py-3">
      <dt className="text-xs font-black uppercase tracking-wide text-k-body">
        {libelle}
      </dt>
      <dd className="mt-1 text-2xl font-black tabular-nums text-k-ink">
        {valeur}
      </dd>
    </div>
  );
}
