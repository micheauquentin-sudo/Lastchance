import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { PublicShare } from "@/components/dashboard/public-share";
import { CarteAventure } from "@/components/dashboard/carte-aventure";
import { RelaunchFormulaAction } from "@/components/dashboard/relaunch-formula-action";
import { RelaunchFormulaCard } from "@/components/dashboard/relaunch-formula-card";
import { RelanceErreur } from "@/components/dashboard/relance-erreur";
import {
  conclusionAventure,
  construireEtapesAventure,
} from "@/lib/experience-lifecycle";
import { etatSourceRelance } from "@/lib/experience-relance";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { readModulePageOpenCount } from "@/lib/module-page-opens";
import {
  CalendarDaysEditor,
  CalendarSettings,
  CalendarStatusControls,
  type CalendarWheelOption,
} from "@/components/dashboard/calendar-editor";
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
import { spinWheelIssue } from "@/components/dashboard/loyalty-settings-presets";
import {
  caseVide,
  casesIncompletes,
  verificationCalendrier,
} from "@/lib/activation/calendar";
import { carteTuile } from "@/lib/checklist/carte-tuile";
import { tuilesDuModule } from "@/lib/checklist/tuiles";
import { calendarThemeTokens } from "@/components/calendar/calendar-theme";
import type { Calendar, CalendarDay } from "@/types/database";

export const metadata: Metadata = { title: "Calendrier" };

