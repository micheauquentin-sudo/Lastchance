import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { FAMILLES_DE_JETONS, famillesSurRepli } from "./token-secrets";

/* ════════════════════════════════════════════════════════════
 * LE REPLI SUR `SPIN_TOKEN_SECRET`, RENDU VISIBLE
 *
 * `signingSecret` retombe silencieusement sur `SPIN_TOKEN_SECRET` quand la clé
 * dédiée d'une famille n'est pas provisionnée. Ce n'est pas une faille — les
 * préfixes de domaine empêchent qu'un jeton d'une famille soit vérifiable par
 * une autre. Ce qui manquait, c'est qu'aucun exploitant ne pouvait dire
 * QUELLES familles en dépendent : la compromission ou la rotation de
 * `SPIN_TOKEN_SECRET` les touche alors toutes d'un coup, à son insu.
 * ════════════════════════════════════════════════════════════ */

const ORIGINE = { ...process.env };

afterEach(() => {
  for (const nom of FAMILLES_DE_JETONS) {
    if (ORIGINE[nom] === undefined) delete process.env[nom];
    else process.env[nom] = ORIGINE[nom];
  }
});

describe("famillesSurRepli", () => {
  it("liste exactement les familles sans clé dédiée", () => {
    for (const nom of FAMILLES_DE_JETONS) delete process.env[nom];
    process.env.CLAIM_TOKEN_SECRET = "clef-dediee";

    const repli = famillesSurRepli();
    expect(repli).not.toContain("CLAIM_TOKEN_SECRET");
    expect(repli).toContain("UNSUBSCRIBE_TOKEN_SECRET");
    expect(repli).toHaveLength(FAMILLES_DE_JETONS.length - 1);
  });

  it("une clé VIDE compte comme absente — c'est bien le repli qui sert", () => {
    // `process.env.X = ""` est le piège classique d'un fournisseur d'env : la
    // variable existe, elle ne vaut rien, et `signingSecret` retombe quand
    // même sur SPIN_TOKEN_SECRET (`||`). Une sonde qui la compterait comme
    // provisionnée mentirait exactement là où on la consulte.
    for (const nom of FAMILLES_DE_JETONS) delete process.env[nom];
    process.env.TEAM_INVITE_TOKEN_SECRET = "";

    expect(famillesSurRepli()).toContain("TEAM_INVITE_TOKEN_SECRET");
  });

  it("ne rend JAMAIS de valeur de secret, seulement des noms", () => {
    for (const nom of FAMILLES_DE_JETONS) delete process.env[nom];
    process.env.SPIN_TOKEN_SECRET = "valeur-tres-secrete";

    expect(famillesSurRepli().join(" ")).not.toContain("valeur-tres-secrete");
  });
});

/* ────────────────────────────────────────────────────────────
 * LA LISTE NE DOIT PAS POUVOIR VIEILLIR
 *
 * Une énumération recopiée à la main est fausse au module suivant, et une
 * sonde qui énumère une liste incomplète ment PAR OMISSION — le pire mode de
 * défaillance pour un outil d'exploitation : il répond, et sa réponse rassure.
 * Ce test relit les sources plutôt que la mémoire de qui a écrit la liste.
 * ──────────────────────────────────────────────────────────── */
describe("FAMILLES_DE_JETONS — l'inventaire suit les sources", () => {
  it("couvre toutes les familles réellement signées dans src/lib", () => {
    const dossier = fileURLToPath(new URL(".", import.meta.url));
    const trouvees = new Set<string>();

    for (const fichier of readdirSync(dossier)) {
      if (!fichier.endsWith(".ts") || fichier.endsWith(".test.ts")) continue;
      if (fichier === "token-secrets.ts") continue;
      const source = readFileSync(`${dossier}${fichier}`, "utf8");
      if (!source.includes("signingSecret")) continue;

      // Deux écritures coexistent dans le dépôt : le nom passé en clair
      // (`signingSecret("CLAIM_TOKEN_SECRET")`) et la constante de module
      // (`const SECRET_NAME = "…"`), qui sert quand le même nom est réutilisé
      // à la signature ET à la vérification. Les deux sont reconnues.
      for (const [, nom] of source.matchAll(
        /signingSecret\(\s*"([A-Z0-9_]+)"/g,
      )) {
        trouvees.add(nom);
      }
      if (/signingSecret\(\s*SECRET_NAME/.test(source)) {
        const declare = source.match(/SECRET_NAME\s*=\s*"([A-Z0-9_]+)"/);
        if (declare) trouvees.add(declare[1]);
      }
    }

    // Filet : si le balayage ne trouve plus rien, c'est lui qui est cassé, et
    // il ne doit pas conclure « tout va bien ».
    expect(trouvees.size).toBeGreaterThanOrEqual(4);
    expect([...trouvees].sort()).toEqual([...FAMILLES_DE_JETONS].sort());
  });

  it("n'inclut pas SPIN_TOKEN_SECRET, qui EST le repli", () => {
    // L'y mettre ferait dire à la sonde « SPIN_TOKEN_SECRET est sur le repli
    // SPIN_TOKEN_SECRET » — une tautologie qui masquerait la vraie liste.
    expect([...FAMILLES_DE_JETONS]).not.toContain("SPIN_TOKEN_SECRET");
  });
});
