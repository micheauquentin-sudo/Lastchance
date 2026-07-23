import "server-only";

import { optionalEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";

/**
 * Transport temps réel du Mode événement en direct.
 *
 * ── MODÈLE RETENU ────────────────────────────────────────────────────────
 * PRIMAIRE : POLLING. La fonctionnalité marche SANS Realtime. Les trois
 * interfaces (écran TV, téléphones, télécommande) resynchronisent l'état public
 * en appelant la server action `getEventState` → `event_public_state` (RPC
 * service_role qui applique tout le filtrage de sécurité, notamment le masquage
 * de la bonne réponse hors phase reveal). Un poll léger (~2-3 s) suffit ; c'est
 * le FILET qui fonctionne même si Realtime est indisponible ou non provisionné.
 *
 * OPTIMISATION (activable) : DIFFUSION Supabase Realtime (broadcast). À chaque
 * transition de la machine à états et à chaque réponse qui change les compteurs,
 * le backend (service_role) DIFFUSE sur le canal `event:<session_id>` un simple
 * message « refresh » (un ping horodaté, AUCUN état métier). Les clients abonnés
 * (anon) reçoivent le ping et déclenchent immédiatement un `getEventState` au
 * lieu d'attendre le prochain tick de poll — la latence chute sans changer le
 * chemin d'autorisation.
 *
 * ── POURQUOI ÇA NE FUIT RIEN ─────────────────────────────────────────────
 * 1. Le canal ne transporte QUE des pings « refresh ». La bonne réponse, la
 *    distribution des votes, les scores : RIEN de tout cela ne transite par le
 *    broadcast. Toute donnée métier passe par `event_public_state` (service_role)
 *    qui masque la correction hors reveal. Un abonné qui écoute le canal
 *    n'apprend donc que « quelque chose a changé », jamais QUOI.
 * 2. Un abonné anon n'a AUCUN accès table : la migration révoque tout droit anon
 *    sur les tables event_* (RLS + revoke). S'abonner au canal ne donne pas plus
 *    d'accès qu'un GET public ; il ne peut ni lire is_correct, ni énumérer une
 *    autre session (le topic est l'UUID de session, et même connu il ne porte
 *    que des pings).
 * 3. La diffusion part du service_role via l'API HTTP de Realtime ; les abonnés
 *    ne font que RECEVOIR. Aucun client ne peut publier sur le canal pour
 *    injecter un faux état — et même s'il le pouvait, l'UI ne fait que
 *    re-solliciter `getEventState`, seule source de vérité.
 *
 * Le broadcast est donc une pure OPTIMISATION de latence : on peut le couper
 * (variable d'env ci-dessous) sans rien perdre de la fonctionnalité ni de la
 * sécurité. Il est désactivé par défaut pour ne pas dépendre d'une config
 * Realtime incertaine — activer `EVENTS_REALTIME_ENABLED=1` en production quand
 * le canal broadcast du projet est prêt.
 */

/** Nom du canal Realtime d'une session (topic broadcast). Partagé avec l'UI. */
export function eventChannelName(sessionId: string): string {
  return `event:${sessionId}`;
}

/** Événement broadcast unique : un simple signal de resynchronisation. */
export const EVENT_REALTIME_REFRESH = "refresh";

function realtimeEnabled(): boolean {
  const flag = optionalEnv("EVENTS_REALTIME_ENABLED");
  return flag === "1" || flag === "true";
}

/**
 * Diffuse un ping « refresh » sur le canal de la session (best-effort).
 *
 * NE JETTE JAMAIS et n'attend rien de critique : le polling reste le filet, une
 * diffusion ratée ne casse aucune action. On n'inclut AUCUN état métier dans le
 * payload — seulement un horodatage pour aider l'UI à ignorer les pings périmés.
 *
 * Utilise l'API HTTP de Supabase Realtime (POST /realtime/v1/api/broadcast)
 * authentifiée par la service role key : pas de socket à maintenir depuis une
 * server action serverless.
 */
export async function broadcastEventRefresh(sessionId: string): Promise<void> {
  if (!realtimeEnabled()) return;

  const url = optionalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: eventChannelName(sessionId),
            event: EVENT_REALTIME_REFRESH,
            // AUCUN état métier : un simple signal horodaté (invariant #1).
            payload: { at: Date.now() },
            private: false,
          },
        ],
      }),
      // La diffusion ne doit jamais bloquer l'action : coupe-circuit court.
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      reportError("event.broadcast", `HTTP ${res.status}`);
    }
  } catch (err) {
    // Realtime indisponible / non provisionné : le polling prend le relais.
    reportError("event.broadcast", err);
  }
}
