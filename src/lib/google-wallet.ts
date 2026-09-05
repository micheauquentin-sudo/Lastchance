import "server-only";

import { createHash, createSign } from "node:crypto";
import { APP_URL, optionalEnv } from "@/lib/env";

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Les trois variables du compte émetteur, ou `null` si l'une manque.
 *
 * UN SEUL point de lecture pour toute la famille Google Wallet : tant que ce
 * triplet n'est pas posé, chaque fonction du module rend `null` (ou ne fait
 * rien) et le bouton correspondant DISPARAÎT côté client — jamais un bouton
 * grisé, jamais un message d'erreur : un client n'a pas à lire la
 * configuration manquante d'un commerçant. Même convention que Resend,
 * Turnstile et Apple Wallet.
 */
function walletConfig(): {
  issuerId: string;
  clientEmail: string;
  privateKey: string;
} | null {
  const issuerId = optionalEnv("GOOGLE_WALLET_ISSUER_ID");
  const clientEmail = optionalEnv("GOOGLE_WALLET_CLIENT_EMAIL");
  const rawKey = optionalEnv("GOOGLE_WALLET_PRIVATE_KEY");
  if (!issuerId || !clientEmail || !rawKey) return null;
  // La clé de compte de service se colle en une seule ligne dans un
  // gestionnaire de variables : les sauts de ligne y sont échappés.
  return { issuerId, clientEmail, privateKey: rawKey.replace(/\\n/g, "\n") };
}

/**
 * Lien « Ajouter à Google Wallet » pour le code de retrait d'un gain.
 * Renvoie null si Google Wallet n'est pas configuré (compte de service
 * émetteur Google Pay & Wallet Console requis) — le bouton disparaît
 * simplement côté client, comme Resend/Turnstile quand ils manquent.
 *
 * Classe et objet du pass sont déclarés inline dans le JWT signé : pas
 * besoin d'appel API préalable pour créer la classe côté Google.
 */
export function buildGoogleWalletSaveUrl(params: {
  organizationName: string;
  prizeLabel: string;
  redeemCode: string;
  /** Échéance SERVEUR du code : le pass expire de lui-même dans Wallet. */
  redeemExpiresAt?: string | null;
}): string | null {
  const config = walletConfig();
  if (!config) return null;
  const { issuerId, clientEmail, privateKey } = config;

  try {
    const classId = `${issuerId}.lastchance_prize`;
    const safeCode = params.redeemCode.replace(/[^A-Za-z0-9_.-]/g, "_");
    const objectId = `${issuerId}.${safeCode}`;

    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: clientEmail,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      // `origins` reçoit ici APP_URL ENTIER (« https://exemple.fr »), là où les
      // exemples Google montrent un HOSTNAME (« exemple.fr »). Ce n’est pas
      // établi comme un défaut : personne n’a encore émis ce jeton contre un
      // vrai compte émetteur Google, qui seul dit si la comparaison d’origine
      // est faite sur l’URL ou sur l’hôte. Ne PAS « corriger » à l’aveugle —
      // si la forme attendue était l’URL, la changer casserait le bouton
      // « Ajouter à Google Wallet » sans qu’aucun test local ne rougisse.
      // À VALIDER contre un émetteur réel, avec les deux formes.
      origins: [APP_URL],
      payload: {
        genericClasses: [{ id: classId }],
        genericObjects: [
          {
            id: objectId,
            classId,
            genericType: "GENERIC_TYPE_UNSPECIFIED",
            hexBackgroundColor: "#18181b",
            cardTitle: {
              defaultValue: { language: "fr", value: params.organizationName },
            },
            header: {
              defaultValue: { language: "fr", value: params.prizeLabel },
            },
            subheader: {
              defaultValue: { language: "fr", value: "Votre gain" },
            },
            textModulesData: [{ header: "CODE", body: params.redeemCode }],
            barcode: {
              type: "CODE_128",
              value: params.redeemCode,
              alternateText: params.redeemCode,
            },
            // Le pass reflète l'expiration SERVEUR du code : passé ce
            // moment, Wallet le classe automatiquement comme expiré.
            ...(params.redeemExpiresAt
              ? {
                  validTimeInterval: {
                    end: { date: new Date(params.redeemExpiresAt).toISOString() },
                  },
                }
              : {}),
          },
        ],
      },
    };

    const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = createSign("RSA-SHA256")
      .update(unsigned)
      .sign(privateKey)
      .toString("base64url");

    return `https://pay.google.com/gp/v/save/${unsigned}.${signature}`;
  } catch (err) {
    console.error("[google-wallet] construction du lien échouée:", err);
    return null;
  }
}

