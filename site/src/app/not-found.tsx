import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";

export default function NotFound() {
  return (
    <Section
      eyebrow="Erreur 404"
      title="Cette page n'existe pas"
      subtitle="La roue a tourné… mais pas dans le bon sens. Revenez à l'accueil."
    >
      <div className="text-center">
        <ButtonLink href="/">Retour à l&apos;accueil</ButtonLink>
      </div>
    </Section>
  );
}
