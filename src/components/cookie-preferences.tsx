"use client";

import { useState } from "react";

export function CookiePreferences() {
  const [saved, setSaved] = useState(false);

  function choose(value: "granted" | "denied") {
    localStorage.setItem("lc:analytics-consent", value);
    window.dispatchEvent(new Event("lastchance:analytics-consent"));
    setSaved(true);
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button onClick={() => choose("denied")} className="rounded-lg border px-4 py-2 font-medium hover:bg-zinc-50">
        Refuser la mesure d&apos;audience
      </button>
      <button onClick={() => choose("granted")} className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700">
        Accepter la mesure d&apos;audience
      </button>
      {saved && <span role="status" className="text-emerald-700">Choix enregistré.</span>}
    </div>
  );
}