/** Jeton OAuth du compte de service (scope wallet_object.issuer). */
async function walletApiToken(
  clientEmail: string,
  privateKey: string,
): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 300,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const assertion = `${unsigned}.${createSign("RSA-SHA256")
    .update(unsigned)
    .sign(privateKey)
    .toString("base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

/**
 * Invalide le pass Google Wallet d'un code (retrait ou annulation) :
 * l'objet passe à l'état EXPIRED chez Google — le client voit son pass
 * grisé. Best-effort : sans configuration ou en cas d'échec, on loggue
 * et on continue — l'expiration SERVEUR du code fait foi de toute façon.
 */
export async function expireGoogleWalletPass(redeemCode: string): Promise<void> {
  const config = walletConfig();
  if (!config) return;
  const { issuerId, clientEmail, privateKey } = config;

  try {
    const token = await walletApiToken(clientEmail, privateKey);
    if (!token) return;

    const safeCode = redeemCode.replace(/[^A-Za-z0-9_.-]/g, "_");
    const objectId = `${issuerId}.${safeCode}`;
    const res = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(objectId)}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ state: "EXPIRED" }),
        signal: AbortSignal.timeout(8000),
      },
    );
    // 404 : le client n'avait jamais ajouté le pass — rien à invalider.
    if (!res.ok && res.status !== 404) {
      console.warn(`[google-wallet] invalidation ${objectId}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("[google-wallet] invalidation échouée:", err);
  }
}

// ────────────────────────────────────────────────────────────
// Carte de FIDÉLITÉ (passeport joueur) — loyaltyClass / loyaltyObject
// ────────────────────────────────────────────────────────────

/**
 * ── CE QUE PORTE LE QR DE LA CARTE, ET POURQUOI CE N'EST PAS CELUI DU
 *    PASSEPORT ──
 *
 * Le QR affiché par « Ma carte à présenter » ne porte QU'UN JETON DE CHECK-IN
 * SIGNÉ ET ÉPHÉMÈRE (`lib/loyalty-checkin.ts`, TTL 3 min, borné des DEUX
 * côtés : `verifyLoyaltyCheckin` refuse aussi une échéance trop lointaine).
 * L'écran du passeport le renouvelle 30 s avant terme. Une telle valeur ne
 * peut pas être gravée dans une carte Wallet : elle serait périmée avant le
 * premier passage en caisse, et la caisse répondrait « carte expirée ou
 * illisible » à un client dont la carte est parfaitement valide.
 *
 * Trois issues étaient possibles ; celle retenue est la troisième.
 *
 *  1. GRAVER UN BEARER STABLE que la caisse sait résoudre (nouvelle famille de
 *     jetons signés sans échéance, acceptée en second par
 *     `stampLoyaltyVisitStaff`). ÉCARTÉ : cela réintroduit très exactement ce
 *     que `lib/loyalty-checkin.ts` a été écrit pour supprimer — un QR
 *     photographiable au comptoir qui reste valable indéfiniment. Le pouvoir
 *     d'un tel jeton serait moindre que celui de l'ancien (faire compter une
 *     visite, et ne rien lire), mais renverser une décision de sécurité
 *     documentée n'est pas du ressort d'un lot dont l'objet est d'ajouter un
 *     bouton : cela demande une revue et un ADR.
 *  2. `rotatingBarcode` de Google (TOTP porté par la carte, secret partagé
 *     avec l'émetteur). C'est LA réponse propre au problème posé, mais elle
 *     exige une famille de secrets TOTP côté serveur, un chemin de
 *     vérification distinct du HMAC actuel, et l'autorisation explicite de
 *     Google sur le compte émetteur. Hors de proportion ici.
 *  3. RETENU — LA CARTE PORTE UN LIEN, pas une créance. Le QR encode l'URL
 *     PUBLIQUE du passeport : valeur stable, non secrète, qui ne prouve rien
 *     et n'autorise rien. N'importe quel appareil photo l'ouvre ; le passeport
 *     s'y affiche avec le cookie du client et y montre le vrai code du
 *     comptoir, frais. La carte Wallet est donc le RACCOURCI vers la carte, et
 *     l'écran reste le seul porteur du laissez-passer.
 *
 * Conséquence assumée, et écrite sur la carte elle-même (`textModulesData`) :
 * au comptoir on ouvre la carte, on ne la fait pas scanner directement. Si la
 * caisse scanne quand même ce QR, elle lit une URL, la refuse, et son message
 * existant (« demandez au client de rafraîchir son passeport ») dit déjà le
 * bon geste.
 */

