import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { CONTACT_EMAIL, SIGNUP_URL } from "@/content/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Une question sur LastChance ? Écrivez-nous, nous répondons sous 24 h ouvrées.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <Section
      eyebrow="Contact"
      title="Parlons de votre commerce"
      subtitle="Une question, une démo, un projet multi-établissements ? Nous répondons sous 24 h ouvrées."
    >
      <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Par email</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Le plus simple : décrivez votre établissement et votre besoin,
            nous revenons vers vous rapidement.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Question%20sur%20LastChance`}
            className="mt-5 inline-block font-semibold text-brand-600 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </Card>

        <Card>
          <h2 className="font-semibold">Envie de tester directement ?</h2>
          <p className="mt-2 text-sm text-ink-soft">
            L&apos;essai gratuit reste le meilleur moyen de se faire une idée :
            7 jours, sans carte bancaire, votre roue tourne en 10 minutes.
          </p>
          <ButtonLink href={SIGNUP_URL} external className="mt-5">
            Créer mon compte
          </ButtonLink>
        </Card>
      </div>

      <p className="mt-10 text-center text-sm text-ink-faint">
        Avant d&apos;écrire, jetez un œil à la{" "}
        <Link href="/faq" className="font-medium text-brand-600 hover:underline">
          FAQ
        </Link>{" "}
        — votre réponse s&apos;y trouve peut-être déjà.
      </p>
    </Section>
  );
}
