import "server-only";

import { cookies } from "next/headers";
import { loyaltyTierMeta } from "@/components/loyalty/loyalty-passport-state";
import { buildGoogleWalletLoyaltySaveUrl } from "@/lib/google-wallet";
import { loyaltyTokenCookieName } from "@/lib/loyalty-context";
import { hashPlayerToken } from "@/lib/pronostics";
import type { LoyaltyTier } from "@/types/database";

/**
 * LE PONT ENTRE LE PASSEPORT ET GOOGLE WALLET.
 *
 * Une carte Wallet est NOMINATIVE : son identifiant chez Google dérive de
 * l'empreinte du jeton passeport, qui n'existe que dans le cookie httpOnly du
 * client. Ce module est donc le seul endroit qui a besoin, en même temps, de
 * ce cookie et du constructeur de lien — d'où sa séparation de
 * `lib/google-wallet.ts`, qui ne connaît ni cookies ni fidélité.
 *
 * ── TROIS SILENCES, ET AUCUN N'EST UNE ERREUR ──
 *
 * La fonction rend `null` — donc AUCUN bouton — dans trois cas, et la page ne
 * doit distinguer aucun des trois :
 *
 *  · GOOGLE WALLET N'EST PAS CONFIGURÉ. Le triplet d'émission est absent des
 *    variables d'environnement. C'est l'état par DÉFAUT tant que le
 *    propriétaire n'a pas créé son compte émetteur : le passeport se rend
 *    exactement comme avant, sans bouton et sans le moindre message. Un client
 *    n'a jamais à lire la configuration manquante de son commerçant.
 *  · AUCUN COOKIE DE PASSEPORT. Premier passage, ou navigation privée : il n'y
 *    a pas d'identité à graver dans une carte.
 *  · AUCUN PASSEPORT EN BASE. Le cookie existe mais aucune visite n'a encore
 *    été validée : une carte de fidélité à zéro visite ne vaut rien, et la
 *    proposer avant le premier tampon inverse l'ordre du parcours.
 *
 * AUCUNE ÉCRITURE ICI — ni cookie, ni base. La page passeport est en lecture
 * seule au rendu, et ce module ne fait pas exception : il LIT le cookie posé
 * par le tampon, il ne l'établit jamais.
 */
export async function lienGoogleWalletPasseport(params: {
  programId: string;
  programName: string;
  organizationName: string;
  logoUrl: string | null;
  passport: { hasPassport: boolean; pointsBalance: number; tier: LoyaltyTier };
}): Promise<string | null> {
  if (!params.passport.hasPassport) return null;

  const jeton = (await cookies()).get(
    loyaltyTokenCookieName(params.programId),
  )?.value;
  if (!jeton) return null;

  return buildGoogleWalletLoyaltySaveUrl({
    programId: params.programId,
    // L'EMPREINTE, jamais le jeton : la valeur du cookie ne quitte pas le
    // serveur, et l'empreinte elle-même est encore recondensée avant de
    // devenir l'identifiant de l'objet Wallet (cf. google-wallet.ts).
    memberTokenHash: hashPlayerToken(jeton),
    organizationName: params.organizationName,
    // Le nom que le commerçant a donné à son programme : c'est le titre que le
    // client lira dans son Wallet, entre les cartes des autres commerces.
    programName: params.programName,
    logoUrl: params.logoUrl,
    pointsBalance: params.passport.pointsBalance,
    // Le LIBELLÉ du niveau, pas la clé technique — et sans l'emoji du badge :
    // une carte Wallet n'est pas une surface où un emoji se lit bien, et il ne
    // doit apparaître dans aucun nom accessible.
    tierLabel: loyaltyTierMeta(params.passport.tier).label,
  });
}
