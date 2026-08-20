"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { cancelStockHold, holdStockOffer } from "@/actions/reserver";
import { DefiAntiRobot } from "@/components/reserver/defi-antirobot";
import { PastillePriseStock } from "@/components/reserver/pastilles";
import {
  formatFenetreStock,
  RESERVER_EMAIL_MAX,
  type EtatUiOffreStock,
  type EtatUiPriseStock,
  type StockHoldMineView,
} from "@/lib/reserver";
import { formatDate } from "@/lib/utils";
import { useActionForm } from "@/lib/use-action-form";

/**
 * « RÉSERVE TON OFFRE » — le parcours joueur du blocage de stock (RES-5, L9).
 *
 * Le client scanne le QR posé sur l'étal, bloque UNE unité (ou son plafond
 * personnel), et repart avec un code `RESA-` à présenter au comptoir DANS la
 * fenêtre annoncée. Aucun compte : son identité est le cookie HTTP-only, dont la
 * base ne voit que l'empreinte — même contrat que les créneaux et la file.
 *
 * ── LE « DROP » N'EST PAS UN AUTRE OBJET ──
 *
 * Un Drop anti-gaspi est cette même offre, avec une fenêtre courte et annoncée.
 * Il n'a donc ni composant, ni route, ni état à lui : ce qui change est la durée
 * que le commerçant saisit. Lui fabriquer un écran séparé aurait dupliqué le
 * blocage, le code et l'annulation pour ne changer qu'un mot.
 *
 * ── AUCUNE PROMESSE DE STOCK TEMPS RÉEL ──
 *
 * Le restant affiché est celui de l'INSTANT DU RENDU, et le cahier l'exige
 * (« aucune synchronisation de caisse/POS ni promesse de stock marchand en temps
 * réel »). `stock_offer_public_state` le dit de lui-même : c'est une photo non
 * verrouillée. Seule `hold_stock_offer` tranche, sous verrou — d'où l'absence de
 * compte à rebours, de scrutin et de toute mise en scène d'urgence : le seul
 * chiffre qu'on montre est celui qu'on peut tenir, et il est écrit sobrement.
 *
 * ── LES VERDICTS VIENNENT DU SERVEUR ──
 *
 * `etat`, `etatPrise` et `retraitOuvert` sont tranchés par la page, pas ici. Un
 * `Date.now()` dans un corps de composant est impur (règle
 * `react-hooks/purity`), et surtout l'instant qui fait foi est celui du rendu
 * serveur — le même que celui du restant affiché juste au-dessus. Les deux ne
 * peuvent pas se contredire.
 *
 * ── CONVENTIONS VISUELLES ──
 *
 * HTML natif et classes `k-*`, comme les dix autres parcours joueur : crème,
 * encre, jaune. Jamais de `text-zinc-500` sur crème — le corps secondaire est
 * `text-k-body`, dont le contraste est mesuré.
 */

const carteClass =
  "k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]";

/**
 * L'offre telle que cet écran en a besoin — les champs de
 * `StockOfferPublicStateResult` déjà résolus par la page.
 *
 * La RPC rend presque tout `nullable` (un document `unavailable` n'a ni titre ni
 * fenêtre). La page a déjà écarté ce cas par son `notFound()` ; propager les
 * `| null` jusqu'ici aurait obligé chaque ligne de rendu à décider quoi afficher
 * « si l'offre n'a pas de titre », c'est-à-dire à rejouer un verdict déjà pris.
 */
export interface OffreStockView {
  id: string;
  title: string;
  description: string | null;
  windowStartsAt: string;
  windowEndsAt: string;
  perPlayerLimit: number;
  /** Honnête à l'instant du rendu serveur, et rien de plus. */
  remaining: number;
}

