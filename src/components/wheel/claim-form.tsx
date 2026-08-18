"use client";

import { useEffect, useRef, useState } from "react";
import { claimPrize } from "@/actions/play";
import { capturePlayEvent } from "@/components/analytics";
// Deux libellés et une validation de date, sans zod : `@/lib/claim-libelles`
// est la moitié client de `validations/play` et `validations/sms`, qui
// n'entraient dans le lot de départ du parcours joueur que pour ces trois
// symboles-là. Mêmes signatures, même contrat.
import { isPlausibleBirthDate, smsConsentLabel } from "@/lib/claim-libelles";
import { playText } from "./play-theme";
import { LienPortefeuille } from "@/components/wallet/lien-portefeuille";
import { ProposerPasseport } from "@/components/loyalty/proposer-passeport";
import { RedeemQr } from "./redeem-qr";

export interface ClaimConfig {
  /** Demander l'email avant d'afficher le code. */
  collectEmail: boolean;
  /** Demander le téléphone avant d'afficher le code. */
  collectPhone: boolean;
  /** Secondes avant masquage de l'écran du code (null = jamais). */
  codeTtlSeconds: number | null;
}

type Status = "form" | "submitting" | "done";

/**
 * Borne du champ date de naissance : aujourd'hui moins N ans, au format
 * YYYY-MM-DD local. Simple aide de saisie — la validation réelle est
 * isPlausibleBirthDate (client et serveur).
 */
function birthDateBound(yearsAgo: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - yearsAgo);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Étape après un gain, pilotée par la config de la campagne :
 * - collecte email et/ou téléphone (+ prénom, CGU obligatoires) ; ou
 * - aucune collecte → le code est enregistré et affiché directement.
 * L'écran du code peut se masquer après un compte à rebours (le gagnant
 * le présente au staff dans le temps imparti).
 */
/*
 * PAS de `play-in` sur les cartes de ce composant — retiré le 2026-07-30.
 *
 * Il y en avait quatre, et ClaimForm est rendu DANS le bloc `play-in` de la
 * phase « won » (play-experience.tsx). Les opacités d'ancêtres se MULTIPLIENT :
 * 0,75 x 0,75 = 0,5625 pendant 450 ms, alors que le plancher de 0,75 avait été
 * calculé pour UNE seule couche — le commentaire de globals.css l'énonce
 * (« en dessous d'environ 0,72 le texte passe sous le seuil AA »).
 *
 * L'écran concerné est celui où le joueur saisit son prénom, son e-mail et
 * coche les conditions : `text-zinc-300` sur `bg-white/5` y tombait à ~3,1:1.
 * Aucun scan a11y ne l'a jamais vu — le seul du parcours joueur se fait AVANT
 * le spin.
 *
 * L'animation d'entrée n'est pas perdue : le parent la porte déjà pour tout
 * le bloc, et c'est bien à ce niveau qu'elle a du sens.
 */
