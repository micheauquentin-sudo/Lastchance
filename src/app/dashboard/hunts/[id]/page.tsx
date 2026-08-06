import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { hasHuntsAccess } from "@/lib/subscription";
import { Card } from "@/components/ui/card";
import {
  HuntSettings,
  HuntStatusControls,
  HuntStepsEditor,
} from "@/components/dashboard/hunt-editor";
import { HuntPosters } from "@/components/dashboard/hunt-posters";
import { HuntStatusBadge } from "@/components/dashboard/hunt-status";
import { GuidedJourney } from "@/components/dashboard/guided-journey";
import { RelaunchFormulaAction } from "@/components/dashboard/relaunch-formula-action";
import { RelaunchFormulaCard } from "@/components/dashboard/relaunch-formula-card";
import { RelanceErreur } from "@/components/dashboard/relance-erreur";
import { construireEtapesAventure } from "@/lib/experience-lifecycle";
import { etatSourceRelance } from "@/lib/experience-relance";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { readModulePageOpenCounts } from "@/lib/module-page-opens";
import type { Hunt, HuntStep } from "@/types/database";

export const metadata: Metadata = { title: "Chasse au trésor" };

export default async function HuntDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ relance_error?: string | string[] }>;
}) {
  const { id } = await params;
  const { relance_error: relanceError } = await searchParams;
  const { organization, role } = await getUserAndOrg();
  if (!organization || !hasHuntsAccess(organization)) notFound();
  const supabase = await createClient();
  const canViewPlayers = role === "owner";

  const [{ data: hunt }, { data: stepRows }] = await Promise.all([
    supabase
      .from("hunts")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("hunt_steps")
      .select("*")
      .eq("hunt_id", id)
      .eq("organization_id", organization.id)
      .order("position", { ascending: true }),
  ]);

  if (!hunt) notFound();
  const h = hunt as Hunt;
  const steps = (stepRows ?? []) as HuntStep[];

  // Stats agrégées (owner) — org-scopées, honorées par la RLS « member select ».
  let players = 0;
  let redeemed = 0;
  if (canViewPlayers) {
    const [{ count: playerCount }, { count: redeemedCount }] = await Promise.all([
      supabase
        .from("hunt_players")
        .select("id", { count: "exact", head: true })
        .eq("hunt_id", id)
        .eq("organization_id", organization.id),
      supabase
        .from("hunt_completions")
        .select("id", { count: "exact", head: true })
        .eq("hunt_id", id)
        .eq("organization_id", organization.id)
        .not("redeemed_at", "is", null),
    ]);
    players = playerCount ?? 0;
    redeemed = redeemedCount ?? 0;
  }

  // Compteur d'ouvertures PAR ÉTAPE. On interroge sur `step.id` et non sur
  // `hunt.id` : le grain de `module_page_opens.resource_id` est ce que le QR
  // désigne — ici l'étape, comme `events` compte par session. Une ressource
  // sans ligne n'a jamais été ouverte, `readModulePageOpenCounts` rend 0 pour
  // que l'affiche dise « 0 ouverture » plutôt qu'un blanc.
  const openCounts = await readModulePageOpenCounts(
    supabase,
    "hunts",
    steps.map((step) => step.id),
  );

  const posterSteps = steps.map((step) => ({
    position: step.position,
    label: step.label,
    token: step.token,
    url: `${APP_URL}/hunt/${step.token}`,
    opens: openCounts[step.id] ?? 0,
  }));

  const remainingStock =
    h.reward_stock === null ? null : Math.max(0, h.reward_stock - h.reward_claimed_count);

  // Carte de l'Aventure et relance : les marqueurs sortent de la ligne DÉJÀ
  // lue ci-dessus, aucune requête n'est ajoutée pour eux.
  const marqueurs = {
    status: h.status,
    starts_at: h.starts_at,
    ends_at: h.ends_at,
  };
  const capacites = await capacitesDuModule("hunts");
  const pagePath = `/dashboard/hunts/${h.id}`;
  const etapes = construireEtapesAventure({
    marqueurs: { kind: "hunt", ...marqueurs },
    capacites,
    liens: {
      editeur: pagePath,
      // L'aperçu d'une chasse est le QR de sa première étape : c'est ce que le
      // joueur scanne en premier.
      apercu: posterSteps[0]?.url ?? null,
      suivi: pagePath,
    },
  });
  const peutCreerBrouillon = role === "owner" || role === "editor";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/hunts"
          className="text-sm text-zinc-500 hover:text-k-ink"
        >
          ← Chasses au trésor
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🗺️
          </span>
          <h1 className="text-2xl font-bold">{h.name}</h1>
          <HuntStatusBadge status={h.status} />
        </div>
      </div>

      <GuidedJourney steps={etapes} title="Carte de l'Aventure" />

      {canViewPlayers && (
        <Card>
          <h2 className="font-semibold mb-4">En un coup d&apos;œil</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Étapes" value={steps.length} />
            <Stat label="Joueurs" value={players} />
            <Stat label="Lots gagnés" value={h.reward_claimed_count} />
            <Stat label="Lots remis" value={redeemed} />
          </dl>
          {remainingStock !== null && (
            <p className="mt-4 text-sm text-zinc-500">
              Stock restant :{" "}
              <span className="font-semibold text-zinc-900">
                {remainingStock}
              </span>{" "}
              lot{remainingStock > 1 ? "s" : ""}
            </p>
          )}
        </Card>
      )}

      <HuntStatusControls hunt={h} stepCount={steps.length} />

      <HuntStepsEditor huntId={h.id} steps={steps} />

      <Card>
        <h2 className="font-semibold mb-1">Affiches QR des étapes</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Une affiche par étape à imprimer et poser sur place. Chaque QR renvoie
          le joueur vers la page de l&apos;étape correspondante. Le compteur
          affiché sous chaque affiche est propre à CETTE étape — c&apos;est ce
          qui vous dit lequel de vos emplacements travaille. Chaque chargement
          compte, y compris un rechargement ou un lien partagé : ce n&apos;est
          donc pas un nombre de visiteurs distincts.
        </p>
        <HuntPosters huntName={h.name} steps={posterSteps} />
      </Card>

      <HuntSettings hunt={h} timeZone={organization.timezone} />

      <RelanceErreur message={relanceError} />

      {capacites.canExplore && (
        <RelaunchFormulaCard
          sourceName={h.name}
          sourceState={etatSourceRelance("hunt", marqueurs)}
          canCreateDraft={peutCreerBrouillon}
          isSupported
          action={<RelaunchFormulaAction kind="hunt" sourceId={h.id} />}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl font-black tabular-nums text-k-ink">
        {value}
      </dd>
    </div>
  );
}
