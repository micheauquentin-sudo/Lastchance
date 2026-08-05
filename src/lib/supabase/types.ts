import type { Database as GeneratedDatabase } from "@/types/database.generated";

/**
 * Le générateur Supabase type les arguments de fonction Postgres sans jamais
 * `| null` : une signature SQL (`p_campaign_id uuid default null`) ne porte
 * aucune information de nullabilité, le générateur n'a donc rien à lire et
 * produit `p_campaign_id?: string`. Or passer `NULL` à un argument est légal
 * en SQL et c'est ce que fait le code applicatif partout où une valeur est
 * optionnelle (« pas de campagne rattachée »).
 *
 * On corrige donc à la racine — côté type du client, une fois — plutôt que
 * d'ajouter une conversion `?? undefined` sur chacun des ~48 points d'appel :
 * `undefined` et `null` sérialisent différemment en JSON, et le second est
 * précisément ce que la fonction Postgres attend.
 *
 * Les fonctions sans argument (`Args: Record<PropertyKey, never>`) sont
 * laissées intactes : postgrest-js les reconnaît à cette forme exacte pour
 * autoriser `rpc("fn")` sans second argument.
 */
type NullableArgs<A> = [A] extends [Record<PropertyKey, never>]
  ? A
  : { [K in keyof A]: A[K] | null };

/** Distributif : une fonction surchargée est une union de définitions. */
type WithNullableArgs<F> = F extends { Args: infer A }
  ? Omit<F, "Args"> & { Args: NullableArgs<A> }
  : F;

type PublicSchema = GeneratedDatabase["public"];

/**
 * Schéma généré, à ceci près que tout argument de RPC accepte `null`.
 * C'est ce type qu'utilisent les clients Supabase **serveur** (`admin.ts`,
 * `server.ts`) ; le client navigateur n'appelle pas de RPC à arguments
 * optionnels et reste sur le type généré brut.
 */
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<PublicSchema, "Functions"> & {
    Functions: {
      [F in keyof PublicSchema["Functions"]]: WithNullableArgs<
        PublicSchema["Functions"][F]
      >;
    };
  };
};
