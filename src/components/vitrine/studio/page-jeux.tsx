"use client";

import { JeuxVitrineEditeur } from "@/components/vitrine/jeux-vitrine";
import { CaseStudio } from "@/components/vitrine/studio/champ";
import { SectionALaUneStudio } from "@/components/vitrine/studio/section-alaune";
import type { ControleLiens } from "@/components/dashboard/social-links-form";
import { resoudreThemeVitrine } from "@/components/vitrine/theme";
import { DUO_OPTIONS_MIN_BASE } from "@/lib/duo";
import type {
  BilanJeuxVitrine,
  BlocVitrine,
  ContenuVitrineView,
  SecteurVitrine,
  ThemeVitrine,
  VitrineLiensView,
} from "@/lib/vitrine";

/**
 * L'ÉTAPE 4 « CE QUI PARAÎT » DU STUDIO (VIT-22, refondue VIT-32 puis VIT-35).
 *
 * LE FICHIER GARDE LE NOM « jeux » ALORS QUE L'ÉTAPE S'APPELLE `parait` :
 * renommer le fichier n'aurait rien acheté d'autre qu'un diff plus large sur un
 * lot qui déplace déjà des dizaines de contrôles. Ce que porte le fichier n'est
 * pas ce que lit le commerçant — l'en-tête ci-dessus dit ce qu'il fait.
 *
 * ── ELLE ABSORBE AUSSI LES QUATRE CASES DE VISIBILITÉ (VIT-35) ──
 *
 * Elles vivaient au bas de « Identité ». Or « mon accroche paraît-elle ? » est
 * mot pour mot la question de cette étape ; les tenir ailleurs obligeait à
 * revenir sur l'identité pour décider ce que la page montre, et laissait le
 * commerçant chercher entre deux écrans ce qui n'était qu'une seule liste.
 *
 * ── ELLE ABSORBE « À LA UNE », ET C'EST LA DEMANDE ──
 *
 * Le studio avait quatre onglets, dont deux répondaient à la même question :
 * « À la une » réglait les mises en avant et les réseaux, « Les jeux » réglait
 * les jeux, et les deux disaient ensemble ce qu'un client voit en descendant la
 * page. Le propriétaire a tranché — « remplacer À la une par ça » — et le
 * regroupement est juste : on ne fait plus deux fois le tour de la même page
 * pour en composer le contenu.
 *
 * L'ORDRE EST CELUI DE LA PAGE PUBLIQUE : les jeux d'abord, parce que c'est ce
 * que ce lot vient d'élargir et ce qu'on vient régler ; les mises en avant et
 * les réseaux ensuite, comme sur la carte.
 *
 * ── ELLE MONTE LES ÉDITEURS EXISTANTS, ELLE NE LES REFAIT PAS ──
 *
 * `JeuxVitrineEditeur` fait déjà tout ce que cette page réclame : le bilan de
 * ce que l'offre comprend, les trois états par ligne, les cases. Le rendre une
 * seconde fois ici — même en apparence identique — aurait mis DEUX contrôles
 * sur une seule ligne en base : l'un revalidé, l'autre servi depuis un cache, et
 * un commerçant qui lit deux réponses différentes à la même question selon
 * l'écran ouvert. C'est le motif déjà écarté pour le plateau du Duo (DUO-3b,
 * `RenvoiVersLeJeu`) : le même réglage se règle à UN endroit. `SectionALaUne`
 * suit exactement la même règle.
 *
 * ── PAS DE CASE POUR LE BLOC « JEUX » ──
 *
 * On pourrait croire qu'il en manque une, puisque les autres pages du studio
 * cochent leurs blocs. Elle serait fausse : `setVitrineJeux` écrit
 * `ordre_blocs` LUI-MÊME — cocher quelque chose ajoute `experiences`, ne rien
 * cocher le retire (ADR-129). Une case de plus serait le même réglage à deux
 * endroits, et le premier des deux à partir écraserait l'autre. La phrase
 * ci-dessous se contente donc de DIRE l'état, sans offrir de le contredire.
 *
 * ── ET LEURS FORMULAIRES SONT DES FRÈRES, PAS DES DESCENDANTS ──
 *
 * Chaque éditeur porte son propre `<form>` : il a son action à lui. C'est prévu —
 * le formulaire de réglages du studio est vide de mise en page et posé en
 * VOISIN de la colonne (voir l'en-tête de `vitrine-studio.tsx`). Un `<form>`
 * dans un `<form>` ferait échouer l'hydratation et tuerait l'interactivité de
 * l'écran entier, ce que garde `studio-charge.test.tsx` (`form form === 0`).
 */
