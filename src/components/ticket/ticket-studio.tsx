"use client";

import { useRef, useState } from "react";

import { CoquilleStudio } from "@/components/studio/coquille";
import { ApercuTicket } from "@/components/ticket/studio/apercu";
import {
  ETAPES_STUDIO_TICKET,
  parseEtapeStudioTicket,
  type EtapeStudioTicket,
} from "@/components/ticket/studio/etapes";
import {
  EtapeActifs,
  EtapeChances,
  EtapeLots,
  EtapeStock,
  EtapeVerification,
} from "@/components/ticket/studio/pages";
import type { LotTicketOrView } from "@/lib/ticket-or";

/**
 * LE STUDIO DU TICKET D'OR (VIT-45) — les lots, en voyant la page du client.
 *
 * ── CE STUDIO EST LE SEUL DE LA FAMILLE SANS FORMULAIRE DE RÉGLAGES ──
 *
 * Les cinq autres règlent UNE LIGNE — une chasse, un calendrier, un quiz, un
 * programme, une vitrine — par UNE action qui en réécrit les colonnes EN BLOC.
 * C'est ce piège qui justifie tout l'appareillage du socle : un état en
 * mémoire, aucun `name` sur un contrôle visible, et la charge utile rendue en
 * ENTIER à chaque rendu dans `champsCaches`, quelle que soit l'étape ouverte.
 *
 * Le Ticket d'Or n'a AUCUN réglage d'organisation. Sa configuration entière est
 * une liste de lots, et chaque lot a ses actions atomiques
 * (`creerLotTicketOr`, `modifierLotTicketOr`, `supprimerLotTicketOr`). Il n'y a
 * donc rien à mettre dans `champsCaches` : le formulaire du socle reste vide,
 * et il ne sert qu'à satisfaire la coquille.
 *
 * ── D'OÙ `peutEditer={false}`, QUI N'EST PAS UNE RESTRICTION ──
 *
 * `peutEditer` gouverne UNIQUEMENT le bandeau : l'annonce « Enregistrement
 * automatique » et le bouton « Enregistrer » qui vise le formulaire des
 * réglages. Le passer à `true` ici afficherait une promesse d'enregistrement
 * automatique qu'aucun code ne tient, et un bouton qui posterait un `FormData`
 * VIDE à `modifierLotTicketOr` — c'est-à-dire un « Identifiant invalide »
 * rendu au commerçant pour avoir cliqué sur « Enregistrer ». Un écran qui
 * raconte le contraire de ce qu'il fait est exactement le défaut d'ADR-153, et
 * un bouton qui échoue toujours en serait la version bruyante.
 *
 * Le droit d'écrire n'est donc PAS gelé pour autant : il vit là où il agit,
 * dans `peutRegler`, que chaque ligne de `LotsTicket` consulte pour son propre
 * bouton — le même comportement qu'au tableau de bord, à la lettre.
 *
 * ── ET LE COMPTOIR RESTE DEHORS ──
 *
 * « Remettre un ticket » n'entre pas ici : c'est un geste de service ouvert à
 * TOUS les rôles, caisse comprise, quand régler les lots est réservé à
 * `owner|editor`. L'absorber ferait entrer dans le studio une autorisation qui
 * n'est pas la sienne (ADR-159). L'étape de vérification en montre le lien.
 */
const ID_FORMULAIRE = "studio-ticket-reglages";

export function TicketStudio({
  lots,
  peutRegler,
}: {
  /** Les lots de l'organisation, dans l'ordre servi par `tickets_or_state`. */
  lots: LotTicketOrView[];
  /** `owner|editor` : le droit de RÉGLER les lots. Voir `gardeTicketOr`. */
  peutRegler: boolean;
}) {
  const [etape, setEtape] = useState<EtapeStudioTicket>(() =>
    parseEtapeStudioTicket(null),
  );

  // Le formulaire de la coquille reste VIDE — voir l'en-tête. La référence et
  // le gestionnaire existent parce que la coquille les exige, pas parce qu'un
  // réglage passe par eux.
  const formulaire = useRef<HTMLFormElement | null>(null);

  const proprietes = { lots, peutRegler };

  return (
    <CoquilleStudio
      titre="Mon studio — Ticket d'Or"
      hrefRetour="/dashboard/ticket-or"
      idFormulaire={ID_FORMULAIRE}
      formulaire={formulaire}
      onSubmit={(event) => event.preventDefault()}
      champsCaches={null}
      etapes={ETAPES_STUDIO_TICKET}
      etape={etape}
      onEtape={setEtape}
      peutEditer={false}
      enregistrement={{ enCours: false, reussi: false }}
      apercu={<ApercuTicket lots={lots} />}
    >
      {etape === "lots" ? <EtapeLots {...proprietes} /> : null}
      {etape === "chances" ? <EtapeChances {...proprietes} /> : null}
      {etape === "stock" ? <EtapeStock {...proprietes} /> : null}
      {etape === "actifs" ? <EtapeActifs {...proprietes} /> : null}
      {etape === "verification" ? <EtapeVerification {...proprietes} /> : null}
    </CoquilleStudio>
  );
}
