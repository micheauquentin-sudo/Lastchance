"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const NAV_LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#comment-ca-marche", label: "Comment ça marche" },
  { href: "#tarifs", label: "Tarifs" },
] as const;

const RESOURCES = [
  { href: "#faq", label: "Questions fréquentes" },
  { href: "#espace-commercant", label: "Espace commerçant" },
  { href: "#comment-ca-marche", label: "Guide de démarrage" },
] as const;

/** Header de la landing « La Kermesse » : bandeau d'annonce encre,
 *  nav sticky crème bordée d'encre, dropdown Ressources et menu
 *  mobile accessible. */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const resRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setResOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (resRef.current && !resRef.current.contains(e.target as Node)) setResOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  return (
    <>
      {/* Bandeau d'annonce */}
      <div className="bg-k-ink py-2 text-center text-[11px] font-extrabold tracking-[0.08em] text-k-bg sm:text-[13px]">
        LE JEU QUI FAIT REVENIR LES CLIENTS · 7 JOURS OFFERTS
      </div>

      <header className="sticky top-0 z-50 border-b-[3px] border-k-ink bg-k-bg">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5 sm:px-6">
          <Link
            href="/"
            className="rounded-md text-[26px] leading-none text-k-ink focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-k-ink"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
            onClick={() => setOpen(false)}
          >
            LastChance<span className="text-k-orange">.</span>
          </Link>

          <nav aria-label="Navigation principale" className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="rounded-lg px-3 py-2 text-[15px] font-extrabold text-k-ink transition-colors hover:text-k-orange focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
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
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-[15px] font-extrabold text-k-ink transition-colors hover:text-k-orange focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
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
                  className="k-border k-shadow-md absolute left-0 top-full mt-2 w-60 rounded-2xl bg-white p-1.5"
                >
                  {RESOURCES.map((r) => (
                    <a
                      key={r.label}
                      href={r.href}
                      role="menuitem"
                      onClick={() => setResOpen(false)}
                      className="block rounded-xl px-3 py-2.5 text-sm font-extrabold text-k-body transition-colors hover:bg-k-yellow hover:text-k-ink"
                    >
                      {r.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="hidden items-center gap-4 md:flex">
            <Link
              href="/login"
              className="rounded-lg px-2 py-2 text-[15px] font-extrabold text-k-ink transition-colors hover:text-k-orange focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
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
            className="k-border-thin inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-k-ink transition-colors hover:bg-k-yellow md:hidden"
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
        </div>

        {open && (
          <nav
            id="mobile-menu"
            aria-label="Navigation mobile"
            className="border-t-[3px] border-k-ink bg-k-bg px-5 pb-6 pt-3 md:hidden"
          >
            <ul className="flex flex-col gap-1">
              {[...NAV_LINKS, ...RESOURCES].map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="block rounded-xl px-3 py-3 text-base font-extrabold text-k-ink transition-colors hover:bg-k-yellow"
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-3 border-t-[3px] border-k-ink pt-4">
              <Link
                href="/login"
                className="k-border rounded-full bg-white px-4 py-3 text-center text-sm font-black text-k-ink transition-colors hover:bg-k-ink/5"
                onClick={() => setOpen(false)}
              >
                Connexion
              </Link>
              <Link
                href="/signup"
                className="k-border k-btn rounded-full bg-k-yellow px-4 py-3 text-center text-sm font-black text-k-ink"
                onClick={() => setOpen(false)}
              >
                Essai gratuit 7 jours
              </Link>
            </div>
          </nav>
        )}
      </header>
    </>
  );
}
