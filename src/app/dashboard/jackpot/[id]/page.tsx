import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Card, TITRE_CARTE } from "@/components/ui/card";
import { PublicShare } from "@/components/dashboard/public-share";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { readModulePageOpenCount } from "@/lib/module-page-opens";
import {
  etapeVoisine,
  numeroEtape,
  parseEtape,
} from "@/components/dashboard/atelier-etapes";
import {
  etapesJackpot,
  hrefEtapeJackpot,
  titreEtapeJackpot,
} from "@/components/dashboard/atelier-jackpot-etapes";
import {
  AtelierNavigationEtape,
  AtelierStepper,
} from "@/components/dashboard/atelier-stepper";
import { AtelierEntree } from "@/components/dashboard/atelier-entree";
import { AtelierJackpotComptoir } from "@/components/dashboard/atelier-jackpot-comptoir";
import { AtelierJackpotVerification } from "@/components/dashboard/atelier-jackpot-verification";
import { CarteRepliable } from "@/components/dashboard/carte-repliable";
import { construireActivationJackpot } from "@/lib/activation/jackpot";
import { carteTuile } from "@/lib/checklist/carte-tuile";
import { tuilesDuModule } from "@/lib/checklist/tuiles";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import {
  JackpotSettings,
  JackpotStatusControls,
} from "@/components/dashboard/jackpot-editor";
import { JackpotStatusBadge } from "@/components/dashboard/jackpot-status";
import type { JackpotCampaign } from "@/types/database";

export const metadata: Metadata = { title: "Jackpot collectif" };

/** Colonnes du merchant (rotating_secret exclu du grant, jamais lu ici). */
const CAMPAIGN_COLUMNS =
  "id, organization_id, name, status, public_slug, validation_mode, rotating_period_seconds, min_participation_interval_seconds, draw_mode, threshold, win_probability, draw_at, reward_label, reward_details, reward_stock, reward_claimed_count, display_base_cents, display_increment_cents, merchant_content, current_count, cycle, created_at, code_ttl_days";

/**
 * LA PAGE D'UNE CAGNOTTE — DEUX VISAGES SUR UNE SEULE ROUTE.
 *
 * URL nue : la vue SUIVI. Ce qui se regarde une fois la cagnotte lancée —
 * l'état, les chiffres, le QR, l'écran comptoir — plus une porte d'entrée vers
 * l'atelier. `?etape=` : l'ATELIER, une carte de réglage à la fois.
 *
 * L'étape vit dans la QUERY et non dans une sous-route : les huit
 * `revalidatePath("/dashboard/jackpot/<id>")` de `src/actions/jackpot.ts` visent
 * la page nue, et la revalidation ignore la query string. Une sous-route en
 * aurait fait huit chemins morts pour une barre d'adresse plus jolie.
 */