/**
 * Identifiant Wallet de la carte d'UN membre — déterministe, calculable aussi
 * bien à l'émission (page passeport) qu'à la mise à jour (caisse).
 *
 * L'empreinte du jeton passeport (`loyalty_members.token_hash`) n'apparaît PAS
 * telle quelle : l'URL « Save to Wallet » est visible du client, et le suffixe
 * d'objet y serait lisible en clair. On la repasse donc dans un SHA-256
 * préfixé par un domaine, tronqué à 32 caractères — assez pour ne jamais
 * collisionner à l'échelle d'un programme, et sans rien révéler de la colonne.
 */
export function googleWalletLoyaltyObjectSuffix(
  programId: string,
  memberTokenHash: string,
): string {
  return createHash("sha256")
    .update(`google-wallet-loyalty:${programId}:${memberTokenHash}`)
    .digest("hex")
    .slice(0, 32);
}

export interface GoogleWalletLoyaltyCard {
  programId: string;
  /** Empreinte du jeton passeport — jamais le jeton lui-même. */
  memberTokenHash: string;
  organizationName: string;
  programName: string;
  /** Logo de l'organisation, s'il en a un (URL absolue et publique). */
  logoUrl?: string | null;
  /** LE SOLDE DÉPENSABLE, celui que le passeport affiche en tête. */
  pointsBalance: number;
  /** Libellé du niveau, déjà traduit et SANS emoji (Bronze / Argent / Or). */
  tierLabel: string;
}

/** L'URL publique du passeport — la valeur stable que porte la carte. */
function passportUrl(programId: string): string {
  return `${APP_URL}/passeport/${encodeURIComponent(programId)}`;
}

/**
 * Lien « Ajouter à Google Wallet » pour le passeport de fidélité d'un membre.
 * `null` si Google Wallet n'est pas configuré — le bouton disparaît alors
 * simplement, sans que rien d'autre ne change à l'écran.
 *
 * Classe et objet sont déclarés INLINE dans le JWT signé : aucune création
 * préalable côté Google n'est nécessaire, comme pour le pass de gain.
 */
