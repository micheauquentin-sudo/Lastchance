"use client";

import { useRef, useState } from "react";
import { updateJackpotCampaign } from "@/actions/jackpot";
import { useActionForm } from "@/lib/use-action-form";
import { CoquilleStudio } from "@/components/studio/coquille";
import { useEnregistrementDepuisEtat } from "@/components/studio/use-enregistrement-etat";
import { ApercuCagnotteStudio } from "@/components/jackpot/studio/apercu";
import { ChampsCachesCagnotte } from "@/components/jackpot/studio/champs-caches";
import {
  chargeReglagesCagnotte,
  etatInitialCagnotte,
  type EtatCagnotte,
} from "@/components/jackpot/studio/etat";
import {
  ETAPES_STUDIO_CAGNOTTE,
  parseEtapeStudioCagnotte,
  type EtapeStudioCagnotte,
} from "@/components/jackpot/studio/etapes";
import {
  EtapeLot,
  EtapeMessage,
  EtapeMontant,
  EtapeNom,
  EtapeObjectif,
  EtapeParticipation,
  EtapeTirage,
  EtapeVerification,
} from "@/components/jackpot/studio/pages";
import type { EntreeActivationJackpot } from "@/lib/activation/jackpot";
import type { JackpotCampaign } from "@/types/database";

/**
 * LE STUDIO DE LA CAGNOTTE (VIT-44) — l'écran de réglages, en voyant la page.
 *
 * ── CE QU'IL TIENT, ET RIEN D'AUTRE ──
 *
 * Trois choses : l'état des réglages, la charge utile d'`updateJackpotCampaign`,
 * et l'étape affichée. La coquille, le fil d'étapes, le bandeau et
 * l'enregistrement automatique viennent du socle (`@/components/studio/`) ;
 * chaque étape vit dans `studio/pages.tsx`, l'aperçu dans `studio/apercu.tsx`.
 *
 * ── LE PIÈGE CENTRAL : UNE ACTION QUI ÉCRIT PAR ABSENCE ──
 *
 * `updateJackpotCampaign` fait un `.update(campaignFieldsForMode(...))` de
 * TOUTES ses colonnes. Un champ non rendu n'y est pas « absent » : il prend le
 * défaut de son schéma, et l'action l'écrit. Trois de ces défauts sont MUETS :
 *
 *  · `public_slug` → `null` : tous les QR déjà imprimés cessent de mener
 *    quelque part ;
 *  · `reward_label` → `""` : l'activation se bloque, sans qu'on sache pourquoi ;
 *  · `display_base` / `display_increment` → `0`.
 *
 * C'est écrit noir sur blanc dans `atelier-jackpot-etapes.ts`, et c'est la
 * raison pour laquelle la carte de réglages de l'atelier — quinze champs sur un
 * seul écran — n'a JAMAIS été découpée : chaque morceau aurait dû reposter les
 * champs des autres en caché, et deux miroirs sur les mêmes colonnes sont deux
 * ÉCRIVAINS CONCURRENTS dès qu'ils sont à l'écran ensemble, l'écran affichant
 * « Modifications enregistrées » pendant que le dernier arrivé gagne.
 *
 * La parade du socle règle cela structurellement, et sans un seul miroir : un
 * `EtatCagnotte` unique, `ChampsCachesCagnotte` qui en rend la charge EN ENTIER
 * à chaque rendu, aucun contrôle visible portant de `name`, une seule étape
 * montée à la fois. Il n'existe alors aucun chemin par lequel un champ manque.
 * `studio/studio-charge.test.tsx` le vérifie sur le rendu RÉEL des huit étapes,
 * parce que « c'est structurel » reste une intention tant qu'aucune garde ne la
 * tient.
 *
 * ── UN SEUL CANAL D'ÉCRITURE, ET C'EST CE QUI SIMPLIFIE ──
 *
 * Contrairement au passeport (trois actions : programme, habillage,
 * parrainage), la cagnotte n'a qu'UNE action de réglages. Tout part donc par le
 * `<form>` VIDE de la coquille, déclenché par `requestSubmit` — il n'y a ni
 * file annexe à vider au clic sur « Enregistrer », ni verdicts à réconcilier.
 *
 * ── CE QUE LE STUDIO N'ABSORBE PAS ──
 *
 * Le statut, la SUPPRESSION, le QR et les statistiques restent sur la page de
 * suivi — la seule qui publie. L'ÉCRAN COMPTOIR aussi : c'est une tablette
 * tenue par la caisse, avec sa propre garde (`hasJackpotAccess`, rôle
 * `owner|editor`) et son `force-dynamic`. Le studio n'en montre qu'un lien, et
 * seulement en mode « Code au comptoir », où il produit réellement un code.
 */
