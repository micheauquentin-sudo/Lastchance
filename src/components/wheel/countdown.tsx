"use client";

import { useEffect, useState } from "react";

/** Formate un temps restant en libellé court ("2 j 4 h", "35 min"). */
function formatRemaining(msLeft: number): string {
  if (msLeft <= 0) return "maintenant";
  const totalMinutes = Math.ceil(msLeft / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} j`);
  if (hours > 0) parts.push(`${hours} h`);
  if (days === 0 && minutes > 0) parts.push(`${minutes} min`);
  return parts.join(" ") || "moins d'une minute";
}

/** Compte à rebours texte jusqu'à `target` (ISO), rafraîchi chaque minute. */
export function Countdown({ target }: { target: string }) {
  const [label, setLabel] = useState(() =>
    formatRemaining(new Date(target).getTime() - Date.now()),
  );

  useEffect(() => {
    const tick = () =>
      setLabel(formatRemaining(new Date(target).getTime() - Date.now()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [target]);

  return <>{label}</>;
}
