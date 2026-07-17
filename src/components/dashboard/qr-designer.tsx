"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { updateQrStyle } from "@/actions/qr-codes";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  QR_PRESETS,
  isScannable,
  renderQr,
  resolveQrStyle,
  type ResolvedQrStyle,
} from "@/lib/qr-render";
import type { QrEyeStyle, QrPattern, QrStyle } from "@/types/database";

/** Taille max du logo normalisé (px) — garde la data URL légère. */
const LOGO_MAX_PX = 256;

const PATTERNS: { key: QrPattern; label: string; icon: React.ReactNode }[] = [
  {
    key: "square",
    label: "Carrés",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
      </>
    ),
  },
  {
    key: "rounded",
    label: "Arrondis",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2.4" /><rect x="14" y="3" width="7" height="7" rx="2.4" />
        <rect x="3" y="14" width="7" height="7" rx="2.4" /><rect x="14" y="14" width="7" height="7" rx="2.4" />
      </>
    ),
  },
  {
    key: "dots",
    label: "Points",
    icon: (
      <>
        <circle cx="6.5" cy="6.5" r="3.6" /><circle cx="17.5" cy="6.5" r="3.6" />
        <circle cx="6.5" cy="17.5" r="3.6" /><circle cx="17.5" cy="17.5" r="3.6" />
      </>
    ),
  },
  {
    key: "diamond",
    label: "Losanges",
    icon: (
      <>
        <path d="M6.5 2.5 10.5 6.5 6.5 10.5 2.5 6.5Z" /><path d="M17.5 2.5 21.5 6.5 17.5 10.5 13.5 6.5Z" />
        <path d="M6.5 13.5 10.5 17.5 6.5 21.5 2.5 17.5Z" /><path d="M17.5 13.5 21.5 17.5 17.5 21.5 13.5 17.5Z" />
      </>
    ),
  },
];

