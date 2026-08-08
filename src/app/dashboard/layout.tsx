import { Lilita_One, Nunito } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import {
  cleAccesOffert as construireCleAccesOffert,
  cleEssai as construireCleEssai,
  estRappelFerme,
  RAPPELS_COOKIE,
} from "@/lib/rappels";
import { hasEverSubscribed } from "@/lib/stripe";
import {
  hasActiveAccess,
  hasCompAccess,
  isTrialExpired,
  pastDueGraceEndsAt,
  trialDaysLeft,
} from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { logout } from "@/actions/auth";
import { DashboardNav } from "@/components/dashboard/nav";
import { OrganizationSwitcher } from "@/components/dashboard/organization-switcher";
import { RappelFermable } from "@/components/dashboard/rappel-fermable";
import { SkipLink } from "@/components/ui/skip-link";
import { ToastEnregistrement } from "@/components/ui/toast-enregistrement";
import { activeExperienceKinds } from "@/platform/experiences/catalog";

/* DA « La Kermesse » (version sobre) : Lilita One pour le logo,
   Nunito pour les titres et le corps du panel. */
const lilita = Lilita_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-heading",
});

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user, organization, role, memberships } = await getUserAndOrg();
  // SEUL LE PROPRIÉTAIRE peut gérer l'abonnement : `/dashboard/settings`
  // renvoie tout autre rôle vers `/dashboard`, qui renvoie un caissier vers
  // `/dashboard/redeem`. Les bandeaux offraient donc à tout le monde un lien
  // qui ramenait chacun là d'où il venait, sans un mot — le clic paraissait
  // simplement mort. On ne montre le lien qu'à qui peut s'en servir, et on
  // dit aux autres quoi faire.
  const peutGererAbonnement = role === "owner";
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  const accessActive = hasActiveAccess(organization);
  // Accès offert par le back-office : prime sur tout l'état Stripe. On
  // masque alors les bannières d'essai/impayé (l'accès est complet) au
  // profit d'une bannière positive dédiée.
  const compActive = hasCompAccess(organization);
  const compUntil = organization.comp_access_until
    ? new Date(organization.comp_access_until)
    : null;
  // Impayé en cours de relance Stripe : les roues restent actives
  // pendant le délai de grâce — bannière dédiée, pas « inactif ».
  const pastDueInGrace =
    !compActive &&
    organization.subscription_status === "past_due" &&
    accessActive;
  const graceEndsAt = pastDueGraceEndsAt(organization);
  // DEPUIS LE CRON `expire-trials`, `canceled` recouvre DEUX vécus. L'essai
  // jamais converti y bascule au lieu de rester `trialing` pour toujours — et
  // sans ce discriminant, la population même que la correction vise perdrait
  // le message juste et actionnable (« votre essai est terminé, abonnez-vous »)
  // au profit du générique « votre abonnement est inactif ». On remplacerait
  // une donnée fausse par un message vague : ce n'est pas un progrès.
  //
  // `stripe_event_created_at` n'est pas dans le grant de colonnes accordé à
  // `authenticated` (00017), d'où cette lecture service_role — payée
  // UNIQUEMENT sur `canceled`, le seul statut ambigu. Partout ailleurs la
  // question ne se pose pas et aucune requête n'est faite.
  const everSubscribed =
    organization.subscription_status === "canceled"
      ? await hasEverSubscribed(organization.id)
      : true;
  const trialExpired =
    !compActive &&
    isTrialExpired({ ...organization, ever_subscribed: everSubscribed });
  const subscriptionInactive =
    !compActive &&
    !trialExpired &&
    (["canceled", "inactive"].includes(organization.subscription_status) ||
      (organization.subscription_status === "past_due" && !accessActive));
  const daysLeft = compActive ? 0 : trialDaysLeft(organization);

  // ── LES RAPPELS QUE LE COMMERÇANT A DÉJÀ FAIT TAIRE ──
  //
  // Lus AVANT le rendu : un bandeau fermé n'est pas rendu puis masqué, il
  // n'existe pas dans le HTML. Les clés sont versionnées par ce qu'elles
  // annoncent — l'échéance de l'accès offert, le nombre de jours d'essai —
  // pour qu'un fait NOUVEAU se fasse entendre même si le précédent a été tu.
  // L'identifiant d'organisation en fait partie : le silence obtenu sur un
  // établissement ne dit rien de celui d'à côté (OrganizationSwitcher).
  const rappelsFermes = (await cookies()).get(RAPPELS_COOKIE)?.value;
  // Clés construites par le module, jamais assemblées ici : les segments y sont
  // ramenés à la grammaire et une échéance illisible rend `inconnu` au lieu
  // d'un `NaN` qui passerait sans bruit.
  const cleAccesOffert = construireCleAccesOffert(organization.id, compUntil);
  const cleEssai = construireCleEssai(organization.id, daysLeft);
  const montrerAccesOffert =
    compActive && !estRappelFerme(rappelsFermes, cleAccesOffert);
  const montrerEssai =
    !trialExpired && daysLeft > 0 && !estRappelFerme(rappelsFermes, cleEssai);

  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex-1 flex flex-col lg:flex-row bg-k-bg text-k-ink`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <SkipLink />
      {/* Îlot client monté UNE fois pour tout le panel : ce layout reste un
          Server Component (il lit cookies, organisation et abonnement), et
          l'émetteur de toasts est un magasin de module — donc aucun Provider
          à poser ici. Voir `src/lib/toast-bus.ts`. */}
      <ToastEnregistrement />
      {/* `lg:overflow-y-auto` S'AJOUTE À `lg:h-screen` : collée
          en haut sur toute la hauteur de l'écran et sans défilement propre, la
          colonne perdait son bas dès que le menu dépassait 100 vh — le bouton
          « Déconnexion » (en `mt-auto`) devenait littéralement inatteignable.
          Le préfixe `lg:` est OBLIGATOIRE : sous ce point de rupture l'aside
          est un simple bandeau et le menu mobile est un `<details>` qu'un
          `overflow` non préfixé rognerait à l'ouverture. Le contenu passe de
          `lg:h-full` à `lg:min-h-full` : il occupe toujours toute la hauteur
          quand le menu est court (le bouton reste collé en bas), et il peut
          désormais la DÉPASSER quand il est long — ce que l'aside fait
          maintenant défiler au lieu de le rogner. */}
      <aside className="lg:w-64 shrink-0 border-b-2 lg:border-b-0 lg:border-r-2 border-k-ink bg-k-bg lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <div className="flex flex-col gap-3 p-4 lg:min-h-full lg:gap-6 lg:p-5">
          {/* Ligne haute : logo (+ déconnexion sur mobile) */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Link
                href="/dashboard"
                className="text-xl leading-none text-k-ink"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
              >
                LastChance<span className="text-k-orange">.</span>
              </Link>
              <p className="mt-1.5 hidden items-center gap-1.5 truncate text-xs font-bold text-k-body lg:flex">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                {organization.name}
              </p>
            </div>
            <form action={logout} className="lg:hidden">
              <button
                type="submit"
                aria-label="Déconnexion"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-k-body transition-colors hover:bg-k-yellow/50 hover:text-k-ink"
              >
                <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
                </svg>
              </button>
            </form>
          </div>

          <OrganizationSwitcher
            activeId={organization.id}
            organizations={memberships.map((membership) => ({
              id: membership.organizationId,
              name: membership.organization.name,
            }))}
          />

          {/* `compActive` EST LE SECOND ARGUMENT, et son absence était un
              défaut visible : le bandeau « Accès offert 🎁 » ci-dessous
              annonce des modules ouverts par LastChance, « Découvrir » les
              marque « Actif » (discover/page.tsx passe bien `fullAccess`)…
              et le menu n'en montrait aucun. Deux écrans se contredisaient
              sur le même fait. */}
          <DashboardNav
            role={role}
            activeExperiences={activeExperienceKinds(organization, compActive)}
          />

          <form action={logout} className="mt-auto hidden lg:block">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-k-body transition-colors hover:bg-k-yellow/50 hover:text-k-ink"
            >
              <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
              </svg>
              Déconnexion
            </button>
          </form>
        </div>
      </aside>

      <main id="contenu" tabIndex={-1} className="flex-1 min-w-0 outline-none">
        {montrerAccesOffert && (
          <RappelFermable
            cle={cleAccesOffert}
            className="border-b-2 border-k-ink bg-k-green/15"
          >
            <div className="px-6 py-3 text-sm font-bold text-k-ink">
              <span className="font-black">Accès offert 🎁</span> — vous
              bénéficiez d&apos;un accès offert aux modules activés par
              LastChance
              {compUntil ? ` jusqu'au ${formatDate(compUntil)}` : ""}.
            </div>
          </RappelFermable>
        )}
        {pastDueInGrace && (
          <div className="border-b-2 border-k-ink bg-red-100 px-6 py-3 text-sm font-bold text-k-ink">
            {/* ÉTAT, PAS CAUSE. Ce bandeau affirmait « votre dernier paiement
                a échoué ». Or `past_due` se pose par DEUX chemins : le webhook
                Stripe (où la phrase est vraie) et le back-office, où un
                administrateur peut le poser pour toute autre raison — le
                commerçant lisait alors l'annonce d'un échec qui n'avait pas eu
                lieu, et allait vérifier une carte bancaire en bon état.
                Distinguer les deux demanderait une colonne (`past_due_source`)
                : décrire l'état plutôt que d'en inventer la cause ne coûte
                rien et ne ment dans aucun des deux cas. */}
            Votre abonnement est en incident de paiement. Vos roues restent
            actives
            {graceEndsAt ? ` jusqu'au ${formatDate(graceEndsAt)}` : " quelques jours"}
            {" "}— mettez à jour votre moyen de paiement d&apos;ici là.{" "}
            {peutGererAbonnement ? (
              <Link
                href="/dashboard/settings"
                className="font-semibold underline"
              >
                Mettre à jour le paiement
              </Link>
            ) : (
              <span className="font-semibold">
                Prévenez le propriétaire du compte : lui seul peut mettre à
                jour le paiement.
              </span>
            )}
          </div>
        )}
        {subscriptionInactive && (
          <div className="border-b-2 border-k-ink bg-k-yellow px-6 py-3 text-sm font-bold text-k-ink">
            Votre abonnement est inactif : vos roues publiques sont
            désactivées.{" "}
            {peutGererAbonnement ? (
              <Link
                href="/dashboard/settings"
                className="font-semibold underline"
              >
                Gérer l&apos;abonnement
              </Link>
            ) : (
              <span className="font-semibold">
                Prévenez le propriétaire du compte : lui seul peut gérer
                l&apos;abonnement.
              </span>
            )}
          </div>
        )}
        {trialExpired && (
          <div className="border-b-2 border-k-ink bg-k-yellow px-6 py-3 text-sm font-bold text-k-ink">
            Votre essai gratuit est terminé : vos roues publiques sont
            désactivées et vos campagnes ne peuvent plus être activées. Vous
            pouvez toujours préparer vos QR codes.{" "}
            {peutGererAbonnement ? (
              <Link
                href="/dashboard/settings"
                className="font-semibold underline"
              >
                S&apos;abonner
              </Link>
            ) : (
              <span className="font-semibold">
                Prévenez le propriétaire du compte : lui seul peut souscrire.
              </span>
            )}
          </div>
        )}
        {/* FERMABLE, contrairement aux trois bandeaux ci-dessus : celui-ci
            informe d'un compte à rebours, il n'explique aucune coupure. Et
            comme sa clé porte le nombre de jours, le fermer aujourd'hui ne
            fait taire QUE la version d'aujourd'hui — demain le chiffre a
            changé, donc le rappel revient. */}
        {montrerEssai && (
          <RappelFermable
            cle={cleEssai}
            className="border-b-2 border-k-ink bg-k-blue/40"
          >
            <div className="px-6 py-3 text-sm font-bold text-k-ink">
              <span className="font-black">Essai gratuit</span> :{" "}
              {daysLeft} jour{daysLeft > 1 ? "s" : ""} restant
              {daysLeft > 1 ? "s" : ""}.{" "}
              {peutGererAbonnement && (
                <Link
                  href="/dashboard/settings"
                  className="font-black underline underline-offset-2 hover:text-k-orange"
                >
                  S&apos;abonner
                </Link>
              )}
            </div>
          </RappelFermable>
        )}
        <div className="p-6 lg:p-10 max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
