"use client";

import { useState } from "react";
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
import { KermesseStripe } from "@/components/wheel/play-theme";
import { GameIdleScreen } from "@/components/wheel/game-idle-screen";
import { WheelPointer, WheelSvg, type WheelSegment } from "@/components/wheel/wheel-svg";
import {
  porteeHabillage,
  type MecaniqueReglable,
} from "@/components/dashboard/wheel-style-scope";
import { libelleMecanique } from "@/components/dashboard/atelier-mecaniques";
import { contrastRatio } from "@/lib/contrast";
import type { GameType } from "@/types/database";
import { useActionForm } from "@/lib/use-action-form";
import {
  HUB_STYLES,
  PAGE_THEMES,
  POINTER_STYLES,
  RING_STYLES,
  SLOT_SYMBOL_SETS,
  SLOT_SYMBOL_SET_KEYS,
  WHEEL_PRESETS,
  playContrastWarning,
  playDecor,
  playOnLightSurface,
  playSurface,
  resolveWheelStyle,
  scratchCover,
  type GameObjectKey,
  type SlotSymbolSet,
  type WheelStyle,
} from "@/lib/wheel-style";
import { ThemeDecor } from "@/components/ui/theme-decor";

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
  const { state, pending, onSubmit } = useActionForm(updateWheelStyle);
  const [dirty, setDirty] = useState(false);
  const portee = porteeHabillage(gameType);

  /**
   * Un preset REMPLACE les vingt champs d'un coup. Tant qu'il n'y a rien à
   * écraser, c'est un raccourci ; après dix minutes de réglage fin, c'était
   * une perte sèche sur un clic de curiosité, sans un mot. On demande.
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
    setStyle(presetStyle);
    setDirty(true);
  }

  // Recalculé à chaque frappe de couleur : l'avertissement suit l'aperçu.
  const avertissement = playContrastWarning(style);

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
   *    ferait au passage retomber le DÉCOR de la page sur les confettis —
   *    `playDecor` le lit sur `style.preset`.
   * 2. Les clés des AUTRES mécaniques sont conservées telles quelles. Un
   *    commerçant qui essaie « Memory », choisit un dos rouge, repasse au dé
   *    puis revient doit retrouver son rouge : un contrôle masqué n'efface
   *    jamais sa valeur, et le formulaire poste le style COMPLET.
   */
  function setJeu(maj: (games: NonNullable<WheelStyle["games"]>) => NonNullable<WheelStyle["games"]>) {
    setStyle((s) => ({ ...s, games: maj(s.games ?? {}) }));
    setDirty(true);
  }

  const previewSegments: WheelSegment[] =
    segments.length > 0
      ? segments
      : [
          { id: "a", label: "Café offert", color: "#7c3aed" },
          { id: "b", label: "-10 %", color: "#d946ef" },
          { id: "c", label: "Perdu", color: "#3f3f46" },
          { id: "d", label: "Dessert", color: "#f59e0b" },
        ];

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
          mécanique. Il ne restait ici, avant, qu'un 🎁 en dur et un « Jouer »
          générique pour quatorze jeux sur quinze. */}
      {(() => {
        const surface = playSurface(style);
        return (
          <div
            className={`relative rounded-xl mb-5 text-center overflow-hidden ${surface.kermesse ? "border-2 border-k-ink bg-k-bg" : ""}`}
            // Même précaution que la page /play : la shorthand `background`
            // remet `background-color` à `transparent`, la couleur pleine du
            // commerçant est reposée derrière le dégradé.
            style={
              surface.background
                ? { background: surface.background, backgroundColor: style.bgTo }
                : undefined
            }
          >
            {/* Le décor n'existe que sur l'habillage kermesse — exactement
                comme dans `PlayShell`. Le rendre sous le thème « nuit »
                promettrait un fond que la page ne peint pas. */}
            {surface.kermesse && (
              <ThemeDecor decor={playDecor(style)} variant="apercu" />
            )}
            {surface.kermesse && <KermesseStripe className="relative h-3" />}
            <GameIdleScreen
              variant="apercu"
              style={style}
              organizationName={organizationName}
              emoji={portee.emoji}
              title={style.title || portee.accroche}
              buttonLabel={portee.libelleBouton}
              /* `playOnLightSurface` et NON `surface.kermesse` : c'est la
                 clarté du fond RÉELLEMENT peint qui décide de la palette de
                 texte, et c'est ce que fait /play. L'aperçu lisait ici
                 `pageTheme`, donc annonçait un titre blanc sur les presets
                 « Pastel » et « Cartoon » — dont le fond est clair et dont la
                 page rend, elle, un titre en encre sombre. */
              kermesse={playOnLightSurface(style)}
              visuel={
                portee.apercuRoue ? (
                  <div className="relative mx-auto max-w-56">
                    <WheelPointer color={style.pointerColor} variant={style.pointer} />
                    <WheelSvg segments={previewSegments} style={style} />
                  </div>
                ) : undefined
              }
            />
          </div>
        );
      })()}

      {/* Presets */}
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 mb-2">
        Styles prêts à l&apos;emploi
      </p>
      <div className="flex flex-wrap gap-2 mb-5">
        {WHEEL_PRESETS.map((p) => (
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
      <form onSubmit={onSubmit} className="mt-5">
        <input type="hidden" name="id" value={wheelId} />
        <input type="hidden" name="style" value={JSON.stringify(style)} />
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
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}
