import path from "node:path";
import type { NextConfig } from "next";

/**
 * Site vitrine — 100 % statique (aucune donnée dynamique, aucun secret).
 * Indépendant de l'application commerçant : seul NEXT_PUBLIC_APP_URL le
 * relie à l'app (liens « Essai gratuit » / « Connexion »).
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,

  // Le repo contient deux projets Next (l'app à la racine, le site ici),
  // donc deux lockfiles : sans racine explicite, Next infère la racine
  // du workspace au niveau du repo et embarque les fichiers conventionnels
  // de l'app (src/proxy.ts, instrumentation, configs Sentry) dans CE build.
  turbopack: {
    root: path.dirname(new URL(import.meta.url).pathname),
  },
};

export default nextConfig;
