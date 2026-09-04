"use client";

import {
  CONTEST_THEME_ORDER,
  contestThemeTokens,
} from "@/components/pronos/contest-theme";
import { SelecteurFond } from "@/components/dashboard/selecteur-fond";
import { PublicShare } from "@/components/dashboard/public-share";
import { FondEcran } from "@/components/ui/fond-ecran";
import {
  AUCUN_FOND,
  FOND_KEYS,
  fondPourTheme,
  type FondKey,
} from "@/lib/fonds-ecran";
import {
  FormulairePlateau,
  FormulaireSuggestion,
} from "@/components/vitrine/duo-editeur";
import { DUO_OPTIONS_MAX } from "@/lib/duo";
import { DUO_OPTIONS_MIN_ECRAN } from "@/lib/validations/duo";
import type { LobbyKind } from "@/lib/lobby";
import type { EtatSalon } from "@/components/salons/studio/etat";

/**
 * LES ÉTAPES DU STUDIO DES SALONS — une par fichier de contenu (VIT-48).
 *
 * ── AUCUN DE CES BLOCS NE PORTE DE `<form>` DE RÉGLAGES ──
 *
 * L'habillage écrit dans `EtatSalon` ; la coquille poste. Les étapes de CONTENU
 * font l'inverse, et c'est le second canal d'ADR-156 : `FormulairePlateau`,
 * `FormulaireSuggestion` et le pack de la Bande gardent leur propre `<form>` et
 * leur propre bouton, parce qu'ils écrivent d'autres tables par d'autres RPC.
 * Ces `<form>` sont valides ICI et seulement ici : le formulaire de la coquille
 * est leur VOISIN, jamais leur ancêtre (VIT-16).
 */

/**
 * L'HABILLAGE — LE SEUL RÉGLAGE DE CE STUDIO QUI CHANGE L'AUTRE JEU.
 *
 * ── LA PORTÉE EST DITE TROIS FOIS, ET AU MOMENT DU GESTE ──
 *
 * `HabillageSalons`, sur le tableau de bord, la disait déjà trois fois : le
 * titre au pluriel, le chapeau qui nomme les deux jeux, et le bouton
 * « Enregistrer pour les deux jeux ». Le studio ne peut pas reprendre la
 * troisième — il n'a pas de bouton par bloc, il enregistre tout seul — et
 * perdrait donc l'avertissement à l'instant précis où le commerçant relit.
 *
 * Elle est donc redite à trois endroits qui tiennent dans le studio, et chacun
 * est ATTACHÉ à un contrôle plutôt qu'à la page :
 *
 * 1. LE TITRE DE L'ÉTAPE — « L'habillage, commun aux deux jeux » — qui est
 *    dans le fil en permanence, dans l'infobulle et dans le nom accessible
 *    (`etapes.ts`). C'est le seul texte qu'on ne peut pas ne pas voir.
 * 2. LE CHAPEAU de ce bloc, qui nomme LES DEUX JEUX en toutes lettres, sans
 *    présenter l'autre comme un effet de bord.
 * 3. LA MENTION SOUS CHAQUE GROUPE DE CONTRÔLES — la palette, le décor,
 *    l'enseigne — parce que c'est là que la main est posée. Une note en bas de
 *    page aurait été lue une fois, le premier jour.
 *
 * Le danger n'est pas technique, il est de LECTURE : un sélecteur de couleurs
 * posé sous « Portrait de la Bande » se lit comme un réglage DE CE JEU-LÀ. Le
 * commerçant repasserait sur le Duo pour l'habiller « aussi », y trouverait ses
 * propres couleurs et croirait à un bug — ou choisirait deux décors et n'en
 * verrait qu'un.
 *
 * ── LE COMMERÇANT NE CHOISIT PAS UNE COULEUR, IL CHOISIT DANS UNE PALETTE ──
 *
 * Onze thèmes, dont le lavis est MESURÉ en contraste contre les deux encres du
 * parcours joueur (`theme-lavis.test.ts`). Aucun sélecteur libre, aucune saisie
 * hexadécimale : c'est ce qui garantit qu'un salon habillé reste lisible, et
 * c'est aussi pourquoi la vignette montre le lavis RÉEL plutôt qu'une pastille
 * décorative — le commerçant juge sur ce que verra son client.
 */
