"use client";

import { useState } from "react";
import { stampLoyaltyVisitStaff } from "@/actions/loyalty";
import type { LoyaltyStampResult } from "@/lib/loyalty";
import { Card } from "@/components/ui/card";
import {
  loyaltyTierMeta,
  messageForStampState,
} from "@/components/loyalty/loyalty-passport-state";
import { QrScanner } from "./qr-scanner";

/** Programme de fidélité en mode staff, validable en caisse. */
export interface StaffLoyaltyProgram {
  id: string;
  name: string;
}

/**
 * Validation d'une visite fidélité en caisse (mode staff) : le staff choisit
 * le programme puis scanne le QR du passeport présenté par le client. Le QR
 * encode le jeton du passeport (memberToken) ; la Server Action authentifiée
 * stampLoyaltyVisitStaff enregistre la visite et renvoie l'état + les paliers
 * atteints. Une saisie manuelle du jeton reste possible en repli.
 */
export function LoyaltyStaffStamp({ programs }: { programs: StaffLoyaltyProgram[] }) {
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [manualToken, setManualToken] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LoyaltyStampResult | null>(null);
  const [error, setError] = useState("");

  async function submit(rawToken: string) {
    const memberToken = rawToken.trim();
    if (!programId || !memberToken) return;
    setPending(true);
    setError("");
    setResult(null);
    const res = await stampLoyaltyVisitStaff({ programId, memberToken });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.data);
    setManualToken("");
  }

  if (programs.length === 0) return null;

  return (
    <Card className="mt-8">
      <h2 className="font-semibold mb-1">Valider une visite fidélité</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Le client présente le QR de son passeport : scannez-le pour lui compter
        une visite.
      </p>

      {programs.length > 1 && (
        <div className="mb-4">
          <label
            htmlFor="loyalty-staff-program"
            className="mb-1.5 block text-sm font-bold text-k-ink"
          >
            Programme
          </label>
          <select
            id="loyalty-staff-program"
            value={programId}
            onChange={(e) => {
              setProgramId(e.target.value);
              setResult(null);
              setError("");
            }}
            className="w-full max-w-sm rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
          >
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <QrScanner
        label="📷 Scanner le passeport du client"
        videoLabel="Aperçu caméra pour scanner le passeport de fidélité"
        onResult={submit}
      />

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-500 hover:text-k-ink">
          Saisir le code du passeport à la main
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            aria-label="Jeton du passeport du client"
            placeholder="Coller le code du passeport"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            type="button"
            onClick={() => submit(manualToken)}
            disabled={pending || manualToken.trim() === ""}
            className="rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            Valider
          </button>
        </div>
      </details>

      {pending && (
        <p className="mt-4 text-sm text-zinc-500" role="status">
          Validation en cours…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
      {result && <StaffStampResult result={result} />}
    </Card>
  );
}

function StaffStampResult({ result }: { result: LoyaltyStampResult }) {
  if (result.state !== "stamped") {
    const message = messageForStampState(result.state, {
      retryInSeconds: result.retryInSeconds,
    });
    return (
      <div
        role="status"
        className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3"
      >
        <p className="text-sm font-black text-amber-900">{message.title}</p>
        {message.body && (
          <p className="mt-0.5 text-sm font-bold text-amber-800">{message.body}</p>
        )}
      </div>
    );
  }

  const meta = loyaltyTierMeta(result.tier);
  return (
    <div
      role="status"
      className="mt-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3"
    >
      <p className="text-sm font-black text-emerald-900">
        ✓ Visite validée{result.program ? ` — ${result.program.name}` : ""}
      </p>
      <p className="mt-0.5 text-sm font-bold text-emerald-800">
        {result.visitCount} visite{result.visitCount > 1 ? "s" : ""} · niveau{" "}
        {meta.emoji} {meta.label}
      </p>

      {result.milestonesReached.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-900">
            🎉 Palier débloqué
          </p>
          {result.milestonesReached.map((m) => (
            <div
              key={m.milestoneId}
              className="rounded-lg border border-emerald-200 bg-white px-3 py-2"
            >
              <p className="text-sm font-black text-k-ink">
                {m.rewardType === "spin"
                  ? m.rewardLabel || "Tour de roue offert"
                  : m.rewardLabel || "Lot fidélité"}
              </p>
              {m.rewardType === "spin" ? (
                <p className="text-xs font-bold text-zinc-500">
                  🎡 Le client peut lancer sa roue depuis son passeport.
                </p>
              ) : m.outOfStock || !m.code ? (
                <p className="text-xs font-bold text-amber-700">
                  Lot épuisé — aucun code émis.
                </p>
              ) : (
                <p className="font-mono text-sm font-black tracking-wider text-k-ink">
                  {m.code}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
