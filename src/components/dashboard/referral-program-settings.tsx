"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveReferralProgram } from "@/actions/referral";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CodeTtlDaysField,
  codeTtlDaysInitial,
} from "@/components/dashboard/code-ttl-days-field";
import { FieldError, Input, Label } from "@/components/ui/input";
import { cheapestTierFor, formatMonthlyPrice } from "@/lib/plans";
import type { ActionResult } from "@/lib/utils";

/** Offre la moins chère ouvrant le parrainage — nommée au lieu d'« option ». */
const REFERRAL_TIER = cheapestTierFor("referral");

/** Nature d'un versement (miroir du CHECK SQL + de l'éditeur de cases calendrier). */
type RewardKind = "none" | "spin" | "lot";

/**
 * Ligne `referral_programs` préremplie, lue côté page RSC (RLS membre). null =
 * programme pas encore configuré → défauts de la migration.
 */
export interface ReferralProgramRow {
  enabled: boolean;
  chest_threshold: number;
  sponsor_max_filleuls: number;
  /** Fenêtre de VALIDATION d'un filleul — voir le piège de nommage ci-dessous. */
  window_days: number;
  /** Validité du code PARRAIN- déjà gagné, en jours (null = sans limite). */
  code_ttl_days: number | null;
  sponsor_reward_kind: RewardKind;
  sponsor_reward_label: string;
  sponsor_reward_details: string | null;
  sponsor_reward_stock: number | null;
  filleul_reward_kind: RewardKind;
  filleul_reward_label: string;
  filleul_reward_details: string | null;
  filleul_reward_stock: number | null;
  chest_reward_kind: RewardKind;
  chest_reward_label: string;
  chest_reward_details: string | null;
  chest_reward_stock: number | null;
}

interface RewardState {
  kind: RewardKind;
  label: string;
  details: string;
  stock: string;
}

const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

/** Défauts de la migration 20260729120000 quand aucun programme n'existe. */
function initReward(
  kind: RewardKind,
  label: string,
  details: string | null,
  stock: number | null,
): RewardState {
  return {
    kind,
    label,
    details: details ?? "",
    stock: stock === null ? "" : String(stock),
  };
}

/**
 * Section « Parrainage » de l'éditeur de campagne roue. Miroir de
 * CampaignClaimSettings pour l'habillage (Card, accents orange) et de l'éditeur
 * de cases calendrier pour les 3 versements config-libre (kind none|spin|lot +
 * lot → libellé/détails/stock). Soumet via saveReferralProgram (session + RLS
 * éditeur) — l'activation exige l'addon actif, sinon message clair côté action.
 * `pending` manuel et non `useTransition` : l'état de chargement doit retomber
 * même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */
