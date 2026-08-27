"use client";

import { useRef, useState } from "react";
import {
  deleteContest,
  finalizeContest,
  setContestAwardStatus,
  updateContest,
  updateContestEventSettings,
  updateContestGenericScoring,
  updateContestRewards,
  updateContestScoring,
  updateContestTiebreaker,
} from "@/actions/pronostics";
import type {
  ContestQuestionType,
  ContestReward,
  ContestScoring,
} from "@/lib/pronostics";
import { isoToZonedDateTimeInput } from "@/lib/date-time";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import { AutoSaveEtat } from "@/components/dashboard/auto-save-etat";
import { Card } from "@/components/ui/card";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { CarteStatutAnimation } from "@/components/dashboard/carte-statut-animation";
import { ContestStatusBadge } from "@/components/dashboard/contest-status";
import { RaccourciAtelier, VoirLeJeu } from "@/components/dashboard/atelier-raccourci";
import { hrefEtapeContest } from "@/components/dashboard/atelier-contest-etapes";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  EVENT_KINDS,
  eventKindLabel,
  getEventKind,
} from "@/components/dashboard/contest-event-kinds";
import {
  CONTEST_THEME_ORDER,
  contestThemeTokens,
} from "@/components/pronos/contest-theme";
import { FondEcran } from "@/components/ui/fond-ecran";
import { fondPourTheme } from "@/lib/fonds-ecran";
import type {
  Contest,
  ContestAward,
  ContestStatus,
  SeasonalTheme,
} from "@/types/database";

const STATUS_ACTIONS: Array<{
  from: ContestStatus[];
  to: ContestStatus;
  label: string;
  /** La RPC exige un motif journalisé pour cette transition. */
  needsReason?: boolean;
}> = [
  // Vocabulaire commun aux huit modules (voir components/ui/status-badge.tsx) :
  // on ouvre AUX JOUEURS, on clôture — jamais « on marque terminé ».
  { from: ["draft"], to: "active", label: "Ouvrir aux joueurs" },
  { from: ["active"], to: "finished", label: "Clôturer" },
  {
    from: ["finished"],
    to: "active",
    label: "Rouvrir aux joueurs",
    needsReason: true,
  },
];

/**
 * Bandeau commun : règlement verrouillé → toute correction est motivée.
 *
 * EXPORTÉ parce que la vue SUIVI le rend elle aussi, en tête de la porte de
 * l'atelier : c'est là que le commerçant se demande pourquoi les étapes lui
 * réclament un motif, ou pourquoi elles ne s'enregistrent plus du tout.
 */
export function LockedNotice({ finalized }: { finalized: boolean }) {
  if (finalized) {
    return (
      <p className="mb-3 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
        🔒 Championnat clôturé : règlement et classement sont définitifs.
      </p>
    );
  }
  return (
    <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
      🔒 Le jeu a commencé : toute modification exige un motif, journalisé et
      visible dans l&apos;audit.
    </p>
  );
}

/**
 * HUIT DES NEUF PETITS FORMULAIRES DE CE FICHIER S'ENREGISTRENT SEULS.
 *
 * Aucun d'eux n'affichait quoi que ce soit en cas de succès : le toast global
 * (`toastOnSuccess`) et le `<AutoSaveEtat>` posé sous chacun sont leur tout
 * premier retour. Les boutons RESTENT — l'enregistrement automatique n'est pas
 * un remplacement, c'est un filet.
 *
 * L'exception est `ContestEventCard` : voir son en-tête, elle porte le seul
 * champ dont un état transitoire vide EFFACE en base.
 *
 * Deux autres exclusions, plus locales : un formulaire CLÔTURÉ (`finalized`)
 * n'a plus de bouton, donc plus aucun chemin d'écriture ; un formulaire
 * VERROUILLÉ (`locked`) réclame un motif journalisé de dix caractères, qui se
 * tape d'un trait et non par tranches de 800 ms. Les deux se disent par
 * `useAutoSave(ref, { actif })`.
 */

/** Champ motif (min. 10 caractères — même règle que la base). */
function ReasonInput({ id }: { id: string }) {
  return (
    <div>
      <Label htmlFor={id}>Motif de la correction (journalisé)</Label>
      <Input
        id={id}
        name="reason"
        required
        minLength={10}
        maxLength={300}
        placeholder="Ex : erreur de saisie signalée par les joueurs"
      />
    </div>
  );
}

/**
 * LE GESTE DE PUBLICATION, AU MÊME ENDROIT QUE SUR LES SEPT AUTRES MODULES.
 *
 * Il vivait dans la carte « Réglages », tout en bas de la page — après les
 * matchs, les questions, le classement, le palmarès, le barème et les lots.
 * Ouvrir son championnat demandait donc de faire défiler six blocs. Il remonte
 * juste sous la Carte de l'Aventure ; « Réglages » garde le renommage, les
 * données demandées à l'inscription et la suppression.
 */
/** Ce qui est vrai maintenant — les trois états du championnat, côté client. */
const PHRASE_ETAT: Record<ContestStatus, string> = {
  draft:
    "Vos clients ne peuvent pas encore pronostiquer : la page du championnat n'est pas ouverte.",
  active: "La page du championnat est accessible à vos clients.",
  finished:
    "Le championnat est clôturé : plus aucun pronostic n'est pris, et les codes déjà gagnés restent retirables.",
};

export function ContestStatusControls({
  contest,
  hrefJeu = null,
}: {
  contest: Contest;
  /** Page publique du championnat, `null` tant qu'il est en brouillon. */
  hrefJeu?: string | null;
}) {
  const { state: statusState, pending: statusPending, onSubmit: statusSubmit } =
    useActionForm(updateContest, {
      // `reloadOnSuccess` : la pastille de statut et la liste des transitions
      // offertes sont TOUTES deux dérivées de `contest.status`, et le succès
      // n'affiche rien. Le commerçant ouvrait son championnat — /pronos/<slug>
      // est revalidé dans la foulée, les joueurs s'inscrivent — et son écran
      // continuait d'afficher « Brouillon », donc il ne diffusait pas le lien.
      // Pire à l'envers : « Clôturer » ferme les pronostics côté joueur pendant
      // que le tableau de bord dit « Ouverte aux joueurs ». Le re-clic ne le
      // détrompe pas, la RPC étant idempotente.
      reloadOnSuccess: true,
    });

  const finalized = contest.finalized_at !== null;
  // Un championnat clôturé ne change plus de statut (la RPC le refuse
  // aussi — ceci évite juste de proposer un bouton voué à l'échec).
  const transitions = finalized
    ? []
    : STATUS_ACTIONS.filter((a) => a.from.includes(contest.status));

  return (
    <CarteStatutAnimation
      titre="Statut du championnat"
      badge={<ContestStatusBadge status={contest.status} />}
      phrase={PHRASE_ETAT[contest.status] ?? PHRASE_ETAT.draft}
      actions={transitions.map((t) => (
        <form key={t.to} onSubmit={statusSubmit} className="flex items-end gap-2">
          <input type="hidden" name="id" value={contest.id} />
          <input type="hidden" name="status" value={t.to} />
          {t.needsReason && (
            <div className="max-w-xs">
              <ReasonInput id={`status-reason-${t.to}`} />
            </div>
          )}
          <Button
            type="submit"
            variant={t.to === "active" ? "primary" : "secondary"}
            disabled={statusPending}
          >
            {t.label}
          </Button>
        </form>
      ))}
      raccourcis={
        <>
          <RaccourciAtelier href={hrefEtapeContest(contest.id, "championnat")} />
          <VoirLeJeu href={hrefJeu} />
        </>
      }
      notes={
        /* La clôture est DÉFINITIVE : la date le dit, et c'est la seule note
           que ce module ait jamais eue. Elle passe sous la rangée, comme les
           conséquences des sept autres modules. */
        finalized ? (
          <p className="mt-2 text-xs font-bold text-k-body">
            🔒 Championnat clôturé le{" "}
            {new Date(contest.finalized_at!).toLocaleDateString("fr-FR")} —
            statut définitif.
          </p>
        ) : null
      }
      erreur={statusState && !statusState.ok ? statusState.error : undefined}
    />
  );
}

