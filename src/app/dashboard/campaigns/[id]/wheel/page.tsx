import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import {
  definitionEtape,
  etapePrecedente,
  etapeSuivante,
  hrefEtapeAtelier,
  parseEtapeAtelier,
} from "@/components/dashboard/atelier-etapes";
import {
  AtelierNavigationEtape,
  AtelierStepper,
} from "@/components/dashboard/atelier-stepper";
import { AtelierVerification } from "@/components/dashboard/atelier-verification";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { PrizeEditor } from "@/components/dashboard/prize-editor";
import { WheelScheduleEditor } from "@/components/dashboard/wheel-schedule-editor";
import { WheelSettings } from "@/components/dashboard/wheel-settings";
import { WheelStyleEditor } from "@/components/dashboard/wheel-style-editor";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import type { Campaign, Prize, Wheel } from "@/types/database";

export const metadata: Metadata = { title: "L'atelier du jeu" };

/**
 * L'ATELIER DU JEU — la page de configuration de la roue, en cinq étapes.
 *
 * ── POURQUOI L'ÉTAPE EST DANS LA QUERY STRING, ET PAS DANS LA ROUTE ──
 *
 * Cette page rendait ~100 contrôles d'un seul tenant et huit boutons
 * « Enregistrer » indépendants, sans qu'aucun écran ne dise lesquels
 * restaient à cliquer. Elle est découpée — mais SUR PLACE : six
 * `revalidatePath(.../wheel)` dans `src/actions/prizes.ts` et trois écrans
 * (Carte de l'Aventure, hero du tableau de bord, liste des roues) citent
 * cette URL. Une route `.../wheel/assistant/[etape]` aurait fait de ces neuf
 * références des chemins morts pour gagner une barre d'adresse plus jolie.
 *
 * ── UNE ÉTAPE = UN POST COMPLET DE SON ACTION EXISTANTE ──
 *
 * Aucune nouvelle action serveur, aucun nouveau module de validation. Jeu →
 * `updateWheel`, Lots → `addPrize`/`updatePrize`/`deletePrize` (par ligne : le
 * compare-and-swap `stock_seen` l'exige), Habillage → `updateWheelStyle`,
 * Créneau → `updateWheelSchedule`. Jamais un champ requis d'une autre étape
 * reposté en caché : c'est précisément le défaut que les gardes de
 * `champ-formulaire` existent pour fermer.
 *
 * La cinquième étape n'écrit rien et ne publie pas : elle vérifie, puis
 * renvoie vers le seul écran qui publie (`/dashboard/campaigns/<id>#statut`).
 */
