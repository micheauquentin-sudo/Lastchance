import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * LE STUDIO DE LA VITRINE SE REVALIDE PARTOUT OÙ SA PAGE DE TABLEAU DE BORD
 * LE FAIT (VIT-48).
 *
 * ── Le défaut, et il a été livré TROIS FOIS ──
 *
 * `/vitrine-studio` vit HORS de `/dashboard`. Next revalide un CHEMIN, pas une
 * ressource : `revalidatePath("/dashboard/vitrine")` ne l'atteint donc pas.
 *
 *  1. VIT-37 : `updateOrganizationSocialLinks` revalidait le tableau de bord et
 *     pas le studio. Le commerçant saisissait son Instagram, l'écran répondait
 *     « enregistré », et le lien n'apparaissait jamais dans l'aperçu.
 *  2 et 3. `setDuoOptions` et `setBandePack` : mêmes lignes, même oubli. L'étape
 *     « Ce qui paraît » du studio montre les jeux — donc le nombre de fiches du
 *     plateau et le pack de cartes. On règle son plateau, et l'écran qui
 *     l'affiche reste sur l'état d'hier.
 *  (et `closeLobbyAsOrg`, trouvé en écrivant cette garde.)
 *
 * Rien ne le signale jamais : l'ÉCRITURE réussit. C'est ce qui rend cette
 * famille chère — l'erreur n'est pas dans ce qu'on fait, mais dans ce qu'on
 * oublie de dire au cache.
 *
 * ── Pourquoi une garde TEXTUELLE ──
 *
 * Conformément à ADR-074, elle prouve qu'un appel est ÉCRIT, jamais qu'il
 * s'exécute. C'est néanmoins la mesure exacte du défaut : les trois sites
 * fautifs ne l'écrivaient pas.
 */

/** Tous les modules qui déclarent des Server Actions. */
function fichiersActions(): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) {
        trouves.push(chemin);
      }
    }
  };
  parcourir("src/actions");
  return trouves;
}

const TABLEAU_DE_BORD = 'revalidatePath("/dashboard/vitrine")';
const STUDIO = 'revalidatePath("/vitrine-studio")';

/** Le corps de chaque fonction exportée, découpé par ses bornes. */
function fonctions(source: string): { nom: string; corps: string }[] {
  const bornes: [string, number][] = [];
  const re = /(?:export )?(?:async )?function (\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) bornes.push([m[1], m.index]);
  return bornes.map(([nom, debut], i) => ({
    nom,
    corps: source.slice(debut, i + 1 < bornes.length ? bornes[i + 1][1] : source.length),
  }));
}

describe("le studio de la vitrine est revalidé partout où son tableau de bord l'est", () => {
  const sources = fichiersActions().map((f) => ({
    f,
    src: readFileSync(f, "utf8").replace(/\r\n/g, "\n"),
  }));

  it("des actions revalident bien la vitrine — sinon la garde est vacante", () => {
    // Sans cette assertion, un renommage du chemin rendrait la boucle ci-dessous
    // vide : elle passerait au vert sans avoir rien regardé.
    const combien = sources.filter((s) => s.src.includes(TABLEAU_DE_BORD)).length;
    expect(combien).toBeGreaterThanOrEqual(3);
  });

  /**
   * ON COMPTE PAR FONCTION, pas sur le fichier entier (ADR-161).
   *
   * Un fichier peut porter deux fonctions dont une seule revalide le studio :
   * comptée globalement, la seconde couvrirait la première, et la garde
   * annoncerait surveiller N appels en n'en surveillant que N−1.
   */
  it("chaque fonction qui revalide la vitrine revalide AUSSI son studio", () => {
    const manquants: string[] = [];

    for (const { f, src } of sources) {
      for (const { nom, corps } of fonctions(src)) {
        const bord = corps.split(TABLEAU_DE_BORD).length - 1;
        if (bord === 0) continue;
        const studio = corps.split(STUDIO).length - 1;
        if (studio < bord) {
          manquants.push(`${f} › ${nom} (${studio} studio sur ${bord} tableau de bord)`);
        }
      }
    }

    expect(manquants).toEqual([]);
  });
});
