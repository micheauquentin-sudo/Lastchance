"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import {
  deleteCalendar,
  setCalendarStatus,
  updateCalendar,
  updateCalendarDay,
} from "@/actions/calendar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { caseVide, casesIncompletes } from "@/lib/activation/calendar";
import {
  CodeTtlDaysField,
  codeTtlDaysInitial,
} from "@/components/dashboard/code-ttl-days-field";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { RaccourciAtelier, VoirLeJeu } from "@/components/dashboard/atelier-raccourci";
import { hrefEtapeCalendrier } from "@/components/dashboard/atelier-calendar-etapes";
import { FieldError, Input, Label } from "@/components/ui/input";
import type {
  Calendar,
  CalendarContentType,
  CalendarDay,
  CalendarTheme,
} from "@/types/database";
import type { ActionResult } from "@/lib/utils";
import {
  CALENDAR_DAY_LOSS_HINT,
  CALENDAR_DELETE_LOSS_HINT,
} from "@/lib/validations/calendar";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import { useAutoSaveManuel } from "@/lib/use-auto-save-manuel";
import { AutoSaveEtat } from "@/components/dashboard/auto-save-etat";
import {
  spinWheelIssue,
  type SpinWheelPrizes,
} from "./loyalty-settings-presets";
import {
  CALENDAR_THEME_ORDER,
  calendarThemeTokens,
} from "@/components/calendar/calendar-theme";
import { FondEcran } from "@/components/ui/fond-ecran";
import { fondPourTheme } from "@/lib/fonds-ecran";
import { formatCalendarUnlock } from "@/components/calendar/calendar-state";

/** Roue de l'organisation ciblable par une case `spin`, avec l'état de ses lots. */
export interface CalendarWheelOption extends SpinWheelPrizes {
  id: string;
  name: string;
}

const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";
const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

// ────────────────────────────────────────────────────────────
// Sélecteur de thème saisonnier (aperçu des 5)
// ────────────────────────────────────────────────────────────

