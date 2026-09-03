"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createLoyaltyMilestone,
  deleteLoyaltyMilestone,
  deleteLoyaltyProgram,
  setLoyaltyProgramStatus,
  updateLoyaltyMilestone,
  updateLoyaltyProgram,
  updateLoyaltyProgramReferral,
  updateLoyaltyProgramStyle,
} from "@/actions/loyalty";
import { ApercuPasseport } from "@/components/dashboard/apercu-passeport";
import { AutoSaveEtat } from "@/components/dashboard/auto-save-etat";
import { SelecteurFond } from "@/components/dashboard/selecteur-fond";
import { resolveLoyaltyStyle } from "@/lib/loyalty-style";
import type { FondKey } from "@/lib/fonds-ecran";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CodeTtlDaysField,
  codeTtlDaysInitial,
} from "@/components/dashboard/code-ttl-days-field";
import { InfoBulle, infoBulleTexteId } from "@/components/dashboard/info-bulle";
import { CarteStatutAnimation } from "@/components/dashboard/carte-statut-animation";
import { LoyaltyStatusBadge } from "@/components/dashboard/loyalty-status";
import type { LoyaltyProgramStatus } from "@/types/database";
import { RaccourciAtelier, VoirLeJeu } from "@/components/dashboard/atelier-raccourci";
import { hrefEtapeFidelite } from "@/components/dashboard/atelier-loyalty-etapes";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import {
  LOYALTY_MILESTONE_LOSS_HINT,
  LOYALTY_PROGRAM_LOSS_HINT,
} from "@/lib/validations/loyalty";
import type {
  LoyaltyMilestone,
  LoyaltyProgram,
  LoyaltyRewardType,
  LoyaltyValidationMode,
} from "@/types/database";
import {
  clampLoyaltyPeriod,
  formatDurationLabel,
  loyaltyPeriodOptions,
  resolveLoyaltyCooldown,
  spinWheelIssue,
  type SpinWheelPrizes,
  LOYALTY_DEFAULT_LOT_STOCK,
  LOYALTY_MAX_LOT_STOCK,
  LOYALTY_MILESTONE_MAX_COST_POINTS,
  LOYALTY_MILESTONE_MIN_COST_POINTS,
  LOYALTY_POINTS_PAR_VISITE,
} from "./loyalty-settings-presets";

/**
 * Roue de l'organisation, pour cibler un tour offert — avec l'état de ses lots.
 * Le diagnostic (`spinWheelIssue`) sert à AVERTIR le commerçant : depuis
 * 20260725200000, un tour offert n'est jamais tiré sur un lot à stock illimité.
 */
export interface WheelOption extends SpinWheelPrizes {
  id: string;
  name: string;
}

/** Jackpot caisse actif proposé au rattachement d'un passeport. */
export interface LoyaltyJackpotOption {
  id: string;
  name: string;
  minParticipationIntervalSeconds: number;
}

const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";
const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

// Vaut pour les cinq formulaires de cet écran :
// useActionForm et non useActionState : l'état de chargement doit retomber même
// quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
// Seule exception, assumée : la suppression du programme, qui redirige (voir
// LoyaltyStatusControls, en bas de fichier).

// ────────────────────────────────────────────────────────────
// Réglages du programme
// ────────────────────────────────────────────────────────────

