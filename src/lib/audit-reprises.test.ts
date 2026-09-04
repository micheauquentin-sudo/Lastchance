import { describe, expect, it } from "vitest";

// Script de CI en JavaScript pur : TypeScript le résout par inférence depuis
// le `.mjs`, sans déclaration à maintenir.
import {
  estUnePanne,
  verdict,
  REPRISES,
} from "../../scripts/audit-avec-reprises.mjs";

/**
 * LA GARDE DE LA GARDE.
 *
 * `npm audit` sort en 1 pour deux raisons que rien ne sépare : une
 * vulnérabilité trouvée, ou un service injoignable. Le script de CI tranche —
 * et c'est exactement le genre de code qu'on écrit une fois, qu'on ne relit
 * jamais, et dont une inversion de condition passerait inaperçue pendant des
 * mois : il laisserait alors filer une VRAIE alerte en la prenant pour une
 * panne du réseau.
 *
 * Ce fichier vérifie la seule chose qui compte : de quel côté chaque sortie
 * tombe. Il ne touche pas au réseau — une garde dont le test dépendrait du
 * service qu'elle surveille ne prouverait rien le jour où ce service tombe.
 */

/** Les trois symptômes RÉELS observés le 2026-09-04, recopiés tels quels. */
const PANNES_OBSERVEES = [
  "npm warn audit 400 Bad Request - POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk\n{ statusCode: 400, error: 'Bad Request', message: 'Invalid package tree, run npm install to rebuild your package-lock.json' }\nnpm error audit endpoint returned an error",
  "{ error: 'Service Unavailable' }\nnpm error audit endpoint returned an error",
  "npm warn audit network timeout at: https://registry.npmjs.org/-/npm/v1/security/advisories/bulk\nnpm error audit endpoint returned an error",
];

/** Un vrai rapport de vulnérabilité — celui de `fflate`, mot pour mot. */
const RAPPORT_VULNERABILITE = `# npm audit report

fflate  0.4.5 - 0.4.8
Severity: moderate
fflate unzipSync can enter an infinite loop when parsing malformed ZIP64 archives - https://github.com/advisories/GHSA-px8p-9vwx-vf98
fix available via \`npm audit fix\`
node_modules/fflate

1 moderate severity vulnerability`;

describe("audit de CI — panne du service contre vulnérabilité", () => {
  it("reconnaît les trois symptômes observés pendant la panne", () => {
    for (const sortie of PANNES_OBSERVEES) {
      expect(estUnePanne(sortie), sortie.slice(0, 60)).toBe(true);
    }
  });

  it("ne prend PAS un rapport de vulnérabilité pour une panne", () => {
    // L'inversion qui compte : si cette assertion tombe, une alerte réelle
    // serait rejouée trois fois puis annoncée comme « service injoignable ».
    expect(estUnePanne(RAPPORT_VULNERABILITE)).toBe(false);
  });

  it("un audit propre passe, quel que soit l'essai", () => {
    expect(verdict({ code: 0, sortie: "found 0 vulnerabilities", essai: 1 })).toBe(
      "propre",
    );
    expect(
      verdict({ code: 0, sortie: "found 0 vulnerabilities", essai: REPRISES }),
    ).toBe("propre");
  });

  it("une vulnérabilité échoue TOUT DE SUITE, sans reprise", () => {
    // Rejouer une commande qui a correctement répondu « il y a un problème »
    // ne ferait que retarder la mauvaise nouvelle.
    for (let essai = 1; essai <= REPRISES; essai++) {
      expect(verdict({ code: 1, sortie: RAPPORT_VULNERABILITE, essai })).toBe(
        "vulnerabilite",
      );
    }
  });

  it("une panne se rejoue, puis échoue en le DISANT", () => {
    for (const sortie of PANNES_OBSERVEES) {
      expect(verdict({ code: 1, sortie, essai: 1 })).toBe("reprendre");
      expect(verdict({ code: 1, sortie, essai: REPRISES - 1 })).toBe("reprendre");
      // Après la dernière tentative, on n'invente pas un succès : une panne
      // prolongée est une décision humaine, pas un contournement automatique.
      expect(verdict({ code: 1, sortie, essai: REPRISES })).toBe("panne");
    }
  });
});
