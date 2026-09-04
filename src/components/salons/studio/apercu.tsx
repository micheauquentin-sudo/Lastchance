"use client";

import { CadreApercu } from "@/components/studio/cadre-apercu";
import { LobbyCarton, LobbyShell } from "@/components/lobby/lobby-shell";
import { packBande } from "@/lib/bande-packs";
import type { DuoOptionView } from "@/lib/duo";
import type { LobbyKind } from "@/lib/lobby";
import type { EtatSalon } from "@/components/salons/studio/etat";

/**
 * L'APERÇU DU STUDIO DES SALONS — LA SALLE, ET PAS LA PARTIE (VIT-48).
 *
 * ── CE QUI EST MONTRÉ EST LA VRAIE PAGE, TRAIT POUR TRAIT ──
 *
 * `LobbyShell` et `LobbyCarton` sont les composants MÊMES que sert
 * `/lobby/[code]` à un membre, avec le même titre et le même chapeau, et
 * l'habillage qui leur est passé est l'état que le commerçant est en train de
 * régler. La palette, le fond, le logo et l'enseigne se rendent donc ici par le
 * code qui les rendra chez le client — pas par une maquette qu'il aurait fallu
 * tenir d'accord avec lui (ADR-152).
 *
 * C'est aussi ce qui rend l'étape « L'habillage » vérifiable : le lavis, le
 * voile crème sous le fond et l'encre du nom sont mesurés en contraste
 * (`theme-lavis.test.ts`) sur ces composants-là.
 *
 * ── ET LE PLATEAU DE JEU N'EST PAS MONTRÉ. DÉLIBÉRÉMENT ──
 *
 * `DuoExperience` et `BandeExperience` ne sont pas rendables ici, et le drapeau
 * `apercu` du modèle `calendar-tracker` n'y change rien. La raison n'est pas
 * qu'ils appellent des actions — celles-là se coupent — c'est qu'ils exigent un
 * `lobbyId`, c'est-à-dire une SALLE OUVERTE EN BASE :
 *
 *  - au montage, un `useEffect` appelle `startDuo(lobbyId)` / `startBande(lobbyId)`,
 *    puis `getDuoState` / `getBandeState`, puis scrute toutes les 3 s ;
 *  - tant que cette ouverture n'a pas répondu, l'écran reste sur `« attente »`.
 *
 * Couper les trois portes de lecture (l'ouverture, le scrutin, et le
 * récapitulatif que la Bande charge à part) laisse donc un écran d'attente
 * PERPÉTUEL. Et il n'y a aucun `lobbyId` à donner : un studio règle un jeu
 * AVANT qu'une salle existe. Le montrer quand même aurait produit exactement ce
 * qu'ADR-154 refuse — « un faux aperçu est le seul défaut de cette famille qui
 * ne se voit pas ». L'aperçu s'arrête donc où sa fidélité s'arrête, et la
 * bannière le DIT plutôt que de le laisser deviner.
 *
 * Ce qui tient sa place est un rappel de ce qui est réglé — nombre de
 * questions, nom du pack — annoncé comme tel, jamais mis en scène comme une
 * partie en cours.
 */
export function ApercuSalon({
  jeu,
  etat,
  nomOrganisation,
  logoUrl,
  options,
  pack,
}: {
  jeu: LobbyKind;
  etat: EtatSalon;
  nomOrganisation: string;
  logoUrl: string | null;
  /** Les places du plateau du Duo — vide sur la Bande. */
  options: DuoOptionView[];
  /** La clé du pack de la Bande — ignorée sur le Duo. */
  pack: string;
}) {
  const packChoisi = packBande(pack);

  return (
    <CadreApercu
      /* 448 px, ET CE N'EST PAS UN CHOIX D'ESTHÉTIQUE : c'est `max-w-md`, la
         borne que `LobbyShell` pose sur son propre conteneur. Un cadre plus
         large rendrait une mise en page que personne ne verra. La valeur reste
         LITTÉRALE — Tailwind ne compile pas une classe construite à
         l'exécution. */
      classeCadre="w-full max-w-[448px]"
      legende="Aperçu — la salle que verront vos clients. Vos modifications s'enregistrent toutes seules."
      banniere={
        <div className="w-full max-w-[448px] shrink-0">
          {/* LA BANNIÈRE DIT OÙ S'ARRÊTE LA FIDÉLITÉ. Sans elle, un commerçant
              qui ne voit pas son plateau croirait à un réglage manquant plutôt
              qu'à un aperçu qui se tait — et c'est le genre d'écart qu'on ne
              découvre qu'en ouvrant la vraie page. */}
          <p
            role="status"
            className="rounded-xl border-2 border-dashed border-k-ink/40 bg-k-yellow/40 px-3 py-2 text-xs font-black text-k-ink"
          >
            Les couleurs, le décor et votre enseigne sont ceux que verront vos
            clients en entrant. La partie, elle, ne se joue pas ici : elle
            demande une salle ouverte par un vrai scan.
          </p>
        </div>
      }
    >
      {/* LA COQUILLE DE `/lobby/[code]`, reproduite trait pour trait : le même
          `LobbyShell`, le même titre, le même chapeau, le même carton — et
          l'habillage en cours de réglage à la place de celui de la base. */}
      <LobbyShell
        titre="Le salon"
        chapeau="Retrouvez-vous ici avant de jouer, à la même table ou non."
        habillage={{
          theme: etat.theme,
          // TROIS ÉTATS : `""` (suivre le thème) doit redevenir `null`, que
          // `fondChoisi` distingue de `"aucun"`. Un `||` les aurait confondus.
          fondKey: etat.fond_key === "" ? null : etat.fond_key,
          // L'enseigne se TAIT quand elle est décochée : c'est ce que la base
          // renvoie alors, et donc ce que le client verra.
          nom: etat.affiche_identite ? nomOrganisation : null,
          logoUrl: etat.affiche_identite ? logoUrl : null,
        }}
      >
        <LobbyCarton>
          <p className="text-center text-sm font-black text-k-ink">
            {jeu === "duo" ? "Duo Miroir" : "Portrait de la Bande"}
          </p>
          <p className="mt-2 text-center text-sm text-k-body">
            {jeu === "duo"
              ? options.length > 0
                ? `${options.length} proposition${options.length > 1 ? "s" : ""} à départager.`
                : "Aucune proposition pour l'instant : la partie ne peut pas démarrer."
              : packChoisi
                ? `Pack « ${packChoisi.nom} » — ${packChoisi.questions.length} questions.`
                : "Aucun pack choisi."}
          </p>
        </LobbyCarton>
      </LobbyShell>
    </CadreApercu>
  );
}
