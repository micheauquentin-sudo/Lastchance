"use client";

export default function SegmentError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main role="alert" className="flex min-h-[60vh] items-center justify-center px-6 text-center">
      <div>
        <h1 className="text-xl font-bold text-k-ink">Cette page n&apos;a pas pu s&apos;afficher</h1>
        <p className="mt-2 text-sm text-k-muted">Rien n&apos;a été perdu. Réessayez, la page se recharge sans quitter le site.</p>
        <button onClick={reset} className="mt-5 rounded-xl bg-k-ink px-5 py-3 text-sm font-semibold text-white">Réessayer</button>
      </div>
    </main>
  );
}
