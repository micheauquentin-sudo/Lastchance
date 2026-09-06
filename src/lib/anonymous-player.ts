import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { requiredEnv } from "@/lib/env";
import { ensurePlayerDeviceCookie } from "@/lib/player-identity";

const COOKIE_NAME = "lc-anonymous-player";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Empreinte pseudonyme (64 hex) dérivée de l'uuid device — jamais l'uuid brut. */
function deviceKeyFromId(id: string): string {
  return createHash("sha256")
    .update(`${requiredEnv("PLAYER_KEY_SALT")}:anonymous-device:${id}`)
    .digest("hex");
}

/**
 * Identifiant aléatoire de navigateur, sans email, téléphone, nom, IP ou
 * compte. Le cookie est inaccessible à JavaScript et ne sert qu'aux limites
 * de jeu.
 *
 * ── CE QUE CETTE IDENTITÉ TIENT, ET CE QU'ELLE NE TIENT PAS ──
 *
 * Ce pavé disait : « Le joueur peut l'effacer : Turnstile et la limite réseau
 * restent la défense contre l'automatisation distribuée. » La première moitié
 * est vraie, la seconde ne l'est pas, et un audit croisé l'a relevée. On écrit
 * donc ce qui est mesuré, pas ce qui rassure.
 *
 * `play_limit` (daily/weekly/once) est indexée sur `player_key`, elle-même
 * dérivée de CE cookie — que le client contrôle. Il n'est ni signé, ni
 * enregistré côté serveur : toute valeur de forme UUIDv4 est acceptée, et un
 * cookie absent en fait émettre un neuf. L'effacer rend donc une partie.
 *
 * La « limite réseau » invoquée ne rattrape pas cela : le seau `spin:ip` est
 * en OBSERVATION SEULE (`observeSharedKey`), et c'est délibéré (ADR-032) — un
 * seau `failClosed` sur une clé partagée devient un interrupteur qui coupe
 * tout le Wi-Fi d'un commerce. Et les deux seaux qui, eux, refusent
 * (`spin:burst` 1/4 s, `spin` 8/60 s) sont indexés sur `player_key` : ils
 * TOURNENT AVEC LE COOKIE.
 *
 * ── CE QUI A CHANGÉ, ET CE QUE ÇA NE CHANGE PAS ─────────────
 *
 * Le coût d'une rotation était donc de quatre secondes, sans total. Il y a
 * désormais un SECOND seau par IP, celui-là BLOQUANT et à un tout autre ordre
 * de grandeur : `RATE_LIMITS.spinIpPlafond` (1500 tours/min par roue, dérivé
 * de 250 joueurs × 3 tentatives × 2 de marge). Il n'est consommé que sur une
 * IP réellement mesurée et reste fail-open. Le seau d'alerte à 40/min n'a pas
 * bougé : ce sont deux objets distincts.
 *
 * CE QUE CELA NE FERME PAS. `play_limit` n'est toujours PAS fiable : rien
 * n'empêche un joueur d'effacer son cookie et de rejouer, ni deux appareils
 * de compter pour deux. Le plafond rend la rotation COÛTEUSE — il borne le
 * total extractible d'une roue depuis une IP — il ne rend pas l'identité
 * vraie. Et il rouvre partiellement le compromis d'ADR-032, puisqu'il refuse
 * sur une clé partagée : c'est un arbitrage assumé, argumenté au point de
 * déclaration du seau, pas un oubli.
 *
 * Ce qui borne réellement le préjudice n'est pas l'identité, c'est
 * l'ÉCONOMIE : le stock des lots et les poids, tenus en base par
 * `perform_atomic_spin`. Un joueur qui recommence consomme des tours, il ne
 * crée pas de lots.
 *
 * Fermer vraiment cette porte demande un ancrage d'éligibilité que le serveur
 * possède — jeton délivré en caisse, preuve d'achat, compte vérifié. C'est un
 * choix produit, pas une correction : signer le cookie n'y changerait rien,
 * puisqu'on peut toujours le supprimer. Tant que ce choix n'est pas fait, la
 * règle à retenir est simple : NE PAS adosser un lot de valeur unitaire
 * élevée à la seule `play_limit`.
 */
export async function anonymousPlayerKey(): Promise<string> {
  // Migration progressive : le cookie historique reste l'autorité des limites
  // et de la progression, tandis que lc-player prépare l'identité commune.
  await ensurePlayerDeviceCookie();
  const store = await cookies();
  let id = store.get(COOKIE_NAME)?.value;
  if (!id || !UUID_RE.test(id)) {
    id = randomUUID();
    store.set(COOKIE_NAME, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      priority: "high",
    });
  }
  return deviceKeyFromId(id);
}

/**
 * Variante LECTURE SEULE : renvoie l'empreinte device SI le cookie existe déjà,
 * sans jamais le poser. Destinée aux contextes qui ne doivent pas écrire de
 * cookie (rendu RSC d'une page suivable, polling d'état) — l'identité y a déjà
 * été établie par un spin ou une action joueur. Absent/illisible → null.
 */
export async function peekAnonymousPlayerKey(): Promise<string | null> {
  const store = await cookies();
  const id = store.get(COOKIE_NAME)?.value;
  return id && UUID_RE.test(id) ? deviceKeyFromId(id) : null;
}
