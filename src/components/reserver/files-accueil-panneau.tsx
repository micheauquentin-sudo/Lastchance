"use client";

import { useState } from "react";
import {
  createReserverQueue,
  updateReserverQueue,
} from "@/actions/reserver";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { champSelect } from "@/components/reserver/champs";
import { ChampsAttenteActive } from "@/components/reserver/champs-attente-active";
import { FileAccueilConsole } from "@/components/reserver/file-accueil-console";
import { PastilleFileAccueil } from "@/components/reserver/pastilles";
import {
  cheminFileReserver,
  QUEUE_MAX_LIVE_ENTRIES_DEFAUT,
  QUEUE_MAX_LIVE_ENTRIES_MAX,
  QUEUE_MAX_LIVE_ENTRIES_MIN,
  QUEUE_NAME_MAX,
} from "@/lib/reserver";
import type { ReserverQueueDashboardView } from "@/lib/reserver-context";
import { useActionForm } from "@/lib/use-action-form";

/**
 * « FILES D'ACCUEIL » — la section du tableau de bord Réservations (RES-3).
 *
 * ── DEUX DROITS DIFFÉRENTS DANS UNE MÊME SECTION, ET C'EST VOULU ──
 *
 * La CONSOLE (appeler, servir, noter une absence) est un poste de travail : un
 * CAISSIER doit pouvoir s'en servir, c'est même le seul écran de ce module qu'il
 * ouvrira. Le CRUD des files (créer, renommer, mettre en pause, changer le
 * plafond) est du paramétrage, et reste à l'éditeur — d'où `peutEditer`, qui ne
 * masque QUE les formulaires. Cacher la console au caissier aurait fait tenir la
 * file d'accueil par le propriétaire lui-même ; lui ouvrir le CRUD aurait laissé
 * fermer la file à qui n'a pas ce mandat.
 *
 * Ce verdict d'écran ne remplace aucune garde : les actions revérifient le rôle
 * côté serveur. Il évite seulement de montrer un bouton qui répondrait « non ».
 *
 * ── UNE SEULE CONSOLE OUVERTE À LA FOIS ──
 *
 * Chaque console scrute. Les monter toutes ouvrirait autant de scrutins que le
 * commerçant a de files, pour un écran qu'on laisse ouvert toute la journée
 * derrière un comptoir. On en ouvre une — celle qu'on regarde — et le choix est
 * un jeu d'onglets : la file d'à côté est à un clic, sans rechargement.
 */
