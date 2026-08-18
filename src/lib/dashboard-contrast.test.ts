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

/**
 * `text-orange-600` — la classe BRUTE, celle qui n'est pas un jeton.
 *
 * ── Pourquoi elle mérite sa propre garde ────────────────────────────
 *
 * #ea580c sur blanc rend **2,9:1** : sous le seuil AA (4,5:1) et sous le seuil
 * « large » (3:1). C'est exactement le défaut que `--color-k-orange-text`
 * (#b45309, 5,02:1 sur blanc) a été calibré pour fermer, et il est resté
 * ouvert dans huit liens parce que la classe Tailwind brute ressemble
 * suffisamment au jeton pour passer une relecture.
 *
 * Ces huit-là n'ont pas été trouvés à l'œil : ils l'ont été par le scan axe de
 * pages qui n'étaient scannées par personne avant ce chantier — la page de
 * connexion, l'inscription, la liste des participations. Six nœuds sur la
 * seule liste des participations, dont le lien « Envoyer un email » vers la
 * newsletter.
 *
 * ── Le périmètre est le PRODUIT, pas le dashboard ───────────────────
 *
 * La garde `text-zinc-400` ci-dessus se limite au dashboard, parce que la même
 * nuance est JUSTE sur le fond sombre de l'administration. `text-orange-600`
 * n'a pas cette excuse : il est faux sur toute surface claire, et le produit
 * n'en a pas de sombre où il servirait. Il est donc interdit partout.
 *
 * ── Les deux tolérances ─────────────────────────────────────────────
 *
 * `h-4 w-4` — l'idiome de la case à cocher (`rounded border-zinc-300
 * text-orange-600 focus:ring-orange-500`) : `text-*` y colore la COCHE, pas du
 * texte, et WCAG 1.4.3 ne s'y applique pas. Sept occurrences.
 *
 * Le point du logotype « Lastchance. » — un caractère décoratif doublé par le
 * mot qui le précède, comme son jumeau `text-k-orange` (voir
 * `play-contrast.test.ts`).
 */
describe("contraste des liens orange, dans tout le produit", () => {
  const RACINES = ["src/app", "src/components"];
  const POINT_DU_LOGOTYPE = /Lastchance<span className="text-orange-600">\.<\/span>/;

  it("aucun `text-orange-600` en texte", () => {
    const fautifs: string[] = [];
    for (const racine of RACINES) {
      for (const fichier of fichiersSous(racine, ".tsx")) {
        if (/\.test\.tsx$/.test(fichier)) continue;
        for (const ligne of readFileSync(fichier, "utf8").split(/\r?\n/)) {
          if (/^\s*(\*|\/\/|\/\*)/.test(ligne)) continue;
          // Un survol n'est jamais la seule façon de lire un lien : la couleur
          // AU REPOS est ce que la garde surveille.
          const reste = ligne.replace(/hover:text-orange-600\b/g, "");
          if (!/\btext-orange-600\b/.test(reste)) continue;
          if (/\bh-4 w-4\b/.test(ligne)) continue;
          if (POINT_DU_LOGOTYPE.test(ligne)) continue;
          fautifs.push(`${fichier} → ${ligne.trim().slice(0, 100)}`);
        }
      }
    }
    expect(
      fautifs,
      "utilisez `text-k-orange-text` (#b45309, 5,02:1 sur blanc) : " +
        "`text-orange-600` (#ea580c) rend 2,9:1, sous le seuil AA ET sous le " +
        "seuil « large »",
    ).toEqual([]);
  });
});
