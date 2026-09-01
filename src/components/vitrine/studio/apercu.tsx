"use client";

import { HeroVitrine } from "@/components/vitrine/hero-vitrine";
import { CatalogueVitrine } from "@/components/vitrine/catalogue-vitrine";
import { BarreBasseVitrine } from "@/components/vitrine/barre-basse";
import {
  resoudreThemeVitrine,
  variablesThemeVitrine,
} from "@/components/vitrine/theme";
import type { EtatStudio } from "@/components/vitrine/studio/etat";
import { themeDeLEtat } from "@/components/vitrine/studio/etat";
import type {
  ThemeVitrine,
  VitrineCarteView,
  VitrineLiensView,
} from "@/lib/vitrine";

/**
 * L'APERÇU — ET C'EST LA VRAIE PAGE, PAS UNE MAQUETTE (VIT-17, étendu VIT-20).
 *
 * Il monte `HeroVitrine`, `CatalogueVitrine` et `BarreBasseVitrine` — les
 * composants QUE SERT LA PAGE PUBLIQUE — et résout son thème avec
 * `resoudreThemeVitrine`, la même fonction. Ce qui se voit ici est ce qui sera
 * servi.
 *
 * Une maquette approximative aurait été une seconde vitrine à tenir d'accord
 * avec la première ; elles auraient divergé au premier réglage ajouté, et ce
 * module en a ajouté vingt-cinq en trois semaines.
 *
 * ── IL EST VIVANT PARCE QUE L'ALLURE EST DU CSS ──
 *
 * Les vingt-cinq réglages sortent en variables CSS posées sur le conteneur :
 * bouger un curseur ne recalcule rien, le navigateur repeint. Les quelques
 * réglages qui changent la STRUCTURE passent par les props, qui se re-rendent.
 *
 * ── IL EST EXTRAIT DE LA COQUILLE, ET CE N'EST PAS COSMÉTIQUE ──
 *
 * Les quatre pages du studio le montrent toutes, sans exception : c'est la
 * seule chose qui ne change jamais d'une page à l'autre. Le laisser dans la
 * coquille aurait fait grossir le seul fichier que tous les lots suivants
 * doivent modifier.
 */
export function ApercuStudio({
  etat,
  themeBase,
  nom,
  logoUrl,
  coverPath,
  coverAlt,
  cartes,
  liens,
  slug,
}: {
  etat: EtatStudio;
  /** Le thème en base, pour les clés qu'aucun contrôle du studio ne règle. */
  themeBase: ThemeVitrine;
  nom: string;
  logoUrl: string | null;
  coverPath: string | null;
  coverAlt: string | null;
  cartes: VitrineCarteView[];
  liens: VitrineLiensView;
  slug: string;
}) {
  const theme = resoudreThemeVitrine(themeDeLEtat(etat, themeBase), etat.secteur);
  const allure = theme.allure;
  // MASQUER UN BLOC, C'EST L'OMETTRE (VIT-3) : l'aperçu lit donc la liste
  // résolue, exactement comme la page publique. Sans cela, décocher « Horaires »
  // n'aurait rien changé à l'écran, et le commerçant aurait conclu que la case
  // ne sert à rien.
  const visible = (bloc: string) => theme.blocs.includes(bloc as never);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto">
      <p className="text-xs font-semibold text-zinc-500">
        Aperçu — la page que vos clients ouvriront. Rien n&apos;est enregistré
        tant que vous n&apos;avez pas cliqué sur Enregistrer.
      </p>
      <div
        style={variablesThemeVitrine(theme)}
        className="w-full max-w-[480px] shrink-0 overflow-hidden rounded-2xl border-2 border-k-ink bg-[var(--vitrine-secondary)] font-[family-name:var(--vitrine-texte)] text-[var(--vitrine-sur-secondary)] shadow-[8px_8px_0_rgba(33,29,22,0.9)]"
      >
        <HeroVitrine
          nom={nom}
          logoUrl={logoUrl}
          couverture={coverPath}
          couvertureAlt={coverAlt}
          accroche={visible("accroche") ? etat.accroche || null : null}
          badgeOuverture={etat.badge || null}
          allure={allure}
          liens={visible("social") ? liens : LIENS_MASQUES}
          avisGoogle="Avis Google"
          selecteurLangue={null}
        />
        <div className="px-3">
          <CatalogueVitrine
            cartes={visible("cartes") ? cartes : []}
            styleCartes={theme.styleCartes}
            lang="fr"
            secteur={etat.secteur}
            allure={allure}
            slug={slug}
            portesOuvertes={[]}
            histoire={visible("histoire") ? etat.histoire || null : null}
            horaires={visible("horaires") ? etat.horaires || null : null}
          />
        </div>
        {allure.barreBasse !== "masquee" ? (
          <BarreBasseVitrine
            slug={slug}
            lang="fr"
            secteur={etat.secteur}
            allure={allure}
            ancrePied="studio-pied"
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Le bloc « Réseaux et avis » décoché : trois liens ABSENTS, et non trois
 * chaînes vides. C'est ce que la page publique reçoit quand le commerçant n'a
 * rien saisi, et le hero en tire déjà la bonne conclusion — il ne rend pas la
 * carte d'infos plutôt que d'en rendre une vide.
 */
const LIENS_MASQUES: VitrineLiensView = {
  google_review_url: null,
  instagram_url: null,
  tiktok_url: null,
};
