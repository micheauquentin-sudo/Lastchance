"use client";

import { useState } from "react";
import { useActionState } from "react";
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
import { WheelPointer, WheelSvg, type WheelSegment } from "@/components/wheel/wheel-svg";
import { fontFamily } from "@/lib/fonts";
import {
  HUB_STYLES,
  PAGE_THEMES,
  POINTER_STYLES,
  RING_STYLES,
  WHEEL_PRESETS,
  playBackground,
  resolveWheelStyle,
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-zinc-600">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function MiniSelect<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <select
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
 */
export function WheelStyleEditor({
  wheelId,
  initialStyle,
  segments,
  organizationName,
}: {
  wheelId: string;
  initialStyle: Record<string, unknown>;
  segments: WheelSegment[];
  organizationName: string;
}) {
  const [style, setStyle] = useState<WheelStyle>(() =>
    resolveWheelStyle(initialStyle),
  );
  const [state, formAction, pending] = useActionState(updateWheelStyle, null);
  const [dirty, setDirty] = useState(false);

  function set<K extends keyof WheelStyle>(key: K, value: WheelStyle[K]) {
    setStyle((s) => ({ ...s, [key]: value, preset: undefined }));
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

  return (
    <Card>
      <GoogleFontLinks />

      <h2 className="font-semibold mb-1">Personnalisation</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Partez d&apos;un style, puis modifiez chaque détail. L&apos;aperçu
        est exactement ce que verront vos clients.
      </p>

      {/* Aperçu fidèle — reflète aussi l'ambiance de page (nuit/kermesse) */}
      {(() => {
        const kermesse = style.pageTheme === "kermesse";
        return (
          <div
            className={`rounded-xl mb-5 text-center overflow-hidden ${kermesse ? "border-2 border-k-ink" : ""}`}
            style={kermesse ? { background: "var(--color-k-bg, #fdf6e3)" } : { background: playBackground(style) }}
          >
            {kermesse && (
              <div
                aria-hidden
                className="h-2.5 w-full border-b-2 border-k-ink"
                style={{
                  background:
                    "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
                }}
              />
            )}
            <div className="px-6 pt-6 pb-5" style={{ fontFamily: fontFamily(style.font) }}>
              <p className={`text-[10px] font-semibold uppercase tracking-[0.25em] mb-1 ${kermesse ? "text-k-body" : "text-white/60"}`}>
                {organizationName}
              </p>
              <p className={`text-lg font-extrabold mb-4 leading-tight ${kermesse ? "text-k-ink" : "text-white"}`}>
                {style.title || "Tournez la roue, tentez votre chance !"}
              </p>
              <div className="relative mx-auto max-w-56">
                <WheelPointer color={style.pointerColor} variant={style.pointer} />
                <WheelSvg segments={previewSegments} style={style} />
              </div>
              <div
                className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-extrabold uppercase tracking-wider ${
                  kermesse
                    ? "border-2 border-k-ink text-k-ink shadow-[4px_4px_0_var(--color-k-ink)]"
                    : "text-white"
                }`}
                style={{
                  backgroundImage: `linear-gradient(to right, ${style.buttonFrom}, ${style.buttonTo})`,
                }}
              >
                Lancer la roue
              </div>
            </div>
          </div>
        );
      })()}

      {/* Presets */}
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
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
            onClick={() => {
              setStyle(p.style);
              setDirty(true);
            }}
          />
        ))}
      </div>

      {/* Réglages détaillés */}
      <div className="space-y-5">
        <section className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Roue
          </p>
          <Row label="Anneau">
            <MiniSelect
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
          <Row label="Ampoules lumineuses">
            <input
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
          <Row label="Bordure des segments">
            <input
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
            <ColorInput
              value={style.labelColor}
              onChange={(v) => set("labelColor", v)}
              title="Couleur du texte"
            />
          </Row>
          <Row label="Centre">
            <MiniSelect
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
          <Row label="Pointeur">
            <MiniSelect
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

        <section className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Page de jeu
          </p>
          <Row label="Ambiance">
            <MiniSelect
              value={style.pageTheme}
              options={PAGE_THEMES}
              labels={PAGE_THEME_LABELS}
              onChange={(v) => set("pageTheme", v)}
            />
          </Row>
          <Row label="Police">
            <FontSelect value={style.font} onChange={(v) => set("font", v)} />
          </Row>
          {style.pageTheme === "nuit" && (
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
      <form action={formAction} className="mt-5">
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
