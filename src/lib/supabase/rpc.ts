import type {
  PostgrestSingleResponse,
  SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/* ── POURQUOI CE MODULE EXISTE ───────────────────────────────
 *
 * Typer les clients serveur `<Database>` a fermé trois zones aveugles, mais
 * pas celle-ci : un argument **optionnel mal orthographié**, sous un nom de
 * fonction valide, COMPILE.
 *
 *     admin.rpc("credit_sms_balance", { p_referenc: "abc", ... })  // vert
 *
 * La cause est dans postgrest-js : la signature est
 * `rpc<FnName, Args extends Schema["Functions"][FnName]["Args"]>(fn, args?: Args)`.
 * `Args` est INFÉRÉ depuis le littéral, il n'est donc jamais la cible d'une
 * affectation — et le contrôle de propriétés excédentaires de TypeScript ne
 * s'applique qu'à une cible connue. La contrainte `extends Args`, elle, passe :
 * tous les arguments manquants sont optionnels, donc `{ p_referenc: string }`
 * est structurellement assignable. `GetRpcFunctionFilterBuilderByArgs` retombe
 * alors sur sa branche de rétro-compatibilité (`LastOf<...>`) au lieu d'échouer.
 *
 * Conséquence à l'exécution : l'argument est IGNORÉ et la fonction Postgres
 * s'exécute avec sa valeur par défaut. Sur un chemin de paiement, un
 * `p_source_reference` mal tapé ferait perdre l'idempotence — silencieusement,
 * après encaissement.
 *
 * Ce que le typage attrapait déjà, et attrape toujours : nom de fonction
 * inexistant, argument REQUIS manquant, argument du mauvais TYPE.
 *
 * `rpcStrict` ajoute la seule pièce absente : les clés passées doivent être
 * EXACTEMENT celles de `Args`. On ne modifie pas les ~180 appels existants —
 * le wrapper est adopté par les chemins où une clé ignorée coûte de l'argent.
 * ─────────────────────────────────────────────────────────── */

type PublicFunctions = Database["public"]["Functions"];

/** Nom de fonction Postgres exposée au schéma `public`. */
export type RpcName = keyof PublicFunctions & string;

type RpcArgs<Fn extends RpcName> = PublicFunctions[Fn]["Args"];
type RpcReturns<Fn extends RpcName> = PublicFunctions[Fn]["Returns"];

/**
 * Union de TOUTES les clés admises par `Fn`.
 *
 * Distributif à dessein : une fonction Postgres surchargée est représentée par
 * une union de définitions, et `keyof (X | Y)` ne rendrait que les clés
 * COMMUNES — on rejetterait alors un argument parfaitement valide qui
 * n'appartient qu'à une des surcharges. On préfère ici la sur-permissivité sur
 * les surcharges à un faux positif : la faute qu'on traque est une clé qui
 * n'existe dans AUCUNE définition.
 */
type RpcArgKeys<Fn extends RpcName> = PublicFunctions[Fn] extends {
  Args: infer A;
}
  ? keyof A
  : never;

/**
 * Mappé **homomorphe** sur `A` : c'est ce qui permet à TypeScript d'inférer
 * `A` à rebours depuis le littéral passé en argument, tout en imposant `never`
 * à toute clé étrangère.
 *
 * Le refus prend deux formes selon le contexte, les deux observées :
 * - nom de fonction LITTÉRAL (le cas de tous les appels réels) — la cible est
 *   concrète, le contrôle de propriétés excédentaires reprend la main et rend
 *   TS2561, avec la correction suggérée : « 'p_source_referenc' does not exist
 *   […] Did you mean to write 'p_source_reference'? » ;
 * - nom de fonction encore générique — TS2322, « Type 'string' is not
 *   assignable to type 'never' », pointé sur la clé fautive.
 */
type ArgsExacts<Fn extends RpcName, A> = {
  [K in keyof A]: K extends RpcArgKeys<Fn> ? A[K] : never;
};

/** Les deux clients serveur du dépôt partagent ce type. */
type ServerClient = SupabaseClient<Database>;

/**
 * `client.rpc(fn, args)`, mais les clés de `args` doivent être exactement
 * celles de la fonction.
 *
 * - clé étrangère (faute de frappe sur un argument optionnel) → ERREUR ;
 * - argument requis manquant → ERREUR (contrainte `A extends RpcArgs<Fn>`) ;
 * - mauvais type → ERREUR (idem) ;
 * - nom de fonction inconnu → ERREUR (contrainte `Fn extends RpcName`).
 *
 * Le résultat est celui de `.rpc()` attendu : `{ data, error }` discriminé, et
 * `data` reste PRÉCIS (`Returns` de la fonction) — vérifié par `rpc.test.ts`,
 * qui refuserait un `any` silencieux. Les appels qui enchaînent (`.single()`,
 * `.eq()`) restent sur `.rpc()` direct ; à ce jour un seul appel du dépôt le
 * fait, et il est sans argument.
 *
 * Aucun cast n'est nécessaire ici : la contrainte `A extends RpcArgs<Fn>`
 * suffit à `client.rpc()`, le mappé n'ajoutant qu'un refus de clés.
 */
export async function rpcStrict<Fn extends RpcName, A extends RpcArgs<Fn>>(
  client: ServerClient,
  fn: Fn,
  args: ArgsExacts<Fn, A>,
): Promise<PostgrestSingleResponse<RpcReturns<Fn>>> {
  return await client.rpc(fn, args);
}
