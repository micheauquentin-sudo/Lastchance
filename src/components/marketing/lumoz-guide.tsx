"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LumozModel } from "./lumoz-model";

/**
 * Lumoz, guide de la landing : mascotte 3D flottante qui accueille le
 * visiteur (coucou + « hello »), saute de section en section au fil du
 * scroll avec un message contextuel, s'étonne au survol et ouvre au
 * clic une boîte de dialogue guidée (réponses scriptées + liens).
 *
 * Three.js est importé dynamiquement après la première peinture : la
 * mascotte ne coûte rien au chargement initial. Sans WebGL, le
 * composant ne rend rien. `prefers-reduced-motion` désactive sauts et
 * animations (mascotte fixe, messages conservés).
 */

const W = 150;
const H = 190;

interface Stop {
  /** id de section observée (null = héro, haut de page). */
  id: string | null;
  side: "left" | "right";
  msg: string;
  cta?: { label: string; kind: "spin" | "link"; href?: string };
}

const STOPS: Stop[] = [
  { id: null, side: "right", msg: "Hello ! 👋 Moi c'est Lumoz. Je vous fais visiter ?" },
  {
    id: "demo-roue",
    side: "left",
    msg: "Envie d'essayer ? Je vous la lance ! 🎡",
    cta: { label: "Tourner la roue", kind: "spin" },
  },
  { id: "comment-ca-marche", side: "right", msg: "Trois étapes et votre jeu est prêt ⚡" },
  { id: "fonctionnalites", side: "left", msg: "Tout est inclus — regardez 👀" },
  { id: "pronostics", side: "right", msg: "Nouveau : vos clients pronostiquent les matchs ⚽" },
  { id: "espace-commercant", side: "left", msg: "Et voici votre poste de pilotage 📊" },
  {
    id: "tarifs",
    side: "right",
    msg: "Starter 29 €/mois tout inclus, 7 jours offerts — et l'option Pronostics : +9 €/mois ou Pass Compétition 49 € 🎁",
    cta: { label: "Commencer l'essai", kind: "link", href: "/signup" },
  },
  { id: "faq", side: "left", msg: "Une question ? Les réponses sont juste là 💬" },
];

/* Dialogue guidé : questions rapides → réponses scriptées. */
const QUICK: Array<{ q: string; a: string; link?: { label: string; href: string } }> = [
  {
    q: "🎡 Comment ça marche ?",
    a: "Vous créez votre roue, vous imprimez l'affiche QR, et vos clients jouent depuis leur téléphone — gains validés en caisse. Prêt en 10 minutes !",
    link: { label: "Voir les 3 étapes", href: "#comment-ca-marche" },
  },
  {
    q: "💶 Combien ça coûte ?",
    a: "29 €/mois tout inclus, sans engagement, avec 7 jours d'essai gratuit. L'option Pronostics : +9 €/mois — ou Pass Compétition 49 € sans abonnement.",
    link: { label: "Voir les tarifs", href: "#tarifs" },
  },
  {
    q: "⚽ C'est quoi les Pronostics ?",
    a: "Votre championnat maison : vos clients pronostiquent les matchs (Ligue 1, Euro, Coupe du monde…), le classement vit en direct et les meilleurs gagnent vos récompenses.",
    link: { label: "Découvrir", href: "#pronostics" },
  },
  {
    q: "🔒 Et le RGPD ?",
    a: "Consentement explicite, données hébergées en Europe, export à tout moment — et jamais de gain contre un avis en ligne. Promis, wouf !",
  },
  {
    q: "🚀 Je me lance !",
    a: "Génial ! Créez votre compte : 7 jours offerts pour tester avec vos vrais clients. 🍀",
    link: { label: "Créer ma roue", href: "/signup" },
  },
];

type ChatMsg = { from: "user" | "lumoz"; text: string; link?: { label: string; href: string } };

