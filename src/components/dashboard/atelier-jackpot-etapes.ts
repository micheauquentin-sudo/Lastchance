import {
  definitionEtape,
  hrefEtape,
  type EtapeAtelier,
} from "@/components/dashboard/atelier-etapes";
import type { JackpotValidationMode } from "@/types/database";

/**
 * LES ÉTAPES DE L'ATELIER DU JACKPOT — la déclinaison cagnotte des primitives.
 *
 * ── POURQUOI TROIS, ET UNE SEULE QUI ÉCRIT ──
 *
 * `updateJackpotCampaign` réécrit QUATORZE colonnes en bloc à chaque
 * enregistrement (`campaignFieldsForMode`). Un champ non rendu n'y est jamais
 * « absent » : `public_slug` retomberait à null (tous les QR imprimés
 * cesseraient de pointer sur l'adresse lisible), `reward_label` à "" (lot
 * effacé, activation bloquée), `display_base`/`display_increment` à 0 — en
 * silence. Découper cette carte en plusieurs étapes exigerait donc de reposter
 * les champs des autres en caché, c'est-à-dire exactement la classe que les
 * gardes de `champ-formulaire` existent pour fermer.
 *
 * La carte « Réglages » reste donc UNE étape entière et indivisible. Le
 * découpage honnête est ailleurs : ce qu'on prépare (les réglages), ce qu'on
 * installe en salle (l'écran comptoir) et ce qu'on vérifie avant d'ouvrir.
 *
 * ── L'ÉCRAN COMPTOIR N'EXISTE QUE DANS UN MODE ──
 *
 * En « Validation en caisse », `getJackpotCounterCode` rend `code: null` :
 * l'écran comptoir n'y produit aucun code. La liste d'étapes est donc
 * CONSTRUITE à partir du mode — proposer un geste qui ne produit rien dans la
 * moitié des configurations est ce que la page détail faisait déjà, et c'est
 * ce qu'on corrige ici.
 */
export type EtapeJackpot = "reglages" | "comptoir" | "verification";

const ETAPE_REGLAGES = {
  cle: "reglages",
  titre: "Les réglages",
  resume: "Le nom, la participation, le tirage, le lot et l'affichage.",
} as const satisfies EtapeAtelier;

const ETAPE_COMPTOIR = {
  cle: "comptoir",
  titre: "L'écran comptoir",
  resume: "L'écran à installer face aux clients, avec le code tournant.",
} as const satisfies EtapeAtelier;

const ETAPE_VERIFICATION = {
  cle: "verification",
  titre: "La vérification",
  resume: "Ce qu'il reste à faire avant d'ouvrir la cagnotte.",
} as const satisfies EtapeAtelier;

/** Les étapes réellement utiles pour CE mode de participation. */
export function etapesJackpot(
  validationMode: JackpotValidationMode,
): readonly EtapeAtelier[] {
  return validationMode === "rotating_code"
    ? [ETAPE_REGLAGES, ETAPE_COMPTOIR, ETAPE_VERIFICATION]
    : [ETAPE_REGLAGES, ETAPE_VERIFICATION];
}

export function baseAtelierJackpot(campaignId: string): string {
  return `/dashboard/jackpot/${campaignId}`;
}

export function hrefEtapeJackpot(campaignId: string, cle: string): string {
  return hrefEtape(baseAtelierJackpot(campaignId), cle);
}

/** Titre d'une étape, pour la nommer depuis la vérification. */
export function titreEtapeJackpot(
  etapes: readonly EtapeAtelier[],
  cle: string,
): string {
  return definitionEtape(etapes, cle)?.titre ?? ETAPE_REGLAGES.titre;
}
