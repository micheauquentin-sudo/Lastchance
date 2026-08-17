"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { updateWheel } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { ApercuAccueilJeu } from "@/components/dashboard/apercu-accueil-jeu";
import { hrefEtapeRoue } from "@/components/dashboard/atelier-roue-etapes";
import type { WheelSegment } from "@/components/wheel/wheel-svg";
import { resolveWheelStyle } from "@/lib/wheel-style";
import {
  MECANIQUES_DEFI,
  MECANIQUES_HASARD,
  type Mecanique,
} from "@/components/dashboard/atelier-mecaniques";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import { cn } from "@/lib/utils";
import { isSecretSkillGameType, isSkillGameType } from "@/lib/validations/skill";
import type { GameType, PlayLimit, Wheel } from "@/types/database";

const LIMITS: Array<{ value: PlayLimit; label: string }> = [
  { value: "once", label: "Une seule fois" },
  { value: "daily", label: "1 fois par jour" },
  { value: "weekly", label: "1 fois par semaine" },
  { value: "unlimited", label: "Illimité (démo)" },
];

/** Config skill_config existante (jsonb) telle que chargée pour cette roue. */
type RawSkillConfig = Record<string, unknown> | null;

function readRaw(wheel: Wheel): RawSkillConfig {
  const raw = (wheel as { skill_config?: RawSkillConfig }).skill_config ?? null;
  return raw && typeof raw === "object" ? raw : null;
}

function str(raw: RawSkillConfig, key: string): string {
  const v = raw?.[key];
  return v == null ? "" : String(v);
}

/**
 * L'ÉTAT DU DÉFI EST TYPÉ PAR MÉCANIQUE, ET REPART DE ZÉRO À CHAQUE BASCULE.
 *
 * L'écran précédent initialisait dix `useState` depuis le `skill_config` de la
 * roue SANS regarder à quelle mécanique il appartenait. Or les clés se
 * chevauchent (`tolerance` de l'estimation contre `tolerancePct` de la jauge,
 * `hint` du mot mystère contre `question` de l'estimation) : passer d'estimate
 * à gauge puis revenir faisait réapparaître des valeurs qui n'avaient jamais
 * été saisies pour cette mécanique-là.
 *
 * Ici, la config existante n'est lue que si la mécanique choisie EST celle qui
 * l'a produite. Sinon on repart des défauts — déterministes, et volontairement
 * jouables : une estimation neuve arrive à 100 ± 10, pas vide.
 */
type EtatDefi = {
  reflexDuration: string;
  gaugeTolerance: string;
  mwWord: string;
  mwHint: string;
  estQuestion: string;
  estTarget: string;
  estTolerance: string;
  estUnit: string;
  estImageUrl: string;
  puzzleFragments: string;
};

const DEFI_VIDE: EtatDefi = {
  reflexDuration: "1500",
  gaugeTolerance: "15",
  mwWord: "",
  mwHint: "",
  estQuestion: "",
  estTarget: "100",
  estTolerance: "10",
  estUnit: "",
  estImageUrl: "",
  puzzleFragments: "",
};

