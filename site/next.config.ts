import type { NextConfig } from "next";

/**
 * Site vitrine — 100 % statique (aucune donnée dynamique, aucun secret).
 * Indépendant de l'application commerçant : seul NEXT_PUBLIC_APP_URL le
 * relie à l'app (liens « Essai gratuit » / « Connexion »).
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
