"use client";

import { useState } from "react";
import { Label } from "@/components/ui/input";
import {
  VITRINE_ALLURE_BOOLEENS,
  VITRINE_ALLURE_BORNES,
  VITRINE_ALLURE_CHIFFRES,
  VITRINE_ALLURE_ENUMS,
  VITRINE_ALLURE_ENUMS_CLES,
  type ChampBooleenAllure,
  type ChampChiffreAllure,
  type ChampEnumAllure,
} from "@/lib/vitrine";
import type { AllureResolue } from "@/components/vitrine/theme";

/**
 * LES VINGT-CINQ RÉGLAGES D'ALLURE — l'écran commerçant.
 *
 * ── LES CONTRÔLES SONT ENGENDRÉS, LES MOTS SONT ÉCRITS ──
 *
 * La LISTE des réglages vient du vocabulaire (`@/lib/vitrine`), la même table
 * que recopie le validateur SQL : ajouter un réglage sans l'exposer ici est
 * donc impossible, et l'oublier ne peut pas se produire en silence.
 *
 * Les LIBELLÉS, eux, sont écrits à la main. Un libellé dérivé de la clé aurait
 * donné « Style fiche » et « Capitales desc » à un restaurateur qui règle sa
 * carte entre deux services. C'est exactement le genre d'écran où le mot compte
 * plus que la structure.
 *
 * ── AUCUNE VALEUR PAR DÉFAUT N'EST ÉCRITE EN BASE ──
 *
 * Les contrôles arrivent remplis avec l'allure RÉSOLUE, c'est-à-dire les
 * défauts de la maquette là où le commerçant n'a rien choisi. À
 * l'enregistrement, `composerAllure` ne garde que ce qui DIFFÈRE du défaut :
 * un formulaire entièrement laissé tel quel n'écrit rien du tout, et une
 * vitrine jamais réglée continue de suivre la maquette quand celle-ci évolue.
 *
 * ── DÉPLIÉ PAR UN `<details>`, ET REPLIÉ PAR DÉFAUT ──
 *
 * Vingt-cinq contrôles au milieu d'un écran qui en porte déjà quinze noieraient
 * les réglages que tout le monde touche (le nom, les couleurs, l'histoire). Un
 * `<details>` natif règle cela sans JavaScript, s'ouvre au clavier, et est
 * annoncé comme un groupe repliable par les lecteurs d'écran.
 *
 * IMPORTANT : les champs restent DANS le DOM même replié — un `<details>` fermé
 * cache ses enfants, il ne les retire pas. Ils sont donc soumis normalement.
 * Les rendre conditionnellement aurait remis chaque réglage à son défaut à
 * chaque enregistrement fait sans ouvrir la section.
 */

const LIBELLES_LISTES: Record<ChampEnumAllure, { label: string; aide?: string }> = {
  motif: { label: "Motif de fond", aide: "Une trame discrète derrière la carte." },
  densite: { label: "Densité des fiches", aide: "L'air autour de chaque article." },
  style_fiche: { label: "Style des fiches" },
  photo_taille: { label: "Taille des photos" },
  photo_position: { label: "Position des photos" },
  style_prix: {
    label: "Affichage du prix",
    aide: "« Filet pointillé » relie le nom au prix, comme un menu imprimé.",
  },
  style_onglets: { label: "Style des onglets" },
  style_chips: { label: "Style des filtres de rubrique" },
  style_rubrique: { label: "Titre des rubriques" },
  barre_basse: { label: "Barre du bas" },
  carte_infos: {
    label: "Carte d'informations",
    aide: "Vos réseaux et le lien d'avis, sous la bannière.",
  },
};

const VALEURS: Record<string, string> = {
  // Motif
  aucun: "Aucun",
  diagonales: "Diagonales",
  points: "Points",
  damier: "Damier",
  // Densité
  confortable: "Confortable",
  standard: "Standard",
  compact: "Compact",
  // Style de fiche
  ombre: "Ombre portée",
  contour: "Contour",
  plein: "Fond teinté",
  // Photos
  grande: "Grande",
  vignette: "Vignette",
  aucune: "Sans photo",
  droite: "À droite",
  gauche: "À gauche",
  pleine: "Pleine largeur",
  // Prix
  simple: "Filet pointillé",
  accent: "Gras, en couleur",
  pastille: "Pastille",
  // Onglets et filtres
  soulignes: "Soulignés",
  pastilles: "Pastilles",
  segmentes: "Segmentés",
  pleines: "Pleines",
  soulignees: "Soulignées",
  // Rubriques
  carte: "Carte",
  filet: "Filet centré",
  // Barre basse et carte d'infos
  flottante: "Flottante",
  masquee: "Masquée",
  chevauche: "Chevauche la photo",
  dessous: "Sous la photo",
};

const LIBELLES_CURSEURS: Record<
  ChampChiffreAllure,
  { label: string; format: (n: number) => string }
> = {
  motif_opacite: {
    label: "Intensité du motif",
    format: (n) => `${Math.round(n * 100)} %`,
  },
  rayon: { label: "Arrondi des angles", format: (n) => `${n} px` },
  ombre: { label: "Profondeur des ombres", format: (n) => `${Math.round(n * 100)} %` },
  echelle_texte: {
    label: "Taille du texte",
    format: (n) => `${n.toFixed(2).replace(/0$/, "")} ×`,
  },
  hero_hauteur: { label: "Hauteur de la bannière", format: (n) => `${n} px` },
  hero_taille_nom: { label: "Taille du nom", format: (n) => `${n} px` },
  hero_voile: {
    label: "Voile sur la photo",
    format: (n) => `${Math.round(n * 100)} %`,
  },
};

