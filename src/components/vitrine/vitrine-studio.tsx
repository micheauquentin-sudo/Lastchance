"use client";

import { useEffect, useRef, useState } from "react";
import { useActionForm } from "@/lib/use-action-form";
import { saveVitrineSettings } from "@/actions/vitrine";
import { updateOrganizationSocialLinks } from "@/actions/organizations";
import { updateOrganizationSocialLinksSchema } from "@/lib/validations/organizations";
import { ApercuStudio } from "@/components/vitrine/studio/apercu";
import { CoquilleStudio } from "@/components/studio/coquille";
import { useEnregistrementDepuisEtat } from "@/components/studio/use-enregistrement-etat";
import { ChampsCachesStudio } from "@/components/vitrine/studio/champs-caches";
import {
  basculerBloc,
  etatInitialStudio,
  type EtatStudio,
} from "@/components/vitrine/studio/etat";
import { PageIdentiteStudio } from "@/components/vitrine/studio/page-identite";
import { PageHorairesStudio } from "@/components/vitrine/studio/page-horaires";
import { PageCarteStudio } from "@/components/vitrine/studio/page-carte";
import { PageJeuxStudio } from "@/components/vitrine/studio/page-jeux";
import {
  EtapeAllureStudio,
  EtapeCouleursStudio,
} from "@/components/vitrine/studio/pages-allure";
import { cartesExemple } from "@/components/vitrine/studio/exemples";
import {
  ETAPES_STUDIO,
  parseEtapeStudio,
  type EtapeStudio,
} from "@/components/vitrine/studio/pages";
import type {
  AllureVitrine,
  BilanJeuxVitrine,
  SecteurVitrine,
  ThemeVitrine,
  VitrineCarteView,
  ContenuVitrineView,
  HorairesVitrine,
  VitrineLiensView,
} from "@/lib/vitrine";