export function EtapeHabillage({
  etat,
  onEtat,
  nomOrganisation,
  logoUrl,
  peutEditer,
}: {
  etat: EtatSalon;
  onEtat: (patch: Partial<EtatSalon>) => void;
  nomOrganisation: string;
  logoUrl: string | null;
  peutEditer: boolean;
}) {
  const fondSelectionne = (FOND_KEYS as readonly string[]).includes(
    etat.fond_key,
  )
    ? (etat.fond_key as FondKey)
    : undefined;

  return (
    <section>
      <h2 className="font-semibold">L&apos;habillage de la salle</h2>
      <p className="mb-5 mt-2 text-sm text-zinc-600">
        Le salon est la salle d&apos;attente commune à vos deux jeux —{" "}
        <strong>Duo Miroir</strong> et <strong>Portrait de la Bande</strong>{" "}
        s&apos;y retrouvent avant de commencer. Ce que vous réglez ici habille
        donc <strong>les deux à la fois</strong> : il n&apos;y a qu&apos;un
        salon, et une seule paire de couleurs à choisir.
      </p>

      {/* Les contrôles sont DÉSACTIVÉS EN BLOC pour qui ne règle pas, plutôt
          que masqués : le commerçant en lecture voit ce qui est en place. */}
      <fieldset disabled={!peutEditer} className="border-0 p-0">
        {/* ── La palette ── */}
        <fieldset className="mb-5">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Palette
          </legend>
          <p className="mb-2.5 text-xs text-zinc-500">
            La couleur de fond de la salle d&apos;attente,{" "}
            <strong>pour vos deux jeux</strong>. Chaque palette est choisie pour
            rester lisible sur un téléphone posé sur une table.
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {CONTEST_THEME_ORDER.map((cle) => {
              const tokens = contestThemeTokens(cle);
              const fondDuTheme = fondPourTheme(cle);
              const actif = cle === etat.theme;
              return (
                <label
                  key={cle}
                  className={`relative cursor-pointer rounded-2xl border-2 p-2 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-k-ink ${
                    actif
                      ? "border-k-ink bg-k-yellow/20 shadow-[3px_3px_0_var(--color-k-ink)]"
                      : "border-k-ink/20 bg-white hover:border-k-ink/50"
                  }`}
                >
                  {/* Couche de clic PLEINE TUILE, jamais `sr-only` : le
                      raisonnement complet est dans `selecteur-fond.tsx`
                      (« LE RADIO A UNE SURFACE »). Une cible d'un pixel sous un
                      défilement animé est un flake de pilotage garanti.

                      Le `name` groupe les radios, il ne poste RIEN : ce bloc
                      est VOISIN du formulaire de la coquille, pas son
                      descendant. La charge utile est dans `champs-caches`. */}
                  <input
                    type="radio"
                    name="studio-salon-theme"
                    value={cle}
                    checked={actif}
                    onChange={() => onEtat({ theme: cle })}
                    className="absolute inset-0 cursor-pointer appearance-none opacity-0"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none relative aspect-video overflow-hidden rounded-lg border-2 border-k-ink"
                    style={tokens.pageStyle}
                  >
                    {fondDuTheme && (
                      <FondEcran fond={fondDuTheme} variant="vignette" />
                    )}
                  </div>
                  {/* L'EMOJI EST `aria-hidden`, et ce n'est pas cosmétique : il
                      ferait partie du NOM ACCESSIBLE du bouton radio, où il
                      transporterait le sélecteur de variante U+FE0F —
                      invisible à l'œil, et déjà responsable ici de locators
                      Playwright qui ne matchent jamais. */}
                  <p className="mt-1.5 flex items-center justify-between gap-1 text-xs font-black text-k-ink">
                    <span>
                      <span aria-hidden className="mr-1">
                        {tokens.titleEmoji}
                      </span>
                      {tokens.label}
                    </span>
                    {actif && <span className="text-k-green">✓</span>}
                  </p>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* ── Le fond d'écran ── */}
        <SelecteurFond
          nomGroupe="studio-salon-fond"
          legende="Décor de fond"
          aide="La grande image derrière la salle d'attente, pour vos deux jeux. Par défaut elle suit la palette ci-dessus ; vous pouvez en imposer une autre, ou n'en mettre aucune."
          valeur={fondSelectionne}
          onChange={(cle) => onEtat({ fond_key: cle ?? AUCUN_FOND })}
          suivreTheme={{
            actif: etat.fond_key === "",
            onSelect: () => onEtat({ fond_key: "" }),
          }}
        />

        {/* ── Le nom et le logo ── */}
        <fieldset className="mb-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Votre enseigne
          </legend>
          <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border-2 border-k-ink/15 px-3 py-2.5 hover:bg-k-yellow/20">
            <input
              type="checkbox"
              checked={etat.affiche_identite}
              onChange={(e) => onEtat({ affiche_identite: e.target.checked })}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-k-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-k-ink">
                Afficher mon nom et mon logo dans le salon
              </span>
              <span className="block text-xs leading-snug text-zinc-500">
                {logoUrl
                  ? `Vos clients verront votre logo et « ${nomOrganisation} » au-dessus du salon, dans vos deux jeux.`
                  : `Vos clients verront « ${nomOrganisation} » au-dessus du salon, dans vos deux jeux. Ajoutez un logo dans vos réglages pour qu'il apparaisse aussi.`}
              </span>
            </span>
          </label>
          <p className="mt-2 text-xs text-zinc-500">
            Certains commerçants préfèrent leurs couleurs sans leur enseigne : le
            joueur arrive souvent dans ce salon sans avoir choisi le commerce
            lui-même.
          </p>
        </fieldset>
      </fieldset>
    </section>
  );
}

/**
 * LES QUESTIONS DU DUO — le plateau, sans la suggestion.
 *
 * `FormulairePlateau` garde son `<form>` et son bouton : il écrit `duo_options`
 * par `set_duo_plateau`, pas la ligne d'habillage. C'est le second canal
 * d'ADR-156, et il est valide ici parce que le formulaire de la coquille est
 * son VOISIN (VIT-16).
 *
 * Le titre et la consigne sont RENDUS ICI plutôt que repris de `DuoEditeur` :
 * celui-ci présente le plateau ET la suggestion sous un seul chapeau, qui
 * décrirait deux étapes à la fois.
 */
export function EtapeQuestionsDuo({
  fiches,
  initiales,
  peutEditer,
}: {
  fiches: Parameters<typeof FormulairePlateau>[0]["fiches"];
  initiales: Parameters<typeof FormulairePlateau>[0]["initiales"];
  peutEditer: boolean;
}) {
  return (
    <section>
      <h2 className="font-semibold">Vos questions</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-600">
        Deux clients choisissent chacun, sans se voir, ce qu&apos;ils
        offriraient à l&apos;autre — puis les deux choix se révèlent en même
        temps. Composez les {DUO_OPTIONS_MIN_ECRAN} à {DUO_OPTIONS_MAX}{" "}
        propositions du plateau
        {fiches.length > 0
          ? " — en les écrivant, ou en les prenant dans votre carte."
          : "."}
      </p>
      <FormulairePlateau
        fiches={fiches}
        initiales={initiales}
        peutEditer={peutEditer}
      />
    </section>
  );
}

/**
 * LA SUGGESTION DU JOUR — PROPRE AU DUO, et absente du fil de la Bande.
 *
 * ── ELLE N'EXISTE PAS SANS CARTE, ET L'ÉTAPE LE DIT ──
 *
 * `set_duo_suggestion` prend un `item_id` : la suggestion EST une fiche du
 * catalogue, et rien d'autre. Un commerçant sans Vitrine n'en a aucune, et
 * `DuoEditeur` masque alors purement le formulaire — ce qu'une étape ne peut
 * pas se permettre : son bouton reste dans le fil, et l'ouvrir sur du vide
 * laisserait croire à un écran cassé. Elle explique donc ce qui manque et où le
 * composer, ce qui est la forme retenue par les étapes de vérification des
 * autres studios.
 */
export function EtapeSuggestionDuo({
  fiches,
  suggestion,
  peutEditer,
}: {
  fiches: Parameters<typeof FormulaireSuggestion>[0]["fiches"];
  suggestion: string;
  peutEditer: boolean;
}) {
  return (
    <section>
      <h2 className="font-semibold">Votre suggestion du jour</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-600">
        La fiche que le Duo met en avant une fois les choix révélés. Elle est
        facultative, et elle ne concerne que le Duo Miroir.
      </p>
      {fiches.length > 0 ? (
        <FormulaireSuggestion
          fiches={fiches}
          suggestion={suggestion}
          peutEditer={peutEditer}
        />
      ) : (
        <p className="rounded-xl border-2 border-dashed border-k-ink/30 bg-k-yellow/20 px-3 py-2.5 text-sm text-k-body">
          Une suggestion est une fiche de votre carte, et votre carte n&apos;en
          contient aucune pour l&apos;instant. Composez-la depuis votre Vitrine
          pour pouvoir en mettre une en avant ici.
        </p>
      )}
    </section>
  );
}

/**
 * LE QR DES TABLES — l'adresse publique, et pourquoi elle ressemble à ce
 * qu'elle ressemble.
 *
 * L'URL n'est PAS recalculée ici : elle arrive résolue par la page, qui suit le
 * même ordre que `resoudreCommerceLobby` — la vitrine publiée d'abord (c'est
 * l'adresse déjà imprimée sur les QR), le slug d'organisation ensuite. Les deux
 * bouts du même lien divergeraient s'ils choisissaient différemment.
 */
export function EtapeQr({
  jeu,
  url,
  libelle,
  organizationId,
  vitrinePubliee,
}: {
  jeu: LobbyKind;
  url: string;
  libelle: string;
  organizationId: string;
  vitrinePubliee: boolean;
}) {
  return (
    <section>
      <h2 className="font-semibold">Le QR de vos tables</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-600">
        Vos clients scannent, choisissent un pseudo et ouvrent une salle de 2 à
        12 joueurs. Rien à installer de leur côté.
      </p>
      <PublicShare
        url={url}
        fileName={`salon-${jeu}`}
        qrLabel={libelle}
        resource={{ kind: jeu === "duo" ? "duo" : "portrait", id: organizationId }}
      />
      {!vitrinePubliee && (
        // Le commerçant doit savoir POURQUOI son adresse porte son nom
        // d'établissement plutôt que sa carte — sinon il croira à une erreur le
        // jour où il publiera sa Vitrine et verra l'adresse changer.
        <p className="mt-3 text-xs text-zinc-600">
          Cette adresse porte le nom de votre établissement. Si vous publiez une
          Vitrine, le jeu s&apos;ouvrira aussi depuis son adresse à elle.
        </p>
      )}
    </section>
  );
}
