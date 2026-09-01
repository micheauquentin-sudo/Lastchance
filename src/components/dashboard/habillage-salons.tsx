"use client";

import { useState } from "react";

import { setHabillageSalons } from "@/actions/salon-habillage";
import {
  CONTEST_THEME_ORDER,
  contestThemeTokens,
} from "@/components/pronos/contest-theme";
import { SelecteurFond } from "@/components/dashboard/selecteur-fond";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FondEcran } from "@/components/ui/fond-ecran";
import { FieldError } from "@/components/ui/input";
import { AUCUN_FOND, FOND_KEYS, fondPourTheme, type FondKey } from "@/lib/fonds-ecran";
import type { LobbyKind } from "@/lib/lobby";
import { useActionForm } from "@/lib/use-action-form";
import type { SeasonalTheme } from "@/types/database";

/**
 * L'HABILLAGE DES SALONS (SALON-1) — le seul écran où il se règle.
 *
 * ── UN SEUL RÉGLAGE POUR LES DEUX JEUX, ET IL FAUT QUE ÇA SE VOIE ──
 *
 * Ce bloc est monté par `/dashboard/salons/duo` ET par
 * `/dashboard/salons/bande`, avec la même ligne de base derrière : le salon est
 * la coquille du SOCLE, celle qui précède le jeu, et `lobby_settings` porte une
 * ligne par organisation — pas une par jeu.
 *
 * Le danger de cet écran n'est donc pas technique, il est de LECTURE : posé
 * sous « Portrait de la Bande », entre le pack de questions et la liste des
 * salons ouverts, un sélecteur de couleurs se lit comme un réglage DE CE JEU-LÀ.
 * Le commerçant repasserait ensuite sur le Duo pour l'habiller « aussi », y
 * trouverait ses propres couleurs déjà en place et croirait à un bug — ou pire,
 * il choisirait deux décors et n'en verrait qu'un.
 *
 * Trois choses le disent donc, du plus visible au plus précis, et aucune n'est
 * de trop : le TITRE nomme les salons au pluriel plutôt que le jeu de la page
 * (« Les couleurs de vos salons ») ; le chapeau nomme LES DEUX JEUX en toutes
 * lettres, sans jamais présenter l'autre comme un effet de bord ; et le bouton
 * confirme la portée au moment du geste (« Enregistrer pour les deux jeux »),
 * qui est le seul instant où le commerçant relit vraiment.
 *
 * ── LE COMMERÇANT NE CHOISIT PAS UNE COULEUR, IL CHOISIT DANS UNE PALETTE ──
 *
 * Onze thèmes, dont le lavis est MESURÉ en contraste contre les deux encres du
 * parcours joueur (`theme-lavis.test.ts`). Aucun sélecteur libre, aucune saisie
 * hexadécimale : c'est ce qui garantit qu'un salon habillé reste lisible, et
 * c'est aussi pourquoi la vignette montre le lavis RÉEL plutôt qu'une pastille
 * décorative — le commerçant juge sur ce que verra son client.
 */
