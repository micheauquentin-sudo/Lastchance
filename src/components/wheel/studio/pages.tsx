"use client";

import { GoogleFontLinks } from "@/components/dashboard/editor-controls";
import {
  ChampLimite,
  ChampsDefi,
  ChoixMecanique,
} from "@/components/dashboard/atelier-roue-champs";
import { ChampsCreneau } from "@/components/dashboard/atelier-roue-creneau";
import {
  NoteHabillage,
  SectionCeJeu,
  SectionPageDeJeu,
  SectionRoue,
  SectionStylesPrets,
} from "@/components/dashboard/atelier-roue-habillage";
import { defautsDefi, type EtatDefi } from "@/components/dashboard/atelier-roue-defi";
import { AtelierVerification } from "@/components/dashboard/atelier-verification";
import { CampaignPrejeuInvitation } from "@/components/dashboard/campaign-prejeu-invitation";
import { CampaignClaimSettings } from "@/components/dashboard/campaign-play-settings";
import { CampaignShareSettings } from "@/components/dashboard/campaign-share-settings";
import { PrizeEditor } from "@/components/dashboard/prize-editor";
import {
  ReferralProgramSettings,
  type ReferralProgramRow,
} from "@/components/dashboard/referral-program-settings";
import { SelecteurFond } from "@/components/dashboard/selecteur-fond";
import { Card } from "@/components/ui/card";
import type { EntreeVerification } from "@/components/dashboard/atelier-verification-state";
import type { WheelSegment } from "@/components/wheel/wheel-svg";
import type { EtatRoue } from "@/components/wheel/studio/etat";
import type { FondKey } from "@/lib/fonds-ecran";
import type { WheelStyle } from "@/lib/wheel-style";
import {
  isClientReportedSkillGameType,
  isSecretSkillGameType,
} from "@/lib/validations/skill";
import type { Campaign, GameType, PlayLimit, Prize } from "@/types/database";

/**
 * LE CONTENU DES ÉTAPES DU STUDIO DE LA ROUE (VIT-46).
 *
 * ── AUCUN CONTRÔLE DE CE FICHIER NE PORTE DE `name` DE RÉGLAGE DE ROUE ──
 *
 * C'est la règle du socle, et elle ne se négocie pas : une étape qu'on quitte
 * est DÉMONTÉE. Un `name` posé ici disparaîtrait du formulaire de réglages, et
 * l'enregistrement automatique suivant partirait amputé — sur `updateWheel`,
 * qui exige `game_type` ET `play_limit` ensemble, l'action refuserait ; sur le
 * créneau, « aucun jour coché » vaut TOUS les jours et rouvrirait le jeu sans
 * un mot.
 *
 * Tout écrit donc dans `EtatRoue` ; la charge d'`updateWheel` est rendue à
 * part, en entier, par `ChampsCachesRoue`, et celles du style et du créneau
 * partent de ce même état par leur propre canal (`roue-studio.tsx`).
 *
 * ── LES BLOCS QUI GARDENT LEUR PROPRE `<form>`, ET POURQUOI ──
 *
 * Les LOTS (`PrizeEditor` — un `<form>` PAR LOT, un formulaire d'ajout, une
 * suppression rattachée par `form=` et un compare-and-swap sur `stock_seen`),
 * « Avant de jouer », « Après le gain », le PARTAGE et le PARRAINAGE portent
 * leurs propres formulaires et leurs propres actions, atomiques. Ils sont
 * montés TELS QUELS, sans une prop de changée : ces mêmes composants sont
 * rendus par `/dashboard/campaigns/[id]` dans ses cartes repliables, et toute
 * modification de leur interface devrait être faite aux deux endroits. C'est
 * aussi pourquoi la colonne de réglages n'est JAMAIS enveloppée dans un
 * `<form>` — un `<form>` dans un `<form>` est du HTML invalide, et
 * l'hydratation de tout l'écran meurt (défaut livré en VIT-16).
 */

