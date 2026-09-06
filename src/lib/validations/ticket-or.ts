import { z } from "zod";

/**
 * Code de RETRAIT d'un lot de Ticket d'Or présenté en caisse (TICKET-XXXXXXXX).
 * Casse et espaces autour tolérés ; l'alphabet exclut I/O/0/1 (miroir de
 * `tirer_ticket_or`, 20261028120000). Miroir strict de
 * `stockHoldRedeemCodeSchema` : la famille n'a AUCUN repli legacy, le code
 * n'existe qu'au registre.
 *
 * ⚠️ CE N'EST PAS LE CODE DU TICKET. Celui-là fait dix caractères SANS préfixe
 * (`CODE_TICKET`, `src/lib/ticket-or.ts`) et n'ouvre que le droit de jouer.
 * Accepter sa forme ici ferait valider en caisse un ticket jamais tiré.
 */
export const ticketOrRedeemCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^TICKET-[A-HJ-NP-Z2-9]{8}$/, "Code de retrait invalide");
