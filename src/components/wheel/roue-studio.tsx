"use client";

import { useMemo, useRef, useState } from "react";
import { updateWheel, updateWheelSchedule, updateWheelStyle } from "@/actions/prizes";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSaveManuel } from "@/lib/use-auto-save-manuel";
import { CoquilleStudio } from "@/components/studio/coquille";
import { useEnregistrementDepuisEtat } from "@/components/studio/use-enregistrement-etat";
import type { ReferralProgramRow } from "@/components/dashboard/referral-program-settings";
import type { WheelSegment } from "@/components/wheel/wheel-svg";
import { ApercuRoue } from "@/components/wheel/studio/apercu";
import { ChampsCachesRoue } from "@/components/wheel/studio/champs-caches";
import {
  chargeCreneauRoue,
  chargeJeuRoue,
  chargeStyleRoue,
  etatInitialRoue,
  formDataCreneau,
  formDataDepuis,
  type EtatRoue,
} from "@/components/wheel/studio/etat";
import {
  ETAPES_STUDIO_ROUE,
  parseEtapeStudioRoue,
  type EtapeStudioRoue,
} from "@/components/wheel/studio/etapes";
import {
  EtapeAllure,
  EtapeApres,
  EtapeAvant,
  EtapeCouleurs,
  EtapeCreneau,
  EtapeJeu,
  EtapeLots,
  EtapePartage,
  EtapeVerification,
} from "@/components/wheel/studio/pages";
import type { ActionResult } from "@/lib/utils";
import type { FondKey } from "@/lib/fonds-ecran";
import type { WheelStyle } from "@/lib/wheel-style";
import type { Campaign, Prize, Wheel } from "@/types/database";

/**
 * LE STUDIO DE LA ROUE (VIT-46) — l'écran de réglages, en voyant le jeu.
 *
 * ── CE QU'IL TIENT, ET RIEN D'AUTRE ──
 *
 * L'état des réglages de la roue, les trois charges utiles qui en partent, la
 * roue sélectionnée et l'étape affichée. La coquille, le fil d'étapes, le
 * bandeau et l'enregistrement automatique viennent du socle
 * (`@/components/studio/`) ; chaque étape vit dans `studio/pages.tsx`,
 * l'aperçu dans `studio/apercu.tsx`.
 *
 * ── LE PIÈGE CENTRAL : `updateWheelStyle` ÉCRASE LE STYLE COMPLET ──
 *
 * L'action REMPLACE la colonne `style` : l'éditeur lui envoie l'objet entier
 * en JSON. Le studio coupe l'habillage en DEUX étapes — « L'habillage » (les
 * styles tout prêts et le fond) et « Les couleurs » (le réglage fin). Avec
 * deux formulaires, la seconde effacerait la première, en silence, sur une
 * action qui répond « Enregistré ».
 *
 * La parade n'est pas de mieux synchroniser deux charges : c'est de n'en avoir
 * qu'UNE. Il n'existe qu'un `WheelStyle` en mémoire, les deux étapes écrivent
 * dedans, et `chargeStyleRoue` en sérialise l'objet complet quelle que soit
 * l'étape ouverte. C'est le motif de `composerTheme` en VIT-19 : la FUSION se
 * fait dans l'état, jamais à la reconstruction.
 *
 * ── TROIS CANAUX D'ÉCRITURE, ET C'EST LE MODULE QUI L'IMPOSE ──
 *
 *  · `updateWheel` — `game_type`, `play_limit`, `skill_config` : part par le
 *    `<form>` VIDE de la coquille, déclenché par `requestSubmit`.
 *  · `updateWheelStyle` — la seule colonne `style`.
 *  · `updateWheelSchedule` — les deux heures et les jours cochés.
 *
 * Les deux dernières ne peuvent pas rejoindre le formulaire de réglages :
 * `updateWheel` n'écrit pas leurs colonnes, elles y seraient ignorées. Elles ne
 * peuvent pas non plus garder leur propre `<form>` dans une étape — une étape
 * qu'on quitte est démontée, et l'enregistrement automatique du socle
 * n'atteindrait jamais un formulaire absent. Elles partent donc par
 * `useAutoSaveManuel`, depuis le MÊME état, avec une signature qui ne bouge que
 * lorsque LEURS colonnes bougent.
 *
 * ── CE QUE LE STUDIO N'ABSORBE PAS ──
 *
 * Le statut et la publication, la suppression de la campagne, les QR codes, la
 * performance par lot, la programmation et le budget : ils restent sur la page
 * de suivi, le seul écran qui publie. Les LOTS, « Avant de jouer », « Après le
 * gain », le partage et le parrainage sont montés TELS QUELS, avec leurs
 * propres formulaires et sans une prop de changée — ces mêmes composants sont
 * rendus par `/dashboard/campaigns/[id]`, et une modification d'interface
 * devrait l'être aux deux endroits.
 */
