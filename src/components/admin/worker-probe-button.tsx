"use client";

import { useActionState } from "react";
import { runWorkerProbe } from "@/app/admin/(protected)/monitoring/actions";

export function WorkerProbeButton() {
  const [state, action, pending] = useActionState(runWorkerProbe, null);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-400 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Test en cours…" : "Tester le worker"}
      </button>
      <span
        role="status"
        className={`text-xs ${
          state?.ok ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {state?.ok
          ? "Probe terminé : file, claim et clôture fonctionnent."
          : state?.error ?? ""}
      </span>
    </form>
  );
}
