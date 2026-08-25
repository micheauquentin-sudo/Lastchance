import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GARDE MÉCANIQUE — la BASCULE d'état recharge.
 *
 * ── La famille, et pourquoi elle est distincte de l'autre garde ──
 *
 * `use-action-form-coverage.test.ts` couvre la famille « doublon » : un geste
 * qui INSÈRE une ligne, sans succès affiché, donc refait, donc dupliqué.
 * Celle-ci couvre une famille voisine mais qui fait mal autrement : le geste
 * qui change un ÉTAT que la surface publique lit AUSSITÔT.
 *
 * Sa signature est visible dans le markup, et c'est ce qui la rend
 * mécanisable : **le formulaire poste une valeur d'état qu'il ne demande pas à
 * l'utilisateur** — un `<input type="hidden" name="status">` ou un
 * `<select name="status">`. Cette valeur, comme les commandes offertes et la
 * pastille voisine, est DÉRIVÉE de la prop serveur. Si le rafraîchissement ne
 * s'applique pas — mesuré défaillant 5 à 32 % du temps, docs/bugs.md —
 * l'écran ne se contredit pas seulement : il ne peut plus se corriger, puisque
 * le geste suivant repart de la même prop périmée.
 *
 * Trois conséquences constatées, toutes en production :
 *   - un championnat de pronostics ouvert au public pendant que le tableau de
 *     bord affiche encore « Brouillon » — le commerçant ne diffuse pas le lien ;
 *   - pire à l'envers : « Clôturer » ferme les pronostics côté joueur
 *     pendant que l'écran dit « Ouverte aux joueurs », et le commerçant annonce à ses
 *     clients qu'ils peuvent encore jouer sur une page qui les refuse ;
 *   - un module coupé chez un commerçant depuis le back-office : la page
 *     publique renvoie « indisponible » et l'admin lit encore « Activé », avec
 *     un bouton dont un second clic renvoie EXACTEMENT la même valeur.
 *
 * ── Pourquoi « affiche un succès » n'exempte PAS ici ──
 *
 * L'autre garde exempte les composants qui rendent `state.ok` : un
 * « Enregistré. » suffit à empêcher le doublon. Pas ici. Le back-office
 * marchand affiche bien « Enregistré. » sous chaque bascule, et le défaut
 * demeure entier : ce qui manque n'est pas l'accusé de réception, c'est la
 * VALEUR SUIVANTE. L'exemption serait donc fausse pour cette famille.
 *
 * ── La case à cocher n'en fait pas partie, délibérément ──
 *
 * `automation-settings.tsx` poste aussi un `name="enabled"`, mais depuis une
 * case que l'utilisateur vient de cocher lui-même : la valeur postée est ce
 * qu'il voit, elle survit à un rafraîchissement manqué. C'est exactement la
 * différence que la signature retient (`type="hidden"` ou `<select>`), et non
 * une exception nommée.
 */

const RACINE = "src/components";

/**
 * Un champ d'état que l'utilisateur ne saisit pas : caché, ou liste déroulante.
 *
 * `plan` en fait partie au même titre que `status` : changer l'offre d'un
 * commerçant coupe ou rouvre exactement les mêmes surfaces publiques que le
 * suspendre, et la fiche n'en rend compte que par des props serveur.
 *
 * `worker` aussi, et pour la même raison exactement : activer la cadence rapide
 * fait passer la file de travaux d'un passage QUOTIDIEN à un passage toutes les
 * 5 minutes. L'état vit dans le Vault, donc rien sur l'écran ne peut le montrer
 * autrement qu'en relisant le serveur ; sans rechargement, l'administrateur
 * relit « cadence quotidienne » sur un worker désormais rapide, et le bouton
 * qu'il voit encore réécrit les mêmes secrets.
 */
const CHAMP_ETAT_DERIVE =
  /<input[^>]*\stype="hidden"[^>]*\sname="(?:status|enabled|plan|worker)"|<select[^>]*\sname="(?:status|enabled|plan|worker)"/;

