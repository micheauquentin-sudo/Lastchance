"use client";

import { useActionState } from "react";
import {
  addMerchantNote,
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
