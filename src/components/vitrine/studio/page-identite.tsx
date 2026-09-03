"use client";

import { PhotoChamp } from "@/components/vitrine/photo-champ";
import { LogoChamp } from "@/components/vitrine/studio/logo-champ";
import { ChampStudio, CLASSE_CHAMP } from "@/components/vitrine/studio/champ";
import type { EtatStudio } from "@/components/vitrine/studio/etat";
import {
  VITRINE_SECTEURS,
  libelleSecteur,
  type SecteurVitrine,
} from "@/lib/vitrine";

/**
 * L'ÉTAPE 1 « IDENTITÉ » DU STUDIO (VIT-20, resserrée VIT-35).
 *
 * ── TOUTE L'IDENTITÉ VISUELLE EST ICI, Y COMPRIS CE QUI N'Y ÉTAIT PAS ──
 *
 * Le logo et la bannière se réglaient ailleurs — le logo dans les réglages
 * généraux du commerce, la bannière dans l'atelier — c'est-à-dire aux deux
 * seuls endroits d'où l'on ne voit pas la page qu'ils habillent. Choisir une
 * photo de couverture sans voir le voile, le nom posé dessus et la carte
 * d'infos qui la chevauche revient à choisir un cadre sans le tableau.
 *
 * ── CE QUI L'A QUITTÉE, ET POURQUOI (VIT-35) ──
 *
 * Les horaires — texte libre, sept jours, pastille d'ouverture — ont leur
 * étape à eux : c'est le seul bloc du studio qui demande de la saisie répétée,
 * et il repoussait sous la ligne de flottaison les trois champs qu'on vient
 * modifier le plus souvent.
 *
 * Les quatre cases de visibilité sont parties vers « Ce qui paraît », avec les
 * jeux et les réseaux. Elles répondent à la même question que ces derniers, et
 * les tenir ici obligeait à revenir sur l'identité pour décider ce qu'une page
 * montre.
 *
 * Ce qui reste est ce qu'on répond une fois pour toutes : qui je suis.
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
          label="Votre histoire"
          aide="Le texte de présentation de votre lieu, plus bas sur la page."
        >
          <textarea
            value={etat.histoire}
            rows={6}
            maxLength={1200}
            onChange={(e) => majEtat({ histoire: e.target.value })}
            disabled={!peutEditer}
            className={CLASSE_CHAMP}
          />
        </ChampStudio>
      </section>
    </div>
  );
}
