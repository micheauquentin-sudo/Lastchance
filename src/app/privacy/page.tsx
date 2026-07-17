import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialité">
      <LegalSection title="Jouer sans s'identifier">
        <p>LastChance ne demande ni nom, ni email, ni téléphone, ni création de compte pour vérifier qu&apos;un joueur est une vraie personne. Un identifiant aléatoire est conservé sur l&apos;appareil et transformé en empreinte côté serveur pour appliquer la limite de jeu. Les données réseau sont utilisées brièvement pour la protection anti-abus. Un challenge Cloudflare Turnstile peut être affiché sans constituer un profil client.</p>
      </LegalSection>
      <LegalSection title="Données d'un gagnant">
        <p>Après un gain seulement, le commerçant peut demander les coordonnées strictement nécessaires à sa remise. Les champs requis sont annoncés avant l&apos;envoi. L&apos;inscription marketing est distincte, facultative et décochée par défaut. Un refus n&apos;affecte jamais le gain.</p>
      </LegalSection>
      <LegalSection title="Responsabilités et finalités">
        <p>Le commerçant qui organise le jeu est responsable des données de ses clients. LastChance les traite pour exécuter le jeu, prévenir la fraude, remettre les gains, assurer la sécurité et, avec consentement, envoyer les communications demandées. Les prestataires techniques peuvent inclure Supabase, Cloudflare, Resend, Stripe, Sentry et, après consentement, PostHog.</p>
      </LegalSection>
      <LegalSection title="Conservation et droits">
        <p>La conservation des participations est limitée à douze mois par défaut et peut être raccourcie par le commerçant. Les contacts désinscrits sont purgés selon ce même délai. Pour exercer un droit d&apos;accès, de rectification, d&apos;effacement, d&apos;opposition ou de portabilité, contactez d&apos;abord le commerçant organisateur, identifiable sur le support du jeu, ou utilisez l&apos;adresse de contact figurant dans les mentions légales.</p>
      </LegalSection>
      <LegalSection title="Aucune contrepartie d'avis">
        <p>Les coordonnées, le consentement marketing et un avis en ligne ne modifient jamais les chances de gain et ne conditionnent jamais sa remise.</p>
      </LegalSection>
    </LegalPage>
  );
}