export function FilesAccueilPanneau({
  files,
  activites,
  peutEditer,
  appUrl,
  quiz = [],
  campagnes = [],
}: {
  files: ReserverQueueDashboardView[];
  /** Les activités auxquelles une file peut être rattachée (facultatif). */
  activites: { id: string; name: string }[];
  /** Rôle propriétaire ou éditeur : le CRUD des files. La console, elle, est ouverte au caissier. */
  peutEditer: boolean;
  /** Base publique, pour montrer le lien à mettre sur l'affiche. */
  appUrl: string;
  /**
   * Le Mode Attente active (RES-4) : les quiz et les campagnes de
   * l'organisation, proposables PENDANT l'attente. Vides par défaut — un
   * commerce sans quiz ni campagne ne voit simplement pas les deux sélecteurs,
   * exactement comme « Activité liée » disparaît sans activité.
   */
  quiz?: { id: string; name: string }[];
  campagnes?: { id: string; name: string }[];
}) {
  const [selection, setSelection] = useState<string | null>(
    files[0]?.id ?? null,
  );
  const [reglagesOuverts, setReglagesOuverts] = useState(false);

  const fileActive = files.find((f) => f.id === selection) ?? null;

  return (
    <Card className="mt-8">
      <h2>Files d&apos;accueil</h2>
      <p className="mt-2 text-sm font-semibold text-k-body">
        Sans rendez-vous : le client scanne le QR à l&apos;entrée, voit son rang
        réel, et son téléphone le prévient quand vous l&apos;appelez.
      </p>

      {files.length === 0 ? (
        <div className="mt-5 rounded-xl border-2 border-dashed border-k-ink/25 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-k-body">
            Aucune file d&apos;accueil. Créez la première !
          </p>
          {peutEditer ? (
            <div className="mt-4 flex justify-center">
              <NouvelleFileForm
                activites={activites}
                quiz={quiz}
                campagnes={campagnes}
                instanceId="-vide"
              />
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {/* Le jeu d'onglets. `aria-current` et non `aria-selected` : ce sont
              des boutons dans une liste, pas un widget `tablist` — un vrai
              `tablist` obligerait à gérer les flèches du clavier pour un gain
              nul sur trois entrées. */}
          <ul className="mt-5 flex flex-wrap gap-2">
            {files.map((file) => {
              const actif = file.id === selection;
              return (
                <li key={file.id}>
                  <button
                    type="button"
                    aria-current={actif ? "true" : undefined}
                    onClick={() => {
                      setSelection(file.id);
                      setReglagesOuverts(false);
                    }}
                    className={`flex items-center gap-2 rounded-xl border-2 border-k-ink px-3 py-2 text-sm font-bold ${
                      actif
                        ? "bg-k-yellow text-k-ink"
                        : "bg-white text-k-body hover:bg-k-yellow/30"
                    }`}
                  >
                    <span className="max-w-[12rem] truncate">{file.name}</span>
                    <span className="rounded-full bg-k-ink px-2 py-0.5 text-xs font-black tabular-nums text-white">
                      {file.enAttente}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {fileActive ? (
            <section
              aria-labelledby={`file-active-${fileActive.id}`}
              className="mt-5 border-t-2 border-k-ink/10 pt-5"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3
                    id={`file-active-${fileActive.id}`}
                    className="truncate text-lg font-black text-k-ink"
                  >
                    {fileActive.name}
                  </h3>
                  <p className="mt-0.5 text-xs font-semibold text-k-body">
                    {fileActive.activityName
                      ? `Rattachée à « ${fileActive.activityName} » · `
                      : ""}
                    Lien public :{" "}
                    <span className="break-all font-mono">
                      {appUrl}
                      {cheminFileReserver(fileActive.id)}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <PastilleFileAccueil status={fileActive.status} />
                  {peutEditer ? (
                    <Button
                      variant="secondary"
                      onClick={() => setReglagesOuverts((v) => !v)}
                      aria-expanded={reglagesOuverts}
                    >
                      {reglagesOuverts ? "Fermer les réglages" : "Réglages"}
                    </Button>
                  ) : null}
                </div>
              </div>

              {peutEditer && reglagesOuverts ? (
                <ReglagesFileForm
                  key={fileActive.id}
                  file={fileActive}
                  activites={activites}
                  quiz={quiz}
                  campagnes={campagnes}
                />
              ) : null}

              {/* `key` : changer de file DÉMONTE la console, donc arrête son
                  scrutin et vide son état. Sans elle, React réutiliserait le
                  composant et les compteurs de la file précédente resteraient
                  affichés jusqu'au tic suivant. */}
              <FileAccueilConsole key={fileActive.id} queueId={fileActive.id} />
            </section>
          ) : null}

          {peutEditer ? (
            <div className="mt-6 border-t-2 border-k-ink/10 pt-5">
              <NouvelleFileForm
                activites={activites}
                quiz={quiz}
                campagnes={campagnes}
              />
            </div>
          ) : null}
        </>
      )}

      <InfoBulle
        id="files-accueil-aide"
        resume="File d'accueil ou créneaux : lequel choisir ?"
        className="mt-5"
      >
        Un <strong>créneau</strong> se réserve à l&apos;avance, depuis chez soi,
        pour une heure précise. Une <strong>file d&apos;accueil</strong> ne se
        réserve pas : elle se prend sur place, dans l&apos;ordre d&apos;arrivée,
        et n&apos;annonce jamais de délai à vos clients — seulement leur rang réel
        et le nombre de personnes devant eux. Les deux coexistent : rattacher une
        file à une activité sert seulement à la retrouver, pas à en limiter
        l&apos;accès.
      </InfoBulle>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Création
// ────────────────────────────────────────────────────────────

/**
 * `reloadOnSuccess` ici, contrairement à la console : la LISTE des files est
 * entièrement dérivée du rendu serveur, sans état local. Sans rechargement, le
 * commerçant ne voit pas naître sa file, retape et re-clique — la base le
 * rattraperait (unicité du nom par organisation), mais il lirait alors un refus
 * incompréhensible sur une création qui avait réussi. Même geste, même raison
 * que `NouvelleActiviteForm`.
 *
 * `instanceId` suffixe les identifiants : ce formulaire est monté DEUX fois —
 * dans l'état vide et sous la liste — et deux `id` identiques casseraient
 * `htmlFor`, donc l'annonce au lecteur d'écran.
 */
function NouvelleFileForm({
  activites,
  quiz,
  campagnes,
  instanceId = "",
}: {
  activites: { id: string; name: string }[];
  quiz: { id: string; name: string }[];
  campagnes: { id: string; name: string }[];
  instanceId?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const { state, pending, onSubmit } = useActionForm(createReserverQueue, {
    resetOnSuccess: true,
    reloadOnSuccess: true,
    networkError: "Création impossible, réessayez.",
  });

  if (!ouvert) {
    return (
      <Button onClick={() => setOuvert(true)}>+ Nouvelle file d&apos;accueil</Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-xl rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <div>
        <Label htmlFor={`file-nom${instanceId}`}>Nom de la file</Label>
        <Input
          id={`file-nom${instanceId}`}
          name="name"
          required
          maxLength={QUEUE_NAME_MAX}
          placeholder="Ex : Accueil comptoir"
          autoFocus
        />
      </div>

      <ChampsCommuns
        activites={activites}
        quiz={quiz}
        campagnes={campagnes}
        instanceId={instanceId}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Création…" : "Créer la file"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOuvert(false)}
          disabled={pending}
        >
          Annuler
        </Button>
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Réglages d'une file existante
// ────────────────────────────────────────────────────────────

function ReglagesFileForm({
  file,
  activites,
  quiz,
  campagnes,
}: {
  file: ReserverQueueDashboardView;
  activites: { id: string; name: string }[];
  quiz: { id: string; name: string }[];
  campagnes: { id: string; name: string }[];
}) {
  // `reloadOnSuccess` pour la même raison qu'à la création : le nom, la
  // pastille d'état et le plafond affichés viennent tous du rendu serveur.
  const { state, pending, onSubmit } = useActionForm(updateReserverQueue, {
    reloadOnSuccess: true,
    networkError: "Enregistrement impossible, réessayez.",
  });

  return (
    <form
      onSubmit={onSubmit}
      className="mb-5 rounded-2xl border-2 border-k-ink bg-k-bg p-4"
    >
      <input type="hidden" name="id" value={file.id} />

      <div>
        <Label htmlFor={`file-nom-edit-${file.id}`}>Nom de la file</Label>
        <Input
          id={`file-nom-edit-${file.id}`}
          name="name"
          required
          maxLength={QUEUE_NAME_MAX}
          defaultValue={file.name}
        />
      </div>

      <ChampsCommuns
        activites={activites}
        quiz={quiz}
        campagnes={campagnes}
        instanceId={`-edit-${file.id}`}
        defaultActivityId={file.activityId}
        defaultMaxLive={file.maxLiveEntries}
        defaultStatus={file.status}
        defaultQuizId={file.waitQuizId}
        defaultPauseCampaignId={file.waitPauseCampaignId}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Les trois champs partagés par la création et les réglages
// ────────────────────────────────────────────────────────────

/**
 * Écrits une fois plutôt que deux : les bornes du plafond et le vocabulaire des
 * trois états doivent être identiques à la création et à la modification. Deux
 * copies auraient divergé au premier ajustement — c'est déjà la raison d'être de
 * `champs.ts` juste à côté.
 */
function ChampsCommuns({
  activites,
  quiz,
  campagnes,
  instanceId,
  defaultActivityId = null,
  defaultMaxLive = QUEUE_MAX_LIVE_ENTRIES_DEFAUT,
  defaultStatus = "open",
  defaultQuizId = null,
  defaultPauseCampaignId = null,
}: {
  activites: { id: string; name: string }[];
  quiz: { id: string; name: string }[];
  campagnes: { id: string; name: string }[];
  instanceId: string;
  defaultActivityId?: string | null;
  defaultMaxLive?: number;
  defaultStatus?: ReserverQueueDashboardView["status"];
  defaultQuizId?: string | null;
  defaultPauseCampaignId?: string | null;
}) {
  return (
    <>
      {activites.length > 0 ? (
        <div className="mt-3">
          <Label htmlFor={`file-activite${instanceId}`}>
            Activité liée{" "}
            <span className="font-semibold text-k-body">(facultatif)</span>
          </Label>
          <select
            id={`file-activite${instanceId}`}
            name="activityId"
            defaultValue={defaultActivityId ?? ""}
            className={champSelect}
          >
            <option value="">Aucune</option>
            {activites.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs font-semibold text-k-body">
            Sert seulement à retrouver la file dans votre agenda. Une file liée à
            une activité coupée n&apos;accepte plus d&apos;inscription.
          </p>
        </div>
      ) : null}

      <div className="mt-3">
        <Label htmlFor={`file-plafond${instanceId}`}>
          Nombre maximum de personnes dans la file
        </Label>
        <Input
          id={`file-plafond${instanceId}`}
          name="maxLiveEntries"
          type="number"
          inputMode="numeric"
          min={QUEUE_MAX_LIVE_ENTRIES_MIN}
          max={QUEUE_MAX_LIVE_ENTRIES_MAX}
          required
          defaultValue={defaultMaxLive}
          className="max-w-32"
        />
        <p className="mt-1.5 text-xs font-semibold text-k-body">
          Au-delà, la file refuse les nouvelles inscriptions et le dit clairement
          — plutôt que de laisser quelqu&apos;un prendre un rang qu&apos;il
          n&apos;atteindra jamais.
        </p>
      </div>

      <div className="mt-3">
        <Label htmlFor={`file-statut${instanceId}`}>État</Label>
        <select
          id={`file-statut${instanceId}`}
          name="status"
          defaultValue={defaultStatus}
          className={champSelect}
        >
          <option value="open">Ouverte — on prend et on sert</option>
          <option value="paused">
            En pause — on ne prend plus, on sert encore
          </option>
          <option value="closed">Fermée — plus d&apos;inscription</option>
        </select>
      </div>

      <ChampsAttenteActive
        quiz={quiz}
        campagnes={campagnes}
        instanceId={instanceId}
        defaultQuizId={defaultQuizId}
        defaultPauseCampaignId={defaultPauseCampaignId}
      />
    </>
  );
}