const LIBELLES_INTERRUPTEURS: Record<ChampBooleenAllure, string> = {
  entete_collant: "Garder les onglets visibles pendant le défilement",
  capitales: "Noms des articles en capitales",
  capitales_desc: "Descriptions en capitales",
  compte_rubrique: "Afficher le nombre d'articles par rubrique",
  monogramme: "Initiale à la place d'une photo manquante",
  favoris: "Laisser vos clients marquer des favoris",
  recherche: "Champ de recherche",
};

/** Le nom de la propriété résolue qui correspond à une clé stockée. */
const RESOLU: Record<string, keyof AllureResolue> = {
  motif: "motif",
  densite: "densite",
  style_fiche: "styleFiche",
  photo_taille: "photoTaille",
  photo_position: "photoPosition",
  style_prix: "stylePrix",
  style_onglets: "styleOnglets",
  style_chips: "styleChips",
  style_rubrique: "styleRubrique",
  barre_basse: "barreBasse",
  carte_infos: "carteInfos",
  motif_opacite: "motifOpacite",
  rayon: "rayon",
  ombre: "ombre",
  echelle_texte: "echelleTexte",
  hero_hauteur: "heroHauteur",
  hero_taille_nom: "heroTailleNom",
  hero_voile: "heroVoile",
  entete_collant: "enteteCollant",
  capitales: "capitales",
  capitales_desc: "capitalesDesc",
  compte_rubrique: "compteRubrique",
  monogramme: "monogramme",
  favoris: "favoris",
  recherche: "recherche",
};

export function AllureEditeur({
  allure,
  disabled,
}: {
  allure: AllureResolue;
  disabled: boolean;
}) {
  return (
    <details className="rounded-xl border-2 border-dashed border-zinc-200 px-4 py-3">
      <summary className="cursor-pointer list-none text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
        Allure de la page — 25 réglages
      </summary>
      {/* LE TÉMOIN — il dit à l'action que la section est bien à l'écran, donc
          qu'une case décochée est un CHOIX et non une absence. Il est DANS le
          `<details>`, qui cache ses enfants sans les retirer du DOM : il part
          donc même si le commerçant n'ouvre jamais la section. */}
      <input type="hidden" name="allure_rendue" value="1" />

      <p className="mt-2 text-sm text-zinc-500">
        Tout est déjà réglé sur la présentation par défaut. Vous n&apos;avez rien
        à toucher ici pour obtenir une belle page — ces réglages ne servent qu&apos;à
        vous en écarter.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {VITRINE_ALLURE_ENUMS_CLES.map((cle) => {
          const { label, aide } = LIBELLES_LISTES[cle];
          const id = `vitrine-allure-${cle}`;
          return (
            <div key={cle}>
              <Label htmlFor={id}>{label}</Label>
              <select
                id={id}
                name={cle}
                defaultValue={String(allure[RESOLU[cle]])}
                disabled={disabled}
                className="w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm font-semibold text-k-ink disabled:bg-zinc-100"
              >
                {VITRINE_ALLURE_ENUMS[cle].valeurs.map((v) => (
                  <option key={v} value={v}>
                    {VALEURS[v] ?? v}
                  </option>
                ))}
              </select>
              {aide ? <p className="mt-1 text-xs text-zinc-500">{aide}</p> : null}
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {VITRINE_ALLURE_CHIFFRES.map((cle) => (
          <Curseur
            key={cle}
            cle={cle}
            valeur={allure[RESOLU[cle]] as number}
            disabled={disabled}
          />
        ))}
      </div>

      <ul className="mt-6 space-y-2">
        {VITRINE_ALLURE_BOOLEENS.map((cle) => (
          <li key={cle}>
            <label className="flex items-center gap-3 text-sm font-semibold text-k-ink">
              <input
                type="checkbox"
                name={cle}
                defaultChecked={allure[RESOLU[cle]] as boolean}
                disabled={disabled}
                className="size-4 shrink-0 accent-k-orange-text"
              />
              {LIBELLES_INTERRUPTEURS[cle]}
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * UN CURSEUR, avec sa valeur EN CHIFFRES à côté.
 *
 * Un `<input type="range">` seul ne dit pas où il en est : le commerçant voit
 * une poignée aux deux tiers d'une glissière et n'a aucun moyen de retrouver le
 * même réglage demain, ni de le décrire à quelqu'un. La valeur formatée
 * (« 13 px », « 60 % ») est donc affichée en permanence, et c'est la seule
 * raison pour laquelle ce composant porte un état.
 *
 * `aria-describedby` relie la valeur au curseur : le lecteur d'écran annonce
 * déjà la valeur brute d'un `range`, mais pas son unité.
 */
function Curseur({
  cle,
  valeur,
  disabled,
}: {
  cle: ChampChiffreAllure;
  valeur: number;
  disabled: boolean;
}) {
  const bornes = VITRINE_ALLURE_BORNES[cle];
  const { label, format } = LIBELLES_CURSEURS[cle];
  const [courant, setCourant] = useState(valeur);
  const id = `vitrine-allure-${cle}`;
  const idValeur = `${id}-valeur`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <output
          id={idValeur}
          htmlFor={id}
          className="text-xs font-bold tabular-nums text-zinc-500"
        >
          {format(courant)}
        </output>
      </div>
      <input
        id={id}
        name={cle}
        type="range"
        min={bornes.min}
        max={bornes.max}
        step={bornes.pas}
        value={courant}
        onChange={(e) => setCourant(Number(e.target.value))}
        disabled={disabled}
        aria-describedby={idValeur}
        className="w-full accent-k-orange-text"
      />
    </div>
  );
}
