"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendNewsletterCampaign } from "@/actions/newsletter";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/input";

export function NewsletterComposer({ subscriberCount }: { subscriberCount: number }) {
  const [state, formAction, pending] = useActionState(sendNewsletterCampaign, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="subject">Objet</Label>
        <input
          id="subject"
          name="subject"
          required
          maxLength={150}
          placeholder="Ex. : -20 % ce week-end chez nous !"
          className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition-shadow focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>
      <div>
        <Label htmlFor="body">Message</Label>
        <textarea
          id="body"
          name="body"
          required
          rows={7}
          maxLength={5000}
          placeholder="Écrivez votre message ici. Il sera envoyé tel quel, avec un lien de désinscription en bas d'email."
          className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition-shadow focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      {state && !state.ok && <FieldError message={state.error} />}
      {state && state.ok && (
        <p className="text-sm font-medium text-emerald-600">
          Envoyé à {state.data.recipientCount} abonné{state.data.recipientCount > 1 ? "s" : ""}.
        </p>
      )}

      <Button type="submit" disabled={pending || subscriberCount === 0} className="w-full sm:w-auto">
        {pending
          ? "Envoi en cours…"
          : `Envoyer à ${subscriberCount} abonné${subscriberCount > 1 ? "s" : ""}`}
      </Button>
    </form>
  );
}
