"use client";

import { useActionState } from "react";
import { createCheckoutSession } from "@/actions/billing";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import type { PlanTierId } from "@/lib/plans";
import type { Entitlement } from "@/platform/experiences/contract";

export interface ComparisonTierColumn {
  id: PlanTierId;
  name: string;
  tagline: string;
  priceMonthly: number;
  isCurrent: boolean;
  /** Vrai si la formule actuelle couvre déjà tous les droits de cette colonne. */
  isAlreadyCovered: boolean;
  isUpgrade: boolean;
  purchasable: boolean;
  badge?: string;
}

interface ComparisonRow {
  emoji: string;
  title: string;
  detail: string;
  entitlement?: Entitlement;
  /** Valeur par défaut affichée dans les cellules, ou booléen par formule. */
  values: Record<PlanTierId, string | boolean>;
}

interface ComparisonCategory {
  title: string;
  rows: ComparisonRow[];
}

const CATEGORIES: ComparisonCategory[] = [
  {
    title: "1. Jeux, Fidélité & Animations",
    rows: [
      {
        emoji: "🎡",
        title: "15 mini-jeux instantanés",
        detail: "Roue 3D, Grattage, Bandit Manchot, Coffre…",
        entitlement: "core",
        values: { core: true, engagement: true, place: true, live: true, full: true },
      },
      {
        emoji: "🪞",
        title: "Duo Miroir & Portrait de la Bande",
        detail: "Jeux brise-glace jouables à table",
        entitlement: "duo",
        values: { core: true, engagement: true, place: true, live: true, full: true },
      },
      {
        emoji: "🗝️",
        title: "Missions & coffres",
        detail: "Quêtes automatiques & coffres cadeaux",
        entitlement: "core",
        values: { core: true, engagement: true, place: true, live: true, full: true },
      },
      {
        emoji: "📔",
        title: "Passeport fidélité",
        detail: "QR client individuel · écran d'accueil & Wallet",
        entitlement: "loyalty",
        values: { core: false, engagement: true, place: false, live: false, full: true },
      },
      {
        emoji: "🤝",
        title: "Parrainage ambassadeurs",
        detail: "Lien d'invitation validé à la 1re visite",
        entitlement: "referral",
        values: { core: false, engagement: true, place: false, live: false, full: true },
      },
      {
        emoji: "🗓️",
        title: "Calendrier",
        detail: "Cadeaux & rendez-vous quotidien d'assiduité",
        entitlement: "calendar",
        values: { core: false, engagement: true, place: false, live: false, full: true },
      },
      {
        emoji: "❓",
        title: "Quiz",
        detail: "Parcours de questions autonome ou en salle",
        entitlement: "quiz",
        values: { core: false, engagement: true, place: true, live: true, full: true },
      },
      {
        emoji: "🗺️",
        title: "Chasse au QR",
        detail: "Parcours d'énigmes & balises à scanner",
        entitlement: "hunts",
        values: { core: false, engagement: true, place: false, live: false, full: true },
      },
      {
        emoji: "🎤",
        title: "Événements live",
        detail: "Écran géant TV & régie direct 250 joueurs",
        entitlement: "events",
        values: { core: false, engagement: false, place: false, live: true, full: true },
      },
      {
        emoji: "🏆",
        title: "Pronostics",
        detail: "Saisons sportives & classements de match",
        entitlement: "pronostics",
        values: { core: false, engagement: false, place: false, live: true, full: true },
      },
      {
        emoji: "🎰",
        title: "Jackpot collectif",
        detail: "Cagnotte partagée & tirage en salle",
        entitlement: "jackpot",
        values: { core: false, engagement: false, place: false, live: true, full: true },
      },
    ],
  },
  {
    title: "2. Vitrine en ligne & Réservations directes (0 % commission)",
    rows: [
      {
        emoji: "📖",
        title: "Vitrine & Tarifs au QR",
        detail: "Carte toujours à jour & 7 univers métiers",
        entitlement: "vitrine",
        values: { core: false, engagement: false, place: true, live: false, full: true },
      },
      {
        emoji: "📅",
        title: "Prise de rendez-vous en direct",
        detail: "Agenda, plan de salle, 0 % commission",
        entitlement: "rendez_vous",
        values: { core: false, engagement: false, place: true, live: false, full: true },
      },
      {
        emoji: "⚡",
        title: "Moments & Ateliers",
        detail: "Ateliers, file d'accueil & invendus anti-gaspi",
        entitlement: "reserver",
        values: { core: false, engagement: false, place: true, live: false, full: true },
      },
    ],
  },
  {
    title: "3. Services, Relances & Garanties incluses",
    rows: [
      {
        emoji: "📱",
        title: "Scans QR & Visiteurs",
        detail: "Aucun plafond de scans",
        values: {
          core: "Illimité",
          engagement: "Illimité",
          place: "Illimité",
          live: "Illimité",
          full: "Illimité",
        },
      },
      {
        emoji: "📧",
        title: "Emails de relance automatiques",
        detail: "Gain non retiré, client inactif, anniversaire",
        values: { core: true, engagement: true, place: true, live: true, full: true },
      },
      {
        emoji: "🛡️",
        title: "Commission sur votre CA",
        detail: "Aucun pourcentage prélevé",
        values: {
          core: "0 %",
          engagement: "0 %",
          place: "0 %",
          live: "0 %",
          full: "0 %",
        },
      },
      {
        emoji: "🔓",
        title: "Engagement de durée",
        detail: "Résiliable à tout moment",
        values: {
          core: "Sans engagement",
          engagement: "Sans engagement",
          place: "Sans engagement",
          live: "Sans engagement",
          full: "Sans engagement",
        },
      },
    ],
  },
];

