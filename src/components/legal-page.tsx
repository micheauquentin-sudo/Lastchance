import Link from "next/link";

export function LegalPage({
  title,
  updated = "17 juillet 2026",
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[#fdf6f0] px-5 py-12 text-zinc-800 sm:py-20">
      <article className="mx-auto max-w-3xl rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm sm:p-10">
        <Link href="/" className="text-sm font-semibold text-orange-600 hover:underline">
          ← LastChance
        </Link>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-zinc-950">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">Dernière mise à jour : {updated}</p>
        <div className="prose-legal mt-8 space-y-7 text-sm leading-7 text-zinc-700">
          {children}
        </div>
        <nav aria-label="Informations légales" className="mt-10 flex flex-wrap gap-4 border-t pt-6 text-sm">
          <Link href="/legal" className="hover:text-orange-600">Mentions légales</Link>
          <Link href="/privacy" className="hover:text-orange-600">Confidentialité</Link>
          <Link href="/cookies" className="hover:text-orange-600">Cookies</Link>
          <Link href="/terms" className="hover:text-orange-600">Conditions d&apos;utilisation</Link>
        </nav>
      </article>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-zinc-950">{title}</h2>
      {children}
    </section>
  );
}
