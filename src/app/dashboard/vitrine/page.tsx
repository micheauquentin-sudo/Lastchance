import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_URL } from "@/lib/env";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { VITRINE_PUBLIQUE_OUVERTE } from "@/lib/vitrine";
import { loadVitrineDashboardContext } from "@/lib/vitrine-context";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { CatalogueEditeur } from "@/components/vitrine/catalogue-editeur";
import { ReglagesVitrine } from "@/components/vitrine/reglages-vitrine";

export const metadata: Metadata = { title: "Vitrine" };

/**
 * LA VITRINE DU COMMERÇANT — son catalogue QR, et l'adresse qui le sert.
 *
 * ── LE MODULE S'APPELLE `vitrine`, ET C'EST LE MÊME QUE « RÉSERVATIONS » ──
 *
 * Un seul droit couvre trois capacités serveur : publier la vitrine, le CRM
 * léger, l'agenda Réserver (migration 20261001120000). Les deux écrans passent
 * donc le MÊME argument à `capacitesDuModule` et portent le MÊME entitlement.
 *
 * ── DEUX VERDICTS, ET ILS NE DISENT PAS LA MÊME CHOSE ──
 *
 * `capacitesDuModule` décide de ce que la page MONTRE — découvrir reste ouvert
 * à tous (cahier §3), d'où l'écran complet et son encart d'offre pour qui n'a
 * pas le droit. `loadVitrineDashboardContext` décide de ce qu'elle LIT. Et un
 * troisième verdict, distinct des deux, décide de ce qu'elle PROMET : le
 * drapeau `VITRINE_PUBLIQUE_OUVERTE`, qui ne ferme aucun geste ici mais change
 * la phrase affichée sous « Publiée ». Les confondre aurait fait dire à
 * l'écran qu'une carte est en ligne alors que son adresse rend 404.
 */
export default async function VitrineDashboardPage() {
  const capacites = await capacitesDuModule("vitrine");
  if (!capacites.canExplore) notFound();

  const ctx = await loadVitrineDashboardContext();
  const settings = ctx.ok ? ctx.settings : null;
  const cartes = ctx.ok ? ctx.cartes : [];

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="Vitrine"
        sousTitre="Faites découvrir votre lieu et ce que vous proposez : vos clients scannent un QR code et lisent votre carte sur leur téléphone."
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="vitrine">
        Un mini-site à votre adresse, avec vos cartes, vos rubriques et vos
        fiches — badges, allergènes et disponibilité du jour comprises.
      </ModuleCapabilityNotice>

      <div className="space-y-6">
        <ReglagesVitrine
          settings={settings}
          appUrl={APP_URL}
          peutEditer={capacites.canEditDraft}
          peutPublier={capacites.canPublish}
          ouverturePubliqueActive={VITRINE_PUBLIQUE_OUVERTE}
        />

        {/* LE CATALOGUE N'APPARAÎT QU'APRÈS L'ADRESSE, et c'est le premier pas
            que la base elle-même a dessiné : `vitrine_dashboard_state` rend
            `settings = null` — et non un objet vide — tant qu'aucune adresse
            n'a été choisie. Composer trente fiches avant de savoir où elles
            seront servies revient à préparer une vitrine sans magasin. */}
        {settings ? (
          <CatalogueEditeur cartes={cartes} peutEditer={capacites.canEditDraft} />
        ) : (
          <Card className="py-10 text-center">
            <p className="text-sm font-semibold text-k-body">
              Choisissez d&apos;abord l&apos;adresse de votre vitrine ci-dessus.
              Vos cartes viendront ensuite.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