export function HabillageSalons({
  jeu,
  theme,
  fondKey,
  afficheIdentite,
  nomOrganisation,
  logoUrl,
  peutEditer,
}: {
  /** Le jeu de la page — il ne sert qu'à la garde de l'action. */
  jeu: LobbyKind;
  theme: SeasonalTheme;
  /** Trois états : `null` (suivre le thème), `"aucun"`, ou une clé. */
  fondKey: string | null;
  afficheIdentite: boolean;
  nomOrganisation: string;
  logoUrl: string | null;
  /** Même garde d'affichage que le reste de l'écran : préparer sans exposer. */
  peutEditer: boolean;
}) {
  const [themeChoisi, setThemeChoisi] = useState<SeasonalTheme>(theme);
  // TROIS VALEURS DANS UNE CHAÎNE, et c'est celle que le champ caché poste :
  // `""` (suivre le thème), `"aucun"`, ou une clé. Le schéma replie `""` sur
  // `null` — voir `fondKeySchema`.
  const [fond, setFond] = useState<string>(fondKey ?? "");
  const [identite, setIdentite] = useState(afficheIdentite);

  const enregistrer = useActionForm(setHabillageSalons, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const etat = enregistrer.state;

  const fondSelectionne = (FOND_KEYS as readonly string[]).includes(fond)
    ? (fond as FondKey)
    : undefined;

  return (
    <Card>
      <h2>Les couleurs de vos salons</h2>
      <p className="mb-5 mt-2 text-sm text-zinc-600">
        Le salon est la salle d&apos;attente commune à vos deux jeux —{" "}
        <strong>Duo Miroir</strong> et <strong>Portrait de la Bande</strong>{" "}
        s&apos;y retrouvent avant de commencer. Ce que vous réglez ici habille
        donc <strong>les deux à la fois</strong> : il n&apos;y a qu&apos;un
        salon, et une seule paire de couleurs à choisir.
      </p>

      <form onSubmit={enregistrer.onSubmit}>
        <input type="hidden" name="jeu" value={jeu} />

        <fieldset disabled={!peutEditer} className="border-0 p-0">
          {/* ── Le thème ── */}
          <fieldset className="mb-5">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Palette
            </legend>
            <p className="mb-2.5 text-xs text-zinc-500">
              La couleur de fond de la salle d&apos;attente. Chaque palette est
              choisie pour rester lisible sur un téléphone posé sur une table.
            </p>
            {/* La valeur retenue voyage dans un champ caché contrôlé, motif
                `calendar-editor` : le groupe de radios pilote l'aperçu, le champ
                caché porte ce qui part. */}
            <input type="hidden" name="theme" value={themeChoisi} />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {CONTEST_THEME_ORDER.map((cle) => {
                const tokens = contestThemeTokens(cle);
                const fondDuTheme = fondPourTheme(cle);
                const actif = cle === themeChoisi;
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
                        (« LE RADIO A UNE SURFACE »). Une cible d'un pixel sous
                        un défilement animé est un flake de pilotage garanti. */}
                    <input
                      type="radio"
                      name="habillage-theme"
                      value={cle}
                      checked={actif}
                      onChange={() => setThemeChoisi(cle)}
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
                    {/* L'EMOJI EST `aria-hidden`, et ce n'est pas cosmétique :
                        il ferait partie du NOM ACCESSIBLE du bouton radio, où
                        il transporterait le sélecteur de variante U+FE0F —
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

          {/* ── Le fond d'écran ──
              Le champ caché porte les trois états ; le sélecteur partagé les
              montre. « Suivre le thème » est le défaut, donc l'état d'un salon
              que personne n'a réglé. */}
          <input type="hidden" name="fond_key" value={fond} />
          <SelecteurFond
            nomGroupe="habillage-fond"
            legende="Fond d'écran"
            aide="La grande image derrière la salle d'attente. Par défaut elle suit la palette ci-dessus ; vous pouvez en imposer une autre, ou n'en mettre aucune."
            valeur={fondSelectionne}
            onChange={(cle) => setFond(cle ?? AUCUN_FOND)}
            suivreTheme={{ actif: fond === "", onSelect: () => setFond("") }}
          />

          {/* ── Le nom et le logo ── */}
          <fieldset className="mb-5">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Votre enseigne
            </legend>
            <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border-2 border-k-ink/15 px-3 py-2.5 hover:bg-k-yellow/20">
              <input
                type="checkbox"
                checked={identite}
                onChange={(e) => setIdentite(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-k-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-k-ink">
                  Afficher mon nom et mon logo dans le salon
                </span>
                <span className="block text-xs leading-snug text-zinc-500">
                  {logoUrl
                    ? `Vos clients verront votre logo et « ${nomOrganisation} » au-dessus du salon.`
                    : `Vos clients verront « ${nomOrganisation} » au-dessus du salon. Ajoutez un logo dans vos réglages pour qu'il apparaisse aussi.`}
                </span>
              </span>
            </label>
            {/* UNE CASE DÉCOCHÉE N'ENVOIE RIEN : le champ caché est ce qui
                distingue « le commerçant a décoché » de « ce formulaire n'a pas
                posté ce champ ». Sans lui, se taire serait indiscernable du
                défaut, qui est de se nommer. */}
            <input
              type="hidden"
              name="affiche_identite"
              value={identite ? "true" : "false"}
            />
            <p className="mt-2 text-xs text-zinc-500">
              Certains commerçants préfèrent leurs couleurs sans leur enseigne :
              le joueur arrive souvent dans ce salon sans avoir choisi le
              commerce lui-même.
            </p>
          </fieldset>

          {/* DEUX CANAUX, ET ILS NE DISENT PAS LA MÊME CHOSE. `{ ok: false }`
              est une saisie à corriger ou une panne, et son message vient de
              l'action ; `refuse` est un `{ ok: true }` — la base a répondu, et
              ce qu'elle écarte est un écart entre la liste de ce dépôt et son
              propre `check`. Ce n'est pas une faute du commerçant. */}
          {etat && !etat.ok ? <FieldError message={etat.error} /> : null}
          {etat && etat.ok && etat.data.etat === "refuse" ? (
            <FieldError message="Cet habillage n’est pas disponible pour l’instant. Choisissez-en un autre, et signalez-le nous." />
          ) : null}
          {etat && etat.ok && etat.data.etat === "enregistre" ? (
            <p className="mt-2 text-sm font-semibold text-k-body" role="status">
              Habillage enregistré pour vos deux jeux de salon.
            </p>
          ) : null}

          {peutEditer ? (
            <Button type="submit" className="mt-3" disabled={enregistrer.pending}>
              {enregistrer.pending
                ? "Enregistrement…"
                : "Enregistrer pour les deux jeux"}
            </Button>
          ) : null}
        </fieldset>
      </form>
    </Card>
  );
}
