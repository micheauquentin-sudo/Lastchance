import { findAddonOffer, type AddonBilling } from "@/lib/plans";
import type { GrantableModule } from "@/lib/subscription";
import type { Entitlement } from "@/platform/experiences/contract";

/**
 * LES TERMES D'UN OCTROI, DÉRIVÉS DU CATALOGUE — jamais du client.
 *
 * Ce module traduit un modèle de facturation (`AddonBilling`) en les quatre
 * colonnes que `grant_module_from_payment` attend. Il ne parle ni à Stripe, ni
 * à la base, ni à React : il transforme une offre et un instant d'achat en une
 * fenêtre.
 *
 * ── POURQUOI LES DURÉES VIENNENT DU CATALOGUE ET NON DU PAIEMENT ──
 *
 * La tentation est de lire la durée dans les métadonnées de la session Stripe :
 * c'est ce que fait l'appelant, donc c'est disponible. Ce serait exactement
 * l'inverse de ce qu'il faut. Ces métadonnées sont posées à la création de la
 * session, à partir de paramètres qui ont transité par le navigateur ; les
 * relire pour décider de la durée reviendrait à laisser le client choisir
 * combien de temps il a payé.
 *
 * Le catalogue, lui, est du code. Le client transmet UNIQUEMENT lequel des
 * huit add-ons il achète — une valeur d'un vocabulaire fermé, vérifiée ici —
 * et tout le reste est relu côté serveur.
 *
 * ── LES DEUX FENÊTRES, ET POURQUOI ELLES NE COURENT PAS ENSEMBLE ──
 *
 * Reprises de `src/lib/admin/module-grants.ts`, qui les a introduites pour le
 * back-office : `activate_by` borne le moment où l'octroi peut DÉMARRER,
 * `starts_at`/`ends_at` bornent la période où il ouvre réellement le module.
 * « 29 EUR / 30 jours, activable dans les 90 jours » (docs/codex-handoff.md §2)
 * décrit deux durées distinctes, pas une seule.
 */

/** Ce que `grant_module_from_payment` attend, et rien de plus. */
export interface TermesOctroi {
  kind: "pass" | "recurring";
  starts_at: string | null;
  ends_at: string | null;
  activate_by: string | null;
  capacity: number | null;
}

export type VerdictTermes =
  | { ok: true; termes: TermesOctroi }
  | { ok: false; erreur: string };

const MS_PAR_JOUR = 86_400_000;

/**
 * Les huit add-ons vendables sont-ils tous des modules octroyables ?
 *
 * `Entitlement` couvre aussi `core`, qui n'est pas un add-on et n'a pas
 * d'octroi. Cette fonction est le point de passage qui refuse tout ce qui
 * n'est pas un module — un `core` arrivé jusqu'ici serait un appelant qui
 * essaie d'acheter le socle comme un add-on.
 */
export function moduleDepuisEntitlement(
  entitlement: Entitlement,
  modulesConnus: readonly GrantableModule[],
): GrantableModule | null {
  return (modulesConnus as readonly string[]).includes(entitlement)
    ? (entitlement as GrantableModule)
    : null;
}

/**
 * Traduit une offre du catalogue en termes d'octroi.
 *
 * Rend un VERDICT et ne lève pas : l'appelant est un webhook, dont le refus
 * doit se journaliser et se compter, pas remonter en 500 — Stripe rejouerait
 * indéfiniment un événement que rien ne réparera.
 */
export function termesDepuisCatalogue(
  entitlement: Entitlement,
  acheteA: Date,
  jaugeChoisie: number | null = null,
): VerdictTermes {
  const offre = findAddonOffer(entitlement);
  if (!offre) {
    return { ok: false, erreur: `Aucune offre au catalogue pour « ${entitlement} ».` };
  }
  return termesDepuisFacturation(offre.billing, acheteA, jaugeChoisie);
}

function iso(base: Date, jours: number): string {
  return new Date(base.getTime() + jours * MS_PAR_JOUR).toISOString();
}

function termesDepuisFacturation(
  billing: AddonBilling,
  acheteA: Date,
  jaugeChoisie: number | null,
): VerdictTermes {
  switch (billing.model) {
    // ── RÉCURRENT ───────────────────────────────────────────────────────
    // Démarre tout de suite et n'a pas de terme connu : c'est ce qui le
    // distingue d'un pass. `ends_at` reste null, et la fin réelle viendra de
    // Stripe — une résiliation révoque l'octroi, elle ne le laisse pas courir.
    // Écrire ici une fin à trente jours aurait paru prudent et aurait coupé le
    // module d'un client à jour de ses paiements au premier renouvellement.
    case "recurring-monthly":
      return {
        ok: true,
        termes: {
          kind: "recurring",
          starts_at: acheteA.toISOString(),
          ends_at: null,
          activate_by: null,
          capacity: null,
        },
      };

    // ── ACHAT UNIQUE À FENÊTRE ──────────────────────────────────────────
    // NI `starts_at` NI `ends_at` : l'octroi est acheté, pas démarré. C'est
    // l'état `pending` de `org_module_grant_state`, et il n'ouvre rien. Le
    // commerçant prépare, puis active quand son animation commence — sans quoi
    // les « 30 jours » qu'il paie s'écouleraient pendant qu'il rédige ses lots.
    case "one-off-window":
      return {
        ok: true,
        termes: {
          kind: "pass",
          starts_at: null,
          ends_at: null,
          activate_by: iso(acheteA, billing.activationWindowDays),
          capacity: null,
        },
      };

    // ── PASS À JAUGE ────────────────────────────────────────────────────
    // Même forme, plus une capacité. « Jauge choisie avant paiement,
    // enregistrée et jamais ajustée ou facturée rétroactivement » (§2) : elle
    // doit correspondre à un PALIER VENDU, pas à un nombre arbitraire. Sans
    // cette vérification, un appelant qui poste 500 obtiendrait la jauge du
    // palier le plus cher au prix du moins cher.
    case "capacity-pass": {
      const palier = billing.steps.find((s) => s.maxPlayers === jaugeChoisie);
      if (!palier) {
        return {
          ok: false,
          erreur: `Jauge « ${jaugeChoisie} » hors des paliers vendus.`,
        };
      }
      return {
        ok: true,
        termes: {
          kind: "pass",
          starts_at: null,
          ends_at: null,
          activate_by: iso(acheteA, billing.activationWindowDays),
          capacity: palier.maxPlayers,
        },
      };
    }

    // ── UNE COMPÉTITION ─────────────────────────────────────────────────
    // Le seul modèle dont la fin ne se calcule PAS à l'achat : elle dépend de
    // la finale ou d'une clôture manuelle, que personne ne connaît ici. On pose
    // donc le plafond dur du catalogue comme `ends_at` — « plafond dur de douze
    // mois, quoi qu'il arrive à la compétition » — et la fin réelle sera une
    // révocation au moment de la clôture.
    //
    // Le sens de l'approximation est délibéré : un plafond trop LONG laisse un
    // droit ouvert un peu plus que dû, un plafond trop court couperait une
    // Ligue 1 en plein milieu, ce que le cahier interdit explicitement.
    case "single-competition":
      return {
        ok: true,
        termes: {
          kind: "pass",
          starts_at: acheteA.toISOString(),
          ends_at: iso(acheteA, billing.hardCapMonths * 30),
          activate_by: null,
          capacity: null,
        },
      };
  }
}