/**
 * LE STUDIO DE LA VITRINE — l'écran central de configuration (VIT-17 → VIT-20).
 *
 * ── POURQUOI UNE PAGE ENTIÈRE, HORS DU TABLEAU DE BORD ──
 *
 * Personnaliser une page se fait EN LA REGARDANT. Cette route vit hors de
 * `/dashboard`, exactement comme `/poster/[id]` : ce n'est pas une astuce de
 * mise en page, c'est ce qui fait disparaître la colonne de navigation et rend
 * l'écran entier à l'aperçu.
 *
 * ── DEUX COLONNES, ET NEUF ÉTAPES EN HAUT (VIT-35) ──
 *
 * L'écran avait trois colonnes : les réglages, l'aperçu, l'allure. La demande
 * du propriétaire les ramène à deux — « une seule colonne sur la gauche […] on
 * glisse l'aperçu à droite et la colonne de gauche s'agrandit encore pour
 * mettre plus d'info et plus de lisibilité ».
 *
 * Ce qu'elle achète est mesurable : la colonne de réglages passait de 420 px
 * (540 sur la carte) à tout ce qui reste, parce que la troisième colonne
 * prenait 400 px à celle qui en manquait — le formulaire d'une fiche dépliée
 * finissait à ~195 px. Ce qu'elle coûte, l'allure devait le rendre : elle est
 * répartie sur quatre étapes plutôt qu'empilée en vingt-cinq contrôles.
 *
 * LE BANDEAU DU HAUT NE GRANDIT PAS, et c'est demandé en toutes lettres. Les
 * neuf étapes tiennent sur UNE ligne qui défile horizontalement — pas de
 * `flex-wrap` : une deuxième ligne ferait grandir le bandeau, donc mentir le
 * `calc(100dvh-104px)` qui donne sa hauteur aux colonnes, donc défiler la page
 * entière au lieu de chaque colonne chez elle.
 *
 * ── CE FICHIER EST UNE COQUILLE, ET IL LE RESTE ──
 *
 * Il tient trois choses et rien d'autre : l'état des réglages, la charge utile
 * du formulaire, et l'étape affichée. Chaque étape vit dans SON fichier
 * (`studio/page-*.tsx`, `studio/pages-allure.tsx`), l'aperçu dans le sien.
 *
 * Ce n'est pas du rangement : sans cette découpe, chaque lot du chantier
 * « le studio devient l'écran central » aurait modifié le même fichier, donc
 * se serait attendu l'un l'autre. Là, ils sont disjoints.
 *
 * ── UN SEUL FORMULAIRE, VIDE, ET C'EST LA CLÉ DE TOUT ──
 *
 * Le studio héberge des blocs qui ont LEUR PROPRE action serveur : le logo, la
 * bannière, bientôt la carte et les liens sociaux. Chacun porte donc son
 * `<form>`. Or un `<form>` dans un `<form>` n'est pas du HTML valide : le
 * navigateur déplie en silence, l'hydratation échoue, et TOUTE l'interactivité
 * de l'écran tombe — le défaut livré en VIT-16, que garde
 * `reglages-formulaires.test.tsx`.
 *
 * La sortie est dans le HTML lui-même : un champ peut appartenir à un
 * formulaire QUI NE LE CONTIENT PAS, par l'attribut `form`. Le formulaire de
 * réglages est donc réduit à ses champs cachés, posé en VOISIN de la mise en
 * page ; le bouton « Enregistrer » le vise par son identifiant. Les autres
 * formulaires sont ses frères, jamais ses descendants.
 *
 * ── ET AUCUN CONTRÔLE VISIBLE NE PORTE DE `name` ──
 *
 * Une étape qu'on quitte est DÉMONTÉE — et il y en a neuf depuis VIT-35, donc
 * neuf fois plus d'occasions de démonter. Si ses champs portaient leur `name`,
 * aller composer sa carte ferait disparaître l'accroche du formulaire, et
 * l'enregistrement suivant l'effacerait — exactement le défaut que VIT-19
 * vient de fermer côté serveur, réintroduit par la navigation. La charge utile
 * est donc rendue en entier, à chaque rendu, depuis l'état : voir
 * `ChampsCachesStudio`.
 */
const ID_FORMULAIRE = "studio-reglages";

