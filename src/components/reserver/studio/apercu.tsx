"use client";

import { CadreApercu } from "@/components/studio/cadre-apercu";
import { ReserverExperience } from "@/components/reserver/reserver-experience";
import type { ReserverSlotPublicView } from "@/lib/reserver-context";
import type { ReserverActivityKind } from "@/lib/reserver";
import type { EtatReservation } from "@/components/reserver/studio/etat";

/**
 * L'APERÇU DU STUDIO DE RÉSERVATION — la VRAIE page du client (VIT-49).
 *
 * ── C'EST LE COMPOSANT DE PRODUCTION, PAS UNE MAQUETTE ──
 *
 * `ReserverExperience` est exactement ce que sert `/reserver/[activityId]`.
 * En redessiner une imitation aurait produit le seul défaut qu'un aperçu ne
 * doit jamais avoir, parce qu'il est INVISIBLE : rien ne casse, tout a l'air
 * de fonctionner, et l'écart ne se découvre qu'en ouvrant la vraie page
 * (ADR-152).
 *
 * ── LES QUATRE PORTES SERVEUR SONT COUPÉES, ET ELLES ONT ÉTÉ ÉNUMÉRÉES ──
 *
 * L'énumération a été faite AVANT d'écrire, sur les imports du composant —
 * `reserveSlot`, `reserverTable`, `rejoindreListeAttenteTable` et
 * `cancelReservation`. Les quatre écrivent, et deux d'entre elles prennent une
 * place à un vrai client : réserver depuis un écran de réglages graverait une
 * réservation au nom du commerçant sur un créneau que quelqu'un d'autre
 * voulait. Le drapeau `apercu` les coupe toutes les quatre, par une clause de
 * garde en tête de chaque gestionnaire — modèle de `calendar-tracker.tsx`.
 *
 * L'écran, lui, ne change PAS d'un pixel : les formulaires restent vivants, les
 * boutons cliquables, les refus lisibles. Seule la sortie réseau est coupée, et
 * le geste répond « Aperçu : … ne part pas depuis votre studio ».
 *
 * ── CE QUE CET APERÇU MONTRE, ET CE QU'IL NE MONTRE PAS ──
 *
 * Il montre la page telle qu'elle est AUJOURD'HUI : les créneaux réellement
 * ouverts, l'effectif, la jauge, le formulaire. Il ne montre PAS l'espace
 * personnel du client — « Ma réservation », « Ma place dans la file » — parce
 * qu'ils dépendent du cookie de CE navigateur, et que le commerçant n'a pas
 * réservé chez lui. `mesReservations` et `maFile` sont donc vides, et c'est la
 * vérité de l'écran : c'est ce que voit un client qui arrive.
 *
 * ── LES CRÉNEAUX VIENNENT DU SERVEUR, LES RÉGLAGES DE L'ÉTAT ──
 *
 * `bookingMode` est pris à l'état VIVANT et non à la ligne chargée : c'est le
 * réglage qui bascule toute la page entre la jauge de places (Moment) et la
 * prise de table (rendez-vous), et un aperçu qui ne le suivrait pas montrerait
 * l'autre produit. Les créneaux, eux, restent ceux du serveur — le studio ne
 * les invente pas, et une liste vide est un état que la vraie page sait rendre.
 */
export function ApercuReservation({
  etat,
  organizationId,
  activityName,
  description,
  organizationName,
  logoUrl,
  creneaux,
  timeZone,
  kind,
  promise,
  steps,
  preparation,
}: {
  etat: EtatReservation;
  organizationId: string;
  activityName: string;
  description: string | null;
  organizationName: string;
  logoUrl: string | null;
  creneaux: ReserverSlotPublicView[];
  timeZone: string;
  kind: ReserverActivityKind;
  promise: string | null;
  steps: readonly { title: string; body: string }[];
  preparation: string | null;
}) {
  const rendezVous = etat.booking_mode === "rendez_vous";

  return (
    <CadreApercu
      legende="Aperçu — ce que verront vos clients. Vos réglages s'enregistrent tout seuls ; les autres blocs gardent leur bouton."
      banniere={
        <p className="max-w-[480px] rounded-xl border-2 border-k-ink/20 bg-white px-3 py-2 text-xs font-semibold text-zinc-600">
          Depuis cet aperçu, aucune réservation ne part : c&apos;est la vraie
          page de vos clients, mais les boutons n&apos;écrivent rien.
        </p>
      }
    >
      <div className="bg-k-bg">
        <ReserverExperience
          apercu
          organizationId={organizationId}
          activityName={activityName}
          description={description}
          organizationName={organizationName}
          logoUrl={logoUrl}
          creneaux={creneaux}
          // Vides, et c'est fidèle : ils dépendent du cookie de CE navigateur.
          // Voir l'en-tête.
          mesReservations={{}}
          maFile={{}}
          timeZone={timeZone}
          kind={kind}
          promise={promise}
          // LE RÉGLAGE EN COURS, pas celui de la base : c'est lui qui décide de
          // toute la page. `emailObligatoire` en découle exactement comme côté
          // serveur (`reserver-context.ts` : `row.booking_mode ===
          // "rendez_vous"`), pour que l'aperçu exige l'adresse là où la vraie
          // page l'exigera.
          durationMinutes={etat.duration_minutes}
          steps={steps}
          preparation={preparation}
          emailObligatoire={rendezVous}
          bookingMode={etat.booking_mode}
        />
      </div>
    </CadreApercu>
  );
}
