import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GARDE TEXTUELLE — le chemin de lecture PUBLIC de la Vitrine reste STATIQUE.
 *
 * ── LE DÉFAUT QU'ELLE FERME, ET IL NE SE VOIT PAS AUTREMENT ──
 *
 * La page `/v/[slug]/[[...langue]]` est servie en `revalidate = 60`. Toucher une
 * API dynamique — `headers()`, `cookies()`, `draftMode()`, `connection()` — la
 * fait retomber en rendu PAR REQUÊTE, et Next ne le dit pas : pas d'erreur, pas
 * d'avertissement au test, pas de différence visible en local. Le seul symptôme
 * est une facture et une charge de base qui montent avec le trafic, des semaines
 * plus tard. Aucun test de comportement ne peut attraper ça — le rendu est
 * correct dans les deux cas. On le garde donc TEXTUELLEMENT, au sens d'ADR-074 :
 * ce fichier LIT la source, il ne fait rien exécuter.
 *
 * C'est aussi ce qui remplace l'ancien compteur `pageOpenIp` de ce chemin : ce
 * n'est plus un seau qui borne l'amplification, c'est le cache lui-même (une RPC
 * par minute, par slug et par langue). L'invariant à tenir n'est donc plus « le
 * seau est bien posé » mais « rien ne casse le cache » — et c'est celui-ci.
 *
 * ── LA GARDE DE LA GARDE ──
 *
 * L'extraction LÈVE si elle ne trouve pas sa forme, et le corps extrait est
 * mesuré avant d'être examiné. Sans cela, une signature renommée rendrait un
 * fragment vide et l'assertion passerait en n'examinant rien — le défaut « le
 * détecteur ment », déjà payé douze fois sur ce dépôt.
 */

const SOURCE = readFileSync(
  join(process.cwd(), "src", "lib", "vitrine-context.ts"),
  "utf8",
  // CRLF normalisés à la lecture : ce dépôt est cloné sous Windows, et une ancre
  // multiligne n'y trouverait rien (piège payé deux fois, cf.
  // `vitrine-parity.test.ts`).
).replace(/\r\n/g, "\n");

/** Le CORPS de la fonction publique, docblock EXCLU. */
function corpsDeLaFonctionPublique(): string {
  const ancre = "export async function getVitrinePublicState(";
  const debut = SOURCE.indexOf(ancre);
  if (debut < 0) {
    throw new Error(
      "`getVitrinePublicState` introuvable dans src/lib/vitrine-context.ts : " +
        "la garde ne mesure plus rien — corriger l'ancre, jamais la contourner. " +
        "Ce nom est aussi le contrat que la page publique importe.",
    );
  }
  // `\n}` en début de ligne : les accolades internes sont indentées (`  });`),
  // seule la fermeture de la fonction est en colonne zéro.
  const fin = SOURCE.indexOf("\n}", debut);
  if (fin < 0) {
    throw new Error("Fin de `getVitrinePublicState` introuvable : garde à réécrire.");
  }
  // Le docblock est AVANT l'ancre, donc hors du fragment : il parle de
  // `headers()` et de `cookies()` pour expliquer leur absence, et l'inclure
  // aurait fait rougir la garde sur sa propre explication.
  return SOURCE.slice(debut, fin);
}

describe("le chemin de lecture public de la Vitrine ne touche aucune API dynamique", () => {
  const CORPS = corpsDeLaFonctionPublique();

  it("le corps extrait n'est pas vide (garde de la garde)", () => {
    expect(CORPS.length).toBeGreaterThan(200);
    // Ce qu'il DOIT contenir : si l'appel à la RPC n'y est plus, ce n'est plus
    // la fonction qu'on croit garder.
    expect(CORPS).toContain("vitrine_public_state");
  });

  it.each([
    ["headers(", "l'en-tête de requête"],
    ["cookies(", "les cookies"],
    ["draftMode(", "le mode brouillon"],
    ["connection(", "la connexion"],
  ])("n'appelle pas %s (%s)", (appel) => {
    // Chacun de ces quatre appels bascule la page en rendu dynamique. La page
    // resterait CORRECTE — c'est bien le problème : seul le cache disparaît.
    expect(CORPS).not.toContain(appel);
  });

  it("le module n'importe même pas `next/headers`", () => {
    // Une garde de plus haut : le chargeur du TABLEAU DE BORD partage ce
    // fichier, et un import ajouté pour lui serait à un appel de distance du
    // chemin public. `getUserAndOrg` lit la session par le client Supabase, qui
    // n'a jamais eu besoin de cet import ici.
    expect(SOURCE).not.toContain('from "next/headers"');
  });
});
