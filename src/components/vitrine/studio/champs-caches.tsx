import {
  VITRINE_ALLURE_BOOLEENS,
  VITRINE_ALLURE_BORNES,
  VITRINE_ALLURE_CHIFFRES,
  VITRINE_ALLURE_ENUMS,
  VITRINE_ALLURE_ENUMS_CLES,
  type ChampBooleenAllure,
} from "@/lib/vitrine";
import type { EtatStudio } from "@/components/vitrine/studio/etat";
import { resoudreThemeVitrine } from "@/components/vitrine/theme";

/**
 * LA CHARGE UTILE DU STUDIO — rendue EN ENTIER, à chaque rendu (VIT-20).
 *
 * ── C'EST LE SEUL ENDROIT DU STUDIO QUI PORTE UN `name` ──
 *
 * Aucun contrôle visible n'en porte. Les curseurs, les cases et les champs de
 * la colonne de gauche écrivent dans `EtatStudio` ; ce composant traduit cet
 * état en formulaire. La conséquence est celle qu'on cherche : **il n'existe
 * aucun chemin par lequel un champ pourrait manquer**, quelle que soit la page
 * ouverte, parce qu'aucun champ ne dépend d'une page pour exister.
 *
 * C'est la réponse à la moitié CLIENT du défaut de VIT-19. Le serveur ne
 * touche plus une section sans témoin ; il fallait encore garantir qu'un écran
 * multi-pages n'oublie pas la moitié de sa charge en changeant de page.
 *
 * ── LES CINQ TÉMOINS SONT ICI, ET C'EST EXACT ──
 *
 * Le studio règle bien les cinq sections : couleurs, polices, style des
 * fiches, blocs, allure. Il les rend toutes, sur toutes ses pages — parce que
 * ce composant les rend toutes. Un témoin posé alors que la section ne serait
 * pas réglable serait un mensonge au serveur ; ce n'est pas le cas ici, et
 * `studio-charge.test.tsx` le vérifie sur le rendu réel.
 *
 * ── POURQUOI DES `<input type="hidden">` ET NON UN SEUL CHAMP JSON ──
 *
 * `saveVitrineSettings` lit champ par champ, sous les noms de la base. Un
 * unique document JSON aurait été un second format à valider, en plus du
 * schéma zod déjà écrit — et l'écran de réglages, lui, continuerait de poster
 * des champs plats. Deux formats pour une action, c'est la divergence garantie.
 */
export function ChampsCachesStudio({ etat }: { etat: EtatStudio }) {
  // Les vingt-cinq réglages RÉSOLUS : un curseur jamais touché doit partir avec
  // la valeur que le commerçant VOIT, et non vide. `composerAllure` n'écrit que
  // les écarts au défaut ; c'est à lui d'en décider, pas à l'écran de deviner.
  const resolue = resoudreThemeVitrine({ allure: etat.allure }, etat.secteur)
    .allure;

  return (
    <>
      <input type="hidden" name="secteur" value={etat.secteur} />
      <input type="hidden" name="accroche" value={etat.accroche} />
      <input type="hidden" name="histoire" value={etat.histoire} />
      <input type="hidden" name="horaires_texte" value={etat.horaires} />
      <input type="hidden" name="badge_ouverture" value={etat.badge} />

      <input type="hidden" name="couleurs_rendues" value="1" />
      <input type="hidden" name="couleur_primary" value={etat.couleurs.primary} />
      <input
        type="hidden"
        name="couleur_secondary"
        value={etat.couleurs.secondary}
      />

      <input type="hidden" name="polices_rendues" value="1" />
      <input type="hidden" name="police_heading" value={etat.polices.heading} />
      <input type="hidden" name="police_body" value={etat.polices.body} />

      <input type="hidden" name="style_cartes_rendu" value="1" />
      <input type="hidden" name="style_cartes" value={etat.styleCartes} />

      <input type="hidden" name="blocs_rendus" value="1" />
      <input
        type="hidden"
        name="ordre_blocs"
        value={JSON.stringify(etat.blocs)}
      />

      <input type="hidden" name="allure_rendue" value="1" />
      {VITRINE_ALLURE_ENUMS_CLES.map((cle) => (
        <input
          key={cle}
          type="hidden"
          name={cle}
          value={String(etat.allure[cle] ?? VITRINE_ALLURE_ENUMS[cle].defaut)}
        />
      ))}
      {VITRINE_ALLURE_CHIFFRES.map((cle) => (
        <input
          key={cle}
          type="hidden"
          name={cle}
          value={String(etat.allure[cle] ?? VITRINE_ALLURE_BORNES[cle].defaut)}
        />
      ))}
      {/* UNE CASE COCHÉE SE POSTE, UNE DÉCOCHÉE NE SE POSTE PAS — et c'est ce
          que `caseNative` lit. Un champ caché valant « false » serait lu comme
          coché, puisqu'il n'est pas vide : le seul rendu fidèle d'un refus est
          l'ABSENCE du champ. */}
      {VITRINE_ALLURE_BOOLEENS.map((cle) =>
        resolue[NOM_RESOLU[cle]] ? (
          <input key={cle} type="hidden" name={cle} value="1" />
        ) : null,
      )}
    </>
  );
}

/** Le nom résolu (camelCase) de chaque interrupteur, pour lire son état effectif. */
const NOM_RESOLU: Record<
  ChampBooleenAllure,
  keyof ReturnType<typeof resoudreThemeVitrine>["allure"]
> = {
  entete_collant: "enteteCollant",
  capitales: "capitales",
  capitales_desc: "capitalesDesc",
  compte_rubrique: "compteRubrique",
  monogramme: "monogramme",
  favoris: "favoris",
  recherche: "recherche",
};
