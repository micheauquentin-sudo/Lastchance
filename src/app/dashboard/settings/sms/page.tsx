import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { loadSmsSettings, type SmsSenderView } from "@/actions/sms";
import { listSmsCreditPacks } from "@/lib/stripe";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  SmsCreditPacks,
  SmsSenderForm,
} from "@/components/dashboard/sms-settings";

export const metadata: Metadata = { title: "SMS" };

/**
 * Le canal SMS, côté commerçant.
 *
 * PROPRIÉTAIRE UNIQUEMENT, comme `/dashboard/settings` : les deux fonctions de
 * `@/actions/sms` appelées ici passent par `requireOrganizationOwner`, et la
 * lecture de `sms_senders` est réservée au propriétaire par sa policy. Montrer
 * l'écran à un éditeur ne lui rendrait qu'une erreur.
 *
 * Ce que cette page doit dire, et que rien d'autre ne dit :
 *   1. tant qu'aucun expéditeur n'est DÉCLARÉ, aucun SMS ne part ;
 *   2. un expéditeur alphanumérique NE REÇOIT PAS de réponse.
 * Le second point est contre-intuitif — le message porte le nom du commerce,
 * donc on croit pouvoir y répondre — et un commerçant qui l'apprend par un
 * client resté sans réponse l'apprend trop tard.
 */
