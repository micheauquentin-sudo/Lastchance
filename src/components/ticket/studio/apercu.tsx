"use client";

import { useMemo } from "react";

import { CadreApercu } from "@/components/studio/cadre-apercu";
import { LobbyCarton, LobbyShell } from "@/components/lobby/lobby-shell";
import { TicketExperience } from "@/components/ticket/ticket-experience";
import {
  estLotTirable,
  type LotTicketOrView,
  type TirageGagnant,
} from "@/lib/ticket-or";

/**
 * L'APERÇU DU TICKET D'OR — ET C'EST LA VRAIE PAGE, PAS UNE MAQUETTE (VIT-45).
 *
 * Il monte `TicketExperience` dans `LobbyShell` + `LobbyCarton`, exactement les
 * trois composants que sert `/ticket/[code]`, avec les mêmes titre et chapeau.
 * Ce qui se voit ici est ce qui sera servi.
 *
 * Une maquette approximative aurait été une seconde page joueur à tenir
 * d'accord avec la première. C'est le seul défaut qu'un aperçu ne doit jamais
 * avoir parce qu'il est INVISIBLE : rien ne casse, tout a l'air de
 * fonctionner, et l'écart ne se découvre qu'en ouvrant la vraie page (ADR-152).
 *
 * ── CE QUI EST NEUTRALISÉ, ET SEULEMENT CELA ──
 *
 * `ticket-experience.tsx` n'importe qu'UNE action, `tirerTicketOr`, et le
 * drapeau `apercu` la coupe — avec la mémoire locale, dans les deux sens. Rien
 * d'autre n'est touché : pas une classe, pas un bloc.
 *
 * La raison est plus dure que d'habitude : `tirer_ticket_or` **consomme un lot
 * du stock** et grave un retrait au nom du commerce. Un aperçu qui tirerait
 * viderait le stock du commerçant pendant qu'il le règle, et lui rendrait un
 * code de retrait que personne ne viendrait chercher.
 *
 * ── LE GAIN D'EXEMPLE SORT DU PRÉDICAT PARTAGÉ, PAS D'UNE INVENTION ──
 *
 * Le lot montré est le PREMIER que `estLotTirable` accepte — le même test que
 * fait le serveur au tirage. Quand aucun lot ne passe, l'exemple vaut `null` et
 * la page affiche le `sans_lot` que le client verrait vraiment : « Il n'y a
 * plus rien à gagner pour le moment ». C'est l'aperçu le plus utile de tout ce
 * studio, parce que c'est la panne que le commerçant ne voit jamais venir.
 *
 * Le code de retrait, lui, est un TEXTE et non un code : « EXEMPLE » ne peut
 * être présenté à aucun comptoir, et se lit comme ce qu'il est.
 */
const CODE_APERCU = "EXEMPLE";

/** Un code de la FORME attendue (10 caractères de l'alphabet du `check`) :
 *  `TicketExperience` ne le lit que pour sa mémoire, coupée en aperçu, mais
 *  lui en donner un mal formé mentirait sur l'adresse que le client ouvre. */
const CODE_TICKET_APERCU = "APERCU2345";

export function ApercuTicket({ lots }: { lots: LotTicketOrView[] }) {
  const exemple = useMemo<TirageGagnant | null>(() => {
    const lot = lots.find(estLotTirable);
    if (!lot) return null;
    return {
      state: "ok",
      lot: lot.libelle,
      codeRetrait: CODE_APERCU,
      // Pas de date : `Gain` retombe alors sur « À retirer lors de votre
      // prochain passage », qui est vrai de tous les tickets. Une date
      // fabriquée aurait laissé croire à une échéance réglée ici.
      expireLe: null,
    };
  }, [lots]);

  return (
    <CadreApercu
      /* 448 px, ET CE N'EST PAS UN CHOIX D'ESTHÉTIQUE : c'est `max-w-md`, la
         borne que `LobbyShell` pose sur son propre conteneur. Un cadre plus
         large rendrait une mise en page que personne ne verra. La valeur reste
         LITTÉRALE — Tailwind ne compile pas une classe construite à
         l'exécution. */
      classeCadre="w-full max-w-[448px]"
      /* LA LÉGENDE DIT CE QUI SE PASSE VRAIMENT. Le défaut du socle promet un
         enregistrement automatique ; ce studio n'en a pas — chaque lot garde
         son bouton « Enregistrer ». Le laisser aurait été un écran qui raconte
         le contraire de ce qu'il fait (ADR-153, pris par l'autre bout). */
      legende="Aperçu — la vraie page de vos clients. Chaque lot s'enregistre avec son bouton."
      banniere={
        <div className="w-full max-w-[448px] shrink-0">
          <p
            role="status"
            className="rounded-xl border-2 border-dashed border-k-ink/40 bg-k-yellow/40 px-3 py-2 text-xs font-black text-k-ink"
          >
            {exemple
              ? `Aperçu : « Ouvrir mon ticket » ne tire rien ici, et montre « ${exemple.lot} » à titre d'exemple. Vos clients, eux, tireront pour de vrai.`
              : "Aperçu : aucun lot ne peut sortir aujourd'hui — c'est exactement ce que vos clients verraient. L'étape « Vérifier qu'un lot peut sortir » dit ce qui manque."}
          </p>
        </div>
      }
    >
      {/* LA COQUILLE DE `/ticket/[code]`, reproduite trait pour trait : le même
          `LobbyShell` sans habillage (la page publique reste neutre, et c'est
          une décision de sécurité documentée là-bas), le même titre, le même
          chapeau, le même carton. */}
      <LobbyShell
        titre="Ticket d'Or"
        chapeau="Une visite d'hier, une bonne raison de revenir."
      >
        <LobbyCarton>
          <TicketExperience
            apercu
            code={CODE_TICKET_APERCU}
            exemple={exemple}
          />
        </LobbyCarton>
      </LobbyShell>
    </CadreApercu>
  );
}
