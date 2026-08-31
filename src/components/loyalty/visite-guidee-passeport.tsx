"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { useVisiteGuideeVue } from "./visite-guidee-state";
import type { LoyaltyValidationMode } from "@/types/database";

/**
 * « À QUOI ÇA SERT, ET COMMENT JE M'EN SERS » — le passeport s'explique.
 *
 * ── LE PROBLÈME ──
 *
 * Le module est complet, et c'est précisément ce qui le rend illisible : un
 * client qui découvre l'écran en caisse y trouve un solde, un niveau, une
 * boutique, un QR, un parrainage, une installation et un pied de carte. Rien
 * ne lui dit dans quel ORDRE lire tout ça, ni ce qu'il est censé faire.
 *
 * La chose la moins évidente du module — et la seule où le produit peut
 * passer pour malhonnête alors qu'il est généreux — tient en deux compteurs :
 * le SOLDE se dépense, le NIVEAU ne se perd pas. Un client qui échange un
 * cadeau voit son solde chuter et croit avoir perdu son rang. C'est l'étape 3,
 * et c'est la raison d'être de tout ce composant.
 *
 * ── AUCUNE OUVERTURE AUTOMATIQUE, ET C'EST LA DÉCISION CENTRALE ──
 *
 * Trois raisons, dont deux suffiraient.
 *
 *  1. LE CLIENT EST EN CAISSE. Il a dix secondes et quelqu'un derrière lui.
 *     Un panneau posé sur sa carte au chargement, c'est un panneau qu'on
 *     ferme sans lire — on aurait dépensé le seul moment d'attention
 *     disponible pour faire disparaître une notice.
 *  2. ÇA CACHERAIT CE QU'IL VIENT CHERCHER. Une modale `aria-modal="true"`
 *     rend inerte tout ce qu'elle recouvre : le solde, le niveau et la carte
 *     à présenter cessent d'exister pour un lecteur d'écran, pour l'audit axe
 *     de la CI et pour `e2e/loyalty.spec.ts`, qui ouvre le passeport avec un
 *     cookie VIERGE — exactement la population qu'une ouverture automatique
 *     viserait — et exige de voir « Mes points », « Niveau Bronze », « Ma
 *     carte à présenter » et le QR.
 *  3. LE DÉPÔT FAIT DÉJÀ AUTREMENT. `ConsigneJoueur` accueille la chasse, le
 *     calendrier et le jackpot par une PHRASE EN LIGNE, jamais par une
 *     fenêtre. Ce composant reprend ce motif — une bande qui pousse le
 *     contenu vers le bas, qui ne recouvre rien — et ne réserve la fenêtre
 *     qu'au geste explicite du client.
 *
 * Ce qui s'ouvre tout seul, c'est donc une INVITATION en ligne, haute de trois
 * lignes ; la visite guidée, elle, n'existe qu'après un appui.
 *
 * ── CE DONT ON SE SOUVIENT, ET COMMENT ON Y REVIENT ──
 *
 * L'invitation ne s'adresse qu'au premier passage (`visite-guidee-state.ts`,
 * `localStorage`, gardé). Le BOUTON, lui, ne disparaît jamais : la visite
 * reste à un appui même trois mois plus tard, quand le client se demandera
 * pourquoi son solde a baissé. Un point d'entrée qui n'existe qu'une fois
 * n'explique rien à celui qui n'avait pas la question ce jour-là.
 *
 * ── AUCUN EMOJI ──
 *
 * Ni dans les titres, ni dans les libellés de boutons. Un U+FE0F invisible
 * dans un nom accessible a déjà cassé un locator Playwright de ce dépôt
 * (`e2e/event-remote-cycle.spec.ts`).
 */

interface Etape {
  titre: string;
  corps: string;
}

/**
 * LES ÉTAPES, DANS L'ORDRE D'IMPORTANCE POUR LE CLIENT — et non dans l'ordre
 * où les blocs sont peints à l'écran.
 *
 * Aucun chiffre n'est inventé ici :
 *  · les 100 points par visite sont la règle de `record_loyalty_stamp`
 *    (migration 20261114120000 : « une visite en rapporte 100 ») ;
 *  · le niveau se lit sur `points_earned_total`, jamais sur `points_balance`
 *    (même migration : « dépenser ses points ne fait pas perdre son niveau ») ;
 *  · le parrainage ne porte AUCUN montant ici, parce qu'il n'en a pas de fixe :
 *    `referral_sponsor_points` / `referral_filleul_points` sont réglés par
 *    programme (20261119120000) et peuvent valoir zéro. Le bloc « Parrainer un
 *    ami » affiche les vrais chiffres, lus du serveur ; on y renvoie.
 */
