import type { ReactElement, ReactNode } from "react";
import { PlayerPageShell } from "@/components/ui/player-page-shell";
import { LAVIS_SAISON } from "@/components/ui/theme-lavis";

/**
 * Cadre commun des deux écrans du socle des salons.
 *
 * ── En-tête NEUTRE, et c'est une contrainte de produit ──
 *
 * Ces pages s'ouvrent depuis la vitrine (L17/L18) : le joueur y arrive sans
 * savoir qu'un espace commerçant existe, et souvent sans avoir choisi le
 * commerce lui-même. Aucun chrome de dashboard, aucun nom d'organisation,
 * aucun thème saisonnier — le salon n'appartient à aucun module, il précède
 * le jeu qu'on y jouera.
 *
 * Le lavis `neutre` est repris tel quel de `LAVIS_SAISON`, la table de couleurs
 * déjà mesurée en contraste (`theme-lavis.test.ts`). Aucune teinte inédite
 * n'est introduite ici : elle exigerait un relevé qui n'existerait pas.
 */
export function LobbyShell({
  titre,
  chapeau,
  children,
}: {
  titre: string;
  chapeau?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <PlayerPageShell
      pageStyle={{
        backgroundColor: LAVIS_SAISON.neutre,
        backgroundImage:
          "repeating-linear-gradient(135deg,#f3ead3 0 14px,#fdf6e3 14px 28px)",
      }}
    >
      {/* max-w-md : ces écrans se lisent d'abord sur le téléphone posé sur la
          table du café — la version large n'est qu'un centrage. */}
      <div className="mx-auto w-full max-w-md px-5 py-10 sm:py-14">
        <header className="mb-6 text-center">
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
