"use client";

/**
 * CE QUE L'ENREGISTREMENT AUTOMATIQUE DIT DE LUI-MÊME.
 *
 * Trois états, une seule ligne, à côté du bouton :
 *
 *  · au repos — « Enregistrement automatique. » Ce n'est pas décoratif : sans
 *    cette phrase, le bouton reste le seul signal disponible et le commerçant
 *    continue de cliquer, ou pire, n'ose pas quitter la page.
 *  · en attente — la frappe est prise en compte, le départ est imminent.
 *  · BLOQUÉ — la validation refuse. C'est le seul cas qui compte vraiment :
 *    un enregistrement automatique silencieusement inopérant est pire que pas
 *    d'enregistrement automatique du tout, parce qu'on part en croyant son
 *    travail sauvé. Le message dit quoi faire, et il est annoncé.
 *
 * `aria-live="polite"` sur le conteneur et non sur le message : la région doit
 * exister AVANT que le texte y apparaisse, sinon les lecteurs d'écran ne
 * l'annoncent pas. Le ton d'alerte (`role="status"` implicite) suffit ici —
 * rien n'est perdu, la sauvegarde attend simplement un champ.
 */
export function AutoSaveEtat({
  enAttente,
  bloqueParValidation,
  messageBloque = "Non enregistré : un champ est vide ou mal rempli.",
}: {
  enAttente: boolean;
  bloqueParValidation: boolean;
  /** Ce qui manque, dans les mots du bloc concerné. */
  messageBloque?: string;
}) {
  return (
    <span aria-live="polite" className="text-xs font-bold">
      {bloqueParValidation ? (
        <span className="text-amber-800">
          {/* L'emoji est DÉCORATIF : le sens est dans la phrase qui suit, pas
              dans le pictogramme — c'est ce que le scan axe des pages d'atelier
              refuse de lire autrement. */}
          <span aria-hidden>⚠️ </span>
          {messageBloque}
        </span>
      ) : enAttente ? (
        <span className="text-zinc-700">Enregistrement…</span>
      ) : (
        <span className="text-zinc-600">Enregistrement automatique.</span>
      )}
    </span>
  );
}
