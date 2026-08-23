"use client";

import { useState, useTransition } from "react";
import { tirerTicketOr } from "@/actions/ticket-or";
import { PHRASES_TIRAGE, type EtatTirage } from "@/lib/ticket-or";

/**
 * LE TICKET D'OR, CÔTÉ CLIENT (TKT-1).
 *
 * ── LE TIRAGE EST UN GESTE, JAMAIS UN CHARGEMENT ──
 *
 * Rien ne part au montage. Tirer au chargement aurait fait consommer le ticket
 * par un préchargement de navigateur, un antivirus qui suit les liens, ou un
 * simple retour arrière : le client aurait « joué » sans avoir rien touché, et
 * n'aurait eu aucun moyen de le prouver. Il faut un doigt sur un bouton.
 *
 * ── ET IL NE PART QU'UNE FOIS ──
 *
 * Le bouton disparaît dès le premier envoi. La base refuse de toute façon le
 * second (`deja_tire`, sous verrou de ligne) — mais un bouton qui reste
 * cliquable après un gain invite à recliquer, et le second clic annoncerait
 * « déjà ouvert » à quelqu'un qui vient de gagner.
 */
export function TicketExperience({ code }: { code: string }) {
  const [resultat, setResultat] = useState<EtatTirage | null>(null);
  const [enCours, demarrer] = useTransition();

  function tirer() {
    demarrer(async () => {
      setResultat(await tirerTicketOr(code));
    });
  }

  if (!resultat) {
    return (
      <div className="text-center">
        <p className="text-5xl" aria-hidden>
          🎟️
        </p>
        <h1 className="mt-3 text-2xl font-black text-k-ink">
          Votre Ticket d&apos;Or
        </h1>
        <p className="mt-2 text-sm text-k-body">
          Un tirage, une seule fois. Ce que vous obtenez se retire au comptoir.
        </p>
        <button
          type="button"
          onClick={tirer}
          disabled={enCours}
          className="k-btn-sm mt-6 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-extrabold uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
        >
          {enCours ? "Ouverture…" : "Ouvrir mon ticket"}
        </button>
      </div>
    );
  }

  if (resultat.state !== "ok") {
    return (
      <div className="text-center">
        <p className="text-4xl" aria-hidden>
          🙂
        </p>
        <p className="mt-3 text-sm font-semibold text-k-ink">
          {PHRASES_TIRAGE[resultat.state]}
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-5xl" aria-hidden>
        🎉
      </p>
      <h1 className="mt-3 text-2xl font-black text-k-ink">{resultat.lot}</h1>
      <p className="mt-2 text-sm text-k-body">
        Montrez ce code au comptoir pour le retirer.
      </p>

      {/* LE CODE EN GRAND, ET EN CHIFFRES TABULAIRES : il se lit à voix haute
          par-dessus un comptoir, souvent dans le bruit. */}
      <p className="mt-5 rounded-2xl border-2 border-k-ink bg-white px-4 py-4 font-mono text-xl font-black tracking-widest tabular-nums text-k-ink">
        {resultat.codeRetrait}
      </p>

      <p className="mt-3 text-xs text-k-body">
        {resultat.expireLe
          ? `À retirer avant le ${new Date(resultat.expireLe).toLocaleDateString("fr-FR")}.`
          : "À retirer lors de votre prochain passage."}
      </p>
      <p className="mt-2 text-xs text-k-body">
        Gardez cet écran ou notez le code : il ne sera plus affiché ailleurs.
      </p>
    </div>
  );
}