function etapes({
  organizationName,
  validationMode,
  referralEnabled,
}: {
  organizationName: string;
  validationMode: LoyaltyValidationMode;
  referralEnabled: boolean;
}): Etape[] {
  return [
    {
      titre: "Votre carte de fidélité",
      corps: `Chaque visite chez ${organizationName} vous rapporte 100 points. Vous les dépensez ensuite contre les cadeaux du programme, dans « Échanger mes points ».`,
    },
    // UN SEUL MODE EXPLIQUÉ, JAMAIS LES DEUX. Un programme est en `staff` ou
    // en `rotating_code` ; décrire au client un geste qu'il ne verra jamais à
    // l'écran, c'est lui faire chercher un bouton qui n'existe pas.
    validationMode === "rotating_code"
      ? {
          titre: "Comment gagner des points",
          corps:
            "Demandez le code affiché au comptoir, puis saisissez-le dans « Valider ma visite ». Vos 100 points s'ajoutent aussitôt.",
        }
      : {
          titre: "Comment gagner des points",
          corps:
            "Ouvrez cette page au comptoir et montrez le QR de « Ma carte à présenter ». On le scanne, et vos 100 points s'ajoutent aussitôt.",
        },
    {
      titre: "Deux compteurs, un seul redescend",
      corps:
        "« Mes points » est votre porte-monnaie : il monte de 100 à chaque visite, et redescend quand vous prenez un cadeau. Votre niveau, lui, se compte sur tout ce que vous avez gagné depuis le début. Échanger un cadeau ne vous fera donc jamais perdre votre niveau.",
    },
    {
      titre: "Pour aller plus loin",
      corps: referralEnabled
        ? "Si votre téléphone le propose en bas de page, ajoutez cette carte à votre écran d'accueil : elle s'ouvrira comme une application. Et « Parrainer un ami » vous donne un lien à partager — les points arrivent quand votre ami fait valider sa première visite."
        : "Si votre téléphone le propose en bas de page, ajoutez cette carte à votre écran d'accueil : elle s'ouvrira comme une application, sans avoir à retrouver le lien.",
    },
  ];
}

export function VisiteGuideePasseport({
  programId,
  organizationName,
  validationMode,
  referralEnabled,
}: {
  programId: string;
  organizationName: string;
  validationMode: LoyaltyValidationMode;
  /** Le commerçant a-t-il ouvert le parrainage ? Décide de l'étape 4. */
  referralEnabled: boolean;
}) {
  const { vue, marquerVue } = useVisiteGuideeVue(programId);
  const [ouverte, setOuverte] = useState(false);

  /**
   * LE DÉCLENCHEUR CHANGE D'IDENTITÉ PENDANT L'OUVERTURE — et sans ce qui suit,
   * le focus se perdait dans le vide.
   *
   * Ouvrir marque la visite comme vue : la bande d'invitation cède aussitôt la
   * place au bouton discret. Les deux branches n'ont pas la même forme, React
   * REMONTE donc le bouton, et le nœud que `useModalFocus` avait capturé à
   * l'ouverture est détaché quand il tente de lui rendre le focus — qui repart
   * alors au début du document, exactement le défaut que ce hook existe pour
   * corriger.
   *
   * On garde donc une référence sur le bouton RÉELLEMENT MONTÉ, et on le
   * refocalise dans un effet — après le commit, donc après le nettoyage de la
   * modale, dont la restitution sur le nœud mort est un geste sans effet.
   */
  const declencheurRef = useRef<HTMLButtonElement | null>(null);
  const aRendreLeFocus = useRef(false);

  const ouvrir = useCallback(() => {
    // Ouvrir VAUT avoir lu : l'invitation a fait son travail, elle ne revient
    // pas au prochain passage même si le client referme à l'étape 1.
    marquerVue();
    setOuverte(true);
  }, [marquerVue]);

  const fermer = useCallback(() => {
    aRendreLeFocus.current = true;
    setOuverte(false);
  }, []);

  useEffect(() => {
    if (ouverte || !aRendreLeFocus.current) return;
    aRendreLeFocus.current = false;
    declencheurRef.current?.focus();
  }, [ouverte]);

  const liste = etapes({ organizationName, validationMode, referralEnabled });

  return (
    <div className="mb-4">
      {vue ? (
        // DÉJÀ VUE — et c'est aussi ce que rend le SERVEUR, toujours : le
        // point d'entrée existe dans le HTML, avant tout JavaScript.
        <div className="flex justify-end">
          <BoutonVisite ref={declencheurRef} onClick={ouvrir} discret />
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-k-ink bg-k-yellow/40 px-4 py-3">
          <p className="text-sm font-bold leading-snug text-k-ink">
            Première fois ici ? Voici votre carte de fidélité en trente
            secondes.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <BoutonVisite ref={declencheurRef} onClick={ouvrir} />
            <button
              type="button"
              onClick={marquerVue}
              className="rounded-full border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-black text-k-ink hover:bg-k-yellow/40 focus:outline-none focus:ring-2 focus:ring-k-ink focus:ring-offset-1"
            >
              Plus tard
            </button>
          </div>
        </div>
      )}

      {ouverte && (
        <FenetreVisite etapes={liste} onClose={fermer} />
      )}
    </div>
  );
}

