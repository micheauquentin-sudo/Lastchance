"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { LotsTicket } from "@/components/ticket/lots-ticket";
import { estLotTirable, type LotTicketOrView } from "@/lib/ticket-or";

/**
 * LE CONTENU DES ÉTAPES DU STUDIO DU TICKET D'OR (VIT-45).
 *
 * ── CE STUDIO N'A PAS DE FORMULAIRE DE RÉGLAGES, ET C'EST STRUCTUREL ──
 *
 * Les cinq autres studios du produit règlent UNE LIGNE (une chasse, un
 * calendrier, un programme) par UNE action qui réécrit ses colonnes en bloc :
 * d'où le formulaire caché du socle, qui rend la charge en entier à chaque
 * rendu. Le Ticket d'Or n'a aucun réglage d'organisation — sa configuration
 * ENTIÈRE est une liste de lots, et chaque lot a ses propres actions atomiques
 * (`creerLotTicketOr`, `modifierLotTicketOr`, `supprimerLotTicketOr`).
 *
 * Il n'y a donc rien à mettre dans `champsCaches`, et le studio ne promet pas
 * l'enregistrement automatique : chaque ligne garde son bouton « Enregistrer »,
 * exactement comme au tableau de bord. Le détail de ce choix est en tête de
 * `ticket-studio.tsx`.
 *
 * ── CE QUE CES ÉTAPES PORTENT MALGRÉ TOUT ──
 *
 * Le piège de l'écrasement en bloc existe bel et bien ici, un cran plus bas :
 * `modifierLotTicketOr` réécrit les QUATRE colonnes d'un lot. Une étape qui ne
 * montrerait qu'une colonne détruirait les trois autres. La parade est dans
 * `LotsTicket` (`champs`), qui rend en MIROIR CACHÉ tout ce qu'elle ne montre
 * pas — et `studio-charge.test.tsx` le vérifie sur le rendu réel de chaque
 * étape.
 */

export interface ProprietesEtapeTicket {
  lots: LotTicketOrView[];
  peutRegler: boolean;
}

function TitreEtape({ titre, aide }: { titre: string; aide: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-black text-k-ink">{titre}</h2>
      <p className="mt-1 text-sm text-k-body">{aide}</p>
    </div>
  );
}

// ── 1. Mes lots ─────────────────────────────────────────────

export function EtapeLots({ lots, peutRegler }: ProprietesEtapeTicket) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Mes lots"
        aide="Ce que vos clients peuvent gagner en ouvrant leur Ticket d'Or. Le tirage est fait par nos serveurs, jamais par le téléphone du client."
      />
      {/* LE SEUL ENDROIT QUI AJOUTE ET QUI RETIRE. Les trois étapes suivantes
          ne font que régler une colonne : y remettre une suppression, ce
          serait quatre endroits à corriger pour un geste destructeur. */}
      <LotsTicket
        lots={lots}
        peutRegler={peutRegler}
        champs="libelle"
        vide="Aucun lot pour l'instant. Un ticket ouvert sans lot n'offre rien : ajoutez-en au moins un ci-dessous."
      />
    </div>
  );
}

// ── 2. Les chances de sortie ────────────────────────────────

export function EtapeChances({ lots, peutRegler }: ProprietesEtapeTicket) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Les chances de sortie"
        aide="Le poids décide de la fréquence à laquelle un lot sort. Un lot à poids nul reste enregistré, mais ne sort plus."
      />
      <InfoBulle
        id="aide-studio-ticket-poids"
        resume="Pourquoi un poids et pas un pourcentage ?"
        className="max-w-md"
      >
        Le poids est une <strong>part relative au total</strong>, la même
        sémantique que la roue. Un pourcentage changerait tout seul à chaque lot
        ajouté — et un chiffre qui bouge sans qu&apos;on y touche se lit comme
        une erreur. Deux lots à 1 sortent aussi souvent l&apos;un que
        l&apos;autre ; un lot à 3 face à un lot à 1 sort trois fois plus.
      </InfoBulle>
      <LotsTicket
        lots={lots}
        peutRegler={peutRegler}
        champs="poids"
        avecAjout={false}
        vide="Aucun lot à peser pour l'instant. Ajoutez-en un à l'étape « Mes lots »."
      />
    </div>
  );
}

// ── 3. Le stock disponible ──────────────────────────────────

export function EtapeStock({ lots, peutRegler }: ProprietesEtapeTicket) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Le stock disponible"
        aide="Combien il reste de chaque lot. À remettre à jour après un réassort."
      />
      <InfoBulle
        id="aide-studio-ticket-stock"
        resume="Vide ou zéro : quelle différence ?"
        className="max-w-md"
      >
        <strong>Vide = illimité</strong> — « je ne compte pas ».{" "}
        <strong>Zéro = épuisé</strong> — « il n&apos;y en a plus », et le lot
        sort du tirage. Les confondre épuiserait un café offert dès le premier
        ticket ouvert.
      </InfoBulle>
      <LotsTicket
        lots={lots}
        peutRegler={peutRegler}
        champs="stock"
        avecAjout={false}
        vide="Aucun lot à approvisionner pour l'instant. Ajoutez-en un à l'étape « Mes lots »."
      />
    </div>
  );
}

