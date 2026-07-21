"use client";

import {
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  createContestLeague,
  joinContestLeague,
  leaveContestLeague,
} from "@/actions/pronostics";

/* Ligues privées du parcours /pronos — onglet « Ligues » du mini espace
   joueur. Les classements (général + une carte par ligue) sont rendus
   côté serveur et passés en slots ; ce composant ne gère que la
   sélection, la création, le code d'invitation et le départ. */

const inputClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

const submitClass =
  "k-btn-sm rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink disabled:pointer-events-none disabled:opacity-50";

export interface LeagueSummary {
  id: string;
  name: string;
  /** Code d'invitation — visible uniquement par les membres. */
  code: string;
  memberCount: number;
}

/** Clé réservée du sélecteur pour le classement général. */
const GENERAL = "general";

// Détection du partage natif sans mismatch d'hydratation : rendu
// serveur → false, premier rendu client → valeur réelle (aucun re-rendu).
const emptySubscribe = () => () => {};
const useCanShare = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => typeof navigator !== "undefined" && "share" in navigator,
    () => false,
  );

export function ContestLeaguesPanel({
  slug,
  contestName,
  leagues,
  generalBoard,
  leagueBoards,
}: {
  slug: string;
  /** Nom du championnat, injecté dans le message de partage. */
  contestName: string;
  /** Ligues dont le joueur est membre (source : loadContestPlayerLeagues). */
  leagues: LeagueSummary[];
  /** Classement général (slot serveur). */
  generalBoard: ReactNode;
  /** Classement de chaque ligue membre, indexé par id (slots serveur). */
  leagueBoards: Record<string, ReactNode>;
}) {
  const [selected, setSelected] = useState<string>(leagues[0]?.id ?? GENERAL);

  // Ligue quittée (ou pas encore resynchronisée) : repli sur le général.
  const activeLeague = leagues.find((l) => l.id === selected) ?? null;
  const showGeneral = selected === GENERAL || !activeLeague;

  return (
    <div className="space-y-5">
      {leagues.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-k-ink">Classement affiché</p>
          <div
            role="group"
            aria-label="Choix du classement"
            className="flex flex-wrap gap-1.5"
          >
            <SelectorChip
              label="🌍 Général"
              active={showGeneral}
              onClick={() => setSelected(GENERAL)}
            />
            {leagues.map((l) => (
              <SelectorChip
                key={l.id}
                label={l.name}
                active={activeLeague?.id === l.id}
                onClick={() => setSelected(l.id)}
              />
            ))}
          </div>
        </div>
      )}

      {activeLeague && !showGeneral && (
        <LeagueCard
          slug={slug}
          contestName={contestName}
          league={activeLeague}
          onLeft={() => setSelected(GENERAL)}
        />
      )}

      {showGeneral ? generalBoard : leagueBoards[activeLeague!.id] ?? null}

      {leagues.length === 0 && (
        <p className="text-center text-sm text-k-body">
          Créez une ligue privée pour vous mesurer à vos amis, collègues ou
          habitués — chacun garde aussi sa place au classement général.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <CreateLeagueForm slug={slug} onCreated={(id) => setSelected(id)} />
        <JoinLeagueForm slug={slug} onJoined={(id) => setSelected(id)} />
      </div>
    </div>
  );
}

function SelectorChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "max-w-full truncate rounded-full border-2 border-k-ink bg-k-yellow px-3 py-1.5 text-xs font-black text-k-ink"
          : "max-w-full truncate rounded-full border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-bold text-k-body hover:bg-zinc-50"
      }
    >
      {label}
    </button>
  );
}

/**
 * Carte de la ligue sélectionnée : effectif, code d'invitation (copie +
 * partage natif) et départ. Le code n'apparaît ici que parce que le
 * joueur est membre de la ligue.
 */
