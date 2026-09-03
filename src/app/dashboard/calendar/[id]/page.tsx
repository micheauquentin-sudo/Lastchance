import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { PublicShare } from "@/components/dashboard/public-share";
import { RelaunchFormulaAction } from "@/components/dashboard/relaunch-formula-action";
import { RelaunchFormulaCard } from "@/components/dashboard/relaunch-formula-card";
import { relanceADeQuoiSAfficher } from "@/components/dashboard/relaunch-formula-state";
import { RelanceErreur } from "@/components/dashboard/relance-erreur";
import { etatSourceRelance } from "@/lib/experience-relance";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { readModulePageOpenCount } from "@/lib/module-page-opens";
import {
  CalendarDaysEditor,
  CalendarSettings,
  CalendarStatusControls,
} from "@/components/dashboard/calendar-editor";
import {
  bilanCasesCalendrier,
  toCalendarWheelOptions,
  type CalendarPrizeRow,
  type CalendarWheelRow,
} from "@/components/dashboard/calendar-donnees-editeur";
import { CalendarStatusBadge } from "@/components/dashboard/calendar-status";
import {
  etapeVoisine,
  numeroEtape,
  parseEtape,
} from "@/components/dashboard/atelier-etapes";
import {
  definitionEtapeCalendrier,
  ETAPES_CALENDRIER,
  hrefEtapeCalendrier,
  type EtapeCalendrier,
} from "@/components/dashboard/atelier-calendar-etapes";
import {
  AtelierNavigationEtape,
  AtelierStepper,
} from "@/components/dashboard/atelier-stepper";
import { AtelierEntreeCalendrier } from "@/components/dashboard/atelier-calendar-entree";
import { AtelierCalendrierVerification } from "@/components/dashboard/atelier-calendar-verification";
import { CarteRepliable } from "@/components/dashboard/carte-repliable";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { verificationCalendrier } from "@/lib/activation/calendar";
import { carteTuile } from "@/lib/checklist/carte-tuile";
import { tuilesDuModule } from "@/lib/checklist/tuiles";
import { calendarThemeTokens } from "@/components/calendar/calendar-theme";
import type { Calendar, CalendarDay } from "@/types/database";

export const metadata: Metadata = { title: "Calendrier" };

const CALENDAR_COLUMNS =
  "id, organization_id, name, theme, status, start_date, timezone, day_count, public_slug, merchant_content, fond_key, completion_reward_label, completion_reward_details, completion_reward_stock, completion_reward_claimed_count, created_at, updated_at, code_ttl_days";

