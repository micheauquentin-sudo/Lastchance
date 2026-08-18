import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RedeemButton } from "@/components/dashboard/redeem-button";
import { CancelParticipationButton } from "@/components/dashboard/cancel-participation";
import type { Campaign } from "@/types/database";
import { Pagination } from "@/components/dashboard/pagination";
import { couperPage } from "@/components/dashboard/module-list-filters";
import { parsePageParam } from "@/lib/pagination";
import {
  STATUTS,
  applyParticipationFilters,
  parseParticipationFilters,
  participationFiltresActifs,
  participationSearchParams,
  resolvePrizeIds,
} from "./filters";

export const metadata: Metadata = { title: "Participations" };

interface ParticipationRow {
  id: string;
  created_at: string;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  marketing_opt_in: boolean;
  redeem_code: string | null;
  redeemed_at: string | null;
  redeem_expires_at: string | null;
  cancelled_at: string | null;
  basket_cents: number | null;
  prizes: { label: string } | null;
  campaigns: { name: string } | null;
}

interface FunnelRow {
  spins_total: number;
  wins: number;
  claimed: number;
  redeemed: number;
  expired: number;
  cancelled: number;
  /**
   * Montants : `null` pour un CAISSIER. La RPC ne les renvoie qu'à l'éditeur
   * et au propriétaire, comme la policy `prizes: editors` et le reste de
   * l'interface — un caissier ne doit pas lire la marge du commerçant. `null`
   * et non `0`, parce qu'un zéro se lirait comme une mesure là où il s'agit
   * d'une absence de droit.
   */
  basket_revenue_cents: number | null;
  redeemed_cost_cents: number | null;
  redeemed_value_cents: number | null;
}

const euros = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const pct = (num: number, den: number) =>
  den > 0 ? `${Math.round((num / den) * 100)} %` : "—";

/** Échéance serveur dépassée (le retrait serait refusé par la RPC). */
const isCodeExpired = (row: Pick<ParticipationRow, "redeem_expires_at">) =>
  row.redeem_expires_at !== null &&
  new Date(row.redeem_expires_at).getTime() <= Date.now();