export interface ProprietesEtapeRoue {
  etat: EtatRoue;
  majEtat: (patch: Partial<EtatRoue>) => void;
  peutEditer: boolean;
}

function TitreEtape({ titre, aide }: { titre: string; aide: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-black text-k-ink">{titre}</h2>
      <p className="mt-1 text-sm text-k-body">{aide}</p>
    </div>
  );
}

// ── 1. Le jeu ───────────────────────────────────────────────

/**
 * Mécanique, réglages du défi et limite de participation, ENSEMBLE.
 *
 * Le socle lève l'obligation mécanique de les réunir : la charge complète est
 * rendue par `ChampsCachesRoue` quelle que soit l'étape ouverte. Ce qui les
 * garde ensemble est la contrainte CROISÉE — « Illimité » est interdit sur les
 * jeux à secret, l'option est grisée en conséquence, et la note qui l'explique
 * porte sur la mécanique. Séparées, le commerçant lirait un refus concernant un
 * réglage qu'il ne voit pas.
 */
export function EtapeJeu({ etat, majEtat, peutEditer }: ProprietesEtapeRoue) {
  function choisirMecanique(valeur: GameType) {
    if (valeur === etat.game_type) return;
    const patch: Partial<EtatRoue> = {
      game_type: valeur,
      // La config existante n'est relue que si la mécanique choisie EST celle
      // qui l'a produite — les clés se chevauchent d'une mécanique à l'autre
      // (`tolerance` contre `tolerancePct`, `hint` contre `question`), et une
      // valeur jamais saisie pour ce jeu-là réapparaîtrait sinon.
      defi: defautsDefi(valeur, null),
    };
    // « Illimité » est refusé côté serveur pour les jeux à secret ET pour ceux
    // dont la réussite est rapportée par l'appareil du joueur. Le refus
    // arrivait après coup, sur un écran que le commerçant croyait fini.
    const sansIllimite =
      isSecretSkillGameType(valeur) || isClientReportedSkillGameType(valeur);
    if (sansIllimite && etat.play_limit === "unlimited") {
      patch.play_limit = "once";
    }
    majEtat(patch);
  }

  function setDefi<K extends keyof EtatDefi>(cle: K, valeur: EtatDefi[K]) {
    majEtat({ defi: { ...etat.defi, [cle]: valeur } });
  }

  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Le jeu"
        aide="À quoi vos clients jouent, et combien de fois ils peuvent tenter leur chance."
      />

      <ChoixMecanique
        gameType={etat.game_type}
        onChoisir={choisirMecanique}
        /* Groupement clavier SEULEMENT : ce nom n'est pas celui de la charge
           utile (`game_type`), qui part depuis `ChampsCachesRoue`. */
        nomGroupe="studio-roue-mecanique"
        disabled={!peutEditer}
      />

      <ChampsDefi
        gameType={etat.game_type}
        defi={etat.defi}
        set={setDefi}
        disabled={!peutEditer}
      />

      <ChampLimite
        gameType={etat.game_type}
        playLimit={etat.play_limit}
        onChange={(valeur: PlayLimit) => majEtat({ play_limit: valeur })}
        /* Pas de `nomChamp` : dans un studio, aucun contrôle visible ne porte
           de `name` de réglage. Voir l'en-tête de ce fichier. */
        disabled={!peutEditer}
      />
    </div>
  );
}

// ── 2. Les gains ────────────────────────────────────────────

export function EtapeLots({
  wheelId,
  lots,
  poidsTotal,
}: {
  wheelId: string;
  lots: Prize[];
  poidsTotal: number;
}) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Les gains"
        aide="Ce que vos clients peuvent gagner, à quelle fréquence, et en quelle quantité. Chaque lot s'enregistre pour lui-même."
      />
      <PrizeEditor wheelId={wheelId} prizes={lots} totalWeight={poidsTotal} />
    </div>
  );
}

// ── 3. L'habillage ──────────────────────────────────────────

