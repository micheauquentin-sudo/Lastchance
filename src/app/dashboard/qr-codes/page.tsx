import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/env";
import { hasCompAccess } from "@/lib/subscription";
import { reportError } from "@/lib/monitoring";
import { sanitizeSearchTerm } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { libelleEtat, type EtatAnimation } from "@/components/ui/status-badge";
import { NewQrForm } from "@/components/dashboard/qr-forms";
import { QrCodeCard } from "@/components/dashboard/qr-code-card";
import { JeuLienCard } from "@/components/dashboard/jeu-lien-card";
import { hrefEtapeChasse } from "@/components/dashboard/atelier-hunt-etapes";
import {
  EXPERIENCE_CATALOG,
  activeExperienceKinds,
} from "@/platform/experiences/catalog";
import type { ExperienceKind } from "@/platform/experiences/contract";
import type { Campaign, QrStyle } from "@/types/database";
import type { Json } from "@/types/database.generated";
import { Pagination } from "@/components/dashboard/pagination";

export const metadata: Metadata = { title: "QR codes" };

const PAGE_SIZE = 24;

/**
 * LE TYPE DE LA RPC, RÉÉCRIT — et ce n'est pas de la coquetterie.
 *
 * `org_qr_hub` est une fonction SQL `returns table`, et Postgres ne sait pas
 * exprimer la nullabilité d'une colonne de sortie : le générateur de types
 * déclare donc TOUT non-nullable. C'est faux pour neuf colonnes sur quatorze —
 * `url_path` est NULL pour toute chasse au trésor et tout module en brouillon,
 * `qr_*` pour les sept modules qui ne sont pas des campagnes, `open_count`
 * pour les campagnes. Faire confiance au type généré, c'est écrire
 * `url.startsWith(…)` sur un `null` et casser la page en production sans que
 * le typecheck n'ait rien vu.
 *
 * L'affectation depuis `data` ne demande aucun cast : un `string` est
 * assignable à `string | null`. On élargit, on ne force pas.
 */
type LigneHub = {
  kind: string;
  item_id: string;
  name: string | null;
  status: string;
  /** NULL = rien à imprimer : module non publié, ou chasse (affiches par étape). */
  url_path: string | null;
  open_count: number | null;
  qr_id: string | null;
  qr_slug: string | null;
  qr_label: string | null;
  qr_style: Json | null;
  scan_count: number | null;
  /** Sessions d'un événement, étapes d'une chasse. */
  extra_count: number | null;
  created_at: string;
  /** État NORMALISÉ trans-modules, calculé par la RPC (voir `ETATS_HUB`). */
  etat: string;
};

type CampagneFiltrable = Pick<Campaign, "id" | "name" | "status">;

/**
 * L'ÉTAT NORMALISÉ VIENT DE LA BASE, PLUS DE CETTE PAGE.
 *
 * `org_qr_hub` rend désormais une colonne `etat` — `brouillon | actif |
 * en_pause | termine` — dont la normalisation est écrite branche par branche
 * dans la fonction (20260923120000), là où le vocabulaire de chaque table est
 * connu. La table `status → EtatAnimation` qui vivait ici en était une SECONDE
 * copie, et elle avait déjà divergé : elle portait une entrée `scheduled` que
 * plus aucune des huit tables n'écrit, et son repli silencieux vers
 * `brouillon` masquait tout statut ajouté sans elle.
 *
 * Ce qui reste ici est la seule chose que la base ne sait pas : quel MOT le
 * commerçant lit. Il vient de `status-badge.tsx`, qui reste l'unique endroit
 * où le vocabulaire des pastilles s'écrit — le filtre de cette page emploie
 * donc exactement les libellés que portent les cartes, plutôt qu'un second jeu
 * de mots (« Actif » face à une pastille « Ouverte aux joueurs »).
 */