export default async function JackpotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ etape?: string }>;
}) {
  const { id } = await params;
  const { etape: etapeParam } = await searchParams;
  const { organization, role } = await getUserAndOrg();
  if (!organization) notFound();
  // §3 du cahier : découvrir est ouvert, seule la PUBLICATION est payante (et
  // elle est fermée en base par `assert_module_publish_allowed`). La page ne
  // se referme donc plus sur le droit payé — seulement sur `canExplore`, qui
  // reste faux pour la caisse, dont le rôle ne prépare aucune animation.
  const capacites = await capacitesDuModule("jackpot");
  if (!capacites.canExplore) notFound();
  const supabase = await createClient();
  const canViewStats = role === "owner";

  const { data: campaign } = await supabase
    .from("jackpot_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!campaign) notFound();
  const c = campaign as unknown as JackpotCampaign;

  // Nombre de lots déjà remis (owner) — org-scopé, honoré par la RLS.
  let redeemed = 0;
  if (canViewStats) {
    const { count } = await supabase
      .from("jackpot_wins")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("organization_id", organization.id)
      .not("redeemed_at", "is", null);
    redeemed = count ?? 0;
  }

  // URL ABSOLUE : un QR ne peut pas encoder un chemin relatif. Même source que
  // le quiz et les pronostics (APP_URL), pour que le QR imprimé reste valable.
  // `public_slug` est NULLABLE ici (contrairement au calendrier) : la page
  // publique résout indifféremment l'UUID ou le slug, d'où le repli sur l'id.
  const publicUrl = `${APP_URL}/jackpot/${c.public_slug ?? c.id}`;
  const openCount = await readModulePageOpenCount(
    supabase,
    "jackpot",
    c.id,
  );

  // Les étapes dépendent du mode : sans code tournant, l'écran comptoir
  // n'affiche aucun code, et une étape qui ne produit rien n'est pas proposée.
  const etapesAtelier = etapesJackpot(c.validation_mode);
  const etape = parseEtape(etapesAtelier, etapeParam, "nulle");
  const hrefPour = (cle: string) => hrefEtapeJackpot(c.id, cle);

  // LA VÉRIFICATION, CALCULÉE UNE FOIS, AU-DESSUS DU BRANCHEMENT : la vue suivi
  // en tire le verdict de ses tuiles, l'atelier la donne à son étape « La
  // vérification ». Les cinq contrôles pointent tous l'étape « reglages » — mais
  // le BLOC qui les porte est la carte d'entrée de l'atelier, et c'est
  // `TUILES_JACKPOT` qui le dit : une étape d'atelier n'est pas une tuile.
  const entreeVerification = {
    draw_mode: c.draw_mode,
    threshold: c.threshold,
    draw_at: c.draw_at,
    reward_stock: c.reward_stock,
    reward_label: c.reward_label,
    status: c.status,
    validation_mode: c.validation_mode,
    public_slug: c.public_slug,
    code_ttl_days: c.code_ttl_days,
  };
  const tuiles = tuilesDuModule(
    "jackpot",
    construireActivationJackpot(entreeVerification).controles,
  );

  const numero = etape ? numeroEtape(etapesAtelier, etape) : 0;
  const titreEtape = etape ? titreEtapeJackpot(etapesAtelier, etape) : "";

  // Le bandeau d'offre se lit sur LES DEUX VUES, comme sur le quiz et le
  // calendrier. Il ne vivait que dans l'atelier : sans add-on, la vue suivi
  // portait « Ouvrir aux joueurs » sans un mot sur la raison du refus à venir.
  const bandeauModule = (
    <ModuleCapabilityNotice capacites={capacites} entitlement="jackpot">
      Code tournant au comptoir ou validation en caisse, objectif, lot à stock
      fini et montant d&apos;affichage croissant personnalisables.
    </ModuleCapabilityNotice>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/jackpot"
          className="text-sm text-zinc-600 hover:text-k-ink"
        >
          ← Jackpot collectif
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🎰
          </span>
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <JackpotStatusBadge status={c.status} />
        </div>
      </div>

      {bandeauModule}

      {etape === null ? (
        <>
          {/* Le bloc qui décide — publier — reste ouvert ; tout le reste naît
              replié. L'ancre rouvre le bloc qu'elle vise. */}
          <CarteRepliable {...carteTuile(tuiles, "statut")}>
            <JackpotStatusControls
              campaign={c}
              hrefJeu={c.status === "active" ? publicUrl : null}
            />
          </CarteRepliable>

          {canViewStats && (
            <CarteRepliable
              {...carteTuile(tuiles, "apercu")}
              defaultOuvert={false}
              resume={`${c.current_count} / ${c.threshold} participations sur ce cycle`}
            >
              <Card>
                <h2 className="font-semibold mb-4">En un coup d&apos;œil</h2>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Objectif" value={c.threshold} />
                  <Stat label="Participations (cycle)" value={c.current_count} />
                  <Stat
                    label={`Gagnants / ${c.reward_stock}`}
                    value={c.reward_claimed_count}
                  />
                  <Stat label="Lots remis" value={redeemed} />
                </dl>
              </Card>
            </CarteRepliable>
          )}

          {/* §4 du cahier : le QR ne rend pas jouable un brouillon. On n'affiche
              donc le QR et le lien QUE si la cagnotte est publiée — un QR imprimé
              et collé en vitrine survit à la page qui l'a produit, alors qu'un
              bandeau d'avertissement, non. */}
          <CarteRepliable
            {...carteTuile(tuiles, "partage")}
            defaultOuvert={false}
            resume={
              c.status === "active"
                ? `${openCount} ouverture${openCount > 1 ? "s" : ""} de la page publique`
                : "Cagnotte non publiée — pas encore de QR code"
            }
          >
            <Card>
              <h2 className="font-semibold mb-1">
                QR code et lien de la cagnotte
              </h2>
              {c.status === "active" ? (
                <>
                  <p className="text-sm text-zinc-500 mb-3">
                    Affichez le QR code en boutique ou partagez le lien : vos
                    clients suivent la jauge et participent depuis leur
                    téléphone.
                  </p>
                  <PublicShare
                    url={publicUrl}
                    fileName={`jackpot-${c.public_slug ?? c.id}`}
                    qrLabel={c.name}
                    openCount={openCount}
                    resource={{ kind: "jackpot", id: c.id }}
                  />
                </>
              ) : (
                <p className="text-sm text-zinc-500">
                  Publiez la cagnotte pour obtenir son QR code et son lien : tant
                  qu&apos;elle n&apos;est pas active, la page publique reste
                  fermée aux joueurs.
                </p>
              )}
            </Card>
          </CarteRepliable>

          {/* L'écran comptoir n'a de sens qu'en « Code au comptoir » : en
              validation caisse, `getJackpotCounterCode` rend `code: null` et
              cette carte proposait un geste qui ne produit rien. */}
          {c.validation_mode === "rotating_code" && (
            <CarteRepliable
              {...carteTuile(tuiles, "comptoir")}
              defaultOuvert={false}
              resume="La jauge géante et le code tournant à afficher au comptoir"
            >
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className={cn(TITRE_CARTE, "mb-1")}>
                    Écran comptoir
                  </h2>
                  <p className="text-sm text-zinc-500">
                    Affichez la jauge géante et le code tournant face aux
                    clients.
                  </p>
                </div>
                <Link
                  href={`/dashboard/jackpot/${c.id}/comptoir`}
                  className="k-btn-sm inline-flex items-center gap-2 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-bold text-k-ink"
                >
                  Ouvrir l&apos;écran comptoir →
                </Link>
              </Card>
            </CarteRepliable>
          )}

          {/* LE STUDIO REMPLACE L'ATELIER AU-DELÀ DE `lg`, ET SEULEMENT LÀ
              (VIT-44).

              En dessous du point de rupture, la rangée à deux colonnes du
              studio s'empile : l'aperçu passe SOUS les réglages, ce qui lui
              retire sa raison d'être. Même arbitrage, et même motif, que le
              calendrier, le quiz, la chasse et le passeport.

              LA PASTILLE DE PRÉPARATION SUIT L'ENTRÉE PRINCIPALE : elle
              appartient à la préparation, pas à un écran. Sur grand écran,
              c'est le studio. */}
          <div className="hidden lg:block">
            <CarteRepliable
              {...carteTuile(tuiles, "atelier")}
              titre="Mon studio"
              defaultOuvert
              resume="8 étapes — tout se règle ici, en voyant le résultat."
            >
              {/* LE BLOC ENVELOPPÉ PORTE SON PROPRE `<h2>`, ET CE N'EST PAS
                  DÉCORATIF. `CarteRepliable` rend son titre replié dans un
                  `<span>` — jamais un heading — précisément parce que le bloc
                  qu'elle enveloppe en porte déjà un du même nom. Sans ce
                  `<h2>`, la carte n'a AUCUN titre dans l'arbre
                  d'accessibilité : un lecteur d'écran ne l'annonce pas, et les
                  E2E qui cherchent `getByRole("heading")` ne la trouvent pas
                  non plus. */}
              <Card>
                <h2 className="font-semibold mb-1">Mon studio</h2>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 text-sm text-k-body">
                    La page de vos clients au centre, les réglages autour. Le
                    nom, la façon de participer, l&apos;objectif, le tirage, le
                    lot, le montant affiché et votre message — tout s&apos;y
                    règle en voyant le résultat.
                  </p>
                  <Link
                    href={`/studio/cagnotte/${c.id}`}
                    className="shrink-0 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/80"
                  >
                    Ouvrir le studio
                  </Link>
                </div>
              </Card>
            </CarteRepliable>
          </div>

          {/* L'ATELIER RESTE, POUR LE TÉLÉPHONE. Ce qui est masqué au-delà de
              `lg` est l'ENTRÉE, jamais la ROUTE : `?etape=` demeure atteignable
              sur n'importe quelle taille d'écran — une adresse d'étape gardée
              en favori doit continuer de mener quelque part. */}
          <div className="lg:hidden">
            <CarteRepliable
              {...carteTuile(tuiles, "atelier")}
              defaultOuvert={false}
              resume={`${etapesAtelier.length} étape${etapesAtelier.length > 1 ? "s" : ""} de préparation.`}
            >
              <AtelierEntree
                etapes={etapesAtelier}
                hrefPour={hrefPour}
                titre="L'atelier de la cagnotte"
                sousTitre="Tout ce qui se règle avant l'ouverture, une étape à la fois. Chaque étape s'enregistre pour elle-même : vous pouvez vous arrêter et revenir."
              />
            </CarteRepliable>
          </div>
        </>
      ) : (
        <>
          {/* Lu DÈS L'ENTRÉE : on ne guide pas quelqu'un pendant trois étapes
              pour lui refuser la publication au bout. Le bandeau ne ferme
              rien — la préparation reste ouverte. */}
          <AtelierStepper
            etapes={etapesAtelier}
            courante={etape}
            hrefPour={hrefPour}
          />

          <section
            aria-label={`Étape ${numero} sur ${etapesAtelier.length} — ${titreEtape}`}
          >
            {etape === "reglages" && (
              <JackpotSettings campaign={c} timeZone={organization.timezone} />
            )}

            {etape === "comptoir" && (
              <AtelierJackpotComptoir
                campaignId={c.id}
                periodSeconds={c.rotating_period_seconds}
                cooldownSeconds={c.min_participation_interval_seconds}
              />
            )}

            {etape === "verification" && (
              <AtelierJackpotVerification
                campaignId={c.id}
                etapes={etapesAtelier}
                entree={entreeVerification}
              />
            )}
          </section>

          <AtelierNavigationEtape
            precedente={etapeVoisine(etapesAtelier, etape, -1)}
            suivante={etapeVoisine(etapesAtelier, etape, 1)}
            hrefPour={hrefPour}
          />

          <Link
            href={`/dashboard/jackpot/${c.id}`}
            className="inline-block text-sm font-bold text-k-body hover:text-k-ink"
          >
            ← Retour au suivi
          </Link>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl font-black tabular-nums text-k-ink">{value}</dd>
    </div>
  );
}