function LeagueCard({
  slug,
  contestName,
  league,
  onLeft,
}: {
  slug: string;
  contestName: string;
  league: LeagueSummary;
  onLeft: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // navigator n'existe pas au rendu serveur : le bouton de partage
  // n'apparaît qu'au rendu client, uniquement si l'API est disponible.
  const canShare = useCanShare();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(league.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : le code reste copiable à la main.
    }
  };

  const share = async () => {
    try {
      await navigator.share({
        text: `Rejoins ma ligue sur ${contestName} avec le code ${league.code}`,
      });
    } catch {
      // Partage annulé par l'utilisateur : rien à faire.
    }
  };

  const leave = () => {
    if (!confirm(`Quitter la ligue « ${league.name} » ?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await leaveContestLeague({ slug, leagueId: league.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onLeft();
      router.refresh();
    });
  };

  return (
    <div className="k-border rounded-2xl bg-white p-4 shadow-[4px_4px_0_var(--color-k-ink)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-black text-k-ink">
            {league.name}
          </p>
          <p className="text-xs font-bold text-k-body">
            {league.memberCount} membre{league.memberCount > 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={leave}
          disabled={pending}
          className="shrink-0 text-xs font-bold text-k-body underline underline-offset-2 hover:text-red-600 disabled:opacity-50"
        >
          {pending ? "…" : "Quitter"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-k-body">Code d&apos;invitation :</span>
        <code className="rounded-lg bg-k-stripe px-2.5 py-1 font-mono text-sm font-black tracking-widest text-k-ink">
          {league.code}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border-2 border-k-ink bg-white px-2.5 py-1 text-xs font-bold text-k-ink hover:bg-k-yellow/30"
        >
          {copied ? "Copié !" : "Copier"}
        </button>
        {canShare && (
          <button
            type="button"
            onClick={share}
            className="rounded-lg border-2 border-k-ink bg-white px-2.5 py-1 text-xs font-bold text-k-ink hover:bg-k-yellow/30"
          >
            Partager
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-k-body/70">
        Partagez ce code : vos amis inscrits au championnat rejoignent la
        ligue en un instant.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function CreateLeagueForm({
  slug,
  onCreated,
}: {
  slug: string;
  onCreated: (leagueId: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await createContestLeague({ slug, name });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        `Ligue « ${result.data.name} » créée — code : ${result.data.code}`,
      );
      setName("");
      onCreated(result.data.leagueId);
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="k-border rounded-2xl bg-white p-4 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <h3 className="text-base font-black text-k-ink mb-1">Créer une ligue</h3>
      <p className="mb-3 text-xs text-k-body">
        Un code d&apos;invitation est généré pour vos proches.
      </p>
      <label htmlFor="league-create-name" className="mb-1.5 block text-sm font-bold text-k-ink">
        Nom de la ligue
      </label>
      <input
        id="league-create-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        maxLength={40}
        placeholder="Ex : Les copains du comptoir"
        className={inputClass}
      />
      <button
        type="submit"
        disabled={pending || name.trim() === ""}
        className={`mt-3 w-full ${submitClass}`}
      >
        {pending ? "Création…" : "Créer la ligue"}
      </button>
      {success && (
        <p role="status" className="mt-2 rounded-xl bg-k-yellow/40 px-3 py-2 text-sm font-bold text-k-ink">
          {success}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

function JoinLeagueForm({
  slug,
  onJoined,
}: {
  slug: string;
  onJoined: (leagueId: string) => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await joinContestLeague({ slug, code });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(`Bienvenue dans « ${result.data.name} » !`);
      setCode("");
      onJoined(result.data.leagueId);
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="k-border rounded-2xl bg-white p-4 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <h3 className="text-base font-black text-k-ink mb-1">Rejoindre une ligue</h3>
      <p className="mb-3 text-xs text-k-body">
        Saisissez le code reçu d&apos;un ami.
      </p>
      <label htmlFor="league-join-code" className="mb-1.5 block text-sm font-bold text-k-ink">
        Code d&apos;invitation
      </label>
      <input
        id="league-join-code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))}
        required
        minLength={6}
        maxLength={8}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Ex : AB12CD"
        className={`${inputClass} font-mono tracking-widest uppercase`}
      />
      <button
        type="submit"
        disabled={pending || code.length < 6}
        className={`mt-3 w-full ${submitClass}`}
      >
        {pending ? "Vérification…" : "Rejoindre"}
      </button>
      {success && (
        <p role="status" className="mt-2 rounded-xl bg-k-yellow/40 px-3 py-2 text-sm font-bold text-k-ink">
          {success}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
