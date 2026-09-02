"use client";

import { SocialLinksForm } from "@/components/dashboard/social-links-form";
import { ContenusEditeur } from "@/components/vitrine/contenus-editeur";
import { CaseStudio } from "@/components/vitrine/studio/champ";
import type { ContenuVitrineView, VitrineLiensView } from "@/lib/vitrine";

/**
 * LA PAGE « À LA UNE » DU STUDIO (VIT-21) — mises en avant, réseaux et avis.
 *
 * ── CE QUI MANQUAIT, ET QUE LE PROPRIÉTAIRE A NOMMÉ ──
 *
 * Les trois liens publics se saisissaient dans les réglages généraux du
 * commerce, et la case qui décide s'ils paraissent vivait dans l'atelier :
 * deux écrans, sans l'aperçu, pour un seul geste. On pouvait donc remplir son
 * Instagram sans jamais le voir apparaître, ou cocher un bloc vide. Les deux
 * moitiés sont ici, côte à côte, devant la page qu'elles habillent.
 *
 * ── LE FORMULAIRE DES LIENS EST RÉUTILISÉ, PAS RECOPIÉ ──
 *
 * `SocialLinksForm` poste TOUJOURS ses trois champs, parce que
 * `updateOrganizationSocialLinks` traite un champ absent comme un champ vidé :
 * un panneau « compact » qui n'aurait montré qu'un réseau à la fois aurait
 * effacé les deux autres au premier enregistrement. Sa mise en forme est
 * fluide et tient dans les 340 px de la colonne — la réécrire n'aurait acheté
 * que la reproduction de ce piège. L'avertissement Google/Instagram qu'il
 * porte n'est pas davantage négociable : il suit les liens où qu'ils aillent.
 *
 * ── AUCUNE COURSE AVEC L'ÉTAT DU STUDIO ──
 *
 * L'action écrit dans `organizations` (les trois colonnes d'URL), jamais dans
 * `theme` : elle ne peut donc pas écraser une couleur ou un bloc réglé à côté,
 * contrairement au défaut de VIT-19. La case, elle, ne s'enregistre pas seule —
 * c'est un bloc d'`ordre_blocs`, il part avec « Enregistrer ».
 */
export function PageALaUneStudio({
  contenus,
  liens,
  socialVisible,
  onSocialVisible,
  peutEditer,
}: {
  contenus: ContenuVitrineView[];
  liens: VitrineLiensView;
  /** Le bloc « Réseaux et avis » paraît-il ? Masquer, c'est omettre (VIT-3). */
  socialVisible: boolean;
  onSocialVisible: (visible: boolean) => void;
  peutEditer: boolean;
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
          Vos mises en avant
        </h2>
        <ContenusEditeur contenus={contenus} peutEditer={peutEditer} />
      </section>

      <section className="space-y-3 border-t-2 border-dashed border-zinc-200 pt-4">
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
          Réseaux et avis
        </h2>

        {/* LA CASE D'ABORD, LES CHAMPS ENSUITE : décochée, la page ne montre
            rien de ce qui est saisi dessous, et l'aperçu le dit tout de suite.
            L'inverse aurait laissé remplir trois adresses avant d'apprendre
            qu'elles ne paraissent pas. */}
        <CaseStudio
          label="Réseaux et avis"
          aide="Vos liens Instagram, TikTok et « Évaluez-nous » sur la page."
          cochee={socialVisible}
          onChange={onSocialVisible}
          disabled={!peutEditer}
        />

        {peutEditer ? (
          <SocialLinksForm
            googleReviewUrl={liens.google_review_url ?? ""}
            instagramUrl={liens.instagram_url ?? ""}
            tiktokUrl={liens.tiktok_url ?? ""}
          />
        ) : (
          // Le formulaire est réservé au propriétaire — côté action
          // (`requireOrganizationOwner`) comme ici. Le dire vaut mieux que
          // montrer des champs qui refuseront.
          <p className="text-xs text-zinc-500">
            Seul le propriétaire du compte peut modifier ces liens.
          </p>
        )}
      </section>
    </div>
  );
}
