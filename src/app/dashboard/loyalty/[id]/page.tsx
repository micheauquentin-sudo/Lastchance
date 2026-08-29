import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Card, TITRE_SURLIGNE } from "@/components/ui/card";
import { PublicShare } from "@/components/dashboard/public-share";
import {
  etapeVoisine,
  numeroEtape,
  parseEtape,
} from "@/components/dashboard/atelier-etapes";
import {
  definitionEtapeFidelite,
  ETAPES_FIDELITE,
  hrefEtapeFidelite,
  type EtapeFidelite,
} from "@/components/dashboard/atelier-loyalty-etapes";
import { AtelierEntree } from "@/components/dashboard/atelier-entree";
import { AtelierVerificationFidelite } from "@/components/dashboard/atelier-loyalty-verification";
import { CarteRepliable } from "@/components/dashboard/carte-repliable";
import {
  AtelierNavigationEtape,
  AtelierStepper,
} from "@/components/dashboard/atelier-stepper";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { RelaunchFormulaAction } from "@/components/dashboard/relaunch-formula-action";
import { RelaunchFormulaCard } from "@/components/dashboard/relaunch-formula-card";
import { relanceADeQuoiSAfficher } from "@/components/dashboard/relaunch-formula-state";
import { RelanceErreur } from "@/components/dashboard/relance-erreur";
import { construireVerificationFidelite } from "@/lib/activation/loyalty";
import { carteTuile } from "@/lib/checklist/carte-tuile";
import { tuilesDuModule } from "@/lib/checklist/tuiles";
import { etatSourceRelance } from "@/lib/experience-relance";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { readModulePageOpenCount } from "@/lib/module-page-opens";
import {
  LoyaltyMilestonesEditor,
  LoyaltySettings,
  LoyaltyStatusControls,
  type WheelOption,
} from "@/components/dashboard/loyalty-editor";
import { LoyaltyStatusBadge } from "@/components/dashboard/loyalty-status";
import {
  OrderCodeCards,
  type OrderCodeCard,
} from "@/components/dashboard/order-code-cards";
import type { LoyaltyMilestone, LoyaltyProgram } from "@/types/database";

export const metadata: Metadata = { title: "Programme de fidélité" };

/**
 * Plafond des cartes de commande rendues. Chaque carte non servie porte un
 * aperçu QR dessiné dans un canvas : sans borne, un commerçant qui a émis
 * mille cartes ferait ramer sa propre page. Les plus récentes d'abord — ce
 * sont celles qu'on part imprimer.
 *
 * Ce plafond est DIT à l'écran (étape « Les cartes de commande ») : il ne
 * l'était pas, et un commerçant qui en avait émis cinq cents croyait en avoir
 * deux cents.
 */
const ORDER_CODES_LIMIT = 200;

interface WheelRow {
  id: string;
  name: string;
}

interface PrizeRow {
  wheel_id: string;
  label: string;
  is_losing: boolean;
  stock: number | null;
  weight: number;
}

/**
 * Roues + état de leurs lots, tel que l'éditeur de paliers en a besoin.
 *
 * Miroir EXACT du filtre de tirage de `consume_loyalty_spin_grant`
 * (20260725200000) : `is_active and weight > 0 and (is_losing or stock > 0)`.
 * Un lot non perdant laissé « vide = illimité » est donc hors tirage pour un
 * tour offert — c'est ce que l'avertissement annonce au commerçant.
 */
function toWheelOptions(wheels: WheelRow[], prizes: PrizeRow[]): WheelOption[] {
  const byWheel = new Map<string, PrizeRow[]>();
  for (const prize of prizes) {
    const list = byWheel.get(prize.wheel_id) ?? [];
    list.push(prize);
    byWheel.set(prize.wheel_id, list);
  }

  return wheels.map((w) => {
    const list = byWheel.get(w.id) ?? [];
    const drawn = list.filter((prize) => prize.weight > 0);
    return {
      id: w.id,
      name: w.name,
      unlimitedPrizes: drawn
        .filter((prize) => !prize.is_losing && prize.stock === null)
        .map((prize) => prize.label),
      hasDrawablePrize: drawn.some(
        (prize) => prize.is_losing || (prize.stock ?? 0) > 0,
      ),
    };
  });
}

