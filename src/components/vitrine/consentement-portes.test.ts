import { describe, expect, it } from "vitest";
import { resoudreThemeVitrine } from "@/components/vitrine/theme";
import { VITRINE_JEUX, VITRINE_JEUX_DEFAUTS } from "@/lib/vitrine";

/**
 * UNE PORTE PUBLIQUE NE S'OUVRE PAS PARCE QU'UNE VERSION A CHANGÉ (VIT-33).
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME, ET IL ÉTAIT EN PRODUCTION ──
 *
 * VIT-32 a ajouté la porte du passeport de fidélité et élargi `theme.jeux` de
 * deux à six clés. Le repli valait `?? true` pour toutes — traduction de
 * l'invariant d'ADR-129, « ce qui n'a pas été décidé garde le comportement
 * d'hier ».
 *
 * La traduction était juste pour cinq clés et fausse pour la sixième. `quiz`,
 * `calendars`, `pronostics`, `duo` et `bande` étaient PEINTS la veille : `true`
 * les conserve. `loyalty` n'avait AUCUNE porte publique la veille : `true` ne
 * conserve rien, il AJOUTE.
 *
 * Résultat mesuré sur la vitrine du propriétaire, en ligne : deux liens
 * `/passeport/{id}` publiés sans que personne les ait demandés, sur une page
 * indexable. Rien de secret n'est sorti — le nom d'un programme est déjà rendu
 * au client sur trois surfaces — mais l'identifiant est devenu ÉNUMÉRABLE,
 * alors qu'il s'obtenait en scannant un QR au comptoir.
 *
 * ── POURQUOI AUCUNE GARDE NE L'A VU ──
 *
 * Les tests de VIT-32 vérifiaient que la porte suit son DROIT — fermée sans,
 * ouverte avec — et ils passaient. Personne ne testait le CONSENTEMENT, qui est
 * une autre question : le commerçant a le droit, mais l'a-t-il demandé ?
 *
 * VIT-3 avait pourtant posé l'invariant en toutes lettres, et
 * `activerExperiencesVitrine` le répète encore : « les portes publiques restent
 * volontairement masquées tant que le commerçant n'a rien demandé ». Il était
 * écrit, pas gardé.
 */
describe("consentement des portes — une porte neuve naît FERMÉE", () => {
  it("le passeport ne paraît PAS sur une vitrine qui n'a rien demandé", () => {
    // Le cas exact rencontré en production : un thème dont `jeux` est absent,
    // sur un commerce qui a le droit et un programme actif.
    const resolu = resoudreThemeVitrine({ ordre_blocs: ["experiences"] });

    expect(
      resolu.jeux.loyalty,
      "la porte du passeport s'ouvre alors que personne ne l'a demandée",
    ).toBe(false);
  });

  it("les cinq jeux qui EXISTAIENT restent peints, eux", () => {
    // La moitié symétrique, et elle compte autant : refermer les cinq autres
    // aurait retiré en silence des portes que des vitrines publiées montrent
    // depuis des semaines. C'est le même défaut, dans l'autre sens.
    const resolu = resoudreThemeVitrine({ ordre_blocs: ["experiences"] });

    for (const cle of ["duo", "bande", "quiz", "calendars", "pronostics"] as const) {
      expect(resolu.jeux[cle], `la porte ${cle} a été refermée en silence`).toBe(
        true,
      );
    }
  });

  it("un choix EXPLICITE l'emporte, dans les deux sens", () => {
    // Sans cela, la garde du dessus serait satisfaite par un code qui ignore
    // simplement ce que le commerçant coche.
    const allume = resoudreThemeVitrine({ jeux: { loyalty: true } });
    expect(allume.jeux.loyalty).toBe(true);

    const eteint = resoudreThemeVitrine({ jeux: { duo: false } });
    expect(eteint.jeux.duo).toBe(false);
  });

  it("chaque mot du vocabulaire a un défaut déclaré", () => {
    // La table et le vocabulaire ne peuvent pas diverger : un septième jeu
    // ajouté sans sa ligne ici résoudrait à `undefined`, donc à « faux » au
    // premier test de vérité — masqué partout, en silence. Et l'oubli inverse,
    // une ligne pour un mot retiré, laisserait une clé morte que personne ne
    // relit.
    expect(Object.keys(VITRINE_JEUX_DEFAUTS).sort()).toEqual(
      [...VITRINE_JEUX].sort(),
    );
  });
});