const EYES: { key: QrEyeStyle; label: string; icon: React.ReactNode }[] = [
  {
    key: "square",
    label: "Carrés",
    icon: (
      <>
        <path fillRule="evenodd" d="M3 3h18v18H3V3Zm3 3v12h12V6H6Z" />
        <rect x="8.5" y="8.5" width="7" height="7" />
      </>
    ),
  },
  {
    key: "rounded",
    label: "Arrondis",
    icon: (
      <>
        <path fillRule="evenodd" d="M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5Zm0 3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H8Z" />
        <rect x="8.5" y="8.5" width="7" height="7" rx="2.4" />
      </>
    ),
  },
  {
    key: "circle",
    label: "Cercles",
    icon: (
      <>
        <path fillRule="evenodd" d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z" />
        <circle cx="12" cy="12" r="3.6" />
      </>
    ),
  },
  {
    key: "leaf",
    label: "Feuilles",
    icon: (
      <>
        <path fillRule="evenodd" d="M10 3h6a5 5 0 0 1 5 5v6c0 3.9-3.1 7-7 7H8a5 5 0 0 1-5-5V10c0-3.9 3.1-7 7-7Zm0 3c-2.2 0-4 1.8-4 4v6a2 2 0 0 0 2 2h6c2.2 0 4-1.8 4-4V8a2 2 0 0 0-2-2h-6Z" />
        <path d="M11 8.5h2.5a2 2 0 0 1 2 2V13c0 1.4-1.1 2.5-2.5 2.5h-2.5a2 2 0 0 1-2-2V11c0-1.4 1.1-2.5 2.5-2.5Z" />
      </>
    ),
  },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

async function fileToLogoDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, LOGO_MAX_PX / Math.max(img.width || 1, img.height || 1));
    const w = Math.max(1, Math.round((img.width || LOGO_MAX_PX) * scale));
    const h = Math.max(1, Math.round((img.height || LOGO_MAX_PX) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-xs font-black uppercase tracking-[0.14em] text-k-body">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ShapePicker<K extends string>({
  options,
  value,
  onChange,
  name,
}: {
  options: { key: K; label: string; icon: React.ReactNode }[];
  value: K;
  onChange: (key: K) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-2 text-[11px] font-bold transition-colors ${
            value === o.key
              ? "border-k-ink bg-k-yellow text-k-ink"
              : "border-zinc-200 bg-white text-k-body hover:border-k-ink"
          }`}
        >
          <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            {o.icon}
          </svg>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-16 cursor-pointer rounded-lg border-2 border-k-ink bg-white p-1"
      />
    </div>
  );
}

/**
 * Studio QR : personnalisation sans limite du QR code (modèles, motifs,
 * yeux, dégradés, logo, cadre) avec aperçu en direct — le tout dans une
 * fenêtre dédiée. Le style est revalidé côté serveur à l'enregistrement.
 */
export function QrDesigner({
  id,
  slug,
  url,
  initialStyle,
  onClose,
  onSaved,
}: {
  id: string;
  slug: string;
  url: string;
  initialStyle: QrStyle;
  onClose: () => void;
  onSaved: (style: QrStyle) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [style, setStyle] = useState<ResolvedQrStyle>(() => resolveQrStyle(initialStyle));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const patch = useCallback((p: Partial<ResolvedQrStyle>) => {
    setMessage(null);
    setStyle((s) => ({ ...s, ...p }));
  }, []);

  // Aperçu en direct.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderQr(canvas, url, style, 512).catch(() => {});
  }, [url, style]);

  // Échap pour fermer + verrou du scroll de la page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const scannable = isScannable(style);

  async function handleLogoFile(file: File | undefined) {
    if (!file) return;
    try {
      patch({ logo: await fileToLogoDataUrl(file) });
    } catch {
      setMessage({ ok: false, text: "Image non reconnue. Essayez un JPEG, PNG ou WebP." });
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await updateQrStyle({ id, ...style });
    setSaving(false);
    if (result.ok) {
      setMessage({ ok: true, text: "Personnalisation enregistrée." });
      onSaved(style);
    } else {
      setMessage({ ok: false, text: result.error });
    }
  }

  async function handleDownload(px: number) {
    const canvas = document.createElement("canvas");
    await renderQr(canvas, url, style, px);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-${slug}-${px}px.png`;
    a.click();
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Studio de personnalisation du QR code"
    >
      <button
        type="button"
        aria-label="Fermer le studio"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-k-ink/60"
      />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border-2 border-k-ink bg-k-bg shadow-[8px_8px_0_rgba(33,29,22,0.9)]">
        {/* En-tête */}
        <div className="flex items-center justify-between gap-4 border-b-2 border-k-ink bg-white px-5 py-3.5">
          <h2 className="text-lg font-black text-k-ink">Studio QR</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-k-ink bg-white text-k-ink transition-colors hover:bg-k-yellow"
          >
            <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[300px_1fr]">
          {/* Aperçu */}
          <div className="flex flex-col gap-3 border-b-2 border-k-ink bg-white p-5 md:border-b-0 md:border-r-2">
            <canvas
              ref={canvasRef}
              className="mx-auto h-auto w-full max-w-[240px] rounded-xl"
              aria-label="Aperçu du QR code personnalisé"
            />
            {!scannable && (
              <p className="rounded-xl border-2 border-k-ink bg-k-yellow px-3 py-2 text-xs font-bold text-k-ink">
                ⚠ Contraste faible : certains téléphones pourraient ne pas
                lire ce QR. Foncez le motif ou éclaircissez le fond.
              </p>
            )}
            <div className="mt-auto space-y-2">
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
              <div className="flex gap-2">
                {[512, 1024, 2048].map((px) => (
                  <button
                    key={px}
                    type="button"
                    onClick={() => handleDownload(px)}
                    className="flex-1 rounded-xl border-2 border-k-ink bg-white px-2 py-2 text-xs font-black text-k-ink transition-colors hover:bg-k-yellow/40"
                  >
                    PNG {px}
                  </button>
                ))}
              </div>
              {message && (
                <p
                  className={`text-sm font-bold ${message.ok ? "text-k-green" : "text-red-600"}`}
                  role="status"
                >
                  {message.text}
                </p>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="min-h-0 space-y-6 overflow-y-auto p-5">
            <Section title="Modèles prêts à l'emploi">
              <div className="flex flex-wrap gap-2">
                {QR_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => patch({ ...p.style, logo: style.logo })}
                    className="flex items-center gap-2 rounded-full border-2 border-k-ink bg-white px-3.5 py-1.5 text-sm font-bold text-k-ink transition-transform hover:-translate-y-0.5"
                  >
                    <span className="flex">
                      {p.swatch.map((c, i) => (
                        <span
                          key={i}
                          className="-ml-1 h-4 w-4 rounded-full border border-k-ink/40 first:ml-0"
                          style={{ background: c }}
                        />
                      ))}
                    </span>
                    {p.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Couleurs">
              <div className="flex flex-wrap items-end gap-4">
                <ColorField id={`qrs-dark-${id}`} label="Motif" value={style.dark} onChange={(v) => patch({ dark: v })} />
                <ColorField id={`qrs-light-${id}`} label="Fond" value={style.light} onChange={(v) => patch({ light: v })} />
                <div>
                  <Label htmlFor={`qrs-grad-${id}`}>Dégradé</Label>
                  <select
                    id={`qrs-grad-${id}`}
                    value={style.gradientType}
                    onChange={(e) =>
                      patch({
                        gradientType: e.target.value as ResolvedQrStyle["gradientType"],
                        darkTo:
                          e.target.value === "none"
                            ? null
                            : (style.darkTo ?? "#f5793b"),
                      })
                    }
                    className="h-10 rounded-lg border-2 border-k-ink bg-white px-2 text-sm font-bold text-k-ink"
                  >
                    <option value="none">Aucun</option>
                    <option value="linear">Linéaire</option>
                    <option value="radial">Radial</option>
                  </select>
                </div>
                {style.gradientType !== "none" && (
                  <ColorField
                    id={`qrs-darkto-${id}`}
                    label="2ᵉ couleur"
                    value={style.darkTo ?? "#f5793b"}
                    onChange={(v) => patch({ darkTo: v })}
                  />
                )}
              </div>
            </Section>

            <Section title="Motif">
              <ShapePicker
                name="Forme des modules"
                options={PATTERNS}
                value={style.pattern}
                onChange={(pattern) => patch({ pattern })}
              />
            </Section>

            <Section title="Yeux (coins)">
              <div className="space-y-3">
                <ShapePicker
                  name="Forme des yeux"
                  options={EYES}
                  value={style.eyeStyle}
                  onChange={(eyeStyle) => patch({ eyeStyle })}
                />
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 text-sm font-bold text-k-ink">
                    <input
                      type="checkbox"
                      checked={style.eyeColor !== null}
                      onChange={(e) =>
                        patch({ eyeColor: e.target.checked ? "#f5793b" : null })
                      }
                      className="h-4 w-4 accent-k-orange"
                    />
                    Couleur dédiée
                  </label>
                  {style.eyeColor !== null && (
                    <ColorField
                      id={`qrs-eye-${id}`}
                      label="Couleur des yeux"
                      value={style.eyeColor}
                      onChange={(v) => patch({ eyeColor: v })}
                    />
                  )}
                </div>
              </div>
            </Section>

            <Section title="Logo">
              <div className="flex items-center gap-3">
                <input
                  id={`qrs-logo-${id}`}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleLogoFile(e.target.files?.[0])}
                  className="text-sm font-bold text-k-body file:mr-3 file:rounded-lg file:border-2 file:border-k-ink file:bg-k-yellow file:px-3 file:py-1.5 file:text-sm file:font-black file:text-k-ink hover:file:bg-k-yellow/70"
                />
                {style.logo && (
                  <button
                    type="button"
                    onClick={() => patch({ logo: null })}
                    className="shrink-0 text-sm font-bold text-red-600 hover:underline"
                  >
                    Retirer
                  </button>
                )}
              </div>
            </Section>

            <Section title="Cadre">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-bold text-k-ink">
                  <input
                    type="checkbox"
                    checked={style.frame === "banner"}
                    onChange={(e) => patch({ frame: e.target.checked ? "banner" : "none" })}
                    className="h-4 w-4 accent-k-orange"
                  />
                  Bannière avec appel à l&apos;action
                </label>
                {style.frame === "banner" && (
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="w-52">
                      <Label htmlFor={`qrs-frametext-${id}`}>Texte</Label>
                      <Input
                        id={`qrs-frametext-${id}`}
                        value={style.frameText}
                        maxLength={32}
                        onChange={(e) => patch({ frameText: e.target.value })}
                        placeholder="SCANNEZ-MOI"
                      />
                    </div>
                    <ColorField
                      id={`qrs-framecolor-${id}`}
                      label="Couleur du cadre"
                      value={style.frameColor}
                      onChange={(v) => patch({ frameColor: v })}
                    />
                  </div>
                )}
              </div>
            </Section>

            <p className="text-xs font-bold text-zinc-400">
              Astuce : testez toujours votre QR avec un téléphone avant
              d&apos;imprimer — surtout après un dégradé ou un fond coloré.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
