import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasLoyaltyAccess } from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { LoyaltyStatusBadge } from "@/components/dashboard/loyalty-status";
import { NewLoyaltyForm } from "@/components/dashboard/new-loyalty-form";
import type { LoyaltyProgram } from "@/types/database";

export const metadata: Metadata = { title: "Fidélité" };

const MODE_LABEL = {
  rotating_code: "Code au comptoir",
  staff: "Validation en caisse",
} as const;

export default async function LoyaltyPage() {
  const { organization, role } = await getUserAndOrg();
  const supabase = await createClient();

  // Module en option : sans l'addon, la page présente l'offre au lieu de la
  // liste (miroir de la gate Chasse au trésor).
  if (!hasLoyaltyAccess(organization!)) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-8">Fidélité</h1>
        <Card className="text-center py-12">
          <div className="text-5xl mb-4">🎟️</div>
          <h2 className="text-lg font-bold text-k-ink mb-2">
            Transformez les visites en habitudes
          </h2>
          <p className="text-zinc-500 max-w-lg mx-auto mb-4">
            Un passeport de fidélité ludique : vos clients cumulent des visites,
            montent en niveau (bronze, argent, or) et débloquent des paliers —
            un lot à retirer en caisse ou un tour de roue offert.
          </p>
          <div className="mx-auto max-w-md rounded-xl border-2 border-dashed border-zinc-300 px-4 py-3 mb-3">
            <p className="text-sm font-bold text-k-ink">
              Option à activer sur votre abonnement
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Validation par code tournant au comptoir ou par scan en caisse,
              niveaux et paliers personnalisables.
            </p>
          </div>
          <p className="text-sm text-zinc-500">
            Contactez-nous pour l&apos;activer sur votre compte.
          </p>
        </Card>
      </div>
    );
  }

  const [{ data: programs }, { data: milestoneRows }, { data: memberRows }] =
    await Promise.all([
      supabase
        .from("loyalty_programs")
        .select(
          "id, name, status, validation_mode, silver_threshold, gold_threshold, created_at",
        )
        .eq("organization_id", organization!.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("loyalty_milestones")
        .select("program_id")
        .eq("organization_id", organization!.id),
      role === "owner"
        ? supabase
            .from("loyalty_members")
            .select("program_id, tier")
            .eq("organization_id", organization!.id)
        : Promise.resolve({
            data: [] as Array<{ program_id: string; tier: string }>,
          }),
    ]);

  const programList = (programs ?? []) as Array<
    Pick<
      LoyaltyProgram,
      "id" | "name" | "status" | "validation_mode" | "created_at"
    >
  >;

  const milestoneCount = new Map<string, number>();
  for (const row of milestoneRows ?? []) {
    milestoneCount.set(row.program_id, (milestoneCount.get(row.program_id) ?? 0) + 1);
  }
  const memberCount = new Map<string, number>();
  const tierCount = new Map<string, number>();
  for (const row of memberRows ?? []) {
    memberCount.set(row.program_id, (memberCount.get(row.program_id) ?? 0) + 1);
    if (row.tier === "silver" || row.tier === "gold") {
      tierCount.set(row.program_id, (tierCount.get(row.program_id) ?? 0) + 1);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Fidélité</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            Des passeports de fidélité : cumul de visites, niveaux et paliers à
            débloquer.
          </p>
        </div>
        <NewLoyaltyForm />
      </div>

      {!programList.length ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">
            Aucun programme pour l&apos;instant. Créez le premier !
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {programList.map((p) => {
            const paliers = milestoneCount.get(p.id) ?? 0;
            const passports = memberCount.get(p.id) ?? 0;
            const levels = tierCount.get(p.id) ?? 0;
            return (
              <li key={p.id}>
                <Link
                  href={`/dashboard/loyalty/${p.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="text-2xl" aria-hidden>
                        🎟️
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{p.name}</p>
                        <p className="text-sm text-zinc-500 mt-0.5">
                          {paliers} palier{paliers > 1 ? "s" : ""} ·{" "}
                          {MODE_LABEL[p.validation_mode]} · créé le{" "}
                          {formatDate(p.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {role === "owner" && (
                        <span className="text-sm text-zinc-500">
                          <span className="font-semibold text-zinc-900">
                            {passports}
                          </span>{" "}
                          passeport{passports > 1 ? "s" : ""}
                          {levels > 0 && (
                            <>
                              {" · "}
                              <span className="font-semibold text-zinc-900">
                                {levels}
                              </span>{" "}
                              niveau{levels > 1 ? "x" : ""}
                            </>
                          )}
                        </span>
                      )}
                      <LoyaltyStatusBadge status={p.status} />
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
