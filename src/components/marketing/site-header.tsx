"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const NAV_LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#pronostics", label: "Pronostics" },
  { href: "#tarifs", label: "Tarifs" },
] as const;

const RESOURCES = [
  { href: "#faq", label: "Questions fréquentes" },
  { href: "#espace-commercant", label: "Espace commerçant" },
  { href: "#comment-ca-marche", label: "Guide de démarrage" },
] as const;

/** Sections suivies pour la mise en évidence du lien courant. */
const TRACKED = [
  "comment-ca-marche",
  "fonctionnalites",
  "pronostics",
  "espace-commercant",
  "tarifs",
  "faq",
] as const;

/**
 * En-tête de la landing « La Kermesse » : une PILULE FLOTTANTE.
 *
 * Elle remplace le duo bandeau d'annonce encre + barre crème pleine largeur
 * bordée de 3 px : deux blocs empilés qui coupaient le décor scrollytelling en
 * travers dès le premier pixel. Le message du bandeau vit désormais dans la
 * pastille du hero, qui le portait déjà à un mot près.
 *
 * Au repos la pilule est un verre léger ; au-delà de 20 px de scroll elle se
 * densifie pour rester lisible sur les images sombres du bas de page. Le CTA
 * « Essai gratuit » garde en revanche la signature complète (encre 3 px, socle
 * plein) : c'est le seul élément de la barre qui doit rester un objet.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const resRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setResOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (resRef.current && !resRef.current.contains(target)) setResOpen(false);
      if (rootRef.current && !rootRef.current.contains(target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
      const current = TRACKED.find((id) => {
        const el = document.getElementById(id);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.top <= 200 && rect.bottom >= 200;
      });
      setActive(current ?? null);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * Section courante : PASTILLE orange pleine, texte encre.
   *
   * L'orange TEXTE (`--color-k-orange-text`) était le premier réflexe, mais il
   * ne tient son 4,66:1 que sur le crème PLEIN : sur la pilule translucide
   * posée sur le décor, il tombe à 4,03:1 dans les nuages et 3,59:1 sur la
   * lave — mesuré sur les images réelles (f001, f172), voile compris. Encre
   * sur orange plein donne 6,2:1 et marque bien plus nettement la section.
   * Le survol reprend le jaune déjà utilisé par le menu Ressources (11:1).
   */
  const linkClass = (href: string) =>
    `rounded-full px-3 py-2 text-[15px] font-extrabold text-k-ink transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink ${
      active && `#${active}` === href ? "bg-k-orange" : "hover:bg-k-yellow"
    }`;

  return (
    <header
      ref={rootRef}
      className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3 sm:top-4 sm:px-4"
    >
      <div className="pointer-events-auto w-full max-w-6xl">
        <nav
          aria-label="Navigation principale"
          className={`flex items-center justify-between gap-3 rounded-full px-3 py-2 backdrop-blur-xl transition-all duration-300 sm:px-5 ${
            scrolled
              ? "border-2 border-k-ink/25 bg-k-bg/85 shadow-[0_8px_24px_rgba(33,29,22,0.16)]"
              : "border-2 border-k-ink/15 bg-k-bg/70 shadow-[0_5px_18px_rgba(33,29,22,0.10)]"
          }`}
        >
          <Link
            href="/"
            className="rounded-full px-1 text-[24px] leading-none text-k-ink focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-k-ink sm:text-[26px]"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
            onClick={() => setOpen(false)}
          >
            LastChance<span className="text-k-orange">.</span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                aria-current={active && `#${active}` === link.href ? "true" : undefined}
                className={linkClass(link.href)}
              >
                {link.label}
              </a>
            ))}

            <div ref={resRef} className="relative">
              <button
                type="button"
                aria-expanded={resOpen}
                aria-haspopup="menu"
                onClick={() => setResOpen((v) => !v)}
                className={`flex items-center gap-1 ${linkClass(
                  RESOURCES.some((r) => r.href === `#${active}`) ? `#${active}` : "#ressources",
                )}`}
              >
                Ressources
                <svg
                  aria-hidden
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  className={`transition-transform duration-200 ${resOpen ? "rotate-180" : ""}`}
                >
                  <path d="M3.5 5.5 7 9l3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {resOpen && (
                <div
                  role="menu"
                  className="k-card k-soft absolute left-0 top-full mt-2 w-60 rounded-2xl p-1.5"
                >
                  {RESOURCES.map((r) => (
                    <a
                      key={r.label}
                      href={r.href}
                      role="menuitem"
                      onClick={() => setResOpen(false)}
                      className="flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm font-extrabold text-k-body transition-colors hover:bg-k-yellow hover:text-k-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
                    >
                      {r.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <Link
              href="/login"
              className="rounded-full px-3 py-2 text-[15px] font-extrabold text-k-ink transition-colors hover:bg-k-yellow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
            >
              Connexion
            </Link>
            <Link
              href="/signup"
              className="k-border k-btn inline-block whitespace-nowrap rounded-full bg-k-yellow px-5 py-2.5 text-[15px] font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink"
            >
              Essai gratuit
            </Link>
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-k-ink/20 bg-white/70 text-k-ink transition-colors hover:bg-k-yellow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" fill="none">
              {open ? (
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </nav>

        {open && (
          <nav
            id="mobile-menu"
            aria-label="Navigation mobile"
            className="k-card k-soft mt-2 rounded-3xl p-4 md:hidden"
          >
            <ul className="flex flex-col gap-1">
              {[...NAV_LINKS, ...RESOURCES].map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    aria-current={active && `#${active}` === link.href ? "true" : undefined}
                    className={`flex min-h-11 items-center rounded-2xl px-4 py-3 text-base font-extrabold text-k-ink transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink ${
                      active && `#${active}` === link.href ? "bg-k-orange" : "hover:bg-k-yellow"
                    }`}
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-col gap-2.5 border-t-2 border-k-ink/15 pt-3">
              <Link
                href="/login"
                className="flex min-h-11 items-center justify-center rounded-full border-2 border-k-ink/25 bg-white/70 px-4 py-3 text-center text-sm font-black text-k-ink transition-colors hover:bg-k-ink/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
                onClick={() => setOpen(false)}
              >
                Connexion
              </Link>
              <Link
                href="/signup"
                className="k-border k-btn flex min-h-11 items-center justify-center rounded-full bg-k-yellow px-4 py-3 text-center text-sm font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink"
                onClick={() => setOpen(false)}
              >
                Essai gratuit 7 jours
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
