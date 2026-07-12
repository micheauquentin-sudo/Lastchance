import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Accès refusé", robots: { index: false } };

export default async function AdminUnauthorizedPage() {
  // Doit rester un admin connecté (sinon → login) ; simplement pas la
  // permission du module demandé.
  await requireAdmin();

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-zinc-100">
      <div className="max-w-md text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </span>
        <h1 className="mt-4 text-xl font-semibold text-white">Accès refusé</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Votre rôle ne permet pas d&apos;accéder à ce module. Cette tentative a été
          journalisée.
        </p>
        <Link
          href="/admin"
          className="mt-6 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
        >
          Retour au dashboard
        </Link>
      </div>
    </main>
  );
}
