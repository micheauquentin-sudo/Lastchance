import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import {
  etapeVoisine,
  numeroEtape,
  parseEtape,
} from "@/components/dashboard/atelier-etapes";
import {
  definitionEtapeRoue,
  ETAPES_ROUE,
  hrefEtapeRoue,
  type EtapeRoue,
} from "@/components/dashboard/atelier-roue-etapes";
import {
  AtelierNavigationEtape,
  AtelierStepper,
} from "@/components/dashboard/atelier-stepper";
import { AtelierVerification } from "@/components/dashboard/atelier-verification";
import { CampaignPrejeuInvitation } from "@/components/dashboard/campaign-prejeu-invitation";
import { CampaignClaimSettings } from "@/components/dashboard/campaign-play-settings";
import { CampaignShareSettings } from "@/components/dashboard/campaign-share-settings";
import {
  ReferralProgramSettings,
  type ReferralProgramRow,
} from "@/components/dashboard/referral-program-settings";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { PrizeEditor } from "@/components/dashboard/prize-editor";
import { WheelScheduleEditor } from "@/components/dashboard/wheel-schedule-editor";
import { WheelSettings } from "@/components/dashboard/wheel-settings";
import { WheelStyleEditor } from "@/components/dashboard/wheel-style-editor";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { hasReferralAccess } from "@/lib/referral-context";
import { Card } from "@/components/ui/card";
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
  // La roue n'a PAS de vue suivi : l'absence de `?etape=` rend la première
  // étape (politique « premiere »), comme avant l'extraction des primitives.
  const etape = parseEtape(ETAPES_ROUE, etapeParam, "premiere") as EtapeRoue;
  const { organization } = await getUserAndOrg();
  const supabase = await createClient();

  // Multi-roues : on liste les roues de la campagne (triées par
  // position) et on configure celle demandée (?wheel=) sinon la
  // première. Lots embarqués via la FK prizes→wheels.
  //
  // La campagne et le compte de QR ne servent qu'à l'étape de vérification,
  // mais ils partent dans la MÊME salve : trois allers-retours en parallèle
  // coûtent le plus lent, trois en série coûtent leur somme.
  const [
    { data: wheelsData },
    { data: campaignData },
    { count: qrCount },
    { data: referralProgram },
    { data: liensOrg },
    capacites,
  ] = await Promise.all([
      supabase
        .from("wheels")
        .select("*, prizes!prizes_wheel_id_fkey(*)")
        .eq("campaign_id", id)
        .eq("organization_id", organization!.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      // LA CAMPAGNE ENTIÈRE, et non cinq colonnes. Les étapes « Le parcours
      // joueur » et « Le partage » rendent `CampaignClaimSettings`, qui prend
      // la campagne complète — la même que la page de suivi lui passe. Une
      // sélection partielle obligerait à énumérer ici les colonnes de claim,
      // et à les tenir à jour à deux endroits.
      supabase
        .from("campaigns")
        .select("*")
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
      // MÊMES REQUÊTES QUE LA PAGE DE SUIVI, au champ près : les deux écrans
      // règlent la même chose et doivent lire la même chose.
      supabase
        .from("referral_programs")
        .select(
          "enabled, chest_threshold, sponsor_max_filleuls, window_days, sponsor_reward_kind, sponsor_reward_label, sponsor_reward_details, sponsor_reward_stock, filleul_reward_kind, filleul_reward_label, filleul_reward_details, filleul_reward_stock, chest_reward_kind, chest_reward_label, chest_reward_details, chest_reward_stock, code_ttl_days",
        )
        .eq("campaign_id", id)
        .eq("organization_id", organization!.id)
        .maybeSingle(),
      supabase
        .from("organizations")
        .select("google_review_url, instagram_url, tiktok_url")
        .eq("id", organization!.id)
        .maybeSingle(),
      // Lue DÈS L'ENTRÉE : on ne guide pas quelqu'un pendant cinq étapes pour
      // lui refuser la sixième. Le bandeau ne ferme rien — la préparation
      // reste ouverte, seule la publication est verrouillée, et elle l'est en
      // base (`assert_module_publish_allowed`).
      capacitesDuModule("wheel"),
    ]);

  const wheels = (wheelsData ?? []) as (Wheel & { prizes: Prize[] })[];
  if (wheels.length === 0 || !campaignData) notFound();

  const campagne = campaignData as Campaign;
  // Sans un seul lien renseigné, cocher « Avant de jouer » n'afficherait rien
  // au joueur : le bloc renvoie alors vers les Réglages. Même prédicat que la
  // page de suivi.
  const liens = liensOrg as {
    google_review_url: string | null;
    instagram_url: string | null;
    tiktok_url: string | null;
  } | null;
  const aDesLiens = Boolean(
    liens?.google_review_url || liens?.instagram_url || liens?.tiktok_url,
  );
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

  const definition = definitionEtapeRoue(etape);
  const numero = numeroEtape(ETAPES_ROUE, etape);
  const precedente = etapeVoisine(ETAPES_ROUE, etape, -1);
  const suivante = etapeVoisine(ETAPES_ROUE, etape, 1);
  // Le seul endroit qui connaît la base d'URL et ses porteurs : la page.
  const hrefPour = (cle: string) => hrefEtapeRoue(id, cle as EtapeRoue, w.id);

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
              href={hrefEtapeRoue(id, etape, wh.id)}
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

      <AtelierStepper
        etapes={ETAPES_ROUE}
        courante={etape}
        hrefPour={hrefPour}
      />

      <section
        aria-label={`Étape ${numero} sur ${ETAPES_ROUE.length} — ${definition.titre}`}
      >
        {/* `organizationName` et les lots ne servent qu'à l'APERÇU VIVANT de
            l'étape : le nom du commerce en kicker, les vrais segments quand la
            mécanique choisie est la roue — exactement ce que reçoit l'aperçu de
            l'étape « L'habillage ». */}
        {etape === "jeu" && (
          <WheelSettings
            wheel={w}
            campaignId={id}
            organizationName={organization!.name}
            segments={activePrizes.map((p) => ({
              id: p.id,
              label: p.label,
              color: p.color,
            }))}
          />
        )}

        {etape === "lots" && (
          <PrizeEditor
            wheelId={w.id}
            prizes={allPrizes}
            totalWeight={totalWeight}
          />
        )}

        {/* La carte à gratter n'a plus de cas spécial. Elle recevait ici un
            renvoi — « repassez en mode Roue pour régler les couleurs, un
            habillage dédié arrive prochainement » — qui laissait la seule
            mécanique du produit à n'avoir AUCUN écran d'habillage. Elle a
            désormais le sien comme les quatorze autres : `porteeHabillage`
            réduit les contrôles à ce que le jeu rend vraiment, et la section
            « Ce jeu » lui donne les trois teintes de sa couche à gratter. */}
        {etape === "habillage" && (
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
        )}

        {etape === "creneau" && <WheelScheduleEditor wheel={w} />}

        {etape === "parcours" && (
          <div className="space-y-6">
            <CampaignPrejeuInvitation
              campaignId={id}
              enabled={campagne.prejeu_invitation}
              aDesLiens={aDesLiens}
            />
            <CampaignClaimSettings campaign={campagne} />
          </div>
        )}

        {/* UNE SEULE `Card`, deux sections séparées par un filet — la forme
            qu'a prise la tuile « Partage et parrainage » de la page de suivi
            après qu'un second `Card` y ait flotté hors du cadre. */}
        {etape === "partage" && (
          <Card>
            <h2 className="mb-1 font-black text-k-ink">Partage et parrainage</h2>
            <div className="mt-4">
              <CampaignShareSettings
                campaignId={id}
                enabled={campagne.share_enabled}
              />
            </div>
            <div className="mt-5 border-t border-zinc-100 pt-4">
              <ReferralProgramSettings
                campaignId={id}
                program={(referralProgram as ReferralProgramRow | null) ?? null}
                hasAccess={hasReferralAccess(organization!)}
              />
            </div>
          </Card>
        )}

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
        precedente={precedente}
        suivante={suivante}
        hrefPour={hrefPour}
      />
    </div>
  );
}