/**
 * Les styles prêts à l'emploi et le fond d'écran.
 *
 * ── LE PRESET RESTE DESTRUCTEUR, ET LA CONFIRMATION RESTE ──
 *
 * Une pastille remplace vingt champs d'un coup. Un aperçu permanent rend le
 * clic PLUS facile : il n'est donc pas question de le rendre plus facile
 * ENCORE. La confirmation est portée par le studio (`roue-studio.tsx`) parce
 * que c'est lui qui sait si l'état a été touché depuis l'ouverture.
 */
export function EtapeAllure({
  etat,
  peutEditer,
  appliquerPreset,
  setFond,
}: {
  etat: EtatRoue;
  peutEditer: boolean;
  appliquerPreset: (presetStyle: WheelStyle) => void;
  setFond: (fond: FondKey | undefined) => void;
}) {
  return (
    <div className="space-y-5">
      <GoogleFontLinks />
      <TitreEtape
        titre="L'habillage"
        aide="Partez d'un style tout prêt, puis posez la grande image de fond. L'aperçu à droite se repeint immédiatement."
      />

      <fieldset disabled={!peutEditer} className="space-y-5">
        <SectionStylesPrets
          style={etat.style}
          appliquerPreset={appliquerPreset}
        />
        <SelecteurFond
          nomGroupe="studio-roue-fond"
          valeur={etat.style.fond}
          onChange={setFond}
          aide="Une grande image derrière le jeu. Elle s'affiche sur les deux ambiances, adoucie pour que les textes restent lisibles."
        />
      </fieldset>
    </div>
  );
}

// ── 4. Les couleurs ─────────────────────────────────────────

/**
 * Le réglage fin — la roue, l'objet du jeu, la page.
 *
 * Les trois sections écrivent dans le MÊME `etat.style` que l'étape
 * précédente : `updateWheelStyle` remplace la colonne, et deux étapes qui
 * construiraient chacune leur objet s'effaceraient l'une l'autre. Ici aucune
 * ne construit rien.
 *
 * Les trois ne sont pas coupées en étapes distinctes : douze réglages
 * n'existent que sur le SVG de la roue et la section « Ce jeu » n'existe que
 * pour huit mécaniques — une étape « Les couleurs de la roue » serait VIDE
 * pour les quatorze autres jeux (voir `etapes.ts`).
 */
export function EtapeCouleurs({
  etat,
  peutEditer,
  segments,
  setStyle,
  setJeu,
}: {
  etat: EtatRoue;
  peutEditer: boolean;
  segments: readonly WheelSegment[];
  setStyle: <K extends keyof WheelStyle>(key: K, value: WheelStyle[K]) => void;
  setJeu: (
    maj: (
      games: NonNullable<WheelStyle["games"]>,
    ) => NonNullable<WheelStyle["games"]>,
  ) => void;
}) {
  return (
    <div className="space-y-5">
      <GoogleFontLinks />
      <TitreEtape
        titre="Les couleurs"
        aide="Chaque détail, un par un. Ce que vous ne voyez pas ici n'existe pas sur le jeu que vous avez choisi."
      />
      <fieldset disabled={!peutEditer} className="space-y-5">
        <NoteHabillage gameType={etat.game_type} />
        <SectionRoue
          style={etat.style}
          set={setStyle}
          segments={segments}
          gameType={etat.game_type}
        />
        <SectionCeJeu
          style={etat.style}
          setJeu={setJeu}
          gameType={etat.game_type}
        />
        <SectionPageDeJeu style={etat.style} set={setStyle} />
      </fieldset>
    </div>
  );
}

// ── 5. Quand on peut jouer ──────────────────────────────────