function estEnteteComposant(ligne: string): boolean {
  return /^(export )?function [A-Z]\w*\(/.test(ligne);
}

/** Bornes du composant qui contient cette ligne. */
export function bornesDuComposant(
  lignes: string[],
  index: number,
): [number, number] {
  let debut = 0;
  for (let i = index; i >= 0; i--) {
    if (estEnteteComposant(lignes[i])) {
      debut = i;
      break;
    }
  }
  let fin = lignes.length;
  for (let i = debut + 1; i < lignes.length; i++) {
    if (estEnteteComposant(lignes[i])) {
      fin = i;
      break;
    }
  }
  return [debut, fin];
}

/**
 * Nom du gestionnaire de soumission → texte COMPLET de la déclaration
 * `useActionForm` qui le produit, options comprises.
 *
 * Trois formes en usage dans ce dépôt, toutes rencontrées :
 *   const { state, pending, onSubmit } = useActionForm(a);
 *   const { onSubmit: statusSubmit } = useActionForm(a, { … });
 *   const statusForm = useActionForm(a);            → `statusForm.onSubmit`
 */
export function declarationsParGestionnaire(
  lignes: string[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < lignes.length; i++) {
    if (!/useActionForm/.test(lignes[i])) continue;
    let debut = i;
    while (debut > 0 && !/\bconst\b/.test(lignes[debut])) debut--;
    let fin = i;
    while (fin < lignes.length - 1 && !/\);\s*$/.test(lignes[fin])) fin++;
    const texte = lignes.slice(debut, fin + 1).join("\n");
    const cible = texte.slice(0, texte.indexOf("useActionForm"));
    const destructure = cible.match(/const\s*\{([^}]*)\}/);
    if (destructure) {
      for (const morceau of destructure[1].split(",")) {
        const [brut, alias] = morceau.split(":").map((s) => s.trim());
        if (brut === "onSubmit") out.set(alias ?? brut, texte);
      }
    } else {
      const simple = cible.match(/const\s+(\w+)\s*=/);
      if (simple) out.set(`${simple[1]}.onSubmit`, texte);
    }
  }
  return out;
}

/**
 * Constantes d'options du fichier qui portent le rechargement.
 *
 * Sans cela, la garde serait défaite par le geste le plus naturel du monde :
 * factoriser douze options identiques dans un `const BASCULE = { … }`. Elle
 * suit donc la constante, plutôt que d'exiger douze littéraux recopiés.
 */
export function constantesDeRechargement(source: string): string[] {
  const noms: string[] = [];
  const re = /const\s+(\w+)\s*=\s*\{[^}]*reloadOnSuccess:\s*true[^}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) noms.push(m[1]);
  return noms;
}

export function porteLeRechargement(
  declaration: string,
  constantes: string[] = [],
): boolean {
  if (/reloadOnSuccess:\s*true/.test(declaration)) return true;
  return constantes.some((nom) =>
    new RegExp(`\\b${nom}\\b`).test(declaration),
  );
}

/**
 * Exception stricte : l'action renvoie la valeur canonique, et le composant
 * l'applique à son état local. Un simple message de succès ne suffit pas.
 */
export function porteLaValeurCanoniqueLocale(declaration: string): boolean {
  return (
    /refreshOnSuccess:\s*false/.test(declaration) &&
    /onSuccess:\s*\(\{\s*status:\s*\w+\s*\}\)\s*=>/.test(declaration) &&
    /setStatus\(\w+\)/.test(declaration)
  );
}

function fichiersTsx(dossier: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) out.push(...fichiersTsx(chemin));
    else if (e.name.endsWith(".tsx")) out.push(chemin);
  }
  return out;
}

interface Bascule {
  fichier: string;
  ligne: number;
  gestionnaire: string;
  recharge: boolean;
}

function bascules(): Bascule[] {
  const trouvees: Bascule[] = [];
  for (const chemin of fichiersTsx(RACINE)) {
    const source = readFileSync(chemin, "utf8");
    if (!source.includes("useActionForm")) continue;
    const constantes = constantesDeRechargement(source);
    const lignes = source.split(/\r?\n/);
    for (let i = 0; i < lignes.length; i++) {
      const m = lignes[i].match(/onSubmit=\{([\w.]+)\}/);
      if (!m) continue;
      let ferme = i;
      while (ferme < lignes.length && !/<\/form>/.test(lignes[ferme])) ferme++;
      const markup = lignes.slice(i, ferme + 1).join("\n");
      if (!CHAMP_ETAT_DERIVE.test(markup)) continue;
      const [debut, fin] = bornesDuComposant(lignes, i);
      const declaration = declarationsParGestionnaire(
        lignes.slice(debut, fin),
      ).get(m[1]);
      if (declaration === undefined) continue;
      trouvees.push({
        fichier: chemin.split(sep).join("/"),
        ligne: i + 1,
        gestionnaire: m[1],
        recharge:
          porteLeRechargement(declaration, constantes) ||
          porteLaValeurCanoniqueLocale(declaration),
      });
    }
  }
  return trouvees;
}

