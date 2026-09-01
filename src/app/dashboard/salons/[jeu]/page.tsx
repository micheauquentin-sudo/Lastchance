import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { BANDE_PACK_DEFAUT } from "@/lib/bande-packs";
import { loadBandePack } from "@/lib/bande-context";
import { loadDuoOptions } from "@/lib/duo-context";
import { APP_URL } from "@/lib/env";
import { LOBBY_KINDS, type LobbyKind, type OrgLobbyView } from "@/lib/lobby";
import { loadOrgLobbies } from "@/lib/lobby-context";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { createClient } from "@/lib/supabase/server";
import { loadVitrineDashboardContext } from "@/lib/vitrine-context";
import { entreeModule } from "@/platform/experiences/catalog";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { PublicShare } from "@/components/dashboard/public-share";
import { BandeEditeur } from "@/components/vitrine/bande-editeur";
import { DuoEditeur } from "@/components/vitrine/duo-editeur";
import { SalonsOuverts } from "@/components/vitrine/salons-ouverts";

/**
 * L'ÉCRAN D'UN JEU DE SALON — et pourquoi il ne vit plus dans la Vitrine.
 *
 * ── CE QU'IL RÉPARE ──
 *
 * Duo Miroir et Portrait de la Bande sont nés sous le droit `vitrine` : même
 * écran, même adresse publique, même garde SQL. Depuis le 2026-08-22 ce sont
 * des jeux du socle, présents dans les cinq offres. Or `/dashboard/vitrine`
 * rend `notFound()` sans le droit `vitrine` : une boulangerie sur Coup d'envoi
 * aurait eu un jeu « inclus » dans son offre et aucun écran pour l'ouvrir.
 *
 * ── LES RÉGLAGES DU JEU VIVENT ICI DEPUIS DUO-3b ──
 *
 * `DuoEditeur` et `BandeEditeur` étaient montés par `/dashboard/vitrine`, et
 * leurs chargeurs passaient par la garde du droit `vitrine`. C'était le défaut
 * du même ordre que celui que cette page a réparé pour l'écran lui-même : un
 * commerçant qui achète le Duo seul (DUO-2, 12 €/mois) avait un jeu à son nom,
 * une adresse publique, une liste de salons — et aucun accès à son propre
 * plateau, avec pour explication « Votre offre ne comprend pas la Vitrine ».
 *
 * ILS SONT SOUS `ModuleCapabilityNotice`, avec le droit DU JEU, comme le reste
 * de la page : `canEditDraft` décide si les formulaires sont manœuvrables, et
 * la doctrine du dépôt (préparer sans publier) s'applique alors au plateau comme
 * elle s'applique au partage.
 *
 * ── L'ADRESSE PUBLIQUE A DEUX SOURCES, ET L'ORDRE COMPTE ──
 *
 * La vitrine publiée d'abord — c'est l'adresse déjà imprimée sur les QR, la
 * faire passer après changerait la page servie à un client qui scanne. Le slug
 * d'organisation ensuite, pour les commerces sans carte. Même ordre que
 * `resoudreCommerceLobby`, qui résout l'autre bout du même lien ; les deux
 * divergeraient s'ils choisissaient différemment.
 */
export const dynamic = "force-dynamic";

function estJeuDeSalon(valeur: string): valeur is LobbyKind {
  return (LOBBY_KINDS as readonly string[]).includes(valeur);
}

