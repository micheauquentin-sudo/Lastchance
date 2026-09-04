"use client";

import { useMemo, useRef, useState } from "react";

import { setHabillageSalons } from "@/actions/salon-habillage";
import { useActionForm } from "@/lib/use-action-form";
import { CoquilleStudio } from "@/components/studio/coquille";
import { useEnregistrementDepuisEtat } from "@/components/studio/use-enregistrement-etat";
import { BandeEditeur } from "@/components/vitrine/bande-editeur";
import {
  aplatirFiches,
  placesInitiales,
} from "@/components/vitrine/duo-editeur";
import type { DuoOptionsAdminView } from "@/lib/duo";
import type { LobbyKind } from "@/lib/lobby";
import type { VitrineCarteView } from "@/lib/vitrine";
import type { SeasonalTheme } from "@/types/database";
import { ApercuSalon } from "@/components/salons/studio/apercu";
import { ChampsCachesSalon } from "@/components/salons/studio/champs-caches";
import {
  etatInitialSalon,
  type EtatSalon,
} from "@/components/salons/studio/etat";
import {
  etapesStudioSalon,
  parseEtapeStudioSalon,
  type EtapeStudioSalon,
} from "@/components/salons/studio/etapes";
import {
  EtapeHabillage,
  EtapeQr,
  EtapeQuestionsDuo,
  EtapeSuggestionDuo,
} from "@/components/salons/studio/pages";

/**
 * LE STUDIO DES SALONS (VIT-48) — UN ÉCRAN, DEUX JEUX.
 *
 * ── CE QU'IL TIENT, ET RIEN D'AUTRE ──
 *
 * Trois choses : l'état de l'habillage, la charge utile du formulaire, et
 * l'étape affichée. La coquille, le fil d'étapes, le bandeau et
 * l'enregistrement automatique viennent du socle (`@/components/studio/`) ;
 * chaque étape vit dans `studio/pages.tsx`, l'aperçu dans `studio/apercu.tsx`,
 * et le FIL est dérivé du jeu par `etapesStudioSalon` — jamais écrit ici.
 *
 * ── DEUX CANAUX D'ÉCRITURE, UN SEUL ÉTAT (ADR-156) ──
 *
 * L'HABILLAGE part par le formulaire de la coquille, depuis `EtatSalon`, avec
 * l'enregistrement automatique. LE CONTENU — le plateau du Duo, sa suggestion,
 * le pack de la Bande — part par les formulaires que les éditeurs portent
 * déjà, chacun avec son bouton et son action, parce qu'ils écrivent d'autres
 * tables par d'autres RPC. Leurs `<form>` sont valides parce que celui de la
 * coquille est leur VOISIN, jamais leur ancêtre (VIT-16).
 *
 * Ce qui n'est PAS fait, et c'est le piège de ce module : recopier le contenu
 * dans `EtatSalon`. Il y aurait alors deux écrivains sur les mêmes colonnes, et
 * l'enregistrement automatique reposterait le plateau à chaque frappe.
 *
 * ── LE PIÈGE D'ÉCRASEMENT EXISTE, ET IL EST SUR L'HABILLAGE ──
 *
 * `setHabillageSalons` lit `theme`, `fond_key` et `affiche_identite` d'un seul
 * `FormData` et `set_lobby_habillage` réécrit la ligne en bloc. Sur « Vos
 * questions » ou « Le QR de vos tables », aucun contrôle d'habillage n'est
 * monté : si les champs vivaient dans l'étape, l'enregistrement suivant les
 * effacerait. `ChampsCachesSalon` les rend donc EN ENTIER à chaque rendu,
 * quelle que soit l'étape — c'est le contrat du socle, et ici il n'est pas
 * théorique.
 *
 * ── ET IL CHANGE L'AUTRE JEU (SALON-1) ──
 *
 * `lobby_settings` porte UNE ligne par organisation, pas une par jeu : régler
 * l'habillage depuis le studio du Duo habille AUSSI Portrait de la Bande. Le
 * studio le dit là où la main est posée — titre de l'étape, chapeau du bloc, et
 * mention sous chaque groupe de contrôles (voir `pages.tsx`) — et jamais dans
 * une note de bas de page. Un réglage qui change un autre jeu sans le dire est
 * la panne que cet écran existe pour ne pas rejouer.
 */
const ID_FORMULAIRE = "studio-salon-habillage";

