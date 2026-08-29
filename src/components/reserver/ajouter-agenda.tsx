"use client";

import { useMemo } from "react";

import {
  contenuIcs,
  ficheIcsDataUri,
  lienGoogleAgenda,
  nomFichierIcs,
  type RendezVousAgenda,
} from "@/lib/agenda-export";

/**
 * « AJOUTER À MON AGENDA » — le geste qui fait qu'un rendez-vous n'est pas
 * oublié (RDV-4).
 *
 * ── DEUX CHEMINS, PARCE QU'UN SEUL LAISSERAIT LA MOITIÉ DES GENS DEHORS ──
 *
 * Le lien Google ne sert qu'aux comptes Google ouverts dans un navigateur. Le
 * `.ics` est le format standard : Apple Calendar, Outlook, Thunderbird et
 * Android l'ouvrent nativement, et c'est le SEUL chemin sur iPhone. N'offrir
 * que Google aurait ignoré la moitié des clients d'un commerce français.
 *
 * ── AUCUN SECRET N'ENTRE DANS L'ÉVÉNEMENT ──
 *
 * Ni le code de retrait, ni l'email, ni aucun identifiant interne. Un fichier
 * d'agenda se synchronise vers des serveurs tiers, se partage et se sauvegarde.
 * L'événement porte le nom du commerce, l'intitulé et l'heure — de quoi se
 * souvenir, jamais de quoi prouver. Le code reste sur l'écran de confirmation
 * et dans l'email, qui sont des canaux adressés.
 *
 * ── LE `.ics` EST FABRIQUÉ DANS LE NAVIGATEUR ──
 *
 * Un `data:` URI évite une route serveur, donc une adresse de plus à protéger
 * pour un contenu que le client a déjà sous les yeux. Le fichier ne quitte
 * jamais son appareil.
 */
export function AjouterAgenda({
  rdv,
  /** Identifiant STABLE de la réservation : deux ajouts mettent à jour le même
   *  événement au lieu d'en créer deux. */
  uid,
  className,
}: {
  rdv: RendezVousAgenda;
  uid: string;
  className?: string;
}) {
  const google = useMemo(() => lienGoogleAgenda(rdv), [rdv]);
  const ics = useMemo(() => {
    // L'horodatage d'émission est lu à la CONSTRUCTION du lien, dans un `useMemo`
    // qui ne dépend que du rendez-vous : il ne rejoue donc pas à chaque rendu,
    // et ne provoque aucun écart d'hydratation puisque ce composant n'est monté
    // qu'après la réservation, côté client.
    const contenu = contenuIcs(rdv, uid, new Date().toISOString());
    return contenu ? ficheIcsDataUri(contenu) : null;
  }, [rdv, uid]);

  // Instants illisibles : on ne peint rien plutôt qu'un bouton mort. Le client
  // a déjà son horaire à l'écran, il ne perd que la commodité.
  if (!google && !ics) return null;

  return (
    <div className={className}>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-k-body">
        Ne l&apos;oubliez pas
      </p>
      <div className="flex flex-wrap gap-2">
        {google && (
          <a
            href={google}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border-2 border-k-ink bg-white px-3.5 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
          >
            <span aria-hidden>📅 </span>Google Agenda
          </a>
        )}
        {ics && (
          <a
            href={ics}
            download={nomFichierIcs(rdv.titre)}
            className="rounded-xl border-2 border-k-ink bg-white px-3.5 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
          >
            <span aria-hidden>🍎 </span>Apple, Outlook…
          </a>
        )}
      </div>
      <p className="mt-2 text-xs text-k-body">
        L&apos;événement porte l&apos;heure et le lieu — votre code de retrait
        reste ici, il n&apos;entre pas dans votre agenda.
      </p>
    </div>
  );
}
