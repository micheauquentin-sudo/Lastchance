"use client";

import { useRef, useState } from "react";
import type { LoyaltyMilestoneView } from "@/lib/loyalty-context";
import type { LoyaltyTier } from "@/types/database";
import {
  LOYALTY_TIERS,
  loyaltyPointsGoal,
  loyaltyTierMeta,
  loyaltyTierProgress,
} from "./loyalty-passport-state";

/**
 * Surface commune du passeport : elle ne connaît ni Server Action, ni cookie,
 * ni formulaire de validation. Le parcours joueur lui injecte l'échange ; le
 * Studio ne monte que son aperçu inerte.
 */

export function EntetePasseport({
  logoUrl,
  organizationName,
  programName,
}: {
  logoUrl: string | null;
  organizationName: string;
  programName: string;
}) {
  return (
    <header className="mb-6 text-center">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={organizationName}
          width={56}
          height={56}
          className="mx-auto mb-3 h-14 w-14 rounded-full border-2 border-k-ink bg-white object-cover"
        />
      ) : (
        /* MÊME DISQUE QUE LE LOGO, et ce n'est pas une coquetterie.
           Depuis que le passeport peut porter un fond d'écran, un emoji
           posé à nu sur une photo n'a plus aucune surface garantie sous
           lui : le voile crème du haut le sauve la plupart du temps, une
           illustration claire ou chargée à cet endroit ne le sauve pas.
           Le disque blanc bordé d'encre est la surface que le logo importé
           a déjà — les deux états de l'en-tête se ressemblent enfin. */
        <div
          aria-hidden
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-k-ink bg-white text-3xl"
        >
          🎟️
        </div>
      )}
      <p className="text-xs font-bold uppercase tracking-wide text-k-body">
        {organizationName}
      </p>
      <h1 className="mt-1 text-2xl font-black leading-tight text-k-ink">
        {programName}
      </h1>
    </header>
  );
}

/**
 * LE SOLDE, EN TÊTE. C'est la seule chose que le client vient chercher : « il
 * me reste combien ? ». Le nombre de visites reste affiché, en second — il ne
 * décide plus de rien mais il continue de raconter la relation.
 *
 * La phrase de bascule (« vos points sont là, c'est vous qui choisissez ») ne
 * s'affiche que pour un porteur de points : jusqu'à ce lot, franchir un seuil
 * DONNAIT la récompense sans rien demander. Celui qui avait des points en
 * attente au moment de la bascule ne doit pas croire qu'on les lui a pris.
 */
export function SoldePanel({
  pointsBalance,
  visitCount,
  goal,
}: {
  pointsBalance: number;
  visitCount: number;
  goal: ReturnType<typeof loyaltyPointsGoal>;
}) {
  return (
    <section
      aria-label="Mes points"
      /* `#fde9ba` ET NON `bg-k-yellow/30` — c'est EXACTEMENT le même pixel.
         Cette teinte est le composite de `k-yellow` à 30 % sur le crème
         `k-bg` : sur un passeport sans fond d'écran, rien ne change, à la
         valeur près. Ce qui change, c'est sur un passeport QUI EN A UN. Un
         aplat à 30 % laisse passer la photo, et le voile de `FondEcran`
         s'éclaircit justement au milieu, là où cette carte vit : le calcul
         donne 3,8:1 pour la ligne « n visites validées » sur une
         illustration sombre — sous les 4,5:1 de WCAG 1.4.3. Or cette carte
         porte LE CHIFFRE que le client vient chercher. La décoration cède,
         le solde reste lisible quel que soit le décor choisi. */
      className="k-border mb-4 rounded-2xl bg-[#fde9ba] p-5 shadow-[6px_6px_0_var(--color-k-ink)]"
    >
      <p className="text-xs font-black uppercase tracking-wide text-k-body">
        Mes points
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-4xl font-black tabular-nums text-k-ink">
          {pointsBalance}
        </span>
        <span className="text-lg font-black text-k-ink">
          point{pointsBalance > 1 ? "s" : ""}
        </span>
      </p>
      <p className="mt-0.5 text-sm font-bold text-k-body tabular-nums">
        {visitCount} visite{visitCount > 1 ? "s" : ""} validée
        {visitCount > 1 ? "s" : ""}
      </p>

      {goal.nextCost !== null && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-k-body">
            <span>
              {goal.affordable > 0
                ? "Vers le cadeau suivant"
                : "Vers votre premier cadeau"}
            </span>
            <span className="tabular-nums">
              Encore {goal.missing} point{goal.missing > 1 ? "s" : ""}
            </span>
          </div>
          {/* JAUGE, et non carte à cases : voir l'arbitrage détaillé sur
              `loyaltyPointsGoal`. Un solde peut baisser, une case cochée ne
              peut pas se décocher sans mentir. */}
          <div
            className="h-3 overflow-hidden rounded-full border-2 border-k-ink bg-white"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(goal.ratio * 100)}
            aria-label="Progression vers le prochain cadeau"
          >
            <div
              className="h-full rounded-full bg-k-orange transition-[width] duration-500"
              style={{ width: `${Math.max(4, goal.ratio * 100)}%` }}
            />
          </div>
        </div>
      )}

      {goal.affordable > 0 && (
        <p className="mt-3 rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-black text-k-ink">
          {goal.affordable === 1
            ? "Un cadeau est à votre portée dès maintenant."
            : `${goal.affordable} cadeaux sont à votre portée dès maintenant.`}
        </p>
      )}

      {pointsBalance > 0 && (
        <p className="mt-3 text-sm font-bold text-k-body">
          Vos points sont bien là et ne s&apos;effacent pas : c&apos;est vous
          qui choisissez, plus bas, ce que vous en faites.
        </p>
      )}
    </section>
  );
}

