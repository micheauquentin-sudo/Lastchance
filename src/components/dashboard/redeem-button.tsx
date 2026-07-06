"use client";

import { useActionState } from "react";
import { redeemParticipation } from "@/actions/participations";
import { FieldError } from "@/components/ui/input";

export function RedeemButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(
    redeemParticipation,
    null,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:bg-violet-300 whitespace-nowrap"
      >
        {pending ? "…" : "Valider la remise"}
      </button>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}
