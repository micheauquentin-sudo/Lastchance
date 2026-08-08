import { GameIdleScreen } from "@/components/wheel/game-idle-screen";
import { KermesseStripe } from "@/components/wheel/play-theme";
import {
  WheelPointer,
  WheelSvg,
  type WheelSegment,
} from "@/components/wheel/wheel-svg";
import { ThemeDecor } from "@/components/ui/theme-decor";
import { FondEcran } from "@/components/ui/fond-ecran";
import { porteeHabillage } from "@/components/dashboard/wheel-style-scope";
import { playDecor, playOnLightSurface, playSurface } from "@/lib/wheel-style";
import type { WheelStyle } from "@/lib/wheel-style";
import type { GameType } from "@/types/database";

/**
 * L'APERÇU DE L'ÉCRAN D'ACCUEIL — composant présentationnel pur, DEUX appelants.
 *
 * Il vivait en bloc inline dans `wheel-style-editor.tsx` : surface `playSurface`,
 * décor, bandeau kermesse, puis le `GameIdleScreen` que le joueur reçoit
 * vraiment. L'étape « Le jeu », elle, ne montrait RIEN — le commerçant
 * choisissait « Carte à gratter » et ne voyait sa mécanique nulle part avant
 * d'enregistrer puis de passer à l'étape suivante, laquelle lit la valeur
 * ENREGISTRÉE : naviguer au stepper sans enregistrer lui affichait encore
 * l'ancien jeu. D'où le constat « je choisis le grattage, l'aperçu montre la
 * roue ».
 *
 * Recopier le bloc dans la deuxième étape aurait créé la divergence habituelle
 * de ce dépôt (deux aperçus qui se désynchronisent). Il est donc extrait ici,
 * et les deux étapes montent LE MÊME composant.
 *
 * `gameType` vient de l'ÉTAT LOCAL de l'appelant, pas de la base : c'est ce qui
 * rend l'aperçu vivant, il change au clic sur le radio.
 */
export const SEGMENTS_APERCU: readonly WheelSegment[] = [
  { id: "a", label: "Café offert", color: "#7c3aed" },
  { id: "b", label: "-10 %", color: "#d946ef" },
  { id: "c", label: "Perdu", color: "#3f3f46" },
  { id: "d", label: "Dessert", color: "#f59e0b" },
] as const;

export function ApercuAccueilJeu({
  style,
  organizationName,
  gameType,
  segments,
  className = "",
}: {
  style: WheelStyle;
  organizationName: string;
  /** Mécanique à dessiner — l'état local de l'étape, jamais la valeur en base. */
  gameType?: GameType | null;
  /** Lots réels de la roue ; les quatre segments de démonstration à défaut. */
  segments?: readonly WheelSegment[];
  className?: string;
}) {
  const portee = porteeHabillage(gameType);
  const surface = playSurface(style);
  const dessin = segments && segments.length > 0 ? segments : SEGMENTS_APERCU;

  return (
    <div
      /* Ancre de test : le sélecteur de fond d'écran affiche onze vignettes
         qui portent le même `data-fond` que l'aperçu. Sans cette prise, une
         assertion « l'aperçu montre le fond » se satisferait d'une vignette
         du sélecteur — elle passerait sans que l'aperçu ait bougé, ce qui est
         exactement le défaut qu'elle doit attraper. */
      data-apercu="accueil-jeu"
      className={`relative overflow-hidden rounded-xl text-center ${
        surface.kermesse ? "border-2 border-k-ink bg-k-bg" : ""
      } ${className}`}
      // Même précaution que la page /play : la shorthand `background` remet
      // `background-color` à `transparent`, la couleur pleine du commerçant est
      // reposée derrière le dégradé.
      style={
        surface.background
          ? { background: surface.background, backgroundColor: style.bgTo }
          : undefined
      }
    >
      {/* Le fond d'écran, LUI, existe sur les DEUX ambiances — c'est /play qui
          en décide, et /play le rend partout. Premier enfant du conteneur
          `relative`, donc sous le décor et sous l'écran de jeu : même
          empilement par ordre du DOM que la page réelle, aucun z-index.
          Le voile suit la surface, sinon la maquette mentirait sur la teinte
          que verra le joueur. */}
      {style.fond && (
        <FondEcran
          fond={style.fond}
          variant="apercu"
          voile={surface.kermesse ? "creme" : "nuit"}
        />
      )}
      {/* Le décor n'existe que sur l'habillage kermesse — exactement comme
          dans `PlayShell`. Le rendre sous le thème « nuit » promettrait un
          fond que la page ne peint pas. */}
      {surface.kermesse && <ThemeDecor decor={playDecor(style)} variant="apercu" />}
      {surface.kermesse && <KermesseStripe className="relative h-3" />}
      <GameIdleScreen
        variant="apercu"
        style={style}
        organizationName={organizationName}
        emoji={portee.emoji}
        title={style.title || portee.accroche}
        buttonLabel={portee.libelleBouton}
        /* `playOnLightSurface` et NON `surface.kermesse` : c'est la clarté du
           fond RÉELLEMENT peint qui décide de la palette de texte, et c'est ce
           que fait /play. */
        kermesse={playOnLightSurface(style)}
        visuel={
          portee.apercuRoue ? (
            <div className="relative mx-auto max-w-56">
              <WheelPointer color={style.pointerColor} variant={style.pointer} />
              <WheelSvg segments={[...dessin]} style={style} />
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
