"use client";

import { useActionState, useState } from "react";
import {
  addMerchantNote,
  creditMerchantSmsBalance,
  declareMerchantSmsSender,
  deleteMerchant,
  setMerchantSmsSenderStatus,
  setMerchantCalendarAddon,
  setMerchantCompAccess,
  setMerchantEventsAddon,
  setMerchantHuntsAddon,
  setMerchantJackpotAddon,
  setMerchantLoyaltyAddon,
  setMerchantPronosticsAddon,
  setMerchantQuizAddon,
  setMerchantReferralAddon,
  setMerchantPlan,
  setMerchantStatus,
} from "@/app/admin/(protected)/merchants/actions";
import {
  matchesNotoriousSender,
  measureSenderLikeness,
} from "@/lib/sms-sender-likeness";
import {
  findUnresolvedSuspension,
  resolveSenderPhase,
  type SmsSenderPhase,
} from "@/lib/sms-sender-state";
import { useActionForm } from "@/lib/use-action-form";
import type { ActionResult } from "@/lib/utils";

/**
 * useActionForm et non useActionState : l'état de chargement doit retomber même
 * quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 *
 * Seule exception dans ce fichier : `DeleteMerchantControl`, dont l'action se
 * termine par un `redirect(...)` (voir le commentaire sur place).
 */

type FdAction = (fd: FormData) => Promise<ActionResult>;
const adapt = (fn: FdAction) => (_prev: ActionResult | null, fd: FormData) => fn(fd);

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? (
    <p className="mt-2 text-xs text-emerald-400">Enregistré.</p>
  ) : (
    <p className="mt-2 text-xs text-red-400">{state.error}</p>
  );
}

const STATUSES = [
  { value: "active", label: "Actif" },
  { value: "past_due", label: "Impayé" },
  { value: "canceled", label: "Annulé" },
  { value: "inactive", label: "Inactif" },
];

