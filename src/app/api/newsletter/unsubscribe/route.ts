import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let token: string | null = new URL(request.url).searchParams.get("token");

  if (!token && contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    token = typeof form.get("token") === "string" ? String(form.get("token")) : null;
  }

  const subscriberId = token ? verifyUnsubscribeToken(token) : null;
  if (!subscriberId) {
    return NextResponse.json(
      { error: "Lien de désinscription invalide" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("newsletter_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("id", subscriberId)
    .is("unsubscribed_at", null);

  if (error) {
    return NextResponse.json(
      { error: "Désinscription temporairement impossible" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return new NextResponse(
      "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><title>Désinscription</title><body><p>Vous êtes désinscrit(e). Vous pouvez fermer cette page.</p></body></html>",
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
