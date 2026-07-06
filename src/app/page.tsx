import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <span className="font-bold text-lg tracking-tight">
            Lastchance<span className="text-violet-600">.</span>
          </span>
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900 px-3 py-2"
            >
              Connexion
            </Link>
            <Link
              href="/signup"
              className="text-sm font-medium bg-zinc-900 text-white px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors"
            >
              Essai gratuit
            </Link>
          </nav>
        </div>
      </header>

      <section className="flex-1 flex items-center">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-600 mb-4">
            Gamification pour commerces
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900">
            Une roue de la fortune,
            <br />
            des clients qui reviennent.
          </h1>
          <p className="mt-6 text-lg text-zinc-600 max-w-xl mx-auto">
            Vos clients scannent un QR code, tournent la roue et gagnent des
            récompenses que vous configurez. Simple, conforme RGPD, prêt en 10
            minutes.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/signup"
              className="bg-violet-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-violet-500 transition-colors"
            >
              Créer ma roue
            </Link>
            <Link
              href="/login"
              className="font-semibold px-6 py-3 rounded-xl border border-zinc-300 hover:bg-white transition-colors"
            >
              Espace commerçant
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500">
        © {new Date().getFullYear()} Lastchance — Les gains ne sont jamais
        conditionnés à un avis en ligne.
      </footer>
    </main>
  );
}
