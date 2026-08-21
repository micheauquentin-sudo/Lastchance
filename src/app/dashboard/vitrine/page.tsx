import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { APP_URL } from "@/lib/env";
import { loadDuoOptions } from "@/lib/duo-context";
import { loadOrgLobbies } from "@/lib/lobby-context";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { readModulePageOpenCount } from "@/lib/module-page-opens";
import { createClient } from "@/lib/supabase/server";
import { loadVitrineDashboardContext } from "@/lib/vitrine-context";
import type { ContenuVitrineView } from "@/lib/vitrine";
import type { DuoOptionsAdminView } from "@/lib/duo";
import type { OrgLobbyView } from "@/lib/lobby";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { CatalogueEditeur } from "@/components/vitrine/catalogue-editeur";
import { ContenusEditeur } from "@/components/vitrine/contenus-editeur";
import { DuoEditeur } from "@/components/vitrine/duo-editeur";
import { ImportCarte } from "@/components/vitrine/import-carte";
import { ReglagesVitrine } from "@/components/vitrine/reglages-vitrine";
import { SalonsOuverts } from "@/components/vitrine/salons-ouverts";
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
  const organizationId = ctx.ok ? ctx.organizationId : null;

  /**
   * LES CONTENUS MIS EN AVANT ET LES OUVERTURES — deux lectures, un seul aller.
   *
   * Client de SESSION, RLS de membre — ET le filtre d'organisation EXPLICITE
   * quand même (revue L14, E1) : `is_org_member` est vrai pour TOUTES les
   * organisations d'un utilisateur multi-comptes, pas pour la seule active.
   * Sans `.eq`, un franchisé voyait les « À la une » de ses deux enseignes
   * mélangés — et pouvait en recopier un chez l'autre d'un clic. Le motif réel
   * du dépôt est celui-là : `dashboard/calendar/[id]` et `jackpot/[id]` posent
   * TOUS le `.eq("organization_id", …)` en plus de la RLS.
   *
   * `resource_id` est `vitrine_settings.id`, jamais le slug : le beacon public
   * envoie le slug, `/api/page-opens` le traduit, et le compteur est indexé sur
   * la LIGNE DE RÉGLAGES — une par commerce, contrairement aux événements et
   * aux chasses qui comptent par sous-objet.
   */
  /**
   * LES SALONS SONT LUS ICI, avec les deux autres — et seulement si une adresse
   * existe. Une salle ne s'ouvre que sur une vitrine PUBLIÉE
   * (`resoudreCommerceLobby` exige `published = true`), donc sans `settings` il
   * ne peut y en avoir aucune : la RPC répondrait `{"lobbies":[]}` pour tout le
   * monde, une fois par ouverture d'écran. `loadOrgLobbies` refait sa propre
   * garde de session, mais `getUserAndOrg` est mémoïsé par `cache()` sur le
   * rendu — la porte est retenue, la requête ne l'est pas.
   */
  const supabase = await createClient();
  const lireSalons = async () => {
    const ctx = await loadOrgLobbies();
    // Le refus de garde ne se distingue pas d'une absence de salon À L'ÉCRAN :
    // la carte ne se peint qu'avec au moins une salle, donc les deux cas sont
    // le même silence. Ce qui compte est que le refus n'invente pas de liste.
    return ctx.ok
      ? { liste: ctx.salons, luA: ctx.luA }
      : { liste: [] as OrgLobbyView[], luA: "" };
  };
  /**
   * LE PLATEAU DU DUO MIROIR (L17), lu avec les trois autres.
   *
   * Il ne rend JAMAIS un refus : `loadDuoOptions` répond par un plateau vide
   * quand la garde ou la lecture échoue — le commerçant a le droit, il n'a
   * simplement rien d'épinglé, et les deux cas affichent exactement la même
   * chose : une invitation à composer.
   */
  const lireDuo = async (): Promise<DuoOptionsAdminView> => {
    const ctx = await loadDuoOptions();
    return ctx.ok ? ctx.plateau : { options: [], suggestion: null };
  };
  const [contenus, ouvertures, supervision, plateauDuo] =
    settings && organizationId
      ? await Promise.all([
          supabase
            .from("vitrine_contenus")
            .select("rang, titre, url")
            .eq("organization_id", organizationId)
            .order("rang")
            .then(({ data }) => (data ?? []) as ContenuVitrineView[]),
          readModulePageOpenCount(supabase, "vitrine", settings.id),
          lireSalons(),
          lireDuo(),
        ])
      : [
          [] as ContenuVitrineView[],
          0,
          { liste: [] as OrgLobbyView[], luA: "" },
          { options: [], suggestion: null } as DuoOptionsAdminView,
        ];

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

            {/* LA SUPERVISION DES SALONS — contrepartie du finding E-1. Elle
                vient JUSTE APRÈS « Audience » parce qu'elle répond à la même
                question, dans l'autre sens : « Audience » dit ce que la vitrine
                a rapporté, celle-ci dit ce qui s'y passe MAINTENANT et ce que
                le commerçant peut y faire. Et elle ne se peint qu'avec au moins
                un salon — la carte porte le pourquoi en entier. */}
            <SalonsOuverts
              salons={supervision.liste}
              luA={supervision.luA}
            />

            {/* LA PORTE DE L'ÉCRAN DE TRADUCTION (VIT-5), ET ELLE NE COMPTE
                RIEN. Le résumé chiffré existe — `vitrine_translation_state` le
                rend — mais l'afficher ici coûterait une RPC de plus sur CHAQUE
                ouverture de la page Vitrine, payée par tous pour un chiffre que
                seul celui qui va traduire regarde. La page de traduction le
                charge elle-même, une fois, au moment où il sert.

                L'arbitrage inverse aurait été défendable si le chiffre appelait
                un geste urgent : ce n'est pas le cas — une couverture qui baisse
                ne casse rien, elle referme le sélecteur de langue, et l'écran de
                traduction le dit dès qu'on l'ouvre. */}
            <Card>
              <h2>Traductions (anglais)</h2>
              <p className="mt-2 text-sm text-k-body">
                Vos visiteurs étrangers peuvent lire votre carte en anglais.
                Traduisez vos champs un par un, le français sous les yeux.
              </p>
              <Link
                href="/dashboard/vitrine/traductions"
                className="mt-3 inline-block text-sm font-bold text-k-orange-text underline underline-offset-2 hover:text-k-ink"
              >
                Traduire ma vitrine en anglais →
              </Link>
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

            {/* LE DUO MIROIR VIENT APRÈS LE CATALOGUE, et pas ailleurs : son
                plateau se choisit PARMI les fiches de la carte. Le placer plus
                haut aurait demandé de cocher des fiches avant d'en avoir —
                l'écran n'y aurait affiché qu'une liste vide et une consigne
                d'aller composer sa carte, c'est-à-dire l'ordre du geste réel à
                l'envers. */}
            <DuoEditeur
              cartes={cartes}
              plateau={plateauDuo}
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
