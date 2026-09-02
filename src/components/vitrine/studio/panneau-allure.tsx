"use client";

import { FONT_LIST } from "@/lib/fonts";
import {
  VITRINE_ALLURE_BOOLEENS,
  VITRINE_ALLURE_BORNES,
  VITRINE_ALLURE_CHIFFRES,
  VITRINE_ALLURE_ENUMS,
  VITRINE_ALLURE_ENUMS_CLES,
  VITRINE_STYLES_CARTES,
  libelleStyleCartes,
  type AllureVitrine,
  type ChampBooleenAllure,
  type StyleCartesVitrine,
} from "@/lib/vitrine";
import { resoudreThemeVitrine } from "@/components/vitrine/theme";
import { ChampStudio, CLASSE_CHAMP } from "@/components/vitrine/studio/champ";
import type { EtatStudio } from "@/components/vitrine/studio/etat";

/**
 * LA COLONNE DE DROITE — L'ALLURE, sur TOUTES les pages (VIT-20).
 *
 * ── POURQUOI ELLE NE CHANGE PAS AVEC LA PAGE ──
 *
 * L'allure ne se règle pas dans l'absolu : elle se règle SUR quelque chose.
 * Choisir « Taille des photos » devant un aperçu vide n'a aucun sens ; devant
 * la vraie carte du commerçant, c'en a. La colonne reste donc en place pendant
 * qu'on compose sa carte ou qu'on met un lien en avant — c'est le seul moment
 * où l'on voit vraiment l'effet d'une densité ou d'un arrondi.
 *
 * ── AUCUN `name` ICI ──
 *
 * Ces contrôles écrivent dans `EtatStudio`. La charge utile est rendue par
 * `ChampsCachesStudio`, en un seul endroit — voir son en-tête pour ce que ça
 * ferme.
 */