export function ReferralProgramSettings({
  campaignId,
  program,
  hasAccess,
}: {
  campaignId: string;
  program: ReferralProgramRow | null;
  /** L'addon Parrainage est-il activé (option + abonnement actif) ? */
  hasAccess: boolean;
}) {
  const [enabled, setEnabled] = useState(program?.enabled ?? false);
  const [chestThreshold, setChestThreshold] = useState(
    String(program?.chest_threshold ?? 3),
  );
  const [sponsorMaxFilleuls, setSponsorMaxFilleuls] = useState(
    String(program?.sponsor_max_filleuls ?? 20),
  );
  const [windowDays, setWindowDays] = useState(
    String(program?.window_days ?? 30),
  );
  const [codeTtlDays, setCodeTtlDays] = useState(() =>
    codeTtlDaysInitial(program?.code_ttl_days),
  );
  const [sponsor, setSponsor] = useState<RewardState>(
    initReward(
      program?.sponsor_reward_kind ?? "none",
      program?.sponsor_reward_label ?? "",
      program?.sponsor_reward_details ?? null,
      program?.sponsor_reward_stock ?? null,
    ),
  );
  const [filleul, setFilleul] = useState<RewardState>(
    initReward(
      program?.filleul_reward_kind ?? "none",
      program?.filleul_reward_label ?? "",
      program?.filleul_reward_details ?? null,
      program?.filleul_reward_stock ?? null,
    ),
  );
  const [chest, setChest] = useState<RewardState>(
    initReward(
      program?.chest_reward_kind ?? "none",
      program?.chest_reward_label ?? "",
      program?.chest_reward_details ?? null,
      program?.chest_reward_stock ?? null,
    ),
  );

  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const save = () => {
    if (pending) return;
    setPending(true);
    void (async () => {
      try {
        const res = await saveReferralProgram({
          campaignId,
          enabled,
          chestThreshold,
          sponsorMaxFilleuls,
          windowDays,
          // Cet écran est le SEUL à régler l'échéance du parrainage, et il la
          // porte toujours : la clé est donc toujours posée. `''` vaut « sans
          // limite » (valeur légitime) ; l'action ne la distingue de « ne
          // touche pas » que par l'ABSENCE de la clé — jamais de `|| undefined`.
          codeTtlDays: codeTtlDays.trim(),
          sponsor,
          filleul,
          chest,
        });
        setResult(res);
        if (res.ok) router.refresh();
      } catch {
        // Coupure réseau : le dire, plutôt que de laisser le bouton tourner.
        setResult({ ok: false, error: "Enregistrement impossible, réessayez." });
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <Card>
      <h2 className="font-semibold mb-1">Parrainage ludique</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Un client qui vient de jouer invite ses amis. Quand un ami joue vraiment
        (pas un simple clic), l&apos;équipe progresse : jauge collective, coffre
        débloqué à un seuil, récompenses que vous choisissez.
      </p>

      {!hasAccess && (
        <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Le module Parrainage n&apos;est pas activé sur votre compte. Vos
          réglages restent modifiables, mais l&apos;activation demande{" "}
          {REFERRAL_TIER
            ? `l'offre ${REFERRAL_TIER.name} (${formatMonthlyPrice(REFERRAL_TIER)})`
            : "une offre incluant le module"}
          .
        </p>
      )}

      <div className="space-y-6">
        {/* ── Activation ── */}
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!hasAccess}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-orange-600 disabled:opacity-50"
          />
          <span>
            <span className="font-medium text-zinc-900">
              Activer le parrainage sur cette campagne
            </span>
            <span className="block text-xs text-zinc-500 mt-0.5">
              Le bouton « Parraine tes amis » apparaît sur la roue après une
              partie.
            </span>
          </span>
        </label>

        {/* ── Réglages numériques ── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="referral-chest-threshold">Seuil du coffre</Label>
            <Input
              id="referral-chest-threshold"
              type="number"
              min={2}
              max={50}
              value={chestThreshold}
              onChange={(e) => setChestThreshold(e.target.value)}
              aria-describedby="referral-chest-threshold-help"
            />
            <p
              id="referral-chest-threshold-help"
              className="mt-1.5 text-xs text-zinc-500"
            >
              Nombre d&apos;amis validés pour débloquer le coffre (2 à 50).
            </p>
          </div>
          <div>
            <Label htmlFor="referral-max-filleuls">Filleuls max / parrain</Label>
            <Input
              id="referral-max-filleuls"
              type="number"
              min={1}
              max={1000}
              value={sponsorMaxFilleuls}
              onChange={(e) => setSponsorMaxFilleuls(e.target.value)}
              aria-describedby="referral-max-filleuls-help"
            />
            <p
              id="referral-max-filleuls-help"
              className="mt-1.5 text-xs text-zinc-500"
            >
              Plafonne les récompenses d&apos;un même parrain (1 à 1000).
            </p>
          </div>
          <div>
            {/* PIÈGE DE NOMMAGE, et il est à l'écran : ce champ s'appelait
                « Durée de validité », à un bloc de l'échéance du LOT ajoutée
                plus bas — deux durées en jours, mêmes bornes 1..365, sens
                opposés. Celui-ci borne le délai pendant lequel un parrainage
                peut encore être VALIDÉ (avant la récompense) ; l'autre borne
                la validité du code une fois le lot GAGNÉ. Le libellé nomme
                désormais ce qu'il borne. */}
            <Label htmlFor="referral-window-days">
              Délai de validation d&apos;un filleul
            </Label>
            <Input
              id="referral-window-days"
              type="number"
              min={1}
              max={365}
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
              aria-describedby="referral-window-days-help"
            />
            <p
              id="referral-window-days-help"
              className="mt-1.5 text-xs text-zinc-500"
            >
              Jours dont dispose un filleul pour jouer et rendre le parrainage
              valable (1 à 365). Ne concerne pas la validité du lot gagné, qui
              se règle plus bas.
            </p>
          </div>
        </div>

        {/* ── Les 3 versements ── */}
        <RewardEditor
          idPrefix="referral-sponsor"
          title="🎁 Récompense du parrain"
          hint="Versée au parrain pour chaque ami validé."
          reward={sponsor}
          onChange={setSponsor}
        />
        <RewardEditor
          idPrefix="referral-filleul"
          title="👋 Bonus de bienvenue du filleul"
          hint="Versé à l'ami qui rejoint l'équipe en jouant."
          reward={filleul}
          onChange={setFilleul}
        />
        <RewardEditor
          idPrefix="referral-chest"
          title="🧰 Coffre de l'équipe"
          hint="Versé une seule fois au parrain qui atteint le seuil du coffre."
          reward={chest}
          onChange={setChest}
        />

        <CodeTtlDaysField
          idPrefix="referral"
          legend="Expiration des codes de retrait PARRAIN-"
          value={codeTtlDays}
          onChange={setCodeTtlDays}
          emissionHint="Délai laissé au client pour présenter son code PARRAIN- en caisse, à partir du moment où le lot lui est VERSÉ (ami validé, bonus de bienvenue, ou coffre atteint). À ne pas confondre avec le délai de validation ci-dessus."
        />

        <FieldError message={result && !result.ok ? result.error : undefined} />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={save}
            disabled={pending}
          >
            {pending ? "…" : "Enregistrer"}
          </Button>
          {result?.ok && (
            <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Éditeur d'UN versement (parrain / filleul / coffre). Miroir de DayRow du
 * calendrier : sélecteur d'usage (Rien / Tour de roue offert / Lot à retirer) ;
 * un lot exige libellé + stock fini (bornes appliquées côté action/SQL).
 */
function RewardEditor({
  idPrefix,
  title,
  hint,
  reward,
  onChange,
}: {
  idPrefix: string;
  title: string;
  hint: string;
  reward: RewardState;
  onChange: (next: RewardState) => void;
}) {
  const set = (patch: Partial<RewardState>) => onChange({ ...reward, ...patch });

  return (
    <fieldset className="rounded-xl border-2 border-k-ink/15 bg-white p-4">
      <legend className="px-1 text-sm font-bold text-k-ink">{title}</legend>
      <p className="mb-3 text-xs text-zinc-500">{hint}</p>

      <div className="mb-3 flex flex-wrap gap-3">
        {(
          [
            ["none", "🚫 Rien"],
            ["spin", "🎡 Tour de roue offert"],
            ["lot", "🎁 Lot à retirer"],
          ] as [RewardKind, string][]
        ).map(([value, label]) => (
          <label
            key={value}
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <input
              type="radio"
              name={`${idPrefix}-kind`}
              value={value}
              checked={reward.kind === value}
              onChange={() => set({ kind: value })}
              className="h-4 w-4 accent-orange-600"
            />
            {label}
          </label>
        ))}
      </div>

      {reward.kind === "lot" && (
        <div className="space-y-2">
          <div>
            <Label htmlFor={`${idPrefix}-label`}>Lot</Label>
            <Input
              id={`${idPrefix}-label`}
              value={reward.label}
              onChange={(e) => set({ label: e.target.value })}
              maxLength={120}
              placeholder="Ex : Un café offert"
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-details`}>Détails (optionnel)</Label>
            <textarea
              id={`${idPrefix}-details`}
              value={reward.details}
              onChange={(e) => set({ details: e.target.value })}
              maxLength={2000}
              rows={2}
              placeholder="Conditions, validité…"
              className={textareaClass}
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-stock`}>Stock du lot (obligatoire)</Label>
            <Input
              id={`${idPrefix}-stock`}
              type="number"
              min={0}
              max={1_000_000}
              value={reward.stock}
              onChange={(e) => set({ stock: e.target.value })}
              placeholder="Ex : 50"
              aria-describedby={`${idPrefix}-stock-help`}
              className="w-40"
            />
            <p
              id={`${idPrefix}-stock-help`}
              className="mt-1.5 text-xs text-zinc-500"
            >
              Plafonne les codes émis pour ce versement (0 = épuisé / en pause).
            </p>
          </div>
        </div>
      )}
    </fieldset>
  );
}
