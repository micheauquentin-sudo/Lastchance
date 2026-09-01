"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import { saveVitrineSettings } from "@/actions/vitrine";
import { HeroVitrine } from "@/components/vitrine/hero-vitrine";
import { CatalogueVitrine } from "@/components/vitrine/catalogue-vitrine";
import { BarreBasseVitrine } from "@/components/vitrine/barre-basse";
import {
  resoudreThemeVitrine,
  variablesThemeVitrine,
} from "@/components/vitrine/theme";
import {
  VITRINE_ALLURE_BOOLEENS,
  VITRINE_ALLURE_BORNES,
  VITRINE_ALLURE_CHIFFRES,
  VITRINE_ALLURE_ENUMS,
  VITRINE_ALLURE_ENUMS_CLES,
  VITRINE_BADGE_OUVERTURE_MAX,
  VITRINE_SECTEURS,
  libelleSecteur,
  type AllureVitrine,
  type SecteurVitrine,
  type ThemeVitrine,
  type VitrineCarteView,
  type VitrineLiensView,
} from "@/lib/vitrine";
import { FONT_LIST } from "@/lib/fonts";

/**
 * LE STUDIO DE LA VITRINE (VIT-17) — l'aperçu au centre, les réglages autour.
 *
 * ── POURQUOI UNE PAGE ENTIÈRE, HORS DU TABLEAU DE BORD ──
 *
 * Personnaliser une page se fait EN LA REGARDANT. Dans l'écran de réglages, la
 * vitrine n'était visible nulle part : on cochait « Pastille », on enregistrait,
 * on ouvrait un onglet, on revenait. Trois gestes pour voir une couleur.
 *
 * Cette route vit donc hors de `/dashboard`, exactement comme `/poster/[id]` :
 * ce n'est pas une astuce de mise en page, c'est ce qui fait disparaître la
 * colonne de navigation et rend l'écran entier à l'aperçu. On y entre depuis
 * l'atelier, on en sort par le lien de retour — et l'adresse est partageable.
 *
 * ── L'APERÇU EST LA VRAIE PAGE, PAS UNE MAQUETTE ──
 *
 * Il monte `HeroVitrine`, `CatalogueVitrine` et `BarreBasseVitrine` — les
 * composants QUE SERT LA PAGE PUBLIQUE, avec les cartes réelles du commerçant.
 * Un aperçu approximatif aurait été une seconde vitrine à tenir d'accord avec
 * la première, et elles auraient divergé au premier réglage ajouté.
 *
 * ── ET IL EST VIVANT PARCE QUE L'ALLURE EST DU CSS ──
 *
 * Les vingt-cinq réglages sortent en variables CSS posées sur le conteneur de
 * l'aperçu. Bouger un curseur ne recalcule donc rien : le navigateur repeint.
 * Les quelques réglages qui changent la STRUCTURE (style des onglets, favoris,
 * recherche) passent par les props des composants, qui se re-rendent — c'est
 * React, et c'est instantané aussi.
 *
 * ── RIEN N'EST ENREGISTRÉ TANT QU'ON N'A PAS ENREGISTRÉ ──
 *
 * L'état vit ici, en mémoire. C'est la promesse d'un studio : essayer sans
 * conséquence. Le bouton envoie le MÊME formulaire que l'écran de réglages —
 * `saveVitrineSettings`, avec les mêmes noms de champs — pour qu'il n'existe
 * pas deux chemins d'écriture à tenir d'accord.
 */

type Identite = {
  nom: string;
  logoUrl: string | null;
  coverPath: string | null;
  coverAlt: string | null;
  accroche: string;
  histoire: string;
  horaires: string;
  badge: string;
  secteur: SecteurVitrine;
};

