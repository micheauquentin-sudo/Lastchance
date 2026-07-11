import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { CONTACT_EMAIL, FOOTER_LINKS, SITE_NAME } from "@/content/site";

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface-raised">
      <Container className="flex flex-col gap-8 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <Logo className="text-lg" />
          <p className="mt-3 text-sm text-ink-soft">
            La roue de la fortune par QR code qui fait revenir vos clients.
            Conforme RGPD, prêt en 10 minutes.
          </p>
        </div>

        <nav aria-label="Liens du pied de page">
          <ul className="flex flex-col gap-2 sm:items-end">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                {"external" in link && link.external ? (
                  <a
                    href={link.href}
                    className="text-sm text-ink-soft hover:text-ink"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    className="text-sm text-ink-soft hover:text-ink"
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
            <li>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-sm text-ink-soft hover:text-ink"
              >
                {CONTACT_EMAIL}
              </a>
            </li>
          </ul>
        </nav>
      </Container>
      <div className="border-t border-line py-5 text-center text-xs text-ink-faint">
        © {new Date().getFullYear()} {SITE_NAME}. Tous droits réservés.
      </div>
    </footer>
  );
}
