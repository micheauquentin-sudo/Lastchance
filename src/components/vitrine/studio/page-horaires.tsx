"use client";

import { ChampStudio, CLASSE_CHAMP } from "@/components/vitrine/studio/champ";
import { HorairesEditeurStudio } from "@/components/vitrine/studio/horaires-editeur";
import type { EtatStudio } from "@/components/vitrine/studio/etat";
import { VITRINE_BADGE_OUVERTURE_MAX } from "@/lib/vitrine";

/**
 * L'ÉTAPE 2 « HORAIRES » DU STUDIO (VIT-35).
 *
 * ── POURQUOI ELLE EXISTE ──
 *
 * Ces trois contrôles vivaient au bas de « Identité », derrière le logo, la
 * bannière, le métier, l'accroche et l'histoire. Or ce sont les seuls du studio
 * qui se REVIENNENT saisir — une semaine de créneaux, sept lignes, deux fois
 * par an ou toutes les semaines selon le commerce. Les atteindre coûtait un
 * défilement complet d'une étape qui ne les concerne pas.
 *
 * Rien n'est réécrit : `HorairesEditeurStudio` est monté tel quel, avec les
 * mêmes props. Cette étape ne fait que lui donner un écran.
 *
 * ── LES TROIS SE TIENNENT, ET C'EST CE QUI JUSTIFIE DE LES GROUPER ──
 *
 * Le texte libre EXPLIQUE (jours fériés, congés), les créneaux CALCULENT (la
 * pastille « Ouvert » se déduit d'eux), et la pastille écrite à la main est le
 * repli quand rien n'est structuré (VIT-31c). Les séparer aurait laissé le
 * commerçant écrire deux fois la même chose sans jamais voir qu'il se répète.
 */
export function PageHorairesStudio({
  etat,
  majEtat,
  peutEditer,
}: {
  etat: EtatStudio;
  majEtat: (patch: Partial<EtatStudio>) => void;
  peutEditer: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
          Vos horaires
        </h2>
        <p className="text-xs text-zinc-500">
          Remplissez les jours où vous ouvrez. Un jour laissé vide est un jour
          fermé — la page le dira ainsi.
        </p>
      </div>

      {/* LE TEXTE LIBRE RESTE EN PREMIER, ET IL N'EST PAS DOUBLÉ (VIT-31c).
          Il porte ce que sept lignes de créneaux ne savent pas dire — jours
          fériés, fermeture annuelle, « service continu le samedi ». Le
          remplacer par l'éditeur aurait fait perdre cette légende à toutes les
          vitrines déjà publiées, et `etatHoraires` ne sait rien d'un 25
          décembre. Les deux coexistent : le texte explique, les créneaux se
          calculent. */}
      <ChampStudio
        label="Horaires"
        aide="En toutes lettres — jours fériés, congés, exceptions."
      >
        <textarea
          value={etat.horaires}
          rows={4}
          maxLength={600}
          onChange={(e) => majEtat({ horaires: e.target.value })}
          disabled={!peutEditer}
          className={CLASSE_CHAMP}
        />
      </ChampStudio>

      <HorairesEditeurStudio
        horaires={etat.horairesStructures}
        onChange={(horairesStructures) => majEtat({ horairesStructures })}
        disabled={!peutEditer}
      />

      <div className="border-t-2 border-dashed border-zinc-200 pt-4">
        <ChampStudio
          label="Pastille d'ouverture"
          aide="« Ouvert · 12h–23h ». Vide = pas de pastille, sauf si vos créneaux ci-dessus la calculent."
        >
          <input
            value={etat.badge}
            maxLength={VITRINE_BADGE_OUVERTURE_MAX}
            onChange={(e) => majEtat({ badge: e.target.value })}
            disabled={!peutEditer}
            className={CLASSE_CHAMP}
          />
        </ChampStudio>
      </div>
    </div>
  );
}
