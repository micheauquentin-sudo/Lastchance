"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfettiBurst } from "./confetti-burst";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

/** Petit trèfle plein, pour le sticker « Toutes les chances ». */
function CloverGlyph({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 13.2 9.6 10.8a3.2 3.2 0 1 1 2.4-5.3 3.2 3.2 0 1 1 5.3 2.4L14.9 10.3l2.4-.6a3.2 3.2 0 1 1-2.4 5.3 3.2 3.2 0 1 1-5.3-2.4Z" />
      <path d="M11.4 13.4c.4 2.6.4 4.9 0 6.9h1.6c-.5-2-.6-4.3-.3-6.9Z" />
    </svg>
  );
}

/**
 * Un sticker jouable du hero.
 *
 * C'est un VRAI bouton, pas un `div` cliquable : il prend le focus, s'active
 * à Entrée comme à Espace, et porte un nom accessible complet. Au clic, il se
 * retourne sur un code de démonstration et lâche une poignée de confettis.
 *
 * ── Le code est DÉCORATIF, et le dit ──────────────────────────────────────
 * Cette page vend un produit à des commerçants ; elle n'organise pas de jeu.
 * Un visiteur ne doit à aucun moment croire qu'il vient de gagner quelque
 * chose : la mention « aperçu du jeu, sans valeur » est dans le nom accessible
 * du bouton AVANT le clic, sur la face retournée, et dans la légende annoncée
 * aux lecteurs d'écran après le retournement. Trois endroits, aucun implicite.
 *
 * Les deux faces sont des FRÈRES, jamais imbriquées : la face avant est le
 * bouton, la face arrière un `div` qui contient le bouton « Copier ». Un
 * bouton dans un bouton serait invalide et inutilisable au clavier.
 */
function PlayableSticker({
  place,
  bob,
  code,
  name,
  frontClassName,
  backClassName = "",
  children,
}: {
  /** Placement absolu dans le hero. */
  place: string;
  /** Cadence de flottement (`k-bob` ou `k-bob-r`). */
  bob: string;
  code: string;
  /** Ce que le sticker annonce, pour le nom accessible. */
  name: string;
  /** Habillage de la face avant (forme, couleur, rotation). */
  frontClassName: string;
  /** Ajustements de la face arrière (rayon, découpe). */
  backClassName?: string;
  children: React.ReactNode;
}) {
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [burst, setBurst] = useState(0);
  const copyRef = useRef<HTMLButtonElement>(null);
  const shouldFocus = useRef(false);

  const reveal = () => {
    setFlipped(true);
    shouldFocus.current = true;
    /* Pas de confettis sous « mouvement réduit » : le code se révèle quand
       même, la récompense ne dépend jamais de l'animation. */
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBurst((n) => n + 1);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* Presse-papiers refusé (permission, contexte non sécurisé) : le code
         reste lisible et sélectionnable à l'écran, on n'affiche pas d'erreur
         pour un code qui n'a de toute façon aucune valeur. */
      setCopied(false);
    }
  };

  const endBurst = useCallback(() => setBurst(0), []);

  useEffect(() => {
    if (!flipped || !shouldFocus.current) return;
    shouldFocus.current = false;
    copyRef.current?.focus();
  }, [flipped]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className={`absolute ${place}`}>
      {/* `w-max` : sans lui, la légende ci-dessous élargirait la boîte
          rétrécie du conteneur absolu, et le sticker — bloc de largeur auto —
          s'étirerait avec elle jusqu'à perdre sa forme de pastille. */}
      <div className={`${bob} w-max`}>
        <div className="k-flip-stage relative">
          <div className="k-flip relative" data-flipped={flipped}>
            <button
              type="button"
              onClick={reveal}
              inert={flipped}
              aria-label={`${name} — révéler le code de démonstration (aperçu du jeu, sans valeur)`}
              className={`k-flip-face pointer-events-auto block cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-k-ink ${frontClassName}`}
            >
              {children}
            </button>

            <div
              inert={!flipped}
              className={`k-flip-face k-flip-back k-border k-sticker pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-k-bg px-3 text-center ${backClassName}`}
            >
              <span className="font-mono text-[12px] font-black leading-none tracking-tight text-k-ink">
                {code}
              </span>
              <button
                ref={copyRef}
                type="button"
                onClick={copy}
                className="k-border-thin rounded-full bg-k-yellow px-2.5 py-1 text-[11px] font-black leading-none text-k-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
              >
                {copied ? "Copié ✓" : "Copier"}
              </button>
            </div>
          </div>

          {burst > 0 && <ConfettiBurst key={burst} onDone={endBurst} />}
        </div>
      </div>

      {/* Légende hors du sticker : elle ne tiendrait pas dedans, et c'est
          elle qui porte la mention sans laquelle un visiteur pourrait croire
          qu'il a gagné. `role="status"` la fait annoncer au retournement. */}
      <p
        role="status"
        className={`absolute left-0 top-full mt-3 w-max max-w-[220px] rounded-full border-2 border-k-ink/25 bg-white/92 px-3 py-1 text-[11px] font-bold leading-snug text-k-body backdrop-blur-md transition-opacity duration-300 ${
          flipped ? "opacity-100" : "opacity-0"
        }`}
      >
        {flipped ? "Code de démonstration — aperçu du jeu, sans valeur." : ""}
      </p>
    </div>
  );
}

