"use client";

import { useRef, useState } from "react";
import { updateHunt } from "@/actions/hunts";
import { useActionForm } from "@/lib/use-action-form";
import { Card } from "@/components/ui/card";
import { CoquilleStudio } from "@/components/studio/coquille";
import { useEnregistrementDepuisEtat } from "@/components/studio/use-enregistrement-etat";
import {
  HuntStatusControls,
  HuntStepsEditor,
} from "@/components/dashboard/hunt-editor";
import { HuntPosters } from "@/components/dashboard/hunt-posters";
import { AtelierVerificationChasse } from "@/components/dashboard/atelier-hunt-verification";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { ordreAffiche } from "@/lib/ordre-optimiste";
import type { EntreeVerificationChasse } from "@/lib/activation/hunts";
import type { Hunt, HuntStep } from "@/types/database";
import { ApercuChasse } from "@/components/hunts/studio/apercu";
import { ChampsCachesChasse } from "@/components/hunts/studio/champs-caches";
import {
  etatInitialChasse,
  type EtatChasse,
} from "@/components/hunts/studio/etat";
import {
  ETAPES_STUDIO_CHASSE,
  parseEtapeStudioChasse,
  type EtapeStudioChasse,
} from "@/components/hunts/studio/etapes";
import {
  EtapeLot,
  EtapeNom,
  EtapeOrdre,
  EtapeQuand,
} from "@/components/hunts/studio/pages";

/**
 * LE STUDIO DE LA CHASSE (VIT-40) — l'écran de réglages, en voyant la page.
 *
 * ── CE QU'IL TIENT, ET RIEN D'AUTRE ──
 *
 * Trois choses : l'état des réglages, la charge utile du formulaire, et
 * l'étape affichée. La coquille, le fil d'étapes, le bandeau et
 * l'enregistrement automatique viennent du socle (`@/components/studio/`) ;
 * chaque étape vit dans `studio/pages.tsx`, l'aperçu dans `studio/apercu.tsx`.
 *
 * ── LE PIÈGE QUE CE FICHIER EXISTE POUR DÉSAMORCER ──
 *
 * `updateHunt` lit NEUF champs d'un seul `FormData` et réécrit la ligne en
 * bloc : un champ absent est ÉCRASÉ. C'est pour cela que l'atelier historique
 * empile le nom, l'ordre, le délai, la fenêtre de jeu et le lot final sur une
 * seule étape. La parade n'est pas une précaution mais la structure entière de
 * cet écran : aucun contrôle visible ne porte de `name` de réglage, et
 * `ChampsCachesChasse` rend la charge EN ENTIER à chaque rendu, depuis l'état,
 * quelle que soit l'étape ouverte.
 *
 * ── L'ORDRE DES ÉTAPES DE LA CHASSE EST OPTIMISTE, ET ÇA SE LIT ICI AUSSI ──
 *
 * `HuntStepsEditor` garde un écrasement local de l'ordre parce que
 * `router.refresh()` échoue 5 à 32 % du temps (docs/bugs.md). Cet écrasement
 * vit CHEZ LUI, et l'aperçu ne le voit pas : il lit donc `ordreAffiche(steps,
 * null)`, c'est-à-dire l'ordre serveur. Un aperçu qui montrerait un ordre
 * différent de la liste voisine serait pire que pas d'aperçu — mais l'écart
 * est borné à la fenêtre d'un rafraîchissement raté, et se referme à la
 * prochaine lecture. La ligne existe pour que ce choix soit LU, et non
 * découvert.
 */
const ID_FORMULAIRE = "studio-chasse-reglages";

