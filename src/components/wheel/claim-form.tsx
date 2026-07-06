"use client";

import { useState } from "react";
import { claimPrize } from "@/actions/play";

type Status = "form" | "submitting" | "done";

/**
 * Formulaire RGPD après un gain : prénom + email + CGU obligatoires,
 * opt-in marketing séparé et non pré-coché. Affiche ensuite le code
 * à présenter au staff.
 */
export function ClaimForm({ claimToken }: { claimToken: string }) {
  const [status, setStatus] = useState<Status>("form");
  const [error, setError] = useState("");
  const [redeemCode, setRedeemCode] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status !== "form") return;
    setStatus("submitting");
    setError("");

    const form = new FormData(e.currentTarget);
    const result = await claimPrize({
      claimToken,
      firstName: String(form.get("firstName") ?? ""),
      email: String(form.get("email") ?? ""),
      acceptedTerms: form.get("acceptedTerms") === "on",
      marketingOptIn: form.get("marketingOptIn") === "on",
    });

    if (!result.ok) {
      setStatus("form");
      setError(result.error);
      return;
    }
    setRedeemCode(result.data.redeemCode);
    setStatus("done");
  }

  if (status === "done") {
    return (
      <div className="play-in rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-[11px] font-mono tracking-[0.25em] text-zinc-400 mb-2">
          VOTRE CODE
        </p>
        <p className="text-3xl font-mono font-bold tracking-[0.2em] text-white">
          {redeemCode}
        </p>
        <p className="mt-4 text-sm text-zinc-400">
          Présentez ce code au staff pour récupérer votre gain. Il vous a
          aussi été envoyé par email.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400";

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-left">
      <input
        name="firstName"
        required
        maxLength={80}
        placeholder="Votre prénom"
        autoComplete="given-name"
        className={inputClass}
      />
      <input
        name="email"
        type="email"
        required
        placeholder="Votre email"
        autoComplete="email"
        className={inputClass}
      />

      <label className="flex items-start gap-3 text-sm text-zinc-300">
        <input
          type="checkbox"
          name="acceptedTerms"
          required
          className="mt-1 h-4 w-4 shrink-0 accent-violet-500"
        />
        <span>
          J&apos;accepte les conditions du jeu et le traitement de mes
          données pour la remise de mon gain. <span className="text-violet-300">*</span>
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm text-zinc-400">
        <input
          type="checkbox"
          name="marketingOptIn"
          className="mt-1 h-4 w-4 shrink-0 accent-violet-500"
        />
        <span>
          J&apos;accepte de recevoir les offres et actualités de
          l&apos;établissement (optionnel).
        </span>
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-6 py-4 text-base font-extrabold uppercase tracking-wider text-white shadow-[0_12px_34px_rgba(139,92,246,.45)] disabled:opacity-70"
      >
        {status === "submitting" ? "Enregistrement…" : "Récupérer mon gain"}
      </button>
      <p className="text-center text-[11px] text-zinc-500">
        Vos données ne servent qu&apos;à la remise du gain — jamais liées à
        un avis en ligne.
      </p>
    </form>
  );
}