/**
 * ÉTAPE 1 DE L'ATELIER — « Le championnat ».
 *
 * TROIS formulaires côte à côte, et surtout PAS un seul : ils appellent bien la
 * même action (`updateContest`, le seul schéma de mise à jour PARTIELLE du
 * dépôt), mais les fusionner aurait un coût invisible. Le portier caché
 * `collection_settings=1` est ce qui autorise l'écriture des deux booléens de
 * collecte EN BLOC — une case non rendue vaut `false` en FormData, exactement
 * comme une case décochée. Le supprimer par simplification réécrirait
 * `collect_email`/`collect_phone` à `false` à chaque renommage.
 *
 * Ce n'est donc pas un champ inter-étapes : c'est un PORTIER, et il reste dans
 * le formulaire dont il ouvre l'écriture.
 */
/**
 * Sélecteur de thème saisonnier — MÊME patron que celui du calendrier
 * (`calendar-editor.tsx`) : six vignettes, la valeur retenue voyage dans un
 * champ caché contrôlé, et chaque vignette rend le VRAI décor du thème.
 *
 * Son propre formulaire, comme le renommage et la collecte : `updateContest`
 * est une mise à jour PARTIELLE, un champ non soumis n'est pas touché.
 *
 * `contestThemeTokens` normalise la valeur de départ — la colonne peut ne pas
 * encore être servie par la requête du dashboard, auquel cas on démarre sur
 * `neutre` plutôt que sur `undefined`, qui ne cocherait aucune vignette.
 */
