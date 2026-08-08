import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { CarteRepliable } from "@/components/dashboard/carte-repliable";
import { CampaignPrejeuInvitation } from "@/components/dashboard/campaign-prejeu-invitation";
import { NewQrForm } from "@/components/dashboard/qr-forms";
import { QrCodeCard } from "@/components/dashboard/qr-code-card";
import { CampaignStatusBadge } from "@/components/dashboard/campaign-status";
import {
  CampaignAutomationSettings,
  CampaignStateBanner,
} from "@/components/dashboard/campaign-automation";
import {
  CampaignSettings,
  CampaignStatusControls,
} from "@/components/dashboard/campaign-settings";
import { CampaignWheels } from "@/components/dashboard/campaign-wheels";
import {
  PrizePerformance,
  type PrizePerformanceRow,
} from "@/components/dashboard/prize-performance";
import {
  CampaignClaimSettings,
} from "@/components/dashboard/campaign-play-settings";
import {
  ReferralProgramSettings,
  type ReferralProgramRow,
} from "@/components/dashboard/referral-program-settings";
import { SaveCampaignAsTemplate } from "@/components/dashboard/save-campaign-as-template";
import { GuidedJourney } from "@/components/dashboard/guided-journey";
import { campaignWindowState } from "@/lib/campaign-window";
import {
  conclusionAventure,
  construireEtapesAventure,
} from "@/lib/experience-lifecycle";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { hasReferralAccess } from "@/lib/referral-context";
import { selectActiveWheel } from "@/lib/wheel-schedule";
import type { Campaign, QrCode, Wheel } from "@/types/database";