export function VitrineStudio({
  slug,
  identiteInitiale,
  themeInitial,
  cartes,
  liens,
  contenus,
  timezone,
  bilanJeux,
  peutEditer,
}: {
  slug: string;
  identiteInitiale: {
    nom: string;
    logoUrl: string | null;
    coverPath: string | null;
    coverAlt: string | null;
    accroche: string;
    histoire: string;
    horaires: string;
    badge: string;
    secteur: SecteurVitrine;
    horairesStructures: HorairesVitrine | null;
  };
  /** Le fuseau du COMMERCE, jamais celui du visiteur : il decide de « ouvert ». */
  timezone: string;
  themeInitial: ThemeVitrine;
  cartes: VitrineCarteView[];
  liens: VitrineLiensView;
  contenus: ContenuVitrineView[];
  /**
   * LES DROITS PAR MODULE ET LES COMPTES DU BILAN (VIT-32).
   *
   * Six droits, pas deux : la page « Ce qui paraît sur ma carte » règle
   * désormais les quiz, les calendriers, les pronostics et le passeport en plus
   * des deux salons. Les passer un par un aurait fait six props et six comptes
   * à tenir d accord avec le vocabulaire — la faute que ce dépôt paie chaque
   * fois qu une liste se recopie.
   */
  bilanJeux: BilanJeuxVitrine;
  peutEditer: boolean;
}) {
  const [etape, setEtape] = useState<EtapeStudio>(() => parseEtapeStudio(null));
  const [exemples, setExemples] = useState(false);
  const [etat, setEtat] = useState<EtatStudio>(() =>
    etatInitialStudio(themeInitial, {
      secteur: identiteInitiale.secteur,
      accroche: identiteInitiale.accroche,
      histoire: identiteInitiale.histoire,
      horaires: identiteInitiale.horaires,
      badge: identiteInitiale.badge,
      horairesStructures: identiteInitiale.horairesStructures,
    }),
  );

  /**
   * L'ENREGISTREMENT EST AUTOMATIQUE (VIT-30) — et c'est un RENVERSEMENT.
   *
   * VIT-17 puis ADR-137 posaient l'inverse en toutes lettres : « rien n'est
   * enregistré tant qu'on n'a pas enregistré », au nom de la promesse d'un
   * studio — essayer sans conséquence. L'argument se tenait ; il a été démenti
   * par l'usage, et c'est le propriétaire qui l'a tranché : « il faut un
   * enregistrement automatique à chaque changement afin de ne rien perdre ».
   *
   * Ce que l'argument d'origine n'avait pas vu : on ne règle pas une vitrine
   * d'un trait. On ouvre le studio, on bouge trois curseurs, on part voir un
   * client, on revient. Un travail perdu parce qu'on n'a pas cliqué coûte
   * infiniment plus cher qu'un essai enregistré — d'autant que la vitrine
   * PUBLIÉE est la seule chose qu'un client voit, et qu'un essai malheureux
   * s'y corrige en trois secondes.
   *
   * ── PAS DE TOAST, ET C'EST NÉCESSAIRE ──
   *
   * Un message à chaque frappe rendrait l'écran inutilisable. L'état
   * d'enregistrement se lit désormais dans le bandeau, en une ligne discrète —
   * la même information, sans l'interruption.
   */
  const { state, pending, onSubmit } = useActionForm(saveVitrineSettings, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  const formulaire = useRef<HTMLFormElement | null>(null);

  /**
   * LES TROIS LIENS SONT DANS L'ÉCRAN, PAS DANS `EtatStudio` (VIT-37).
   *
   * Ils n'appartiennent pas à la vitrine mais à l'ORGANISATION (trois colonnes
   * d'URL), et ils ont leur propre action, réservée au propriétaire. Les faire
   * entrer dans `EtatStudio` les aurait fait poster à `saveVitrineSettings`,
   * qui n'en sait rien — et aurait mêlé deux permissions dans un seul envoi.
   *
   * Ce qu'ils gagnent ici, c'est d'être LUS PAR L'APERÇU pendant la frappe,
   * comme tous les autres réglages. Avant, l'aperçu lisait la valeur venue du
   * serveur : on saisissait son Instagram et il ne se passait rien.
   */
  const [liensEdites, setLiensEdites] = useState<VitrineLiensView>(liens);
  const liensEnregistres = useRef(liens);
  const [refusLiens, setRefusLiens] = useState<string | null>(null);

  // DÉRIVÉ, JAMAIS STOCKÉ. Une première version gardait l'heure du dernier
  // succès dans un état posé depuis un effet — ce qu'ESLint refuse à juste
  // titre : un état qui ne fait que recopier une autre valeur finit par en
  // diverger. `state` porte déjà le dernier verdict du SERVEUR, et c'est lui
  // qui compte — pas ce que l'écran a tenté d'envoyer.
  const dejaEnregistre = state?.ok === true;

  /**
   * L'ENREGISTREMENT AUTOMATIQUE VIENT DU SOCLE (VIT-38).
   *
   * Les deux gardes qu'il porte étaient écrites ici : ne rien envoyer au
   * montage — sans quoi ouvrir le studio graverait en base les vingt-cinq
   * défauts d'allure d'une vitrine à laquelle personne n'a touché (le piège
   * que VIT-19 a passé un lot à défaire) — et ne rien envoyer sans le droit
   * d'éditer. Elles valent pour les douze animations, pas pour celle-ci.
   */
  useEnregistrementDepuisEtat({
    valeur: etat,
    formulaire,
    actif: peutEditer,
  });

  /**
   * ET ILS S'ENREGISTRENT SEULS, COMME LE RESTE (VIT-37).
   *
   * C'était le vrai défaut, et il était silencieux : le formulaire des liens
   * avait son propre bouton, plus bas que le pli, pendant que l'en-tête
   * annonçait « Modifications enregistrées » pour les AUTRES réglages. On
   * tapait son Instagram, on lisait « enregistrées », on partait, c'était
   * perdu. La demande d'origine était pourtant sans ambiguïté — « un
   * enregistrement automatique à chaque changement afin de ne rien perdre ».
   *
   * DEUX GARDES, ET AUCUNE N'EST DÉCORATIVE :
   *  - le schéma est joué AVANT l'envoi, avec la règle du serveur importée et
   *    non recopiée. Sans lui, chaque frappe d'une adresse en cours enverrait
   *    une écriture vouée au refus (« https://www.inst… »).
   *  - l'instantané envoyé est comparé au succès : c'est lui qui devient la
   *    référence, pas la valeur courante. Sinon, une frappe arrivée pendant
   *    l'aller-retour serait comptée comme déjà enregistrée.
   */
  useEffect(() => {
    if (!peutEditer) return;
    const reference = liensEnregistres.current;
    const identique =
      (liensEdites.google_review_url ?? "") ===
        (reference.google_review_url ?? "") &&
      (liensEdites.instagram_url ?? "") === (reference.instagram_url ?? "") &&
      (liensEdites.tiktok_url ?? "") === (reference.tiktok_url ?? "");
    if (identique) return;

    const t = setTimeout(() => {
      const envoi = {
        google_review_url: liensEdites.google_review_url ?? "",
        instagram_url: liensEdites.instagram_url ?? "",
        tiktok_url: liensEdites.tiktok_url ?? "",
      };
      const verdict = updateOrganizationSocialLinksSchema.safeParse(envoi);
      if (!verdict.success) {
        setRefusLiens(verdict.error.issues[0].message);
        return;
      }
      const donnees = new FormData();
      for (const [cle, valeur] of Object.entries(envoi))
        donnees.set(cle, valeur);
      void updateOrganizationSocialLinks(null, donnees).then((resultat) => {
        if (resultat.ok) {
          liensEnregistres.current = liensEdites;
          setRefusLiens(null);
        } else {
          setRefusLiens(resultat.error);
        }
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [liensEdites, peutEditer]);

  const majEtat = (patch: Partial<EtatStudio>) =>
    setEtat((e) => ({ ...e, ...patch }));

  const majAllure = <K extends keyof AllureVitrine>(
    cle: K,
    valeur: AllureVitrine[K],
  ) => setEtat((e) => ({ ...e, allure: { ...e.allure, [cle]: valeur } }));

  /**
   * L'APERÇU EST CONSTRUIT AVANT LE RENDU, parce qu'il devient une PROP de la
   * coquille et non un enfant : la coquille décide de la rangée à deux
   * colonnes, le module ne décide que de ce qu'il y a dedans.
   */
  const apercu = (
    <ApercuStudio
      etat={etat}
      themeBase={themeInitial}
      nom={identiteInitiale.nom}
      logoUrl={identiteInitiale.logoUrl}
      coverPath={identiteInitiale.coverPath}
      coverAlt={identiteInitiale.coverAlt}
      timezone={timezone}
      cartes={exemples ? cartesExemple(etat.secteur) : cartes}
      liens={liensEdites}
      slug={slug}
      exemples={exemples}
    />
  );

  return (
    <CoquilleStudio
      titre="Mon studio"
      hrefRetour="/dashboard/vitrine"
      idFormulaire={ID_FORMULAIRE}
      formulaire={formulaire}
      onSubmit={onSubmit}
      champsCaches={<ChampsCachesStudio etat={etat} />}
      etapes={ETAPES_STUDIO}
      etape={etape}
      onEtape={setEtape}
      peutEditer={peutEditer}
      enregistrement={{
        enCours: pending,
        reussi: dejaEnregistre,
        erreur: state && !state.ok ? state.error : undefined,
      }}
      outils={
        /* L'INTERRUPTEUR D'EXEMPLES (VIT-28) — dans le BANDEAU, pas dans une
           étape. Il ne dépend d'aucune d'elles : on veut juger une densité en
           réglant l'allure, un style de fiche en composant sa carte, une
           couleur en choisissant ses jeux. Le poser dans « Ma carte » aurait
           obligé à quitter ce qu'on règle pour aller allumer de quoi le
           regarder.

           IL N'ENTRE PAS DANS `EtatStudio`, et c'est délibéré : cet état-là
           est ce qui PART au serveur. Une préférence d'affichage n'a rien à y
           faire — l'y mettre aurait été le premier pas vers un réglage de
           confort enregistré sans que personne l'ait demandé. */
        <>
          <label className="flex items-center gap-2 text-xs font-black text-k-ink">
            <input
              type="checkbox"
              checked={exemples}
              onChange={(e) => setExemples(e.target.checked)}
              className="size-4 shrink-0 accent-k-orange-text"
            />
            Voir avec des exemples
          </label>
          <span className="text-xs text-zinc-500">
            Remplit l&apos;aperçu de fiches de votre métier, le temps de juger
            un style. Jamais enregistrées.
          </span>
        </>
      }
      apercu={apercu}
    >
      {etape === "identite" ? (
        <PageIdentiteStudio
          etat={etat}
          majEtat={majEtat}
          logoUrl={identiteInitiale.logoUrl}
          coverPath={identiteInitiale.coverPath}
          coverAlt={identiteInitiale.coverAlt}
          peutEditer={peutEditer}
        />
      ) : null}
      {etape === "horaires" ? (
        <PageHorairesStudio
          etat={etat}
          majEtat={majEtat}
          peutEditer={peutEditer}
        />
      ) : null}
      {etape === "carte" ? (
        <PageCarteStudio
          nbCartes={cartes.length}
          cartes={cartes}
          peutEditer={peutEditer}
        />
      ) : null}
      {/* « À la une » n'a plus d'étape à elle (VIT-32), et les quatre cases
              de visibilité l'ont rejointe (VIT-35) : celle-ci règle tout ce qui
              PARAÎT. */}
      {etape === "parait" ? (
        <PageJeuxStudio
          jeuxVisibles={etat.blocs.includes("experiences")}
          bilanJeux={bilanJeux}
          themeInitial={themeInitial}
          secteur={etat.secteur}
          contenus={contenus}
          liens={liensEdites}
          controleLiens={{
            valeurs: liensEdites,
            onChange: setLiensEdites,
            erreur: refusLiens,
          }}
          blocs={etat.blocs}
          onBloc={(bloc, visible) =>
            majEtat({ blocs: basculerBloc(etat.blocs, bloc, visible) })
          }
          socialVisible={etat.blocs.includes("social")}
          onSocialVisible={(v) =>
            majEtat({ blocs: basculerBloc(etat.blocs, "social", v) })
          }
          peutEditer={peutEditer}
        />
      ) : null}
      {etape === "couleurs" ? (
        <EtapeCouleursStudio
          etat={etat}
          majEtat={majEtat}
          peutEditer={peutEditer}
        />
      ) : null}
      {/* LES QUATRE ÉTAPES D'ALLURE PASSENT PAR LE MÊME COMPOSANT : ce
              qu'elles rendent est décidé par `REPARTITION_ALLURE`, en un seul
              endroit. C'est ce qui rend un réglage oublié ou doublé impossible
              sans faire rougir `allure-repartition.test.tsx`. */}
      {etape === "banniere" ||
      etape === "fiches" ||
      etape === "navigation" ||
      etape === "ambiance" ? (
        <EtapeAllureStudio
          etape={etape}
          etat={etat}
          majAllure={majAllure}
          majEtat={majEtat}
          peutEditer={peutEditer}
        />
      ) : null}
    </CoquilleStudio>
  );
}