export function TierPanel({
  tier,
  pointsEarnedTotal,
  progress,
}: {
  tier: LoyaltyTier;
  /** LE CUMUL GAGNÉ — l'assiette du niveau, jamais le solde. */
  pointsEarnedTotal: number;
  progress: ReturnType<typeof loyaltyTierProgress>;
}) {
  const meta = loyaltyTierMeta(tier);
  const nextMeta = progress.nextTier ? loyaltyTierMeta(progress.nextTier) : null;

  return (
    <section
      aria-label={`Niveau ${meta.label}`}
      className="k-border mb-4 rounded-2xl bg-white p-5 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-k-body">
            Votre niveau
          </p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-black text-k-ink">
            <span
              aria-hidden
              className={`inline-flex h-9 items-center rounded-full border-2 border-k-ink px-3 text-base ${meta.badgeClass}`}
            >
              {meta.emoji} {meta.label}
            </span>
          </p>
        </div>
        <p className="text-right">
          <span className="block text-3xl font-black tabular-nums text-k-ink">
            {pointsEarnedTotal}
          </span>
          <span className="text-xs font-bold text-k-body">
            point{pointsEarnedTotal > 1 ? "s" : ""} cumulés
          </span>
        </p>
      </div>

      {/* Frise des trois niveaux. */}
      <ol className="mt-4 flex items-center gap-1.5" aria-hidden>
        {LOYALTY_TIERS.map((t) => {
          const active = LOYALTY_TIERS.indexOf(t) <= LOYALTY_TIERS.indexOf(tier);
          const m = loyaltyTierMeta(t);
          return (
            <li
              key={t}
              className={`flex-1 rounded-full border-2 py-1 text-center text-[11px] font-black ${
                active
                  ? `${m.badgeClass} border-k-ink`
                  : "border-dashed border-k-ink/40 text-k-body"
              }`}
            >
              {m.emoji} {m.label}
            </li>
          );
        })}
      </ol>

      {nextMeta ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-k-body">
            <span>Vers {nextMeta.label}</span>
            <span className="tabular-nums">
              Encore {progress.remaining} point{progress.remaining > 1 ? "s" : ""}
            </span>
          </div>
          <div
            className="h-3 overflow-hidden rounded-full border-2 border-k-ink bg-white"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.ratio * 100)}
            aria-label={`Progression vers le niveau ${nextMeta.label}`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(4, progress.ratio * 100)}%`,
                backgroundColor: nextMeta.accent,
              }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border-2 border-k-ink bg-k-yellow/40 px-3 py-2 text-center text-sm font-black text-k-ink">
          🏅 Niveau maximum atteint — merci de votre fidélité !
        </p>
      )}

      {/* LA QUESTION QUE TOUT LE MONDE SE POSE en découvrant qu'on dépense.
          Le niveau suit le CUMUL gagné, pas le solde : le dire ici évite que
          le client garde ses points sans oser les utiliser. */}
      <p className="mt-3 text-xs font-bold text-k-body">
        Votre niveau se compte sur tous les points gagnés depuis le début :
        dépenser vos points ne le fait jamais redescendre.
      </p>
    </section>
  );
}

type BoutiqueExchangeInput = {
  programId: string;
  milestoneId: string;
  requestId: string;
};

type BoutiqueExchangeResult<TOutcome> =
  | { ok: true; data: TOutcome }
  | { ok: false; error: string };

export function BoutiquePaliers<TOutcome>({
  programId,
  milestones,
  pointsBalance,
  hasPassport,
  onEchanger,
  onEchange,
  apercu = false,
}: {
  programId: string;
  milestones: LoyaltyMilestoneView[];
  pointsBalance: number;
  /** Sans passeport ouvert, il n'y a rien à dépenser : on invite à tamponner. */
  hasPassport: boolean;
  /** Injecté par le conteneur joueur ; absent de l'aperçu Studio. */
  onEchanger?: (input: BoutiqueExchangeInput) => Promise<BoutiqueExchangeResult<TOutcome>>;
  onEchange?: (outcome: TOutcome) => void;
  /** Studio : l'écran se regarde, il ne dépense pas. Voir l'en-tête. */
  apercu?: boolean;
}) {
  if (milestones.length === 0) return null;
  const ordered = [...milestones].sort((a, b) => a.costPoints - b.costPoints);

  return (
    <section className="mb-6">
      <h2 className="mb-1 text-sm font-black uppercase tracking-wide text-k-body">
        Échanger mes points
      </h2>
      <p className="mb-3 text-sm font-bold text-k-body">
        Choisissez ce qui vous fait plaisir : le cadeau est à vous dès que vous
        avez assez de points.
      </p>
      <ol className="space-y-2.5">
        {ordered.map((m) => (
          <li key={m.id}>
            <CartePalierBoutique
              programId={programId}
              milestone={m}
              pointsBalance={pointsBalance}
              hasPassport={hasPassport}
              onEchanger={onEchanger}
              onEchange={onEchange}
              apercu={apercu}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function CartePalierBoutique<TOutcome>({
  programId,
  milestone,
  pointsBalance,
  hasPassport,
  onEchanger,
  onEchange,
  apercu = false,
}: {
  programId: string;
  milestone: LoyaltyMilestoneView;
  pointsBalance: number;
  hasPassport: boolean;
  onEchanger?: (input: BoutiqueExchangeInput) => Promise<BoutiqueExchangeResult<TOutcome>>;
  onEchange?: (outcome: TOutcome) => void;
  apercu?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [echange, setEchange] = useState(false);
  // CLÉ DE REJEU, fabriquée ICI et conservée tant que l'échange n'a pas abouti :
  // c'est elle qui rend le double-clic inoffensif — la base rend alors la même
  // récompense au lieu de débiter deux fois. Renouvelée après un succès, pour
  // qu'un second achat du même cadeau soit bien un second achat.
  const requestIdRef = useRef<string | null>(null);

  const manque = Math.max(0, milestone.costPoints - pointsBalance);
  const abordable = manque === 0;
  const bloque = milestone.soldOut || !abordable || !hasPassport;

  const echanger = async () => {
    // Le Studio montre la carte, il ne la dépense pas.
    if (pending || apercu || !onEchanger) return;
    setErreur(null);
    setPending(true);
    requestIdRef.current ??= crypto.randomUUID();
    try {
      const result = await onEchanger({
        programId,
        milestoneId: milestone.id,
        requestId: requestIdRef.current,
      });
      if (!result.ok) {
        setErreur(result.error);
        return;
      }
      // Le serveur a confirmé : on l'affiche SANS attendre un rechargement.
      requestIdRef.current = null;
      setEchange(true);
      onEchange?.(result.data);
    } catch {
      setErreur("Connexion perdue. Vos points n'ont pas été débités, réessayez.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className={`rounded-xl border-2 px-3 py-3 ${
        abordable && !milestone.soldOut
          ? "border-k-ink bg-white shadow-[3px_3px_0_var(--color-k-ink)]"
          : "border-k-ink/15 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* LE PRIX. Sa couleur "éteinte" reste LISIBLE : `text-k-ink/50` sur
            blanc plafonnait à ~2,6:1, la moitié du minimum, et le scan a11y
            l a refusé. Un cadeau hors de portée doit se lire — c est même là
            qu il faut lire le prix, puisque c est ce qui manque. `text-k-body`
            est la teinte atténuée de la charte, et elle, elle passe. */}
        <span
          aria-hidden
          className={`flex h-11 shrink-0 items-center justify-center rounded-full border-2 px-3 text-sm font-black tabular-nums ${
            abordable && !milestone.soldOut
              ? "border-k-ink bg-k-yellow text-k-ink"
              : "border-k-ink/30 text-k-body"
          }`}
        >
          {milestone.costPoints}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-k-ink">
            {milestone.rewardType === "spin"
              ? milestone.rewardLabel || "Tour de roue offert"
              : milestone.rewardLabel || "Lot fidélité"}
          </p>
          <p className="text-xs font-bold text-k-body">
            {milestone.rewardType === "spin" ? "🎡 Tour de roue" : "🎁 Lot"} ·{" "}
            {milestone.costPoints} point{milestone.costPoints > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {echange ? (
        <p className="mt-3 rounded-xl border-2 border-k-ink bg-k-green/15 px-3 py-2 text-sm font-black text-k-ink">
          Échangé ! Votre cadeau est plus haut, dans « Mes récompenses ».
        </p>
      ) : milestone.soldOut ? (
        <p className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          Épuisé pour le moment. Vos points restent sur votre carte.
        </p>
      ) : !hasPassport ? (
        <p className="mt-3 text-sm font-bold text-k-body">
          Validez une première visite pour commencer à gagner des points.
        </p>
      ) : !abordable ? (
        <p className="mt-3 text-sm font-bold text-k-body">
          Encore{" "}
          <span className="text-k-ink tabular-nums">
            {manque} point{manque > 1 ? "s" : ""}
          </span>{" "}
          pour ce cadeau.
        </p>
      ) : (
        <button
          type="button"
          onClick={echanger}
          disabled={pending || bloque}
          className="k-btn mt-3 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-3 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
        >
          {pending
            ? "Échange…"
            : `Échanger (${milestone.costPoints} points)`}
        </button>
      )}

      {erreur && (
        <p role="alert" className="mt-2 text-sm font-bold text-red-700">
          {erreur}
        </p>
      )}
    </div>
  );
}
