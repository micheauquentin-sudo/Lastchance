import { PlanUpsell } from "@/components/dashboard/plan-upsell";
import { Card } from "@/components/ui/card";
import type { CapacitesModule } from "@/lib/module-capabilities";
import type { Entitlement } from "@/platform/experiences/contract";

/**
 * L'ENCART QUI REMPLACE UNE PORTE FERMÉE.
 *
 * ── CE QU'IL CHANGE, ET POURQUOI CE N'EST PAS COSMÉTIQUE ──
 *
 * Avant : une page de module non payé rendait UNIQUEMENT une carte d'offre.
 * Pas de liste, pas de formulaire, rien à faire — le commerçant devait payer
 * pour découvrir ce qu'il payait. Le cahier §3 tranche l'inverse : « Le
 * dashboard donne accès à tout pour découvrir ; seule la PUBLICATION est
 * verrouillée au droit effectivement payé. »
 *
 * Cet encart n'est donc plus un mur, c'est un BANDEAU : la page continue en
 * dessous, avec ses brouillons et son formulaire. Ce qui reste fermé est le
 * seul geste qui expose une expérience à un joueur, et il est fermé en base
 * (`assert_module_publish_allowed`), pas ici.
 *
 * ── IL NE PARLE PAS D'ARGENT À QUI NE PEUT PAS EN DÉPENSER ──
 *
 * `PlanUpsell` porte déjà cette distinction et elle est conservée telle
 * quelle : le propriétaire lit « Voir les offres », l'éditeur lit à qui
 * s'adresser. La phrase de `capacites.message`, elle, vient du contrat et dit
 * ce que la personne PEUT faire en attendant — préparer.
 */
export function ModuleCapabilityNotice({
  capacites,
  entitlement,
  children,
}: {
  capacites: CapacitesModule;
  entitlement: Entitlement;
  /** Argument de vente : ce que le module apporte, en une phrase. */
  children: React.ReactNode;
}) {
  // Un module payé n'a aucune raison de porter un bandeau — mais son contenu
  // reste la page elle-même. Retourner `null` ici effaçait tout ce que les
  // pages enveloppées rendaient (dont les salons Duo et Bande), précisément
  // pour les commerçants autorisés à publier.
  if (capacites.canPublish) return <>{children}</>;

  return (
    <Card className="mb-6 border-dashed">
      <div className="text-center py-6">
        {capacites.message ? (
          <p className="text-sm font-semibold text-k-ink mb-4 max-w-xl mx-auto">
            {capacites.message}
          </p>
        ) : null}
        <PlanUpsell entitlement={entitlement} canManageBilling={capacites.peutAcheter}>
          {children}
        </PlanUpsell>
      </div>
    </Card>
  );
}