/**
 * Publication d'un RÉSULTAT officiel : `setMatchResult`, `setQuestionResult`.
 *
 * Ce n'est pas une bascule d'état au sens du markup — le formulaire poste des
 * scores, saisis par le commerçant — mais l'effet public est le même et pire :
 * le pronostic se verrouille et le CLASSEMENT PUBLIC est recalculé pour tous
 * les joueurs. L'écran du commerçant, lui, ne rend compte de rien : le libellé
 * du bouton (« Résultat » / « Corriger ») dérive de `match.status`, et le seul
 * retour rendu est une erreur. Il ressaisit — au pire une autre valeur, parce
 * qu'il doute de ce qu'il avait tapé — et publie une correction de classement
 * non voulue sur une surface consultée en direct.
 */
function publicationsDeResultat(): Bascule[] {
  const trouvees: Bascule[] = [];
  for (const chemin of fichiersTsx(RACINE)) {
    const source = readFileSync(chemin, "utf8");
    const constantes = constantesDeRechargement(source);
    const lignes = source.split(/\r?\n/);
    for (let i = 0; i < lignes.length; i++) {
      const m = lignes[i].match(/useActionForm(?:<[^>]*>)?\(\s*(set\w*Result)\b/);
      if (!m) continue;
      let fin = i;
      while (fin < lignes.length - 1 && !/\);\s*$/.test(lignes[fin])) fin++;
      trouvees.push({
        fichier: chemin.split(sep).join("/"),
        ligne: i + 1,
        gestionnaire: m[1],
        recharge: porteLeRechargement(
          lignes.slice(i, fin + 1).join("\n"),
          constantes,
        ),
      });
    }
  }
  return trouvees;
}

/**
 * Mise en file et relance d'une NEWSLETTER : `sendNewsletterCampaign`,
 * `retryNewsletterCampaign`.
 *
 * ── UNE DÉCISION RÉVISÉE, PAS UN OUBLI RATTRAPÉ ──
 *
 * L'audit `router.refresh` du 2026-07-30 a ouvert la newsletter et NE L'A PAS
 * retenue. Ce n'était pas une négligence : le composer rend un succès explicite
 * (« En file d'attente : envoi à N abonnés »), ce qui est précisément le motif
 * d'exemption de la garde voisine — un accusé de réception suffit d'ordinaire à
 * empêcher qu'on refasse le geste.
 *
 * PREUVE NOUVELLE, LE 2026-08-04 : job E2E rouge sur `main` au commit
 * `e93963f`, `e2e/newsletter.spec.ts:54`. La bannière de succès s'affichait
 * (ligne 53, verte) et le SUJET N'APPARAISSAIT PAS AU JOURNAL rendu par le
 * serveur, sur la même page. Le spec passe au commit suivant : le mécanisme est
 * bien le rafraîchissement manqué, mesuré à 5–32 % (docs/bugs.md), et non une
 * erreur de test.
 *
 * Ce que cet échec apprend, et qui vaut au-delà de la newsletter : **un accusé
 * de réception n'exempte que s'il rend le geste OBSERVABLE, pas seulement
 * REÇU.** Ici il dit qu'un envoi est parti ; le commerçant, lui, cherche SA
 * campagne dans l'historique, et c'est son absence qu'il lit — un journal
 * complet sauf de la ligne qu'il vient de créer se lit comme un échec, quelle
 * que soit la phrase verte au-dessus. Il recompose : second job, SECOND EMAIL
 * aux mêmes abonnés, et rien ne rattrape un email parti.
 *
 * La relance est le cas plus franc des deux : elle ne rend aucun succès, et sa
 * clé d'idempotence porte `Date.now()` — le second clic dépose un vrai second
 * job.
 *
 * ── Pourquoi une famille à part et non la signature du markup ──
 *
 * `CHAMP_ETAT_DERIVE` cherche un état posté que l'utilisateur ne saisit pas.
 * Les deux formulaires postent bien un champ caché, mais `segment` et `id` :
 * y ajouter `id` reviendrait à retenir presque tous les formulaires du dépôt,
 * c'est-à-dire à inverser le défaut du hook par accident. La clé est donc
 * l'ACTION appelée, comme pour les publications de résultat ci-dessus.
 */
