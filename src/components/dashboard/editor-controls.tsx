"use client";

/**
 * Contrôles partagés entre les éditeurs visuels du dashboard
 * (style de roue, affiche) : sélecteur de couleur, bouton de preset
 * avec pastilles, sélecteur de police et feuilles Google Fonts.
 */

import { FONT_LIST, fontFamily, type FontKey } from "@/lib/fonts";
import { cn } from "@/lib/utils";

/** Feuilles Google Fonts des polices proposées (constant au module). */
const FONT_HREFS = FONT_LIST.map((f) => f.googleHref).filter(
  (href): href is string => Boolean(href),
);

/**
 * Charge toutes les polices proposées — pour les aperçus des éditeurs
 * uniquement ; la page publique /play ne charge que la police choisie.
 */
export function GoogleFontLinks() {
  return (
    <>
      {FONT_HREFS.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
    </>
  );
}

export function ColorInput({
  value,
  onChange,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  title?: string;
}) {
  return (
    <input
      type="color"
      value={value}
      title={title}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-10 cursor-pointer rounded border border-zinc-300 bg-white p-0.5"
    />
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-zinc-600">
      {label}
      <ColorInput value={value} onChange={onChange} />
    </label>
  );
}

/** Bouton de preset : pastilles de couleurs + libellé, état sélectionné. */
export function SwatchButton({
  label,
  swatch,
  selected,
  onClick,
  className = "px-3 py-2",
}: {
  label: string;
  swatch: readonly string[];
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg border text-sm font-medium transition-colors",
        className,
        selected
          ? "border-orange-500 bg-orange-50 text-orange-700"
          : "border-zinc-300 bg-white text-zinc-700 hover:border-orange-300",
      )}
    >
      <span className="flex gap-0.5">
        {swatch.map((c, i) => (
          <span
            key={i}
            className="h-3 w-3 rounded-full border border-black/10"
            style={{ background: c }}
          />
        ))}
      </span>
      {label}
    </button>
  );
}

/** Sélecteur de police : chaque option s'affiche dans sa propre police. */
export function FontSelect({
  value,
  onChange,
}: {
  value: FontKey;
  onChange: (v: FontKey) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as FontKey)}
      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
      style={{ fontFamily: fontFamily(value) }}
    >
      {FONT_LIST.map((f) => (
        <option key={f.key} value={f.key} style={{ fontFamily: f.family }}>
          {f.label}
        </option>
      ))}
    </select>
  );
}