export function ChasseStudio({
  hunt,
  steps,
  posterSteps,
  entreeVerification,
  timeZone,
  organizationName,
  organizationId,
  logoUrl,
  publicUrl,
  peutEditer,
}: {
  hunt: Hunt;
  /** Étapes triées par position croissante. */
  steps: HuntStep[];
  /** Affiches QR — mêmes données que l'atelier, calculées côté serveur. */
  posterSteps: Array<{
    id: string;
    position: number;
    label: string;
    token: string;
    url: string;
    opens: number;
  }>;
  entreeVerification: EntreeVerificationChasse;
  /** Fuseau de l'établissement — celui dans lequel l'action relit les dates. */
  timeZone: string;
  organizationName: string;
  organizationId: string;
  logoUrl: string | null;
  /** QR de la première étape ; `null` tant que la chasse n'a pas d'étape. */
  publicUrl: string | null;
  peutEditer: boolean;
}) {
  const [etape, setEtape] = useState<EtapeStudioChasse>(() =>
    parseEtapeStudioChasse(null),
  );
  const [etat, setEtat] = useState<EtatChasse>(() =>
    etatInitialChasse(hunt, timeZone),
  );
  // Réglage d'AFFICHAGE : il ne part jamais au serveur (outil de studio).
  const [positionApercu, setPositionApercu] = useState(1);

  const formulaire = useRef<HTMLFormElement | null>(null);

  const { state, pending, onSubmit } = useActionForm(updateHunt, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  /**
   * L'ENREGISTREMENT AUTOMATIQUE VIENT DU SOCLE (VIT-38), avec ses deux gardes
   * — rien au montage, rien sans le droit d'écrire. Le calendrier en ajoutait
   * une troisième pour sa réduction destructrice de grille ; la chasse n'en a
   * pas besoin : `updateHunt` ne détruit rien, et les deux gestes destructeurs
   * du module (supprimer une étape, supprimer la chasse) vivent dans leurs
   * propres formulaires, avec leur propre confirmation.
   */
  useEnregistrementDepuisEtat({
    valeur: etat,
    formulaire,
    actif: peutEditer,
  });

  const majEtat = (patch: Partial<EtatChasse>) =>
    setEtat((e) => ({ ...e, ...patch }));

  const proprietes = { etat, majEtat, peutEditer };

  return (
    <CoquilleStudio
      titre="Mon studio — Chasse au QR"
      hrefRetour={`/dashboard/hunts/${hunt.id}`}
      idFormulaire={ID_FORMULAIRE}
      formulaire={formulaire}
      onSubmit={onSubmit}
      champsCaches={<ChampsCachesChasse id={hunt.id} etat={etat} />}
      etapes={ETAPES_STUDIO_CHASSE}
      etape={etape}
      onEtape={setEtape}
      peutEditer={peutEditer}
      enregistrement={{
        enCours: pending,
        reussi: state?.ok === true,
        erreur: state && !state.ok ? state.error : undefined,
      }}
      apercu={
        <ApercuChasse
          etat={etat}
          etapes={ordreAffiche(steps, null)}
          positionApercu={positionApercu}
          onPositionApercu={setPositionApercu}
          organizationName={organizationName}
          organizationId={organizationId}
          logoUrl={logoUrl}
        />
      }
    >
      {etape === "nom" ? <EtapeNom {...proprietes} /> : null}

      {/* LES ÉTAPES DE LA CHASSE SONT L'ÉDITEUR DE L'ATELIER, sous deux
          visages : `updateHuntStep` est atomique par étape, donc immunisé au
          piège de l'écrasement en bloc de `updateHunt`. Une seconde liste
          propre au studio aurait été une deuxième vérité sur l'ordre — celui
          que `ordreAffiche` protège justement d'un rafraîchissement raté.

          `rechargerApresAjout={false}` : le rechargement franc de l'atelier
          emporterait les réglages saisis depuis moins d'une seconde et
          ramènerait le commerçant sur la première étape du studio. Le doublon
          qu'il protège est écarté autrement — par un accusé qui NOMME l'étape
          ajoutée (voir `AddStepForm`). */}
      {etape === "etapes" ? (
        <HuntStepsEditor
          huntId={hunt.id}
          steps={steps}
          champs="libelles"
          rechargerApresAjout={false}
        />
      ) : null}

      {etape === "indices" ? (
        <HuntStepsEditor huntId={hunt.id} steps={steps} champs="indices" />
      ) : null}

      {etape === "ordre" ? <EtapeOrdre {...proprietes} /> : null}
      {etape === "quand" ? (
        <EtapeQuand {...proprietes} timeZone={timeZone} />
      ) : null}
      {etape === "lot" ? <EtapeLot {...proprietes} /> : null}

      {etape === "verification" ? (
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold mb-1">Affiches QR des étapes</h2>
            <p className="text-sm text-zinc-500 mb-3">
              Une affiche par étape à imprimer et poser sur place. Chaque QR
              renvoie le joueur vers la page de l&apos;étape correspondante.
              Rien à enregistrer ici : les affiches se régénèrent toutes seules
              quand vous renommez ou réordonnez une étape.
            </p>
            <InfoBulle
              id="aide-studio-chasse-affiches"
              resume="Que compte le chiffre sous chaque affiche ?"
              className="mb-4"
            >
              Le nombre de CHARGEMENTS de la page de cette étape — pas de
              scanneurs distincts : un rechargement ou un lien partagé comptent
              aussi. C&apos;est ce qui vous dit lequel de vos emplacements
              travaille. Le QR de la première étape sert d&apos;aperçu même en
              brouillon, mais les pages ne s&apos;ouvrent aux joueurs
              qu&apos;une fois la Chasse au QR publiée.
            </InfoBulle>
            <HuntPosters huntName={etat.name} steps={posterSteps} />
          </Card>
          <AtelierVerificationChasse entree={entreeVerification} />
          <HuntStatusControls
            hunt={hunt}
            stepCount={steps.length}
            hrefJeu={publicUrl}
          />
        </div>
      ) : null}
    </CoquilleStudio>
  );
}