function envoisDeNewsletter(): Bascule[] {
  const trouvees: Bascule[] = [];
  for (const chemin of fichiersTsx(RACINE)) {
    const source = readFileSync(chemin, "utf8");
    const constantes = constantesDeRechargement(source);
    const lignes = source.split(/\r?\n/);
    for (let i = 0; i < lignes.length; i++) {
      const m = lignes[i].match(
        /useActionForm(?:<[^>]*>)?\(\s*((?:send|retry)NewsletterCampaign)\b/,
      );
      if (!m) continue;
      let fin = i;
      while (fin < lignes.length - 1 && !/\);\s*$/.test(lignes[fin])) fin++;
      trouvees.push({
        fichier: chemin.split(sep).join("/"),
        ligne: i + 1,
        gestionnaire: m[1],
        recharge: porteLeRechargement(
          lignes.slice(i, fin + 1).join("\n"),
          constantes,
        ),
      });
    }
  }
  return trouvees;
}

function nommer(liste: Bascule[]): string {
  return liste.map((b) => `  ${b.fichier}:${b.ligne} → ${b.gestionnaire}`).join("\n");
}

describe("useActionForm — la bascule d'état reste cohérente", () => {
  it("tout formulaire qui poste un état dérivé recharge ou applique la valeur canonique", () => {
    const manquants = bascules().filter((b) => !b.recharge);
    expect(
      manquants,
      `Ces formulaires postent une valeur d'état DÉRIVÉE de la prop serveur (champ caché\n` +
        `ou liste déroulante), et changent un état que la surface publique lit aussitôt.\n` +
        `Sans \`reloadOnSuccess: true\` ou valeur canonique appliquée localement, l'écran\n` +
        `affirme le CONTRAIRE de ce que voient les\n` +
        `clients, et le geste suivant repart de la même prop périmée — il ne peut pas se\n` +
        `corriger de lui-même.\n` +
        nommer(manquants),
    ).toEqual([]);
  });

  it("toute publication de résultat officiel porte reloadOnSuccess", () => {
    const manquants = publicationsDeResultat().filter((b) => !b.recharge);
    expect(
      manquants,
      `Ces gestes publient un résultat officiel : le classement public est recalculé pour\n` +
        `tous les joueurs et les pronostics se verrouillent. L'écran du commerçant reste\n` +
        `muet, il ressaisit, et corrige un classement déjà juste.\n` +
        nommer(manquants),
    ).toEqual([]);
  });

  it("tout envoi de newsletter porte reloadOnSuccess", () => {
    const manquants = envoisDeNewsletter().filter((b) => !b.recharge);
    expect(
      manquants,
      `Ces gestes déposent un envoi d'emails dont la SEULE trace visible est\n` +
        `l'historique rendu par le serveur, sur la même page. Sans\n` +
        `\`reloadOnSuccess: true\`, le commerçant lit un journal où sa campagne\n` +
        `manque, en conclut un échec, recompose — et les mêmes abonnés reçoivent\n` +
        `le message une seconde fois. Un email parti ne se rattrape pas.\n` +
        `Décision révisée le 2026-08-04 sur un échec CI (voir l'en-tête de\n` +
        `\`envoisDeNewsletter\`) : ne la re-révisez pas sans une preuve du même ordre.\n` +
        nommer(manquants),
    ).toEqual([]);
  });

  it("trouve bien des bascules — sinon les trois tests ci-dessus sont vides", () => {
    // CONTRÔLE NÉGATIF DU TEST LUI-MÊME : une erreur de chemin ou de regex
    // rendrait l'ensemble vide, donc zéro manquant, donc un vert creux.
    expect(bascules().length).toBeGreaterThan(10);
    expect(publicationsDeResultat().length).toBe(2);
    // Le composer ET la relance. Un seul trouvé = la moitié de la famille
    // n'est gardée par rien, et le test au-dessus serait vert pour rien.
    expect(envoisDeNewsletter().map((b) => b.gestionnaire).sort()).toEqual([
      "retryNewsletterCampaign",
      "sendNewsletterCampaign",
    ]);
  });

  it("ne retient PAS une case cochée par l'utilisateur", () => {
    // La distinction qui porte tout le test. Une case reflète ce que
    // l'utilisateur vient de faire : sa valeur survit à un rafraîchissement
    // manqué. Un champ caché, non — il est calculé depuis la prop serveur.
    const cochee = '<input type="checkbox" name="enabled" defaultChecked={enabled} />';
    const cachee = '<input type="hidden" name="enabled" value={String(!enabled)} />';
    expect(CHAMP_ETAT_DERIVE.test(cochee)).toBe(false);
    expect(CHAMP_ETAT_DERIVE.test(cachee)).toBe(true);
    expect(CHAMP_ETAT_DERIVE.test('<select name="status" defaultValue={current}>')).toBe(
      true,
    );
  });

  it("relie le gestionnaire à SA déclaration, sous ses trois formes", () => {
    const lignes = [
      "  const { state, pending, onSubmit } = useActionForm(a);",
      "  const {",
      "    onSubmit: statusSubmit,",
      "  } = useActionForm(b, {",
      "    reloadOnSuccess: true,",
      "  });",
      "  const statusForm = useActionForm(c);",
    ];
    const d = declarationsParGestionnaire(lignes);
    expect(porteLeRechargement(d.get("onSubmit")!)).toBe(false);
    expect(porteLeRechargement(d.get("statusSubmit")!)).toBe(true);
    expect(d.has("statusForm.onSubmit")).toBe(true);
  });

  it("n'accepte le rendu local que si le statut canonique est réellement appliqué", () => {
    const renduLocal = [
      "const { onSubmit } = useActionForm(updateCampaign, {",
      "  refreshOnSuccess: false,",
      "  onSuccess: ({ status: nextStatus }) => {",
      "    if (nextStatus) setStatus(nextStatus);",
      "  },",
      "});",
    ].join("\n");
    const simpleSucces = [
      "const { onSubmit } = useActionForm(updateCampaign, {",
      "  refreshOnSuccess: false,",
      "  onSuccess: () => setStatus(\"active\"),",
      "});",
    ].join("\n");
    expect(porteLaValeurCanoniqueLocale(renduLocal)).toBe(true);
    expect(porteLaValeurCanoniqueLocale(simpleSucces)).toBe(false);
  });

  it("suit une constante d'options, sinon la factorisation défait la garde", () => {
    const source = [
      "const BASCULE = { reloadOnSuccess: true } as const;",
      "const AUTRE = { resetOnSuccess: true };",
    ].join("\n");
    const constantes = constantesDeRechargement(source);
    expect(constantes).toEqual(["BASCULE"]);
    expect(porteLeRechargement("useActionForm(a, BASCULE)", constantes)).toBe(true);
    expect(porteLeRechargement("useActionForm(a, AUTRE)", constantes)).toBe(false);
    expect(porteLeRechargement("useActionForm(a)", constantes)).toBe(false);
  });

  it("isole le composant, pas le fichier — sinon les `onSubmit` se confondent", () => {
    // `merchant-controls.tsx` porte onze composants qui nomment tous leur
    // gestionnaire `onSubmit` : sans bornage, la déclaration de l'un
    // couvrirait le manque de l'autre.
    const lignes = [
      "export function AvecReload() {",
      "  const { onSubmit } = useActionForm(a, { reloadOnSuccess: true });",
      "}",
      "export function SansRien() {",
      "  const { onSubmit } = useActionForm(b);",
      "}",
    ];
    const [d1, f1] = bornesDuComposant(lignes, 4);
    expect(
      porteLeRechargement(
        declarationsParGestionnaire(lignes.slice(d1, f1)).get("onSubmit")!,
      ),
    ).toBe(false);
    const [d2, f2] = bornesDuComposant(lignes, 1);
    expect(
      porteLeRechargement(
        declarationsParGestionnaire(lignes.slice(d2, f2)).get("onSubmit")!,
      ),
    ).toBe(true);
  });
});
