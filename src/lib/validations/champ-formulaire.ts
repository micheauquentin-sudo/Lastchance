import { z } from "zod";

/**
 * UN CHAMP NON RENDU N'EST PAS UN CHAMP VIDE — le point unique de la classe.
 *
 * ── LE FAIT ──────────────────────────────────────────────────
 *
 * `FormData.get` rend **`null`** — pas `undefined` — pour un champ qui n'existe
 * pas dans le formulaire soumis. C'est le cas NORMAL, pas l'exception : un champ
 * rendu sous condition, une case décochée, un `<select>` sans sélection, un
 * `<fieldset>` masqué par l'onglet voisin. Or `.default()` et `.optional()`
 * n'absorbent qu'`undefined`. Un schéma qui ne dit rien de `null` tombe donc
 * dans l'un des DEUX modes de panne suivants — jamais entre les deux.
 *
 * ── MODE BRUYANT : le refus incompréhensible ─────────────────
 *
 * Un schéma de texte reçoit `null` et échoue sur « expected string, received
 * null » avant d'atteindre la moindre règle métier. Le commerçant lit « Données
 * invalides » sur un formulaire qu'il a rempli correctement.
 *
 * Coût mesuré : **aucun octroi `recurring` n'était créable depuis le
 * back-office**, ni aucun pass à activer plus tard — le panneau ne rend
 * « durée » que pour un pass immédiat et « délai » que pour un pass différé.
 *
 * ── MODE SILENCIEUX : le zéro qui ne dit rien ────────────────
 *
 * Le plus grave des deux, et le seul qui ne se voie jamais. `Number(null)`
 * vaut **`0`** : un `z.coerce.number().min(0)` accepte donc `null` et rend `0`,
 * sans la moindre erreur. Un formulaire qui ne rend pas « poids » crée un lot de
 * poids 0 — jamais tiré, jamais signalé. Un barème de pronostics dont le
 * fieldset est masqué passe à 0 point sur les trois paliers, et le classement
 * s'aplatit sans que rien ne rougisse.
 *
 * Ce mode se dissimule d'autant mieux que sa borne basse le couvre : un champ
 * `min(1)` refuse `null` par accident (0 < 1), un champ `min(0)` l'avale. La
 * même faute est donc bruyante ou muette selon une borne qui n'a rien à voir.
 *
 * ── POURQUOI LA CORRECTION EST ICI, ET PAS CHEZ L'APPELANT ───
 *
 * Un audit du dépôt a compté **131 des 362 lectures de `FormData` déjà
 * protégées par un `??` ou un `formData.has()`** — et ce filet, posé site par
 * site, avait quand même laissé fuir les cas ci-dessus. Corriger chez l'appelant
 * demande de ne jamais oublier, sur chaque formulaire écrit demain ; corriger
 * ici vaut d'avance. La règle du dépôt qui en découle (docs/bugs.md) : **le
 * filet d'appelant se SUPPRIME quand le schéma est corrigé, jamais doublé** —
 * un `??` laissé en place masque la régression du schéma le jour où elle revient.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ─────────────────────────────
 *
 * Il ne touche pas aux schémas qui valident du **JSON interne** (blueprint d'un
 * modèle de campagne, configs relues en base, entrées d'actions typées). Ceux-là
 * ne reçoivent jamais de `FormData` : pour eux, un `null` est une CORRUPTION, et
 * la tolérance la masquerait. Ils restent stricts, et le test de couverture
 * `champ-formulaire-coverage.test.ts` les nomme un par un avec leur raison.
 *
 * Il n'utilise pas non plus `z.preprocess` comme point d'entrée : en zod 4 il
 * type l'entrée en `unknown`, ce qui ferait perdre au passage la vérification
 * que l'appelant fournit bien le bon type. La tolérance est donc TOUJOURS
 * explicite — `.nullable()` — jamais dérivée d'un cast.
 */