export function StatusControl({ organizationId, current }: { organizationId: string; current: string }) {
  const { state, pending, onSubmit } = useActionForm(adapt(setMerchantStatus));
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <select
        name="status"
        defaultValue={current}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value} className="bg-zinc-900">
            {s.label}
          </option>
        ))}
      </select>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        Appliquer
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function PlanControl({
  organizationId,
  current,
  plans,
}: {
  organizationId: string;
  current: string;
  plans: { id: string; name: string }[];
}) {
  const { state, pending, onSubmit } = useActionForm(adapt(setMerchantPlan));
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <select
        name="plan"
        defaultValue={current}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      >
        {plans.map((p) => (
          <option key={p.id} value={p.id} className="bg-zinc-900">
            {p.name}
          </option>
        ))}
      </select>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        Appliquer
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function PronosticsAddonControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(
    adapt(setMerchantPronosticsAddon),
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className={enabled ? "text-sm text-emerald-400" : "text-sm text-zinc-500"}>
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : enabled ? "Désactiver" : "Activer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function HuntsAddonControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(
    adapt(setMerchantHuntsAddon),
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className={enabled ? "text-sm text-emerald-400" : "text-sm text-zinc-500"}>
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : enabled ? "Désactiver" : "Activer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function LoyaltyAddonControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(
    adapt(setMerchantLoyaltyAddon),
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className={enabled ? "text-sm text-emerald-400" : "text-sm text-zinc-500"}>
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : enabled ? "Désactiver" : "Activer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function JackpotAddonControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(
    adapt(setMerchantJackpotAddon),
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className={enabled ? "text-sm text-emerald-400" : "text-sm text-zinc-500"}>
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : enabled ? "Désactiver" : "Activer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function CalendarAddonControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(
    adapt(setMerchantCalendarAddon),
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className={enabled ? "text-sm text-emerald-400" : "text-sm text-zinc-500"}>
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : enabled ? "Désactiver" : "Activer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function EventsAddonControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(
    adapt(setMerchantEventsAddon),
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className={enabled ? "text-sm text-emerald-400" : "text-sm text-zinc-500"}>
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : enabled ? "Désactiver" : "Activer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ReferralAddonControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(
    adapt(setMerchantReferralAddon),
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className={enabled ? "text-sm text-emerald-400" : "text-sm text-zinc-500"}>
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : enabled ? "Désactiver" : "Activer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function QuizAddonControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(
    adapt(setMerchantQuizAddon),
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className={enabled ? "text-sm text-emerald-400" : "text-sm text-zinc-500"}>
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : enabled ? "Désactiver" : "Activer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function CompAccessControl({
  organizationId,
  enabled,
  until,
  note,
  addonPronostics,
  addonHunts,
  addonLoyalty,
  addonJackpot,
}: {
  organizationId: string;
  enabled: boolean;
  until: string | null;
  note: string;
  addonPronostics: boolean;
  addonHunts: boolean;
  addonLoyalty: boolean;
  addonJackpot: boolean;
}) {
  /**
   * PAS de `resetOnSuccess` ici : `until` et `note` sont des champs non
   * contrôlés à `defaultValue`. Les vider avant que `router.refresh()` n'ait
   * remonté les props les remettrait sur des valeurs déjà périmées.
   */
  const { state, pending, onSubmit } = useActionForm(
    adapt(setMerchantCompAccess),
  );
  const [on, setOn] = useState(enabled);
  const [includePronostics, setIncludePronostics] = useState(false);
  const [includeHunts, setIncludeHunts] = useState(false);
  const [includeLoyalty, setIncludeLoyalty] = useState(false);
  const [includeJackpot, setIncludeJackpot] = useState(false);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={String(on)} />
      <input type="hidden" name="includePronostics" value={String(includePronostics)} />
      <input type="hidden" name="includeHunts" value={String(includeHunts)} />
      <input type="hidden" name="includeLoyalty" value={String(includeLoyalty)} />
      <input type="hidden" name="includeJackpot" value={String(includeJackpot)} />

      <label className="flex items-center gap-2 text-sm text-zinc-200">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="h-4 w-4 accent-emerald-500"
        />
        Accès offert (premium sans paiement)
      </label>

      {on && (
        <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Dernier jour inclus (fuseau du commerçant, vide = illimité)
            </label>
            <input
              type="date"
              name="until"
              defaultValue={until ? until.slice(0, 10) : ""}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Motif interne
            </label>
            <input
              name="note"
              defaultValue={note}
              maxLength={200}
              placeholder="Ex : partenaire, compensation, presse…"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
          {!addonPronostics && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={includePronostics}
                onChange={(e) => setIncludePronostics(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              Inclure aussi le module Pronostics
            </label>
          )}
          {!addonHunts && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={includeHunts}
                onChange={(e) => setIncludeHunts(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              Inclure aussi le module Chasse au trésor
            </label>
          )}
          {!addonLoyalty && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={includeLoyalty}
                onChange={(e) => setIncludeLoyalty(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              Inclure aussi le module Passeport de fidélité
            </label>
          )}
          {!addonJackpot && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={includeJackpot}
                onChange={(e) => setIncludeJackpot(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              Inclure aussi le module Jackpot collectif
            </label>
          )}
        </div>
      )}

      <button
        disabled={pending}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        {pending ? "…" : "Appliquer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

/**
 * SEUL formulaire du fichier resté sur `useActionState` : `deleteMerchant` se
 * termine par un `redirect(...)`, dont le rejet remonterait dans le `catch` de
 * `useActionForm` — une erreur affichée après une suppression pourtant réussie
 * et irréversible, et la navigation vers la liste annulée. La confirmation de
 * succès est d'ailleurs rendue côté serveur depuis `?deletion=…`.
 */
export function DeleteMerchantControl({
  organizationId,
  slug,
  name,
}: {
  organizationId: string;
  slug: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(adapt(deleteMerchant), null);
  const [confirm, setConfirm] = useState("");
  const matches = confirm.trim() === slug;

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/[0.04] p-5">
      <h2 className="mb-1 text-sm font-semibold text-red-300">Zone de danger</h2>
      <p className="mb-4 text-sm text-zinc-400">
        Supprime définitivement <span className="font-semibold text-zinc-200">{name}</span> et
        toutes ses données : campagnes, roues, participations, QR codes, newsletter,
        championnats de pronostics, adhésions de l&apos;équipe, comptes devenus
        orphelins (hors comptes administrateurs) et abonnement Stripe.{" "}
        <span className="font-semibold text-red-300">Irréversible.</span>
      </p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="organizationId" value={organizationId} />
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
            Pour confirmer, saisissez le slug{" "}
            <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-zinc-300">
              {slug}
            </code>
          </label>
          <input
            name="confirmSlug"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            className="w-full max-w-xs rounded-lg border border-red-500/30 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/40"
          />
        </div>
        <button
          disabled={pending || !matches}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Suppression…" : "Supprimer définitivement"}
        </button>
        <Feedback state={state} />
      </form>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * EXPÉDITEUR SMS — la moitié plateforme du réglage
 *
 * Le commerçant demande un nom, la plateforme le déclare au registre AF2M ou
 * le refuse avec un motif. Les deux gestes sont séparés en base à dessein
 * (20260824120000) et le restent ici : deux formulaires, pas un sélecteur
 * unique où `declared` serait une option parmi d'autres.
 * ──────────────────────────────────────────────────────────── */

export interface AdminSmsSender {
  sender_id: string;
  status: string;
  status_reason: string | null;
  af2m_reference: string | null;
  declared_at: string | null;
  retired_at: string | null;
}

/**
 * L'état d'une ligne, dit à l'opérateur.
 *
 * `suspended_retired` n'existe pas en base comme valeur : c'est la
 * combinaison `status = 'suspended'` + `retired_at` renseigné, que
 * l'affichage précédent réduisait à « retiré ».
 */
const ADMIN_PHASE_LABELS: Record<SmsSenderPhase, string> = {
  pending: "en attente",
  declared: "déclaré",
  rejected: "refusé",
  suspended: "suspendu",
  suspended_retired: "suspendu puis retiré",
  retired: "retiré",
  unknown: "état imprévu",
};

const SMS_SENDER_STATUSES = [
  { value: "rejected", label: "Refuser" },
  { value: "suspended", label: "Suspendre" },
  { value: "pending", label: "Remettre en attente" },
  { value: "retired", label: "Retirer" },
];

export function SmsSenderControls({
  organizationId,
  organizationName,
  senders,
}: {
  organizationId: string;
  organizationName: string;
  senders: AdminSmsSender[];
}) {
  if (senders.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Aucun expéditeur demandé par ce commerçant. Rien à déclarer tant
        qu&apos;il n&apos;a pas choisi son nom — c&apos;est lui qui le saisit,
        pas nous.
      </p>
    );
  }
  // LE MOMENT OÙ L'OPÉRATEUR ENGAGE LA PLATEFORME. `declare_sms_sender`
  // refuse tant que l'organisation porte une suspension non résolue, retirée
  // ou non (20260829120000) — et sans ce bandeau, l'opérateur découvrait le
  // refus après avoir saisi une référence de registre qu'il venait d'obtenir.
  const suspension = findUnresolvedSuspension(
    senders.map((sender) => ({
      senderId: sender.sender_id,
      status: sender.status,
      retiredAt: sender.retired_at,
    })),
  );

  return (
    <ul className="space-y-4">
      {suspension && (
        <li className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">
          <span className="font-semibold">Suspension non résolue</span> sur{" "}
          <span className="font-mono">{suspension.senderId}</span>. Aucune
          déclaration n&apos;aboutira pour cette organisation, quel que soit le
          nom — la base refuse. Pour la lever :{" "}
          <span className="font-mono text-xs">
            Remettre en attente
          </span>{" "}
          sur la ligne sanctionnée, avec un motif. Un retrait ne la lève pas.
        </li>
      )}
      {senders.map((sender) => (
        <SmsSenderRow
          key={sender.sender_id}
          organizationId={organizationId}
          organizationName={organizationName}
          sender={sender}
        />
      ))}
    </ul>
  );
}

function SmsSenderRow({
  organizationId,
  organizationName,
  sender,
}: {
  organizationId: string;
  organizationName: string;
  sender: AdminSmsSender;
}) {
  const declareForm = useActionForm(adapt(declareMerchantSmsSender));
  const statusForm = useActionForm(adapt(setMerchantSmsSenderStatus));
  const retired = sender.retired_at !== null;
  const phase = resolveSenderPhase({
    senderId: sender.sender_id,
    status: sender.status,
    retiredAt: sender.retired_at,
  });
  // Le nom demandé et le nom commercial, côte à côte : c'est la seule
  // comparaison que l'opérateur doit faire avant de déposer à l'AF2M. Le score
  // ci-dessous n'interdit rien et NE DÉTECTE PAS une usurpation — les deux
  // valeurs sont saisies par le même commerçant, donc « Mon Banque » +
  // MONBANQUE ressort à 1,0 (voir `sms-sender-likeness.ts`). Il ne sert qu'à
  // attirer l'œil sur un écart grossier ; c'est la liste des noms notoirement
  // usurpés qui porte le cas dangereux.
  const likeness = measureSenderLikeness(organizationName, sender.sender_id);
  const notorious = matchesNotoriousSender(sender.sender_id);

  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold text-white">
          {sender.sender_id}
        </span>
        <span className="text-xs text-zinc-400">
          demandé par{" "}
          <span className="font-semibold text-zinc-200">
            {organizationName}
          </span>
        </span>
        {/* « retiré » seul EFFAÇAIT la sanction : `set_sms_sender_status(…,
            'retired')` conserve le statut, donc une suspension retirée reste
            une suspension — et c'est elle qui bloque toute déclaration. */}
        <span
          className={`rounded-md px-2 py-0.5 text-xs ring-1 ring-inset ${
            phase === "suspended" || phase === "suspended_retired"
              ? "bg-red-400/10 text-red-200 ring-red-400/30"
              : "bg-white/5 text-zinc-300 ring-white/10"
          }`}
        >
          {ADMIN_PHASE_LABELS[phase]}
        </span>
        {sender.af2m_reference && (
          <span className="font-mono text-xs text-zinc-400">
            AF2M {sender.af2m_reference}
          </span>
        )}
      </div>
      {!retired && (
        <>
          {/* Les deux valeurs à comparer, MONTRÉES et non résumées par un
              score : c'est le seul apport que l'écran puisse garantir. */}
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-zinc-500">Nom demandé</dt>
            <dd className="font-mono text-zinc-200">{sender.sender_id}</dd>
            <dt className="text-zinc-500">Nom commercial</dt>
            <dd className="text-zinc-200">{organizationName}</dd>
          </dl>
          {notorious && (
            <p className="mt-2 rounded-md bg-red-400/10 px-2.5 py-1.5 text-xs text-red-200 ring-1 ring-inset ring-red-400/30">
              <span className="font-semibold">Nom protégé :</span> cet
              identifiant reprend le nom {notorious}. Ne déclarez qu&apos;après
              avoir vu une pièce au nom du commerçant — c&apos;est le motif
              d&apos;hameçonnage le plus courant, et la plateforme en répond
              devant l&apos;opérateur.
            </p>
          )}
          {!likeness.resembles && (
            <p className="mt-2 rounded-md bg-amber-400/10 px-2.5 py-1.5 text-xs text-amber-200 ring-1 ring-inset ring-amber-400/30">
              <span className="font-semibold">Écart à lire :</span> l&apos;
              identifiant demandé ne se retrouve pas dans le nom commercial
              ci-dessus. Ce n&apos;est pas une accusation — une enseigne peut
              porter un nom d&apos;usage — mais les deux valeurs sont saisies
              par le commerçant : comparez-les avant de déposer.
            </p>
          )}
        </>
      )}
      {sender.status_reason && (
        <p className="mt-1.5 text-xs text-zinc-400">
          Motif affiché au commerçant : {sender.status_reason}
        </p>
      )}

      {sender.status !== "declared" && (
        <form onSubmit={declareForm.onSubmit} className="mt-3">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="senderId" value={sender.sender_id} />
          <label
            htmlFor={`af2m-${sender.sender_id}`}
            className="mb-1 block text-xs uppercase tracking-wide text-zinc-500"
          >
            Référence de déclaration AF2M
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`af2m-${sender.sender_id}`}
              name="reference"
              required
              maxLength={200}
              autoComplete="off"
              placeholder="N° de dépôt au registre"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
            <button
              disabled={declareForm.pending}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
            >
              {declareForm.pending ? "…" : "Déclarer"}
            </button>
          </div>
          <Feedback state={declareForm.state} />
        </form>
      )}

      <form
        onSubmit={statusForm.onSubmit}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="senderId" value={sender.sender_id} />
        <select
          name="status"
          defaultValue="rejected"
          aria-label={`Nouvel état de l'expéditeur ${sender.sender_id}`}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        >
          {SMS_SENDER_STATUSES.map((option) => (
            <option key={option.value} value={option.value} className="bg-zinc-900">
              {option.label}
            </option>
          ))}
        </select>
        <input
          name="reason"
          maxLength={200}
          autoComplete="off"
          placeholder="Motif (lu par le commerçant)"
          aria-label={`Motif pour l'expéditeur ${sender.sender_id}`}
          className="min-w-48 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
        <button
          disabled={statusForm.pending}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
        >
          {statusForm.pending ? "…" : "Appliquer"}
        </button>
        <Feedback state={statusForm.state} />
      </form>
    </li>
  );
}

/**
 * Crédit manuel de SMS. L'action existait depuis la fondation du canal et
 * n'avait AUCUN point d'appel : la plateforme ne pouvait créditer personne.
 */
export function SmsCreditControl({
  organizationId,
  balanceUnits,
}: {
  organizationId: string;
  balanceUnits: number;
}) {
  /**
   * Typé sur `{ created }` : ce formulaire est le seul du fichier dont le
   * succès ne soit pas univoque. Depuis `20260828120000`, un second crédit
   * sous la MÊME référence ne lève plus — il retombe sur le mouvement déjà
   * écrit. « Enregistré. » y serait un mensonge : l'opérateur croirait avoir
   * accordé un second lot, et `credit_sms_balance` n'a pas d'inverse pour le
   * détromper. Il doit lire la différence et changer sa référence.
   */
  const { state, pending, onSubmit } = useActionForm<{ created: boolean }>(
    (_prev, fd) => creditMerchantSmsBalance(fd),
    // `resetOnSuccess` : le formulaire porte un nombre et une référence de
    // facture. Les laisser en place après un crédit accordé invite à cliquer
    // deux fois, et `credit_sms_balance` n'a pas d'inverse.
    { resetOnSuccess: true },
  );
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <p className="text-sm text-zinc-300">
        Solde actuel :{" "}
        <span className="font-semibold tabular-nums text-white">
          {balanceUnits.toLocaleString("fr-FR")}
        </span>{" "}
        crédit{balanceUnits > 1 ? "s" : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="units"
          type="number"
          min={1}
          required
          placeholder="Nb de SMS"
          aria-label="Nombre de SMS à créditer"
          className="w-32 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
        <select
          name="reason"
          defaultValue="purchase"
          aria-label="Motif du crédit"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        >
          <option value="purchase" className="bg-zinc-900">
            Achat
          </option>
          <option value="adjustment" className="bg-zinc-900">
            Ajustement
          </option>
        </select>
        <input
          name="reference"
          required
          maxLength={200}
          autoComplete="off"
          placeholder="Référence (facture, geste commercial…)"
          aria-label="Référence du crédit"
          className="min-w-48 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
        <button
          disabled={pending}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
        >
          {pending ? "…" : "Créditer"}
        </button>
      </div>
      <p className="text-xs text-zinc-400">
        Irréversible : le grand livre est en écriture seule, aucun crédit ne se
        reprend. Une référence déjà utilisée ne crédite pas une seconde fois.
      </p>
      {state === null ? null : !state.ok ? (
        <p className="mt-2 text-xs text-red-400">{state.error}</p>
      ) : state.data.created ? (
        <p className="mt-2 text-xs text-emerald-400">Crédit accordé.</p>
      ) : (
        /* Ni vert ni rouge : rien n'a échoué, rien n'a été crédité. Le peindre
           en vert relancerait exactement le geste qu'on veut éviter. */
        <p className="mt-2 text-xs text-amber-400">
          Déjà crédité sous cette référence : aucune unité n’a été ajoutée.
          Changez la référence pour accorder un second lot.
        </p>
      )}
    </form>
  );
}

export function NoteForm({ organizationId }: { organizationId: string }) {
  /**
   * `resetOnSuccess` remplace ici le reset automatique de React 19 sur
   * `<form action={…}>` : sans lui, la note enregistrée resterait dans le
   * champ et inviterait à un doublon.
   */
  const { state, pending, onSubmit } = useActionForm(adapt(addMerchantNote), {
    resetOnSuccess: true,
  });
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <textarea
        name="body"
        rows={3}
        required
        maxLength={2000}
        placeholder="Note interne (visible par l'équipe uniquement)…"
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-violet-400/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      />
      <div className="mt-2 flex items-center justify-between">
        <Feedback state={state} />
        <button
          disabled={pending}
          className="ml-auto rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
        >
          Ajouter la note
        </button>
      </div>
    </form>
  );
}
