import {
  definitionEtape,
  hrefEtape,
  type EtapeAtelier,
} from "@/components/dashboard/atelier-etapes";

/**
 * LES SIX ÉTAPES DE L'ATELIER DU CHAMPIONNAT — déclinaison PRONOSTICS des
 * primitives de `atelier-etapes.ts`.
 *
 * Elle vit dans son propre module parce qu'elle a TROIS lecteurs : la page
 * détail (le shell d'étapes), l'étape de vérification (qui nomme l'étape à
 * corriger) et `createContest` (qui atterrit sur la première). Une const
 * locale aurait obligé à recopier les clés dans une action serveur.
 *
 * ── POURQUOI L'ORDRE EST CELUI-LÀ ──
 *
 * « Le barème » vient APRÈS « Les questions », et ce n'est pas un choix de
 * confort : les blocs de paliers génériques n'existent que pour les types de
 * questions RÉELLEMENT créés (`ContestScoringForm` filtre sur `questionTypes`).
 * Régler le barème avant d'avoir posé les questions est structurellement
 * impossible — l'écran serait vide ou, pire, ne montrerait que le barème des
 * scores sur un événement qui n'en aura jamais.
 *
 * ── DEUX VISAGES DE LA ROUTE ──
 *
 * L'étape vit dans la query string de `/dashboard/pronostics/[id]` : sans
 * `?etape=`, la page rend la vue SUIVI (classement, clôture, palmarès). C'est
 * ce qui garde valides les 15 `revalidatePath(/dashboard/pronostics/${id})` de
 * `src/actions/pronostics.ts` — une sous-route les aurait rendus muets pour
 * l'écran d'édition.
 */
export type EtapeContest =
  | "championnat"
  | "matchs"
  | "questions"
  | "bareme"
  | "recompenses"
  | "verification";

export const ETAPES_CONTEST = [
  {
    cle: "championnat",
    titre: "Le championnat",
    resume: "Le nom, les données demandées à l'inscription, la validité des codes.",
  },
  {
    cle: "matchs",
    titre: "Les matchs",
    resume: "Les rencontres à pronostiquer et le verrouillage par défaut.",
  },
  {
    cle: "questions",
    titre: "Les questions",
    resume: "Ce que vous demandez en plus des matchs, et la subsidiaire.",
  },
  {
    cle: "bareme",
    titre: "Le barème",
    resume: "Combien rapporte chaque bonne réponse.",
  },
  {
    cle: "recompenses",
    titre: "Les récompenses",
    resume: "Ce que gagnent vos clients selon leur rang final.",
  },
  {
    cle: "verification",
    titre: "La vérification",
    resume: "Ce qu'il reste à faire avant d'ouvrir aux joueurs.",
  },
] as const satisfies readonly EtapeAtelier[];

export function baseAtelierContest(contestId: string): string {
  return `/dashboard/pronostics/${contestId}`;
}

/**
 * URL d'une étape de l'atelier du championnat. `page` (pagination du
 * classement) est accepté comme PORTEUR, même si la pagination ne vit
 * aujourd'hui que sur la vue suivi : le jour où le classement passerait sous
 * une étape, l'URL se construirait ici et nulle part ailleurs.
 */
export function hrefEtapeContest(
  contestId: string,
  cle: EtapeContest,
  porteurs?: { page?: string | null },
): string {
  return hrefEtape(baseAtelierContest(contestId), cle, {
    page: porteurs?.page,
  });
}

export function definitionEtapeContest(cle: EtapeContest): EtapeAtelier {
  return definitionEtape(ETAPES_CONTEST, cle) ?? ETAPES_CONTEST[0];
}