/**
 * Le cœur commun : `null` (champ non rendu) et l'absence donnent **la même
 * valeur**. C'est l'invariant que le test de couverture vérifie schéma par
 * schéma — et c'est pour cela qu'il est écrit une fois ici plutôt que recopié.
 */
export function nonRenduVaut<S extends z.ZodType>(
  base: S,
  valeur: Exclude<z.output<S>, undefined>,
) {
  return base
    .nullable()
    .default(valeur)
    .transform((saisie) => saisie ?? valeur);
}

/**
 * Texte facultatif d'un formulaire. Sortie `string` — JAMAIS `string | null` :
 * ces champs partent dans des colonnes texte où `null` dirait autre chose que
 * « vide », et élargir le type de sortie casserait les insertions Supabase qui
 * les consomment.
 *
 * `base` porte les bornes métier (`trim`, `max`, `regex`, `refine`) et reste
 * donc la seule autorité sur ce qui est VALIDE ; ce helper n'ajoute que la
 * tolérance à l'absence.
 */
export function texteOptionnel(base: z.ZodType<string, string>, defaut = "") {
  return nonRenduVaut(base, defaut);
}

/**
 * Champ « vide OU valeur » d'un formulaire — la forme
 * `z.union([z.literal(""), …])` déjà répandue dans ce dossier. Le champ non
 * rendu vaut la chaîne vide, c'est-à-dire exactement ce que vaut un champ rendu
 * mais laissé vide.
 */
export function videSiNonRendu<O extends string | number>(
  base: z.ZodType<O | "", unknown>,
) {
  return nonRenduVaut(base, "");
}

/**
 * Champ d'une MISE À JOUR PARTIELLE : le champ non rendu est lu comme une
 * ABSENCE (« ne change pas cette colonne »), pas comme une valeur.
 *
 * À ne pas confondre avec `texteOptionnel` : ici `null` et `""` disent deux
 * choses différentes — l'un « je n'ai pas ce champ à l'écran », l'autre « efface
 * cette valeur ». Les actions qui doivent distinguer les deux gardent un
 * `formData.has(...)` explicite ; ce helper sert celles qui ne le distinguent
 * pas et pour qui l'absence est la seule lecture possible d'un `null`.
 */
export function absentSiNonRendu<S extends z.ZodType>(base: S) {
  return base
    .nullable()
    .optional()
    .transform((saisie) => saisie ?? undefined);
}

/**
 * Un entier saisi dans un formulaire ; vide = absent, jamais zéro.
 *
 * Sortie `number | null`. Remonté ici depuis `validations/admin.ts`, où il
 * était le seul de son espèce ; il l'est resté jusqu'à ce module.
 *
 * NOTE HISTORIQUE, corrigée : le commentaire d'origine affirmait que
 * `tiebreakerNumberSchema` « portait déjà cette tolérance ». C'était **faux** —
 * il s'écrivait `z.union([z.literal(""), z.coerce.number()…])` SANS `.nullable()`,
 * donc `null` y devenait `0` en silence, mode silencieux caractérisé. Seuls
 * `codeTtlDaysSchema` et `codeTtlSecondsSchema` la portaient réellement. Un
 * commentaire qui certifie l'état d'un pair sans que rien ne le vérifie finit
 * par dire le contraire de ce qui est livré : c'est le test de couverture, et
 * non cette phrase, qui tient désormais la promesse.
 */
export const entierOptionnel = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), {
    message: "Valeur invalide.",
  })
  .nullable()
  .default(null);

/** Bornes et messages d'un nombre REQUIS de formulaire. */
export interface BornesNombreRequis {
  /**
   * Ce que lit l'utilisateur quand le champ n'a PAS ÉTÉ RENDU. Obligatoire et
   * sans valeur par défaut : un message générique ramènerait le « Données
   * invalides » que ce module existe pour supprimer.
   */
  absent: string;
  /** Message quand la saisie n'est pas un nombre du tout (« abc »). */
  nombre: string;
  /** Message quand un entier est exigé — omis, les décimales sont admises. */
  entier?: string;
  min: [number, string];
  max: [number, string];
}

