"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const CONSENT_EVENT = "lastchance:analytics-consent";

function subscribe(callback: () => void) {
  window.addEventListener(CONSENT_EVENT, callback);
  return () => window.removeEventListener(CONSENT_EVENT, callback);
}

export function CookieConsent() {
  const visible = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem("lc:analytics-consent") === null,
    () => false,
  );
  if (!visible || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return null;

  function choose(value: "granted" | "denied") {
    localStorage.setItem("lc:analytics-consent", value);
    window.dispatchEvent(new Event(CONSENT_EVENT));
  }

  return (
    <aside
      role="dialog"
      aria-label="Choix des traceurs de mesure d’audience"
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl"
    >
      <p className="font-semibold">Mesure d’audience facultative</p>
      <p className="mt-1 text-sm text-zinc-600">
        Nous utilisons PostHog uniquement si vous l’acceptez. Le refus ne
        change rien au fonctionnement du jeu. <Link href="/cookies" className="underline">En savoir plus</Link>.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => choose("denied")}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold"
        >
          Refuser
        </button>
        <button
          type="button"
          onClick={() => choose("granted")}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Accepter
        </button>
      </div>
    </aside>
  );
}
