import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { LOBBY_KINDS, type LobbyKind, type OrgLobbyView } from "@/lib/lobby";
import { loadOrgLobbies } from "@/lib/lobby-context";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { PublicShare } from "@/components/dashboard/public-share";
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

const TITRES: Record<LobbyKind, { nom: string; promesse: string }> = {
  duo: {
    nom: "Duo Miroir",
    promesse:
      "Deux joueurs répondent chacun de leur côté, les choix se révèlent ensemble.",
  },
  bande: {
    nom: "Portrait de la Bande",
    promesse:
      "Chacun vote en secret ; la réponse ne se révèle qu'à partir de trois voix.",
  },
};

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

  const ctx = await loadOrgLobbies();
  // Le refus de garde ne se distingue pas d'une absence de salon à l'écran :
  // la liste ne se peint qu'avec au moins une salle. Ce qui compte est que le
  // refus n'invente pas de liste.
  const tous: OrgLobbyView[] = ctx.ok ? ctx.salons : [];
  const salons = tous.filter((salon) => salon.kind === jeu);

  const titre = TITRES[jeu];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="w-fit border-b-4 border-k-yellow pb-1 text-2xl font-black">
          {titre.nom}
        </h1>
        <p className="mt-2 text-sm text-zinc-600">{titre.promesse}</p>
      </div>

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
            qrLabel={titre.nom}
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

        {salons.length > 0 && (
          <div className="mt-6">
            <SalonsOuverts salons={salons} luA={ctx.ok ? ctx.luA : ""} />
          </div>
        )}
      </ModuleCapabilityNotice>
    </div>
  );
}
