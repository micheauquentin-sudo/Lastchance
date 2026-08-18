"use client";

import { useEffect, useState } from "react";
import { serverClockOffset } from "./event-view-state";

/**
 * Horloge de la soirée live ANCRÉE SUR LE SERVEUR.
 *
 * Rend le décalage (ms) à ajouter à `Date.now()` pour lire l'heure serveur : il
 * est mesuré à chaque réception d'un `serverNow` frais, et n'est réappliqué que
 * si l'écart dépasse la tolérance de cache (`serverClockOffset`). Le chrono
 * garde donc une décrue régulière, calculée localement, sur une borne serveur.
 */
export function useServerClockOffset(serverNow: string | null): number {
  const [offset, setOffset] = useState(() =>
    serverClockOffset(null, serverNow, Date.now()),
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mesure idempotente : l'offset n'est remplacé que si l'écart dépasse la tolérance, sinon la même valeur est rendue (aucun re-rendu).
    setOffset((current) => serverClockOffset(current, serverNow, Date.now()));
  }, [serverNow]);

  return offset;
}