export default async function WheelConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ wheel?: string; etape?: string }>;
}) {
  const { id } = await params;
  const { wheel: wheelParam, etape: etapeParam } = await searchParams;
  const etape = parseEtapeAtelier(etapeParam);
  const { organization } = await getUserAndOrg();
  const supabase = await createClient();

  // Multi-roues : on liste les roues de la campagne (triées par
  // position) et on configure celle demandée (?wheel=) sinon la
  // première. Lots embarqués via la FK prizes→wheels.
  //
  // La campagne et le compte de QR ne servent qu'à l'étape de vérification,
  // mais ils partent dans la MÊME salve : trois allers-retours en parallèle
  // coûtent le plus lent, trois en série coûtent leur somme.
  const [{ data: wheelsData }, { data: campaignData }, { count: qrCount }, capacites] =
    await Promise.all([
      supabase
        .from("wheels")
        .select("*, prizes!prizes_wheel_id_fkey(*)")
        .eq("campaign_id", id)
        .eq("organization_id", organization!.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("campaigns")
        .select("id, name, status, starts_at, ends_at")
        .eq("id", id)
        .eq("organization_id", organization!.id)
        .maybeSingle(),
      // Lecture RLS simple, comme /dashboard/qr-codes : on ne veut savoir
      // qu'une chose — vos clients ont-ils une porte d'entrée ?
      supabase
        .from("qr_codes")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("organization_id", organization!.id),
      // Lue DÈS L'ENTRÉE : on ne guide pas quelqu'un pendant cinq étapes pour
      // lui refuser la sixième. Le bandeau ne ferme rien — la préparation
      // reste ouverte, seule la publication est verrouillée, et elle l'est en
      // base (`assert_module_publish_allowed`).
      capacitesDuModule("wheel"),
    ]);

  const wheels = (wheelsData ?? []) as (Wheel & { prizes: Prize[] })[];
  if (wheels.length === 0 || !campaignData) notFound();

  const campagne = campaignData as Pick<
    Campaign,
    "id" | "name" | "status" | "starts_at" | "ends_at"
  >;
  const selected = wheels.find((wh) => wh.id === wheelParam) ?? wheels[0];
  const { prizes: embeddedPrizes, ...w } = selected;
  const allPrizes = (embeddedPrizes ?? []).sort(
    (a, b) =>
      a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  const activePrizes = allPrizes.filter((p) => p.is_active);
  // MIROIR EXACT de la condition du moteur (`perform_atomic_spin` :
  // `p.is_losing or p.stock is null or p.stock > 0`). Un lot épuisé n'est
  // plus tiré ; le compter dans le total affichait des probabilités FAUSSES —
  // le lot à zéro gardait son « ~40 % » et tous les autres apparaissaient
  // sous leur chance réelle. Le commerçant recalibrait ses poids sur une
  // distribution qui n'existait plus.
  const tirablePrizes = activePrizes.filter(
    (p) => p.is_losing || p.stock === null || p.stock > 0,
  );
  const totalWeight = tirablePrizes.reduce((a, p) => a + p.weight, 0);

  const definition = definitionEtape(etape);
  const precedente = etapePrecedente(etape);
  const suivante = etapeSuivante(etape);

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="L'atelier du jeu"
        sousTitre={
          <>
            Cinq étapes pour préparer « {w.name} », de la mécanique à la
            vérification. Chaque étape s&apos;enregistre pour elle-même : vous
            pouvez vous arrêter et revenir.
          </>
        }
        retour={{ href: `/dashboard/campaigns/${id}`, label: campagne.name }}
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="core">
        Roue, carte à gratter et treize autres mécaniques, lots à stock et
        budget, QR codes personnalisés et remise en caisse.
      </ModuleCapabilityNotice>

      {wheels.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {wheels.map((wh) => (
            <Link
              key={wh.id}
              href={hrefEtapeAtelier(id, etape, wh.id)}
              aria-current={wh.id === w.id ? "true" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                wh.id === w.id
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {wh.name}
            </Link>
          ))}
        </div>
      )}

      <AtelierStepper campaignId={id} wheelId={w.id} courante={etape} />

      <section aria-label={`Étape ${definition.numero} sur 5 — ${definition.label}`}>
        {etape === "jeu" && <WheelSettings wheel={w} campaignId={id} />}

        {etape === "lots" && (
          <PrizeEditor
            wheelId={w.id}
            prizes={allPrizes}
            totalWeight={totalWeight}
          />
        )}

        {etape === "habillage" &&
          // La carte à gratter n'a pas d'habillage dédié : lui présenter
          // l'éditeur de roue serait lui faire régler douze contrôles sans
          // effet. Le message existant est conservé, corrigé de son « styles
          // ci-dessous » qui ne désignait rien.
          (w.game_type === "scratch" ? (
            <p className="rounded-2xl border-2 border-k-ink/25 bg-white p-4 text-sm font-semibold text-k-body">
              La carte à gratter reprend les couleurs du bouton de jeu, réglables
              ici une fois repassé en mode « Roue » à l&apos;étape « Le jeu ». Un
              habillage dédié à la carte arrive prochainement.
            </p>
          ) : (
            <WheelStyleEditor
              wheelId={w.id}
              initialStyle={w.style}
              gameType={w.game_type}
              organizationName={organization!.name}
              segments={activePrizes.map((p) => ({
                id: p.id,
                label: p.label,
                color: p.color,
              }))}
            />
          ))}

        {etape === "creneau" && <WheelScheduleEditor wheel={w} />}

        {etape === "verification" && (
          <AtelierVerification
            wheelId={w.id}
            entree={{
              campaignId: id,
              gameType: w.game_type,
              skillConfig: (w as { skill_config?: unknown }).skill_config ?? null,
              prizes: allPrizes.map((p) => ({
                is_active: p.is_active,
                is_losing: p.is_losing,
                weight: p.weight,
                stock: p.stock,
              })),
              qrExistant: (qrCount ?? 0) > 0,
              campagne: {
                status: campagne.status,
                starts_at: campagne.starts_at,
                ends_at: campagne.ends_at,
              },
            }}
          />
        )}
      </section>

      <AtelierNavigationEtape
        campaignId={id}
        wheelId={w.id}
        precedente={precedente ? { cle: precedente.cle, label: precedente.label } : null}
        suivante={suivante ? { cle: suivante.cle, label: suivante.label } : null}
      />
    </div>
  );
}
