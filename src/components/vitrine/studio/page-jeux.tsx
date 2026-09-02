"use client";

import { JeuxVitrineEditeur } from "@/components/vitrine/jeux-vitrine";
import { SectionALaUneStudio } from "@/components/vitrine/studio/section-alaune";
import { resoudreThemeVitrine } from "@/components/vitrine/theme";
import { DUO_OPTIONS_MIN_BASE } from "@/lib/duo";
import type {
  BilanJeuxVitrine,
  ContenuVitrineView,
  SecteurVitrine,
  ThemeVitrine,
  VitrineLiensView,
} from "@/lib/vitrine";

/**
 * LA PAGE « CE QUI PARAÎT SUR MA CARTE » DU STUDIO (VIT-22, refondue VIT-32).
 *
 * LE FICHIER ET LE NOM RESTENT « jeux », ET C'EST VOULU : la clé de page
 * (`?page=jeux`, `PAGES_STUDIO`) est ce qu'un favori garde, et la renommer
 * n'aurait acheté qu'un lien mort contre un titre plus juste — que porte déjà
 * l'onglet.
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
  socialVisible,
  onSocialVisible,
  peutEditer,
}: {
  jeuxVisibles: boolean;
  /** Les droits par MODULE et les comptes qui disent « prêt » (VIT-32). */
  bilanJeux: BilanJeuxVitrine;
  /** Le thème EN BASE : `resoudreThemeVitrine` y lit les cases déjà faites. */
  themeInitial: ThemeVitrine;
  secteur: SecteurVitrine;
  contenus: ContenuVitrineView[];
  liens: VitrineLiensView;
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
      <div className="space-y-3">
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
          socialVisible={socialVisible}
          onSocialVisible={onSocialVisible}
          peutEditer={peutEditer}
        />
      </div>
    </div>
  );
}
