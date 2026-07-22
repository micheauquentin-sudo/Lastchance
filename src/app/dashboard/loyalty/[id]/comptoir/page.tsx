import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { getLoyaltyCounterCode } from "@/actions/loyalty";
import { createClient } from "@/lib/supabase/server";
import { hasLoyaltyAccess } from "@/lib/subscription";
import { LoyaltyCounterScreen } from "@/components/dashboard/loyalty-counter-screen";

export const metadata: Metadata = { title: "Écran comptoir — Fidélité" };

/**
 * Écran comptoir du code tournant. Réservé au propriétaire / éditeur, et
 * uniquement pour les programmes en mode rotating_code (le seul qui affiche
 * un code au comptoir). Le code courant est renvoyé par une Server Action
 * authentifiée ; le secret ne quitte jamais le serveur.
 */
export default async function LoyaltyCounterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization, role } = await getUserAndOrg();
  if (!organization || !hasLoyaltyAccess(organization)) notFound();
  if (role !== "owner" && role !== "editor") notFound();

  const supabase = await createClient();
  const { data: program } = await supabase
    .from("loyalty_programs")
    .select("id, name, validation_mode, status, rotating_period_seconds")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!program || program.validation_mode !== "rotating_code") notFound();

  const counter = await getLoyaltyCounterCode(program.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/dashboard/loyalty/${program.id}`}
            className="text-sm text-zinc-500 hover:text-k-ink"
          >
            ← {program.name}
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Écran comptoir</h1>
        </div>
        {program.status !== "active" && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            Programme non actif — code de démonstration
          </span>
        )}
      </div>

      <p className="max-w-2xl text-sm text-zinc-600">
        Affichez cet écran face aux clients (tablette, second écran). Ils
        saisissent le code sur leur passeport pour valider leur visite. Le code
        change tout seul à chaque rotation — inutile de le communiquer autrement.
      </p>

      <LoyaltyCounterScreen
        programId={program.id}
        programName={program.name}
        periodSeconds={counter?.periodSeconds ?? program.rotating_period_seconds}
        initialCode={counter?.code ?? null}
      />
    </div>
  );
}
