"use client";

import Link from "next/link";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FondEcran } from "@/components/ui/fond-ecran";
import {
  AUCUN_FOND,
  FOND_KEYS,
  FOND_LABELS,
  fondPourTheme,
  type FondKey,
} from "@/lib/fonds-ecran";
import {
  CONTEST_THEME_ORDER,
  contestThemeTokens,
} from "@/components/pronos/contest-theme";
import {
  CODE_TTL_MAX_DAYS,
  CODE_TTL_MIN_DAYS,
  formatTtlSeconds,
} from "@/components/pronos/contest-code-ttl";
import type { EtatContest } from "@/components/pronos/studio/etat";
import type { SeasonalTheme } from "@/types/database";

/**
 * LE CONTENU DES ÉTAPES DU STUDIO DU CHAMPIONNAT (VIT-43).
 *
 * ── AUCUN CONTRÔLE DE CE FICHIER NE PORTE DE `name` ──
 *
 * C'est la règle du socle, et elle ne se négocie pas : une étape qu'on quitte
 * est DÉMONTÉE. Un `name` posé ici disparaîtrait du formulaire de réglages, et
 * l'enregistrement automatique suivant effacerait la colonne — sans un mot, sur
 * une action qui écrit six champs et dont l'atelier ne rend jamais tous les
 * discriminants à la fois.
 *
 * Tout écrit donc dans `EtatContest` par `majEtat` ; la charge utile est rendue
 * à part, en entier, par `ChampsCachesContest`.
 *
 * Les radios portent bien un attribut `name` (`studio-contest-theme-choice`,
 * `studio-contest-fond-choice`) : il ne sert QU'au groupement natif du
 * navigateur — c'est ce qui rend la planche navigable aux flèches pour un
 * lecteur d'écran — et ces contrôles ne vivent dans aucun `<form>`. Ils ne
 * peuvent donc entrer dans aucune charge utile. La garde du fichier de tests
 * vise le formulaire des réglages, et lui seul, pour cette raison exacte.
 */

export interface ProprietesEtape {
  etat: EtatContest;
  majEtat: (patch: Partial<EtatContest>) => void;
  /** Le verdict du GEL — voir `reglagesEditablesContest`. */
  peutEditer: boolean;
}

function TitreEtape({ titre, aide }: { titre: string; aide: React.ReactNode }) {
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
        titre="Le nom du championnat"
        aide="Il s'affiche en grand, en haut de la page que suivent vos clients — vous le voyez changer dans l'aperçu."
      />
      <div className="max-w-sm">
        <Label htmlFor="studio-contest-nom">Nom du championnat</Label>
        <Input
          id="studio-contest-nom"
          value={etat.name}
          onChange={(e) => majEtat({ name: e.target.value })}
          disabled={!peutEditer}
          maxLength={120}
          placeholder="Ex : Le championnat du comptoir"
        />
      </div>
    </div>
  );
}

// ── 2. Ce que je demande à l'inscription ────────────────────

