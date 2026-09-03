import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import {
  etapeVoisine,
  numeroEtape,
  parseEtape,
} from "@/components/dashboard/atelier-etapes";
import {
  definitionEtapeChasse,
  ETAPES_CHASSE,
  hrefEtapeChasse,
  type EtapeChasse,
} from "@/components/dashboard/atelier-hunt-etapes";
import { AtelierEntree } from "@/components/dashboard/atelier-entree";
import { AtelierVerificationChasse } from "@/components/dashboard/atelier-hunt-verification";
import { CarteRepliable } from "@/components/dashboard/carte-repliable";
import {
  AtelierNavigationEtape,
  AtelierStepper,
} from "@/components/dashboard/atelier-stepper";
import {
  HuntSettings,
  HuntStatusControls,
  HuntStepsEditor,
} from "@/components/dashboard/hunt-editor";
import { HuntPosters } from "@/components/dashboard/hunt-posters";
import { HuntStatusBadge } from "@/components/dashboard/hunt-status";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { RelaunchFormulaAction } from "@/components/dashboard/relaunch-formula-action";
import { RelaunchFormulaCard } from "@/components/dashboard/relaunch-formula-card";
import { relanceADeQuoiSAfficher } from "@/components/dashboard/relaunch-formula-state";
import { RelanceErreur } from "@/components/dashboard/relance-erreur";
import { construireVerificationChasse } from "@/lib/activation/hunts";
import { carteTuile } from "@/lib/checklist/carte-tuile";
import { tuilesDuModule } from "@/lib/checklist/tuiles";
import { etatSourceRelance } from "@/lib/experience-relance";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { readModulePageOpenCounts } from "@/lib/module-page-opens";
import type { Hunt, HuntStep } from "@/types/database";

export const metadata: Metadata = { title: "Chasse au QR" };

/**
 * LA PAGE D'UNE CHASSE — DEUX VISAGES SUR UNE SEULE ROUTE.
 *
 * · URL nue → la vue SUIVI : le statut, ce que font vos joueurs, la relance.
 *   Ce qu'on vient regarder une fois la chasse en place.
 * · `?etape=…` → l'ATELIER : le fil des quatre étapes et LA carte de l'étape
 *   courante. Ce qu'on vient faire avant d'ouvrir.
 *
 * L'étape vit dans la query string, jamais dans une sous-route : les dix
 * `revalidatePath("/dashboard/hunts/<id>")` de `src/actions/hunts.ts` visent
 * cette page nue, et la revalidation ignore la query. Une sous-route aurait
 * fait de ces dix appels des chemins morts.
 *
 * L'ACCÈS suit le §3 du cahier — découvrir, préparer, publier. La page rendait
 * un `notFound()` sec sans l'addon payé ; elle rend désormais le bandeau
 * `ModuleCapabilityNotice`, comme l'atelier de la roue. Seule la PUBLICATION
 * reste verrouillée, et elle l'est en base.
 */
