"use client";

import Link from "next/link";
import { Input, Label } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { CodeTtlDaysField } from "@/components/dashboard/code-ttl-days-field";
import { FondEcran } from "@/components/ui/fond-ecran";
import {
  AUCUN_FOND,
  FOND_KEYS,
  FOND_LABELS,
  fondPourTheme,
  type FondKey,
} from "@/lib/fonds-ecran";
import {
  CALENDAR_THEME_ORDER,
  calendarThemeTokens,
} from "@/components/calendar/calendar-theme";
import type { EtatCalendrier } from "@/components/calendar/studio/etat";
import type { CalendarTheme } from "@/types/database";

/**
 * LE CONTENU DES ÉTAPES DU STUDIO DU CALENDRIER (VIT-39).
 *
 * ── AUCUN CONTRÔLE DE CE FICHIER NE PORTE DE `name` ──
 *
 * C'est la règle du socle, et elle ne se négocie pas : une étape qu'on quitte
 * est DÉMONTÉE. Un `name` posé ici disparaîtrait du formulaire de réglages, et
 * l'enregistrement automatique suivant effacerait la colonne — sur une action
 * qui réécrit treize champs en bloc, c'est-à-dire sans un mot.
 *
 * Tout écrit donc dans `EtatCalendrier` par `majEtat` ; la charge utile est
 * rendue à part, en entier, par `ChampsCachesCalendrier`.
 */

const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500";

export interface ProprietesEtape {
  etat: EtatCalendrier;
  majEtat: (patch: Partial<EtatCalendrier>) => void;
  peutEditer: boolean;
}

function TitreEtape({
  titre,
  aide,
}: {
  titre: string;
  aide: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-black text-k-ink">{titre}</h2>
      <p className="mt-1 text-sm text-k-body">{aide}</p>
    </div>
  );
}

// ── 1. Le nom ───────────────────────────────────────────────

export function EtapeNom({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Le nom de votre calendrier"
        aide="Il s'affiche en grand, en haut de la page que voient vos clients."
      />
      <div className="max-w-sm">
        <Label htmlFor="studio-cal-nom">Nom du calendrier</Label>
        <Input
          id="studio-cal-nom"
          value={etat.name}
          onChange={(e) => majEtat({ name: e.target.value })}
          disabled={!peutEditer}
          maxLength={120}
          placeholder="Ex : Notre calendrier de l'Avent"
        />
      </div>
    </div>
  );
}

// ── 2. L'allure ─────────────────────────────────────────────

