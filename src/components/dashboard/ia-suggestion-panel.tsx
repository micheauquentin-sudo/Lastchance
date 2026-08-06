import { IaSuggestionForm } from "@/components/dashboard/ia-suggestion-form";

/**
 * Assistant de création — le PANNEAU (composant serveur).
 *
 * Rendu à côté de la place de marché de campagnes : là où le commerçant
 * choisit déjà entre partir d'un modèle ou d'une page blanche, l'assistant
 * propose une troisième porte — trois idées taillées sur son commerce, qu'il
 * relit et applique lui-même.
 *
 * ── DORMANCE ─────────────────────────────────────────────────
 *
 * Le panneau reçoit `isIaConfigured` (lu par la page via `isIaConfigured()`,
 * comme `/dashboard/settings/modules` lit `addonAchetableEnLigne`). Sans clé
 * de fournisseur posée, il rend une NOTE SOBRE et RIEN d'autre : aucun bouton,
 * aucun formulaire, aucun appel possible. C'est exactement le motif des add-ons
 * non configurés — la fonctionnalité ne s'allume qu'à la pose de la clé par le
 * propriétaire, pas à l'affichage d'un contrôle qui mènerait à un refus.
 */

/** La promesse centrale, comme la galerie l'écrit pour les modèles. */
const IA_PROMISE =
  "L'assistant propose, vous validez. Rien n'est créé tant que vous n'avez pas cliqué « Appliquer » — et « Appliquer » ne fait qu'un brouillon : rien n'est publié, aucun email n'est envoyé.";

export function IaSuggestionPanel({
  isIaConfigured,
}: {
  isIaConfigured: boolean;
}) {
  if (!isIaConfigured) {
    return (
      <section className="mb-8">
        <p className="rounded-2xl border-2 border-dashed border-zinc-300 px-5 py-4 text-sm text-zinc-500">
          <span aria-hidden="true">✨</span> Assistant de création —{" "}
          <strong className="font-semibold">bientôt</strong>. Il proposera des
          idées de campagne prêtes à relire.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-2xl border-2 border-k-ink bg-white shadow-[4px_4px_0_rgba(33,29,22,0.9)]">
      <div className="border-b-2 border-k-ink px-5 py-4">
        <h2 className="font-bold text-k-ink">
          <span aria-hidden="true">✨</span> Trois idées sur mesure
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Dites en un mot votre commerce et votre objectif — l&apos;assistant
          propose trois campagnes que vous retouchez avant d&apos;appliquer.
        </p>
      </div>

      <div className="px-5 py-5">
        <p className="rounded-xl border-2 border-k-ink bg-k-yellow/30 px-4 py-3 text-sm font-semibold text-k-ink">
          <span aria-hidden="true">📝</span> {IA_PROMISE}
        </p>
        <IaSuggestionForm />
      </div>
    </section>
  );
}