export function buildGoogleWalletLoyaltySaveUrl(
  card: GoogleWalletLoyaltyCard,
): string | null {
  const config = walletConfig();
  if (!config) return null;
  const { issuerId, clientEmail, privateKey } = config;

  try {
    // Une classe PAR PROGRAMME : c'est elle qui porte le nom du commerce et
    // son logo, qui diffèrent d'un commerçant à l'autre.
    const classId = `${issuerId}.lastchance_loyalty_${card.programId}`;
    const suffix = googleWalletLoyaltyObjectSuffix(
      card.programId,
      card.memberTokenHash,
    );
    const url = passportUrl(card.programId);

    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: clientEmail,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      // Même incertitude sur `origins` que dans `buildGoogleWalletSaveUrl` : à valider contre un émetteur réel.
      origins: [APP_URL],
      payload: {
        loyaltyClasses: [
          {
            id: classId,
            issuerName: card.organizationName,
            programName: card.programName,
            reviewStatus: "UNDER_REVIEW",
            hexBackgroundColor: "#fdf6e3",
            ...(card.logoUrl
              ? {
                  programLogo: {
                    sourceUri: { uri: card.logoUrl },
                    contentDescription: {
                      defaultValue: {
                        language: "fr",
                        value: `Logo de ${card.organizationName}`,
                      },
                    },
                  },
                }
              : {}),
          },
        ],
        loyaltyObjects: [
          {
            id: `${issuerId}.${suffix}`,
            classId,
            state: "ACTIVE",
            accountName: card.programName,
            // Pas l'empreinte brute : le même condensé que l'identifiant.
            accountId: suffix,
            loyaltyPoints: {
              label: "Points",
              balance: { string: String(card.pointsBalance) },
            },
            secondaryLoyaltyPoints: {
              label: "Niveau",
              balance: { string: card.tierLabel },
            },
            // UN LIEN, PAS UNE CRÉANCE — voir le commentaire de tête.
            barcode: {
              type: "QR_CODE",
              value: url,
              alternateText: "Ouvre votre passeport",
            },
            textModulesData: [
              {
                header: "Au comptoir",
                body: "Ouvrez votre passeport depuis cette carte : le code a faire scanner y change toutes les trois minutes, il ne peut pas etre grave ici.",
                id: "comptoir",
              },
            ],
            linksModuleData: {
              uris: [
                {
                  uri: url,
                  description: "Ouvrir mon passeport",
                  id: "passeport",
                },
              ],
            },
          },
        ],
      },
    };

    const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = createSign("RSA-SHA256")
      .update(unsigned)
      .sign(privateKey)
      .toString("base64url");

    return `https://pay.google.com/gp/v/save/${unsigned}.${signature}`;
  } catch (err) {
    console.error("[google-wallet] carte de fidélité: lien non construit:", err);
    return null;
  }
}

/**
 * Pousse le nouveau solde (et le niveau) sur la carte Wallet d'un membre.
 *
 * ── APPELÉE DEPUIS `after()`, JAMAIS DANS LE GESTE DE CAISSE ──
 *
 * Tamponner est un geste de comptoir : le commerçant a le client devant lui.
 * Cette mise à jour coûte DEUX allers-retours vers Google (jeton OAuth du
 * compte de service, puis PATCH) — hors de question de les faire attendre à la
 * caisse. Elle est donc confiée à `after()` : la réponse part d'abord, la
 * carte se met à jour ensuite.
 *
 * Elle ne peut RIEN faire échouer : sans configuration elle sort avant tout
 * appel réseau (coût nul pour la quasi-totalité des déploiements), et toute
 * erreur est avalée après journalisation. Un 404 est le cas NORMAL — le client
 * n'a simplement jamais ajouté la carte.
 */
export async function pushGoogleWalletLoyaltyBalance(params: {
  programId: string;
  memberTokenHash: string;
  pointsBalance: number;
  tierLabel: string;
}): Promise<void> {
  const config = walletConfig();
  if (!config) return;
  const { issuerId, clientEmail, privateKey } = config;

  try {
    const token = await walletApiToken(clientEmail, privateKey);
    if (!token) return;

    const objectId = `${issuerId}.${googleWalletLoyaltyObjectSuffix(
      params.programId,
      params.memberTokenHash,
    )}`;
    const res = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          loyaltyPoints: {
            label: "Points",
            balance: { string: String(params.pointsBalance) },
          },
          secondaryLoyaltyPoints: {
            label: "Niveau",
            balance: { string: params.tierLabel },
          },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    // 404 : carte jamais ajoutée par ce client — rien à mettre à jour.
    if (!res.ok && res.status !== 404) {
      console.warn(`[google-wallet] solde ${objectId}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("[google-wallet] mise à jour du solde échouée:", err);
  }
}
