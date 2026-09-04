"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateLoyaltyProgram,
  updateLoyaltyProgramReferral,
  updateLoyaltyProgramStyle,
} from "@/actions/loyalty";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSaveManuel } from "@/lib/use-auto-save-manuel";
import { CoquilleStudio } from "@/components/studio/coquille";
import { useEnregistrementDepuisEtat } from "@/components/studio/use-enregistrement-etat";
import type {
  LoyaltyJackpotOption,
  WheelOption,
} from "@/components/dashboard/loyalty-editor";
import type { OrderCodeCard } from "@/components/dashboard/order-code-cards";
import type { EntreeVerificationFidelite } from "@/lib/activation/loyalty";
import type { ActionResult } from "@/lib/utils";
import type { LoyaltyMilestone, LoyaltyProgram } from "@/types/database";
import type { LoyaltyMilestoneView } from "@/lib/loyalty-context";
import { ApercuPasseportStudio } from "@/components/loyalty/studio/apercu";
import { ChampsCachesFidelite } from "@/components/loyalty/studio/champs-caches";
import {
  chargeParrainageFidelite,
  chargeReglagesFidelite,
  chargeStyleFidelite,
  etatInitialFidelite,
  formDataDepuis,
  type EtatFidelite,
} from "@/components/loyalty/studio/etat";
import {
  ETAPES_STUDIO_FIDELITE,
  parseEtapeStudioFidelite,
  type EtapeStudioFidelite,
} from "@/components/loyalty/studio/etapes";
import {
  EtapeAllure,
  EtapeCadeaux,
  EtapeCartes,
  EtapeNiveaux,
  EtapeNom,
  EtapeParrainage,
  EtapeValidation,
  EtapeVerification,
} from "@/components/loyalty/studio/pages";

/**
 * LE STUDIO DU PASSEPORT (VIT-42) — l'écran de réglages, en voyant la carte.
 *
 * ── CE QU'IL TIENT, ET RIEN D'AUTRE ──
 *
 * Trois choses : l'état des réglages, les trois charges utiles du programme, et
 * l'étape affichée. La coquille, le fil d'étapes, le bandeau et
 * l'enregistrement automatique viennent du socle (`@/components/studio/`) ;
 * chaque étape vit dans `studio/pages.tsx`, l'aperçu dans `studio/apercu.tsx`.
 *
 * ── LE PIÈGE CENTRAL : DEUX ÉCRIVAINS SUR LES MÊMES COLONNES ──
 *
 * `updateLoyaltyProgram` fait un `.update()` de TOUTES ses colonnes. C'est
 * pourquoi, dans l'atelier, `LoyaltySettings` poste les seuils de niveau en
 * champs cachés ET `LoyaltyTiersForm` re-poste le nom, le mode, la rotation, la
 * fréquence et le jackpot en cachés : chacun rejoue les champs de l'autre. Cet
 * arrangement ne tient que sur une phrase, écrite dans le code : « ils vivent
 * sur des étapes différentes, jamais à l'écran ensemble, et chacun repart de la
 * valeur serveur ».
 *
 * Un studio les met SUR LE MÊME ÉCRAN, avec enregistrement automatique. Les
 * deux miroirs deviendraient alors deux écrivains concurrents, chacun postant
 * une copie FIGÉE de la part de l'autre — et le dernier arrivé gagnerait, en
 * silence, sur un écran qui affiche « Modifications enregistrées ».
 *
 * La parade du socle règle cela structurellement, et les miroirs DISPARAISSENT
 * : un seul `EtatFidelite`, `ChampsCachesFidelite` qui en rend la charge EN
 * ENTIER à chaque rendu, aucun contrôle visible portant de `name`, et une seule
 * étape montée à la fois. Il n'existe alors ni deux écrivains, ni deux copies à
 * tenir d'accord.
 *
 * ── TROIS CANAUX D'ÉCRITURE, ET C'EST LE MODULE QUI L'IMPOSE ──
 *
 * Le passeport n'a pas UNE action d'écriture de programme mais trois :
 *
 *  · `updateLoyaltyProgram` — huit colonnes, part par le `<form>` VIDE de la
 *    coquille, déclenché par `requestSubmit` ;
 *  · `updateLoyaltyProgramStyle` — la seule colonne `style` ;
 *  · `updateLoyaltyProgramReferral` — les cinq colonnes `referral_*`.
 *
 * Les deux dernières EXISTENT parce que la première écrase (leurs en-têtes le
 * disent) : les rapatrier dans le formulaire des réglages annulerait la
 * protection pour laquelle elles ont été écrites. Elles ne peuvent pas non plus
 * garder leur propre `<form>` dans une étape — une étape qu'on quitte est
 * démontée, et l'enregistrement automatique du socle n'atteindrait jamais un
 * formulaire absent. Elles partent donc par `useAutoSaveManuel`, depuis le MÊME
 * état, avec une signature qui ne bouge que lorsque LEURS colonnes bougent.
 *
 * Ce qui est fusionné, c'est ce qui doit l'être : l'ÉTAT. Une seule source,
 * trois départs, aucun champ qui dépend de l'étape ouverte.
 *
 * ── CE QUE LE STUDIO N'ABSORBE PAS ──
 *
 * Le statut, la suppression, le QR, les statistiques et la relance restent sur
 * l'écran de suivi — le seul qui publie. L'ÉCRAN COMPTOIR aussi : c'est une
 * tablette tenue par la caisse, avec sa propre garde (`hasLoyaltyAccess`, rôle
 * `owner|editor`, mode `rotating_code`). Le studio n'en montre qu'un lien.
 */
