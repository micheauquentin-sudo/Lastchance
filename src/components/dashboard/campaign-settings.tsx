"use client";

import { useActionState, useRef } from "react";
import { deleteCampaign, duplicateCampaign, updateCampaign } from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RaccourciAtelier, VoirLeJeu } from "@/components/dashboard/atelier-raccourci";
import { hrefEtapeRoue } from "@/components/dashboard/atelier-roue-etapes";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  campaignDisplayStatus,
  repriseGeneriqueImpossible,
  type CampaignDisplayStatus,
  type CampaignWindowState,
} from "@/lib/campaign-window";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import { CampaignStatusBadge } from "@/components/dashboard/campaign-status";
import { useCampaignStatus } from "@/components/dashboard/campaign-status-live";
import { CAMPAIGN_OUTSTANDING_LOSS_HINT } from "@/lib/validations/campaigns";
import type { Campaign, CampaignStatus } from "@/types/database";

/**
 * LES VERBES SONT CEUX DU COMMERÇANT, PAS CEUX DE LA COLONNE `status`.
 *
 * « Activer » ne dit pas ce qui change pour le client ; « Archiver » sonne comme
 * un classement de papiers alors que c'est la fin de l'animation. Le même
 * vocabulaire est tenu sur les huit modules — voir `components/ui/status-badge`
 * pour son pendant côté états.
 *
 * Deux transitions partaient du même mot « Activer » : ouvrir un brouillon et
 * reprendre une pause ne sont pas le même geste, elles se disent donc
 * différemment (`from` distincts).
 */

/**
 * Mettre en pause, clôturer et restaurer en brouillon DÉSARMENT tous trois la
 * programmation automatique (`set_campaign_status` pose `auto_schedule =
 * false`). Sans cette phrase, un commerçant qui pause une heure croirait sa
 * programmation intacte et ne comprendrait pas, la semaine suivante, pourquoi
 * la campagne ne se rouvre plus toute seule. Le ré-armement se fait à un écran
 * de distance, dans « Programmation et budget » : on le nomme.
 */
const DESARMEMENT_PROGRAMMATION =
  "La programmation automatique est désarmée ; ré-armez-la dans « Programmation et budget » si vous voulez qu'elle reprenne la main.";
/**
 * CE QUI EST VRAI MAINTENANT, POUR LES QUATRE ÉTATS.
 *
 * La carte ne disait la conséquence QUE sur « ouverte » : un brouillon, une
 * pause et une clôture n'affichaient rien du tout. Le commerçant lisait donc
 * une rangée de boutons sans savoir d'où il partait — et « Ouvrir aux
 * joueurs » à côté de « Clôturer » ne dit pas, à lui seul, si les clients
 * jouent en ce moment.
 *
 * Une phrase par état, tournée vers LE CLIENT et pas vers la colonne SQL :
 * c'est la même règle que `StatusBadge`, dont la pastille accompagne ici la
 * phrase.
 */
const PHRASE_ETAT: Record<CampaignDisplayStatus, string> = {
  draft:
    "Vos clients ne peuvent pas encore jouer : le QR code ne lance aucune partie.",
  active: "Un client qui scanne le QR code peut jouer.",
  paused:
    "Le jeu est suspendu : le QR code reste valide, mais aucune partie ne démarre.",
  archived:
    "L'animation est terminée : le QR code ne lance plus de partie, et les codes déjà gagnés restent retirables.",
  // LES DEUX ÉTATS QUE LA FENÊTRE PRODUIT, et sans lesquels la phrase
  // MENTIRAIT. Une campagne « active » dont les dates n'ont pas commencé —
  // ou sont passées — ne laisse jouer personne : annoncer « un client qui
  // scanne peut jouer » y serait faux. C'est exactement ce que la pastille
  // dit déjà depuis `campaignDisplayStatus` ; la phrase suit la même source.
  scheduled:
    "La date d'ouverture n'est pas encore arrivée : le QR code ne lance pas encore de partie.",
  ended:
    "La date de fin est passée : le QR code ne lance plus de partie, et les codes déjà gagnés restent retirables.",
};

const STATUS_ACTIONS: Array<{
  from: CampaignStatus[];
  to: CampaignStatus;
  label: string;
  /**
   * Conséquence à annoncer SOUS le bouton qui la produit. Le champ suit son
   * bouton — une note posée hors du tableau se retrouverait, au premier
   * réordonnancement, sous une autre action que celle qu'elle décrit.
   */
  note?: string;
}> = [
  { from: ["draft"], to: "active", label: "Ouvrir aux joueurs" },
  { from: ["paused"], to: "active", label: "Rouvrir aux joueurs" },
  {
    from: ["active"],
    to: "paused",
    label: "Mettre en pause",
    note: DESARMEMENT_PROGRAMMATION,
  },
  {
    from: ["draft", "active", "paused"],
    to: "archived",
    label: "Clôturer",
    note: DESARMEMENT_PROGRAMMATION,
  },
  {
    from: ["archived"],
    to: "draft",
    label: "Restaurer en brouillon",
    note: DESARMEMENT_PROGRAMMATION,
  },
];