/**
 * LA PAGE D'UN PASSEPORT — DEUX VISAGES SUR UNE SEULE ROUTE.
 *
 * · URL nue → la vue SUIVI : statut, QR public, écran comptoir, relance.
 * · `?etape=…` → l'ATELIER : le fil des quatre étapes et LA carte de l'étape.
 *
 * L'étape reste dans la query string : les dix `revalidatePath` de
 * `src/actions/loyalty.ts` visent la page nue. Et l'accès suit le §3 du cahier
 * — bandeau `ModuleCapabilityNotice` au lieu d'un `notFound()` sec sans addon.
 */
export default async function LoyaltyDetailPage({
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
  const capacites = await capacitesDuModule("loyalty");
  if (!capacites.canExplore) notFound();
  const supabase = await createClient();
  const canViewStats = role === "owner";

  // `"nulle"` : l'absence d'étape est la vue SUIVI, pas la première étape.
  const etape = parseEtape(ETAPES_FIDELITE, etapeParam, "nulle") as
    | EtapeFidelite
    | null;

  const [
    { data: program },
    { data: milestoneRows },
    { data: wheelRows },
    { data: prizeRows },
    { data: orderCodeRows },
  ] = await Promise.all([
    supabase
      .from("loyalty_programs")
      .select(
        "id, organization_id, name, status, validation_mode, rotating_period_seconds, min_stamp_interval_seconds, silver_threshold, gold_threshold, created_at, code_ttl_days",
      )
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("loyalty_milestones")
      .select("*")
      .eq("program_id", id)
      .eq("organization_id", organization.id)
      .order("visit_count", { ascending: true }),
    supabase
      .from("wheels")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
    // Lots actifs de l'organisation : l'éditeur avertit quand la roue ciblée
    // par un palier « tour offert » porte des lots à stock illimité — un tour
    // offert ne les tire jamais (migration 20260725200000).
    supabase
      .from("prizes")
      .select("wheel_id, label, is_losing, stock, weight")
      .eq("organization_id", organization.id)
      .eq("is_active", true),
    // Cartes de commande (§7). LECTURE DE PAGE, donc client de session : la
    // RLS « member select » de `loyalty_order_codes` la porte déjà, et une
    // Server Action de plus n'ajouterait qu'une surface à défendre. Le double
    // `eq` reste posé — la RLS est le filet, pas le filtre.
    supabase
      .from("loyalty_order_codes")
      .select("token, label, consumed_at")
      .eq("program_id", id)
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(ORDER_CODES_LIMIT),
  ]);

  if (!program) notFound();
  const p = program as LoyaltyProgram;
  const milestones = (milestoneRows ?? []) as LoyaltyMilestone[];
  const wheels = toWheelOptions(wheelRows ?? [], prizeRows ?? []);

  // URL ABSOLUE : un QR ne peut pas encoder un chemin relatif. Le passeport n'a
  // PAS de colonne de slug public (contrairement au quiz ou au calendrier) : sa
  // route publique `/passeport/[programId]` est résolue par
  // `loadLoyaltyContext(programId)` sur l'ID du programme — c'est donc `p.id`
  // qu'il faut encoder, et rien d'autre.
  const publicUrl = `${APP_URL}/passeport/${p.id}`;

  // Même exigence pour les cartes de commande : le QR est imprimé sur un bon
  // de livraison, un chemin relatif n'y serait rattachable à aucune origine.
  const orderCodes: OrderCodeCard[] = (orderCodeRows ?? []).map((row) => ({
    token: row.token,
    label: row.label,
    url: `${APP_URL}/commande/${row.token}`,
    consumedAt: row.consumed_at,
  }));
  const openCount = await readModulePageOpenCount(supabase, "loyalty", p.id);

  // Stats agrégées (owner) — org-scopées, honorées par la RLS « member select ».
  let passports = 0;
  let rewardsEarned = 0;
  let rewardsRedeemed = 0;
  if (canViewStats) {
    const [{ count: memberCount }, { count: earnedCount }, { count: redeemedCount }] =
      await Promise.all([
        supabase
          .from("loyalty_members")
          .select("id", { count: "exact", head: true })
          .eq("program_id", id)
          .eq("organization_id", organization.id),
        supabase
          .from("loyalty_rewards")
          .select("id", { count: "exact", head: true })
          .eq("program_id", id)
          .eq("organization_id", organization.id),
        supabase
          .from("loyalty_rewards")
          .select("id", { count: "exact", head: true })
          .eq("program_id", id)
          .eq("organization_id", organization.id)
          .not("redeemed_at", "is", null),
      ]);
    passports = memberCount ?? 0;
    rewardsEarned = earnedCount ?? 0;
    rewardsRedeemed = redeemedCount ?? 0;
  }

  // Relance : un passeport n'a aucune borne temporelle :
  // seul l'archivage le clôt, et c'est bien pourquoi `MarqueursParKind` ne lui
  // demande que son statut.
  const marqueurs = { status: p.status };
  const peutCreerBrouillon = role === "owner" || role === "editor";
  // L'enveloppe repliable suit le MÊME verdict que la carte qu'elle contient :
  // sans ce test, elle restait à l'écran et s'ouvrait sur du vide, parce que
  // `RelaunchFormulaCard` rend `null` tant que l'animation n'est pas
  // terminée. Le pourquoi est écrit une fois, sur `relanceADeQuoiSAfficher`.
  const relance = {
    sourceState: etatSourceRelance("loyalty", marqueurs),
    canCreateDraft: peutCreerBrouillon,
    isSupported: true,
  };

  // LA VÉRIFICATION, CALCULÉE UNE FOIS, AU-DESSUS DU BRANCHEMENT : la vue suivi
  // en tire le verdict de ses tuiles, l'atelier la donne à son étape « La
  // vérification ». Paliers et roues sont déjà chargés — aucune requête de plus.
  const entreeVerification = {
    programId: p.id,
    paliers: milestones.map((m) => ({
      id: m.id,
      visitCount: m.visit_count,
      rewardType: m.reward_type,
      rewardLabel: m.reward_label,
      rewardStock: m.reward_stock,
      targetWheelId: m.target_wheel_id,
    })),
    roues: wheels,
  };
  const tuiles = tuilesDuModule(
    "fidelite",
    construireVerificationFidelite(entreeVerification).controles,
  );

  const cleCourante: EtapeFidelite = etape ?? ETAPES_FIDELITE[0].cle;
  const definition = definitionEtapeFidelite(cleCourante);
  const numero = numeroEtape(ETAPES_FIDELITE, cleCourante);
  const precedente = etapeVoisine(ETAPES_FIDELITE, cleCourante, -1);
  const suivante = etapeVoisine(ETAPES_FIDELITE, cleCourante, 1);
  const hrefPour = (cle: string) => hrefEtapeFidelite(p.id, cle as EtapeFidelite);

  // Le bandeau d'offre se lit sur LES DEUX VUES, comme sur le quiz et le
  // calendrier. Il ne vivait que dans l'atelier : sans add-on, la vue suivi
  // portait « Ouvrir aux joueurs » sans un mot sur la raison du refus à venir.
  const bandeauModule = (
    <ModuleCapabilityNotice capacites={capacites} entitlement="loyalty">
      Passeports de fidélité, niveaux bronze/argent/or, paliers à débloquer et
      cartes de commande.
    </ModuleCapabilityNotice>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/loyalty"
          className="text-sm text-zinc-600 hover:text-k-ink"
        >
          ← Passeport fidélité
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🎟️
          </span>
          <h1 className="text-2xl font-bold">{p.name}</h1>
          <LoyaltyStatusBadge status={p.status} />
        </div>
      </div>

      {bandeauModule}

      {etape === null ? (
        <>
          {/* Seul le statut reste ouvert : c'est le geste de publication. Tout
              le reste naît replié ; l'ancre rouvre le bloc qu'elle vise. */}
          <CarteRepliable {...carteTuile(tuiles, "statut")}>
            <LoyaltyStatusControls
              program={p}
              milestoneCount={milestones.length}
              hrefJeu={p.status === "active" ? publicUrl : null}
            />
          </CarteRepliable>

          <CarteRepliable
            {...carteTuile(tuiles, "atelier")}
            defaultOuvert={false}
            resume={`${ETAPES_FIDELITE.length} étapes de préparation.`}
          >
            <CarteEntreeAtelier programId={p.id} />
          </CarteRepliable>

          {canViewStats && (
            <CarteRepliable
              {...carteTuile(tuiles, "apercu")}
              defaultOuvert={false}
              resume={`${milestones.length} palier${milestones.length > 1 ? "s" : ""} — ${passports} passeport${passports > 1 ? "s" : ""}`}
            >
              <Card>
                <h2 className="font-semibold mb-4">En un coup d&apos;œil</h2>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Paliers" value={milestones.length} />
                  <Stat label="Passeports" value={passports} />
                  <Stat label="Récompenses" value={rewardsEarned} />
                  <Stat label="Lots remis" value={rewardsRedeemed} />
                </dl>
              </Card>
            </CarteRepliable>
          )}

          {/* §4 du cahier : chaque expérience joueur publiable propose un QR et
              un lien. Le QR n'est rendu QUE si le programme est actif : c'est la
              garde exacte de `loadLoyaltyContext` (statut ≠ active → 404), et un
              QR imprimé puis collé en vitrine survit à la page qui l'a produit
              là où un bandeau d'avertissement, non. */}
          <CarteRepliable
            {...carteTuile(tuiles, "partage")}
            defaultOuvert={false}
            resume={
              p.status === "active"
                ? `${openCount} ouverture${openCount > 1 ? "s" : ""} de la page publique`
                : "Programme non actif — pas encore de QR code"
            }
          >
            <Card>
              <h2 className="font-semibold mb-1">QR code et lien du passeport</h2>
              {p.status === "active" ? (
                <>
                  <p className="text-sm text-zinc-500 mb-3">
                    Affichez le QR code en boutique ou partagez le lien : vos
                    clients ouvrent leur passeport de fidélité depuis leur
                    téléphone.
                  </p>
                  <PublicShare
                    url={publicUrl}
                    fileName={`passeport-${p.id}`}
                    qrLabel={p.name}
                    openCount={openCount}
                  />
                </>
              ) : (
                <p className="text-sm text-zinc-500">
                  Activez le programme pour obtenir son QR code et son lien :
                  tant qu&apos;il n&apos;est pas actif, la page publique reste
                  fermée aux clients.
                </p>
              )}
            </Card>
          </CarteRepliable>

          {p.validation_mode === "rotating_code" && (
            <CarteRepliable
              {...carteTuile(tuiles, "comptoir")}
              defaultOuvert={false}
              resume="Le code tournant à afficher face aux clients"
            >
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className={cn(TITRE_SURLIGNE, "mb-1")}>
                    Écran comptoir
                  </h2>
                  <p className="text-sm text-zinc-500">
                    Affichez le code tournant face aux clients pour qu&apos;ils
                    valident leur visite.
                  </p>
                </div>
                <Link
                  href={`/dashboard/loyalty/${p.id}/comptoir`}
                  className="k-btn-sm inline-flex items-center gap-2 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-bold text-k-ink"
                >
                  Ouvrir l&apos;écran comptoir →
                </Link>
              </Card>
            </CarteRepliable>
          )}

          <RelanceErreur message={relanceError} />

          {capacites.canExplore && relanceADeQuoiSAfficher(relance) && (
            <CarteRepliable
              {...carteTuile(tuiles, "relance")}
              defaultOuvert={false}
              resume="Repartir de ce programme pour en créer un nouveau"
            >
              <RelaunchFormulaCard
                sourceName={p.name}
                {...relance}
                action={<RelaunchFormulaAction kind="loyalty" sourceId={p.id} />}
              />
            </CarteRepliable>
          )}
        </>
      ) : (
        <>
          <AtelierStepper
            etapes={ETAPES_FIDELITE}
            courante={cleCourante}
            hrefPour={hrefPour}
          />

          <section
            aria-label={`Étape ${numero} sur ${ETAPES_FIDELITE.length} — ${definition.titre}`}
            className="space-y-4"
          >
            {etape === "programme" && <LoyaltySettings program={p} />}

            {etape === "recompenses" && (
              <>
                <LoyaltyMilestonesEditor
                  programId={p.id}
                  milestones={milestones}
                  wheels={wheels}
                />
                <InfoBulle
                  id="aide-recompenses-roue"
                  resume="Un palier « tour de roue offert » a besoin d'une roue prête"
                >
                  Le tour offert se joue sur une roue de vos campagnes, et il
                  n&apos;en tire que les lots qui ont un stock. Si la roue
                  choisie n&apos;a que des lots illimités, le client verra
                  « aucun lot à distribuer » et conservera son tour. Réglez ces
                  stocks depuis la page de la campagne concernée, puis revenez
                  ici — votre palier vous attend.
                </InfoBulle>
              </>
            )}

            {etape === "cartes" && (
              <>
                <p className="rounded-2xl border-2 border-k-ink/25 bg-white p-4 text-sm font-semibold text-k-body">
                  Étape facultative : un programme s&apos;ouvre très bien sans
                  avoir émis une seule carte. Elle sert aux commandes livrées —
                  le client scanne le QR glissé dans son colis et tamponne sa
                  visite sans passer en boutique.
                  {orderCodes.length >= ORDER_CODES_LIMIT && (
                    <>
                      {" "}
                      Cet écran n&apos;affiche que les {ORDER_CODES_LIMIT}{" "}
                      cartes les plus récentes ; les plus anciennes restent
                      valables même si elles ne sont plus listées ici.
                    </>
                  )}
                </p>
                <OrderCodeCards programId={p.id} codes={orderCodes} />
              </>
            )}

            {etape === "verification" && (
              <AtelierVerificationFidelite
                modeValidation={p.validation_mode}
                entree={entreeVerification}
              />
            )}
          </section>

          <AtelierNavigationEtape
            precedente={precedente}
            suivante={suivante}
            hrefPour={hrefPour}
          />

          <p>
            <Link
              href={`/dashboard/loyalty/${p.id}`}
              className="text-sm font-bold text-k-body hover:text-k-ink"
            >
              ← Retour au suivi du programme
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

/**
 * LA PORTE DE L'ATELIER, sur la vue suivi. Les quatre étapes en liens plutôt
 * qu'un bouton unique : celui qui revient changer UNE chose sait où elle se
 * règle. Le rendu est celui, partagé, d'`atelier-entree.tsx` ; ne reste ici
 * que le texte propre au passeport.
 */
function CarteEntreeAtelier({ programId }: { programId: string }) {
  return (
    <AtelierEntree
      etapes={ETAPES_FIDELITE}
      hrefPour={(cle) => hrefEtapeFidelite(programId, cle as EtapeFidelite)}
      titre="L'atelier du passeport"
      sousTitre="Quatre étapes pour préparer votre programme, des règles de visite aux récompenses. Chaque étape s'enregistre pour elle-même : vous pouvez vous arrêter et revenir."
    />
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
