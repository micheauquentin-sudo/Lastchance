import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { chargerOctroisVivants } from "@/lib/module-grants-loader";
import {
  addonAchetableEnLigne,
  paliersDisponibles,
} from "@/lib/octroi-checkout";
import {
  ADDON_EXPIRY_RULES,
  ADDON_OFFERS,
  type AddonBilling,
  type AddonOffer,
} from "@/lib/plans";
import { Card } from "@/components/ui/card";
import { AchatAddon } from "@/components/dashboard/addon-purchase";

export const metadata: Metadata = { title: "Options" };

/**
 * Les add-ons achetables seuls, côté commerçant.
 *
 * ── VISIBLE PAR TOUS, ACHETABLE PAR LE PROPRIÉTAIRE ─────────
 *
 * Contrairement à `/dashboard/settings/sms`, cette page NE redirige PAS un
 * éditeur : le §3 du cahier demande exactement l'inverse — « un éditeur voit le
 * catalogue mais reçoit "Demander au propriétaire", jamais un contrôle
 * Stripe ». Un éditeur qui tombe sur `/dashboard` sans explication conclut que
 * le module n'existe pas, et le propriétaire n'est jamais sollicité.
 *
 * ── CE QUI EST PROPOSÉ EST CE QUI ABOUTIT ───────────────────
 *
 * `addonAchetableEnLigne` décide seul de l'affichage d'un bouton. Sans prix
 * Stripe configuré, il rend `false` et la page dit « écrivez-nous » — jamais un
 * bouton qui mènerait à un refus. Les deux add-ons mensuels sont fermés par la
 * même fonction tant que le webhook ne sait pas recevoir leur abonnement.
 */
export default async function ModulesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ achat?: string }>;
}) {
  const { achat } = await searchParams;
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const proprietaire = role === "owner";
  const ouverts = await chargerOctroisVivants(organization.id);

  return (
    <div>
      <Link
        href="/dashboard/settings"
        className="text-sm text-zinc-600 hover:text-zinc-900"
      >
        ← Réglages
      </Link>

      <h1 className="mt-3 mb-2 text-2xl font-bold">Options</h1>
      <p className="mb-8 max-w-lg text-sm text-zinc-600">
        Chaque option s&apos;achète seule, sans abonnement, et n&apos;ouvre que
        son module. Vous pouvez en cumuler plusieurs.
      </p>

      <div className="max-w-lg space-y-4">
        {/* MÊME PRUDENCE QUE LE RETOUR D'ACHAT DE CRÉDITS SMS : un paiement
            différé (prélèvement, virement) n'est confirmé que deux à cinq
            jours plus tard. Annoncer « c'est actif » au retour du tunnel
            mentirait à un commerçant sur cinq. */}
        {achat === "succes" && (
          <p className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <strong>Paiement enregistré.</strong> Votre option s&apos;ouvre dès
            que le paiement est confirmé : immédiatement par carte, deux à cinq
            jours par prélèvement ou virement. Vous n&apos;avez rien à ressaisir.
          </p>
        )}
        {achat === "annule" && (
          <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
            Paiement abandonné. Rien n&apos;a été débité.
          </p>
        )}

        {!proprietaire && (
          <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
            Vous pouvez consulter les options, mais seul le propriétaire du
            compte peut les acheter. <strong>Demandez-lui</strong> celle dont
            vous avez besoin.
          </p>
        )}

        {ADDON_OFFERS.map((offre) => (
          <CarteAddon
            key={offre.entitlement}
            offre={offre}
            ouvert={(ouverts as readonly string[]).includes(offre.entitlement)}
            proprietaire={proprietaire}
          />
        ))}

        <Card>
          <h2 className="mb-2 font-semibold">Quand une option se termine</h2>
          <ul className="space-y-1.5 text-sm text-zinc-700">
            {ADDON_EXPIRY_RULES.map((regle) => (
              <li key={regle}>{regle}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function CarteAddon({
  offre,
  ouvert,
  proprietaire,
}: {
  offre: AddonOffer;
  ouvert: boolean;
  proprietaire: boolean;
}) {
  const achetable = addonAchetableEnLigne(offre.entitlement);
  const paliers =
    offre.billing.model === "capacity-pass"
      ? paliersDisponibles(offre.entitlement)
      : undefined;

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{offre.name}</h2>
        {ouvert && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Ouvert
          </span>
        )}
      </div>

      <p className="mb-3 text-sm font-semibold text-zinc-800">
        {formulerTarif(offre.billing)}
      </p>

      <ul className="mb-4 space-y-1.5 text-sm text-zinc-600">
        {offre.rules.map((regle) => (
          <li key={regle}>{regle}</li>
        ))}
      </ul>

      {!proprietaire ? null : achetable ? (
        <AchatAddon
          entitlement={offre.entitlement}
          price={prixAffiche(offre.billing)}
          paliers={paliers}
        />
      ) : (
        // Le message dit quoi FAIRE. « Prix Stripe non configuré » n'apprend
        // rien au commerçant et l'inquiète sur un service qu'il paie.
        <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
          Cette option n&apos;est pas encore en vente en ligne.
          Écrivez-nous et nous l&apos;ouvrirons sur votre compte.
        </p>
      )}
    </Card>
  );
}

/**
 * Le tarif, dit comme au §2 du cahier — prix ET durée dans la même phrase.
 *
 * Le prix seul est trompeur sur ce catalogue : « 29 € » ne distingue pas une
 * Chasse de trente jours d'un Calendrier d'une campagne, et un commerçant qui
 * compare deux montants sans leur durée choisit à l'aveugle.
 */
function formulerTarif(billing: AddonBilling): string {
  switch (billing.model) {
    case "recurring-monthly":
      return `${billing.priceMonthly} € par mois, sans engagement`;
    case "one-off-window":
      return `${billing.price} € pour ${billing.activeDays} jours — à activer dans les ${billing.activationWindowDays} jours`;
    case "single-competition":
      return `${billing.price} € pour une compétition`;
    case "capacity-pass": {
      const paliers = billing.steps
        .map((s) => `${s.maxPlayers} joueurs : ${s.price} €`)
        .join(" · ");
      return `${paliers} — à activer dans les ${billing.activationWindowDays} jours`;
    }
  }
}

/** Prix unique d'un add-on hors pass à jauge, qui en a un par palier. */
function prixAffiche(billing: AddonBilling): number | undefined {
  switch (billing.model) {
    case "recurring-monthly":
      return billing.priceMonthly;
    case "one-off-window":
    case "single-competition":
      return billing.price;
    case "capacity-pass":
      return undefined;
  }
}
