"use client";

import { useEffect, useRef } from "react";

/** Clé publique du site Turnstile (inlinée au build par Next). */
export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

/** Le challenge anti-bot est-il activé côté client ? */
export function turnstileClientEnabled(): boolean {
  return TURNSTILE_SITE_KEY.length > 0;
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      action?: string;
    },
  ) => string;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Coupure réseau passagère : on oublie la promesse rejetée et on retire
      // la balise morte, sinon toute nouvelle tentative rejouerait l'échec
      // mémorisé et le client resterait bloqué jusqu'au rechargement complet.
      scriptPromise = null;
      script.remove();
      reject(new Error("turnstile script load failed"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Pourquoi le challenge n'est pas jouable (cf. `onUnavailable`). */
export type TurnstileUnavailableReason =
  /** Le script Cloudflare n'a pas pu être chargé (réseau, bloqueur, CSP). */
  | "script"
  /** Le widget s'est rendu mais est tombé en erreur (error-callback). */
  | "widget";

/**
 * Widget Cloudflare Turnstile. Ne rend rien si aucune clé publique n'est
 * configurée : le parcours reste inchangé tant que la protection n'est pas
 * activée. Remonte le jeton via `onToken` (null quand expiré / en erreur).
 *
 * `onUnavailable` signale qu'aucun jeton ne viendra jamais de ce widget (script
 * bloqué, erreur Cloudflare). Un appelant qui CONDITIONNE une action au jeton
 * doit s'y abonner pour offrir une porte de sortie : sans cela le client reste
 * devant un cadre vide, sans savoir que rien n'arrivera. Les appelants qui
 * traitent le challenge comme un bonus best-effort peuvent l'ignorer.
 */
export function TurnstileWidget({
  onToken,
  action = "play",
  onUnavailable,
}: {
  onToken: (token: string | null) => void;
  action?: "play" | "prono-register" | "prono-recover" | "loyalty-stamp";
  onUnavailable?: (reason: TurnstileUnavailableReason) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Gardé dans une ref : `onUnavailable` ne doit pas entrer dans les
  // dépendances de l'effet, sous peine de remonter le widget (et donc d'en
  // invalider le jeton) au moindre changement d'identité de la callback.
  const unavailableRef = useRef(onUnavailable);
  useEffect(() => {
    unavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    if (!turnstileClientEnabled()) return;
    let widgetId: string | null = null;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => {
            onToken(null);
            unavailableRef.current?.("widget");
          },
          theme: "auto",
          action,
        });
      })
      .catch((err) => {
        console.error("[turnstile] widget:", err);
        if (!cancelled) unavailableRef.current?.("script");
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          /* widget déjà retiré */
        }
      }
    };
  }, [action, onToken]);

  if (!turnstileClientEnabled()) return null;

  return <div ref={containerRef} className="mt-6 flex justify-center" />;
}
