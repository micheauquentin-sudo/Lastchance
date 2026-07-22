import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasHuntsAccess } from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { HuntStatusBadge } from "@/components/dashboard/hunt-status";
import { NewHuntForm } from "@/components/dashboard/new-hunt-form";
import type { Hunt } from "@/types/database";

export const metadata: Metadata = { title: "Chasses au trésor" };

export default async function HuntsPage() {
  const { organization, role } = await getUserAndOrg();
  const supabase = await createClient();

  // Module en option : sans l'addon, la page présente l'offre au lieu de la
  // liste (miroir de la gate Pronostics — aucune donnée à charger).
  if (!hasHuntsAccess(organization!)) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-8">Chasses au trésor</h1>
        <Card className="text-center py-12">
          <div className="text-5xl mb-4">🗺️</div>
          <h2 className="text-lg font-bold text-k-ink mb-2">
            Transformez votre boutique en terrain de jeu
          </h2>
          <p className="text-zinc-500 max-w-lg mx-auto mb-4">
            Semez des QR codes en boutique, dans le quartier ou lors d&apos;un
            événement. Vos clients tamponnent chaque étape et repartent avec un
            lot à la clé — une raison de plus de pousser la porte.
          </p>
          <div className="mx-auto max-w-md rounded-xl border-2 border-dashed border-zinc-300 px-4 py-3 mb-3">
            <p className="text-sm font-bold text-k-ink">
              Option à activer sur votre abonnement
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              2 à 10 étapes par chasse, ordre libre ou imposé, lot final remis
              en caisse.
            </p>
          </div>
          <p className="text-sm text-zinc-500">
            Contactez-nous pour l&apos;activer sur votre compte.
          </p>
        </Card>
      </div>
    );
  }

  const [{ data: hunts }, { data: stepRows }, { data: playerRows }] =
    await Promise.all([
      supabase
        .from("hunts")
        .select("*")
        .eq("organization_id", organization!.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("hunt_steps")
        .select("hunt_id")
        .eq("organization_id", organization!.id),
      role === "owner"
        ? supabase
            .from("hunt_players")
            .select("hunt_id")
            .eq("organization_id", organization!.id)
        : Promise.resolve({ data: [] as Array<{ hunt_id: string }> }),
    ]);

  const huntList = (hunts ?? []) as Hunt[];
  const stepCount = new Map<string, number>();
  for (const row of stepRows ?? []) {
    stepCount.set(row.hunt_id, (stepCount.get(row.hunt_id) ?? 0) + 1);
  }
  const playerCount = new Map<string, number>();
  for (const row of playerRows ?? []) {
    playerCount.set(row.hunt_id, (playerCount.get(row.hunt_id) ?? 0) + 1);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Chasses au trésor</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            Un parcours de QR codes à tamponner, un lot final remis en caisse.
          </p>
        </div>
        <NewHuntForm />
      </div>

      {!huntList.length ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">
            Aucune chasse pour l&apos;instant. Créez la première !
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {huntList.map((h) => {
            const steps = stepCount.get(h.id) ?? 0;
            const players = playerCount.get(h.id) ?? 0;
            return (
              <li key={h.id}>
                <Link
                  href={`/dashboard/hunts/${h.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="text-2xl" aria-hidden>
                        🗺️
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{h.name}</p>
                        <p className="text-sm text-zinc-500 mt-0.5">
                          {steps} étape{steps > 1 ? "s" : ""}
                          {h.reward_label ? ` · ${h.reward_label}` : ""} · créée
                          le {formatDate(h.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {role === "owner" && (
                        <span className="text-sm text-zinc-500">
                          <span className="font-semibold text-zinc-900">
                            {players}
                          </span>{" "}
                          joueur{players > 1 ? "s" : ""}
                        </span>
                      )}
                      <span className="text-sm text-zinc-500">
                        <span className="font-semibold text-zinc-900">
                          {h.reward_claimed_count}
                        </span>{" "}
                        gagné{h.reward_claimed_count > 1 ? "s" : ""}
                      </span>
                      <HuntStatusBadge status={h.status} />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
