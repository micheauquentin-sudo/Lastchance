"use client";

import { useCallback, useState } from "react";
import {
  closeInvitation,
  createInvitation,
  revokeInvitation,
} from "@/actions/reserver";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { isoToZonedDateTimeInput } from "@/lib/date-time";
import {
  formatCreneau,
  RESERVER_INVITATION_LABEL_MAX,
  RESERVER_INVITATION_MAX_USES_MAX,
  RESERVER_INVITATION_MAX_USES_MIN,
  type EtatUiInvitation,
} from "@/lib/reserver";
import type {
  ReserverInvitationDashboardView,
  ReserverSlotDashboardView,
} from "@/lib/reserver-context";
import { useActionForm } from "@/lib/use-action-form";
import { formatDate, type ActionResult } from "@/lib/utils";
import { champSelect } from "@/components/reserver/champs";

/**
 * LES INVITATIONS PRIVÉES D'UNE ACTIVITÉ (RES-2, lot L5).
 *
 * ── POURQUOI AU NIVEAU DE L'ACTIVITÉ, ET NON DU CRÉNEAU ──
 *
 * Une invitation peut viser TOUTE l'activité (« mes habitués, sur le créneau
 * qu'ils veulent ») ou UN créneau précis. La ranger sous une carte de créneau
 * aurait rendu la première forme impossible à créer, et la seconde introuvable
 * une fois le créneau passé. Elle vit donc à côté de l'agenda, avec un champ
 * « cible » qui dit laquelle des deux.
 *
 * ── LE JETON CLAIR N'EXISTE QU'UNE FOIS, ET CE N'EST PAS UN OUBLI ──
 *
 * La base ne stocke que son EMPREINTE (`token_hash`) : personne — pas même le
 * support — ne peut le retrouver ensuite. C'est ce qui fait qu'une fuite de la
 * table ne donne aucun accès. Le prix de cette propriété est exactement celui
 * que l'écran annonce : perdu, il ne se relit pas, il se révoque et se recrée.
 *
 * ── RÉVOQUER ET CLORE NE SONT PAS LE MÊME GESTE ──
 *
 * Révoquer coupe l'accès : les liens déjà envoyés cessent de fonctionner.
 * Clore arrête les NOUVELLES entrées sans rien reprendre à ceux qui sont déjà
 * venus — c'est le geste de fin de campagne. Les deux sont irréversibles, d'où
 * la confirmation en deux temps, qui nomme la conséquence plutôt que de
 * demander « êtes-vous sûr ».
 */
