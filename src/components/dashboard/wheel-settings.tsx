"use client";

import { useActionState, useState } from "react";
import { updateWheel } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { GameType, PlayLimit, Wheel } from "@/types/database";

const LIMITS: Array<{ value: PlayLimit; label: string }> = [
  { value: "once", label: "Une seule fois" },
  { value: "daily", label: "1 fois par jour" },
  { value: "weekly", label: "1 fois par semaine" },
  { value: "unlimited", label: "Illimité (démo)" },
];

const GAME_TYPES: Array<{ value: GameType; label: string; hint: string }> = [
  { value: "wheel", label: "Roue", hint: "Le client tourne la roue" },
  { value: "scratch", label: "Carte à gratter", hint: "Le client gratte l'écran" },
  { value: "flip_card", label: "Carte retournée", hint: "Le client retourne une carte" },
  { value: "cups", label: "Bonneteau (3 gobelets)", hint: "Le client choisit un gobelet" },
  { value: "slot", label: "Machine à sous", hint: "Rouleaux qui s'alignent" },
  { value: "memory", label: "Memory", hint: "Retrouver la paire" },
  { value: "chest", label: "Coffre à choisir", hint: "Le client ouvre un coffre" },
  { value: "dice", label: "Lancer de dé", hint: "Le client lance le dé" },
  { value: "draw_card", label: "Tirage d'une carte", hint: "Le client pioche une carte" },
];

export function WheelSettings({ wheel }: { wheel: Wheel }) {
  const [state, formAction, pending] = useActionState(updateWheel, null);
  const [gameType, setGameType] = useState<GameType>(wheel.game_type ?? "wheel");

  return (
    <Card>
      <h2 className="font-semibold mb-4">Réglages du jeu</h2>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={wheel.id} />
        <input type="hidden" name="game_type" value={gameType} />

        <div>
          <Label>Mécanique</Label>
          <div className="grid grid-cols-2 gap-2">
            {GAME_TYPES.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGameType(g.value)}
                aria-pressed={gameType === g.value}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  gameType === g.value
                    ? "border-orange-400 bg-orange-50 text-orange-700"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-orange-300",
                )}
              >
                <span className="block font-semibold">{g.label}</span>
                <span className="block text-xs text-zinc-500">{g.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="play_limit">Chaque client peut jouer</Label>
          <select
            id="play_limit"
            name="play_limit"
            defaultValue={wheel.play_limit}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
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
