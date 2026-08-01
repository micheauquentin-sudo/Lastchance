import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { loadSmsSettings, type SmsSenderView } from "@/actions/sms";
import { MAX_WINDOW_DEFERRAL_DAYS } from "@/lib/sms-dispatch";
import {
  resolveSenderPhase,
  resolveSmsSendingState,
  type SmsSenderPhase,
} from "@/lib/sms-sender-state";
import {
  SMS_MARKETING_CLOSES_HOUR,
  SMS_MARKETING_OPENS_HOUR,
} from "@/lib/sms-window";
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
    (sender) => sender.status === "declared" && sender.retiredAt === null,
  );
  // CE QUI DÉCIDE L'ENVOI EST L'EXPÉDITEUR UTILISABLE, PAS LA SUSPENSION.
  // L'écran annonçait « aucun SMS ne part » dès qu'une suspension existait, et
  // « vos SMS partent sous ce nom » deux lignes plus bas : les deux étaient
  // affichables ensemble parce que `sms_senders_one_usable_per_org` est un
  // index PARTIEL. La dérivation vit dans `@/lib/sms-sender-state`, où elle
  // est vérifiable — ce dépôt n'a pas d'environnement de rendu React.
  const sending = resolveSmsSendingState(
    settings.senders.map((sender) => ({
      senderId: sender.senderId,
      status: sender.status,
      retiredAt: sender.retiredAt,
    })),
  );
  const suspension = sending.suspension;

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

          {suspension && sending.headline === "halted" && (
            <div className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3">
              <p className="text-sm font-bold text-red-900">
                Vos envois SMS sont suspendus.
              </p>
              <p className="mt-1 text-sm text-red-900">
                La suspension prononcée sur{" "}
                <span className="font-mono font-bold">
                  {suspension.senderId}
                </span>{" "}
                porte sur votre établissement, pas seulement sur ce nom : tant
                qu&apos;elle n&apos;est pas levée,{" "}
                <strong>aucun autre nom ne peut être déclaré</strong> et aucun
                SMS ne part. Retirer l&apos;expéditeur ne la lève pas.
              </p>
              <p className="mt-1 text-sm text-red-900">
                Seule notre équipe peut la lever, après examen. Écrivez-nous
                pour en demander le réexamen — il n&apos;y a rien à faire
                depuis cet écran.
              </p>
            </div>
          )}

          {/* Vos SMS partent, ET une sanction non levée vous attend à la
              prochaine demande. Ambre et non rouge : rien n'est interrompu, et
              un bandeau d'alarme sur un canal qui fonctionne apprend au
              commerçant à ne plus lire les bandeaux. */}
          {suspension && sending.headline === "sending_despite_sanction" && (
            <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
              <p className="text-sm font-bold text-amber-900">
                Une suspension n&apos;a pas été levée.
              </p>
              <p className="mt-1 text-sm text-amber-900">
                Vos SMS continuent de partir sous{" "}
                <span className="font-mono font-bold">
                  {sending.usableSenderId}
                </span>
                . Mais la suspension prononcée sur{" "}
                <span className="font-mono font-bold">
                  {suspension.senderId}
                </span>{" "}
                porte sur votre établissement :{" "}
                <strong>aucun nouveau nom ne pourra être déclaré</strong> tant
                qu&apos;elle tient — y compris pour remplacer celui-ci.
                Retirer l&apos;expéditeur ne la lève pas.
              </p>
              <p className="mt-1 text-sm text-amber-900">
                Seule notre équipe peut la lever, après examen. Écrivez-nous
                pour en demander le réexamen.
              </p>
            </div>
          )}

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

          <SmsSenderForm
            hasDeclared={Boolean(declared)}
            suspended={Boolean(suspension)}
          />

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
              {/* La seconde phrase n'est vraie que si le numéro court est
                  configuré : sans lui, le message composé porte « STOP » tout
                  court. Annoncer un numéro « imprimé dans chaque message »
                  quand aucun message n'en porte, c'est promettre au client un
                  droit de retrait qu'il croirait exercer. */}
              {settings.stopShortcode ? (
                <> ({settings.stopShortcode}), imprimé dans chaque message.</>
              ) : (
                <>
                  . Ce numéro court vous sera fourni par l&apos;opérateur à
                  l&apos;ouverture du canal ; tant qu&apos;il n&apos;est pas
                  configuré, vos messages portent la mention STOP sans le
                  numéro.
                </>
              )}
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

        {/* LE PREMIER SOIR DÉCIDE DE LA CONFIANCE. Un commerçant dont le SMS
            de 23 h ne part pas conclut à une panne s'il n'a jamais lu que
            l'heure d'envoi est bornée par la loi — et il nous écrit, ou pire,
            il abandonne le canal. La règle est appliquée par
            `src/lib/sms-window.ts` ; elle est dite ici, en heures. */}
        <Card>
          <h2 className="mb-1 font-semibold">Quand vos SMS partent</h2>
          {/* LA FENÊTRE NE CONCERNE QUE LA PROSPECTION. Le code de retrait
              d'un lot gagné est transactionnel : il en est sorti (voir
              `src/lib/sms-prize.ts`). Laisser croire l'inverse ferait renoncer
              un commerçant à un envoi que rien n'interdit. */}
          <p className="mb-3 text-sm text-zinc-600">
            La loi interdit la <strong>prospection</strong> par SMS en dehors de
            certaines heures. Elle ne s&apos;applique pas au code de retrait
            d&apos;un lot gagné : celui-là part à toute heure, dimanche et jours
            fériés compris.
          </p>
          <ul className="space-y-1.5 text-sm text-zinc-700">
            <li>
              <strong>
                De {SMS_MARKETING_OPENS_HOUR} h à {SMS_MARKETING_CLOSES_HOUR} h
              </strong>
              , heure de Paris — pour vos messages publicitaires.
            </li>
            <li>
              <strong>Jamais le dimanche</strong>, ni les jours fériés.
            </li>
          </ul>

          {/* « N'EST PAS PERDU » ÉTAIT UNE PROMESSE QUE LE SYSTÈME NE TIENT
              PAS. Le report est réel et daté (`deferred` + `run_after`), mais
              il est BORNÉ : au-delà de `MAX_WINDOW_DEFERRAL_DAYS`, le message
              échoue. Un commerçant qui découvre la perte après avoir lu
              « n'est pas perdu » cesse de croire le reste de l'écran. */}
          <p className="mt-3 text-sm text-zinc-700">
            Un message publicitaire prêt en dehors de la fenêtre attend
            l&apos;ouverture suivante — il n&apos;est ni envoyé en retard, ni
            supprimé aussitôt. Cette attente est <strong>bornée</strong> : sans
            ouverture trouvée en {MAX_WINDOW_DEFERRAL_DAYS} jours, le message
            est abandonné et ne partira pas.
          </p>
          {/* Le point que la page laissait croire, et qui est faux : rien
              n'est immédiat. Le dire ici plutôt que de laisser le commerçant
              promettre un code de retrait « tout de suite » à son client. */}
          <p className="mt-3 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
            <strong>L&apos;envoi n&apos;est pas immédiat.</strong> Les messages
            partent par lots, une fois par jour : un SMS peut arriver jusqu&apos;à
            24 heures après la partie. Ne comptez pas dessus pour un client qui
            attend devant vous — montrez-lui son lot à l&apos;écran.
          </p>

          {/* ET AUJOURD'HUI CETTE LIMITE EST ATTEINTE, dit sans l'adoucir : le
              passage quotidien tombe AVANT l'ouverture, donc un publicitaire
              est reporté à chaque passage et finit par expirer. Voir l'en-tête
              de `src/lib/sms-dispatch.ts`, section « ce que la cadence
              quotidienne empêche vraiment ». */}
          <p className="mt-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>
              Aujourd&apos;hui, un message publicitaire programmé n&apos;arrive
              pas jusqu&apos;à votre client.
            </strong>{" "}
            Le passage automatique a lieu une fois par jour au petit matin,
            avant {SMS_MARKETING_OPENS_HOUR} h — donc dans les heures où
            l&apos;envoi est interdit : le message est reporté à chaque
            passage, puis abandonné au bout de {MAX_WINDOW_DEFERRAL_DAYS} jours.
            Nous passons à des lots rapprochés au fil de la journée ; jusque-là,
            ne comptez pas sur ce canal pour de la prospection. Le code de
            retrait d&apos;un lot, lui, part normalement.
          </p>
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
  const phase = resolveSenderPhase({
    senderId: sender.senderId,
    status: sender.status,
    retiredAt: sender.retiredAt,
  });
  const state = SENDER_STATES[phase];
  const sanctioned = phase === "suspended" || phase === "suspended_retired";

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
      {sender.declaredAt && phase === "declared" && (
        <p className="mt-1 text-xs text-zinc-600">
          Déclaré le {formatDate(sender.declaredAt)}.
        </p>
      )}
      {/* Le motif suit la SANCTION jusque dans le retrait : c'est la seule
          phrase qui dit au commerçant ce qu'on lui reproche, et la faire
          disparaître avec le retrait le laisserait devant un blocage sans
          cause. Un simple refus de registre garde le sien de la même façon. */}
      {sender.statusReason && (phase === "rejected" || sanctioned) && (
        <p className="mt-1 text-sm font-semibold text-red-700">
          Motif : {sender.statusReason}
        </p>
      )}
    </li>
  );
}

const SENDER_STATES: Record<
  SmsSenderPhase,
  { label: string; detail: string; tone: string }
> = {
  unknown: {
    label: "État inconnu",
    detail: "Contactez-nous, cet état n'est pas prévu.",
    tone: "bg-zinc-100 text-zinc-800",
  },
  retired: {
    label: "Retiré",
    detail: "Ce nom n'est plus utilisé. Aucun SMS ne part sous ce nom.",
    tone: "bg-zinc-100 text-zinc-800",
  },
  suspended_retired: {
    label: "Suspendu, puis retiré",
    tone: "bg-red-100 text-red-800",
    // « Retiré » seul, c'est ce que les deux écrans affichaient : le mot qui
    // efface la seule information dont dépend tout le reste du canal.
    detail:
      "Ce nom a été retiré APRÈS une suspension, et le retrait ne lève pas la suspension : votre établissement ne peut plus déclarer aucun expéditeur tant qu'elle tient. Seule notre équipe peut la lever.",
  },
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
      "Les envois sont interrompus. La suspension porte sur votre établissement : demander un autre nom ne la contourne pas, et seule notre équipe peut la lever.",
  },
};
