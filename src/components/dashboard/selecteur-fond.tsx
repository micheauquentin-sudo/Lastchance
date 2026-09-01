import { FondEcran } from "@/components/ui/fond-ecran";
import { FOND_KEYS, FOND_LABELS, type FondKey } from "@/lib/fonds-ecran";

/**
 * LE SÉLECTEUR DE FOND D'ÉCRAN — extrait de `wheel-style-editor.tsx` le
 * 2026-08-31 pour être MONTÉ TEL QUEL par l'atelier du passeport.
 *
 * ── Pourquoi extraire, et pas recopier ──
 *
 * Le bloc recopié aurait divergé au premier ajustement — ce dépôt en a fait
 * l'expérience la même semaine avec les titres de cartes, et l'en-tête de
 * `apercu-accueil-jeu.tsx` raconte la même histoire pour l'aperçu de la roue.
 * Surtout, la tuile porte un correctif d'accessibilité coûteux (voir plus bas,
 * « LE RADIO A UNE SURFACE ») : une copie l'aurait perdu au premier
 * nettoyage, et le second sélecteur aurait réintroduit un défaut déjà payé.
 *
 * ── Le seul ajout au geste d'origine : `name` ──
 *
 * Le nom du groupe de radios était constant (`"style-fond"`). Deux sélecteurs
 * montés dans la même page se seraient alors partagé un groupe : cocher un
 * fond ici aurait décoché l'autre. Il devient un paramètre ; l'appelant
 * historique passe exactement son ancienne valeur.
 */

/**
 * Une tuile du sélecteur de fond d'écran — la vignette RÉELLE du fond, en 16/9,
 * avec son libellé dessous.
 *
 * Le patron (label cliquable + radio invisible + cadre `border-2 border-k-ink`
 * quand l'option est retenue) est celui des trois sélecteurs de thème du
 * dépôt — `calendar-editor.tsx`, `contest-settings.tsx`, `quiz-editor.tsx`. Il
 * est repris volontairement : un quatrième sélecteur d'apparence qui se
 * manipulerait autrement ferait douter que ce soit le même geste.
 *
 * ── LE RADIO A UNE SURFACE, ET C'EST LA TUILE ENTIÈRE ──
 *
 * Seul écart avec les trois autres, et il est payé : le radio n'est pas
 * `sr-only` mais une couche transparente `absolute inset-0`. `sr-only` réduit
 * le contrôle à une boîte de 1×1 px rognée (`clip: rect(0,0,0,0)`), posée au
 * coin haut-gauche du contenu. Une cible d'un pixel n'a AUCUNE tolérance :
 * il suffit que la page ait glissé d'une fraction de pixel entre le calcul du
 * point et le clic pour que celui-ci tombe à côté — sur le label, ou sur la
 * tuile voisine. Or `globals.css` pose `scroll-behavior: smooth` sur `html`
 * (hors `prefers-reduced-motion`) : tout défilement PROGRAMMÉ vers cette
 * section, longue et basse dans la page, est une glissade animée. Un pilote
 * qui fait défiler puis clique — Playwright, mais aussi les logiciels de
 * commande vocale qui visent la boîte du contrôle — tape dans le vide tant que
 * la glissade dure. Symptôme observé : `check()` en échec pendant 90 s,
 * alternant « label intercepte » et « hors du cadre », sans jamais converger.
 *
 * Avec la couche pleine tuile, la cible mesure ~170×130 px : la même glissade
 * de quelques pixels tombe toujours dans le contrôle. Le radio reste invisible
 * (`opacity-0`, jamais `hidden`), donc toujours dans l'arbre d'accessibilité,
 * nommé par le texte du label — comme avec `sr-only`.
 *
 * Corollaire obligatoire : la vignette décorative est `pointer-events-none`.
 * Elle est `relative` et vient APRÈS le radio dans le DOM ; deux boîtes
 * positionnées se départagent à l'ordre du DOM, elle recouvrirait donc la
 * couche de clic. Elle est `aria-hidden` : elle n'a rien à intercepter.
 *
 * `focus-within` sur le label : le contrôle n'étant pas peint, c'est la tuile
 * qui doit montrer le focus clavier. Elle ne le montrait pas du tout avant.
 *
 * `fond` absent = la tuile « Aucun ». Elle ne montre pas un cadre vide mais le
 * crème rayé du site : le commerçant doit voir ce qu'il obtient en n'en
 * choisissant pas, pas un trou.
 */
