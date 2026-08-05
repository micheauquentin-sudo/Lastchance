import type { Json } from "@/types/database.generated";

/**
 * Valeur applicative que l'on écrit dans une colonne `jsonb`.
 *
 * ── POURQUOI CE PASSAGE EXISTE ──
 *
 * Le type `Json` du générateur exige, pour un objet, une index signature
 * (`{ [k: string]: Json | undefined }`). TypeScript ne l'accorde jamais
 * implicitement à une `interface` — `WheelTheme`, `BlueprintAsset`,
 * `EngagementActionConfig`… — ni à un `Record<string, unknown>`, alors même que
 * tous leurs champs sont des scalaires JSON. Le refus est structurel, pas
 * métier : postgrest sérialise ces valeurs telles quelles et la colonne les
 * accepte. Une vingtaine de sites tombaient dessus ; ils passent tous par ici
 * plutôt que par une vingtaine de conversions recopiées.
 *
 * ── CE QUE CE PASSAGE NE VÉRIFIE PAS ──
 *
 * `object` ne distingue pas un objet nu d'une `Date`, d'une `Map` ou d'une
 * instance de classe : y passer l'une d'elles écrirait `{}` en base sans que
 * rien ne le signale. La borne qui tient est ailleurs : `unknown` est REFUSÉ.
 * Une valeur dont le type ne dit rien doit être validée (Zod) ou typée à sa
 * source avant d'arriver ici — c'est ce qui a été fait pour les réponses de
 * quiz et de pronostics (`quizAnswerToJson`, `contestAnswerToJson`), qui
 * rendent désormais un `Json` au lieu d'un `unknown`.
 */
type JsonWritable = Json | object;

/** Convertit une valeur déjà sérialisable en `Json`. Voir `JsonWritable`. */
export function toJson(value: JsonWritable): Json {
  return value as Json;
}
