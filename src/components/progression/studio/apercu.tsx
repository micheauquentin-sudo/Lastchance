"use client";

import { CadreApercu } from "@/components/studio/cadre-apercu";
import { ProgressionPanel } from "@/components/wheel/progression-panel";
import type {
  OrgProgressionSeason,
  PlayerProgressionSnapshot,
} from "@/lib/meta-progression";

/**
 * L'APERÇU DU STUDIO DE LA MÉTA-PROGRESSION (VIT-50).
 *
 * ── C'EST LE COMPOSANT JOUEUR, PAS UNE MAQUETTE ──
 *
 * `ProgressionPanel` est la surface que le joueur voit après une partie. Le
 * studio la monte telle quelle, drapeau `apercu` levé : les trois actions
 * serveur qu'elle importe sont coupées, rien d'autre ne change. Une seconde
 * implémentation aurait fini par ne plus être d'accord avec la première, et
 * c'est le seul défaut qu'un aperçu ne doit jamais avoir parce qu'il est
 * INVISIBLE — rien ne casse, tout a l'air de fonctionner, et l'écart ne se
 * découvre qu'en ouvrant la vraie page (ADR-152).
 *
 * ── L'APERÇU EST PARTIEL, ET C'EST DIT ──
 *
 * Deux choses manquent, et aucune n'est réparable sans mentir :
 *
 *  1. **Les saisons ARCHIVÉES.** Le panneau les sert par
 *     `getPlayerProgressionArchive`, sous le cookie `lc-player` — qui, dans un
 *     studio, est celui du COMMERÇANT. Les afficher montrerait ses saisons
 *     closes à lui, présentées comme celles d'un client.
 *  2. **Le parcours autour.** Le panneau se greffe après une partie ; le studio
 *     ne rejoue pas la partie qui le précède.
 *
 * Un aperçu incomplet et DIT vaut mieux qu'un aperçu complet et faux — la
 * légende du cadre le porte.
 *
 * ── ET AUCUN CHIFFRE DE PROGRESSION N'EST INVENTÉ ──
 *
 * Zéro clé, zéro jauge remplie, aucun badge décroché, aucune pièce possédée.
 * C'est l'écran du PREMIER joueur, le jour de l'ouverture. Peupler l'aperçu
 * d'un joueur fictif à « 3 missions sur 5 » aurait fait régler des paliers et
 * des coûts en clés sur quelqu'un qui n'existe pas — le passeport de fidélité a
 * refusé exactement cela (ADR-159), et pour la même raison : la seule question
 * que le commerçant se pose devant cet écran est « qu'est-ce qu'on y voit en
 * arrivant ».
 */

/**
 * L'état de DÉPART du panneau joueur, dérivé de la configuration de la saison.
 *
 * ── LE FILTRE SUR `enabled` N'EST PAS COSMÉTIQUE ──
 *
 * `player_progression_snapshot` ne sert QUE les missions et les coffres actifs :
 * un coffre arrêté quitte l'écran du joueur et `open_progression_chest` le
 * refuse. Un aperçu qui les montrerait ferait croire qu'un interrupteur coupé
 * n'a rien coupé — c'est-à-dire le contraire de ce que le geste vient de faire.
 *
 * Les badges et les collections ne portent pas d'interrupteur : ils sont servis
 * en entier, éteints (`earned: false`, `owned: false`), parce que le joueur les
 * voit comme un album à remplir avant d'avoir rien rempli.
 */
export function etatApercuProgression(
  season: OrgProgressionSeason,
  organization: { id: string; name: string },
): PlayerProgressionSnapshot {
  return {
    state: "ok",
    organization: { id: organization.id, name: organization.name },
    season: {
      id: season.id,
      name: season.name,
      startsAt: season.startsAt,
      endsAt: season.endsAt,
    },
    // Le jour de l'ouverture, personne n'a rien gagné ni rien dépensé.
    keys: 0,
    keysEarned: 0,
    keysSpent: 0,
    missions: season.missions
      .filter((mission) => mission.enabled)
      .map((mission) => ({
        id: mission.id,
        name: mission.name,
        description: mission.description,
        target: mission.rule.target,
        current: 0,
        completedAt: null,
        keyReward: mission.keyReward,
      })),
    badges: season.badges.map((badge) => ({
      id: badge.id,
      name: badge.name,
      description: badge.description,
      iconKey: badge.iconKey,
      earned: false,
      awardedAt: null,
    })),
    collections: season.collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      description: collection.description,
      items: collection.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        owned: false,
        awardedAt: null,
      })),
    })),
    chests: season.chests
      .filter((chest) => chest.enabled)
      .map((chest) => ({
        id: chest.id,
        name: chest.name,
        description: chest.description,
        keyCost: chest.keyCost,
        // « Objets que ce joueur ne possède PAS encore » : au départ, tous.
        availableItems: chest.itemIds.length,
      })),
  };
}

export function ApercuProgression({
  season,
  organization,
}: {
  season: OrgProgressionSeason;
  organization: { id: string; name: string };
}) {
  const etat = etatApercuProgression(season, organization);
  const vide = !etat.missions.length && !etat.chests.length;

  return (
    <CadreApercu
      /* LA LÉGENDE DIT CE QUI SE PASSE VRAIMENT (ADR-153). Ce studio
         n'enregistre PAS tout seul — chaque badge, chaque mission, chaque
         coffre a son propre bouton. Reprendre la légende par défaut
         (« Vos modifications s'enregistrent toutes seules ») aurait été un
         écran qui raconte le contraire de ce qu'il fait. */
      legende="Aperçu — ce que verra un joueur qui arrive le premier jour. Chaque badge, mission et coffre s'enregistre avec son bouton."
      banniere={
        vide ? (
          <p
            role="note"
            className="w-full max-w-[480px] rounded-xl border-2 border-dashed border-k-orange bg-k-yellow/40 px-3 py-2 text-xs font-bold text-k-ink"
          >
            Aucune mission ni coffre actif : vos joueurs ne verraient rien
            encore. Le panneau n&apos;apparaît chez eux qu&apos;à partir de la
            première mission.
          </p>
        ) : null
      }
    >
      <div className="bg-k-bg p-4">
        <ProgressionPanel
          organizationId={organization.id}
          kermesse={false}
          apercu
          etatApercu={etat}
        />
      </div>
    </CadreApercu>
  );
}
