"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { tirerTicketOr } from "@/actions/ticket-or";
import {
  cleMemoireTicket,
  parserTirageMemorise,
  PHRASES_TIRAGE,
  type EtatTirage,
  type TirageGagnant,
} from "@/lib/ticket-or";

/**
 * LE TICKET D'OR, CÔTÉ CLIENT (TKT-1, QR depuis TKT-2).
 *
 * ── LE TIRAGE EST UN GESTE, JAMAIS UN CHARGEMENT ──
 *
 * Rien ne part au montage, et le passage au QR ne change RIEN à cette règle —
 * il l'aiguise. Tirer au chargement aurait fait consommer le ticket par un
 * préchargement de navigateur, un antivirus qui suit les liens, un aperçu de
 * lien dans une messagerie, ou un simple retour arrière : le client aurait
 * « joué » sans avoir rien touché, et n'aurait eu aucun moyen de le prouver.
 * Il faut un doigt sur un bouton.
 *
 * Ce doigt n'est pas une friction : c'est le geste de grattage. Le client
 * scanne, voit un ticket doré, appuie, et sait. Une manipulation, pas dix
 * caractères à taper.
 *
 * ── ET IL NE PART QU'UNE FOIS ──
 *
 * Le bouton disparaît dès le premier envoi. La base refuse de toute façon le
 * second (`deja_tire`, sous verrou de ligne) — mais un bouton qui reste
 * cliquable après un gain invite à recliquer, et le second clic annoncerait
 * « déjà ouvert » à quelqu'un qui vient de gagner.
 *
 * ── LE RÉSULTAT SURVIT À UN RECHARGEMENT ──
 *
 * `tirer_ticket_or` ne rend le lot et le code de retrait QU'UNE FOIS. Sur un
 * parcours au QR, l'écran se perd bien plus facilement qu'au comptoir : on
 * bascule vers ses SMS, l'écran se verrouille, le navigateur de l'appareil
 * photo recharge l'onglet — et le client relisait « ce ticket a déjà été
 * ouvert » alors qu'il venait de gagner. Le gain est mémorisé sur SON appareil
 * (voir `cleMemoireTicket`) : aucun droit nouveau, aucun rejeu, juste de quoi
 * relire ce que le serveur lui a déjà rendu.
 *
 * ── `apercu` : LE STUDIO MONTE CETTE PAGE, ET ELLE NE TIRE RIEN (VIT-45) ──
 *
 * Ce fichier n'importe qu'UNE action, `tirerTicketOr`, et le drapeau la coupe.
 * Ce n'est pas une précaution de confort : `tirer_ticket_or` CONSOMME un lot
 * du stock et grave un retrait au nom du commerce. Un aperçu qui tirerait
 * viderait le stock du commerçant pendant qu'il le règle, et lui rendrait un
 * code de retrait que personne ne viendra chercher.
 *
 * Le drapeau coupe aussi la MÉMOIRE LOCALE, dans les deux sens : le studio ne
 * lit pas le `localStorage` du commerçant — un ticket qu'il aurait ouvert
 * lui-même se rejouerait dans son aperçu — et n'y écrit rien.
 *
 * Ce qu'il montre à la place vient d'`exemple`, calculé par le studio depuis
 * les lots réglés avec le prédicat PARTAGÉ `estLotTirable`. Sans aucun lot
 * tirable, `exemple` vaut `null` et l'aperçu affiche le `sans_lot` que le
 * client verrait vraiment — c'est-à-dire la vérité, et pas une maquette.
 */

/**
 * Lecture MÉMOÏSÉE de la mémoire locale.
 *
 * `useSyncExternalStore` exige un instantané STABLE : relire et re-parser le
 * stockage à chaque rendu produirait un objet neuf à chaque fois, donc une
 * boucle de rendu infinie. Le cache de module tient cette promesse, et
 * `oublier` l'invalide au moment où l'on écrit.
 */
const cacheMemoire = new Map<string, TirageGagnant | null>();

function lireMemoire(code: string): TirageGagnant | null {
  if (cacheMemoire.has(code)) return cacheMemoire.get(code) ?? null;
  let valeur: TirageGagnant | null = null;
  try {
    const brut = window.localStorage.getItem(cleMemoireTicket(code));
    valeur = brut ? parserTirageMemorise(JSON.parse(brut)) : null;
  } catch {
    // Stockage refusé (navigation privée, réglage strict) ou JSON corrompu :
    // on retombe sur le parcours normal, qui reste entièrement fonctionnel.
    valeur = null;
  }
  cacheMemoire.set(code, valeur);
  return valeur;
}

