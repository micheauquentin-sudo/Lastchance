"use client";

import { useActionState, useState } from "react";
import { createQuiz } from "@/actions/quiz";
import { Button } from "@/components/ui/button";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FieldError, Input, Label } from "@/components/ui/input";
import { QUIZ_NAME_MAX } from "@/lib/quiz";

/** Création d'un quiz (brouillon sans gain) — miroir de NewCalendarForm. */
export function NewQuizForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createQuiz, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouveau quiz</Button>;
  }

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <div>
        <Label htmlFor="quiz-name">Nom du quiz</Label>
        <Input
          id="quiz-name"
          name="name"
          required
          maxLength={QUIZ_NAME_MAX}
          placeholder="Ex : Le quiz de la carte"
          autoFocus
          className="w-72"
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
      <InfoBulle id="creation-quiz" resume="Ce qui va se passer" className="w-full">
        Créer prépare un quiz en brouillon, sans gain : rien n&apos;est publié
        et aucun joueur ne peut encore répondre. Vous écrivez ensuite les
        questions et choisissez le lot sur la page qui s&apos;ouvre. Vous le
        retrouverez à tout moment dans la liste de vos quiz.
      </InfoBulle>
    </form>
  );
}
