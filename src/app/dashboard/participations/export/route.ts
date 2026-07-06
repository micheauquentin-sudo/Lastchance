import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function csvEscape(value: string): string {
  if (/[",\n;]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

/** Export CSV des participations (RLS : limité à l'org du commerçant). */
export async function GET() {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("participations")
    .select(
      "created_at, first_name, email, marketing_opt_in, redeem_code, redeemed_at, prizes(label), campaigns(name)",
    )
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(10000);

  if (error) {
    console.error("[participations] export:", error.message);
    return NextResponse.json({ error: "Export impossible" }, { status: 500 });
  }

  const header = [
    "date",
    "prenom",
    "email",
    "optin_marketing",
    "lot",
    "campagne",
    "code",
    "recupere_le",
  ].join(";");

  const lines = (rows ?? []).map((r) => {
    const prize = (r.prizes as unknown as { label: string } | null)?.label ?? "";
    const campaign =
      (r.campaigns as unknown as { name: string } | null)?.name ?? "";
    return [
      r.created_at,
      csvEscape(r.first_name),
      csvEscape(r.email),
      r.marketing_opt_in ? "oui" : "non",
      csvEscape(prize),
      csvEscape(campaign),
      r.redeem_code ?? "",
      r.redeemed_at ?? "",
    ].join(";");
  });

  // BOM UTF-8 pour Excel
  const csv = "﻿" + [header, ...lines].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="participations-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