function memoriser(code: string, tirage: TirageGagnant): void {
  cacheMemoire.set(code, tirage);
  try {
    window.localStorage.setItem(cleMemoireTicket(code), JSON.stringify(tirage));
  } catch {
    // Écriture refusée : l'écran affiche déjà le résultat, on ne perd que la
    // relecture après rechargement. Rien à dire au client à cet instant.
  }
}

/**
 * LE CODE DE RETRAIT EST-IL PÉRIMÉ ?
 *
 * `expireLe` est l'`expires_at` de l'émission au registre (`reward_issuances`,
 * posé à now() + 30 jours par `tirer_ticket_or`) — la date limite pour venir
 * chercher le lot, et non celle du ticket. Le registre la juge par rapport au
 * PRÉSENT (`expires_at <= now()`) et le retrait en caisse refuse au-delà :
 * rien n'est ouvert ici, la base a toujours eu le dernier mot.
 *
 * Ce qui manquait, c'est que l'ÉCRAN pose la même question. Il affichait le
 * lot en grand, le code en gros, et « À retirer avant le 12/06 » — date
 * passée — à un client qui rouvrait son QR trois mois plus tard. Il se
 * déplaçait, tendait son téléphone, et se faisait refuser au comptoir avec un
 * écran qui lui donnait raison.
 *
 * Même comparaison que la base, sans tolérance inventée ici : en accorder une
 * ferait promettre à l'écran un retrait que la caisse refuserait — c'est-à-dire
 * exactement le défaut qu'on ferme.
 */
function estPerime(expireLe: string | null): boolean {
  if (!expireLe) return false;
  const limite = Date.parse(expireLe);
  // Date illisible : on ne PÉRIME PAS. Un parseur qui échoue ne doit pas
  // effacer de l'écran un gain valide — la caisse reste seule juge.
  return Number.isFinite(limite) && limite <= Date.now();
}

/** Aucune source externe ne change en cours de vie : abonnement inerte. */
const abonnementVide = () => () => {};

