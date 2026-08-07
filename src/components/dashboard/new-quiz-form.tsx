"use client";

import { useActionState, useState } from "react";
import { createQuiz } from "@/actions/quiz";
import { Button } from "@/components/ui/button";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FieldError, Input, Label } from "@/components/ui/input";
import { QUIZ_NAME_MAX } from "@/lib/quiz";

/** Création d'un quiz (brouillon sans gain) — miroir de NewCalendarForm. */
/**
 * `instanceId` : suffixe d'identifiants, pour que la page liste puisse monter
 * DEUX fois ce formulaire — en tête d'écran et dans l'état vide — sans
 * dupliquer un `id` dans le document (ce qui casserait `htmlFor` et
 * `aria-describedby`, donc l'annonce au lecteur d'écran).
 */
export function NewQuizForm({ instanceId = "" }: { instanceId?: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createQuiz, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouveau quiz</Button>;
  }

  return (
    <form
      action={formAction}
      className="w-full max-w-xl flex flex-wrap items-end gap-2 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <div className="w-full sm:w-auto">
        <Label htmlFor={`quiz-name${instanceId}`}>Nom du quiz</Label>
        <Input
          id={`quiz-name${instanceId}`}
          name="name"
          required
          maxLength={QUIZ_NAME_MAX}
          placeholder="Ex : Le quiz de la carte"
          autoFocus
          className="w-full sm:w-72"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Création…" : "Créer"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(false)}
        disabled={pending}
      >
        Annuler
      </Button>
      <FieldError message={state && !state.ok ? state.error : undefined} />
      <InfoBulle
        id={`creation-quiz${instanceId}`}
        resume="Ce qui va se passer"
        defaultOpen
        className="w-full"
      >
        Créer prépare un quiz en brouillon, sans gain : rien n&apos;est publié
        et aucun joueur ne peut encore répondre. Vous arrivez ensuite dans
        l&apos;atelier, quatre étapes qui s&apos;enregistrent chacune pour
        elle-même — le quiz, les questions, la dotation, puis la vérification
        avant d&apos;ouvrir. Vous le retrouverez à tout moment dans la liste de
        vos quiz.
      </InfoBulle>
    </form>
  );
}
