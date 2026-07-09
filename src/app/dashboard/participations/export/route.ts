import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

function csvResponse(filenamePrefix: string, csv: string): NextResponse {
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenamePrefix}-${date}.csv"`,
    },
  });
}

/**
 * Export CSV (RLS : limité à l'org du commerçant).
 * - défaut : participations
 * - ?type=newsletter : abonnés newsletter collectés avant le jeu
 */
export async function GET(request: Request) {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) {
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

    const csv = toCsv(
      ["date", "email", "source"],
      (subs ?? []).map((s) => [s.created_at, s.email, s.source]),
    );
    return csvResponse("newsletter", csv);
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

  const csv = toCsv(
    [
      "date",
      "prenom",
      "email",
      "telephone",
      "optin_marketing",
      "lot",
      "campagne",
      "code",
      "recupere_le",
    ],
    (rows ?? []).map((r) => [
      r.created_at,
      r.first_name ?? "",
      r.email ?? "",
      r.phone ?? "",
      r.marketing_opt_in ? "oui" : "non",
      r.prizes?.label ?? "",
      r.campaigns?.name ?? "",
      r.redeem_code ?? "",
      r.redeemed_at ?? "",
    ]),
  );
  return csvResponse("participations", csv);
}
