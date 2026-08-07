import type { Metadata } from "next";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import {
  AnimationCenter,
  type AnimationCenterLinks,
} from "@/components/dashboard/animation-center";
import { ConseillerPanel } from "@/components/dashboard/conseiller-panel";
import { ExperienceAnalytics } from "@/components/dashboard/experience-analytics";
import { visibleOnboardingSteps } from "@/components/dashboard/onboarding-checklist";
import { ProchaineActionPanel } from "@/components/dashboard/prochaine-action";
import {
  conseilsRecouvertsParHero,
  construireProchaineAction,
  tachesRecouvertesParHero,
} from "@/components/dashboard/prochaine-action-state";
import { TeamActionBoard } from "@/components/dashboard/team-action-board";
import { chargerCentreAnimation } from "@/lib/centre-animation-server";
import { construireConseils } from "@/lib/conseiller-commercant";
import { hasCompAccess } from "@/lib/subscription";
import { activeExperienceKinds } from "@/platform/experiences/catalog";
import { parseExperienceAnalytics } from "@/lib/experience-analytics-dashboard";
import { lienSelonRole } from "@/lib/liens-proprietaire";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Vue d'ensemble" };

/**
 * LA VUE D'ENSEMBLE RACONTE UNE SEULE HISTOIRE.
 *
 * Elle empilait quatre systèmes de guidage concurrents — checklist de
 * démarrage, tableau d'équipe, conseiller, tuiles — qui affichaient jusqu'à
 * trois scores de progression contradictoires pour un même commerce, écrivaient
 * « gains à remettre » à CINQ endroits (dont deux avec des calculs différents,
 * donc deux nombres possibles), et ne portaient aucun bouton d'action.
 *
 * L'ordre est désormais celui d'une lecture :
 *   1. qui je suis (en-tête) ;
 *   2. ce que je fais maintenant (UN hero, UN bouton) ;
 *   3. où en sont mes animations (UNE section : repères + coups de main) ;
 *   4. ce qu'on peut encore me signaler (le Conseiller, plafonné à 4, privé du
 *      conseil que le hero affiche déjà) ;
 *   5. mes résultats, toujours affichés — la page ne change plus de forme au
 *      premier événement mesuré ;
 *   6. la protection anti-abus, une ligne tant qu'il n'y a rien à dire.
 *
 * ZÉRO RPC SUPPLÉMENTAIRE : tout est recomposé depuis les trois appels du
 * `Promise.all` ci-dessous, exactement comme avant.
 */

interface DashboardSummary {
  scans: number;
  spins: number;
  wins: number;
  participations: number;
  redeemed: number;
  blocked: number;
  campaigns: number;
  first_campaign_id: string | null;
  active_campaigns: number;
  active_prizes: number;
  qr_codes: number;
  first_qr_id: string | null;
  poster_customized: boolean;
  distribution: { id: string; label: string; color: string; count: number }[];
}

