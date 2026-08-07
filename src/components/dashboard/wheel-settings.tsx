"use client";

import { useState } from "react";
import { updateWheel } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { useActionForm } from "@/lib/use-action-form";
import { cn } from "@/lib/utils";
import { isSkillGameType } from "@/lib/validations/skill";
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
  // Jeux de DÉFI *skill-gated* (vague 2) : réussir l'épreuve conditionne le tirage.
  { value: "rps", label: "Pierre-feuille-ciseaux", hint: "Battre la machine à PFC" },
  { value: "reflex", label: "Jeu de réflexe", hint: "Agir dans le temps imparti" },
  { value: "gauge", label: "Jauge à arrêter", hint: "Stopper la jauge sur la zone" },
  { value: "puzzle", label: "Puzzle simple", hint: "Remettre les fragments en ordre" },
  { value: "mystery_word", label: "Mot mystère", hint: "Deviner le mot caché" },
  { value: "estimate", label: "Estimation d'un nombre", hint: "Approcher le bon nombre" },
];

/** Config skill_config existante (jsonb) telle que chargée pour cette roue. */
type RawSkillConfig = Record<string, unknown> | null;

function readRaw(wheel: Wheel): RawSkillConfig {
  const raw = (wheel as { skill_config?: RawSkillConfig }).skill_config ?? null;
  return raw && typeof raw === "object" ? raw : null;
}

function str(raw: RawSkillConfig, key: string): string {
  const v = raw?.[key];
  return v == null ? "" : String(v);
}