export const metadata: Metadata = { title: "Campagne" };

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization, role } = await getUserAndOrg();
  const supabase = await createClient();
  // Même règle que la barre latérale (`nav.tsx`) pour l'onglet « QR codes » :
  // le formulaire de création n'apparaît que pour qui y avait déjà accès.
  // `createQrCode` n'a pas de garde de rôle applicative — l'UI ne doit donc
  // surtout pas élargir l'exposition.
  const peutCreerQr = role === "owner" || role === "editor";

  // Campagne, roues (multi-roues, triées par position) et performance
  // par lot en parallèle. Si la campagne n'existe pas, on 404.
  const [
    { data: campaign },
    { data: wheels },
    { data: perf },
    { count: shareCount },
    { data: referralProgram },
    { data: qrRows },
    { data: liensOrg },
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organization!.id)
      .maybeSingle(),
    supabase
      .from("wheels")
      .select("*")
      .eq("campaign_id", id)
      .eq("organization_id", organization!.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.rpc("campaign_prize_performance", { p_campaign_id: id }),
    supabase
      .from("spins")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("source", "share"),
    // Parrainage : programme opt-in de la campagne (RLS membre ; null = pas
    // encore configuré → défauts côté éditeur).
    supabase
      .from("referral_programs")
      .select(
        "enabled, chest_threshold, sponsor_max_filleuls, window_days, sponsor_reward_kind, sponsor_reward_label, sponsor_reward_details, sponsor_reward_stock, filleul_reward_kind, filleul_reward_label, filleul_reward_details, filleul_reward_stock, chest_reward_kind, chest_reward_label, chest_reward_details, chest_reward_stock, code_ttl_days",
      )
      .eq("campaign_id", id)
      .eq("organization_id", organization!.id)
      .maybeSingle(),
    // Les QR de CETTE campagne, pour les montrer et en créer sans quitter
    // l'écran. Bornés à 6 : au-delà, « Gérer tous les QR codes » mène à
    // l'onglet dédié, qui pagine.
    supabase
      .from("qr_codes")
      .select("*")
      .eq("organization_id", organization!.id)
      .eq("campaign_id", id)
      .order("created_at", { ascending: false })
      .limit(6),
    // Les trois liens sociaux de la maison — lus ICI et non via `getUserAndOrg` :
    // seul le bloc « Avant de jouer » s'en sert, et il n'a besoin que de savoir
    // s'il en existe AU MOINS UN. Trois colonnes de plus dans le `select` du
    // layout seraient payées par tout le dashboard. Grant `select` explicite
    // accordé à `authenticated` (migration 20260918120000).
    supabase
      .from("organizations")
      .select("google_review_url, instagram_url, tiktok_url")
      .eq("id", organization!.id)
      .maybeSingle(),
  ]);

  if (!campaign) notFound();

  const c = campaign as Campaign;
  const wheelList = (wheels ?? []) as Wheel[];
  const perfRows = (perf ?? []) as PrizePerformanceRow[];
  const qrCodes = (qrRows ?? []) as QrCode[];
  // Aperçu live : quelle roue /play servirait à l'instant présent
  // (même logique que le parcours public, voir lib/wheel-schedule.ts).
  const activeWheelId = selectActiveWheel(wheelList)?.id ?? null;
  // Jouabilité réelle : même prédicat que /play (lib/campaign-window.ts).
  // Server Component, donc `new Date()` au rendu ne risque aucun décalage
  // d'hydratation.
  const windowState = campaignWindowState(c);
  // Au moins un lien social renseigné ? Sans quoi cocher « Avant de jouer »
  // n'afficherait rien au joueur — le bloc renvoie alors vers les Réglages.
  const aDesLiens = Boolean(
    liensOrg?.google_review_url || liensOrg?.instagram_url || liensOrg?.tiktok_url,
  );

  // Carte de l'Aventure seule : une campagne se recopie déjà par « Dupliquer »
  // et par les modèles, qui emportent la roue, ses lots et son style — ce que
  // « Relancer une formule » ne saurait pas faire.
  //
  // Les marqueurs portent `starts_at`/`ends_at` bruts : `construireEtapesAventure`
  // repasse par `campaignWindowState`, la MÊME fonction que `windowState`
  // ci-dessus. Rien n'est recalculé deux fois de deux façons.
  const capacites = await capacitesDuModule("wheel");
  const etapes = construireEtapesAventure({
    marqueurs: {
      kind: "campaign",
      status: c.status,
      starts_at: c.starts_at,
      ends_at: c.ends_at,
    },
    capacites,
    liens: {
      // Le vrai travail de brouillon d'une campagne, c'est la roue et ses lots :
      // l'étape mène donc à SA page, pas à un ancrage de la page courante.
      editeur: `/dashboard/campaigns/${c.id}/wheel`,
      // Une campagne n'a pas d'URL publique unique : ses QR sont sa porte
      // d'entrée, et c'est de là qu'on teste.
      apercu: `/dashboard/qr-codes?campaign=${c.id}`,
      suivi: "#suivi",
      statut: "#statut",
    },
  });
  // Pas de carte « Repartir de cette formule » sur une campagne (décision :
  // « Dupliquer » et les modèles font mieux) — le CTA vise donc les réglages,
  // où vit « Dupliquer cette campagne ».
  const conclusion = conclusionAventure(etapes, { relanceHref: "#reglages" });

  return (
    <div>
      <Link
        href="/dashboard/campaigns"
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        ← Jeux instantanés
      </Link>

      <div className="flex items-center justify-between gap-4 mt-3 mb-8">
        <h1 className="text-2xl font-bold truncate">{c.name}</h1>
        <CampaignStatusBadge status={c.status} windowState={windowState} />
      </div>

      {((c.status === "paused" && c.paused_reason) ||
        (c.status === "active" && windowState !== "open")) && (
        <div className="mb-6">
          <CampaignStateBanner
            campaign={c}
            windowState={windowState}
            interactive
          />
        </div>
      )}

      <div className="mb-6">
        <GuidedJourney
          steps={etapes}
          title="Carte de l'Aventure"
          conclusion={conclusion}
        />
      </div>

      <div id="statut" className="mb-6 scroll-mt-24">
        <CampaignStatusControls campaign={c} />
      </div>

      <div className="mb-6">
        {wheelList.length > 0 ? (
          <CampaignWheels
            campaignId={c.id}
            wheels={wheelList}
            activeWheelId={activeWheelId}
          />
        ) : (
          <Card>
            <h2 className="font-semibold mb-1">Vos jeux</h2>
            <p className="text-sm text-red-600">Roue manquante</p>
          </Card>
        )}
      </div>

      {/* Le bloc QR sort de l'ancienne grille deux colonnes : il porte
          désormais des vignettes et un formulaire, une demi-colonne ne les
          tenait plus. */}
      <div className="mb-6">
        <CarteRepliable titre="QR codes" id="qr">
        <Card>
          <h2 className="mb-1 font-black text-k-ink">QR codes</h2>
          <p className="mb-4 text-sm font-bold text-k-body">
            Le lien que scannent vos clients — créez-le et imprimez-le ici, sans
            quitter la page du jeu.
          </p>

          {qrCodes.length === 0 ? (
            <p className="mb-4 text-sm font-bold text-k-body">
              Aucun QR code pour l&apos;instant : sans lui, personne ne peut
              accéder au jeu.
            </p>
          ) : (
            <ul className="mb-4 grid gap-4 xl:grid-cols-2">
              {qrCodes.map((qr) => (
                <li key={qr.id}>
                  <QrCodeCard
                    id={qr.id}
                    slug={qr.slug}
                    label={qr.label}
                    campaignName={c.name}
                    // URL absolue obligatoire : un QR encode un lien, pas un
                    // chemin relatif.
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

          {peutCreerQr && (
            <div className="border-t-2 border-k-ink/10 pt-4">
              <NewQrForm
                campaigns={[{ id: c.id, name: c.name }]}
                defaultCampaignId={c.id}
                campagneFigee
                instanceId="campagne"
              />
            </div>
          )}

          <p className="mt-4">
            <Link
              href={`/dashboard/qr-codes?campaign=${c.id}`}
              className="text-sm font-bold text-k-orange hover:underline"
            >
              Gérer tous les QR codes
            </Link>
          </p>

          {(shareCount ?? 0) > 0 && (
            <p className="mt-4 text-sm font-bold text-k-body">
              🔗 <span className="font-black text-k-ink">{shareCount}</span>{" "}
              partie{(shareCount ?? 0) > 1 ? "s" : ""} via un lien partagé.
            </p>
          )}
        </Card>
        </CarteRepliable>
      </div>

      {/* Les six blocs de réglage se replient. Ils restent OUVERTS par défaut :
          les ancres `#suivi` et `#reglages` doivent mener à du contenu visible,
          et les parcours E2E cliquent dedans sans les déplier. */}
      <div className="mb-6">
        <CarteRepliable titre="Performance par lot" id="suivi">
          <PrizePerformance rows={perfRows} />
        </CarteRepliable>
      </div>

      <div className="mb-6">
        <CarteRepliable titre="Avant de jouer">
          <CampaignPrejeuInvitation
            campaignId={c.id}
            enabled={c.prejeu_invitation}
            aDesLiens={aDesLiens}
          />
        </CarteRepliable>
      </div>

      <div className="mb-6">
        <CarteRepliable titre="Après le gain">
          <CampaignClaimSettings campaign={c} />
        </CarteRepliable>
      </div>

      <div className="mb-6">
        <CarteRepliable titre="Programmation et budget">
          <CampaignAutomationSettings
            campaign={c}
            timeZone={organization!.timezone}
          />
        </CarteRepliable>
      </div>

      <div className="mb-6">
        <CarteRepliable titre="Parrainage ludique">
          <ReferralProgramSettings
            campaignId={c.id}
            program={(referralProgram as ReferralProgramRow | null) ?? null}
            hasAccess={hasReferralAccess(organization!)}
          />
        </CarteRepliable>
      </div>

      <div className="mb-6">
        <CarteRepliable titre="Enregistrer comme modèle">
          <SaveCampaignAsTemplate campaignId={c.id} campaignName={c.name} />
        </CarteRepliable>
      </div>

      <CarteRepliable titre="Réglages" id="reglages">
        <CampaignSettings campaign={c} />
      </CarteRepliable>
    </div>
  );
}