export default async function ParticipationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    campaign?: string;
    q?: string;
    statut?: string;
    du?: string;
    au?: string;
    lot?: string;
    page?: string;
  }>;
}) {
  const brut = await searchParams;
  const page = parsePageParam(brut.page);
  const pageSize = 50;
  const filtres = parseParticipationFilters(brut);
  const { organization, role } = await getUserAndOrg();
  // Fuseau de l'établissement : sans lui, l'affichage retombe sur celui du
  // serveur (UTC en production) et montre souvent le mauvais jour.
  const fuseau = organization?.timezone ?? "Europe/Paris";
  if (role !== "owner") redirect("/dashboard/redeem");
  const supabase = await createClient();

  // Le filtre porte sur le LIBELLÉ du lot — ce que le commerçant lit dans la
  // colonne « Lot » — et un même libellé existe en autant de lignes `prizes`
  // qu'il y a de roues : il faut donc résoudre ses identifiants avant de
  // construire la requête. Une seule requête bornée, et seulement si le filtre
  // est actif.
  const prizeIds = filtres.lot
    ? await resolvePrizeIds(supabase, organization!.id, filtres.lot)
    : undefined;

  const query = supabase
    .from("participations")
    .select(
      "id, created_at, first_name, email, phone, marketing_opt_in, redeem_code, redeemed_at, redeem_expires_at, cancelled_at, basket_cents, prizes!participations_prize_id_fkey(label), campaigns!participations_campaign_id_fkey(name)",
    )
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false })
    // UNE LIGNE DE PLUS QUE LA PAGE, ET PAS DE `count: "exact"`.
    //
    // Le total n'était affiché nulle part : il ne servait qu'à savoir s'il
    // existait une page suivante — un balayage complet de `participations`,
    // filtres compris, à chaque affichage, pour une seule comparaison. Le motif
    // « une ligne de plus » est celui des huit autres listes du dashboard
    // (`couperPage`). Aucune information ne disparaît de l'écran.
    .range((page - 1) * pageSize, page * pageSize);
  // Effet de bord assumé : le builder PostgREST mute et se rend lui-même (voir
  // le commentaire d'`applyParticipationFilters`). `query` reste la requête.
  applyParticipationFilters(query, filtres, fuseau, prizeIds);

  // Les requêtes sont indépendantes : un seul aller-retour de latence.
  const [
    { data: campaigns },
    { data },
    { count: newsletterCount },
    { data: funnelRows },
    { data: lotRows },
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("organization_id", organization!.id)
      .order("created_at", { ascending: false }),
    query,
    supabase
      .from("newsletter_subscribers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization!.id)
      .is("unsubscribed_at", null),
    // Entonnoir gagné → réclamé → retiré + revenu attribuable (30 j).
    supabase.rpc("org_prize_funnel", {
      p_organization_id: organization!.id,
      p_days: 30,
    }),
    // Libellés de lots proposés au filtre. Un SELECT de libellés, borné et
    // dédoublonné côté client — et non un champ texte libre : le commerçant
    // choisit dans ce qu'il a créé, il ne devine pas l'orthographe exacte. Le
    // volume le permet (un lot par segment de roue, quelques dizaines de
    // lignes) ; la borne de 500 est là pour l'organisation pathologique, qui
    // verra une liste tronquée plutôt qu'une page lente.
    supabase
      .from("prizes")
      .select("label")
      .eq("organization_id", organization!.id)
      .order("label", { ascending: true })
      .limit(500),
  ]);

  const { lignes: rows, hasNext } = couperPage(
    (data ?? []) as unknown as ParticipationRow[],
    pageSize,
  );
  const campaignList = (campaigns ?? []) as Pick<Campaign, "id" | "name">[];
  const lotLabels = [...new Set((lotRows ?? []).map((p) => p.label))];
  // L'export reprend les filtres de l'écran : sans eux, le lien « Exporter en
  // CSV » posé sous une liste filtrée rendait un fichier de TOUT, sans le dire.
  const exportQuery = new URLSearchParams(
    Object.entries(participationSearchParams(filtres)).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();
  const funnel = ((funnelRows ?? []) as FunnelRow[])[0] ?? null;
  // Un caissier n'a pas accès aux montants : la RPC les rend `null`. On masque
  // alors la tuile économique au lieu d'afficher un « 0,00 € » trompeur.
  const montants =
    funnel &&
    funnel.basket_revenue_cents !== null &&
    funnel.redeemed_cost_cents !== null
      ? {
          panier: funnel.basket_revenue_cents,
          cout: funnel.redeemed_cost_cents,
        }
      : null;
  const roi =
    montants && montants.cout > 0
      ? Math.round(((montants.panier - montants.cout) / montants.cout) * 100)
      : null;

  return (
    <div>
      <PageHeader
        surtitre="Gestion"
        titre="Participations"
        sousTitre="Vérifiez un code et validez la remise du gain."
        actions={
          <a
            href={`/dashboard/participations/export${exportQuery ? `?${exportQuery}` : ""}`}
            className="text-sm font-semibold text-k-orange-text hover:underline"
          >
            Exporter en CSV
          </a>
        }
      />

      {funnel && funnel.spins_total > 0 && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="w-fit border-b-4 border-k-yellow pb-0.5 text-lg font-black">
              Cycle du gain (30 jours)
            </h2>
            {roi !== null ? (
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${roi >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
              >
                ROI estimé : {roi > 0 ? "+" : ""}
                {roi} %
              </span>
            ) : (
              <span className="text-xs text-k-muted">
                ROI : renseignez le coût des lots (éditeur de roue)
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-2xl font-bold">{funnel.wins}</p>
              <p className="text-xs text-zinc-500">
                gagnés · {pct(funnel.wins, funnel.spins_total)} des{" "}
                {funnel.spins_total} tours
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold">{funnel.claimed}</p>
              <p className="text-xs text-zinc-500">
                réclamés · {pct(funnel.claimed, funnel.wins)} des gagnés
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold">{funnel.redeemed}</p>
              <p className="text-xs text-zinc-500">
                retirés · {pct(funnel.redeemed, funnel.claimed)} des réclamés
                {funnel.expired > 0 && ` · ${funnel.expired} expirés`}
                {funnel.cancelled > 0 && ` · ${funnel.cancelled} annulés`}
              </p>
            </div>
            {montants && (
              <div>
                <p className="text-2xl font-bold">{euros(montants.panier)}</p>
                <p className="text-xs text-zinc-500">
                  paniers en caisse · coût des lots retirés{" "}
                  {euros(montants.cout)}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {(newsletterCount ?? 0) > 0 && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-semibold">{newsletterCount}</span>{" "}
            abonné{(newsletterCount ?? 0) > 1 ? "s" : ""} à la newsletter via
            la roue.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/newsletter"
              className="text-sm font-semibold text-k-orange-text hover:underline"
            >
              Envoyer un email →
            </Link>
            <a
              href="/dashboard/participations/export?type=newsletter"
              className="text-sm font-semibold text-k-orange-text hover:underline"
            >
              Exporter les emails
            </a>
          </div>
        </Card>
      )}

      <form method="get" className="flex flex-wrap items-center gap-3 mb-6">
        <label className="sr-only" htmlFor="parts-q">
          Rechercher une participation
        </label>
        <input
          id="parts-q"
          name="q"
          defaultValue={filtres.q ?? ""}
          placeholder="Code, prénom ou email…"
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <label className="sr-only" htmlFor="parts-statut">
          Statut
        </label>
        <select
          id="parts-statut"
          name="statut"
          defaultValue={filtres.statut ?? ""}
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="">Tous les statuts</option>
          {STATUTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="parts-campaign">
          Campagne
        </label>
        <select
          id="parts-campaign"
          name="campaign"
          defaultValue={filtres.campaign ?? ""}
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="">Toutes les campagnes</option>
          {campaignList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {lotLabels.length > 0 && (
          <>
            <label className="sr-only" htmlFor="parts-lot">
              Lot
            </label>
            <select
              id="parts-lot"
              name="lot"
              defaultValue={filtres.lot ?? ""}
              className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Tous les lots</option>
              {lotLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="flex items-center gap-2 text-sm text-zinc-500">
          <label htmlFor="parts-du">Du</label>
          <input
            id="parts-du"
            type="date"
            name="du"
            defaultValue={filtres.du ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <label htmlFor="parts-au">au</label>
          <input
            id="parts-au"
            type="date"
            name="au"
            defaultValue={filtres.au ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </span>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 text-white text-sm font-semibold px-4 py-2.5 hover:bg-zinc-700"
        >
          Filtrer
        </button>
        {participationFiltresActifs(filtres) && (
          <Link
            href="/dashboard/participations"
            className="self-center text-sm text-zinc-500 hover:text-zinc-900"
          >
            Réinitialiser
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">Aucune participation trouvée.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Lot</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Opt-in</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-500">
                    {formatDate(row.created_at, fuseau)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.first_name ?? "Anonyme"}</p>
                    {row.email && (
                      <p className="text-zinc-500 text-xs">{row.email}</p>
                    )}
                    {row.phone && (
                      <p className="text-zinc-500 text-xs">{row.phone}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.prizes?.label ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.redeem_code ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.marketing_opt_in ? (
                      <span className="text-emerald-600 font-medium">Oui</span>
                    ) : (
                      <span className="text-k-muted">Non</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.cancelled_at ? (
                      <span className="inline-flex rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 whitespace-nowrap">
                        Annulé {formatDate(row.cancelled_at, fuseau)}
                      </span>
                    ) : row.redeemed_at ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 whitespace-nowrap">
                        Récupéré {formatDate(row.redeemed_at, fuseau)}
                        {row.basket_cents !== null &&
                          ` · ${euros(row.basket_cents)}`}
                      </span>
                    ) : isCodeExpired(row) ? (
                      <>
                        <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 whitespace-nowrap">
                          Expiré {formatDate(row.redeem_expires_at!, fuseau)}
                        </span>
                        <div className="mt-1">
                          <CancelParticipationButton id={row.id} />
                        </div>
                      </>
                    ) : (
                      <>
                        <RedeemButton id={row.id} compact />
                        <div className="mt-1">
                          <CancelParticipationButton id={row.id} />
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        hasNext={hasNext}
        params={participationSearchParams(filtres)}
      />
    </div>
  );
}
