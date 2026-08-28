"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { invitationPasseport } from "@/actions/loyalty";

/**
 * UN SEUL EXEMPLAIRE PAR PAGE, et ce n'est pas une précaution théorique.
 *
 * L'écran de gain de la roue rend `RedeemCodeScreen` (qui porte la
 * proposition) ET, juste dessous, `ReferralPanel` — dont le code PARRAIN-… la
 * porte aussi. Un filleul qui gagne au tirage voyait donc la même carte deux
 * fois sur un même écran. Le premier composant monté la revendique ; les
 * suivants se taisent et la libèrent en se démontant.
 */
let proprietaire: symbol | null = null;

/** Ce que lisent les sept surfaces d'après-jeu, faute d'une note explicite. */
const NOTE_PAR_DEFAUT =
  "Sans inscription : rien n'est créé tant que vous n'y allez pas.";

/**
 * La proposition de Passeport après un jeu — STRICTEMENT NAVIGATIONNELLE.
 *
 * ── LE DÉFAUT QU'ELLE FERME ─────────────────────────────────────────
 *
 * Un commerçant peut exploiter un Passeport de fidélité ET une roue (ou un
 * quiz, une chasse, un calendrier…) sans que le joueur qui vient de jouer
 * apprenne jamais que le passeport existe : son adresse
 * (`/passeport/<programId>`) n'était atteignable qu'en scannant l'affiche du
 * programme. C'est le motif que ce dépôt s'est déjà reproché — une capacité
 * livrée sans chemin applicatif pour l'atteindre — pris ici juste après le
 * moment où le joueur est le plus disposé à revenir.
 *
 * ── CE QU'ELLE NE FAIT PAS, ET C'EST LE POINT ───────────────────────
 *
 * Elle NE TAMPONNE RIEN. Aucun cookie posé, aucune écriture, aucune création
 * de compte, aucune identité demandée : un lien, et rien d'autre. Le tampon
 * reste un geste explicite du joueur, sur la page du passeport, où le cookie
 * `httpOnly` par programme est posé par le serveur.
 *
 * Conséquence directe sur le LIBELLÉ : ce composant ne peut pas savoir si le
 * joueur possède déjà un passeport chez ce commerçant — le cookie est
 * `httpOnly` et par programme, donc invisible ici, et aller le demander au
 * serveur reviendrait à identifier quelqu'un qui n'a rien demandé. Le texte
 * est donc NEUTRE (« Mon Passeport de fidélité ») : il couvre « créez-en un »
 * et « continuez le vôtre » sans jamais se tromper sur le compte du joueur.
 *
 * ── LE SILENCE EST L'ÉTAT PAR DÉFAUT ────────────────────────────────
 *
 * Tant que l'action n'a pas répondu, rien n'est rendu — pas de squelette, pas
 * de « chargement » : la carte apparaîtrait puis disparaîtrait chez les
 * commerçants sans programme, c'est-à-dire la majorité. Tout refus
 * (module absent, programme désactivé, organisation inconnue, erreur réseau)
 * rend `null` côté action, et donc rien du tout ici. Aucune trace.
 */
export function ProposerPasseport({
  organizationId,
  kermesse = true,
  className = "",
  note = NOTE_PAR_DEFAUT,
}: {
  organizationId: string;
  /** Thème « kermesse » (crème + encre). Faux = surfaces sombres de /play. */
  kermesse?: boolean;
  className?: string;
  /**
   * Bas de carte. Le défaut couvre les surfaces d'APRÈS-JEU, où le joueur
   * vient de gagner et où la seule chose à rassurer est « rien n'est créé
   * sans vous ». Une surface qui n'est pas un écran de gain — le bas d'un
   * calendrier, par exemple — peut avoir besoin de dire QUAND le passeport
   * commence à compter ; c'est ce que cette prop permet, sans réécrire la
   * phrase pour les sept autres appelants.
   */
  note?: string;
}) {
  const [invitation, setInvitation] = useState<{
    programId: string;
    programName: string;
  } | null>(null);
  // `useState` et non `useRef` : l'identité doit être STABLE et lisible au
  // rendu, or lire une ref pendant le rendu est refusé par le lint React.
  const [jeton] = useState(() => Symbol("proposer-passeport"));

  useEffect(() => {
    // Un autre exemplaire tient déjà la place : celui-ci reste muet.
    if (proprietaire !== null && proprietaire !== jeton) return;
    proprietaire = jeton;
    let actif = true;
    void (async () => {
      try {
        const resultat = await invitationPasseport({ organizationId });
        if (actif && resultat) setInvitation(resultat);
      } catch {
        // Un refus et une panne réseau se ressemblent volontairement : dans
        // les deux cas le joueur ne voit rien plutôt qu'une carte morte.
      }
    })();
    return () => {
      actif = false;
      if (proprietaire === jeton) proprietaire = null;
    };
  }, [organizationId, jeton]);

  if (!invitation) return null;

  const carte = kermesse
    ? "k-border bg-white shadow-[4px_4px_0_var(--color-k-ink)]"
    : "border border-white/10 bg-white/5";
  const titre = kermesse ? "text-k-ink" : "text-white";
  const corps = kermesse ? "text-k-body" : "text-zinc-300";
  const lien = kermesse
    ? "border-2 border-k-ink bg-k-yellow text-k-ink hover:bg-k-yellow/70"
    : "border border-white/20 bg-white text-zinc-900 hover:bg-white/90";

  return (
    <section
      aria-labelledby="proposer-passeport-titre"
      className={`play-in mt-6 w-full rounded-2xl p-4 text-left sm:p-5 ${carte} ${className}`}
    >
      <h3
        id="proposer-passeport-titre"
        className={`text-base font-black ${titre}`}
      >
        <span aria-hidden>🎟️</span> Passeport de fidélité
      </h3>
      {/* LE NOM DU PROGRAMME N'EST PLUS LE SUJET D'UN VERBE.

          La phrase était « {nom} récompense les visites régulières ». Elle
          ne tient que si le nom est un nom propre : un programme appelé
          « café » donnait « café récompense les visites régulières », sans
          article ni majuscule. Le commerçant nomme son programme comme il
          veut, et l'écran ne peut rien supposer de sa forme grammaticale.

          Il devient donc une ÉTIQUETTE, sur sa propre ligne, et la phrase
          se tient toute seule. */}
      <p className={`mt-1 text-sm font-black ${titre}`}>
        {invitation.programName}
      </p>
      <p className={`mt-0.5 text-sm font-bold ${corps}`}>
        Chaque passage vous rapproche d&apos;un cadeau.
      </p>
      <p className="mt-3">
        <Link
          href={`/passeport/${invitation.programId}`}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${lien}`}
        >
          Mon Passeport de fidélité
        </Link>
      </p>
      <p className={`mt-2 text-xs ${corps}`}>{note}</p>
    </section>
  );
}
