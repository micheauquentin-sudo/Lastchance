import type { Metadata } from "next";
import { loadPlayContext } from "@/lib/play-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlayExperience } from "@/components/wheel/play-experience";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournez la roue !",
  robots: { index: false },
};

export default async function PlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await loadPlayContext(slug);

  if (!ctx.ok) {
    return (
      <PlayShell>
        <div className="play-in text-center px-8">
          <div className="text-5xl mb-6">🎡</div>
          <h1 className="text-2xl font-bold text-white mb-3">Oups</h1>
          <p className="text-zinc-400">{ctx.error}</p>
        </div>
      </PlayShell>
    );
  }

  // Compteur de scans (approximation V1 : 1 chargement = 1 scan)
  const admin = createAdminClient();
  admin
    .rpc("increment_qr_scan", { p_slug: slug })
    .then(({ error }) => {
      if (error) console.error("[play] scan count:", error.message);
    });

  // Seules les données publiques partent au client — jamais les poids.
  const segments = ctx.prizes.map((p) => ({
    id: p.id,
    label: p.label,
    color: p.color,
  }));

  return (
    <PlayShell>
      <PlayExperience
        slug={slug}
        organizationName={ctx.organization.name}
        segments={segments}
      />
    </PlayShell>
  );
}

function PlayShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-y-auto"
      style={{
        background:
          "radial-gradient(circle at 50% -10%, #2e1065, #0c0118 60%, #000)",
      }}
    >
      {children}
    </div>
  );
}
