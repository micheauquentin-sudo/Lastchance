import type { Metadata } from "next";
import { getAdminUser } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = { title: "Back-office · Connexion", robots: { index: false } };

export default async function AdminLoginPage() {
  // Déjà admin ? on entre directement.
  if (await getAdminUser()) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-zinc-100">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold text-white">
            L
          </span>
          <span className="font-semibold text-white">LastChance</span>
          <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
            Admin
          </span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-xl">
          <h1 className="text-lg font-semibold text-white">Console d&apos;administration</h1>
          <p className="mt-1 mb-5 text-sm text-zinc-400">
            Accès réservé à l&apos;équipe LastChance.
          </p>
          <AdminLoginForm />
        </div>

        <p className="mt-5 text-center text-xs text-zinc-600">
          Toutes les connexions sont journalisées.
        </p>
      </div>
    </main>
  );
}
