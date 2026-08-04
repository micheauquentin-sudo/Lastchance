import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { LoyaltyStatusBadge } from "@/components/dashboard/loyalty-status";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
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

  // Découvrir / préparer / publier (cahier §3).
  const capacites = await capacitesDuModule("loyalty");
  if (!capacites.canExplore) notFound();

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
        {capacites.canEditDraft ? <NewLoyaltyForm /> : null}
      </div>

      <ModuleCapabilityNotice capacites={capacites} entitlement="loyalty">
        Validation par code tournant au comptoir ou par scan en caisse, niveaux
        et paliers personnalisables.
      </ModuleCapabilityNotice>

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
