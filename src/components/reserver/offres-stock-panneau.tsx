"use client";

import { useState } from "react";
import { createStockOffer, updateStockOffer } from "@/actions/reserver";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { champDescription, champSelect } from "@/components/reserver/champs";
import { PastilleOffreStock } from "@/components/reserver/pastilles";
import { isoToZonedDateTimeInput } from "@/lib/date-time";
import {
  cheminOffreStock,
  formatFenetreStock,
  RESERVER_STOCK_DESCRIPTION_MAX,
  RESERVER_STOCK_PER_PLAYER_DEFAUT,
  RESERVER_STOCK_PER_PLAYER_MAX,
  RESERVER_STOCK_PER_PLAYER_MIN,
  RESERVER_STOCK_TITLE_MAX,
  RESERVER_STOCK_TOTAL_MAX,
  RESERVER_STOCK_TOTAL_MIN,
  type StockOfferStaffView,
} from "@/lib/reserver";
import { useActionForm } from "@/lib/use-action-form";

/**
 * « OFFRES DE STOCK » — la section du tableau de bord Réservations (RES-5, L9).
 *
 * Le commerçant y déclare une quantité finie et une fenêtre de retrait ; ses
 * clients en bloquent une part par QR et viennent la chercher au comptoir. Un
 * « Drop anti-gaspi » n'est pas un autre objet : c'est cette même offre avec une
 * fenêtre courte, et la ligne d'aide en bas le dit — lui donner un formulaire à
 * lui aurait dupliqué six champs pour ne changer qu'une durée.
 *
 * ── LES QUATRE COMPTEURS, ET POURQUOI « NON RETIRÉES » EST LE PLUS UTILE ──
 *
 * `stock_offers_staff_state` rend tenues / retirées / éteintes sans retrait /
 * annulées. Le troisième est entièrement DÉRIVÉ — aucune ligne ne porte cet état
 * — et c'est celui qui mesure le gaspillage évité qui ne l'a pas été : des parts
 * bloquées que personne n'est venu chercher, donc du stock immobilisé pour rien.
 * Le montrer à côté des retraits est la seule façon pour le commerçant de savoir
 * si sa fenêtre est trop large.
 *
 * ── UN SEUL DROIT, ET C'EST L'ÉDITION ──
 *
 * Contrairement aux files d'accueil, il n'y a pas de console de comptoir ici :
 * le geste du caissier est le retrait, et il se fait en CAISSE, par le code.
 * Cette section n'est donc que du paramétrage, et `peutEditer` gouverne les
 * formulaires. Ce verdict d'écran ne remplace aucune garde : les actions
 * revérifient le rôle côté serveur.
 */