/**
 * Un nombre REQUIS saisi dans un formulaire — la fermeture du mode silencieux.
 *
 * `null` (champ non rendu) produit un **refus explicite** portant un message
 * métier, jamais le `0` de `Number(null)`. La distinction est celle-ci, et elle
 * est volontaire :
 *
 *   · `null`  → REFUS. Le champ n'était pas à l'écran : personne n'a rien
 *               décidé, et écrire 0 à la place d'une décision absente est le
 *               défaut qu'on ferme.
 *   · `"0"`   → **0, accepté** partout où la borne basse l'admet. Un zéro SAISI
 *               est une décision (« palier désactivé », « poids nul »), et ce
 *               module n'a aucune raison de la refuser.
 *
 * ⚠️ Le champ rendu mais LAISSÉ VIDE (`""`) continue de valoir `0` par
 * coercition. Ce n'est pas un oubli : c'est le comportement d'origine, il est
 * hors du périmètre de cette classe (le champ, lui, a bien été rendu), et le
 * changer refuserait des enregistrements aujourd'hui acceptés. Un champ dont le
 * vide ne doit pas valoir zéro s'écrit avec `videSiNonRendu`.
 */
export function nombreRequis(bornes: BornesNombreRequis) {
  let borne = z.number();
  if (bornes.entier !== undefined) borne = borne.int(bornes.entier);
  borne = borne.min(bornes.min[0], bornes.min[1]).max(bornes.max[0], bornes.max[1]);

  return (
    z
      // L'entrée est NOMMÉE plutôt que laissée à `unknown` : `null` doit être
      // une branche reconnue pour qu'on puisse la refuser AVEC un message, et
      // non une valeur qui se faufile jusqu'à la coercition.
      .union([z.string(), z.number(), z.null()], { error: bornes.absent })
      .transform((saisie, ctx) => {
        if (saisie === null) {
          // Un `z.union` essaierait TOUTES ses branches et retiendrait celle qui
          // RÉUSSIT : `z.coerce.number()` acceptant `null` (→ 0), une branche de
          // refus posée en parallèle ne serait jamais retenue. Le refus doit
          // donc court-circuiter AVANT la coercition — d'où ce transform, et non
          // une quatrième branche d'union.
          ctx.addIssue({ code: "custom", message: bornes.absent });
          return z.NEVER;
        }
        // Même conversion que `z.coerce.number()` (qui appelle `Number`), mais
        // écrite ici pour que le message du « ce n'est pas un nombre » soit le
        // nôtre plutôt que « expected number, received NaN ».
        const valeur = typeof saisie === "number" ? saisie : Number(saisie.trim());
        if (Number.isNaN(valeur)) {
          ctx.addIssue({ code: "custom", message: bornes.nombre });
          return z.NEVER;
        }
        return valeur;
      })
      .pipe(borne)
  );
}

/** Raccourci du cas courant : un ENTIER requis (`nombreRequis` + `.int()`). */
export function entierRequis(
  bornes: BornesNombreRequis & { entier: string },
) {
  return nombreRequis(bornes);
}

/**
 * Case à cocher sérialisée en « true » / « false » par un champ caché (patron du
 * back-office, où l'état voulu est POSTÉ plutôt que déduit de la présence).
 *
 * Le champ non rendu vaut « décochée » — la seule lecture possible : un panneau
 * qui n'affiche pas l'option ne demande pas de l'activer. Une valeur HORS des
 * deux littéraux reste refusée : la tolérance porte sur l'absence, jamais sur la
 * saisie.
 */
export const caseACochee = z
  .enum(["true", "false"])
  .nullable()
  .default("false")
  .transform((valeur) => valeur === "true");
