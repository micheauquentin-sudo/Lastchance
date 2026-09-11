import Link from "next/link";
import { Tilt3D } from "@/components/ui/tilt-3d";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

export function VitrineSpotlight() {
  return (
    <div className="k-card relative rounded-3xl p-6 sm:p-10 shadow-lg">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        {/* Colonne gauche : Argumentaire & Avantages */}
        <div>
          <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-k-muted">
            <span className="h-2 w-2 rounded-full bg-k-orange" />
            Module Pilier · Sur Place
          </span>
          <h3 className="mt-2 text-3xl font-black text-k-ink sm:text-4xl leading-tight" style={DISPLAY}>
            La Vitrine au QR Code : votre carte vivante, sans commission
          </h3>
          <p className="mt-3 text-sm sm:text-base font-bold text-k-body leading-relaxed">
            Ne laissez plus vos clients chercher votre carte sur un PDF illisible ou passer par des intermédiaires qui prélèvent 15 à 30% de commission. Avec la Vitrine Lastchance, vos clients scannent, lisent votre carte à jour, réservent et jouent sur leur téléphone.
          </p>

          <div className="mt-6 space-y-3.5">
            <div className="flex items-start gap-3">
              <span className="k-border-thin flex h-7 w-7 flex-none items-center justify-center rounded-full bg-k-yellow text-sm font-black text-k-ink">
                ✓
              </span>
              <div>
                <p className="text-sm font-black text-k-ink">Bilingue français & anglais automatique</p>
                <p className="text-xs font-bold text-k-muted">
                  Idéal pour accueillir la clientèle touristique sans réimprimer vos menus à chaque saison.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="k-border-thin flex h-7 w-7 flex-none items-center justify-center rounded-full bg-k-green text-sm font-black text-k-bg">
                ✓
              </span>
              <div>
                <p className="text-sm font-black text-k-ink">Réservation directe sans intermédiaire</p>
                <p className="text-xs font-bold text-k-muted">
                  Vos clients réservent leur table ou leur créneau directement : vos disponibilités se synchronisent, zéro commission prélevée.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="k-border-thin flex h-7 w-7 flex-none items-center justify-center rounded-full bg-k-pink text-sm font-black text-k-ink">
                ✓
              </span>
              <div>
                <p className="text-sm font-black text-k-ink">Mise à jour depuis votre téléphone</p>
                <p className="text-xs font-bold text-k-muted">
                  Un plat en rupture ? Un nouveau cocktail du mois ? Modifiez en direct sans jamais changer vos QR codes sur table.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="k-border-thin flex h-7 w-7 flex-none items-center justify-center rounded-full bg-k-blue text-sm font-black text-k-ink">
                ✓
              </span>
              <div>
                <p className="text-sm font-black text-k-ink">Jeux & Fidélité embarqués dans la carte</p>
                <p className="text-xs font-bold text-k-muted">
                  Pendant que la cuisine prépare la commande, vos convives jouent à Duo Miroir à table ou rejoignent votre passeport fidélité.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/faire-venir"
              className="k-border k-btn rounded-full bg-k-orange px-7 py-3 text-sm font-black text-k-ink"
            >
              Découvrir la Vitrine & Réservation →
            </Link>
            <span className="text-xs font-black text-k-muted">
              Inclus dans l&apos;offre Sur Place & La Totale
            </span>
          </div>
        </div>

        {/* Colonne droite : Mockup smartphone stylé de la Vitrine */}
        <div className="relative flex justify-center">
          <Tilt3D intensity={8}>
            <div className="k-border k-hard w-full max-w-[320px] rounded-[36px] bg-k-ink p-3.5 shadow-2xl">
              {/* Écran de téléphone */}
              <div className="overflow-hidden rounded-[28px] bg-k-bg text-k-ink">
                {/* Header de la vitrine fictive */}
                <div className="bg-k-yellow p-4 text-center border-b-2 border-k-ink">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-black border border-k-ink shadow-sm">
                    ☕
                  </div>
                  <h4 className="mt-2 text-base font-black" style={DISPLAY}>
                    Le Café des Amis
                  </h4>
                  <p className="text-[11px] font-bold text-k-body">Bistrot · 11 rue de la Paix</p>
                  <div className="mt-2 flex justify-center gap-1.5">
                    <span className="rounded-full bg-k-green/20 px-2 py-0.5 text-[9px] font-black text-k-green">
                      Ouvert actuellement
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-k-ink">
                      FR / EN
                    </span>
                  </div>
                </div>

                {/* Rubriques de la carte */}
                <div className="p-3.5 space-y-2.5">
                  <div className="rounded-xl border border-k-ink/15 bg-white p-2.5 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-k-ink">Plat du jour</span>
                      <span className="text-xs font-black text-k-orange-text">14,50 €</span>
                    </div>
                    <p className="text-[10px] text-k-muted font-bold mt-0.5">
                      Pavé de saumon rôti & écrasé de pommes de terre aux herbes
                    </p>
                  </div>

                  <div className="rounded-xl border border-k-ink/15 bg-white p-2.5 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-k-ink">Burger Maison</span>
                      <span className="text-xs font-black text-k-orange-text">16,00 €</span>
                    </div>
                    <p className="text-[10px] text-k-muted font-bold mt-0.5">
                      Bœuf charolais, cheddar affiné, sauce secrète
                    </p>
                  </div>

                  {/* Bouton de réservation & jeu intégré */}
                  <div className="rounded-xl bg-k-orange/20 border border-k-orange p-2.5 text-center">
                    <p className="text-[11px] font-black text-k-ink">📅 Réserver une table en terrasse</p>
                    <p className="text-[9px] font-bold text-k-body">Créneaux en direct pour ce soir</p>
                  </div>

                  <div className="rounded-xl bg-k-yellow/40 border border-k-yellow p-2.5 text-center">
                    <p className="text-[11px] font-black text-k-ink">🎲 En attente ? Jouez à Duo Miroir</p>
                    <p className="text-[9px] font-bold text-k-body">Découvrez si vous avez les mêmes goûts</p>
                  </div>
                </div>
              </div>
            </div>
          </Tilt3D>
        </div>
      </div>
    </div>
  );
}
