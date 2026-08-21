import type { Metadata, Viewport } from "next";
import {
  lireJetonLobby,
  observerPressionLobby,
  resoudreLobbyParCode,
} from "@/lib/lobby-context";
import { LobbyCarton, LobbyShell } from "@/components/lobby/lobby-shell";
import { SalonLobby } from "@/components/lobby/salon-lobby";

/**
 * Le salon lui-même : on y entre par son code, puis on y attend les autres.
 *
 * ── LE CODE EST RÉSOLU ICI, AU SERVEUR, ET C'EST SON MÉTIER ──
 *
 * La page est `force-dynamic` : elle a la requête, donc les cookies, donc tout
 * ce qu'il faut pour savoir quel écran peindre AVANT le premier octet. Deux
 * lectures, dans cet ordre :
 *
 *   1. `resoudreLobbyParCode` — ce code mène-t-il à une salle ouvrable ?
 *      `null` recouvre le code inventé, le malformé, l'expiré et le clos, sans
 *      les distinguer : c'est la même indistinction que `join_player_lobby`,
 *      tenue un cran plus tôt.
 *   2. Le cookie `lc-lobby-{id}` — ce navigateur est-il déjà entré ici ?
 *      httpOnly, lu par le serveur seul ; sa PRÉSENCE suffit à choisir l'écran,
 *      et sa valeur ne franchit jamais la frontière client.
 *
 * ── CE QUE ÇA REMPLACE, ET POURQUOI C'ÉTAIT CASSÉ ──
 *
 * Le choix se faisait auparavant sur une mémoire d'ONGLET (`sessionStorage`),
 * écrite par le formulaire qui venait de réussir. Trois conséquences, toutes
 * visibles au comptoir : un lien de salon partagé puis ouvert dans un autre
 * onglet retombait sur « rejoindre » alors que le cookie disait le contraire ;
 * un rechargement sur un second appareil aussi ; et la vérité de
 * l'appartenance existait en deux exemplaires, dont un que le serveur ne
 * pouvait ni lire ni corriger. La seule copie qui compte est celle qui voyage
 * avec la requête.
 *
 * ── LE REFUS EST UN ÉCRAN, PAS UN 404 ──
 *
 * La 404 de Next aurait dit la même chose avec un code HTTP — mais elle
 * l'aurait dit à un scanner aussi bien qu'à un joueur, et un statut se compte
 * plus facilement qu'une page de refus. L'écran rend la MÊME phrase pour les
 * quatre causes.
 *
 * (La garde de `route-boundaries.test.ts` cherche l'appel littéral dans le
 * texte du fichier, commentaires compris : d'où la périphrase, qui vaut mieux
 * qu'une exception dans la garde.)
 *
 * ── Le code ne quitte jamais l'URL en clair vers un jeu ──
 *
 * Ce lot s'arrête au verrouillage : l'écran « la partie commence » est le point
 * de branchement de L17 (Duo Miroir) et L18 (Portrait de la Bande).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Salon",
  description: "Rejoignez le salon avec son code et attendez les autres.",
  robots: { index: false },
  formatDetection: { telephone: false },
};

export function generateViewport(): Viewport {
  return { themeColor: "#fdf6e3" };
}

/** La phrase du refus indistinct, à l'identique de `refus.ts`. */
const INDISPONIBLE =
  "Ce code ne mène nulle part — vérifiez-le ou demandez-en un nouveau.";

export default async function LobbyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  // Normalisé À L'AFFICHAGE seulement : `lobbyJoinCodeSchema` remet déjà le code
  // en majuscules et le détoure. Un code minuscule dans l'URL doit marcher.
  const codeAffiche = code.trim().toUpperCase();

  // LE SEAU AVANT LA LECTURE, comme dans les actions et pour la même raison : le
  // code vient de l'URL, donc du client. Cette page fait maintenant une lecture
  // en base à chaque ouverture — un balayage de codes à six caractères par
  // simples GET serait invisible en supervision sans ce compteur, qui ne refuse
  // rien (fail-open, ADR-032) et ne compose sa clé avec aucune ressource.
  await observerPressionLobby("page");

  const salle = await resoudreLobbyParCode(codeAffiche);
  if (!salle) {
    return (
      <LobbyShell
        titre="Le salon"
        chapeau="Retrouvez-vous ici avant de jouer, à la même table ou non."
      >
        <LobbyCarton>
          <p className="text-center text-sm text-k-body">{INDISPONIBLE}</p>
        </LobbyCarton>
      </LobbyShell>
    );
  }

  // La PRÉSENCE du jeton, jamais sa valeur : elle reste dans le cookie httpOnly,
  // et le booléen est tout ce dont l'écran a besoin pour choisir sa moitié.
  const dejaMembre = (await lireJetonLobby(salle.lobbyId)) !== null;

  // UNE SALLE FINIE NE SE REJOINT PAS, MAIS ELLE SE RELIT. Le résolveur laisse
  // passer les salles closes de quelques heures pour que le résultat d'une
  // partie survive à un rechargement (la révélation ferme la salle). Celui qui
  // n'a pas le cookie n'y a pas joué : il reçoit le refus indistinct, exactement
  // comme sur un code inventé — et surtout pas un formulaire pour entrer dans
  // une partie qui n'existe plus.
  if (!salle.vivante && !dejaMembre) {
    return (
      <LobbyShell
        titre="Le salon"
        chapeau="Retrouvez-vous ici avant de jouer, à la même table ou non."
      >
        <LobbyCarton>
          <p className="text-center text-sm text-k-body">{INDISPONIBLE}</p>
        </LobbyCarton>
      </LobbyShell>
    );
  }

  return (
    <LobbyShell
      titre="Le salon"
      chapeau="Retrouvez-vous ici avant de jouer, à la même table ou non."
    >
      <SalonLobby
        code={codeAffiche}
        lobbyId={salle.lobbyId}
        dejaMembre={dejaMembre}
      />
    </LobbyShell>
  );
}
