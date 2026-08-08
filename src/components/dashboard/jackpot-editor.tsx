"use client";

import { useActionState, useRef, useState } from "react";
import {
  deleteJackpotCampaign,
  setJackpotCampaignStatus,
  updateJackpotCampaign,
} from "@/actions/jackpot";
import Link from "next/link";
import { AutoSaveEtat } from "@/components/dashboard/auto-save-etat";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CodeTtlDaysField,
  codeTtlDaysInitial,
} from "@/components/dashboard/code-ttl-days-field";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { hrefEtapeJackpot } from "@/components/dashboard/atelier-jackpot-etapes";
import { FieldError, Input, Label } from "@/components/ui/input";
import { isoToZonedDateTimeInput } from "@/lib/date-time";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import type {
  JackpotCampaign,
  JackpotDrawMode,
  JackpotValidationMode,
} from "@/types/database";
import {
  clampJackpotPeriod,
  formatDurationLabel,
  jackpotDrawModeSummary,
  jackpotPeriodOptions,
  resolveJackpotCooldown,
} from "@/components/jackpot/jackpot-state";

const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";
const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

/** centimes → euros pour un champ number (0 reste 0, jamais de NaN). */
function centsToEuros(cents: number): number {
  return Math.max(0, Math.trunc(cents)) / 100;
}

const DRAW_MODES: { value: JackpotDrawMode; label: string }[] = [
  { value: "threshold_draw", label: "🎯 Tirage à l'objectif" },
  { value: "rescan_win", label: "⚡ Gain instantané au rescan" },
  { value: "date_draw", label: "🗓️ Tirage à date" },
];

// ────────────────────────────────────────────────────────────
// Réglages de la campagne
// ────────────────────────────────────────────────────────────

