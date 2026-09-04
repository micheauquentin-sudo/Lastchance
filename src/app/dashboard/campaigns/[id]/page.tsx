import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { CarteRepliable } from "@/components/dashboard/carte-repliable";
import { CampaignPrejeuInvitation } from "@/components/dashboard/campaign-prejeu-invitation";
import { CampaignShareSettings } from "@/components/dashboard/campaign-share-settings";
import { NewQrForm } from "@/components/dashboard/qr-forms";
import { QrCodeCard } from "@/components/dashboard/qr-code-card";
import {
  CampaignStatusBadgeLive,
  CampaignStatusProvider,
} from "@/components/dashboard/campaign-status-live";
import {
  CampaignAutomationSettings,
  CampaignStateBanner,
} from "@/components/dashboard/campaign-automation";
import {
  SupprimerCampagne,
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
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { construireVerification } from "@/components/dashboard/atelier-verification-state";
import type { ControleBrut } from "@/lib/checklist/controles";
import { tuilesDuModule, type TuileRendue } from "@/lib/checklist/tuiles";
import { campaignWindowState } from "@/lib/campaign-window";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { hasReferralAccess } from "@/lib/referral-context";
import { selectActiveWheel } from "@/lib/wheel-schedule";
import type { Campaign, Prize, QrCode, Wheel } from "@/types/database";

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
    { data: campaign, error: campaignError },
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
    // Les lots partent DANS la même requête que les roues (FK
    // prizes→wheels) : la checklist de la page a besoin d'eux pour dire si un
    // lot gagnant est encore tirable, et un second aller-retour coûterait plus
    // cher que les quelques lignes embarquées.
    supabase
      .from("wheels")
      .select("*, prizes!prizes_wheel_id_fkey(*)")
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

  // Une panne de lecture ne veut pas dire que la campagne n'existe pas. La
  // confondre avec un 404 envoyait le commerçant sur une page "introuvable"
  // juste après une publication pourtant réussie.
  if (campaignError) throw new Error("Impossible de charger la campagne");
  if (!campaign) notFound();

  const c = campaign as Campaign;
  const wheelsAvecLots = (wheels ?? []) as (Wheel & { prizes: Prize[] })[];
  // Les lots ne franchissent pas la frontière client : `CampaignWheels` est un
  // composant client et n'en a pas l'usage.
  const wheelList: Wheel[] = wheelsAvecLots.map((roue) => {
    const sansLots: Wheel & { prizes?: Prize[] } = { ...roue };
    delete sansLots.prizes;
    return sansLots;
  });
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

  // Une campagne se recopie déjà par « Dupliquer » et par les modèles, qui
  // emportent la roue, ses lots et son style — ce que « Relancer une formule »
  // ne saurait pas faire.
  //
  const capacites = await capacitesDuModule("wheel");

  // ── LA CHECKLIST DE LA PAGE ──
  //
  // Elle se calcule sur la MÊME roue que celle qu'ouvre « Régler le jeu et les
  // lots » : l'atelier sans `?wheel=` retient `wheels[0]` (page `/wheel`, tri
  // position puis created_at), donc la première de cette liste, déjà triée
  // pareil. Numéroter des blocs d'après une roue que le CTA n'ouvre pas ferait
  // pointer un point rouge sur un écran où il n'y a rien à corriger.
  //
  // `construireVerification` est la fonction pure de l'étape « Vérification »
  // de l'atelier : la page ne redécide donc jamais elle-même ce qui manque.
  const roueVisee = wheelsAvecLots[0] ?? null;
  const controles: ControleBrut[] = roueVisee
    ? construireVerification({
        campaignId: c.id,
        gameType: roueVisee.game_type ?? "wheel",
        skillConfig: (roueVisee as { skill_config?: unknown }).skill_config,
        prizes: (roueVisee.prizes ?? []).map((p) => ({
          is_active: p.is_active,
          is_losing: p.is_losing,
          weight: p.weight,
          stock: p.stock,
        })),
        qrExistant: qrCodes.length > 0,
        campagne: c,
      }).controles
    : // Aucune roue : `construireVerification` en exige une. Le seul point qui
      // vaille est alors celui-là, et il est bloquant.
      [
        {
          cle: "mecanique",
          ok: false,
          titre: "La mécanique est choisie",
          detail: "Aucun jeu n'existe encore : il n'y a rien à faire tourner.",
        },
      ];
  const tuiles = new Map<string, TuileRendue>(
    tuilesDuModule("roue", controles).map((t) => [t.tuile.cle, t]),
  );
  /** Le detail du premier contrôle rouge d'une tuile — sinon le fait fourni. */
  const resumeTuile = (cle: string, defaut: string): string => {
    const tuile = tuiles.get(cle);
    const rouge = tuile
      ? controles.find((k) => tuile.tuile.controles.includes(k.cle) && !k.ok)
      : undefined;
    return rouge?.detail ?? defaut;
  };
  /** Numéro + statut d'une tuile, à étaler sur `CarteRepliable`. */
  const marques = (cle: string) => ({
    numero: tuiles.get(cle)?.numero,
    statut: tuiles.get(cle)?.statut,
  });
  const nbQr = qrCodes.length;

  return (
    <CampaignStatusProvider key={c.status} initialStatus={c.status}>
      <div>
      <Link
        href="/dashboard/campaigns"
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        ← Jeux instantanés
      </Link>

      <div className="flex items-center justify-between gap-4 mt-3 mb-8">
        <h1 className="text-2xl font-bold truncate">{c.name}</h1>
        <CampaignStatusBadgeLive windowState={windowState} />
      </div>

      {/* LE BANDEAU D'OFFRE — la seule page détail de module qui l'oubliait.
          `capacitesDuModule("wheel")` était déjà lu ci-dessus pour la Carte de
          l'Aventure, mais rien ne le RENDAIT : sans droit, cette page portait
          « Ouvrir aux joueurs » sans un mot sur le refus à venir, et un pass
          terminé n'y laissait aucune trace (constat SD-9). Placé comme sur les
          sept autres — juste sous le titre, au-dessus de l'état. Il ne rend rien
          du tout quand le module est payé (voir le composant) — d'où l'absence
          de conteneur autour de lui : un `div` porteur de marge laisserait un
          blanc de 24 px sur la page de tout client qui paie. */}
      <ModuleCapabilityNotice capacites={capacites} entitlement="core">
        Roue, carte à gratter et treize autres mécaniques, lots à stock et
        budget, QR codes personnalisés et remise en caisse.
      </ModuleCapabilityNotice>

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

      <div id="statut" className="mb-6 scroll-mt-24">
        <CampaignStatusControls
          campaign={c}
          wheelId={roueVisee?.id ?? null}
          // Une campagne n'a pas d'URL publique à elle : le joueur entre par un
          // QR. On ouvre donc le PREMIER de la liste déjà chargée (la plus
          // récente d'abord, même ordre que le bloc QR ci-dessous) ; sans QR,
          // il n'y a encore aucune porte à montrer.
          hrefJeu={qrCodes[0] ? `${APP_URL}/play/${qrCodes[0].slug}` : null}
          // La MÊME fenêtre que la pastille du titre : deux calculs auraient
          // fini par se contredire à l'écran, sur la même page.
          windowState={windowState}
          // TROIS TUILES DEVENUES SECTIONS. « Enregistrer comme modèle » et
          // « Performance par lot » étaient deux blocs repliés qu'il fallait
          // ouvrir pour trouver, chaque fois, un seul geste. Ils sont rendus
          // ICI — la page reste leur lieu de rendu, seule leur place change —
          // et posés en sections de la carte qui répond déjà à la même
          // question : que fait-on de cette campagne ?
          modele={
            <SaveCampaignAsTemplate
              campaignId={c.id}
              campaignName={c.name}
              enSection
            />
          }
          performance={<PrizePerformance rows={perfRows} enSection />}
        />
      </div>

      {/* MON STUDIO — L'ENTRÉE PRINCIPALE, SUR GRAND ÉCRAN SEULEMENT (VIT-46).
          Même disposition que les six modules déjà portés : la carte est
          dépliée d'office, parce qu'une entrée qu'il faut déplier n'est pas une
          entrée.

          `hidden lg:block` : sous ce point de rupture, le studio n'a pas la
          largeur de ses deux colonnes, et c'est l'atelier
          (`/dashboard/campaigns/[id]/wheel`) qui reste le bon écran. Ce qui est
          masqué est l'ENTRÉE, jamais la ROUTE — `/studio/roue/[id]` demeure
          atteignable sur n'importe quelle taille d'écran, une adresse gardée en
          favori doit continuer de mener quelque part.

          CE MODULE N'A PAS DE CARTE D'ATELIER À MASQUER EN FACE, et c'est une
          différence réelle avec les six autres : son entrée d'atelier n'a
          jamais vécu sur cette page. Elle est portée par « Modifier dans
          l'atelier » dans la carte de statut (`campaign-settings.tsx`) et par
          le lien « Régler » de chaque roue (`campaign-wheels.tsx`) — deux
          entrées PAR ROUE, que masquer au-delà de `lg` retirerait le seul
          chemin vers `?wheel=`. Elles restent donc en place. */}
      <div className="mb-6 hidden lg:block">
        <CarteRepliable
          titre="Mon studio"
          defaultOuvert
          resume={
            wheelList.length > 1
              ? `${wheelList.length} jeux — tout se règle ici, en voyant le résultat.`
              : "Tout se règle ici, en voyant le résultat."
          }
        >
          {/* LE BLOC ENVELOPPÉ PORTE SON PROPRE `<h2>`, ET CE N'EST PAS
              DÉCORATIF. `CarteRepliable` rend son titre replié dans un
              `<span>` — jamais un heading — précisément parce que le bloc
              qu'elle enveloppe en porte déjà un du même nom. Sans ce `<h2>`,
              la carte n'a AUCUN titre dans l'arbre d'accessibilité. */}
          <Card>
            <h2 className="font-semibold mb-1">Mon studio</h2>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-sm text-k-body">
                La page de vos joueurs au centre, les réglages autour. La
                mécanique, les gains, l&apos;habillage, les couleurs, le
                créneau, ce qu&apos;on propose avant la partie et ce
                qu&apos;on demande au gagnant — tout s&apos;y règle en voyant
                le résultat.
              </p>
              <Link
                href={`/studio/roue/${c.id}`}
                className="shrink-0 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/80"
              >
                Ouvrir le studio
              </Link>
            </div>
          </Card>
        </CarteRepliable>
      </div>

      <div className="mb-6">
        <CarteRepliable
          titre="Vos jeux"
          defaultOuvert={false}
          {...marques("jeux")}
          resume={resumeTuile(
            "jeux",
            wheelList.length > 1
              ? `${wheelList.length} jeux configurés.`
              : "Le jeu est prêt à tourner.",
          )}
        >
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
        </CarteRepliable>
      </div>

      {/* Le bloc QR sort de l'ancienne grille deux colonnes : il porte
          désormais des vignettes et un formulaire, une demi-colonne ne les
          tenait plus. */}
      <div className="mb-6">
        <CarteRepliable
          titre="QR codes"
          id="qr"
          defaultOuvert={false}
          {...marques("qr")}
          resume={resumeTuile(
            "qr",
            `${nbQr} QR code${nbQr > 1 ? "s" : ""} pour ce jeu.`,
          )}
        >
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
                defaultLabel={c.name}
                campagneFigee
                instanceId="campagne"
              />
            </div>
          )}

          <p className="mt-4">
            <Link
              href={`/dashboard/qr-codes?campaign=${c.id}`}
              className="text-sm font-bold text-k-orange-text hover:underline"
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

      {/* LES BLOCS NAISSENT REPLIÉS, ET CE N'EST PLUS UN RISQUE POUR LES ANCRES.
          `CarteRepliable` rouvre le bloc que vise `#qr` — au montage ET à
          chaque `hashchange` : sauter dessus montre toujours du contenu. Ce
          qui reste ouvert au-dessus, c'est ce qui se lit sans être cherché :
          le titre, la bannière d'état, la Carte de l'Aventure et le bloc
          `#statut`, seul endroit qui publie.
          En revanche les parcours E2E qui cliquaient DANS un bloc sans le
          déplier doivent désormais l'ouvrir. */}

      <div className="mb-6">
        <CarteRepliable
          titre="Avant de jouer"
          defaultOuvert={false}
          {...marques("prejeu")}
          resume={resumeTuile(
            "prejeu",
            c.prejeu_invitation
              ? "Proposé à vos clients avant la partie."
              : "Rien n'est proposé avant la partie.",
          )}
        >
          <CampaignPrejeuInvitation
            campaignId={c.id}
            enabled={c.prejeu_invitation}
            aDesLiens={aDesLiens}
          />
        </CarteRepliable>
      </div>

      <div className="mb-6">
        <CarteRepliable
          titre="Après le gain"
          defaultOuvert={false}
          {...marques("gain")}
          resume={resumeTuile(
            "gain",
            c.collect_email || c.collect_phone
              ? `Demandé au gagnant : ${[
                  c.collect_email ? "email" : null,
                  c.collect_phone ? "téléphone" : null,
                ]
                  .filter(Boolean)
                  .join(" et ")}.`
              : "Le code s'affiche directement, sans rien demander.",
          )}
        >
          <CampaignClaimSettings campaign={c} />
        </CarteRepliable>
      </div>

      <div className="mb-6">
        <CarteRepliable
          titre="Programmation et budget"
          defaultOuvert={false}
          {...marques("programmation")}
          resume={resumeTuile(
            "programmation",
            c.auto_schedule
              ? "Ouverture et pause automatiques selon les dates."
              : c.budget_cents != null
                ? "Plafond de dépense en gains actif."
                : "Ni programmation ni plafond de dépense.",
          )}
        >
          <CampaignAutomationSettings
            campaign={c}
            timeZone={organization!.timezone}
          />
        </CarteRepliable>
      </div>

      <div className="mb-6">
        <CarteRepliable
          titre="Partage et parrainage"
          defaultOuvert={false}
          {...marques("parrainage")}
          resume={resumeTuile(
            "parrainage",
            resumePartageParrainage(
              c.share_enabled,
              (referralProgram as ReferralProgramRow | null)?.enabled === true,
            ),
          )}
        >
          {/* UNE SEULE Card pour la tuile. Elle en rendait DEUX (partage,
              parrainage) dans une `CarteRepliable` qui n'encadre rien et
              suppose un unique enfant : la seconde flottait hors du liseré.
              Les deux blocs deviennent des sections `<h3>` séparées par un
              filet, comme les six autres modules. */}
          <Card>
            <h2 className="mb-1 font-black text-k-ink">Partage et parrainage</h2>
            <div className="mt-4">
              <CampaignShareSettings
                campaignId={c.id}
                enabled={c.share_enabled}
              />
            </div>
            <div className="mt-5 border-t border-zinc-100 pt-4">
              <ReferralProgramSettings
                campaignId={c.id}
                program={(referralProgram as ReferralProgramRow | null) ?? null}
                hasAccess={hasReferralAccess(organization!)}
              />
            </div>
          </Card>
        </CarteRepliable>
      </div>

      {/* TOUT EN BAS, ET SEULE. Renommer, dupliquer et supprimer vivaient
          sous un même titre « Réglages » : trois gestes de nature opposée,
          dont deux se refont et un ne se défait pas. Les deux premiers ont
          rejoint la carte de statut ; la suppression reste à part, là où on
          ne tombe pas dessus par hasard. */}
      <SupprimerCampagne campaign={c} />
      </div>
    </CampaignStatusProvider>
  );
}

/**
 * Résumé de la tuile « Partage et parrainage ». Les DEUX réglages sont
 * indépendants — un résumé qui n'en nommerait qu'un a déjà fait croire que
 * décocher le parrainage masquait le bloc de partage.
 */
function resumePartageParrainage(
  partage: boolean,
  parrainage: boolean,
): string {
  if (partage && parrainage) {
    return "Partage et parrainage proposés après la partie.";
  }
  if (partage) return "Le partage du jeu est proposé après la partie.";
  if (parrainage) return "Parrainage actif, partage simple masqué.";
  return "Aucune invitation au partage après la partie.";
}
