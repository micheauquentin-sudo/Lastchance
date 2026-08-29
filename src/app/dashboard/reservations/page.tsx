import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { etatUiCreneau, RESERVER_FUSEAU_DEFAUT } from "@/lib/reserver";
import {
  loadReserverDashboardContext,
  loadReserverQueuesDashboardContext,
  loadStockOffersDashboardContext,
} from "@/lib/reserver-context";
import { construireVerificationReserver } from "@/lib/activation/reserver";
import { carteTuile } from "@/lib/checklist/carte-tuile";
import { tuilesDuModule } from "@/lib/checklist/tuiles";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CarteRepliable } from "@/components/dashboard/carte-repliable";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { ArriveesCheckin } from "@/components/reserver/arrivees-checkin";
import { FilesAccueilPanneau } from "@/components/reserver/files-accueil-panneau";
import { NouvelleActiviteForm } from "@/components/reserver/nouvelle-activite-form";
import { OffresStockPanneau } from "@/components/reserver/offres-stock-panneau";
import { PastilleFormat } from "@/components/reserver/pastilles";

export const metadata: Metadata = { title: "Réservation" };

/**
 * LES DEUX PRODUITS, UN SEUL CORPS DE PAGE (RDV-5).
 *
 * « Réservation » (prise de rendez-vous) et « Moments » (ateliers, files,
 * invitations, offres) partagent les MÊMES tables : ce qui les sépare est
 * `reservation_activities.booking_mode`. Dupliquer 270 lignes d'écran pour
 * un filtre aurait créé deux pages à tenir d'accord — et elles auraient
 * divergé au premier ajustement.
 *
 * Les files d'accueil et les offres de stock n'appartiennent qu'aux Moments :
 * une prise de rendez-vous n'a ni file ni invendu de dernière minute.
 */
export type ModeAgenda = "rendez_vous" | "moment";

interface ConfigAgenda {
  /** Le droit qui ouvre l'écran — deux add-ons distincts depuis RDV-5. */
  entitlement: "reserver" | "rendez_vous";
  titre: string;
  sousTitre: string;
  /** Files d'accueil et offres de stock : Moments seulement. */
  avecAccueil: boolean;
  /**
   * LES MOTS DU PRODUIT. « Activité » est juste pour un atelier et creux
   * pour un restaurant : celui qui ouvre « Réservation » cherche à décrire
   * SA SALLE, et un écran qui lui propose de créer une « activité » le
   * laisse chercher s'il est au bon endroit.
   */
  motCreer: string;
  videTitre: string;
  videAide: string;
}

const CONFIG: Record<ModeAgenda, ConfigAgenda> = {
  rendez_vous: {
    entitlement: "rendez_vous",
    titre: "Réservation",
    sousTitre:
      "Posez vos horaires une fois : les créneaux se génèrent, vos clients prennent rendez-vous depuis votre Vitrine.",
    avecAccueil: false,
    motCreer: "+ Créer ma salle",
    videTitre: "Vous n'avez pas encore de salle.",
    videAide:
      "Créez-la, puis réglez-la par étapes : vos horaires, vos tables, la durée d'un service. Vos clients réserveront ensuite depuis votre Vitrine.",
  },
  moment: {
    entitlement: "reserver",
    titre: "Moments",
    sousTitre:
      "Ateliers, dégustations, files d'accueil : faites vivre un moment à vos clients.",
    avecAccueil: true,
    motCreer: "+ Nouvelle activité",
    videTitre: "Aucune activité pour l'instant. Créez la première !",
    videAide: "",
  },
};

