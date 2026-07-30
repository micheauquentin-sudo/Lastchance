import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GARDE MÉCANIQUE — le geste qui crée un doublon doit recharger.
 *
 * ── Ce que cette garde remplace ──
 *
 * `use-action-form.ts` porte une option `reloadOnSuccess`, et son commentaire
 * dit le revers : « c'est une case à cocher, donc une case qu'on oublie ».
 * Un audit du 2026-07-30 a ouvert les 98 appels du hook pour décider s'il
 * fallait plutôt INVERSER le défaut. Réponse : non — le rechargement paierait
 * 100 % d'un coût pour fermer une fenêtre à 5–32 %, et il faudrait plus de
 * trente exemptions, soit une liste plus longue que la liste d'opt-in.
 *
 * Mais alors l'oubli reste. Ce test le sort du champ de la mémoire.
 *
 * ── La signature, et pourquoi c'est CELLE-LÀ ──
 *
 * Sur 98 appels, sept seulement font vraiment mal, et ils ont une forme
 * commune : **insérer une ligne dans une liste rendue par le serveur, sans
 * afficher aucun succès**. L'utilisateur ne voit rien, refait le geste, et
 * obtient un doublon — un lot en double sur la roue, une étape de chasse
 * fantôme qui rend le parcours interminable, une question posée deux fois.
 *
 * Les autres appels sont bénins pour des raisons vérifiables : l'action
 * redirige, un message « Enregistré. » s'affiche depuis `state`, ou la valeur
 * saisie reste à l'écran. Aucun n'a besoin du rechargement, et le lui imposer
 * coûterait la saisie en cours des formulaires voisins.
 *
 * ── Ce que la garde ne couvre PAS, et c'est assumé ──
 *
 * Elle ne connaît que la famille « doublon ». D'autres appels portent
 * `reloadOnSuccess` pour des motifs qu'aucune signature ne capture — une
 * pastille de statut qui ment sur une page ouverte aux clients, un secret de
 * webhook périmé recopié en production, un caissier devant un client. Ceux-là
 * sont nommés dans leur code, pas ici. La garde empêche l'oubli sur la seule
 * famille qu'on sait reconnaître mécaniquement ; elle ne remplace pas le
 * jugement.
 */

/**
 * Actions « insérantes » : elles ajoutent une ligne ET revalident, sans
 * rediriger. Le `redirect("/login")` des gardes d'authentification ne compte
 * pas — il n'est jamais atteint sur le chemin de succès.
 */
function actionsInserantes(): Set<string> {
  const trouvees = new Set<string>();
  for (const f of readdirSync("src/actions")) {
    if (!f.endsWith(".ts") || f.includes(".test.")) continue;
    const source = readFileSync(join("src/actions", f), "utf8");
    const bornes: [string, number][] = [];
    const re = /export async function (\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) bornes.push([m[1], m.index]);
    bornes.forEach(([nom, debut], i) => {
      const fin = i + 1 < bornes.length ? bornes[i + 1][1] : source.length;
      const corps = source.slice(debut, fin);
      const sansLogin = corps.replace(/redirect\("\/login"\)/g, "");
      if (
        /\.insert\(/.test(corps) &&
        /revalidatePath|revalidatePlaySlugs/.test(corps) &&
        !/redirect\(/.test(sansLogin)
      ) {
        trouvees.add(nom);
      }
    });
  }
  return trouvees;
}

/** Corps de la fonction composant qui contient cette ligne. */
function composantAutour(lignes: string[], index: number): string {
  const estEntete = (l: string) => /^(export )?function [A-Z]\w*\(/.test(l);
  let debut = 0;
  for (let i = index; i >= 0; i--) {
    if (estEntete(lignes[i])) {
      debut = i;
      break;
    }
  }
  let fin = lignes.length;
  for (let i = debut + 1; i < lignes.length; i++) {
    if (estEntete(lignes[i])) {
      fin = i;
      break;
    }
  }
  return lignes.slice(debut, fin).join("\n");
}

/**
 * Le composant affiche-t-il un SUCCÈS ? On cherche `.ok` en position positive.
 * `!state.ok` (rendu d'erreur) ne compte pas — c'est la distinction qui fait
 * toute la valeur du test, et une version antérieure s'y est trompée : elle
 * comptait les rendus d'erreur comme des succès et déclarait la population
 * entière saine.
 */
function afficheUnSucces(corps: string): boolean {
  const re = /([A-Za-z_$][\w$]*)\s*\??\.ok\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corps))) {
    if (!corps.slice(Math.max(0, m.index - 2), m.index).includes("!")) return true;
  }
  return false;
}

