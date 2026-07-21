import type { Metadata } from "next";
import Link from "next/link";
import { loadContestContext } from "@/lib/pronostics-context";
import { RecoveryConfirm } from "@/components/pronos/contest-experience";

/**
 * Atterrissage du lien magique de récupération : le jeton n'est
 * consommé QUE par le clic (bouton → server action) — jamais au simple
 * chargement, les scanners d'emails suivent les liens. DA « Kermesse ».
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Retrouver mes pronostics",
  robots: { index: false },
};

export default async function RecoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug } = await params;
  const { token } = await searchParams;
  const ctx = await loadContestContext(slug);

  return (
    <div className="min-h-dvh bg-k-bg">
      <div
        aria-hidden
        className="h-3 w-full border-b-2 border-k-ink"
        style={{
          background:
            "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
        }}
      />
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="k-border rounded-2xl bg-white p-6 text-center shadow-[6px_6px_0_var(--color-k-ink)]">
          <div className="text-5xl mb-4">🔑</div>
          <h1 className="text-2xl font-black text-k-ink mb-2">
            Retrouver mes pronostics
          </h1>
          {!ctx.ok ? (
            <p className="text-k-body">{ctx.error}</p>
          ) : !token ? (
            <p className="text-k-body">
              Ce lien est incomplet. Redemandez un lien depuis la page du
              championnat.
            </p>
          ) : (
            <>
              <p className="text-sm text-k-body mb-5">
                {ctx.contest.name} — votre grille, vos points et votre
                classement reviennent sur cet appareil.
              </p>
              <RecoveryConfirm slug={slug} token={token} />
            </>
          )}
          <p className="mt-5 text-xs text-k-body/70">
            <Link
              href={`/pronos/${slug}`}
              className="font-bold text-k-ink underline underline-offset-2"
            >
              ← Retour au championnat
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
