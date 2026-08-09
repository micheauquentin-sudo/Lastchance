import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/csv";
import {
  applyParticipationFilters,
  parseParticipationFilters,
  resolvePrizeIds,
} from "../filters";

/**
 * Export CSV (RLS : limité à l'org du commerçant).
 * - défaut : participations, AVEC les filtres de l'écran (recherche, statut,
 *   campagne, lot, période) — le lien est posé sous une liste filtrée, un
 *   fichier qui contiendrait tout le reste serait un piège silencieux.
 * - ?type=newsletter : abonnés newsletter collectés avant le jeu (population
 *   distincte : les filtres de la liste ne s'y appliquent pas).
 */
export async function GET(request: Request) {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization || role !== "owner") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = await createClient();

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
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
  const filtres = parseParticipationFilters({
    campaign: url.searchParams.get("campaign") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    statut: url.searchParams.get("statut") ?? undefined,
    du: url.searchParams.get("du") ?? undefined,
    au: url.searchParams.get("au") ?? undefined,
    lot: url.searchParams.get("lot") ?? undefined,
  });
  // Fuseau de l'établissement : les bornes `du`/`au` sont des jours CIVILS.
  // L'export doit les interpréter comme la page, sinon il rendrait un jour de
  // décalage sur les lignes de fin de soirée.
  const fuseau = organization.timezone ?? "Europe/Paris";
  const prizeIds = filtres.lot
    ? await resolvePrizeIds(supabase, organization.id, filtres.lot)
    : undefined;

  const query = supabase
    .from("participations")
    .select(
      "created_at, first_name, email, phone, marketing_opt_in, redeem_code, redeemed_at, prizes!participations_prize_id_fkey(label), campaigns!participations_campaign_id_fkey(name)",
    )
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(10000);
  // Effet de bord assumé : le builder PostgREST mute et se rend lui-même.
  applyParticipationFilters(query, filtres, fuseau, prizeIds);
  const { data: rows, error } = await query;

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