export default async function HuntDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ relance_error?: string | string[]; etape?: string }>;
}) {
  const { id } = await params;
  const { relance_error: relanceError, etape: etapeParam } = await searchParams;
  const { organization, role } = await getUserAndOrg();
  if (!organization) notFound();
  // Lue DÈS L'ENTRÉE : on ne guide pas quelqu'un pendant quatre étapes pour lui
  // refuser la cinquième.
  const capacites = await capacitesDuModule("hunts");
  if (!capacites.canExplore) notFound();
  const supabase = await createClient();
  const canViewPlayers = role === "owner";

  // `"nulle"` : l'absence d'étape est la vue SUIVI, pas la première étape.
  const etape = parseEtape(ETAPES_CHASSE, etapeParam, "nulle") as
    | EtapeChasse
    | null;

  const [{ data: hunt }, { data: stepRows }] = await Promise.all([
    supabase
      .from("hunts")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("hunt_steps")
      .select("*")
      .eq("hunt_id", id)
      .eq("organization_id", organization.id)
      .order("position", { ascending: true }),
  ]);

  if (!hunt) notFound();
  const h = hunt as Hunt;
  const steps = (stepRows ?? []) as HuntStep[];

  // Stats agrégées (owner) — org-scopées, honorées par la RLS « member select ».
  let players = 0;
  let redeemed = 0;
  if (canViewPlayers) {
    const [{ count: playerCount }, { count: redeemedCount }] = await Promise.all([
      supabase
        .from("hunt_players")
        .select("id", { count: "exact", head: true })
        .eq("hunt_id", id)
        .eq("organization_id", organization.id),
      supabase
        .from("hunt_completions")
        .select("id", { count: "exact", head: true })
        .eq("hunt_id", id)
        .eq("organization_id", organization.id)
        .not("redeemed_at", "is", null),
    ]);
    players = playerCount ?? 0;
    redeemed = redeemedCount ?? 0;
  }

  // Compteur d'ouvertures PAR ÉTAPE. On interroge sur `step.id` et non sur
  // `hunt.id` : le grain de `module_page_opens.resource_id` est ce que le QR
  // désigne — ici l'étape, comme `events` compte par session. Une ressource
  // sans ligne n'a jamais été ouverte, `readModulePageOpenCounts` rend 0 pour
  // que l'affiche dise « 0 ouverture » plutôt qu'un blanc.
  const openCounts = await readModulePageOpenCounts(
    supabase,
    "hunts",
    steps.map((step) => step.id),
  );

  const posterSteps = steps.map((step) => ({
    id: step.id,
    position: step.position,
    label: step.label,
    token: step.token,
    url: `${APP_URL}/hunt/${step.token}`,
    opens: openCounts[step.id] ?? 0,
  }));
  const totalOpens = posterSteps.reduce((somme, s) => somme + s.opens, 0);

  const remainingStock =
    h.reward_stock === null ? null : Math.max(0, h.reward_stock - h.reward_claimed_count);

  // Relance : les marqueurs sortent de la ligne déjà lue ci-dessus, aucune
  // requête n'est ajoutée pour eux.
  const marqueurs = {
    status: h.status,
    starts_at: h.starts_at,
    ends_at: h.ends_at,
  };
  const peutCreerBrouillon = role === "owner" || role === "editor";
  // L'enveloppe repliable suit le MÊME verdict que la carte qu'elle contient :
  // sans ce test, elle restait à l'écran et s'ouvrait sur du vide, parce que
  // `RelaunchFormulaCard` rend `null` tant que l'animation n'est pas
  // terminée. Le pourquoi est écrit une fois, sur `relanceADeQuoiSAfficher`.
  const relance = {
    sourceState: etatSourceRelance("hunt", marqueurs),
    canCreateDraft: peutCreerBrouillon,
    isSupported: true,
  };

  // LA VÉRIFICATION, CALCULÉE UNE FOIS, AU-DESSUS DU BRANCHEMENT. Les deux
  // visages en vivent : la vue suivi en tire le verdict de ses tuiles, l'atelier
  // la donne à son étape « La vérification ». Deux appels auraient été deux
  // vérités sur une même chasse — et `hunts` / `hunt_steps` sont déjà chargés
  // inconditionnellement, donc ce calcul n'ajoute aucune requête.
  const entreeVerification = {
    huntId: h.id,
    rewardLabel: h.reward_label,
    rewardStock: h.reward_stock,
    rewardClaimedCount: h.reward_claimed_count,
    stepCount: steps.length,
    endsAt: h.ends_at,
  };
  const tuiles = tuilesDuModule(
    "chasse",
    construireVerificationChasse(entreeVerification).controles,
  );

  const cleCourante: EtapeChasse = etape ?? ETAPES_CHASSE[0].cle;
  const definition = definitionEtapeChasse(cleCourante);
  const numero = numeroEtape(ETAPES_CHASSE, cleCourante);
  const precedente = etapeVoisine(ETAPES_CHASSE, cleCourante, -1);
  const suivante = etapeVoisine(ETAPES_CHASSE, cleCourante, 1);
  const hrefPour = (cle: string) => hrefEtapeChasse(h.id, cle as EtapeChasse);

  // Le bandeau d'offre se lit sur LES DEUX VUES, comme sur le quiz et le
  // calendrier. Il ne vivait que dans l'atelier : sans add-on, la vue suivi
  // portait « Ouvrir aux joueurs » sans un mot sur la raison du refus à venir.
  // (Il ne rend rien du tout quand le module est payé — voir le composant.)
  const bandeauModule = (
    <ModuleCapabilityNotice capacites={capacites} entitlement="hunts">
      2 à 10 étapes par Chasse au QR, ordre libre ou imposé, lot final remis en
      caisse.
    </ModuleCapabilityNotice>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/hunts"
          className="text-sm text-zinc-600 hover:text-k-ink"
        >
          ← Chasse au QR
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🗺️
          </span>
          <h1 className="text-2xl font-bold">{h.name}</h1>
          <HuntStatusBadge status={h.status} />
        </div>
      </div>

      {bandeauModule}

      {etape === null ? (
        <>
          {/* Seul le Statut reste OUVERT : c'est le geste qui ouvre la chasse
              aux joueurs. Tout le reste naît replié, y compris la Carte de
              l'Aventure et la porte de l'atelier — l'ancre rouvre d'elle-même
              le bloc qu'elle vise (voir `carte-repliable.tsx`). */}
          <CarteRepliable {...carteTuile(tuiles, "statut")}>
            <HuntStatusControls
              hunt={h}
              stepCount={steps.length}
              hrefJeu={posterSteps[0]?.url ?? null}
            />
          </CarteRepliable>

          {/* ── LE STUDIO EST LE CHEMIN PRINCIPAL SUR GRAND ÉCRAN (VIT-40) ──

              Tout s'y règle en voyant la page du joueur. La carte est donc
              OUVERTE d'emblée : un commerçant qui vient régler quelque chose
              doit tomber dessus, pas la déplier.

              Elle ne s'affiche qu'à partir de `lg`, parce que le studio est à
              deux colonnes : en dessous, elles s'empilent et l'aperçu passe
              sous les réglages, ce qui lui retire sa raison d'être. Même
              arbitrage, et même motif, que `/dashboard/calendar/[id]`.

              LA PASTILLE DE PRÉPARATION SUIT L'ENTRÉE PRINCIPALE : elle
              appartient à la préparation, pas à un écran. Sur grand écran,
              c'est le studio. */}
          <div className="hidden lg:block">
            <CarteRepliable
              {...carteTuile(tuiles, "atelier")}
              titre="Mon studio"
              defaultOuvert
              resume={`${steps.length} étape${steps.length > 1 ? "s" : ""} — tout se règle ici, en voyant le résultat.`}
            >
              {/* LE BLOC ENVELOPPÉ PORTE SON PROPRE `<h2>`, ET CE N’EST PAS
                  DÉCORATIF. `CarteRepliable` rend son titre replié dans un
                  `<span>` — jamais un heading — précisément parce que le bloc
                  qu’elle enveloppe en porte déjà un du même nom. Sans ce
                  `<h2>`, la carte n’a AUCUN titre dans l’arbre
                  d’accessibilité : un lecteur d’écran ne l’annonce pas, et les
                  E2E qui cherchent `getByRole("heading")` ne la trouvent pas
                  non plus. */}
              <Card>
                <h2 className="font-semibold mb-1">Mon studio</h2>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 text-sm text-k-body">
                    La page de vos joueurs au centre, les réglages autour. Le
                    nom, les étapes, les indices, l&apos;ordre, la fenêtre de
                    jeu et le lot final — tout s&apos;y règle en voyant le
                    résultat.
                  </p>
                  <Link
                    href={`/studio/chasse/${h.id}`}
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
              resume={`${ETAPES_CHASSE.length} étapes de préparation.`}
            >
              <CarteEntreeAtelier huntId={h.id} />
            </CarteRepliable>
          </div>

          <CarteRepliable
            {...carteTuile(tuiles, "suivi")}
            defaultOuvert={false}
            resume={`${steps.length} étape${steps.length > 1 ? "s" : ""} — ${totalOpens} ouverture${totalOpens > 1 ? "s" : ""}`}
          >
            <Card>
              <h2 className="font-semibold mb-1">Ce que font vos joueurs</h2>
              <p className="text-sm text-zinc-500 mb-4">
                Vos {steps.length} affiche{steps.length > 1 ? "s" : ""} ont été
                ouverte{totalOpens > 1 ? "s" : ""} {totalOpens} fois au total.
                Chaque chargement compte, y compris un rechargement ou un lien
                partagé : ce n&apos;est donc pas un nombre de visiteurs distincts.
              </p>

              {canViewPlayers && (
                <>
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Stat label="Étapes" value={steps.length} />
                    <Stat label="Joueurs" value={players} />
                    <Stat label="Lots gagnés" value={h.reward_claimed_count} />
                    <Stat label="Lots remis" value={redeemed} />
                  </dl>
                  {remainingStock !== null && (
                    <p className="mt-4 text-sm text-zinc-500">
                      Stock restant :{" "}
                      <span className="font-semibold text-zinc-900">
                        {remainingStock}
                      </span>{" "}
                      lot{remainingStock > 1 ? "s" : ""}
                    </p>
                  )}
                </>
              )}

              <p className="mt-4 text-sm">
                <Link
                  href={hrefEtapeChasse(h.id, "affiches")}
                  className="font-bold text-k-ink underline underline-offset-2"
                >
                  Voir et imprimer les affiches QR, étape par étape →
                </Link>
              </p>
            </Card>
          </CarteRepliable>

          <RelanceErreur message={relanceError} />

          {capacites.canExplore && relanceADeQuoiSAfficher(relance) && (
            <CarteRepliable
              {...carteTuile(tuiles, "relance")}
              defaultOuvert={false}
              resume="Repartir d'une Chasse au QR existante pour en créer une nouvelle"
            >
              <RelaunchFormulaCard
                sourceName={h.name}
                {...relance}
                action={<RelaunchFormulaAction kind="hunt" sourceId={h.id} />}
              />
            </CarteRepliable>
          )}
        </>
      ) : (
        <>
          <AtelierStepper
            etapes={ETAPES_CHASSE}
            courante={cleCourante}
            hrefPour={hrefPour}
          />

          <section
            aria-label={`Étape ${numero} sur ${ETAPES_CHASSE.length} — ${definition.titre}`}
            className="space-y-4"
          >
            {etape === "chasse" && (
              <HuntSettings hunt={h} timeZone={organization.timezone} />
            )}

            {etape === "parcours" && (
              <HuntStepsEditor huntId={h.id} steps={steps} />
            )}

            {etape === "affiches" && (
              <Card>
                <h2 className="font-semibold mb-1">Affiches QR des étapes</h2>
                <p className="text-sm text-zinc-500 mb-3">
                  Une affiche par étape à imprimer et poser sur place. Chaque QR
                  renvoie le joueur vers la page de l&apos;étape correspondante.
                  Rien à enregistrer ici : les affiches se régénèrent toutes
                  seules quand vous renommez ou réordonnez une étape.
                </p>
                <InfoBulle
                  id="aide-affiches-chasse"
                  resume="Que compte le chiffre sous chaque affiche ?"
                  className="mb-4"
                >
                  Le nombre de CHARGEMENTS de la page de cette étape — pas de
                  scanneurs distincts : un rechargement ou un lien partagé
                  comptent aussi. C&apos;est ce qui vous dit lequel de vos
                  emplacements travaille. Le QR de la première étape sert
                  d&apos;aperçu même en brouillon, mais les pages ne s&apos;
                  ouvrent aux joueurs qu&apos;une fois la Chasse au QR publiée.
                </InfoBulle>
                <HuntPosters huntName={h.name} steps={posterSteps} />
              </Card>
            )}

            {etape === "verification" && (
              <AtelierVerificationChasse entree={entreeVerification} />
            )}
          </section>

          <AtelierNavigationEtape
            precedente={precedente}
            suivante={suivante}
            hrefPour={hrefPour}
          />

          <p>
            <Link
              href={`/dashboard/hunts/${h.id}`}
              className="text-sm font-bold text-k-body hover:text-k-ink"
            >
              ← Retour au suivi de la Chasse au QR
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

/**
 * LA PORTE DE L'ATELIER, sur la vue suivi. Elle liste les quatre étapes plutôt
 * qu'un seul bouton : le commerçant qui revient pour changer UNE chose sait où
 * elle se règle sans dérouler tout l'assistant. Le rendu est celui, partagé,
 * d'`atelier-entree.tsx` ; ne reste ici que le texte propre à la chasse.
 */
function CarteEntreeAtelier({ huntId }: { huntId: string }) {
  return (
    <AtelierEntree
      etapes={ETAPES_CHASSE}
      hrefPour={(cle) => hrefEtapeChasse(huntId, cle as EtapeChasse)}
      titre="L'atelier de la Chasse au QR"
      sousTitre="Quatre étapes pour préparer votre Chasse au QR, du lot final aux affiches. Chaque étape s'enregistre pour elle-même : vous pouvez vous arrêter et revenir."
    />
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl font-black tabular-nums text-k-ink">
        {value}
      </dd>
    </div>
  );
}
