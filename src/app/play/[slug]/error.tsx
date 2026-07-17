"use client";

export default function PlayError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main role="alert" className="fixed inset-0 flex items-center justify-center bg-zinc-950 px-6 text-center text-white">
      <div><h1 className="text-xl font-bold">Le jeu est momentanément indisponible</h1><p className="mt-2 text-sm text-zinc-400">Si un gain venait d&apos;être tiré, il sera retrouvé automatiquement.</p><button onClick={reset} className="mt-5 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-900">Réessayer</button></div>
    </main>
  );
}