/**
 * Stickers flottants du hero.
 *
 * Masqués sous `lg` (ils passeraient sur le texte). Le conteneur reste inerte
 * au pointeur pour ne pas voler le clic au titre ; seuls les stickers eux-mêmes
 * le récupèrent.
 */
export function HeroStickers() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] hidden lg:block">
      {/* Scintillements : ponctuation, jamais un objet. */}
      <span aria-hidden className="k-twinkle absolute left-[13%] top-[26%] h-3.5 w-3.5 rounded-full bg-white" />
      <span aria-hidden className="k-twinkle absolute right-[16%] top-[21%] h-3 w-3 rounded-full bg-k-yellow" style={{ animationDelay: "0.6s" }} />
      <span aria-hidden className="k-twinkle absolute left-[24%] bottom-[24%] h-2.5 w-2.5 rounded-full bg-k-pink" style={{ animationDelay: "1.2s" }} />

      {/* -20 % : losange jaune double */}
      <PlayableSticker
        place="left-[6%] top-[24%]"
        bob="k-bob"
        code="KERMESSE-20"
        name="Sticker « -20 % »"
        frontClassName="relative h-[120px] w-[120px]"
        backClassName="rounded-[22px]"
      >
        <span aria-hidden className="k-border k-sticker absolute inset-0 rotate-45 rounded-[22px] bg-k-yellow" />
        <span aria-hidden className="k-border absolute inset-0 rounded-[22px] bg-k-yellow" />
        <span
          aria-hidden
          className="absolute inset-0 flex -rotate-[8deg] items-center justify-center text-[28px] text-k-ink"
          style={DISPLAY}
        >
          -20%
        </span>
      </PlayableSticker>

      <PlayableSticker
        place="right-[5%] top-[27%]"
        bob="k-bob-r"
        code="KERMESSE-CAFE"
        name="Sticker « Café offert »"
        frontClassName="k-border k-sticker rotate-[5deg] whitespace-nowrap rounded-full bg-k-pink px-6 py-3 text-2xl font-black text-k-ink"
        backClassName="rotate-[5deg] rounded-full"
      >
        Café offert
      </PlayableSticker>

      <PlayableSticker
        place="bottom-[22%] left-[4%]"
        bob="k-bob-r"
        code="KERMESSE-SCAN"
        name="Sticker « Scan et joue »"
        frontClassName="k-border k-sticker -rotate-[5deg] whitespace-nowrap rounded-full bg-k-blue px-6 py-3 text-xl font-black tracking-wide text-k-ink"
        backClassName="-rotate-[5deg] rounded-full"
      >
        SCAN &amp; JOUE
      </PlayableSticker>

      <PlayableSticker
        place="bottom-[24%] right-[6%]"
        bob="k-bob"
        code="KERMESSE-CHANCE"
        name="Sticker « Toutes les chances »"
        frontClassName="k-border k-sticker inline-flex rotate-[4deg] items-center gap-2 whitespace-nowrap rounded-full bg-k-green px-6 py-3 text-xl font-black text-k-bg"
        backClassName="rotate-[4deg] rounded-full"
      >
        Toutes les chances
        <CloverGlyph className="h-5 w-5" />
      </PlayableSticker>
    </div>
  );
}
