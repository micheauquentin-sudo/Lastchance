"use client";

import { useActionState } from "react";
import { createSmsCreditCheckoutSession } from "@/actions/billing";
import { requestSmsSender } from "@/actions/sms";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import type { SmsCreditPack } from "@/lib/stripe";

/**
 * Les deux formulaires de l'écran SMS. Ils n'utilisent PAS le même mécanisme,
 * et c'est délibéré :
 *
 * · la demande d'expéditeur revalide sans rediriger → `useActionForm`, sinon
 *   le bouton peut rester figé sur « Envoi… » alors que la demande est passée
 *   (défaut amont Next, docs/bugs.md) ;
 * · l'achat de crédits se termine par `redirect(url)` vers Stripe →
 *   `useActionState`, comme `BillingButtons`. Le passer par `useActionForm`
 *   ferait transiter le `NEXT_REDIRECT` par son `catch` et afficherait une
 *   erreur sur un paiement qui part correctement.
 */

/**
 * Demande d'un expéditeur alphanumérique.
 *
 * `reloadOnSuccess` : la liste des expéditeurs est une PROP SERVEUR, et c'est
 * le seul endroit où le commerçant voit que sa demande est enregistrée. Sans
 * rechargement franc, il ne voit rien et redemande — avec un nom légèrement
 * différent au deuxième essai, il ouvre une seconde ligne `pending` que la
 * plateforme devra trancher.
 */
export function SmsSenderForm({ hasDeclared }: { hasDeclared: boolean }) {
  const { state, pending, onSubmit } = useActionForm(requestSmsSender, {
    reloadOnSuccess: true,
    networkError: "Demande impossible, réessayez.",
  });

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div>
        <Label htmlFor="sms-sender-id">
          {hasDeclared ? "Demander un autre nom" : "Nom de l'expéditeur"}
        </Label>
        <Input
          id="sms-sender-id"
          name="sender_id"
          maxLength={11}
          required
          autoComplete="off"
          placeholder="MONRESTO"
          aria-describedby="sms-sender-hint"
        />
      </div>
      <p id="sms-sender-hint" className="text-xs text-zinc-600">
        11 caractères maximum, lettres non accentuées et chiffres uniquement,
        sans espace. C&apos;est ce que vos clients liront à la place du numéro.
      </p>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Envoi…" : "Demander cet expéditeur"}
      </Button>
      <FieldError
        message={state && !state.ok ? state.error : undefined}
      />
    </form>
  );
}

/**
 * Achat d'un pack de crédits.
 *
 * Le formulaire ne transmet qu'un IDENTIFIANT de pack : le nombre d'unités et
 * le montant sont relus du catalogue serveur (`resolveSmsPackCheckout`). Un
 * pack dont le prix Stripe n'est pas configuré n'arrive jamais jusqu'ici — la
 * page ne l'affiche pas plutôt que de le refuser au clic.
 */
export function SmsCreditPacks({ packs }: { packs: SmsCreditPack[] }) {
  const [state, action, pending] = useActionState(
    createSmsCreditCheckoutSession,
    null,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {packs.map((pack) => (
          <form key={pack.id} action={action}>
            <input type="hidden" name="pack" value={pack.id} />
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Redirection…" : pack.label}
            </Button>
          </form>
        ))}
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </div>
  );
}
