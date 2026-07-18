"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { saveQrPoster } from "@/actions/qr-codes";
import { PosterCanvas } from "@/components/poster/poster-canvas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import {
  POSTER_FONTS,
  POSTER_TEMPLATES,
  SHAPE_KINDS,
  SHAPE_LABELS,
  elementId,
  posterFontFamily,
  posterFontsHref,
  resolvePosterConfig,
  type PosterConfig,
  type PosterElement,
  type ShapeKind,
} from "@/lib/poster";
import type { QrStyle } from "@/types/database";

/** Palette proposée dans les pastilles de couleur rapides. */
const QUICK_COLORS = [
  "#211d16", "#fdf6e3", "#ffffff", "#f5793b", "#fcca59",
  "#f296bd", "#99b7f5", "#267f53", "#e0447f", "#1e2a4a",
];

const IMAGE_MAX_PX = 900;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/** Normalise une image en data URL (PNG, repli JPEG si trop lourde). */
async function fileToDataUrl(file: File): Promise<{ src: string; ratio: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, IMAGE_MAX_PX / Math.max(img.width || 1, img.height || 1));
    const w = Math.max(1, Math.round((img.width || IMAGE_MAX_PX) * scale));
    const h = Math.max(1, Math.round((img.height || IMAGE_MAX_PX) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    const ratio = Math.min(20, Math.max(0.05, w / h));
    const png = canvas.toDataURL("image/png");
    if (png.length <= 500_000) return { src: png, ratio };
    const jpeg = canvas.toDataURL("image/jpeg", 0.85);
    if (jpeg.length <= 500_000) return { src: jpeg, ratio };
    throw new Error("too-big");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-black uppercase tracking-[0.14em] text-k-body">
      {children}
    </h3>
  );
}

