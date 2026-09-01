import type { ReactElement, ReactNode } from "react";
import { PlayerPageShell } from "@/components/ui/player-page-shell";
import { contestThemeTokens } from "@/components/pronos/contest-theme";
import { fondChoisi, fondPourTheme } from "@/lib/fonds-ecran";
import type { LobbyHabillageView } from "@/lib/lobby";

/**
 * Cadre commun des deux écrans du socle des salons.
 *
 * ── LE SALON PORTE LES COULEURS DU COMMERCE, QUAND IL Y EN A (SALON-1) ──
 *
 * Cet en-tête était neutre par CONTRAINTE DE PRODUIT : « aucun nom
 * d'organisation, aucun thème saisonnier », parce qu'un joueur arrive ici
 * depuis la vitrine sans avoir choisi le commerce lui-même. Ce n'était pas une
 * garde, c'était un arbitrage d'apparence — et le propriétaire, qui est
 * l'autorité produit, demande de pouvoir habiller ces deux jeux comme les
 * autres.
 *
 * L'habillage reste un CHOIX, et il n'est jamais imposé : sans réglage,
 * `habillage` vaut `null` et cette coquille repeint exactement le lavis
 * `neutre` rayé d'hier — `contestThemeTokens(null).pageStyle` est mot pour mot
 * ce que ce fichier codait en dur. Un commerce peut aussi prendre ses couleurs
 * SANS se nommer : la base tait alors `nom` et `logo_url`, et rien ici ne les
 * réclame.
 *
 * ── CE QUI RESTE NEUTRE, ET POURQUOI CE N'EST PAS NÉGOCIABLE ──
 *
 * `/lobby/nouveau/[slug]` — la porte d'entrée PUBLIQUE — ne reçoit et ne doit
 * jamais recevoir d'habillage. `create_player_lobby` confond volontairement
 * « organisation inconnue » et « organisation sans le module » sous un seul
 * `unavailable`, pour ne rien apprendre à un appelant public sur ce que le
 * commerce d'en face a acheté. Peindre un nom, un logo ou même une couleur sur
 * une page atteignable PAR LE SLUG rétablirait cet oracle mot pour mot : il
 * suffirait de dérouler l'annuaire des slugs pour savoir, commerce par
 * commerce, lequel a payé quel jeu.
 *
 * L'habillage ne transite donc que par `lobby_state`, qui EXIGE DÉJÀ
 * l'appartenance — c'est-à-dire par la seule branche membre de
 * `/lobby/[code]`. Les deux écrans de refus indistinct de cette page
 * n'appellent pas `lobby_state` : ils n'ont rien à peindre, et ils ne peignent
 * rien. `/ticket/[code]` est dans le même cas et pour la même raison : il est
 * ouvert à qui tient un code, sans aucune appartenance à vérifier.
 *
 * ── LA LISIBILITÉ N'EST PAS LAISSÉE AU GOÛT DU COMMERÇANT ──
 *
 * Le thème est borné aux ONZE clés de `LAVIS_SAISON`, en base (`check`), à
 * l'écriture (zod) et à la lecture (`asSeasonalTheme`). Chacune a son lavis
 * MESURÉ contre `k-ink` et `k-body`, pire pixel du motif compris — 7,0:1 au
 * plus défavorable, pour un seuil AA de 4,5:1 (`theme-lavis.test.ts`). Aucune
 * teinte libre n'entre ici : le commerçant choisit dans un jeu de couleurs déjà
 * relevé, jamais une couleur. Le nom, seul texte à reposer directement sur le
 * lavis, est en `text-k-body` — l'encre de ce relevé. Sous un fond d'écran, le
 * voile crème de `FondEcran` est renforcé exactement sur ce couloir de texte.
 */
export function LobbyShell({
  titre,
  chapeau,
  habillage = null,
  children,
}: {
  titre: string;
  chapeau?: string;
  /**
   * L'habillage du commerce, ou `null`. `null` est le DÉFAUT, et il l'est pour
   * que les pages publiques (l'entrée par le slug, le ticket) restent neutres
   * sans avoir à le déclarer — voir l'en-tête.
   */
  habillage?: LobbyHabillageView | null;
  children: ReactNode;
}): ReactElement {
  // `contestThemeTokens` replie de lui-même sur `neutre` — valeur nulle comme
  // clé hors vocabulaire. Le repli n'est pas réécrit ici, il est hérité.
  const tokens = contestThemeTokens(habillage?.theme ?? null);
  // TROIS ÉTATS, résolus par `fondChoisi` et non par un `??` : `null` veut dire
  // « suivre le thème », `"aucun"` veut dire « aucune image », et les confondre
  // ferait revenir le fond du thème chez celui qui vient de le retirer.
  const fond = fondChoisi(habillage?.fondKey, fondPourTheme(tokens.key));

  return (
    <PlayerPageShell pageStyle={tokens.pageStyle} fond={fond}>
      {/* max-w-md : ces écrans se lisent d'abord sur le téléphone posé sur la
          table du café — la version large n'est qu'un centrage. */}
      <div className="mx-auto w-full max-w-md px-5 py-10 sm:py-14">
        <header className="mb-6 text-center">
          {/* LE LOGO EST DÉCORATIF, `alt=""`. Le nom du commerce le suit en
              texte : lui donner aussi un nom accessible le ferait annoncer
              deux fois. Et une enseigne porte souvent un emoji — un nom
              accessible construit à partir d'elle transporterait le U+FE0F qui
              a déjà cassé des locators ici. */}
          {habillage?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={habillage.logoUrl}
              alt=""
              aria-hidden
              width={56}
              height={56}
              className="mx-auto mb-3 h-14 w-14 rounded-full border-2 border-k-ink bg-white object-cover"
            />
          ) : null}
          {habillage?.nom ? (
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-k-body">
              {habillage.nom}
            </p>
          ) : null}
          <h1 className="text-2xl font-black text-k-ink sm:text-3xl">{titre}</h1>
          {chapeau && (
            <p className="mt-2 text-sm text-k-body">{chapeau}</p>
          )}
        </header>
        {children}
      </div>
    </PlayerPageShell>
  );
}

/** Carton blanc « Kermesse » : la seule boîte de contenu de ces écrans. */
export function LobbyCarton({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div
      className={`k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)] ${className}`}
    >
      {children}
    </div>
  );
}