function ThemeSelector({ value }: { value: CalendarTheme }) {
  const [theme, setTheme] = useState<CalendarTheme>(value);
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-bold text-k-ink">Thème saisonnier</legend>
      <p className="mb-3 text-xs text-zinc-500">
        Change les couleurs, les emoji et les dessins de fond de la page suivie
        par vos clients — la DA « carton kermesse » reste la même.
      </p>
      {/* La valeur retenue voyage dans un champ caché contrôlé. */}
      <input type="hidden" name="theme" value={theme} />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {CALENDAR_THEME_ORDER.map((key) => {
          const tokens = calendarThemeTokens(key);
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
              {/* `relative` + fond en premier enfant : même empilement que la
                  page publique (ordre du DOM, aucun z-index) — la vignette
                  montre ce que verront vraiment les clients. */}
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
                  className={`relative flex h-7 w-7 items-center justify-center rounded-md text-sm ${tokens.availableCell}`}
                >
                  {tokens.faceEmoji}
                </span>
                <span
                  className={`relative h-2 flex-1 rounded-full ${tokens.progressFill}`}
                />
              </div>
              <p className="flex items-center justify-between text-sm font-black text-k-ink">
                <span>
                  {tokens.titleEmoji} {tokens.label}
                </span>
                {active && <span className="text-k-green">✓</span>}
              </p>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// ────────────────────────────────────────────────────────────
// Réglages du calendrier
// ────────────────────────────────────────────────────────────

export function CalendarSettings({ calendar }: { calendar: Calendar }) {
  // useActionForm et non useActionState : l'état de chargement doit retomber
  // même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
  //
  // PAS de `resetOnSuccess` : ce formulaire est un formulaire d'ÉDITION
  // pré-rempli. Le vider après un enregistrement effacerait notamment l'URL
  // publique de l'écran, qu'un save suivant renverrait vide (cf. plus bas).
  const { state, pending, onSubmit } = useActionForm(updateCalendar, {
    networkError: "Enregistrement impossible, réessayez.",
    // Sans bouton à regarder, le résultat d'un enregistrement automatique doit
    // s'annoncer ailleurs : le « Enregistré. » ci-dessous reste, le bandeau
    // global le double pour la sauvegarde qui part toute seule.
    toastOnSuccess: "Enregistré.",
  });
  const [codeTtlDays, setCodeTtlDays] = useState(() =>
    codeTtlDaysInitial(calendar.code_ttl_days),
  );

  /**
   * ── LE NOMBRE DE CASES SORT DE L'ENREGISTREMENT AUTOMATIQUE ──
   *
   * Réduire `day_count` est le seul geste de ce formulaire qui DÉTRUIT : les
   * dernières cases partent avec leur contenu et les codes CADEAU- qu'elles ont
   * distribués. L'action refuse donc une première fois, et ce refus fait
   * apparaître la case « je comprends » (`confirm_day_loss`) — qui n'existe
   * dans le DOM qu'APRÈS le refus, et disparaît à la soumission suivante
   * puisque `state` repart à `null`.
   *
   * Un enregistrement automatique rendrait cette réduction IMPOSSIBLE : chaque
   * frappe reposterait sans la confirmation, ferait retomber `state`, et la
   * case s'effacerait avant même d'être cochable. Tant que le champ diffère de
   * sa valeur d'origine, l'enregistrement automatique est donc SUSPENDU et le
   * bouton reprend la main — c'est-à-dire exactement le moment où la
   * confirmation est en jeu, et lui seul : le reste du formulaire continue de
   * s'enregistrer tout seul dès que le nombre de cases revient à sa valeur
   * initiale.
   */
  const dayCountInitial = String(calendar.day_count);
  const [dayCount, setDayCount] = useState(dayCountInitial);
  const grilleModifiee = dayCount !== dayCountInitial;

  // À CÔTÉ de `useActionForm`, jamais autour : deux gardes mécaniques du dépôt
  // cherchent l'appel littéral dans les `.tsx`.
  const formRef = useRef<HTMLFormElement>(null);
  const { enAttente, bloqueParValidation } = useAutoSave(formRef, {
    actif: !grilleModifiee,
  });

  return (
    <Card>
      <h2 className="font-semibold mb-1">Réglages</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Nom, thème, période, nombre de cases, adresse publique et récompense
        d&apos;assiduité.
      </p>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
        <input type="hidden" name="id" value={calendar.id} />

        <div className="max-w-sm">
          <Label htmlFor="calendar-name">Nom du calendrier</Label>
          <Input
            id="calendar-name"
            name="name"
            defaultValue={calendar.name}
            required
            maxLength={120}
          />
        </div>

        <ThemeSelector value={calendar.theme} />

        {/* ── Période et grille ── */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-bold text-k-ink">
            Période et cases
          </legend>
          <p className="text-xs text-zinc-500">
            Chaque case s&apos;ouvre un jour après la précédente, à partir de la
            date de départ.
          </p>
          {/* L'avertissement était un <p> permanent noyé dans le formulaire.
              Il devient une bulle OUVERTE D'EMBLÉE : même poids visuel qu'un
              paragraphe pour qui la lit, mais repliable une fois comprise —
              et surtout, elle survit au fait qu'on revienne ici après avoir
              garni la grille, qui est précisément le moment dangereux. */}
          <InfoBulle
            id="aide-calendrier-grille"
            resume="Que devient le contenu déjà saisi si je change ces réglages ?"
            defaultOpen
          >
            Modifier la date de départ recalcule toutes les dates
            d&apos;ouverture — le contenu des cases est conservé. En revanche,{" "}
            <strong>réduire le nombre de cases supprime les dernières</strong> :
            leur contenu, les ouvertures déjà faites par vos clients et les codes
            CADEAU- distribués partent avec elles. Une confirmation vous sera
            demandée, chiffres à l&apos;appui, avant que ce soit fait.
          </InfoBulle>
          <div className="flex flex-wrap gap-4">
            <div>
              <Label htmlFor="calendar-start">Date de départ (1re case)</Label>
              <Input
                id="calendar-start"
                name="start_date"
                type="date"
                defaultValue={calendar.start_date}
                required
                className="w-48"
              />
            </div>
            <div>
              <Label htmlFor="calendar-daycount">Nombre de cases</Label>
              <Input
                id="calendar-daycount"
                name="day_count"
                type="number"
                min={1}
                max={60}
                // NON CONTRÔLÉ, comme les autres champs de ce formulaire : la
                // valeur reste au DOM. L'état ne sert qu'à savoir si elle a
                // BOUGÉ, pour suspendre l'enregistrement automatique.
                defaultValue={dayCountInitial}
                onChange={(e) => setDayCount(e.target.value)}
                required
                className="w-32"
                aria-describedby="calendar-daycount-help"
              />
              <p id="calendar-daycount-help" className="mt-1.5 text-xs text-zinc-500">
                Avent = 24, semaine = 7… (60 maximum).
              </p>
              {grilleModifiee && (
                <p
                  role="status"
                  className="mt-1.5 max-w-xs text-xs font-bold text-amber-800"
                >
                  Le changement du nombre de cases s&apos;enregistre avec le
                  bouton (une confirmation peut être demandée).
                </p>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="calendar-tz">Fuseau horaire</Label>
            <Input
              id="calendar-tz"
              name="timezone"
              defaultValue={calendar.timezone}
              maxLength={64}
              placeholder="Europe/Paris"
              className="w-64 font-mono"
              aria-describedby="calendar-tz-help"
            />
            <p id="calendar-tz-help" className="mt-1.5 text-xs text-zinc-500">
              Détermine l&apos;heure d&apos;ouverture des cases (minuit dans ce
              fuseau). Par défaut, celui de votre établissement.
            </p>
          </div>
        </fieldset>

        {/* ── Récompense d'assiduité (stock fini OBLIGATOIRE) ── */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-bold text-k-ink">
            Récompense d&apos;assiduité
          </legend>
          <p className="text-xs text-zinc-500">
            Le cadeau remis au client qui a ouvert TOUTES les cases (code
            CADEAU-… présenté en caisse). Laissez le stock à 0 pour ne pas en
            proposer.
          </p>
          <div>
            <Label htmlFor="calendar-reward-label">Cadeau final</Label>
            <Input
              id="calendar-reward-label"
              name="completion_reward_label"
              defaultValue={calendar.completion_reward_label}
              maxLength={120}
              placeholder="Ex : Un bon d'achat de 20 €"
            />
          </div>
          <div>
            <Label htmlFor="calendar-reward-details">Détails (optionnel)</Label>
            <textarea
              id="calendar-reward-details"
              name="completion_reward_details"
              defaultValue={calendar.completion_reward_details ?? ""}
              maxLength={2000}
              rows={2}
              placeholder="Conditions, validité, modalités de retrait…"
              className={textareaClass}
            />
          </div>
          <div>
            <Label htmlFor="calendar-reward-stock">
              Nombre de cadeaux (stock, obligatoire)
            </Label>
            <Input
              id="calendar-reward-stock"
              name="completion_reward_stock"
              type="number"
              min={0}
              max={1_000_000}
              defaultValue={calendar.completion_reward_stock}
              required
              aria-describedby="calendar-reward-stock-help"
              className="w-40"
            />
            <p id="calendar-reward-stock-help" className="mt-1.5 text-xs text-zinc-500">
              Plafonne les cadeaux d&apos;assiduité : au-delà, plus aucun code
              n&apos;est émis, quel que soit le nombre de participants (0 = pas de
              cadeau final).
            </p>
          </div>
        </fieldset>

        {/* UN SEUL réglage pour DEUX émissions : `calendars.code_ttl_days`
            grave l'échéance sur `calendar_openings` (le CADEAU- d'une case)
            comme sur `calendar_rewards` (le cadeau d'assiduité). Le dire ici
            plutôt que de laisser croire, par sa position, qu'il ne concerne
            que la récompense finale au-dessus. */}
        <CodeTtlDaysField
          idPrefix="calendar"
          legend="Expiration des codes de retrait"
          value={codeTtlDays}
          onChange={setCodeTtlDays}
          emissionHint="Délai laissé au client pour présenter un code CADEAU- en caisse, à partir de l'OUVERTURE de la case qui l'a donné — et, pour le cadeau d'assiduité, à partir de l'ouverture de la dernière case."
        />

        {/* ── Contenu commerçant (page publique) ── */}
        <div>
          <Label htmlFor="calendar-merchant-content">
            Vos actualités sur la page (optionnel)
          </Label>
          <textarea
            id="calendar-merchant-content"
            name="merchant_content"
            defaultValue={calendar.merchant_content ?? ""}
            maxLength={4000}
            rows={4}
            placeholder="Offres du moment, horaires… Ce texte s'affiche sur la page suivie par vos clients."
            className={textareaClass}
          />
        </div>

        {/* ── URL publique (PRÉ-REMPLIE : un save sans ce champ la viderait) ── */}
        <div>
          <Label htmlFor="calendar-slug">URL publique</Label>
          <div className="flex flex-wrap items-center gap-1 text-sm text-zinc-500">
            <span className="font-mono">…/calendar/</span>
            <Input
              id="calendar-slug"
              name="public_slug"
              defaultValue={calendar.public_slug ?? ""}
              maxLength={64}
              pattern="[a-z0-9-]{3,64}"
              placeholder="mon-calendrier"
              className="w-56 font-mono"
              aria-describedby="calendar-slug-help"
            />
          </div>
          <p id="calendar-slug-help" className="mt-1.5 text-xs text-zinc-500">
            Une adresse lisible pour le QR et le partage (3 à 64 caractères :
            a-z, 0-9, tirets).
          </p>
          <InfoBulle
            id="aide-calendrier-slug"
            resume="Puis-je la changer après avoir imprimé le QR code ?"
            className="mt-2"
          >
            Techniquement oui, mais l&apos;ancienne adresse ne répondra plus :
            les affiches déjà collées en vitrine mèneraient vers une page
            introuvable — et un calendrier se suit sur plusieurs semaines.
            Changez-la avant d&apos;imprimer, ou réimprimez le QR après.
          </InfoBulle>
        </div>

        {/* La case n'apparaît PAS d'emblée : elle ne sert qu'après le refus
            de l'action, lequel NOMME le nombre de cases supprimées et le
            nombre de codes CADEAU- qui deviendraient introuvables. Demander
            la confirmation avant de connaître le coût serait du bruit ; la
            demander après, c'est un choix informé. Filtrée sur CE refus :
            ce formulaire échoue aussi pour un nom vide ou une URL déjà prise,
            où la case n'aurait aucun sens. */}
        {state && !state.ok && state.error.includes(CALENDAR_DAY_LOSS_HINT) && (
          <label className="flex items-start gap-2 text-sm font-semibold text-red-700">
            <input
              type="checkbox"
              name="confirm_day_loss"
              value="1"
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            Je comprends que les cases retirées et les codes qu&apos;elles ont
            distribués seront définitivement perdus.
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "…" : "Enregistrer"}
          </Button>
          {state?.ok && (
            <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
          )}
          {!grilleModifiee && (
            <AutoSaveEtat
              enAttente={enAttente}
              bloqueParValidation={bloqueParValidation}
            />
          )}
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Grille des cases (configuration d'une case existante)
// ────────────────────────────────────────────────────────────

export function CalendarDaysEditor({
  days,
  wheels,
}: {
  days: CalendarDay[];
  wheels: CalendarWheelOption[];
}) {
  const ordered = [...days].sort((a, b) => a.day_index - b.day_index);
  // Le compteur que la grille ne donnait pas : sur 24 à 60 cases, « il en reste
  // combien ? » était une question qu'on ne pouvait résoudre qu'en déroulant
  // tout l'écran. Même règle que le refus d'activation (module partagé), et
  // même prédicat que lui pour les cases vides : `caseVide`, jamais une copie
  // locale de la règle.
  const pourActivation = ordered.map((d) => ({
    day_index: d.day_index,
    content_type: d.content_type,
    reward_stock: d.reward_stock,
    reward_label: d.reward_label ?? "",
    target_wheel_id: d.target_wheel_id,
    content_text: d.content_text,
  }));
  const restantes = casesIncompletes(pourActivation);
  // Une case `content` sans texte ne bloque plus rien : elle s'ouvrira sur un
  // « pas de chance ». Elle n'est donc PAS « à compléter » — mais elle n'est
  // pas garnie non plus, et le commerçant a le droit de savoir combien il en a.
  const vides = pourActivation.filter(caseVide).length;
  const garnies = ordered.length - restantes.length - vides;

  return (
    <Card>
      <h2 className="font-semibold mb-1">Contenu des cases</h2>
      <p className="text-sm text-zinc-500 mb-3">
        Réglez ce que chaque case révèle à l&apos;ouverture : un{" "}
        <strong>message</strong>, un <strong>lot</strong> (code retiré en caisse)
        ou un <strong>tour de roue offert</strong>. Les dates d&apos;ouverture
        suivent la date de départ et le nombre de cases (réglés à
        l&apos;étape précédente) — elles ne se modifient pas case par case.
      </p>

      {ordered.length > 0 && (
        <p
          className={`mb-4 inline-flex flex-wrap rounded-xl border-2 px-3 py-1.5 text-sm font-black ${
            restantes.length === 0
              ? "border-k-ink bg-k-green/30 text-k-ink"
              : "border-k-ink/25 bg-k-bg text-k-body"
          }`}
        >
          {garnies} case{garnies > 1 ? "s" : ""} garnie
          {garnies > 1 ? "s" : ""} sur {ordered.length}
          {vides > 0 && (
            <>
              , {vides} vide{vides > 1 ? "s" : ""} — {vides > 1 ? "elles" : "elle"}{" "}
              s&apos;ouvrira{vides > 1 ? "ont" : ""} sur un « pas de chance »
            </>
          )}
          {restantes.length > 0 && (
            <>
              {" "}
              — case {restantes[0].dayIndex} à compléter
            </>
          )}
        </p>
      )}

      {ordered.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucune case pour l&apos;instant — réglez la date de départ et le nombre
          de cases dans les réglages.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {ordered.map((day) => (
            <DayRow key={day.id} day={day} wheels={wheels} />
          ))}
        </ul>
      )}

      <InfoBulle
        id="aide-calendrier-cases"
        resume="Pourquoi chaque case a-t-elle son propre bouton ?"
        className="mt-4"
      >
        Parce qu&apos;une case s&apos;enregistre seule, sans toucher aux autres :
        vous pouvez en garnir trois aujourd&apos;hui et revenir demain. Vous
        n&apos;avez pas besoin de toutes les garnir pour ouvrir : une case
        message laissée vide s&apos;ouvrira sur un « pas de chance », elle
        compte dans l&apos;assiduité et n&apos;empêche pas la publication. Seule
        une case promettant quelque chose sans pouvoir le tenir (un lot sans
        stock ni libellé, un tour de roue sans roue) bloque
        l&apos;enregistrement, puis l&apos;ouverture.
      </InfoBulle>
    </Card>
  );
}

function DayRow({
  day,
  wheels,
}: {
  day: CalendarDay;
  wheels: CalendarWheelOption[];
}) {
  const [type, setType] = useState<CalendarContentType>(day.content_type);
  const [contentText, setContentText] = useState(day.content_text ?? "");
  const [rewardLabel, setRewardLabel] = useState(day.reward_label ?? "");
  const [rewardDetails, setRewardDetails] = useState(day.reward_details ?? "");
  const [rewardStock, setRewardStock] = useState(
    day.reward_stock === null ? "" : String(day.reward_stock),
  );
  const missingWheel =
    day.content_type === "spin" &&
    day.target_wheel_id !== null &&
    !wheels.some((w) => w.id === day.target_wheel_id);
  const [wheelId, setWheelId] = useState(
    missingWheel ? "" : (day.target_wheel_id ?? ""),
  );
  const [isSpecial, setIsSpecial] = useState(day.is_special);

  /**
   * PAS de `useTransition` : l'état de chargement doit retomber même quand le
   * rendu ne rejoue pas la revalidation — docs/bugs.md. `updateCalendarDay`
   * prend un OBJET typé (pas une FormData), donc pas de `useActionForm` non
   * plus : le `pending` retombe ici dans un `finally`, et sert au passage de
   * verrou contre la double soumission (ce que `startTransition` offrait).
   *
   * `result` reste LOCAL à cette case : une instance de hook par ligne, sinon
   * un enregistrement ferait clignoter le ✓ sur les 24 cases.
   */
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const selectedWheel = wheels.find((w) => w.id === wheelId) ?? null;
  const issue = type === "spin" ? spinWheelIssue(selectedWheel) : "none";
  const unlockLabel = formatCalendarUnlock(day.unlock_at, true);
  const prefix = `day-${day.id}`;

  const enregistrer = async (): Promise<boolean> => {
    setPending(true);
    try {
      const res = await updateCalendarDay({
        id: day.id,
        contentType: type,
        contentText,
        rewardLabel,
        rewardDetails,
        rewardStock,
        targetWheelId: wheelId || undefined,
        isSpecial,
      });
      setResult(res);
      // Les compteurs servis par le serveur (codes déjà émis, date
      // d'ouverture) doivent suivre la sauvegarde. Les états locaux de la
      // case, eux, ne sont PAS réinitialisés depuis les props : une saisie en
      // cours survivrait mal au rafraîchissement.
      if (res.ok) router.refresh();
      return res.ok;
    } catch {
      // Réseau coupé : le dire, plutôt que de laisser le bouton tourner.
      setResult({
        ok: false,
        error: "Enregistrement impossible, réessayez.",
      });
      return false;
    } finally {
      setPending(false);
    }
  };

  /**
   * ENREGISTREMENT AUTOMATIQUE — un par ligne, comme le `result` : sur 24 à 60
   * cases, un état partagé ferait clignoter les autres.
   *
   * Le bouton passe par le MÊME chemin (`declencher`) : le verrou et la file
   * d'une place du hook remplacent le `if (pending) return;` d'origine, qui
   * JETAIT la seconde soumission — la frappe qui suivait un départ était
   * perdue en silence, et le ✓ s'affichait pour la valeur précédente. Le
   * message de succès reste le ✓ discret de la ligne ; le bandeau global, lui,
   * ne dit « Enregistré. » qu'une fois.
   */
  const ligneRef = useRef<HTMLLIElement>(null);
  const { enAttente, declencher } = useAutoSaveManuel(ligneRef, {
    signature: JSON.stringify([
      type,
      contentText,
      rewardLabel,
      rewardDetails,
      rewardStock,
      wheelId,
      isSpecial,
    ]),
    enregistrer,
    message: `Case ${day.day_index} enregistrée.`,
  });

  return (
    // L'ancre permet à l'étape de vérification de NOMMER la case fautive et
    // d'y mener directement — le refus serveur, lui, n'a jamais su laquelle.
    <li
      id={`case-${day.day_index}`}
      ref={ligneRef}
      className="scroll-mt-24 rounded-xl border-2 border-k-ink/15 bg-white p-3"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-k-ink bg-k-yellow text-sm font-black tabular-nums text-k-ink">
            {day.day_index}
          </span>
          {unlockLabel && (
            <span className="text-xs font-bold text-zinc-500">
              Ouvre le {unlockLabel}
            </span>
          )}
          {/* Repère, pas une erreur : une case vide est un choix légal. Le
              prédicat vient du module d'activation — pas de règle recopiée —
              et suit la saisie en cours, pas seulement l'enregistré. */}
          {caseVide({
            content_type: type,
            content_text: contentText,
            reward_stock: null,
            reward_label: "",
            target_wheel_id: null,
          }) && (
            <span className="rounded-full border-2 border-k-ink/25 bg-k-bg px-2 py-0.5 text-[11px] font-bold text-k-body">
              🍂 pas de chance
            </span>
          )}
        </span>
        <label className="flex items-center gap-1.5 text-xs font-bold text-k-ink">
          <input
            type="checkbox"
            checked={isSpecial}
            onChange={(e) => setIsSpecial(e.target.checked)}
            className="h-4 w-4 accent-k-ink"
          />
          ⭐ Case spéciale (partageable)
        </label>
      </div>

      {/* ── Usage de la case ── */}
      <fieldset className="mb-3 flex flex-wrap gap-3">
        <legend className="sr-only">Usage de la case {day.day_index}</legend>
        {(
          [
            ["content", "💬 Message"],
            ["lot", "🎁 Lot"],
            ["spin", "🎡 Tour de roue"],
          ] as [CalendarContentType, string][]
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name={`${prefix}-type`}
              value={value}
              checked={type === value}
              onChange={() => setType(value)}
              className="h-4 w-4 accent-k-ink"
            />
            {label}
          </label>
        ))}
      </fieldset>

      {type === "content" && (
        <div>
          <Label htmlFor={`${prefix}-text`}>
            Message affiché à l&apos;ouverture — laissez vide pour une case sans
            gain
          </Label>
          <textarea
            id={`${prefix}-text`}
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Ex : Joyeuses fêtes ! -10 % sur tout le magasin aujourd'hui."
            className={textareaClass}
          />
        </div>
      )}

      {type === "lot" && (
        <div className="space-y-2">
          <div>
            <Label htmlFor={`${prefix}-label`}>Lot</Label>
            <Input
              id={`${prefix}-label`}
              value={rewardLabel}
              onChange={(e) => setRewardLabel(e.target.value)}
              maxLength={120}
              placeholder="Ex : Un café offert"
            />
          </div>
          <div>
            <Label htmlFor={`${prefix}-details`}>Détails (optionnel)</Label>
            <textarea
              id={`${prefix}-details`}
              value={rewardDetails}
              onChange={(e) => setRewardDetails(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Conditions, validité…"
              className={textareaClass}
            />
          </div>
          <div>
            <Label htmlFor={`${prefix}-stock`}>Stock du lot (obligatoire)</Label>
            <Input
              id={`${prefix}-stock`}
              type="number"
              min={0}
              max={1_000_000}
              value={rewardStock}
              onChange={(e) => setRewardStock(e.target.value)}
              placeholder="Ex : 50"
              aria-describedby={`${prefix}-stock-help`}
              className="w-40"
            />
            <p id={`${prefix}-stock-help`} className="mt-1.5 text-xs text-zinc-500">
              Plafonne les codes émis par cette case (0 = épuisé / en pause).
              {day.reward_claimed_count > 0 && (
                <>
                  {" "}
                  {day.reward_claimed_count} déjà émis — un stock inférieur met la
                  case en pause.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {type === "spin" && (
        <div>
          <Label htmlFor={`${prefix}-wheel`}>Roue du tour offert</Label>
          {wheels.length === 0 ? (
            <p className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              Aucune roue disponible — créez d&apos;abord une roue dans vos
              campagnes.
            </p>
          ) : (
            <select
              id={`${prefix}-wheel`}
              value={wheelId}
              onChange={(e) => setWheelId(e.target.value)}
              className={`${selectClass} max-w-sm`}
            >
              <option value="">— Choisir une roue —</option>
              {wheels.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          {missingWheel && (
            <p className="mt-1.5 text-xs font-semibold text-amber-700">
              La roue ciblée a été supprimée — choisissez-en une autre.
            </p>
          )}
          <div aria-live="polite">
            {issue !== "none" && selectedWheel && (
              <p className="mt-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                {issue === "nothing_drawable"
                  ? "⚠️ Cette roue ne peut rien distribuer en tour offert : donnez un stock à au moins un de ses lots (page de la campagne)."
                  : "⚠️ Certains lots de cette roue (stock illimité) ne sortiront pas en tour offert. Donnez-leur un stock pour les rendre tirables."}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={declencher}
          disabled={pending}
        >
          {pending ? "…" : "Enregistrer la case"}
        </Button>
        {result?.ok && (
          <span className="text-sm font-medium text-emerald-600">✓</span>
        )}
        <AutoSaveEtat enAttente={enAttente} bloqueParValidation={false} />
      </div>
      <FieldError message={result && !result.ok ? result.error : undefined} />
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// Statut (activer / archiver) + suppression
// ────────────────────────────────────────────────────────────

export function CalendarStatusControls({
  calendar,
  hrefJeu = null,
}: {
  calendar: Calendar;
  /** Page publique du calendrier, `null` tant qu'il n'est pas ouvert. */
  hrefJeu?: string | null;
}) {
  // useActionForm et non useActionState : l'état de chargement doit retomber
  // même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
  //
  // Un seul hook pour les DEUX formulaires (activer / archiver) : ils sont
  // mutuellement exclusifs, un seul existe dans le DOM à la fois, et chacun
  // porte ses propres champs cachés, lus depuis `event.currentTarget`.
  const {
    state: statusState,
    pending: statusPending,
    onSubmit: statusSubmit,
  } = useActionForm(setCalendarStatus, {
    // `reloadOnSuccess` : le badge d'état et la carte « Page publique »
    // suivent la prop serveur, donc le rafraîchissement — mesuré défaillant
    // (docs/bugs.md). Le geste est idempotent, mais l'écran affirmerait le
    // CONTRAIRE de l'état réel d'une page ouverte aux clients.
    reloadOnSuccess: true,
    networkError: "Changement de statut impossible, réessayez.",
  });
  /**
   * `deleteCalendar` RESTE en `useActionState` : son chemin de succès se termine
   * par un `redirect()`. Appelée comme une simple fonction, le `NEXT_REDIRECT`
   * qu'elle lève tomberait dans le `catch` de `useActionForm` et afficherait une
   * erreur sur une suppression pourtant réussie. Le `pending` figé est ici sans
   * conséquence : l'écran est remplacé par la navigation.
   */
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteCalendar,
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Card>
      <h2 className="font-semibold mb-4">Statut du calendrier</h2>

      <div className="flex flex-wrap items-center gap-3">
        {calendar.status !== "active" ? (
          <form onSubmit={statusSubmit}>
            <input type="hidden" name="id" value={calendar.id} />
            <input type="hidden" name="status" value="active" />
            <Button type="submit" disabled={statusPending}>
              {statusPending ? "…" : "Ouvrir aux joueurs"}
            </Button>
          </form>
        ) : (
          <form onSubmit={statusSubmit}>
            <input type="hidden" name="id" value={calendar.id} />
            <input type="hidden" name="status" value="archived" />
            <Button type="submit" variant="secondary" disabled={statusPending}>
              {statusPending ? "…" : "Clôturer"}
            </Button>
          </form>
        )}

        {calendar.status === "active" && (
          <span className="rounded-full border-2 border-k-ink bg-k-green/40 px-3 py-1 text-xs font-black text-k-ink">
            Ouverte aux joueurs — la page du calendrier est accessible aux clients
          </span>
        )}
      </div>

      {calendar.status !== "active" && (
        <p className="mt-3 text-sm text-zinc-500">
          Pour ouvrir aux joueurs : chaque case qui promet quelque chose doit
          pouvoir le tenir (un lot avec son libellé et son stock, un tour de
          roue avec sa roue). Une case message laissée vide ne bloque rien —
          elle s&apos;ouvrira sur un « pas de chance ».
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <RaccourciAtelier href={hrefEtapeCalendrier(calendar.id, "reglages")} />
        <VoirLeJeu href={hrefJeu} />
      </div>
      <FieldError
        message={statusState && !statusState.ok ? statusState.error : undefined}
      />

      <div className="mt-5 border-t border-zinc-100 pt-4">
        {confirmDelete ? (
          <form action={deleteAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={calendar.id} />
            <span className="text-sm text-k-body">
              Supprimer ce calendrier, ses cases et ses ouvertures ?
            </span>
            {/* La case n'apparaît qu'APRÈS le refus qui NOMME le nombre de
                codes CADEAU- encore à retirer — jamais sur « Suppression
                impossible » ni sur une coupure réseau. */}
            {deleteState &&
              !deleteState.ok &&
              deleteState.error.includes(CALENDAR_DELETE_LOSS_HINT) && (
                <label className="flex w-full max-w-md items-start gap-1.5 text-xs font-semibold text-red-700">
                  <input
                    type="checkbox"
                    name="confirm_outstanding"
                    value="1"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  Je comprends que les codes non retirés deviendront
                  introuvables en caisse.
                </label>
              )}
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
            Supprimer le calendrier
          </Button>
        )}
        <FieldError
          message={deleteState && !deleteState.ok ? deleteState.error : undefined}
        />
      </div>
    </Card>
  );
}
