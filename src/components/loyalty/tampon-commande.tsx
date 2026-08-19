"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  stampLoyaltyOrder,
  type LoyaltyStampActionResult,
} from "@/actions/loyalty";
import {
  TurnstileWidget,
  turnstileClientEnabled,
} from "@/components/wheel/turnstile-widget";
import { jetonDeLAdresse } from "@/lib/jeton-de-l-adresse";
import type { LoyaltyMessageTone } from "./loyalty-passport-state";
import { messageForOrderStamp } from "./tampon-commande-state";

/**
 * QR DE COMMANDE UNIQUE — écran client (cahier §7).
 *
 * Le client déballe son colis, scanne la carte glissée dedans, et pose SON
 * tampon. Trois propriétés tiennent tout l'écran :
 *
 *  1. LE TAMPON NE SE POSE JAMAIS AU CHARGEMENT. Même règle que la chasse et
 *     que le passeport : un préchargement de lien, un antivirus qui suit les
 *     URL, un aperçu de messagerie brûleraient le jeton sans que personne
 *     n'ait rien demandé — et le jeton est à usage unique, donc perdu. Le
 *     tampon part au POST d'un bouton, et de rien d'autre.
 *  2. UNE CARTE DÉJÀ SERVIE N'EST PAS UNE ERREUR. Le client qui rouvre son
 *     onglet doit lire une phrase calme, et surtout garder son chemin vers le
 *     passeport : c'est son écran, servi ou non.
 *  3. `too_soon` N'EXISTE PAS ICI. Le jeton contourne le cooldown du
 *     programme (deux commandes le même jour = deux tampons). Aucun état n'est
 *     prévu pour lui ; le repli de `messageForOrderStamp` le couvrirait tout
 *     de même si la base en renvoyait un.
 *
 * Le challenge anti-robot suit EXACTEMENT le mécanisme du passeport
 * (`loyalty-passport.tsx`) : le serveur ne le réclame que pour une identité
 * inconnue, l'écran l'affiche alors et REJOUE le tampon tout seul dès que le
 * jeton arrive — le client n'a rien à refaire. Un seul rejeu automatique : si
 * le serveur redemande le contrôle juste après, c'est la vérification qui ne
 * passe pas, et boucler ne ferait que marteler le serveur.
 */

const TONE_BOX: Record<LoyaltyMessageTone, string> = {
  success: "border-k-ink bg-k-green/15 text-k-ink",
  info: "border-k-ink bg-k-blue/25 text-k-ink",
  warning: "border-k-ink bg-k-yellow/50 text-k-ink",
  error: "border-red-400 bg-red-50 text-red-700",
};

/** Où en est le challenge anti-robot (miroir de `loyalty-passport.tsx`). */
type ChallengePhase = "loading" | "ready" | "expired" | "unavailable";

export interface TamponCommandeProps {
  programId: string;
  programName: string;
  organizationName: string;
  logoUrl: string | null;
  /** Le jeton était DÉJÀ consommé au chargement : aucun bouton n'est proposé. */
  alreadyConsumed: boolean;
}

