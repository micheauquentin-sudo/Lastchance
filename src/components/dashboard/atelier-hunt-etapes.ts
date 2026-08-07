import {
  definitionEtape,
  hrefEtape,
  type EtapeAtelier,
} from "@/components/dashboard/atelier-etapes";

/**
 * LES QUATRE ÉTAPES DE L'ATELIER DE LA CHASSE — déclinaison des primitives.
 *
 * L'étape vit dans la query string de `/dashboard/hunts/[id]`, JAMAIS dans une
 * sous-route : les dix `revalidatePath("/dashboard/hunts/<id>")` de
 * `src/actions/hunts.ts` visent la page nue, et la revalidation ignore la
 * query. Une route `/dashboard/hunts/[id]/atelier` aurait fait de ces dix
 * appels des chemins morts — l'écran aurait affiché des données périmées après
 * chaque « Enregistrer ».
 *
 * ── POURQUOI « LA CHASSE ET SON LOT » EST L'ÉTAPE 1 ──
 *
 * Parce que c'est elle que `liens.editeur` de la Carte de l'Aventure désigne.
 * Aujourd'hui cette carte pointe `#reglages`, une ancre qui MENT : elle
 * enveloppe l'éditeur d'étapes, pas les réglages (hunts/[id]/page.tsx). Le
 * commerçant qui suit « Compléter les réglages » n'arrive donc jamais sur le
 * lot final — la précondition de publication qu'on lui demande de remplir.
 * L'atelier corrige ce défaut ; il ne le transpose pas.
 *
 * Ce module a TROIS lecteurs — la page, l'étape de vérification (qui nomme
 * l'étape à corriger) et `createHunt` (qui atterrit sur la première) : une
 * const locale à la page aurait obligé à recopier ces libellés.
 */
export type EtapeChasse = "chasse" | "parcours" | "affiches" | "verification";

export const ETAPES_CHASSE = [
  {
    cle: "chasse",
    titre: "La chasse et son lot",
    resume: "Le nom, l'ordre des étapes, la fenêtre de jeu et le lot final.",
  },
  {
    cle: "parcours",
    titre: "Le parcours",
    resume: "Les étapes à tamponner et leurs indices, dans l'ordre.",
  },
  {
    cle: "affiches",
    titre: "Les affiches",
    resume: "Un QR code par étape, à imprimer et poser sur place.",
  },
  {
    cle: "verification",
    titre: "La vérification",
    resume: "Ce qu'il reste à faire avant d'ouvrir aux joueurs.",
  },
] as const satisfies readonly EtapeAtelier[];

/** La page détail elle-même : l'atelier n'a pas de route à lui. */
export function baseAtelierChasse(huntId: string): string {
  return `/dashboard/hunts/${huntId}`;
}

/** URL d'une étape de l'atelier. L'URL NUE de la même page est la vue suivi. */
export function hrefEtapeChasse(huntId: string, cle: EtapeChasse): string {
  return hrefEtape(baseAtelierChasse(huntId), cle);
}

export function definitionEtapeChasse(cle: EtapeChasse): EtapeAtelier {
  return definitionEtape(ETAPES_CHASSE, cle) ?? ETAPES_CHASSE[0];
}