export function OffresStockPanneau({
  offres,
  peutEditer,
  appUrl,
  timeZone,
}: {
  offres: StockOfferStaffView[];
  /** Rôle propriétaire ou éditeur : la création et les réglages. */
  peutEditer: boolean;
  /** Base publique, pour montrer le lien à mettre sur l'étiquette. */
  appUrl: string;
  /** Fuseau de l'établissement — jamais celui du serveur ni du navigateur. */
  timeZone: string;
}) {
  const [enEdition, setEnEdition] = useState<string | null>(null);

  return (
    <Card>
      <h2>Offres de stock</h2>
      <p className="mt-2 text-sm font-semibold text-k-body">
        Une quantité finie, une fenêtre de retrait : vos clients bloquent leur
        part depuis leur téléphone et la récupèrent au comptoir avec un code
        court. Rien n&apos;est payé en ligne.
      </p>

      {offres.length === 0 ? (
        <div className="mt-5 rounded-xl border-2 border-dashed border-k-ink/25 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-k-body">
            Aucune offre de stock. Créez la première !
          </p>
          {peutEditer ? (
            <div className="mt-4 flex justify-center">
              <NouvelleOffreForm timeZone={timeZone} instanceId="-vide" />
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {offres.map((offre) => (
            <li
              key={offre.offerId}
              className="rounded-2xl border-2 border-k-ink/15 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black text-k-ink">
                    {offre.title}
                  </p>
                  {/* Les deux bornes sont `not null` en base ; le mapper les
                      rend `| null` pour pouvoir décrire un document vide. On
                      s'abstient plutôt que d'écrire « du null au null ». */}
                  {offre.windowStartsAt && offre.windowEndsAt ? (
                    <p className="mt-0.5 text-sm font-semibold text-k-body">
                      À retirer{" "}
                      {formatFenetreStock(
                        offre.windowStartsAt,
                        offre.windowEndsAt,
                        timeZone,
                      )}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs font-semibold text-k-body">
                    Lien public :{" "}
                    <span className="break-all font-mono">
                      {appUrl}
                      {cheminOffreStock(offre.offerId)}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <PastilleOffreStock offre={offre} />
                  {peutEditer ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setEnEdition((v) => (v === offre.offerId ? null : offre.offerId))
                      }
                      aria-expanded={enEdition === offre.offerId}
                    >
                      {enEdition === offre.offerId ? "Fermer" : "Modifier"}
                    </Button>
                  ) : null}
                </div>
              </div>

              <Compteurs offre={offre} />

              {peutEditer && enEdition === offre.offerId ? (
                <div className="mt-4">
                  <OffreStockForm
                    key={offre.offerId}
                    offre={offre}
                    timeZone={timeZone}
                    onFerme={() => setEnEdition(null)}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {peutEditer && offres.length > 0 ? (
        <div className="mt-6 border-t-2 border-k-ink/10 pt-5">
          <NouvelleOffreForm timeZone={timeZone} />
        </div>
      ) : null}

      <InfoBulle
        id="offres-stock-aide"
        resume="Faire un « Drop » anti-gaspi"
        className="mt-5"
      >
        Un <strong>Drop</strong> n&apos;est pas un autre produit : c&apos;est une
        offre de stock dont la <strong>fenêtre est courte</strong> — une heure ou
        deux en fin de service, annoncées à l&apos;avance. Ce qui la rend
        efficace n&apos;est pas la remise mais le créneau : vos clients savent
        exactement quand venir, et vous savez combien de parts sont réellement
        tenues avant de fermer. Surveillez le compteur{" "}
        <strong>« non retirées »</strong> : s&apos;il monte, votre fenêtre est
        trop large ou trop tardive.
      </InfoBulle>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Les compteurs d'une offre
// ────────────────────────────────────────────────────────────

/**
 * « 4 restantes sur 20 » et non « 16/20 » : le chiffre qui intéresse celui qui
 * lit est celui qui reste — même règle que `Remplissage` pour les créneaux.
 */
function Compteurs({ offre }: { offre: StockOfferStaffView }) {
  return (
    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
      <div className="flex items-baseline gap-1.5">
        <dt className="font-semibold text-k-body">Restantes</dt>
        <dd className="font-black tabular-nums text-k-ink">
          {offre.remaining} / {offre.stockTotal}
        </dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="font-semibold text-k-body">Bloquées</dt>
        <dd className="font-black tabular-nums text-k-ink">
          {offre.heldCount}
        </dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="font-semibold text-k-body">Retirées</dt>
        <dd className="font-black tabular-nums text-k-ink">
          {offre.redeemedCount}
        </dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="font-semibold text-k-body">Non retirées</dt>
        <dd className="font-black tabular-nums text-k-ink">
          {offre.expiredCount}
        </dd>
      </div>
    </dl>
  );
}

// ────────────────────────────────────────────────────────────
// Création et édition — un seul formulaire, deux actions
// ────────────────────────────────────────────────────────────

/**
 * ── LES HEURES SONT SAISIES ET AFFICHÉES DANS LE FUSEAU DU COMMERCE ──
 *
 * Motif `CreneauForm`, et pour la même raison : un champ `datetime-local` ne
 * connaît que l'heure murale. `isoToZonedDateTimeInput` projette l'instant dans
 * le fuseau de l'établissement — sans quoi un simple aller-retour d'édition
 * décalerait la fenêtre de deux heures sans que personne n'y touche. Ce que le
 * commerçant écrit part TEL QUEL : c'est la server action, seule à connaître le
 * fuseau qui fait foi, qui en fait un instant.
 *
 * ── LE STATUT EST DANS CE FORMULAIRE, CONTRAIREMENT AUX CRÉNEAUX ──
 *
 * Un créneau naît en brouillon et s'ouvre par un second geste, parce que
 * l'ouvrir rend une page réservable. Une offre de stock porte le même risque —
 * mais elle porte aussi une FENÊTRE : ouvrir sans relire l'heure de fin est le
 * vrai piège ici, et les deux se relisent au même endroit. Le défaut reste
 * `draft` à la création : rien n'est visible tant que le commerçant ne l'a pas
 * choisi.
 */
function OffreStockForm({
  offre = null,
  timeZone,
  onFerme,
  instanceId = "",
}: {
  /** `null` : création. Sinon, édition de cette offre. */
  offre?: StockOfferStaffView | null;
  timeZone: string;
  onFerme?: () => void;
  /**
   * Suffixe d'identifiants pour le formulaire de CRÉATION, monté deux fois
   * (état vide et bas de liste) : deux `id` identiques casseraient `htmlFor`,
   * donc l'annonce au lecteur d'écran. En édition, l'identifiant de l'offre
   * joue déjà ce rôle.
   */
  instanceId?: string;
}) {
  const edition = offre !== null;
  const { state, pending, onSubmit } = useActionForm(
    edition ? updateStockOffer : createStockOffer,
    {
      resetOnSuccess: !edition,
      // Le rafraîchissement est le SEUL moyen de voir l'offre qui vient de
      // naître, et les compteurs qui la suivent : la liste n'a aucun état local.
      // Sans lui le commerçant ne voit rien, ressaisit, et crée un doublon.
      reloadOnSuccess: true,
      networkError: "Enregistrement impossible, réessayez.",
    },
  );
  const suffixe = edition ? `-${offre.offerId}` : `-nouvelle${instanceId}`;

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-xl rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      {edition ? <input type="hidden" name="id" value={offre.offerId} /> : null}

      <div>
        <Label htmlFor={`offre-titre${suffixe}`}>Titre de l&apos;offre</Label>
        <Input
          id={`offre-titre${suffixe}`}
          name="title"
          required
          maxLength={RESERVER_STOCK_TITLE_MAX}
          defaultValue={edition ? offre.title : ""}
          placeholder="Ex : Panier surprise du soir"
          autoFocus={!edition}
        />
      </div>

      {/* La description se préremplit depuis la vue de comptoir, qui la porte
          désormais : l'édition n'efface plus rien. */}
      <div className="mt-3">
        <Label htmlFor={`offre-description${suffixe}`}>
          Description{" "}
          <span className="font-semibold text-k-body">(facultatif)</span>
        </Label>
        <textarea
          id={`offre-description${suffixe}`}
          name="description"
          rows={3}
          maxLength={RESERVER_STOCK_DESCRIPTION_MAX}
          defaultValue={offre?.description ?? ""}
          placeholder="Ce que contient l'offre, où se présenter, ce qu'il faut apporter…"
          className={champDescription}
        />
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`offre-debut${suffixe}`}>
            Début du retrait
          </Label>
          <Input
            id={`offre-debut${suffixe}`}
            name="windowStartsAt"
            type="datetime-local"
            required
            defaultValue={
              edition && offre.windowStartsAt
                ? isoToZonedDateTimeInput(offre.windowStartsAt, timeZone)
                : ""
            }
          />
        </div>
        <div>
          <Label htmlFor={`offre-fin${suffixe}`}>Fin du retrait</Label>
          <Input
            id={`offre-fin${suffixe}`}
            name="windowEndsAt"
            type="datetime-local"
            required
            defaultValue={
              edition && offre.windowEndsAt
                ? isoToZonedDateTimeInput(offre.windowEndsAt, timeZone)
                : ""
            }
            aria-describedby={`offre-fenetre-aide${suffixe}`}
          />
        </div>
        <p
          id={`offre-fenetre-aide${suffixe}`}
          className="text-xs font-semibold text-k-body sm:col-span-2"
        >
          C&apos;est la seule chose que vos clients doivent retenir. Une fenêtre
          courte — une à deux heures — fait un <strong>Drop</strong> ; une
          fenêtre large immobilise du stock que personne ne vient chercher. Après
          la fin, les parts bloquées repartent en vente automatiquement.
        </p>

        <div>
          <Label htmlFor={`offre-stock${suffixe}`}>Nombre d&apos;unités</Label>
          <Input
            id={`offre-stock${suffixe}`}
            name="stockTotal"
            type="number"
            inputMode="numeric"
            min={RESERVER_STOCK_TOTAL_MIN}
            max={RESERVER_STOCK_TOTAL_MAX}
            step={1}
            required
            defaultValue={edition ? offre.stockTotal : 10}
            aria-describedby={`offre-stock-aide${suffixe}`}
          />
          <p
            id={`offre-stock-aide${suffixe}`}
            className="mt-1.5 text-xs font-semibold text-k-body"
          >
            {edition && offre.heldCount + offre.redeemedCount > 0
              ? `${offre.heldCount + offre.redeemedCount} unité${offre.heldCount + offre.redeemedCount > 1 ? "s" : ""} déjà engagée${offre.heldCount + offre.redeemedCount > 1 ? "s" : ""} : en dessous, le restant affiché tombe simplement à zéro.`
              : "Ce que vous avez réellement à donner. Rien n'est synchronisé avec votre caisse."}
          </p>
        </div>

        <div>
          <Label htmlFor={`offre-limite${suffixe}`}>
            Limite par personne
          </Label>
          <Input
            id={`offre-limite${suffixe}`}
            name="perPlayerLimit"
            type="number"
            inputMode="numeric"
            min={RESERVER_STOCK_PER_PLAYER_MIN}
            max={RESERVER_STOCK_PER_PLAYER_MAX}
            step={1}
            required
            defaultValue={
              edition ? offre.perPlayerLimit : RESERVER_STOCK_PER_PLAYER_DEFAUT
            }
            aria-describedby={`offre-limite-aide${suffixe}`}
          />
          <p
            id={`offre-limite-aide${suffixe}`}
            className="mt-1.5 text-xs font-semibold text-k-body"
          >
            Au-delà, la page rend au client la réservation qu&apos;il détient
            déjà, au lieu d&apos;un refus qu&apos;il ne comprendrait pas.
          </p>
        </div>
      </div>

      <div className="mt-3">
        <Label htmlFor={`offre-statut${suffixe}`}>État</Label>
        <select
          id={`offre-statut${suffixe}`}
          name="status"
          defaultValue={edition ? offre.status : "draft"}
          className={champSelect}
        >
          <option value="draft">Brouillon — invisible de vos clients</option>
          <option value="open">Ouverte — vos clients peuvent réserver</option>
          <option value="closed">
            Fermée — plus de réservation, les parts prises restent valables
          </option>
        </select>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Enregistrement…"
            : edition
              ? "Enregistrer l'offre"
              : "Créer l'offre"}
        </Button>
        {onFerme ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onFerme}
            disabled={pending}
          >
            Annuler
          </Button>
        ) : null}
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

/**
 * Le formulaire de création, replié derrière un bouton (motif `NouvelleFileForm`).
 *
 * `instanceId` suffixe les identifiants : ce formulaire est monté DEUX fois —
 * dans l'état vide et sous la liste — et deux `id` identiques casseraient
 * `htmlFor`, donc l'annonce au lecteur d'écran.
 */
function NouvelleOffreForm({
  timeZone,
  instanceId = "",
}: {
  timeZone: string;
  instanceId?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) {
    return (
      <Button onClick={() => setOuvert(true)}>+ Nouvelle offre de stock</Button>
    );
  }
  return (
    <OffreStockForm
      timeZone={timeZone}
      instanceId={instanceId}
      onFerme={() => setOuvert(false)}
    />
  );
}