const ETATS_HUB = ["brouillon", "actif", "en_pause", "termine"] as const;
type EtatHub = (typeof ETATS_HUB)[number];

const PASTILLE_ETAT: Record<EtatHub, EtatAnimation> = {
  brouillon: "brouillon",
  actif: "ouverte",
  en_pause: "pause",
  termine: "cloturee",
};

/**
 * Le chemin inverse, et il ne vaut QUE pour `campaigns` : le filtre par
 * campagne n'interroge pas la RPC (voir `chargerLignes`), il interroge
 * `qr_codes` — il lui faut donc le vocable brut de cette table-là. Les sept
 * autres modules ne passent jamais par ici, et `paused` n'existe que sur
 * `campaigns` : écrire ce mapping ailleurs serait faux.
 */
const STATUT_CAMPAGNE: Record<EtatHub, string> = {
  brouillon: "draft",
  actif: "active",
  en_pause: "paused",
  termine: "archived",
};

/** Dérivé de la ligne au-dessus : une seule table à tenir à jour, pas deux. */
const ETAT_DEPUIS_CAMPAGNE: Record<string, EtatHub> = Object.fromEntries(
  Object.entries(STATUT_CAMPAGNE).map(([etat, statut]) => [statut, etat as EtatHub]),
);

/** Les types offerts au filtre : le catalogue, moins ce qui n'a pas de page joueur. */
const KINDS_FILTRABLES = EXPERIENCE_CATALOG.filter(
  // Le parrainage n'a pas de page publique à lui : son lien est PAR PARRAIN,
  // porté par le passeport du joueur. Il n'a donc rien à faire dans un hub
  // d'affiches d'établissement.
  (entry) => entry.kind !== "referral",
);

const LIBELLE_KIND = new Map(
  EXPERIENCE_CATALOG.map((entry) => [entry.kind, entry.label] as const),
);
const HREF_KIND = new Map(
  EXPERIENCE_CATALOG.map((entry) => [entry.kind, entry.dashboardHref] as const),
);

/** La page du dashboard qui gère cette ligne — pour une chasse, ses affiches. */
function hrefModule(kind: string, itemId: string): string {
  if (kind === "hunt") return hrefEtapeChasse(itemId, "affiches");
  const base = HREF_KIND.get(kind as ExperienceKind);
  return base ? `${base}/${itemId}` : "/dashboard";
}

