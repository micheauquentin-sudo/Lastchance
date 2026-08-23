import type { Metadata } from "next";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmettreTicket } from "@/components/ticket/emettre-ticket";
import { LotsTicket } from "@/components/ticket/lots-ticket";
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

export default async function TicketOrPage() {
  const ctx = await loadTicketOr();

  if (!ctx.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          titre="Ticket d'Or"
          sousTitre="Une visite d’aujourd’hui donne une raison de revenir."
        />
        <Card className="py-10 text-center">
          <p className="text-sm font-semibold text-k-body">{ctx.error}</p>
        </Card>
      </div>
    );
  }

  const { etat, peutRegler } = ctx;
  // TIRABLE = actif, pesé, et non épuisé. Exactement le prédicat du SQL :
  // l'écran ne doit pas annoncer « prêt » sur un stock que le tirage refuse.
  const sansLot = !etat.lots.some(
    (lot) => lot.actif && lot.poids > 0 && (lot.stock === null || lot.stock > 0),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Ticket d'Or"
        sousTitre="Une visite d’aujourd’hui donne une raison de revenir."
      />

      <Card>
        <h2>Remettre un ticket</h2>
        <p className="mb-4 mt-2 text-sm text-zinc-500">
          Après une visite ou un achat que vous avez constaté, remettez ce code
          au client. Il l&apos;ouvrira à son <strong>prochain passage</strong> et
          retirera son lot au comptoir. Un code ne sert qu&apos;une fois : une
          capture d&apos;écran ne rejoue rien.
        </p>
        <EmettreTicket sansLot={sansLot} />
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