export function InvitationsPanneau({
  activityId,
  creneaux,
  invitations,
  timeZone,
}: {
  activityId: string;
  /** Les créneaux de CETTE activité, pour le choix de cible. */
  creneaux: ReserverSlotDashboardView[];
  invitations: ReserverInvitationDashboardView[];
  timeZone: string;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black text-k-ink">
          Invitations privées{" "}
          <span className="text-sm font-bold text-k-body">
            ({invitations.length})
          </span>
        </h2>
        {!ouvert ? (
          <Button onClick={() => setOuvert(true)}>+ Créer une invitation</Button>
        ) : null}
      </div>

      <p className="mb-4 rounded-xl border-2 border-k-ink/20 bg-k-bg px-3 py-2 text-xs font-semibold leading-5 text-k-body">
        Une invitation ouvre des places à qui détient son lien, même sur un
        créneau <strong className="text-k-ink">fermé au public</strong> — c&apos;est
        ce à quoi elle sert.{" "}
        <strong className="text-k-ink">
          Fermer un créneau n&apos;éteint donc PAS les invitations en cours
        </strong>{" "}
        : pour arrêter une invitation, révoquez-la ou clôturez-la ci-dessous.
        Elle ne fait jamais dépasser la capacité du créneau.
      </p>

      {ouvert ? (
        <NouvelleInvitationForm
          activityId={activityId}
          creneaux={creneaux}
          timeZone={timeZone}
          onFerme={() => setOuvert(false)}
        />
      ) : null}

      {invitations.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-sm font-semibold text-k-body">
            Aucune invitation. Créez-en une pour ouvrir quelques places à des
            personnes choisies, sans ouvrir le créneau à tout le monde.
          </p>
        </Card>
      ) : (
        <ul className="mt-4 space-y-3">
          {invitations.map((invitation) => (
            <li key={invitation.id}>
              <InvitationLigne
                invitation={invitation}
                creneaux={creneaux}
                timeZone={timeZone}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Création — et l'unique affichage du jeton
// ────────────────────────────────────────────────────────────

function NouvelleInvitationForm({
  activityId,
  creneaux,
  timeZone,
  onFerme,
}: {
  activityId: string;
  creneaux: ReserverSlotDashboardView[];
  timeZone: string;
  onFerme: () => void;
}) {
  /**
   * Le jeton clair, tenu en état LOCAL le temps que le commerçant le copie.
   *
   * D'où l'absence de `reloadOnSuccess` sur ce formulaire, contrairement aux
   * autres de ce module : un rechargement effacerait la seule occasion de lire
   * le secret. Le `router.refresh()` que `useActionForm` fait par défaut suffit
   * — il rafraîchit la liste en dessous SANS démonter cet état.
   */
  const [lien, setLien] = useState<string | null>(null);

  // Un créneau passé ne peut plus être ouvert par une invitation
  // (`redeem_invitation` refuse `starts_at <= now()`) : le proposer en cible
  // serait offrir un choix qui n'aboutira jamais.
  //
  // L'HEURE EST FIGÉE À L'OUVERTURE DU FORMULAIRE, et pas relue à chaque rendu :
  // un `Date.now()` en corps de composant rend le rendu impur, et la liste des
  // cibles se mettrait à changer sous le curseur du commerçant. Le tri fin
  // reste de toute façon à la RPC, qui juge avec l'horloge de la base.
  const [maintenant] = useState(() => Date.now());
  const cibles = creneaux.filter(
    (creneau) => Date.parse(creneau.startsAt) > maintenant,
  );

  /**
   * L'ÉCHÉANCE PROPOSÉE POUR UNE INVITATION À TOUTE L'ACTIVITÉ (revue L5, I-2).
   *
   * ── POURQUOI ELLE NE VAUT QUE POUR CETTE CIBLE-LÀ ──
   *
   * Une invitation à UN CRÉNEAU porte déjà sa propre fin : le créneau commence,
   * et `redeem_invitation` refuse. Une invitation à TOUTE L'ACTIVITÉ, elle, n'a
   * aucune borne naturelle — elle survit à chaque créneau qu'elle a servi et
   * reste ouverte tant qu'il lui reste un usage. Sans échéance, un lien envoyé
   * à quinze habitués en mars ouvre encore des places en décembre, et c'est
   * précisément la forme d'invitation qu'on retrouve six mois plus tard dans un
   * fil de messages.
   *
   * ── PROPOSÉE, PAS IMPOSÉE ──
   *
   * Le champ reste modifiable ET VIDABLE : « sans échéance » demeure un choix
   * légitime, la RPC l'accepte, et une valeur qu'on ne peut pas effacer n'est
   * plus une suggestion mais une règle qui ne dit pas son nom. Dès que le
   * commerçant y touche, la sélection de cible ne la réécrit plus — sinon
   * changer d'avis sur la cible effacerait la date qu'il vient de taper.
   */
  const echeanceParDefaut = isoToZonedDateTimeInput(
    new Date(maintenant + 30 * 24 * 60 * 60 * 1000).toISOString(),
    timeZone,
  );
  const [cible, setCible] = useState("");
  const [echeance, setEcheance] = useState(echeanceParDefaut);
  const [echeanceTouchee, setEcheanceTouchee] = useState(false);

  const { state, pending, onSubmit } = useActionForm(createInvitation, {
    resetOnSuccess: true,
    // L'URL COMPLÈTE VIENT DE LA SERVER ACTION, pas d'une recomposition ici :
    // elle seule connaît `APP_URL`, et deux façons de fabriquer la même adresse
    // divergeraient au premier changement de domaine.
    onSuccess: (data) => {
      setLien(data.url);
      // `resetOnSuccess` appelle `form.reset()`, qui ne rend au DOM que les
      // `defaultValue` — il ne sait rien de ces deux états. Sans cette remise à
      // zéro, la cible et l'échéance affichées seraient celles de l'invitation
      // précédente, sur un formulaire que le commerçant vient de voir se vider.
      setCible("");
      setEcheance(echeanceParDefaut);
      setEcheanceTouchee(false);
    },
    networkError: "Création impossible, réessayez.",
  });

  return (
    <div className="rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]">
      <form onSubmit={onSubmit}>
        <input type="hidden" name="activityId" value={activityId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="invitation-label">Libellé</Label>
            <Input
              id="invitation-label"
              name="label"
              type="text"
              required
              maxLength={RESERVER_INVITATION_LABEL_MAX}
              placeholder="Habitués du samedi"
              autoFocus
              aria-describedby="invitation-label-aide"
            />
            <p
              id="invitation-label-aide"
              className="mt-1.5 text-xs font-semibold text-k-body"
            >
              Pour vous seul : il vous dit à qui vous avez envoyé ce lien. Vos
              invités ne le voient pas comme un titre, seulement comme un
              rappel sous le nom de l&apos;activité.
            </p>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="invitation-cible">Ce que l&apos;invitation ouvre</Label>
            <select
              id="invitation-cible"
              name="slotId"
              value={cible}
              onChange={(event) => {
                const valeur = event.target.value;
                setCible(valeur);
                // Tant que le commerçant n'a pas touché à l'échéance, elle suit
                // la cible : proposée sur « toute l'activité », effacée sur un
                // créneau précis, qui porte déjà sa propre fin.
                if (!echeanceTouchee) {
                  setEcheance(valeur === "" ? echeanceParDefaut : "");
                }
              }}
              className={champSelect}
              aria-describedby="invitation-cible-aide"
            >
              <option value="">
                Toute l&apos;activité — l&apos;invité choisit son créneau
              </option>
              {cibles.map((creneau) => (
                <option key={creneau.id} value={creneau.id}>
                  {formatCreneau(creneau.startsAt, creneau.endsAt, timeZone)}
                </option>
              ))}
            </select>
            <p
              id="invitation-cible-aide"
              className="mt-1.5 text-xs font-semibold text-k-body"
            >
              Seuls les créneaux à venir sont proposés : une invitation n&apos;ouvre
              jamais un créneau commencé.
            </p>
          </div>

          <div>
            <Label htmlFor="invitation-max-uses">Nombre de places</Label>
            <Input
              id="invitation-max-uses"
              name="maxUses"
              type="number"
              inputMode="numeric"
              min={RESERVER_INVITATION_MAX_USES_MIN}
              max={RESERVER_INVITATION_MAX_USES_MAX}
              step={1}
              required
              defaultValue={1}
              aria-describedby="invitation-max-uses-aide"
            />
            <p
              id="invitation-max-uses-aide"
              className="mt-1.5 text-xs font-semibold text-k-body"
            >
              Combien de personnes différentes peuvent l&apos;utiliser. Un même
              invité qui reclique ne consomme qu&apos;une place.
            </p>
          </div>

          <div>
            <Label htmlFor="invitation-expires">
              Échéance{" "}
              <span className="font-medium text-k-body">(facultative)</span>
            </Label>
            <Input
              id="invitation-expires"
              name="expiresAt"
              type="datetime-local"
              value={echeance}
              onChange={(event) => {
                setEcheance(event.target.value);
                setEcheanceTouchee(true);
              }}
              aria-describedby="invitation-expires-aide"
            />
            <p
              id="invitation-expires-aide"
              className="mt-1.5 text-xs font-semibold text-k-body"
            >
              Heure de votre établissement. Sans échéance, l&apos;invitation reste
              valable jusqu&apos;à épuisement de ses places.
              {cible === "" ? (
                <>
                  {" "}
                  <strong className="text-k-ink">
                    Trente jours vous sont proposés
                  </strong>{" "}
                  parce qu&apos;une invitation à toute l&apos;activité n&apos;a
                  pas de fin naturelle : elle survit à chaque créneau qu&apos;elle
                  a servi. Modifiez cette date, ou videz le champ si vous voulez
                  vraiment un lien sans échéance.
                </>
              ) : (
                <>
                  {" "}
                  Sur un créneau précis, elle s&apos;arrête de toute façon quand
                  le créneau commence.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Création…" : "Créer l'invitation"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onFerme}
            disabled={pending}
          >
            Fermer
          </Button>
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>

      {/* Région vivante montée EN PERMANENCE : le lien qui apparaît est la seule
          chose que le commerçant est venu chercher, et un lecteur d'écran doit
          l'entendre arriver. */}
      <div aria-live="polite">
        {lien ? (
          <JetonRevele url={lien} onFerme={() => setLien(null)} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * LE LIEN, MONTRÉ UNE FOIS.
 *
 * Il n'est ni pré-sélectionné ni auto-copié : le presse-papiers d'un poste de
 * caisse est partagé, et y déposer un secret sans que personne l'ait demandé
 * est une fuite silencieuse. Le bouton reste explicite, et il échoue en silence
 * si le navigateur refuse — le lien est visible et recopiable à la main.
 */
function JetonRevele({ url, onFerme }: { url: string; onFerme: () => void }) {
  const [copie, setCopie] = useState(false);

  return (
    <div className="mt-4 rounded-xl border-2 border-k-ink bg-k-yellow/40 p-4">
      <p className="text-sm font-black text-k-ink">
        Voici le lien de votre invitation — il ne sera plus jamais affiché.
      </p>
      <p className="mt-1 text-xs font-bold leading-relaxed text-k-ink">
        Copiez-le maintenant, puis envoyez-le à vos invités. Nous n&apos;en
        gardons qu&apos;une empreinte : personne ne peut le retrouver ensuite.{" "}
        <strong>
          Perdu, il ne se relit pas — il faut révoquer cette invitation et en
          créer une autre.
        </strong>
      </p>

      <code className="mt-3 block break-all rounded-lg border-2 border-k-ink/20 bg-white px-2.5 py-2 text-xs text-k-ink">
        {url}
      </code>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopie(true);
              setTimeout(() => setCopie(false), 2000);
            } catch {
              // Presse-papiers indisponible : le lien reste copiable à la main.
            }
          }}
          className="rounded-lg border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-bold text-k-ink hover:bg-white/60"
        >
          {copie ? "Copié !" : "Copier le lien"}
        </button>
        <button
          type="button"
          onClick={onFerme}
          className="rounded-lg border-2 border-k-ink/25 bg-transparent px-3 py-1.5 text-xs font-bold text-k-body hover:border-k-ink hover:text-k-ink"
        >
          J&apos;ai copié le lien, masquer
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Une invitation existante
// ────────────────────────────────────────────────────────────

/**
 * `unknown` couvre l'invitation inconnue ET celle d'une autre organisation : la
 * RPC les rend indistinctes volontairement, et ce message ne les distingue pas
 * non plus.
 */
const REFUS_INCONNU = "Cette invitation est introuvable. Rechargez la page.";

const LIBELLE_ETAT: Record<EtatUiInvitation, { label: string; ton: string }> = {
  active: { label: "Active", ton: "bg-k-green/40" },
  revoquee: { label: "Révoquée", ton: "bg-zinc-200" },
  fermee: { label: "Clôturée", ton: "bg-zinc-200" },
  expiree: { label: "Échue", ton: "bg-zinc-200" },
  epuisee: { label: "Épuisée", ton: "bg-amber-100" },
};

function InvitationLigne({
  invitation,
  creneaux,
  timeZone,
}: {
  invitation: ReserverInvitationDashboardView;
  creneaux: ReserverSlotDashboardView[];
  timeZone: string;
}) {
  // L'état est TRANCHÉ PAR LE CHARGEUR (`etatUiInvitation`, côté serveur) : le
  // recalculer ici ferait dépendre « échue » de l'horloge du poste de caisse.
  const { label, ton } = LIBELLE_ETAT[invitation.etat];
  const creneau = invitation.slotId
    ? creneaux.find((c) => c.id === invitation.slotId)
    : null;
  // Révoquer et clore n'ont de sens que sur une invitation encore vivante. Une
  // invitation épuisée en fait partie : elle n'ouvre plus de place, mais elle
  // n'est pas éteinte — la clore ou la révoquer reste le geste qui l'arrête
  // définitivement, et le commerçant doit pouvoir le faire.
  const vivante = invitation.etat === "active" || invitation.etat === "epuisee";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-base font-black text-k-ink">{invitation.label}</p>
          <p className="mt-1 text-sm font-semibold text-k-body">
            {invitation.slotId
              ? creneau
                ? formatCreneau(creneau.startsAt, creneau.endsAt, timeZone)
                : "Un créneau précis"
              : "Toute l'activité"}
          </p>
          <p className="mt-1 text-sm font-bold text-k-body">
            <span className="font-black tabular-nums text-k-ink">
              {invitation.usedCount}
            </span>
            <span className="tabular-nums"> / {invitation.maxUses}</span> place
            {invitation.maxUses > 1 ? "s" : ""} utilisée
            {invitation.usedCount > 1 ? "s" : ""}
          </p>
          <p className="mt-1 text-xs font-semibold text-k-body">
            Créée le {formatDate(invitation.createdAt, timeZone)}
            {invitation.expiresAt
              ? ` · échéance le ${formatDate(invitation.expiresAt, timeZone)}`
              : ""}
            {invitation.revokedAt
              ? ` · révoquée le ${formatDate(invitation.revokedAt, timeZone)}`
              : ""}
            {invitation.closedAt
              ? ` · clôturée le ${formatDate(invitation.closedAt, timeZone)}`
              : ""}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border-2 border-k-ink px-3 py-1 text-xs font-black text-k-ink ${ton}`}
        >
          {label}
        </span>
      </div>

      {vivante ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
          <GesteInvitation
            invitationId={invitation.id}
            libelle="Clore"
            enCours="Clôture…"
            confirmation={`Clôturer « ${invitation.label} » ? Le lien cesse d'ouvrir de nouvelles places. Les personnes déjà venues gardent leur réservation.`}
            action={closeInvitation}
            refus={(data) => (data.state === "unknown" ? REFUS_INCONNU : null)}
          />
          <GesteInvitation
            invitationId={invitation.id}
            libelle="Révoquer"
            enCours="Révocation…"
            confirmation={`Révoquer « ${invitation.label} » ? Tous les liens déjà envoyés cessent immédiatement de fonctionner, et ce geste est définitif. Les réservations déjà prises ne sont pas annulées.`}
            action={revokeInvitation}
            refus={(data) => (data.state === "unknown" ? REFUS_INCONNU : null)}
            danger
          />
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Les deux gestes irréversibles, en un seul composant.
 *
 * `reloadOnSuccess` : l'état, le compteur d'usages et la disparition des boutons
 * sont TOUS dérivés de props serveur, sans aucun état local. Sans rechargement,
 * l'écran affiche encore « Active » sur une invitation déjà morte — et le clic
 * suivant repart de la même prop périmée.
 */
function GesteInvitation<T>({
  invitationId,
  libelle,
  enCours,
  confirmation,
  action,
  refus,
  danger = false,
}: {
  invitationId: string;
  libelle: string;
  enCours: string;
  confirmation: string;
  action: (
    prev: ActionResult<T> | null,
    formData: FormData,
  ) => Promise<ActionResult<T>>;
  /**
   * Les RPC rendent un ÉTAT, pas un booléen. Sans ce pont, `reloadOnSuccess`
   * rechargerait la page sur `unknown` comme sur `revoked` : le commerçant
   * verrait la ligne inchangée, sans la moindre explication.
   */
  refus: (data: T) => string | null;
  danger?: boolean;
}) {
  const adapte = useCallback(
    async (
      prev: ActionResult<T> | null,
      formData: FormData,
    ): Promise<ActionResult<T>> => {
      const resultat = await action(prev, formData);
      if (!resultat.ok) return resultat;
      const message = refus(resultat.data);
      return message ? { ok: false, error: message } : resultat;
    },
    [action, refus],
  );

  const { state, pending, onSubmit } = useActionForm(adapte, {
    reloadOnSuccess: true,
    networkError: "Connexion perdue, réessayez — rien n'a été modifié.",
  });

  return (
    <form
      onSubmit={(event) => {
        if (!confirm(confirmation)) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
    >
      <input type="hidden" name="id" value={invitationId} />
      <button
        type="submit"
        disabled={pending}
        className={
          danger
            ? "rounded-lg border-2 border-red-700/40 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:border-red-700 disabled:pointer-events-none disabled:opacity-60"
            : "rounded-lg border-2 border-k-ink/25 bg-white px-3 py-1.5 text-xs font-bold text-k-body hover:border-k-ink hover:text-k-ink disabled:pointer-events-none disabled:opacity-60"
        }
      >
        {pending ? enCours : libelle}
      </button>
      <div aria-live="assertive">
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </div>
    </form>
  );
}
