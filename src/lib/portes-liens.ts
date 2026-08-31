import {
  cheminActiviteReserver,
  cheminFileReserver,
  cheminOffreStock,
} from "@/lib/reserver";
import type { PortesVitrineView } from "@/lib/vitrine";

/**
 * LES PORTES, À PLAT — une liste de liens prête à peindre.
 *
 * ── POURQUOI CE FICHIER EXISTE ──
 *
 * `PortesVitrineView` (`src/lib/vitrine.ts`) est DÉJÀ la liste des animations
 * ouvertes d'un commerce : six familles, servies par `vitrine_public_state`.
 * Elle avait un seul consommateur, `src/components/vitrine/portes.tsx`, qui la
 * rendait avec le thème de la Vitrine — variables CSS `--vitrine-*` qui
 * n'existent nulle part ailleurs.
 *
 * Le passeport de fidélité doit montrer la MÊME liste, dans la DA « Kermesse ».
 * Deux choix étaient possibles : dupliquer la lecture (deux listes des mêmes
 * portes, qui divergent au premier module ajouté), ou extraire ce que les deux
 * écrans partagent réellement — la traduction d'une porte en `(href, nom)`. Ce
 * fichier est ce second choix : les FORMES et les ADRESSES sont ici, la MISE EN
 * PAGE reste à chaque écran.
 *
 * ── LES ADRESSES NE SONT PAS ÉCRITES À LA MAIN ──
 *
 * Les trois portes de Réserver passent par `cheminActiviteReserver`,
 * `cheminFileReserver` et `cheminOffreStock` : ces aides existaient déjà et
 * portent leur propre doctrine (ADR-109 : un QR public est une adresse, jamais
 * une preuve de présence). Les trois expériences n'ont pas d'équivalent — leur
 * forme `/{module}/{slug}` est déclarée ici, une fois.
 */
export interface PorteLien {
  /** Clé de rendu, stable et unique toutes familles confondues. */
  cle: string;
  href: string;
  nom: string;
  famille: "reserver" | "experience";
}

/**
 * À plat, dans l'ordre d'affichage : d'abord ce qu'on réserve, ensuite ce
 * qu'on joue. Une liste VIDE quand rien n'est ouvert — c'est l'écran qui
 * décide de ne pas peindre un bloc vide, jamais cette fonction.
 *
 * LE DUO MIROIR ET LE PORTRAIT DE LA BANDE N'Y SONT PAS. Leur adresse est
 * `/lobby/nouveau/{slug}` : elle a besoin du slug de la VITRINE, que les portes
 * ne portent pas. `src/components/vitrine/portes.tsx` le reçoit en propriété
 * séparée ; le faire entrer ici obligerait tout appelant à en fournir un, y
 * compris ceux qui n'en ont pas.
 */
export function liensDesPortes(portes: PortesVitrineView): PorteLien[] {
  const liens: PorteLien[] = [];

  for (const activite of portes.reserver.activites) {
    liens.push({
      cle: `activite:${activite.id}`,
      href: cheminActiviteReserver(activite.id),
      nom: activite.nom,
      famille: "reserver",
    });
  }
  for (const file of portes.reserver.files) {
    liens.push({
      cle: `file:${file.id}`,
      href: cheminFileReserver(file.id),
      nom: file.nom,
      famille: "reserver",
    });
  }
  for (const offre of portes.reserver.offres) {
    liens.push({
      cle: `offre:${offre.id}`,
      href: cheminOffreStock(offre.id),
      nom: offre.nom,
      famille: "reserver",
    });
  }

  for (const quiz of portes.experiences.quiz) {
    liens.push({
      cle: `quiz:${quiz.slug}`,
      href: `/quiz/${quiz.slug}`,
      nom: quiz.titre,
      famille: "experience",
    });
  }
  for (const calendrier of portes.experiences.calendars) {
    liens.push({
      cle: `calendar:${calendrier.slug}`,
      href: `/calendar/${calendrier.slug}`,
      nom: calendrier.titre,
      famille: "experience",
    });
  }
  for (const pronostic of portes.experiences.pronostics) {
    liens.push({
      cle: `pronos:${pronostic.slug}`,
      href: `/pronos/${pronostic.slug}`,
      nom: pronostic.titre,
      famille: "experience",
    });
  }

  return liens;
}
