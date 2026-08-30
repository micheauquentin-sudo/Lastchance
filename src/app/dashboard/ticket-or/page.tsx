import type { Metadata } from "next";

import { APP_URL } from "@/lib/env";
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
  // TIRABLE = actif, pesé, et non épuisé. Exactement le prédicat du SQL :
  // l'écran ne doit pas annoncer « prêt » sur un stock que le tirage refuse.
  const sansLot = !etat.lots.some(
    (lot) => lot.actif && lot.poids > 0 && (lot.stock === null || lot.stock > 0),
  );

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
