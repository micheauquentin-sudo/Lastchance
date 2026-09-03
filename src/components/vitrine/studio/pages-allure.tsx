"use client";

import { FONT_LIST } from "@/lib/fonts";
import {
  VITRINE_ALLURE_BORNES,
  VITRINE_ALLURE_ENUMS,
  VITRINE_STYLES_CARTES,
  libelleStyleCartes,
  type AllureVitrine,
  type ChampBooleenAllure,
  type ChampChiffreAllure,
  type ChampEnumAllure,
  type StyleCartesVitrine,
} from "@/lib/vitrine";
import { resoudreThemeVitrine } from "@/components/vitrine/theme";
import { ChampStudio, CLASSE_CHAMP } from "@/components/vitrine/studio/champ";
import {
  LIBELLES_ALLURE,
  REPARTITION_ALLURE,
  VALEURS_ALLURE,
  type CleAllure,
  type EtapeAllure,
} from "@/components/vitrine/studio/allure-repartition";
import { ETAPES_STUDIO } from "@/components/vitrine/studio/pages";
import type { EtatStudio } from "@/components/vitrine/studio/etat";

/**
 * LES CINQ ÉTAPES D'ALLURE (VIT-35) — ce qui reste de `panneau-allure.tsx`.
 *
 * ── LE PANNEAU A ÉTÉ DISSOUS, PAS DÉPLACÉ ──
 *
 * Il tenait les vingt-cinq réglages dans une colonne de 400 px, présente à
 * toutes les pages. Deux choses l'ont condamné : la troisième colonne prenait
 * sa largeur à la colonne de réglages, qui est celle qui manquait de place ; et
 * vingt-cinq contrôles à la file ne se PARCOURENT pas — on y cherche, ce qui
 * est l'inverse d'un parcours guidé.
 *
 * Ce qui n'a PAS changé, et qui était le vrai argument de VIT-20 : on règle
 * une allure EN REGARDANT quelque chose. L'aperçu est resté à l'écran, à toutes
 * les étapes ; c'est la colonne de contrôles qui a bougé, pas lui.
 *
 * ── UN SEUL COMPOSANT POUR QUATRE ÉTAPES ──
 *
 * `EtapeAllureStudio` rend la liste que `REPARTITION_ALLURE` lui donne, et
 * choisit le contrôle d'après le TYPE de la clé. Quatre composants jumeaux
 * auraient été quatre endroits où corriger le jour où un curseur change de
 * forme — et quatre occasions de rendre deux fois le même réglage, ce que la
 * table interdit par construction.
 *
 * ── AUCUN `name` ICI, ET C'EST VITAL ──
 *
 * Ces contrôles écrivent dans `EtatStudio` ; la charge utile est rendue par
 * `ChampsCachesStudio`, en un seul endroit. Neuf étapes, c'est neuf fois plus
 * d'occasions de démonter un écran : un `name` posé ici disparaîtrait avec son
 * étape et le prochain enregistrement — AUTOMATIQUE — effacerait le réglage.
 * Voir l'en-tête de `vitrine-studio.tsx`.
 */

type MajAllure = <K extends keyof AllureVitrine>(
  cle: K,
  valeur: AllureVitrine[K],
) => void;

/**
 * Le chapeau commun d'une étape — titre et phrase d'orientation.
 *
 * Les deux sont LUS dans `ETAPES_STUDIO`, jamais recopiés : la barre du haut
 * les affiche déjà, et deux libellés pour une étape divergent au premier
 * renommage.
 */
function EnTeteEtape({ etape }: { etape: string }) {
  const trouvee = ETAPES_STUDIO.find((e) => e.cle === etape);
  return (
    <div className="space-y-1">
      <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
        {trouvee?.titre}
      </h2>
      <p className="text-xs text-zinc-500">{trouvee?.resume}</p>
    </div>
  );
}

function estEnum(cle: CleAllure): cle is ChampEnumAllure {
  return cle in VITRINE_ALLURE_ENUMS;
}

function estChiffre(cle: CleAllure): cle is ChampChiffreAllure {
  return cle in VITRINE_ALLURE_BORNES;
}

/**
 * UN CURSEUR DANS SON `<label>`, ET C'EST UNE CORRECTION (VIT-35).
 *
 * Le panneau dissous posait le libellé dans un `<span>` voisin de l'`input` :
 * lisible à l'œil, MUET pour un lecteur d'écran, qui annonçait « curseur, 13 »
 * sans dire de quoi. Le `<label>` enveloppant coûte une balise et rend les sept
 * curseurs nommés — c'est aussi ce qui permet aux gardes de les compter par
 * leur nom accessible plutôt que par leur position.
 */
function CurseurAllure({
  cle,
  etat,
  majAllure,
  peutEditer,
}: {
  cle: ChampChiffreAllure;
  etat: EtatStudio;
  majAllure: MajAllure;
  peutEditer: boolean;
}) {
  const bornes = VITRINE_ALLURE_BORNES[cle];
  const valeur = etat.allure[cle] ?? bornes.defaut;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-black text-k-ink">
          {LIBELLES_ALLURE[cle]}
        </span>
        <span className="text-xs font-bold tabular-nums text-zinc-500">
          {valeur}
        </span>
      </span>
      {/* `aria-label` EN PLUS du `<label>`, et ce n'est pas une ceinture de
          plus : le libellé visible est suivi de la VALEUR, si bien que le nom
          calculé serait « Hauteur de bannière 240 » — il changerait à chaque
          pixel parcouru, ce qu'un lecteur d'écran réannonce. */}
      <input
        aria-label={LIBELLES_ALLURE[cle]}
        type="range"
        min={bornes.min}
        max={bornes.max}
        step={bornes.pas}
        value={valeur}
        onChange={(e) => majAllure(cle, Number(e.target.value))}
        disabled={!peutEditer}
        className="w-full accent-k-orange-text"
      />
    </label>
  );
}