export default async function SmsSettingsPage() {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner") redirect("/dashboard");

  const settings = await loadSmsSettings();
  const packs = listSmsCreditPacks();
  const declared = settings.senders.find(
    (sender) => sender.status === "declared",
  );

  return (
    <div>
      <Link
        href="/dashboard/settings"
        className="text-sm text-zinc-600 hover:text-zinc-900"
      >
        ← Réglages
      </Link>

      <h1 className="mt-3 mb-2 text-2xl font-bold">SMS</h1>
      <p className="mb-8 max-w-lg text-sm text-zinc-600">
        Prévenez vos clients par SMS quand ils gagnent. Trois conditions : un
        expéditeur déclaré, des crédits, et le consentement de la personne.
      </p>

      <div className="max-w-lg space-y-4">
        {settings.unavailable && (
          <p className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Certaines informations de cette page n&apos;ont pas pu être lues.
            Les chiffres affichés peuvent être incomplets — rechargez la page
            dans un instant.
          </p>
        )}

        <Card>
          <h2 className="mb-1 font-semibold">Expéditeur</h2>
          <p className="mb-4 text-sm text-zinc-600">
            Le nom qui s&apos;affiche à la place du numéro sur le téléphone de
            vos clients. Il doit être déclaré au registre des opérateurs
            (AF2M) avant le premier envoi : c&apos;est nous qui déposons la
            déclaration, à partir du nom que vous demandez ici.
          </p>

          {settings.senders.length === 0 ? (
            <p className="mb-4 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
              Aucun expéditeur demandé pour le moment. Tant qu&apos;aucun
              n&apos;est déclaré, <strong>aucun SMS ne peut partir</strong>.
            </p>
          ) : (
            <ul className="mb-4 space-y-3">
              {settings.senders.map((sender) => (
                <SenderRow key={sender.senderId} sender={sender} />
              ))}
            </ul>
          )}

          <SmsSenderForm hasDeclared={Boolean(declared)} />

          {/* LE POINT LE PLUS IMPORTANT DE L'ÉCRAN. Il n'est pas dans une
              note de bas de page : un commerçant qui croit pouvoir répondre à
              ses clients organise son service autour de cette croyance. */}
          <div className="mt-5 rounded-xl border-2 border-k-ink bg-k-yellow/30 px-4 py-3">
            <p className="text-sm font-bold text-k-ink">
              Vos clients ne peuvent pas répondre à ces SMS.
            </p>
            <p className="mt-1 text-sm text-k-ink">
              Un expéditeur au nom de votre commerce n&apos;est pas un numéro :
              il n&apos;a pas de boîte de réception. Une réponse de votre client
              n&apos;arrive nulle part — ni chez vous, ni chez nous. Pour se
              désinscrire, il envoie STOP au numéro court de l&apos;opérateur
              {settings.stopShortcode ? ` (${settings.stopShortcode})` : ""},
              imprimé dans chaque message.
            </p>
            <p className="mt-1 text-sm text-k-ink">
              Si vous attendez une réponse, mettez votre numéro de téléphone
              dans le texte du message.
            </p>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Crédits</h2>
          <p className="mb-4 text-sm text-zinc-600">
            Un crédit = un SMS d&apos;un segment. Un message long est découpé
            par l&apos;opérateur et coûte autant de crédits qu&apos;il compte de
            segments.
          </p>

          <p className="text-3xl font-bold tabular-nums">
            {settings.balanceUnits.toLocaleString("fr-FR")}{" "}
            <span className="text-base font-semibold text-zinc-600">
              crédit{settings.balanceUnits > 1 ? "s" : ""}
            </span>
          </p>

          {!settings.providerConfigured && (
            <p className="mt-3 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
              L&apos;envoi de SMS n&apos;est pas encore ouvert sur votre
              espace. Vos crédits restent acquis.
            </p>
          )}

          {packs.length > 0 ? (
            <div className="mt-5 border-t border-zinc-200 pt-5">
              <h3 className="mb-2 text-sm font-semibold">Acheter des crédits</h3>
              <SmsCreditPacks packs={packs} />
              {/* Même prudence que le bandeau de retour de `/dashboard/settings` :
                  un paiement différé n'est confirmé que deux à cinq jours plus
                  tard, et le solde ci-dessus reste inchangé jusque-là. */}
              <p className="mt-2 text-xs text-zinc-600">
                Paiement unique, sécurisé par Stripe. Les crédits arrivent dès
                que le paiement est confirmé : immédiatement par carte, deux à
                cinq jours par prélèvement ou virement. Ils apparaissent alors
                dans les mouvements ci-dessous.
              </p>
            </div>
          ) : (
            <p className="mt-5 border-t border-zinc-200 pt-5 text-sm text-zinc-600">
              La vente de crédits en ligne n&apos;est pas encore ouverte.
              Contactez-nous pour recharger votre compte.
            </p>
          )}

          <div className="mt-5 border-t border-zinc-200 pt-5">
            <h3 className="mb-2 text-sm font-semibold">Derniers mouvements</h3>
            {settings.movements.length === 0 ? (
              <p className="text-sm text-zinc-600">Aucun mouvement.</p>
            ) : (
              <ul className="space-y-1.5">
                {settings.movements.map((movement) => (
                  <li
                    key={movement.id}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="text-zinc-600">
                      {formatDate(movement.createdAt, organization.timezone)} ·{" "}
                      {MOVEMENT_LABELS[movement.reason] ?? movement.reason}
                    </span>
                    <span
                      className={`font-semibold tabular-nums ${
                        movement.deltaUnits < 0
                          ? "text-zinc-800"
                          : "text-emerald-700"
                      }`}
                    >
                      {movement.deltaUnits > 0 ? "+" : ""}
                      {movement.deltaUnits.toLocaleString("fr-FR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Consentements</h2>
          <p className="mb-4 text-sm text-zinc-600">
            Seules les personnes qui ont coché la case SMS après leur partie
            peuvent recevoir vos messages. Un STOP retire ce consentement
            définitivement.
          </p>
          <p className="text-3xl font-bold tabular-nums">
            {settings.activeConsents.toLocaleString("fr-FR")}{" "}
            <span className="text-base font-semibold text-zinc-600">
              client{settings.activeConsents > 1 ? "s" : ""} joignable
              {settings.activeConsents > 1 ? "s" : ""}
            </span>
          </p>
        </Card>
      </div>
    </div>
  );
}

/** Motifs du grand livre, dits en français plutôt qu'en clé technique. */
const MOVEMENT_LABELS: Record<string, string> = {
  purchase: "Achat de crédits",
  adjustment: "Ajustement",
  send: "Envoi",
  refund: "Remboursement (envoi échoué)",
  expiry: "Expiration",
};

/**
 * L'état d'un expéditeur, dit en clair AVEC SA CONSÉQUENCE.
 *
 * « pending » n'est jamais affiché tel quel : le mot ne dit pas au commerçant
 * que ses SMS ne partent pas encore, et c'est pourtant la seule chose qu'il
 * ait besoin de savoir.
 */
function SenderRow({ sender }: { sender: SmsSenderView }) {
  const state = SENDER_STATES[sender.status] ?? {
    label: "État inconnu",
    detail: "Contactez-nous, cet état n'est pas prévu.",
    tone: "bg-zinc-100 text-zinc-800",
  };

  return (
    <li className="rounded-xl border-2 border-zinc-200 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-bold">{sender.senderId}</span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${state.tone}`}
        >
          {state.label}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-zinc-700">{state.detail}</p>
      {sender.declaredAt && sender.status === "declared" && (
        <p className="mt-1 text-xs text-zinc-600">
          Déclaré le {formatDate(sender.declaredAt)}.
        </p>
      )}
      {sender.statusReason &&
        (sender.status === "rejected" || sender.status === "suspended") && (
          <p className="mt-1 text-sm font-semibold text-red-700">
            Motif : {sender.statusReason}
          </p>
        )}
    </li>
  );
}

const SENDER_STATES: Record<
  string,
  { label: string; detail: string; tone: string }
> = {
  pending: {
    label: "Déclaration en cours",
    // `text-amber-900` sur `bg-amber-100` et non les nuances 700/50 : le seuil
    // AA se joue au dixième sur cette famille, et cette pastille porte une
    // information dont dépend l'usage du canal.
    tone: "bg-amber-100 text-amber-900",
    detail:
      "Nous déposons ce nom au registre des opérateurs. Aucun SMS ne peut partir tant que la déclaration n'est pas acquise — comptez quelques jours ouvrés.",
  },
  declared: {
    label: "Déclaré",
    tone: "bg-emerald-100 text-emerald-800",
    detail: "Vos SMS partent sous ce nom.",
  },
  rejected: {
    label: "Refusé",
    tone: "bg-red-100 text-red-800",
    detail:
      "Ce nom n'a pas été accepté au registre. Demandez-en un autre, au plus près de votre nom commercial réel.",
  },
  suspended: {
    label: "Suspendu",
    tone: "bg-red-100 text-red-800",
    detail:
      "Les envois sous ce nom sont interrompus. Aucun SMS ne part tant que la situation n'est pas régularisée.",
  },
};
