"use client";

import { useEffect, useRef, useState } from "react";
import { updateWheelStyle } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ColorInput,
  FontSelect,
  GoogleFontLinks,
  SwatchButton,
} from "@/components/dashboard/editor-controls";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { WheelSegment } from "@/components/wheel/wheel-svg";
import {
  ApercuAccueilJeu,
  SEGMENTS_APERCU,
} from "@/components/dashboard/apercu-accueil-jeu";
import {
  porteeHabillage,
  type MecaniqueReglable,
} from "@/components/dashboard/wheel-style-scope";
import { libelleMecanique } from "@/components/dashboard/atelier-mecaniques";
import { contrastRatio } from "@/lib/contrast";
import { FondEcran } from "@/components/ui/fond-ecran";
import { FOND_KEYS, FOND_LABELS, type FondKey } from "@/lib/fonds-ecran";
import type { GameType } from "@/types/database";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import {
  HUB_STYLES,
  PAGE_THEMES,
  POINTER_STYLES,
  RING_STYLES,
  SLOT_SYMBOL_SETS,
  SLOT_SYMBOL_SET_KEYS,
  WHEEL_PRESETS_AMBIANCE,
  WHEEL_PRESETS_UNIVERS,
  playContrastWarning,
  resolveWheelStyle,
  scratchCover,
  type GameObjectKey,
  type SlotSymbolSet,
  type WheelStyle,
} from "@/lib/wheel-style";

const RING_LABELS: Record<(typeof RING_STYLES)[number], string> = {
  classic: "Classique",
  gold: "Doré",
  neon: "Néon",
  minimal: "Fin",
  none: "Sans",
};
const PAGE_THEME_LABELS: Record<(typeof PAGE_THEMES)[number], string> = {
  nuit: "Nuit (dégradé sombre)",
  kermesse: "Kermesse (univers du site)",
};
const HUB_LABELS: Record<(typeof HUB_STYLES)[number], string> = {
  dot: "Point",
  disc: "Disque",
  target: "Cible",
  none: "Sans",
};
const POINTER_LABELS: Record<(typeof POINTER_STYLES)[number], string> = {
  triangle: "Triangle",
  pin: "Épingle",
  arrow: "Flèche",
};

/** Réglages propres à la mécanique — libellés côté commerçant. */
const SLOT_SYMBOL_LABELS: Record<SlotSymbolSet, string> = {
  fruits: "Fruits",
  fete: "Fête foraine",
  bijoux: "Trésors",
};
const OBJET_LABELS: Record<GameObjectKey, string> = {
  dice: "Couleur du dé",
  flip_card: "Dos de la carte",
  draw_card: "Dos de la carte",
  cups: "Couleur des gobelets",
  chest: "Couleur des coffres",
  memory: "Dos des cartes",
};
const COUCHE_TITRES = ["Début du dégradé", "Milieu", "Fin du dégradé"] as const;

/** La mécanique en cours a-t-elle un OBJET colorable (par opposition à scratch/slot) ? */
function objetColorable(
  reglage: MecaniqueReglable | null,
): GameObjectKey | null {
  return reglage && reglage !== "scratch" && reglage !== "slot" ? reglage : null;
}

/**
 * Le libellé de gauche EST l'étiquette du contrôle : passer `htmlFor` le
 * rend `<label>` et donne son nom accessible au champ principal de la
 * ligne (axe : `label`, `select-name`). Sans `htmlFor` — lignes à
 * plusieurs contrôles déjà étiquetés — il reste un simple `<span>`.
 */
