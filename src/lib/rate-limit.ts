import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { upstashRateLimit } from "@/lib/upstash";
import { reportError } from "@/lib/monitoring";

export interface RateLimitRule {
  /** Nombre maximum d'événements autorisés dans la fenêtre. */
  limit: number;
  /** Durée de la fenêtre glissante (fixe) en secondes. */
  windowSeconds: number;
}

/**
 * Règles de limitation par usage. Calibrées pour être invisibles aux
 * utilisateurs légitimes (un joueur tourne la roue une fois) tout en
 * bloquant l'automatisation.
 */
export const RATE_LIMITS = {
  /** Anti double-clic / anti-course : au plus un spin toutes les 4 s
   *  par empreinte joueur (ferme la race sur la limite de jeu). */
  spinBurst: { limit: 1, windowSeconds: 4 },
  /** Débit soutenu par empreinte joueur. */
  spin: { limit: 8, windowSeconds: 60 },
  /** Débit par IP, tous joueurs confondus (drainage de stock, bots). */
  spinIp: { limit: 40, windowSeconds: 60 },
  /** Réclamation de gain par empreinte joueur. */
  claim: { limit: 15, windowSeconds: 60 },
  /** Recherche/validation de codes par un compte de caisse. */
  cashier: { limit: 30, windowSeconds: 60 },
  /** Connexions par IP (credential stuffing). */
  authLogin: { limit: 10, windowSeconds: 300 },
  /** Créations de compte par IP (spam d'inscriptions). */
  authSignup: { limit: 5, windowSeconds: 3600 },
  /** Campagnes newsletter envoyées par organisation (anti-spam/abus). */
  newsletterSend: { limit: 5, windowSeconds: 86_400 },
  /** Compteur de scan par QR et IP (anti-inflation des statistiques). */
  scanIp: { limit: 60, windowSeconds: 60 },
  /** Inscriptions par championnat et IP. Le seuil tient compte du Wi-Fi
   *  partagé d'un commerce ; Turnstile reste la première barrière anti-bot. */
  pronoRegisterIp: { limit: 120, windowSeconds: 3600 },
  /** Demandes de lien de récupération par championnat et IP. */
  pronoRecoverIp: { limit: 10, windowSeconds: 3600 },
  /** Demandes de lien par email ciblé (anti-harcèlement d'une adresse). */
  pronoRecoverEmail: { limit: 3, windowSeconds: 3600 },
  /** Plafond réseau large pour ne pas pénaliser les clients derrière le même NAT. */
  pronoPredictIp: { limit: 300, windowSeconds: 60 },
  /** Débit soutenu par joueur inscrit (une grille complète ≈ 10 requêtes). */
  pronoPredictPlayer: { limit: 40, windowSeconds: 60 },
  /** Synchronisations manuelles du calendrier par utilisateur et organisation. */
  contestSync: { limit: 6, windowSeconds: 300 },
  /** Rafraîchissement du mode TV (classement public) par championnat et IP :
   *  un écran légitime interroge toutes les 30 s, la marge couvre plusieurs
   *  écrans derrière la même box. */
  pronoTvIp: { limit: 30, windowSeconds: 60 },
  /** Tentatives de code de ligue par championnat et IP — anti-bruteforce
   *  des codes d'invitation (6-8 caractères). */
  pronoLeagueJoinIp: { limit: 10, windowSeconds: 600 },
  /** Créations de ligue par joueur inscrit (le plafond dur est de
   *  200 ligues par championnat, appliqué par la RPC). */
  pronoLeagueCreatePlayer: { limit: 5, windowSeconds: 3600 },
  /** Tampons de chasse au trésor par IP, tous joueurs confondus — plafond
   *  réseau large (Wi-Fi partagé d'un mall/festival : ~50 joueurs actifs à
   *  4 scans/10 min) tout en cappant un bot mono-IP à ~20 complétions d'une
   *  chasse de 10 étapes/10 min. La vraie barrière anti-abus est ailleurs :
   *  entropie des jetons (32^16) + seau par cookie `huntScanPlayer` + cap de
   *  stock. Fail-closed sûr : sur panne Upstash, `check_rate_limit` (Postgres,
   *  déjà requis par le scan) prend le relais — jamais de verrouillage global. */
  huntScanIp: { limit: 200, windowSeconds: 600 },
  /** Tampons par empreinte joueur (cookie/hash) — débit soutenu ; les
   *  re-scans sont idempotents côté RPC. */
  huntScanPlayer: { limit: 30, windowSeconds: 3600 },
  /** Check-ins / spins offerts de fidélité par IP, tous passeports confondus —
   *  plafond réseau TRÈS LARGE, assumé comme un simple garde-fou
   *  anti-emballement et NON comme un contrôle de sécurité.
   *
   *  Pourquoi si haut : la clé est mutualisée (Wi-Fi de la boutique, CGNAT
   *  opérateur) et le seau est fail-closed. Un seuil bas transforme donc le
   *  contrôle en DÉNI DE SERVICE trivial du parcours public : n'importe qui
   *  atteignant le plafond bloque tous les clients légitimes derrière la même
   *  IP. À 1200/10 min il faut tenir 2 req/s en continu — un volume qui sort du
   *  bruit et se voit dans les métriques, là où 300/10 min tombait en une
   *  rafale de quelques secondes.
   *
   *  Ne s'applique QU'AUX acteurs sans identité établie : un passeport établi
   *  (voir passportStanding dans actions/loyalty.ts) ne le consulte jamais, il
   *  ne peut donc plus être pris en otage par un voisin de NAT. Ne PAS
   *  resserrer ce plafond-ci (leçon huntScanIp). */
  loyaltyStampIp: { limit: 1200, windowSeconds: 600 },
  /** Tampons/consommations par passeport (cookie/hash) — débit soutenu ; le
   *  cooldown serveur (min_stamp_interval) reste la borne métier. */
  loyaltyStampMember: { limit: 30, windowSeconds: 3600 },
  /** Jetons de check-in signés par passeport (mode caisse). L'écran joueur
   *  renouvelle son QR ~30 s avant l'échéance d'une TTL de 3 min, soit ~24/h
   *  pour une carte laissée ouverte, plus les reprises sur retour d'onglet :
   *  120/h laisse 5x de marge tout en bornant une boucle de signature HMAC
   *  lancée depuis une identité établie (seul acteur dispensé du seau IP). */
  loyaltyCheckinMember: { limit: 120, windowSeconds: 3600 },
  /** CRÉATIONS d'identité de passeport par programme et IP.
   *
   *  En mode `rotating_code` le code à 6 chiffres est AFFICHÉ au comptoir : le
   *  lire est légitime et gratuit. Ce qui doit être borné n'est donc pas la
   *  devinette du code mais la fabrication d'IDENTITÉS — chaque cookie neuf est
   *  un passeport neuf, donc un palier « à la 1re visite » potentiellement
   *  encaissable. Ce seau est le premier des deux plafonds de création (l'autre
   *  est agrégé par programme, ci-dessous) et n'est consommé qu'APRÈS un
   *  challenge Turnstile résolu : une rafale sans captcha ne le draine pas.
   *
   *  15/10 min : un client scanne le QR depuis sa 4G (IP propre) ; seule la
   *  box du commerce mutualise, et 15 inscriptions en 10 min depuis une même
   *  IP est déjà une pointe inhabituelle pour un seul point de vente. */
  loyaltyPassportCreateIp: { limit: 15, windowSeconds: 600 },
  /** CRÉATIONS d'identité de passeport par PROGRAMME, toutes IP confondues —
   *  le plafond que le coût en 1/N d'un pool d'IP ne fait pas bouger. C'est le
   *  plafond de frappe : au plus 60 passeports neufs / 10 min sur un programme,
   *  chacun payé d'un Turnstile résolu. Un commerce réel crée quelques
   *  passeports par heure ; 360/h laisse même une inauguration passer. */
  loyaltyPassportCreateProgram: { limit: 60, windowSeconds: 600 },
  /** ÉVALUATIONS de code tournant par passeport (programme + hash du cookie).
   *  Atomique par construction (`rateLimit` incrémente et tranche dans le même
   *  appel) — contrairement à un compteur d'échecs lu puis écrit, qu'une rafale
   *  concurrente traverse en lisant toutes `count = 0`.
   *
   *  Compte les TENTATIVES et non les échecs : c'est le prix de l'atomicité, et
   *  il ne coûte rien au client légitime — le cooldown en base vaut au moins
   *  300 s, donc un passeport n'a jamais besoin de plus d'un code accepté par
   *  fenêtre ; 6 laisse la marge des fautes de frappe. */
  loyaltyStampCodeMember: { limit: 6, windowSeconds: 300 },
  /** ÉVALUATIONS de code tournant par les passeports connus mais NON ÉTABLIS
   *  (1re visite faite, 2e en cours), agrégées par PROGRAMME — tous acteurs et
   *  toutes IP confondus. Avec le plafond de création ci-dessus, c'est ce qui
   *  borne la devinette totale d'un programme indépendamment du nombre d'IP.
   *  Les passeports établis n'y touchent pas : le trafic d'un commerce réel
   *  n'entre dans ce seau qu'aux visites 1 et 2 de chaque client. */
  loyaltyStampCodeNoviceProgram: { limit: 60, windowSeconds: 600 },
  /** Lecture du code tournant au comptoir par membre et programme — un écran
   *  légitime interroge toutes les quelques secondes ; marge confortable. */
  loyaltyCounter: { limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

/** Construit une clé de seau lisible et sans collision entre usages. */
export function rateLimitBucket(...parts: Array<string | number>): string {
  return parts.map((p) => String(p)).join(":");
}

/**
 * Retourne `true` si l'action est autorisée, `false` si la limite est
 * atteinte.
 *
 * Si Upstash est configuré (UPSTASH_REDIS_REST_URL/TOKEN), le verdict
 * vient de Redis — rapide et hors DB. Sinon (ou en cas d'erreur
 * Upstash), le compteur atomique en base prend le relais (résiste au
 * multi-instance serverless, contrairement à un compteur en mémoire).
 *
 * Fail-open par défaut pour les fonctions de confort. Les opérations critiques
 * (spin, scan) passent `failClosed` afin qu'une panne de protection ne devienne
 * jamais un contournement. Tous les incidents remontent au monitoring.
 *
 * ATOMICITÉ — pourquoi il n'existe plus de couple « lire le compteur puis
 * l'incrémenter après coup ».
 *
 * Une garde en deux temps (`select count` → décision → `increment`) laisse une
 * fenêtre entre la lecture et l'écriture : une rafale concurrente lancée en
 * début de fenêtre lit toutes `count = 0` et passe en bloc, si bien que le
 * budget réel n'est plus celui du seau mais celui du plafond situé au-dessus.
 * `rateLimit` ci-dessous n'a pas ce défaut — les DEUX implémentations
 * (Upstash `INCR`, Postgres `check_rate_limit` en `insert … on conflict do
 * update … returning count`) incrémentent ET tranchent dans le même aller-
 * retour. C'est la seule primitive de comptage exposée par ce module : toute
 * garde de sécurité doit passer par elle, quitte à compter les TENTATIVES
 * plutôt que les seuls échecs.
 */
export async function rateLimit(
  bucket: string,
  rule: RateLimitRule,
  options: { failClosed?: boolean } = {},
): Promise<boolean> {
  const upstashVerdict = await upstashRateLimit(bucket, rule);
  if (upstashVerdict !== null) return upstashVerdict;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_bucket: bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) {
      reportError("rate-limit.rpc", error.message);
      return !options.failClosed;
    }
    return data !== false;
  } catch (err) {
    reportError("rate-limit", err);
    return !options.failClosed;
  }
}