function TuileTheme({
  cle,
  active,
  onSelect,
  disabled,
}: {
  cle: CalendarTheme;
  active: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const tokens = calendarThemeTokens(cle);
  const fond = fondPourTheme(cle);
  return (
    <label
      className={`cursor-pointer rounded-2xl border-2 p-2.5 transition-colors ${
        active
          ? "border-k-ink bg-k-yellow/20 shadow-[3px_3px_0_var(--color-k-ink)]"
          : "border-k-ink/20 bg-white hover:border-k-ink/50"
      }`}
    >
      {/* Radio en `sr-only` sous un `label` : l'ensemble reste un groupe de
          boutons radio pour un lecteur d'écran, navigable aux flèches, alors
          qu'il se lit comme une planche d'images. Aucun `name` de charge
          utile : `theme-choice` ne sert qu'au groupement natif, et ce
          formulaire-ci n'existe pas. */}
      <input
        type="radio"
        name="studio-cal-theme-choice"
        value={cle}
        checked={active}
        onChange={onSelect}
        disabled={disabled}
        className="sr-only"
      />
      {/* `relative` + fond en premier enfant : même empilement que la page
          publique (ordre du DOM, aucun z-index). */}
      <div
        aria-hidden
        className="relative mb-2 flex items-center gap-1.5 overflow-hidden rounded-lg border-2 border-k-ink p-1.5"
        style={tokens.pageStyle}
      >
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
}

function TuileFond({
  label,
  fond,
  active,
  onSelect,
  disabled,
}: {
  label: string;
  fond?: FondKey;
  active: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <label
      className={`cursor-pointer rounded-2xl border-2 p-2 transition-colors ${
        active
          ? "border-k-ink bg-k-yellow/20 shadow-[3px_3px_0_var(--color-k-ink)]"
          : "border-k-ink/20 bg-white hover:border-k-ink/50"
      }`}
    >
      <input
        type="radio"
        name="studio-cal-fond-choice"
        value={fond ?? label}
        checked={active}
        onChange={onSelect}
        disabled={disabled}
        className="sr-only"
      />
      <div
        aria-hidden
        className="relative mb-1.5 h-12 overflow-hidden rounded-lg border-2 border-k-ink bg-k-bg"
      >
        {fond && <FondEcran fond={fond} variant="vignette" />}
      </div>
      <p className="flex items-center justify-between gap-1 text-xs font-black text-k-ink">
        <span className="min-w-0 truncate">{label}</span>
        {active && <span className="shrink-0 text-k-green">✓</span>}
      </p>
    </label>
  );
}

export function EtapeAllure({
  etat,
  majEtat,
  peutEditer,
  logoUrl,
}: ProprietesEtape & { logoUrl: string | null }) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="L'allure de la page"
        aide="Les couleurs, les emoji et la grande image de fond. Tout se voit à droite, en direct."
      />

      <fieldset>
        <legend className="mb-1 text-sm font-bold text-k-ink">
          Thème saisonnier
        </legend>
        <p className="mb-3 text-xs text-zinc-500">
          Le fond du thème n&apos;est qu&apos;un défaut : vous pouvez en imposer
          un autre juste en dessous.
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {CALENDAR_THEME_ORDER.map((cle) => (
            <TuileTheme
              key={cle}
              cle={cle}
              active={cle === etat.theme}
              onSelect={() => majEtat({ theme: cle })}
              disabled={!peutEditer}
            />
          ))}
        </div>
      </fieldset>

      {/* LE LOGO NE SE RÈGLE PAS ICI, ET NE LE SERA PAS : il appartient à
          l'établissement, pas au calendrier, et il est déjà servi par sept
          autres surfaces. Ce bloc MONTRE ce qui est en place et ouvre la
          porte — une capacité sans chemin pour l'atteindre est une capacité
          que personne ne sait avoir. */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border-2 border-k-ink/20 bg-white p-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Logo de votre établissement"
            width={48}
            height={48}
            className="h-12 w-12 rounded-full border-2 border-k-ink bg-white object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-k-ink/40 text-lg text-k-body"
          >
            🏷️
          </div>
        )}
        <p className="min-w-0 flex-1 text-xs text-zinc-500">
          {logoUrl
            ? "Votre logo s'affiche en haut du calendrier, au-dessus du nom de votre établissement."
            : "Sans logo, vos clients voient l'emoji du thème. Un logo rend la page immédiatement reconnaissable."}{" "}
          <Link
            href="/dashboard/settings"
            className="font-bold text-k-ink underline underline-offset-2"
          >
            {logoUrl ? "Changer de logo" : "Ajouter un logo"}
          </Link>
        </p>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-bold text-k-ink">
          Fond d&apos;écran
        </legend>
        <p className="mb-2.5 text-xs text-zinc-500">
          La grande image derrière le calendrier. Par défaut elle suit le thème
          choisi ci-dessus ; vous pouvez en imposer une autre, ou n&apos;en
          mettre aucune.
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <TuileFond
            label="Suivre le thème"
            active={etat.fond_key === ""}
            onSelect={() => majEtat({ fond_key: "" })}
            disabled={!peutEditer}
          />
          <TuileFond
            label="Aucun"
            active={etat.fond_key === AUCUN_FOND}
            onSelect={() => majEtat({ fond_key: AUCUN_FOND })}
            disabled={!peutEditer}
          />
          {FOND_KEYS.map((cle) => (
            <TuileFond
              key={cle}
              label={FOND_LABELS[cle]}
              fond={cle}
              active={etat.fond_key === cle}
              onSelect={() => majEtat({ fond_key: cle })}
              disabled={!peutEditer}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

// ── 3. Les dates ────────────────────────────────────────────

export function EtapeDates({
  etat,
  majEtat,
  peutEditer,
  dayCountInitial,
  garnies,
  confirmeSuppression,
  onConfirmeSuppression,
  refusSuppression,
}: ProprietesEtape & {
  /** La valeur EN BASE, celle qui décide de la suspension. */
  dayCountInitial: string;
  /** Combien de cases ont déjà quelque chose à perdre. */
  garnies: number;
  confirmeSuppression: boolean;
  onConfirmeSuppression: (coche: boolean) => void;
  /** L'action a refusé faute de confirmation. */
  refusSuppression: boolean;
}) {
  const grilleModifiee = etat.day_count !== dayCountInitial;

  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Les dates"
        aide="Chaque case s'ouvre un jour après la précédente, à partir de la date de départ."
      />

      {/* L'AVERTISSEMENT DE L'ORDRE, à l'endroit où il se joue : revenir ici
          après avoir garni la grille peut détruire les dernières cases
          (`syncCalendarDays` supprime au-delà du nouveau `day_count`). Il
          n'est montré que s'il y a quelque chose à perdre. */}
      {garnies > 0 && (
        <p className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          <span aria-hidden>⚠️ </span>
          {garnies} case{garnies > 1 ? "s" : ""} déjà garnie
          {garnies > 1 ? "s" : ""} : réduire le nombre de cases supprimera les
          dernières, avec leur contenu et les codes CADEAU- qu&apos;elles ont
          distribués. Une confirmation vous sera demandée avant.
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        <div>
          <Label htmlFor="studio-cal-start">Date de départ (1re case)</Label>
          <Input
            id="studio-cal-start"
            type="date"
            value={etat.start_date}
            onChange={(e) => majEtat({ start_date: e.target.value })}
            disabled={!peutEditer}
            className="w-48"
          />
        </div>
        <div>
          <Label htmlFor="studio-cal-daycount">Nombre de cases</Label>
          <Input
            id="studio-cal-daycount"
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={etat.day_count}
            onChange={(e) => majEtat({ day_count: e.target.value })}
            disabled={!peutEditer}
            className="w-32"
            aria-describedby="studio-cal-daycount-help"
          />
          <p
            id="studio-cal-daycount-help"
            className="mt-1.5 text-xs text-zinc-500"
          >
            Avent = 24, semaine = 7… (60 maximum).
          </p>
          {grilleModifiee && (
            <p
              role="status"
              className="mt-1.5 max-w-xs text-xs font-bold text-amber-800"
            >
              Le changement du nombre de cases s&apos;enregistre avec le bouton
              (une confirmation peut être demandée).
            </p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="studio-cal-tz">Fuseau horaire</Label>
        <Input
          id="studio-cal-tz"
          value={etat.timezone}
          onChange={(e) => majEtat({ timezone: e.target.value })}
          disabled={!peutEditer}
          maxLength={64}
          placeholder="Europe/Paris"
          className="w-64 font-mono"
          aria-describedby="studio-cal-tz-help"
        />
        <p id="studio-cal-tz-help" className="mt-1.5 text-xs text-zinc-500">
          Détermine l&apos;heure d&apos;ouverture des cases (minuit dans ce
          fuseau). Par défaut, celui de votre établissement.
        </p>
      </div>

      <InfoBulle
        id="studio-cal-aide-grille"
        resume="Que devient le contenu déjà saisi si je change ces réglages ?"
      >
        Modifier la date de départ recalcule toutes les dates d&apos;ouverture —
        le contenu des cases est conservé. En revanche,{" "}
        <strong>réduire le nombre de cases supprime les dernières</strong> :
        leur contenu, les ouvertures déjà faites par vos clients et les codes
        CADEAU- distribués partent avec elles. Une confirmation vous sera
        demandée, chiffres à l&apos;appui, avant que ce soit fait.
      </InfoBulle>

      {/* La case n'apparaît PAS d'emblée : elle ne sert qu'après le refus de
          l'action, lequel NOMME le nombre de cases supprimées et le nombre de
          codes CADEAU- qui deviendraient introuvables. Demander la
          confirmation avant de connaître le coût serait du bruit ; la demander
          après, c'est un choix informé. */}
      {refusSuppression && (
        <label className="flex items-start gap-2 text-sm font-semibold text-red-700">
          <input
            type="checkbox"
            checked={confirmeSuppression}
            onChange={(e) => onConfirmeSuppression(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          Je comprends que les cases retirées et les codes qu&apos;elles ont
          distribués seront définitivement perdus.
        </label>
      )}
    </div>
  );
}

// ── 5. Le cadeau de fin ─────────────────────────────────────

export function EtapeCadeau({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Le cadeau de fin"
        aide="Le cadeau remis au client qui a ouvert TOUTES les cases (code CADEAU-… présenté en caisse). Laissez le stock à 0 pour ne pas en proposer."
      />
      <div>
        <Label htmlFor="studio-cal-reward-label">Cadeau final</Label>
        <Input
          id="studio-cal-reward-label"
          value={etat.completion_reward_label}
          onChange={(e) => majEtat({ completion_reward_label: e.target.value })}
          disabled={!peutEditer}
          maxLength={120}
          placeholder="Ex : Un bon d'achat de 20 €"
        />
      </div>
      <div>
        <Label htmlFor="studio-cal-reward-details">Détails (optionnel)</Label>
        <textarea
          id="studio-cal-reward-details"
          value={etat.completion_reward_details}
          onChange={(e) =>
            majEtat({ completion_reward_details: e.target.value })
          }
          disabled={!peutEditer}
          maxLength={2000}
          rows={2}
          placeholder="Conditions, validité, modalités de retrait…"
          className={textareaClass}
        />
      </div>
      <div>
        <Label htmlFor="studio-cal-reward-stock">
          Nombre de cadeaux (stock, obligatoire)
        </Label>
        <Input
          id="studio-cal-reward-stock"
          type="number"
          inputMode="numeric"
          min={0}
          max={1_000_000}
          value={etat.completion_reward_stock}
          onChange={(e) => majEtat({ completion_reward_stock: e.target.value })}
          disabled={!peutEditer}
          className="w-40"
          aria-describedby="studio-cal-reward-stock-help"
        />
        <p
          id="studio-cal-reward-stock-help"
          className="mt-1.5 text-xs text-zinc-500"
        >
          Plafonne les cadeaux d&apos;assiduité : au-delà, plus aucun code
          n&apos;est émis, quel que soit le nombre de participants (0 = pas de
          cadeau final).
        </p>
      </div>
    </div>
  );
}

// ── 6. Les codes en caisse ──────────────────────────────────

export function EtapeCodes({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Les codes en caisse"
        aide="Un seul réglage pour deux émissions : le CADEAU- d'une case, et celui du cadeau de fin."
      />
      {/* `champCache={false}` : dans un studio, la charge utile est rendue par
          `ChampsCachesCalendrier` et par lui seul. Le champ caché du composant
          vivrait ici, dans une étape démontable et HORS du formulaire de
          réglages — il ne partirait jamais tout en donnant l'illusion d'une
          charge complète. */}
      <fieldset disabled={!peutEditer}>
        <CodeTtlDaysField
          idPrefix="studio-cal"
          legend="Expiration des codes de retrait"
          value={etat.code_ttl_days}
          onChange={(next) => majEtat({ code_ttl_days: next })}
          champCache={false}
          emissionHint="Délai laissé au client pour présenter un code CADEAU- en caisse, à partir de l'OUVERTURE de la case qui l'a donné — et, pour le cadeau d'assiduité, à partir de l'ouverture de la dernière case."
        />
      </fieldset>
    </div>
  );
}

// ── 7. Mon message ──────────────────────────────────────────

export function EtapeMessage({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Mon message"
        aide="Ce que vous écrivez ici s'affiche sur la page suivie par vos clients, sous la progression."
      />
      <div>
        <Label htmlFor="studio-cal-merchant">
          Vos actualités sur la page (optionnel)
        </Label>
        <textarea
          id="studio-cal-merchant"
          value={etat.merchant_content}
          onChange={(e) => majEtat({ merchant_content: e.target.value })}
          disabled={!peutEditer}
          maxLength={4000}
          rows={4}
          placeholder="Offres du moment, horaires… Ce texte s'affiche sur la page suivie par vos clients."
          className={textareaClass}
        />
      </div>

      <div>
        <Label htmlFor="studio-cal-slug">URL publique</Label>
        <div className="flex flex-wrap items-center gap-1 text-sm text-zinc-500">
          <span className="font-mono">…/calendar/</span>
          <Input
            id="studio-cal-slug"
            value={etat.public_slug}
            onChange={(e) => majEtat({ public_slug: e.target.value })}
            disabled={!peutEditer}
            maxLength={64}
            pattern="[a-z0-9-]{3,64}"
            placeholder="mon-calendrier"
            className="w-56 font-mono"
            aria-describedby="studio-cal-slug-help"
          />
        </div>
        <p id="studio-cal-slug-help" className="mt-1.5 text-xs text-zinc-500">
          Une adresse lisible pour le QR et le partage (3 à 64 caractères : a-z,
          0-9, tirets).
        </p>
        <InfoBulle
          id="studio-cal-aide-slug"
          resume="Puis-je la changer après avoir imprimé le QR code ?"
          className="mt-2"
        >
          Techniquement oui, mais l&apos;ancienne adresse ne répondra plus : les
          affiches déjà collées en vitrine mèneraient vers une page introuvable
          — et un calendrier se suit sur plusieurs semaines. Changez-la avant
          d&apos;imprimer, ou réimprimez le QR après.
        </InfoBulle>
      </div>

      {/* AUCUN CHAMP POUR LE BAS DE PAGE, ET C'EST VOLONTAIRE : les quatre
          portes (Vitrine, réseaux, Passeport, Jackpot) se déclarent seules à
          partir de ce que le commerçant a DÉJÀ renseigné ailleurs. Les
          redemander ici aurait créé deux vérités pour la même adresse
          Instagram. Mais une capacité qui s'active toute seule est une
          capacité que personne ne sait avoir : ce bloc la NOMME. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-k-ink">
          Bas de la page de vos clients
        </legend>
        <p className="text-xs text-zinc-500">
          Sous la grille, vos clients se voient proposer de garder le lien avec
          votre commerce. Rien à saisir : ces portes apparaissent seules, à
          partir de ce que vous avez déjà renseigné.
        </p>
        <ul className="space-y-1.5 rounded-2xl border-2 border-k-ink/20 bg-white p-3">
          {(
            [
              ["📖", "Votre Vitrine", "dès qu'elle est publiée"],
              [
                "⭐",
                "Avis Google, Instagram, TikTok",
                "les liens de vos réglages",
              ],
              ["🎟️", "Votre Passeport de fidélité", "si un programme est actif"],
              ["🎰", "Votre Jackpot collectif", "si une campagne est active"],
            ] as const
          ).map(([emoji, titre, ou]) => (
            <li key={titre} className="flex gap-2 text-xs text-zinc-600">
              <span aria-hidden>{emoji}</span>
              <span>
                <span className="font-bold text-k-ink">{titre}</span> — {ou}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-zinc-500">
          Vos liens Google, Instagram et TikTok se règlent dans{" "}
          <Link
            href="/dashboard/settings"
            className="font-bold text-k-ink underline underline-offset-2"
          >
            les réglages de l&apos;établissement
          </Link>
          .
        </p>
      </fieldset>
    </div>
  );
}
