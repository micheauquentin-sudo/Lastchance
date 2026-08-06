import { randomUUID } from "node:crypto";
import { relancerFormuleForm } from "@/actions/experience-relance";
import type { KindRelance } from "@/lib/experience-relance";

/**
 * Le bouton de la carte « Relancer une formule ».
 *
 * Composant SERVEUR, et c'est ce qui rend la clé d'idempotence utile : le
 * `requestId` est tiré AU RENDU, pas au clic. Deux soumissions du même écran
 * (double-clic, retour arrière, rejeu réseau) portent donc la même clé et le
 * moteur d'application n'écrit qu'une fois. Un identifiant tiré côté navigateur
 * aurait changé à chaque envoi — c'est-à-dire une clé d'idempotence qui
 * n'idempote rien.
 *
 * Rien n'est décidé ici : la carte ne rend ce slot qu'à l'état « eligible », et
 * `relancerFormule` revérifie de toute façon la session, le rôle,
 * l'appartenance de la source et sa clôture.
 */
export function RelaunchFormulaAction({
  kind,
  sourceId,
}: {
  kind: KindRelance;
  sourceId: string;
}) {
  const requestId = randomUUID();

  return (
    <form action={relancerFormuleForm}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="source_id" value={sourceId} />
      <input type="hidden" name="request_id" value={requestId} />
      <button
        type="submit"
        className="k-btn-sm inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink sm:w-auto"
      >
        Créer le brouillon de relance →
      </button>
    </form>
  );
}
