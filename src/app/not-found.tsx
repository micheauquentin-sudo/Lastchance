import Link from "next/link";

/**
 * 404 globale (pages publiques). Style Kermesse minimal — pas de police
 * next/font dédiée ici pour rester léger sur une page d'erreur.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-k-bg px-6 text-center text-k-ink">
      <span className="k-border k-shadow-md flex h-20 w-20 items-center justify-center rounded-full bg-k-yellow text-4xl">
        🍀
      </span>
      <h1 className="mt-6 text-3xl font-black">Page introuvable</h1>
      <p className="mx-auto mt-3 max-w-sm font-bold text-k-body">
        Ce lien ne mène nulle part. Retournez à l&apos;accueil pour
        continuer.
      </p>
      <Link
        href="/"
        className="k-border k-btn mt-7 inline-block rounded-full bg-k-yellow px-7 py-3 text-base font-black text-k-ink"
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