function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-sm text-zinc-600">
          {label}
        </label>
      ) : (
        <span className="text-sm text-zinc-600">{label}</span>
      )}
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * Une tuile du sélecteur de fond d'écran — la vignette RÉELLE du fond, en 16/9,
 * avec son libellé dessous.
 *
 * Le patron (label cliquable + radio invisible + cadre `border-2 border-k-ink`
 * quand l'option est retenue) est celui des trois sélecteurs de thème du
 * dépôt — `calendar-editor.tsx`, `contest-settings.tsx`, `quiz-editor.tsx`. Il
 * est repris volontairement : un quatrième sélecteur d'apparence qui se
 * manipulerait autrement ferait douter que ce soit le même geste.
 *
 * ── LE RADIO A UNE SURFACE, ET C'EST LA TUILE ENTIÈRE ──
 *
 * Seul écart avec les trois autres, et il est payé : le radio n'est pas
 * `sr-only` mais une couche transparente `absolute inset-0`. `sr-only` réduit
 * le contrôle à une boîte de 1×1 px rognée (`clip: rect(0,0,0,0)`), posée au
 * coin haut-gauche du contenu. Une cible d'un pixel n'a AUCUNE tolérance :
 * il suffit que la page ait glissé d'une fraction de pixel entre le calcul du
 * point et le clic pour que celui-ci tombe à côté — sur le label, ou sur la
 * tuile voisine. Or `globals.css` pose `scroll-behavior: smooth` sur `html`
 * (hors `prefers-reduced-motion`) : tout défilement PROGRAMMÉ vers cette
 * section, longue et basse dans la page, est une glissade animée. Un pilote
 * qui fait défiler puis clique — Playwright, mais aussi les logiciels de
 * commande vocale qui visent la boîte du contrôle — tape dans le vide tant que
 * la glissade dure. Symptôme observé : `check()` en échec pendant 90 s,
 * alternant « label intercepte » et « hors du cadre », sans jamais converger.
 *
 * Avec la couche pleine tuile, la cible mesure ~170×130 px : la même glissade
 * de quelques pixels tombe toujours dans le contrôle. Le radio reste invisible
 * (`opacity-0`, jamais `hidden`), donc toujours dans l'arbre d'accessibilité,
 * nommé par le texte du label — comme avec `sr-only`.
 *
 * Corollaire obligatoire : la vignette décorative est `pointer-events-none`.
 * Elle est `relative` et vient APRÈS le radio dans le DOM ; deux boîtes
 * positionnées se départagent à l'ordre du DOM, elle recouvrirait donc la
 * couche de clic. Elle est `aria-hidden` : elle n'a rien à intercepter.
 *
 * `focus-within` sur le label : le contrôle n'étant pas peint, c'est la tuile
 * qui doit montrer le focus clavier. Elle ne le montrait pas du tout avant.
 *
 * `fond` absent = la tuile « Aucun ». Elle ne montre pas un cadre vide mais le
 * crème rayé du site : le commerçant doit voir ce qu'il obtient en n'en
 * choisissant pas, pas un trou.
 */
function TuileFond({
  label,
  fond,
  active,
  onSelect,
}: {
  label: string;
  fond?: FondKey;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`relative cursor-pointer rounded-2xl border-2 p-2 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-k-ink ${
        active
          ? "border-k-ink bg-k-yellow/20 shadow-[3px_3px_0_var(--color-k-ink)]"
          : "border-k-ink/20 bg-white hover:border-k-ink/50"
      }`}
    >
      <input
        type="radio"
        name="style-fond"
        value={fond ?? ""}
        checked={active}
        onChange={onSelect}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      />
      <div
        aria-hidden
        className="pointer-events-none relative aspect-video overflow-hidden rounded-lg border-2 border-k-ink bg-k-bg"
        style={
          fond
            ? undefined
            : {
                backgroundImage:
                  "repeating-linear-gradient(135deg,#f3ead3 0 10px,#fdf6e3 10px 20px)",
              }
        }
      >
        {fond && <FondEcran fond={fond} variant="vignette" />}
      </div>
      <p className="mt-1.5 flex items-center justify-between gap-1 text-xs font-black text-k-ink">
        <span>{label}</span>
        {active && <span className="text-k-green">✓</span>}
      </p>
    </label>
  );
}

function MiniSelect<T extends string>({
  id,
  value,
  options,
  labels,
  onChange,
}: {
  id?: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {labels[o]}
        </option>
      ))}
    </select>
  );
}