export default async function DashboardPage() {
  const { organization, role } = await getUserAndOrg();
  if (role === "cashier") redirect("/dashboard/redeem");
  const supabase = await createClient();
  const orgId = organization!.id;
  const [
    { data, error },
    { data: analyticsData, error: analyticsError },
    centreAnimation,
  ] = await Promise.all([
    supabase.rpc("org_dashboard_summary", {
      p_organization_id: orgId,
    }),
    supabase.rpc("org_experience_analytics", {
      p_organization_id: orgId,
      p_days: 30,
    }),
    // Le caissier est déjà renvoyé sur la caisse ci-dessus ; `role` peut
    // néanmoins être `null` (organisation sans appartenance lisible), et
    // `chargerCentreAnimation` rend alors `null` — rien à afficher plutôt que
    // des zéros qui se liraient « tout est fait ».
    role ? chargerCentreAnimation(orgId, role) : Promise.resolve(null),
  ]);
  if (error) console.error("[dashboard] summary:", error.message);
  if (analyticsError) {
    console.error("[dashboard] experience analytics:", analyticsError.message);
  }
  const summary = (data ?? {
    scans: 0, spins: 0, wins: 0, participations: 0, redeemed: 0,
    blocked: 0, campaigns: 0, first_campaign_id: null, active_campaigns: 0,
    active_prizes: 0, qr_codes: 0, first_qr_id: null,
    poster_customized: false, distribution: [],
    // `org_dashboard_summary` rend un objet jsonb : son type généré est `Json`.
    // Le passage par `unknown` est la conversion que TypeScript exige entre deux
    // types sans recouvrement structurel ; la forme vient de la fonction SQL.
    //
    // CE CAST RESTE UNE PROMESSE NON VÉRIFIÉE, et le marqueur ci-dessous ne la
    // change pas — il la rend seulement visible au compteur de dette. La forme
    // réelle est décidée par le `json_build_object` de la fonction SQL ; la
    // seule façon de la vérifier serait de la valider à la lecture. Ce n'est
    // pas fait ici parce que `DashboardSummary` compte une douzaine de champs
    // et que le décrire deux fois — en TypeScript et en schéma de validation —
    // recréerait la seconde source de vérité que ce lot supprime par ailleurs.
    // unsafe-cast-justification: retour jsonb d'une RPC, forme décidée par le json_build_object de org_dashboard_summary
  }) as unknown as DashboardSummary;
  const analytics = parseExperienceAnalytics(analyticsData);

  /*
   * Les raccourcis du Centre d'animation.
   *
   * Chaque destination passe par `lienSelonRole`, et une clé n'est posée que si
   * le lien survit : une tuile sans lien reste un repère chiffré, alors qu'un
   * lien mort renverrait l'éditeur sur « Vue d'ensemble » sans un mot — le
   * défaut que `liens-proprietaire.ts` existe pour éviter.
   *
   * `drafts` n'a PLUS de destination : elle pointait sur « Découvrir », qui est
   * un catalogue de modules par objectif et ne contient aucun brouillon. Le
   * commerçant cliquait sur « 3 brouillons » et atterrissait sur une vitrine.
   * `teamTasks` n'en a jamais eu : ses tâches sont juste en dessous, dans la
   * même carte, chacune avec son propre lien déjà filtré.
   */
  const centreLiens: AnimationCenterLinks = {};
  const raccourcisCentre = {
    qrToTest: "/dashboard/qr-codes",
    liveExperiences: "/dashboard/campaigns",
    lowStockPrizes: "/dashboard/campaigns",
  } as const;
  for (const [cle, href] of Object.entries(raccourcisCentre)) {
    const autorise = lienSelonRole(href, role);
    if (autorise) centreLiens[cle as keyof typeof raccourcisCentre] = autorise;
  }
  // Le registre des participations est réservé au propriétaire : pour les
  // autres rôles la tuile reste affichée, avec sa valeur, mais sans lien.
  const lienParticipations = lienSelonRole(
    "/dashboard/participations?statut=a-valider",
    role,
  );
  if (lienParticipations) centreLiens.rewardsToHandOver = lienParticipations;

  const blockedCount = summary.blocked;
  const firstCampaignId = summary.first_campaign_id;

  const onboardingSteps = [
    {
      key: "campaign",
      label: "Créer votre première campagne",
      href: "/dashboard/campaigns",
      done: summary.campaigns > 0,
    },
    {
      key: "prize",
      label: "Configurer au moins un lot",
      href: firstCampaignId
        ? `/dashboard/campaigns/${firstCampaignId}/wheel`
        : "/dashboard/campaigns",
      done: summary.active_prizes > 0,
    },
    {
      key: "qr",
      label: "Générer un QR code",
      href: "/dashboard/qr-codes",
      done: summary.qr_codes > 0,
    },
    {
      key: "poster",
      label: "Personnaliser votre affiche",
      href: summary.first_qr_id ? `/poster/${summary.first_qr_id}` : "/dashboard/qr-codes",
      done: summary.poster_customized,
    },
    {
      key: "logo",
      label: "Ajouter votre logo",
      href: "/dashboard/settings",
      done: !!organization!.logo_url,
      // `/dashboard/settings` est owner-only (redirect vers /dashboard) :
      // l'étape n'est présentée qu'au propriétaire.
      ownerOnly: true,
    },
    {
      key: "activate",
      label: "Activer votre campagne",
      href: firstCampaignId
        ? `/dashboard/campaigns/${firstCampaignId}`
        : "/dashboard/campaigns",
      done: summary.active_campaigns > 0,
    },
  ];

  /*
   * LE HERO ABSORBE LA CHECKLIST.
   *
   * `OnboardingChecklist` n'est plus montée en bas de page : elle y arrivait en
   * dixième position, après dix cartes de zéros, alors qu'elle est exactement
   * ce dont un commerce du premier jour a besoin. Le hero la DEVIENT tant que
   * le démarrage est incomplet ; `visibleOnboardingSteps` continue d'écarter
   * l'étape que le rôle ne peut pas accomplir, donc le dénominateur suit.
   */
  const prochaineAction = construireProchaineAction({
    role,
    etapesDemarrage: visibleOnboardingSteps(onboardingSteps, role),
    compteurs: centreAnimation?.compteurs ?? null,
  });

  // Le conseiller RÉUTILISE les trois états déjà chargés — compteurs du Centre
  // d'animation, `org_dashboard_summary`, `org_experience_analytics`.
  // `construireConseils` est pure : aucune RPC de plus. `exclure` lui retire le
  // conseil que le hero affiche déjà en gros, avec son bouton.
  // `role` null → liste vide, le panneau se tait.
  const conseils =
    role && organization
      ? construireConseils({
          role,
          compteurs: centreAnimation?.compteurs ?? null,
          activeKinds: activeExperienceKinds(
            organization,
            hasCompAccess(organization),
          ),
          sommaire: summary,
          analytics,
          exclure: conseilsRecouvertsParHero(prochaineAction),
        })
      : [];

  const scans = summary.scans;
  const spins = summary.spins;
  const wins = summary.wins;
  const participations = summary.participations;
  const winRate = spins > 0 ? Math.round((wins / spins) * 100) : null;

  // Répartition des gains enregistrés par lot
  const distribution = new Map<
    string,
    { label: string; color: string; count: number }
  >();
  for (const row of summary.distribution) {
    distribution.set(row.id, { label: row.label, color: row.color, count: row.count });
  }
  const distributionList = [...distribution.values()].sort(
    (a, b) => b.count - a.count,
  );
  const maxCount = Math.max(1, ...distributionList.map((d) => d.count));

  /*
   * LES QUATRE REPÈRES QUI NE BOUGENT PLUS.
   *
   * Ils disparaissaient DÉFINITIVEMENT au premier événement mesuré, remplacés
   * par onze cartes d'analytics : le commerçant qui avait mémorisé « mes tours
   * joués sont là » ne les retrouvait plus jamais. Ils sont désormais affichés
   * en permanence, et le détail se replie dans un `<details>` sous eux.
   *
   * La cinquième tuile, « Gains à valider », a été SUPPRIMÉE : elle racontait
   * le même fait que « Gains à remettre » du Centre d'animation, avec un calcul
   * DIFFÉRENT (participations − redeemed, sans exclusion des codes expirés) —
   * donc deux nombres possibles pour une seule réalité, à quelques centimètres
   * l'un de l'autre. Le compteur qui reste est celui de la RPC, qui balaie les
   * dix tables d'émission.
   */
  const stats: Array<{
    label: string;
    value: number;
    hint?: string;
    icon: React.ReactNode;
  }> = [
    {
      label: "Scans QR",
      value: scans,
      icon: <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h3v3h-3v-3Zm3 3h3v3h-3v-3Z" />,
    },
    {
      label: "Tours joués",
      value: spins,
      hint: winRate !== null ? `${winRate}% de gagnants` : undefined,
      icon: <path d="M4 5a9 9 0 1 0 9 9M12 5v7l5-3" />,
    },
    {
      label: "Lots gagnés",
      value: wins,
      icon: <path d="M8 3h8v3a4 4 0 0 1-8 0V3ZM6 5H4v1a3 3 0 0 0 3 3M18 5h2v1a3 3 0 0 1-3 3M9 14h6l-1 4H10l-1-4ZM8 21h8" />,
    },
    {
      label: "Participations",
      value: participations,
      icon: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-black tracking-tight text-k-ink sm:text-3xl">
          Vue d&apos;ensemble
        </h1>
        <p className="mt-1 font-bold text-k-body">{organization!.name}</p>
      </div>

      <ProchaineActionPanel action={prochaineAction} />

      <div className="mb-8">
        {centreAnimation ? (
          <AnimationCenter
            counts={centreAnimation.compteurs}
            links={centreLiens}
          >
            <TeamActionBoard
              actions={centreAnimation.actionsEquipe}
              actorRole={role}
              masquer={tachesRecouvertesParHero(prochaineAction)}
            />
          </AnimationCenter>
        ) : (
          // La section disparaissait EN SILENCE quand la RPC échouait : la page
          // changeait de structure d'un jour à l'autre, sans explication.
          <p className="text-sm font-bold text-k-body">
            Les repères d&apos;animation sont indisponibles pour le moment.
          </p>
        )}
      </div>

      <ConseillerPanel conseils={conseils} />

      <section aria-labelledby="vos-resultats-titre" id="vos-resultats" className="mb-8">
        <h2
          id="vos-resultats-titre"
          className="mb-4 text-xl font-black text-k-ink"
        >
          Vos résultats
        </h2>

        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} className="h-full p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-k-yellow/50 text-k-ink">
                <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {s.icon}
                </svg>
              </span>
              <p className="mt-3 text-xs font-bold text-k-body">{s.label}</p>
              <p className="mt-0.5 text-2xl font-black text-k-ink">{s.value}</p>
              {s.hint && (
                <p className="mt-1 text-xs font-black text-k-orange">{s.hint}</p>
              )}
            </Card>
          ))}
        </div>

        {distributionList.length > 0 && (
          <Card className="mb-4">
            <h3 className="mb-4 font-black text-k-ink">Répartition des gains</h3>
            <ul className="space-y-4">
              {distributionList.map((d) => (
                <li key={d.label}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="flex items-center gap-2 text-zinc-700">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                      {d.label}
                    </span>
                    <span className="font-mono text-zinc-500">{d.count}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${Math.round((d.count / maxCount) * 100)}%`,
                        background: d.color,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {analytics.totalEvents > 0 ? (
          <ExperienceAnalytics analytics={analytics} />
        ) : (
          <p className="text-sm text-k-body">
            Le détail par animation apparaîtra ici dès les premières parties.
          </p>
        )}
      </section>

      {blockedCount > 0 ? (
        <Card className="mb-8 flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
          </span>
          <div>
            <h2 className="font-black text-k-ink">Protection anti-abus</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              <span className="font-semibold text-zinc-900">{blockedCount}</span>{" "}
              tentative{blockedCount > 1 ? "s" : ""} suspecte{blockedCount > 1 ? "s" : ""}{" "}
              bloquée{blockedCount > 1 ? "s" : ""} cette semaine (vérification anti-robot
              ou débit anormal) — votre roue reste protégée automatiquement.
            </p>
          </div>
        </Card>
      ) : (
        // Une carte pleine largeur pour dire « rien à signaler », c'est 95 % du
        // temps une carte de plus à traverser. Une ligne suffit.
        <p className="mb-8 text-xs font-bold text-k-body">
          Protection anti-abus active — aucune activité suspecte détectée cette
          semaine.
        </p>
      )}
    </div>
  );
}
