import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { FaqAccordion } from "@/components/sections/faq-accordion";
import { FinalCta } from "@/components/sections/final-cta";
import { FAQ_ITEMS } from "@/content/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Mise en place, RGPD, contrôle des lots, avis Google, remise des gains : toutes les réponses sur LastChance, la roue de la fortune par QR code.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <>
      <Section
        eyebrow="FAQ"
        title="Questions fréquentes"
        subtitle="Tout ce que les commerçants nous demandent avant de se lancer."
      >
        <FaqAccordion items={FAQ_ITEMS} />
      </Section>

      {/* Données structurées : rend la FAQ éligible aux résultats enrichis. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ_ITEMS.map((item) => ({
              "@type": "Question",
              name: item.question,
              acceptedAnswer: { "@type": "Answer", text: item.answer },
            })),
          }),
        }}
      />
      <FinalCta />
    </>
  );
}
