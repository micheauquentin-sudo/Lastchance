import "server-only";

import { optionalEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import type { ExperienceObjective } from "@/platform/experiences/catalog";

/* ════════════════════════════════════════════════════════════
 * LE PRESTATAIRE IA — ASSISTANT DE CRÉATION (DORMANT SANS CLÉ)
 *
 * Même patron que `getSmsProvider()` (src/lib/sms-provider.ts) : la clé vient
 * de l'ENVIRONNEMENT et de nulle part ailleurs — jamais lue en base, jamais
 * journalisée, jamais renvoyée à un écran. `null` n'est pas une erreur : c'est
 * un environnement sans clé (aperçu, dev, CI). L'assistant est alors éteint,
 * l'action serveur refuse proprement, aucun appel réseau n'est tenté.
 *
 * Appel REST DIRECT, SANS SDK (aucune dépendance ajoutée). L'IA PROPOSE, le
 * commerçant valide : ce module ne publie rien, ne paie rien, ne crée aucun
 * brouillon — il rend des propositions structurées, blanchies de toute PII.
 * ════════════════════════════════════════════════════════════ */

/**
 * Modèle économique : le tier le moins cher qui convienne à une sortie
 * structurée simple ($1/$5 par MTok). Constante nommée : facile à changer.
 */
export const IA_MODELE = "claude-haiku-4-5";

const IA_ENDPOINT = "https://api.anthropic.com/v1/messages";
const IA_VERSION = "2023-06-01";
/** Non-streaming reste sûr sous ~16k ; 3 blueprints tiennent largement. */
const IA_MAX_TOKENS = 4096;
const IA_TIMEOUT_MS = 20_000;

/**
 * Entrée BLANCHIE : uniquement ce qui est nécessaire à la suggestion. Aucun
 * objet `Organization` entier, aucune donnée joueur — la construction du
 * littéral est la responsabilité de l'APPELANT (voir suggererIdeesCampagne).
 */
export interface EntreeSuggestion {
  organizationName: string;
  typeCommerce: string;
  objectif: ExperienceObjective;
}

export interface IaProvider {
  suggererBlueprints(entree: EntreeSuggestion): Promise<unknown[]>;
}

/** Y a-t-il de quoi appeler l'assistant ? Sans révéler quoi que ce soit de la clé. */
export function isIaConfigured(): boolean {
  return Boolean(optionalEnv("ANTHROPIC_API_KEY"));
}

/**
 * Le prestataire configuré, ou `null` (sans clé). Jamais d'exception : une
 * absence de configuration n'est pas une panne.
 */
export function getIaProvider(): IaProvider | null {
  const apiKey = optionalEnv("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  return anthropicIaProvider(apiKey);
}

const SYSTEME = [
  "Tu aides un commerçant à CONCEVOIR une campagne de jeu promotionnel (roue de",
  "la fortune). Tu proposes EXACTEMENT trois idées de campagne, éditables,",
  "adaptées au type de commerce et à l'objectif fournis. Tu ne publies rien et",
  "ne déclenches aucune action : tu proposes, le commerçant décide.",
  "",
  "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balise",
  'Markdown, de la forme : { "idees": [ <blueprint>, <blueprint>, <blueprint> ] }',
  "",
  "Chaque <blueprint> a EXACTEMENT cette forme :",
  "{",
  '  "version": 1,',
  '  "texts": { "campaignName": string(1..120), "wheelName": string(1..80), "wheelTitle": string(1..80) },',
  '  "visual": { "preset": "classic" },',
  '  "game": { "game_type": "wheel", "skill_config": null },',
  '  "prizes": [ 2 à 6 lots, chacun :',
  '    { "label": string(1..80), "description": string(<=300, peut être ""),',
  '      "color": "#RRGGBB" (hex 6 chiffres), "weight": entier(0..10000),',
  '      "is_losing": booléen, "stock": entier>=0 ou null, "cost_cents": entier>=0 ou null } ],',
  '  "rules": { "play_limit": "once"|"daily"|"weekly"|"unlimited", "collect_email": booléen,',
  '    "collect_phone": booléen, "code_ttl_seconds": entier(10..600) ou null, "engagement": {},',
  '    "budget_cents": entier>=1 ou null },',
  '  "durationDays": entier(1..365),',
  '  "emails": []',
  "}",
  "",
  "CONTRAINTES IMPÉRATIVES (une idée qui les enfreint est inutilisable) :",
  '- game_type vaut toujours "wheel" et skill_config vaut toujours null.',
  "- Au moins un lot GAGNANT (is_losing = false) par idée.",
  "- Au moins un lot avec weight > 0.",
  '- Les couleurs sont des hex #RRGGBB (ex. "#22d3ee").',
  '- "emails" reste un tableau vide.',
  "- Écris en français, avec des lots concrets et attrayants pour ce commerce.",
].join("\n");

function messageUtilisateur(entree: EntreeSuggestion): string {
  const type = entree.typeCommerce.trim() || "commerce de proximité";
  return [
    `Commerce : ${entree.organizationName}`,
    `Type de commerce : ${type}`,
    `Objectif : ${entree.objectif}`,
    "",
    "Propose trois idées de campagne adaptées.",
  ].join("\n");
}

/**
 * Extrait le tableau `idees` d'une réponse texte. Tolère un éventuel préambule :
 * si le parse direct échoue, on isole le premier objet `{ … }`. Toute forme
 * inattendue rend un tableau vide plutôt qu'une exception.
 */
function extraireIdees(texte: string): unknown[] {
  const tenter = (brut: string): unknown => {
    try {
      return JSON.parse(brut);
    } catch {
      return undefined;
    }
  };

  let json = tenter(texte);
  if (json === undefined) {
    const debut = texte.indexOf("{");
    const fin = texte.lastIndexOf("}");
    if (debut !== -1 && fin > debut) json = tenter(texte.slice(debut, fin + 1));
  }

  if (json && typeof json === "object") {
    const idees = (json as { idees?: unknown }).idees;
    if (Array.isArray(idees)) return idees;
  }
  return [];
}

function anthropicIaProvider(apiKey: string): IaProvider {
  return {
    async suggererBlueprints(entree: EntreeSuggestion): Promise<unknown[]> {
      let res: Response;
      try {
        res = await fetch(IA_ENDPOINT, {
          method: "POST",
          headers: {
            // La clé vit dans l'en-tête, jamais dans le corps ni dans un log.
            "x-api-key": apiKey,
            "anthropic-version": IA_VERSION,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: IA_MODELE,
            max_tokens: IA_MAX_TOKENS,
            system: SYSTEME,
            messages: [{ role: "user", content: messageUtilisateur(entree) }],
          }),
          signal: AbortSignal.timeout(IA_TIMEOUT_MS),
        });
      } catch (err) {
        // Réseau/timeout : rejouable. On ne loge que la NATURE de l'erreur,
        // jamais la clé ni un corps qui pourrait porter des en-têtes.
        reportError(
          "ia-provider.reseau",
          err instanceof Error ? err.name : "erreur réseau",
        );
        return [];
      }

      if (!res.ok) {
        // Ne JAMAIS relayer le corps d'erreur (il peut refléter des en-têtes).
        // On distingue rejouable (429/5xx) de non rejouable (4xx) et on ne loge
        // que le statut.
        const rejouable = res.status === 429 || res.status >= 500;
        reportError(
          "ia-provider.http",
          `statut ${res.status}${rejouable ? " (rejouable)" : ""}`,
        );
        return [];
      }

      let charge: unknown;
      try {
        charge = await res.json();
      } catch {
        return [];
      }

      // On vérifie `stop_reason` AVANT de lire `content` : un `refusal`, un
      // `max_tokens` (JSON tronqué) ou toute issue non nominale rend une liste
      // vide — jamais une exception qui remonterait le corps.
      if ((charge as { stop_reason?: unknown }).stop_reason !== "end_turn") {
        return [];
      }

      const blocs = (charge as { content?: unknown }).content;
      if (!Array.isArray(blocs)) return [];
      const texte = blocs
        .filter(
          (bloc): bloc is { type: string; text: string } =>
            Boolean(bloc) &&
            typeof bloc === "object" &&
            (bloc as { type?: unknown }).type === "text" &&
            typeof (bloc as { text?: unknown }).text === "string",
        )
        .map((bloc) => bloc.text)
        .join("");

      return extraireIdees(texte);
    },
  };
}
