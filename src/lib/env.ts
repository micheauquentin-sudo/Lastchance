/**
 * Accès typé aux variables d'environnement serveur.
 * Lève une erreur explicite au premier usage si une variable manque,
 * plutôt qu'un échec silencieux plus loin dans le code.
 */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