// ── 4. Les lots qui tournent aujourd'hui ────────────────────

export function EtapeActifs({ lots, peutRegler }: ProprietesEtapeTicket) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Les lots qui tournent aujourd'hui"
        aide="Décocher un lot le retire du tirage sans l'effacer : il revient d'une case à cocher, avec son poids et son stock intacts."
      />
      <LotsTicket
        lots={lots}
        peutRegler={peutRegler}
        champs="actif"
        avecAjout={false}
        vide="Aucun lot pour l'instant. Ajoutez-en un à l'étape « Mes lots »."
      />
    </div>
  );
}

// ── 5. Vérifier qu'un lot peut sortir ───────────────────────

/**
 * POURQUOI CE QUI SUIT N'ÉCRIT PAS SON PROPRE TEST.
 *
 * `estLotTirable` est la traduction littérale du filtre de `tirer_ticket_or`,
 * et elle vit dans `@/lib/ticket-or` parce que le tableau de bord et l'aperçu
 * posent la même question. Réécrire ici `actif && poids > 0 && …` aurait donné
 * un écran qui annonce « prêt » sur une configuration que la base refuse — le
 * pire des défauts, parce qu'il ne casse rien : le commerçant remet des
 * tickets, et ce sont ses clients qui découvrent qu'ils ne gagnent rien.
 *
 * `raisonNonTirable` ne DÉCIDE de rien : elle explique une décision déjà prise
 * par le prédicat partagé, et n'est consultée que lorsqu'il a dit non.
 */
function raisonNonTirable(lot: LotTicketOrView): string {
  if (!lot.actif) return "décoché — il ne tourne pas en ce moment";
  if (lot.poids <= 0) return "poids à zéro — il ne sort jamais";
  return "stock épuisé — il n'en reste plus";
}

export function EtapeVerification({ lots }: ProprietesEtapeTicket) {
  const tirables = lots.filter(estLotTirable);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold mb-1">Ce qu&apos;un ticket donnera</h2>
        <p className="mb-4 mt-2 text-sm text-zinc-500">
          Un lot ne peut sortir que s&apos;il est coché, s&apos;il a un poids
          supérieur à zéro et s&apos;il en reste. C&apos;est le test exact que
          fait le serveur au moment du tirage — pas une approximation de cet
          écran.
        </p>

        {lots.length === 0 ? (
          <p
            role="status"
            className="rounded-xl border-2 border-amber-600/30 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"
          >
            Aucun lot n&apos;est enregistré. Un ticket ouvert aujourd&apos;hui
            n&apos;offrirait rien : commencez par l&apos;étape « Mes lots ».
          </p>
        ) : tirables.length === 0 ? (
          <p
            role="status"
            className="rounded-xl border-2 border-amber-600/30 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"
          >
            Aucun lot ne peut sortir pour l&apos;instant : un ticket ouvert
            aujourd&apos;hui n&apos;offrirait rien. La liste ci-dessous dit ce
            qui manque à chacun.
          </p>
        ) : (
          <p
            role="status"
            className="rounded-xl border-2 border-green-700/30 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800"
          >
            {tirables.length === 1
              ? "1 lot peut sortir. Vos tickets donneront quelque chose."
              : `${tirables.length} lots peuvent sortir. Vos tickets donneront quelque chose.`}
          </p>
        )}

        {lots.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {lots.map((lot) => {
              const tirable = estLotTirable(lot);
              return (
                <li
                  key={lot.id}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border-2 border-k-ink/15 px-3 py-2 text-sm"
                >
                  <span aria-hidden>{tirable ? "✅" : "⛔"}</span>
                  <span className="font-bold text-k-ink">{lot.libelle}</span>
                  <span className="text-zinc-500">
                    {tirable
                      ? `peut sortir — poids ${lot.poids}, ${
                          lot.stock === null ? "stock illimité" : `${lot.stock} en stock`
                        }`
                      : `ne peut pas sortir : ${raisonNonTirable(lot)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>

      {/* LE COMPTOIR RESTE AU TABLEAU DE BORD, ET CE N'EST PAS UN OUBLI.
          Émettre un ticket est un geste de service, ouvert à TOUS les rôles y
          compris la caisse ; régler les lots est réservé au propriétaire et à
          l'éditeur. Absorber le bouton ici ferait entrer dans le studio une
          autorisation qui n'est pas la sienne — même arbitrage que l'écran
          comptoir de la fidélité et du jackpot (ADR-159). */}
      <Card>
        <h2 className="font-semibold mb-1">Remettre un ticket</h2>
        <p className="mb-3 mt-2 text-sm text-zinc-500">
          Le QR à faire scanner s&apos;émet au comptoir, sur le tableau de bord
          — c&apos;est un geste de service que toute votre équipe peut faire,
          caisse comprise, alors que les lots ne se règlent qu&apos;ici.
        </p>
        <Link
          href="/dashboard/ticket-or"
          className="inline-block rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/80"
        >
          Aller émettre un ticket
        </Link>
      </Card>
    </div>
  );
}