export function JackpotSettings({
  campaign,
  timeZone,
}: {
  campaign: JackpotCampaign;
  timeZone: string;
}) {
  // useActionForm et non useActionState : l'état de chargement doit retomber
  // même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
  //
  // Sans `resetOnSuccess` (ce formulaire ÉDITE une campagne : le vider après un
  // enregistrement serait une régression) et sans `form.reset()` manuel (il
  // rejouerait les anciens `defaultValue` avant que `router.refresh()` ait
  // commité, figeant un affichage périmé). Les champs non touchés continuent de
  // suivre leur `defaultValue` rafraîchi ; sur un champ que le commerçant a
  // effectivement saisi, sa frappe reste affichée telle quelle — écart assumé,
  // borné à la normalisation serveur (trim des libellés).
  //
  // ENREGISTREMENT AUTOMATIQUE, avec un délai PLUS LONG que le défaut (800 ms).
  // C'est la plus grosse carte du produit — quinze champs, dont deux zones de
  // texte libre (détails du lot, contenu commerçant) où l'on écrit des phrases.
  // Au délai par défaut, une pause de frappe au milieu d'une phrase partirait
  // au serveur ; à 1,5 s, on n'enregistre plus qu'une fois la main levée. La
  // sortie de champ, elle, envoie tout de suite dans les deux cas.
  //
  // `useAutoSave` s'ajoute À CÔTÉ de `useActionForm`, jamais autour : deux
  // gardes mécaniques du dépôt cherchent l'appel littéral.
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useActionForm(updateJackpotCampaign, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  const { enAttente, bloqueParValidation } = useAutoSave(formRef, {
    delai: 1500,
  });

  // Mode, rotation et fréquence sont liés : en « Code au comptoir » la base
  // impose un intervalle d'au moins max(2 × rotation, 5 min). On garde ces
  // champs contrôlés pour n'offrir que des combinaisons acceptées.
  const [mode, setMode] = useState<JackpotValidationMode>(campaign.validation_mode);
  const [periodSeconds, setPeriodSeconds] = useState(() =>
    clampJackpotPeriod(campaign.rotating_period_seconds),
  );
  const [cooldownSeconds, setCooldownSeconds] = useState(
    campaign.min_participation_interval_seconds,
  );
  const [drawMode, setDrawMode] = useState<JackpotDrawMode>(campaign.draw_mode);
  const [codeTtlDays, setCodeTtlDays] = useState(() =>
    codeTtlDaysInitial(campaign.code_ttl_days),
  );

  const periodOptions = jackpotPeriodOptions(periodSeconds);
  const cooldown = resolveJackpotCooldown({ mode, periodSeconds, cooldownSeconds });

  return (
    <Card>
      <h2 className="font-semibold mb-1">Réglages</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Nom, façon de participer, mode de tirage, lot et montant d&apos;affichage.
      </p>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
        <input type="hidden" name="id" value={campaign.id} />

        <div className="max-w-sm">
          <Label htmlFor="jackpot-name">Nom du jackpot</Label>
          <Input
            id="jackpot-name"
            name="name"
            defaultValue={campaign.name}
            required
            maxLength={80}
          />
        </div>

        {/* ── Comment participer ── */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-k-ink mb-1">
            Comment participer ?
          </legend>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="radio"
              name="validation_mode"
              value="rotating_code"
              checked={mode === "rotating_code"}
              onChange={() => setMode("rotating_code")}
              className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
            />
            <span>
              <span className="font-bold text-k-ink">Code au comptoir</span>
              <span className="block text-xs text-zinc-500">
                Un code à 6 chiffres s&apos;affiche sur un écran au comptoir et
                change régulièrement. Le client le saisit pour participer.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="radio"
              name="validation_mode"
              value="staff"
              checked={mode === "staff"}
              onChange={() => setMode("staff")}
              className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
            />
            <span>
              <span className="font-bold text-k-ink">Validation en caisse</span>
              <span className="block text-xs text-zinc-500">
                Le client présente le QR de sa page jackpot ; vous le scannez en
                caisse pour valider sa participation.
              </span>
            </span>
          </label>
        </fieldset>

        {/* ── Mode de tirage (champs conditionnels) ── */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-k-ink mb-1">
            Comment le jackpot se remporte
          </legend>
          {DRAW_MODES.map((m) => (
            <label
              key={m.value}
              className="flex items-start gap-3 text-sm cursor-pointer"
            >
              <input
                type="radio"
                name="draw_mode"
                value={m.value}
                checked={drawMode === m.value}
                onChange={() => setDrawMode(m.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
              />
              <span>
                <span className="font-bold text-k-ink">{m.label}</span>
                <span className="block text-xs text-zinc-500">
                  {jackpotDrawModeSummary(m.value)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap gap-4">
          <div>
            <Label htmlFor="jackpot-threshold">Objectif de la jauge</Label>
            <Input
              id="jackpot-threshold"
              name="threshold"
              type="number"
              min={1}
              max={1_000_000}
              defaultValue={campaign.threshold}
              className="w-40"
              required
              aria-describedby="jackpot-threshold-help"
            />
            <p id="jackpot-threshold-help" className="mt-1.5 text-xs text-zinc-500">
              {drawMode === "date_draw"
                ? "Nombre de participations affiché comme objectif (le tirage a lieu à la date, pas à l'objectif)."
                : "Nombre de participations à atteindre pour déclencher le jackpot."}
            </p>
          </div>

          {drawMode === "rescan_win" && (
            <div>
              <Label htmlFor="jackpot-winprob">Probabilité de gain (0 à 1)</Label>
              <Input
                id="jackpot-winprob"
                name="win_probability"
                type="number"
                step="0.001"
                min={0}
                max={1}
                defaultValue={campaign.win_probability ?? ""}
                placeholder="Auto"
                className="w-40"
                aria-describedby="jackpot-winprob-help"
              />
              <p id="jackpot-winprob-help" className="mt-1.5 text-xs text-zinc-500">
                Chance qu&apos;une participation gagne une fois le jackpot armé.
                Laissez vide pour la valeur automatique (1 ÷ objectif).
              </p>
            </div>
          )}

          {drawMode === "date_draw" && (
            <div>
              <Label htmlFor="jackpot-drawat">Date et heure du tirage</Label>
              <Input
                id="jackpot-drawat"
                name="draw_at"
                type="datetime-local"
                defaultValue={isoToZonedDateTimeInput(campaign.draw_at, timeZone)}
                className="w-64"
                aria-describedby="jackpot-drawat-help"
              />
              <p id="jackpot-drawat-help" className="mt-1.5 text-xs text-zinc-500">
                Le gagnant est tiré au sort à cette date parmi tous les
                participants. Heure de l&apos;établissement ({timeZone}).
                Obligatoire pour activer en mode « Tirage à date ».
              </p>
            </div>
          )}
        </div>

        {/* ── Rotation du code (mode code tournant) ── */}
        <div>
          <Label htmlFor="jackpot-period">Rotation du code au comptoir</Label>
          <select
            id="jackpot-period"
            name="rotating_period_seconds"
            value={periodSeconds}
            onChange={(e) => setPeriodSeconds(Number(e.target.value))}
            className={`${selectClass} max-w-sm`}
          >
            {periodOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-zinc-500">
            Utilisé uniquement en mode « Code au comptoir » : plus la rotation est
            courte, plus il est difficile de tricher à distance (5 min maximum).
          </p>
          <div className="mt-2 max-w-sm">
            <InfoBulle
              id="aide-jackpot-rotation"
              resume="Pourquoi ce réglage reste visible en « Validation en caisse » ?"
            >
              Parce qu&apos;il est enregistré même quand il ne sert pas : le
              retirer de l&apos;écran ferait échouer l&apos;enregistrement de
              toute la carte. Il reste donc là, sans effet, prêt à servir le jour
              où vous repassez en « Code au comptoir » — et il continue de fixer
              le plancher de la fréquence de participation juste en dessous.
            </InfoBulle>
          </div>
        </div>

        {/* ── Fréquence de participation ── */}
        <div>
          <Label htmlFor="jackpot-cooldown">Fréquence de participation</Label>
          <select
            id="jackpot-cooldown"
            name="min_participation_interval_seconds"
            value={cooldown.value}
            onChange={(e) => setCooldownSeconds(Number(e.target.value))}
            aria-describedby="jackpot-cooldown-help"
            className={`${selectClass} max-w-sm`}
          >
            {cooldown.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div id="jackpot-cooldown-help" className="mt-1.5 space-y-1">
            <p className="text-xs text-zinc-500">
              Anti-abus : empêche un même joueur de participer plusieurs fois trop
              rapidement.
            </p>
            {cooldown.floorSeconds > 0 && (
              <p className="text-xs text-zinc-500">
                {mode === "rotating_code"
                  ? `Le mode « Code au comptoir » impose au moins ${formatDurationLabel(cooldown.floorSeconds)} (le double de la rotation, 5 min minimum) : un code reste valable le temps de deux rotations.`
                  : `Le mode « Validation en caisse » impose au moins ${formatDurationLabel(cooldown.floorSeconds)} : le QR présenté reste scannable quelques minutes.`}
              </p>
            )}
            {cooldown.adjusted && (
              <p role="status" className="text-xs font-semibold text-amber-700">
                Réglage relevé à {formatDurationLabel(cooldown.value)} pour rester
                compatible avec le mode choisi.
              </p>
            )}
          </div>
        </div>

        {/* ── Lot (stock fini OBLIGATOIRE) ── */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-bold text-k-ink">Le lot à gagner</legend>
          <div>
            <Label htmlFor="jackpot-reward-label">Lot</Label>
            <Input
              id="jackpot-reward-label"
              name="reward_label"
              defaultValue={campaign.reward_label}
              maxLength={120}
              placeholder="Ex : Un magnum de champagne"
            />
          </div>
          <div>
            <Label htmlFor="jackpot-reward-details">Détails (optionnel)</Label>
            <textarea
              id="jackpot-reward-details"
              name="reward_details"
              defaultValue={campaign.reward_details ?? ""}
              maxLength={2000}
              rows={2}
              placeholder="Conditions, validité, modalités de retrait…"
              className={textareaClass}
            />
          </div>
          <div>
            <Label htmlFor="jackpot-reward-stock">
              Nombre de gagnants (stock, obligatoire)
            </Label>
            <Input
              id="jackpot-reward-stock"
              name="reward_stock"
              type="number"
              min={0}
              max={1_000_000}
              defaultValue={campaign.reward_stock}
              required
              aria-describedby="jackpot-reward-stock-help"
              className="w-40"
            />
            <p id="jackpot-reward-stock-help" className="mt-1.5 text-xs text-zinc-500">
              Ce nombre plafonne les gagnants : chaque cycle gagné le décompte,
              et au-delà plus aucun tirage n&apos;a lieu. C&apos;est ce qui borne
              votre engagement, quel que soit le nombre de participants (0 =
              épuisé / en pause).
            </p>
          </div>
          <CodeTtlDaysField
            idPrefix="jackpot"
            value={codeTtlDays}
            onChange={setCodeTtlDays}
            emissionHint="Délai laissé au gagnant pour présenter son code JACKPOT- en caisse, à partir du TIRAGE qui l'a désigné."
          />
        </fieldset>

        {/* ── Montant d'affichage (euros) ── */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-bold text-k-ink">
            Montant d&apos;affichage
          </legend>
          <p className="text-xs text-zinc-500">
            Un compteur « cagnotte » qui chauffe la salle : il monte à chaque
            participation. Purement visuel — le vrai lot reste celui ci-dessus.
          </p>
          <div className="flex flex-wrap gap-4">
            <div>
              <Label htmlFor="jackpot-display-base">Montant de départ (€)</Label>
              <Input
                id="jackpot-display-base"
                name="display_base"
                type="number"
                step="0.01"
                min={0}
                defaultValue={centsToEuros(campaign.display_base_cents)}
                className="w-40"
              />
            </div>
            <div>
              <Label htmlFor="jackpot-display-increment">
                Ajout par participation (€)
              </Label>
              <Input
                id="jackpot-display-increment"
                name="display_increment"
                type="number"
                step="0.01"
                min={0}
                defaultValue={centsToEuros(campaign.display_increment_cents)}
                className="w-40"
              />
            </div>
          </div>
        </fieldset>

        {/* ── Contenu commerçant (page publique) ── */}
        <div>
          <Label htmlFor="jackpot-merchant-content">
            Vos actualités sur la page (optionnel)
          </Label>
          <textarea
            id="jackpot-merchant-content"
            name="merchant_content"
            defaultValue={campaign.merchant_content ?? ""}
            maxLength={4000}
            rows={4}
            placeholder="Offres du moment, soirées à venir, horaires… Ce texte s'affiche sur la page suivie par vos clients."
            className={textareaClass}
          />
        </div>

        {/* ── URL publique (PRÉ-REMPLIE : un save sans ce champ la viderait) ── */}
        <div>
          <Label htmlFor="jackpot-slug">URL publique (optionnel)</Label>
          <div className="flex flex-wrap items-center gap-1 text-sm text-zinc-500">
            <span className="font-mono">…/jackpot/</span>
            <Input
              id="jackpot-slug"
              name="public_slug"
              defaultValue={campaign.public_slug ?? ""}
              maxLength={64}
              pattern="[a-z0-9-]{3,64}"
              placeholder="mon-jackpot"
              className="w-56 font-mono"
              aria-describedby="jackpot-slug-help"
            />
          </div>
          <p id="jackpot-slug-help" className="mt-1.5 text-xs text-zinc-500">
            Une adresse lisible pour le QR et le partage (3 à 64 caractères :
            a-z, 0-9, tirets). Laissée vide, une adresse est générée à
            l&apos;activation.
          </p>
          <div className="mt-2 max-w-md">
            <InfoBulle
              id="aide-jackpot-url"
              resume="Puis-je la changer une fois mes QR imprimés ?"
            >
              Non sans conséquence : le QR encode l&apos;adresse telle
              qu&apos;elle était à l&apos;impression. La changer laisse les
              affiches déjà collées en vitrine pointer sur une adresse qui
              n&apos;existe plus. Fixez-la maintenant, imprimez ensuite.
            </InfoBulle>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "…" : "Enregistrer"}
          </Button>
          {state?.ok && (
            <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
          )}
          {/* Quinze champs, dont plusieurs requis : sans cette ligne, un nom
              vidé arrêterait TOUT l'enregistrement automatique de la carte en
              silence, et le reste semblerait pourtant se sauver tout seul. */}
          <AutoSaveEtat
            enAttente={enAttente}
            bloqueParValidation={bloqueParValidation}
            messageBloque="Non enregistré : un champ de la carte est vide ou mal rempli."
          />
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Statut (activer / archiver) + suppression
// ────────────────────────────────────────────────────────────

export function JackpotStatusControls({ campaign }: { campaign: JackpotCampaign }) {
  // useActionForm et non useActionState : l'état de chargement doit retomber
  // même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
  // Champs exclusivement cachés (id + status) : rien ne dépend ici du reset
  // automatique de React 19. La bascule Ouvrir ↔ Clôturer et le badge « Ouverte
  // ligne » suivent `campaign.status`, donc le rafraîchissement — lequel a
  // été mesuré défaillant depuis, d'où `reloadOnSuccess` ci-dessous.
  const {
    state: statusState,
    pending: statusPending,
    onSubmit: statusSubmit,
  } = useActionForm(setJackpotCampaignStatus, {
    // `reloadOnSuccess` : le badge d'état et la carte « Page publique »
    // suivent la prop serveur, donc le rafraîchissement — mesuré défaillant
    // (docs/bugs.md). Le geste est idempotent, mais l'écran affirmerait le
    // CONTRAIRE de l'état réel d'une page ouverte aux clients.
    reloadOnSuccess: true,
    networkError: "Changement de statut impossible, réessayez.",
  });
  // Suppression NON migrée : l'action se termine par un `redirect()`, dont
  // l'exception serait interceptée par le try/catch de useActionForm et
  // affichée en erreur ALORS QUE la campagne est déjà supprimée.
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteJackpotCampaign,
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Card>
      <h2 className="font-semibold mb-4">Statut de la campagne</h2>

      <div className="flex flex-wrap items-center gap-3">
        {campaign.status !== "active" ? (
          <form onSubmit={statusSubmit}>
            <input type="hidden" name="id" value={campaign.id} />
            <input type="hidden" name="status" value="active" />
            <Button type="submit" disabled={statusPending}>
              {statusPending ? "…" : "Ouvrir aux joueurs"}
            </Button>
          </form>
        ) : (
          <form onSubmit={statusSubmit}>
            <input type="hidden" name="id" value={campaign.id} />
            <input type="hidden" name="status" value="archived" />
            <Button type="submit" variant="secondary" disabled={statusPending}>
              {statusPending ? "…" : "Clôturer"}
            </Button>
          </form>
        )}

        {campaign.status === "active" && (
          <span className="rounded-full border-2 border-k-ink bg-k-green/40 px-3 py-1 text-xs font-black text-k-ink">
            Ouverte aux joueurs — la page jackpot est accessible aux clients
          </span>
        )}
      </div>

      {/* Ce paragraphe ÉNUMÉRAIT les préconditions sans en calculer aucune :
          le composant ne reçoit que la campagne, et le commerçant découvrait ce
          qui manquait après avoir cliqué, un refus à la fois. L'étape « La
          vérification » de l'atelier les calcule toutes, sur le même module que
          celui qu'oppose le serveur — on y renvoie plutôt que de réciter. */}
      {campaign.status !== "active" && (
        <p className="mt-3 text-sm text-zinc-500">
          Pour activer : un lot, un stock d&apos;au moins 1 gagnant, un objectif
          ≥ 1, et (en mode « Tirage à date ») une date future.{" "}
          <Link
            href={hrefEtapeJackpot(campaign.id, "verification")}
            className="font-bold text-k-ink underline underline-offset-2"
          >
            Voir ce qu&apos;il manque
          </Link>
        </p>
      )}
      <FieldError
        message={statusState && !statusState.ok ? statusState.error : undefined}
      />

      <div className="mt-5 border-t border-zinc-100 pt-4">
        {confirmDelete ? (
          <form action={deleteAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={campaign.id} />
            <span className="text-sm text-k-body">
              Supprimer ce jackpot, ses participations et ses gains ?
            </span>
            <Button type="submit" variant="danger" disabled={deletePending}>
              {deletePending ? "Suppression…" : "Confirmer"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={deletePending}
            >
              Annuler
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
          >
            Supprimer le jackpot
          </Button>
        )}
        <FieldError
          message={deleteState && !deleteState.ok ? deleteState.error : undefined}
        />
      </div>
    </Card>
  );
}