function ThemeSelector({ contest }: { contest: Contest }) {
  const { state, pending, onSubmit } = useActionForm(updateContest, {
    toastOnSuccess: "Enregistré.",
  });
  const formRef = useRef<HTMLFormElement>(null);
  const autoSave = useAutoSave(formRef);
  const [theme, setTheme] = useState<SeasonalTheme>(
    () => contestThemeTokens(contest.theme).key,
  );

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="mt-5 border-t border-zinc-100 pt-4"
    >
      <input type="hidden" name="id" value={contest.id} />
      <input type="hidden" name="theme" value={theme} />
      <fieldset>
        <legend className="mb-1 text-sm font-bold text-k-ink">
          Thème saisonnier
        </legend>
        <p className="mb-3 text-xs text-zinc-500">
          Change les couleurs et les dessins de fond de la page suivie par vos
          joueurs — la DA « carton kermesse » reste la même.
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {CONTEST_THEME_ORDER.map((key) => {
            const tokens = contestThemeTokens(key);
            const fond = fondPourTheme(key);
            const active = key === theme;
            return (
              <label
                key={key}
                className={`cursor-pointer rounded-2xl border-2 p-2.5 transition-colors ${
                  active
                    ? "border-k-ink bg-k-yellow/20 shadow-[3px_3px_0_var(--color-k-ink)]"
                    : "border-k-ink/20 bg-white hover:border-k-ink/50"
                }`}
              >
                <input
                  type="radio"
                  name="theme-choice"
                  value={key}
                  checked={active}
                  onChange={() => setTheme(key)}
                  className="sr-only"
                />
                <div
                  aria-hidden
                  className="relative mb-2 flex items-center gap-1.5 overflow-hidden rounded-lg border-2 border-k-ink p-1.5"
                  style={tokens.pageStyle}
                >
                  {/* Le fond d'écran du thème, quand il en a un : la vignette
                      montre au commerçant l'image que verra son client.
                      Premier enfant, donc SOUS les pastilles — ordre du DOM,
                      aucun z-index. */}
                  {fond && <FondEcran fond={fond} variant="vignette" />}
                  <span
                    className={`relative flex h-7 w-7 items-center justify-center rounded-md text-sm ${tokens.accentChip}`}
                  >
                    {tokens.titleEmoji}
                  </span>
                  <span
                    className={`relative h-2 flex-1 rounded-full ${tokens.progressFill}`}
                  />
                </div>
                <p className="flex items-center justify-between text-sm font-black text-k-ink">
                  <span>{tokens.label}</span>
                  {active && <span className="text-k-green">✓</span>}
                </p>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Button
        type="submit"
        variant="secondary"
        className="mt-3"
        disabled={pending}
      >
        {pending ? "…" : "Enregistrer le thème"}
      </Button>
      <AutoSaveEtat {...autoSave} />
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

export function ContestIdentityCard({ contest }: { contest: Contest }) {
  const { state: renameState, pending: renamePending, onSubmit: renameSubmit } = useActionForm(updateContest, { toastOnSuccess: "Enregistré." });
  const { state: collectState, pending: collectPending, onSubmit: collectSubmit } = useActionForm(updateContest, { toastOnSuccess: "Enregistré." });
  const renameFormRef = useRef<HTMLFormElement>(null);
  const renameAutoSave = useAutoSave(renameFormRef);
  const collectFormRef = useRef<HTMLFormElement>(null);
  const collectAutoSave = useAutoSave(collectFormRef);

  return (
    <Card>
      <h2 className="font-semibold mb-1">Le championnat</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Son nom, ce que vous demandez à vos clients en s&apos;inscrivant,
        l&apos;habillage de leur page, et combien de temps leur code de retrait
        reste valable.
      </p>

      <form
        ref={renameFormRef}
        onSubmit={renameSubmit}
        className="flex items-end gap-2"
      >
        <input type="hidden" name="id" value={contest.id} />
        <div className="flex-1 max-w-xs">
          <Label htmlFor="contest-name">Nom du championnat</Label>
          <Input
            id="contest-name"
            name="name"
            defaultValue={contest.name}
            required
            maxLength={120}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={renamePending}>
          {renamePending ? "…" : "Renommer"}
        </Button>
      </form>
      <AutoSaveEtat {...renameAutoSave} />
      <FieldError
        message={renameState && !renameState.ok ? renameState.error : undefined}
      />

      <form
        ref={collectFormRef}
        onSubmit={collectSubmit}
        className="mt-5 border-t border-zinc-100 pt-4"
      >
        <input type="hidden" name="id" value={contest.id} />
        <input type="hidden" name="collection_settings" value="1" />
        <p className="text-sm font-bold text-k-ink mb-2">
          Données demandées à l&apos;inscription
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-k-body">
            <input
              type="checkbox"
              name="collect_email"
              defaultChecked={contest.collect_email}
              className="h-4 w-4 accent-k-ink"
            />
            Email
          </label>
          <label className="flex items-center gap-2 text-sm text-k-body">
            <input
              type="checkbox"
              name="collect_phone"
              defaultChecked={contest.collect_phone}
              className="h-4 w-4 accent-k-ink"
            />
            Téléphone
          </label>
          <Button type="submit" variant="secondary" disabled={collectPending}>
            {collectPending ? "…" : "Enregistrer"}
          </Button>
        </div>
        <AutoSaveEtat {...collectAutoSave} />
        <FieldError
          message={collectState && !collectState.ok ? collectState.error : undefined}
        />
      </form>

      <ThemeSelector contest={contest} />

      <CodeExpirySection contest={contest} />
    </Card>
  );
}

/**
 * La suppression du championnat — geste de FIN DE VIE, jamais une étape de
 * préparation. Elle reste sur la vue suivi, à côté du statut : c'est là qu'on
 * décide du sort d'une animation, pas au milieu d'un atelier qui invite à
 * avancer.
 */
export function ContestDangerZone({ contest }: { contest: Contest }) {
  const { state: deleteState, pending: deletePending, onSubmit: deleteSubmit } = useActionForm(deleteContest);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Card>
      <div>
        {confirmDelete ? (
          <form onSubmit={deleteSubmit} className="flex items-center gap-2">
            <input type="hidden" name="id" value={contest.id} />
            <span className="text-sm text-k-body">
              Supprimer ce championnat, ses matchs et tous les pronostics ?
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
            Supprimer le championnat
          </Button>
        )}
        <FieldError
          message={deleteState && !deleteState.ok ? deleteState.error : undefined}
        />
      </div>
    </Card>
  );
}

/** Un jour, en secondes : l'UI parle en JOURS, la base en secondes. */
const SECONDS_PER_DAY = 86_400;
/** Bornes du CHECK SQL (3 600 s → 7 776 000 s), ramenées à des jours entiers. */
const CODE_TTL_MIN_DAYS = 1;
const CODE_TTL_MAX_DAYS = 90;

/**
 * Secondes → durée lisible (« 1 h », « 1 j 12 h », « 90 min »). Sert
 * uniquement à MONTRER une valeur que le champ en jours ne sait pas saisir.
 */
function formatTtlSeconds(total: number): string {
  const parts: string[] = [];
  const days = Math.floor(total / SECONDS_PER_DAY);
  const hours = Math.floor((total % SECONDS_PER_DAY) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  if (days > 0) parts.push(`${days} j`);
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (seconds > 0) parts.push(`${seconds} s`);
  return parts.length > 0 ? parts.join(" ") : "0 s";
}

/**
 * Expiration des codes de retrait (PRONO-…) présentés en caisse.
 *
 * Le réglage vit en SECONDES en base, mais se saisit en JOURS : un commerçant
 * raisonne en « une semaine pour venir chercher son lot », pas en 604 800
 * secondes. Vide = pas d'expiration (valeur légitime, d'où le champ caché
 * présent dès que le champ est saisissable : côté serveur,
 * `formData.has('code_ttl_seconds')` seul distingue « efface » de
 * « ne touche pas »).
 *
 * INVARIANT : le formulaire ne réécrit JAMAIS une valeur qu'il ne sait pas
 * représenter. Le CHECK SQL accepte toute durée dès 3 600 s (1 h) ; posée par
 * API ou en SQL direct, une valeur qui n'est pas un multiple exact de 86 400
 * s'afficherait arrondie en jours et serait écrasée au premier
 * « Enregistrer » (1 h → 24 h, sans que le commerçant l'ait demandé). Dans ce
 * cas on passe donc en LECTURE SEULE : valeur réelle en clair, ni champ, ni
 * champ caché, ni bouton — rien n'est soumis, la base est préservée.
 *
 * L'échéance est figée À L'ÉMISSION sur chaque lot : la modifier n'affecte
 * que les championnats clôturés ensuite, jamais les codes déjà distribués.
 */
function CodeExpirySection({ contest }: { contest: Contest }) {
  const { state, pending, onSubmit } = useActionForm(updateContest, {
    toastOnSuccess: "Enregistré.",
  });
  const formRef = useRef<HTMLFormElement>(null);
  const stored = contest.code_ttl_seconds;
  // Seul un multiple EXACT de 86 400, dans les bornes du champ, se laisse
  // écrire en jours entiers sans perte.
  const storedDays =
    stored !== null && stored % SECONDS_PER_DAY === 0
      ? stored / SECONDS_PER_DAY
      : null;
  const editable =
    stored === null ||
    (storedDays !== null &&
      storedDays >= CODE_TTL_MIN_DAYS &&
      storedDays <= CODE_TTL_MAX_DAYS);
  const [days, setDays] = useState(() =>
    storedDays === null ? "" : String(storedDays),
  );
  /**
   * L'ENREGISTREMENT AUTOMATIQUE S'ÉTEINT AVEC LE CHAMP.
   *
   * En lecture seule, il n'y a ni formulaire, ni champ caché, ni bouton :
   * l'invariant ci-dessus dit que RIEN ne doit être soumis, sous peine
   * d'écraser une durée que ce formulaire ne sait pas représenter. Un
   * enregistrement automatique actif serait précisément la façon de le trahir
   * sans qu'un clic ait eu lieu.
   */
  const autoSave = useAutoSave(formRef, { actif: editable });

  const trimmed = days.trim();
  const parsed = Number(trimmed);
  const seconds =
    trimmed === "" || !Number.isFinite(parsed)
      ? ""
      : String(Math.round(parsed) * SECONDS_PER_DAY);

  return (
    <div className="mt-5 border-t border-zinc-100 pt-4">
      <p className="text-sm font-bold text-k-ink mb-1">
        Expiration des codes de retrait
      </p>
      <p id="contest-code-ttl-help" className="text-xs text-zinc-500 mb-2">
        Délai laissé au gagnant pour présenter son code en caisse, à partir de
        la clôture du championnat. Les codes déjà émis gardent leur échéance.
      </p>
      {editable ? (
        <form ref={formRef} onSubmit={onSubmit}>
          <input type="hidden" name="id" value={contest.id} />
          <input type="hidden" name="code_ttl_seconds" value={seconds} />
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-32">
              <Label htmlFor="contest-code-ttl">Validité (jours)</Label>
              <Input
                id="contest-code-ttl"
                type="number"
                inputMode="numeric"
                min={CODE_TTL_MIN_DAYS}
                max={CODE_TTL_MAX_DAYS}
                step={1}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                placeholder="Sans limite"
                aria-describedby="contest-code-ttl-help contest-code-ttl-bounds"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "…" : "Enregistrer"}
            </Button>
          </div>
          <p id="contest-code-ttl-bounds" className="mt-1 text-xs text-zinc-500">
            Laisser vide = pas d&apos;expiration ; sinon entre{" "}
            {CODE_TTL_MIN_DAYS} et {CODE_TTL_MAX_DAYS} jours.
          </p>
          <AutoSaveEtat {...autoSave} />
          <FieldError message={state && !state.ok ? state.error : undefined} />
        </form>
      ) : (
        <div className="w-fit">
          <p className="text-sm font-bold text-k-ink mb-1">Validité actuelle</p>
          <p className="rounded-xl border-2 border-zinc-300 bg-zinc-100 px-3.5 py-2.5 text-sm text-zinc-600">
            {formatTtlSeconds(stored!)}
          </p>
          <p className="mt-1 max-w-md text-xs text-zinc-500">
            🔒 Réglée hors interface. Ce formulaire ne sait saisir que des
            jours entiers ({CODE_TTL_MIN_DAYS} à {CODE_TTL_MAX_DAYS}) : il
            écraserait cette durée en l&apos;enregistrant, il est donc
            désactivé. Contactez le support pour la modifier.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Réglages de l'événement : modèle (`event_kind`) et verrouillage par
 * défaut appliqué aux questions GÉNÉRIQUES sans échéance propre — les
 * matchs importés (type `score`) l'ignorent, voir `effectiveLocksAt`.
 *
 * Le MODÈLE se fige dès le premier pronostic/coup d'envoi (les joueurs
 * ont déjà vu l'habillage) : le sélecteur est alors désactivé — et un
 * champ désactivé n'est pas soumis, ce qui vaut « ne change pas » pour la
 * RPC. La DATE reste ajustable (événement reporté) avec motif journalisé.
 *
 * L'effacement de la date est explicite (case à cocher) : un champ vide
 * vaut « efface » côté serveur, jamais par accident depuis l'UI.
 *
 * ── CORRECTIF : « Enregistrer l'événement » N'EFFACE PLUS LA DATE ──
 *
 * La phrase ci-dessus décrivait une intention que le code ne tenait pas.
 * `locksLocal` démarrait à `""` et l'input `datetime-local` était NON CONTRÔLÉ,
 * donc vide au montage : le champ caché partait à `""`, l'action traduisait
 * `""` en `null`, et la RPC écrit `default_locks_at` SANS CONDITION
 * (`update contests set … default_locks_at = p_default_locks_at`). Résultat :
 * sur un championnat portant déjà une date, changer le seul modèle — ou même
 * n'enregistrer que pour confirmer — SUPPRIMAIT le verrouillage par défaut,
 * donc rouvrait toutes les questions qui s'y appuyaient.
 *
 * Le champ démarre désormais sur la valeur ACTUELLE de la base et il est
 * contrôlé : ne rien toucher reposte l'existant, et l'effacement redevient ce
 * que la case à cocher dit qu'il est — explicite. (La minute est la précision
 * native de `datetime-local` : une date posée en SQL avec des secondes non
 * nulles serait tronquée à la minute en repassant par ce formulaire. C'est
 * strictement mieux que de l'effacer.)
 *
 * ── AUCUN ENREGISTREMENT AUTOMATIQUE ICI, ET C'EST DÉLIBÉRÉ ──
 *
 * Les huit autres petits formulaires de ce fichier s'enregistrent tout seuls.
 * Celui-ci reste 100 % manuel : il porte le seul champ du dépôt dont un état
 * transitoire VIDE vaut « efface » côté RPC — l'incident raconté juste
 * au-dessus. Un `datetime-local` passe par des valeurs incomplètes pendant
 * qu'on le saisit (« 12/0 »), et un débounce de 800 ms tombe pile dedans : la
 * date effacée, toutes les questions rouvertes, sans un clic. Le bouton est la
 * garantie que l'écriture est voulue. Ne pas « harmoniser » sans avoir d'abord
 * rendu la RPC conditionnelle.
 */
export function ContestEventCard({
  contest,
  locked,
  timeZone,
}: {
  contest: Contest;
  locked: boolean;
  timeZone: string;
}) {
  const { state, pending, onSubmit } = useActionForm(updateContestEventSettings);
  const finalized = contest.finalized_at !== null;
  const current = contest.default_locks_at;
  // LA valeur de départ : celle qui est en base, jamais la chaîne vide.
  const initialLocal = isoToZonedDateTimeInput(current, timeZone);
  const [locksLocal, setLocksLocal] = useState(initialLocal);
  const [clearLocks, setClearLocks] = useState(false);
  const kindFrozen = locked || finalized;
  // Le football est le seul modèle à porter des matchs importés (questions
  // de type `score`) : leur échéance reste le coup d'envoi, JAMAIS le
  // verrouillage par défaut — sans quoi un report de calendrier fermerait
  // les pronostics trop tôt. Le champ garde du sens sur ce modèle (les
  // questions ajoutées à la main s'y appuient), mais il est accompagné de
  // sa limite explicite plutôt que de laisser croire à un effet global.
  const usesCompetition = getEventKind(contest.event_kind)?.usesCompetition ?? false;

  // Rien à envoyer : la date est celle d'origine, et aucun effacement demandé.
  const dateUnchanged = locksLocal === initialLocal && !clearLocks;

  return (
    <Card>
      <h2 className="font-semibold mb-1">L&apos;événement et son verrouillage</h2>
      <p className="text-sm text-zinc-500 mb-4">
        {usesCompetition
          ? "Le modèle pilote l'habillage du parcours joueur. Le verrouillage par défaut ne concerne que les questions ajoutées à la main, sans échéance propre."
          : "Le modèle pilote l'habillage du parcours joueur. Le verrouillage par défaut s'applique aux questions qui n'ont pas leur propre échéance."}
      </p>
      {(locked || finalized) && <LockedNotice finalized={finalized} />}
      <form onSubmit={onSubmit}>
      <input type="hidden" name="id" value={contest.id} />
      <input
        type="hidden"
        name="default_locks_at"
        value={clearLocks ? "" : locksLocal}
      />
      <div className="space-y-3">
        <div>
          <Label htmlFor="event-kind">Type d&apos;événement</Label>
          {kindFrozen ? (
            <>
              <p className="rounded-xl border-2 border-zinc-300 bg-zinc-100 px-3.5 py-2.5 text-sm text-zinc-600">
                {eventKindLabel(contest.event_kind)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                🔒 Figé — {finalized ? "championnat clôturé." : "le jeu a commencé."}
              </p>
            </>
          ) : (
            <select
              id="event-kind"
              name="event_kind"
              defaultValue={contest.event_kind}
              className="w-full max-w-xs rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
            >
              {/* Un modèle posé hors catalogue reste sélectionnable. */}
              {!EVENT_KINDS.some((k) => k.key === contest.event_kind) && (
                <option value={contest.event_kind}>{contest.event_kind}</option>
              )}
              {EVENT_KINDS.map((kind) => (
                <option key={kind.key} value={kind.key}>
                  {kind.icon} {kind.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <Label htmlFor="event-default-locks">
            Verrouillage par défaut
          </Label>
          {usesCompetition && (
            <p
              id="event-default-locks-scope"
              className="mb-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              ⚠️ Ne s&apos;applique pas aux matchs : chacun ferme à son coup
              d&apos;envoi, reports de calendrier compris. Cette date ne vaut
              que pour les questions ajoutées à la main.
            </p>
          )}
          <p className="mb-1.5 text-xs text-zinc-500">
            Actuel :{" "}
            {current
              ? new Intl.DateTimeFormat("fr-FR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone,
                }).format(new Date(current))
              : "aucun"}
          </p>
          <Input
            id="event-default-locks"
            type="datetime-local"
            className="max-w-xs"
            aria-describedby={
              usesCompetition ? "event-default-locks-scope" : undefined
            }
            disabled={finalized || clearLocks}
            // CONTRÔLÉ, et pré-rempli avec la valeur en base : ne rien toucher
            // reposte l'existant au lieu de l'effacer.
            value={locksLocal}
            onChange={(e) => {
              const value = e.target.value;
              setLocksLocal(value);
            }}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Heure de l&apos;établissement ({timeZone}).
          </p>
          {current && !finalized && (
            <label className="mt-2 flex items-center gap-2 text-sm text-k-body">
              <input
                type="checkbox"
                checked={clearLocks}
                onChange={(e) => setClearLocks(e.target.checked)}
                className="h-4 w-4 accent-k-ink"
              />
              Supprimer la date de verrouillage par défaut
            </label>
          )}
        </div>

        {locked && !finalized && <ReasonInput id="event-reason" />}
        {!finalized && (
          <Button
            type="submit"
            variant="secondary"
            disabled={pending || (kindFrozen && dateUnchanged)}
          >
            {pending ? "…" : "Enregistrer l'événement"}
          </Button>
        )}
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>

      <InfoBulle
        id="aide-verrouillage-pronostics"
        resume="À quoi sert le verrouillage par défaut ?"
        className="mt-4"
      >
        C&apos;est l&apos;heure à laquelle se ferment les questions que vous
        ajoutez à la main sans leur donner d&apos;échéance propre : passé ce
        moment, plus personne ne peut répondre ni modifier son pronostic. Les
        matchs importés l&apos;ignorent — chacun ferme à son coup d&apos;envoi,
        reports compris. Laisser ce champ vide n&apos;interdit rien : chaque
        question porte alors sa propre date.
      </InfoBulle>
    </Card>
  );
}

/**
 * Question subsidiaire : départage les ex æquo (écart absolu à la
 * réponse officielle). La question se fige au premier pronostic ; la
 * réponse reste saisissable jusqu'à la clôture.
 *
 * LES DEUX CHAMPS SONT RENDUS ENSEMBLE, et ce n'est pas un choix de mise en
 * page : `update_contest_tiebreaker` écrit les DEUX colonnes d'un seul bloc
 * (`set tiebreaker_question = …, tiebreaker_answer = p_answer`). Un champ non
 * rendu s'écrit donc à `null` — séparer la question de sa réponse en deux
 * étapes de l'atelier effacerait l'autre à chaque enregistrement. Ils
 * appartiennent pourtant à deux temps opposés du produit : la question se pose
 * AVANT l'ouverture, la réponse s'écrit EN FIN de saison. L'étape rend donc les
 * deux, et la réponse a le droit de rester vide.
 */
export function ContestTiebreakerCard({
  contest,
  locked,
}: {
  contest: Contest;
  locked: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(updateContestTiebreaker, {
    toastOnSuccess: "Enregistré.",
  });
  const finalized = contest.finalized_at !== null;
  const questionFrozen = locked || finalized;
  const formRef = useRef<HTMLFormElement>(null);
  // Clôturé : le bouton disparaît, donc plus rien ne doit partir non plus —
  // un enregistrement automatique serait le seul chemin d'écriture restant sur
  // un championnat déclaré définitif.
  const autoSave = useAutoSave(formRef, { actif: !finalized });

  return (
    <Card>
      <h2 className="font-semibold mb-1">Question subsidiaire</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Départage les ex æquo : le joueur le plus proche de la réponse
        officielle passe devant. Posée à l&apos;inscription, figée dès le
        premier pronostic.
      </p>
      {(locked || finalized) && <LockedNotice finalized={finalized} />}
      <form ref={formRef} onSubmit={onSubmit}>
      <input type="hidden" name="id" value={contest.id} />
      <div className="space-y-3">
        <div>
          <Label htmlFor="tiebreaker-question">Question (nombre attendu)</Label>
          <Input
            id="tiebreaker-question"
            name="question"
            defaultValue={contest.tiebreaker_question ?? ""}
            maxLength={160}
            placeholder="Ex : Combien de buts au total dans la compétition ?"
            disabled={questionFrozen}
          />
          {questionFrozen && !finalized && (
            <p className="mt-1 text-xs text-zinc-500">
              🔒 Figée — le jeu a commencé.
            </p>
          )}
          {/* La question figée doit repartir telle quelle avec la réponse. */}
          {questionFrozen && (
            <input
              type="hidden"
              name="question"
              value={contest.tiebreaker_question ?? ""}
            />
          )}
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="tiebreaker-answer">Réponse officielle</Label>
            <Input
              id="tiebreaker-answer"
              name="answer"
              type="number"
              min={0}
              max={1000000}
              defaultValue={contest.tiebreaker_answer ?? ""}
              placeholder="À saisir en fin de saison"
              className="w-40"
              disabled={finalized}
            />
          </div>
          {!finalized && (
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "…" : "Enregistrer"}
            </Button>
          )}
        </div>
      </div>
      <AutoSaveEtat {...autoSave} />
      <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>

      <InfoBulle
        id="aide-subsidiaire-pronostics"
        resume="Faut-il remplir la réponse officielle maintenant ?"
        className="mt-4"
      >
        Non : la question se pose avant l&apos;ouverture, la réponse ne se
        connaît qu&apos;à la fin. Laissez-la vide, vous la saisirez au moment de
        clôturer. Attention, les deux champs s&apos;enregistrent ensemble :
        vider la question efface aussi la réponse. Sans question subsidiaire,
        les ex æquo sont départagés aux points, aux scores exacts, puis par
        tirage auditable.
      </InfoBulle>
    </Card>
  );
}

/**
 * Paliers génériques par type de question — clés miroir de la colonne
 * `contests.scoring` (voir DEFAULT_GENERIC_SCORING). Seuls les blocs des
 * types RÉELLEMENT présents dans l'événement sont affichés.
 */
const GENERIC_TIERS: Array<{
  type: Exclude<ContestQuestionType, "score">;
  title: string;
  fields: Array<{
    key: "choice" | "ranking_exact" | "ranking_partial" | "number_exact" | "number_close" | "number_tolerance";
    label: string;
    hint: string;
    fallback: number;
  }>;
}> = [
  {
    type: "choice",
    title: "🎯 Choix unique",
    fields: [
      {
        key: "choice",
        label: "Bonne réponse",
        hint: "Points quand l'option choisie est la bonne",
        fallback: 3,
      },
    ],
  },
  {
    type: "ranking",
    title: "🥇 Classement",
    fields: [
      {
        key: "ranking_exact",
        label: "Ordre complet juste",
        hint: "Toutes les places dans le bon ordre",
        fallback: 5,
      },
      {
        key: "ranking_partial",
        label: "Par place bien placée",
        hint: "Quand l'ordre n'est pas complètement juste",
        fallback: 1,
      },
    ],
  },
  {
    type: "number",
    title: "🔢 Estimation chiffrée",
    fields: [
      {
        key: "number_exact",
        label: "Valeur exacte",
        hint: "Points quand le nombre tombe pile",
        fallback: 5,
      },
      {
        key: "number_close",
        label: "Valeur proche",
        hint: "Points quand l'écart tient dans la tolérance",
        fallback: 2,
      },
      {
        key: "number_tolerance",
        label: "Tolérance",
        hint: "Écart accepté pour « valeur proche » (0 = palier inactif)",
        fallback: 0,
      },
    ],
  },
];

export function ContestScoringForm({
  contestId,
  scoring,
  questionTypes = ["score"],
  eventKind,
  locked = false,
  finalized = false,
}: {
  contestId: string;
  scoring: ContestScoring;
  /** Types de questions présents dans l'événement (pilote les blocs
   *  affichés). Défaut : le football seul — comportement d'origine. */
  questionTypes?: ContestQuestionType[];
  /** Modèle de l'événement : fournit le barème conseillé (pré-remplissage
   *  des seuls paliers JAMAIS enregistrés — voir GenericScoringForm). */
  eventKind?: string;
  locked?: boolean;
  finalized?: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(updateContestScoring, { toastOnSuccess: "Enregistré." });
  const { state: genericState, pending: genericPending, onSubmit: genericSubmit } = useActionForm(updateContestGenericScoring, { toastOnSuccess: "Enregistré." });
  const scoreFormRef = useRef<HTMLFormElement>(null);
  /**
   * DEUX RAISONS DE SE TAIRE, ET ELLES NE SE VALENT PAS.
   *
   * `finalized` : le bouton n'existe plus, donc l'écriture non plus.
   * `locked` : le formulaire réclame alors un MOTIF journalisé d'au moins dix
   * caractères. Un débounce l'enverrait à la dixième frappe, au milieu d'une
   * phrase — un motif d'audit tronqué vaut moins que pas de motif du tout.
   * Dans les deux cas le geste redevient un clic, volontaire.
   */
  const scoreAutoSave = useAutoSave(scoreFormRef, {
    actif: !locked && !finalized,
  });

  const fields: Array<{ name: "exact" | "diff" | "winner"; label: string; hint: string }> = [
    { name: "exact", label: "Score exact", hint: "Ex : prono 2-1, résultat 2-1" },
    { name: "diff", label: "Bonne différence", hint: "Ex : prono 2-1, résultat 3-2" },
    { name: "winner", label: "Bon vainqueur", hint: "Ex : prono 1-0, résultat 4-0" },
  ];

  // Un événement sans aucune question affiche le barème des scores :
  // c'est le cas d'un championnat football qui n'a pas encore de match.
  const showScore =
    questionTypes.length === 0 || questionTypes.includes("score");
  const genericBlocks = GENERIC_TIERS.filter((tier) =>
    questionTypes.includes(tier.type),
  );

  return (
    <Card>
      <h2 className="font-semibold mb-1">Barème de points</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Un pronostic rapporte le palier le plus haut atteint. Toute modification
        recalcule immédiatement les points des questions déjà résolues.
      </p>
      {(locked || finalized) && <LockedNotice finalized={finalized} />}

      {showScore && (
        <form ref={scoreFormRef} onSubmit={onSubmit} className="space-y-3">
          <input type="hidden" name="id" value={contestId} />
          {fields.map((f) => (
            <div key={f.name} className="flex items-center gap-3">
              <Input
                name={f.name}
                type="number"
                min={0}
                max={100}
                defaultValue={scoring[f.name]}
                required
                className="w-20 text-center"
                aria-label={f.label}
                disabled={finalized}
              />
              <div>
                <p className="text-sm font-bold text-k-ink">{f.label}</p>
                <p className="text-xs text-zinc-500">{f.hint}</p>
              </div>
            </div>
          ))}
          {locked && !finalized && <ReasonInput id="scoring-reason" />}
          {!finalized && (
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "…" : "Enregistrer le barème"}
            </Button>
          )}
          <AutoSaveEtat {...scoreAutoSave} />
          <FieldError message={state && !state.ok ? state.error : undefined} />
        </form>
      )}

      {genericBlocks.length > 0 && (
        <GenericScoringForm
          contestId={contestId}
          scoring={scoring}
          suggested={eventKind ? getEventKind(eventKind)?.suggestedScoring : undefined}
          blocks={genericBlocks}
          locked={locked}
          finalized={finalized}
          pending={genericPending}
          onSubmit={genericSubmit}
          error={
            genericState && !genericState.ok ? genericState.error : undefined
          }
          separated={showScore}
        />
      )}

      <InfoBulle
        id="aide-bareme-pronostics"
        resume="Que se passe-t-il si je change le barème en cours de jeu ?"
        className="mt-4"
      >
        Les points de toutes les questions DÉJÀ résolues sont recalculés
        immédiatement, et le classement public change sous les yeux de vos
        joueurs. Un pronostic ne rapporte que le palier le plus haut qu&apos;il
        atteint, jamais leur somme. Les paliers proposés ne concernent que les
        types de questions réellement présents : créez d&apos;abord vos
        questions, réglez leur barème ensuite.
      </InfoBulle>
    </Card>
  );
}

function GenericScoringForm({
  contestId,
  scoring,
  suggested,
  blocks,
  locked,
  finalized,
  pending,
  onSubmit,
  error,
  separated,
}: {
  contestId: string;
  scoring: ContestScoring;
  /** Barème conseillé par le modèle d'événement (jamais enregistré seul). */
  suggested?: Partial<ContestScoring>;
  blocks: typeof GENERIC_TIERS;
  locked: boolean;
  finalized: boolean;
  pending: boolean;
  /** Gestionnaire de soumission fourni par `useActionForm` du parent. */
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  error?: string;
  /** Un trait sépare les paliers génériques du barème des scores. */
  separated: boolean;
}) {
  // `parseScoring` n'expose un palier générique QUE s'il a été enregistré :
  // « valeur absente » vaut donc « jamais réglé ». Le conseil du modèle ne
  // s'applique qu'à ces paliers-là — un barème déjà réglé n'est jamais
  // écrasé — et il n'est ÉCRIT en base que si le commerçant enregistre.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const block of blocks) {
      for (const field of block.fields) {
        const stored = scoring[field.key];
        initial[field.key] = String(
          typeof stored === "number"
            ? stored
            : (suggested?.[field.key] ?? field.fallback),
        );
      }
    }
    return initial;
  });
  /**
   * Le `<form>` vit ICI, l'action vit chez le parent : l'enregistrement
   * automatique s'attache donc au formulaire de ce composant, avec les deux
   * mêmes exclusions que le barème des scores (clôturé = plus de bouton ;
   * verrouillé = motif journalisé à taper d'un trait).
   */
  const formRef = useRef<HTMLFormElement>(null);
  const autoSave = useAutoSave(formRef, { actif: !locked && !finalized });

  const prefilled = blocks.some((block) =>
    block.fields.some(
      (field) =>
        typeof scoring[field.key] !== "number" &&
        typeof suggested?.[field.key] === "number",
    ),
  );

  // Seules les clés affichées partent au serveur : la RPC fusionne, les
  // paliers d'un type absent de l'événement restent intacts.
  const payload = JSON.stringify(
    Object.fromEntries(
      blocks.flatMap((block) =>
        block.fields.map((field) => [field.key, Number(values[field.key] ?? 0)]),
      ),
    ),
  );

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className={separated ? "mt-5 space-y-3 border-t border-zinc-100 pt-4" : "space-y-3"}
    >
      <input type="hidden" name="id" value={contestId} />
      <input type="hidden" name="values" value={payload} />
      {prefilled && (
        <p className="rounded-lg bg-k-yellow/20 px-3 py-2 text-xs text-k-ink">
          ✨ Valeurs conseillées pour ce type d&apos;événement — ajustez-les
          puis enregistrez.
        </p>
      )}
      {blocks.map((block) => (
        <fieldset key={block.type} className="space-y-3">
          <legend className="text-sm font-bold text-k-ink">{block.title}</legend>
          {block.fields.map((field) => (
            <div key={field.key} className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={1000000}
                value={values[field.key] ?? ""}
                onChange={(e) =>
                  setValues((current) => ({
                    ...current,
                    [field.key]: e.target.value,
                  }))
                }
                required
                className="w-20 text-center"
                aria-label={`${block.title} — ${field.label}`}
                disabled={finalized}
              />
              <div>
                <p className="text-sm font-bold text-k-ink">{field.label}</p>
                <p className="text-xs text-zinc-500">{field.hint}</p>
              </div>
            </div>
          ))}
        </fieldset>
      ))}
      {locked && !finalized && <ReasonInput id="generic-scoring-reason" />}
      {!finalized && (
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "…" : "Enregistrer les paliers"}
        </Button>
      )}
      <AutoSaveEtat {...autoSave} />
      <FieldError message={error} />
    </form>
  );
}

/** Plafond du schéma `rewardsSchema` (max 20 paliers), désormais AFFICHÉ. */
const MAX_REWARD_ROWS = 20;

export function ContestRewardsEditor({
  contestId,
  rewards,
  locked = false,
  finalized = false,
}: {
  contestId: string;
  rewards: ContestReward[];
  locked?: boolean;
  finalized?: boolean;
}) {
  const [rows, setRows] = useState<ContestReward[]>(
    rewards.length > 0 ? rewards : [{ from: 1, to: 1, label: "" }],
  );
  const { state, pending, onSubmit } = useActionForm(updateContestRewards, {
    toastOnSuccess: "Enregistré.",
  });
  // Mêmes exclusions que le barème : clôturé (plus de bouton) et verrouillé
  // (un motif journalisé se tape d'un trait, pas par tranches de 800 ms).
  const formRef = useRef<HTMLFormElement>(null);
  const autoSave = useAutoSave(formRef, { actif: !locked && !finalized });

  const update = (i: number, patch: Partial<ContestReward>) => {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  // Seuls les paliers avec libellé partent au serveur (lignes vides ignorées).
  const payload = JSON.stringify(rows.filter((r) => r.label.trim() !== ""));

  return (
    <Card>
      <h2 className="font-semibold mb-1">Récompenses</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Ce que gagnent vos clients selon leur rang au classement final.
      </p>
      {(locked || finalized) && <LockedNotice finalized={finalized} />}
      <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="id" value={contestId} />
        <input type="hidden" name="rewards" value={payload} />
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-k-body">Du rang</span>
            <Input
              type="number"
              min={1}
              max={999}
              value={r.from}
              onChange={(e) => update(i, { from: Number(e.target.value) })}
              className="w-16 text-center"
              aria-label={`Rang de début du palier ${i + 1}`}
            />
            <span className="text-sm text-k-body">au</span>
            <Input
              type="number"
              min={1}
              max={999}
              value={r.to}
              onChange={(e) => update(i, { to: Number(e.target.value) })}
              className="w-16 text-center"
              aria-label={`Rang de fin du palier ${i + 1}`}
            />
            <Input
              value={r.label}
              onChange={(e) => update(i, { label: e.target.value })}
              maxLength={120}
              placeholder="Ex : Repas offert pour deux"
              className="flex-1 min-w-40"
              aria-label={`Récompense du palier ${i + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              aria-label={`Supprimer le palier ${i + 1}`}
            >
              ✕
            </Button>
          </div>
        ))}
        {locked && !finalized && <ReasonInput id="rewards-reason" />}
        {/* Deux règles muettes jusqu'ici : le bouton « + Ajouter » se grisait à
            vingt paliers sans un mot, et une ligne sans libellé était jetée à
            la sérialisation sans avertir. Elles sont dites. */}
        <p className="text-xs text-zinc-500">
          {rows.length} palier{rows.length > 1 ? "s" : ""} sur{" "}
          {MAX_REWARD_ROWS} au maximum
          {rows.length >= MAX_REWARD_ROWS ? " — plafond atteint" : ""}. Une
          ligne laissée sans libellé n&apos;est pas enregistrée.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={rows.length >= MAX_REWARD_ROWS || finalized}
            onClick={() =>
              setRows((prev) => [
                ...prev,
                {
                  from: (prev[prev.length - 1]?.to ?? 0) + 1,
                  to: (prev[prev.length - 1]?.to ?? 0) + 1,
                  label: "",
                },
              ])
            }
          >
            + Ajouter un palier
          </Button>
          {!finalized && (
            <Button type="submit" disabled={pending}>
              {pending ? "…" : "Enregistrer les récompenses"}
            </Button>
          )}
        </div>
        <AutoSaveEtat {...autoSave} />
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Clôture des récompenses + palmarès
// ────────────────────────────────────────────────────────────

/**
 * Clôture : photographie le classement (politique d'ex æquo complète,
 * tirage auditable en dernier recours) et attribue un lot par rang.
 * Action définitive, réservée au propriétaire.
 */
export function ContestFinalizeCard({
  contest,
}: {
  contest: Contest;
}) {
  const { state, pending, onSubmit } = useActionForm(finalizeContest, {
    // `reloadOnSuccess` : la clôture est annoncée DÉFINITIVE. Un écran qui ne
    // bouge pas invite à recommencer un acte qu'on ne peut pas défaire.
    reloadOnSuccess: true,
  });
  const [confirm, setConfirm] = useState(false);

  return (
    <Card>
      <h2 className="font-semibold mb-1">Clôture des récompenses</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Fige le classement final (ex æquo départagés : points, scores
        exacts, bons écarts, question subsidiaire, puis tirage auditable),
        attribue les lots et génère les codes de retrait.{" "}
        <strong>Action définitive</strong> — plus aucune modification ensuite.
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="id" value={contest.id} />
        {contest.tiebreaker_question && (
          <div>
            <Label htmlFor="finalize-answer">
              Réponse officielle — « {contest.tiebreaker_question} »
            </Label>
            <Input
              id="finalize-answer"
              name="tiebreaker_answer"
              type="number"
              min={0}
              max={1000000}
              defaultValue={contest.tiebreaker_answer ?? ""}
              className="w-40"
            />
          </div>
        )}
        {confirm ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-k-body">
              Clôturer définitivement et attribuer les lots ?
            </span>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Clôture…" : "Confirmer la clôture"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirm(false)}
              disabled={pending}
            >
              Annuler
            </Button>
          </div>
        ) : (
          <Button type="button" onClick={() => setConfirm(true)}>
            Clôturer et attribuer les récompenses
          </Button>
        )}
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

const AWARD_STATUS_LABELS: Record<ContestAward["status"], string> = {
  pending: "À remettre",
  delivered: "Remis",
  cancelled: "Annulé",
};

/** Montant en centimes → « 12,50 € ». */
function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

/**
 * Palmarès : lots attribués à la clôture, remis en caisse contre code
 * PRONO-… (page Caisse) ou à la main depuis ce tableau. Pour un lot remis,
 * on affiche la trace complète — quand, par qui, et le panier saisi en
 * caisse — puisque c'est la seule vue où le commerçant la consulte.
 */
export function ContestAwardsList({
  contestId,
  awards,
  redeemers = {},
}: {
  contestId: string;
  /** `expired` est évalué CÔTÉ SERVEUR (pas d'écart d'hydratation). */
  awards: Array<ContestAward & { playerName: string; expired: boolean }>;
  /** id d'utilisateur → email, pour nommer l'auteur d'une remise. */
  redeemers?: Record<string, string>;
}) {
  const { state, pending, onSubmit } = useActionForm(setContestAwardStatus, {
    // `reloadOnSuccess` : geste de CAISSE, et l'écran en est le seul accusé de
    // réception — le statut affiché est une prop serveur, le succès ne rend
    // rien. Le gagnant, lui, voit « remis » sur son téléphone au chargement
    // suivant de /pronos/<slug> : sans rechargement, le commerçant croit la
    // remise non enregistrée et redonne le lot, ou retient le client au
    // comptoir pendant que l'écran de celui-ci affirme le contraire du sien.
    reloadOnSuccess: true,
  });
  const [cancelId, setCancelId] = useState<string | null>(null);

  return (
    <Card>
      <h2 className="font-semibold mb-1">🏅 Récompenses attribuées</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Le gagnant présente son code en caisse ; marquez le lot « remis »
        à la remise. Chaque mouvement est journalisé.
      </p>
      <ul className="space-y-2">
        {awards.map((award) => (
          <li
            key={award.id}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2"
          >
            <span className="w-8 text-center font-black tabular-nums text-k-ink">
              {award.rank}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-k-ink">
              {award.playerName}
              <span className="ml-2 font-normal text-zinc-500">
                {award.reward_label}
              </span>
            </span>
            <code className="rounded bg-white px-2 py-0.5 text-xs font-mono font-bold text-k-ink border border-zinc-200">
              {award.code}
            </code>
            <span
              className={
                award.status === "delivered"
                  ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700"
                  : award.status === "cancelled"
                    ? "rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-bold text-zinc-600"
                    : "rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700"
              }
            >
              {AWARD_STATUS_LABELS[award.status]}
            </span>
            {award.status === "pending" && (
              <span className="flex items-center gap-1.5">
                <form onSubmit={onSubmit}>
                  <input type="hidden" name="id" value={award.id} />
                  <input type="hidden" name="contest_id" value={contestId} />
                  <input type="hidden" name="status" value="delivered" />
                  <Button type="submit" variant="secondary" disabled={pending}>
                    Marquer remis
                  </Button>
                </form>
                {cancelId === award.id ? (
                  <form onSubmit={onSubmit} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={award.id} />
                    <input type="hidden" name="contest_id" value={contestId} />
                    <input type="hidden" name="status" value="cancelled" />
                    <Input
                      name="reason"
                      required
                      minLength={10}
                      maxLength={300}
                      placeholder="Motif d'annulation (journalisé)"
                      className="w-56"
                      aria-label="Motif d'annulation"
                    />
                    <Button type="submit" variant="danger" disabled={pending}>
                      Annuler le lot
                    </Button>
                  </form>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setCancelId(award.id)}
                  >
                    Annuler…
                  </Button>
                )}
              </span>
            )}

            {/* Trace de la remise : quand, par qui, et le panier saisi en
                caisse s'il l'a été. `basis-full` force une seconde ligne. */}
            {award.status === "delivered" && award.redeemed_at && (
              <span className="basis-full text-xs text-zinc-500">
                Remis le {formatDate(award.redeemed_at)}
                {award.redeemed_by
                  ? ` par ${redeemers[award.redeemed_by] ?? "un membre de l'équipe"}`
                  : ""}
                {award.basket_cents !== null
                  ? ` · panier ${formatCents(award.basket_cents)}`
                  : ""}
              </span>
            )}
            {award.status === "pending" && award.redeem_expires_at && (
              <span
                className={
                  award.expired
                    ? "basis-full text-xs font-bold text-red-600"
                    : "basis-full text-xs text-zinc-500"
                }
              >
                {award.expired
                  ? `⏱️ Code expiré le ${formatDate(award.redeem_expires_at)} — la caisse le refuse désormais`
                  : `Code valable jusqu'au ${formatDate(award.redeem_expires_at)}`}
              </span>
            )}
          </li>
        ))}
      </ul>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </Card>
  );
}