function defautsDefi(gameType: GameType, raw: RawSkillConfig): EtatDefi {
  if (!raw) return { ...DEFI_VIDE };
  switch (gameType) {
    case "reflex":
      return { ...DEFI_VIDE, reflexDuration: str(raw, "durationMs") || DEFI_VIDE.reflexDuration };
    case "gauge":
      return { ...DEFI_VIDE, gaugeTolerance: str(raw, "tolerancePct") || DEFI_VIDE.gaugeTolerance };
    case "mystery_word":
      return { ...DEFI_VIDE, mwWord: str(raw, "word"), mwHint: str(raw, "hint") };
    case "estimate":
      return {
        ...DEFI_VIDE,
        estQuestion: str(raw, "question"),
        estTarget: str(raw, "target") || DEFI_VIDE.estTarget,
        estTolerance: str(raw, "tolerance") || DEFI_VIDE.estTolerance,
        estUnit: str(raw, "unit"),
        estImageUrl: str(raw, "imageUrl"),
      };
    case "puzzle":
      return {
        ...DEFI_VIDE,
        puzzleFragments: Array.isArray(raw.fragments)
          ? (raw.fragments as unknown[]).map(String).join("\n")
          : "",
      };
    default:
      return { ...DEFI_VIDE };
  }
}

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

  const isSkill = isSkillGameType(gameType);
  const aSecret = isSecretSkillGameType(gameType);

  function choisirMecanique(valeur: GameType) {
    setGameType(valeur);
    setDefi(defautsDefi(valeur, valeur === mecaniqueInitiale ? rawInitial : null));
    // « Illimité » est refusé côté serveur pour les jeux à secret. Le refus
    // arrivait après coup, sur un formulaire que le commerçant croyait fini.
    if (valeur !== gameType && isSecretSkillGameType(valeur) && playLimit === "unlimited") {
      setPlayLimit("once");
    }
  }

  function set<K extends keyof EtatDefi>(cle: K, valeur: EtatDefi[K]) {
    setDefi((precedent) => ({ ...precedent, [cle]: valeur }));
  }

  // Sérialise skill_config selon le game_type. Vide pour les jeux non-skill (et
  // pour rps qui n'a aucun réglage) : l'action remet alors skill_config à null.
  // Miroir EXACT de la forme Zod de parseSkillConfig — les nombres restent en
  // texte, z.coerce s'en charge côté serveur (et signale les erreurs).
  function skillConfigValue(): string {
    switch (gameType) {
      case "reflex":
        return JSON.stringify({ durationMs: defi.reflexDuration });
      case "gauge":
        return JSON.stringify({ tolerancePct: defi.gaugeTolerance });
      case "mystery_word":
        return JSON.stringify({ word: defi.mwWord, hint: defi.mwHint });
      case "estimate":
        return JSON.stringify({
          target: defi.estTarget,
          tolerance: defi.estTolerance,
          question: defi.estQuestion,
          unit: defi.estUnit,
          imageUrl: defi.estImageUrl,
        });
      case "puzzle": {
        const fragments = defi.puzzleFragments
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        // Ordre attendu = ordre de saisie (identité) : le joueur doit
        // reconstituer la séquence telle que renseignée ici.
        return JSON.stringify({ fragments, order: fragments.map((_, i) => i) });
      }
      // rps + tous les jeux non-skill : aucun réglage à persister.
      default:
        return "";
    }
  }

  const inputClass = "border border-zinc-300 focus:ring-orange-500 focus:ring-offset-0";
  const zoneVerte = Number(defi.gaugeTolerance);

  return (
    <Card>
      <h2 className="text-lg font-black text-k-ink">Le jeu</h2>
      <p className="mt-1 mb-4 text-sm font-semibold text-k-body">
        À quoi vos clients jouent, et combien de fois ils peuvent tenter leur
        chance.
      </p>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
        <input type="hidden" name="id" value={wheel.id} />
        <input type="hidden" name="skill_config" value={skillConfigValue()} />

        {/* Un VRAI radiogroup : quinze <button aria-pressed> dans une div ne
            disaient à personne qu'il s'agissait d'un choix exclusif, et la
            navigation clavier y perdait la notion de groupe. */}
        <fieldset>
          <legend className="text-sm font-black text-k-ink">Mécanique</legend>
          <InfoBulle id="aide-mecanique" resume="Laquelle choisir ?" className="my-2">
            Toutes ces mécaniques tirent le lot de la MÊME façon : c&apos;est
            l&apos;habillage qui change, pas les chances. Les six dernières
            demandent en plus au client de réussir une petite épreuve avant de
            tirer — il joue plus longtemps, et il repart parfois sans rien avoir
            tiré.
          </InfoBulle>

          <FamilleMecaniques
            titre="Le hasard décide"
            phrase="Zéro réglage. L'habillage change, le tirage est identique."
            mecaniques={MECANIQUES_HASARD}
            choisie={gameType}
            onChoisir={choisirMecanique}
          />
          <FamilleMecaniques
            titre="Le client joue son gain"
            phrase="Une petite épreuve avant le tirage. Un échec = tirage perdant, et la participation est consommée : à pierre-feuille-ciseaux, l'égalité compte comme un échec, soit environ une réussite sur trois."
            mecaniques={MECANIQUES_DEFI}
            choisie={gameType}
            onChoisir={choisirMecanique}
          />
        </fieldset>

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

        {isSkill && (
          <fieldset className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/40 p-3">
            <legend className="px-1 text-sm font-semibold text-orange-700">
              Réglages du défi
            </legend>

            {aSecret && gameType !== "puzzle" && (
              <p className="rounded-lg bg-white px-3 py-2 text-xs text-zinc-600" role="note">
                🔒 La bonne réponse ({gameType === "mystery_word" ? "le mot" : "le nombre"} et
                la tolérance) reste <strong>secrète côté serveur</strong> : elle n&apos;est
                jamais envoyée au joueur.
              </p>
            )}

            {/* LA NOTE SYMÉTRIQUE DE CELLE DES JEUX À SECRET, ET ELLE EST
                MOINS FLATTEUSE. Réflexe et jauge n'ont AUCUN secret à garder :
                le geste est mesuré par l'appareil du joueur, qui envoie son
                propre verdict. Le commerçant réglait donc une « difficulté »
                en croyant régler la rareté du gain, alors qu'elle ne pèse que
                sur les joueurs de bonne foi. Le dire ici est le seul remède
                honnête tant que ces deux mécaniques restent proposées : le
                choix a été fait de les garder, pas de laisser croire qu'elles
                sont arbitrées côté serveur. */}
            {(gameType === "reflex" || gameType === "gauge") && (
              <p className="rounded-lg bg-white px-3 py-2 text-xs text-zinc-600" role="note">
                ⚠️ Ce défi est <strong>jugé sur l&apos;appareil du joueur</strong> :
                c&apos;est lui qui mesure le geste et annonce le résultat. La
                difficulté réglée ci-dessous est donc <strong>indicative</strong> —
                elle vaut pour un joueur ordinaire, pas contre un appareil qui
                triche. Le serveur, lui, borne le rythme : un plancher de temps
                avant toute réponse et des limites de débit par appareil.
              </p>
            )}

            {gameType === "rps" && (
              <p className="text-xs text-zinc-600">
                Aucun réglage : le joueur doit battre un coup tiré au sort côté serveur.
              </p>
            )}

            {gameType === "reflex" && (
              <div>
                <Label htmlFor="reflex_duration">Temps de réaction (ms)</Label>
                <Input
                  id="reflex_duration"
                  type="number"
                  inputMode="numeric"
                  min={200}
                  max={10000}
                  step={100}
                  value={defi.reflexDuration}
                  onChange={(e) => set("reflexDuration", e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Fenêtre laissée au joueur (200 à 10 000 ms). Plus court = plus difficile.
                </p>
              </div>
            )}

            {gameType === "gauge" && (
              <div className="sm:w-1/2">
                {/* DEMI-largeur : la zone visée fait DEUX FOIS la valeur saisie
                    (centre 50 % ± tolérance). L'ancienne aide disait « largeur
                    de la zone à viser », donc la moitié de la vérité. */}
                <Label htmlFor="gauge_tolerance">Difficulté de la jauge (%)</Label>
                <Input
                  id="gauge_tolerance"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  step={1}
                  value={defi.gaugeTolerance}
                  onChange={(e) => set("gaugeTolerance", e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Le curseur doit s&apos;arrêter au centre, à cette distance près
                  de chaque côté :{" "}
                  {Number.isFinite(zoneVerte) && zoneVerte > 0 ? (
                    <>
                      la zone verte occupe donc{" "}
                      <strong>{Math.min(100, zoneVerte * 2)} % de la barre</strong>.
                      {/* LE BOUT DE LA PLAGE MÉRITE SA PHRASE. À 50 %, la zone
                          verte fait 100 % : le curseur ne peut plus manquer, et
                          le commerçant croyait régler un défi « très facile »
                          alors qu'il n'y a plus de défi du tout. */}
                      {zoneVerte >= 50 && (
                        <>
                          {" "}
                          <strong>
                            Soit toute la jauge : le joueur gagne à coup sûr.
                          </strong>
                        </>
                      )}
                    </>
                  ) : (
                    <>la zone verte occupe deux fois cette valeur.</>
                  )}{" "}
                  Plus petite = plus difficile (1 à 50).
                </p>
              </div>
            )}

            {gameType === "mystery_word" && (
              <>
                <div>
                  <Label htmlFor="mw_word">Mot à deviner</Label>
                  <Input
                    id="mw_word"
                    type="text"
                    maxLength={40}
                    required
                    value={defi.mwWord}
                    onChange={(e) => set("mwWord", e.target.value)}
                    className={inputClass}
                    placeholder="ex : croissant"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Obligatoire. Casse, accents et espaces sont ignorés à la comparaison.
                  </p>
                </div>
                <div>
                  <Label htmlFor="mw_hint">Indice (facultatif)</Label>
                  <Input
                    id="mw_hint"
                    type="text"
                    maxLength={120}
                    value={defi.mwHint}
                    onChange={(e) => set("mwHint", e.target.value)}
                    className={inputClass}
                    placeholder="ex : viennoiserie du matin"
                  />
                </div>
              </>
            )}

            {gameType === "estimate" && (
              <>
                <div>
                  <Label htmlFor="est_question">Question (facultatif)</Label>
                  <Input
                    id="est_question"
                    type="text"
                    maxLength={200}
                    value={defi.estQuestion}
                    onChange={(e) => set("estQuestion", e.target.value)}
                    className={inputClass}
                    placeholder="ex : Combien de bonbons dans le bocal ?"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="est_target">Nombre cible</Label>
                    <Input
                      id="est_target"
                      type="number"
                      inputMode="numeric"
                      required
                      value={defi.estTarget}
                      onChange={(e) => set("estTarget", e.target.value)}
                      className={inputClass}
                      placeholder="ex : 250"
                    />
                  </div>
                  <div>
                    <Label htmlFor="est_tolerance">Tolérance (±)</Label>
                    <Input
                      id="est_tolerance"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      required
                      value={defi.estTolerance}
                      onChange={(e) => set("estTolerance", e.target.value)}
                      className={inputClass}
                      placeholder="ex : 20"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="est_unit">Unité (facultatif)</Label>
                  <Input
                    id="est_unit"
                    type="text"
                    maxLength={20}
                    value={defi.estUnit}
                    onChange={(e) => set("estUnit", e.target.value)}
                    className={inputClass}
                    placeholder="ex : bonbons"
                  />
                </div>
                <div>
                  <Label htmlFor="est_image">Image (URL, facultatif)</Label>
                  <Input
                    id="est_image"
                    type="url"
                    maxLength={2048}
                    value={defi.estImageUrl}
                    onChange={(e) => set("estImageUrl", e.target.value)}
                    className={inputClass}
                    placeholder="https://…"
                  />
                </div>
              </>
            )}

            {gameType === "puzzle" && (
              <div>
                <Label htmlFor="puzzle_fragments">Fragments (un par ligne, dans l&apos;ordre)</Label>
                <textarea
                  id="puzzle_fragments"
                  value={defi.puzzleFragments}
                  onChange={(e) => set("puzzleFragments", e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder={"Le\nchat\ndort"}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  De 2 à 8 fragments. Le joueur devra les remettre dans cet ordre exact
                  (l&apos;ordre attendu reste secret côté serveur).
                </p>
              </div>
            )}
          </fieldset>
        )}

        <div>
          <Label htmlFor="play_limit">Chaque client peut jouer</Label>
          <select
            id="play_limit"
            name="play_limit"
            value={playLimit}
            onChange={(e) => setPlayLimit(e.target.value as PlayLimit)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {LIMITS.map((l) => (
              <option
                key={l.value}
                value={l.value}
                // Le refus existait déjà côté serveur ; il arrivait APRÈS le
                // clic, sur un message qui ne désignait pas le champ fautif.
                disabled={l.value === "unlimited" && aSecret}
              >
                {l.label}
              </option>
            ))}
          </select>
          {aSecret && (
            <p className="mt-1 text-xs font-semibold text-orange-700" role="note">
              « Illimité » est indisponible sur ce jeu : la bonne réponse est
              secrète, et sans limite de participation un même téléphone pourrait
              la trouver en réessayant.
            </p>
          )}
          <InfoBulle
            id="aide-limite-jeu"
            resume="Une fois, par jour, par semaine ?"
            className="mt-2"
          >
            « Une seule fois » convient à une opération courte : chaque client
            joue une fois pour toute la campagne. « 1 fois par jour » fait
            revenir — c&apos;est le réglage des bars et boulangeries. « Illimité »
            n&apos;est là que pour vos essais : en boutique, le même téléphone
            viderait vos stocks en quelques minutes.
          </InfoBulle>
        </div>

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

function FamilleMecaniques({
  titre,
  phrase,
  mecaniques,
  choisie,
  onChoisir,
}: {
  titre: string;
  phrase: string;
  mecaniques: readonly Mecanique[];
  choisie: GameType;
  onChoisir: (valeur: GameType) => void;
}) {
  return (
    <fieldset className="mt-3">
      <legend className="text-xs font-black uppercase tracking-wide text-k-orange-text">
        {titre}
      </legend>
      <p className="mb-2 mt-1 text-xs font-semibold text-k-body">{phrase}</p>
      <div className="grid grid-cols-2 gap-2">
        {mecaniques.map((m) => {
          const active = choisie === m.value;
          return (
            <label
              key={m.value}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-k-ink",
                active
                  ? "border-orange-400 bg-orange-50 text-orange-700"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-orange-300",
              )}
            >
              <input
                type="radio"
                name="game_type"
                value={m.value}
                checked={active}
                onChange={() => onChoisir(m.value)}
                className="mt-1 h-4 w-4 shrink-0 accent-orange-500"
              />
              <span className="min-w-0">
                <span className="block font-semibold">
                  <span aria-hidden>{m.emoji}</span> {m.label}
                </span>
                <span className="block text-xs text-zinc-500">{m.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
