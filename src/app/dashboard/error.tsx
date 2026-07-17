"use client";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-bold">Cette page n&apos;a pas pu être chargée</h2>
      <p className="mt-2 text-sm text-zinc-500">Vos données n&apos;ont pas été modifiées. Réessayez dans un instant.</p>
      <button onClick={reset} className="mt-5 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white">Réessayer</button>
    </div>
  );
}
