"use client";

import { useActionState } from "react";
import { updateWheel } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Label } from "@/components/ui/input";
import type { PlayLimit, Wheel } from "@/types/database";

const LIMITS: Array<{ value: PlayLimit; label: string }> = [
  { value: "once", label: "Une seule fois" },
  { value: "daily", label: "1 fois par jour" },
  { value: "weekly", label: "1 fois par semaine" },
  { value: "unlimited", label: "Illimité (démo)" },
];

export function WheelSettings({ wheel }: { wheel: Wheel }) {
  const [state, formAction, pending] = useActionState(updateWheel, null);

  return (
    <Card>
      <h2 className="font-semibold mb-4">Limite de jeu</h2>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={wheel.id} />
        <div>
          <Label htmlFor="play_limit">Chaque client peut jouer</Label>
          <select
            id="play_limit"
            name="play_limit"
            defaultValue={wheel.play_limit}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {LIMITS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">
          {pending ? "…" : "Enregistrer"}
        </Button>
      </form>
    </Card>
  );
}
