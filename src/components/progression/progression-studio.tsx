"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { ProgressionNewSeasonForm } from "@/components/dashboard/progression-new-season";
import { ApercuProgression } from "@/components/progression/studio/apercu";
import {
  ETAPES_STUDIO_PROGRESSION,
  parseEtapeStudioProgression,
  type EtapeStudioProgression,
} from "@/components/progression/studio/etapes";
import {
  EtapeBadges,
  EtapeCoffres,
  EtapeCollections,
  EtapeMissions,
  EtapeVerification,
} from "@/components/progression/studio/pages";
import { PROGRESSION_SEASON_STATUS_META } from "@/components/progression/progression-labels";
import { CoquilleStudio } from "@/components/studio/coquille";
import type { OrgProgressionSeason } from "@/lib/meta-progression";

/**
 * LE STUDIO DE LA MÉTA-PROGRESSION (VIT-50) — la saison, en voyant l'écran du
 * joueur.
 *
 * ── LE SUJET DU STUDIO EST LA SAISON, PAS L'ORGANISATION ──
 *
 * Les autres modules règlent une ligne désignée par l'URL (`/studio/chasse/[id]`).
 * Ici la route est SANS identifiant, parce que la méta-progression est
 * transverse : elle n'a pas d'objet propre à adresser. Mais sa configuration,
 * elle, est bel et bien PAR SAISON — badges, collections, missions et coffres
 * appartiennent tous à une `season_id`.
 *
 * Le studio choisit donc sa saison, et l'ordre n'est pas arbitraire : le
 * BROUILLON d'abord, parce que c'est le seul état modifiable et donc le seul
 * qu'on vient régler ; la saison EN COURS ensuite, où il reste les interrupteurs
 * d'arrêt ; la plus récente sinon, en lecture. Un sélecteur apparaît dès qu'il y
 * en a plusieurs, dans `outils` — c'est un réglage d'AFFICHAGE, il ne part
 * jamais au serveur, ce qui est exactement ce que cette fente du socle porte.
 *
 * Et s'il n'y a AUCUNE saison, il n'y a rien à régler : l'écran le dit et
 * propose d'en créer une, plutôt que d'afficher un fil de cinq étapes vides.
 *
 * ── CE STUDIO N'A PAS DE FORMULAIRE DE RÉGLAGES — `peutEditer={false}` ──
 *
 * C'est le second cas de la famille après le Ticket d'Or (ADR-160), et pour une
 * raison plus nette : il n'existe PAS de `updateProgressionSeason`. Le nom et
 * les dates se fixent à la création et ne se corrigent jamais ; tout le reste
 * est une liste d'entités à actions atomiques. Il n'y a rien à mettre dans
 * `champsCaches`.
 *
 * `peutEditer` gouverne UNIQUEMENT le bandeau : l'annonce « Enregistrement
 * automatique » et le bouton « Enregistrer » qui vise le formulaire des
 * réglages. Le passer à `true` afficherait une promesse qu'aucun code ne tient,
 * et un bouton qui posterait un formulaire VIDE. Un écran qui raconte le
 * contraire de ce qu'il fait est le défaut d'ADR-153 ; un bouton qui échoue
 * toujours en serait la version bruyante.
 *
 * ── L'AUTORITÉ EST `snapshot.canConfigure`, ET ELLE VIT DANS `peutRegler` ──
 *
 * Le droit d'écrire n'est donc pas gelé pour autant : il vit là où il AGIT,
 * dans `peutRegler`, que chaque étape consulte. Et il vient de la RPC, jamais du
 * rôle local : depuis `20260805220000`, `org_progression_snapshot` réserve sa
 * branche `seasons` aux éditeurs. Se garder sur `role` afficherait des
 * formulaires d'édition sur une liste que la RPC a refusé de remplir — un écran
 * qui propose de corriger ce qu'il n'a pas le droit de lire. `canConfigure` est
 * aussi `false` quand l'agrégat est ILLISIBLE, ce qu'un rôle ne peut pas savoir.
 *
 * ── LE RECHARGEMENT FRANC, ET SON COÛT ASSUMÉ ──
 *
 * `useProgressionMutation` termine chaque mutation par `window.location.reload()`,
 * et ce n'est pas négociable ici : le rafraîchissement doux a été MESURÉ
 * défaillant sur cette page même (3 rouges sur 54 essais, harnais du
 * 2026-07-30), au point qu'un commerçant rajoutait le badge qu'il ne voyait pas
 * apparaître. Le coût dans un studio est de revenir à la PREMIÈRE étape, l'étape
 * vivant en mémoire. C'est le même compromis que le Ticket d'Or, dont chaque
 * ligne recharge aussi — et c'est le bon sens : perdre sa place coûte un clic,
 * créer un doublon coûte une correction.
 */
const ID_FORMULAIRE = "studio-progression-reglages";

/**
 * La saison qu'on vient régler. Brouillon d'abord — c'est le seul état
 * modifiable, donc le seul qu'on ouvre un studio pour toucher.
 */
export function saisonParDefaut(
  seasons: readonly OrgProgressionSeason[],
): OrgProgressionSeason | null {
  return (
    seasons.find((s) => s.status === "draft") ??
    seasons.find((s) => s.status === "active") ??
    seasons[0] ??
    null
  );
}

