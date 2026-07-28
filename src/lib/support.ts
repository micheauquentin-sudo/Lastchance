import { optionalEnv } from "@/lib/env";

/**
 * Adresse de contact commerciale et support, celle-là même qui figure aux
 * mentions légales (`LEGAL_CONTACT_EMAIL`) : les CTA « demander une offre »
 * n'introduisent aucun réglage supplémentaire à provisionner.
 *
 * À lire côté serveur (la variable n'est pas `NEXT_PUBLIC_`) puis à passer
 * en prop aux composants client.
 */
export function getSupportEmail(): string {
  return optionalEnv("LEGAL_CONTACT_EMAIL") ?? "contact@lastchance.app";
}
