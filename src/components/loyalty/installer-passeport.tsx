"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * ── « GARDEZ VOTRE CARTE SUR VOTRE TÉLÉPHONE » ──
 *
 * Le passeport a un manifeste (`manifest.webmanifest/route.ts`) : il EST
 * installable. Mais un manifeste ne se voit pas. Sans invitation, la carte
 * reste une page ouverte une fois en boutique, retrouvée au prochain passage
 * en fouillant l'historique — c'est-à-dire jamais.
 *
 * ── POURQUOI DEUX CHEMINS, ET PAS UN BOUTON ──
 *
 * `beforeinstallprompt` est une extension Chromium. Il N'EXISTE PAS sur iOS :
 * Safari n'a jamais implémenté l'événement, et aucune API ne permet à une page
 * de déclencher « Sur l'écran d'accueil ». Un bouton unique serait donc un
 * bouton MORT pour la moitié des clients d'un commerce — pire que rien, parce
 * qu'un bouton qui ne fait rien se lit comme une panne du commerce.
 *
 * D'où deux rendus disjoints :
 * · Chromium — l'événement arrive, on l'attrape, un vrai bouton l'ouvre.
 * · iOS — aucun événement possible : une PHRASE décrit le geste exact du
 *   système (« Partager », puis « Sur l'écran d'accueil »). Pas de bouton.
 * · Partout ailleurs (Firefox bureau, navigateur intégré…) — RIEN. Ne pas
 *   savoir installer et le dire quand même ne rend service à personne.
 */

/**
 * L'événement Chromium, typé localement : il ne fait partie d'aucune lib DOM
 * standard, et le déclarer ici évite d'élargir les types globaux du projet
 * pour un composant.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Déjà lancé depuis l'écran d'accueil : plus rien à proposer. */
function dejaInstalle(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    iosStandalone === true
  );
}

/**
 * iPhone / iPad, y compris l'iPad qui se déclare « Macintosh » depuis iPadOS 13
 * (d'où le test sur le tactile). Volontairement large : au pire on montre une
 * phrase inutile, jamais un bouton mort.
 */
function estIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

/**
 * Lecture d'un état du NAVIGATEUR, pas d'un état de React — d'où
 * `useSyncExternalStore` et non un `useEffect` qui poserait le résultat dans
 * un state. Le faire en effet déclenchait un rendu en cascade à chaque montage
 * (`react-hooks/set-state-in-effect`), et surtout décrivait mal la chose : le
 * mode d'affichage et la plateforme ne sont pas des états que ce composant
 * possède, ce sont des faits extérieurs qu'il consulte.
 *
 * L'instantané serveur dit « déjà installé » : le rendu HTML ne porte donc
 * aucune invitation, et rien ne clignote à l'hydratation sur un appareil qui
 * n'a rien à installer.
 */
const abonnementInstallation = (revalider: () => void) => {
  const mq = window.matchMedia?.("(display-mode: standalone)");
  mq?.addEventListener("change", revalider);
  window.addEventListener("appinstalled", revalider);
  return () => {
    mq?.removeEventListener("change", revalider);
    window.removeEventListener("appinstalled", revalider);
  };
};

/** La plateforme ne change jamais en cours de session : rien à réabonner. */
const abonnementInerte = () => () => {};

export function InstallerPasseport({ commerce }: { commerce: string }) {
  const [invite, setInvite] = useState<BeforeInstallPromptEvent | null>(null);
  const [installeeIci, setInstalleeIci] = useState(false);

  const installe = useSyncExternalStore(
    abonnementInstallation,
    dejaInstalle,
    () => true,
  );
  const ios = useSyncExternalStore(abonnementInerte, estIOS, () => false);

  useEffect(() => {
    function onPrompt(e: Event) {
      // L'invite native par défaut est retenue pour être rejouée par NOTRE
      // bouton : la bannière du navigateur apparaît sinon au milieu du
      // parcours de scan, au pire moment.
      e.preventDefault();
      setInvite(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const installer = useCallback(async () => {
    const e = invite;
    if (!e) return;
    // Une invite native ne se rejoue pas : on la retire d'abord, pour qu'un
    // double clic ne provoque pas une seconde invocation (que le navigateur
    // rejetterait par une exception).
    setInvite(null);
    try {
      await e.prompt();
      const { outcome } = await e.userChoice;
      if (outcome === "accepted") setInstalleeIci(true);
    } catch {
      /* invite déjà consommée ou refusée par le navigateur */
    }
  }, [invite]);

  const masque = installe || installeeIci;

  // Rien à dire : soit déjà installé, soit un navigateur dont on ne sait pas
  // décrire le geste. Le silence est la bonne réponse dans les deux cas.
  if (masque || (!invite && !ios)) return null;

  return (
    <section
      aria-label="Garder cette carte sur votre téléphone"
      className="mt-4 rounded-2xl border-2 border-dashed border-k-ink/25 bg-white/70 px-4 py-3"
    >
      <p className="text-sm font-black text-k-ink">
        Gardez votre carte à portée de main
      </p>
      <p className="mt-1 text-xs font-medium text-k-body">
        Ajoutez-la à votre écran d&apos;accueil : elle s&apos;ouvrira comme une
        application, au nom de {commerce}, sans avoir à retrouver le lien.
      </p>

      {invite ? (
        <button
          type="button"
          onClick={() => void installer()}
          className="mt-2.5 inline-flex items-center rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink hover:bg-k-orange/40"
        >
          Ajouter à l&apos;écran d&apos;accueil
        </button>
      ) : (
        // AUCUN BOUTON ICI, ET C'EST VOLONTAIRE : sur iOS le geste appartient
        // au système, la page ne peut que le décrire.
        <p className="mt-2.5 rounded-xl bg-k-bg px-3 py-2 text-xs font-bold text-k-ink">
          Sur iPhone : touchez « Partager » en bas de l&apos;écran, puis « Sur
          l&apos;écran d&apos;accueil ».
        </p>
      )}
    </section>
  );
}
