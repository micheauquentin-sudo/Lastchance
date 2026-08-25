import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import type { CustomerProfile } from "@/types/database";
import { Pagination } from "@/components/dashboard/pagination";
import { parsePageParam } from "@/lib/pagination";
import {
  CUSTOMER_PAGE_SIZE,
  SEGMENTS,
  TRIS,
  customerBadges,
  customerFiltersActifs,
  customerSearchParams,
  parseCustomerFilters,
} from "./filters";

export const metadata: Metadata = { title: "Clients" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; segment?: string; tri?: string }>;
}) {
  const { page: rawPage, q, segment, tri } = await searchParams;
  const page = parsePageParam(rawPage);
  const filtres = parseCustomerFilters({ q, segment, tri });
  const pageSize = CUSTOMER_PAGE_SIZE;
  const { organization, role } = await getUserAndOrg();
  // Fuseau de l'établissement : sans lui, l'affichage retombe sur celui du
  // serveur (UTC en production) et montre souvent le mauvais jour.
  const fuseau = organization?.timezone ?? "Europe/Paris";
  if (role !== "owner") redirect("/dashboard/redeem");
  const supabase = await createClient();

  const [{ data, error }, { data: segmentData }] = await Promise.all([
    supabase.rpc("org_customer_profiles_page", {
      p_organization_id: organization!.id,
      p_offset: (page - 1) * pageSize,
      p_limit: pageSize,
      p_q: filtres.q,
      p_segment: filtres.segment,
      p_tri: filtres.tri,
    }),
    supabase.rpc("org_segment_counts", { p_organization_id: organization!.id }),
  ]);
  if (error) console.error("[customers] org_customer_profiles:", error.message);

  const profiles = (data ?? []) as (CustomerProfile & { total_count: number })[];
  const totalCount = profiles[0]?.total_count ?? 0;
  const rows = profiles.map((p) => ({ profile: p, badges: customerBadges(p) }));
  // ⚠ Ce compteur porte sur une AUTRE population que la liste : il compte des
  // ABONNÉS newsletter à relancer, là où le tableau liste des JOUEURS ayant
  // gagné. Les deux nombres n'ont aucune raison d'être égaux (un joueur non
  // abonné est dans la liste et hors du compteur, un abonné qui n'a jamais joué
  // l'inverse) — le libellé doit donc dire « abonnés », jamais « clients », et
  // ce chiffre n'est en aucun cas le total de la liste filtrée.
  const comptes = (segmentData ?? [])[0] as
    | { inactive_count?: number; reserve_count?: number; venu_count?: number }
    | undefined;
  const inactiveCount = comptes?.inactive_count ?? 0;
  // MÊME POPULATION QUE `inactiveCount`, donc même précaution de vocabulaire :
  // ce sont des ABONNÉS newsletter ayant réservé (ou étant venus), et non les
  // clients de la liste ci-dessous. La phrase le dit en toutes lettres — un
  // « 12 ont réservé » posé à côté d'un tableau de joueurs se lirait comme le
  // sous-total du tableau, ce qu'il n'est jamais.
  const reserveCount = comptes?.reserve_count ?? 0;
  const venuCount = comptes?.venu_count ?? 0;
  const params = customerSearchParams(filtres);
  const exportQuery = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  return (
    <div>
      <PageHeader
        surtitre="Gestion"
        titre="Clients"
        sousTitre="Les clients identifiés après un gain ou un opt-in Calendrier."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            <a
              href={`/dashboard/customers/export${exportQuery ? `?${exportQuery}` : ""}`}
              className="text-sm font-semibold text-k-orange-text hover:underline"
            >
              Exporter en CSV
            </a>
            {inactiveCount > 0 && (
              <Link
                href="/dashboard/newsletter"
                className="text-sm font-semibold text-k-orange-text hover:underline"
              >
                {inactiveCount} abonné{inactiveCount > 1 ? "s" : ""} newsletter à
                relancer →
              </Link>
            )}
          </div>
        }
      />

      <form method="get" className="flex flex-wrap gap-3 mb-6">
        <label className="sr-only" htmlFor="clients-q">
          Rechercher un client
        </label>
        <input
          id="clients-q"
          name="q"
          defaultValue={filtres.q ?? ""}
          placeholder="Prénom, email ou téléphone…"
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <label className="sr-only" htmlFor="clients-segment">
          Segment
        </label>
        <select
          id="clients-segment"
          name="segment"
          defaultValue={filtres.segment ?? ""}
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="">Tous les segments</option>
          {SEGMENTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="clients-tri">
          Trier par
        </label>
        <select
          id="clients-tri"
          name="tri"
          defaultValue={filtres.tri}
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          {TRIS.map((t) => (
            <option key={t.value} value={t.value}>
              Trier par : {t.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 text-white text-sm font-semibold px-4 py-2.5 hover:bg-zinc-700"
        >
          Filtrer
        </button>
        {customerFiltersActifs(filtres) && (
          <Link
            href="/dashboard/customers"
            className="self-center text-sm font-bold text-k-body hover:text-k-ink"
          >
            Réinitialiser
          </Link>
        )}
      </form>

      {reserveCount > 0 || venuCount > 0 ? (
        <p className="-mt-3 mb-6 text-sm text-zinc-600">
          Parmi vos abonnés newsletter :{" "}
          <span className="font-semibold text-zinc-700 tabular-nums">
            {reserveCount}
          </span>{" "}
          {reserveCount > 1 ? "ont réservé" : "a réservé"},{" "}
          <span className="font-semibold text-zinc-700 tabular-nums">
            {venuCount}
          </span>{" "}
          {venuCount > 1 ? "sont venus" : "est venu"}.
        </p>
      ) : null}

      {profiles.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">
            {customerFiltersActifs(filtres)
              ? "Aucun client ne correspond à ces filtres."
              : "Aucun client identifié pour l'instant — un gain avec email ou un opt-in Calendrier les fera apparaître ici."}
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Gains</th>
                <th className="px-4 py-3">Récupérés</th>
                <th className="px-4 py-3">1er gain</th>
                <th className="px-4 py-3">Dernier gain</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ profile: p, badges }) => (
                <tr key={p.email} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3">
                    {/* `first_name` est NULLABLE depuis VIT-4 : la RPC part
                        désormais aussi de profils sans prénom. `||` et non
                        `??` — une chaîne vide doit rendre le tiret elle
                        aussi, et c'est déjà ce que faisait cette ligne. */}
                    <p className="font-medium text-zinc-900">{p.first_name || "—"}</p>
                    <p className="text-zinc-500 text-xs">{p.email}</p>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.wins}</td>
                  <td className="px-4 py-3 tabular-nums">{p.redeemed}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {p.first_win ? formatDate(p.first_win, fuseau) : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {p.last_win ? formatDate(p.last_win, fuseau) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {badges.map((b) => (
                        <span
                          key={b.label}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${b.className}`}
                        >
                          {b.label}
                        </span>
                      ))}
                      {/* LES DEUX FAITS « RÉSERVER » (VIT-4) sont RENDUS par la
                          RPC, jamais dérivés ici : contrairement aux trois
                          pastilles ci-dessus, ils ne se déduisent ni de `wins`
                          ni de `last_win`. Ils s'ajoutent aux autres au lieu de
                          les remplacer — un fidèle qui est venu est les deux, et
                          le filtre les traite déjà sans priorité. */}
                      {p.a_reserve ? (
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                          A réservé
                        </span>
                      ) : null}
                      {p.est_venu ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          Est venu
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} hasNext={totalCount > page * pageSize} params={params} />
    </div>
  );
}
