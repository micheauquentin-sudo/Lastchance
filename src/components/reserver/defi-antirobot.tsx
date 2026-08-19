"use client";

import { useCallback, useState } from "react";
import {
  TurnstileWidget,
  turnstileClientEnabled,
} from "@/components/wheel/turnstile-widget";

/**
 * LE CONTRÔLE ANTI-ROBOT DES FORMULAIRES PUBLICS DE « RÉSERVER ».
 *
 * ── POURQUOI IL EST SORTI DE `reserver-experience.tsx` ──
 *
 * Le lot L5 ouvre deux formulaires publics de plus — rejoindre la liste
 * prioritaire, et réserver au titre d'une invitation — et les deux passent par
 * les MÊMES seaux que `reserveSlot`, donc peuvent demander le MÊME défi. Le
 * bloc était écrit à la main dans la carte de créneau : le recopier deux fois
 * aurait donné trois formulations du même message, à corriger trois fois le
 * jour où le texte bouge.
 *
 * ── CE QU'IL NE FAIT PAS ──
 *
 * Il ne décide RIEN. Le défi n'apparaît que si la server action a répondu
 * `challengeRequired` : c'est le serveur qui juge, ce composant qui affiche. Il
 * ne conserve pas non plus le jeton — il le REMONTE, parce que c'est l'appelant
 * qui le joint à sa prochaine soumission (et qui sait s'il l'a déjà consommé).
 *
 * La région vivante est montée EN PERMANENCE par l'appelant : un `aria-live`
 * créé en même temps que son contenu n'annonce rien, et l'apparition du
 * contrôle est précisément ce qu'un lecteur d'écran doit entendre.
 */
export function DefiAntiRobot({
  id,
  action,
  visible,
  onToken,
}: {
  /** Suffixe d'identifiants — unique dans la page (une carte par créneau). */
  id: string;
  /**
   * Nom d'action Turnstile. Le type est REPRIS du widget, et non redéclaré :
   * le littéral doit être exactement celui que la server action passe à
   * `verifyTurnstile`, et deux orthographes feraient échouer la vérification
   * côté Cloudflare sans qu'aucun type ne bronche.
   */
  action: NonNullable<React.ComponentProps<typeof TurnstileWidget>["action"]>;
  /** Le serveur a-t-il demandé le défi ? */
  visible: boolean;
  /** Jeton résolu, ou `null` quand il est perdu ou que le contrôle échoue. */
  onToken: (token: string | null) => void;
}) {
  const [nonce, setNonce] = useState(0);
  const [indisponible, setIndisponible] = useState(false);
  const [valide, setValide] = useState(false);

  const onWidgetToken = useCallback(
    (token: string | null) => {
      setValide(Boolean(token));
      if (!token) setIndisponible(false);
      onToken(token);
    },
    [onToken],
  );

  const onUnavailable = useCallback(() => {
    setValide(false);
    setIndisponible(true);
    onToken(null);
  }, [onToken]);

  if (!visible || !turnstileClientEnabled()) return null;

  return (
    <div
      role="group"
      aria-labelledby={`challenge-titre-${id}`}
      className="mt-4 rounded-xl border-2 border-k-ink bg-k-blue/20 px-4 py-3"
    >
      <p id={`challenge-titre-${id}`} className="text-sm font-black text-k-ink">
        Confirmez que vous n&apos;êtes pas un robot
      </p>
      <p className="mt-0.5 text-xs font-bold text-k-body">
        Une seule fois, le temps de vous enregistrer. Votre saisie est
        conservée : relancez l&apos;envoi dès que le contrôle est validé.
      </p>
      <TurnstileWidget
        key={nonce}
        action={action}
        onToken={onWidgetToken}
        onUnavailable={onUnavailable}
      />
      {indisponible ? (
        <div className="mt-2 text-center">
          <p className="text-xs font-bold text-red-700">
            Le contrôle n&apos;a pas pu se charger (connexion instable ou
            bloqueur de publicités).
          </p>
          <button
            type="button"
            onClick={() => {
              setValide(false);
              setIndisponible(false);
              onToken(null);
              setNonce((n) => n + 1);
            }}
            className="mt-2 rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/30"
          >
            Recommencer le contrôle
          </button>
        </div>
      ) : valide ? (
        <p className="mt-2 text-center text-xs font-bold text-k-ink">
          ✓ Contrôle validé.
        </p>
      ) : null}
    </div>
  );
}
