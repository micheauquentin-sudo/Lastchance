"use client";

/**
 * La purge publique est volontairement best-effort : une création déjà écrite
 * et affichée dans l'éditeur ne doit jamais devenir un échec visible parce que
 * l'ISR ne peut pas être purgée. Sans elle, le cache expire normalement.
 */
export function revaliderVitrineApresCreation(): void {
  void fetch("/api/vitrine/revalidate", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  }).catch(() => undefined);
}
