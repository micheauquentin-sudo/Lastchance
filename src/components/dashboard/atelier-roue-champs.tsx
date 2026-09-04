"use client";

import { Input, Label } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import {
  MECANIQUES_DEFI,
  MECANIQUES_HASARD,
  type Mecanique,
} from "@/components/dashboard/atelier-mecaniques";
import type { EtatDefi } from "@/components/dashboard/atelier-roue-defi";
import { cn } from "@/lib/utils";
import { isSecretSkillGameType, isSkillGameType } from "@/lib/validations/skill";
import type { GameType, PlayLimit } from "@/types/database";

/**
 * LES CONTRÔLES DE L'ÉTAPE « LE JEU » — extraits de `wheel-settings.tsx` pour
 * que le STUDIO les monte sans les recopier (VIT-46).
 *
 * ── UNE SEULE DIFFÉRENCE ENTRE LES DEUX APPELANTS : LE `name` ──
 *
 * Dans l'atelier, ces contrôles vivent DANS le `<form>` d'`updateWheel` : le
 * radio porte donc `name="game_type"` et le `<select>` `name="play_limit"`,
 * et c'est ainsi que la charge utile part.
 *
 * Dans un studio, la règle du socle est l'inverse et elle ne se négocie pas :
 * **aucun contrôle visible ne porte de `name` de réglage**. Une étape qu'on
 * quitte est DÉMONTÉE ; un `name` posé ici disparaîtrait du formulaire, et
 * `updateWheel` — qui réécrit `game_type`, `play_limit` et `skill_config` en
 * bloc — refuserait la charge amputée (ou pire, l'écraserait). Le studio passe
 * donc un `nomGroupe` neutre, qui ne sert qu'au groupement clavier natif, et
 * `nomChamp={undefined}` sur la limite.
 *
 * Rien d'autre ne change : mêmes libellés, mêmes bornes, mêmes avertissements.
 * Deux copies de ce JSX auraient divergé au premier réglage ajouté — et
 * l'écart ne se serait vu que sur l'un des deux écrans.
 */

export const LIMITS: Array<{ value: PlayLimit; label: string }> = [
  { value: "once", label: "Une seule fois" },
  { value: "daily", label: "1 fois par jour" },
  { value: "weekly", label: "1 fois par semaine" },
  { value: "unlimited", label: "Illimité (démo)" },
];

const inputClass =
  "border border-zinc-300 focus:ring-orange-500 focus:ring-offset-0";

