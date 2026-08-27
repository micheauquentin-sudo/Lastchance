import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CE FICHIER EMPÊCHE LA DÉRIVE DE RECOMMENCER.
 *
 * Le vocabulaire des états était déjà unifié — et pourtant, deux modules
 * s'étaient remis à dessiner leur propre pastille verte à la main, et cinq
 * n'annonçaient rien du tout hors de l'état « ouverte ». Rien ne le signalait :
 * chaque carte était juste, prise seule.
 *
 * Une convention qu'aucun test ne tient redevient huit conventions. Ces trois
 * gardes lisent la SOURCE, faute de pouvoir rendre huit pages ici.
 */

const RACINE = "src/components/dashboard";

function sources(): Array<[string, string]> {
  return readdirSync(RACINE)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => [f, readFileSync(join(RACINE, f), "utf8")]);
}

/** Les fichiers qui exportent une carte de statut de module. */
function porteursDeStatut(): Array<[string, string]> {
  return sources().filter(([, src]) =>
    /export function \w+StatusControls\b/.test(src),
  );
}

describe("la carte de statut est la même partout", () => {
  it("chaque module qui rend un statut passe par la carte partagée", () => {
    const porteurs = porteursDeStatut();
    // Non-vacuité : si plus aucun module n'expose de carte de statut, ce test
    // passerait sans rien vérifier.
    expect(porteurs.length).toBeGreaterThanOrEqual(7);
    for (const [fichier, src] of porteurs) {
      expect(src, `${fichier} n'utilise pas CarteStatutAnimation`).toContain(
        "CarteStatutAnimation",
      );
    }
  });

  it("aucun module ne redessine la pastille d'état à la main", () => {
    // LE MOTIF EXACT QU'ON A TROUVÉ EN DOUBLE : un `<span>` vert, avec les
    // classes du badge, recopié dans le quiz et le calendrier. La pastille se
    // rend par `StatusBadge` (`ui/status-badge.tsx`), et par lui seul — c'est
    // là que le mot s'écrit, et là qu'on le change.
    for (const [fichier, src] of sources()) {
      expect(
        src.includes("border-k-ink bg-k-green/40 px-3 py-1 text-xs font-black"),
        `${fichier} redessine la pastille d'état au lieu d'utiliser StatusBadge`,
      ).toBe(false);
    }
  });

  it("chaque carte de statut annonce ce qui est vrai, pour TOUS ses états", () => {
    // La phrase ne concernait que « ouverte » sur cinq modules : un brouillon
    // et une clôture n'affichaient rien. Une table `PHRASE_ETAT` par module
    // force à écrire une phrase par état — le compilateur refuse un `Record`
    // incomplet, ce test refuse son absence.
    for (const [fichier, src] of porteursDeStatut()) {
      expect(
        src,
        `${fichier} n'a pas de table PHRASE_ETAT : un état resterait muet`,
      ).toMatch(/const PHRASE_ETAT: Record</);
    }
  });
});
