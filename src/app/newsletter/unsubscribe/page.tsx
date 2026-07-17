import type { Metadata } from "next";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

export const metadata: Metadata = {
  title: "Désinscription",
  robots: { index: false },
};

/**
 * Un GET provenant d'un scanner de liens ne modifie aucune donnée. La
 * désinscription est effectuée par POST après confirmation explicite.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const subscriberId = token ? verifyUnsubscribeToken(token) : null;

  if (!subscriberId) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-zinc-900">Lien invalide</h1>
        <p className="mt-2 text-zinc-500">
          Ce lien de désinscription n&apos;est plus valide.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-bold text-zinc-900">Se désinscrire</h1>
      <p className="mt-2 text-zinc-500">
        Confirmez pour ne plus recevoir les emails de ce commerçant.
      </p>
      <form action="/api/newsletter/unsubscribe" method="post" className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-700">
          Confirmer la désinscription
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#fdf6f0] px-6">
      <div className="max-w-sm rounded-2xl border border-orange-900/[0.06] bg-white p-8 text-center shadow-sm">
        {children}
      </div>
    </main>
  );
}
