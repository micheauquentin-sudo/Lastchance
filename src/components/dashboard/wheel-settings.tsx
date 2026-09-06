"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { updateWheel } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";
import { ApercuAccueilJeu } from "@/components/dashboard/apercu-accueil-jeu";
import { hrefEtapeRoue } from "@/components/dashboard/atelier-roue-etapes";
import type { WheelSegment } from "@/components/wheel/wheel-svg";
import { resolveWheelStyle } from "@/lib/wheel-style";
import {
  ChampLimite,
  ChampsDefi,
  ChoixMecanique,
} from "@/components/dashboard/atelier-roue-champs";
import {
  defautsDefi,
  readRaw,
  serialiserDefi,
  type EtatDefi,
} from "@/components/dashboard/atelier-roue-defi";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import {
  isClientReportedSkillGameType,
  isSecretSkillGameType,
} from "@/lib/validations/skill";
import type { GameType, PlayLimit, Wheel } from "@/types/database";

/**
 * ÉTAPE 1 DE L'ATELIER — « Le jeu ».
 *
 * Mécanique, réglages du défi ET limite de participation vivent dans LA MÊME
 * étape, et ce n'est pas un choix de mise en page : `updateWheelSchema` exige
 * `id`, `game_type` et `play_limit` ENSEMBLE (un champ requis non rendu arrive
 * en `null` et l'action refuse — invariant B de champ-formulaire-coverage).
 * Les scinder aurait obligé à reposter en caché ce qu'une autre étape règle,
 * c'est-à-dire à recréer le défaut que ces gardes existent pour fermer.
 *
 * Une seconde raison, produit celle-là : la contrainte croisée « jeux à secret
 * × illimité » ne se voit QUE si les deux champs sont sous les yeux.
 *
 * ── LES CONTRÔLES SONT PARTAGÉS AVEC LE STUDIO (VIT-46) ──
 *
 * Le choix de mécanique, les réglages du défi et la limite de participation
 * vivent désormais dans `atelier-roue-champs.tsx`, et la forme de
 * `skill_config` dans `atelier-roue-defi.ts`. Ici, ils gardent leurs `name` :
 * ces contrôles sont DANS le `<form>` d'`updateWheel`, et c'est ainsi que la
 * charge part. Le studio les monte sans `name` — voir l'en-tête du fichier
 * partagé.
 */
