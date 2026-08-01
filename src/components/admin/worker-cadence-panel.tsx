"use client";

import { enableWorkerFastCadence } from "@/app/admin/(protected)/monitoring/actions";
import { Panel } from "@/components/admin/ui";
import { useActionForm } from "@/lib/use-action-form";
import type { WorkerCadenceRow, WorkerCadenceState } from "@/lib/admin/worker-cadence";
import type { ActionResult } from "@/lib/utils";

/**
 * Panneau « Cadence des workers ».
 *
 * ── Ce que cet écran sert à dire ──
 *
 * `/api/cron/jobs` ne tourne QU'UNE FOIS PAR JOUR en production : `vercel.json`
 * le planifie à `20 4 * * *` et le plan Hobby n'accepte pas mieux. La sortie
 * existe déjà en base — un pg_cron toutes les 5 minutes, inerte tant que deux
 * secrets Vault n'existent pas. Un administrateur qui lit seulement « non
 * configuré » ne clique jamais : ce panneau affiche donc la cadence RÉELLE
 * obtenue aujourd'hui et sa conséquence pour un client — un code de retrait
 * envoyé par SMS peut arriver jusqu'à 24 h après le gain.
 *
 * ── Piloté par le registre, jamais par une liste en dur ──
 *
 * Les lignes viennent de `ops_worker_definitions` (`buildWorkerCadenceRows`) :
 * le jour où un worker fréquent s'ajoute au registre, il apparaît ici sans
 * qu'on touche à ce fichier.
 *
 * ── Ce qui ne s'affiche JAMAIS ──
 *
 * Ni l'URL posée dans le Vault, ni le secret, ni le nom des entrées du Vault.
 * L'état se dit par oui/non, et par des noms de WORKERS quand un clic en touche
 * plusieurs — jamais par des noms d'entrées.
 *
 * Cette garantie ne tient PAS à ce que ce composant jette : l'action est
 * appelée depuis un composant client, donc son retour est sérialisé et transmis
 * au navigateur AVANT tout rendu. Ce qu'on ne veut pas voir passer, il faut ne
 * pas le renvoyer. `enableWorkerFastCadence` ne rend donc plus aucune donnée —
 * l'`url` qu'elle portait autrefois n'était consommée nulle part.
 */

const STATE_STYLES: Record<WorkerCadenceState, string> = {
  // Contrastes sur le fond `zinc-950` du back-office : emerald-300 (11,6:1),
  // amber-300 (12,4:1), zinc-300 (12,8:1) — tous très au-dessus de 4,5:1.
  rapide: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  quotidienne: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  inconnue: "bg-white/5 text-zinc-300 ring-white/10",
};

const STATE_LABELS: Record<WorkerCadenceState, string> = {
  rapide: "Cadence rapide active",
  quotidienne: "Cadence quotidienne",
  inconnue: "Cadence inconnue",
};

/**
 * Adaptateur de signature, et rien d'autre : `useActionForm` passe un état
 * précédent que cette action n'utilise pas. Elle ne rend aucune donnée — voir
 * l'en-tête sur ce qui transite réellement jusqu'au navigateur.
 */
async function activerCadence(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return enableWorkerFastCadence(formData);
}

/**
 * Options de la BASCULE D'ÉTAT : après l'activation, rien sur cet écran ne peut
 * montrer le changement autrement qu'en relisant le serveur — l'état vit dans
 * le Vault. Or `router.refresh()` ne s'applique pas 5 à 32 % du temps
 * (docs/bugs.md) : l'administrateur relirait « cadence quotidienne » sur un
 * worker désormais rapide, et recliquerait.
 */
const BASCULE_CADENCE = {
  reloadOnSuccess: true,
  networkError: "Activation impossible (réseau ?), réessayez.",
} as const;

function CadenceRow({
  row,
  labels,
  canEnable,
}: {
  row: WorkerCadenceRow;
  /** Libellés lisibles : celui de la ligne, et ceux des workers voisins. */
  labels: Record<string, string>;
  canEnable: boolean;
}) {
  const label = labels[row.worker] ?? row.worker;
  const { state, pending, onSubmit } = useActionForm(
    activerCadence,
    BASCULE_CADENCE,
  );

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-200">{label}</span>
          <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATE_STYLES[row.state]}`}
          >
            {STATE_LABELS[row.state]}
          </span>
        </div>
        {canEnable && row.actionable && (
          <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
            {/* Champ d'état DÉRIVÉ de la prop serveur — jamais saisi par
                l'administrateur : c'est la signature que la garde
                `use-action-form-bascule.test.ts` reconnaît. */}
            <input type="hidden" name="worker" value={row.worker} />
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? "Activation…" : "Activer la cadence rapide"}
            </button>
          </form>
        )}
      </div>

      <p className="mt-2 text-sm text-zinc-300">
        Cadence obtenue aujourd&apos;hui : {row.cadence}.
      </p>
      <p className="mt-1 text-sm text-zinc-400">{row.consequence}</p>

      {/* Le geste touche un VOISIN, et il faut l'apprendre AVANT de cliquer.
          `jobs` et `sync-contests` partagent une entrée de Vault : activer l'un
          réécrit celle de l'autre. Bénin aujourd'hui — la valeur est la même
          des deux côtés, une seule CRON_SECRET authentifie toutes les routes —
          mais un bouton qui en touche deux sans le dire est un bouton dont on
          découvre l'effet après coup. Affiché même quand la ligne n'est plus
          activable : c'est aussi ce qui explique qu'un worker jamais activé
          soit passé au vert tout seul. */}
      {row.alsoAffects.length > 0 && (
        <p className="mt-1 text-sm text-zinc-400">
          Entrée partagée : cette activation réécrit aussi le secret de{" "}
          <strong className="font-semibold text-zinc-200">
            {row.alsoAffects.map((autre) => labels[autre] ?? autre).join(", ")}
          </strong>
          . Même valeur des deux côtés aujourd&apos;hui, donc sans effet — mais le
          geste ne porte pas que sur cette ligne.
        </p>
      )}

      {canEnable && !row.actionable && row.state !== "rapide" && (
        <p className="mt-1 text-sm text-amber-300">
          Activation indisponible : le registre ne porte pas les deux noms de
          secrets exigés par le planificateur.
        </p>
      )}

      {state && !state.ok && (
        <p role="status" className="mt-2 text-sm text-red-300">
          {state.error}
        </p>
      )}
    </li>
  );
}

export function WorkerCadencePanel({
  rows,
  labels,
  canEnable,
}: {
  rows: WorkerCadenceRow[];
  /** Libellés lisibles du monitoring ; repli sur le nom technique. */
  labels: Record<string, string>;
  /** `monitoring.cadence` — super_admin seul. Sinon, panneau en lecture. */
  canEnable: boolean;
}) {
  return (
    <Panel className="mt-6 p-5">
      <h2 className="text-sm font-semibold text-white">Cadence des workers</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Deux cadences possibles, et l&apos;écart se voit chez le client : le cron
        Vercel ne passe qu&apos;<strong className="font-semibold text-zinc-200">
          une fois par jour
        </strong>{" "}
        (plan Hobby), là où le planificateur Postgres repasse{" "}
        <strong className="font-semibold text-zinc-200">toutes les 5 minutes</strong>.
        L&apos;activation dépose les secrets attendus sans que personne ne les voie.
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">
          Aucun worker à cadence rapide dans le registre.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-white/5">
          {rows.map((row) => (
            <CadenceRow
              key={row.worker}
              row={row}
              labels={labels}
              canEnable={canEnable}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}
