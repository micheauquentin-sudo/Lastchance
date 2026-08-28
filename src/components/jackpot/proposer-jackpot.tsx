"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { invitationJackpot } from "@/actions/jackpot";

/**
 * LA PROPOSITION DE REJOINDRE LE JACKPOT COLLECTIF — STRICTEMENT
 * NAVIGATIONNELLE, calque de `ProposerPasseport`.
 *
 * ── LE DÉFAUT QU'ELLE FERME ─────────────────────────────────────────
 *
 * Un commerçant peut faire tourner un jackpot collectif ET un calendrier sans
 * que le client qui ouvre sa case apprenne jamais que la jauge existe : son
 * adresse n'était atteignable qu'en scannant l'affiche du jackpot. C'est le
 * motif que ce dépôt s'est déjà reproché — une capacité livrée sans chemin
 * applicatif pour l'atteindre —, et il coûte ici plus cher qu'ailleurs : un
 * jackpot COLLECTIF est le seul module dont la valeur croît avec le nombre de
 * participants. Le priver de portes, c'est le priver de ce qui le fait marcher.
 *
 * ── CE QU'ELLE NE FAIT PAS, ET C'EST LE POINT ───────────────────────
 *
 * Elle NE FAIT PARTICIPER PERSONNE. Aucun cookie posé, aucune écriture, la
 * jauge ne bouge pas d'un cran. Un lien, et rien d'autre : la participation
 * reste un geste explicite sur la page du jackpot, où elle exige toujours le
 * code tournant ou la validation en caisse. Rejoindre par ce chemin ne
 * contourne RIEN de l'anti-triche.
 *
 * Conséquence sur le LIBELLÉ : ce composant ne peut pas savoir si le visiteur
 * participe déjà (le cookie est `httpOnly` et par campagne, donc invisible
 * ici). « Rejoindre le jackpot » est donc NEUTRE au sens qui compte : il couvre
 * « découvrez-le » comme « retrouvez la jauge que vous suivez », et ne prétend
 * jamais savoir laquelle des deux est vraie. Un « Continuer », lui, aurait
 * affirmé quelque chose sur le compte du visiteur.
 *
 * ── LE SILENCE EST L'ÉTAT PAR DÉFAUT ────────────────────────────────
 *
 * Tant que l'action n'a pas répondu, rien n'est rendu — pas de squelette, pas
 * de « chargement » : la carte apparaîtrait puis disparaîtrait chez les
 * commerçants sans jackpot, c'est-à-dire la majorité. Tout refus (module
 * absent, campagne inactive, organisation inconnue, panne réseau) rend `null`
 * côté action, et donc rien du tout ici.
 */
export function ProposerJackpot({
  organizationId,
  kermesse = true,
  className = "",
}: {
  organizationId: string;
  /** Thème « kermesse » (crème + encre). Faux = surfaces sombres de /play. */
  kermesse?: boolean;
  className?: string;
}) {
  const [invitation, setInvitation] = useState<{
    publicSlug: string;
    campaignName: string;
  } | null>(null);

  useEffect(() => {
    let actif = true;
    void (async () => {
      try {
        const resultat = await invitationJackpot({ organizationId });
        if (actif && resultat) setInvitation(resultat);
      } catch {
        // Un refus et une panne réseau se ressemblent volontairement : dans
        // les deux cas le visiteur ne voit rien plutôt qu'une carte morte.
      }
    })();
    return () => {
      actif = false;
    };
  }, [organizationId]);

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
      aria-labelledby="proposer-jackpot-titre"
      className={`play-in mt-6 w-full rounded-2xl p-4 text-left sm:p-5 ${carte} ${className}`}
    >
      <h3 id="proposer-jackpot-titre" className={`text-base font-black ${titre}`}>
        <span aria-hidden>🎰</span> Jackpot collectif
      </h3>
      <p className={`mt-1 text-sm font-bold ${corps}`}>
        {invitation.campaignName} monte à chaque passage — celui de tout le
        monde. Rejoignez la cagnotte et suivez la jauge en direct.
      </p>
      <p className="mt-3">
        <Link
          href={`/jackpot/${invitation.publicSlug}`}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${lien}`}
        >
          Rejoindre le jackpot
        </Link>
      </p>
      <p className={`mt-2 text-xs ${corps}`}>
        Sans inscription : le lien ouvre la page, il ne vous fait participer à
        rien.
      </p>
    </section>
  );
}
