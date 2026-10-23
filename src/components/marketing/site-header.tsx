"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

const MODULE_PREVIEWS = [
  {
    href: "/jeux-instantanes",
    label: "Jeux instantanés au QR",
    tag: "Best-Seller · 15 Jeux",
    tagColor: "bg-k-orange/20 text-k-ink border-k-orange/30",
    desc: "Roue, grattage, machine à sous pour faire jouer en 30s.",
    image: "/marketing/module-roue-3d.jpg",
    bgHover: "hover:bg-orange-50/80 hover:border-k-orange",
  },
  {
    href: "/vitrine-reservation",
    label: "Vitrine & Réservation directe",
    tag: "0% Commission",
    tagColor: "bg-k-yellow/50 text-k-ink border-k-ink/20",
    desc: "Carte bilingue FR/EN & résas sans intermédiaire.",
    image: "/marketing/module-showcase-3d.jpg",
    bgHover: "hover:bg-amber-50/80 hover:border-k-yellow",
  },
  {
    href: "/passeport-fidelite",
    label: "Passeport fidélité VIP",
    tag: "Google Wallet",
    tagColor: "bg-k-pink/30 text-k-ink border-k-ink/20",
    desc: "Tampons, jackpot collectif & tickets d'or en caisse.",
    image: "/marketing/module-wallet-3d.jpg",
    bgHover: "hover:bg-pink-50/80 hover:border-k-pink",
  },
  {
    href: "/championnats-evenements",
    label: "Championnat & Événements",
    tag: "Fidélisation Hebdo",
    tagColor: "bg-k-blue/30 text-k-ink border-k-ink/20",
    desc: "Pronostics Ligue 1, calendriers et quiz d'ambiance.",
    image: "/marketing/module-trophee-3d.jpg",
    bgHover: "hover:bg-blue-50/80 hover:border-k-blue",
  },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const rootRef = useRef<HTMLElement>(null);
  const megaTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (megaTimeoutRef.current) clearTimeout(megaTimeoutRef.current);
    setMegaOpen(true);
  };

  const handleMouseLeave = () => {
    megaTimeoutRef.current = setTimeout(() => {
      setMegaOpen(false);
    }, 150);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setMegaOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
        setMegaOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
      if (megaTimeoutRef.current) clearTimeout(megaTimeoutRef.current);
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

  return (
    <header
      ref={rootRef}
      className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3 sm:top-4 sm:px-4"
    >
      <div className="pointer-events-auto w-full max-w-7xl">
        <nav
          aria-label="Navigation principale"
          className={`relative flex items-center justify-between gap-3 rounded-full px-4 py-2.5 backdrop-blur-xl transition-all duration-300 sm:px-6 ${
            scrolled
              ? "border border-k-ink/15 bg-white/95 shadow-[0_12px_32px_rgba(33,29,22,0.10)]"
              : "border border-k-ink/10 bg-white/85 shadow-[0_6px_20px_rgba(33,29,22,0.06)]"
          }`}
        >
          {/* Logo */}
          <Link
            href="/"
            className="rounded-full px-1 text-[23px] leading-none text-k-ink focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-k-ink sm:text-[26px]"
            style={DISPLAY}
            onClick={() => {
              setOpen(false);
              setMegaOpen(false);
            }}
          >
            LastChance<span className="text-k-orange">.</span>
          </Link>

          {/* Navigation Desktop */}
          <div className="hidden items-center gap-2 lg:flex">
            {/* Mega Menu Trigger HOLY style */}
            <div
              className="relative"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <button
                type="button"
                onClick={() => setMegaOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] lg:text-[15px] font-extrabold text-k-ink transition-all ${
                  megaOpen ? "bg-k-yellow text-k-ink" : "hover:bg-k-yellow/50"
                }`}
                aria-expanded={megaOpen}
              >
                <span>Modules & Jeux</span>
                <svg
                  className={`h-4 w-4 transition-transform duration-200 ${megaOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Mega-Menu Panel Flottant */}
              {megaOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3 w-[720px] z-50">
                  <div className="k-card-pop rounded-[32px] p-6 bg-white/95 border-[1.5px] border-k-ink/15 shadow-2xl backdrop-blur-2xl">
                    <div className="flex items-center justify-between pb-3.5 border-b border-k-ink/10">
                      <span className="text-xs font-black uppercase tracking-wider text-k-muted">
                        ★ Aperçu visuel des solutions
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-black text-k-orange-text">
                        <span>★ ★ ★ ★ ★ 4.9/5 sur +2 400 commerces</span>
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3.5">
                      {MODULE_PREVIEWS.map((mod) => (
                        <Link
                          key={mod.href}
                          href={mod.href}
                          onClick={() => setMegaOpen(false)}
                          className={`group relative flex items-center gap-3.5 p-3 rounded-2xl border border-k-ink/10 bg-white shadow-xs transition-all duration-200 ${mod.bgHover}`}
                        >
                          <img
                            src={mod.image}
                            alt={mod.label}
                            className="h-16 w-16 flex-none rounded-xl object-cover border border-k-ink/10 shadow-xs group-hover:scale-105 transition-transform"
                          />
                          <div className="flex-1 min-w-0">
                            <span className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${mod.tagColor}`}>
                              {mod.tag}
                            </span>
                            <h4 className="mt-1 text-sm font-black text-k-ink truncate" style={DISPLAY}>
                              {mod.label}
                            </h4>
                            <p className="text-[11px] font-bold text-k-body line-clamp-1 leading-snug">
                              {mod.desc}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>

                    <div className="mt-4 pt-3 border-t border-k-ink/10 flex items-center justify-between text-xs font-black">
                      <Link
                        href="/tarifs"
                        onClick={() => setMegaOpen(false)}
                        className="text-k-ink hover:text-k-orange transition-colors flex items-center gap-1"
                      >
                        <span>Comparer les 5 formules & simulateur ROI</span>
                        <span>→</span>
                      </Link>
                      <Link
                        href="/faq"
                        onClick={() => setMegaOpen(false)}
                        className="text-k-muted hover:text-k-ink transition-colors"
                      >
                        Questions fréquentes (FAQ)
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/tarifs"
              className={`rounded-full px-3.5 py-2 text-[14px] lg:text-[15px] font-extrabold text-k-ink transition-colors ${
                isCurrent("/tarifs") ? "bg-k-orange" : "hover:bg-k-yellow/50"
              }`}
            >
              Tarifs
            </Link>

            <Link
              href="/faq"
              className={`rounded-full px-3.5 py-2 text-[14px] lg:text-[15px] font-extrabold text-k-ink transition-colors ${
                isCurrent("/faq") ? "bg-k-orange" : "hover:bg-k-yellow/50"
              }`}
            >
              FAQ
            </Link>
          </div>

          {/* Actions Droite Desktop */}
          <div className="hidden items-center gap-2.5 md:flex">
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-[14px] font-extrabold text-k-ink transition-colors hover:bg-k-yellow/40"
            >
              Connexion
            </Link>
            <Link
              href="/signup"
              className="k-pill inline-flex items-center justify-center whitespace-nowrap rounded-full bg-k-yellow px-5 py-2.5 text-[14px] font-black text-k-ink border-2 border-k-ink shadow-[0_4px_12px_rgba(252,202,89,0.35)] hover:shadow-[0_6px_18px_rgba(252,202,89,0.5)] hover:-translate-y-0.5 transition-all"
            >
              Essai gratuit 7j
            </Link>
          </div>

          {/* Bouton Hamburger Mobile */}
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-k-ink/15 bg-white text-k-ink shadow-xs transition-colors hover:bg-k-yellow lg:hidden"
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

        {/* Menu Mobile Déroulé avec Aperçus Visuels HOLY Style */}
        {open && (
          <nav
            id="mobile-menu"
            aria-label="Navigation mobile"
            className="k-card-pop mt-2 rounded-[28px] p-5 bg-white/98 shadow-2xl border border-k-ink/15 lg:hidden max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-k-ink/10">
              <span className="text-xs font-black uppercase tracking-wider text-k-muted">
                ★ Nos 4 Solutions Clés
              </span>
              <span className="text-[11px] font-black text-k-orange-text">
                ★ 4.9/5 (2.4k avis)
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-2.5">
              {MODULE_PREVIEWS.map((mod) => (
                <Link
                  key={mod.href}
                  href={mod.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-2xl p-2.5 border border-k-ink/10 bg-k-bg/50 hover:bg-k-yellow/30 transition-colors"
                >
                  <img
                    src={mod.image}
                    alt={mod.label}
                    className="h-14 w-14 flex-none rounded-xl object-cover border border-k-ink/10"
                  />
                  <div className="flex-1 min-w-0">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${mod.tagColor}`}>
                      {mod.tag}
                    </span>
                    <h4 className="mt-0.5 text-sm font-black text-k-ink truncate" style={DISPLAY}>
                      {mod.label}
                    </h4>
                    <p className="text-[11px] font-bold text-k-body line-clamp-1">
                      {mod.desc}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="my-3 border-t border-k-ink/10" />

            <div className="flex flex-col gap-1.5">
              <Link
                href="/tarifs"
                className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/30"
                onClick={() => setOpen(false)}
              >
                <span>Tarifs & Simulateur ROI</span>
                <span>→</span>
              </Link>
              <Link
                href="/faq"
                className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/30"
                onClick={() => setOpen(false)}
              >
                <span>Foire aux questions</span>
                <span>→</span>
              </Link>
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t border-k-ink/10 pt-3">
              <Link
                href="/login"
                className="flex items-center justify-center rounded-full border border-k-ink/20 py-2.5 text-sm font-black text-k-ink"
                onClick={() => setOpen(false)}
              >
                Connexion
              </Link>
              <Link
                href="/signup"
                className="k-pill flex items-center justify-center rounded-full bg-k-yellow py-3 text-sm font-black text-k-ink border-2 border-k-ink shadow-md"
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

