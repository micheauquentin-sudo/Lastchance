"use client";

import { useActionState, useState } from "react";
import {
  addMerchantNote,
  deleteMerchant,
  setMerchantCompAccess,
  setMerchantEventsAddon,
  setMerchantHuntsAddon,
  setMerchantJackpotAddon,
  setMerchantLoyaltyAddon,
  setMerchantPronosticsAddon,
  setMerchantPlan,
  setMerchantStatus,
} from "@/app/admin/(protected)/merchants/actions";
import type { ActionResult } from "@/lib/utils";

type FdAction = (fd: FormData) => Promise<ActionResult>;
const adapt = (fn: FdAction) => (_prev: ActionResult | null, fd: FormData) => fn(fd);

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? (
    <p className="mt-2 text-xs text-emerald-400">Enregistré.</p>
  ) : (
    <p className="mt-2 text-xs text-red-400">{state.error}</p>
  );
}

const STATUSES = [
  { value: "active", label: "Actif" },
  { value: "past_due", label: "Impayé" },
  { value: "canceled", label: "Annulé" },
  { value: "inactive", label: "Inactif" },
];

export function StatusControl({ organizationId, current }: { organizationId: string; current: string }) {
  const [state, action, pending] = useActionState(adapt(setMerchantStatus), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <select
        name="status"
        defaultValue={current}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value} className="bg-zinc-900">
            {s.label}
          </option>
        ))}
      </select>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        Appliquer
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function PlanControl({
  organizationId,
  current,
  plans,
}: {
  organizationId: string;
  current: string;
  plans: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(adapt(setMerchantPlan), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <select
        name="plan"
        defaultValue={current}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      >
        {plans.map((p) => (
          <option key={p.id} value={p.id} className="bg-zinc-900">
            {p.name}
          </option>
        ))}
      </select>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        Appliquer
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function PronosticsAddonControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    adapt(setMerchantPronosticsAddon),
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className={enabled ? "text-sm text-emerald-400" : "text-sm text-zinc-500"}>
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : enabled ? "Désactiver" : "Activer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function HuntsAddonControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    adapt(setMerchantHuntsAddon),
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className={enabled ? "text-sm text-emerald-400" : "text-sm text-zinc-500"}>
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : enabled ? "Désactiver" : "Activer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function LoyaltyAddonControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    adapt(setMerchantLoyaltyAddon),
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className={enabled ? "text-sm text-emerald-400" : "text-sm text-zinc-500"}>
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : enabled ? "Désactiver" : "Activer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function JackpotAddonControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    adapt(setMerchantJackpotAddon),
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className={enabled ? "text-sm text-emerald-400" : "text-sm text-zinc-500"}>
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : enabled ? "Désactiver" : "Activer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function EventsAddonControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    adapt(setMerchantEventsAddon),
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className={enabled ? "text-sm text-emerald-400" : "text-sm text-zinc-500"}>
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : enabled ? "Désactiver" : "Activer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function CompAccessControl({
  organizationId,
  enabled,
  until,
  note,
  addonPronostics,
  addonHunts,
  addonLoyalty,
  addonJackpot,
}: {
  organizationId: string;
  enabled: boolean;
  until: string | null;
  note: string;
  addonPronostics: boolean;
  addonHunts: boolean;
  addonLoyalty: boolean;
  addonJackpot: boolean;
}) {
  const [state, action, pending] = useActionState(
    adapt(setMerchantCompAccess),
    null,
  );
  const [on, setOn] = useState(enabled);
  const [includePronostics, setIncludePronostics] = useState(false);
  const [includeHunts, setIncludeHunts] = useState(false);
  const [includeLoyalty, setIncludeLoyalty] = useState(false);
  const [includeJackpot, setIncludeJackpot] = useState(false);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(on)} />
      <input type="hidden" name="includePronostics" value={String(includePronostics)} />
      <input type="hidden" name="includeHunts" value={String(includeHunts)} />
      <input type="hidden" name="includeLoyalty" value={String(includeLoyalty)} />
      <input type="hidden" name="includeJackpot" value={String(includeJackpot)} />

      <label className="flex items-center gap-2 text-sm text-zinc-200">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="h-4 w-4 accent-emerald-500"
        />
        Accès offert (premium sans paiement)
      </label>

      {on && (
        <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Dernier jour inclus (fuseau du commerçant, vide = illimité)
            </label>
            <input
              type="date"
              name="until"
              defaultValue={until ? until.slice(0, 10) : ""}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Motif interne
            </label>
            <input
              name="note"
              defaultValue={note}
              maxLength={200}
              placeholder="Ex : partenaire, compensation, presse…"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
          {!addonPronostics && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={includePronostics}
                onChange={(e) => setIncludePronostics(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              Inclure aussi le module Pronostics
            </label>
          )}
          {!addonHunts && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={includeHunts}
                onChange={(e) => setIncludeHunts(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              Inclure aussi le module Chasse au trésor
            </label>
          )}
          {!addonLoyalty && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={includeLoyalty}
                onChange={(e) => setIncludeLoyalty(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              Inclure aussi le module Passeport de fidélité
            </label>
          )}
          {!addonJackpot && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={includeJackpot}
                onChange={(e) => setIncludeJackpot(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              Inclure aussi le module Jackpot collectif
            </label>
          )}
        </div>
      )}

      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : "Appliquer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function DeleteMerchantControl({
  organizationId,
  slug,
  name,
}: {
  organizationId: string;
  slug: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(adapt(deleteMerchant), null);
  const [confirm, setConfirm] = useState("");
  const matches = confirm.trim() === slug;

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/[0.04] p-5">
      <h2 className="mb-1 text-sm font-semibold text-red-300">Zone de danger</h2>
      <p className="mb-4 text-sm text-zinc-400">
        Supprime définitivement <span className="font-semibold text-zinc-200">{name}</span> et
        toutes ses données : campagnes, roues, participations, QR codes, newsletter,
        championnats de pronostics, adhésions de l&apos;équipe, comptes devenus
        orphelins (hors comptes administrateurs) et abonnement Stripe.{" "}
        <span className="font-semibold text-red-300">Irréversible.</span>
      </p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="organizationId" value={organizationId} />
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
            Pour confirmer, saisissez le slug{" "}
            <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-zinc-300">
              {slug}
            </code>
          </label>
          <input
            name="confirmSlug"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            className="w-full max-w-xs rounded-lg border border-red-500/30 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/40"
          />
        </div>
        <button
          disabled={pending || !matches}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Suppression…" : "Supprimer définitivement"}
        </button>
        <Feedback state={state} />
      </form>
    </div>
  );
}

export function NoteForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(adapt(addMerchantNote), null);
  return (
    <form action={action}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <textarea
        name="body"
        rows={3}
        required
        maxLength={2000}
        placeholder="Note interne (visible par l'équipe uniquement)…"
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-violet-400/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      />
      <div className="mt-2 flex items-center justify-between">
        <Feedback state={state} />
        <button
          disabled={pending}
          className="ml-auto rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
        >
          Ajouter la note
        </button>
      </div>
    </form>
  );
}
