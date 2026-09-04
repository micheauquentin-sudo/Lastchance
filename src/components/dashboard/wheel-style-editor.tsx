"use client";

import { useEffect, useRef, useState } from "react";
import { updateWheelStyle } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GoogleFontLinks } from "@/components/dashboard/editor-controls";
import { FieldError } from "@/components/ui/input";
import type { WheelSegment } from "@/components/wheel/wheel-svg";
import {
  ApercuAccueilJeu,
  SEGMENTS_APERCU,
} from "@/components/dashboard/apercu-accueil-jeu";
import {
  NoteHabillage,
  SectionCeJeu,
  SectionPageDeJeu,
  SectionRoue,
  SectionStylesPrets,
} from "@/components/dashboard/atelier-roue-habillage";
import { SelecteurFond } from "@/components/dashboard/selecteur-fond";
import { type FondKey } from "@/lib/fonds-ecran";
import type { GameType } from "@/types/database";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";

/**
 * Éditeur complet du style de la roue : presets mélangeables + réglage
 * fin de chaque détail, avec aperçu fidèle (fond, pointeur, roue,
 * bouton) identique à ce que verra le client après le scan.
 *
 * `gameType` est FACULTATIF : sans lui, l'éditeur garde sa portée historique
 * (tous les réglages, aperçu de roue). Avec lui, il n'expose que ce que la
 * mécanique choisie rend réellement — voir wheel-style-scope.ts.
 *
 * ── LES SECTIONS SONT PARTAGÉES AVEC LE STUDIO (VIT-46) ──
 *
 * Les styles prêts à l'emploi, les réglages de la roue, ceux de l'objet du jeu
 * et ceux de la page vivent désormais dans `atelier-roue-habillage.tsx` : le
 * studio les monte sur DEUX étapes, cet éditeur les empile sur un seul écran.
 * Aucune n'a été modifiée au passage — et aucune ne construit la charge : elles
 * écrivent toutes dans le MÊME `WheelStyle`, qui est ce qui part.
 */
