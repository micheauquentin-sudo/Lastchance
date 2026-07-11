import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { FinalCta } from "@/components/sections/final-cta";
import { PRICING_NOTES, PRICING_PLANS } from "@/content/pricing";
import { SIGNUP_URL } from "@/content/site";

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Un tarif simple et sans engagement : 29 €/mois, essai gratuit de 7 jours sans carte bancaire. Campagnes illimitées, emails RGPD, statistiques en temps réel.",
  alternates: { canonical: "/tarifs" },
};

export default function PricingPage() {
  return (
    <>
      <Section
        eyebrow="Tarifs"
        title="Simple, transparent, sans engagement"
        subtitle="Un lot offert coûte quelques euros. Un client qui revient en rapporte bien plus."
      >
        <div className="mx-auto grid max-w-md gap-6">
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
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-sm">
                    <span aria-hidden className="text-brand-600">
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <ButtonLink
                href={SIGNUP_URL}
                external
                size="lg"
                className="mt-8 w-full"
              >
                Commencer — {plan.trialDays} jours gratuits
              </ButtonLink>
            </Card>
          ))}

          <ul className="space-y-1 text-center text-sm text-ink-faint">
            {PRICING_NOTES.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </Section>
      <FinalCta />
    </>
  );
}
