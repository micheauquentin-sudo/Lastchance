"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { ActionResult } from "@/lib/utils";

type AuthAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

export function AuthForm({
  action,
  submitLabel,
  successMessage,
  next,
}: {
  action: AuthAction;
  submitLabel: string;
  /** Affiché si l'action réussit sans rediriger (ex: email de confirmation envoyé). */
  successMessage?: string;
  /** Redirection post-connexion (ex : accepter une invitation d'équipe). */
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  if (state?.ok && successMessage) {
    return (
      <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        {successMessage}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="vous@commerce.fr"
        />
      </div>
      <div>
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          placeholder="••••••••"
        />
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Un instant…" : submitLabel}
      </Button>
    </form>
  );
}
