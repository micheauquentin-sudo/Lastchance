import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = { title: "Mentions légales" };

export default function LegalNoticePage() {
  const legalName = process.env.LEGAL_ENTITY_NAME ?? "LastChance";
  const contact = process.env.LEGAL_CONTACT_EMAIL ?? "contact@lastchance.app";
  const address = process.env.LEGAL_POSTAL_ADDRESS;
  const host = process.env.LEGAL_HOST_NAME ?? "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis";
  return (
    <LegalPage title="Mentions légales">
      <LegalSection title="Éditeur">
        <p>{legalName}{address ? ` — ${address}` : ""}. Contact : <a className="underline" href={`mailto:${contact}`}>{contact}</a>.</p>
      </LegalSection>
      <LegalSection title="Hébergement">
        <p>{host}.</p>
      </LegalSection>
      <LegalSection title="Propriété intellectuelle">
        <p>Les textes, interfaces, marques et logiciels du service sont protégés. Leur reproduction hors des usages autorisés par le service requiert l&apos;accord de leurs titulaires.</p>
      </LegalSection>
      <LegalSection title="Signalement">
        <p>Un contenu, une campagne ou un usage illicite peut être signalé à l&apos;adresse de contact ci-dessus avec les éléments permettant de l&apos;identifier.</p>
      </LegalSection>
    </LegalPage>
  );
}