export function WheelSettings({ wheel }: { wheel: Wheel }) {
  const { state, pending, onSubmit } = useActionForm(updateWheel, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const [gameType, setGameType] = useState<GameType>(wheel.game_type ?? "wheel");

  const raw = readRaw(wheel);
  // Champs du défi (préremplis depuis la config existante de la roue).
  const [mwWord, setMwWord] = useState(() => str(raw, "word"));
  const [mwHint, setMwHint] = useState(() => str(raw, "hint"));
  const [estQuestion, setEstQuestion] = useState(() => str(raw, "question"));
  const [estTarget, setEstTarget] = useState(() => str(raw, "target"));
  const [estTolerance, setEstTolerance] = useState(() => str(raw, "tolerance"));
  const [estUnit, setEstUnit] = useState(() => str(raw, "unit"));
  const [estImageUrl, setEstImageUrl] = useState(() => str(raw, "imageUrl"));
  const [reflexDuration, setReflexDuration] = useState(() => str(raw, "durationMs") || "1500");
  const [gaugeTolerance, setGaugeTolerance] = useState(() => str(raw, "tolerancePct") || "15");
  const [puzzleFragments, setPuzzleFragments] = useState(() =>
    Array.isArray(raw?.fragments) ? (raw.fragments as unknown[]).map(String).join("\n") : "",
  );

  const isSkill = isSkillGameType(gameType);

  // Sérialise skill_config selon le game_type. Vide pour les jeux non-skill (et
  // pour rps qui n'a aucun réglage) : l'action remet alors skill_config à null.
  // Miroir EXACT de la forme Zod de parseSkillConfig — les nombres restent en
  // texte, z.coerce s'en charge côté serveur (et signale les erreurs).
  function skillConfigValue(): string {
    switch (gameType) {
      case "reflex":
        return JSON.stringify({ durationMs: reflexDuration });
      case "gauge":
        return JSON.stringify({ tolerancePct: gaugeTolerance });
      case "mystery_word":
        return JSON.stringify({ word: mwWord, hint: mwHint });
      case "estimate":
        return JSON.stringify({
          target: estTarget,
          tolerance: estTolerance,
          question: estQuestion,
          unit: estUnit,
          imageUrl: estImageUrl,
        });
      case "puzzle": {
        const fragments = puzzleFragments
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        // Ordre attendu = ordre de saisie (identité) : le joueur doit
        // reconstituer la séquence telle que renseignée ici.
        return JSON.stringify({ fragments, order: fragments.map((_, i) => i) });
      }
      // rps + tous les jeux non-skill : aucun réglage à persister.
      default:
        return "";
    }
  }

  const inputClass = "border border-zinc-300 focus:ring-orange-500 focus:ring-offset-0";

  return (
    <Card>
      <h2 className="font-semibold mb-4">Réglages du jeu</h2>
      <form onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="id" value={wheel.id} />
        <input type="hidden" name="game_type" value={gameType} />
        <input type="hidden" name="skill_config" value={skillConfigValue()} />

        <div>
          <Label>Mécanique</Label>
          {/* L'aide arrive LÀ OÙ LE CHOIX SE FAIT. Le composant InfoBulle
              n'existait que sur les huit formulaires de création — c'est-à-dire
              sur le seul écran où il n'y a rien de difficile à décider (« quel
              nom ? »), et nulle part sur ceux où tout se joue. */}
          <InfoBulle
            id="aide-mecanique"
            resume="Laquelle choisir ?"
            className="mb-2"
          >
            Toutes ces mécaniques tirent le lot de la MÊME façon : c&apos;est
            l&apos;habillage qui change, pas les chances. Les six dernières
            (pierre-feuille-ciseaux, réflexe, jauge, puzzle, mot mystère,
            estimation) demandent en plus au client de réussir une petite
            épreuve avant de tirer — il joue plus longtemps, et il repart parfois
            sans rien avoir tiré.
          </InfoBulle>
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

        {isSkill && (
          <fieldset className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/40 p-3">
            <legend className="px-1 text-sm font-semibold text-orange-700">
              Réglages du défi
            </legend>

            {(gameType === "mystery_word" || gameType === "estimate") && (
              <p className="rounded-lg bg-white px-3 py-2 text-xs text-zinc-600" role="note">
                🔒 La bonne réponse ({gameType === "mystery_word" ? "le mot" : "le nombre"} et
                la tolérance) reste <strong>secrète côté serveur</strong> : elle n&apos;est
                jamais envoyée au joueur.
              </p>
            )}

            {gameType === "rps" && (
              <p className="text-xs text-zinc-600">
                Aucun réglage : le joueur doit battre un coup tiré au sort côté serveur.
              </p>
            )}

            {gameType === "reflex" && (
              <div>
                <Label htmlFor="reflex_duration">Temps de réaction (ms)</Label>
                <Input
                  id="reflex_duration"
                  type="number"
                  inputMode="numeric"
                  min={200}
                  max={10000}
                  step={100}
                  value={reflexDuration}
                  onChange={(e) => setReflexDuration(e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Fenêtre laissée au joueur (200 à 10 000 ms). Plus court = plus difficile.
                </p>
              </div>
            )}

            {gameType === "gauge" && (
              <div>
                <Label htmlFor="gauge_tolerance">Tolérance de la zone cible (%)</Label>
                <Input
                  id="gauge_tolerance"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  step={1}
                  value={gaugeTolerance}
                  onChange={(e) => setGaugeTolerance(e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Largeur de la zone à viser (1 à 50 %). Plus petite = plus difficile.
                </p>
              </div>
            )}

            {gameType === "mystery_word" && (
              <>
                <div>
                  <Label htmlFor="mw_word">Mot à deviner</Label>
                  <Input
                    id="mw_word"
                    type="text"
                    maxLength={40}
                    value={mwWord}
                    onChange={(e) => setMwWord(e.target.value)}
                    className={inputClass}
                    placeholder="ex : croissant"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Casse, accents et espaces sont ignorés à la comparaison.
                  </p>
                </div>
                <div>
                  <Label htmlFor="mw_hint">Indice (facultatif)</Label>
                  <Input
                    id="mw_hint"
                    type="text"
                    maxLength={120}
                    value={mwHint}
                    onChange={(e) => setMwHint(e.target.value)}
                    className={inputClass}
                    placeholder="ex : viennoiserie du matin"
                  />
                </div>
              </>
            )}

            {gameType === "estimate" && (
              <>
                <div>
                  <Label htmlFor="est_question">Question (facultatif)</Label>
                  <Input
                    id="est_question"
                    type="text"
                    maxLength={200}
                    value={estQuestion}
                    onChange={(e) => setEstQuestion(e.target.value)}
                    className={inputClass}
                    placeholder="ex : Combien de bonbons dans le bocal ?"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="est_target">Nombre cible</Label>
                    <Input
                      id="est_target"
                      type="number"
                      inputMode="numeric"
                      value={estTarget}
                      onChange={(e) => setEstTarget(e.target.value)}
                      className={inputClass}
                      placeholder="ex : 250"
                    />
                  </div>
                  <div>
                    <Label htmlFor="est_tolerance">Tolérance (±)</Label>
                    <Input
                      id="est_tolerance"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={estTolerance}
                      onChange={(e) => setEstTolerance(e.target.value)}
                      className={inputClass}
                      placeholder="ex : 20"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="est_unit">Unité (facultatif)</Label>
                  <Input
                    id="est_unit"
                    type="text"
                    maxLength={20}
                    value={estUnit}
                    onChange={(e) => setEstUnit(e.target.value)}
                    className={inputClass}
                    placeholder="ex : bonbons"
                  />
                </div>
                <div>
                  <Label htmlFor="est_image">Image (URL, facultatif)</Label>
                  <Input
                    id="est_image"
                    type="url"
                    maxLength={2048}
                    value={estImageUrl}
                    onChange={(e) => setEstImageUrl(e.target.value)}
                    className={inputClass}
                    placeholder="https://…"
                  />
                </div>
              </>
            )}

            {gameType === "puzzle" && (
              <div>
                <Label htmlFor="puzzle_fragments">Fragments (un par ligne, dans l&apos;ordre)</Label>
                <textarea
                  id="puzzle_fragments"
                  value={puzzleFragments}
                  onChange={(e) => setPuzzleFragments(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder={"Le\nchat\ndort"}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  De 2 à 8 fragments. Le joueur devra les remettre dans cet ordre exact
                  (l&apos;ordre attendu reste secret côté serveur).
                </p>
              </div>
            )}
          </fieldset>
        )}

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
          <InfoBulle
            id="aide-limite-jeu"
            resume="Une fois, par jour, par semaine ?"
            className="mt-2"
          >
            « Une seule fois » convient à une opération courte : chaque client
            joue une fois pour toute la campagne. « 1 fois par jour » fait
            revenir — c&apos;est le réglage des bars et boulangeries. « Illimité »
            n&apos;est là que pour vos essais : en boutique, le même téléphone
            viderait vos stocks en quelques minutes.
          </InfoBulle>
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">
          {pending ? "…" : "Enregistrer"}
        </Button>
      </form>
    </Card>
  );
}
