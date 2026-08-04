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
 *
 * ── POURQUOI LA FAMILLE N'A PAS ÉTÉ ÉLARGIE À `update` / `delete` / `rpc` ──
 *
 * La question s'est reposée le 2026-08-04, après sept appels trouvés à la main
 * qui trompent l'utilisateur sans jamais rien insérer — un gain annulé dont le
 * bouton de remise reste offert, un équipier retiré qui reste listé. Tentation
 * naturelle : étendre la signature aux actions qui MODIFIENT ou SUPPRIMENT.
 *
 * MESURÉ, et le chiffre est la raison du refus : cette signature désigne
 * **39 appels**, dont l'écrasante majorité est saine — quinze bascules du
 * back-office, et des éditeurs (`contest-settings`, `wheel-settings`,
 * `campaign-settings`, `prize-editor`) où la valeur saisie reste à l'écran,
 * donc où rien ne ment. Leur imposer le rechargement ferait payer 100 % d'un
 * coût pour une fenêtre de 5 à 32 %, et demanderait plus de trente exemptions :
 * une liste d'exemptions plus longue que la liste d'opt-in, c'est-à-dire
 * exactement la conclusion à laquelle l'audit du 2026-07-30 était déjà arrivé.
 * Le chiffre est écrit ici pour que la question ne se rejoue pas de mémoire.
 *
 * Ce qui distingue les sept sites corrigés à la main des trente-deux autres
 * n'est pas le verbe SQL : c'est que **l'écran porte un élément rendu par le
 * serveur qui affirmerait le contraire** — un badge, une vignette, une ligne
 * de liste. Aucune signature mécanique ne lit cela ; chacun des sept porte donc
 * son motif dans son propre code.
 *
 * ── LES TROIS RÉPARATIONS DU 2026-08-04, ET CE QU'ELLES CACHAIENT ──
 *
 * La garde annonçait une couverture qu'elle n'avait pas. Trois angles morts,
 * qui se superposaient tous sur le back-office :
 *
 *  1. **Le dossier.** La population se dérivait de `src/actions` seul, or les
 *     actions du back-office vivent dans `src/app/…/actions.ts`. `createAdmin`
 *     — la création d'un compte administrateur — n'a jamais été regardée.
 *  2. **L'adaptateur.** `useActionForm(adapt(createAdmin))` : la regex
 *     capturait `adapt`, jamais le nom de l'action. Second angle mort sur le
 *     même appel, qui aurait suffi à lui seul.
 *  3. **La liaison.** Le succès était cherché dans le COMPOSANT. Or un
 *     composant porte parfois plusieurs formulaires : dans `TeamMembersList`,
 *     le « Accès mis à jour. » du changement de rôle se lisait comme le succès
 *     du RETRAIT, qui n'affiche rien. L'en-tête de ce fichier anticipait
 *     pourtant cette erreur au niveau du FICHIER (« prize-editor en porte
 *     trois ») et la corrigeait en isolant le composant — elle se reproduisait
 *     un cran plus bas, et la correction d'hier masquait le trou d'aujourd'hui.
 *
 * ── ET DEUX ABSTENTIONS, parce qu'une garde qui accuse à tort ne survit pas ──
 *
 * Les réparations ci-dessus ont d'abord désigné deux appels SAINS, et il a
 * fallu les mesurer plutôt que les croire :
 *
 *  - `NoteForm` passe son état à un composant enfant (`<Feedback state={…} />`)
 *    qui rend « Enregistré. ». Une lecture textuelle ne traverse pas une
 *    frontière de composant : quand l'état part en prop, la garde S'ABSTIENT.
 *    Elle rate donc les vrais défauts de cette forme — trou connu, préféré à
 *    une accusation fausse, qu'on finit par désarmer en bloc.
 *  - `AddContestMatches` ré-aliase son état (`const state = rawState as …`) et
 *    rend `state?.ok`. La garde suit un niveau de ré-affectation locale.
 */

/**
 * Tous les modules qui déclarent des Server Actions.
 *
 * RÉPARATION 1. Dans `src/actions`, tout `.ts` en est un (`team.ts`,
 * `branding.ts`, …). Dans `src/app`, ce sont les `actions.ts` colocalisés à une
 * route — c'est là que vit le back-office, et cette moitié du produit n'était
 * pas regardée.
 */
