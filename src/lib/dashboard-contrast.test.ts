import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GARDE JUMELLE de `play-contrast.test.ts`, côté commerçant.
 *
 * ── LE MÊME MOT, DEUX FONDS, DEUX VERDICTS ──────────────────────────
 *
 * `text-zinc-400` (#a1a1aa) est parfaitement lisible sur le fond zinc-950 de
 * l'administration — 8,9:1 — et franchement mauvais sur le blanc des cartes
 * du dashboard : 2,5:1, sous le seuil AA (4,5:1) et sous le seuil « large »
 * (3:1). C'est ce qui rend le défaut si tenace : la même classe est juste
 * quelque part dans le dépôt, ce qui la fait paraître acceptable partout.
 *
 * Quatorze sites du dashboard l'employaient encore — dont la valeur « Non »
 * de la colonne consentement de la liste des participations, celle qui décide
 * si un client peut être relancé. Le jeton `--color-k-muted` (#6b6459) existe
 * pour ce rôle exact : 5,8:1 sur blanc, 5,4:1 sur le crème.
 *
 * ── LES TROIS TOLÉRANCES, ET POURQUOI ELLES TIENNENT ────────────────
 *
 * `placeholder:` — un texte indicatif que le champ remplace dès la première
 * frappe ; WCAG 1.4.3 ne s'y applique pas de la même façon, et le rendre
 * aussi contrasté que la saisie ferait passer un champ vide pour rempli.
 * `disabled:` — un contrôle inerte DOIT reculer visuellement ; c'est
 * l'exemption explicite du critère.
 * `aria-hidden` — retiré de l'arbre d'accessibilité, purement décoratif.
 *
 * Rien d'autre. Une exception de plus se justifie ici, en toutes lettres, ou
 * ne se justifie pas.
 */

const DOSSIERS = ["src/app/dashboard", "src/components/dashboard"];

function fichiersSous(dir: string, suffixe: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiersSous(chemin, suffixe));
    else if (e.name.endsWith(suffixe)) out.push(chemin);
  }
  return out;
}

describe("contraste du dashboard commerçant", () => {
  it("aucun `text-zinc-400` hors placeholder, contrôle inerte ou décor", () => {
    const fautifs: string[] = [];
    for (const dossier of DOSSIERS) {
      for (const fichier of fichiersSous(dossier, ".tsx")) {
        if (/\.test\.tsx$/.test(fichier)) continue;
        for (const ligne of readFileSync(fichier, "utf8").split(/\r?\n/)) {
          // Un commentaire qui NOMME la classe fautive n'en habille aucun
          // texte : `qr-code-card.tsx` documente précisément pourquoi elle a
          // été retirée. La garde ne doit pas interdire d'en parler.
          if (/^\s*(\*|\/\/|\/\*)/.test(ligne)) continue;
          // Les trois tolérances documentées ci-dessus, retirées de la ligne
          // avant l'examen : ce qui reste est du texte lu par quelqu'un.
          const reste = ligne
            .replace(/placeholder:text-zinc-400\b/g, "")
            .replace(/disabled:text-zinc-400\b/g, "");
          if (!/\btext-zinc-400\b/.test(reste)) continue;
          if (/aria-hidden/.test(ligne)) continue;
          fautifs.push(`${fichier} → ${ligne.trim().slice(0, 100)}`);
        }
      }
    }
    expect(
      fautifs,
      "utilisez `text-k-muted` (#6b6459, calibré : 5,8:1 sur blanc) : " +
        "`text-zinc-400` rend 2,5:1 sur les cartes blanches du dashboard",
    ).toEqual([]);
  });

  it("le jeton calibré est bien celui que le dashboard emploie", () => {
    // Contre-épreuve : un test qui ne fait qu'INTERDIRE passe aussi quand la
    // couleur a disparu au profit d'une autre erreur. Celui-ci vérifie que le
    // remplacement est effectivement en place.
    const emplois = DOSSIERS.flatMap((d) => fichiersSous(d, ".tsx")).filter((f) =>
      /\btext-k-muted\b/.test(readFileSync(f, "utf8")),
    );
    expect(emplois.length).toBeGreaterThanOrEqual(8);
  });
});
