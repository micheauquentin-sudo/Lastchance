import Link from "next/link";

/**
 * Le chemin du client vers ses lots — et vers leur échéance.
 *
 * ── LE DÉFAUT QUE CE LIEN FERME ─────────────────────────────────────
 *
 * `/portefeuille` rassemble les lots des neuf familles, lit leur échéance dans
 * le REGISTRE (`reward_issuances.expires_at`, la source que la caisse applique
 * elle-même) et distingue déjà « À retirer », « expire bientôt » et « Expiré ».
 * Il était complet et **atteignable par personne** : avant ce composant, son
 * adresse n'apparaissait dans aucun fichier du produit sauf le sien. Un client
 * ne pouvait y arriver qu'en la devinant.
 *
 * C'est le motif que ce dépôt s'est déjà reproché plusieurs fois — une
 * capacité livrée sans chemin applicatif pour l'atteindre — pris ici du côté
 * de l'écran plutôt que de la base.
 *
 * ── POURQUOI UN LIEN, ET NON LA DATE SOUS CHAQUE CODE ───────────────
 *
 * Depuis `20260904120000` le commerçant peut donner une échéance aux sept
 * familles qui n'en avaient aucune ; les sept écrans de gain, eux, disent
 * « présentez ce code en caisse » sans parler de délai. La voie évidente était
 * d'écrire la date sous chaque code. Elle est écartée : quatre des sept
 * contextes passent par une RPC `*_public_state` qui ne rend pas la colonne,
 * et surtout la relire ailleurs que dans le registre fabriquerait une seconde
 * source de vérité pour une date que la caisse tranche — le défaut « trois
 * textes se contredisaient sur l'expiration » a déjà été payé ici. Un lien
 * envoie le client là où la date est **déjà** lue au bon endroit.
 *
 * ── LE TON EST NEUTRE, DÉLIBÉRÉMENT ─────────────────────────────────
 *
 * Six écrans vouvoient, le parrainage tutoie. Un libellé sans pronom (« Mes
 * récompenses ») se pose aux sept sans rompre la voix de l'écran qui
 * l'accueille.
 */
export function LienPortefeuille({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/portefeuille"
      className={`inline-flex items-center gap-1.5 text-sm font-bold text-k-ink underline decoration-2 underline-offset-2 hover:text-k-ink/70 ${className}`}
    >
      <span aria-hidden>🎁</span>
      Mes récompenses
      <span className="sr-only"> — retrouver tous mes lots et leur validité</span>
    </Link>
  );
}
