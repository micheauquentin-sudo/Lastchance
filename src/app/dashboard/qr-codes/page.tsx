import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/env";
import { sanitizeSearchTerm } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { NewQrForm } from "@/components/dashboard/qr-forms";
import { QrCodeCard } from "@/components/dashboard/qr-code-card";
import type { Campaign, QrCode } from "@/types/database";
import { Pagination } from "@/components/dashboard/pagination";

export const metadata: Metadata = { title: "QR codes" };

/**
 * Le QR tel que la page le lit : la ligne, plus le NOM de sa campagne rapporté
 * par la jointure.
 *
 * Le nom venait d'une Map bâtie sur la liste des campagnes du formulaire de
 * création — laquelle exclut les archivées. Tout QR d'un jeu clôturé
 * s'affichait donc « Campagne supprimée » alors que la campagne existe : le
 * commerçant croyait ses affiches orphelines. La jointure dit la vérité, quel
 * que soit le statut ; « Campagne supprimée » redevient ce qu'il prétend être,
 * le cas où la FK ne ramène rien.
 */
type QrAvecCampagne = QrCode & { campaigns: { name: string } | null };

type CampagneFiltrable = Pick<Campaign, "id" | "name" | "status">;

export default async function QrCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; q?: string; page?: string }>;
}) {
  const {
    campaign: campaignFilter,
    q,
    page: rawPage,
  } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const pageSize = 24;
  const { organization } = await getUserAndOrg();
  const supabase = await createClient();
  const terme = q ? sanitizeSearchTerm(q) : "";

  const [{ data: campaigns }, qrQuery] = await Promise.all([
    // TOUTES les campagnes, archivées comprises : la liste sert à la fois le
    // menu de création (qui écarte les archivées) et le menu de filtre (qui
    // doit pouvoir garder une archivée déjà sélectionnée).
    supabase
      .from("campaigns")
      .select("id, name, status")
      .eq("organization_id", organization!.id)
      .order("created_at", { ascending: false }),
    (() => {
      let requete = supabase
        .from("qr_codes")
        .select("*, campaigns!qr_codes_campaign_id_fkey(name, status)")
        .eq("organization_id", organization!.id)
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize);
      if (campaignFilter) requete = requete.eq("campaign_id", campaignFilter);
      // Recherche libre sur ce qui est écrit sur l'affiche : le libellé posé
      // par le commerçant, ou le slug qu'il lit dans l'URL.
      if (terme) {
        requete = requete.or(`label.ilike.%${terme}%,slug.ilike.%${terme}%`);
      }
      return requete;
    })(),
  ]);

  const qrCodes = (qrQuery.data ?? []) as QrAvecCampagne[];
  const hasNext = qrCodes.length > pageSize;
  if (hasNext) qrCodes.pop();
  const toutesCampagnes = (campaigns ?? []) as CampagneFiltrable[];
  /** Menu de CRÉATION : on ne fabrique pas un QR pour un jeu clôturé. */
  const campaignList = toutesCampagnes.filter((c) => c.status !== "archived");
  /**
   * Menu de FILTRE : les mêmes, plus la campagne archivée sur laquelle le
   * filtre porte déjà. Sans elle, le `<select>` retomberait silencieusement
   * sur « Toutes les campagnes » alors que la liste reste filtrée — l'écran
   * mentirait sur ce qu'il montre.
   */
  const campagneArchiveeFiltree =
    campaignFilter &&
    toutesCampagnes.find(
      (c) => c.id === campaignFilter && c.status === "archived",
    );
  const campagnesDuFiltre = campagneArchiveeFiltree
    ? [...campaignList, campagneArchiveeFiltree]
    : campaignList;
  const filtreActif = Boolean(campaignFilter || q);

  return (
    <div>
      <PageHeader
        surtitre="Outils"
        titre="QR codes"
        sousTitre="Chaque QR a son studio : motifs, couleurs, dégradés, logo, cadre « Scannez-moi »… Personnalisez-le autant que vous voulez, puis imprimez-le en salle, en caisse, sur les tables."
      />

      <Card className="mb-6">
        <h2 className="mb-4 font-black text-k-ink">Nouveau QR code</h2>
        {campaignList.length === 0 ? (
          <p className="text-sm font-bold text-k-body">
            Créez d&apos;abord une campagne.
          </p>
        ) : (
          <NewQrForm
            campaigns={campaignList}
            defaultCampaignId={campaignFilter}
          />
        )}
      </Card>

      {/* Le filtre par campagne existait DÉJÀ côté requête — « Gérer tous les
          QR codes » y menait avec `?campaign=…` — mais sans aucune commande à
          l'écran : on ne pouvait ni le changer ni le lever. */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="qr-filtre-recherche"
            className="mb-1 block text-sm font-bold text-k-body"
          >
            Rechercher
          </label>
          <input
            id="qr-filtre-recherche"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Libellé ou lien…"
            className="w-56 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <label
            htmlFor="qr-filtre-campagne"
            className="mb-1 block text-sm font-bold text-k-body"
          >
            Campagne
          </label>
          <select
            id="qr-filtre-campagne"
            name="campaign"
            defaultValue={campaignFilter ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">Toutes les campagnes</option>
            {campagnesDuFiltre.map((c) => (
              <option key={c.id} value={c.id}>
                {c.status === "archived" ? `${c.name} (clôturée)` : c.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Filtrer
        </button>
        {filtreActif && (
          <Link
            href="/dashboard/qr-codes"
            className="self-center text-sm text-zinc-500 hover:text-zinc-900"
          >
            Réinitialiser
          </Link>
        )}
      </form>

      {qrCodes.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="font-bold text-k-body">
            {filtreActif
              ? "Aucun QR code ne correspond à ce filtre."
              : "Aucun QR code pour l'instant."}
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {qrCodes.map((qr) => (
            <li key={qr.id}>
              <QrCodeCard
                id={qr.id}
                slug={qr.slug}
                label={qr.label}
                campaignName={qr.campaigns?.name ?? "Campagne supprimée"}
                url={`${APP_URL}/play/${qr.slug}`}
                scanCount={qr.scan_count}
                initialStyle={qr.style ?? {}}
                posterHref={`/poster/${qr.id}`}
                testHref={`/poster/${qr.id}/qr-test`}
              />
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        hasNext={hasNext}
        params={{ campaign: campaignFilter, q }}
      />
    </div>
  );
}
