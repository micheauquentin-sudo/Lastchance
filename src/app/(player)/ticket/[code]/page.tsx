import type { Metadata, Viewport } from "next";

import { LobbyCarton, LobbyShell } from "@/components/lobby/lobby-shell";
import { TicketExperience } from "@/components/ticket/ticket-experience";
import { estCodeTicket } from "@/lib/ticket-or";

/**
 * LE TICKET D'OR — la page que le client ouvre à son prochain passage (TKT-1).
 *
 * ── CETTE PAGE NE TIRE RIEN ──
 *
 * Elle ne fait AUCUNE lecture de base et ne consomme rien : elle peint un
 * bouton. Le tirage part d'un doigt, dans `TicketExperience`. Un `GET` qui
 * consomme un ticket serait consommé par un préchargement, un antivirus qui
 * suit les liens ou un retour arrière — et le client aurait « joué » sans
 * avoir rien touché.
 *
 * Corollaire : la page ne sait PAS si le code existe. Elle ne peut donc pas
 * répondre 404 sur un code inventé, et c'est très bien — ce serait un oracle.
 * Le refus indistinct vient de la RPC, au moment du geste.
 *
 * ── `force-dynamic` ET `noindex` ──
 *
 * Un code de ticket n'a rien à faire dans un cache partagé ni dans un moteur
 * de recherche. La page est légère : elle ne coûte rien à rendre à chaque fois.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ticket d'Or",
  description: "Ouvrez votre Ticket d'Or et découvrez ce que le commerce vous offre.",
  robots: { index: false },
  formatDetection: { telephone: false },
};

export function generateViewport(): Viewport {
  return { themeColor: "#fdf6e3" };
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  // Normalisé À L'AFFICHAGE seulement, comme le code de salon : un code
  // minuscule collé depuis un SMS doit marcher. La RPC revalide la forme.
  const codeAffiche = code.trim().toUpperCase();

  return (
    <LobbyShell
      titre="Ticket d'Or"
      chapeau="Une visite d'hier, une bonne raison de revenir."
    >
      <LobbyCarton>
        {estCodeTicket(codeAffiche) ? (
          <TicketExperience code={codeAffiche} />
        ) : (
          // MÊME PHRASE que le refus de la RPC : la forme du code n'est pas une
          // information qu'on donne à qui essaie d'en deviner un.
          <p className="text-center text-sm text-k-body">
            Ce ticket ne mène nulle part — vérifiez le code.
          </p>
        )}
      </LobbyCarton>
    </LobbyShell>
  );
}
