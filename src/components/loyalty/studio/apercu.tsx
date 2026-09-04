"use client";

import { useMemo } from "react";
import { CadreApercu } from "@/components/studio/cadre-apercu";
import { PlayerPageShell } from "@/components/ui/player-page-shell";
import {
  BoutiquePaliers,
  EntetePasseport,
  SoldePanel,
  TierPanel,
} from "@/components/loyalty/loyalty-passport";
import {
  loyaltyPointsGoal,
  loyaltyTierProgress,
} from "@/components/loyalty/loyalty-passport-state";
import type { LoyaltyMilestoneView } from "@/lib/loyalty-context";
import type { EtatFidelite } from "@/components/loyalty/studio/etat";

/**
 * L'APERÇU DU PASSEPORT — ET C'EST LA VRAIE CARTE, PAS UNE MAQUETTE (VIT-42).
 *
 * ── L'ARBITRAGE, ET IL EST ÉCRIT ICI PARCE QU'IL A ÉTÉ PRIS ICI ──
 *
 * `ApercuPasseport` (src/components/dashboard/apercu-passeport.tsx) existait
 * déjà, pur et sans appel serveur — mais c'est une MAQUETTE : un solde fictif
 * de « 42 points » et une jauge aux deux tiers, dessinés à la main. Elle
 * répondait à la question de l'atelier (« cette image laisse-t-elle lire un
 * chiffre ? ») et à aucune autre. Elle ne montre ni les niveaux, ni les prix
 * des cadeaux, ni ce qu'un client lit vraiment en arrivant.
 *
 * Le studio se règle EN REGARDANT, et un aperçu qui n'est pas la vraie page est
 * le seul défaut de cette famille qui ne se voit pas : rien ne casse, tout a
 * l'air de fonctionner, et l'écart ne se découvre qu'en ouvrant la page réelle
 * (ADR-152). On monte donc les VRAIS blocs — `EntetePasseport`, `SoldePanel`,
 * `TierPanel`, `BoutiquePaliers` — dans le VRAI `PlayerPageShell`, avec le même
 * `pageStyle` et le même fond que `/passeport/[programId]`.
 *
 * Le composant joueur entier (`LoyaltyPassport`) n'était PAS montable tel quel,
 * et la liste de ce qu'il importe le dit : `stampLoyaltyVisit`,
 * `getLoyaltyCheckinToken`, `spendLoyaltyPoints`, `obtenirCodeParrainage`,
 * `reclamerParrainagePasseport`, plus Turnstile et un état construit côté
 * serveur (`LoyaltyPassportState`, `LoyaltyCommerceView`, le fuseau, les roues
 * préchargées). Le monter aurait fait entrer tout le parcours joueur dans un
 * écran de réglages. Les quatre blocs, eux, se composent sans une ligne
 * d'adaptation — trois sont des fonctions pures de leurs props, et le quatrième
 * n'a qu'un chemin serveur, coupé par `apercu`.
 *
 * ── L'ÉTAT MONTRÉ EST CELUI D'UN CLIENT QUI ARRIVE, ET RIEN N'EST INVENTÉ ──
 *
 * Zéro point, zéro visite, niveau bronze, aucune carte ouverte : c'est
 * EXACTEMENT l'écran du premier scan, celui que tous les clients voient avant
 * tous les autres. Aucun chiffre n'est fabriqué pour faire joli — un solde
 * d'exemple aurait été une seconde maquette, et le commerçant aurait réglé ses
 * seuils sur un client qui n'existe pas.
 *
 * Ce que cet état montre est justement ce qui se règle à gauche : la distance
 * jusqu'au premier cadeau (donc les prix), la distance jusqu'au niveau argent
 * (donc les seuils), et la lisibilité de tout cela sur le fond choisi.
 *
 * ── CE QUI N'EST PAS DANS LE CADRE, ET POURQUOI ON NE L'A PAS DESSINÉ ──
 *
 * 1. LA ZONE DE VALIDATION (saisie du code au comptoir, ou QR de caisse). Les
 *    deux composants appellent le serveur à l'affichage même :
 *    `RotatingStampForm` monte Turnstile, `StaffPassportCard` demande un jeton
 *    de check-in signé. Un aperçu qui réclame un jeton de caisse depuis le
 *    tableau de bord n'est pas un aperçu, c'est un second parcours joueur.
 * 2. LES RÉCOMPENSES GAGNÉES, LE PARRAINAGE, LE POT COMMUN, LE PIED DE CARTE.
 *    Aucun n'a de contenu sur une carte qui vient de s'ouvrir : les dessiner
 *    « pour montrer » aurait été inventer ce que le module n'affiche pas.
 *
 * En redessiner des copies aurait été pire que de les omettre : deux écrans à
 * tenir d'accord, et un aperçu qui se met à mentir dès que l'un des deux bouge.
 */
