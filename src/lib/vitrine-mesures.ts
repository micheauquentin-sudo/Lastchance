import { VITRINE_ACTIONS, type ActionVitrine } from "@/lib/vitrine";

/**
 * VIT-9 — LE CONTRAT DES COMPTEURS, PARTAGÉ PAR LES DEUX BOUTS.
 *
 * Ce module est lu par le NAVIGATEUR (qui accumule) et par la ROUTE (qui filtre
 * avant d'écrire). Une seule définition de ce qui est recevable : deux copies
 * auraient divergé au premier type ajouté, et le désaccord se serait vu comme
 * un compteur qui n'avance pas — le plus difficile des défauts à remarquer.
 *
 * ── CE QU'UNE MESURE PORTE, ET RIEN DE PLUS ──
 *
 * Un type et une référence. Pas d'horodatage — la base pose le jour —, pas
 * d'incrément — chaque entrée vaut `+1` —, pas d'identifiant de visiteur : il
 * n'en existe aucun à porter.
 */

/** Les quatre types comptés. `ouverture` n'y est pas : `module_page_opens` la compte déjà. */
export const TYPES_MESURE = ["carte", "rubrique", "fiche", "action"] as const;

export type TypeMesure = (typeof TYPES_MESURE)[number];

export interface MesureVitrine {
  type: TypeMesure;
  ref: string;
}

/**
 * Le plafond d'un envoi, aligné sur celui de la RPC.
 *
 * Un visiteur qui déroule une carte de soixante plats en voit soixante : le
 * plafond coupe, et c'est assumé — au-delà, ce qui manque est la queue de la
 * carte, celle qui compte le moins dans « ce qui attire ».
 */
export const MESURE_VITRINE_MAX = 60;

/** Longueur maximale d'une référence, alignée sur le `check` de la colonne. */
export const MESURE_REF_MAX = 64;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Cette mesure est-elle recevable ?
 *
 * LES TROIS TYPES DE CONTENU EXIGENT UN UUID, et le type `action` une valeur du
 * vocabulaire fermé. Sans ces deux bornes, une route publique aurait laissé
 * écrire n'importe quelle chaîne de 64 caractères dans une table indexée — un
 * moyen bon marché de la faire grossir, et de rendre illisible le tableau du
 * commerçant.
 */
export function mesureRecevable(valeur: unknown): valeur is MesureVitrine {
  if (typeof valeur !== "object" || valeur === null) return false;
  const { type, ref } = valeur as { type?: unknown; ref?: unknown };
  if (typeof ref !== "string" || ref.length === 0 || ref.length > MESURE_REF_MAX) {
    return false;
  }
  if (type === "action") {
    return (VITRINE_ACTIONS as readonly string[]).includes(ref);
  }
  return (
    (type === "carte" || type === "rubrique" || type === "fiche") && UUID.test(ref)
  );
}

/**
 * Les mesures recevables d'une charge quelconque, DÉDOUBLONNÉES.
 *
 * Le dédoublonnage n'est pas une optimisation : un visiteur qui remonte puis
 * redescend la carte repasse devant les mêmes fiches, et compter chaque
 * passage aurait fait d'un défilement nerveux une popularité. Une vue par
 * contenu et par chargement de page — c'est ce que « consultée » veut dire.
 */
export function mesuresRecevables(valeur: unknown): MesureVitrine[] {
  if (!Array.isArray(valeur)) return [];
  const vues = new Set<string>();
  const sortie: MesureVitrine[] = [];
  for (const entree of valeur) {
    if (!mesureRecevable(entree)) continue;
    const cle = `${entree.type}:${entree.ref}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    sortie.push({ type: entree.type, ref: entree.ref });
  }
  return sortie;
}

/** Le libellé d'une porte dans le tableau du commerçant. */
export function estActionConnue(ref: string): ref is ActionVitrine {
  return (VITRINE_ACTIONS as readonly string[]).includes(ref);
}

/* ────────────────────────────────────────────────────────────
   Ce que le tableau de bord lit (VIT-9)
   ──────────────────────────────────────────────────────────── */

export interface ContenuMesureView {
  type: TypeMesure;
  ref: string;
  vues: number;
}

export interface ActionMesureView {
  ref: string;
  clics: number;
}

export interface MesuresVitrineView {
  jours: number;
  langues: { fr: number; en: number };
  contenus: ContenuMesureView[];
  actions: ActionMesureView[];
}

/** Le repli : une fenêtre vide, jamais un refus. */
export function mesuresVides(jours = 7): MesuresVitrineView {
  return { jours, langues: { fr: 0, en: 0 }, contenus: [], actions: [] };
}

function entier(brut: unknown): number {
  return typeof brut === "number" && Number.isFinite(brut) && brut >= 0
    ? Math.trunc(brut)
    : 0;
}

/**
 * La réponse de `vitrine_mesures_state` → la vue.
 *
 * REPLI FERMÉ, motif du dépôt : un document illisible rend une fenêtre VIDE et
 * non une erreur. Le commerçant a le droit de voir cet écran ; il n'a
 * simplement rien à y lire — et confondre les deux lui ferait croire que son
 * abonnement a changé.
 */
export function mapMesuresVitrine(brut: unknown): MesuresVitrineView {
  if (typeof brut !== "object" || brut === null) return mesuresVides();
  const racine = brut as Record<string, unknown>;

  const langues =
    typeof racine.langues === "object" && racine.langues !== null
      ? (racine.langues as Record<string, unknown>)
      : {};

  const contenus = Array.isArray(racine.contenus) ? racine.contenus : [];
  const actions = Array.isArray(racine.actions) ? racine.actions : [];

  return {
    jours: entier(racine.jours) || 7,
    langues: { fr: entier(langues.fr), en: entier(langues.en) },
    contenus: contenus
      .map((ligne) => {
        if (typeof ligne !== "object" || ligne === null) return null;
        const { type, ref, vues } = ligne as Record<string, unknown>;
        if (typeof ref !== "string") return null;
        if (type !== "carte" && type !== "rubrique" && type !== "fiche") {
          return null;
        }
        return { type, ref, vues: entier(vues) };
      })
      .filter((l): l is ContenuMesureView => l !== null),
    actions: actions
      .map((ligne) => {
        if (typeof ligne !== "object" || ligne === null) return null;
        const { ref, clics } = ligne as Record<string, unknown>;
        return typeof ref === "string"
          ? { ref, clics: entier(clics) }
          : null;
      })
      .filter((l): l is ActionMesureView => l !== null),
  };
}