/**
 * L'AGENDA DU COMMERÇANT — ses activités réservables, et son écran d'arrivées.
 *
 * ── LE MODULE S'APPELLE `reserver`, PAS `reservations` ──
 *
 * L'agenda a longtemps été une des trois capacités du droit `vitrine`, avec la
 * publication de la carte et le CRM léger. La migration 20261020120000 lui a
 * donné SA PROPRE CLÉ, `reserver` : l'agenda se vend seul, et la Vitrine aussi.
 * `capacitesDuModule` prend donc `"reserver"`, et l'encart d'offre porte le même
 * entitlement — sans quoi il proposerait à l'achat un produit qui n'ouvre plus
 * cet écran. Nommer ici un module qui n'existe pas ferait échouer `tsc` sur
 * `GrantableModule`, ce qui est le comportement souhaité.
 *
 * ── DEUX VERDICTS, ET ILS NE DISENT PAS LA MÊME CHOSE ──
 *
 * `capacitesDuModule` décide de ce que la page MONTRE : découvrir reste ouvert
 * à tous (cahier §3), c'est pourquoi un commerçant sans le droit voit quand même
 * l'écran et son encart d'offre. `loadReserverDashboardContext` décide de ce
 * qu'elle LIT : sans droit effectif il rend `no_access`, et la liste est vide —
 * la découverte ne donne pas accès aux données. Confondre les deux aurait soit
 * fermé la porte à qui veut comprendre ce qu'il achèterait, soit ouvert des
 * lignes à qui n'y a pas droit.
 *
 * ── PAS DE FILTRES NI DE PAGINATION, ET C'EST DÉLIBÉRÉ ──
 *
 * Les huit pages liste des animations portent `ModuleListFilters` et
 * `Pagination` parce qu'un commerçant y accumule des dizaines de campagnes
 * archivées. Une activité réservable est un objet de catalogue —
 * « Dégustation », « Atelier floral » — dont on tient trois ou quatre, et qui ne
 * s'archive pas : elle se coupe. Un filtre par statut sur deux valeurs et une
 * pagination sur quatre lignes ajouteraient deux contrôles à lire pour rien. Le
 * jour où un commerçant en tient trente, ces deux composants existent et
 * s'ajoutent sans rien changer d'autre.
 */