const CALENDAR_COLUMNS =
  "id, organization_id, name, theme, status, start_date, timezone, day_count, public_slug, merchant_content, completion_reward_label, completion_reward_details, completion_reward_stock, completion_reward_claimed_count, created_at, updated_at, code_ttl_days";

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
 * Roues + état de leurs lots, tel que l'éditeur de cases en a besoin. Miroir du
 * filtre de tirage d'un tour offert (`is_active and weight > 0 and (is_losing or
 * stock > 0)`) : un lot non perdant « vide = illimité » est hors tirage — c'est
 * ce que l'avertissement annonce au commerçant.
 */
function toWheelOptions(wheels: WheelRow[], prizes: PrizeRow[]): CalendarWheelOption[] {
  const byWheel = new Map<string, PrizeRow[]>();
  for (const prize of prizes) {
    const list = byWheel.get(prize.wheel_id) ?? [];
    list.push(prize);
    byWheel.set(prize.wheel_id, list);
  }
  return wheels.map((w) => {
    const drawn = (byWheel.get(w.id) ?? []).filter((p) => p.weight > 0);
    return {
      id: w.id,
      name: w.name,
      unlimitedPrizes: drawn
        .filter((p) => !p.is_losing && p.stock === null)
        .map((p) => p.label),
      hasDrawablePrize: drawn.some((p) => p.is_losing || (p.stock ?? 0) > 0),
    };
  });
}

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
  const wheels = toWheelOptions((wheelRows ?? []) as WheelRow[], (prizeRows ?? []) as PrizeRow[]);
  const tokens = calendarThemeTokens(c.theme);
  // URL ABSOLUE : un QR ne peut pas encoder un chemin relatif. Même source que
  // le quiz et les pronostics (APP_URL), pour que le QR imprimé reste valable.
  // `public_slug` est NON NULL ici (posé par trigger, cf. types/database) —
  // contrairement au jackpot, pas de repli sur l'id.
  const publicUrl = `${APP_URL}/calendar/${c.public_slug}`;
  const openCount = await readModulePageOpenCount(
    supabase,
    "calendar",
    c.id,
  );

  // Carte de l'Aventure et relance. Un calendrier n'a pas d'`ends_at` : sa fin
  // se déduit de `start_date` et `day_count`, tous deux dans `CALENDAR_COLUMNS`.
  const marqueurs = {
    status: c.status,
    start_date: c.start_date,
    day_count: c.day_count,
  };
  // Les ancres de SUIVI restent des ancres (elles vivent sur cette vue), mais
  // « Compléter les réglages » désigne désormais une ÉTAPE : les cartes
  // d'édition ne sont plus rendues sur la vue nue, `#reglages` y serait un clic
  // mort.
  const etapes = construireEtapesAventure({
    marqueurs: { kind: "calendar", ...marqueurs },
    capacites,
    liens: {
      editeur: hrefEtapeCalendrier(c.id, "reglages"),
      apercu: c.status === "active" ? publicUrl : null,
      suivi: "#suivi",
      statut: "#statut",
    },
  });
  const conclusion = conclusionAventure(etapes, {
    relanceHref: capacites.canExplore ? "#relance" : null,
  });
  const peutCreerBrouillon = role === "owner" || role === "editor";

  // Les cases telles que la vérification et le compteur d'entrée les lisent :
  // même module que le refus serveur, plus le `day_index` qui NOMME la case.
  const casesVerification = days.map((d) => {
    const roue =
      d.content_type === "spin" && d.target_wheel_id
        ? (wheels.find((w) => w.id === d.target_wheel_id) ?? null)
        : undefined;
    return {
      day_index: d.day_index,
      content_type: d.content_type,
      reward_stock: d.reward_stock,
      reward_label: d.reward_label ?? "",
      target_wheel_id: d.target_wheel_id,
      content_text: d.content_text,
      roue:
        roue === undefined
          ? undefined
          : roue === null
            ? null
            : { nom: roue.name, probleme: spinWheelIssue(roue) },
    };
  });
  // « Garnies » au sens du commerçant : complètes ET donnant quelque chose. Une
  // case message vide est légale (elle s'ouvrira sur un « pas de chance »),
  // donc jamais « à compléter » — mais la compter comme garnie ferait afficher
  // « 24 cases garnies » sur un calendrier qui vient d'être créé.
  const vides = casesVerification.filter(caseVide).length;
  const garnies =
    days.length - casesIncompletes(casesVerification).length - vides;

  // LES MÊMES CONTRÔLES POUR LES DEUX VUES, calculés UNE fois : l'étape « La
  // vérification » les raconte, le suivi n'en garde que le verdict, en pastille
  // sur chaque bloc. Deux calculs feraient deux vérités sur ce qui manque.
  const entreeVerification = {
    dayCount: c.day_count,
    cases: casesVerification,
    completionRewardLabel: c.completion_reward_label ?? "",
    completionRewardStock: c.completion_reward_stock,
  };
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
      Une case par jour, 5 thèmes saisonniers, lots à retirer en caisse, tours de
      roue offerts et cadeau d&apos;assiduité.
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
                les dernières, avec leur contenu et les codes CADEAU- qu&apos;elles
                ont distribués. Une confirmation vous sera demandée avant.
              </p>
            )}

            {etape === "reglages" && <CalendarSettings calendar={c} />}

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

      {/* ── LA CHECKLIST ──
          Même règle que sur le quiz : tout naît replié, seul le Statut reste
          ouvert — c'est lui qui ouvre la page publique. La Carte de l'Aventure
          le suit, repliée et sans rang (voir `carte-aventure.tsx`). */}
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

      <CarteAventure steps={etapes} conclusion={conclusion} />

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
          <h2 className="font-semibold mb-1">
            QR code et lien du calendrier
          </h2>
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

      <RelanceErreur message={relanceError} />

      {capacites.canExplore && (
        <CarteRepliable
          {...carteTuile(tuiles, "relance")}
          defaultOuvert={false}
          resume="Repartir de ce calendrier pour la prochaine saison."
        >
          <RelaunchFormulaCard
            sourceName={c.name}
            occasionLabel="la prochaine saison"
            sourceState={etatSourceRelance("calendar", marqueurs)}
            canCreateDraft={peutCreerBrouillon}
            isSupported
            action={<RelaunchFormulaAction kind="calendar" sourceId={c.id} />}
          />
        </CarteRepliable>
      )}
    </div>
  );
}