function ColorDots({ value, onPick }: { value?: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {QUICK_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Couleur ${c}`}
          onClick={() => onPick(c)}
          className={`h-6 w-6 rounded-full border-2 ${
            value === c ? "border-k-orange" : "border-k-ink/25"
          }`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

interface DragState {
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  elX: number;
  elY: number;
  elW: number;
  before: PosterConfig;
  moved: boolean;
}

/**
 * Éditeur d'affiche « libre » : chaque élément (texte, forme, image,
 * QR) se déplace à la souris directement sur la page, se redimensionne
 * par sa poignée et se règle dans le panneau de droite. Annuler/rétablir,
 * modèles complets, 28 polices, 14 formes, images importées — et le QR
 * affiché est exactement celui personnalisé dans le Studio QR.
 */
export function PosterEditor({
  qrId,
  playUrl,
  qrStyle,
  initialConfig,
}: {
  qrId: string;
  playUrl: string;
  qrStyle: QrStyle;
  initialConfig: Record<string, unknown>;
}) {
  const [config, setConfig] = useState<PosterConfig>(() =>
    resolvePosterConfig(initialConfig),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<PosterConfig[]>([]);
  const [future, setFuture] = useState<PosterConfig[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(saveQrPoster, null);

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const selected = config.elements.find((el) => el.id === selectedId) ?? null;

  /** Applique `next` en poussant l'état précédent dans l'historique. */
  const commit = useCallback((next: PosterConfig, before?: PosterConfig) => {
    setConfig((current) => {
      setHistory((h) => [...h.slice(-59), before ?? current]);
      setFuture([]);
      return next;
    });
  }, []);

  const patchElement = useCallback(
    (id: string, patch: Partial<PosterElement>) => {
      setConfig((current) => {
        const next = {
          ...current,
          template: undefined,
          elements: current.elements.map((el) =>
            el.id === id ? { ...el, ...patch } : el,
          ),
        };
        setHistory((h) => [...h.slice(-59), current]);
        setFuture([]);
        return next;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setConfig((current) => {
        setFuture((f) => [...f, current]);
        return prev;
      });
      return h.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[f.length - 1];
      setConfig((current) => {
        setHistory((h) => [...h, current]);
        return next;
      });
      return f.slice(0, -1);
    });
  }, []);

  /* ── Déplacement / redimensionnement à la souris ── */

  const startDrag = useCallback(
    (id: string, e: React.PointerEvent, mode: "move" | "resize") => {
      const el = config.elements.find((item) => item.id === id);
      if (!el) return;
      e.preventDefault();
      setSelectedId(id);
      dragRef.current = {
        id, mode,
        startX: e.clientX, startY: e.clientY,
        elX: el.x, elY: el.y, elW: el.w,
        before: config, moved: false,
      };

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        const rect = sheetRef.current?.getBoundingClientRect();
        if (!drag || !rect) return;
        const dx = ((ev.clientX - drag.startX) / rect.width) * 100;
        const dy = ((ev.clientY - drag.startY) / rect.height) * 100;
        if (Math.abs(dx) + Math.abs(dy) > 0.15) drag.moved = true;
        setConfig((current) => ({
          ...current,
          elements: current.elements.map((item) => {
            if (item.id !== drag.id) return item;
            if (drag.mode === "move") {
              return {
                ...item,
                x: Math.min(125, Math.max(-25, drag.elX + dx)),
                y: Math.min(125, Math.max(-25, drag.elY + dy)),
              };
            }
            return { ...item, w: Math.min(125, Math.max(3, drag.elW + dx * 2)) };
          }),
        }));
      };

      const onUp = () => {
        const drag = dragRef.current;
        dragRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (drag?.moved) {
          setHistory((h) => [...h.slice(-59), drag.before]);
          setFuture([]);
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [config],
  );

  /* ── Clavier : suppression, flèches, annuler/rétablir ── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (!selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.5;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const el = config.elements.find((item) => item.id === selectedId);
        if (el) patchElement(selectedId, { x: el.x + dx, y: el.y + dy });
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, config, undo, redo]);

  /* ── Ajout / suppression d'éléments ── */

  function maxZ(): number {
    return config.elements.reduce((m, el) => Math.max(m, el.z), 0);
  }

  function addElement(el: Omit<PosterElement, "id" | "z">) {
    const full: PosterElement = { ...el, id: elementId(), z: Math.min(200, maxZ() + 1) };
    commit({ ...config, template: undefined, elements: [...config.elements, full] });
    setSelectedId(full.id);
  }

  function addText(kind: "title" | "body") {
    addElement({
      type: "text", x: 50, y: 40, w: kind === "title" ? 80 : 60, rot: 0,
      text: kind === "title" ? "Votre titre ici" : "Votre texte ici",
      font: kind === "title" ? "lilita" : "nunito",
      size: kind === "title" ? 6.5 : 3,
      color: "#211d16", align: "center", weight: kind === "title" ? 400 : 700,
    });
  }

  function addShape(kind: ShapeKind) {
    const ratios: Partial<Record<ShapeKind, number>> = {
      pill: 0.3, squiggle: 0.22, arrow: 0.55, oval: 0.65, bar: 0.16, half: 0.55,
    };
    const colors = ["#f5793b", "#fcca59", "#f296bd", "#99b7f5", "#267f53"];
    addElement({
      type: "shape", kind, x: 50, y: 45, w: 16, rot: 0,
      color: colors[config.elements.length % colors.length],
      ratio: ratios[kind] ?? 1,
    });
  }

  async function addImage(file: File | undefined) {
    if (!file) return;
    setImageError(null);
    try {
      const { src, ratio } = await fileToDataUrl(file);
      addElement({ type: "image", x: 50, y: 40, w: 30, rot: 0, src, natRatio: ratio });
    } catch {
      setImageError("Image illisible ou trop lourde (essayez plus petit).");
    }
  }

  function removeSelected() {
    if (!selectedId) return;
    commit({
      ...config,
      elements: config.elements.filter((el) => el.id !== selectedId),
    });
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy: PosterElement = {
      ...selected, id: elementId(),
      x: Math.min(120, selected.x + 4), y: Math.min(120, selected.y + 4),
      z: Math.min(200, maxZ() + 1),
    };
    commit({ ...config, elements: [...config.elements, copy] });
    setSelectedId(copy.id);
  }

  function moveZ(delta: number) {
    if (!selected) return;
    patchElement(selected.id, {
      z: Math.min(200, Math.max(0, selected.z + delta)),
    });
  }

  /** Premier plan / arrière-plan : renumérote toute la pile (fiable
   *  même quand plusieurs éléments partagent le même z). */
  function sendToLayer(where: "front" | "back") {
    if (!selected) return;
    const others = [...config.elements]
      .filter((el) => el.id !== selected.id)
      .sort((a, b) => a.z - b.z);
    const stack = where === "front" ? [...others, selected] : [selected, ...others];
    const byId = new Map(stack.map((el, i) => [el.id, i]));
    commit({
      ...config,
      template: undefined,
      elements: config.elements.map((el) => ({ ...el, z: byId.get(el.id) ?? el.z })),
    });
  }

  const hasQr = config.elements.some((el) => el.type === "qr");

  return (
    <div className="min-h-screen bg-k-bg text-k-ink">
      {/* Polices de l'affiche (éditeur + impression) */}
      <link rel="stylesheet" href={posterFontsHref()} />
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { background: #fff !important; }
          .np { display: none !important; }
          #poster-sheet {
            position: fixed; inset: 0;
            width: 210mm; height: 297mm;
            border: none !important; box-shadow: none !important;
            border-radius: 0 !important;
          }
        }
      `}</style>

      {/* Barre d'actions */}
      <div className="np sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b-2 border-k-ink bg-white px-4 py-3 sm:px-6">
        <Link
          href="/dashboard/qr-codes"
          className="text-sm font-bold text-k-body hover:text-k-ink"
        >
          ← QR codes
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={history.length === 0}
            aria-label="Annuler"
            className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-k-ink bg-white text-k-ink transition-colors hover:bg-k-yellow disabled:opacity-30"
          >
            ↺
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={future.length === 0}
            aria-label="Rétablir"
            className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-k-ink bg-white text-k-ink transition-colors hover:bg-k-yellow disabled:opacity-30"
          >
            ↻
          </button>
          <form action={formAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={qrId} />
            <input type="hidden" name="poster" value={JSON.stringify(config)} />
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            {state?.ok && (
              <span className="text-sm font-black text-k-green" role="status">✓</span>
            )}
          </form>
          <Button type="button" onClick={() => window.print()}>
            Imprimer
          </Button>
        </div>
      </div>

      {state && !state.ok && (
        <p className="np border-b-2 border-k-ink bg-red-100 px-6 py-2 text-sm font-bold text-k-ink">
          {state.error}
        </p>
      )}

      {/* Sur grand écran : l'affiche reste entière et fixe à l'écran,
          seul le panneau de réglages défile — on voit chaque changement. */}
      <div className="flex flex-col gap-6 p-4 sm:p-6 lg:h-[calc(100dvh-64px)] lg:flex-row lg:items-stretch lg:overflow-hidden">
        {/* Page A4 */}
        <div
          className="np-keep flex min-h-0 flex-1 flex-col items-center justify-center gap-3"
          onPointerDown={() => setSelectedId(null)}
        >
          <div
            ref={sheetRef}
            className="mx-auto max-w-full"
            style={{ width: "min(100%, calc((100dvh - 170px) * 0.707))" }}
          >
            <PosterCanvas
              config={config}
              playUrl={playUrl}
              qrStyle={qrStyle}
              selectedId={selectedId}
              onElementPointerDown={(id, e) => startDrag(id, e, "move")}
              onResizePointerDown={(id, e) => startDrag(id, e, "resize")}
              className="rounded-lg border-2 border-k-ink shadow-[8px_8px_0_rgba(33,29,22,0.9)]"
            />
          </div>
          <div id="poster-sheet" className="hidden print:block">
            <PosterCanvas config={config} playUrl={playUrl} qrStyle={qrStyle} />
          </div>
          <p className="np text-center text-xs font-bold text-k-body">
            Glissez les éléments directement sur l&apos;affiche · poignée
            jaune pour la taille · flèches du clavier pour ajuster ·
            Suppr pour retirer
          </p>
        </div>

        {/* Panneau latéral (seule zone qui défile) */}
        <div className="np w-full shrink-0 space-y-5 rounded-2xl border-2 border-k-ink bg-white p-5 lg:h-full lg:w-[360px] lg:overflow-y-auto">
          {/* Modèles */}
          <section className="space-y-2.5">
            <SectionTitle>Modèles</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {POSTER_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    commit(structuredClone(t.config));
                    setSelectedId(null);
                  }}
                  className="flex items-center gap-2 rounded-full border-2 border-k-ink bg-white px-3 py-1.5 text-sm font-bold text-k-ink transition-transform hover:-translate-y-0.5"
                >
                  <span className="flex">
                    {t.swatch.map((c, i) => (
                      <span
                        key={i}
                        className="-ml-1 h-4 w-4 rounded-full border border-k-ink/40 first:ml-0"
                        style={{ background: c }}
                      />
                    ))}
                  </span>
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {/* Fond */}
          <section className="space-y-2.5">
            <SectionTitle>Fond</SectionTitle>
            <div className="flex items-center gap-3">
              <input
                type="color"
                aria-label="Couleur du fond"
                value={config.bg}
                onChange={(e) => commit({ ...config, template: undefined, bg: e.target.value })}
                className="h-9 w-14 cursor-pointer rounded-lg border-2 border-k-ink bg-white p-0.5"
              />
              {(["none", "dots", "stripes"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => commit({ ...config, template: undefined, bgPattern: p })}
                  className={`rounded-full border-2 px-3 py-1 text-xs font-black ${
                    config.bgPattern === p
                      ? "border-k-ink bg-k-yellow text-k-ink"
                      : "border-zinc-200 bg-white text-k-body"
                  }`}
                >
                  {p === "none" ? "Uni" : p === "dots" ? "Pois" : "Rayures"}
                </button>
              ))}
            </div>
          </section>

          {/* Ajouter */}
          <section className="space-y-2.5">
            <SectionTitle>Ajouter</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addText("title")}
                className="rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/40"
              >
                + Titre
              </button>
              <button
                type="button"
                onClick={() => addText("body")}
                className="rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/40"
              >
                + Texte
              </button>
              <label className="cursor-pointer rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/40">
                + Image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    addImage(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {!hasQr && (
                <button
                  type="button"
                  onClick={() => addElement({ type: "qr", x: 50, y: 50, w: 42, rot: 0 })}
                  className="rounded-xl border-2 border-k-ink bg-k-yellow px-3 py-2 text-sm font-black text-k-ink"
                >
                  + QR code
                </button>
              )}
            </div>
            {imageError && (
              <p className="text-xs font-bold text-red-600">{imageError}</p>
            )}
            <div className="grid grid-cols-7 gap-1.5">
              {SHAPE_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  title={SHAPE_LABELS[kind]}
                  aria-label={`Ajouter la forme ${SHAPE_LABELS[kind]}`}
                  onClick={() => addShape(kind)}
                  className="flex aspect-square items-center justify-center rounded-lg border-2 border-zinc-200 bg-white p-1.5 text-k-ink hover:border-k-ink"
                >
                  <ShapeIcon kind={kind} />
                </button>
              ))}
            </div>
          </section>

          {/* Propriétés de l'élément sélectionné */}
          {selected ? (
            <section className="space-y-3 rounded-xl border-2 border-k-ink bg-k-bg p-4">
              <div className="flex items-center justify-between">
                <SectionTitle>
                  {selected.type === "text"
                    ? "Texte"
                    : selected.type === "shape"
                      ? `Forme · ${SHAPE_LABELS[(selected.kind ?? "circle") as ShapeKind]}`
                      : selected.type === "image"
                        ? "Image"
                        : "QR code"}
                </SectionTitle>
                <div className="flex gap-1.5">
                  <button type="button" onClick={duplicateSelected} title="Dupliquer" className="h-7 w-7 rounded-lg border-2 border-k-ink bg-white text-xs font-black">⧉</button>
                  <button type="button" onClick={removeSelected} title="Supprimer" className="h-7 w-7 rounded-lg border-2 border-k-ink bg-white text-xs font-black text-red-600">✕</button>
                </div>
              </div>

              {/* Plans : premier plan ↔ arrière-plan */}
              <div className="flex gap-1.5">
                <button type="button" onClick={() => sendToLayer("front")} className="flex-1 rounded-lg border-2 border-k-ink bg-white px-2 py-1.5 text-[11px] font-black hover:bg-k-yellow/40">
                  ⏫ Premier plan
                </button>
                <button type="button" onClick={() => moveZ(1)} title="Avancer d'un plan" className="w-9 rounded-lg border-2 border-k-ink bg-white text-xs font-black hover:bg-k-yellow/40">▲</button>
                <button type="button" onClick={() => moveZ(-1)} title="Reculer d'un plan" className="w-9 rounded-lg border-2 border-k-ink bg-white text-xs font-black hover:bg-k-yellow/40">▼</button>
                <button type="button" onClick={() => sendToLayer("back")} className="flex-1 rounded-lg border-2 border-k-ink bg-white px-2 py-1.5 text-[11px] font-black hover:bg-k-yellow/40">
                  ⏬ Arrière-plan
                </button>
              </div>

              {selected.type === "text" && (
                <>
                  <textarea
                    value={selected.text ?? ""}
                    onChange={(e) => patchElement(selected.id, { text: e.target.value.slice(0, 400) })}
                    rows={3}
                    className="w-full rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-bold text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow"
                  />
                  <div>
                    <Label htmlFor="el-font">Police ({POSTER_FONTS.length} disponibles)</Label>
                    <select
                      id="el-font"
                      value={selected.font ?? "nunito"}
                      onChange={(e) => patchElement(selected.id, { font: e.target.value })}
                      className="w-full rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-bold text-k-ink"
                      style={{ fontFamily: posterFontFamily(selected.font ?? "nunito") }}
                    >
                      {["Titres", "Rondes", "Manuscrites", "Classiques"].map((group) => (
                        <optgroup key={group} label={group}>
                          {POSTER_FONTS.filter((f) => f.group === group).map((f) => (
                            <option key={f.key} value={f.key} style={{ fontFamily: `"${f.family}"` }}>
                              {f.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <Label htmlFor="el-size">Taille : {(selected.size ?? 3).toFixed(1)}</Label>
                      <input
                        id="el-size"
                        type="range" min={1} max={16} step={0.2}
                        value={selected.size ?? 3}
                        onChange={(e) => patchElement(selected.id, { size: Number(e.target.value) })}
                        className="w-full accent-k-orange"
                      />
                    </div>
                    <input
                      type="color"
                      aria-label="Couleur du texte"
                      value={selected.color ?? "#211d16"}
                      onChange={(e) => patchElement(selected.id, { color: e.target.value })}
                      className="h-9 w-12 cursor-pointer rounded-lg border-2 border-k-ink bg-white p-0.5"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => patchElement(selected.id, { align: a })}
                        className={`flex-1 rounded-lg border-2 py-1 text-xs font-black ${
                          (selected.align ?? "center") === a
                            ? "border-k-ink bg-k-yellow"
                            : "border-zinc-200 bg-white"
                        }`}
                      >
                        {a === "left" ? "Gauche" : a === "center" ? "Centre" : "Droite"}
                      </button>
                    ))}
                  </div>
                  <ColorDots
                    value={selected.color}
                    onPick={(color) => patchElement(selected.id, { color })}
                  />
                </>
              )}

              {selected.type === "shape" && (
                <>
                  <div className="flex items-end gap-3">
                    <input
                      type="color"
                      aria-label="Couleur de la forme"
                      value={selected.color ?? "#f5793b"}
                      onChange={(e) => patchElement(selected.id, { color: e.target.value })}
                      className="h-9 w-12 cursor-pointer rounded-lg border-2 border-k-ink bg-white p-0.5"
                    />
                    <div className="flex-1">
                      <Label htmlFor="el-ratio">
                        Proportions : {(selected.ratio ?? 1).toFixed(2)}
                      </Label>
                      <input
                        id="el-ratio"
                        type="range" min={0.1} max={3} step={0.05}
                        value={selected.ratio ?? 1}
                        onChange={(e) => patchElement(selected.id, { ratio: Number(e.target.value) })}
                        className="w-full accent-k-orange"
                      />
                    </div>
                  </div>
                  <ColorDots
                    value={selected.color}
                    onPick={(color) => patchElement(selected.id, { color })}
                  />
                </>
              )}

              {selected.type === "image" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <SectionTitle>Rogner</SectionTitle>
                    {((selected.cropL ?? 0) + (selected.cropR ?? 0) + (selected.cropT ?? 0) + (selected.cropB ?? 0)) > 0 && (
                      <button
                        type="button"
                        onClick={() => patchElement(selected.id, { cropL: 0, cropR: 0, cropT: 0, cropB: 0 })}
                        className="text-[11px] font-bold text-red-600 hover:underline"
                      >
                        Réinitialiser
                      </button>
                    )}
                  </div>
                  {(
                    [
                      ["cropL", "Gauche"],
                      ["cropR", "Droite"],
                      ["cropT", "Haut"],
                      ["cropB", "Bas"],
                    ] as const
                  ).map(([key, label]) => {
                    const opposite =
                      key === "cropL" ? (selected.cropR ?? 0)
                      : key === "cropR" ? (selected.cropL ?? 0)
                      : key === "cropT" ? (selected.cropB ?? 0)
                      : (selected.cropT ?? 0);
                    const value = selected[key] ?? 0;
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="w-14 text-[11px] font-black text-k-body">{label}</span>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(0, 85 - opposite)}
                          step={1}
                          value={value}
                          aria-label={`Rogner ${label.toLowerCase()}`}
                          onChange={(e) => {
                            const p: Partial<PosterElement> = {};
                            p[key] = Number(e.target.value);
                            patchElement(selected.id, p);
                          }}
                          className="flex-1 accent-k-orange"
                        />
                        <span className="w-9 text-right text-[11px] font-bold text-k-body">{Math.round(value)} %</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Communs : taille + rotation */}
              <div>
                <Label htmlFor="el-w">Largeur : {Math.round(selected.w)} %</Label>
                <input
                  id="el-w"
                  type="range" min={3} max={120} step={1}
                  value={selected.w}
                  onChange={(e) => patchElement(selected.id, { w: Number(e.target.value) })}
                  className="w-full accent-k-orange"
                />
              </div>
              <div>
                <Label htmlFor="el-rot">Rotation : {Math.round(selected.rot)}°</Label>
                <input
                  id="el-rot"
                  type="range" min={-180} max={180} step={1}
                  value={selected.rot}
                  onChange={(e) => patchElement(selected.id, { rot: Number(e.target.value) })}
                  className="w-full accent-k-orange"
                />
              </div>
            </section>
          ) : (
            <p className="rounded-xl border-2 border-dashed border-zinc-300 p-4 text-center text-sm font-bold text-k-body">
              Cliquez sur un élément de l&apos;affiche pour le modifier,
              ou ajoutez-en un ci-dessus.
            </p>
          )}

          <p className="text-[11px] font-bold text-zinc-400">
            Le QR affiché est celui personnalisé dans le Studio QR — testez
            le scan avant d&apos;imprimer.
          </p>
        </div>
      </div>
    </div>
  );
}

/* Mini-icônes des formes pour la grille d'ajout. */
function ShapeIcon({ kind }: { kind: ShapeKind }) {
  const paths: Record<ShapeKind, React.ReactNode> = {
    circle: <circle cx="12" cy="12" r="9" />,
    oval: <ellipse cx="12" cy="12" rx="10" ry="6.5" />,
    bar: <rect x="2" y="9" width="20" height="6" />,
    half: <path d="M3 19 A9 14 0 0 1 21 19Z" />,
    cross: <path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5Z" />,
    ring: <path fillRule="evenodd" d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" />,
    square: <rect x="4" y="4" width="16" height="16" rx="3" />,
    pill: <rect x="2" y="8" width="20" height="8" rx="4" />,
    triangle: <path d="M12 4 21 20H3Z" />,
    diamond: <path d="M12 2 22 12 12 22 2 12Z" />,
    star: <path d="M12 2.5 15 9l7 .9-5.2 4.8L18.4 21 12 17.4 5.6 21l1.6-6.3L2 9.9 9 9Z" />,
    heart: <path d="M12 21C6.4 16.7 3 13.4 3 9.5 3 6.5 5.2 4.5 7.7 4.5c1.7 0 3.2.9 4.3 2.4 1.1-1.5 2.6-2.4 4.3-2.4 2.5 0 4.7 2 4.7 5 0 3.9-3.4 7.2-9 11.5Z" />,
    clover: <path d="M11.5 11.5C9 11 7 10.5 6 9a3 3 0 1 1 4.2-4.2c1.5 1 2 3 2.3 5.5.3-2.5.8-4.5 2.3-5.5A3 3 0 1 1 19 9c-1 1.5-3 2-5.5 2.5 2.5.3 4.5.8 5.5 2.3a3 3 0 1 1-4.2 4.2c-1.5-1-2-3-2.3-5.5-.3 2.5-.8 4.5-2.3 5.5A3 3 0 1 1 6 13.8c1-1.5 3-2 5.5-2.3ZM12.6 14 11 21h2.6l-1-7Z" />,
    sparkle: <path d="M12 1c1 6.5 4.5 10 11 11-6.5 1-10 4.5-11 11-1-6.5-4.5-10-11-11 6.5-1 10-4.5 11-11Z" />,
    burst: <path d="M12 1l2.3 3.3 3.9-1.2.6 4 4 .6-1.2 3.9L25 12l-3.4 2.3 1.2 3.9-4 .6-.6 4-3.9-1.2L12 25l-2.3-3.4-3.9 1.2-.6-4-4-.6 1.2-3.9L-1 12l3.4-2.3-1.2-3.9 4-.6.6-4 3.9 1.2Z" transform="scale(0.92) translate(1,0)" />,
    arrow: <path d="M2 10h12V6l8 6-8 6v-4H2Z" />,
    squiggle: <path d="M2 14c2-6 4-6 6 0s4 6 6 0 4-6 8-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />,
    moon: <path d="M17 3a9.5 9.5 0 1 0 4 11.5A8 8 0 0 1 17 3Z" />,
  };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      {paths[kind]}
    </svg>
  );
}
