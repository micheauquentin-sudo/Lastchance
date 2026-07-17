"use client";

import { useActionState } from "react";
import { updatePassword } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function PasswordUpdateForm() {
  const [state, action, pending] = useActionState(updatePassword, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
      <Button disabled={pending} className="w-full">{pending ? "Mise à jour…" : "Modifier le mot de passe"}</Button>
    </form>
  );
}
