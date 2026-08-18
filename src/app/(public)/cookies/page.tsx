import type { Metadata } from "next";
import { CookiePreferences } from "@/components/cookie-preferences";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = { title: "Gestion des cookies" };

export default function CookiesPage() {
  return (
    <LegalPage title="Cookies et stockage local">
      <LegalSection title="Strictement nécessaires">
        <p>Les cookies de session sécurisent la connexion du commerçant. Sur le jeu public, un identifiant aléatoire d&apos;appareil applique la fréquence de jeu sans demander l&apos;identité du joueur. Ces stockages ne peuvent pas être désactivés depuis le bandeau car ils sont nécessaires au service.</p>
      </LegalSection>
      <LegalSection title="Mesure d'audience facultative">
        <p>PostHog n&apos;est initialisé qu&apos;après votre accord. Accepter ou refuser donne accès au même service. Vous pouvez modifier votre choix à tout moment.</p>
        <CookiePreferences />
      </LegalSection>
    </LegalPage>
  );
}
