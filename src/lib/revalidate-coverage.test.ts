import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GARDE MÉCANIQUE — un `revalidatePath` doit désigner une route qui existe.
 *
 * ── Le défaut qui a motivé ce fichier (2026-07-30) ──
 *
 * `updateEventSession` revalidait `/dashboard/events/sessions/${id}`. Ce chemin
 * ne correspond à AUCUNE route : les seules sous `/dashboard/events` sont la
 * liste, `[id]` et `[id]/remote`. Deux erreurs dans une même ligne — le segment
 * `sessions/` n'existe pas, et l'identifiant passé était celui de la session au
 * lieu de celui de la partie.
 *
 * Conséquence : la page qui porte ce formulaire n'était revalidée par personne.
 * Le commerçant modifiait le lot d'une session, l'action répondait « ok », et
 * l'écran gardait l'ancienne valeur jusqu'à un rechargement manuel. Next ne dit
 * rien : revalider un chemin inexistant est un no-op silencieux.
 *
 * ── Pourquoi une garde et pas seulement un correctif ──
 *
 * Le produit porte ~200 de ces chaînes, écrites à la main, dans des fichiers
 * que personne ne relit ensemble. Un seul était mort — mais rien n'empêchait le
 * suivant, et rien ne l'aurait signalé. C'est la même famille que
 * `cron-coverage.test.ts` et `pgtap-coverage.test.ts` : deux représentations
 * d'une même vérité (l'arbre des routes, et les chaînes qui le citent), reliées
 * par un contrôle plutôt que par la vigilance.
 *
 * Ce que ce test NE prouve pas : que le chemin revalidé soit le BON. Il prouve
 * seulement qu'il en existe un. Un `revalidatePath('/dashboard')` posé là où il
 * fallait `/dashboard/campaigns/[id]` passerait ici — c'est une garde contre le
 * chemin mort, pas contre le chemin inexact.
 */

const RACINE = "src";

/** Routes réelles de l'App Router, en motifs comparables. */
function routes(): string[] {
  const trouvees: string[] = [];
  const parcourir = (dossier: string, segment: string) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      if (e.isDirectory()) {
        // Un groupe `(marketing)` ou un slot parallèle `@modal` ne consomme
        // aucun segment d'URL : le chemin traverse sans s'allonger.
        const suivant =
          e.name.startsWith("(") || e.name.startsWith("@")
            ? segment
            : `${segment}/${e.name}`;
        parcourir(join(dossier, e.name), suivant);
      } else if (e.name === "page.tsx" || e.name === "route.ts") {
        trouvees.push(segment || "/");
      }
    }
  };
  parcourir(join(RACINE, "app"), "");
  return trouvees;
}

/** Chaque `revalidatePath` littéral du produit, avec son origine. */
function appels(): { fichier: string; ligne: number; cible: string }[] {
  const trouves: { fichier: string; ligne: number; cible: string }[] = [];
  const parcourir = (dossier: string) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        readFileSync(chemin, "utf8")
          .split(/\r?\n/)
          .forEach((ligne, i) => {
            const m = ligne.match(/revalidatePath\(\s*[`"']([^`"']+)/);
            if (m) {
              trouves.push({
                fichier: chemin.split(sep).join("/"),
                ligne: i + 1,
                cible: m[1],
              });
            }
          });
      }
    }
  };
  parcourir(RACINE);
  return trouves;
}

/**
 * `[id]` accepte un segment, `[...slug]` accepte la fin du chemin. Les deux
 * sont échappés AVANT d'être remplacés, sinon les crochets partiraient dans
 * l'expression régulière comme une classe de caractères.
 */
function motif(route: string): RegExp {
  const echappe = route.replace(/[.*+?^${}()|\\]/g, "\\$&");
  return new RegExp(
    `^${echappe
      .replace(/\[\[?\.\.\.[^\]]+\]\]?/g, ".*")
      .replace(/\[[^\]]+\]/g, "[^/]+")}$`,
  );
}

/** Une interpolation `${…}` vaut un segment quelconque, comme `[id]`. */
function normaliser(cible: string): string {
  return cible.replace(/\$\{[^}]*\}/g, "X").replace(/\/+$/, "") || "/";
}

describe("revalidatePath — couverture des routes", () => {
  it("désigne toujours une route qui existe", () => {
    const motifs = routes().map(motif);
    const morts = appels().filter(
      (a) => !motifs.some((m) => m.test(normaliser(a.cible))),
    );

    expect(
      morts,
      `revalidatePath sans route correspondante — la revalidation est un no-op silencieux :\n${morts
        .map((m) => `  ${m.fichier}:${m.ligne} → ${m.cible}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("trouve bien des routes et des appels — sinon le test ci-dessus est vide", () => {
    // CONTRÔLE NÉGATIF DU TEST LUI-MÊME. Sans lui, une erreur de chemin de
    // départ rendrait deux listes vides, donc zéro mort, donc un test vert qui
    // ne vérifie rien — le défaut exact qui a rendu le filet de nonce inutile
    // pendant deux semaines (docs/bugs.md).
    expect(routes().length).toBeGreaterThan(50);
    expect(appels().length).toBeGreaterThan(100);
  });

  it("sait reconnaître un chemin mort", () => {
    // Second contrôle négatif : la mécanique de comparaison elle-même. Si un
    // jour `motif()` acceptait tout, les deux tests précédents resteraient
    // verts et ne prouveraient plus rien.
    const motifs = routes().map(motif);
    expect(motifs.some((m) => m.test("/dashboard/events/sessions/X"))).toBe(
      false,
    );
    expect(motifs.some((m) => m.test("/dashboard/events/X"))).toBe(true);
  });
});
