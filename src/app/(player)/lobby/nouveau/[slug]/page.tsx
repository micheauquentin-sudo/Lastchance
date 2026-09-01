import type { Metadata, Viewport } from "next";
import { LobbyShell } from "@/components/lobby/lobby-shell";
import { CreationLobbyForm } from "@/components/lobby/creation-lobby-form";

/**
 * Ouvrir un salon pour un commerce — porte d'entrée des jeux de la Vitrine.
 *
 * ── Rendu DYNAMIQUE, et aucune lecture au chargement ──
 *
 * La page ne consulte NI le commerce, NI ses droits : `create_player_lobby`
 * confond déjà « organisation inconnue » et « organisation sans le module
 * vitrine » sous un seul `unavailable`, précisément pour ne pas renseigner un
 * appelant public sur le carnet de commandes d'en face. Une vérification ici
 * ne ferait que rétablir cet oracle plus tôt, sous forme de 404 — et coûterait
 * un aller-retour avant le premier octet d'un écran ouvert au comptoir.
 *
 * Le slug traverse donc l'écran sans être interprété : c'est l'action qui
 * décide, une fois, au moment où quelqu'un demande vraiment un salon.
 *
 * ── En-tête neutre — ET C'EST UNE GARDE, PAS UN GOÛT (SALON-1) ──
 *
 * Cette page sera ouverte DEPUIS LA VITRINE (L17/L18) : rien du chrome
 * commerçant n'y entre, pas même le nom du commerce, qu'on n'a pas lu.
 *
 * Depuis SALON-1, `LobbyShell` SAIT porter l'habillage d'un commerce. Cette
 * page ne lui en passe pas, et ne doit jamais lui en passer : elle est
 * atteignable PAR LE SLUG, donc en déroulant un annuaire. Y peindre un nom, un
 * logo ou même une couleur dirait « ce commerce a le module » de tous ceux qui
 * s'habillent, et « il ne l'a pas » de tous les autres — c'est-à-dire exactement
 * l'oracle que le refus indistinct ci-dessus efface. Une garde de
 * `lobby-shell.test.tsx` relit ce fichier, pour que la levée de bonne foi ne
 * puisse pas passer en silence.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ouvrir un salon",
  description: "Ouvrez un salon et partagez son code à votre table.",
  // Page de session éphémère : suivable par lien, jamais indexée.
  robots: { index: false },
  formatDetection: { telephone: false },
};

export function generateViewport(): Viewport {
  return { themeColor: "#fdf6e3" };
}

export default async function NouveauLobbyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <LobbyShell
      titre="Ouvrir un salon"
      chapeau="Vous ouvrez la salle, les autres vous rejoignent avec un code."
    >
      <CreationLobbyForm slug={slug} />
    </LobbyShell>
  );
}