export function PanneauAllure({
  etat,
  majAllure,
  majEtat,
  peutEditer,
}: {
  etat: EtatStudio;
  majAllure: <K extends keyof AllureVitrine>(
    cle: K,
    valeur: AllureVitrine[K],
  ) => void;
  majEtat: (patch: Partial<EtatStudio>) => void;
  peutEditer: boolean;
}) {
  const theme = resoudreThemeVitrine(
    {
      allure: etat.allure,
      ...(etat.couleurs.primary || etat.couleurs.secondary
        ? {
            couleurs: {
              ...(etat.couleurs.primary ? { primary: etat.couleurs.primary } : {}),
              ...(etat.couleurs.secondary
                ? { secondary: etat.couleurs.secondary }
                : {}),
            },
          }
        : {}),
    },
    etat.secteur,
  );
  const resolue = theme.allure;

  return (
    <aside className="w-full shrink-0 space-y-4 overflow-y-auto rounded-2xl border-2 border-k-ink bg-white p-4 lg:h-full lg:w-[400px]">
      <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
        L&apos;allure
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <ChampStudio label="Couleur principale">
          <input
            type="color"
            value={etat.couleurs.primary || theme.primary}
            onChange={(e) =>
              majEtat({ couleurs: { ...etat.couleurs, primary: e.target.value } })
            }
            disabled={!peutEditer}
            className="h-10 w-full cursor-pointer rounded-xl border-2 border-k-ink"
          />
        </ChampStudio>
        <ChampStudio label="Couleur de fond">
          <input
            type="color"
            value={etat.couleurs.secondary || theme.secondary}
            onChange={(e) =>
              majEtat({
                couleurs: { ...etat.couleurs, secondary: e.target.value },
              })
            }
            disabled={!peutEditer}
            className="h-10 w-full cursor-pointer rounded-xl border-2 border-k-ink"
          />
        </ChampStudio>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ChampStudio label="Police des titres">
          <select
            value={etat.polices.heading || theme.heading}
            onChange={(e) =>
              majEtat({ polices: { ...etat.polices, heading: e.target.value } })
            }
            disabled={!peutEditer}
            className={CLASSE_CHAMP}
          >
            {FONT_LIST.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </ChampStudio>
        <ChampStudio label="Police du texte">
          <select
            value={etat.polices.body || theme.body}
            onChange={(e) =>
              majEtat({ polices: { ...etat.polices, body: e.target.value } })
            }
            disabled={!peutEditer}
            className={CLASSE_CHAMP}
          >
            {FONT_LIST.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </ChampStudio>
      </div>

      {/* LE STYLE DES FICHES EST DE RETOUR DANS LE STUDIO (VIT-19/VIT-20).
          Il n'y était pas, et c'est l'une des deux clés que le studio effaçait
          en enregistrant. Le serveur le conserve désormais faute de témoin ;
          le rendre ici est l'autre moitié — un réglage qu'on ne peut pas
          atteindre depuis l'écran central n'est pas réglable. */}
      <ChampStudio label="Présentation des fiches">
        <select
          value={etat.styleCartes || theme.styleCartes}
          onChange={(e) =>
            majEtat({ styleCartes: e.target.value as StyleCartesVitrine })
          }
          disabled={!peutEditer}
          className={CLASSE_CHAMP}
        >
          {VITRINE_STYLES_CARTES.map((style) => (
            <option key={style} value={style}>
              {libelleStyleCartes(style)}
            </option>
          ))}
        </select>
      </ChampStudio>

      {VITRINE_ALLURE_ENUMS_CLES.map((cle) => (
        <ChampStudio key={cle} label={LIBELLES_ALLURE[cle] ?? cle}>
          <select
            value={String(etat.allure[cle] ?? VITRINE_ALLURE_ENUMS[cle].defaut)}
            onChange={(e) => majAllure(cle, e.target.value as never)}
            disabled={!peutEditer}
            className={CLASSE_CHAMP}
          >
            {VITRINE_ALLURE_ENUMS[cle].valeurs.map((v) => (
              <option key={v} value={v}>
                {VALEURS_ALLURE[v] ?? v}
              </option>
            ))}
          </select>
        </ChampStudio>
      ))}

      {VITRINE_ALLURE_CHIFFRES.map((cle) => {
        const b = VITRINE_ALLURE_BORNES[cle];
        const valeur = etat.allure[cle] ?? b.defaut;
        return (
          <div key={cle}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-black text-k-ink">
                {LIBELLES_ALLURE[cle] ?? cle}
              </span>
              <span className="text-xs font-bold tabular-nums text-zinc-500">
                {valeur}
              </span>
            </div>
            <input
              type="range"
              min={b.min}
              max={b.max}
              step={b.pas}
              value={valeur}
              onChange={(e) => majAllure(cle, Number(e.target.value))}
              disabled={!peutEditer}
              className="w-full accent-k-orange-text"
            />
          </div>
        );
      })}

      <ul className="space-y-1.5 border-t-2 border-dashed border-zinc-200 pt-3">
        {VITRINE_ALLURE_BOOLEENS.map((cle) => (
          <li key={cle}>
            <label className="flex items-center gap-2 text-xs font-semibold text-k-ink">
              <input
                type="checkbox"
                checked={resolue[NOM_RESOLU[cle]] as boolean}
                onChange={(e) => majAllure(cle, e.target.checked)}
                disabled={!peutEditer}
                className="size-4 shrink-0 accent-k-orange-text"
              />
              {LIBELLES_ALLURE[cle] ?? cle}
            </label>
          </li>
        ))}
      </ul>
    </aside>
  );
}

const NOM_RESOLU: Record<
  ChampBooleenAllure,
  keyof ReturnType<typeof resoudreThemeVitrine>["allure"]
> = {
  entete_collant: "enteteCollant",
  capitales: "capitales",
  capitales_desc: "capitalesDesc",
  compte_rubrique: "compteRubrique",
  monogramme: "monogramme",
  favoris: "favoris",
  recherche: "recherche",
};

export const LIBELLES_ALLURE: Record<string, string> = {
  motif: "Motif de fond",
  densite: "Densité",
  style_fiche: "Style des fiches",
  photo_taille: "Taille des photos",
  photo_position: "Position des photos",
  style_prix: "Affichage du prix",
  style_onglets: "Style des onglets",
  style_chips: "Style des filtres",
  style_rubrique: "Titre des rubriques",
  barre_basse: "Barre du bas",
  carte_infos: "Carte d'informations",
  motif_opacite: "Intensité du motif",
  rayon: "Arrondi",
  ombre: "Ombres",
  echelle_texte: "Taille du texte",
  hero_hauteur: "Hauteur de bannière",
  hero_taille_nom: "Taille du nom",
  hero_voile: "Voile sur la photo",
  entete_collant: "Onglets collants",
  capitales: "Noms en capitales",
  capitales_desc: "Descriptions en capitales",
  compte_rubrique: "Nombre d'articles par rubrique",
  monogramme: "Initiale si pas de photo",
  favoris: "Favoris",
  recherche: "Recherche",
};

const VALEURS_ALLURE: Record<string, string> = {
  aucun: "Aucun",
  diagonales: "Diagonales",
  points: "Points",
  damier: "Damier",
  confortable: "Confortable",
  standard: "Standard",
  compact: "Compact",
  ombre: "Ombre portée",
  contour: "Contour",
  plein: "Fond teinté",
  grande: "Grande",
  vignette: "Vignette",
  aucune: "Sans photo",
  droite: "À droite",
  gauche: "À gauche",
  pleine: "Pleine largeur",
  simple: "Filet pointillé",
  accent: "Gras, en couleur",
  pastille: "Pastille",
  soulignes: "Soulignés",
  pastilles: "Pastilles",
  segmentes: "Segmentés",
  pleines: "Pleines",
  soulignees: "Soulignées",
  carte: "Carte",
  filet: "Filet centré",
  flottante: "Flottante",
  masquee: "Masquée",
  chevauche: "Chevauche la photo",
  dessous: "Sous la photo",
};