export function TicketExperience({
  code,
  apercu = false,
  exemple = null,
}: {
  code: string;
  /** Monté dans le studio : aucun appel serveur, aucune mémoire locale. */
  apercu?: boolean;
  /** Le gain d'EXEMPLE montré au commerçant. `null` = « rien à gagner ». */
  exemple?: TirageGagnant | null;
}) {
  const memorise = useSyncExternalStore(
    abonnementVide,
    () => (apercu ? null : lireMemoire(code)),
    // Rendu serveur : aucune mémoire. Le bouton s'affiche, puis l'hydratation
    // révèle le gain déjà tiré s'il y en a un.
    () => null,
  );
  const [resultat, setResultat] = useState<EtatTirage | null>(null);
  /** L'aller-retour a échoué SANS verdict du serveur. Distinct d'un refus. */
  const [reseauCoupe, setReseauCoupe] = useState(false);
  const [enCours, demarrer] = useTransition();

  function tirer() {
    if (apercu) {
      // NI APPEL, NI MÉMOIRE. Le résultat est celui que les lots réglés
      // produiraient : un gain d'exemple, ou le refus `sans_lot` — le même
      // que la base rendrait si rien n'était tirable.
      setResultat(exemple ?? { state: "sans_lot" });
      return;
    }
    demarrer(async () => {
      // LA COUPURE RÉSEAU N'EST PAS UN REFUS. Sans ce `catch`, un rejet de la
      // promesse laissait l'écran sur son bouton sans un mot ; et surtout, il
      // faut pouvoir la distinguer d'un verdict du serveur pour décider si la
      // copie locale a le droit de reprendre la main (voir `memoirePrime`).
      let etat: EtatTirage;
      try {
        etat = await tirerTicketOr(code);
      } catch {
        setReseauCoupe(true);
        return;
      }
      setReseauCoupe(false);
      if (etat.state === "ok") memoriser(code, etat);
      setResultat(etat);
    });
  }

  /**
   * QUAND LA COPIE LOCALE A-T-ELLE LE DROIT DE PARLER ?
   *
   * Elle l'avait dès que le serveur répondait AUTRE CHOSE que `ok` — donc
   * aussi sur `expire`, `sans_lot` et `introuvable`, où le serveur a rendu un
   * verdict et où c'est LUI qui a raison.
   *
   * Trois cas, et seulement trois :
   *  · aucun verdict encore demandé (`resultat === null`) — c'est la relecture
   *    après rechargement, la raison d'être de la mémoire ;
   *  · `deja_tire` — le seul refus où la mémoire prime À BON DROIT : c'est le
   *    MÊME ticket, l'un des deux porte le lot, et le serveur ne le rend
   *    qu'une fois ;
   *  · coupure réseau — aucun verdict du tout, on n'efface pas un gain acquis
   *    parce que le réseau de la boutique a lâché.
   *
   * Partout ailleurs, le serveur tranche et la copie locale se tait.
   */
  const memoirePrime =
    resultat === null || resultat.state === "deja_tire" || reseauCoupe;
  const gain: TirageGagnant | null =
    resultat?.state === "ok" ? resultat : memoirePrime ? memorise : null;

  if (gain) {
    return estPerime(gain.expireLe) ? (
      <GainPerime tirage={gain} />
    ) : (
      <Gain tirage={gain} />
    );
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
        {/* RIEN N'A ÉTÉ CONSOMMÉ : la promesse a échoué avant tout verdict. Le
            dire, plutôt que de laisser un bouton muet faire craindre le pire. */}
        {reseauCoupe && (
          <p role="alert" className="mt-3 text-xs font-semibold text-red-600">
            Connexion perdue. Votre ticket n&apos;a pas été ouvert : vérifiez
            votre réseau et réessayez.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-4xl" aria-hidden>
        🙂
      </p>
      <p className="mt-3 text-sm font-semibold text-k-ink">
        {PHRASES_TIRAGE[resultat.state]}
      </p>
      {/* Ce ticket a été ouvert, mais pas sur CET appareil : le client n'a rien
          perdu, son lot est au comptoir. Le dire évite qu'il croie à une panne
          — ou pire, qu'il pense s'être fait voler son gain. */}
      {resultat.state === "deja_tire" ? (
        <p className="mt-2 text-xs text-k-body">
          S&apos;il a été ouvert depuis un autre téléphone ou une navigation
          privée, le lot reste dû : présentez-vous au comptoir, le commerce
          retrouve le retrait.
        </p>
      ) : null}
    </div>
  );
}

/**
 * LE LOT A ÉTÉ GAGNÉ, LE DÉLAI DE RETRAIT EST PASSÉ.
 *
 * Cet écran remplace le `Gain` plein écran, et pas seulement sa dernière
 * ligne : un lot en gros titre avec un code en chiffres tabulaires EST une
 * invitation à se déplacer. Le code reste affiché, en petit et annoncé comme
 * périmé — le commerçant le retrouve dans son registre, et c'est à lui, pas à
 * cette page, de décider d'un geste commercial.
 */
function GainPerime({ tirage }: { tirage: TirageGagnant }) {
  return (
    <div className="text-center">
      <p className="text-4xl" aria-hidden>
        ⌛
      </p>
      <h1 className="mt-3 text-xl font-black text-k-ink">
        Le délai de retrait est passé
      </h1>
      <p className="mt-2 text-sm text-k-body">
        Vous aviez gagné <strong>{tirage.lot}</strong>, à retirer avant le{" "}
        {tirage.expireLe
          ? new Date(tirage.expireLe).toLocaleDateString("fr-FR")
          : ""}
        . Ce code n&apos;est plus accepté en caisse.
      </p>
      <p className="mt-4 text-sm font-semibold text-k-ink">
        Parlez-en au comptoir lors de votre prochain passage : le commerce
        retrouve ce retrait dans son registre, et reste libre de vous faire un
        geste.
      </p>
      <p className="mt-4 font-mono text-xs tracking-widest tabular-nums text-k-body">
        {tirage.codeRetrait} · périmé
      </p>
    </div>
  );
}

function Gain({ tirage }: { tirage: TirageGagnant }) {
  return (
    <div className="text-center">
      <p className="text-5xl" aria-hidden>
        🎉
      </p>
      <h1 className="mt-3 text-2xl font-black text-k-ink">{tirage.lot}</h1>
      <p className="mt-2 text-sm text-k-body">
        Montrez ce code au comptoir pour le retirer.
      </p>

      {/* LE CODE EN GRAND, ET EN CHIFFRES TABULAIRES : il se lit à voix haute
          par-dessus un comptoir, souvent dans le bruit. */}
      <p className="mt-5 rounded-2xl border-2 border-k-ink bg-white px-4 py-4 font-mono text-xl font-black tracking-widest tabular-nums text-k-ink">
        {tirage.codeRetrait}
      </p>

      <p className="mt-3 text-xs text-k-body">
        {tirage.expireLe
          ? `À retirer avant le ${new Date(tirage.expireLe).toLocaleDateString("fr-FR")}.`
          : "À retirer lors de votre prochain passage."}
      </p>
      <p className="mt-2 text-xs text-k-body">
        Cet écran se rouvre sur ce téléphone tant que vous ne videz pas les
        données du navigateur.
      </p>
    </div>
  );
}
