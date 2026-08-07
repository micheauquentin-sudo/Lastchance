import type { Metadata } from "next";
import Link from "next/link";
import { loadContestContext } from "@/lib/pronostics-context";
import { RecoveryConfirm } from "@/components/pronos/contest-experience";
import { PlayerPageShell } from "@/components/ui/player-page-shell";
import { contestThemeTokens } from "@/components/pronos/contest-theme";

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

  // Même thème que la page du championnat : le joueur qui suit son lien de
  // récupération arrive dans le décor qu'il vient de quitter. Championnat
  // introuvable → `neutre`.
  const tokens = contestThemeTokens(ctx.ok ? ctx.contest.theme : null);

  return (
    <PlayerPageShell pageStyle={tokens.pageStyle} decor={tokens.decor}>
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
    </PlayerPageShell>
  );
}