export default async function QrCodesPage({
  searchParams,
}: {
  searchParams: Promise<{
    campaign?: string;
    type?: string;
    q?: string;
    etat?: string;
    scans?: string;
    page?: string;
  }>;
}) {
  const {
    campaign: campaignFilter,
    type: rawType,
    q,
    etat: rawEtat,
    scans: rawScans,
    page: rawPage,
  } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  /**
   * Un `etat` hors vocabulaire est IGNORÉ, pas transmis. La RPC le tolère (elle
   * rend zéro ligne sans lever), mais un écran vide sans explication est le pire
   * des deux : on retombe sur « tous les états », ce que le `<select>` montrera.
   */
  const etatFilter = (ETATS_HUB as readonly string[]).includes(rawEtat ?? "")
    ? (rawEtat as EtatHub)
    : undefined;
  const jamaisScanne = rawScans === "jamais";
  const { organization, role } = await getUserAndOrg();

  /**
   * LA PAGE CHANGE DE GARDE, ET C'EST VOULU.
   *
   * Elle rendait auparavant une liste vide pour un caissier : la RLS de
   * `qr_codes` ne lui donne rien, la requête réussissait à vide, l'écran
   * mentait par omission (« aucun QR code pour l'instant »). `org_qr_hub` est
   * `security definer` et gardée par `is_org_editor` : elle LÈVE
   * `not authorized`. Plutôt que de laisser remonter une erreur serveur sur
   * une URL tapée à la main — le menu, lui, ne montre déjà la page qu'aux
   * owner/editor —, on dit la vérité au caissier.
   */
  if (role !== "owner" && role !== "editor") {
    return (
      <div>
        <PageHeader surtitre="Outils" titre="QR codes" />
        <Card className="py-12 text-center">
          <p className="font-black text-k-ink">
            Réservé à l&apos;équipe d&apos;édition
          </p>
          <p className="mt-2 text-sm font-bold text-k-body">
            Les affiches et les liens de vos jeux sont gérés par les comptes
            propriétaire et éditeur. Votre compte caisse garde l&apos;accès à
            l&apos;encaissement des gains.
          </p>
          <Link
            href="/dashboard/redeem"
            className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
          >
            Aller à la caisse
          </Link>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  // Deux termes pour deux consommateurs : la RPC échappe elle-même son `p_q`
  // (un `%` littéral y reste littéral), l'ancienne requête construit un filtre
  // `.or()` textuel qui, lui, exige le nettoyage.
  const terme = q ? q.trim().slice(0, 80) : "";
  const termeOr = sanitizeSearchTerm(terme);

  const fullAccess = hasCompAccess(organization!);
  const kindsActifs = new Set(activeExperienceKinds(organization!, fullAccess));
  const typesOfferts = KINDS_FILTRABLES.filter((entry) =>
    kindsActifs.has(entry.kind),
  );

  /**
   * Un filtre par campagne implique le type « Jeux instantanés » : les sept
   * autres modules n'ont pas de `campaign_id`. Plutôt que de laisser deux
   * commandes se contredire à l'écran, la campagne gagne et le sélecteur de
   * type le montre.
   */
  const typeDemande = campaignFilter ? "campaign" : (rawType ?? "");
  const typeFilter = typesOfferts.some((entry) => entry.kind === typeDemande)
    ? typeDemande
    : "";

  const [{ data: campaigns }, lignesEtSuite] = await Promise.all([
    // TOUTES les campagnes, archivées comprises : la liste sert à la fois le
    // menu de création (qui écarte les archivées) et le menu de filtre (qui
    // doit pouvoir garder une archivée déjà sélectionnée).
    supabase
      .from("campaigns")
      .select("id, name, status")
      .eq("organization_id", organization!.id)
      .order("created_at", { ascending: false }),
    chargerLignes(),
  ]);

  /**
   * DEUX CHEMINS, ET LE CHOIX EST ASSUMÉ.
   *
   * `org_qr_hub` ne prend pas de `campaign_id` : elle unionne huit modules dont
   * un seul en a un. Filtrer sa page de résultats côté TS aurait rendu une
   * pagination fausse (24 lignes demandées, 3 affichées, « Suivant » qui saute
   * des QR). L'ancienne requête `qr_codes`, elle, filtre et pagine juste sur ce
   * cas précis — et le cas EST purement campagne. On la garde donc, et on
   * ramène sa sortie à la même forme de ligne que la RPC : le rendu, lui,
   * reste unique.
   */
  async function chargerLignes(): Promise<{
    lignes: LigneHub[];
    hasNext: boolean;
  }> {
    if (campaignFilter) {
      /**
       * `!inner` UNIQUEMENT quand l'état est filtré, et c'est nécessaire : sans
       * lui, `campaigns.status` filtrerait la ressource IMBRIQUÉE (la campagne
       * deviendrait `null`) sans retirer la ligne — la page rendrait des cartes
       * « Campagne supprimée » au lieu de les écarter.
       */
      const colonnes = etatFilter
        ? "*, campaigns!qr_codes_campaign_id_fkey!inner(name, status)"
        : "*, campaigns!qr_codes_campaign_id_fkey(name, status)";
      let requete = supabase
        .from("qr_codes")
        .select(colonnes)
        .eq("organization_id", organization!.id)
        .eq("campaign_id", campaignFilter)
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      // Recherche libre sur ce qui est écrit sur l'affiche : le libellé posé
      // par le commerçant, ou le slug qu'il lit dans l'URL.
      if (termeOr) {
        requete = requete.or(`label.ilike.%${termeOr}%,slug.ilike.%${termeOr}%`);
      }
      if (etatFilter) {
        requete = requete.eq("campaigns.status", STATUT_CAMPAGNE[etatFilter]);
      }
      // Le même prédicat que `p_jamais_scanne` côté RPC, et que
      // `qr_never_scanned` côté tuile : une affiche que personne n'a scannée.
      if (jamaisScanne) requete = requete.eq("scan_count", 0);
      const { data } = await requete;
      const rows = (data ?? []) as {
        id: string;
        slug: string;
        label: string;
        style: QrStyle | null;
        scan_count: number;
        created_at: string;
        campaign_id: string;
        campaigns: { name: string; status: string } | null;
      }[];
      const suite = rows.length > PAGE_SIZE;
      if (suite) rows.pop();
      return {
        hasNext: suite,
        lignes: rows.map((qr) => ({
          kind: "campaign",
          item_id: qr.campaign_id,
          name: qr.campaigns?.name ?? null,
          status: qr.campaigns?.status ?? "draft",
          url_path: `/play/${qr.slug}`,
          open_count: null,
          qr_id: qr.id,
          qr_slug: qr.slug,
          qr_label: qr.label,
          qr_style: (qr.style ?? {}) as Json,
          scan_count: qr.scan_count,
          extra_count: null,
          created_at: qr.created_at,
          // Le pendant TS de la branche `campaign` de la RPC — même mapping,
          // même vocabulaire, pour que la carte se badge pareil des deux côtés.
          etat: ETAT_DEPUIS_CAMPAGNE[qr.campaigns?.status ?? "draft"] ?? "brouillon",
        })),
      };
    }

    // `p_limit` demande une ligne de plus que la page : le débordement suffit
    // à savoir s'il y a une suite, sans dépendre de `total_count` — lequel est
    // absent quand la fenêtre est vide (zéro ligne, donc zéro `total_count`,
    // donc « pas de suivant », ce que la même règle donne déjà).
    const { data, error } = await supabase.rpc("org_qr_hub", {
      p_organization_id: organization!.id,
      p_kind: typeFilter || undefined,
      p_q: terme || undefined,
      p_etat: etatFilter,
      p_jamais_scanne: jamaisScanne || undefined,
      p_limit: PAGE_SIZE + 1,
      p_offset: (page - 1) * PAGE_SIZE,
    });
    // Fail-closed à l'écran (liste vide), mais jamais muet côté exploitation :
    // sans ce report, une panne base rend le même écran qu'« aucun QR ».
    if (error) reportError("qr-hub", error);
    const rows: LigneHub[] = data ?? [];
    const suite = rows.length > PAGE_SIZE;
    if (suite) rows.pop();
    return { lignes: rows, hasNext: suite };
  }

  const { lignes, hasNext } = lignesEtSuite;
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
  const filtreActif = Boolean(
    campaignFilter || q || typeFilter || etatFilter || jamaisScanne,
  );
  /**
   * « Jamais scanné » ne concerne QUE les affiches de campagne : les sept autres
   * modules n'ont pas de `scan_count` (leur compteur est `open_count`). La case
   * reste donc masquée dès qu'un autre type est sélectionné, plutôt que d'offrir
   * une commande qui viderait la liste sans dire pourquoi.
   */
  const scansPertinents = typeFilter === "" || typeFilter === "campaign";

  return (
    <div>
      <PageHeader
        surtitre="Outils"
        titre="QR codes"
        sousTitre="Tous les QR et tous les liens de vos jeux, au même endroit. Filtrez par type de jeu, imprimez l'affiche d'une campagne depuis son studio, copiez l'adresse publique d'un quiz ou d'un pronostic."
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
            placeholder="Nom, libellé ou lien…"
            className="w-56 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <label
            htmlFor="qr-filtre-type"
            className="mb-1 block text-sm font-bold text-k-body"
          >
            Type de jeu
          </label>
          <select
            id="qr-filtre-type"
            name="type"
            defaultValue={typeFilter}
            className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">Tous les jeux</option>
            {typesOfferts.map((entry) => (
              <option key={entry.kind} value={entry.kind}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="qr-filtre-etat"
            className="mb-1 block text-sm font-bold text-k-body"
          >
            État
          </label>
          <select
            id="qr-filtre-etat"
            name="etat"
            defaultValue={etatFilter ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">Tous les états</option>
            {ETATS_HUB.map((etat) => (
              <option key={etat} value={etat}>
                {libelleEtat(PASTILLE_ETAT[etat])}
              </option>
            ))}
          </select>
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
        {scansPertinents && (
          <label
            htmlFor="qr-filtre-scans"
            className="flex items-center gap-2 py-2.5 text-sm font-bold text-k-body"
          >
            <input
              id="qr-filtre-scans"
              type="checkbox"
              name="scans"
              value="jamais"
              defaultChecked={jamaisScanne}
              className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-2 focus:ring-orange-500"
            />
            Jamais scannés
          </label>
        )}
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Filtrer
        </button>
        {/* `text-k-body` : même correction de contraste que les sept listes de
            modules — sur le crème `k-bg`, `text-zinc-500` tombe sous AA. */}
        {filtreActif && (
          <Link
            href="/dashboard/qr-codes"
            className="self-center text-sm font-bold text-k-body hover:text-k-ink"
          >
            Réinitialiser
          </Link>
        )}
      </form>

      {lignes.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="font-bold text-k-body">
            {filtreActif
              ? "Aucun jeu ne correspond à ce filtre."
              : "Aucun QR code pour l'instant."}
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {lignes.map((ligne) =>
            // Les lignes de campagne gardent LEUR carte : studio QR, éditeur
            // d'affiche, planche de test. Rien de tout cela n'existe pour les
            // sept autres modules, qui n'ont pas de `qr_codes` en base.
            ligne.kind === "campaign" && ligne.qr_id && ligne.qr_slug ? (
              <li key={`qr-${ligne.qr_id}`}>
                <QrCodeCard
                  id={ligne.qr_id}
                  slug={ligne.qr_slug}
                  label={ligne.qr_label ?? ""}
                  campaignName={ligne.name ?? "Campagne supprimée"}
                  url={`${APP_URL}/play/${ligne.qr_slug}`}
                  scanCount={ligne.scan_count ?? 0}
                  initialStyle={(ligne.qr_style ?? {}) as QrStyle}
                  posterHref={`/poster/${ligne.qr_id}`}
                  testHref={`/poster/${ligne.qr_id}/qr-test`}
                />
              </li>
            ) : (
              <li key={`${ligne.kind}-${ligne.item_id}`}>
                <JeuLienCard
                  kind={ligne.kind as ExperienceKind}
                  kindLabel={
                    LIBELLE_KIND.get(ligne.kind as ExperienceKind) ?? "Jeu"
                  }
                  name={ligne.name ?? "Sans nom"}
                  etat={PASTILLE_ETAT[ligne.etat as EtatHub] ?? "brouillon"}
                  url={ligne.url_path ? `${APP_URL}${ligne.url_path}` : null}
                  moduleHref={hrefModule(ligne.kind, ligne.item_id)}
                  openCount={ligne.open_count}
                  extraCount={ligne.extra_count}
                />
              </li>
            ),
          )}
        </ul>
      )}
      <Pagination
        page={page}
        hasNext={hasNext}
        params={{
          campaign: campaignFilter,
          type: typeFilter,
          q,
          etat: etatFilter,
          scans: jamaisScanne ? "jamais" : undefined,
        }}
      />
    </div>
  );
}
