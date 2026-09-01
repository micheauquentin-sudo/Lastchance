import { z } from "zod";
import { calendarThemeSchema, fondKeySchema } from "@/lib/validations/calendar";

/**
 * L'HABILLAGE DES SALONS (SALON-1) — miroir applicatif de
 * `set_lobby_habillage`.
 *
 * ── RIEN N'EST RÉÉCRIT ICI, ET C'EST TOUT L'INTÉRÊT ──
 *
 * Le thème et le fond ont déjà leur schéma, et ce sont EXACTEMENT les mêmes
 * domaines que ceux du calendrier : les onze clés de la palette partagée d'un
 * côté, le vocabulaire de `FOND_CHOIX` de l'autre. Les recopier aurait posé
 * deux listes de plus à tenir d'accord avec le `check` SQL — le défaut nommé
 * par 20260921120000, et celui que la migration de ce lot cite pour justifier
 * une table unique plutôt que deux colonnes dupliquées.
 *
 * `fondKeySchema` porte en particulier le repli `'' → null` : un formulaire HTML
 * qui vide son champ envoie la chaîne vide, pas `null`, et la refuser aurait
 * fait échouer le geste le plus banal de l'éditeur — revenir à « suivre le
 * thème ».
 *
 * ── L'ORGANISATION VIENT DE LA SESSION, JAMAIS DU FORMULAIRE ──
 *
 * Elle est validée pour la même raison que dans `duoPlateauSchema` : la garde
 * la produit, le schéma la relit, et la RPC la revérifie EN SQL contre
 * `organization_members`. Trois verrous, dont un seul est côté client — aucun.
 */
export const habillageSalonsSchema = z.object({
  organizationId: z.string().uuid("Organisation invalide"),
  theme: calendarThemeSchema,
  fondKey: fondKeySchema,
  /**
   * `true` par défaut, comme la colonne : un commerçant qui ouvre cet écran
   * pour habiller ses salons veut d'abord qu'on sache chez qui l'on est. Le
   * formulaire porte un champ caché à `"true"`/`"false"` — une case décochée
   * n'envoie RIEN, et l'absence serait ici indiscernable d'un refus.
   */
  afficheIdentite: z
    .enum(["true", "false"])
    .nullable()
    .default("true")
    .transform((valeur) => valeur !== "false"),
});

export type HabillageSalonsEntree = z.infer<typeof habillageSalonsSchema>;