export function SalonStudio({
  jeu,
  libelleJeu,
  theme,
  fondKey,
  afficheIdentite,
  nomOrganisation,
  organizationId,
  logoUrl,
  url,
  vitrinePubliee,
  plateau,
  cartes,
  pack,
  peutEditer,
}: {
  jeu: LobbyKind;
  /** Le nom du jeu, pris au catalogue — jamais réécrit ici. */
  libelleJeu: string;
  theme: SeasonalTheme;
  /** Trois états : `null` (suivre le thème), `"aucun"`, ou une clé. */
  fondKey: string | null;
  afficheIdentite: boolean;
  nomOrganisation: string;
  organizationId: string;
  logoUrl: string | null;
  /** L'adresse publique, RÉSOLUE par la page — voir `EtapeQr`. */
  url: string;
  vitrinePubliee: boolean;
  /** Le plateau du Duo. Vide sur la Bande, qui n'en a pas. */
  plateau: DuoOptionsAdminView;
  /** Les fiches proposables. Vide sans Vitrine, ce que l'écran sait rendre. */
  cartes: VitrineCarteView[];
  /** La clé du pack de la Bande. Jamais `null` — le défaut est `amis`. */
  pack: string;
  peutEditer: boolean;
}) {
  const etapes = etapesStudioSalon(jeu);
  const [etape, setEtape] = useState<EtapeStudioSalon>(() =>
    parseEtapeStudioSalon(jeu, null),
  );
  const [etat, setEtat] = useState<EtatSalon>(() =>
    etatInitialSalon({ theme, fondKey, afficheIdentite }),
  );

  const formulaire = useRef<HTMLFormElement | null>(null);

  const { state, pending, onSubmit } = useActionForm(setHabillageSalons, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  /**
   * L'ENREGISTREMENT AUTOMATIQUE VIENT DU SOCLE (VIT-38), avec ses deux gardes
   * — rien au montage, rien sans le droit d'écrire. Aucune troisième ici : ce
   * studio n'a aucun geste destructif à confirmer, contrairement au calendrier
   * dont la réduction de grille supprime des cases.
   */
  useEnregistrementDepuisEtat({ valeur: etat, formulaire, actif: peutEditer });

  const majEtat = (patch: Partial<EtatSalon>) =>
    setEtat((e) => ({ ...e, ...patch }));

  // Les fiches se recalculent à chaque rendu de l'état sinon, et
  // `FormulairePlateau` prend `initiales` comme point de départ d'un état
  // interne : une nouvelle référence à chaque frappe d'habillage n'y change
  // rien, mais le tableau, lui, se reconstruit pour rien.
  const fiches = useMemo(() => aplatirFiches(cartes), [cartes]);
  const initiales = useMemo(() => placesInitiales(plateau), [plateau]);

  return (
    <CoquilleStudio
      titre={`Mon studio — ${libelleJeu}`}
      hrefRetour={`/dashboard/salons/${jeu}`}
      idFormulaire={ID_FORMULAIRE}
      formulaire={formulaire}
      onSubmit={onSubmit}
      champsCaches={<ChampsCachesSalon charge={{ jeu, etat }} />}
      etapes={etapes}
      etape={etape}
      onEtape={setEtape}
      peutEditer={peutEditer}
      enregistrement={{
        enCours: pending,
        // `{ ok: true }` porte deux issues : `enregistre` et `refuse`. Seule la
        // première est un enregistrement — annoncer « Modifications
        // enregistrées » sur un refus de palette serait un écran qui dit le
        // contraire de ce qu'il fait (ADR-153).
        reussi: state?.ok === true && state.data.etat === "enregistre",
        erreur:
          state && !state.ok
            ? state.error
            : state?.ok && state.data.etat === "refuse"
              ? "Cet habillage n’est pas disponible pour l’instant. Choisissez-en un autre, et signalez-le nous."
              : undefined,
      }}
      apercu={
        <ApercuSalon
          jeu={jeu}
          etat={etat}
          nomOrganisation={nomOrganisation}
          logoUrl={logoUrl}
          options={plateau.options}
          pack={pack}
        />
      }
    >
      {/* LE CONTENU, ET IL DIFFÈRE PAR JEU. La clé d'étape est la même
          (`contenu`) parce que les deux jeux ont bien un contenu à régler ;
          c'est ce qu'on y montre qui change, et le TITRE de l'étape le dit
          (`etapes.ts`). */}
      {etape === "contenu" && jeu === "duo" ? (
        <EtapeQuestionsDuo
          fiches={fiches}
          initiales={initiales}
          peutEditer={peutEditer}
        />
      ) : null}
      {etape === "contenu" && jeu === "bande" ? (
        // L'ÉDITEUR DE L'ATELIER, TEL QUEL : `setBandePack` écrit UNE colonne
        // depuis un seul choix, donc immunisé au piège de l'écrasement en bloc,
        // et il porte déjà son titre et sa consigne. Un second sélecteur propre
        // au studio aurait été une deuxième vérité sur la liste des packs.
        <BandeEditeur pack={pack} peutEditer={peutEditer} />
      ) : null}

      {/* PROPRE AU DUO. Cette branche est INATTEIGNABLE sur la Bande, dont le
          fil ne porte pas la clé — et le fil est la seule porte. */}
      {etape === "suggestion" ? (
        <EtapeSuggestionDuo
          fiches={fiches}
          suggestion={plateau.suggestion?.item_id ?? ""}
          peutEditer={peutEditer}
        />
      ) : null}

      {etape === "habillage" ? (
        <EtapeHabillage
          etat={etat}
          onEtat={majEtat}
          nomOrganisation={nomOrganisation}
          logoUrl={logoUrl}
          peutEditer={peutEditer}
        />
      ) : null}

      {etape === "qr" ? (
        <EtapeQr
          jeu={jeu}
          url={url}
          libelle={libelleJeu}
          organizationId={organizationId}
          vitrinePubliee={vitrinePubliee}
        />
      ) : null}
    </CoquilleStudio>
  );
}