const ID_FORMULAIRE = "studio-roue-reglages";

export interface RoueDuStudio {
  roue: Wheel;
  /** Lots de la roue, déjà triés (position puis création). */
  lots: Prize[];
}

export function RoueStudio({
  campagne,
  roues,
  aDesLiens,
  programmeParrainage,
  parrainageDisponible,
  qrExistant,
  organizationName,
  peutEditer,
}: {
  campagne: Campaign;
  roues: RoueDuStudio[];
  aDesLiens: boolean;
  programmeParrainage: ReferralProgramRow | null;
  parrainageDisponible: boolean;
  qrExistant: boolean;
  organizationName: string;
  peutEditer: boolean;
}) {
  const [roueId, setRoueId] = useState(() => roues[0]?.roue.id ?? "");
  /** L'étape vit ICI, au-dessus du remontage — voir `StudioUneRoue`. */
  const [etape, setEtape] = useState<EtapeStudioRoue>(() =>
    parseEtapeStudioRoue(null),
  );

  const courante = roues.find((r) => r.roue.id === roueId) ?? roues[0];

  /**
   * LE SÉLECTEUR MULTI-ROUES EST TRANSVERSE, IL N'APPARTIENT À AUCUNE ÉTAPE.
   *
   * Il change ce que TOUTES les étapes règlent, pas ce qu'une seule affiche :
   * le poser dans « Le jeu » aurait fait croire qu'on ne change de roue que
   * pour la mécanique. Il vit donc dans les `outils` de la coquille — la même
   * place que l'interrupteur d'exemples du studio de la vitrine.
   */
  const outils =
    roues.length > 1 ? (
      <div className="flex items-center gap-2">
        <label
          htmlFor="studio-roue-selecteur"
          className="text-xs font-bold text-k-ink"
        >
          Le jeu que je règle
        </label>
        <select
          id="studio-roue-selecteur"
          value={courante?.roue.id ?? ""}
          onChange={(e) => setRoueId(e.target.value)}
          className="rounded-xl border-2 border-k-ink bg-white px-2 py-1 text-xs font-bold text-k-ink"
        >
          {roues.map((r) => (
            <option key={r.roue.id} value={r.roue.id}>
              {r.roue.name}
            </option>
          ))}
        </select>
      </div>
    ) : null;

  if (!courante) return null;

  return (
    /**
     * REMONTÉ À CHAQUE CHANGEMENT DE ROUE, et ce n'est pas une commodité.
     *
     * L'état des réglages est celui d'UNE roue. Sans `key`, changer de roue
     * ferait bouger les trois signatures d'enregistrement automatique d'un
     * seul coup — nouvel `id`, nouvelles valeurs — et les trois actions
     * partiraient toutes seules sur la roue qu'on vient d'ouvrir, sans que
     * personne n'ait rien réglé. Le remontage remet les gardes « jamais au
     * montage » à zéro, ce qui est exactement ce qu'on veut dire.
     */
    <StudioUneRoue
      key={courante.roue.id}
      roue={courante.roue}
      lots={courante.lots}
      campagne={campagne}
      aDesLiens={aDesLiens}
      programmeParrainage={programmeParrainage}
      parrainageDisponible={parrainageDisponible}
      qrExistant={qrExistant}
      organizationName={organizationName}
      peutEditer={peutEditer}
      etape={etape}
      onEtape={setEtape}
      outils={outils}
    />
  );
}