const ID_FORMULAIRE = "studio-cagnotte-reglages";

export function CagnotteStudio({
  campaign,
  entreeVerification,
  organizationName,
  logoUrl,
  timeZone,
  peutEditer,
}: {
  campaign: JackpotCampaign;
  entreeVerification: EntreeActivationJackpot;
  organizationName: string;
  logoUrl: string | null;
  /** Fuseau de l'établissement : `draw_at` se saisit en heure civile. */
  timeZone: string;
  peutEditer: boolean;
}) {
  const [etape, setEtape] = useState<EtapeStudioCagnotte>(() =>
    parseEtapeStudioCagnotte(null),
  );
  const [etat, setEtat] = useState<EtatCagnotte>(() =>
    etatInitialCagnotte(campaign, timeZone),
  );

  const formulaire = useRef<HTMLFormElement | null>(null);

  const { state, pending, onSubmit } = useActionForm(updateJackpotCampaign, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  /**
   * LA SIGNATURE DE LA CHARGE, ET NON L'OBJET D'ÉTAT.
   *
   * `useEnregistrementDepuisEtat` relance son minuteur à chaque NOUVELLE
   * référence, et `setEtat` en crée une à chaque frappe. Lui passer `etat` ferait
   * repartir le minuteur même pour un changement qui ne modifie PAS ce qui part
   * — et elle est construite depuis `chargeReglagesCagnotte`, donc depuis ce qui
   * part RÉELLEMENT : la fréquence corrigée par le plancher du mode en fait
   * partie, et changer de mode doit bien déclencher un envoi.
   */
  const signature = JSON.stringify(chargeReglagesCagnotte(campaign.id, etat));
  useEnregistrementDepuisEtat({
    valeur: signature,
    formulaire,
    actif: peutEditer,
  });

  const majEtat = (patch: Partial<EtatCagnotte>) =>
    setEtat((e) => ({ ...e, ...patch }));

  const proprietes = { etat, majEtat, peutEditer };

  return (
    <CoquilleStudio
      titre="Mon studio — cagnotte"
      hrefRetour={`/dashboard/jackpot/${campaign.id}`}
      idFormulaire={ID_FORMULAIRE}
      formulaire={formulaire}
      onSubmit={onSubmit}
      champsCaches={<ChampsCachesCagnotte id={campaign.id} etat={etat} />}
      etapes={ETAPES_STUDIO_CAGNOTTE}
      etape={etape}
      onEtape={setEtape}
      peutEditer={peutEditer}
      enregistrement={{
        enCours: pending,
        reussi: state?.ok === true,
        erreur: state && !state.ok ? state.error : undefined,
      }}
      apercu={
        <ApercuCagnotteStudio
          etat={etat}
          organizationName={organizationName}
          logoUrl={logoUrl}
          timeZone={timeZone}
        />
      }
    >
      {etape === "nom" ? <EtapeNom {...proprietes} /> : null}
      {etape === "participation" ? (
        <EtapeParticipation {...proprietes} campaignId={campaign.id} />
      ) : null}
      {etape === "objectif" ? <EtapeObjectif {...proprietes} /> : null}
      {etape === "tirage" ? (
        <EtapeTirage {...proprietes} timeZone={timeZone} />
      ) : null}
      {etape === "lot" ? <EtapeLot {...proprietes} /> : null}
      {etape === "montant" ? <EtapeMontant {...proprietes} /> : null}
      {etape === "message" ? <EtapeMessage {...proprietes} /> : null}
      {etape === "verification" ? (
        <EtapeVerification
          campaignId={campaign.id}
          entree={entreeVerification}
          modeValidation={campaign.validation_mode}
        />
      ) : null}
    </CoquilleStudio>
  );
}