export function ProgressionStudio({
  seasons,
  peutRegler,
  organization,
}: {
  /** Les saisons servies par `org_progression_snapshot`. */
  seasons: OrgProgressionSeason[];
  /** `snapshot.canConfigure`, JAMAIS le rôle local. Voir l'en-tête. */
  peutRegler: boolean;
  organization: { id: string; name: string };
}) {
  const [etape, setEtape] = useState<EtapeStudioProgression>(() =>
    parseEtapeStudioProgression(null),
  );
  const defaut = useMemo(() => saisonParDefaut(seasons), [seasons]);
  const [saisonId, setSaisonId] = useState<string | null>(defaut?.id ?? null);

  // Le formulaire de la coquille reste VIDE — voir l'en-tête. La référence et
  // le gestionnaire existent parce que la coquille les exige, pas parce qu'un
  // réglage passe par eux.
  const formulaire = useRef<HTMLFormElement | null>(null);

  const season = seasons.find((s) => s.id === saisonId) ?? defaut;

  /**
   * AUCUNE SAISON : le fil des étapes n'aurait rien à régler. On le dit, et on
   * propose d'en créer une — un studio qui afficherait cinq étapes vides ferait
   * chercher au commerçant ce qui ne s'y trouve pas.
   */
  if (!season) {
    return (
      <div className="min-h-dvh bg-k-bg">
        <div className="sticky top-0 z-40 border-b-2 border-k-ink bg-white">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <Link
              href="/dashboard/progression"
              className="rounded-xl border-2 border-k-ink bg-white px-3 py-1.5 text-sm font-black text-k-ink hover:bg-k-yellow"
            >
              ← Retour
            </Link>
            <span className="truncate text-sm font-black text-k-ink">
              Mon studio — Missions &amp; coffres
            </span>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[720px] p-4">
          <div className="rounded-2xl border-2 border-k-ink bg-white p-6 text-center shadow-[8px_8px_0_rgba(33,29,22,0.9)]">
            <div aria-hidden className="mb-4 text-5xl">
              🗝️
            </div>
            <h2 className="mb-2 text-lg font-black text-k-ink">
              Aucune saison à régler
            </h2>
            <p className="mx-auto mb-5 max-w-lg text-sm text-k-body">
              Ce studio règle une saison : ses badges, ses collections, ses
              missions et ses coffres. Créez-en une — elle naît en brouillon, et
              tout y reste corrigeable jusqu&apos;au lancement.
            </p>
            {peutRegler ? (
              <div className="flex justify-center">
                {/* Le retour se fait ICI, et non au tableau de bord : la
                    création navigue en dur (le rafraîchissement doux a été
                    mesuré défaillant sur cette page), et renvoyer ailleurs
                    ferait sortir du studio celui qui vient d'y entrer. */}
                <ProgressionNewSeasonForm
                  hasActiveSeason={seasons.some((s) => s.status === "active")}
                  hrefApres="/studio/progression"
                />
              </div>
            ) : (
              <p className="text-sm font-semibold text-k-body">
                La création d&apos;une saison est réservée aux comptes
                propriétaire et éditeur.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const autreSaisonActive = seasons.some(
    (s) => s.status === "active" && s.id !== season.id,
  );
  const proprietes = { season, peutRegler, autreSaisonActive };
  const statut = PROGRESSION_SEASON_STATUS_META[season.status];

  return (
    <CoquilleStudio
      titre={`Mon studio — ${season.name}`}
      hrefRetour="/dashboard/progression"
      idFormulaire={ID_FORMULAIRE}
      formulaire={formulaire}
      onSubmit={(event) => event.preventDefault()}
      champsCaches={null}
      etapes={ETAPES_STUDIO_PROGRESSION}
      etape={etape}
      onEtape={setEtape}
      peutEditer={false}
      enregistrement={{ enCours: false, reussi: false }}
      outils={
        <>
          <span
            className={`rounded-full border-2 px-2.5 py-0.5 text-xs font-black ${statut.badgeClassName}`}
          >
            {statut.label}
          </span>
          <span className="text-xs font-semibold text-zinc-500">
            {statut.hint}
          </span>
          {seasons.length > 1 && (
            <label className="flex items-center gap-2 text-xs font-black text-k-ink">
              Saison réglée
              <select
                value={season.id}
                onChange={(event) => setSaisonId(event.currentTarget.value)}
                className="rounded-xl border-2 border-k-ink bg-white px-2.5 py-1 text-xs font-semibold text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {PROGRESSION_SEASON_STATUS_META[s.status].label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      }
      apercu={
        <ApercuProgression season={season} organization={organization} />
      }
    >
      {etape === "badges" ? <EtapeBadges {...proprietes} /> : null}
      {etape === "collections" ? <EtapeCollections {...proprietes} /> : null}
      {etape === "missions" ? <EtapeMissions {...proprietes} /> : null}
      {etape === "coffres" ? <EtapeCoffres {...proprietes} /> : null}
      {etape === "verification" ? <EtapeVerification {...proprietes} /> : null}
    </CoquilleStudio>
  );
}