export function TamponCommande({
  programId,
  programName,
  organizationName,
  logoUrl,
  alreadyConsumed,
}: TamponCommandeProps) {
  const [result, setResult] = useState<LoyaltyStampActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [challengeRequired, setChallengeRequired] = useState(false);
  const [challengeNonce, setChallengeNonce] = useState(0);
  const [challengePhase, setChallengePhase] = useState<ChallengePhase>("loading");

  // Un envoi à la fois, garanti hors du cycle de rendu : le rejeu automatique
  // se déclenche depuis un effet, donc potentiellement avant que `pending`
  // n'ait été appliqué à l'écran.
  const enVolRef = useRef(false);
  // Rejeu armé par un refus « challenge requis », désarmé au premier rejeu.
  const rejeuArmeRef = useRef(false);

  const envoyer = useCallback(
    async (jeton: string | null, estRejeu: boolean) => {
      if (enVolRef.current) return;
      enVolRef.current = true;
      setPending(true);

      let res: LoyaltyStampActionResult;
      try {
        res = await stampLoyaltyOrder({
          // Lu de l'adresse À L'ENVOI, et non reçu en prop : une prop serveur →
          // client est recopiée en clair dans le HTML (payload RSC), et ce
          // jeton-ci pose un tampon à usage unique.
          orderToken: jetonDeLAdresse(),
          turnstileToken: jeton,
        });
      } catch {
        // Server Action injoignable (réseau du client coupé). Sans ce filet
        // l'exception remonterait à la frontière d'erreur et effacerait tout
        // l'écran au lieu d'afficher une phrase.
        res = {
          ok: false,
          error: "Connexion perdue. Vérifiez votre réseau puis réessayez.",
        };
      } finally {
        enVolRef.current = false;
        setPending(false);
      }

      // Un jeton Turnstile est à usage unique : dès qu'il part il est brûlé,
      // il faut remonter le widget (nouvelle `key`) pour en obtenir un frais.
      if (jeton) {
        setCaptchaToken(null);
        setChallengePhase("loading");
        setChallengeNonce((n) => n + 1);
      }

      if (!res.ok && res.challengeRequired) {
        setChallengeRequired(true);
        rejeuArmeRef.current = !estRejeu;
      } else {
        rejeuArmeRef.current = false;
      }
      setResult(res);
    },
    [],
  );

  // Rejeu automatique dès qu'un jeton frais arrive.
  useEffect(() => {
    if (!rejeuArmeRef.current || !captchaToken || pending) return;
    rejeuArmeRef.current = false;
    void envoyer(captchaToken, true);
  }, [captchaToken, pending, envoyer]);

  const handleToken = useCallback((jeton: string | null) => {
    setCaptchaToken(jeton);
    // `null` vient d'expired-callback ou d'error-callback ; ce dernier
    // enchaîne sur `onUnavailable`, qui écrasera la phase.
    setChallengePhase(jeton ? "ready" : "expired");
  }, []);

  const handleUnavailable = useCallback(() => {
    setCaptchaToken(null);
    setChallengePhase("unavailable");
  }, []);

  const relancerChallenge = useCallback(() => {
    setCaptchaToken(null);
    setChallengePhase("loading");
    setChallengeNonce((n) => n + 1);
  }, []);

  const etat = result?.ok ? result.data.state : null;
  // Un refus « challenge requis » n'est pas un message d'erreur : le bloc de
  // contrôle qui s'affiche juste en dessous EST la réponse.
  const erreur =
    result && !result.ok && !result.challengeRequired ? result.error : null;

  // Servi d'entrée (contexte serveur) ou servi par la réponse du tampon : le
  // même écran, et dans les deux cas le lien vers le passeport reste offert.
  const servi = alreadyConsumed || etat === "order_invalid";
  const abouti = servi || etat !== null || erreur !== null;
  const message = etat !== null ? messageForOrderStamp(etat) : null;

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
            📦
          </div>
        )}
        <p className="text-xs font-bold uppercase tracking-wide text-k-body">
          {organizationName}
        </p>
        <h1 className="mt-1 text-2xl font-black leading-tight text-k-ink">
          Votre commande vous offre un tampon de fidélité
        </h1>
        <p className="mt-2 text-sm font-bold text-k-body">{programName}</p>
      </header>

      <section className="k-border rounded-2xl bg-white p-5 text-center shadow-[6px_6px_0_var(--color-k-ink)]">
        {alreadyConsumed ? (
          <div
            role="status"
            className={`rounded-xl border-2 px-4 py-3 text-left ${TONE_BOX.info}`}
          >
            <p className="text-sm font-black">Carte déjà servie</p>
            <p className="mt-0.5 text-sm font-bold">
              Le tampon de cette commande a déjà été ajouté. Votre passeport,
              lui, reste ouvert.
            </p>
          </div>
        ) : (
          <>
            {!abouti && (
              <p className="mb-4 text-sm font-bold text-k-body">
                Une carte, un tampon : appuyez une fois, c&apos;est tout.
              </p>
            )}

            {/* Région vivante montée en permanence : un lecteur d'écran
                annonce l'apparition du bloc de contrôle (une région insérée
                en même temps que son contenu ne serait pas lue de façon
                fiable). */}
            <div aria-live="polite">
              {challengeRequired && (
                <ControleAntiRobot
                  phase={challengePhase}
                  nonce={challengeNonce}
                  onToken={handleToken}
                  onUnavailable={handleUnavailable}
                  onRestart={relancerChallenge}
                />
              )}
            </div>

            {etat !== "stamped" && (
              <button
                type="button"
                onClick={() => void envoyer(captchaToken, false)}
                disabled={pending}
                className="k-btn mt-4 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
              >
                {pending ? "Validation…" : "Ajouter mon tampon"}
              </button>
            )}

            {message && (
              <div
                role="status"
                aria-live="polite"
                className={`mt-4 rounded-xl border-2 px-4 py-3 text-left ${TONE_BOX[message.tone]}`}
              >
                <p className="text-sm font-black">{message.title}</p>
                {message.body && (
                  <p className="mt-0.5 text-sm font-bold">{message.body}</p>
                )}
              </div>
            )}

            {erreur && (
              <p
                role="alert"
                className="mt-3 text-sm font-semibold text-red-600"
              >
                {erreur}
              </p>
            )}
          </>
        )}

        {/* LE PASSEPORT RESTE OFFERT, SERVI OU NON. Le client a droit à son
            écran même si la carte a déjà donné son tampon — c'est même le seul
            endroit où il peut vérifier que le tampon y est bien. */}
        {(abouti || servi) && (
          <p className="mt-5">
            <Link
              href={`/passeport/${programId}`}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-black text-k-ink hover:bg-k-yellow/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              🎟️ Mon Passeport
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * Bloc de contrôle anti-robot — réclamé par le serveur pour une identité
 * inconnue (ouverture d'un passeport). Il doit rester ACTIONNABLE en toutes
 * circonstances : sans jeton jouable, la protection deviendrait une porte
 * fermée pour un client qui vient pourtant d'acheter. Chaque issue a donc son
 * message et sa sortie — jamais un cadre vide.
 */
function ControleAntiRobot({
  phase,
  nonce,
  onToken,
  onUnavailable,
  onRestart,
}: {
  phase: ChallengePhase;
  nonce: number;
  onToken: (token: string | null) => void;
  onUnavailable: () => void;
  onRestart: () => void;
}) {
  const peutRendre = turnstileClientEnabled();

  return (
    <div
      role="group"
      aria-labelledby="commande-challenge-titre"
      className="mt-4 rounded-xl border-2 border-k-ink bg-k-blue/20 px-4 py-3 text-left"
    >
      <p id="commande-challenge-titre" className="text-sm font-black text-k-ink">
        Confirmez que vous n&apos;êtes pas un robot
      </p>
      <p className="mt-0.5 text-xs font-bold text-k-body">
        Une seule fois, le temps de créer votre carte. Votre tampon part tout
        seul dès que le contrôle est validé.
      </p>

      {peutRendre ? (
        <>
          <TurnstileWidget
            key={nonce}
            action="loyalty-stamp"
            onToken={onToken}
            onUnavailable={onUnavailable}
          />
          {phase === "loading" && (
            <p className="mt-2 text-center text-xs font-bold text-k-body motion-safe:animate-pulse">
              Contrôle en cours…
            </p>
          )}
          {phase === "ready" && (
            <p className="mt-2 text-center text-xs font-bold text-k-ink">
              ✓ Contrôle validé.
            </p>
          )}
          {(phase === "expired" || phase === "unavailable") && (
            <div className="mt-2 text-center">
              <p className="text-xs font-bold text-red-700">
                {phase === "expired"
                  ? "Le contrôle a expiré avant l'envoi."
                  : "Le contrôle n'a pas pu se charger (connexion instable ou bloqueur de publicités)."}
              </p>
              <button
                type="button"
                onClick={onRestart}
                className="mt-2 rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/30"
              >
                Recommencer le contrôle
              </button>
            </div>
          )}
        </>
      ) : (
        // Clé de site absente du navigateur alors que le serveur exige le
        // contrôle : rien ne pourra jamais s'afficher ici. On le dit, plutôt
        // que de laisser un cadre vide sous « validez le contrôle ci-dessous ».
        <p className="mt-2 text-xs font-bold text-red-700">
          Le contrôle anti-robot n&apos;est pas disponible sur cet appareil.
          Rechargez la page ; si le message revient, gardez votre carte et
          signalez-le au commerçant.
        </p>
      )}
    </div>
  );
}