function TuileFond({
  nomGroupe,
  label,
  fond,
  active,
  onSelect,
}: {
  /** Nom du groupe de radios — voir l'en-tête : deux sélecteurs, deux noms. */
  nomGroupe: string;
  label: string;
  fond?: FondKey;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`relative cursor-pointer rounded-2xl border-2 p-2 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-k-ink ${
        active
          ? "border-k-ink bg-k-yellow/20 shadow-[3px_3px_0_var(--color-k-ink)]"
          : "border-k-ink/20 bg-white hover:border-k-ink/50"
      }`}
    >
      <input
        type="radio"
        name={nomGroupe}
        value={fond ?? ""}
        checked={active}
        onChange={onSelect}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      />
      <div
        aria-hidden
        className="pointer-events-none relative aspect-video overflow-hidden rounded-lg border-2 border-k-ink bg-k-bg"
        style={
          fond
            ? undefined
            : {
                backgroundImage:
                  "repeating-linear-gradient(135deg,#f3ead3 0 10px,#fdf6e3 10px 20px)",
              }
        }
      >
        {fond && <FondEcran fond={fond} variant="vignette" />}
      </div>
      <p className="mt-1.5 flex items-center justify-between gap-1 text-xs font-black text-k-ink">
        <span>{label}</span>
        {active && <span className="text-k-green">✓</span>}
      </p>
    </label>
  );
}

/**
 * LE GROUPE COMPLET — « Aucun » puis les dix illustrations.
 *
 * Le sélecteur montre les VRAIES vignettes, pas des pastilles de couleur : un
 * fond d'écran ne se décrit pas, il se voit. Et le clic doit repeindre
 * l'aperçu de l'appelant IMMÉDIATEMENT, avant tout enregistrement — c'est le
 * patron `ApercuAccueilJeu` : le commerçant juge sur ce que verra son client,
 * pas sur un libellé.
 *
 * `fieldset`/`legend` et des radios invisibles sous des `label` : l'ensemble
 * reste un groupe de boutons radio pour un lecteur d'écran, navigable aux
 * flèches, alors qu'il se lit comme une planche d'images. Les vignettes
 * elles-mêmes sont `aria-hidden` (le composant `FondEcran` s'en charge) —
 * c'est le LIBELLÉ qui nomme le choix.
 *
 * La légende est « Fond d'écran » par défaut, et deux tests de bout en bout
 * s'y accrochent (`getByRole("group", { name: "Fond d'écran" })`) : la changer
 * pour un appelant se fait par la prop, jamais en éditant le défaut.
 *
 * ── LE TROISIÈME ÉTAT EST OPTIONNEL (SALON-1) ──
 *
 * Deux appelants sur trois n'ont que deux réponses à la question « quel fond ? »
 * — aucun, ou l'un des dix. Un réglage adossé à un THÈME en a une de plus,
 * « suivre le thème », que `null` seul sait dire (`fondChoisi`, trois états) :
 * la confondre avec « aucun » ferait revenir le fond du thème chez le
 * commerçant qui vient de le retirer. `calendar-editor` s'était payé pour ça un
 * sélecteur entier en copie locale ; la tuile entre donc ici, en tête du groupe
 * et seulement quand l'appelant la demande, plutôt qu'en quatrième exemplaire
 * ailleurs.
 */
export function SelecteurFond({
  nomGroupe,
  valeur,
  onChange,
  legende = "Fond d'écran",
  aide,
  className = "mb-5",
  suivreTheme,
}: {
  nomGroupe: string;
  valeur: FondKey | undefined;
  onChange: (fond: FondKey | undefined) => void;
  legende?: string;
  aide?: string;
  className?: string;
  /**
   * Quand elle est fournie, une tuile « Suivre le thème » ouvre le groupe et
   * `actif` la coche — l'appelant garde son propre état à trois valeurs, et
   * `onChange(undefined)` (la tuile « Aucun ») vaut alors le choix EXPLICITE de
   * n'avoir aucune image, pas l'absence de choix.
   */
  suivreTheme?: { actif: boolean; onSelect: () => void; label?: string };
}) {
  return (
    <fieldset className={className}>
      <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-600 mb-2">
        {legende}
      </legend>
      {aide && <p className="mb-2.5 text-xs text-zinc-500">{aide}</p>}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {suivreTheme && (
          <TuileFond
            nomGroupe={nomGroupe}
            label={suivreTheme.label ?? "Suivre le thème"}
            active={suivreTheme.actif}
            onSelect={suivreTheme.onSelect}
          />
        )}
        <TuileFond
          nomGroupe={nomGroupe}
          label="Aucun"
          // `!valeur` ne suffit plus dès qu'un troisième état existe : sans le
          // second terme, « Suivre le thème » et « Aucun » seraient cochées
          // toutes les deux en même temps.
          active={!valeur && !suivreTheme?.actif}
          onSelect={() => onChange(undefined)}
        />
        {FOND_KEYS.map((cle) => (
          <TuileFond
            key={cle}
            nomGroupe={nomGroupe}
            label={FOND_LABELS[cle]}
            fond={cle}
            active={valeur === cle}
            onSelect={() => onChange(cle)}
          />
        ))}
      </div>
    </fieldset>
  );
}
