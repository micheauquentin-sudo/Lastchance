"use client";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-white p-8 text-center">
      <h2 className="font-bold">Chargement impossible</h2>
      <p className="mt-2 text-sm text-zinc-500">Aucune action n&apos;a été appliquée.</p>
      <button onClick={reset} className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">Réessayer</button>
    </div>
  );
}
