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
    <form ref={formRef} action={formAction} className="flex items-end gap-2">
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
      <Button type="submit" disabled={pending}>
        {pending ? "…" : "Envoyer l'invitation"}
      </Button>
      {state?.ok && (
        <p className="text-sm font-medium text-emerald-600">Invitation envoyée.</p>
      )}
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}