function BoutonVisite({
  onClick,
  discret = false,
  ref,
}: {
  onClick: () => void;
  discret?: boolean;
  /** React 19 : la ref est une prop ordinaire, aucun forwardRef requis. */
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      // `dialog` et non `menu` : c'est bien une boîte de dialogue qui s'ouvre.
      aria-haspopup="dialog"
      className={
        discret
          ? "rounded-full border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-black text-k-ink hover:bg-k-yellow/40 focus:outline-none focus:ring-2 focus:ring-k-ink focus:ring-offset-1"
          : "rounded-full border-2 border-k-ink bg-k-yellow px-4 py-1.5 text-xs font-black uppercase tracking-wide text-k-ink shadow-[2px_2px_0_var(--color-k-ink)] hover:bg-k-orange focus:outline-none focus:ring-2 focus:ring-k-ink focus:ring-offset-1"
      }
    >
      Comment ça marche ?
    </button>
  );
}

/**
 * LA FENÊTRE — enchaînable, une idée par écran.
 *
 * Le clavier y trouve les trois gestes dus par une boîte de dialogue :
 * `useModalFocus` pose le focus initial sur le CONTENEUR (qui porte
 * `role="dialog"` et son nom, annoncé en entier), piège Tab tant qu'elle est
 * ouverte, et rend le focus AU DÉCLENCHEUR à la fermeture. Échap ferme.
 *
 * ── POURQUOI LE CORPS EST UNE RÉGION `aria-live` ──
 *
 * La fenêtre ne se démonte pas entre deux étapes : « Suivant » remplace son
 * contenu, le focus restant sur le bouton. Sans région vivante, un lecteur
 * d'écran annoncerait le clic et rien d'autre — l'utilisateur entendrait
 * « Suivant, bouton » quatre fois sans jamais entendre l'explication.
 */
function FenetreVisite({
  etapes: liste,
  onClose,
}: {
  etapes: Etape[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogue = useModalFocus<HTMLDivElement>(closeRef);
  const titreId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const etape = liste[index];
  const dernier = index === liste.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-k-ink/50 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogue}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titreId}
        className="k-border w-full max-w-md rounded-2xl bg-white p-5 shadow-[8px_8px_0_var(--color-k-ink)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          {/* Le repère d'avancement. Encre sur crème, jamais du jaune en
              texte : #fcca59 sur blanc plafonne à 1,7:1. */}
          <p className="text-[11px] font-black uppercase tracking-wide text-k-body">
            Étape {index + 1} sur {liste.length}
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-full border-2 border-k-ink bg-white px-2.5 py-0.5 text-sm font-black text-k-ink hover:bg-k-yellow/40 focus:outline-none focus:ring-2 focus:ring-k-ink focus:ring-offset-1"
          >
            {/* Décoratif : le nom accessible du bouton est « Fermer ». */}
            <span aria-hidden>✕</span>
          </button>
        </div>

        <div aria-live="polite">
          <h2
            id={titreId}
            className="text-lg font-black leading-tight text-k-ink"
          >
            {etape.titre}
          </h2>
          <p className="mt-2 text-sm font-medium leading-relaxed text-k-body">
            {etape.corps}
          </p>
        </div>

        <div className="mt-5 flex items-center gap-2">
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex((i) => i - 1)}
              className="rounded-2xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-black text-k-ink hover:bg-k-yellow/40 focus:outline-none focus:ring-2 focus:ring-k-ink focus:ring-offset-1"
            >
              Précédent
            </button>
          )}
          <button
            type="button"
            onClick={() => (dernier ? onClose() : setIndex((i) => i + 1))}
            className="k-btn flex-1 rounded-2xl border-2 border-k-ink bg-k-yellow px-5 py-2.5 text-sm font-black uppercase tracking-wider text-k-ink hover:bg-k-orange focus:outline-none focus:ring-2 focus:ring-k-ink focus:ring-offset-1"
          >
            {dernier ? "J'ai compris" : "Suivant"}
          </button>
        </div>
      </div>
    </div>
  );
}