function StudioUneRoue({
  roue,
  lots,
  campagne,
  aDesLiens,
  programmeParrainage,
  parrainageDisponible,
  qrExistant,
  organizationName,
  peutEditer,
  etape,
  onEtape,
  outils,
}: {
  roue: Wheel;
  lots: Prize[];
  campagne: Campaign;
  aDesLiens: boolean;
  programmeParrainage: ReferralProgramRow | null;
  parrainageDisponible: boolean;
  qrExistant: boolean;
  organizationName: string;
  peutEditer: boolean;
  etape: EtapeStudioRoue;
  onEtape: (cle: EtapeStudioRoue) => void;
  outils: React.ReactNode;
}) {
  const [etat, setEtat] = useState<EtatRoue>(() => etatInitialRoue(roue));
  /** L'habillage a-t-il été touché depuis l'ouverture ? (confirmation preset) */
  const [habillageTouche, setHabillageTouche] = useState(false);

  const formulaire = useRef<HTMLFormElement | null>(null);
  /** Le conteneur que `useAutoSaveManuel` écoute pour vider sa file au
   *  `focusout` : il enveloppe TOUTES les étapes, donc il est toujours monté —
   *  posé sur le contenu d'une seule étape, l'écouteur ne se serait attaché
   *  qu'à celles ouvertes au moment où l'effet a couru. */
  const colonneReglages = useRef<HTMLDivElement | null>(null);

  const { state, pending, onSubmit } = useActionForm(updateWheel, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  /**
   * LA SIGNATURE DE LA CHARGE, ET NON L'OBJET D'ÉTAT.
   *
   * `useEnregistrementDepuisEtat` relance son minuteur à chaque NOUVELLE
   * référence. Lui passer `etat` ferait repartir le minuteur à chaque rendu du
   * studio — y compris ceux provoqués par un curseur de couleur ou une case du
   * créneau, qui ne concernent pas cette action — et `updateWheel` partirait
   * sans que rien de sa charge n'ait bougé.
   */
  const signatureJeu = JSON.stringify(chargeJeuRoue(roue.id, etat));
  useEnregistrementDepuisEtat({
    valeur: signatureJeu,
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
      const res = await updateWheelStyle(
        null,
        formDataDepuis(chargeStyleRoue(roue.id, etat)),
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
      // L'OBJET COMPLET, TOUJOURS : c'est la signature de la charge, pas celle
      // de l'étape ouverte. `updateWheelStyle` remplace la colonne — un style
      // amputé remettrait vingt réglages à leur défaut.
      signature: JSON.stringify(chargeStyleRoue(roue.id, etat)),
      enregistrer: enregistrerStyle,
      actif: peutEditer,
    });

  // ── Le créneau : deux heures et des jours, un envoi ──
  const [creneauEnCours, setCreneauEnCours] = useState(false);
  const [creneauResultat, setCreneauResultat] = useState<ActionResult | null>(
    null,
  );

  const enregistrerCreneau = async (): Promise<boolean> => {
    setCreneauEnCours(true);
    setCreneauResultat(null);
    try {
      const res = await updateWheelSchedule(
        null,
        formDataCreneau(chargeCreneauRoue(roue.id, etat)),
      );
      setCreneauResultat(res);
      return res.ok;
    } catch {
      setCreneauResultat({
        ok: false,
        error: "Enregistrement impossible, réessayez.",
      });
      return false;
    } finally {
      setCreneauEnCours(false);
    }
  };

  const { enAttente: creneauEnAttente, declencher: envoyerCreneau } =
    useAutoSaveManuel(colonneReglages, {
      signature: JSON.stringify(chargeCreneauRoue(roue.id, etat)),
      enregistrer: enregistrerCreneau,
      actif: peutEditer,
      // `updateWheelScheduleSchema` refuse une SEULE borne (« Renseignez les
      // deux heures ou aucune »). Entre le clic sur « Début » et celui sur
      // « Fin », l'état est donc invalide pendant quelques secondes — et le
      // délai les couvre largement. Sans cette garde, le studio enverrait une
      // écriture vouée au refus à chaque fois qu'on pose la première heure, et
      // afficherait le message d'erreur au milieu du geste.
      valide: () =>
        (etat.schedule_start_hour === "") === (etat.schedule_end_hour === ""),
    });

  /**
   * LE BOUTON « ENREGISTRER » VIDE AUSSI LES DEUX AUTRES FILES.
   *
   * Il ne cible, par `form=`, que le formulaire des réglages : sans ces deux
   * lignes, un commerçant qui choisit un fond, clique « Enregistrer » et quitte
   * aussitôt verrait `updateWheel` partir — et son habillage attendre un délai
   * qui n'arrivera jamais.
   *
   * CONDITIONNÉ à `enAttente`, et pas déclenché à chaque clic : `declencher`
   * FORCE l'envoi même sans changement, ce qui ferait reposter l'habillage
   * depuis « Le jeu ».
   */
  const soumettreReglages = (event: React.FormEvent<HTMLFormElement>) => {
    if (styleEnAttente) envoyerStyle();
    if (creneauEnAttente) envoyerCreneau();
    onSubmit(event);
  };

  const majEtat = (patch: Partial<EtatRoue>) =>
    setEtat((e) => ({ ...e, ...patch }));

  const setStyle = <K extends keyof WheelStyle>(
    key: K,
    value: WheelStyle[K],
  ) => {
    setEtat((e) => ({
      ...e,
      style: { ...e.style, [key]: value, preset: undefined },
    }));
    setHabillageTouche(true);
  };

  /**
   * Fond d'écran — `setStyle` NE CONVIENT PAS : il efface `preset`, et le
   * commerçant perdrait la vignette qui lui rappelle de quel style il part
   * alors qu'il n'a changé aucune couleur. L'image est une couche EN PLUS du
   * style, pas une sortie du style.
   */
  const setFond = (fond: FondKey | undefined) => {
    setEtat((e) => ({ ...e, style: { ...e.style, fond } }));
    setHabillageTouche(true);
  };

  /**
   * Réglages propres à la mécanique. Deux différences avec `setStyle`, toutes
   * deux reprises de l'éditeur de l'atelier :
   *
   * 1. `preset` N'EST PAS effacé — les presets ne touchent pas au sous-objet
   *    `games`, recolorer un gobelet ne « sort » donc pas du style choisi.
   * 2. Les clés des AUTRES mécaniques sont conservées : un contrôle masqué
   *    n'efface jamais sa valeur, et la charge poste le style COMPLET.
   */
  const setJeu = (
    maj: (
      games: NonNullable<WheelStyle["games"]>,
    ) => NonNullable<WheelStyle["games"]>,
  ) => {
    setEtat((e) => ({ ...e, style: { ...e.style, games: maj(e.style.games ?? {}) } }));
    setHabillageTouche(true);
  };

  /**
   * UN PRESET REMPLACE VINGT CHAMPS D'UN COUP, ET L'APERÇU PERMANENT REND LE
   * CLIC PLUS FACILE — raison de plus pour ne pas le rendre plus facile ENCORE.
   *
   * La confirmation de l'atelier est reprise telle quelle, et le `??` avec
   * elle : une AMBIANCE (pas de `fond` dans ses overrides) garde l'image en
   * place, un UNIVERS impose la sienne. `setStyle(presetStyle)` nu effaçait
   * `fond` en silence — le commerçant choisissait son image, essayait « Néon »
   * par curiosité, et la photo disparaissait sans un mot.
   */
  const appliquerPreset = (presetStyle: WheelStyle) => {
    if (
      habillageTouche &&
      !confirm(
        "Appliquer ce style remplacera toutes vos retouches (couleurs, police, accroche). Continuer ?",
      )
    ) {
      return;
    }
    setEtat((e) => ({
      ...e,
      style: { ...presetStyle, fond: presetStyle.fond ?? e.style.fond },
    }));
    setHabillageTouche(true);
  };

  // ── Ce que les étapes lisent en plus de l'état ──

  const lotsActifs = useMemo(() => lots.filter((p) => p.is_active), [lots]);
  const segments: WheelSegment[] = useMemo(
    () => lotsActifs.map((p) => ({ id: p.id, label: p.label, color: p.color })),
    [lotsActifs],
  );
  /**
   * MIROIR EXACT de la condition du moteur (`perform_atomic_spin` :
   * `p.is_losing or p.stock is null or p.stock > 0`), comme dans l'atelier. Un
   * lot épuisé n'est plus tiré ; le compter dans le total affichait des
   * probabilités FAUSSES.
   */
  const poidsTotal = useMemo(
    () =>
      lotsActifs
        .filter((p) => p.is_losing || p.stock === null || p.stock > 0)
        .reduce((a, p) => a + p.weight, 0),
    [lotsActifs],
  );

  /**
   * L'entrée de la vérification lit l'ÉTAT, pas la base, pour la mécanique et
   * le défi : le commerçant qui vient de choisir « Mot mystère » sans encore
   * l'enregistrer doit voir « le mot est manquant », pas le verdict de la roue
   * d'avant. Les lots et le QR, eux, viennent du serveur — ils s'écrivent par
   * leurs propres actions et la page est revalidée.
   */
  const entreeVerification = {
    campaignId: campagne.id,
    gameType: etat.game_type,
    skillConfig: (() => {
      const brut = chargeJeuRoue(roue.id, etat).skill_config;
      if (!brut) return null;
      try {
        return JSON.parse(brut) as unknown;
      } catch {
        return null;
      }
    })(),
    prizes: lots.map((p) => ({
      is_active: p.is_active,
      is_losing: p.is_losing,
      weight: p.weight,
      stock: p.stock,
    })),
    qrExistant,
    campagne: {
      status: campagne.status,
      starts_at: campagne.starts_at,
      ends_at: campagne.ends_at,
    },
  };

  /** Le premier refus non nul des trois canaux — le commerçant n'a qu'un écran. */
  const erreur = useMemo(() => {
    if (state && !state.ok) return state.error;
    if (styleResultat && !styleResultat.ok) return styleResultat.error;
    if (creneauResultat && !creneauResultat.ok) return creneauResultat.error;
    return undefined;
  }, [state, styleResultat, creneauResultat]);

  return (
    <CoquilleStudio
      titre={`Mon studio — ${roue.name}`}
      hrefRetour={`/dashboard/campaigns/${campagne.id}`}
      idFormulaire={ID_FORMULAIRE}
      formulaire={formulaire}
      onSubmit={soumettreReglages}
      champsCaches={<ChampsCachesRoue id={roue.id} etat={etat} />}
      etapes={ETAPES_STUDIO_ROUE}
      etape={etape}
      onEtape={onEtape}
      peutEditer={peutEditer}
      enregistrement={{
        // LES TROIS CANAUX, LUS ENSEMBLE : le commerçant n'a qu'un écran, il ne
        // doit pas avoir à deviner lequel des trois enregistrements parle.
        enCours: pending || styleEnCours || creneauEnCours,
        reussi:
          state?.ok === true ||
          styleResultat?.ok === true ||
          creneauResultat?.ok === true,
        erreur,
      }}
      outils={outils}
      apercu={
        <ApercuRoue
          etat={etat}
          segments={segments}
          organizationName={organizationName}
        />
      }
    >
      <div ref={colonneReglages}>
        {etape === "jeu" ? (
          <EtapeJeu etat={etat} majEtat={majEtat} peutEditer={peutEditer} />
        ) : null}
        {etape === "lots" ? (
          <EtapeLots wheelId={roue.id} lots={lots} poidsTotal={poidsTotal} />
        ) : null}
        {etape === "allure" ? (
          <EtapeAllure
            etat={etat}
            peutEditer={peutEditer}
            appliquerPreset={appliquerPreset}
            setFond={setFond}
          />
        ) : null}
        {etape === "couleurs" ? (
          <EtapeCouleurs
            etat={etat}
            peutEditer={peutEditer}
            segments={segments}
            setStyle={setStyle}
            setJeu={setJeu}
          />
        ) : null}
        {etape === "creneau" ? (
          <EtapeCreneau etat={etat} majEtat={majEtat} peutEditer={peutEditer} />
        ) : null}
        {etape === "avant" ? (
          <EtapeAvant
            campaignId={campagne.id}
            campagne={campagne}
            aDesLiens={aDesLiens}
          />
        ) : null}
        {etape === "apres" ? <EtapeApres campagne={campagne} /> : null}
        {etape === "partage" ? (
          <EtapePartage
            campaignId={campagne.id}
            campagne={campagne}
            programmeParrainage={programmeParrainage}
            parrainageDisponible={parrainageDisponible}
          />
        ) : null}
        {etape === "verification" ? (
          <EtapeVerification wheelId={roue.id} entree={entreeVerification} />
        ) : null}
      </div>
    </CoquilleStudio>
  );
}