interface Appel {
  fichier: string;
  ligne: number;
  action: string;
  aReload: boolean;
  afficheSucces: boolean;
}

function appels(): Appel[] {
  const inserantes = actionsInserantes();
  const trouves: Appel[] = [];
  const parcourir = (dossier: string) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (e.name.endsWith(".tsx")) {
        const lignes = readFileSync(chemin, "utf8").split(/\r?\n/);
        lignes.forEach((l, i) => {
          const m = l.match(/useActionForm\(\s*(\w+)/);
          if (!m || !inserantes.has(m[1])) return;
          const options = lignes.slice(i, i + 12).join("\n").split("});")[0];
          trouves.push({
            fichier: chemin.split(sep).join("/"),
            ligne: i + 1,
            action: m[1],
            aReload: /reloadOnSuccess:\s*true/.test(options),
            afficheSucces: afficheUnSucces(composantAutour(lignes, i)),
          });
        });
      }
    }
  };
  parcourir("src/components");
  return trouves;
}

describe("useActionForm — le geste qui crée un doublon recharge", () => {
  it("tout appel « insère une ligne, n'affiche aucun succès » porte reloadOnSuccess", () => {
    const manquants = appels().filter((a) => !a.afficheSucces && !a.aReload);
    expect(
      manquants,
      `Ces appels insèrent une ligne dans une liste rendue par le serveur et n'affichent\n` +
        `aucun succès : si le rafraîchissement ne s'applique pas — mesuré 5 à 32 % du temps —\n` +
        `l'utilisateur refait le geste et obtient un DOUBLON. Ajoutez \`reloadOnSuccess: true\`,\n` +
        `ou faites afficher le résultat par le composant.\n` +
        manquants.map((a) => `  ${a.fichier}:${a.ligne} → ${a.action}`).join("\n"),
    ).toEqual([]);
  });

  it("trouve bien des actions et des appels — sinon le test ci-dessus est vide", () => {
    // CONTRÔLE NÉGATIF DU TEST LUI-MÊME. Une erreur de chemin rendrait deux
    // ensembles vides, donc zéro manquant, donc un vert qui ne vérifie rien.
    expect(actionsInserantes().size).toBeGreaterThan(5);
    expect(appels().length).toBeGreaterThan(5);
  });

  it("sait distinguer un rendu de SUCCÈS d'un rendu d'ERREUR", () => {
    // La distinction qui porte tout le test. Une version antérieure comptait
    // `!state.ok` comme un succès et déclarait la population entière saine.
    expect(afficheUnSucces("state && !state.ok ? state.error : undefined")).toBe(
      false,
    );
    expect(afficheUnSucces("{state?.ok && <p>Enregistré.</p>}")).toBe(true);
    expect(afficheUnSucces("const x = 1;")).toBe(false);
  });

  it("isole le composant qui porte l'appel, pas le fichier entier", () => {
    // Sans cela, un fichier contenant plusieurs composants — `prize-editor` en
    // porte trois — verrait le message de succès de l'un couvrir le silence de
    // l'autre. C'est exactement l'erreur qu'une version antérieure a commise.
    const lignes = [
      "function AvecSucces() {",
      "  return state.ok ? <p>ok</p> : null;",
      "}",
      "",
      "function SansRien() {",
      "  const { onSubmit } = useActionForm(createX, {});",
      "}",
    ];
    expect(afficheUnSucces(composantAutour(lignes, 5))).toBe(false);
    expect(afficheUnSucces(composantAutour(lignes, 1))).toBe(true);
  });
});
