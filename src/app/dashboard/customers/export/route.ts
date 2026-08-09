import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/csv";
import { parseCustomerFilters } from "../filters";

/**
 * Export CSV de la liste Clients — miroir de
 * `/dashboard/participations/export` : même garde (propriétaire uniquement),
 * même BOM UTF-8 pour Excel, mêmes en-têtes de réponse.
 *
 * Il applique LES MÊMES FILTRES que l'écran, tri compris, en réutilisant
 * `parseCustomerFilters` et la RPC `org_customer_profiles_page`. Exporter la
 * liste entière depuis un écran filtré serait un piège silencieux : le fichier
 * ne ressemblerait pas à ce qui est affiché.
 *
 * Le TÉLÉPHONE n'est pas exporté, comme il n'est pas affiché : la RPC le
 * cherche (`p_q`) sans le rendre, c'est une décision d'exposition de données
 * personnelles prise en base (20260923120000), pas un oubli.
 */
const RPC_MAX_LIMIT = 100; // plafond dur de la RPC : au-delà elle lève.
const MAX_ROWS = 10_000; // même borne que l'export des participations.

export async function GET(request: Request) {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization || role !== "owner") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filtres = parseCustomerFilters({
    q: url.searchParams.get("q") ?? undefined,
    segment: url.searchParams.get("segment") ?? undefined,
    tri: url.searchParams.get("tri") ?? undefined,
  });

  const supabase = await createClient();

  // La RPC plafonne à cent lignes par appel : on pagine jusqu'à la borne
  // d'export, dans l'ordre du tri demandé (départage par e-mail en base, donc
  // la pagination est stable — aucune ligne vue deux fois ni sautée).
  const rows: {
    email: string;
    first_name: string | null;
    wins: number;
    redeemed: number;
    first_win: string;
    last_win: string;
  }[] = [];

  for (let offset = 0; offset < MAX_ROWS; offset += RPC_MAX_LIMIT) {
    const { data, error } = await supabase.rpc("org_customer_profiles_page", {
      p_organization_id: organization.id,
      p_offset: offset,
      p_limit: RPC_MAX_LIMIT,
      p_q: filtres.q,
      p_segment: filtres.segment,
      p_tri: filtres.tri,
    });
    if (error) {
      console.error("[customers] export:", error.message);
      return NextResponse.json({ error: "Export impossible" }, { status: 500 });
    }
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < RPC_MAX_LIMIT) break;
  }

  const header = [
    "email",
    "prenom",
    "gains",
    "recuperes",
    "premier_gain",
    "dernier_gain",
  ].join(";");

  const lines = rows.map((r) =>
    [
      csvCell(r.email),
      csvCell(r.first_name ?? ""),
      csvCell(r.wins),
      csvCell(r.redeemed),
      csvCell(r.first_win),
      csvCell(r.last_win),
    ].join(";"),
  );

  // BOM UTF-8 pour Excel
  const csv = "﻿" + [header, ...lines].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clients-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
