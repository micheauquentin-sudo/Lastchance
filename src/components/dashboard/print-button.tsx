"use client";

/** Bouton d'impression navigateur — masqué sur la version imprimée. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden rounded-lg bg-violet-600 text-white text-sm font-semibold px-5 py-2.5 hover:bg-violet-500 transition-colors"
    >
      Imprimer l&apos;affiche
    </button>
  );
}
