import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadHuntStepContext } from "@/lib/hunt-context";
import { HuntJourney } from "@/components/hunts/hunt-journey";
import { SkipLink } from "@/components/ui/skip-link";

/**
 * Page publique d'une étape de chasse au trésor — DA « Kermesse », même
 * famille visuelle que le parcours pronostics. Le joueur arrive ici en
 * scannant le QR d'une étape ; chaque page correspond à une étape.
 *
 * Rendu dynamique : le contenu dépend du cookie joueur (progression
 * personnelle). Le tampon N'EST PAS posé au chargement (anti-prefetch) —
 * il se fait au POST du bouton « Valider mon passage » (voir HuntJourney).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chasse au trésor",
  robots: { index: false },
};

export default async function HuntStepPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await loadHuntStepContext(token);

  // Réponse générique unique (404) : aucun oracle sur le motif d'invalidité
  // (chasse inconnue, fermée, hors fenêtre, module coupé…).
  if (!ctx.ok) notFound();

  const { hunt, step, organization, progress } = ctx;
  // L'indice n'est envoyé au client que si CETTE étape est déjà tamponnée
  // (le joueur l'a donc déjà méritée) — jamais présent dans le HTML sinon.
  const alreadyStamped = progress.stamped.includes(step.position);

  return (
    <Shell>
      <HuntJourney
        stepToken={step.token}
        organizationName={organization.name}
        logoUrl={organization.logo_url}
        huntName={hunt.name}
        orderMode={hunt.order_mode}
        step={{ position: step.position, label: step.label }}
        reward={{ label: hunt.reward_label, details: hunt.reward_details }}
        initial={{
          total: progress.total,
          done: progress.done,
          stamped: progress.stamped,
          completedCode: progress.completedCode,
        }}
        revealedHint={alreadyStamped ? step.hint_text : null}
      />

      <footer className="mx-auto max-w-md px-4 pb-10 text-center text-xs text-k-body">
        Jeu proposé par {organization.name} · propulsé par{" "}
        <Link
          href="/?utm_source=hunt&utm_medium=footer"
          className="font-bold text-k-ink underline underline-offset-2 hover:text-k-orange"
        >
          Lastchance
        </Link>
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-k-bg">
      <SkipLink />
      {/* Bandeau rayé kermesse en tête de page */}
      <div
        aria-hidden
        className="h-3 w-full border-b-2 border-k-ink"
        style={{
          background:
            "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
        }}
      />
      <main id="contenu" tabIndex={-1} className="outline-none">
        {children}
      </main>
    </div>
  );
}