/**
 * Éditeur complet du style de la roue : presets mélangeables + réglage
 * fin de chaque détail, avec aperçu fidèle (fond, pointeur, roue,
 * bouton) identique à ce que verra le client après le scan.
 *
 * `gameType` est FACULTATIF : sans lui, l'éditeur garde sa portée historique
 * (tous les réglages, aperçu de roue). Avec lui, il n'expose que ce que la
 * mécanique choisie rend réellement — voir wheel-style-scope.ts.
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
  const portee = porteeHabillage(gameType);

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

  // Recalculé à chaque frappe de couleur : l'avertissement suit l'aperçu.
  const avertissement = playContrastWarning(style);

  const styleSerialise = JSON.stringify(style);
  useEffect(() => {
    if (!dirty) return;
    formRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [styleSerialise, dirty]);

  // Réglages « Ce jeu » : la couche à gratter (trois arrêts, défauts résolus
  // à la lecture) et la couleur de l'objet, `undefined` tant que le
  // commerçant n'en a pas posé — auquel cas le jeu garde l'habillage du thème.
  const couche = scratchCover(style);
  const objetKey = objetColorable(portee.reglagesDuJeu);
  const objetColor = objetKey ? style.games?.[objetKey]?.color : undefined;

  function set<K extends keyof WheelStyle>(key: K, value: WheelStyle[K]) {
    setStyle((s) => ({ ...s, [key]: value, preset: undefined }));
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

  function setJeu(maj: (games: NonNullable<WheelStyle["games"]>) => NonNullable<WheelStyle["games"]>) {
    setStyle((s) => ({ ...s, games: maj(s.games ?? {}) }));
    setDirty(true);
  }

  // Les quatre segments de démonstration vivent avec l'aperçu qui les dessine
  // (`apercu-accueil-jeu.tsx`) : ils servent aussi l'étape « Le jeu ».
  const previewSegments: WheelSegment[] =
    segments.length > 0 ? segments : [...SEGMENTS_APERCU];

  // Lisibilité : segments sur lesquels la couleur de texte explicite
  // passe sous 3:1 (seuil WCAG du grand texte). Jamais bloquant — simple
  // avertissement. « Auto » maximise le contraste par segment : exclu.
  const lowContrastSegments =
    style.labelColor === "auto"
      ? []
      : previewSegments.filter(
          (seg) => contrastRatio(style.labelColor, seg.color) < 3,
        );

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

      {/* ────────────────────────────────────────────────────────────
          STYLES PRÊTS À L'EMPLOI — DEUX SOUS-GROUPES, et le titre n'est pas
          décoratif : les deux familles ne font pas la même chose. Une
          AMBIANCE ne touche qu'aux couleurs et laisse le fond d'écran en
          place ; un UNIVERS pose AUSSI l'image assortie. Mélangés dans une
          seule bande de dix-huit pastilles, le commerçant ne pouvait pas
          savoir lequel des deux il venait de cliquer.

          `fieldset`/`legend` par famille, et `aria-pressed` sur chaque
          bouton : à dix-huit boutons mutuellement exclusifs, une rangée de
          `<button>` nus ne dit ni le regroupement ni l'état retenu. Le
          patron radio du sélecteur de fond aurait convenu aussi ; le bouton
          à bascule est gardé parce que ces pastilles ACTIONNENT (elles
          écrasent vingt champs, avec confirmation) là où le fond se
          SÉLECTIONNE.
          ──────────────────────────────────────────────────────────── */}
      <div className="mb-5 space-y-4">
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-600 mb-2">
            Ambiances
          </legend>
          <p className="mb-2 text-xs text-zinc-500">
            Un jeu de couleurs pour la roue et la page. Votre fond d&apos;écran
            reste celui que vous avez choisi.
          </p>
          <div className="flex flex-wrap gap-2">
            {WHEEL_PRESETS_AMBIANCE.map((p) => (
              <SwatchButton
                key={p.key}
                label={p.label}
                swatch={p.swatch}
                selected={style.preset === p.key}
                className="px-3 py-1.5"
                onClick={() => appliquerPreset(p.style)}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-600 mb-2">
            Univers
          </legend>
          <p className="mb-2 text-xs text-zinc-500">
            Une occasion complète : les couleurs de la roue{" "}
            <strong className="font-semibold">et</strong> le fond d&apos;écran
            assorti, posés ensemble.
          </p>
          <div className="flex flex-wrap gap-2">
            {WHEEL_PRESETS_UNIVERS.map((p) => (
              <SwatchButton
                key={p.key}
                label={p.label}
                swatch={p.swatch}
                selected={style.preset === p.key}
                className="px-3 py-1.5"
                onClick={() => appliquerPreset(p.style)}
              />
            ))}
          </div>
        </fieldset>
      </div>

      {/* ────────────────────────────────────────────────────────────
          FOND D'ÉCRAN — dix images cartoon plein cadre, plus « Aucun ».

          Le sélecteur montre les VRAIES vignettes, pas des pastilles de
          couleur : un fond d'écran ne se décrit pas, il se voit. Et le clic
          repeint l'aperçu ci-dessus IMMÉDIATEMENT, avant tout enregistrement —
          c'est le patron `ApercuAccueilJeu` : le commerçant juge sur ce que
          verra son client, pas sur un libellé.

          `fieldset`/`legend` et des radios en `sr-only` sous des `label` :
          l'ensemble reste un groupe de boutons radio pour un lecteur d'écran,
          navigable aux flèches, alors qu'il se lit comme une planche
          d'images. Les vignettes elles-mêmes sont `aria-hidden` (le composant
          `FondEcran` s'en charge) — c'est le LIBELLÉ qui nomme le choix.
          ──────────────────────────────────────────────────────────── */}
      <fieldset className="mb-5">
        <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-600 mb-2">
          Fond d&apos;écran
        </legend>
        <p className="mb-2.5 text-xs text-zinc-500">
          Une grande image derrière le jeu. Elle s&apos;affiche sur les deux
          ambiances, adoucie pour que les textes restent lisibles.
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <TuileFond
            label="Aucun"
            active={!style.fond}
            onSelect={() => setFond(undefined)}
          />
          {FOND_KEYS.map((cle) => (
            <TuileFond
              key={cle}
              label={FOND_LABELS[cle]}
              fond={cle}
              active={style.fond === cle}
              onSelect={() => setFond(cle)}
            />
          ))}
        </div>
      </fieldset>

      {/* Réglages détaillés */}
      <div className="space-y-5">
        {portee.note && (
          <p className="rounded-xl border-2 border-k-ink/20 bg-k-bg px-3 py-2 text-xs leading-5 text-k-body">
            {portee.note}
          </p>
        )}
        {portee.reglagesRoue && (
        <section className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Roue
          </p>
          <Row label="Anneau" htmlFor="style-ring">
            <MiniSelect
              id="style-ring"
              value={style.ring}
              options={RING_STYLES}
              labels={RING_LABELS}
              onChange={(v) => set("ring", v)}
            />
            {style.ring !== "none" && (
              <ColorInput
                value={style.ringColor ?? "#ffffff"}
                onChange={(v) => set("ringColor", v)}
                title="Couleur de l'anneau"
              />
            )}
          </Row>
          <Row label="Ampoules lumineuses" htmlFor="style-lights">
            <input
              id="style-lights"
              type="checkbox"
              checked={style.lights}
              onChange={(e) => set("lights", e.target.checked)}
              className="h-4 w-4 accent-orange-600"
            />
            {style.lights && (
              <>
                <ColorInput
                  value={style.lightColorA}
                  onChange={(v) => set("lightColorA", v)}
                  title="Couleur 1"
                />
                <ColorInput
                  value={style.lightColorB}
                  onChange={(v) => set("lightColorB", v)}
                  title="Couleur 2"
                />
              </>
            )}
          </Row>
          <Row label="Bordure des segments" htmlFor="style-segment-border-width">
            <input
              id="style-segment-border-width"
              type="range"
              min={0}
              max={6}
              step={0.5}
              value={style.segmentBorderWidth}
              onChange={(e) => set("segmentBorderWidth", Number(e.target.value))}
              className="w-24 accent-orange-600"
            />
            <ColorInput
              value={style.segmentBorderColor}
              onChange={(v) => set("segmentBorderColor", v)}
              title="Couleur de bordure"
            />
          </Row>
          <Row label="Texte des lots">
            <label className="flex items-center gap-1.5 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={style.labelOutline}
                onChange={(e) => set("labelOutline", e.target.checked)}
                className="h-4 w-4 accent-orange-600"
              />
              Contour
            </label>
            <label className="flex items-center gap-1.5 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={style.labelColor === "auto"}
                onChange={(e) =>
                  set("labelColor", e.target.checked ? "auto" : "#ffffff")
                }
                className="h-4 w-4 accent-orange-600"
              />
              Contraste auto
            </label>
            {style.labelColor !== "auto" && (
              <ColorInput
                value={style.labelColor}
                onChange={(v) => set("labelColor", v)}
                title="Couleur du texte"
              />
            )}
          </Row>
          {lowContrastSegments.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Texte peu lisible sur{" "}
              {lowContrastSegments.length === 1
                ? `le segment « ${lowContrastSegments[0].label} »`
                : `${lowContrastSegments.length} segments (${lowContrastSegments
                    .map((seg) => seg.label)
                    .join(", ")})`}
              {" "}— contraste inférieur à 3:1. Le mode « Contraste auto »
              choisit la meilleure couleur segment par segment.
            </p>
          )}
          <Row label="Centre" htmlFor="style-hub">
            <MiniSelect
              id="style-hub"
              value={style.hub}
              options={HUB_STYLES}
              labels={HUB_LABELS}
              onChange={(v) => set("hub", v)}
            />
            {style.hub !== "none" && (
              <ColorInput
                value={style.hubColor}
                onChange={(v) => set("hubColor", v)}
                title="Couleur du centre"
              />
            )}
          </Row>
          <Row label="Pointeur" htmlFor="style-pointer">
            <MiniSelect
              id="style-pointer"
              value={style.pointer}
              options={POINTER_STYLES}
              labels={POINTER_LABELS}
              onChange={(v) => set("pointer", v)}
            />
            <ColorInput
              value={style.pointerColor}
              onChange={(v) => set("pointerColor", v)}
              title="Couleur du pointeur"
            />
          </Row>
        </section>
        )}

        {/* « Ce jeu » — rendu POUR LA SEULE mécanique en cours. Huit des
            quinze en ont un ; les six jeux de défi et la roue n'ont pas
            d'objet à recolorer, la section disparaît alors entièrement plutôt
            que d'afficher une rubrique vide. */}
        {portee.reglagesDuJeu && (
          <section className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Ce jeu — {libelleMecanique(gameType)}
            </p>

            {portee.reglagesDuJeu === "scratch" && (
              <>
                <Row label="Couche à gratter">
                  {([0, 1, 2] as const).map((i) => (
                    <ColorInput
                      key={i}
                      value={couche[i]}
                      onChange={(v) =>
                        setJeu((g) => {
                          const c = [...couche] as [string, string, string];
                          c[i] = v;
                          return {
                            ...g,
                            scratch: { coverFrom: c[0], coverMid: c[1], coverTo: c[2] },
                          };
                        })
                      }
                      title={COUCHE_TITRES[i]}
                    />
                  ))}
                </Row>
                <p className="text-xs text-zinc-500">
                  Les trois teintes du dégradé que votre client efface au
                  doigt. La consigne « Grattez ici » choisit seule son encre
                  pour rester lisible dessus.
                </p>
              </>
            )}

            {portee.reglagesDuJeu === "slot" && (
              <Row label="Symboles des rouleaux" htmlFor="style-slot-symbols">
                <MiniSelect
                  id="style-slot-symbols"
                  value={style.games?.slot?.symbols ?? "fruits"}
                  options={SLOT_SYMBOL_SET_KEYS}
                  labels={SLOT_SYMBOL_LABELS}
                  onChange={(v: SlotSymbolSet) =>
                    setJeu((g) => ({ ...g, slot: { symbols: v } }))
                  }
                />
                <span aria-hidden className="text-lg">
                  {SLOT_SYMBOL_SETS[style.games?.slot?.symbols ?? "fruits"]
                    .slice(0, 3)
                    .join(" ")}
                </span>
              </Row>
            )}

            {objetKey && (
              <Row label={OBJET_LABELS[objetKey]}>
                <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <input
                    type="checkbox"
                    checked={objetColor !== undefined}
                    onChange={(e) =>
                      setJeu((g) => ({
                        ...g,
                        [objetKey]: e.target.checked
                          ? { color: "#ffffff" }
                          : undefined,
                      }))
                    }
                    className="h-4 w-4 accent-orange-600"
                  />
                  Couleur personnalisée
                </label>
                {objetColor !== undefined && (
                  <ColorInput
                    value={objetColor}
                    onChange={(v) =>
                      setJeu((g) => ({ ...g, [objetKey]: { color: v } }))
                    }
                    title={OBJET_LABELS[objetKey]}
                  />
                )}
              </Row>
            )}
          </section>
        )}

        <section className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Page de jeu
          </p>
          <Row label="Ambiance" htmlFor="style-page-theme">
            <MiniSelect
              id="style-page-theme"
              value={style.pageTheme}
              options={PAGE_THEMES}
              labels={PAGE_THEME_LABELS}
              onChange={(v) => set("pageTheme", v)}
            />
          </Row>
          <Row label="Police" htmlFor="style-font">
            <FontSelect
              id="style-font"
              value={style.font}
              onChange={(v) => set("font", v)}
            />
          </Row>
          {style.pageTheme === "nuit" && (
            <>
              <Row label="Fond (haut / bas)">
                <ColorInput
                  value={style.bgFrom}
                  onChange={(v) => set("bgFrom", v)}
                  title="Couleur du haut"
                />
                <ColorInput
                  value={style.bgTo}
                  onChange={(v) => set("bgTo", v)}
                  title="Couleur du bas"
                />
              </Row>
              {/* AVERTISSEMENT, JAMAIS UN REFUS. Ces deux couleurs sont libres
                  et doivent le rester — le commerçant habille sa page. Mais un
                  fond de demi-teinte est hostile au texte clair COMME au texte
                  sombre, et aucune palette ne peut l'en sauver : sans ce
                  message il publierait une page que ses clients ne peuvent pas
                  lire, sans jamais l'apprendre. On mesure, on donne le chiffre,
                  il tranche. */}
              {avertissement && (
                <p
                  role="status"
                  className="rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"
                >
                  ⚠ {avertissement}
                </p>
              )}
            </>
          )}
          <Row label="Bouton (dégradé)">
            <ColorInput
              value={style.buttonFrom}
              onChange={(v) => set("buttonFrom", v)}
              title="Début du dégradé"
            />
            <ColorInput
              value={style.buttonTo}
              onChange={(v) => set("buttonTo", v)}
              title="Fin du dégradé"
            />
          </Row>
          <div>
            <Label htmlFor="style-title">Accroche personnalisée</Label>
            <Input
              id="style-title"
              maxLength={80}
              placeholder="Tournez la roue, tentez votre chance !"
              value={style.title ?? ""}
              onChange={(e) =>
                set("title", e.target.value === "" ? undefined : e.target.value)
              }
            />
          </div>
          <Row label="Animations">
            <label className="flex items-center gap-1.5 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={style.cartoonAnimations ?? false}
                onChange={(e) => set("cartoonAnimations", e.target.checked)}
                className="h-4 w-4 accent-orange-600"
              />
              Mode Cartoon 3D
            </label>
          </Row>
        </section>
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
