import { FondEcran } from "@/components/ui/fond-ecran";
import { KermesseStripe } from "@/components/wheel/play-theme";
import type { FondKey } from "@/lib/fonds-ecran";

/**
 * L'APERÇU DU PASSEPORT — ce que verra le client, pas une liste d'options.
 *
 * Même patron que `apercu-accueil-jeu.tsx`, et pour la même raison : une
 * vignette de 16/9 dans un sélecteur dit QUELLE image, jamais ce qu'elle donne
 * une fois le voile posé et les cartes du passeport dessus. Le commerçant
 * choisit un décor pour un écran qui porte des CHIFFRES — un solde, des prix —
 * et c'est cette lisibilité-là qu'il doit pouvoir juger d'un coup d'œil.
 *
 * ── L'empilement est celui de la page réelle ──
 *
 * `FondEcran` est le PREMIER enfant d'un conteneur `relative`, le contenu vient
 * après, et aucun `z-index` n'est posé : deux boîtes positionnées se départagent
 * à l'ordre du DOM. C'est le contrat écrit dans `fond-ecran.tsx`, et le
 * respecter ici garantit que l'aperçu ne ment pas sur la teinte obtenue.
 *
 * ── C'est une MAQUETTE, pas un extrait du passeport ──
 *
 * Les chiffres sont fictifs et le bloc n'est pas monté depuis
 * `loyalty-passport.tsx` : ce composant vit dans le tableau de bord, hors du
 * parcours joueur, et lui faire porter le vrai passeport y traînerait tout son
 * état (cookie, Server Actions, Turnstile). Ce qu'il doit reproduire fidèlement,
 * c'est la SURFACE — fond, voile, bandeau, cartes crème — et c'est ce qu'il fait.
 */
export function ApercuPasseport({
  fond,
  organizationName,
  programName,
  logoUrl,
  className = "",
}: {
  fond: FondKey | undefined;
  organizationName: string;
  programName: string;
  logoUrl: string | null;
  className?: string;
}) {
  return (
    <div
      /* Ancre de test : le sélecteur affiche onze vignettes qui portent le même
         `data-fond`. Sans cette prise, une assertion « l'aperçu montre le fond »
         se satisferait d'une vignette du sélecteur. */
      data-apercu="passeport"
      className={`relative overflow-hidden rounded-xl border-2 border-k-ink bg-k-bg text-center ${className}`}
    >
      {fond && <FondEcran fond={fond} variant="apercu" voile="creme" />}
      <KermesseStripe className="relative h-3" />
      <div className="relative px-4 py-5">
        {logoUrl ? (
          // Le dépôt n'utilise pas next/image (convention assumée).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            width={40}
            height={40}
            className="mx-auto mb-2 h-10 w-10 rounded-full border-2 border-k-ink bg-white object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-k-ink bg-white text-lg"
          >
            🎟️
          </div>
        )}
        <p className="text-[10px] font-bold uppercase tracking-wide text-k-body">
          {organizationName}
        </p>
        <p className="mt-0.5 text-base font-black leading-tight text-k-ink">
          {programName}
        </p>

        {/* La carte du solde, opaque comme sur la page réelle : c'est elle qui
            porte les chiffres, et c'est elle qui doit rester lisible. */}
        <div className="mt-3 rounded-2xl border-2 border-k-ink bg-k-yellow/30 p-3 text-left shadow-[4px_4px_0_var(--color-k-ink)]">
          <p className="text-[10px] font-black uppercase tracking-wide text-k-body">
            Le solde de vos clients
          </p>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-black tabular-nums text-k-ink">42</span>
            <span className="text-sm font-black text-k-ink">points</span>
          </p>
          <div
            aria-hidden
            className="mt-2 h-2.5 overflow-hidden rounded-full border-2 border-k-ink bg-white"
          >
            <div className="h-full w-2/3 rounded-full bg-k-orange" />
          </div>
        </div>
      </div>
    </div>
  );
}