export function WheelSettings({
  wheel,
  campaignId,
  organizationName,
  segments = [],
}: {
  wheel: Wheel;
  campaignId: string;
  /** Nom du commerce — le kicker de l'écran d'accueil, comme sur /play. */
  organizationName: string;
  /** Lots actifs, pour que l'aperçu de la roue montre les vrais segments. */
  segments?: WheelSegment[];
}) {
  const mecaniqueInitiale: GameType = wheel.game_type ?? "wheel";
  const rawInitial = readRaw(wheel);

  // ENREGISTREMENT AUTOMATIQUE. `useAutoSave` s'ajoute À CÔTÉ de
  // `useActionForm` — jamais autour : deux gardes mécaniques du dépôt cherchent
  // l'appel littéral.
  //
  // ── POURQUOI L'ENREGISTREMENT NE NAVIGUE PLUS ──
  //
  // Cette étape enchaînait sur « Les lots » depuis `onSuccess`. Avec un
  // enregistrement à la frappe, cet enchaînement partirait 800 ms après la
  // première lettre d'un mot mystère : le commerçant se retrouverait sur
  // l'écran des lots au milieu de sa saisie. Le passage à l'étape suivante
  // redevient donc ce qu'il aurait toujours dû être — un lien qu'on clique
  // quand on a fini, à côté du bouton d'enregistrement, qui reste.
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useActionForm(updateWheel, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  const { enAttente, bloqueParValidation } = useAutoSave(formRef);

  const [gameType, setGameType] = useState<GameType>(mecaniqueInitiale);
  const [defi, setDefi] = useState<EtatDefi>(() =>
    defautsDefi(mecaniqueInitiale, rawInitial),
  );
  const [playLimit, setPlayLimit] = useState<PlayLimit>(wheel.play_limit);
  // Le style ENREGISTRÉ de la roue : cette étape ne le modifie pas, elle s'en
  // sert pour que l'aperçu porte les vraies couleurs et la vraie police.
  const style = useMemo(
    () => resolveWheelStyle(wheel.style as Record<string, unknown>),
    [wheel.style],
  );

  function choisirMecanique(valeur: GameType) {
    setGameType(valeur);
    setDefi(defautsDefi(valeur, valeur === mecaniqueInitiale ? rawInitial : null));
    // « Illimité » est refusé côté serveur pour les jeux à secret ET pour ceux
    // dont la réussite est rapportée par l'appareil du joueur. Le refus
    // arrivait après coup, sur un formulaire que le commerçant croyait fini.
    const sansIllimite =
      isSecretSkillGameType(valeur) || isClientReportedSkillGameType(valeur);
    if (valeur !== gameType && sansIllimite && playLimit === "unlimited") {
      setPlayLimit("once");
    }
  }

  function set<K extends keyof EtatDefi>(cle: K, valeur: EtatDefi[K]) {
    setDefi((precedent) => ({ ...precedent, [cle]: valeur }));
  }

  return (
    <Card>
      <h2 className="text-lg font-black text-k-ink">Le jeu</h2>
      <p className="mt-1 mb-4 text-sm font-semibold text-k-body">
        À quoi vos clients jouent, et combien de fois ils peuvent tenter leur
        chance.
      </p>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
        <input type="hidden" name="id" value={wheel.id} />
        <input
          type="hidden"
          name="skill_config"
          value={serialiserDefi(gameType, defi)}
        />

        {/* Un VRAI radiogroup : quinze <button aria-pressed> dans une div ne
            disaient à personne qu'il s'agissait d'un choix exclusif, et la
            navigation clavier y perdait la notion de groupe. */}
        <ChoixMecanique gameType={gameType} onChoisir={choisirMecanique} />

        {/* L'APERÇU VIVANT — piloté par l'ÉTAT LOCAL `gameType`, donc il change
            AU CLIC, avant tout enregistrement. C'est le manque exact que le
            commerçant décrivait : il choisissait « Carte à gratter » et ne
            voyait sa mécanique nulle part, l'étape suivante lisant la valeur
            déjà en base. Même composant que l'aperçu de l'étape « L'habillage »
            (`ApercuAccueilJeu`) : les deux écrans ne peuvent pas diverger. */}
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-k-orange-text">
            Aperçu — ce que verra votre client
          </p>
          <ApercuAccueilJeu
            style={style}
            organizationName={organizationName}
            gameType={gameType}
            segments={segments}
            className="mx-auto max-w-xs"
          />
          <p className="mt-2 text-xs font-semibold text-k-body">
            L&apos;habillage complet se règle à l&apos;étape «&nbsp;L&apos;habillage&nbsp;».
          </p>
        </div>

        <ChampsDefi gameType={gameType} defi={defi} set={set} />

        <ChampLimite
          gameType={gameType}
          playLimit={playLimit}
          onChange={setPlayLimit}
          nomChamp="play_limit"
        />

        <FieldError message={state && !state.ok ? state.error : undefined} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="submit" disabled={pending} className="w-full sm:flex-1">
            {pending ? "…" : "Enregistrer"}
          </Button>
          <Link
            href={hrefEtapeRoue(campaignId, "lots", wheel.id)}
            className="rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-center text-sm font-black text-k-ink transition-colors hover:bg-k-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-k-ink focus-visible:ring-offset-2"
          >
            Continuer vers « Les lots » →
          </Link>
        </div>
        {state?.ok && (
          <p className="text-center text-sm text-emerald-600">Enregistré.</p>
        )}
        {enAttente && !pending && (
          <p className="text-center text-sm font-semibold text-k-body">
            Modification en attente d&apos;enregistrement…
          </p>
        )}
        {/* Un enregistrement automatique silencieusement inopérant est pire que
            pas d'enregistrement du tout : le mot mystère et le nombre cible
            sont `required`, un champ vidé ne partirait jamais. */}
        {bloqueParValidation && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            Non enregistré : un champ requis est vide ou invalide.
          </p>
        )}
      </form>
    </Card>
  );
}
