"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  registerContestPlayer,
  submitPrediction,
} from "@/actions/pronostics";
import type { ContestMatch } from "@/types/database";

/* Parcours client du championnat public /pronos — DA « Kermesse » :
   fond crème, encre, jaune, ombres dures. Mobile d'abord (téléphone au
   comptoir). */

const inputClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

const KICKOFF_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

// ────────────────────────────────────────────────────────────
// Inscription
// ────────────────────────────────────────────────────────────

export function ContestRegisterForm({
  slug,
  collectEmail,
  collectPhone,
}: {
  slug: string;
  collectEmail: boolean;
  collectPhone: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (
      _prev: Awaited<ReturnType<typeof registerContestPlayer>> | null,
      formData: FormData,
    ) => {
      const result = await registerContestPlayer({
        slug,
        firstName: String(formData.get("first_name") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
      });
      if (result.ok) router.refresh();
      return result;
    },
    null,
  );

  return (
    <form
      action={formAction}
      className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]"
    >
      <h2 className="text-lg font-black text-k-ink mb-1">Je participe !</h2>
      <p className="text-sm text-k-body mb-4">
        Inscrivez-vous une fois, pronostiquez tous les matchs.
      </p>
      <div className="space-y-3">
        <div>
          <label htmlFor="prono-first-name" className="mb-1.5 block text-sm font-bold text-k-ink">
            Prénom
          </label>
          <input
            id="prono-first-name"
            name="first_name"
            required
            maxLength={60}
            autoComplete="given-name"
            placeholder="Ex : Camille"
            className={inputClass}
          />
        </div>
        {collectEmail && (
          <div>
            <label htmlFor="prono-email" className="mb-1.5 block text-sm font-bold text-k-ink">
              Email
            </label>
            <input
              id="prono-email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              placeholder="vous@exemple.fr"
              className={inputClass}
            />
          </div>
        )}
        {collectPhone && (
          <div>
            <label htmlFor="prono-phone" className="mb-1.5 block text-sm font-bold text-k-ink">
              Téléphone
            </label>
            <input
              id="prono-phone"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              placeholder="06 12 34 56 78"
              className={inputClass}
            />
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="k-btn w-full rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-3 text-base font-black text-k-ink disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Inscription…" : "C'est parti 🎉"}
        </button>
        {state && !state.ok && (
          <p className="text-sm font-semibold text-red-600">{state.error}</p>
        )}
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Pronostic d'un match
// ────────────────────────────────────────────────────────────

interface PredictionValue {
  home_score: number;
  away_score: number;
  points: number | null;
}

function Badge({ badge, color }: { badge: string; color: string }) {
  if (color) {
    return (
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
        style={{ backgroundColor: color }}
        aria-hidden
      >
        {badge}
      </span>
    );
  }
  return (
    <span className="text-2xl leading-none" aria-hidden>
      {badge || "🏳️"}
    </span>
  );
}

export function PredictionCard({
  slug,
  match,
  prediction,
  scoreLabel,
  locked,
}: {
  slug: string;
  match: ContestMatch;
  prediction: PredictionValue | null;
  scoreLabel: string;
  /** Coup d'envoi passé ou match joué — calculé au rendu serveur ; le
   *  serveur re-vérifie de toute façon à la soumission. */
  locked: boolean;
}) {
  const router = useRouter();
  const [home, setHome] = useState(prediction ? String(prediction.home_score) : "");
  const [away, setAway] = useState(prediction ? String(prediction.away_score) : "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const finished = match.status === "finished";

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitPrediction({
        slug,
        matchId: match.id,
        homeScore: Number(home),
        awayScore: Number(away),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    });
  };

  return (
    <li className="k-border rounded-2xl bg-white p-4 shadow-[4px_4px_0_var(--color-k-ink)]">
      <div className="flex items-center justify-between gap-2 text-xs text-k-body mb-3">
        <span>{KICKOFF_FMT.format(new Date(match.kickoff_at))}</span>
        {finished ? (
          <span className="rounded-full bg-k-ink px-2.5 py-0.5 font-bold text-white">
            Terminé {match.home_score} – {match.away_score}
          </span>
        ) : locked ? (
          <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 font-bold text-k-body">
            En cours 🔒
          </span>
        ) : (
          <span className="rounded-full bg-k-green/15 px-2.5 py-0.5 font-bold text-k-green">
            Pronos ouverts
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge badge={match.home_badge} color={match.home_color} />
          <span className="truncate text-sm font-black text-k-ink">
            {match.home_name}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={99}
            inputMode="numeric"
            value={home}
            onChange={(e) => setHome(e.target.value)}
            disabled={locked || pending}
            aria-label={`${scoreLabel} de ${match.home_name}`}
            className="h-11 w-12 rounded-xl border-2 border-k-ink bg-white text-center text-lg font-black text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
          />
          <span className="font-black text-k-body">–</span>
          <input
            type="number"
            min={0}
            max={99}
            inputMode="numeric"
            value={away}
            onChange={(e) => setAway(e.target.value)}
            disabled={locked || pending}
            aria-label={`${scoreLabel} de ${match.away_name}`}
            className="h-11 w-12 rounded-xl border-2 border-k-ink bg-white text-center text-lg font-black text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
          />
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <span className="truncate text-sm font-black text-k-ink text-right">
            {match.away_name}
          </span>
          <Badge badge={match.away_badge} color={match.away_color} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {finished && prediction ? (
          <span className="text-sm font-bold text-k-body">
            Votre prono : {prediction.home_score} – {prediction.away_score}
            {prediction.points !== null && (
              <span
                className={
                  prediction.points > 0
                    ? "ml-2 rounded-full bg-k-yellow px-2 py-0.5 text-xs font-black text-k-ink"
                    : "ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-black text-k-body"
                }
              >
                +{prediction.points} pt{prediction.points > 1 ? "s" : ""}
              </span>
            )}
          </span>
        ) : locked ? (
          <span className="text-sm text-k-body">
            {prediction
              ? `Votre prono : ${prediction.home_score} – ${prediction.away_score}`
              : "Pronostics fermés pour ce match."}
          </span>
        ) : (
          <>
            <span className="text-xs text-k-body">
              Modifiable jusqu&apos;au coup d&apos;envoi
            </span>
            <button
              type="button"
              onClick={save}
              disabled={pending || home === "" || away === ""}
              className="k-btn-sm rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink disabled:pointer-events-none disabled:opacity-40"
            >
              {pending ? "…" : saved ? "Enregistré ✓" : prediction ? "Modifier" : "Valider"}
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>
      )}
    </li>
  );
}
