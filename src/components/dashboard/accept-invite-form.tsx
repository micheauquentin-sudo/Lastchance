"use client";

import { useActionState } from "react";
import Link from "next/link";
import { acceptTeamInvitation } from "@/actions/team";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptTeamInvitation, null);

  if (state?.ok) {
    return (
      <Card>
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
          Bienvenue dans l&apos;équipe de {state.data.organizationName} !
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-zinc-900 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-zinc-700 transition-colors"
        >
          Accéder au dashboard
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "…" : "Accepter l'invitation"}
        </Button>
      </form>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </Card>
  );
}
