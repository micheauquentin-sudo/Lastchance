"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  confirmContestRecovery,
  registerContestPlayer,
  requestContestRecovery,
  submitPrediction,
  updateContestPlayer,
} from "@/actions/pronostics";
import {
  AVATAR_GROUPS,
  Avatar,
  avatarLabel,
  coerceAvatarId,
  DEFAULT_AVATAR,
  type AvatarId,
} from "@/lib/avatars";
import {
  TurnstileWidget,
  turnstileClientEnabled,
} from "@/components/wheel/turnstile-widget";
import type { ContestMatch } from "@/types/database";

/* Parcours client du championnat public /pronos — DA « Kermesse » :
   fond crème, encre, jaune, ombres dures. Mobile d'abord (téléphone au
   comptoir). */

const inputClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

function formatKickoff(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

// ────────────────────────────────────────────────────────────
// Sélecteur d'avatar (partagé inscription / édition)
// ────────────────────────────────────────────────────────────

type AvatarGroupKey = (typeof AVATAR_GROUPS)[number]["key"];

function AvatarPicker({
  value,
  onChange,
}: {
  value: AvatarId;
  onChange: (id: AvatarId) => void;
}) {
  // Onglet initial : celui qui contient l'avatar courant du joueur.
  const [groupKey, setGroupKey] = useState<AvatarGroupKey>(
    () =>
      AVATAR_GROUPS.find((g) => (g.ids as readonly AvatarId[]).includes(value))
        ?.key ?? AVATAR_GROUPS[0].key,
  );
  const group =
    AVATAR_GROUPS.find((g) => g.key === groupKey) ?? AVATAR_GROUPS[0];

  return (
    <div>
      <span className="mb-1.5 block text-sm font-bold text-k-ink">
        Votre avatar
      </span>
      <div className="mb-2 flex gap-1.5" role="tablist" aria-label="Familles d'avatars">
        {AVATAR_GROUPS.map((g) => {
          const active = g.key === groupKey;
          return (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setGroupKey(g.key)}
              className={
                active
                  ? "rounded-full border-2 border-k-ink bg-k-yellow px-3 py-1 text-xs font-black text-k-ink"
                  : "rounded-full border-2 border-transparent bg-zinc-100 px-3 py-1 text-xs font-bold text-k-body hover:bg-zinc-200"
              }
            >
              {g.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-6">
        {group.ids.map((id) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={active}
              aria-label={avatarLabel(id)}
              title={avatarLabel(id)}
              className={
                active
                  ? "rounded-full ring-2 ring-k-ink ring-offset-2 ring-offset-white transition"
                  : "rounded-full opacity-70 transition hover:opacity-100"
              }
            >
              <Avatar id={id} className="h-full w-full" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Inscription
// ────────────────────────────────────────────────────────────

export function ContestRegisterForm({
  slug,
  collectEmail,
  collectPhone,
  tiebreakerQuestion = null,
}: {
  slug: string;
  collectEmail: boolean;
  collectPhone: boolean;
  /** Question subsidiaire du championnat (départage des ex æquo). */
  tiebreakerQuestion?: string | null;
}) {
  const router = useRouter();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<AvatarId>(DEFAULT_AVATAR);
  const [state, formAction, pending] = useActionState(
    async (
      _prev: Awaited<ReturnType<typeof registerContestPlayer>> | null,
      formData: FormData,
    ) => {
      const rawGuess = String(formData.get("tiebreaker_guess") ?? "").trim();
      const result = await registerContestPlayer({
        slug,
        firstName: String(formData.get("first_name") ?? ""),
        avatar,
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        acceptedTerms: formData.get("accepted_terms") === "on",
        tiebreakerGuess: rawGuess === "" ? "" : Number(rawGuess),
        turnstileToken: captchaToken ?? undefined,
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
            Pseudo
          </label>
          <input
            id="prono-first-name"
            name="first_name"
            required
            maxLength={30}
            autoComplete="nickname"
            placeholder="Ex : Le Sorcier des pronos"
            className={inputClass}
          />
        </div>
        <AvatarPicker value={avatar} onChange={setAvatar} />
        {tiebreakerQuestion && (
          <div>
            <label
              htmlFor="prono-tiebreaker"
              className="mb-1.5 block text-sm font-bold text-k-ink"
            >
              Question subsidiaire : {tiebreakerQuestion}
            </label>
            <input
              id="prono-tiebreaker"
              name="tiebreaker_guess"
              type="number"
              min={0}
              max={1000000}
              inputMode="numeric"
              placeholder="Votre réponse (départage les ex æquo)"
              className={inputClass}
            />
          </div>
        )}
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
        <label className="flex items-start gap-2 text-xs leading-relaxed text-k-body">
          <input
            type="checkbox"
            name="accepted_terms"
            required
            className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
          />
          <span>
            J&apos;accepte les{" "}
            <Link href="/terms" className="font-bold underline">conditions</Link>
            {" "}et la{" "}
            <Link href="/privacy" className="font-bold underline">
              politique de confidentialité
            </Link>
            . Mon pseudo et mon avatar apparaîtront dans le classement public
            de ce championnat.
          </span>
        </label>
        <TurnstileWidget
          action="prono-register"
          onToken={setCaptchaToken}
        />
        <button
          type="submit"
          disabled={pending || (turnstileClientEnabled() && !captchaToken)}
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
// Édition du profil (pseudo + avatar) — onglet « Profil » du hub
// ────────────────────────────────────────────────────────────

export function ContestProfileEditor({
  slug,
  firstName,
  avatar,
}: {
  slug: string;
  firstName: string;
  avatar: string;
}) {
  const router = useRouter();
  const [nickname, setNickname] = useState(firstName);
  const [avatarId, setAvatarId] = useState<AvatarId>(coerceAvatarId(avatar));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Après enregistrement, router.refresh() resynchronise les props :
  // l'état local retombe naturellement sur « rien à enregistrer ».
  const dirty =
    nickname !== firstName || avatarId !== coerceAvatarId(avatar);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateContestPlayer({
        slug,
        firstName: nickname,
        avatar: avatarId,
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
    <div className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]">
      <h2 className="text-lg font-black text-k-ink mb-1">Mon profil</h2>
      <p className="text-sm text-k-body mb-4">
        Votre pseudo et votre avatar apparaissent dans le classement public.
      </p>
      <div className="space-y-3">
        <div>
          <label htmlFor="prono-edit-nickname" className="mb-1.5 block text-sm font-bold text-k-ink">
            Pseudo
          </label>
          <input
            id="prono-edit-nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={30}
            autoComplete="nickname"
            className={inputClass}
          />
        </div>
        <AvatarPicker value={avatarId} onChange={setAvatarId} />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || nickname.trim() === "" || !dirty}
            className="k-btn-sm flex-1 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink disabled:pointer-events-none disabled:opacity-50"
          >
            {pending ? "…" : saved ? "Enregistré ✓" : "Enregistrer"}
          </button>
          {dirty && (
            <button
              type="button"
              onClick={() => {
                setNickname(firstName);
                setAvatarId(coerceAvatarId(avatar));
                setError(null);
              }}
              disabled={pending}
              className="rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-bold text-k-ink"
            >
              Annuler
            </button>
          )}
        </div>
        {error && (
          <p className="text-sm font-semibold text-red-600">{error}</p>
        )}
      </div>
    </div>
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
  timeZone,
  locked,
}: {
  slug: string;
  match: ContestMatch;
  prediction: PredictionValue | null;
  scoreLabel: string;
  timeZone: string;
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
        <span>{formatKickoff(match.kickoff_at, timeZone)}</span>
        {finished ? (
          <span className="rounded-full bg-k-ink px-2.5 py-0.5 font-bold text-white">
            Terminé {match.home_score} – {match.away_score}
            {match.finish_type === "extra_time" && (
              <span title="après prolongation"> a.p.</span>
            )}
            {match.finish_type === "penalties" && (
              <span title="aux tirs au but">
                {match.home_penalties !== null && match.away_penalties !== null
                  ? ` · t.a.b. ${match.home_penalties}–${match.away_penalties}`
                  : " · t.a.b."}
              </span>
            )}
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

/**
 * « Retrouver mes pronostics » : demande de lien magique par email.
 * Repliée sous l'inscription (et visible seule sur un championnat
 * terminé) — la réponse est toujours neutre, jamais d'oracle
 * d'inscription.
 */
export function RecoveryRequestForm({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    async (
      _prev: Awaited<ReturnType<typeof requestContestRecovery>> | null,
      formData: FormData,
    ) =>
      requestContestRecovery({
        slug,
        email: String(formData.get("email") ?? ""),
        turnstileToken: captchaToken ?? undefined,
      }),
    null,
  );

  if (!open) {
    return (
      <p className="mt-4 text-center text-sm text-k-body">
        Déjà inscrit sur un autre appareil ?{" "}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-bold text-k-ink underline underline-offset-2 hover:text-k-orange"
        >
          Retrouver mes pronostics
        </button>
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-4 k-border rounded-2xl bg-white p-5 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <h2 className="text-base font-black text-k-ink mb-1">
        Retrouver mes pronostics
      </h2>
      <p className="text-sm text-k-body mb-3">
        Saisissez l&apos;email de votre inscription : un lien de
        récupération (valable 30 minutes) vous sera envoyé.
      </p>
      <label htmlFor="prono-recover-email" className="mb-1.5 block text-sm font-bold text-k-ink">
        Email d&apos;inscription
      </label>
      <input
        id="prono-recover-email"
        name="email"
        type="email"
        required
        maxLength={254}
        autoComplete="email"
        placeholder="vous@exemple.fr"
        className={inputClass}
      />
      {turnstileClientEnabled() && (
        <div className="mt-3">
          <TurnstileWidget onToken={setCaptchaToken} />
        </div>
      )}
      {state?.ok && (
        <p className="mt-3 rounded-xl bg-k-yellow/40 px-3 py-2 text-sm font-bold text-k-ink">
          {state.data.message}
        </p>
      )}
      {state && !state.ok && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-600">
          {state.error}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="k-btn-sm rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink disabled:opacity-70"
        >
          {pending ? "Envoi…" : "Recevoir le lien"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-bold text-k-body underline underline-offset-2"
        >
          Fermer
        </button>
      </div>
    </form>
  );
}

/**
 * Confirmation du lien magique (page /pronos/[slug]/recover) : bouton
 * explicite — jamais de consommation du jeton au simple chargement,
 * les scanners d'emails suivent les liens.
 */
export function RecoveryConfirm({ slug, token }: { slug: string; token: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async () => {
      const result = await confirmContestRecovery({ slug, token });
      if (result.ok) {
        router.replace(`/pronos/${slug}`);
        router.refresh();
      }
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="text-center">
      {state?.ok ? (
        <p className="rounded-xl bg-k-yellow/40 px-3 py-2 text-sm font-bold text-k-ink">
          Bon retour, {state.data.firstName} ! Redirection vers votre grille…
        </p>
      ) : (
        <>
          <button
            type="submit"
            disabled={pending}
            className="k-btn w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:opacity-70"
          >
            {pending ? "Vérification…" : "Récupérer mes pronostics"}
          </button>
          <p className="mt-3 text-xs text-k-body/70">
            Vos autres appareils seront déconnectés de cette grille.
          </p>
          {state && !state.ok && (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-600">
              {state.error}
            </p>
          )}
        </>
      )}
    </form>
  );
}