export function FamilleMecaniques({
  titre,
  phrase,
  mecaniques,
  choisie,
  onChoisir,
  nomGroupe = "game_type",
  disabled = false,
}: {
  titre: string;
  phrase: string;
  mecaniques: readonly Mecanique[];
  choisie: GameType;
  onChoisir: (valeur: GameType) => void;
  /** Le `name` des radios. Payload dans l'atelier, groupement nu au studio. */
  nomGroupe?: string;
  disabled?: boolean;
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
                name={nomGroupe}
                value={m.value}
                checked={active}
                onChange={() => onChoisir(m.value)}
                disabled={disabled}
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

/** Le choix de la mécanique : les deux familles, sous une seule légende. */
export function ChoixMecanique({
  gameType,
  onChoisir,
  nomGroupe,
  disabled = false,
}: {
  gameType: GameType;
  onChoisir: (valeur: GameType) => void;
  nomGroupe?: string;
  disabled?: boolean;
}) {
  return (
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
        onChoisir={onChoisir}
        nomGroupe={nomGroupe}
        disabled={disabled}
      />
      <FamilleMecaniques
        titre="Le client joue son gain"
        phrase="Une petite épreuve avant le tirage. Un échec = tirage perdant, et la participation est consommée : à pierre-feuille-ciseaux, l'égalité compte comme un échec, soit environ une réussite sur trois."
        mecaniques={MECANIQUES_DEFI}
        choisie={gameType}
        onChoisir={onChoisir}
        nomGroupe={nomGroupe}
        disabled={disabled}
      />
    </fieldset>
  );
}

/**
 * LES RÉGLAGES DU DÉFI — rendus pour la SEULE mécanique en cours.
 *
 * Aucun de ces champs ne porte de `name` : ils écrivent dans `EtatDefi`, que
 * l'appelant sérialise en `skill_config`. C'est déjà vrai dans l'atelier, ce
 * qui rend ce bloc réutilisable tel quel dans un studio.
 */
export function ChampsDefi({
  gameType,
  defi,
  set,
  disabled = false,
}: {
  gameType: GameType;
  defi: EtatDefi;
  set: <K extends keyof EtatDefi>(cle: K, valeur: EtatDefi[K]) => void;
  disabled?: boolean;
}) {
  if (!isSkillGameType(gameType)) return null;
  const aSecret = isSecretSkillGameType(gameType);
  const zoneVerte = Number(defi.gaugeTolerance);

  return (
    <fieldset
      disabled={disabled}
      className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/40 p-3"
    >
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

      {/* LA NOTE SYMÉTRIQUE DE CELLE DES JEUX À SECRET, ET ELLE EST MOINS
          FLATTEUSE. Réflexe et jauge n'ont AUCUN secret à garder : le geste est
          mesuré par l'appareil du joueur, qui envoie son propre verdict. Le
          commerçant réglait donc une « difficulté » en croyant régler la rareté
          du gain, alors qu'elle ne pèse que sur les joueurs de bonne foi. */}
      {(gameType === "reflex" || gameType === "gauge") && (
        <p className="rounded-lg bg-white px-3 py-2 text-xs text-zinc-600" role="note">
          ⚠️ Ce défi est <strong>jugé sur l&apos;appareil du joueur</strong> :
          c&apos;est lui qui mesure le geste et annonce le résultat. La
          difficulté réglée ci-dessous est donc <strong>indicative</strong> —
          elle vaut pour un joueur ordinaire, pas contre un appareil qui triche.
          Le serveur, lui, borne le rythme : un plancher de temps avant toute
          réponse et des limites de débit par appareil.
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
              (centre 50 % ± tolérance). L'ancienne aide disait « largeur de la
              zone à viser », donc la moitié de la vérité. */}
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
            Le curseur doit s&apos;arrêter au centre, à cette distance près de
            chaque côté :{" "}
            {Number.isFinite(zoneVerte) && zoneVerte > 0 ? (
              <>
                la zone verte occupe donc{" "}
                <strong>{Math.min(100, zoneVerte * 2)} % de la barre</strong>.
                {/* LE BOUT DE LA PLAGE MÉRITE SA PHRASE. À 50 %, la zone verte
                    fait 100 % : le curseur ne peut plus manquer, et le
                    commerçant croyait régler un défi « très facile » alors
                    qu'il n'y a plus de défi du tout. */}
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
          <Label htmlFor="puzzle_fragments">
            Fragments (un par ligne, dans l&apos;ordre)
          </Label>
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
  );
}

/**
 * COMBIEN DE FOIS ON JOUE — et la contrainte croisée qui l'attache à la
 * mécanique.
 *
 * « Illimité » est REFUSÉ côté serveur pour les jeux à secret
 * (`updateWheelSchema`, `superRefine`) : sans limite, le jeton de défi
 * laisserait rejouer la même tentative en variant la réponse pour extraire le
 * secret par force brute. Le `disabled` de l'option et la note qui l'explique
 * dépendent donc de `gameType` — c'est la raison pour laquelle ce contrôle ne
 * se sépare pas du choix de la mécanique, ni dans l'atelier ni dans le studio.
 */
export function ChampLimite({
  gameType,
  playLimit,
  onChange,
  nomChamp,
  disabled = false,
}: {
  gameType: GameType;
  playLimit: PlayLimit;
  onChange: (valeur: PlayLimit) => void;
  /** `"play_limit"` dans l'atelier ; ABSENT au studio (voir l'en-tête). */
  nomChamp?: string;
  disabled?: boolean;
}) {
  const aSecret = isSecretSkillGameType(gameType);
  return (
    <div>
      <Label htmlFor="play_limit">Chaque client peut jouer</Label>
      <select
        id="play_limit"
        name={nomChamp}
        value={playLimit}
        onChange={(e) => onChange(e.target.value as PlayLimit)}
        disabled={disabled}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
      >
        {LIMITS.map((l) => (
          <option
            key={l.value}
            value={l.value}
            // Le refus existait déjà côté serveur ; il arrivait APRÈS le clic,
            // sur un message qui ne désignait pas le champ fautif.
            disabled={l.value === "unlimited" && aSecret}
          >
            {l.label}
          </option>
        ))}
      </select>
      {aSecret && (
        <p className="mt-1 text-xs font-semibold text-orange-700" role="note">
          « Illimité » est indisponible sur ce jeu : la bonne réponse est
          secrète, et sans limite de participation un même téléphone pourrait la
          trouver en réessayant.
        </p>
      )}
      <InfoBulle
        id="aide-limite-jeu"
        resume="Une fois, par jour, par semaine ?"
        className="mt-2"
      >
        « Une seule fois » convient à une opération courte : chaque client joue
        une fois pour toute la campagne. « 1 fois par jour » fait revenir —
        c&apos;est le réglage des bars et boulangeries. « Illimité »
        n&apos;est là que pour vos essais : en boutique, le même téléphone
        viderait vos stocks en quelques minutes.
      </InfoBulle>
    </div>
  );
}
