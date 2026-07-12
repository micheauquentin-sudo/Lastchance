import { requireAdmin } from "@/lib/admin/auth";
import { permissionsFor } from "@/lib/admin/rbac";
import { adminLogout } from "@/app/admin/actions";
import { Sidebar } from "@/components/admin/sidebar";
import { ADMIN_ROLE_LABELS } from "@/types/admin";

export default async function AdminProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Barrière : admin actif requis. La permission fine est vérifiée
  // page par page (chaque page appelle requireAdmin(permission)).
  const admin = await requireAdmin();
  const perms = [...permissionsFor(admin.role)];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 lg:flex">
      <Sidebar permissions={perms} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 hidden items-center justify-end gap-3 border-b border-white/10 bg-zinc-950/80 px-6 py-3 backdrop-blur lg:flex">
          <div className="text-right">
            <p className="text-sm font-medium text-white">{admin.email}</p>
            <p className="text-xs text-zinc-500">{admin.name || "—"}</p>
          </div>
          <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30">
            {ADMIN_ROLE_LABELS[admin.role]}
          </span>
          <form action={adminLogout}>
            <button
              type="submit"
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              Déconnexion
            </button>
          </form>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
