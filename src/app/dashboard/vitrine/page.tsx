import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_URL } from "@/lib/env";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { readModulePageOpenCount } from "@/lib/module-page-opens";
import { createClient } from "@/lib/supabase/server";
import { loadVitrineDashboardContext } from "@/lib/vitrine-context";
import type { ContenuVitrineView } from "@/lib/vitrine";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { CatalogueEditeur } from "@/components/vitrine/catalogue-editeur";
import { ContenusEditeur } from "@/components/vitrine/contenus-editeur";
import { ImportCarte } from "@/components/vitrine/import-carte";
import { ReglagesVitrine } from "@/components/vitrine/reglages-vitrine";
import { VitrineQrPlanche } from "@/components/vitrine/vitrine-qr-planche";

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
 * pas le droit. `loadVitrineDashboardContext` décide de ce qu'elle LIT.
 *
 * IL Y EN AVAIT UN TROISIÈME, ET IL A DISPARU AVEC L11 : le drapeau
 * `VITRINE_PUBLIQUE_OUVERTE` descendait jusqu'à `ReglagesVitrine` pour changer
 * la phrase sous « Publiée » — « n'imprimez pas vos QR codes tout de suite ».
 * L'adresse publique répond désormais, la phrase n'a plus d'objet, et le
 * paramètre qui la portait est retiré plutôt que laissé à `true` : une prop
 * dont une seule valeur est possible finit par être lue comme une option.
 */
export default async function VitrineDashboardPage() {
  const capacites = await capacitesDuModule("vitrine");
  if (!capacites.canExplore) notFound();

  const ctx = await loadVitrineDashboardContext();
  const settings = ctx.ok ? ctx.settings : null;
  const cartes = ctx.ok ? ctx.cartes : [];

  /**
   * LES CONTENUS MIS EN AVANT ET LES OUVERTURES — deux lectures, un seul aller.
   *
   * Elles passent par le client de SESSION et non par l'admin : les deux
   * tables sont sous RLS de membre (`vitrine_contenus: member select`,
   * `module_page_opens: member select`), le cloisonnement est donc fait par la
   * base et cette page n'a aucune organisation à nommer. C'est le motif des
   * pages `dashboard/calendar/[id]` et `dashboard/jackpot/[id]`.
   *
   * `resource_id` est `vitrine_settings.id`, jamais le slug : le beacon public
   * envoie le slug, `/api/page-opens` le traduit, et le compteur est indexé sur
   * la LIGNE DE RÉGLAGES — une par commerce, contrairement aux événements et
   * aux chasses qui comptent par sous-objet.
   */
  const supabase = await createClient();
  const [contenus, ouvertures] = settings
    ? await Promise.all([
        supabase
          .from("vitrine_contenus")
          .select("rang, titre, url")
          .order("rang")
          .then(({ data }) => (data ?? []) as ContenuVitrineView[]),
        readModulePageOpenCount(supabase, "vitrine", settings.id),
      ])
    : [[] as ContenuVitrineView[], 0];

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
        />

        {/* LE CATALOGUE N'APPARAÎT QU'APRÈS L'ADRESSE, et c'est le premier pas
            que la base elle-même a dessiné : `vitrine_dashboard_state` rend
            `settings = null` — et non un objet vide — tant qu'aucune adresse
            n'a été choisie. Composer trente fiches avant de savoir où elles
            seront servies revient à préparer une vitrine sans magasin. */}
        {settings ? (
          <>
            {/* CE QUE LA VITRINE A RAPPORTÉ, EN UN NOMBRE. Le seul retour
                mesurable d'un QR posé sur une table, et il vaut d'être dit tôt :
                un commerçant qui a imprimé ses planches veut savoir si on les
                scanne avant de relire ses cartes. Le mot est « ouvertures » et
                non « scans » — un rechargement, un retour arrière et un lien
                partagé comptent tous, et prétendre compter des scans distincts
                serait faux (voir `page-open-beacon`). */}
            <Card>
              <h2>Audience</h2>
              <p className="mt-2 text-sm text-k-body">
                <span className="font-black tabular-nums text-k-ink">
                  {ouvertures}
                </span>{" "}
                ouverture{ouvertures > 1 ? "s" : ""} de la page publique.
              </p>
            </Card>

            <ContenusEditeur
              contenus={contenus}
              peutEditer={capacites.canEditDraft}
            />

            {/* L'IMPORT EST AVANT L'ÉDITEUR, et c'est l'ordre du geste réel :
                un commerçant qui arrive avec sa carte dans un document ne veut
                pas saisir trente fiches à la main pour découvrir ensuite
                qu'un import existait. Il ne remplace PAS l'éditeur — les
                badges, les allergènes et la disponibilité ne s'importent pas —
                il le remplit. */}
            <ImportCarte peutEditer={capacites.canEditDraft} />

            <CatalogueEditeur
              cartes={cartes}
              peutEditer={capacites.canEditDraft}
            />

            {/* LES QR VIENNENT APRÈS LES CARTES : ils les visent. La section
                n'apparaît qu'avec une adresse posée (`settings` non nul), et
                elle rappelle elle-même de publier avant d'imprimer. */}
            <VitrineQrPlanche
              slug={settings.slug}
              publiee={settings.published}
              cartes={cartes}
              appUrl={APP_URL}
            />
          </>
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
