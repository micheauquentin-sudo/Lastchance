import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/csv";

/**
 * Export CSV (RLS : limité à l'org du commerçant).
 * - défaut : participations
 * - ?type=newsletter : abonnés newsletter collectés avant le jeu
 */
export async function GET(request: Request) {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization || role !== "owner") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = await createClient();

  const type = new URL(request.url).searchParams.get("type");
  if (type === "newsletter") {
    const { data: subs, error } = await supabase
      .from("newsletter_subscribers")
      .select("created_at, email, source")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(10000);

    if (error) {
      console.error("[newsletter] export:", error.message);
      return NextResponse.json({ error: "Export impossible" }, { status: 500 });
    }

    const csv =
      "﻿" +
      [
        ["date", "email", "source"].join(";"),
        ...(subs ?? []).map((s) =>
          [csvCell(s.created_at), csvCell(s.email), csvCell(s.source)].join(";"),
        ),
      ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="newsletter-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const { data: rows, error } = await supabase
    .from("participations")
    .select(
      "created_at, first_name, email, phone, marketing_opt_in, redeem_code, redeemed_at, prizes(label), campaigns(name)",
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
    "telephone",
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
      csvCell(r.created_at),
      csvCell(r.first_name ?? ""),
      csvCell(r.email ?? ""),
      csvCell(r.phone ?? ""),
      r.marketing_opt_in ? "oui" : "non",
      csvCell(prize),
      csvCell(campaign),
      csvCell(r.redeem_code ?? ""),
      csvCell(r.redeemed_at ?? ""),
    ].join(";");
  });

  // BOM UTF-8 pour Excel
  const csv = "﻿" + [header, ...lines].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="participations-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
