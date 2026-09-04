"use client";

import { CadreApercu } from "@/components/studio/cadre-apercu";
import {
  ConsigneCagnotte,
  EnteteCagnotte,
  GaugePanel,
  MerchantContent,
} from "@/components/jackpot/jackpot-tracker";
import type { EtatCagnotte } from "@/components/jackpot/studio/etat";
import { zonedDateTimeToIso } from "@/lib/date-time";

/**
 * L'APERÇU DE LA CAGNOTTE — ET C'EST LA VRAIE PAGE, PAS UNE MAQUETTE (VIT-44).
 *
 * ── CE QUI EST MONTÉ, ET POURQUOI CE SONT LES VRAIS BLOCS ──
 *
 * `JackpotTracker` n'était PAS montable tel quel, et la raison est mécanique :
 * il lance un `setInterval` sur `getJackpotState` dès son montage, et
 * `participateJackpot` au clic. Un aperçu qui interroge la jauge en boucle
 * depuis le tableau de bord n'est pas un aperçu, c'est un second parcours
 * joueur — avec ses écritures.
 *
 * La coupe a été faite là où elle est VÉRIFIABLE plutôt que plausible : les
 * TROIS actions importées par le module (`getJackpotState`,
 * `participateJackpot`, `getJackpotCheckinToken`) vivent toutes dans le
 * composant racine et dans `StaffCheckinCard`. Les quatre blocs montés ici —
 * l'en-tête, la consigne, la jauge et le contenu commerçant — n'en touchent
 * AUCUNE : ce sont des fonctions de leurs props, et rien d'autre. C'est pour
 * cela qu'ils sont exportés plutôt que recopiés, et qu'aucun drapeau `apercu`
 * n'est nécessaire : il n'y a aucun chemin serveur à couper.
 *
 * ── L'ÉTAT MONTRÉ EST CELUI D'UNE CAGNOTTE QUI OUVRE, ET RIEN N'EST INVENTÉ ──
 *
 * Zéro participation, premier cycle, aucun lot parti : c'est EXACTEMENT l'écran
 * du tout premier client, celui que tous les autres voient avant tous les
 * autres. Le montant affiché est donc le montant de DÉPART — celui que règle
 * l'étape « Le montant qui s'affiche », à gauche — et non un chiffre gonflé
 * pour faire joli. Un compteur d'exemple aurait été une seconde maquette, et le
 * commerçant aurait réglé son incrément sur une cagnotte qui n'existe pas.
 *
 * Ce que cet état montre est justement ce qui se règle à gauche : la hauteur du
 * montant de départ, la distance jusqu'à l'objectif, la lisibilité du lot, et
 * la phrase qui explique le geste — laquelle dépend du mode de participation.
 *
 * ── CE QUI N'EST PAS DANS LE CADRE, ET POURQUOI ON NE L'A PAS DESSINÉ ──
 *
 * 1. LA ZONE DE PARTICIPATION (saisie du code au comptoir, ou QR de caisse).
 *    `RotatingParticipateForm` monte Turnstile et poste `participateJackpot` ;
 *    `StaffCheckinCard` demande un jeton de check-in signé à l'affichage même.
 *    Les deux sont annoncés absents dans la bannière, plutôt que remplacés par
 *    un dessin qui mentirait sur ce que le client peut faire.
 * 2. LE BANDEAU RAYÉ de tête, qui appartient à la coquille de la page publique
 *    (`Shell`, local à `app/(player)/jackpot/[id]/page.tsx`). Il est identique
 *    sur tout le parcours joueur et rien du studio ne le change : le recopier
 *    ici en aurait fait une seconde vérité pour douze pixels de décor.
 * 3. LES GAINS DU JOUEUR et l'écran de résultat d'un tirage à date. Aucun n'a
 *    de contenu sur une cagnotte qui vient d'ouvrir : les dessiner « pour
 *    montrer » aurait été inventer ce que le module n'affiche pas.
 *
 * En redessiner des copies aurait été pire que de les omettre : deux écrans à
 * tenir d'accord, et un aperçu qui se met à mentir dès que l'un des deux bouge.
 */
