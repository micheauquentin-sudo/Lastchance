import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

export const metadata: Metadata = {
  title: "Désinscription",
  robots: { index: false },
};

/**
 * Désinscription en un clic (lien direct depuis l'email, sans session).
 * Le jeton signé identifie l'abonné sans exposer ni deviner son id ; la
 * mise à jour est idempotente (revisiter le lien ne casse rien).
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

  const admin = createAdminClient();
  await admin
    .from("newsletter_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("id", subscriberId)
    .is("unsubscribed_at", null);

  return (
    <Shell>
      <h1 className="text-xl font-bold text-zinc-900">Vous êtes désinscrit(e)</h1>
      <p className="mt-2 text-zinc-500">
        Vous ne recevrez plus d&apos;emails de ce commerçant. Vous pouvez fermer
        cette page.
      </p>
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
