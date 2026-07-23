import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { upstashRateLimit } from "@/lib/upstash";
import { reportError, reportSecurityEvent } from "@/lib/monitoring";

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
  /** Réclamation d'un gain, par IDENTITÉ DE GAIN — clé propre à un porteur,
   *  donc `failClosed` légitime : la saturer ne coupe que le rejeu de CE gain.
   *  Deux porteurs partagent cette règle, chacun résolu AVANT le seau :
   *  `claim:spin:<spin_id>` (spin_id extrait du jeton de claim vérifié, roue et
   *  tour offert) et `hunt:claim:completion:<completion_id>` (complétion de
   *  chasse résolue par le cookie joueur).
   *
   *  Ce seau était historiquement porté par l'IP SEULE, à portée PLATEFORME
   *  (toutes organisations confondues) et consommé AVANT la vérification du
   *  jeton : un tiers derrière le même CGNAT — ou un abus sur une tout autre
   *  organisation — empêchait des joueurs légitimes d'encaisser leur lot. Voir
   *  `claimIp` pour ce qui reste sur l'IP. 15/60 s laisse la marge des
   *  soumissions successives d'un formulaire (email manquant, CGU non cochées)
   *  tout en bornant le rejeu d'un jeton volé. */
  claim: { limit: 15, windowSeconds: 60 },
  /** PRESSION de réclamation par IP — compteur d'OBSERVABILITÉ, jamais un
   *  refus (clé PARTAGÉE entre utilisateurs : CGNAT, Wi-Fi de commerce, et
   *  portée plateforme). Consommé APRÈS la vérification du jeton, donc un
   *  flot de jetons forgés ne l'allume même pas : ce qu'il mesure, ce sont des
   *  réclamations réellement signées. 600/10 min = 1 req/s en continu, seuil
   *  d'alerte inatteignable pour un commerce réel.
   *
   *  Ne PAS repasser en `failClosed` : c'est le seul mode compatible avec le
   *  principe (aucune clé partagée ne refuse dans un parcours public). Le rejeu
   *  est borné par `claim` sur l'identité du gain, et le gain lui-même par la
   *  transaction `claim_winning_spin` (un spin ne se réclame qu'une fois). */
  claimIp: { limit: 600, windowSeconds: 600 },
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
  /** Récupération de lien (demande + confirmation) par championnat. Le seau
   *  bloquant est désormais clé sur l'identité (jeton) ; la clé IP ne sert plus
   *  qu'à l'observabilité (ADR-032) — d'où le nom sans suffixe. */
  pronoRecover: { limit: 10, windowSeconds: 3600 },
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
  /** Tentatives de code de ligue par championnat — anti-bruteforce des codes
   *  d'invitation (6-8 caractères). Seau bloquant clé sur le joueur ; la clé IP
   *  ne sert plus qu'à l'observabilité (ADR-032) — d'où le nom sans suffixe. */
  pronoLeagueJoin: { limit: 10, windowSeconds: 600 },
  /** Créations de ligue par joueur inscrit (le plafond dur est de
   *  200 ligues par championnat, appliqué par la RPC). */
  pronoLeagueCreatePlayer: { limit: 5, windowSeconds: 3600 },
  /** PRESSION du tampon de chasse par IP, tous joueurs confondus — compteur
   *  d'OBSERVABILITÉ sur clé PARTAGÉE, jamais un refus (cf. `observeSharedKey`).
   *  Consommé APRÈS la résolution du cookie joueur et son seau d'identité
   *  `huntScanPlayer` : la clé IP (Wi-Fi partagé d'un mall/festival, ~50 joueurs
   *  actifs) ne peut donc plus devenir un interrupteur — un bot mono-IP à faible
   *  débit ne bloque plus le tampon de tous les joueurs d'un lieu. La vraie
   *  barrière anti-abus est ailleurs : entropie des jetons (32^16) + seau par
   *  cookie `huntScanPlayer` + cap de stock obligatoire sur le lot. À 200/10 min
   *  le dépassement signale un débit mono-IP anormal, il ne ferme rien. Ne PAS
   *  repasser en `failClosed`. */
  huntScanIp: { limit: 200, windowSeconds: 600 },
  /** Tampons par empreinte joueur (cookie/hash) — clé propre à UNE identité,
   *  donc `failClosed` légitime : la saturer ne coupe que son porteur. Débit
   *  soutenu ; les re-scans sont idempotents côté RPC. */
  huntScanPlayer: { limit: 30, windowSeconds: 3600 },
  /** PRESSION du parcours public de fidélité par programme et IP — compteur
   *  d'OBSERVABILITÉ, jamais un refus.
   *
   *  PRINCIPE (voir aussi huntScanIp) : dans un parcours PUBLIC, aucune clé
   *  PARTAGÉE entre utilisateurs (IP, programme, organisation) ne porte de seau
   *  fail-closed. Une clé partagée saturée par un tiers devient un interrupteur
   *  : « déni d'inscription d'un programme entier », « interrupteur permanent à
   *  0,1 req/s ». Ce seau-ci est donc consulté SANS agir sur son verdict : le
   *  dépassement émet `reportSecurityEvent` (loyalty_public_pressure) et rien
   *  d'autre. À 1200/10 min il faut tenir 2 req/s en continu pour l'allumer :
   *  c'est un seuil d'alerte, pas une porte.
   *
   *  Ne PAS repasser ce seau en `failClosed`, ne PAS le resserrer : le contrôle
   *  d'abus du module repose désormais sur les VERROUS ÉCONOMIQUES en base
   *  (stock fini obligatoire sur tout lot, palier à la visite 2 minimum), qui
   *  rendent une identité fabriquée sans valeur. */
  loyaltyStampIp: { limit: 1200, windowSeconds: 600 },
  /** Tampons/consommations par PASSEPORT (programme + hash du cookie) — clé
   *  propre à UNE identité, donc `failClosed` légitime : la saturer ne coupe
   *  que son porteur. Débit soutenu ; le cooldown serveur (min_stamp_interval,
   *  >= 300 s) reste la borne métier. */
  loyaltyStampMember: { limit: 30, windowSeconds: 3600 },
  /** Jetons de check-in signés par passeport (mode caisse), clé d'identité.
   *  L'écran joueur renouvelle son QR ~30 s avant l'échéance d'une TTL de
   *  3 min, soit ~24/h pour une carte laissée ouverte, plus les reprises sur
   *  retour d'onglet : 120/h laisse 5x de marge tout en bornant une boucle de
   *  signature HMAC. */
  loyaltyCheckinMember: { limit: 120, windowSeconds: 3600 },
  /** ÉVALUATIONS de code tournant par passeport (programme + hash du cookie).
   *  Clé d'identité → `failClosed`. Atomique par construction (`rateLimit`
   *  incrémente et tranche dans le même appel) — contrairement à un compteur
   *  d'échecs lu puis écrit, qu'une rafale concurrente traverse en lisant
   *  toutes `count = 0`.
   *
   *  Compte les TENTATIVES et non les échecs : c'est le prix de l'atomicité, et
   *  il ne coûte rien au client légitime — le cooldown en base vaut au moins
   *  300 s, donc un passeport n'a jamais besoin de plus d'un code accepté par
   *  fenêtre ; 6 laisse la marge des fautes de frappe. */
  loyaltyStampCodeMember: { limit: 6, windowSeconds: 300 },
  /** CRÉATIONS RÉELLES de passeport par programme (clé partagée) — compteur
   *  d'OBSERVABILITÉ pur, jamais un refus. Consommé UNIQUEMENT après un retour
   *  `is_new_member = true` de record_loyalty_stamp : un code invalide, un
   *  `too_soon` ou un programme fermé ne le touchent jamais, donc personne ne
   *  peut drainer le « budget d'inscription » des vrais nouveaux clients.
   *  60/10 min = seuil d'alerte (un commerce réel inscrit quelques clients
   *  par heure, une inauguration passe sans rien couper). */
  loyaltyPassportCreationBurst: { limit: 60, windowSeconds: 600 },
  /** CRÉATIONS RÉELLES de passeport par OPÉRATEUR de caisse (organisation +
   *  user.id) — clé non partagée, mais compteur d'observabilité : on alerte,
   *  on n'étrangle pas (un jour d'ouverture inscrit beaucoup de nouveaux
   *  clients, et une caisse bridée est une caisse en panne). Consommé
   *  uniquement sur `is_new_member = true`. Le débit du poste reste borné par
   *  `cashier` (30/60 s), lui fail-closed sur la même clé d'opérateur. */
  loyaltyStaffPassportCreation: { limit: 120, windowSeconds: 3600 },
  /** Seau JUMEAU du précédent : visites de clients DÉJÀ CONNUS servies par le
   *  même opérateur, même fenêtre et même limite. Le rapport entre les deux
   *  clés EST le signal remonté à l'exploitant : une caisse normale voit
   *  surtout des clients connus, une frappe n'inscrit que des inconnus. */
  loyaltyStaffKnownVisit: { limit: 120, windowSeconds: 3600 },
  /** Lecture du code tournant au comptoir par membre et programme — un écran
   *  légitime interroge toutes les quelques secondes ; marge confortable. */
  loyaltyCounter: { limit: 60, windowSeconds: 60 },
  /** PRESSION du parcours public de jackpot par campagne et IP — compteur
   *  d'OBSERVABILITÉ, jamais un refus (miroir loyaltyStampIp).
   *
   *  PRINCIPE (ADR-032) : la jauge du jackpot est une clé PARTAGÉE — la remplir
   *  vite est un OBJECTIF, pas un abus. Aucun seau fail-closed ne porte sur la
   *  campagne, sans quoi un tiers en ferait un interrupteur (« déni de
   *  participation d'un lieu entier »). La borne réelle contre le gonflage est
   *  l'anti-triche (code tournant / staff) + le cooldown + le stock FINI, pas
   *  ce compteur. À 1200/10 min il faut tenir 2 req/s en continu pour l'allumer
   *  : c'est un seuil d'alerte, pas une porte. Ne PAS repasser en `failClosed`. */
  jackpotParticipateIp: { limit: 1200, windowSeconds: 600 },
  /** Participations par JOUEUR (campagne + hash du cookie) — clé propre à UNE
   *  identité, donc `failClosed` légitime : la saturer ne coupe que son
   *  porteur. Le cooldown serveur (min_participation_interval, >= 300 s) reste
   *  la borne métier. */
  jackpotParticipateMember: { limit: 30, windowSeconds: 3600 },
  /** ÉVALUATIONS de code tournant par joueur (campagne + hash du cookie). Clé
   *  d'identité → `failClosed`. Compte les TENTATIVES (prix de l'atomicité) ;
   *  le cooldown en base valant >= 300 s, un joueur n'a jamais besoin de plus
   *  d'un code accepté par fenêtre, 6 laisse la marge des fautes de frappe. */
  jackpotParticipateCodeMember: { limit: 6, windowSeconds: 300 },
  /** Jetons de check-in signés par joueur (mode staff), clé d'identité. Miroir
   *  loyaltyCheckinMember : ~24/h pour une carte laissée ouverte, 120/h laisse
   *  5x de marge tout en bornant une boucle de signature HMAC. */
  jackpotCheckinMember: { limit: 120, windowSeconds: 3600 },
  /** CRÉATIONS RÉELLES de joueur par campagne (clé partagée) — compteur
   *  d'OBSERVABILITÉ pur, jamais un refus. Consommé UNIQUEMENT après un retour
   *  `is_new_player = true` : un code invalide, un `too_soon` ou une campagne
   *  fermée ne le touchent jamais. Contrairement à la fidélité, fabriquer des
   *  joueurs n'a AUCUN rendement ici (un seul gagnant par cycle), ce compteur
   *  n'est donc qu'un signal d'exploitation, pas une défense. */
  jackpotNewPlayerBurst: { limit: 60, windowSeconds: 600 },
  /** CRÉATIONS RÉELLES de joueur par OPÉRATEUR de caisse (organisation +
   *  user.id) — clé non partagée, mais compteur d'observabilité : on alerte, on
   *  n'étrangle pas. Le débit du poste reste borné par `cashier` (fail-closed,
   *  même clé d'opérateur). */
  jackpotStaffPlayerCreation: { limit: 120, windowSeconds: 3600 },
  /** Lecture du code tournant au comptoir par membre et campagne — un écran
   *  légitime interroge toutes les quelques secondes ; marge confortable. */
  jackpotCounter: { limit: 60, windowSeconds: 60 },
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