export function PageJeuxStudio({
  jeuxVisibles,
  bilanJeux,
  themeInitial,
  secteur,
  contenus,
  liens,
  controleLiens,
  blocs,
  onBloc,
  socialVisible,
  onSocialVisible,
  peutEditer,
}: {
  jeuxVisibles: boolean;
  /** L'ordre ET la visibilité : un bloc masqué est un bloc ABSENT (VIT-3). */
  blocs: readonly BlocVitrine[];
  onBloc: (bloc: BlocVitrine, visible: boolean) => void;
  /** Les droits par MODULE et les comptes qui disent « prêt » (VIT-32). */
  bilanJeux: BilanJeuxVitrine;
  /** Le thème EN BASE : `resoudreThemeVitrine` y lit les cases déjà faites. */
  themeInitial: ThemeVitrine;
  secteur: SecteurVitrine;
  contenus: ContenuVitrineView[];
  liens: VitrineLiensView;
  controleLiens?: ControleLiens;
  socialVisible: boolean;
  onSocialVisible: (visible: boolean) => void;
  peutEditer: boolean;
}) {
  /**
   * L'ÉTAT DES CASES SE LIT PAR LE RÉSOLVEUR, JAMAIS DANS LE THÈME BRUT.
   *
   * `theme.jeux` est ABSENT sur toutes les vitrines d'avant VIT-16, et ses
   * quatre nouvelles clés le sont sur toutes celles d'avant VIT-32 ; cette
   * absence vaut « affiché » (ADR-129). Lire `themeInitial.jeux?.quiz` aurait
   * rendu `undefined`, donc des cases vides, donc un enregistrement qui retire
   * en silence les jeux d'une vitrine qui les affichait.
   */
  const themeResolu = resoudreThemeVitrine(themeInitial, secteur);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
          Les blocs de votre page
        </h2>
        <p className="text-xs text-zinc-500">
          Décochez ce que vous ne voulez pas montrer. L&apos;aperçu suit
          aussitôt.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {BLOCS_PAGE.map(({ cle, label, aide }) => (
            <CaseStudio
              key={cle}
              label={label}
              aide={aide}
              cochee={blocs.includes(cle)}
              onChange={(v) => onBloc(cle, v)}
              disabled={!peutEditer}
            />
          ))}
        </div>
      </section>

      <div className="space-y-3 border-t-2 border-dashed border-zinc-200 pt-4">
        {/* Ce que la carte montre AUJOURD'HUI, en un mot. Le rechargement
            ci-dessous garantit que cette phrase n'est jamais en retard sur le
            choix qu'on vient d'enregistrer. */}
        <p className="text-xs text-zinc-500">
          {jeuxVisibles
            ? "Le bloc « Jeux » figure actuellement sur votre carte."
            : "Aucun jeu n'est actuellement annoncé sur votre carte."}
        </p>

        <JeuxVitrineEditeur
          possede={bilanJeux.possede}
          coche={themeResolu.jeux}
          compte={bilanJeux.compte}
          // Le PLANCHER du plateau, pas un chiffre recopié : la même constante
          // que la page du jeu et que le tableau de bord.
          duoPret={bilanJeux.compte.duo >= DUO_OPTIONS_MIN_BASE}
          peutEditer={peutEditer}
          // OBLIGATOIRE ICI, ET NULLE PART AILLEURS : le studio tient
          // `ordre_blocs` dans son état client, que `setVitrineJeux` vient de
          // modifier en base. Sans ce rechargement, l'enregistrement suivant —
          // AUTOMATIQUE depuis VIT-30, donc 1,2 s après le moindre réglage —
          // reposte l'ancien ordre et fait disparaître le bloc « Jeux » que le
          // commerçant vient de demander. Voir le commentaire de la prop.
          rechargerApresSucces
        />
      </div>

      <div className="border-t-2 border-dashed border-zinc-200 pt-4">
        <SectionALaUneStudio
          contenus={contenus}
          liens={liens}
          controleLiens={controleLiens}
          socialVisible={socialVisible}
          onSocialVisible={onSocialVisible}
          peutEditer={peutEditer}
        />
      </div>
    </div>
  );
}

/**
 * Les blocs que règle CETTE étape (VIT-35, venus de « Identité »).
 *
 * `social` et `experiences` n'y sont PAS, et ce n'est pas un oubli : le premier
 * a sa case dans `SectionALaUneStudio` juste en dessous, le second est écrit
 * par `setVitrineJeux` lui-même — cocher un jeu ajoute `experiences`, tout
 * décocher le retire (ADR-129). Une case de plus pour l'un ou l'autre serait le
 * même réglage à deux endroits, et le premier des deux à partir écraserait
 * l'autre.
 */
const BLOCS_PAGE = [
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