export function LoyaltySettings({
  program,
  jackpots,
}: {
  program: LoyaltyProgram;
  jackpots: LoyaltyJackpotOption[];
}) {
  // Pas de `resetOnSuccess` : name, silver_threshold et gold_threshold sont des
  // champs non contrôlés dont le `defaultValue` reste celui d'avant
  // l'enregistrement jusqu'à l'atterrissage de `router.refresh()` — les vider
  // ferait réapparaître les anciennes valeurs à l'écran.
  //
  // ENREGISTREMENT AUTOMATIQUE. `useAutoSave` s'ajoute À CÔTÉ de `useActionForm`
  // — jamais autour : deux gardes mécaniques du dépôt cherchent l'appel
  // littéral. Le bouton et le « Enregistré. » restent en place.
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useActionForm(updateLoyaltyProgram, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  const { enAttente, bloqueParValidation } = useAutoSave(formRef);

  // Mode, rotation et fréquence sont liés : en « Code au comptoir » la base
  // impose un intervalle d'au moins max(rotation, 5 min). On garde donc ces
  // trois champs contrôlés pour n'offrir que des combinaisons acceptées, et
  // corriger d'office une valeur devenue invalide au changement de mode.
  const [mode, setMode] = useState<LoyaltyValidationMode>(program.validation_mode);
  // Un programme enregistré avant le durcissement des bornes peut porter une
  // rotation hors 15..300 s : on la ramène dans la plage proposée.
  const [periodSeconds, setPeriodSeconds] = useState(() =>
    clampLoyaltyPeriod(program.rotating_period_seconds),
  );
  const [cooldownSeconds, setCooldownSeconds] = useState(
    program.min_stamp_interval_seconds,
  );
  const [codeTtlDays, setCodeTtlDays] = useState(() =>
    codeTtlDaysInitial(program.code_ttl_days),
  );

  const periodOptions = loyaltyPeriodOptions(periodSeconds);
  const cooldown = resolveLoyaltyCooldown({ mode, periodSeconds, cooldownSeconds });

  return (
    <Card>
      <h2 className="font-semibold mb-1">Réglages</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Nom, façon de valider une visite et fréquence des visites. Les niveaux
        se règlent à l&apos;étape « Les récompenses », avec les paliers
        qu&apos;ils accompagnent.
      </p>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
        <input type="hidden" name="id" value={program.id} />

        <div className="max-w-sm">
          <Label htmlFor="loyalty-name">Nom du programme</Label>
          <Input
            id="loyalty-name"
            name="name"
            defaultValue={program.name}
            required
            maxLength={80}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-k-ink mb-1">
            Comment valider une visite ?
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
                change régulièrement. Le client le saisit sur son passeport.
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
                Le client présente le QR de son passeport ; vous le scannez en
                caisse pour valider la visite.
              </span>
            </span>
          </label>
        </fieldset>

        {/* LES SEUILS SE RÈGLENT À L'ÉTAPE « Les récompenses » — MAIS ILS
            RESTENT POSTÉS ICI, et ce n'est pas une commodité.
            `updateLoyaltyProgram` fait un `.update(fields)` de TOUTES les
            colonnes de son schéma : un champ retiré du formulaire arriverait à
            `null`, ce que `tierThresholdSchema` refuse (« Données invalides »)
            — et qu'une borne plus permissive aurait écrasé à 0 en silence.
            Les deux formulaires postent donc le programme ENTIER, chacun ne
            rendant VISIBLE que sa part ; le refine « seuil or > seuil argent »
            continue de s'appliquer des deux côtés. Aucune divergence possible :
            ils vivent sur des étapes différentes, jamais à l'écran ensemble, et
            chacun repart de la valeur serveur. */}
        <input
          type="hidden"
          name="silver_threshold"
          value={program.silver_threshold}
        />
        <input
          type="hidden"
          name="gold_threshold"
          value={program.gold_threshold}
        />

        {/* EXCLUSIF AU CODE AU COMPTOIR. En « Validation en caisse » la
            rotation ne gouverne rien : elle restait pourtant réglable, et
            laissait croire qu'un code tournait là où le mode n'en émet aucun.
            Elle quitte l'écran — mais la valeur ENREGISTRÉE continue d'être
            postée en champ caché : `rotatingPeriodSchema` est un
            `entierRequis`, où un champ non rendu vaut un REFUS explicite, et
            revenir au mode comptoir doit retrouver le réglage d'avant plutôt
            qu'un zéro. Le plancher de cooldown (validations/loyalty.ts) lit
            donc toujours une rotation réelle.
            PAS DE SYMÉTRIQUE À MASQUER DANS L'AUTRE SENS : le seul réglage
            propre à la caisse est le jackpot associé (le refine l'exige en
            mode `staff`), et le cacher en mode comptoir rendrait INSOLUBLE le
            refus « Un jackpot associé exige la validation en caisse » — il ne
            resterait aucun champ où le dissocier. Il reste visible. */}
        {mode === "staff" ? (
          <input
            type="hidden"
            name="rotating_period_seconds"
            value={periodSeconds}
          />
        ) : (
        <div>
          <Label htmlFor="loyalty-period">Rotation du code au comptoir</Label>
          <select
            id="loyalty-period"
            name="rotating_period_seconds"
            value={periodSeconds}
            onChange={(e) => setPeriodSeconds(Number(e.target.value))}
            className={`${selectClass} max-w-sm`}
            aria-describedby={infoBulleTexteId("aide-loyalty-rotation")}
          >
            {periodOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <InfoBulle
            id="aide-loyalty-rotation"
            resume="Faut-il une rotation courte ou longue ?"
            className="mt-2 max-w-sm"
          >
            Ce réglage n&apos;est utilisé qu&apos;en mode « Code au comptoir » :
            plus la rotation est courte, plus il est difficile de tricher à
            distance — un code photographié puis envoyé à un ami expire vite (5
            minutes au maximum). En contrepartie, elle relève le délai minimal
            entre deux visites, qui vaut le double de la rotation.
          </InfoBulle>
        </div>
        )}

        <div>
          <Label htmlFor="loyalty-cooldown">Fréquence des visites</Label>
          <select
            id="loyalty-cooldown"
            name="min_stamp_interval_seconds"
            value={cooldown.value}
            onChange={(e) => setCooldownSeconds(Number(e.target.value))}
            aria-describedby="loyalty-cooldown-help"
            className={`${selectClass} max-w-sm`}
          >
            {cooldown.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div id="loyalty-cooldown-help" className="mt-1.5 space-y-1">
            <p className="text-xs text-zinc-500">
              Anti-abus : empêche de compter plusieurs visites trop rapprochées
              depuis un même passeport.
            </p>
            {cooldown.floorSeconds > 0 && (
              <p className="text-xs text-zinc-500">
                {mode === "rotating_code" ? (
                  <>
                    Le mode « Code au comptoir » impose au moins{" "}
                    {formatDurationLabel(cooldown.floorSeconds)} entre deux
                    visites (le double de la rotation, 5 min minimum) : un code
                    reste valable le temps de deux rotations, sans ce délai il
                    vaudrait deux tampons.
                  </>
                ) : (
                  <>
                    Le mode « Validation en caisse » impose au moins{" "}
                    {formatDurationLabel(cooldown.floorSeconds)} entre deux
                    visites : le QR présenté reste scannable quelques minutes,
                    sans ce délai il vaudrait plusieurs tampons.
                  </>
                )}
              </p>
            )}
            {cooldown.adjusted && (
              <p role="status" className="text-xs font-semibold text-amber-700">
                Réglage ajusté sur {formatDurationLabel(cooldown.value)} pour
                rester compatible avec le mode choisi.
              </p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="loyalty-jackpot">Jackpot collectif associé</Label>
          <select
            id="loyalty-jackpot"
            name="jackpot_campaign_id"
            defaultValue={program.jackpot_campaign_id ?? ""}
            className={`${selectClass} max-w-sm`}
            aria-describedby="loyalty-jackpot-help"
          >
            <option value="">Aucun jackpot associé</option>
            {program.jackpot_campaign_id &&
              !jackpots.some((jackpot) => jackpot.id === program.jackpot_campaign_id) && (
                <option value={program.jackpot_campaign_id}>
                  Jackpot associé indisponible — dissociez-le
                </option>
              )}
            {jackpots.map((jackpot) => (
              <option key={jackpot.id} value={jackpot.id}>
                {jackpot.name} — validation en caisse
              </option>
            ))}
          </select>
          <p id="loyalty-jackpot-help" className="mt-1.5 max-w-xl text-xs text-zinc-500">
            En validation en caisse, chaque scan du QR du passeport rejoint ce
            pot commun. Le client suit sa jauge directement depuis son
            passeport ; aucun second QR ni passage par la page Jackpot.
          </p>
          {jackpots.length === 0 && (
            <p className="mt-1.5 text-xs font-semibold text-amber-700">
              Créez puis activez d&apos;abord un jackpot en validation caisse pour
              pouvoir l&apos;associer.
            </p>
          )}
        </div>

        <CodeTtlDaysField
          idPrefix="loyalty"
          value={codeTtlDays}
          onChange={setCodeTtlDays}
          emissionHint="Délai laissé au client pour présenter son code FIDELITE- en caisse, à partir du moment où il ATTEINT le palier."
        />

        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "…" : "Enregistrer"}
          </Button>
          {state?.ok && (
            <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
          )}
          {/* Le silence de validation se VOIT : sans cette ligne, un seuil vidé
              arrêterait l'enregistrement automatique sans que rien ne le dise. */}
          <AutoSaveEtat
            enAttente={enAttente}
            bloqueParValidation={bloqueParValidation}
            messageBloque="Non enregistré : le nom ou un seuil de niveau est vide."
          />
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Habillage (fond d'écran du passeport)
// ────────────────────────────────────────────────────────────

/**
 * L'HABILLAGE DU PASSEPORT — une carte, un fond d'écran, un aperçu.
 *
 * ── Pourquoi son propre formulaire, et pas un champ de plus dans « Réglages » ──
 *
 * `updateLoyaltyProgram` écrase TOUTES les colonnes de son schéma : les deux
 * formulaires voisins postent déjà le programme entier en champs cachés pour
 * s'en protéger (voir le commentaire des seuils dans `LoyaltySettings`). Y
 * ajouter l'habillage aurait fait un troisième jeu de champs cachés à tenir
 * synchrone, pour une colonne qui ne dépend d'aucune autre. Le formulaire vise
 * donc `updateLoyaltyProgramStyle`, qui n'écrit QUE `style` — même geste que
 * `WheelStyleEditor` avec `updateWheelStyle`, et rien ne peut plus s'écraser.
 *
 * ── L'aperçu, et non la seule vignette ──
 *
 * Le sélecteur montre l'image ; l'aperçu montre l'ÉCRAN — voile compris, carte
 * du solde par-dessus. Le passeport porte des chiffres, et c'est leur
 * lisibilité que le commerçant doit pouvoir juger avant d'ouvrir aux clients.
 * Il se repeint AU CLIC, avant tout enregistrement.
 *
 * ── L'enregistrement automatique ──
 *
 * Même montage que `WheelStyleEditor` : le sélecteur vit hors du `<form>`, qui
 * ne porte que deux champs cachés — aucun événement de saisie ne l'atteindrait.
 * On lui en émet un à chaque changement de fond, et `dirty` garantit que rien
 * ne part au montage (contrat de `useAutoSave`).
 */
export function LoyaltyHabillage({
  program,
  organizationName,
  logoUrl,
}: {
  program: LoyaltyProgram;
  organizationName: string;
  logoUrl: string | null;
}) {
  // Schéma de LECTURE : un fond retiré du catalogue rend un habillage vide,
  // jamais un écran en erreur (src/lib/loyalty-style.ts).
  const [fond, setFond] = useState<FondKey | undefined>(
    () => resolveLoyaltyStyle(program.style).fond,
  );
  const [dirty, setDirty] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useActionForm(updateLoyaltyProgramStyle, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  const { enAttente, bloqueParValidation } = useAutoSave(formRef);

  const styleSerialise = JSON.stringify({ fond });
  useEffect(() => {
    if (!dirty) return;
    formRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [styleSerialise, dirty]);

  return (
    <Card>
      <h2 className="font-semibold mb-1">Habillage</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Une grande image derrière le passeport de vos clients. Elle est adoucie
        par un voile pour que le solde et les prix restent lisibles.
      </p>

      <div className="mb-5 max-w-sm">
        <ApercuPasseport
          fond={fond}
          organizationName={organizationName}
          programName={program.name}
          logoUrl={logoUrl}
        />
        <p className="mt-1.5 text-xs text-zinc-500">
          Aperçu — le solde affiché est un exemple.
        </p>
      </div>

      <SelecteurFond
        nomGroupe="loyalty-fond"
        valeur={fond}
        onChange={(v) => {
          setFond(v);
          setDirty(true);
        }}
        legende="Fond d'écran du passeport"
      />

      <form ref={formRef} onSubmit={onSubmit}>
        <input type="hidden" name="id" value={program.id} />
        <input type="hidden" name="style" value={styleSerialise} />
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="secondary"
            disabled={pending}
            onClick={() => setDirty(false)}
          >
            {pending ? "…" : "Enregistrer"}
          </Button>
          {state?.ok && !dirty && (
            <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
          )}
          <AutoSaveEtat
            enAttente={enAttente}
            bloqueParValidation={bloqueParValidation}
            messageBloque="Non enregistré : l'habillage n'a pas pu être validé."
          />
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Parrainage
// ────────────────────────────────────────────────────────────

/**
 * LE PARRAINAGE — une carte, cinq réglages, et le BUDGET affiché.
 *
 * ── Pourquoi son propre formulaire (troisième fois sur cet écran) ──
 *
 * `updateLoyaltyProgram` écrase TOUTES les colonnes de son schéma. Les deux
 * formulaires voisins s'en protègent en postant le programme entier en champs
 * cachés ; ajouter le parrainage à ce jeu aurait demandé de recopier les cinq
 * colonnes dans les DEUX autres formulaires — faute de quoi enregistrer un
 * seuil de niveau aurait silencieusement remis le barème du parrainage à ses
 * valeurs par défaut. Ce formulaire vise donc `updateLoyaltyProgramReferral`,
 * qui n'écrit que ses colonnes : même choix que `LoyaltyHabillage`, et rien ne
 * peut plus s'écraser dans un sens comme dans l'autre.
 *
 * ── CE QUE ÇA COÛTE, ET POURQUOI C'EST ÉCRIT EN TOUTES LETTRES ──
 *
 * Deux montants et un plafond, c'est un budget — et c'est le chiffre que le
 * commerçant n'a pas sous les yeux au moment de décider. « 500 points au
 * parrain × 50 filleuls » vaut 25 000 points POUR UN SEUL PARRAIN, soit 250
 * visites offertes. La ligne de dépense maximale se recalcule à la saisie,
 * avant tout enregistrement : c'est la seule façon d'attraper un zéro de trop
 * avant que les clients ne le trouvent.
 *
 * ── L'ACTIVATION EST UN CHAMP CACHÉ ──
 *
 * `caseACochee` et non une case native : un navigateur n'envoie pas une case
 * décochée, et « je coupe le parrainage » n'aurait jamais atteint le serveur.
 * La case pilote l'état, le champ caché poste l'état voulu.
 */
export function LoyaltyParrainage({ program }: { program: LoyaltyProgram }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useActionForm(
    updateLoyaltyProgramReferral,
    {
      networkError: "Enregistrement impossible, réessayez.",
      toastOnSuccess: "Enregistré.",
    },
  );
  const { enAttente, bloqueParValidation } = useAutoSave(formRef);

  const [actif, setActif] = useState(program.referral_enabled);
  const [pointsParrain, setPointsParrain] = useState(
    String(program.referral_sponsor_points),
  );
  const [pointsFilleul, setPointsFilleul] = useState(
    String(program.referral_filleul_points),
  );
  const [plafond, setPlafond] = useState(String(program.referral_max_filleuls));

  const nParrain = Number(pointsParrain);
  const nFilleul = Number(pointsFilleul);
  const nPlafond = Number(plafond);
  const budgetLisible =
    Number.isFinite(nParrain) &&
    Number.isFinite(nFilleul) &&
    Number.isFinite(nPlafond) &&
    nPlafond > 0;
  const depenseMax = budgetLisible ? (nParrain + nFilleul) * nPlafond : 0;

  return (
    <Card>
      <h2 className="font-semibold mb-1">Parrainage</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Chaque client peut inviter ses amis avec un lien personnel. Le filleul
        ouvre sa carte, puis{" "}
        <strong className="font-semibold text-zinc-700">
          fait valider une première visite
        </strong>{" "}
        — en boutique ou avec un QR de commande. C&apos;est à ce moment-là, et
        pas avant, que les points sont versés : une carte créée et jamais
        tamponnée ne vous coûte rien.
      </p>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="id" value={program.id} />
        <input
          type="hidden"
          name="referral_enabled"
          value={actif ? "true" : "false"}
        />

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={actif}
            onChange={(e) => setActif(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-2 border-k-ink accent-k-ink"
          />
          <span>
            <span className="font-medium text-zinc-800">
              Proposer le parrainage sur le passeport
            </span>
            <span className="block text-xs text-zinc-500">
              Le bloc « Parrainer un ami » n&apos;apparaît sur la carte de vos
              clients que si cette case est cochée.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap gap-4">
          <div>
            <Label htmlFor="loyalty-referral-sponsor">
              Points au parrain
            </Label>
            <Input
              id="loyalty-referral-sponsor"
              name="referral_sponsor_points"
              type="number"
              min={0}
              max={100000}
              step={LOYALTY_POINTS_PAR_VISITE}
              value={pointsParrain}
              onChange={(e) => setPointsParrain(e.target.value)}
              className="w-40"
              aria-describedby="loyalty-referral-sponsor-help"
              required
            />
            <p
              id="loyalty-referral-sponsor-help"
              className="mt-1.5 text-xs text-zinc-500"
            >
              {equivalentVisites(nParrain)}
            </p>
          </div>
          <div>
            <Label htmlFor="loyalty-referral-filleul">
              Bonus de bienvenue du filleul
            </Label>
            <Input
              id="loyalty-referral-filleul"
              name="referral_filleul_points"
              type="number"
              min={0}
              max={100000}
              step={LOYALTY_POINTS_PAR_VISITE}
              value={pointsFilleul}
              onChange={(e) => setPointsFilleul(e.target.value)}
              className="w-40"
              aria-describedby="loyalty-referral-filleul-help"
              required
            />
            <p
              id="loyalty-referral-filleul-help"
              className="mt-1.5 text-xs text-zinc-500"
            >
              0 pour ne rien offrir au filleul.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <Label htmlFor="loyalty-referral-max">
              Filleuls maximum par parrain
            </Label>
            <Input
              id="loyalty-referral-max"
              name="referral_max_filleuls"
              type="number"
              min={1}
              max={1000}
              value={plafond}
              onChange={(e) => setPlafond(e.target.value)}
              className="w-40"
              aria-describedby="loyalty-referral-max-help"
              required
            />
            <p
              id="loyalty-referral-max-help"
              className="mt-1.5 text-xs text-zinc-500"
            >
              Au-delà, l&apos;invitation cesse d&apos;accueillir de nouveaux
              filleuls.
            </p>
          </div>
          <div>
            <Label htmlFor="loyalty-referral-window">
              Validité d&apos;une invitation (jours)
            </Label>
            <Input
              id="loyalty-referral-window"
              name="referral_window_days"
              type="number"
              min={1}
              max={365}
              defaultValue={program.referral_window_days}
              className="w-40"
              aria-describedby="loyalty-referral-window-help"
              required
            />
            <p
              id="loyalty-referral-window-help"
              className="mt-1.5 text-xs text-zinc-500"
            >
              Comptés depuis le jour où le client obtient son lien.
            </p>
          </div>
        </div>

        {/* CE QUE ÇA COÛTE — la ligne qui manque pour décider. Elle se
            recalcule à la saisie, avant tout enregistrement. */}
        <p
          className="rounded-xl border-2 border-k-ink/15 bg-amber-50 px-3.5 py-2.5 text-sm text-zinc-700"
          role="status"
          aria-live="polite"
        >
          {budgetLisible ? (
            <>
              <strong className="font-semibold">Dépense maximale :</strong>{" "}
              {nParrain} points au parrain + {nFilleul} au filleul, ×{" "}
              {nPlafond} filleul{nPlafond > 1 ? "s" : ""} au maximum ={" "}
              <strong className="font-semibold">
                {depenseMax.toLocaleString("fr-FR")} points
              </strong>{" "}
              pour un seul parrain, soit environ{" "}
              {Math.round(depenseMax / LOYALTY_POINTS_PAR_VISITE)} visite
              {Math.round(depenseMax / LOYALTY_POINTS_PAR_VISITE) > 1
                ? "s"
                : ""}{" "}
              offerte
              {Math.round(depenseMax / LOYALTY_POINTS_PAR_VISITE) > 1
                ? "s"
                : ""}
              . Chaque point versé suppose une visite réellement validée.
            </>
          ) : (
            "Renseignez les deux montants et le plafond pour voir la dépense maximale par parrain."
          )}
        </p>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "…" : "Enregistrer"}
          </Button>
          {state?.ok && (
            <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
          )}
          <AutoSaveEtat
            enAttente={enAttente}
            bloqueParValidation={bloqueParValidation}
            messageBloque="Non enregistré : un réglage du parrainage est vide."
          />
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Paliers
// ────────────────────────────────────────────────────────────

/**
 * LES NIVEAUX, DÉPLACÉS DEPUIS L'ÉTAPE « Le programme ».
 *
 * Bronze → argent → or est une RÉCOMPENSE : sa place est auprès des paliers,
 * pas au milieu des règles de tamponnage. Le formulaire est distinct de celui
 * des paliers (il vise `updateLoyaltyProgram`, eux visent les milestones) et
 * poste le programme entier — voir le commentaire des champs cachés dans
 * `LoyaltySettings` : l'action écrase toutes les colonnes de son schéma, une
 * mise à jour partielle n'existe pas ici.
 */
function LoyaltyTiersForm({ program }: { program: LoyaltyProgram }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useActionForm(updateLoyaltyProgram, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  const { enAttente, bloqueParValidation } = useAutoSave(formRef);

  return (
    <Card>
      <h2 className="font-semibold mb-1">Niveaux</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Le passeport passe bronze → argent → or selon les points{" "}
        <strong className="font-semibold text-zinc-700">cumulés depuis le début</strong>,
        et non selon le solde restant : un client qui dépense ses points garde
        son niveau, il ne redescend jamais. Une visite validée rapporte{" "}
        {LOYALTY_POINTS_PAR_VISITE} points. Ces deux seuils ne distribuent rien
        par eux-mêmes : ils donnent au client une progression visible.
      </p>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        {/* Le reste du programme voyage caché : ce formulaire ne règle que les
            seuils, mais l'action met à jour toutes ses colonnes d'un bloc.
            `code_ttl_days` en est ABSENT volontairement — l'action le lit avec
            `formData.has`, donc son absence laisse la colonne intacte, ce qui
            est exactement ce qu'on veut ici. */}
        <input type="hidden" name="id" value={program.id} />
        <input type="hidden" name="name" value={program.name} />
        <input
          type="hidden"
          name="validation_mode"
          value={program.validation_mode}
        />
        <input
          type="hidden"
          name="rotating_period_seconds"
          value={program.rotating_period_seconds}
        />
        <input
          type="hidden"
          name="min_stamp_interval_seconds"
          value={program.min_stamp_interval_seconds}
        />
        <input
          type="hidden"
          name="jackpot_campaign_id"
          value={program.jackpot_campaign_id ?? ""}
        />

        <div className="flex flex-wrap gap-4">
          <div>
            <Label htmlFor="loyalty-silver">Seuil argent 🥈 (points)</Label>
            <Input
              id="loyalty-silver"
              name="silver_threshold"
              type="number"
              min={1}
              max={100000}
              step={LOYALTY_POINTS_PAR_VISITE}
              defaultValue={program.silver_threshold}
              className="w-40"
              aria-describedby="loyalty-silver-help"
              required
            />
            <p id="loyalty-silver-help" className="mt-1.5 text-xs text-zinc-500">
              {equivalentVisites(program.silver_threshold)}
            </p>
          </div>
          <div>
            <Label htmlFor="loyalty-gold">Seuil or 🥇 (points)</Label>
            <Input
              id="loyalty-gold"
              name="gold_threshold"
              type="number"
              min={2}
              max={100000}
              step={LOYALTY_POINTS_PAR_VISITE}
              defaultValue={program.gold_threshold}
              className="w-40"
              aria-describedby="loyalty-gold-help"
              required
            />
            <p id="loyalty-gold-help" className="mt-1.5 text-xs text-zinc-500">
              {equivalentVisites(program.gold_threshold)}
            </p>
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          Le seuil or doit être supérieur au seuil argent.
        </p>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "…" : "Enregistrer"}
          </Button>
          {state?.ok && (
            <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
          )}
          <AutoSaveEtat
            enAttente={enAttente}
            bloqueParValidation={bloqueParValidation}
            messageBloque="Non enregistré : un seuil de niveau est vide."
          />
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

export function LoyaltyMilestonesEditor({
  program,
  milestones,
  wheels,
}: {
  program: LoyaltyProgram;
  milestones: LoyaltyMilestone[];
  wheels: WheelOption[];
}) {
  return (
    <div className="space-y-4">
      <LoyaltyTiersForm program={program} />
      <LoyaltyPaliersEditor
        programId={program.id}
        milestones={milestones}
        wheels={wheels}
      />
    </div>
  );
}

/**
 * LES PALIERS SEULS — SANS le formulaire des niveaux (VIT-42).
 *
 * ── Pourquoi cette séparation existe, et ce qu'elle protège ──
 *
 * `LoyaltyMilestonesEditor` monte deux choses qui n'ont RIEN en commun côté
 * serveur : `LoyaltyTiersForm`, qui vise `updateLoyaltyProgram` (huit colonnes
 * réécrites en bloc), et cette liste, dont chaque ligne vise une action
 * ATOMIQUE par palier (`createLoyaltyMilestone`, `updateLoyaltyMilestone`,
 * `deleteLoyaltyMilestone`) — immunisée par construction à l'écrasement en bloc.
 *
 * Le studio (`/studio/fidelite/[id]`) ne peut pas monter le premier : ses champs
 * cachés seraient un SECOND écrivain sur les colonnes que le studio poste déjà
 * depuis son état unique, et le dernier arrivé gagnerait. Il monte donc cette
 * liste-ci, telle quelle. Une seconde liste propre au studio aurait été une
 * deuxième vérité sur ce qu'est un palier.
 *
 * L'atelier, lui, ne change pas d'un pixel : il monte les deux, dans le même
 * ordre, par le composant d'origine.
 */
export function LoyaltyPaliersEditor({
  programId,
  milestones,
  wheels,
}: {
  programId: string;
  milestones: LoyaltyMilestone[];
  wheels: WheelOption[];
}) {
  const ordered = [...milestones].sort((a, b) => coutPalier(a) - coutPalier(b));

  return (
      <Card>
      <h2 className="font-semibold mb-1">Paliers</h2>
      {/* Ce paragraphe ANNONÇAIT une borne qui n'existait pas : « chaque lot
          porte un stock » laissait croire que le programme était plafonné,
          alors que les paliers « tour de roue offert » n'avaient AUCUN stock
          (et tiraient des lots de roue illimités, sans décrément). Depuis
          20260725200000 le stock est exigé sur les DEUX types de palier : le
          texte peut enfin le dire, et il le dit type par type. */}
      <p className="text-sm text-zinc-500 mb-4">
        Chaque palier est un cadeau à un PRIX : le client dépense ses points
        quand il le décide, et choisit lequel prendre. Un lot se retire en
        caisse avec un code ; un tour de roue offert se joue tout de suite. Le
        prix vaut au moins {LOYALTY_MILESTONE_MIN_COST_POINTS} points (deux
        visites) et chaque palier porte toujours un stock : nombre de lots pour
        un palier « lot », nombre de tours distribués pour un palier « tour de
        roue offert ». Ces deux règles bornent ce que le programme peut vous
        coûter, quel que soit le nombre de passeports ouverts. Il faut au moins
        un palier pour activer le programme.
      </p>

      {ordered.length === 0 ? (
        <p className="mb-4 text-sm text-zinc-500">
          Aucun palier pour l&apos;instant — ajoutez le premier ci-dessous.
        </p>
      ) : (
        <ul className="mb-4 space-y-2.5">
          {ordered.map((m) => (
            <MilestoneRow key={m.id} milestone={m} wheels={wheels} />
          ))}
        </ul>
      )}

      <AddMilestoneForm programId={programId} wheels={wheels} />
      </Card>
  );
}

/**
 * Prix d'un palier, en points. `cost_points` est l'autorité ; le repli refait
 * la dérivation du trigger de transition (visites × tarif de la visite) pour
 * une ligne écrite avant la bascule et pas encore relue.
 */
function coutPalier(milestone: LoyaltyMilestone): number {
  return milestone.cost_points ?? milestone.visit_count * LOYALTY_POINTS_PAR_VISITE;
}

/**
 * Traduit un montant de points dans l'unité que le commerçant connaît. Repère
 * seulement : c'est le point qui est saisi, jamais la visite.
 */
/**
 * « Soit environ 5 visites » — la phrase qui traduit un montant en points dans
 * l'unité que le commerçant connaît.
 *
 * EXPORTÉE (VIT-42) parce que le studio pose exactement les mêmes questions —
 * un seuil de niveau, un barème de parrainage — et qu'une seconde formulation
 * aurait divergé au premier ajustement du tarif de la visite.
 */
export function equivalentVisites(points: number): string {
  const visites = Math.round(points / LOYALTY_POINTS_PAR_VISITE);
  if (!Number.isFinite(visites) || visites < 1) return "Moins d'une visite.";
  return `Soit environ ${visites} visite${visites > 1 ? "s" : ""} (${LOYALTY_POINTS_PAR_VISITE} points par visite).`;
}

/**
 * Champ « COÛT EN POINTS » du palier, partagé entre édition et ajout.
 *
 * Ce champ demandait « se déclenche à N visites » : le palier était un SEUIL
 * qu'on franchissait, et la récompense tombait toute seule. Depuis la bascule
 * en monnaie (20261114120000), c'est un PRIX que le client paie quand il le
 * décide. Le mot devait suivre, sinon le commerçant tarife un cadeau en
 * croyant régler une échéance.
 *
 * Le plancher reste le même verrou économique, exprimé dans la nouvelle unité :
 * une visite vaut {LOYALTY_POINTS_PAR_VISITE} points, donc 200 points exigent
 * une seconde visite.
 */
function CostPointsField({
  id,
  defaultValue,
}: {
  id: string;
  /** Absent sur le formulaire d'ajout (champ vide + exemple). */
  defaultValue?: number;
}) {
  return (
    <div>
      <Label htmlFor={id}>Coût en points</Label>
      <Input
        id={id}
        name="cost_points"
        type="number"
        min={LOYALTY_MILESTONE_MIN_COST_POINTS}
        max={LOYALTY_MILESTONE_MAX_COST_POINTS}
        step={LOYALTY_POINTS_PAR_VISITE}
        defaultValue={defaultValue}
        placeholder={defaultValue === undefined ? "Ex : 1000" : undefined}
        required
        aria-describedby={`${id}-help`}
        className="w-40"
      />
      <p id={`${id}-help`} className="mt-1.5 text-xs text-zinc-500">
        Ce que le client dépense pour l&apos;obtenir.{" "}
        {defaultValue !== undefined ? `${equivalentVisites(defaultValue)} ` : ""}
        Minimum {LOYALTY_MILESTONE_MIN_COST_POINTS} points : un cadeau
        accessible dès la première visite serait exploitable — une carte toute
        neuve suffirait à le décrocher.
      </p>
    </div>
  );
}

/** Champs de récompense (lot ou spin) partagés entre édition et ajout. */
function RewardFields({
  idPrefix,
  defaultType,
  defaultLabel = "",
  defaultDetails = "",
  defaultStock = null,
  defaultWheelId = null,
  claimedCount = 0,
  wheels,
}: {
  idPrefix: string;
  defaultType: LoyaltyRewardType;
  defaultLabel?: string;
  defaultDetails?: string;
  defaultStock?: number | null;
  defaultWheelId?: string | null;
  /** Codes déjà émis sur ce palier (0 à l'ajout) : repère avant de baisser le stock. */
  claimedCount?: number;
  wheels: WheelOption[];
}) {
  const [type, setType] = useState<LoyaltyRewardType>(defaultType);
  // Roue ciblée supprimée : le select ne la contient plus, on le signale.
  const missingWheel =
    defaultType === "spin" &&
    defaultWheelId !== null &&
    !wheels.some((w) => w.id === defaultWheelId);
  // Sélection contrôlée : l'avertissement sur les lots de la roue doit suivre
  // le choix courant, pas seulement celui enregistré.
  const [wheelId, setWheelId] = useState(
    missingWheel ? "" : (defaultWheelId ?? ""),
  );
  const selectedWheel = wheels.find((w) => w.id === wheelId) ?? null;
  const issue = type === "spin" ? spinWheelIssue(selectedWheel) : "none";

  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">
          Type de récompense
        </legend>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            name="reward_type"
            value="lot"
            checked={type === "lot"}
            onChange={() => setType("lot")}
            className="h-4 w-4 accent-k-ink"
          />
          🎁 Lot
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            name="reward_type"
            value="spin"
            checked={type === "spin"}
            onChange={() => setType("spin")}
            className="h-4 w-4 accent-k-ink"
          />
          🎡 Tour de roue offert
        </label>
      </fieldset>

      {type === "lot" ? (
        <div className="space-y-2">
          <div>
            <Label htmlFor={`${idPrefix}-label`}>Lot</Label>
            <Input
              id={`${idPrefix}-label`}
              name="reward_label"
              defaultValue={defaultLabel}
              maxLength={120}
              placeholder="Ex : Un café offert"
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-details`}>Détails (optionnel)</Label>
            <textarea
              id={`${idPrefix}-details`}
              name="reward_details"
              defaultValue={defaultDetails}
              maxLength={2000}
              rows={2}
              placeholder="Conditions, validité, modalités de retrait…"
              className={textareaClass}
            />
          </div>
        </div>
      ) : (
        <div>
          <Label htmlFor={`${idPrefix}-wheel`}>Roue du tour offert</Label>
          {wheels.length === 0 ? (
            <p className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              Aucune roue disponible — créez d&apos;abord une roue dans vos
              campagnes.
            </p>
          ) : (
            <select
              id={`${idPrefix}-wheel`}
              name="target_wheel_id"
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
          {/* LE CHEMIN LE PLUS COURT QUI ABOUTIT VRAIMENT À UNE ROUE. Il n'y a
              pas de route de création directe : une roue naît d'une campagne
              (`+ Nouvelle campagne` sur /dashboard/campaigns, qui ouvre
              l'atelier et ses lots). Le lien y mène donc, dans un NOUVEL
              ONGLET — la saisie de ce palier n'est pas encore enregistrée,
              quitter la page la perdrait. L'emoji reste hors du nom
              accessible. */}
          <a
            href="/dashboard/campaigns"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-bold text-k-ink transition-colors duration-200 hover:bg-k-yellow/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
          >
            <span aria-hidden>🎡</span>
            Créer une roue (nouvel onglet)
          </a>
          {missingWheel && (
            <p className="mt-1.5 text-xs font-semibold text-amber-700">
              La roue ciblée a été supprimée — choisissez-en une autre.
            </p>
          )}
        </div>
      )}

      {/* Région vivante montée en PERMANENCE (hors du ternaire de type) :
          l'avertissement apparaît au changement de roue ou de type et doit
          être ANNONCÉ — une région insérée en même temps que son contenu ne
          serait pas lue de façon fiable. */}
      <div aria-live="polite">
        {issue !== "none" && selectedWheel && (
          <UnlimitedPrizeWarning issue={issue} wheel={selectedWheel} />
        )}
      </div>

      {/* Stock commun aux DEUX types : hors du ternaire, la valeur saisie
          survit à un changement de type (le champ n'est pas remonté). */}
      <StockField
        idPrefix={idPrefix}
        type={type}
        defaultStock={defaultStock}
        claimedCount={claimedCount}
      />
    </div>
  );
}

/**
 * Stock du palier — OBLIGATOIRE sur les deux types depuis 20260725200000.
 * L'« illimité » n'existe plus : le stock est le plafond exact de ce que le
 * palier peut coûter. Sur un `spin` il compte les TOURS OFFERTS ÉMIS, pas les
 * lots de la roue (qui ont leur propre stock, réglé dans la campagne) — la
 * confusion entre les deux est précisément ce qui avait laissé les paliers
 * `spin` sans aucune borne.
 */
function StockField({
  idPrefix,
  type,
  defaultStock,
  claimedCount,
}: {
  idPrefix: string;
  type: LoyaltyRewardType;
  defaultStock: number | null;
  claimedCount: number;
}) {
  const isSpin = type === "spin";
  return (
    <div>
      <Label htmlFor={`${idPrefix}-stock`}>
        {isSpin
          ? "Stock de tours offerts (obligatoire)"
          : "Stock du lot (obligatoire)"}
      </Label>
      <Input
        id={`${idPrefix}-stock`}
        name="reward_stock"
        type="number"
        min={0}
        max={LOYALTY_MAX_LOT_STOCK}
        // 0 reste valide et signifie « en pause », sans toucher aux
        // récompenses déjà émises.
        defaultValue={defaultStock ?? LOYALTY_DEFAULT_LOT_STOCK}
        required
        aria-describedby={infoBulleTexteId(`${idPrefix}-stock-aide`)}
        className="w-40"
      />
      <InfoBulle
        id={`${idPrefix}-stock-aide`}
        resume="Pourquoi ce stock est-il obligatoire ?"
        className="mt-2 max-w-md"
      >
        {isSpin ? (
          <>
            Sur un passeport, le stock est OBLIGATOIRE et fini — il n&apos;y a
            pas d&apos;« illimité », contrairement à la chasse au trésor. Ce
            nombre plafonne les tours offerts émis par ce palier : au-delà, plus
            aucun tour n&apos;est accordé, quel que soit le nombre de passeports
            ouverts (0 = épuisé, le palier est mis en pause). Il propose{" "}
            {LOYALTY_DEFAULT_LOT_STOCK} par défaut, et ne compte pas le stock
            des lots de la roue, qui se règle dans la campagne.
          </>
        ) : (
          <>
            Sur un passeport, le stock est OBLIGATOIRE et fini — il n&apos;y a
            pas d&apos;« illimité », contrairement à la chasse au trésor. Il
            plafonne votre engagement : passé ce nombre de lots, plus aucun code
            n&apos;est émis, quel que soit le nombre de passeports ouverts (0 =
            épuisé, le palier est mis en pause). {LOYALTY_DEFAULT_LOT_STOCK} est
            la valeur proposée par défaut, pas une limite du produit.
          </>
        )}
      </InfoBulle>
      {claimedCount > 0 && (
        <p className="mt-1 text-xs font-semibold text-zinc-600">
          {claimedCount}{" "}
          {isSpin
            ? `tour${claimedCount > 1 ? "s" : ""} déjà distribué${claimedCount > 1 ? "s" : ""}`
            : `code${claimedCount > 1 ? "s" : ""} déjà émis`}{" "}
          sur ce palier — un stock inférieur le met immédiatement en pause.
        </p>
      )}
    </div>
  );
}

/** Nombre de lots cités dans l'avertissement (la liste reste lisible). */
const WARNED_PRIZES_SHOWN = 4;

/**
 * Avertissement sur la roue ciblée : un tour offert n'est JAMAIS tiré sur un
 * lot à stock illimité (20260725200000 — sans stock, rien ne décompte ce que
 * le tour peut distribuer). Le commerçant doit le savoir AVANT d'enregistrer,
 * sinon il croit offrir un lot que le tirage exclut.
 */
function UnlimitedPrizeWarning({
  issue,
  wheel,
}: {
  issue: "unlimited_prizes" | "nothing_drawable";
  wheel: WheelOption;
}) {
  const shown = wheel.unlimitedPrizes.slice(0, WARNED_PRIZES_SHOWN);
  const extra = wheel.unlimitedPrizes.length - shown.length;

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <p className="text-sm font-bold">
        {issue === "nothing_drawable"
          ? "⚠️ Cette roue ne peut rien distribuer en tour offert"
          : "⚠️ Certains lots de cette roue ne sortiront pas en tour offert"}
      </p>
      {shown.length > 0 && (
        <p className="mt-1">
          Sans stock, un lot est illimité : le tour offert l&apos;exclut du
          tirage, faute de quoi rien ne bornerait ce qu&apos;il peut vous
          coûter. Concerné{shown.length > 1 ? "s" : ""} :{" "}
          <span className="font-semibold">{shown.join(", ")}</span>
          {extra > 0 && <> et {extra} autre{extra > 1 ? "s" : ""}</>}.
        </p>
      )}
      <p className="mt-1">
        {issue === "nothing_drawable"
          ? "Aucun lot n'est donc tirable : le client verra « aucun lot à distribuer » et conservera son tour. Donnez un stock à au moins un lot de cette roue (page de la campagne) pour le rendre distribuable."
          : "Donnez un stock à ces lots depuis la page de la campagne pour qu'ils redeviennent distribuables ; les autres lots de la roue restent tirables normalement."}
      </p>
    </div>
  );
}

/**
 * Le résumé d'un palier replié, en une ligne. L'emoji en est SÉPARÉ : il part
 * dans un `<span aria-hidden>` du `<summary>`, dont le nom accessible doit
 * rester du texte (un U+FE0F glissé dans un nom accessible a déjà cassé un
 * locator de ce dépôt).
 */
function resumePalier(
  milestone: LoyaltyMilestone,
  wheels: WheelOption[],
): { emoji: string; texte: string } {
  if (milestone.reward_type === "spin") {
    const roue = wheels.find((w) => w.id === milestone.target_wheel_id);
    return {
      emoji: "🎡",
      texte: roue
        ? `Tour offert sur « ${roue.name} »`
        : "Tour de roue offert — roue à choisir",
    };
  }
  return { emoji: "🎁", texte: milestone.reward_label || "Lot sans nom" };
}

function MilestoneRow({
  milestone,
  wheels,
}: {
  milestone: LoyaltyMilestone;
  wheels: WheelOption[];
}) {
  // Un jeu de hooks PAR LIGNE de palier : chaque instance montée dans la liste
  // porte le sien, rien n'est partagé entre les lignes.
  // Pas de `resetOnSuccess` sur l'édition : les champs non contrôlés
  // repartiraient sur le `defaultValue` d'avant l'enregistrement.
  // UN ENREGISTREMENT AUTOMATIQUE PAR LIGNE : chaque palier est son propre
  // `<form>`, donc son propre `requestSubmit`. La suppression, formulaire frère,
  // n'est pas concernée — rien d'automatique ne détruit.
  const formRef = useRef<HTMLFormElement>(null);
  const {
    state: updateState,
    pending: updatePending,
    onSubmit: updateSubmit,
  } = useActionForm(updateLoyaltyMilestone, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  const { enAttente, bloqueParValidation } = useAutoSave(formRef);
  const {
    state: deleteState,
    pending: deletePending,
    onSubmit: deleteSubmit,
  } = useActionForm(deleteLoyaltyMilestone, {
    networkError: "Suppression impossible, réessayez.",
  });

  const resume = resumePalier(milestone, wheels);

  return (
    <li className="rounded-xl border-2 border-k-ink/15 bg-white">
      {/* REPLIÉ PAR DÉFAUT — un `<details>` natif, et non `CarteRepliable`, qui
          est bâtie pour un BLOC DE PAGE (titre, numéro d'étape, badge de
          statut) et non pour une ligne de liste. Le natif donne gratuitement
          ce qui compte ici : le `<summary>` EST le bouton, il porte son
          `aria-expanded` sans code, et la recherche du navigateur (Ctrl+F)
          ouvre le repli. Le but est de dégager la page : une fois le palier
          enregistré, ce qu'on veut lire tient en une ligne, et l'espace sert à
          créer le suivant. */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-k-ink hover:bg-k-yellow/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink">
          <span aria-hidden className="text-xs transition-transform group-open:rotate-90">
            ▶
          </span>
          <span className="min-w-0 flex-1">
            {coutPalier(milestone)} points — <span aria-hidden>{resume.emoji}</span>{" "}
            {resume.texte}
            {milestone.reward_stock !== null && (
              <span className="font-normal text-zinc-500">
                {" "}
                · stock {milestone.reward_stock}
              </span>
            )}
          </span>
        </summary>
      <div className="flex items-start gap-3 p-3 pt-0">
        <form
          ref={formRef}
          onSubmit={updateSubmit}
          className="min-w-0 flex-1 space-y-3"
        >
          <input type="hidden" name="id" value={milestone.id} />
          <CostPointsField
            id={`ms-cout-${milestone.id}`}
            defaultValue={coutPalier(milestone)}
          />

          <RewardFields
            idPrefix={`ms-${milestone.id}`}
            defaultType={milestone.reward_type}
            defaultLabel={milestone.reward_label}
            defaultDetails={milestone.reward_details ?? ""}
            defaultStock={milestone.reward_stock}
            defaultWheelId={milestone.target_wheel_id}
            claimedCount={milestone.reward_claimed_count}
            wheels={wheels}
          />

          <div className="flex items-center gap-2">
            <Button type="submit" variant="secondary" disabled={updatePending}>
              {updatePending ? "…" : "Enregistrer"}
            </Button>
            {updateState?.ok && (
              <span className="text-sm font-medium text-emerald-600">✓</span>
            )}
            <AutoSaveEtat
              enAttente={enAttente}
              bloqueParValidation={bloqueParValidation}
              messageBloque="Non enregistré : un champ de ce palier est vide ou mal rempli."
            />
          </div>
          <FieldError
            message={updateState && !updateState.ok ? updateState.error : undefined}
          />
        </form>

        {/* La confirmation est COMPOSÉE avec la soumission, jamais remplacée
            par elle : on sort avant d'appeler le hook si le commerçant refuse.
            C'est le seul garde-fou avant une suppression définitive. */}
        <form
          onSubmit={(event) => {
            if (!confirm("Supprimer ce palier ?")) {
              event.preventDefault();
              return;
            }
            deleteSubmit(event);
          }}
        >
          <input type="hidden" name="id" value={milestone.id} />
          {/* La case n'apparaît qu'APRÈS le refus qui NOMME le nombre de codes
              FIDELITE- en attente SUR CE PALIER. À ne pas confondre avec le
              « N code(s) déjà émis » affiché plus haut sous le champ Stock :
              celui-là compte les codes ÉMIS, remis compris, et ne dit rien de
              ce que la suppression coûte. L'autre refus de cette action (« un
              programme actif garde au moins un palier ») ne se coche pas. */}
          {deleteState &&
            !deleteState.ok &&
            deleteState.error.includes(LOYALTY_MILESTONE_LOSS_HINT) && (
              <label className="mb-1 flex max-w-56 items-start gap-1.5 text-xs font-semibold text-red-700">
                <input
                  type="checkbox"
                  name="confirm_outstanding"
                  value="1"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                Je comprends que les codes non retirés deviendront introuvables
                en caisse.
              </label>
            )}
          <Button
            type="submit"
            variant="ghost"
            disabled={deletePending}
            aria-label={`Supprimer le palier à ${coutPalier(milestone)} points`}
          >
            ✕
          </Button>
        </form>
      </div>
      <div className="px-3 pb-3">
        <FieldError
          message={deleteState && !deleteState.ok ? deleteState.error : undefined}
        />
      </div>
      </details>
    </li>
  );
}

/**
 * Champs du brouillon d'ajout conservés entre deux visites de la page.
 *
 * SEULEMENT LES CHAMPS LIBRES, et c'est un arbitrage : `reward_type` et
 * `target_wheel_id` sont des états REACT de `RewardFields` (radios et select
 * contrôlés). Les restaurer par le DOM engagerait un bras de fer avec React,
 * qui les réécrirait au rendu suivant. Ce sont par ailleurs des choix à un
 * clic — ce qu'on protège ici, c'est ce qui a été TAPÉ.
 */
const CHAMPS_BROUILLON_PALIER = [
  "cost_points",
  "reward_label",
  "reward_details",
  "reward_stock",
] as const;

function clePalierBrouillon(programId: string): string {
  return `lastchance:palier-brouillon:${programId}`;
}

/**
 * PROTÉGER LA SAISIE DE L'AJOUT — sans jamais créer de ligne fantôme.
 *
 * Le motif des paliers EXISTANTS (`useAutoSave`) ne se transpose PAS à une
 * création, et le fait de l'écrire évite qu'on le retente : un formulaire de
 * création qui s'auto-envoie insère une ligne par salve de frappe. « Café »
 * donnerait un palier « Ca », puis les frappes suivantes se heurteraient au
 * refus « Un palier existe déjà pour ce nombre de visites » — l'utilisateur
 * repartirait avec une ligne fausse ET un message incompréhensible. Envoyer
 * « au premier champ complet » ne sauve rien non plus : `checkValidity()` ne
 * connaît que `required`, or le libellé du lot n'est exigé que par le refine
 * serveur — le premier « complet » serait un palier sans nom.
 *
 * La protection retenue tient donc en deux gestes, aucun des deux n'écrivant
 * en base :
 *
 *  1. LE BROUILLON SURVIT. Chaque frappe est recopiée dans `sessionStorage`
 *     et restaurée au montage. Un rafraîchissement, un aller-retour vers la
 *     roue qu'on vient de créer, un onglet remis au premier plan : la saisie
 *     est là. Elle est effacée dès que le palier existe vraiment.
 *  2. LE SILENCE SE VOIT. Une ligne permanente dit que ce formulaire-ci ne
 *     s'enregistre pas tout seul. C'est le pendant exact d'`AutoSaveEtat` sur
 *     les paliers voisins : ce qui perdait la saisie n'était pas un bug de
 *     code, c'était la promesse implicite créée par le « Enregistré. » qui
 *     s'affiche partout ailleurs sur cette page.
 */
function AddMilestoneForm({
  programId,
  wheels,
}: {
  programId: string;
  wheels: WheelOption[];
}) {
  // `resetOnSuccess` REMPLACE le vidage automatique que React 19 appliquait à
  // `<form action={…}>` : sans lui, visit_count, reward_label, reward_details et
  // reward_stock resteraient saisis et le palier suivant partirait en doublon
  // (« Un palier existe déjà pour ce nombre de visites »). Comme auparavant, le
  // reset ne touche pas les états client de RewardFields (type, roue ciblée).
  const { state, pending, onSubmit } = useActionForm(createLoyaltyMilestone, {
    // `reloadOnSuccess` : signature mécanique « insère une ligne dans une liste
    // rendue par le serveur, sans rendre aucun succès » — la seule famille où
    // l'échec du rafraîchissement fait recommencer le geste, donc crée un
    // doublon. Vérifiée par `use-action-form-coverage.test.ts`.
    reloadOnSuccess: true,
    resetOnSuccess: true,
    networkError: "Ajout impossible, réessayez.",
  });

  const formRef = useRef<HTMLFormElement>(null);
  const cle = clePalierBrouillon(programId);
  const ok = state?.ok ?? false;

  // Restauration au montage — DOM seulement, aucun `setState` : la règle
  // `react-hooks/set-state-in-effect` du dépôt l'interdirait, et il n'y a de
  // toute façon rien à porter en état React ici.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let brouillon: Record<string, unknown>;
    try {
      brouillon = JSON.parse(sessionStorage.getItem(cle) ?? "{}");
    } catch {
      // Stockage refusé (navigation privée) ou entrée corrompue : le
      // formulaire vide reste parfaitement utilisable.
      return;
    }
    for (const nom of CHAMPS_BROUILLON_PALIER) {
      const valeur = brouillon[nom];
      const champ = form.elements.namedItem(nom);
      if (typeof valeur !== "string" || !valeur) continue;
      if (
        champ instanceof HTMLInputElement ||
        champ instanceof HTMLTextAreaElement
      ) {
        // On n'écrase JAMAIS une saisie en cours : la restauration ne comble
        // que ce qui est vide, et `reward_stock` porte déjà sa valeur par
        // défaut — un brouillon plus récent doit pouvoir la remplacer, d'où
        // la comparaison au défaut plutôt qu'au vide seul.
        const parDefaut = String(LOYALTY_DEFAULT_LOT_STOCK);
        if (champ.value === "" || (nom === "reward_stock" && champ.value === parDefaut)) {
          champ.value = valeur;
        }
      }
    }
  }, [cle]);

  // Le palier existe pour de bon : le brouillon n'a plus lieu d'être (les
  // champs, eux, sont déjà vidés par `resetOnSuccess`).
  useEffect(() => {
    if (!ok) return;
    try {
      sessionStorage.removeItem(cle);
    } catch {
      // Sans stockage, il n'y avait rien à effacer.
    }
  }, [ok, cle]);

  const memoriser = () => {
    const form = formRef.current;
    if (!form) return;
    const donnees = new FormData(form);
    const brouillon: Record<string, string> = {};
    for (const nom of CHAMPS_BROUILLON_PALIER) {
      const valeur = donnees.get(nom);
      if (typeof valeur === "string" && valeur !== "") brouillon[nom] = valeur;
    }
    try {
      sessionStorage.setItem(cle, JSON.stringify(brouillon));
    } catch {
      // Quota ou stockage refusé : la saisie reste à l'écran, on n'en fait pas
      // une erreur visible pour un filet de sécurité.
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onInput={memoriser}
      onChange={memoriser}
      className="rounded-xl border-2 border-dashed border-k-ink/20 p-3 space-y-3"
    >
      <input type="hidden" name="program_id" value={programId} />
      <p className="text-sm font-bold text-k-ink">Ajouter un palier</p>
      <CostPointsField id="new-ms-cout" />
      <RewardFields idPrefix="new-ms" defaultType="lot" wheels={wheels} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Ajout…" : "+ Ajouter le palier"}
        </Button>
        {/* Le pendant d'`AutoSaveEtat` sur les paliers voisins : ici rien ne
            part tout seul, et cela doit se LIRE — sinon la page promet un
            enregistrement automatique qu'un formulaire de création ne peut pas
            tenir sans créer de lignes fantômes. */}
        <p className="text-xs font-semibold text-amber-700">
          Ce palier n&apos;existe qu&apos;une fois ce bouton cliqué — votre
          saisie est conservée si vous quittez la page entre-temps.
        </p>
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Statut (activer / archiver) + suppression
// ────────────────────────────────────────────────────────────

/** Ce qui est vrai maintenant — les trois états du passeport, côté client. */
const PHRASE_ETAT: Record<LoyaltyProgramStatus, string> = {
  draft:
    "Vos clients ne peuvent pas encore tamponner : le passeport n'est pas ouvert.",
  active: "Le passeport est accessible à vos clients.",
  archived:
    "Le programme est terminé : plus aucun tampon n'est pris, et les codes déjà gagnés restent retirables.",
};

export function LoyaltyStatusControls({
  program,
  milestoneCount,
  hrefJeu = null,
}: {
  program: LoyaltyProgram;
  milestoneCount: number;
  /** Page publique du passeport, `null` tant qu'il n'est pas ouvert. */
  hrefJeu?: string | null;
}) {
  // Les deux formulaires de statut sont MUTUELLEMENT EXCLUSIFS (« Ouvrir aux joueurs » ou
  // « Clôturer », jamais les deux montés ensemble) : un seul jeu d'état suffit.
  const {
    state: statusState,
    pending: statusPending,
    onSubmit: statusSubmit,
  } = useActionForm(setLoyaltyProgramStatus, {
    // `reloadOnSuccess` : le badge d'état et la carte « Page publique »
    // suivent la prop serveur, donc le rafraîchissement — mesuré défaillant
    // (docs/bugs.md). Le geste est idempotent, mais l'écran affirmerait le
    // CONTRAIRE de l'état réel d'une page ouverte aux clients.
    reloadOnSuccess: true,
    networkError: "Mise à jour impossible, réessayez.",
  });
  // DÉLIBÉRÉMENT resté sur `useActionState` : `deleteLoyaltyProgram` se termine
  // par un `redirect()`. Appelée comme une simple fonction, elle lèverait
  // NEXT_REDIRECT, que le `catch` de useActionForm transformerait en message
  // d'échec sur une suppression pourtant réussie. Le défaut de transition figée
  // n'est de toute façon pas observable ici : l'écran quitte la page.
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteLoyaltyProgram,
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Même garde-fou que le serveur : au moins un palier pour activer.
  const canActivate = milestoneCount >= 1;

  return (
    <CarteStatutAnimation
      titre="Statut du programme"
      badge={<LoyaltyStatusBadge status={program.status} />}
      phrase={PHRASE_ETAT[program.status] ?? PHRASE_ETAT.draft}
      actions={
        program.status !== "active" ? (
          <form onSubmit={statusSubmit}>
            <input type="hidden" name="id" value={program.id} />
            <input type="hidden" name="status" value="active" />
            <Button type="submit" disabled={statusPending || !canActivate}>
              {statusPending ? "…" : "Ouvrir aux joueurs"}
            </Button>
          </form>
        ) : (
          <form onSubmit={statusSubmit}>
            <input type="hidden" name="id" value={program.id} />
            <input type="hidden" name="status" value="archived" />
            <Button type="submit" variant="secondary" disabled={statusPending}>
              {statusPending ? "…" : "Clôturer"}
            </Button>
          </form>
        )
      }
      raccourcis={
        <>
          <RaccourciAtelier href={hrefEtapeFidelite(program.id, "programme")} />
          {/* Le lien menait DÉJÀ au passeport (`/passeport/{id}`) : seul le mot
              était faux. Ici, ce que le client ouvre est un passeport, pas
              « un jeu ». */}
          <VoirLeJeu href={hrefJeu} libelle="Voir le passeport" />
        </>
      }
      notes={
        program.status !== "active" && !canActivate ? (
          <p className="mt-2 text-xs font-bold text-amber-700">
            Pour ouvrir aux joueurs, ajoutez au moins un palier.
          </p>
        ) : null
      }
      erreur={statusState && !statusState.ok ? statusState.error : undefined}
    >

      <div className="mt-5 border-t border-zinc-100 pt-4">
        {confirmDelete ? (
          <form action={deleteAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={program.id} />
            <span className="text-sm text-k-body">
              Supprimer ce programme, ses paliers et tous les passeports ?
            </span>
            {/* Champ DISTINCT de celui du palier (`confirm_outstanding`) : les
                deux cases vivent dans le même fichier et couvrent des
                périmètres différents — un palier, ou le programme entier.
                Partager le nom rendrait le registre des gardes destructives
                incapable de les distinguer. */}
            {deleteState &&
              !deleteState.ok &&
              deleteState.error.includes(LOYALTY_PROGRAM_LOSS_HINT) && (
                <label className="flex w-full max-w-md items-start gap-1.5 text-xs font-semibold text-red-700">
                  <input
                    type="checkbox"
                    name="confirm_program_outstanding"
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
            Supprimer le programme
          </Button>
        )}
        <FieldError
          message={deleteState && !deleteState.ok ? deleteState.error : undefined}
        />
      </div>
    </CarteStatutAnimation>
  );
}