/**
 * Compteur d'OBSERVABILITÉ sur clé PARTAGÉE : incrémente, signale le
 * dépassement, et ne refuse JAMAIS (le verdict est volontairement ignoré,
 * `rateLimit` est appelé sans `failClosed`).
 *
 * C'est la SEULE forme admise pour une clé partagée entre utilisateurs (IP,
 * programme, organisation) dans un parcours PUBLIC (ADR-032) : un seau
 * `failClosed` sur une telle clé devient un interrupteur qu'un tiers allume en
 * la saturant (« déni de service d'un lieu / d'un programme entier »). Le
 * `failClosed` reste réservé aux clés d'IDENTITÉ (cookie / jeton / gain) ou
 * d'OPÉRATEUR authentifié, résolues AVANT tout seau.
 *
 * Coût d'écriture : une seule ligne par (seau, fenêtre), réutilisée par upsert
 * — contrairement à une insertion par requête. C'est ce qui en fait un premier
 * rempart d'observabilité acceptable là où l'instrumentation ligne-à-ligne ne
 * l'est pas.
 */
export async function observeSharedKey(
  bucket: string,
  rule: RateLimitRule,
  event: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!(await rateLimit(bucket, rule))) {
    reportSecurityEvent(event, {
      ...extra,
      bucket,
      limit: rule.limit,
      window_seconds: rule.windowSeconds,
    });
  }
}