function ListeAllure({
  cle,
  etat,
  majAllure,
  peutEditer,
}: {
  cle: ChampEnumAllure;
  etat: EtatStudio;
  majAllure: MajAllure;
  peutEditer: boolean;
}) {
  return (
    <ChampStudio label={LIBELLES_ALLURE[cle]}>
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
  );
}

function InterrupteurAllure({
  cle,
  coche,
  majAllure,
  peutEditer,
}: {
  cle: ChampBooleenAllure;
  coche: boolean;
  majAllure: MajAllure;
  peutEditer: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border-2 border-k-ink/15 bg-white px-3 py-2 text-xs font-black text-k-ink">
      <input
        type="checkbox"
        checked={coche}
        onChange={(e) => majAllure(cle, e.target.checked)}
        disabled={!peutEditer}
        className="size-4 shrink-0 accent-k-orange-text"
      />
      {LIBELLES_ALLURE[cle]}
    </label>
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

/**
 * L'ÉTAPE D'ALLURE — elle rend CE QUE LA TABLE LUI DONNE, rien de plus.
 *
 * « Les fiches » rend en plus `style_cartes`, qui n'est pas une clé d'allure
 * mais la colonne `theme.style_cartes` : c'est pourtant à cette étape qu'on la
 * cherche, puisqu'elle décide de la présentation des mêmes fiches. La ranger
 * ailleurs par fidélité au schéma aurait fait chercher un réglage de fiches
 * hors de l'étape « Les fiches ».
 */
export function EtapeAllureStudio({
  etape,
  etat,
  majAllure,
  majEtat,
  peutEditer,
}: {
  etape: EtapeAllure;
  etat: EtatStudio;
  majAllure: MajAllure;
  majEtat: (patch: Partial<EtatStudio>) => void;
  peutEditer: boolean;
}) {
  // Les interrupteurs se lisent RÉSOLUS : une clé absente vaut son défaut de
  // maquette, jamais « décoché » (ADR-129). Lire `etat.allure[cle]` aurait
  // affiché sept cases vides sur toute vitrine d'avant VIT-16, et le prochain
  // enregistrement — automatique — aurait gravé ces sept refus.
  const theme = resoudreThemeVitrine({ allure: etat.allure }, etat.secteur);
  const resolue = theme.allure;

  return (
    <div className="space-y-4">
      <EnTeteEtape etape={etape} />

      {etape === "fiches" ? (
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
      ) : null}

      {/* LA COLONNE EST LARGE, DONC DEUX PAR RANGÉE (VIT-35). Ce sont des
          contrôles courts ; les empiler sur une seule colonne large aurait
          rendu une ligne de saisie de 700 px pour choisir entre trois mots, et
          fait défiler ce qui tenait à l'écran. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {REPARTITION_ALLURE[etape].map((cle) =>
          estEnum(cle) ? (
            <ListeAllure
              key={cle}
              cle={cle}
              etat={etat}
              majAllure={majAllure}
              peutEditer={peutEditer}
            />
          ) : estChiffre(cle) ? (
            <CurseurAllure
              key={cle}
              cle={cle}
              etat={etat}
              majAllure={majAllure}
              peutEditer={peutEditer}
            />
          ) : (
            <InterrupteurAllure
              key={cle}
              cle={cle}
              coche={resolue[NOM_RESOLU[cle]] as boolean}
              majAllure={majAllure}
              peutEditer={peutEditer}
            />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * L'ÉTAPE « COULEURS & POLICES » — la seule qui ne touche à aucune clé d'allure.
 *
 * Elle règle `couleurs` et `polices`, deux sections du thème à part entière.
 * Elle est SÉPARÉE des quatre autres pour cette raison : les fondre dans
 * `EtapeAllureStudio` aurait demandé une branche « et si ce n'était pas de
 * l'allure » au cœur d'un composant dont toute la valeur est de n'en avoir
 * aucune.
 */
export function EtapeCouleursStudio({
  etat,
  majEtat,
  peutEditer,
}: {
  etat: EtatStudio;
  majEtat: (patch: Partial<EtatStudio>) => void;
  peutEditer: boolean;
}) {
  // Le sélecteur de couleur n'a pas de « vide » : sans valeur il affiche du
  // noir, ce qui ferait croire à un choix. On lui donne donc la couleur RÉSOLUE
  // — celle que le commerçant voit dans l'aperçu.
  const theme = resoudreThemeVitrine(
    {
      allure: etat.allure,
      ...(etat.couleurs.primary || etat.couleurs.secondary
        ? {
            couleurs: {
              ...(etat.couleurs.primary
                ? { primary: etat.couleurs.primary }
                : {}),
              ...(etat.couleurs.secondary
                ? { secondary: etat.couleurs.secondary }
                : {}),
            },
          }
        : {}),
    },
    etat.secteur,
  );

  return (
    <div className="space-y-4">
      <EnTeteEtape etape="couleurs" />

      <div className="grid gap-3 sm:grid-cols-2">
        {/* PAS DE PHRASE D'AIDE SOUS CES DEUX-LÀ, ET C'EST DÉLIBÉRÉ :
            `ChampStudio` la place DANS le `<label>`, elle entre donc dans le
            nom accessible du contrôle — « Couleur principale Vos titres, vos
            prix » se lit mal et se cherche mal. L'aperçu, à droite, dit déjà ce
            que la couleur touche, et il le dit mieux qu'une phrase. */}
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

      <div className="grid gap-3 sm:grid-cols-2">
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
    </div>
  );
}
