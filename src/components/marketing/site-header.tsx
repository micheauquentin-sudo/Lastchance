"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const OBJECTIVES = [
  { href: "/attirer", label: "Acquérir", desc: "15 jeux instantanés & Parrainage", dot: "bg-k-orange" },
  { href: "/faire-venir", label: "Créer du trafic", desc: "Chasse au QR & Réservation", dot: "bg-k-yellow" },
  { href: "/fideliser", label: "Fidéliser", desc: "Passeport Wallet & Calendrier", dot: "bg-k-pink" },
  { href: "/animer", label: "Animer en direct", desc: "Événements live & Pronostics", dot: "bg-k-blue" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [objOpen, setObjOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const objRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setObjOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (objRef.current && !objRef.current.contains(target)) setObjOpen(false);
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
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isCurrent = (href: string) => pathname === href;

  const linkClass = (href: string) =>
    `rounded-full px-3 py-2 text-[15px] font-extrabold text-k-ink transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink ${
      isCurrent(href) ? "bg-k-orange" : "hover:bg-k-yellow"
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
            {/* Menu déroulant Objectifs */}
            <div ref={objRef} className="relative">
              <button
                type="button"
                aria-expanded={objOpen}
                aria-haspopup="menu"
                onClick={() => setObjOpen((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-[15px] font-extrabold text-k-ink transition-colors ${
                  OBJECTIVES.some((o) => isCurrent(o.href)) ? "bg-k-orange" : "hover:bg-k-yellow"
                }`}
              >
                <span>Modules & Objectifs</span>
                <svg
                  aria-hidden
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  className={`transition-transform duration-200 ${objOpen ? "rotate-180" : ""}`}
                >
                  <path d="M3.5 5.5 7 9l3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {objOpen && (
                <div
                  role="menu"
                  className="k-card k-soft absolute left-0 top-full mt-2 w-72 rounded-2xl p-2 shadow-xl"
                >
                  {OBJECTIVES.map((obj) => (
                    <Link
                      key={obj.href}
                      href={obj.href}
                      role="menuitem"
                      onClick={() => setObjOpen(false)}
                      className={`flex flex-col rounded-xl px-3 py-2.5 transition-colors hover:bg-k-yellow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink ${
                        isCurrent(obj.href) ? "bg-k-orange/20" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${obj.dot}`} />
                        <span className="text-sm font-black text-k-ink">{obj.label}</span>
                      </div>
                      <span className="mt-0.5 text-xs font-bold text-k-body pl-4.5">{obj.desc}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link href="/tarifs" className={linkClass("/tarifs")}>
              Tarifs
            </Link>

            <Link href="/faq" className={linkClass("/faq")}>
              FAQ
            </Link>
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
            <p className="px-3 text-xs font-black uppercase tracking-wider text-k-muted">
              Les 4 objectifs
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {OBJECTIVES.map((obj) => (
                <li key={obj.href}>
                  <Link
                    href={obj.href}
                    className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-extrabold text-k-ink transition-colors ${
                      isCurrent(obj.href) ? "bg-k-orange" : "hover:bg-k-yellow"
                    }`}
                    onClick={() => setOpen(false)}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${obj.dot}`} />
                    <span className="font-black">{obj.label}</span>
                    <span className="text-xs text-k-muted font-bold truncate">· {obj.desc}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="my-2 border-t-2 border-k-ink/15" />

            <ul className="flex flex-col gap-1">
              <li>
                <Link
                  href="/tarifs"
                  className={`flex min-h-11 items-center rounded-2xl px-4 py-2.5 text-base font-extrabold text-k-ink transition-colors ${
                    isCurrent("/tarifs") ? "bg-k-orange" : "hover:bg-k-yellow"
                  }`}
                  onClick={() => setOpen(false)}
                >
                  Tarifs (5 offres & simulateur)
                </Link>
              </li>
              <li>
                <Link
                  href="/faq"
                  className={`flex min-h-11 items-center rounded-2xl px-4 py-2.5 text-base font-extrabold text-k-ink transition-colors ${
                    isCurrent("/faq") ? "bg-k-orange" : "hover:bg-k-yellow"
                  }`}
                  onClick={() => setOpen(false)}
                >
                  Questions fréquentes
                </Link>
              </li>
            </ul>

            <div className="mt-3 flex flex-col gap-2.5 border-t-2 border-k-ink/15 pt-3">
              <Link
                href="/login"
                className="flex min-h-11 items-center justify-center rounded-full border-2 border-k-ink/25 bg-white/70 px-4 py-3 text-center text-sm font-black text-k-ink transition-colors hover:bg-k-ink/5"
                onClick={() => setOpen(false)}
              >
                Connexion
              </Link>
              <Link
                href="/signup"
                className="k-border k-btn flex min-h-11 items-center justify-center rounded-full bg-k-yellow px-4 py-3 text-center text-sm font-black text-k-ink"
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