export function LumozGuide() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<LumozModel | null>(null);
  const stopIndexRef = useRef(0);
  const hopAnimRef = useRef<Animation | null>(null);
  const bubbleTimer = useRef<number>(0);
  const reducedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [stop, setStop] = useState<Stop>(STOPS[0]);
  const [bubble, setBubble] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [thinking, setThinking] = useState(false);

  /* ── Position cible d'un arrêt (coordonnées viewport) ───── */
  const targetFor = useCallback((s: Stop) => {
    const compact = innerWidth < 768;
    const scale = compact ? 0.72 : 1;
    const w = W * scale;
    const x = compact
      ? innerWidth - w - 10
      : s.side === "left"
        ? 16
        : innerWidth - w - 16;
    const y = compact ? innerHeight - H * scale - 12 : Math.round(innerHeight * 0.52);
    return { x, y };
  }, []);

  /* ── Déplacement : saut en arc de bloc en bloc ──────────── */
  const flyTo = useCallback(
    (s: Stop, animate: boolean) => {
      const box = boxRef.current;
      if (!box) return;
      const { x, y } = targetFor(s);
      const from = box.getBoundingClientRect();
      hopAnimRef.current?.cancel();
      box.style.transform = `translate(${x}px, ${y}px)`;
      if (!animate || reducedRef.current || innerWidth < 768) return;
      const dx = from.left - x;
      const dy = from.top - y;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      modelRef.current?.hop(680);
      hopAnimRef.current = box.animate(
        [
          { transform: `translate(${from.left}px, ${from.top}px)` },
          {
            transform: `translate(${(from.left + x) / 2}px, ${Math.min(from.top, y) - 120}px)`,
            offset: 0.5,
          },
          { transform: `translate(${x}px, ${y}px)` },
        ],
        { duration: 700, easing: "cubic-bezier(.45,0,.4,1)" },
      );
    },
    [targetFor],
  );

  /* ── Bulle contextuelle (auto-masquée) ──────────────────── */
  const showBubble = useCallback((text: string, ms = 7000) => {
    window.clearTimeout(bubbleTimer.current);
    setBubble(text);
    if (ms > 0) {
      bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
    }
  }, []);

  /* ── Initialisation (Three.js différé) ──────────────────── */
  useEffect(() => {
    let cancelled = false;
    reducedRef.current = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const init = async () => {
      try {
        const { LumozModel: Model } = await import("./lumoz-model");
        if (cancelled || !canvasRef.current) return;
        modelRef.current = new Model(canvasRef.current);
        setReady(true);
        flyTo(STOPS[0], false);
        /* Accueil : coucou + hello */
        window.setTimeout(() => {
          if (cancelled) return;
          if (!reducedRef.current) modelRef.current?.wave();
          showBubble(STOPS[0].msg, 8000);
        }, 350);
      } catch {
        /* WebGL indisponible — pas de mascotte, la page reste intacte. */
      }
    };
    const idle = window.setTimeout(init, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(idle);
      window.clearTimeout(bubbleTimer.current);
      modelRef.current?.dispose();
      modelRef.current = null;
    };
  }, [flyTo, showBubble]);

  /* ── Suivi du scroll : section active → saut + message ──── */
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = innerHeight * 0.55;
        let active = 0;
        for (let i = 1; i < STOPS.length; i++) {
          const el = document.getElementById(STOPS[i].id!);
          if (el && el.getBoundingClientRect().top <= mid) active = i;
        }
        if (active !== stopIndexRef.current) {
          stopIndexRef.current = active;
          const s = STOPS[active];
          setStop(s);
          setBubble(null);
          flyTo(s, true);
          window.setTimeout(() => showBubble(s.msg), 420);
        }
      });
    };
    const onResize = () => flyTo(STOPS[stopIndexRef.current], false);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onResize);
    onScroll();
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [ready, flyTo, showBubble]);

  /* ── Interactions ───────────────────────────────────────── */
  const onEnter = () => {
    modelRef.current?.setExpression("surprised");
    if (!chatOpen) showBubble("Oh ! 👀 Cliquez, on discute !", 4000);
  };
  const onLeave = () => modelRef.current?.setExpression("happy");

  const toggleChat = () => {
    setChatOpen((open) => {
      const next = !open;
      if (next) {
        setBubble(null);
        if (chat.length === 0) {
          setChat([{
            from: "lumoz",
            text: "Wouf ! Moi c'est Lumoz ✦ votre guide. Posez-moi une question :",
          }]);
        }
        if (!reducedRef.current) modelRef.current?.wave(1200);
      }
      return next;
    });
  };

  const ask = (item: (typeof QUICK)[number]) => {
    setChat((c) => [...c, { from: "user", text: item.q }]);
    setThinking(true);
    modelRef.current?.setTalking(true);
    window.setTimeout(() => {
      setChat((c) => [...c, { from: "lumoz", text: item.a, link: item.link }]);
      setThinking(false);
      modelRef.current?.setTalking(false);
    }, 750);
  };

  const cta = (c: NonNullable<Stop["cta"]>) => {
    if (c.kind === "spin") {
      dispatchEvent(new CustomEvent("lumoz:spin-demo"));
      showBubble("C'est parti ! Bonne chance 🍀", 4000);
      if (!reducedRef.current) modelRef.current?.wave(1200);
    }
  };

  return (
    <div
      ref={boxRef}
      className="fixed left-0 top-0 z-[45]"
      style={{ transform: "translate(-9999px, -9999px)", willChange: "transform" }}
    >
      {/* Bulle contextuelle */}
      {ready && bubble && !chatOpen && (
        <div
          role="status"
          className={`absolute bottom-full mb-1 w-56 rounded-2xl border-2 border-k-ink bg-white p-3 text-[13px] font-bold leading-snug text-k-ink shadow-[4px_4px_0_var(--color-k-ink)] ${
            stop.side === "left" ? "left-0" : "right-0"
          }`}
        >
          {bubble}
          {stop.cta && bubble === stop.msg && (
            stop.cta.kind === "link" ? (
              <Link
                href={stop.cta.href!}
                className="mt-2 block rounded-full border-2 border-k-ink bg-k-yellow px-3 py-1.5 text-center text-xs font-black text-k-ink"
              >
                {stop.cta.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => cta(stop.cta!)}
                className="mt-2 block w-full rounded-full border-2 border-k-ink bg-k-yellow px-3 py-1.5 text-center text-xs font-black text-k-ink"
              >
                {stop.cta.label}
              </button>
            )
          )}
          <span
            aria-hidden
            className={`absolute -bottom-[9px] h-4 w-4 rotate-45 border-b-2 border-r-2 border-k-ink bg-white ${
              stop.side === "left" ? "left-8" : "right-8"
            }`}
          />
        </div>
      )}

      {/* La mascotte */}
      <button
        type="button"
        aria-label="Discuter avec Lumoz, le guide"
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onClick={toggleChat}
        className="block cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-k-ink"
        style={{ width: W, height: H }}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full max-md:scale-[0.72] max-md:origin-bottom-right"
          style={{ width: W, height: H }}
        />
      </button>

      {/* Boîte de dialogue guidée */}
      {chatOpen && (
        <div
          role="dialog"
          aria-label="Discussion avec Lumoz"
          className={`absolute bottom-2 flex max-h-[66vh] w-[300px] flex-col overflow-hidden rounded-2xl border-2 border-k-ink bg-white shadow-[6px_6px_0_var(--color-k-ink)] max-md:bottom-full max-md:left-auto max-md:right-0 max-md:mb-1 max-md:max-h-[55vh] max-md:w-[calc(100vw-24px)] max-md:max-w-[320px] ${
            stop.side === "left" ? "left-[80%]" : "right-[80%]"
          }`}
        >
          <div className="flex items-center justify-between border-b-2 border-k-ink bg-k-yellow px-3 py-2">
            <p className="text-sm font-black text-k-ink">Lumoz ✦ votre guide</p>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              aria-label="Fermer la discussion"
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-k-ink bg-white text-xs font-black text-k-ink"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {chat.map((m, i) => (
              <div key={i} className={m.from === "user" ? "text-right" : "text-left"}>
                <p
                  className={
                    m.from === "user"
                      ? "inline-block rounded-2xl rounded-br-sm bg-k-yellow px-3 py-1.5 text-[13px] font-bold text-k-ink"
                      : "inline-block rounded-2xl rounded-bl-sm bg-zinc-100 px-3 py-1.5 text-[13px] font-bold text-k-ink"
                  }
                >
                  {m.text}
                </p>
                {m.link && (
                  <div className="mt-1">
                    <Link
                      href={m.link.href}
                      onClick={() => setChatOpen(false)}
                      className="inline-block rounded-full border-2 border-k-ink bg-k-yellow px-3 py-1 text-xs font-black text-k-ink"
                    >
                      {m.link.label} →
                    </Link>
                  </div>
                )}
              </div>
            ))}
            {thinking && (
              <p className="inline-block rounded-2xl bg-zinc-100 px-3 py-1.5 text-[13px] font-bold text-zinc-400">
                …
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t-2 border-dashed border-k-ink/30 p-2.5">
            {QUICK.map((item) => (
              <button
                key={item.q}
                type="button"
                onClick={() => ask(item)}
                disabled={thinking}
                className="rounded-full border-2 border-k-ink bg-white px-2.5 py-1 text-[11.5px] font-black text-k-ink transition-colors hover:bg-k-yellow disabled:opacity-50"
              >
                {item.q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
