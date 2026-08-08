import { AtelierEntree } from "@/components/dashboard/atelier-entree";
import {
  ETAPES_CALENDRIER,
  hrefEtapeCalendrier,
  type EtapeCalendrier,
} from "@/components/dashboard/atelier-calendar-etapes";

/**
 * LA PORTE DE L'ATELIER DU CALENDRIER — la déclinaison calendrier
 * d'`AtelierEntree`.
 *
 * Deux choses lui sont propres et justifient qu'elle existe encore : le
 * compteur « N cases garnies sur M », que la grille ne dit pas, et le bouton
 * qui vise « Les cases » plutôt que la première étape — revenir garnir une
 * case précise est le geste le plus fréquent d'un calendrier.
 */
export function AtelierEntreeCalendrier({
  calendarId,
  garnies,
  vides = 0,
  total,
}: {
  calendarId: string;
  /** Cases complètes ET donnant quelque chose — le chiffre que la grille ne dit pas. */
  garnies: number;
  /** Cases message laissées vides : légales, elles s'ouvrent sur un « pas de chance ». */
  vides?: number;
  total: number;
}) {
  return (
    <AtelierEntree
      etapes={ETAPES_CALENDRIER}
      hrefPour={(cle) => hrefEtapeCalendrier(calendarId, cle as EtapeCalendrier)}
      titre="L'atelier du calendrier"
      cleOuverture="cases"
      sousTitre={
        total > 0 ? (
          <>
            <strong>
              {garnies} case{garnies > 1 ? "s" : ""} garnie
              {garnies > 1 ? "s" : ""} sur {total}
            </strong>
            {vides > 0 && (
              <>
                {" "}
                ({vides} vide{vides > 1 ? "s" : ""}, {vides > 1 ? "elles" : "elle"}{" "}
                s&apos;ouvrira{vides > 1 ? "ont" : ""} sur un « pas de chance »)
              </>
            )}
            . La préparation se fait en trois étapes, chacune s&apos;enregistre
            pour elle-même.
          </>
        ) : (
          <>
            La préparation se fait en trois étapes, chacune s&apos;enregistre
            pour elle-même.
          </>
        )
      }
    />
  );
}