export default async function SalonPage({
  params,
}: {
  params: Promise<{ jeu: string }>;
}) {
  const { jeu } = await params;
  // Un segment inconnu est un 404, jamais un repli sur le premier jeu : un
  // repli ferait ouvrir la page d'un jeu que le commerçant n'a pas demandé.
  if (!estJeuDeSalon(jeu)) notFound();

  const capacites = await capacitesDuModule(jeu);
  if (!capacites.canExplore) notFound();

  const { organization } = await getUserAndOrg();
  if (!organization) notFound();

  const supabase = await createClient();
  const { data: vitrine } = await supabase
    .from("vitrine_settings")
    .select("slug, published")
    .eq("organization_id", organization.id)
    .maybeSingle();

  const slugPublic =
    vitrine?.published && vitrine.slug ? vitrine.slug : organization.slug;
  const url = `${APP_URL}/lobby/nouveau/${slugPublic}`;

  /**
   * CE QUE CHAQUE JEU A À RÉGLER — lu seulement pour le jeu de cette page.
   *
   * Les deux chargeurs refont leur propre garde de session, mais
   * `getUserAndOrg` est mémoïsé par `cache()` sur le rendu : la porte est
   * retenue, la requête ne l'est pas. Et aucun des deux ne rend un refus — le
   * plateau vide et le pack par défaut sont exactement ce qu'il faut afficher
   * quand la lecture échoue.
   *
   * LA CARTE N'EST LUE QUE POUR LE DUO, et seulement pour lui donner des fiches
   * à proposer. Un commerçant sans Vitrine reçoit une liste vide, ce que
   * `DuoEditeur` sait rendre depuis DUO-3b : des champs de texte, sans
   * sélecteur d'origine.
   */
  const [plateauDuo, cartes, packBande] = await Promise.all([
    jeu === "duo"
      ? loadDuoOptions().then((r) =>
          r.ok ? r.plateau : { options: [], suggestion: null },
        )
      : { options: [], suggestion: null },
    jeu === "duo"
      ? loadVitrineDashboardContext().then((r) => (r.ok ? r.cartes : []))
      : [],
    jeu === "bande"
      ? loadBandePack().then((r) => (r.ok ? r.pack : BANDE_PACK_DEFAUT))
      : BANDE_PACK_DEFAUT,
  ]);

  const ctx = await loadOrgLobbies();
  // Le refus de garde ne se distingue pas d'une absence de salon à l'écran :
  // la liste ne se peint qu'avec au moins une salle. Ce qui compte est que le
  // refus n'invente pas de liste.
  const tous: OrgLobbyView[] = ctx.ok ? ctx.salons : [];
  const salons = tous.filter((salon) => salon.kind === jeu);

  // LE NOM ET LA PHRASE VIENNENT DU CATALOGUE, plus d'une table locale : les
  // deux jeux de salon sont des modules vendables comme les autres, et leur
  // libellé était jusqu'ici écrit une fois ici, une fois dans `MODULE_CATALOG`,
  // une fois dans la navigation. Un segment valide a forcément son entrée —
  // `LobbyKind` et `Entitlement` portent les mêmes deux clés.
  const fiche = entreeModule(jeu);
  if (!fiche) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre="Vos animations"
        titre={fiche.label}
        sousTitre={fiche.dashboardSubtitle}
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement={jeu}>
        <Card>
          <h2 className="mb-1 font-semibold">Faire jouer</h2>
          <p className="mb-4 text-sm text-zinc-600">
            Vos clients scannent, choisissent un pseudo et ouvrent une salle de
            2 à 12 joueurs. Rien à installer de leur côté.
          </p>
          <PublicShare
            url={url}
            fileName={`salon-${jeu}`}
            qrLabel={fiche.label}
            resource={{ kind: jeu === "duo" ? "duo" : "portrait", id: organization.id }}
          />
          {!vitrine?.published && (
            // Le commerçant doit savoir POURQUOI son adresse ressemble à son
            // nom d'établissement plutôt qu'à sa carte — sinon il croira à une
            // erreur le jour où il publiera sa Vitrine et verra l'adresse
            // changer.
            <p className="mt-3 text-xs text-zinc-600">
              Cette adresse porte le nom de votre établissement. Si vous
              publiez une Vitrine, le jeu s&apos;ouvrira aussi depuis son
              adresse à elle.
            </p>
          )}
        </Card>

        <div className="mt-6">
          {jeu === "duo" ? (
            <DuoEditeur
              plateau={plateauDuo}
              cartes={cartes}
              peutEditer={capacites.canEditDraft}
            />
          ) : (
            <BandeEditeur
              pack={packBande}
              peutEditer={capacites.canEditDraft}
            />
          )}
        </div>

        {salons.length > 0 && (
          <div className="mt-6">
            <SalonsOuverts salons={salons} luA={ctx.ok ? ctx.luA : ""} />
          </div>
        )}
      </ModuleCapabilityNotice>
    </div>
  );
}