export function EtapeCreneau({ etat, majEtat, peutEditer }: ProprietesEtapeRoue) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Quand on peut jouer"
        aide="Laissez tout vide pour un jeu toujours ouvert. Sinon, il ne tourne que sur le créneau choisi (heure locale de votre établissement)."
      />
      <ChampsCreneau
        debut={etat.schedule_start_hour}
        fin={etat.schedule_end_hour}
        jours={etat.schedule_days}
        onDebut={(valeur) => majEtat({ schedule_start_hour: valeur })}
        onFin={(valeur) => majEtat({ schedule_end_hour: valeur })}
        onJours={(jours) => majEtat({ schedule_days: jours })}
        /* Aucun `name` : la charge du créneau part depuis l'état, par son
           propre canal. Une case démontée avec son étape signifierait « tous
           les jours » et rouvrirait le jeu en silence. */
        nomme={false}
        disabled={!peutEditer}
      />
    </div>
  );
}

// ── 6. Avant de jouer ───────────────────────────────────────

export function EtapeAvant({
  campaignId,
  campagne,
  aDesLiens,
}: {
  campaignId: string;
  campagne: Campaign;
  aDesLiens: boolean;
}) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Avant de jouer"
        aide="Facultatif : proposer un avis Google ou un abonnement à vos réseaux, juste avant la partie."
      />
      <CampaignPrejeuInvitation
        campaignId={campaignId}
        enabled={campagne.prejeu_invitation}
        aDesLiens={aDesLiens}
      />
    </div>
  );
}

// ── 7. Après le gain ────────────────────────────────────────

export function EtapeApres({ campagne }: { campagne: Campaign }) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Après le gain"
        aide="Ce qu'on demande au gagnant avant de lui donner son code, et combien de temps ce code reste valable."
      />
      <CampaignClaimSettings campaign={campagne} />
    </div>
  );
}

// ── 8. Faire venir d'autres clients ─────────────────────────

export function EtapePartage({
  campaignId,
  campagne,
  programmeParrainage,
  parrainageDisponible,
}: {
  campaignId: string;
  campagne: Campaign;
  programmeParrainage: ReferralProgramRow | null;
  parrainageDisponible: boolean;
}) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Faire venir d'autres clients"
        aide="Ce qu'on propose à votre client une fois sa partie finie : partager le jeu, et inviter un proche."
      />
      {/* UNE SEULE `Card`, deux sections séparées par un filet — la forme
          qu'a prise la tuile « Partage et parrainage » de la page de suivi
          après qu'un second `Card` y ait flotté hors du cadre. */}
      <Card>
        <h2 className="mb-1 font-black text-k-ink">Partage et parrainage</h2>
        <div className="mt-4">
          <CampaignShareSettings
            campaignId={campaignId}
            enabled={campagne.share_enabled}
          />
        </div>
        <div className="mt-5 border-t border-zinc-100 pt-4">
          <ReferralProgramSettings
            campaignId={campaignId}
            program={programmeParrainage}
            hasAccess={parrainageDisponible}
          />
        </div>
      </Card>
    </div>
  );
}

// ── 9. Dernière vérification ────────────────────────────────

/**
 * Elle n'écrit rien et NE PUBLIE PAS : un seul écran publie, la page de suivi
 * de la campagne (`#statut`), et `AtelierVerification` y renvoie déjà. Deux
 * boutons « Ouvrir aux joueurs » à deux endroits, ce sont deux vérités sur
 * l'état d'une animation.
 *
 * C'est aussi la SEULE étape qui monte `WheelPreviewTest` — le seul aperçu de
 * ce module qui touche le serveur (`previewSpin`). Il n'entre jamais dans
 * l'aperçu permanent de la colonne de droite : celui-ci vit sous les yeux du
 * commerçant pendant qu'il règle vingt curseurs, et partirait au serveur à
 * chaque curseur.
 */
export function EtapeVerification({
  wheelId,
  entree,
}: {
  wheelId: string;
  entree: EntreeVerification;
}) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Dernière vérification"
        aide="Calculé sur l'état réel de votre jeu. L'ouverture aux joueurs, elle, se fait depuis l'écran de suivi de la campagne."
      />
      <AtelierVerification wheelId={wheelId} entree={entree} />
    </div>
  );
}