export function OffreStockExperience({
  organizationId,
  organizationName,
  logoUrl,
  offre,
  etat,
  accepteePrise,
  maPrise,
  etatPrise,
  retraitOuvert,
  timeZone,
}: {
  /**
   * Chez QUI le client croit réserver. `hold_stock_offer` l'EXIGE : c'est sa
   * borne de locataire — sans elle, un identifiant d'offre, qui circule en clair
   * dans les URL publiques, suffirait à écrire dans les tables d'une AUTRE
   * organisation. Il vient du contexte de CETTE page, jamais d'une saisie.
   */
  organizationId: string;
  organizationName: string;
  logoUrl: string | null;
  offre: OffreStockView;
  /** Verdict d'écran tranché par le chargeur, à l'instant du rendu. */
  etat: EtatUiOffreStock;
  /** Indicatif : `hold_stock_offer` reste seule juge, sous verrou. */
  accepteePrise: boolean;
  /** La prise vivante ou récente de CE navigateur, ou `null`. */
  maPrise: StockHoldMineView | null;
  etatPrise: EtatUiPriseStock | null;
  /**
   * La fenêtre de retrait a-t-elle commencé ? C'est la borne BASSE de
   * `redeem_stock_hold`, et elle n'existe nulle part ailleurs — ni dans le
   * statut de la prise, ni dans le registre, qui n'a pas de mot pour « trop
   * tôt ». Sans elle, le client se présente à l'ouverture du magasin et
   * s'entend refuser un code pourtant valable.
   */
  retraitOuvert: boolean;
  timeZone: string;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <header className="mb-6 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={organizationName}
            width={56}
            height={56}
            className="mx-auto mb-3 h-14 w-14 rounded-full border-2 border-k-ink bg-white object-cover"
          />
        ) : (
          <div className="mx-auto mb-3 text-4xl" aria-hidden>
            🛍️
          </div>
        )}
        <p className="text-xs font-bold uppercase tracking-wide text-k-body">
          {organizationName}
        </p>
        <h1 className="mt-1 text-2xl font-black leading-tight text-k-ink">
          {offre.title}
        </h1>
        {offre.description ? (
          <p className="mt-3 whitespace-pre-line text-sm font-medium leading-relaxed text-k-ink">
            {offre.description}
          </p>
        ) : null}
      </header>

      {/* LA FENÊTRE EST EN HAUT, AVANT LE BOUTON, et c'est le point du module :
          bloquer une unité qu'on ne peut pas venir chercher ne rend service à
          personne. Elle est répétée sur le code plus bas — c'est ce que le
          client rouvrira sa page pour relire. */}
      <div className="mb-6 rounded-2xl border-2 border-k-ink bg-k-yellow/40 px-4 py-3 text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-k-body">
          Fenêtre de retrait
        </p>
        <p className="mt-1 text-sm font-black leading-snug text-k-ink">
          À retirer{" "}
          {formatFenetreStock(
            offre.windowStartsAt,
            offre.windowEndsAt,
            timeZone,
          )}
        </p>
        <p className="mt-1 text-xs font-medium text-k-body">
          Passé cette heure, votre part repart en vente automatiquement.
        </p>
      </div>

      {maPrise && etatPrise ? (
        <section aria-labelledby="ma-prise-titre" className="mb-6">
          <h2
            id="ma-prise-titre"
            className="mb-3 text-sm font-black uppercase tracking-wide text-k-body"
          >
            🎫 Ma réservation
          </h2>
          <MaPriseStock
            prise={maPrise}
            etat={etatPrise}
            offre={offre}
            retraitOuvert={retraitOuvert}
            timeZone={timeZone}
          />
          <p className="mt-2 px-1 text-xs font-medium text-k-body">
            Cette réservation est retenue sur cet appareil, sans compte. Sur un
            autre téléphone elle n&apos;apparaîtra pas — présentez simplement
            votre code au comptoir.
          </p>
          <p className="mt-3 text-center text-sm font-bold">
            <Link
              href="/portefeuille"
              className="text-k-ink underline underline-offset-2 hover:text-k-orange"
            >
              Voir mes récompenses
            </Link>
          </p>
        </section>
      ) : null}

      {/* Le formulaire ne s'affiche QUE là où il peut aboutir. Un client qui
          détient déjà sa part n'a rien à reprendre : `hold_stock_offer` lui
          rendrait `already_held` et son propre code, ce que la carte au-dessus
          montre déjà. */}
      {!maPrise && accepteePrise ? (
        <ReserverMonOffre
          organizationId={organizationId}
          offre={offre}
          timeZone={timeZone}
        />
      ) : null}

      {!maPrise && !accepteePrise ? <OffreIndisponible etat={etat} /> : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Bloquer sa part
// ────────────────────────────────────────────────────────────

function ReserverMonOffre({
  organizationId,
  offre,
  timeZone,
}: {
  organizationId: string;
  offre: OffreStockView;
  timeZone: string;
}) {
  const [consent, setConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [challengeDemande, setChallengeDemande] = useState(false);

  /**
   * `holdStockOffer` prend un OBJET, pas un `FormData` — contrat des actions
   * publiques du dépôt. `useActionForm` attend la forme `(prev, formData)` :
   * cet adaptateur fait le pont, et il reste indispensable pour la raison qui a
   * fait naître ce hook (docs/bugs.md) — un `pending` qui ne retombe pas laisse
   * le bouton figé sur « Réservation… » alors que l'unité EST bloquée.
   */
  const action = useCallback(
    async (_prev: unknown, formData: FormData) => {
      const emailSaisi = String(formData.get("email") ?? "").trim();
      const consenti = formData.get("consent") === "on";

      // MÊME ÉQUIVALENCE QUE LA BASE (`reservation_stock_holds_consent_state` :
      // email et consentement vont ensemble ou pas du tout), tranchée ICI plutôt
      // qu'au serveur : une adresse saisie sans la case cochée ne doit JAMAIS
      // traverser le réseau, donc le refus ne peut pas venir de la réponse — à
      // ce moment-là l'adresse aurait déjà voyagé pour rien.
      if (emailSaisi && !consenti) {
        return {
          ok: false as const,
          error:
            "Cochez la case pour recevoir votre confirmation par email, ou laissez l'adresse vide.",
        };
      }

      const resultat = await holdStockOffer({
        organizationId,
        offerId: offre.id,
        // L'ADRESSE NE PART QUE CONSENTIE : la RPC la jetterait de toute façon
        // sans la case cochée.
        email: consenti && emailSaisi ? emailSaisi : undefined,
        consent: consenti,
        turnstileToken: captchaToken ?? undefined,
      });
      if (!resultat.ok && resultat.challengeRequired) {
        setChallengeDemande(true);
      }
      return resultat;
    },
    [organizationId, offre.id, captchaToken],
  );

  // `reloadOnSuccess` : le rafraîchissement est le SEUL moyen pour cette page de
  // montrer le code qui vient d'être émis — elle n'a aucun état local. Le client
  // qui ne voit rien re-clique ; la RPC est idempotente au plafond et lui
  // rendrait la même prise, mais il aurait cru avoir échoué.
  const { state, pending, onSubmit } = useActionForm(action, {
    reloadOnSuccess: true,
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — votre part n'a pas été bloquée.",
  });

  return (
    <div className={carteClass}>
      {/* LE RESTANT, SOBRE ET SANS COMPTE À REBOURS. Le chiffre est celui de
          l'instant du rendu ; le mettre en scène fabriquerait une urgence que le
          module ne peut pas tenir au comptoir — entre cette lecture et le clic,
          seule `hold_stock_offer` sait ce qu'il reste. */}
      <p className="text-sm font-bold text-k-body">
        <span className="font-black tabular-nums text-k-ink">
          Plus que {offre.remaining}
        </span>{" "}
        {offre.remaining > 1 ? "disponibles" : "disponible"}.
      </p>
      {offre.perPlayerLimit > 1 ? (
        <p className="mt-1 text-xs font-medium text-k-body">
          Jusqu&apos;à {offre.perPlayerLimit} par personne.
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-4">
        <label
          htmlFor="offre-stock-email"
          className="mb-1.5 block text-sm font-bold text-k-ink"
        >
          Votre email{" "}
          <span className="font-medium text-k-body">(facultatif)</span>
        </label>
        <input
          id="offre-stock-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={RESERVER_EMAIL_MAX}
          placeholder="vous@exemple.fr"
          aria-describedby="offre-stock-email-aide"
          className="w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-base text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
        />

        {/* LA CASE EST SÉPARÉE DU CHAMP, motif `reserveSlot` : sans elle, saisir
            une adresse vaudrait consentement — or une adresse conservée sans
            finalité ne se stocke pas, et la contrainte d'équivalence refuserait
            la ligne. */}
        <label
          htmlFor="offre-stock-consent"
          className="mt-3 flex cursor-pointer items-start gap-3"
        >
          <input
            id="offre-stock-consent"
            name="consent"
            type="checkbox"
            value="on"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-k-ink accent-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
          />
          <span className="text-sm font-bold text-k-ink">
            J&apos;accepte de recevoir par email la confirmation de cette
            réservation et le rappel de sa fenêtre de retrait.
          </span>
        </label>
        <p
          id="offre-stock-email-aide"
          className="mt-2 text-xs font-medium leading-relaxed text-k-body"
        >
          Votre adresse n&apos;est conservée et utilisée que si vous cochez cette
          case, et uniquement pour ces messages-là — jamais pour de la publicité.
          Sans email la réservation fonctionne : votre code s&apos;affiche sur
          cette page.
        </p>

        {/* Région vivante montée EN PERMANENCE : un `aria-live` créé en même
            temps que son contenu n'annonce rien, et l'apparition du contrôle
            anti-robot est précisément ce qu'un lecteur d'écran doit entendre. */}
        <div aria-live="polite">
          <DefiAntiRobot
            id={offre.id}
            action="reserver-stock-hold"
            visible={challengeDemande}
            onToken={setCaptchaToken}
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="k-btn mt-4 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
        >
          {pending ? "Réservation…" : "Réserver la mienne"}
        </button>

        <p className="mt-2 text-center text-xs font-medium text-k-body">
          Rien à payer ici : vous réglez au comptoir en venant la chercher,{" "}
          {formatFenetreStock(
            offre.windowStartsAt,
            offre.windowEndsAt,
            timeZone,
          )}
          .
        </p>

        {/* Régions vivantes montées EN PERMANENCE : un `aria-live` créé en même
            temps que son contenu n'annonce rien. */}
        <div aria-live="polite">
          {state?.ok ? (
            <p
              role="status"
              className="mt-3 rounded-xl border-2 border-k-ink bg-k-green/20 px-3 py-2 text-center text-sm font-black text-k-ink"
            >
              C&apos;est réservé ! Votre code apparaît en haut de cette page.
            </p>
          ) : null}
        </div>
        <div aria-live="assertive">
          {state && !state.ok ? (
            <p
              role="alert"
              className="mt-3 text-center text-sm font-bold text-red-700"
            >
              {state.error}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Ma prise — le code, et l'annulation tant qu'elle est possible
// ────────────────────────────────────────────────────────────

function MaPriseStock({
  prise,
  etat,
  offre,
  retraitOuvert,
  timeZone,
}: {
  prise: StockHoldMineView;
  etat: EtatUiPriseStock;
  offre: OffreStockView;
  retraitOuvert: boolean;
  timeZone: string;
}) {
  // `cancelStockHold` prend un OBJET : même adaptateur que le blocage. Aucun
  // identifiant ne transite par l'URL — la preuve de possession est le cookie,
  // que la server action relit elle-même (ADR-109).
  const action = useCallback(
    () => cancelStockHold({ holdId: prise.holdId }),
    [prise.holdId],
  );
  const { state, pending, onSubmit } = useActionForm(action, {
    reloadOnSuccess: true,
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — rien n'a été annulé.",
  });

  const terminee = etat === "annulee" || etat === "expiree";

  return (
    <div className={carteClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PastillePriseStock etat={etat} />
        <p className="text-sm font-black text-k-ink">{offre.title}</p>
      </div>

      {terminee ? (
        <p className="mt-3 rounded-xl border-2 border-k-ink/20 bg-zinc-50 px-3 py-2 text-sm font-bold text-k-body">
          {etat === "annulee"
            ? "Cette réservation a été annulée : votre part est repartie en vente."
            : "La fenêtre de retrait est passée : votre part est repartie en vente."}
        </p>
      ) : (
        <>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.25em] text-k-body">
            Votre code de retrait
          </p>
          <p className="mt-1 break-all font-mono text-3xl font-black tracking-wider text-k-ink">
            {prise.code}
          </p>
          <p className="mt-3 text-sm font-medium text-k-body">
            Donnez ce code au comptoir, à retirer{" "}
            {formatFenetreStock(
              offre.windowStartsAt,
              offre.windowEndsAt,
              timeZone,
            )}
            .
          </p>
        </>
      )}

      {/* « TROP TÔT » EST UN ÉTAT, ET LA PAGE DU CLIENT LE DIT AUSSI. La borne
          basse de `redeem_stock_hold` n'existe nulle part ailleurs : sans cette
          phrase, le client se présente dès qu'il a son code et s'entend refuser
          un retrait pourtant valable. */}
      {etat === "tenue" && !retraitOuvert ? (
        <p className="mt-3 rounded-xl border-2 border-k-ink bg-k-blue/20 px-3 py-2 text-sm font-bold text-k-ink">
          Retrait pas encore ouvert : revenez à partir du{" "}
          {formatDate(offre.windowStartsAt, timeZone)}.
        </p>
      ) : null}

      {etat === "retiree" ? (
        <p className="mt-3 rounded-xl border-2 border-k-ink bg-k-green/20 px-3 py-2 text-sm font-black text-k-ink">
          ✓ Vous l&apos;avez récupérée. Bonne journée !
        </p>
      ) : null}

      {/* Le bouton ne s'affiche QUE là où il peut réussir : une part déjà
          retirée ne s'annule plus (elle est sortie du magasin, et la contrainte
          terminale refuserait la ligne), une prise déjà annulée n'a rien à
          annuler, et une échéance passée se fait répondre `too_late`. */}
      {etat === "tenue" ? (
        <form onSubmit={onSubmit} className="mt-4">
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-sm font-bold text-k-ink hover:bg-k-yellow/30 disabled:pointer-events-none disabled:opacity-60"
          >
            {pending ? "Annulation…" : "Annuler ma réservation"}
          </button>
          <p className="mt-2 text-center text-xs font-medium text-k-body">
            Votre part repart aussitôt en vente pour quelqu&apos;un
            d&apos;autre.
          </p>
          <div aria-live="assertive">
            {state && !state.ok ? (
              <p
                role="alert"
                className="mt-2 text-center text-sm font-bold text-red-700"
              >
                {state.error}
              </p>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Les culs-de-sac, sobrement
// ────────────────────────────────────────────────────────────

/**
 * ÉPUISÉE, PASSÉE, FERMÉE — et rien de plus.
 *
 * Aucune date de réapprovisionnement, aucun « il en reste chez le voisin » :
 * `hold_stock_offer` rend `sold_out` avec `remaining: 0` et RIEN d'autre, pour
 * la raison écrite dans la migration — le module ne sait rien du stock réel
 * au-delà de ce nombre, et un oracle inventé se ferait démentir au comptoir.
 * L'écran s'en tient au même silence.
 *
 * `brouillon` figure dans le type mais n'est pas atteignable ici : la RPC rend
 * `unavailable` sur un brouillon, et la page a répondu 404 bien avant. Le
 * `Record` reste exhaustif pour que l'ajout d'un état futur fasse échouer `tsc`
 * plutôt que d'afficher une carte muette.
 */
const PHRASE_INDISPONIBLE: Record<EtatUiOffreStock, string> = {
  brouillon: "Cette offre n'est pas encore proposée.",
  ouverte: "Cette offre n'est plus disponible pour le moment.",
  epuisee: "Tout est parti pour cette fois.",
  passee: "La fenêtre de retrait de cette offre est passée.",
  fermee: "Cette offre n'est plus proposée pour le moment.",
};

function OffreIndisponible({ etat }: { etat: EtatUiOffreStock }) {
  return (
    <div className={carteClass}>
      <p className="text-center text-sm font-black text-k-ink">
        {PHRASE_INDISPONIBLE[etat]}
      </p>
      <p className="mt-1 text-center text-sm font-medium text-k-body">
        Repassez plus tard, ou demandez au comptoir quand la prochaine sera
        annoncée.
      </p>
    </div>
  );
}