export function VitrineStudio({
  slug,
  identiteInitiale,
  themeInitial,
  cartes,
  liens,
  peutEditer,
}: {
  slug: string;
  identiteInitiale: Identite;
  themeInitial: ThemeVitrine;
  cartes: VitrineCarteView[];
  liens: VitrineLiensView;
  peutEditer: boolean;
}) {
  const [identite, setIdentite] = useState(identiteInitiale);
  const [allure, setAllure] = useState<AllureVitrine>(themeInitial.allure ?? {});
  const [couleurs, setCouleurs] = useState({
    primary: themeInitial.couleurs?.primary ?? "",
    secondary: themeInitial.couleurs?.secondary ?? "",
  });
  const [polices, setPolices] = useState({
    heading: themeInitial.polices?.heading ?? "",
    body: themeInitial.polices?.body ?? "",
  });

  const { state, pending, onSubmit } = useActionForm(saveVitrineSettings, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Vitrine enregistrée.",
  });

  // LE THÈME EFFECTIF DE L'APERÇU, recalculé à chaque frappe. C'est la MÊME
  // fonction que la page publique : ce qui se voit ici est ce qui sera servi.
  const themeApercu = resoudreThemeVitrine(
    {
      ...themeInitial,
      couleurs: {
        ...(couleurs.primary ? { primary: couleurs.primary } : {}),
        ...(couleurs.secondary ? { secondary: couleurs.secondary } : {}),
      },
      polices: {
        ...(polices.heading ? { heading: polices.heading as never } : {}),
        ...(polices.body ? { body: polices.body as never } : {}),
      },
      allure,
    },
    identite.secteur,
  );

  const majAllure = <K extends keyof AllureVitrine>(
    cle: K,
    valeur: AllureVitrine[K],
  ) => setAllure((a) => ({ ...a, [cle]: valeur }));

  const resolue = themeApercu.allure;

  return (
    <form onSubmit={onSubmit} className="min-h-dvh bg-k-bg">
      {/* ── LE BANDEAU, COLLANT ── */}
      <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b-2 border-k-ink bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard/vitrine?etape=identite"
            className="rounded-xl border-2 border-k-ink bg-white px-3 py-1.5 text-sm font-black text-k-ink hover:bg-k-yellow"
          >
            ← Retour
          </Link>
          <span className="truncate text-sm font-black text-k-ink">
            Personnaliser ma vitrine
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FieldError message={state && !state.ok ? state.error : undefined} />
          {peutEditer ? (
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── LES TROIS COLONNES ──
          `lg:h-[calc(100dvh-64px)]` + `overflow-hidden` : chaque colonne défile
          CHEZ ELLE. Sans cela, régler une couleur en bas du panneau droit fait
          défiler l'aperçu hors de l'écran — on règle alors ce qu'on ne voit
          plus. Motif de `poster-editor`. */}
      <div className="flex flex-col gap-4 p-4 lg:h-[calc(100dvh-64px)] lg:flex-row lg:items-stretch lg:overflow-hidden">
        {/* ── COLONNE GAUCHE : CE QUI SE LIT ── */}
        <aside className="w-full shrink-0 space-y-4 overflow-y-auto rounded-2xl border-2 border-k-ink bg-white p-4 lg:h-full lg:w-[320px]">
          <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
            Ce qui se lit
          </h2>

          <ChampTexte
            label="Votre métier"
            aide="Il choisit les mots que lisent vos clients, et une palette de départ."
          >
            <select
              name="secteur"
              value={identite.secteur}
              onChange={(e) =>
                setIdentite((i) => ({
                  ...i,
                  secteur: e.target.value as SecteurVitrine,
                }))
              }
              disabled={!peutEditer}
              className={CLASSE_CHAMP}
            >
              {VITRINE_SECTEURS.map((s) => (
                <option key={s} value={s}>
                  {libelleSecteur(s)}
                </option>
              ))}
            </select>
          </ChampTexte>

          <ChampTexte label="Accroche" aide="Sous le nom, sur la photo.">
            <input
              name="accroche"
              value={identite.accroche}
              maxLength={200}
              onChange={(e) =>
                setIdentite((i) => ({ ...i, accroche: e.target.value }))
              }
              disabled={!peutEditer}
              className={CLASSE_CHAMP}
            />
          </ChampTexte>

          <ChampTexte
            label="Pastille d'ouverture"
            aide="« Ouvert · 12h–23h ». Vide = pas de pastille."
          >
            <input
              name="badge_ouverture"
              value={identite.badge}
              maxLength={VITRINE_BADGE_OUVERTURE_MAX}
              onChange={(e) =>
                setIdentite((i) => ({ ...i, badge: e.target.value }))
              }
              disabled={!peutEditer}
              className={CLASSE_CHAMP}
            />
          </ChampTexte>

          <ChampTexte label="Votre histoire">
            <textarea
              name="histoire"
              value={identite.histoire}
              rows={5}
              maxLength={1200}
              onChange={(e) =>
                setIdentite((i) => ({ ...i, histoire: e.target.value }))
              }
              disabled={!peutEditer}
              className={CLASSE_CHAMP}
            />
          </ChampTexte>

          <ChampTexte label="Horaires" aide="Une ligne par jour.">
            <textarea
              name="horaires_texte"
              value={identite.horaires}
              rows={4}
              maxLength={600}
              onChange={(e) =>
                setIdentite((i) => ({ ...i, horaires: e.target.value }))
              }
              disabled={!peutEditer}
              className={CLASSE_CHAMP}
            />
          </ChampTexte>
        </aside>

        {/* ── CENTRE : L'APERÇU, ET C'EST LA VRAIE PAGE ── */}
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto">
          <p className="text-xs font-semibold text-zinc-500">
            Aperçu — la page que vos clients ouvriront. Rien n&apos;est
            enregistré tant que vous n&apos;avez pas cliqué sur Enregistrer.
          </p>
          <div
            style={variablesThemeVitrine(themeApercu)}
            className="w-full max-w-[480px] shrink-0 overflow-hidden rounded-2xl border-2 border-k-ink bg-[var(--vitrine-secondary)] font-[family-name:var(--vitrine-texte)] text-[var(--vitrine-sur-secondary)] shadow-[8px_8px_0_rgba(33,29,22,0.9)]"
          >
            <HeroVitrine
              nom={identite.nom}
              logoUrl={identite.logoUrl}
              couverture={identite.coverPath}
              couvertureAlt={identite.coverAlt}
              accroche={identite.accroche || null}
              badgeOuverture={identite.badge || null}
              allure={resolue}
              liens={liens}
              avisGoogle="Avis Google"
              selecteurLangue={null}
            />
            <div className="px-3">
              <CatalogueVitrine
                cartes={cartes}
                styleCartes={themeApercu.styleCartes}
                lang="fr"
                secteur={identite.secteur}
                allure={resolue}
                slug={slug}
                portesOuvertes={[]}
                histoire={identite.histoire || null}
                horaires={identite.horaires || null}
              />
            </div>
            {resolue.barreBasse !== "masquee" ? (
              <BarreBasseVitrine
                slug={slug}
                lang="fr"
                secteur={identite.secteur}
                allure={resolue}
                ancrePied="studio-pied"
              />
            ) : null}
          </div>
        </div>

        {/* ── COLONNE DROITE : L'ALLURE ── */}
        <aside className="w-full shrink-0 space-y-4 overflow-y-auto rounded-2xl border-2 border-k-ink bg-white p-4 lg:h-full lg:w-[340px]">
          <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
            L&apos;allure
          </h2>

          {/* LES DEUX TÉMOINS DE CE PANNEAU (VIT-19).
              Ce studio règle les couleurs et les polices, il le déclare. Ce
              qu'il ne déclare PAS — `ordre_blocs`, `style_cartes`, `jeux` —
              est désormais conservé par le serveur au lieu d'être effacé :
              c'est le défaut que ce lot répare, et il était invisible parce
              qu'un enregistrement réussi ne dit rien de ce qu'il a emporté. */}
          <input type="hidden" name="couleurs_rendues" value="1" />
          <input type="hidden" name="polices_rendues" value="1" />

          <div className="grid grid-cols-2 gap-3">
            <ChampTexte label="Couleur principale">
              <input
                type="color"
                name="couleur_primary"
                value={couleurs.primary || themeApercu.primary}
                onChange={(e) =>
                  setCouleurs((c) => ({ ...c, primary: e.target.value }))
                }
                disabled={!peutEditer}
                className="h-10 w-full cursor-pointer rounded-xl border-2 border-k-ink"
              />
            </ChampTexte>
            <ChampTexte label="Couleur de fond">
              <input
                type="color"
                name="couleur_secondary"
                value={couleurs.secondary || themeApercu.secondary}
                onChange={(e) =>
                  setCouleurs((c) => ({ ...c, secondary: e.target.value }))
                }
                disabled={!peutEditer}
                className="h-10 w-full cursor-pointer rounded-xl border-2 border-k-ink"
              />
            </ChampTexte>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ChampTexte label="Police des titres">
              <select
                name="police_heading"
                value={polices.heading || themeApercu.heading}
                onChange={(e) =>
                  setPolices((p) => ({ ...p, heading: e.target.value }))
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
            </ChampTexte>
            <ChampTexte label="Police du texte">
              <select
                name="police_body"
                value={polices.body || themeApercu.body}
                onChange={(e) =>
                  setPolices((p) => ({ ...p, body: e.target.value }))
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
            </ChampTexte>
          </div>

          {/* LE TÉMOIN DE SECTION (VIT-13) : sans lui, les sept interrupteurs
              d'allure seraient lus comme sept refus. Ce studio les rend tous,
              donc il le pose. */}
          <input type="hidden" name="allure_rendue" value="1" />

          {VITRINE_ALLURE_ENUMS_CLES.map((cle) => (
            <ChampTexte key={cle} label={LIBELLES[cle] ?? cle}>
              <select
                name={cle}
                value={String(allure[cle] ?? VITRINE_ALLURE_ENUMS[cle].defaut)}
                onChange={(e) => majAllure(cle, e.target.value as never)}
                disabled={!peutEditer}
                className={CLASSE_CHAMP}
              >
                {VITRINE_ALLURE_ENUMS[cle].valeurs.map((v) => (
                  <option key={v} value={v}>
                    {VALEURS[v] ?? v}
                  </option>
                ))}
              </select>
            </ChampTexte>
          ))}

          {VITRINE_ALLURE_CHIFFRES.map((cle) => {
            const b = VITRINE_ALLURE_BORNES[cle];
            const valeur = allure[cle] ?? b.defaut;
            return (
              <div key={cle}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-black text-k-ink">
                    {LIBELLES[cle] ?? cle}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-zinc-500">
                    {valeur}
                  </span>
                </div>
                <input
                  type="range"
                  name={cle}
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
                    name={cle}
                    checked={resolue[RESOLU[cle]] as boolean}
                    onChange={(e) => majAllure(cle, e.target.checked)}
                    disabled={!peutEditer}
                    className="size-4 shrink-0 accent-k-orange-text"
                  />
                  {LIBELLES[cle] ?? cle}
                </label>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </form>
  );
}

const CLASSE_CHAMP =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-semibold text-k-ink disabled:bg-zinc-100";

function ChampTexte({
  label,
  aide,
  children,
}: {
  label: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-k-ink">{label}</span>
      {children}
      {aide ? <span className="mt-1 block text-xs text-zinc-500">{aide}</span> : null}
    </label>
  );
}

/** Les noms résolus, pour lire l'état des interrupteurs. */
const RESOLU: Record<string, keyof ReturnType<typeof resoudreThemeVitrine>["allure"]> = {
  entete_collant: "enteteCollant",
  capitales: "capitales",
  capitales_desc: "capitalesDesc",
  compte_rubrique: "compteRubrique",
  monogramme: "monogramme",
  favoris: "favoris",
  recherche: "recherche",
};

const LIBELLES: Record<string, string> = {
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

const VALEURS: Record<string, string> = {
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