export function EtapeInscription({
  etat,
  majEtat,
  peutEditer,
  ttlEditable,
  ttlStocke,
}: ProprietesEtape & {
  /** La durée en base se laisse-t-elle écrire en jours entiers ? */
  ttlEditable: boolean;
  /** La valeur RÉELLE en base, montrée quand le champ est gelé. */
  ttlStocke: number | null;
}) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Ce que je demande à l'inscription"
        aide="Vos clients donnent un pseudo et choisissent un avatar. Ces deux coordonnées sont facultatives : chacune ajoute un champ au formulaire, donc une raison d'abandonner."
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-k-ink">
          Données demandées
        </legend>
        <label className="flex items-center gap-2 text-sm text-k-body">
          <input
            type="checkbox"
            checked={etat.collect_email}
            onChange={(e) => majEtat({ collect_email: e.target.checked })}
            disabled={!peutEditer}
            className="h-4 w-4 accent-k-ink"
          />
          Email
        </label>
        <label className="flex items-center gap-2 text-sm text-k-body">
          <input
            type="checkbox"
            checked={etat.collect_phone}
            onChange={(e) => majEtat({ collect_phone: e.target.checked })}
            disabled={!peutEditer}
            className="h-4 w-4 accent-k-ink"
          />
          Téléphone
        </label>
      </fieldset>

      <div className="border-t border-zinc-100 pt-4">
        <p className="text-sm font-bold text-k-ink mb-1">
          Expiration des codes de retrait
        </p>
        <p id="studio-contest-ttl-aide" className="text-xs text-zinc-500 mb-2">
          Délai laissé au gagnant pour présenter son code en caisse, à partir de
          la clôture du championnat. Les codes déjà émis gardent leur échéance.
        </p>
        {ttlEditable ? (
          <>
            <div className="w-32">
              <Label htmlFor="studio-contest-ttl">Validité (jours)</Label>
              <Input
                id="studio-contest-ttl"
                type="number"
                inputMode="numeric"
                min={CODE_TTL_MIN_DAYS}
                max={CODE_TTL_MAX_DAYS}
                step={1}
                value={etat.code_ttl_days}
                onChange={(e) => majEtat({ code_ttl_days: e.target.value })}
                disabled={!peutEditer}
                placeholder="Sans limite"
                aria-describedby="studio-contest-ttl-aide studio-contest-ttl-bornes"
              />
            </div>
            <p id="studio-contest-ttl-bornes" className="mt-1 text-xs text-zinc-500">
              Laisser vide = pas d&apos;expiration ; sinon entre{" "}
              {CODE_TTL_MIN_DAYS} et {CODE_TTL_MAX_DAYS} jours.
            </p>
          </>
        ) : (
          /* LECTURE SEULE, ET AUCUN CHAMP CACHÉ NON PLUS (voir
             `contest-code-ttl.ts`) : ce studio enregistre tout seul, un champ
             rendu ici écraserait au premier réglage d'apparence une durée que
             le formulaire ne sait pas représenter. */
          <div className="w-fit">
            <p className="text-sm font-bold text-k-ink mb-1">Validité actuelle</p>
            <p className="rounded-xl border-2 border-zinc-300 bg-zinc-100 px-3.5 py-2.5 text-sm text-zinc-600">
              {ttlStocke !== null ? formatTtlSeconds(ttlStocke) : "Sans limite"}
            </p>
            <p className="mt-1 max-w-md text-xs text-zinc-500">
              🔒 Réglée hors interface. Cet écran ne sait saisir que des jours
              entiers ({CODE_TTL_MIN_DAYS} à {CODE_TTL_MAX_DAYS}) : il
              écraserait cette durée en l&apos;enregistrant, il ne la touche donc
              pas. Contactez le support pour la modifier.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 3. L'allure ─────────────────────────────────────────────

function TuileTheme({
  cle,
  active,
  onSelect,
  disabled,
}: {
  cle: SeasonalTheme;
  active: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const tokens = contestThemeTokens(cle);
  const fond = fondPourTheme(cle);
  return (
    <label
      className={`cursor-pointer rounded-2xl border-2 p-2.5 transition-colors ${
        active
          ? "border-k-ink bg-k-yellow/20 shadow-[3px_3px_0_var(--color-k-ink)]"
          : "border-k-ink/20 bg-white hover:border-k-ink/50"
      }`}
    >
      <input
        type="radio"
        name="studio-contest-theme-choice"
        value={cle}
        checked={active}
        onChange={onSelect}
        disabled={disabled}
        className="sr-only"
      />
      <div
        aria-hidden
        className="relative mb-2 flex items-center gap-1.5 overflow-hidden rounded-lg border-2 border-k-ink p-1.5"
        style={tokens.pageStyle}
      >
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
        name="studio-contest-fond-choice"
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

export function EtapeAllure({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="L'allure"
        aide="Les couleurs et le fond d'écran de la page suivie par vos joueurs. La DA « carton kermesse » ne bouge pas — c'est la teinte qui change, et l'aperçu la montre en direct."
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
          {CONTEST_THEME_ORDER.map((cle) => (
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

      <fieldset>
        <legend className="mb-1 text-sm font-bold text-k-ink">
          Fond d&apos;écran
        </legend>
        <p className="mb-2.5 text-xs text-zinc-500">
          La grande image derrière le championnat. Par défaut elle suit le thème
          ci-dessus ; vous pouvez en imposer une autre, ou n&apos;en mettre
          aucune.
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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

// ── 5. Les questions bonus — l'avertissement qui vaut le détour ──

/**
 * UNE QUESTION POSÉE NE SE MODIFIE PLUS, et l'écran ne doit pas le suggérer.
 *
 * La corriger veut dire la SUPPRIMER — les réponses déjà données partent avec
 * elle — puis la recréer. `ContestQuestionsCard` ne propose donc aucun bouton
 * « Modifier », et l'étape le dit AVANT la liste plutôt qu'en note de bas de
 * carte : c'est avant de valider que l'information sert.
 */
export function AvertissementQuestions() {
  return (
    <InfoBulle
      id="studio-aide-questions-pronostics"
      resume="Puis-je corriger une question après l'avoir posée ?"
      defaultOpen
    >
      Non : une question posée ne se modifie plus. Pour la corriger, il faut la
      supprimer — et les réponses déjà données par vos joueurs partent avec
      elle — puis la recréer. Relisez donc l&apos;intitulé et les propositions
      avant de valider : c&apos;est le seul moment où cela ne coûte rien.
    </InfoBulle>
  );
}

// ── 7. Les points, quand il n'y a encore rien à noter ────────

/**
 * LE BARÈME PEUT N'AVOIR AUCUNE MATIÈRE, ET CE N'EST PAS UNE PANNE.
 *
 * `ContestScoringForm` ne montre que les paliers des types de questions
 * RÉELLEMENT créés. Sur un événement générique encore vide, il n'afficherait
 * qu'un bloc « score » qui ne servira jamais — d'où la dépendance d'ordre entre
 * « Les questions bonus » et « Les points », déjà inscrite dans l'atelier.
 *
 * Ce qu'on rend alors n'est pas un écran blanc mais une phrase et un CHEMIN :
 * le bouton ramène à l'étape qui crée la matière. Dans le studio, changer
 * d'étape est un simple changement d'état — donc pas un aller-retour serveur,
 * donc rien de ce que le commerçant est en train d'essayer n'est perdu.
 */
export function EtapeBaremeSansMatiere({
  onAllerAuxQuestions,
}: {
  onAllerAuxQuestions: () => void;
}) {
  return (
    <Card>
      <h2 className="font-semibold mb-1">Rien à noter pour l&apos;instant</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Le barème dépend des types de questions que vous avez créés : tant que
        votre événement n&apos;en porte aucune, il n&apos;y a pas de palier à
        régler. Posez d&apos;abord vos questions, les paliers correspondants
        apparaîtront ici.
      </p>
      <button
        type="button"
        onClick={onAllerAuxQuestions}
        className="inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
      >
        Revenir à l&apos;étape « Les questions bonus »
      </button>
    </Card>
  );
}

// ── 8. Ce qui reste au tableau de bord ───────────────────────

/**
 * LE STUDIO PRÉPARE, LE TABLEAU DE BORD EXPLOITE — et il faut le dire.
 *
 * Le classement, le palmarès, la clôture, la suppression et la saisie des
 * résultats ne sont pas OUBLIÉS : ils n'ont rien à faire dans un fil de
 * préparation, et une clôture DÉFINITIVE croisée entre deux réglages
 * d'apparence serait un accident qui attend. Un écran qui les tait sans dire où
 * ils sont laisse pourtant croire qu'ils ont disparu ; celui-ci nomme la porte.
 */
export function OuVaLeReste({ hrefSuivi }: { hrefSuivi: string }) {
  return (
    <Card>
      <h2 className="font-semibold mb-1">Ce qui se passe après l&apos;ouverture</h2>
      <p className="text-sm text-zinc-500 mb-3">
        Le classement de vos joueurs, la saisie des résultats, le palmarès et la
        clôture — définitive — vivent sur le suivi du championnat. Ce studio ne
        sert qu&apos;à le préparer.
      </p>
      <Link
        href={hrefSuivi}
        className="inline-flex rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-black text-k-ink hover:bg-k-yellow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
      >
        Aller au suivi du championnat
      </Link>
    </Card>
  );
}
