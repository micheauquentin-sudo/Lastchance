"use client";

import { useActionState } from "react";
import { createOrganization } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createOrganization, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="organizationName">Nom de l&apos;établissement</Label>
        <Input
          id="organizationName"
          name="organizationName"
          required
          maxLength={120}
          placeholder="Chez Marco"
          autoFocus
        />
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Création…" : "Créer mon espace"}
      </Button>
    </form>
  );
}
