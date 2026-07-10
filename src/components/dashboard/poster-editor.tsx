"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { saveQrPoster } from "@/actions/qr-codes";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { FONT_LIST, fontFamily } from "@/lib/fonts";
import {
  POSTER_TEMPLATES,
  QR_SCALES,
  QR_SCALE_PX,
  contrastText,
  posterBackground,
  resolvePosterConfig,
  type PosterConfig,
} from "@/lib/poster";

const QR_SCALE_LABELS: Record<(typeof QR_SCALES)[number], string> = {
  sm: "Petit",
  md: "Moyen",
  lg: "Grand",
};

function ColorField({
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
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded border border-zinc-300 bg-white p-0.5"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-zinc-600">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-violet-600"
      />
    </label>
  );
}

/**
 * Éditeur d'affiche : panneau de réglages à gauche, aperçu A4 fidèle à
 * droite. À l'impression, seule l'affiche sort (les contrôles sont
 * masqués et l'affiche occupe toute la page).
 */
export function PosterEditor({
  qrId,
  qrDataUrl,
  playUrl,
  organizationName,
  logoUrl,
  initialConfig,
}: {
  qrId: string;
  qrDataUrl: string;
  playUrl: string;
  organizationName: string;
  logoUrl: string | null;
  initialConfig: Record<string, unknown>;
}) {
  const [config, setConfig] = useState<PosterConfig>(() =>
    resolvePosterConfig(initialConfig),
  );
  const [state, formAction, pending] = useActionState(saveQrPoster, null);
  const [dirty, setDirty] = useState(false);

  const fontHrefs = useMemo(
    () => FONT_LIST.map((f) => f.googleHref).filter(Boolean) as string[],
    [],
  );

  function set<K extends keyof PosterConfig>(key: K, value: PosterConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value, template: undefined }));
    setDirty(true);
  }

  const steps = [config.step1, config.step2, config.step3].filter(
    (s) => s.length > 0,
  );

  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white print:min-h-0">
      {fontHrefs.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}

      {/* Barre d'actions */}
      <div className="print:hidden flex items-center justify-between gap-4 px-6 py-4 border-b border-zinc-200 bg-white">
        <Link
          href="/dashboard/qr-codes"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← QR codes
        </Link>
        <div className="flex items-center gap-3">
          <form action={formAction}>
            <input type="hidden" name="id" value={qrId} />
            <input type="hidden" name="poster" value={JSON.stringify(config)} />
            <Button
              type="submit"
              variant="secondary"
              disabled={pending}
              onClick={() => setDirty(false)}
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-violet-600 text-white text-sm font-semibold px-5 py-2.5 hover:bg-violet-500 transition-colors"
          >
            Imprimer
          </button>
        </div>
      </div>
      {state?.ok && !dirty && (
        <p className="print:hidden px-6 pt-3 text-sm text-emerald-600">
          Affiche enregistrée.
        </p>
      )}
      <div className="print:hidden px-6">
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </div>

      <div className="flex flex-col lg:flex-row gap-6 p-6 print:p-0 max-w-6xl mx-auto print:max-w-none">
        {/* Panneau de réglages */}
        <aside className="print:hidden lg:w-80 shrink-0 space-y-5">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Modèles
            </p>
            <div className="grid grid-cols-2 gap-2">
              {POSTER_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setConfig(t.config);
                    setDirty(true);
                  }}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    config.template === t.key
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-violet-300"
                  }`}
                >
                  <span className="flex gap-0.5">
                    {t.swatch.map((c, i) => (
                      <span
                        key={i}
                        className="h-3 w-3 rounded-full border border-black/10"
                        style={{ background: c }}
                      />
                    ))}
                  </span>
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Textes
            </p>
            <div>
              <Label htmlFor="poster-title">Titre</Label>
              <Input
                id="poster-title"
                maxLength={60}
                value={config.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="poster-subtitle">Sous-titre</Label>
              <Input
                id="poster-subtitle"
                maxLength={90}
                value={config.subtitle}
                onChange={(e) => set("subtitle", e.target.value)}
              />
            </div>
            {([1, 2, 3] as const).map((n) => (
              <div key={n}>
                <Label htmlFor={`poster-step${n}`}>Étape {n}</Label>
                <Input
                  id={`poster-step${n}`}
                  maxLength={60}
                  value={config[`step${n}`]}
                  onChange={(e) => set(`step${n}`, e.target.value)}
                />
              </div>
            ))}
            <div>
              <Label htmlFor="poster-footer">Mention en bas</Label>
              <Input
                id="poster-footer"
                maxLength={120}
                value={config.footer}
                onChange={(e) => set("footer", e.target.value)}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Apparence
            </p>
            <label className="flex items-center justify-between gap-3 text-sm text-zinc-600">
              Police
              <select
                value={config.font}
                onChange={(e) =>
                  set("font", e.target.value as PosterConfig["font"])
                }
                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{ fontFamily: fontFamily(config.font) }}
              >
                {FONT_LIST.map((f) => (
                  <option key={f.key} value={f.key} style={{ fontFamily: f.family }}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <ColorField
              label="Fond (haut)"
              value={config.bgFrom}
              onChange={(v) => set("bgFrom", v)}
            />
            <ColorField
              label="Fond (bas)"
              value={config.bgTo}
              onChange={(v) => set("bgTo", v)}
            />
            <ColorField
              label="Texte"
              value={config.textColor}
              onChange={(v) => set("textColor", v)}
            />
            <ColorField
              label="Accent (étapes)"
              value={config.accent}
              onChange={(v) => set("accent", v)}
            />
            <label className="flex items-center justify-between gap-3 text-sm text-zinc-600">
              Taille du QR
              <select
                value={config.qrScale}
                onChange={(e) =>
                  set("qrScale", e.target.value as PosterConfig["qrScale"])
                }
                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {QR_SCALES.map((s) => (
                  <option key={s} value={s}>
                    {QR_SCALE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <Toggle
              label="Afficher le logo"
              checked={config.showLogo}
              onChange={(v) => set("showLogo", v)}
            />
            <Toggle
              label="Afficher le nom"
              checked={config.showOrgName}
              onChange={(v) => set("showOrgName", v)}
            />
            <Toggle
              label="Afficher les étapes"
              checked={config.showSteps}
              onChange={(v) => set("showSteps", v)}
            />
            {!logoUrl && config.showLogo && (
              <p className="text-xs text-zinc-400">
                Ajoutez votre logo dans Réglages pour l&apos;afficher ici.
              </p>
            )}
          </section>
        </aside>

        {/* Aperçu A4 — seule zone imprimée */}
        <div className="flex-1 flex justify-center">
          <div
            className="poster-sheet w-full max-w-130 aspect-210/297 rounded-xl print:rounded-none shadow-lg print:shadow-none overflow-hidden flex flex-col items-center justify-between text-center px-10 py-12 print:fixed print:inset-0 print:z-50 print:max-w-none print:aspect-auto print:h-full"
            style={{
              background: posterBackground(config),
              color: config.textColor,
              fontFamily: fontFamily(config.font),
            }}
          >
            <div className="flex flex-col items-center gap-3">
              {config.showLogo && logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="h-16 max-w-44 object-contain"
                />
              )}
              {config.showOrgName && (
                <p
                  className="text-sm uppercase tracking-widest"
                  style={{ opacity: 0.65 }}
                >
                  {organizationName}
                </p>
              )}
              <h1 className="text-4xl font-extrabold leading-tight text-balance">
                {config.title}
              </h1>
              {config.subtitle && (
                <p className="text-lg" style={{ opacity: 0.8 }}>
                  {config.subtitle}
                </p>
              )}
            </div>

            <div
              className="rounded-2xl bg-white p-3 shadow-sm border"
              style={{ borderColor: config.accent }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt={`QR code — ${playUrl}`}
                style={{
                  width: QR_SCALE_PX[config.qrScale],
                  height: QR_SCALE_PX[config.qrScale],
                }}
              />
            </div>

            <div className="flex flex-col items-center gap-5">
              {config.showSteps && steps.length > 0 && (
                <ol className="text-left space-y-2">
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                        style={{
                          background: config.accent,
                          color: contrastText(config.accent),
                        }}
                      >
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              )}
              {config.footer && (
                <p className="text-xs" style={{ opacity: 0.55 }}>
                  {config.footer}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