export function ClaimForm({
  claimToken,
  config,
  slug,
  organizationName = "",
  organizationId = null,
  proposerPasseport = true,
  kermesse = false,
}: {
  claimToken: string;
  config: ClaimConfig;
  /** Slug du jeu — sert à mémoriser le prénom pour le retour personnalisé. */
  slug: string;
  /** Nom de l'établissement — libellé du consentement anniversaire. */
  organizationName?: string;
  /** Organisation du jeu — seule clé de la proposition de Passeport. */
  organizationId?: string | null;
  /** Faux sur les surfaces de fidélité (voir RedeemCodeScreen). */
  proposerPasseport?: boolean;
  /** Thème de page « kermesse » (crème + encre) — classes claires sinon. */
  kermesse?: boolean;
}) {
  const collectsData = config.collectEmail || config.collectPhone;
  const [status, setStatus] = useState<Status>(
    collectsData ? "form" : "submitting",
  );
  const [error, setError] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [walletUrl, setWalletUrl] = useState<string | null>(null);
  const [appleWalletUrl, setAppleWalletUrl] = useState<string | null>(null);
  const [anonymousAttempt, setAnonymousAttempt] = useState(0);
  // Anniversaire : sous-option de l'opt-in marketing (double consentement).
  // Décocher le marketing replie et décoche la sous-option — rien n'est envoyé.
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [birthdayOptIn, setBirthdayOptIn] = useState(false);
  const autoClaimed = useRef(false);

  // Aucune donnée à collecter : enregistrement immédiat du gain.
  useEffect(() => {
    if (collectsData || autoClaimed.current) return;
    autoClaimed.current = true;
    claimPrize({ claimToken })
      .then((result) => {
        if (!result.ok) {
          // Reste sur l'écran de statut (pas de formulaire à afficher).
          setError(result.error);
          return;
        }
        setRedeemCode(result.data.redeemCode);
        setWalletUrl(result.data.walletUrl);
        setAppleWalletUrl(result.data.appleWalletUrl);
        setStatus("done");
        capturePlayEvent("prize_claimed");
      })
      .catch(() => {
        // SANS CE `catch`, l'écran restait sur « Enregistrement de votre
        // gain… » POUR TOUJOURS : le bouton « Réessayer » ne se rend que si
        // `error` est posé, et une promesse rejetée n'en posait aucun. Une 4G
        // qui décroche au fond d'un magasin suffisait à faire perdre son lot
        // au gagnant, sans un mot.
        //
        // `autoClaimed` est remis à false : le tirage est déjà enregistré côté
        // serveur et `claimPrize` est idempotente sur son jeton, donc
        // réessayer rend le même code — jamais un second lot.
        autoClaimed.current = false;
        setError("Connexion perdue avant l'enregistrement. Réessayez.");
      });
  }, [collectsData, claimToken, anonymousAttempt]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status !== "form") return;
    setStatus("submitting");
    setError("");

    const form = new FormData(e.currentTarget);
    const firstName = String(form.get("firstName") ?? "").trim();
    // Anniversaire : uniquement avec le double consentement (marketing +
    // case dédiée). Validation alignée serveur : âge 13 à 120 ans.
    const sendBirthday = marketingOptIn && birthdayOptIn;
    const birthDate = sendBirthday
      ? String(form.get("birthDate") ?? "").trim()
      : "";
    if (birthDate && !isPlausibleBirthDate(birthDate)) {
      setStatus("form");
      setError("Date de naissance invalide");
      return;
    }
    // ENVELOPPÉ, et ça n'a rien d'ornemental : sans ce `try`, un rejet de la
    // promesse (réseau coupé pendant l'aller-retour) sautait le
    // `setStatus("form")` plus bas. Le bouton restait sur « Enregistrement… »,
    // désactivé, DÉFINITIVEMENT — aucun message, aucune reprise. Le lot avait
    // pourtant déjà été décrémenté du stock au tirage : le joueur attendait
    // devant un écran mort, puis fermait la page sans son code.
    let result;
    try {
      result = await claimPrize({
        claimToken,
        firstName,
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        acceptedTerms: form.get("acceptedTerms") === "on",
        marketingOptIn: form.get("marketingOptIn") === "on",
        // CONSENTEMENT SMS — lu au submit comme le reste du `FormData`, donc
        // la case reste NON CONTRÔLÉE (sans `checked`, sans `onChange`) : son
        // absence vaut refus, et rien n'est envoyé qui dirait « a refusé ».
        // Il voyage dans CETTE requête et non dans un second appel : voir le
        // pavé sous le champ téléphone.
        smsOptIn: form.get("sms_opt_in") === "on",
        ...(sendBirthday && birthDate
          ? { birthdayOptIn: true, birthDate }
          : {}),
      });
    } catch {
      // Le formulaire revient, la saisie est intacte, et l'envoi est rejouable
      // sans risque : `claimPrize` est idempotente sur son jeton.
      setStatus("form");
      setError("Connexion perdue. Vérifiez votre réseau et réessayez.");
      return;
    }

    if (!result.ok) {
      setStatus("form");
      setError(result.error);
      return;
    }
    setRedeemCode(result.data.redeemCode);
    setWalletUrl(result.data.walletUrl);
    setAppleWalletUrl(result.data.appleWalletUrl);
    setStatus("done");
    capturePlayEvent("prize_claimed");

    // Retour personnalisé : mémorisé côté client uniquement (aucune
    // donnée envoyée au serveur au-delà du claim lui-même).
    if (firstName) {
      try {
        sessionStorage.setItem(`lastchance:name:${slug}`, firstName);
      } catch {
        // Stockage indisponible (navigation privée…) — sans conséquence.
      }
    }
  }

  if (status === "done") {
    return (
      <RedeemCodeScreen
        redeemCode={redeemCode}
        ttlSeconds={config.codeTtlSeconds}
        emailSent={config.collectEmail}
        walletUrl={walletUrl}
        appleWalletUrl={appleWalletUrl}
        organizationId={organizationId}
        proposerPasseport={proposerPasseport}
        kermesse={kermesse}
      />
    );
  }

  if (status === "submitting" && !collectsData) {
    return (
      <div
        className={
          kermesse
            ? "k-border rounded-2xl bg-white p-6 text-center shadow-[4px_4px_0_var(--color-k-ink)]"
            : "rounded-2xl border border-white/10 bg-white/5 p-6 text-center"
        }
      >
        <p className={`text-sm ${kermesse ? "text-k-body" : "text-zinc-300"}`}>
          {error || "Enregistrement de votre gain…"}
        </p>
        {error && (
          <button
            type="button"
            onClick={() => {
              autoClaimed.current = false;
              setError("");
              setAnonymousAttempt((value) => value + 1);
            }}
            className={
              kermesse
                ? "k-btn-sm mt-4 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink"
                : "mt-4 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
            }
          >
            Réessayer
          </button>
        )}
      </div>
    );
  }

  const inputClass = kermesse
    ? "w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-k-ink placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
    : "w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400";

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-left">
      <label htmlFor="claim-first-name" className="sr-only">
        Votre prénom
      </label>
      <input
        id="claim-first-name"
        name="firstName"
        required
        maxLength={80}
        placeholder="Votre prénom"
        autoComplete="given-name"
        className={inputClass}
      />
      {config.collectEmail && (
        <>
          <label htmlFor="claim-email" className="sr-only">
            Votre email
          </label>
          <input
            id="claim-email"
            name="email"
            type="email"
            required
            placeholder="Votre email"
            autoComplete="email"
            className={inputClass}
          />
        </>
      )}
      {config.collectPhone && (
        <>
          <label htmlFor="claim-phone" className="sr-only">
            Votre téléphone
          </label>
          <input
            id="claim-phone"
            name="phone"
            type="tel"
            required
            pattern="\+?[0-9 .()-]{6,20}"
            placeholder="Votre téléphone"
            autoComplete="tel"
            className={inputClass}
          />
          {/*
           * CONSENTEMENT SMS — collé au champ qu'il concerne, et NON au bloc
           * des cases du bas.
           *
           * Trois raisons, dans cet ordre :
           *
           * 1. JAMAIS PRÉ-COCHÉE. Champ non contrôlé, sans `defaultChecked` et
           *    sans `checked` : le navigateur le rend vide, et une case vide
           *    n'est pas envoyée. L'ABSENCE du champ EST le refus — c'est
           *    exactement ce que le submit lit (`=== "on"`), et rien n'est
           *    envoyé qui dirait « a refusé ».
           * 2. DISTINCT DE L'E-MAIL. `marketingOptIn` plus bas est un autre
           *    consentement, sur un autre canal, avec un autre coût pour la
           *    personne. Les fondre en une case rendrait les deux invalides.
           *    Ils sont donc séparés PHYSIQUEMENT, pas seulement par leur nom.
           * 3. Le libellé est IMPORTÉ (`smsConsentLabel`), jamais recopié : ce
           *    qui est archivé avec le consentement est la VERSION du texte
           *    (`sms.v1`), pas un booléen. Recopier la phrase ici, c'est
           *    pouvoir la faire diverger de ce que la preuve prétend.
           *
           * CE CONSENTEMENT VOYAGE DANS LA REQUÊTE DU CLAIM, et il a fallu un
           * défaut pour l'apprendre : il partait auparavant dans un second
           * appel, envoyé après la réponse du claim. Or le dépôt du code de
           * retrait par SMS a lieu DANS le claim et commence par lire
           * `sms_consents` — au premier gain d'un numéro, il ne trouvait rien
           * et sortait sans rien déposer. Ce que le second appel protégeait
           * (organisation résolue par le serveur, version archivée, case
           * jamais pré-cochée) est tenu à l'identique par le nouveau chemin :
           * l'organisation vient du spin désigné par le jeton signé, ce qui
           * est plus strict qu'un slug envoyé par le formulaire.
           *
           * CE QUE `sms.v1` NE DIT PAS, et qu'on ne peut pas laisser
           * implicite : l'expéditeur portera le nom du commerce (11
           * caractères, contrainte AF2M), mais un expéditeur alphanumérique
           * NE PEUT PAS RECEVOIR DE RÉPONSE — le STOP part vers le numéro
           * court de l'opérateur. Promettre l'arrêt « auprès du commerçant »
           * serait une promesse non tenue sur le SEUL moyen de sortie que la
           * personne possède. D'où la précision qui suit le texte versionné.
           */}
          <label
            className={`flex items-start gap-3 text-sm ${kermesse ? "text-k-body/80" : "text-zinc-300"}`}
          >
            <input
              type="checkbox"
              name="sms_opt_in"
              className={`mt-1 h-4 w-4 shrink-0 ${kermesse ? "accent-k-ink" : "accent-violet-500"}`}
            />
            {/* Le texte VERSIONNÉ porte désormais lui-même le nom de
                l'établissement et la destination du STOP — les deux manques
                qui rendaient l'ancienne rédaction incomplète comme preuve de
                consentement. La précision jadis ajoutée à côté, en ton
                secondaire, est donc supprimée : une phrase de consentement
                complétée par une note en petit à côté est une phrase de
                consentement incomplète, et c'est la première qui est
                archivée. */}
            <span>{smsConsentLabel(organizationName)}</span>
          </label>
        </>
      )}

      <label className={`flex items-start gap-3 text-sm ${kermesse ? "text-k-body" : "text-zinc-300"}`}>
        <input
          type="checkbox"
          name="acceptedTerms"
          required
          className={`mt-1 h-4 w-4 shrink-0 ${kermesse ? "accent-k-ink" : "accent-violet-500"}`}
        />
        <span>
          J&apos;accepte les conditions du jeu et le traitement de mes
          données pour la remise de mon gain.{" "}
          <span className={kermesse ? "text-k-orange" : "text-violet-300"}>*</span>
        </span>
      </label>

      <label className={`flex items-start gap-3 text-sm ${kermesse ? "text-k-body/80" : "text-zinc-300"}`}>
        <input
          type="checkbox"
          name="marketingOptIn"
          checked={marketingOptIn}
          onChange={(e) => {
            setMarketingOptIn(e.target.checked);
            if (!e.target.checked) setBirthdayOptIn(false);
          }}
          className={`mt-1 h-4 w-4 shrink-0 ${kermesse ? "accent-k-ink" : "accent-violet-500"}`}
        />
        <span>
          J&apos;accepte de recevoir les offres et actualités de
          l&apos;établissement (optionnel).
        </span>
      </label>

      {marketingOptIn && (
        <div className="ml-7 space-y-2">
          <label className={`flex items-start gap-3 text-sm ${kermesse ? "text-k-body/80" : "text-zinc-300"}`}>
            <input
              type="checkbox"
              checked={birthdayOptIn}
              onChange={(e) => setBirthdayOptIn(e.target.checked)}
              className={`mt-1 h-4 w-4 shrink-0 ${kermesse ? "accent-k-ink" : "accent-violet-500"}`}
            />
            <span>
              Recevoir une petite attention pour mon anniversaire 🎂
              (optionnel).
            </span>
          </label>
          {birthdayOptIn && (
            <div>
              <label
                htmlFor="claim-birth-date"
                className={`mb-1.5 block text-xs ${kermesse ? "text-k-body/80" : "text-zinc-300"}`}
              >
                J&apos;accepte que {organizationName || "l'établissement"}{" "}
                utilise ma date de naissance pour m&apos;envoyer une offre
                d&apos;anniversaire.
              </label>
              <input
                id="claim-birth-date"
                name="birthDate"
                type="date"
                min={birthDateBound(120)}
                max={birthDateBound(13)}
                autoComplete="bday"
                className={inputClass}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" aria-live="assertive" className={`text-sm ${kermesse ? "text-red-600 font-semibold" : "text-red-400"}`}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className={
          kermesse
            ? "k-btn w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-70"
            : "w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-6 py-4 text-base font-extrabold uppercase tracking-wider text-white shadow-[0_12px_34px_rgba(139,92,246,.45)] disabled:opacity-70"
        }
      >
        {status === "submitting" ? "Enregistrement…" : "Récupérer mon gain"}
      </button>
      <p className={`text-center text-[11px] ${playText.muted(kermesse)}`}>
        Vos données ne servent qu&apos;à la remise du gain — jamais liées à
        un avis en ligne. <a href="/privacy" target="_blank" className="underline">Confidentialité</a>
      </p>
    </form>
  );
}

/**
 * Écran du code de retrait. Si un compte à rebours est configuré, le
 * code se masque à la fin du décompte.
 */
/**
 * L'écran qui montre au gagnant son code de retrait.
 *
 * ── EXPORTÉ POUR ÊTRE RENDU EN TEST, ET C'EST LE POINT ──────────────
 *
 * Ce composant est le point de passage de HUIT surfaces : les quatre écrans
 * de roue (`play-experience`, `game-shell`, `scratch-experience`,
 * `skill-game-shell`) et les quatre tours offerts (calendrier, fidélité,
 * quiz, parrainage). Poser le lien vers le portefeuille ici plutôt que dans
 * chacune d'elles évite huit copies — mais rend d'autant plus nécessaire de
 * PROUVER qu'il y est rendu, puisqu'un seul oubli les priverait toutes.
 *
 * ── ET C'EST AUSSI POURQUOI `proposerPasseport` EXISTE ──────────────
 *
 * La mutualisation joue dans les deux sens : greffer ici la proposition de
 * Passeport la poserait AUSSI sur le tour offert PAR LE PASSEPORT lui-même
 * (`loyalty-spin-experience`), c'est-à-dire inviter le joueur à découvrir la
 * page d'où il vient. Les surfaces de fidélité passent donc explicitement
 * `proposerPasseport={false}` ; partout ailleurs le défaut `true` s'applique,
 * et un test l'affirme.
 */
export function RedeemCodeScreen({
  redeemCode,
  ttlSeconds,
  emailSent,
  walletUrl,
  appleWalletUrl = null,
  organizationId = null,
  proposerPasseport = true,
  kermesse = false,
}: {
  redeemCode: string;
  ttlSeconds: number | null;
  emailSent: boolean;
  walletUrl: string | null;
  appleWalletUrl?: string | null;
  /** Organisation du jeu — sans elle, aucune proposition n'est faite. */
  organizationId?: string | null;
  /** Faux sur les surfaces de fidélité (tour offert du passeport). */
  proposerPasseport?: boolean;
  kermesse?: boolean;
}) {
  const [secondsLeft, setSecondsLeft] = useState(ttlSeconds);

  useEffect(() => {
    if (ttlSeconds == null) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((s) => (s == null || s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [ttlSeconds]);

  const cardClass = kermesse
    ? "k-border rounded-2xl bg-white p-6 text-center shadow-[6px_6px_0_var(--color-k-ink)]"
    : "rounded-2xl border border-white/10 bg-white/5 p-6 text-center";

  // Rendue dans les DEUX vues : un code expiré est encore un jeu joué, et
  // c'est même là que revenir a le plus de valeur pour le joueur.
  const passeport =
    proposerPasseport && organizationId ? (
      <ProposerPasseport organizationId={organizationId} kermesse={kermesse} />
    ) : null;

  if (secondsLeft === 0) {
    return (
      <div className={cardClass}>
        <div className="text-4xl mb-4">⏱️</div>
        <p className={`font-semibold mb-2 ${kermesse ? "text-k-ink font-black" : "text-white"}`}>Code masqué</p>
        <p className={`text-sm ${kermesse ? "text-k-body" : "text-zinc-300"}`}>
          {/* CE DÉLAI N'EST PAS UN MASQUAGE, C'EST UNE EXPIRATION. Le même
              réglage arme `redeem_expires_at` en base, et la caisse refuse le
              code passé l'échéance. Renvoyer le gagnant vers son email était
              donc l'envoyer chercher un code que le serveur a déjà invalidé —
              il revenait au comptoir se faire refuser, sans comprendre. */}
          Ce code n&apos;est plus valable.
          {" Rapprochez-vous du staff si vous n'avez pas pu le présenter."}
        </p>
        {/* Le lien vaut ici AUTANT que sur le code valide, et pour une raison
            propre à cet écran : « rapprochez-vous du staff » laisse le client
            sans rien à regarder. Le portefeuille lui montre ce lot avec son
            statut réel — et surtout ses AUTRES lots, qui eux sont peut-être
            encore bons. */}
        <p className="mt-3">
          <LienPortefeuille />
        </p>
        {passeport}
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className={cardClass}>
      <p className={`text-[11px] font-mono tracking-[0.25em] mb-2 ${kermesse ? "text-k-body" : "text-zinc-300"}`}>
        VOTRE CODE
      </p>
      <p className={`text-3xl font-mono font-bold tracking-[0.2em] ${kermesse ? "text-k-ink" : "text-white"}`}>
        {redeemCode}
      </p>
      <RedeemQr value={redeemCode} />
      <p className={`mt-4 text-sm ${kermesse ? "text-k-body" : "text-zinc-300"}`}>
        Présentez ce code (ou faites-le scanner) au staff pour récupérer
        votre gain.
        {emailSent && " Il vous a aussi été envoyé par email."}
      </p>
      <p className="mt-3">
        <LienPortefeuille />
      </p>
      {(walletUrl || appleWalletUrl) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {walletUrl && (
            <a
              href={walletUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white ${kermesse ? "border-2 border-k-ink" : ""}`}
            >
              Ajouter à Google Wallet
            </a>
          )}
          {appleWalletUrl && (
            <a
              href={appleWalletUrl}
              className={`inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white ${kermesse ? "border-2 border-k-ink" : ""}`}
            >
               Ajouter à Apple Wallet
            </a>
          )}
        </div>
      )}
      {secondsLeft != null && (
        <p className={`mt-3 text-xs font-mono ${kermesse ? "text-k-orange font-bold" : "text-amber-300"}`}>
          ⏱ Ce code disparaît dans {secondsLeft} s
        </p>
      )}
      {passeport}
    </div>
  );
}
