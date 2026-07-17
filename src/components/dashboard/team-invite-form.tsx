"use client";

import { useActionState, useEffect, useRef } from "react";
import { inviteTeamMember } from "@/actions/team";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function TeamInviteForm() {
  const [state, formAction, pending] = useActionState(inviteTeamMember, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 sm:grid-cols-[1fr_150px_auto] sm:items-end">
      <div className="flex-1 max-w-xs">
        <Label htmlFor="invite-email">Inviter un collègue</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="collegue@exemple.fr"
        />
      </div>
      <div>
        <Label htmlFor="invite-role">Accès</Label>
        <select
          id="invite-role"
          name="role"
          className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm"
          defaultValue="cashier"
        >
          <option value="cashier">Caisse uniquement</option>
          <option value="editor">Campagnes et caisse</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "…" : "Envoyer l'invitation"}
      </Button>
      <div className="sm:col-span-3">
        {state?.ok && <p className="text-sm font-medium text-emerald-600">Invitation envoyée.</p>}
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </div>
    </form>
  );
}