/**
 * LE GESTE DE PUBLICATION, AU MÊME ENDROIT QUE SUR LES SEPT AUTRES MODULES.
 *
 * Il vivait tout en bas de la page, dans la carte « Réglages », après la roue,
 * les QR, la performance des lots, la réclamation, les automatisations, le
 * parrainage et l'enregistrement en modèle. La campagne était le seul module où
 * « ouvrir aux joueurs » demandait de faire défiler sept blocs. Il remonte donc
 * juste sous la Carte de l'Aventure, comme partout ailleurs — le reste des
 * réglages (renommer, dupliquer, supprimer) n'a pas cette urgence et reste bas.
 */
export function CampaignStatusControls({
  campaign,
  wheelId,
  hrefJeu = null,
  modele = null,
  performance = null,
  windowState = "open",
}: {
  campaign: Campaign;
  /**
   * Roue que la page a retenue pour sa checklist. Le raccourci d'atelier vise
   * LA MÊME : ouvrir l'atelier sur une autre roue que celle dont la tuile
   * annonce les manques enverrait corriger un écran où il n'y a rien à
   * corriger. `null` accepté — la page sans roue laisse l'atelier choisir.
   */
  wheelId?: string | null;
  /** URL joueur du premier QR de la campagne, `null` s'il n'y en a aucun. */
  hrefJeu?: string | null;
  /**
   * « Enregistrer comme modèle » et « Performance par lot », rendus par la
   * page (Server Component) et POSÉS ici en sections.
   *
   * Passés en nœuds plutôt qu'importés : `PrizePerformance` n'est pas un
   * composant client, et l'importer depuis ce fichier-ci le ferait basculer
   * côté navigateur pour rien. La page les rend là où elle les a toujours
   * rendus ; seule leur PLACE change.
   */
  modele?: React.ReactNode;
  performance?: React.ReactNode;
  /**
   * Fenêtre de dates, calculée CÔTÉ SERVEUR par la page
   * (`campaignWindowState`). La pastille et la phrase d'état la lisent toutes
   * deux : sans elle, une campagne « active » hors de ses dates s'annoncerait
   * ouverte alors que personne ne peut jouer. Une garde du dépôt
   * (`campaign-window-coverage.test.ts`) exige que toute pastille la reçoive.
   */
  windowState?: CampaignWindowState;
}) {
  const { status, setStatus } = useCampaignStatus();
  // ENREGISTREMENT AUTOMATIQUE — sur le RENOMMAGE SEUL, et délibérément :
  // « Dupliquer » crée une campagne, « Supprimer » est irréversible, et rien
  // de tout cela ne doit partir d'une frappe au clavier. Le champ est
  // `required` : une saisie effacée fait afficher le refus de validation
  // plutôt que d'enregistrer un nom vide.
  const formRef = useRef<HTMLFormElement>(null);
  const { enAttente, bloqueParValidation } = useAutoSave(formRef);
  const {
    state: renameState,
    pending: renamePending,
    onSubmit: renameSubmit,
  } = useActionForm(updateCampaign, {
    networkError: "Renommage impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  const [duplicateState, duplicateAction, duplicatePending] = useActionState(
    duplicateCampaign,
    null,
  );
  const {
    state: statusState,
    pending: statusPending,
    onSubmit: statusSubmit,
  } = useActionForm(updateCampaign, {
    // Le statut canonique revient de l'action et met à jour la pastille et les
    // transitions locales. Le commerçant voit donc l'ouverture immédiatement,
    // sans navigation vers un rendu intermédiaire qui pourrait échouer.
    refreshOnSuccess: false,
    onSuccess: ({ status: nextStatus }) => {
      if (nextStatus) setStatus(nextStatus);
    },
    networkError: "Changement de statut impossible, réessayez.",
  });

  /**
   * « ROUVRIR AUX JOUEURS » NE S'AFFICHE PLUS QUAND IL NE PEUT QU'ÉCHOUER.
   *
   * Une pause budget non résorbée se reprend par le formulaire de la bannière
   * (« Reprendre la campagne », qui demande le nouveau plafond) ; une pause
   * `droit_expire` se rouvre toute seule dès qu'une offre redevient active.
   * Dans les deux cas le bouton générique était un aller simple vers un refus
   * serveur. Le prédicat est IMPORTÉ, jamais recopié : c'est le même que celui
   * qu'oppose `updateCampaign`, et deux exemplaires redivergeraient.
   *
   * Les quatre autres transitions ne bougent pas — « Clôturer » notamment doit
   * rester offerte : un commerçant qui renonce ne doit jamais être enfermé.
   */
  const campagneAffichee = { ...campaign, status };
  const repriseIndisponible = repriseGeneriqueImpossible(campagneAffichee);
  const transitions = STATUS_ACTIONS.filter(
    (a) =>
      a.from.includes(status) &&
      !(status === "paused" && a.to === "active" && repriseIndisponible),
  );
  // La même conséquence est portée par trois boutons, dont deux coexistent sur
  // une campagne ouverte : la phrase n'est écrite qu'une fois, sous le premier
  // bouton qui la produit, plutôt que deux fois côte à côte.
  // Les notes sortent des formulaires et se posent SOUS la rangée, en pleine
  // largeur. Chacune vivait sous son bouton dans un `max-w-xs` : la phrase
  // s'y cassait sur quatre lignes de vingt caractères, et deux boutons voisins
  // devenaient de hauteurs différentes. Elles restent dédupliquées — la même
  // conséquence portée par deux boutons ne s'écrit qu'une fois.
  const notes = [...new Set(transitions.map((t) => t.note).filter(Boolean))];

  return (
    <Card>
      <h2 className="font-semibold mb-4">Statut de la campagne</h2>

      {/* ── L'ÉTAT SE LIT AVANT DE SE CHANGER ──
          La carte ouvrait sur une rangée de boutons. « Ouvrir aux joueurs »
          à côté de « Clôturer » ne dit pas, à lui seul, si les clients jouent
          EN CE MOMENT — et seule l'ouverture avait droit à une phrase. La
          pastille et la phrase se lisent d'un coup, pour les quatre états. */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-k-ink/15 bg-k-bg px-4 py-3">
        <CampaignStatusBadge status={status} windowState={windowState} />
        <p className="min-w-0 flex-1 text-sm font-bold text-k-body">
          {PHRASE_ETAT[campaignDisplayStatus(status, windowState)]}
        </p>
      </div>

      {/* ── UNE SEULE RANGÉE : changer l'état, ou aller voir ──
          Les transitions et les deux raccourcis étaient sur deux rangées
          séparées par une phrase. Ce sont les mêmes gestes — agir sur cette
          campagne — et ils tiennent sur une ligne, séparés par un filet. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {transitions.map((t) => (
          <form key={`${t.to}-${t.label}`} onSubmit={statusSubmit}>
            <input type="hidden" name="id" value={campaign.id} />
            <input type="hidden" name="status" value={t.to} />
            <Button
              type="submit"
              variant={t.to === "active" ? "primary" : "secondary"}
              disabled={statusPending}
            >
              {t.label}
            </Button>
          </form>
        ))}
        <span
          aria-hidden
          className="mx-1 hidden h-7 w-px shrink-0 bg-zinc-200 sm:block"
        />
        <RaccourciAtelier href={hrefEtapeRoue(campaign.id, "jeu", wheelId)} />
        <VoirLeJeu href={hrefJeu} />
      </div>
      {notes.map((note) => (
        <p key={note} className="mt-2 text-xs font-bold text-k-body">
          {note}
        </p>
      ))}
      <FieldError
        message={statusState && !statusState.ok ? statusState.error : undefined}
      />

      {/* ── CE QU'ON FAIT D'UNE CAMPAGNE, AU MÊME ENDROIT ──
          Renommer, dupliquer, enregistrer comme modèle et lire la performance
          étaient trois tuiles séparées, chacune repliée, chacune à déplier
          pour découvrir un seul bouton. Elles deviennent des sections de la
          carte qui porte déjà le statut : c'est la même question — que
          fait-on de cette campagne ? — et elle se répond d'un seul regard.
          La suppression, elle, N'EST PAS ici : voir `SupprimerCampagne`. */}
      {/* ── TROIS GESTES, TROIS COLONNES ──
          Empilés, ils occupaient un tiers de la largeur sur toute la hauteur
          de la carte : trois titres, trois boutons, et un long couloir de
          blanc à droite. Ils sont de même nature — préparer la suite de cette
          campagne — et se lisent mieux côte à côte qu'en file.
          `sm:2` puis `lg:3` : sur un téléphone la colonne unique reste la
          bonne réponse, et un bouton de 200 px ne se coupe pas en deux. */}
      <div className="mt-6 grid gap-x-8 gap-y-6 border-t border-zinc-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <h3 className="mb-1 font-black text-k-ink">Nom de la campagne</h3>
          <p className="mb-3 text-sm text-zinc-500">
            Le nom que vous voyez dans vos listes. Vos clients ne le lisent
            jamais.
          </p>
          <form
            ref={formRef}
            onSubmit={renameSubmit}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="id" value={campaign.id} />
            <div className="min-w-0 flex-1">
              <Label htmlFor="campaign-name">Nom</Label>
              <Input
                id="campaign-name"
                name="name"
                defaultValue={campaign.name}
                required
                maxLength={120}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={renamePending}>
              {renamePending ? "…" : "Renommer"}
            </Button>
          </form>
          {enAttente && !renamePending && (
            <p className="mt-2 text-sm font-semibold text-k-body">
              Modification en attente d&apos;enregistrement…
            </p>
          )}
          {bloqueParValidation && (
            <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
              Non enregistré : le nom de la campagne ne peut pas être vide.
            </p>
          )}
          <FieldError
            message={renameState && !renameState.ok ? renameState.error : undefined}
          />
        </div>

        <div>
          <h3 className="mb-1 font-black text-k-ink">Dupliquer</h3>
          <p className="mb-3 text-sm text-zinc-500">
            Crée une copie en brouillon (roues, lots, réglages) — utile pour
            relancer un jeu saisonnier.
          </p>
          <form action={duplicateAction}>
            <input type="hidden" name="id" value={campaign.id} />
            <Button type="submit" variant="secondary" disabled={duplicatePending}>
              {duplicatePending ? "Duplication…" : "Dupliquer cette campagne"}
            </Button>
          </form>
          <FieldError
            message={
              duplicateState && !duplicateState.ok ? duplicateState.error : undefined
            }
          />
        </div>

        {modele}
      </div>

      {/* PLEINE LARGEUR, et hors de la grille : c'est un tableau de chiffres,
          il se lit en lignes complètes et non dans une colonne d'un tiers. */}
      {performance && (
        <div className="mt-6 border-t border-zinc-100 pt-5">{performance}</div>
      )}
    </Card>
  );
}

/**
 * SUPPRIMER LA CAMPAGNE — seule, simple, tout en bas de la page.
 *
 * Ce geste vivait dans une tuile « Réglages » qu'il fallait déplier, en
 * compagnie du renommage et de la duplication. Trois gestes de nature
 * opposée sous un même titre : deux se refont, le troisième ne se défait
 * pas. Renommer et dupliquer ont rejoint la carte « Statut de la campagne » ;
 * la suppression reste à part, en pied de page, là où on ne tombe pas dessus
 * par hasard.
 *
 * PAS DE `Card` : un cadre l'aurait remise au rang des autres réglages. Un
 * filet rouge, un titre, une phrase qui énumère ce qui disparaît — et le
 * bouton.
 */
export function SupprimerCampagne({ campaign }: { campaign: Campaign }) {
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteCampaign,
    null,
  );

  return (
    <div className="mt-10 border-t-2 border-red-200 pt-5">
      <h2 className="mb-1 font-black text-red-700">Supprimer la campagne</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Supprime la campagne, sa roue, ses lots, ses QR codes et ses
        participations. Irréversible.
      </p>
      <form
        action={deleteAction}
        onSubmit={(e) => {
          if (!confirm("Supprimer définitivement cette campagne ?")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={campaign.id} />
        {/* La case n'apparaît PAS d'emblée : elle ne sert qu'après CE refus
            précis, lequel NOMME le nombre de lots en attente. Demander la
            confirmation avant de savoir combien serait du bruit ; la demander
            après, c'est un choix informé. Le filtre porte sur le marqueur
            partagé et non sur `!ok` : « Suppression impossible » ou une
            coupure réseau montraient la même case destructive. */}
        {deleteState &&
          !deleteState.ok &&
          deleteState.error.includes(CAMPAIGN_OUTSTANDING_LOSS_HINT) && (
            <label className="mb-2 flex items-start gap-2 text-sm font-semibold text-red-700">
              <input
                type="checkbox"
                name="confirm_outstanding"
                value="1"
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              Je comprends que les codes non retirés deviendront introuvables
              en caisse.
            </label>
          )}
        <Button type="submit" variant="danger" disabled={deletePending}>
          {deletePending ? "Suppression…" : "Supprimer la campagne"}
        </Button>
      </form>
      <FieldError
        message={deleteState && !deleteState.ok ? deleteState.error : undefined}
      />
    </div>
  );
}