export async function PageAgenda({ mode }: { mode: ModeAgenda }) {
  const config = CONFIG[mode];
  const { organization } = await getUserAndOrg();

  // Découvrir / préparer / publier (cahier §3).
  const capacites = await capacitesDuModule(config.entitlement);
  if (!capacites.canExplore) notFound();

  // Les deux lectures sont INDÉPENDANTES — l'agenda des créneaux d'un côté, les
  // files d'accueil de l'autre — et n'ont aucune donnée en commun : les
  // enchaîner aurait ajouté un aller-retour à une page que le commerçant ouvre
  // en début de service.
  // Les trois lectures sont INDÉPENDANTES — l'agenda des créneaux, les files
  // d'accueil, les offres de stock — et n'ont aucune donnée en commun.
  const [agenda, filesAccueil, offresStock] = await Promise.all([
    loadReserverDashboardContext(),
    loadReserverQueuesDashboardContext(),
    loadStockOffersDashboardContext(),
  ]);
  // LE FILTRE QUI SÉPARE LES DEUX PRODUITS. Une activité appartient à l'un ou
  // à l'autre, jamais aux deux : `booking_mode` est exclusif.
  const activites = agenda.ok
    ? agenda.activities.filter((a) => a.bookingMode === mode)
    : [];
  const files = config.avecAccueil && filesAccueil.ok ? filesAccueil.queues : [];
  const timeZone = agenda.ok
    ? agenda.timezone
    : (organization?.timezone ?? RESERVER_FUSEAU_DEFAUT);

  // LES QUATRE TUILES DE CETTE PAGE, dans l'ordre du rendu — `TUILES_RESERVER`
  // le tient, pas ce fichier : le rang se lit de la position dans la table, et
  // le recopier ici en ferait une seconde table à tenir d'accord.
  //
  // Les deux entrées se passent telles quelles : `agenda.activities` porte déjà
  // `id`, `active`, `kind` et ses créneaux, et les files leur `status` et leur
  // `activityId` — c'est de ce croisement que naît le contrôle `files-activite`,
  // le même défaut que la pastille corrigée dans `FilesAccueilPanneau`.
  const tuiles = tuilesDuModule(
    "reserver",
    construireVerificationReserver({ activites, files }).controles,
  );

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre={config.titre}
        sousTitre={config.sousTitre}
        actions={
          capacites.canEditDraft ? (
            <NouvelleActiviteForm
              bookingMode={mode}
              libelle={config.motCreer}
            />
          ) : null
        }
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="reserver">
        Activités et créneaux à places limitées, réservation sans compte,
        confirmation par email au choix du client, et enregistrement des arrivées
        en caisse par code court.
      </ModuleCapabilityNotice>

      {/* LES QUATRE BLOCS NUMÉROTÉS. L'espacement est porté ICI, par
          `space-y-8`, et non plus par un `mt-8` à l'intérieur de chaque carte :
          une marge interne aurait laissé la pastille de rang — posée sur le
          coin haut-gauche de l'enveloppe — flotter 32 px au-dessus du titre
          qu'elle numérote. */}
      <div className="mt-8 space-y-8">
      {/* LE PREMIER BLOC DEVIENT UNE CARTE TITRÉE, DEPUIS QU'IL PORTE UN RANG.
          La liste des activités flottait sous l'en-tête de page, sans titre ni
          cadre : une pastille « 1 » et un badge de verdict s'y seraient posés
          sur la première ligne de la liste, sans rien qui dise de quoi ils sont
          le rang. Elle prend donc la même forme que les trois blocs suivants —
          `<Card>` et `<h2>` — et son état vide le motif de `FilesAccueilPanneau`
          plutôt qu'une carte dans une carte. Le titre est celui de la tuile,
          écrit une seule fois dans `TUILES_RESERVER`. */}
      <CarteRepliable {...carteTuile(tuiles, "activites")}>
        <Card>
        <h2>Vos activités</h2>
      {activites.length === 0 ? (
        <div className="mt-5 rounded-xl border-2 border-dashed border-k-ink/25 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-k-body">
            {config.videTitre}
          </p>
          {config.videAide ? (
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
              {config.videAide}
            </p>
          ) : null}
          {/* LE BOUTON EST ICI AUSSI : « créez la première » sans rien à
              cliquer laisse le seul bouton en haut d'écran, hors du regard de
              celui qui vient de lire la phrase. */}
          {capacites.canEditDraft ? (
            <div className="mt-4 flex justify-center">
              <NouvelleActiviteForm
                instanceId="-vide"
                bookingMode={mode}
                libelle={config.motCreer}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {activites.map((activite) => {
            // « Ouverts à venir » au sens du joueur : c'est `etatUiCreneau` qui
            // en décide, comme sur la page publique. Un compte calculé
            // autrement ici ferait dire au tableau de bord « 3 créneaux » là où
            // le client n'en voit qu'un.
            //
            // LE FORMAT ENTRE DANS LE VERDICT (RES-5), et sans lui la phrase
            // ci-dessus cessait d'être vraie : sur un Atelier Duo à qui il reste
            // UNE place, `etatUiCreneau` rend « complet » — une place isolée
            // n'est prenable par personne — mais seulement si on lui DIT que
            // c'est un duo. Sans `kind`, cet écran comptait le créneau comme
            // ouvert quand la page publique affichait « complet » dessus : le
            // commerçant lisait « 1 créneau ouvert à venir » et son client ne
            // pouvait pas réserver.
            //
            // Le format vit sur l'ACTIVITÉ, pas sur le créneau
            // (`ReserverSlotDashboardView` ne le porte pas, et c'est voulu — un
            // même Atelier Duo ne peut pas changer d'unité selon l'heure). On le
            // joint donc ici, à la lecture.
            const ouverts = activite.slots.filter(
              (creneau) =>
                etatUiCreneau({ ...creneau, kind: activite.kind }) === "ouvert",
            ).length;
            return (
              <li key={activite.id}>
                <Link
                  href={`/dashboard/reservations/${activite.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-orange-300"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-2xl" aria-hidden>
                        🕑
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{activite.name}</p>
                        <p className="mt-0.5 text-sm text-zinc-500">
                          {ouverts > 0
                            ? `${ouverts} créneau${ouverts > 1 ? "x" : ""} ouvert${ouverts > 1 ? "s" : ""} à venir`
                            : "Aucun créneau ouvert à venir"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {/* Le format (RES-5) AVANT l'interrupteur : « Atelier Duo »
                        dit ce que c'est, « Ouverte » dit seulement si ça tourne.
                        Rien ne s'affiche sur une activité standard — c'est le
                        défaut, et une colonne où chaque ligne porte le même mot
                        ne montre plus les deux qui en portent un autre. */}
                    <PastilleFormat kind={activite.kind} />
                    <span
                      className={`shrink-0 rounded-full border-2 border-k-ink px-3 py-1 text-xs font-black ${
                        activite.active
                          ? "bg-k-green/40 text-k-ink"
                          : "bg-zinc-200 text-k-ink"
                      }`}
                    >
                      {activite.active ? "Ouverte" : "Coupée"}
                    </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
        </Card>
      </CarteRepliable>

      {/* L'écran d'arrivées est SOUS la liste et HORS d'une activité : le code
          d'un client ne dit pas laquelle il a réservée, et demander au caissier
          de choisir d'abord l'activité lui ferait chercher l'information qu'il
          vient précisément d'obtenir. La RPC, elle, résout le code dans toute
          l'organisation. */}
      <CarteRepliable {...carteTuile(tuiles, "arrivees")}>
        <ArriveesCheckin timeZone={timeZone} />
      </CarteRepliable>

      {/* LES FILES D'ACCUEIL SONT SOUS L'AGENDA, ET C'EST L'ORDRE DE LA JOURNÉE :
          on prépare ses créneaux le matin, on tient sa file toute la journée. La
          console est ouverte au CAISSIER — elle ne dépend pas de `canEditDraft`,
          qui ne gouverne que la création et les réglages, passés en `peutEditer`. */}
      {/* FILES D'ACCUEIL ET OFFRES DE STOCK : MOMENTS SEULEMENT. Une prise de
          rendez-vous n'a ni file d'attente — on a une heure — ni invendu de
          dernière minute. Les afficher aurait proposé deux outils sans
          emploi sur cet écran-là. */}
      {config.avecAccueil ? (
        <>
      <CarteRepliable {...carteTuile(tuiles, "files")}>
      <FilesAccueilPanneau
        files={files}
        // `active` EN PLUS DU NOM : couper une activité referme ses files côté
        // `queue_join`, et la vue d'une file ne porte que son propre `status`.
        // Sans ce drapeau, la pastille lisait « Ouverte » sur une file qui
        // refusait tout le monde.
        activites={activites.map((a) => ({
          id: a.id,
          name: a.name,
          active: a.active,
        }))}
        peutEditer={capacites.canEditDraft}
        appUrl={APP_URL}
        // Le Mode Attente active (RES-4) : ce qu'on peut proposer pendant
        // l'attente. Les deux listes sont celles de l'organisation, résolues
        // côté serveur — un identifiant de quiz ou de campagne ne se saisit pas.
        quiz={agenda.ok ? agenda.waitQuiz : []}
        campagnes={agenda.ok ? agenda.waitCampaigns : []}
      />
      </CarteRepliable>

      {/* LES OFFRES DE STOCK EN DERNIER, ET C'EST LA MÊME LOGIQUE DE JOURNÉE :
          on prépare ses créneaux le matin, on tient sa file toute la journée, et
          on solde son invendu en fin de service. Le geste du caissier n'est pas
          ici — le retrait se fait en CAISSE, par le code — d'où l'absence de
          console et le seul droit d'édition. */}
      <CarteRepliable {...carteTuile(tuiles, "offres")}>
        <OffresStockPanneau
          offres={offresStock.ok ? offresStock.offers : []}
          peutEditer={capacites.canEditDraft}
          appUrl={APP_URL}
          timeZone={timeZone}
        />
      </CarteRepliable>
        </>
      ) : null}
      </div>
    </div>
  );
}

/**
 * LA ROUTE « RÉSERVATION » — la prise de rendez-vous.
 *
 * Elle ne montre que les activités dont les créneaux sont ENGENDRÉS par des
 * horaires. Les Moments ont leur propre route, `/dashboard/moments`, et leur
 * propre droit : deux add-ons distincts depuis RDV-5.
 */
export default async function ReservationsPage() {
  return <PageAgenda mode="rendez_vous" />;
}
