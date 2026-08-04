import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { FinalCta } from "@/components/sections/final-cta";
import {
  ADDON_NOTES,
  ADDONS_INTRO,
  PRICING_ADDONS,
  PRICING_NOTES,
  PRICING_PLANS,
} from "@/content/pricing";
import { CHECKOUT_ENABLED, SIGNUP_URL } from "@/content/site";

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Quatre offres LastChance par objectif — lancer, fidéliser, animer, tout réunir — et huit options achetables seules.",
  alternates: { canonical: "/tarifs" },
};

/** Puce de liste : la coche est décorative, le texte porte l'information. */
function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm">
      <span aria-hidden className="text-brand-600">
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

export default function PricingPage() {
  return (
    <>
      <Section
        eyebrow="Tarifs"
        title="Une offre adaptée à votre objectif"
        subtitle="Commencez avec les jeux instantanés, puis activez la fidélité, le live ou toute la plateforme."
      >
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2">
          {PRICING_PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={
                plan.highlighted ? "border-brand-300 ring-2 ring-brand-100" : ""
              }
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-bold">{plan.name}</h2>
                <p>
                  <span className="text-4xl font-bold tracking-tight">
                    {plan.priceMonthly}€
                  </span>
                  <span className="text-sm text-ink-soft"> /mois</span>
                </p>
              </div>
              <p className="mt-2 text-sm text-ink-soft">{plan.description}</p>

              <ul className="mt-6 space-y-2.5">
                {plan.experiences.map((experience) => (
                  <Bullet key={experience}>{experience}</Bullet>
                ))}
                {plan.highlights.map((highlight) => (
                  <Bullet key={highlight}>{highlight}</Bullet>
                ))}
                {plan.limits.map((limit) => (
                  <Bullet key={limit}>{limit}</Bullet>
                ))}
              </ul>

              <ButtonLink
                href={CHECKOUT_ENABLED ? SIGNUP_URL : "/contact"}
                external={CHECKOUT_ENABLED}
                size="lg"
                className="mt-8 w-full"
              >
                {CHECKOUT_ENABLED
                  ? `Commencer — ${plan.trialDays} jours gratuits`
                  : "Parler de cette offre"}
              </ButtonLink>
            </Card>
          ))}
        </div>

        <ul className="mx-auto mt-10 max-w-6xl space-y-1 text-center text-sm text-ink-faint">
          {PRICING_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </Section>

      <Section
        id="options"
        eyebrow="Options"
        title="Un seul module vous suffit ? Prenez-le seul."
        subtitle={ADDONS_INTRO}
      >
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PRICING_ADDONS.map((addon) => (
            <Card key={addon.entitlement} className="flex flex-col">
              <h2 className="text-base font-bold">{addon.name}</h2>
              <p className="mt-3 text-2xl font-bold tracking-tight">
                {addon.priceLabel}
              </p>
              <p className="mt-1 text-sm font-semibold text-brand-700">
                {addon.cadence}
              </p>
              <p className="mt-3 text-sm text-ink-soft">{addon.duration}</p>

              {addon.steps.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {addon.steps.map((step) => (
                    <li
                      key={step.maxPlayers}
                      className="flex justify-between gap-4 text-sm"
                    >
                      <span>Jusqu&apos;à {step.maxPlayers} joueurs</span>
                      <span className="font-semibold">{step.price} €</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-auto pt-6">
                <ButtonLink
                  href={CHECKOUT_ENABLED ? SIGNUP_URL : "/contact"}
                  external={CHECKOUT_ENABLED}
                  variant="secondary"
                  className="w-full"
                >
                  {CHECKOUT_ENABLED ? "Activer cette option" : "En parler"}
                </ButtonLink>
              </div>
            </Card>
          ))}
        </div>

        <ul className="mx-auto mt-10 max-w-3xl space-y-1 text-center text-sm text-ink-faint">
          {ADDON_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </Section>

      <FinalCta />
    </>
  );
}