function columnHeaderAccent(tier: ComparisonTierColumn): string {
  if (tier.isAlreadyCovered) {
    return "bg-zinc-100 text-k-muted";
  }
  if (tier.id === "engagement") {
    return "bg-amber-50 text-amber-950";
  }
  if (tier.id === "full") {
    return "bg-rose-50 text-rose-950";
  }
  return "bg-white text-k-ink";
}

function columnCellStyle(tier: ComparisonTierColumn): string {
  if (tier.isAlreadyCovered) {
    return "bg-zinc-50/80 text-k-muted";
  }
  if (tier.id === "engagement") {
    return "bg-amber-50/35";
  }
  if (tier.id === "full") {
    return "bg-rose-50/35";
  }
  return "bg-white";
}

export function SubscriptionComparisonTable({
  tiers,
  ownedEntitlements,
  hasLiveSubscription,
  supportEmail,
}: {
  tiers: ComparisonTierColumn[];
  ownedEntitlements: readonly string[];
  hasLiveSubscription: boolean;
  supportEmail: string;
}) {
  const [state, formAction, pending] = useActionState(
    createCheckoutSession,
    null,
  );
  const ownedSet = new Set(ownedEntitlements);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200">
              <th
                scope="col"
                className="w-[260px] bg-zinc-50/70 p-4 align-bottom text-xs font-bold uppercase tracking-wider text-zinc-500"
              >
                Modules &amp; services inclus
              </th>
              {tiers.map((tier) => (
                <th
                  key={tier.id}
                  scope="col"
                  className={`p-4 text-center align-top transition-colors ${columnHeaderAccent(tier)}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    {tier.isCurrent ? (
                      <span className="inline-flex items-center rounded-full bg-zinc-200 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-700">
                        ✓ Votre formule
                      </span>
                    ) : tier.isAlreadyCovered ? (
                      <span className="inline-flex items-center rounded-full bg-zinc-200 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-600">
                        ✓ Déjà inclus
                      </span>
                    ) : tier.badge ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          tier.id === "full"
                            ? "bg-rose-600 text-white"
                            : "bg-amber-400 text-amber-950"
                        }`}
                      >
                        {tier.badge}
                      </span>
                    ) : (
                      <span className="h-5" aria-hidden="true" />
                    )}
                    <span className="text-base font-bold">{tier.name}</span>
                    <span
                      className={`text-lg font-extrabold ${
                        tier.isAlreadyCovered ? "text-k-muted" : "text-k-ink"
                      }`}
                    >
                      {tier.priceMonthly} €
                      <span className="text-xs font-normal text-zinc-500">
                        /mois
                      </span>
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {CATEGORIES.map((category) => (
              <FragmentCategory
                key={category.title}
                category={category}
                tiers={tiers}
                ownedSet={ownedSet}
              />
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-zinc-200 bg-zinc-50/60">
              <th scope="row" className="p-4 text-left align-middle">
                <span className="block text-sm font-bold text-k-ink">
                  Choisir ou évoluer
                </span>
                <span className="text-xs font-normal text-zinc-500">
                  Sans engagement · annulable en 1 clic
                </span>
              </th>
              {tiers.map((tier) => {
                const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent(
                  `Passer à l'offre ${tier.name} — Simple comme QR`,
                )}`;
                return (
                  <td
                    key={tier.id}
                    className={`p-3 text-center align-middle ${columnCellStyle(tier)}`}
                  >
                    {tier.isCurrent ? (
                      <span className="inline-block rounded-lg bg-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600">
                        Formule actuelle
                      </span>
                    ) : tier.isAlreadyCovered ? (
                      <span className="inline-block rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-k-muted">
                        Déjà couvert
                      </span>
                    ) : hasLiveSubscription || !tier.purchasable ? (
                      <a
                        href={mailto}
                        className={`inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                          tier.id === "full"
                            ? "bg-rose-600 text-white hover:bg-rose-700"
                            : tier.id === "engagement"
                              ? "bg-amber-400 text-amber-950 hover:bg-amber-300"
                              : "bg-k-ink text-white hover:bg-zinc-800"
                        }`}
                      >
                        Passer à {tier.name} →
                      </a>
                    ) : (
                      <form action={formAction}>
                        <input type="hidden" name="plan" value={tier.id} />
                        <Button
                          type="submit"
                          disabled={pending}
                          variant={
                            tier.id === "engagement" || tier.id === "full"
                              ? "primary"
                              : "secondary"
                          }
                          className="w-full justify-center text-xs"
                        >
                          {pending ? "Redirection…" : `Choisir ${tier.name} →`}
                        </Button>
                      </form>
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <FieldError
        message={state && !state.ok ? state.error : undefined}
      />
    </div>
  );
}

function FragmentCategory({
  category,
  tiers,
  ownedSet,
}: {
  category: ComparisonCategory;
  tiers: ComparisonTierColumn[];
  ownedSet: Set<string>;
}) {
  return (
    <>
      <tr className="border-y border-zinc-200 bg-zinc-100/70">
        <th
          colSpan={tiers.length + 1}
          scope="colgroup"
          className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-zinc-700"
        >
          {category.title}
        </th>
      </tr>
      {category.rows.map((row) => {
        const rowOwned =
          row.entitlement !== undefined && ownedSet.has(row.entitlement);
        return (
          <tr
            key={row.title}
            className={`border-b border-zinc-100 last:border-b-0 ${
              rowOwned ? "bg-zinc-50/40" : ""
            }`}
          >
            <th scope="row" className="p-3.5 text-left align-middle">
              <div className="flex items-start gap-2.5">
                <span aria-hidden="true" className="mt-0.5 text-base">
                  {row.emoji}
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`font-semibold ${
                        rowOwned ? "text-zinc-500" : "text-k-ink"
                      }`}
                    >
                      {row.title}
                    </span>
                    {rowOwned && (
                      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                        ✓ Actif
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-normal text-zinc-500">
                    {row.detail}
                  </p>
                </div>
              </div>
            </th>
            {tiers.map((tier) => {
              const val = row.values[tier.id];
              const muted = tier.isAlreadyCovered;
              return (
                <td
                  key={tier.id}
                  className={`p-3 text-center align-middle ${columnCellStyle(tier)}`}
                >
                  {val === true ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        muted
                          ? "bg-zinc-200/70 text-k-muted"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      ✓ Inclus
                    </span>
                  ) : val === false ? (
                    <span className="text-k-muted">—</span>
                  ) : (
                    <span
                      className={`text-xs font-semibold ${
                        muted ? "text-k-muted" : "text-zinc-700"
                      }`}
                    >
                      {val}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