export function ApercuCagnotteStudio({
  etat,
  organizationName,
  logoUrl,
  timeZone,
}: {
  etat: EtatCagnotte;
  organizationName: string;
  logoUrl: string | null;
  /** Fuseau de l'établissement — la date de tirage s'y saisit en heure civile. */
  timeZone: string;
}) {
  /**
   * LES CHIFFRES VIENNENT DE LA SAISIE EN COURS, PAS DE LA BASE — c'est tout
   * l'intérêt du cadre : régler « objectif 200 » doit déplacer la jauge sous
   * les yeux du commerçant, avant tout enregistrement.
   *
   * Les saisies sont BRUTES (elles peuvent être vides le temps de retaper) :
   * `GaugePanel` reçoit donc un nombre lisible ou un repli, jamais un `NaN` qui
   * rendrait une jauge à `width: NaN%` — c'est-à-dire un aperçu cassé pendant
   * la frappe. L'objectif retombe sur 1 et non sur 0, parce que la vraie page
   * ne peut pas afficher « 0 / 0 » : le schéma refuse un objectif inférieur à 1.
   */
  const entier = (brut: string, repli: number) => {
    const n = Number.parseInt(brut, 10);
    return Number.isFinite(n) && n > 0 ? n : repli;
  };
  const centimes = (brut: string) => {
    const n = Number(brut.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  };

  /**
   * La date saisie est CIVILE ; la jauge attend un instant ISO, comme celui que
   * l'action grave en base. On fait donc la MÊME conversion que
   * `updateJackpotCampaign`, par la MÊME fonction — sans quoi l'aperçu
   * annoncerait un rendez-vous décalé d'une à douze heures selon le fuseau.
   * Une saisie incomplète lève : elle vaut « pas encore de date », pas un écran
   * en erreur.
   */
  let drawAt: string | null = null;
  if (etat.draw_mode === "date_draw" && etat.draw_at) {
    try {
      drawAt = zonedDateTimeToIso(etat.draw_at, timeZone);
    } catch {
      drawAt = null;
    }
  }

  return (
    <CadreApercu
      /* 448 px, ET CE N'EST PAS UN CHOIX D'ESTHÉTIQUE : c'est `max-w-md`, la
         borne que `JackpotTracker` pose sur son propre conteneur. Un cadre plus
         large rendrait une mise en page que personne ne verra. La valeur reste
         LITTÉRALE — Tailwind ne compile pas une classe construite à
         l'exécution. */
      classeCadre="w-full max-w-[448px]"
      legende="Aperçu — la vraie page de vos clients. Vos modifications s'enregistrent toutes seules."
      banniere={
        <p
          role="status"
          className="w-full max-w-[448px] shrink-0 rounded-xl border-2 border-dashed border-k-ink/40 bg-k-yellow/40 px-3 py-2 text-xs font-black text-k-ink"
        >
          Aperçu d&apos;une cagnotte qui vient d&apos;ouvrir : zéro
          participation, montant de départ. La zone où le client participe
          n&apos;est pas montrée — elle a besoin du comptoir ou de la caisse.
        </p>
      }
    >
      <div className="bg-k-bg">
        <div className="mx-auto max-w-md px-4 py-8">
          <EnteteCagnotte
            logoUrl={logoUrl}
            organizationName={organizationName}
            campaignName={etat.name}
          />
          <ConsigneCagnotte
            validationMode={etat.validation_mode}
            threshold={entier(etat.threshold, 1)}
          />
          <GaugePanel
            currentCount={0}
            threshold={entier(etat.threshold, 1)}
            displayAmountCents={centimes(etat.display_base)}
            /* Premier cycle : `GaugePanel` n'affiche « Cagnotte n°2 » qu'à
               partir du deuxième, et une cagnotte qui ouvre en est au premier. */
            cycle={1}
            drawMode={etat.draw_mode}
            drawAt={drawAt}
            /* Un tirage à date déjà FAIT et des lots ÉPUISÉS sont deux états de
               fin de vie : les montrer sur l'écran de préparation ferait lire au
               commerçant une cagnotte close pendant qu'il la prépare. */
            drawDone={false}
            soldOut={false}
            rewardLabel={etat.reward_label}
            rewardDetails={etat.reward_details || null}
          />
          <MerchantContent content={etat.merchant_content || null} />
        </div>
      </div>
    </CadreApercu>
  );
}