export function WheelStyleEditor({
  wheelId,
  initialStyle,
  segments,
  organizationName,
  gameType,
}: {
  wheelId: string;
  initialStyle: Record<string, unknown>;
  segments: WheelSegment[];
  organizationName: string;
  gameType?: GameType;
}) {
  const [style, setStyle] = useState<WheelStyle>(() =>
    resolveWheelStyle(initialStyle),
  );
  // `useActionForm` et non `useActionState` : l'état de chargement doit
  // retomber même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
  const { state, pending, onSubmit } = useActionForm(updateWheelStyle, {
    toastOnSuccess: "Enregistré.",
  });
  const [dirty, setDirty] = useState(false);

  /**
   * ENREGISTREMENT AUTOMATIQUE — via un `input` ÉMIS, faute de champ à écouter.
   *
   * Les vingt contrôles d'habillage vivent HORS du `<form>` : celui-ci ne porte
   * que deux champs cachés (`id` et le style sérialisé). Aucun événement de
   * saisie ne l'atteint donc jamais, et `useAutoSave` — qui écoute le
   * formulaire — n'aurait rien vu. On lui en émet un, depuis le formulaire
   * lui-même, à chaque modification du style.
   *
   * `dirty` est le garde-fou du montage, exigé par le contrat de `useAutoSave` :
   * il est FAUX tant que personne n'a rien touché, donc le premier rendu ne
   * poste rien. Enregistrer remet `dirty` à faux (bouton) ; la modification
   * suivante le relève.
   */
  const formRef = useRef<HTMLFormElement>(null);
  const { enAttente, bloqueParValidation } = useAutoSave(formRef);

  /**
   * Un preset REMPLACE les vingt champs d'un coup. Tant qu'il n'y a rien à
   * écraser, c'est un raccourci ; après dix minutes de réglage fin, c'était
   * une perte sèche sur un clic de curiosité, sans un mot. On demande.
   *
   * ── LE FOND D'ÉCRAN SURVIT AUX AMBIANCES ──
   *
   * `setStyle(presetStyle)` nu effaçait `fond` en silence : les huit ambiances
   * n'en portent pas, et le champ absent du style de remplacement valait
   * suppression. Le commerçant choisissait son image, essayait « Néon » par
   * curiosité, et la photo disparaissait sans un mot — un geste de couleurs
   * annulait un choix qui n'en est pas un.
   *
   * D'où le `??` : une AMBIANCE (pas de `fond` dans ses overrides) garde
   * l'image en place, un UNIVERS impose la sienne — c'est justement ce qu'il
   * promet. La règle tient sans liste à maintenir : elle se lit sur le style
   * du preset lui-même.
   */
  function appliquerPreset(presetStyle: WheelStyle) {
    if (
      dirty &&
      !confirm(
        "Appliquer ce style remplacera toutes vos retouches (couleurs, police, accroche). Continuer ?",
      )
    ) {
      return;
    }
    setStyle((s) => ({ ...presetStyle, fond: presetStyle.fond ?? s.fond }));
    setDirty(true);
  }

  const styleSerialise = JSON.stringify(style);
  useEffect(() => {
    if (!dirty) return;
    formRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [styleSerialise, dirty]);

  function set<K extends keyof WheelStyle>(key: K, value: WheelStyle[K]) {
    setStyle((s) => ({ ...s, [key]: value, preset: undefined }));
    setDirty(true);
  }

  /**
   * Fond d'écran — `set` NE CONVIENT PAS ici, pour la même raison que `setJeu` :
   * il efface `preset`, et le commerçant perdrait la vignette qui lui rappelle
   * de quel style il part alors qu'il n'en a changé aucune couleur. L'image est
   * une couche EN PLUS du style, pas une sortie du style.
   */
  function setFond(fond: FondKey | undefined) {
    setStyle((s) => ({ ...s, fond }));
    setDirty(true);
  }

  /**
   * Réglages propres à la mécanique. Deux différences avec `set`, toutes deux
   * délibérées :
   *
   * 1. `preset` N'EST PAS effacé. Les presets ne touchent pas au sous-objet
   *    `games` (wheel-style.ts le dit et wheel-style.test.ts le tient) :
   *    recolorer un gobelet ne « sort » donc pas du style choisi, et l'effacer
   *    ferait perdre au commerçant la vignette qui lui rappelle d'où il part.
   * 2. Les clés des AUTRES mécaniques sont conservées telles quelles. Un
   *    commerçant qui essaie « Memory », choisit un dos rouge, repasse au dé
   *    puis revient doit retrouver son rouge : un contrôle masqué n'efface
   *    jamais sa valeur, et le formulaire poste le style COMPLET.
   */
  function setJeu(
    maj: (games: NonNullable<WheelStyle["games"]>) => NonNullable<WheelStyle["games"]>,
  ) {
    setStyle((s) => ({ ...s, games: maj(s.games ?? {}) }));
    setDirty(true);
  }

  // Les quatre segments de démonstration vivent avec l'aperçu qui les dessine
  // (`apercu-accueil-jeu.tsx`) : ils servent aussi l'étape « Le jeu ».
  const previewSegments: WheelSegment[] =
    segments.length > 0 ? segments : [...SEGMENTS_APERCU];

  return (
    <Card>
      <GoogleFontLinks />
      <h2 className="font-semibold mb-1">Personnalisation</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Partez d&apos;un style, puis modifiez chaque détail. L&apos;aperçu
        est exactement ce que verront vos clients.
      </p>

      {/* Aperçu fidèle. La phrase ci-dessus n'est plus une intention : le
          cadre pose la MÊME surface que `PlayShell` (playSurface, décor,
          bandeau) et monte le MÊME composant que le joueur reçoit
          (`GameIdleScreen`), avec l'emoji, l'accroche et le verbe de SA
          mécanique. Le bloc vivait inline ici ; il est extrait dans
          `ApercuAccueilJeu` pour que l'étape « Le jeu » montre EXACTEMENT le
          même aperçu, sans en recopier une seconde version. */}
      <ApercuAccueilJeu
        style={style}
        organizationName={organizationName}
        gameType={gameType}
        segments={previewSegments}
        className="mb-5"
      />

      <div className="mb-5">
        <SectionStylesPrets style={style} appliquerPreset={appliquerPreset} />
      </div>

      {/* ────────────────────────────────────────────────────────────
          FOND D'ÉCRAN — dix images cartoon plein cadre, plus « Aucun ».
          Le geste, ses vignettes et son correctif d'accessibilité vivent
          désormais dans `selecteur-fond.tsx`, monté à l'identique par
          l'atelier du passeport. Le clic repeint l'aperçu ci-dessus
          IMMÉDIATEMENT, avant tout enregistrement.
          ──────────────────────────────────────────────────────────── */}
      <SelecteurFond
        nomGroupe="style-fond"
        valeur={style.fond}
        onChange={setFond}
        aide="Une grande image derrière le jeu. Elle s'affiche sur les deux ambiances, adoucie pour que les textes restent lisibles."
      />

      {/* Réglages détaillés */}
      <div className="space-y-5">
        <NoteHabillage gameType={gameType} />
        <SectionRoue
          style={style}
          set={set}
          segments={previewSegments}
          gameType={gameType}
        />
        <SectionCeJeu style={style} setJeu={setJeu} gameType={gameType} />
        <SectionPageDeJeu style={style} set={set} />
      </div>

      {/* Sauvegarde */}
      <form ref={formRef} onSubmit={onSubmit} className="mt-5">
        <input type="hidden" name="id" value={wheelId} />
        <input type="hidden" name="style" value={styleSerialise} />
        <Button
          type="submit"
          disabled={pending}
          className="w-full"
          onClick={() => setDirty(false)}
        >
          {pending ? "Enregistrement…" : "Enregistrer le style"}
        </Button>
        {state?.ok && !dirty && (
          <p className="mt-2 text-center text-sm text-emerald-600">
            Style enregistré — vos clients le voient dès maintenant.
          </p>
        )}
        {enAttente && !pending && (
          <p className="mt-2 text-center text-sm font-semibold text-k-body">
            Modification en attente d&apos;enregistrement…
          </p>
        )}
        {/* Ce formulaire n'a que deux champs cachés : la validation ne peut
            pas le refuser. Le message est là quand même — le jour où un champ
            visible y entre, le silence serait pire que le message. */}
        {bloqueParValidation && (
          <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
            Non enregistré : un champ requis est vide ou invalide.
          </p>
        )}
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}
