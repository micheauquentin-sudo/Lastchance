"use client";

import { useCallback, useState } from "react";
import { TurnstileWidget, turnstileClientEnabled } from "./turnstile-widget";

/**
 * Le contrôle anti-robot AVEC SA PORTE DE SORTIE.
 *
 * ── Le défaut que ce composant supprime ──
 *
 * `TurnstileWidget` dit lui-même la règle : « un appelant qui CONDITIONNE une
 * action au jeton doit s'abonner à `onUnavailable` pour offrir une porte de
 * sortie : sans cela le client reste devant un cadre vide, sans savoir que
 * rien n'arrivera ».
 *
 * Trois modules l'avaient fait (fidélité, quiz, jackpot). Le PARCOURS
 * PRINCIPAL — la roue — ne l'avait pas, ni les huit jeux de révélation, ni les
 * six jeux de défi, ni le grattage, ni l'inscription aux pronostics. Le joueur
 * appuyait sur « Lancer la roue », lisait « Merci de valider la vérification
 * anti-robot » et cherchait au-dessus un contrôle qui n'existait pas. Rien à
 * valider, aucun bouton, aucune explication. Recharger n'y changeait rien.
 *
 * Ce n'est pas un cas de laboratoire : un bloqueur de publicités un peu
 * agressif, un DNS filtrant, un portail captif de Wi-Fi de commerce ou une 4G
 * qui décroche au fond du magasin suffisent. C'est-à-dire la situation
 * ordinaire d'un client qui scanne un QR code dans une boutique.
 *
 * ── Pourquoi un composant et pas six copies ──
 *
 * Le patron existait déjà, écrit une fois dans le passeport de fidélité. Le
 * recopier aux six endroits manquants aurait créé six exemplaires d'une même
 * règle — la classe de défaut qui a coûté le plus cher à ce projet. Ici la
 * règle est unique : un site qui pose ce composant a la porte de sortie sans y
 * penser, et le jour où le texte doit changer, il change partout.
 *
 * ── Ce que l'appelant garde à sa charge ──
 *
 * Le CONSEIL final, parce qu'il dépend du geste interrompu : « le temps de
 * jouer », « le temps de créer votre carte », « pour vous inscrire ». Et la
 * décision de bloquer ou non son bouton : ce composant ne connaît que le
 * challenge, pas ce qu'il garde.
 */
export function TurnstileGate({
  action,
  onToken,
  conseil,
  className = "",
}: {
  action?: React.ComponentProps<typeof TurnstileWidget>["action"];
  /** Jeton frais, ou `null` quand il expire / échoue. */
  onToken: (token: string | null) => void;
  /** Ce que le joueur peut faire, dit dans les mots de SON parcours. */
  conseil: string;
  className?: string;
}) {
  // `nonce` remonte le widget : c'est la seule façon de relancer le
  // chargement du script Cloudflare, que `TurnstileWidget` ne retente pas.
  const [nonce, setNonce] = useState(0);
  const [phase, setPhase] = useState<"chargement" | "pret" | "indisponible">(
    "chargement",
  );

  // Dépendances VIDES, délibérément : faire entrer `phase` ici changerait
  // l'identité de la callback à chaque rendu, ce qui remonterait le widget et
  // invaliderait son jeton. `TurnstileWidget` met en garde contre exactement
  // cela dans son propre commentaire.
  const remonter = useCallback(
    (token: string | null) => {
      onToken(token);
      setPhase(token ? "pret" : "chargement");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const indisponible = useCallback(() => setPhase("indisponible"), []);

  // Aucune clé publique côté navigateur : le challenge n'est pas activé, et le
  // parcours doit rester exactement tel qu'il était.
  if (!turnstileClientEnabled()) return null;

  return (
    <div className={className}>
      <TurnstileWidget
        key={nonce}
        action={action}
        onToken={remonter}
        onUnavailable={indisponible}
      />
      {phase === "indisponible" && (
        <div className="mt-3 text-center" role="status">
          <p className="text-sm font-bold text-red-600">
            Le contrôle anti-robot n&apos;a pas pu se charger (connexion
            instable ou bloqueur de publicités).
          </p>
          <button
            type="button"
            onClick={() => {
              onToken(null);
              setPhase("chargement");
              setNonce((n) => n + 1);
            }}
            className="mt-2 rounded-xl border-2 border-current px-4 py-2 text-sm font-black"
          >
            Recommencer le contrôle
          </button>
          <p className="mt-2 text-xs font-semibold opacity-80">{conseil}</p>
        </div>
      )}
    </div>
  );
}