const ID_FORMULAIRE = "studio-fidelite-reglages";

export function PasseportStudio({
  program,
  paliers,
  paliersVue,
  roues,
  jackpots,
  cartes,
  plafondCartes,
  entreeVerification,
  organizationName,
  logoUrl,
  peutEditer,
}: {
  program: LoyaltyProgram;
  /** Les paliers en base, pour l'éditeur de la colonne de gauche. */
  paliers: LoyaltyMilestone[];
  /** Les mêmes, dans la vue exacte de la page publique, pour l'aperçu. */
  paliersVue: LoyaltyMilestoneView[];
  roues: WheelOption[];
  jackpots: LoyaltyJackpotOption[];
  cartes: OrderCodeCard[];
  plafondCartes: number;
  entreeVerification: EntreeVerificationFidelite;
  organizationName: string;
  logoUrl: string | null;
  peutEditer: boolean;
}) {
  const router = useRouter();
  const [etape, setEtape] = useState<EtapeStudioFidelite>(() =>
    parseEtapeStudioFidelite(null),
  );
  const [etat, setEtat] = useState<EtatFidelite>(() =>
    etatInitialFidelite(program),
  );

  const formulaire = useRef<HTMLFormElement | null>(null);
  /** Le conteneur que `useAutoSaveManuel` écoute pour vider sa file au
   *  `focusout` : il enveloppe TOUTES les étapes, donc il est toujours monté —
   *  posé sur le contenu d'une seule étape, l'écouteur ne se serait attaché
   *  qu'à celles ouvertes au moment où l'effet a couru. */
  const colonneReglages = useRef<HTMLDivElement | null>(null);

  const { state, pending, onSubmit } = useActionForm(updateLoyaltyProgram, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  /**
   * LA SIGNATURE DES RÉGLAGES, ET NON L'OBJET D'ÉTAT.
   *
   * `useEnregistrementDepuisEtat` relance son minuteur à chaque NOUVELLE
   * référence. Lui passer `etat` ferait repartir le minuteur à chaque rendu du
   * studio — y compris ceux provoqués par la saisie du PARRAINAGE ou le choix
   * d'un FOND, qui ne concernent pas cette action — et `updateLoyaltyProgram`
   * partirait tout seul sans que rien de sa charge n'ait bougé.
   *
   * Elle est construite depuis `chargeReglagesFidelite`, c'est-à-dire depuis ce
   * qui part RÉELLEMENT : la fréquence corrigée par le plancher du mode en fait
   * partie, et changer de mode doit donc bien déclencher un envoi.
   */
  const chargeReglages = chargeReglagesFidelite(program.id, etat);
  const signatureReglages = JSON.stringify(chargeReglages);
  useEnregistrementDepuisEtat({
    valeur: signatureReglages,
    formulaire,
    actif: peutEditer,
  });

  // ── L'habillage : une colonne, un envoi ──
  const [styleEnCours, setStyleEnCours] = useState(false);
  const [styleResultat, setStyleResultat] = useState<ActionResult | null>(null);

  const enregistrerStyle = async (): Promise<boolean> => {
    setStyleEnCours(true);
    setStyleResultat(null);
    try {
      const res = await updateLoyaltyProgramStyle(
        null,
        formDataDepuis(chargeStyleFidelite(program.id, etat)),
      );
      setStyleResultat(res);
      return res.ok;
    } catch {
      setStyleResultat({
        ok: false,
        error: "Enregistrement impossible, réessayez.",
      });
      return false;
    } finally {
      setStyleEnCours(false);
    }
  };

  const { enAttente: styleEnAttente, declencher: envoyerStyle } =
    useAutoSaveManuel(colonneReglages, {
      signature: JSON.stringify(chargeStyleFidelite(program.id, etat)),
      enregistrer: enregistrerStyle,
      actif: peutEditer,
    });

  // ── Le parrainage : cinq colonnes, un envoi ──
  const [parrainageEnCours, setParrainageEnCours] = useState(false);
  const [parrainageResultat, setParrainageResultat] =
    useState<ActionResult | null>(null);

  const enregistrerParrainage = async (): Promise<boolean> => {
    setParrainageEnCours(true);
    setParrainageResultat(null);
    try {
      const res = await updateLoyaltyProgramReferral(
        null,
        formDataDepuis(chargeParrainageFidelite(program.id, etat)),
      );
      setParrainageResultat(res);
      // Le bloc « Parrainer un ami » de la carte publique suit la prop serveur
      // (`referral_enabled`) : sans rafraîchissement, l'écran resterait sur le
      // barème d'avant à la prochaine relecture.
      if (res.ok) router.refresh();
      return res.ok;
    } catch {
      setParrainageResultat({
        ok: false,
        error: "Enregistrement impossible, réessayez.",
      });
      return false;
    } finally {
      setParrainageEnCours(false);
    }
  };

  const { enAttente: parrainageEnAttente, declencher: envoyerParrainage } =
    useAutoSaveManuel(colonneReglages, {
      // LES CINQ COLONNES, TOUJOURS — c'est la signature de la charge, pas
      // celle de l'étape ouverte : `updateLoyaltyProgramReferral` les réécrit
      // en bloc, un barème amputé remettrait les autres à leur défaut.
      signature: JSON.stringify(chargeParrainageFidelite(program.id, etat)),
      enregistrer: enregistrerParrainage,
      actif: peutEditer,
    });

  /**
   * LE BOUTON « ENREGISTRER » VIDE AUSSI LES DEUX AUTRES FILES.
   *
   * Il ne cible, par `form=`, que le formulaire des réglages : sans ces deux
   * lignes, un commerçant qui choisit un fond, clique « Enregistrer » et quitte
   * aussitôt l'écran verrait `updateLoyaltyProgram` partir — et son habillage
   * attendre un délai qui n'arrivera jamais. C'est la promesse même du bouton
   * dans un studio à enregistrement automatique : « rien n'est en vol quand je
   * pars ».
   *
   * CONDITIONNÉ à `enAttente`, et pas déclenché à chaque clic : `declencher`
   * FORCE l'envoi même sans changement, ce qui ferait reposter l'habillage
   * depuis « Le nom du programme ».
   */
  const soumettreReglages = (event: React.FormEvent<HTMLFormElement>) => {
    if (styleEnAttente) envoyerStyle();
    if (parrainageEnAttente) envoyerParrainage();
    onSubmit(event);
  };

  const majEtat = (patch: Partial<EtatFidelite>) =>
    setEtat((e) => ({ ...e, ...patch }));

  const proprietes = { etat, majEtat, peutEditer };

  /** Le premier refus non nul des trois canaux — le commerçant n'a qu'un écran. */
  const erreur = useMemo(() => {
    if (state && !state.ok) return state.error;
    if (styleResultat && !styleResultat.ok) return styleResultat.error;
    if (parrainageResultat && !parrainageResultat.ok)
      return parrainageResultat.error;
    return undefined;
  }, [state, styleResultat, parrainageResultat]);

  return (
    <CoquilleStudio
      titre="Mon studio — passeport de fidélité"
      hrefRetour={`/dashboard/loyalty/${program.id}`}
      idFormulaire={ID_FORMULAIRE}
      formulaire={formulaire}
      onSubmit={soumettreReglages}
      champsCaches={<ChampsCachesFidelite id={program.id} etat={etat} />}
      etapes={ETAPES_STUDIO_FIDELITE}
      etape={etape}
      onEtape={setEtape}
      peutEditer={peutEditer}
      enregistrement={{
        // LES TROIS CANAUX, LUS ENSEMBLE : le commerçant n'a qu'un écran, il ne
        // doit pas avoir à deviner lequel des trois enregistrements parle.
        enCours: pending || styleEnCours || parrainageEnCours,
        reussi:
          state?.ok === true ||
          styleResultat?.ok === true ||
          parrainageResultat?.ok === true,
        erreur,
      }}
      apercu={
        <ApercuPasseportStudio
          programId={program.id}
          etat={etat}
          paliers={paliersVue}
          organizationName={organizationName}
          logoUrl={logoUrl}
        />
      }
    >
      <div ref={colonneReglages}>
        {etape === "nom" ? <EtapeNom {...proprietes} /> : null}
        {etape === "validation" ? (
          <EtapeValidation
            {...proprietes}
            programId={program.id}
            jackpots={jackpots}
          />
        ) : null}
        {etape === "niveaux" ? <EtapeNiveaux {...proprietes} /> : null}
        {etape === "cadeaux" ? (
          <EtapeCadeaux
            programId={program.id}
            paliers={paliers}
            roues={roues}
          />
        ) : null}
        {etape === "parrainage" ? <EtapeParrainage {...proprietes} /> : null}
        {etape === "allure" ? (
          <EtapeAllure {...proprietes} logoUrl={logoUrl} />
        ) : null}
        {etape === "cartes" ? (
          <EtapeCartes
            programId={program.id}
            cartes={cartes}
            plafond={plafondCartes}
          />
        ) : null}
        {etape === "verification" ? (
          <EtapeVerification
            entree={entreeVerification}
            modeValidation={etat.validation_mode}
          />
        ) : null}
      </div>
    </CoquilleStudio>
  );
}