function fichiersActions(): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string, tout: boolean) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) parcourir(chemin, tout);
      else if (
        e.name.endsWith(".ts") &&
        !e.name.includes(".test.") &&
        (tout || e.name === "actions.ts")
      ) {
        trouves.push(chemin);
      }
    }
  };
  parcourir("src/actions", true);
  parcourir("src/app", false);
  return trouves;
}

/**
 * Actions « insérantes » : elles ajoutent une ligne ET revalident, sans
 * rediriger. Le `redirect("/login")` des gardes d'authentification ne compte
 * pas — il n'est jamais atteint sur le chemin de succès.
 */
function actionsInserantes(): Set<string> {
  const trouvees = new Set<string>();
  for (const f of fichiersActions()) {
    const source = readFileSync(f, "utf8");
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
 * RÉPARATION 3 — quel identifiant porte l'état de CET appel ?
 *
 * `const { state, … } = useActionForm(a)` → `state`.
 * `const { state: roleState, … } = useActionForm(b)` → `roleState`.
 * `const { pending, onSubmit } = useActionForm(c)` → `null` : l'appel ne
 * récupère même pas son état, il ne peut donc rien afficher.
 *
 * Sans cela, deux formulaires du même composant partagent leur verdict, et le
 * succès de l'un absout le silence de l'autre — c'est ce qui a caché le retrait
 * d'un équipier derrière le « Accès mis à jour. » du changement de rôle.
 */
function liaisonEtat(lignes: string[], index: number): string | null {
  const bloc = lignes.slice(Math.max(0, index - 6), index + 1).join("\n");
  const avant = bloc.slice(0, bloc.lastIndexOf("useActionForm"));
  const m = avant.match(/\{([^{}]*)\}\s*=\s*$/);
  if (!m) return "state";
  const champ = m[1]
    .split(",")
    .map((s) => s.trim())
    .find((s) => /^state\b/.test(s));
  if (!champ) return null;
  const alias = champ.match(/^state\s*:\s*(\w+)/);
  return alias ? alias[1] : "state";
}

/**
 * Le composant affiche-t-il le SUCCÈS **de cet appel** ? On cherche `.ok` en
 * position positive sur SA liaison. `!state.ok` (rendu d'erreur) ne compte pas
 * — c'est la distinction qui fait toute la valeur du test, et une version
 * antérieure s'y est trompée : elle comptait les rendus d'erreur comme des
 * succès et déclarait la population entière saine.
 *
 * Deux abstentions, motivées dans l'en-tête : on suit un ré-aliasing local
 * (`const state = rawState as …`), et on renonce à accuser dès que l'état part
 * en prop vers un composant enfant, qu'une lecture textuelle ne traverse pas.
 */
function afficheUnSucces(corps: string, liaison: string | null): boolean {
  if (!liaison) return false;
  // Abstention : l'état est passé à un enfant (`<Feedback state={state} />`).
  if (new RegExp(`=\\{\\s*${liaison}\\s*\\}`).test(corps)) return true;
  const noms = [liaison];
  const reAlias = new RegExp(`const\\s+(\\w+)\\s*=\\s*${liaison}\\b`, "g");
  let a: RegExpExecArray | null;
  while ((a = reAlias.exec(corps))) noms.push(a[1]);
  for (const nom of noms) {
    const re = new RegExp(`${nom}\\s*\\??\\.ok\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(corps))) {
      if (!corps.slice(Math.max(0, m.index - 2), m.index).includes("!")) return true;
    }
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
          // RÉPARATION 2 : `useActionForm(adapt(createAdmin))` — un niveau
          // d'adaptateur est traversé, sinon la regex capture `adapt` et
          // l'appel devient invisible quel que soit le reste.
          const m = l.match(/useActionForm\(\s*(?:\w+\(\s*)?(\w+)/);
          if (!m || !inserantes.has(m[1])) return;
          const options = lignes.slice(i, i + 12).join("\n").split("});")[0];
          trouves.push({
            fichier: chemin.split(sep).join("/"),
            ligne: i + 1,
            action: m[1],
            aReload: /reloadOnSuccess:\s*true/.test(options),
            afficheSucces: afficheUnSucces(
              composantAutour(lignes, i),
              liaisonEtat(lignes, i),
            ),
          });
        });
      }
    }
  };
  parcourir("src/components");
  // Un composant client écrit demain sous `src/app` serait sinon hors de vue.
  parcourir("src/app");
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
    expect(
      afficheUnSucces("state && !state.ok ? state.error : undefined", "state"),
    ).toBe(false);
    expect(afficheUnSucces("{state?.ok && <p>Enregistré.</p>}", "state")).toBe(
      true,
    );
    expect(afficheUnSucces("const x = 1;", "state")).toBe(false);
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
    expect(afficheUnSucces(composantAutour(lignes, 5), "state")).toBe(false);
    expect(afficheUnSucces(composantAutour(lignes, 1), "state")).toBe(true);
  });

  it("isole l'APPEL et pas seulement le composant : deux formulaires, deux verdicts", () => {
    // RÉPARATION 3, et le défaut qu'elle a découvert. `TeamMembersList` porte
    // le retrait d'un équipier ET le changement de rôle. Le second affiche
    // « Accès mis à jour. », le premier n'affiche rien — et le succès du second
    // absolvait le silence du premier, pendant que l'ancien salarié restait
    // listé comme ayant accès à la caisse.
    const lignes = [
      "function DeuxFormulaires() {",
      "  const { state, pending, onSubmit } = useActionForm(removeTeamMember, {",
      "    networkError: 'x',",
      "  });",
      "  const {",
      "    state: roleState,",
      "    onSubmit: roleSubmit,",
      "  } = useActionForm(updateTeamMemberRole, {});",
      "  return <>{roleState?.ok && <p>OK</p>}{state && !state.ok && <p/>}</>;",
      "}",
    ];
    expect(liaisonEtat(lignes, 1)).toBe("state");
    expect(liaisonEtat(lignes, 7)).toBe("roleState");
    const corps = lignes.join("\n");
    expect(afficheUnSucces(corps, "roleState")).toBe(true);
    expect(afficheUnSucces(corps, "state")).toBe(false);
  });

  it("traverse l'adaptateur qui cachait le nom de l'action", () => {
    // RÉPARATION 2. `useActionForm(adapt(createAdmin))` : sans cela la regex
    // capture `adapt`, qui n'est dans aucune population, et la création d'un
    // compte administrateur reste invisible quoi qu'on fasse par ailleurs.
    const direct = "useActionForm(createAdmin, {".match(
      /useActionForm\(\s*(?:\w+\(\s*)?(\w+)/,
    );
    const adapte = "useActionForm(adapt(createAdmin), {".match(
      /useActionForm\(\s*(?:\w+\(\s*)?(\w+)/,
    );
    expect(direct?.[1]).toBe("createAdmin");
    expect(adapte?.[1]).toBe("createAdmin");
  });

  it("regarde les actions du back-office, pas seulement src/actions", () => {
    // RÉPARATION 1. `createAdmin` vit dans `src/app/…/actions.ts` ; tant que la
    // population se dérivait de `src/actions` seul, la moitié back-office du
    // produit — dont la création de comptes admin — n'était jamais regardée.
    const fichiers = fichiersActions();
    expect(fichiers.some((f) => f.includes("actions") && f.includes("app"))).toBe(
      true,
    );
    expect(actionsInserantes().has("createAdmin")).toBe(true);
  });

  it("s'abstient plutôt que d'accuser à tort", () => {
    // Les deux formes qui ont fait désigner du code SAIN par la première
    // version de ces réparations, et qu'il a fallu mesurer avant d'y croire.
    // Un état passé à un enfant : on ne traverse pas la frontière, on renonce.
    expect(afficheUnSucces("<Feedback state={state} />", "state")).toBe(true);
    // Un état ré-aliasé localement : on suit un niveau.
    expect(
      afficheUnSucces(
        "const state = rawState as R | null;\n{state?.ok && <p>ok</p>}",
        "rawState",
      ),
    ).toBe(true);
  });
});
