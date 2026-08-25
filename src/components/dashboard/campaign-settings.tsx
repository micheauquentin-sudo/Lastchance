"use client";

import { useActionState, useRef } from "react";
import { deleteCampaign, duplicateCampaign, updateCampaign } from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RaccourciAtelier, VoirLeJeu } from "@/components/dashboard/atelier-raccourci";
import { hrefEtapeRoue } from "@/components/dashboard/atelier-roue-etapes";
import { FieldError, Input, Label } from "@/components/ui/input";
import { repriseGeneriqueImpossible } from "@/lib/campaign-window";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
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
}) {
  const { status, setStatus } = useCampaignStatus();
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
  const notesDeja = new Set<string>();
  const transitionsRendues = transitions.map((t) => {
    const note = t.note && !notesDeja.has(t.note) ? t.note : undefined;
    if (note) notesDeja.add(note);
    return { ...t, note };
  });

  return (
    <Card>
      <h2 className="font-semibold mb-4">Statut de la campagne</h2>
      <div className="flex flex-wrap items-start gap-2">
        {transitionsRendues.map((t) => (
          <form
            key={`${t.to}-${t.label}`}
            onSubmit={statusSubmit}
            className="max-w-xs"
          >
            <input type="hidden" name="id" value={campaign.id} />
            <input type="hidden" name="status" value={t.to} />
            <Button
              type="submit"
              variant={t.to === "active" ? "primary" : "secondary"}
              disabled={statusPending}
            >
              {t.label}
            </Button>
            {t.note && (
              <p className="mt-1.5 text-xs text-zinc-500">{t.note}</p>
            )}
          </form>
        ))}
      </div>
      {status === "active" && (
        <p className="mt-3 text-sm text-zinc-500">
          Ouverte aux joueurs — un client qui scanne le QR code peut jouer.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <RaccourciAtelier href={hrefEtapeRoue(campaign.id, "jeu", wheelId)} />
        <VoirLeJeu href={hrefJeu} />
      </div>
      <FieldError
        message={statusState && !statusState.ok ? statusState.error : undefined}
      />
    </Card>
  );
}

export function CampaignSettings({ campaign }: { campaign: Campaign }) {
  // useActionForm et non useActionState : l'état de chargement doit retomber
  // même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
  const {
    state: renameState,
    pending: renamePending,
    onSubmit: renameSubmit,
  } = useActionForm(updateCampaign, {
    networkError: "Renommage impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  // ENREGISTREMENT AUTOMATIQUE — sur le RENOMMAGE SEUL. Il s'arrête là, et de
  // façon délibérée : « Dupliquer » crée une campagne, « Supprimer » est
  // irréversible, et rien de tout cela ne doit partir d'une frappe au clavier.
  // Le champ est `required` : une saisie effacée fait afficher le refus de
  // validation plutôt que d'enregistrer un nom vide.
  const formRef = useRef<HTMLFormElement>(null);
  const { enAttente, bloqueParValidation } = useAutoSave(formRef);
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteCampaign,
    null,
  );
  const [duplicateState, duplicateAction, duplicatePending] = useActionState(
    duplicateCampaign,
    null,
  );

  return (
    /* UNE SEULE Card, et c'est la racine du composant. Il en rendait DEUX
       (« Réglages » puis « Zone dangereuse ») dans un `space-y-4` ; la tuile
       repliable qui l'enveloppe n'encadre rien — elle pose un liseré à gauche
       et suppose une carte unique — si bien que la carte rouge sortait du
       cadre, seule au milieu de la page. La zone dangereuse devient une
       SECTION séparée par un filet, comme les six autres modules ; le filet
       reste rouge, c'est lui qui porte l'avertissement. */
    <Card>
      <h2 className="font-semibold mb-4">Réglages</h2>

      <form
        ref={formRef}
        onSubmit={renameSubmit}
        className="flex items-end gap-2 mb-6"
      >
        <input type="hidden" name="id" value={campaign.id} />
        <div className="flex-1 max-w-xs">
          <Label htmlFor="campaign-name">Nom de la campagne</Label>
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
        <p className="text-sm font-semibold text-k-body">
          Modification en attente d&apos;enregistrement…
        </p>
      )}
      {bloqueParValidation && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          Non enregistré : le nom de la campagne ne peut pas être vide.
        </p>
      )}
      <FieldError
        message={renameState && !renameState.ok ? renameState.error : undefined}
      />

      <div className="mt-4 pt-4 border-t border-zinc-100">
        <form action={duplicateAction}>
          <input type="hidden" name="id" value={campaign.id} />
          <Button type="submit" variant="secondary" disabled={duplicatePending}>
            {duplicatePending ? "Duplication…" : "Dupliquer cette campagne"}
          </Button>
        </form>
        <p className="mt-2 text-xs text-zinc-500">
          Crée une copie en brouillon (roues, lots, réglages) — utile pour
          relancer un jeu saisonnier.
        </p>
        <FieldError
          message={
            duplicateState && !duplicateState.ok ? duplicateState.error : undefined
          }
        />
      </div>

      {/* ZONE DANGEREUSE — une section, plus une carte. Le filet est rouge et
          doublé : c'est lui qui dit « on change de registre », sans avoir à
          sortir un second cadre de la tuile. Le titre passe en `<h3>` — il
          échappe ainsi naturellement au trait de marqueur jaune que `Card`
          pose sur ses `<h2>` directs, et le hack `!` qu'il fallait pour
          l'annuler disparaît. */}
      <div className="mt-5 border-t-2 border-red-200 pt-4">
        <h3 className="font-black text-red-700 mb-1">Zone dangereuse</h3>
        <p className="text-sm text-zinc-500 mb-4">
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
              confirmation avant de savoir combien serait du bruit ; la
              demander après, c'est un choix informé. Le filtre porte sur le
              marqueur partagé et non sur `!ok` : « Suppression impossible »
              ou une coupure réseau montraient la même case destructive. */}
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
    </Card>
  );
}
