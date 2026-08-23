import type { MetadataRoute } from "next";

import { APP_URL } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * VIT-12 — LE PLAN DE SITE DE L'APPLICATION.
 *
 * ── IL NE CONTIENT QUE DES VITRINES, ET C'EST NORMAL ──
 *
 * Tout le reste de cette application est privé ou éphémère : un tableau de
 * bord derrière un compte, une roue à l'adresse d'un QR, un salon qui meurt
 * avec sa partie. Rien de tout cela n'a de raison d'être trouvé par un moteur,
 * et chacune de ces pages porte déjà `robots: { index: false }`.
 *
 * Le site de marque, lui, a son propre plan de site (`site/src/app/sitemap.ts`)
 * et son propre domaine : les deux ne se croisent pas.
 *
 * ── ET SEULEMENT CELLES QUE LEUR COMMERÇANT A AUTORISÉES ──
 *
 * `vitrines_indexables()` rend les vitrines publiées dont la case est cochée
 * et dont le droit `vitrine` est ouvert. Elle ne juge PAS la complétude :
 * c'est la page qui retire ou non son `noindex`, et un plan de site qui cite
 * une page `noindex` n'est pas une faute — un moteur lit la page avant de la
 * croire.
 *
 * ── UNE PANNE DE LECTURE REND UN PLAN VIDE ──
 *
 * Jamais une erreur : `sitemap.xml` est servi à des robots, et un 500 y est
 * lu comme un signal durable. Un fichier vide dit « rien à proposer
 * aujourd'hui », ce qui est exact et sans conséquence.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("vitrines_indexables");
    if (error || !Array.isArray(data)) return [];

    return data.flatMap((ligne) => {
      const slug = (ligne as { slug?: unknown }).slug;
      if (typeof slug !== "string" || !/^[a-z0-9-]{3,60}$/.test(slug)) return [];
      const maj = (ligne as { mise_a_jour?: unknown }).mise_a_jour;
      const date = typeof maj === "string" ? new Date(maj) : undefined;

      return [
        {
          url: `${APP_URL}/v/${slug}`,
          lastModified:
            date && !Number.isNaN(date.getTime()) ? date : undefined,
          changeFrequency: "weekly" as const,
          priority: 0.8,
          // LES DEUX LANGUES SE DÉCLARENT L'UNE L'AUTRE. La page les porte déjà
          // en `alternates` ; les redire ici évite qu'un moteur ne découvre la
          // version anglaise que par hasard.
          alternates: {
            languages: {
              fr: `${APP_URL}/v/${slug}`,
              en: `${APP_URL}/v/${slug}/en`,
            },
          },
        },
      ];
    });
  } catch {
    return [];
  }
}
