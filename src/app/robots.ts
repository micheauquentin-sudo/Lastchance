import type { MetadataRoute } from "next";

import { APP_URL } from "@/lib/env";

/**
 * VIT-12 — CE QU'UN ROBOT A LE DROIT DE PARCOURIR ICI.
 *
 * ── UNE LISTE DE REFUS, PAS UNE LISTE D'AUTORISATIONS ──
 *
 * `allow: "/"` puis quatre `disallow` plutôt que l'inverse : une liste
 * blanche aurait fermé, en silence, chaque route publique ajoutée après
 * aujourd'hui — et l'auteur de cette route n'aurait aucune raison de venir
 * lire ce fichier.
 *
 * ── CE QUE `robots.txt` NE FAIT PAS, ET QU'ON LUI PRÊTE SOUVENT ──
 *
 * Il n'empêche pas l'indexation : il demande de ne pas PARCOURIR. Une adresse
 * connue par ailleurs peut être indexée sans être lue — et une page interdite
 * de parcours ne peut même plus dire `noindex`, puisque personne ne la lit.
 *
 * C'est pourquoi les quatre refus ci-dessous ne visent que ce qui n'a AUCUN
 * intérêt pour un moteur et coûte du serveur à balayer : le tableau de bord,
 * l'administration, les API et l'authentification. Le refus d'indexer les
 * autres pages — roue, quiz, salons, portefeuille — reste porté par leur
 * `robots: { index: false }`, qui est lu parce que la page, elle, est lisible.
 *
 * ── LE PLAN DE SITE EST DÉCLARÉ ICI ──
 *
 * C'est la façon la plus sûre de le faire trouver : elle ne dépend d'aucun
 * compte, d'aucune console et d'aucune vérification de propriété.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/admin", "/api", "/auth"],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
