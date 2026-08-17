import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { lienSelonRole } from "@/lib/liens-proprietaire";
import {
  chargerOctroisEnAttente,
  chargerOctroisVivants,
  etatOctroiModule,
} from "@/lib/module-grants-loader";
import {
  addonAchetableEnLigne,
  paliersDisponibles,
} from "@/lib/octroi-checkout";
import { termesActivation } from "@/lib/octroi-termes";
import {
  ADDON_EXPIRY_RULES,
  ADDON_OFFERS,
  type AddonBilling,
  type AddonOffer,
} from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  AchatAddon,
  DemarrerAddon,
  type RessourceAchat,
} from "@/components/dashboard/addon-purchase";

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
  const retourReglages = lienSelonRole("/dashboard/settings", role);
  const maintenant = new Date();
  const ouverts = await chargerOctroisVivants(organization.id, maintenant);
  // LES PASS PAYÉS QUI ATTENDENT LEUR DÉPART. Sans cette section, un
  // commerçant qui vient de payer voit son option marquée ni « Ouvert » ni
  // achetable, et rien ne lui dit qu'il lui reste un geste à faire.
  const enAttente = (await chargerOctroisEnAttente(organization.id, maintenant))
    .map((octroi) => {
      const offre = ADDON_OFFERS.find((o) => o.entitlement === octroi.module);
      const termes = termesActivation(octroi.module, maintenant);
      return offre && termes.ok
        ? {
            id: octroi.id,
            nom: offre.name,
            activateBy: octroi.activateBy,
            fin: formatDate(termes.termes.ends_at, organization.timezone),
          }
        : null;
    })
    .filter((x) => x !== null);

  // LES PASS TERMINÉS, DITS À VOIX HAUTE (constat SD-9).
  //
  // Une option expirée quittait simplement `ouverts` : la carte perdait sa
  // pastille « Ouvert » et redevenait achetable, sans un mot. Le commerçant
  // dont l'animation venait de se fermer n'avait donc aucun endroit où lire
  // « c'est fini depuis telle date » — ni ici, ni sur la campagne, dont la
  // bannière parlait d'un budget qu'il n'avait jamais posé.
  //
  // Seul `expired` s'affiche, et c'est une décision : `pending` a déjà sa
  // section « Prêt à démarrer » ci-dessus, `revoked` relève du remboursement
  // et se traite hors écran. Un pass expiré est le seul cas où le silence
  // laissait le commerçant sans explication.
  const finsDePass = new Map<string, string>();
  await Promise.all(
    ADDON_OFFERS.filter(
      (offre) => !(ouverts as readonly string[]).includes(offre.entitlement),
    ).map(async (offre) => {
      const etat = await etatOctroiModule(
        organization.id,
        offre.entitlement,
        maintenant,
      );
      if (etat?.etat === "expired" && etat.endsAt) {
        finsDePass.set(
          offre.entitlement,
          formatDate(etat.endsAt, organization.timezone),
        );
      }
    }),
  );

  // LES COMPÉTITIONS ACHETABLES. Une Saison de pronostics se vend « pour une
  // compétition identifiée, un seul contest_id » (catalogue) : l'écran doit
  // donc faire choisir, sans quoi l'action refuse — et l'octroi, avant ce lot,
  // ouvrait le module entier. Lu par le client RLS : un propriétaire ne voit
  // que les siennes, et l'action revérifie l'appartenance côté serveur.
  const competitions: RessourceAchat[] = [];
  if (proprietaire) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("contests")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(50);
    for (const ligne of (data ?? []) as Array<{ id: string; name: string }>) {
      competitions.push({ id: ligne.id, nom: ligne.name });
    }
  }

  return (
    <div>
      <PageHeader
        surtitre="Gestion"
        titre="Options"
        sousTitre="Chaque option s'achète seule, sans abonnement, et n'ouvre que son module. Vous pouvez en cumuler plusieurs."
        retour={
          // Même impasse que sur « Automatisations » : la page est ouverte à
          // l'éditeur, « Réglages » ne l'est pas.
          retourReglages
            ? { href: retourReglages, label: "Réglages" }
            : { href: "/dashboard", label: "Vue d'ensemble" }
        }
      />

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

        {enAttente.length > 0 && (
          <Card>
            <h2 className="mb-1 font-semibold">Prêt à démarrer</h2>
            <p className="mb-4 text-sm text-zinc-600">
              Vous avez payé {enAttente.length === 1 ? "cette option" : "ces options"}
              . {enAttente.length === 1 ? "Elle" : "Elles"} ne{" "}
              {enAttente.length === 1 ? "commence" : "commencent"} à courir
              qu&apos;au moment où vous le décidez — préparez votre animation
              d&apos;abord.
            </p>
            <ul className="space-y-5">
              {enAttente.map((pass) => (
                <li key={pass.id}>
                  {proprietaire ? (
                    <DemarrerAddon
                      grantId={pass.id}
                      nom={pass.nom}
                      finSiDemarreMaintenant={pass.fin}
                    />
                  ) : (
                    <p className="text-sm text-zinc-700">
                      <strong>{pass.nom}</strong> — payé, en attente de
                      démarrage. Seul le propriétaire peut le lancer.
                    </p>
                  )}
                  {/* La fenêtre d'activation est une promesse commerciale :
                      passé ce délai le pass ne démarre plus, et le commerçant
                      doit pouvoir le lire avant d'avoir laissé filer. */}
                  {pass.activateBy && (
                    <p className="mt-1 text-xs text-zinc-600">
                      À démarrer avant le{" "}
                      {formatDate(pass.activateBy, organization.timezone)}.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {ADDON_OFFERS.map((offre) => (
          <CarteAddon
            key={offre.entitlement}
            offre={offre}
            ouvert={(ouverts as readonly string[]).includes(offre.entitlement)}
            finDePass={finsDePass.get(offre.entitlement) ?? null}
            proprietaire={proprietaire}
            competitions={competitions}
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
  finDePass,
  proprietaire,
  competitions,
}: {
  offre: AddonOffer;
  ouvert: boolean;
  /** Date de fin déjà mise en forme du dernier pass expiré, sinon `null`. */
  finDePass: string | null;
  proprietaire: boolean;
  /** Compétitions du commerçant, pour le seul pass borné à l'une d'elles. */
  competitions: readonly RessourceAchat[];
}) {
  const achetable = addonAchetableEnLigne(offre.entitlement);
  const paliers =
    offre.billing.model === "capacity-pass"
      ? paliersDisponibles(offre.entitlement)
      : undefined;
  // `single-competition` et non `entitlement === "pronostics"` : c'est le
  // MODÈLE de facturation qui exige une ressource, et un second produit vendu
  // ainsi hériterait du choix sans qu'on y pense.
  const ressources =
    offre.billing.model === "single-competition" ? competitions : undefined;

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="w-fit border-b-4 border-k-yellow pb-0.5 text-lg font-black">
          {offre.name}
        </h2>
        {ouvert && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Ouvert
          </span>
        )}
      </div>

      {/* Discrète, et au-dessus du tarif : c'est un état, pas une offre. Elle
          n'apparaît jamais en même temps que la pastille « Ouvert » — la page
          ne la calcule que pour les options fermées. */}
      {finDePass && (
        <p className="mb-2 text-sm text-zinc-600">Pass terminé le {finDePass}</p>
      )}

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
          ressources={ressources}
          libelleRessource="la compétition"
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
