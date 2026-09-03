"use client";

import { CadreApercu } from "@/components/studio/cadre-apercu";
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
  timezone,
  exemples = false,
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
  /** Le fuseau du COMMERCE — le lot des ecrans en fera « Ouvert · ferme a 23h ». */
  timezone: string;
  /**
   * Les cartes reçues sont-elles des EXEMPLES (VIT-28) ?
   *
   * Ce drapeau ne CHOISIT rien — c'est la coquille qui décide quelles cartes
   * passer. Il ne sert qu'à le DIRE à l'écran, et c'est indispensable : un
   * aperçu rempli de plats qu'on n'a pas écrits se lit comme une vitrine déjà
   * publiée. Le bandeau est la différence entre une démonstration et un
   * malentendu.
   */
  exemples?: boolean;
}) {
  const theme = resoudreThemeVitrine(
    themeDeLEtat(etat, themeBase),
    etat.secteur,
  );
  const allure = theme.allure;
  // MASQUER UN BLOC, C'EST L'OMETTRE (VIT-3) : l'aperçu lit donc la liste
  // résolue, exactement comme la page publique. Sans cela, décocher « Horaires »
  // n'aurait rien changé à l'écran, et le commerçant aurait conclu que la case
  // ne sert à rien.
  const visible = (bloc: string) => theme.blocs.includes(bloc as never);

  /**
   * SEULES LES CARTES ACTIVES, ET C'EST UN DÉFAUT CORRIGÉ (VIT-26).
   *
   * `VitrineCarteView.active` porte son propre avertissement : « toujours
   * `true` dans l'état PUBLIC — la RPC n'en rend pas d'autres ». L'état du
   * TABLEAU DE BORD, lui, rend tout, y compris ce que le commerçant a
   * décoché : c'est ce qu'il faut pour l'éditer.
   *
   * L'aperçu recevait donc les deux, et `CatalogueVitrine` — écrit pour la
   * page publique — faisait confiance à ce qu'on lui donnait. Une carte
   * désactivée mais pleine s'affichait donc PLEINE au commerçant et VIDE chez
   * son client.
   *
   * C'est la pire forme de mensonge pour un aperçu : il ne se trompe pas au
   * hasard, il se trompe exactement là où le commerçant vient vérifier. Et
   * rien ne le signalait — le composant public n'a aucune raison de filtrer ce
   * que sa source lui garantit déjà.
   *
   * Le filtre vit ICI, et non dans `CatalogueVitrine` : ce dernier doit rester
   * le composant que sert la page publique, sans branche « et si on
   * m'appelait depuis un éditeur ». C'est l'appelant qui doit fournir ce que
   * la page publique recevrait.
   *
   * `disponible` sur une FICHE ne se filtre pas, lui : la RPC publique la rend
   * quand même et l'écran la grise. Le traiter comme `active` la ferait
   * disparaître de l'aperçu alors qu'elle paraît en ligne — le même défaut,
   * dans l'autre sens.
   */
  const cartesPubliees = cartes.filter((c) => c.active);

  // LE FUSEAU EST ENFIN CONSOMMÉ (VIT-31c) : l'aperçu calcule sa pastille comme
  // la page publique, avec le fuseau du COMMERCE et non celui du commerçant —
  // un patron en déplacement doit voir l'heure de sa boutique. Tant que rien
  // n'est structuré, `horairesStructures` vaut `null` et le hero retombe sur la
  // pastille écrite à la main : l'aperçu ne bouge pas d'un pixel.

  return (
    /* LE CADRE ET LA COLONNE VIENNENT DU SOCLE (VIT-38) — voir
       `@/components/studio/cadre-apercu` pour la raison qui interdit de les
       élargir. Ce qui reste ICI est ce qui appartient à la vitrine : ses
       variables de thème, et le fait que sa page publique est capée à 480 px.

       LA LARGEUR RESTE LITTÉRALE DANS CE FICHIER, et ce n'est pas un oubli :
       Tailwind ne compile pas une valeur arbitraire construite à l'exécution,
       et `largeur-apercu.test.ts` compare CE chiffre à celui de la page
       publique. Passé par une variable, il cesserait d'être vérifiable. */
    <CadreApercu
      style={variablesThemeVitrine(theme)}
      classeCadre="w-full max-w-[480px] bg-[var(--vitrine-secondary)] font-[family-name:var(--vitrine-texte)] text-[var(--vitrine-sur-secondary)]"
      banniere={
        /* LE BANDEAU D'EXEMPLE EST DANS L'APERÇU, PAS À CÔTÉ (VIT-28). Posé
           au-dessus du cadre il aurait pu passer pour une note de l'écran ;
           posé DEDANS, il dit sans ambiguïté que ce qu'on lit en dessous n'est
           pas la carte du commerçant. C'est ce qui sépare une démonstration
           d'un malentendu. */
        exemples ? (
          <p
            role="status"
            className="w-full max-w-[480px] shrink-0 rounded-xl border-2 border-dashed border-k-ink/40 bg-k-yellow/40 px-3 py-2 text-xs font-black text-k-ink"
          >
            Exemples — ces fiches ne sont pas les vôtres et ne seront jamais
            enregistrées. Elles servent à juger un style sur du contenu.
          </p>
        ) : null
      }
    >
      <HeroVitrine
        nom={nom}
        logoUrl={logoUrl}
        couverture={coverPath}
        couvertureAlt={coverAlt}
        accroche={visible("accroche") ? etat.accroche || null : null}
        badgeOuverture={etat.badge || null}
        horaires={etat.horairesStructures}
        timezone={timezone}
        allure={allure}
        liens={visible("social") ? liens : LIENS_MASQUES}
        avisGoogle="Avis Google"
        selecteurLangue={null}
      />
      <div className="px-3">
        <CatalogueVitrine
          cartes={visible("cartes") ? cartesPubliees : []}
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
    </CadreApercu>
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
