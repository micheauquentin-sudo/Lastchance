import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { LOGIN_URL, NAV_LINKS, SIGNUP_URL } from "@/content/site";
import { NavLinks } from "./nav-links";

/**
 * En-tête sticky : logo, navigation, double CTA (connexion discrète,
 * essai gratuit en évidence). Verre dépoli léger au scroll.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-surface/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Logo className="text-lg" />

        <nav aria-label="Navigation principale" className="hidden md:block">
          <NavLinks links={NAV_LINKS} />
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink href={LOGIN_URL} external variant="ghost" className="hidden sm:inline-flex">
            Connexion
          </ButtonLink>
          <ButtonLink href={SIGNUP_URL} external>
            Essai gratuit
          </ButtonLink>
        </div>
      </Container>
    </header>
  );
}