export default async function CalendarDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ relance_error?: string | string[]; etape?: string }>;
}) {
  const { id } = await params;
  const { relance_error: relanceError, etape: etapeParam } = await searchParams;
  // L'ABSENCE de `?etape=` n'est pas la première étape : c'est la vue SUIVI.
  const etape = parseEtape(
    ETAPES_CALENDRIER,
    etapeParam,
    "nulle",
  ) as EtapeCalendrier | null;
  const { organization, role } = await getUserAndOrg();
  if (!organization) notFound();
  // REFUS AVANT LECTURE, comme sur les quatre autres modules : `capacites`
  // vivait dans la salve ci-dessous, si bien qu'un caissier déclenchait quatre
  // requêtes dont le résultat partait aussitôt au `notFound()`. Ce qui reste
  // parallèle l'est resté — seul le droit d'entrée passe devant.
  //
  // Lues DÈS L'ENTRÉE, et c'est ce qui remplace l'ancien `hasCalendarAccess` :
  // la page détail rendait un 404 à qui n'avait pas payé le module, alors que
  // la page LISTE lui laissait créer ce brouillon. Cahier §3 : on découvre et
  // on prépare librement, seule la PUBLICATION est verrouillée — et elle l'est
  // en base (`assert_module_publish_allowed`).
  const capacites = await capacitesDuModule("calendar");
  if (!capacites.canExplore) notFound();

  const supabase = await createClient();

  const [
    { data: calendar },
    { data: dayRows },
    { data: wheelRows },
    { data: prizeRows },
  ] = await Promise.all([
    supabase
      .from("calendars")
      .select(CALENDAR_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("calendar_days")
      .select("*")
      .eq("calendar_id", id)
      .eq("organization_id", organization.id)
      .order("day_index", { ascending: true }),
    supabase
      .from("wheels")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("prizes")
      .select("wheel_id, label, is_losing, stock, weight")
      .eq("organization_id", organization.id)
      .eq("is_active", true),
  ]);

  if (!calendar) notFound();
  const c = calendar as unknown as Calendar;
  const days = (dayRows ?? []) as CalendarDay[];
  const wheels = toCalendarWheelOptions(
    (wheelRows ?? []) as CalendarWheelRow[],
    (prizeRows ?? []) as CalendarPrizeRow[],
  );
  const tokens = calendarThemeTokens(c.theme);
  // URL ABSOLUE : un QR ne peut pas encoder un chemin relatif. Même source que
  // le quiz et les pronostics (APP_URL), pour que le QR imprimé reste valable.
  // `public_slug` est NON NULL ici (posé par trigger, cf. types/database) —
  // contrairement au jackpot, pas de repli sur l'id.
  const publicUrl = `${APP_URL}/calendar/${c.public_slug}`;
  const openCount = await readModulePageOpenCount(supabase, "calendar", c.id);

  // Relance : un calendrier n'a pas d'`ends_at` : sa fin
  // se déduit de `start_date` et `day_count`, tous deux dans `CALENDAR_COLUMNS`.
  const marqueurs = {
    status: c.status,
    start_date: c.start_date,
    day_count: c.day_count,
  };
  const peutCreerBrouillon = role === "owner" || role === "editor";
  // L'enveloppe repliable suit le MÊME verdict que la carte qu'elle contient :
  // sans ce test, elle restait à l'écran et s'ouvrait sur du vide, parce que
  // `RelaunchFormulaCard` rend `null` tant que l'animation n'est pas
  // terminée. Le pourquoi est écrit une fois, sur `relanceADeQuoiSAfficher`.
  const relance = {
    sourceState: etatSourceRelance("calendar", marqueurs),
    canCreateDraft: peutCreerBrouillon,
    isSupported: true,
  };

  // Les cases telles que la vérification et le compteur d'entrée les lisent,
  // dérivées par le module PARTAGÉ avec le studio (VIT-39) : deux copies
  // feraient deux vérités sur ce qu'est une case garnie.
  const {
    entree: entreeVerification,
    garnies,
    vides,
  } = bilanCasesCalendrier(c, days, wheels);
  const tuiles = tuilesDuModule(
    "calendrier",
    verificationCalendrier(entreeVerification).controles,
  );

  const enTete = (
    <div>
      <Link
        href="/dashboard/calendar"
        className="text-sm text-zinc-600 hover:text-k-ink"
      >
        ← Calendrier
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="text-3xl" aria-hidden>
          {tokens.faceEmoji}
        </span>
        <h1 className="text-2xl font-bold">{c.name}</h1>
        <CalendarStatusBadge status={c.status} />
      </div>
    </div>
  );

  const bandeauModule = (
    <ModuleCapabilityNotice capacites={capacites} entitlement="calendar">
      Une case par jour, 5 thèmes saisonniers, lots à retirer en caisse, tours
      de roue offerts et cadeau d&apos;assiduité.
    </ModuleCapabilityNotice>
  );

  // ── LE MODE ATELIER : une seule étape à l'écran ──
  if (etape) {
    const definition = definitionEtapeCalendrier(etape);
    const numero = numeroEtape(ETAPES_CALENDRIER, etape);
    const hrefPour = (cle: string) =>
      hrefEtapeCalendrier(c.id, cle as EtapeCalendrier);

    return (
      <div className="space-y-6">
        {enTete}
        {bandeauModule}

        <div>
          <AtelierStepper
            etapes={ETAPES_CALENDRIER}
            courante={etape}
            hrefPour={hrefPour}
          />

          <section
            aria-label={`Étape ${numero} sur ${ETAPES_CALENDRIER.length} — ${definition.titre}`}
          >
            {/* L'AVERTISSEMENT DE L'ORDRE, à l'endroit où il se joue : revenir
                ici après avoir garni la grille peut détruire les dernières
                cases (`syncCalendarDays` supprime au-delà du nouveau
                `day_count`). Il n'est montré que s'il y a quelque chose à
                perdre. */}
            {etape === "reglages" && garnies > 0 && (
              <p className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                <span aria-hidden>⚠️ </span>
                {garnies} case{garnies > 1 ? "s" : ""} déjà garnie
                {garnies > 1 ? "s" : ""} : réduire le nombre de cases supprimera
                les dernières, avec leur contenu et les codes CADEAU-
                qu&apos;elles ont distribués. Une confirmation vous sera
                demandée avant.
              </p>
            )}

            {etape === "reglages" && (
              <CalendarSettings calendar={c} logoUrl={organization.logo_url} />
            )}

            {etape === "cases" && (
              <CalendarDaysEditor days={days} wheels={wheels} />
            )}

            {etape === "verification" && (
              <AtelierCalendrierVerification
                calendarId={c.id}
                entree={entreeVerification}
              />
            )}
          </section>

          <AtelierNavigationEtape
            precedente={etapeVoisine(ETAPES_CALENDRIER, etape, -1)}
            suivante={etapeVoisine(ETAPES_CALENDRIER, etape, 1)}
            hrefPour={hrefPour}
          />
        </div>

        <Link
          href={`/dashboard/calendar/${c.id}`}
          className="inline-block text-sm font-bold text-zinc-600 hover:text-k-ink"
        >
          ← Retour au suivi
        </Link>
      </div>
    );
  }

  // ── LA VUE SUIVI (URL nue) ──
  return (
    <div className="space-y-6">
      {enTete}
      {bandeauModule}

      <CarteRepliable
        {...carteTuile(tuiles, "statut")}
        resume={
          c.status === "active"
            ? "Ouvert aux joueurs."
            : c.status === "archived"
              ? "Archivé."
              : "Brouillon : la page publique reste fermée."
        }
      >
        <CalendarStatusControls
          calendar={c}
          hrefJeu={c.status === "active" ? publicUrl : null}
        />
      </CarteRepliable>

      {/* §4 du cahier : le QR ne rend pas jouable un brouillon. On n'affiche
          donc le QR et le lien QUE si le calendrier est publié — un QR imprimé
          et collé en vitrine survit à la page qui l'a produit, alors qu'un
          bandeau d'avertissement, non. */}
      <CarteRepliable
        {...carteTuile(tuiles, "partage")}
        defaultOuvert={false}
        resume={
          c.status === "active"
            ? `${openCount} ouverture${openCount > 1 ? "s" : ""} de la page publique.`
            : "Disponible une fois le calendrier publié."
        }
      >
        <Card>
          <h2 className="font-semibold mb-1">QR code et lien du calendrier</h2>
          {c.status === "active" ? (
            <>
              <p className="text-sm text-zinc-500 mb-3">
                Affichez le QR code en boutique ou partagez le lien : vos
                clients ouvrent leur case du jour depuis leur téléphone.
              </p>
              <PublicShare
                url={publicUrl}
                fileName={`calendrier-${c.public_slug}`}
                qrLabel={c.name}
                openCount={openCount}
                resource={{ kind: "calendar", id: c.id }}
              />
            </>
          ) : (
            <p className="text-sm text-zinc-500">
              Publiez le calendrier pour obtenir son QR code et son lien : tant
              qu&apos;il n&apos;est pas actif, la page publique reste fermée aux
              joueurs.
            </p>
          )}
        </Card>
      </CarteRepliable>

      {/* ── LE STUDIO EST LE CHEMIN PRINCIPAL SUR GRAND ÉCRAN (VIT-39) ──

          Tout s'y règle en voyant la page du client. La carte est donc OUVERTE
          d'emblée : un commerçant qui vient régler quelque chose doit tomber
          dessus, pas la déplier.

          Elle ne s'affiche qu'à partir de `lg`, parce que le studio est à deux
          colonnes : en dessous, elles s'empilent et l'aperçu passe sous les
          réglages, ce qui lui retire sa raison d'être. Même arbitrage, et même
          motif, que `/dashboard/vitrine`.

          LA PASTILLE DE PRÉPARATION SUIT L'ENTRÉE PRINCIPALE : elle appartient
          à la préparation, pas à un écran. Sur grand écran, c'est le studio. */}
      <div className="hidden lg:block">
        <CarteRepliable
          {...carteTuile(tuiles, "atelier")}
          titre="Mon studio"
          defaultOuvert
          resume={`${garnies} case${garnies > 1 ? "s" : ""} garnie${garnies > 1 ? "s" : ""} sur ${days.length} — tout se règle ici, en voyant le résultat.`}
        >
          {/* LE BLOC ENVELOPPÉ PORTE SON PROPRE `<h2>`, ET CE N’EST PAS
              DÉCORATIF. `CarteRepliable` rend son titre replié dans un
              `<span>` — jamais un heading — précisément parce que le bloc
              qu’elle enveloppe en porte déjà un du même nom (voir son en-tête).
              Sans ce `<h2>`, la carte n’a AUCUN titre dans l’arbre
              d’accessibilité : un lecteur d’écran ne l’annonce pas, et les E2E
              qui cherchent `getByRole("heading")` ne la trouvent pas non plus.
              C’est cette seconde moitié qui a rougi. */}
          <Card>
            <h2 className="font-semibold mb-1">Mon studio</h2>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-sm text-k-body">
                Le calendrier de vos clients au centre, les réglages autour. Le
                nom, l&apos;allure, les dates, les cases, le cadeau de fin et
                votre message — tout s&apos;y règle en voyant le résultat.
              </p>
              <Link
                href={`/studio/calendrier/${c.id}`}
                className="shrink-0 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/80"
              >
                Ouvrir le studio
              </Link>
            </div>
          </Card>
        </CarteRepliable>
      </div>

      {/* L'ATELIER RESTE, POUR LE TÉLÉPHONE. Ce qui est masqué au-delà de `lg`
          est l'ENTRÉE, jamais la ROUTE : `?etape=` demeure atteignable sur
          n'importe quelle taille d'écran — une adresse d'étape gardée en
          favori doit continuer de mener quelque part. */}
      <div className="lg:hidden">
        <CarteRepliable
          {...carteTuile(tuiles, "atelier")}
          defaultOuvert={false}
          resume={`${garnies} case${garnies > 1 ? "s" : ""} garnie${garnies > 1 ? "s" : ""} sur ${days.length}.`}
        >
          <AtelierEntreeCalendrier
            calendarId={c.id}
            garnies={garnies}
            vides={vides}
            total={days.length}
          />
        </CarteRepliable>
      </div>

      <RelanceErreur message={relanceError} />

      {capacites.canExplore && relanceADeQuoiSAfficher(relance) && (
        <CarteRepliable
          {...carteTuile(tuiles, "relance")}
          defaultOuvert={false}
          resume="Repartir de ce calendrier pour la prochaine saison."
        >
          <RelaunchFormulaCard
            sourceName={c.name}
            occasionLabel="la prochaine saison"
            {...relance}
            action={<RelaunchFormulaAction kind="calendar" sourceId={c.id} />}
          />
        </CarteRepliable>
      )}
    </div>
  );
}
