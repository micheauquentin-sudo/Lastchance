"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const NAV_LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#comment-ca-marche", label: "Comment ça marche" },
] as const;

const RESOURCES = [
  { href: "#faq", label: "Questions fréquentes" },
  { href: "#espace-commercant", label: "Espace commerçant" },
  { href: "#comment-ca-marche", label: "Guide de démarrage" },
] as const;

/** Header sticky de la landing (thème clair) : flou, dropdown Ressources
 *  et menu mobile accessible. */
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
    <header className="fixed inset-x-0 top-0 z-50 border-b border-orange-900/[0.06] bg-[#fdf4ee]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-6">
        <Link
          href="/"
          className="rounded-md text-lg font-extrabold tracking-tight text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-400"
          style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
          onClick={() => setOpen(false)}
        >
          LastChance<span className="text-pink-500">.</span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
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
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
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
                <path d="M3.5 5.5 7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {resOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full mt-1 w-56 rounded-xl border border-orange-900/10 bg-white p-1.5 shadow-xl shadow-orange-950/10"
              >
                {RESOURCES.map((r) => (
                  <a
                    key={r.label}
                    href={r.href}
                    role="menuitem"
                    onClick={() => setResOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-orange-50 hover:text-zinc-900"
                  >
                    {r.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
          >
            Connexion
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 active:translate-y-0 active:scale-[0.97]"
          >
            Essai gratuit 7 jours
            <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7h8M7 3.5 10.5 7 7 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-orange-100/60 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" fill="none">
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          id="mobile-menu"
          aria-label="Navigation mobile"
          className="border-t border-orange-900/[0.06] bg-[#fdf4ee]/95 px-5 pb-6 pt-3 backdrop-blur-xl md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {[...NAV_LINKS, ...RESOURCES].map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  className="block rounded-lg px-3 py-3 text-base font-medium text-zinc-700 transition-colors hover:bg-orange-100/60 hover:text-zinc-900"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 border-t border-orange-900/[0.06] pt-4">
            <Link
              href="/login"
              className="rounded-full border border-zinc-300 px-4 py-3 text-center text-sm font-semibold text-zinc-900 transition-colors hover:bg-orange-50"
              onClick={() => setOpen(false)}
            >
              Connexion
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-zinc-900 px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
              onClick={() => setOpen(false)}
            >
              Essai gratuit 7 jours
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
