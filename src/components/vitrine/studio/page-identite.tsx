"use client";

import { PhotoChamp } from "@/components/vitrine/photo-champ";
import { LogoChamp } from "@/components/vitrine/studio/logo-champ";
import {
  CaseStudio,
  ChampStudio,
  CLASSE_CHAMP,
} from "@/components/vitrine/studio/champ";
import { basculerBloc, type EtatStudio } from "@/components/vitrine/studio/etat";
import {
  VITRINE_BADGE_OUVERTURE_MAX,
  VITRINE_SECTEURS,
  libelleSecteur,
  type SecteurVitrine,
} from "@/lib/vitrine";

/**
 * LA PAGE « IDENTITÉ » DU STUDIO (VIT-20) — la colonne de gauche.
 *
 * ── TOUTE L'IDENTITÉ VISUELLE EST ICI, Y COMPRIS CE QUI N'Y ÉTAIT PAS ──
 *
 * Le logo et la bannière se réglaient ailleurs — le logo dans les réglages
 * généraux du commerce, la bannière dans l'atelier — c'est-à-dire aux deux
 * seuls endroits d'où l'on ne voit pas la page qu'ils habillent. Choisir une
 * photo de couverture sans voir le voile, le nom posé dessus et la carte
 * d'infos qui la chevauche revient à choisir un cadre sans le tableau.
 *
 * ── LES CASES DISENT CE QUI PARAÎT, ET « MASQUER, C'EST OMETTRE » ──
 *
 * Il n'y a pas de drapeau de visibilité en base : un bloc masqué est un bloc
 * ABSENT d'`ordre_blocs` (VIT-3). Cocher ajoute, décocher retire, et l'aperçu
 * s'en aperçoit immédiatement — sans quoi une case sans effet visible aurait
 * fait douter de l'écran entier.
 *
 * L'heure en fait partie, et c'est ce qui manquait : les horaires se
 * saisissaient sans qu'on puisse dire s'ils devaient figurer sur la carte.
 */
export function PageIdentiteStudio({
  etat,
  majEtat,
  logoUrl,
  coverPath,
  coverAlt,
  peutEditer,
}: {
  etat: EtatStudio;
  majEtat: (patch: Partial<EtatStudio>) => void;
  logoUrl: string | null;
  coverPath: string | null;
  coverAlt: string | null;
  peutEditer: boolean;
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
          Votre image
        </h2>

        {/* CES DEUX BLOCS ONT LEUR PROPRE ACTION, DONC LEUR PROPRE FORMULAIRE.
            Ils ne partent pas avec « Enregistrer » : une photo s'envoie seule,
            et l'imbriquer dans le formulaire de réglages serait un `<form>`
            dans un `<form>` — ce que le navigateur déplie en silence, ce qui
            fait échouer l'hydratation, et ce qui tue l'interactivité de TOUT
            l'écran. Le studio place donc son propre formulaire à côté d'eux,
            jamais autour (voir `reglages-formulaires.test.tsx`). */}
        <LogoChamp logoUrl={logoUrl} peutEditer={peutEditer} />
        <PhotoChamp
          cible="couverture"
          chemin={coverPath}
          alt={coverAlt}
          peutEditer={peutEditer}
          titre="Bannière du haut"
        />
      </section>

      <section className="space-y-3 border-t-2 border-dashed border-zinc-200 pt-4">
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
          Vos mots
        </h2>

        <ChampStudio
          label="Votre métier"
          aide="Il choisit les mots que lisent vos clients, et une palette de départ."
        >
          <select
            value={etat.secteur}
            onChange={(e) =>
              majEtat({ secteur: e.target.value as SecteurVitrine })
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
        </ChampStudio>

        <ChampStudio label="Accroche" aide="Sous le nom, sur la photo.">
          <input
            value={etat.accroche}
            maxLength={200}
            onChange={(e) => majEtat({ accroche: e.target.value })}
            disabled={!peutEditer}
            className={CLASSE_CHAMP}
          />
        </ChampStudio>

        <ChampStudio
          label="Pastille d'ouverture"
          aide="« Ouvert · 12h–23h ». Vide = pas de pastille."
        >
          <input
            value={etat.badge}
            maxLength={VITRINE_BADGE_OUVERTURE_MAX}
            onChange={(e) => majEtat({ badge: e.target.value })}
            disabled={!peutEditer}
            className={CLASSE_CHAMP}
          />
        </ChampStudio>

        <ChampStudio label="Votre histoire">
          <textarea
            value={etat.histoire}
            rows={5}
            maxLength={1200}
            onChange={(e) => majEtat({ histoire: e.target.value })}
            disabled={!peutEditer}
            className={CLASSE_CHAMP}
          />
        </ChampStudio>

        <ChampStudio label="Horaires" aide="Une ligne par jour.">
          <textarea
            value={etat.horaires}
            rows={4}
            maxLength={600}
            onChange={(e) => majEtat({ horaires: e.target.value })}
            disabled={!peutEditer}
            className={CLASSE_CHAMP}
          />
        </ChampStudio>
      </section>

      <section className="space-y-2 border-t-2 border-dashed border-zinc-200 pt-4">
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
          Ce qui paraît sur la page
        </h2>
        <p className="text-xs text-zinc-500">
          Décochez ce que vous ne voulez pas montrer. L&apos;aperçu suit
          aussitôt.
        </p>

        {BLOCS_IDENTITE.map(({ cle, label, aide }) => (
          <CaseStudio
            key={cle}
            label={label}
            aide={aide}
            cochee={etat.blocs.includes(cle)}
            onChange={(v) => majEtat({ blocs: basculerBloc(etat.blocs, cle, v) })}
            disabled={!peutEditer}
          />
        ))}
      </section>
    </div>
  );
}

/**
 * Les blocs que règle CETTE page. `social` et `experiences` ont les leurs —
 * on coche un bloc là où on saisit ce qu'il contient, pas dans une liste
 * générale qui obligerait à faire l'aller-retour pour vérifier de quoi on parle.
 */
const BLOCS_IDENTITE = [
  {
    cle: "accroche",
    label: "L'accroche",
    aide: "La phrase sous votre nom, sur la bannière.",
  },
  {
    cle: "histoire",
    label: "Votre histoire",
    aide: "Le texte de présentation de votre lieu.",
  },
  {
    cle: "horaires",
    label: "Vos horaires",
    aide: "Les heures d'ouverture, telles que vous les avez écrites.",
  },
  {
    cle: "cartes",
    label: "Vos cartes",
    aide: "Le catalogue lui-même. Décoché, la page ne montre plus vos fiches.",
  },
] as const;