export function ApercuPasseportStudio({
  programId,
  etat,
  paliers,
  organizationName,
  logoUrl,
}: {
  programId: string;
  etat: EtatFidelite;
  /** Les paliers en base, dans la vue exacte de la page publique. */
  paliers: LoyaltyMilestoneView[];
  organizationName: string;
  logoUrl: string | null;
}) {
  /**
   * LES SEUILS VIENNENT DE LA SAISIE EN COURS, PAS DE LA BASE — c'est tout
   * l'intérêt du cadre : régler « argent à 800 points » doit déplacer la jauge
   * sous les yeux du commerçant, avant tout enregistrement.
   *
   * La saisie est BRUTE (elle peut être vide le temps de retaper) :
   * `loyaltyTierProgress` reçoit donc un nombre lisible ou zéro, jamais un
   * `NaN` qui rendrait une jauge à `width: NaN%` — c'est-à-dire un aperçu cassé
   * pendant la frappe.
   */
  const nombre = (brut: string) => {
    const n = Number.parseInt(brut, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const progression = useMemo(
    () =>
      loyaltyTierProgress(
        0,
        nombre(etat.silver_threshold),
        nombre(etat.gold_threshold),
        "bronze",
      ),
    [etat.silver_threshold, etat.gold_threshold],
  );

  const objectif = useMemo(
    () => loyaltyPointsGoal(0, paliers.map((p) => p.costPoints)),
    [paliers],
  );

  return (
    <CadreApercu
      /* 448 px, ET CE N'EST PAS UN CHOIX D'ESTHÉTIQUE : c'est `max-w-md`, la
         borne que `LoyaltyPassport` pose sur son propre conteneur. Un cadre
         plus large rendrait une mise en page que personne ne verra. La valeur
         reste LITTÉRALE — Tailwind ne compile pas une classe construite à
         l'exécution. */
      classeCadre="w-full max-w-[448px]"
      legende="Aperçu — la vraie carte de vos clients. Vos modifications s'enregistrent toutes seules."
      banniere={
        <p
          role="status"
          className="w-full max-w-[448px] shrink-0 rounded-xl border-2 border-dashed border-k-ink/40 bg-k-yellow/40 px-3 py-2 text-xs font-black text-k-ink"
        >
          Aperçu d&apos;une carte qui vient de s&apos;ouvrir : zéro point, zéro
          visite. Échanger un cadeau ne fait rien ici. La zone où le client
          valide sa visite n&apos;est pas montrée — elle a besoin de la caisse.
        </p>
      }
    >
      <PlayerPageShell
        /* LES MÊMES DEUX VALEURS QUE LA PAGE PUBLIQUE : le passeport est peint
           sur le crème du site, et le voile du fond suit cette surface. */
        pageStyle={{ backgroundColor: "var(--color-k-bg)" }}
        fond={etat.fond || null}
      >
        <div className="mx-auto max-w-md px-4 py-8">
          <EntetePasseport
            logoUrl={logoUrl}
            organizationName={organizationName}
            programName={etat.name}
          />
          <SoldePanel pointsBalance={0} visitCount={0} goal={objectif} />
          <TierPanel tier="bronze" pointsEarnedTotal={0} progress={progression} />
          <BoutiquePaliers
            apercu
            programId={programId}
            milestones={paliers}
            pointsBalance={0}
            /* Une carte qui vient de s'ouvrir n'en est pas une : le module
               invite alors à valider une première visite, et c'est ce que le
               commerçant doit voir. */
            hasPassport={false}
            onEchange={() => {}}
          />
        </div>
      </PlayerPageShell>
    </CadreApercu>
  );
}
