import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function TermsPage() {
  return (
    <LegalPage title="Conditions d'utilisation du jeu">
      <LegalSection title="Principe">
        <p>Chaque jeu est organisé par le commerçant indiqué sur son support. La participation est gratuite et sans obligation d&apos;achat, sauf indication légale contraire propre à l&apos;opération. Les probabilités et stocks sont configurés avant le tirage et le résultat est enregistré côté serveur.</p>
      </LegalSection>
      <LegalSection title="Limites et anti-abus">
        <p>Une limite par appareil et par période peut s&apos;appliquer. Contourner volontairement une limite, automatiser des participations ou altérer le service peut entraîner le rejet des participations concernées. Aucun document d&apos;identité ni renseignement personnel n&apos;est demandé pour prouver qu&apos;un joueur est humain.</p>
      </LegalSection>
      <LegalSection title="Remise du gain">
        <p>Le code affiché doit être présenté au commerçant selon la durée et les modalités annoncées. Il ne peut être validé qu&apos;une fois. Un avis, une note, un abonnement marketing ou le partage de coordonnées non nécessaires ne peut jamais être exigé en contrepartie du gain.</p>
      </LegalSection>
      <LegalSection title="Disponibilité">
        <p>En cas d&apos;incident technique, le commerçant reste l&apos;interlocuteur pour la remise d&apos;un gain déjà enregistré. LastChance peut suspendre une campagne manifestement frauduleuse ou dangereuse.</p>
      </LegalSection>
    </LegalPage>
  );
}
