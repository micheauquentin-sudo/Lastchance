"use client";

import { useState } from "react";
import { Tilt3D } from "@/components/ui/tilt-3d";
import { PLAN_TIERS } from "@/lib/plans";

const corePrice = PLAN_TIERS.find((t) => t.id === "core")?.priceMonthly ?? 29;

const ASSUMPTIONS = {
  playRate: 0.25,
  emailOptInRate: 0.6,
  winRate: 0.35,
  averagePrizeCost: 2.5,
  extraVisitsPerPlayerPerMonth: 0.4,
  grossMargin: 0.7,
  openDaysPerMonth: 26,
  subscriptionPerLocation: corePrice,
} as const;

export function RoiSimulator() {
  const [customersPerDay, setCustomersPerDay] = useState<number>(140);
  const [averageTicket, setAverageTicket] = useState<number>(25);
  const [locations, setLocations] = useState<number>(1);

  const monthlyCustomers = Math.max(0, customersPerDay) * ASSUMPTIONS.openDaysPerMonth;
  const playersPerMonth = Math.round(monthlyCustomers * ASSUMPTIONS.playRate);
  const newEmailsPerMonth = Math.round(playersPerMonth * ASSUMPTIONS.emailOptInRate);
  const prizesPerMonth = Math.round(playersPerMonth * ASSUMPTIONS.winRate);
  const extraVisitsPerMonth = Math.round(playersPerMonth * ASSUMPTIONS.extraVisitsPerPlayerPerMonth);
  const extraRevenuePerMonth = Math.round(extraVisitsPerMonth * Math.max(0, averageTicket));
  const totalCostPerMonth = Math.round(
    prizesPerMonth * ASSUMPTIONS.averagePrizeCost + Math.max(1, locations) * ASSUMPTIONS.subscriptionPerLocation,
  );
  const netGainPerMonth = Math.round(extraRevenuePerMonth * ASSUMPTIONS.grossMargin - totalCostPerMonth);
  const netGainPerYear = netGainPerMonth * 12;
  const roiMultiple =
    totalCostPerMonth > 0 ? Math.max(0, Math.round((netGainPerMonth / totalCostPerMonth) * 10) / 10) : 0;

  return (
    <div className="k-card relative rounded-3xl p-6 sm:p-10 shadow-lg">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-k-muted">
          <span className="h-2 w-2 rounded-full bg-k-green" />
          Simulateur de rentabilité
        </span>
        <h3 className="mt-2 text-2xl font-black text-k-ink sm:text-3xl" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
          Estimez votre retour sur investissement
        </h3>
        <p className="mx-auto mt-2 max-w-xl text-xs font-bold text-k-body sm:text-sm">
          Ajustez les curseurs selon votre commerce pour projeter les gains nets et le nombre d&apos;emails qualifiés générés chaque mois.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-center">
        {/* Curseurs */}
        <div className="space-y-6">
          {/* Clients par jour */}
          <div className="k-card rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between text-sm font-black text-k-ink">
              <label htmlFor="customers-slider">Clients par jour ouvré</label>
              <span className="rounded-full bg-k-yellow px-3 py-0.5 text-base font-black">
                {customersPerDay} clients
              </span>
            </div>
            <input
              id="customers-slider"
              type="range"
              min="20"
              max="600"
              step="10"
              value={customersPerDay}
              onChange={(e) => setCustomersPerDay(Number(e.target.value))}
              className="mt-3 w-full accent-k-orange"
            />
            <div className="flex justify-between text-[11px] font-bold text-k-muted">
              <span>20 / jour</span>
              <span>300 / jour</span>
              <span>600 / jour</span>
            </div>
          </div>

          {/* Panier moyen */}
          <div className="k-card rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between text-sm font-black text-k-ink">
              <label htmlFor="ticket-slider">Panier moyen par client</label>
              <span className="rounded-full bg-k-orange px-3 py-0.5 text-base font-black text-k-ink">
                {averageTicket} €
              </span>
            </div>
            <input
              id="ticket-slider"
              type="range"
              min="5"
              max="150"
              step="5"
              value={averageTicket}
              onChange={(e) => setAverageTicket(Number(e.target.value))}
              className="mt-3 w-full accent-k-orange"
            />
            <div className="flex justify-between text-[11px] font-bold text-k-muted">
              <span>5 €</span>
              <span>75 €</span>
              <span>150 €</span>
            </div>
          </div>

          {/* Nombre d'établissements */}
          <div className="k-card rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between text-sm font-black text-k-ink">
              <label htmlFor="locations-slider">Établissements</label>
              <span className="rounded-full bg-k-pink px-3 py-0.5 text-base font-black text-k-ink">
                {locations} {locations > 1 ? "lieux" : "lieu"}
              </span>
            </div>
            <input
              id="locations-slider"
              type="range"
              min="1"
              max="5"
              step="1"
              value={locations}
              onChange={(e) => setLocations(Number(e.target.value))}
              className="mt-3 w-full accent-k-orange"
            />
          </div>

          <p className="text-[11px] font-bold leading-normal text-k-muted">
            Hypothèses appliquées : 25% de participation, 60% d&apos;opt-in email, coût moyen du lot 2,50 €, 26 jours d&apos;ouverture / mois, marge brute 70%.
          </p>
        </div>

        {/* Résultats projetés */}
        <div>
          <Tilt3D intensity={6}>
            <div className="k-card-deep rounded-3xl p-6 sm:p-8 text-k-bg shadow-xl">
              <div className="flex items-center justify-between border-b border-k-bg/20 pb-4">
                <div>
                  <p className="text-xs font-black uppercase text-k-yellow">Gain net mensuel estimé</p>
                  <p className="text-4xl font-black sm:text-5xl text-k-yellow mt-1">
                    +{netGainPerMonth.toLocaleString("fr-FR")} €
                    <span className="text-sm font-bold text-k-bg/80"> / mois</span>
                  </p>
                </div>
                {roiMultiple > 0 && (
                  <span className="k-border-thin rounded-full bg-k-green px-3 py-1.5 text-xs font-black text-k-bg shadow">
                    ROI ×{roiMultiple}
                  </span>
                )}
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-k-bg/20 bg-white/10 p-3.5">
                  <p className="text-[11px] font-bold text-k-bg/75">Joueurs par mois</p>
                  <p className="mt-0.5 text-xl font-black text-k-bg">
                    {playersPerMonth.toLocaleString("fr-FR")}
                  </p>
                </div>

                <div className="rounded-2xl border border-k-bg/20 bg-white/10 p-3.5">
                  <p className="text-[11px] font-bold text-k-bg/75">Emails qualifiés / mois</p>
                  <p className="mt-0.5 text-xl font-black text-k-orange">
                    +{newEmailsPerMonth.toLocaleString("fr-FR")}
                  </p>
                </div>

                <div className="rounded-2xl border border-k-bg/20 bg-white/10 p-3.5">
                  <p className="text-[11px] font-bold text-k-bg/75">Visites supplémentaires</p>
                  <p className="mt-0.5 text-xl font-black text-k-yellow">
                    +{extraVisitsPerMonth.toLocaleString("fr-FR")}
                  </p>
                </div>

                <div className="rounded-2xl border border-k-bg/20 bg-white/10 p-3.5">
                  <p className="text-[11px] font-bold text-k-bg/75">Gain net annuel projeté</p>
                  <p className="mt-0.5 text-xl font-black text-k-green">
                    +{netGainPerYear.toLocaleString("fr-FR")} €
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-white/15 p-3.5 text-center text-xs font-bold text-k-bg/90">
                Sous ces hypothèses, le coût de l&apos;abonnement est couvert dès les premiers jours du mois. Vos chiffres réels dépendent de votre fréquentation et de vos lots.
              </div>
            </div>
          </Tilt3D>
        </div>
      </div>
    </div>
  );
}
