import type { ReserverActivityKind } from "@/lib/reserver";
import { formatDuree } from "@/components/reserver/formats-experience";

/**
 * LES BLOCS IMMERSIFS DE LA PAGE PUBLIQUE (RES-5).
 *
 * ── POURQUOI DES BLOCS, ET NON UNE DEUXIÈME PAGE ──
 *
 * `ReserverExperience` reste LE parcours de réservation : mêmes créneaux, même
 * code d'arrivée, même liste prioritaire, même Mode Attente. Un second composant
 * « page signature » aurait dupliqué ces cinq mécaniques — donc les aurait fait
 * diverger dès la première correction, et un joueur sur deux aurait eu la
 * version d'hier. Ce qui change entre les trois formats, c'est ce qu'on RACONTE
 * avant les créneaux. Ce fichier ne porte que cela.
 *
 * ── AUCUN DE CES BLOCS NE S'AFFICHE « PAR DÉFAUT » ──
 *
 * Chacun rend `null` sans sa matière : pas de promesse, pas d'exergue ; pas
 * d'étapes, pas de cartes. Un gabarit qui réserve la place d'un contenu absent
 * fait une page à trous, et le commerçant qui n'a rempli que le nom voit un
 * écran cassé au lieu d'un écran sobre.
 *
 * ── PAS DE `"use client"` ──
 *
 * Rien ici n'a d'état ni d'écouteur : ce sont des blocs de texte. Ils deviennent
 * client parce que `reserver-experience.tsx` les importe, pas parce qu'ils le
 * demandent — et le jour où l'en-tête remonterait dans la page serveur, ils
 * suivraient sans qu'on ait une directive à retirer.
 */

/**
 * L'EXERGUE : la promesse en grand, la durée en badge.
 *
 * La promesse passe AVANT la description et non à sa place : elle dit pourquoi
 * on vient, la description dit comment ça se passe. Le commerçant qui n'a rempli
 * que l'une des deux garde une page qui se tient.
 */
export function ExergueExperience({
  promise,
  durationMinutes,
}: {
  promise: string | null;
  durationMinutes: number | null;
}) {
  if (!promise && durationMinutes === null) return null;

  return (
    <div className="mt-4">
      {promise ? (
        <p className="text-lg font-black leading-snug text-k-ink">
          {promise}
        </p>
      ) : null}
      {durationMinutes !== null ? (
        <p className="mt-3 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-k-ink bg-k-yellow/50 px-3 py-1 text-xs font-black uppercase tracking-wide text-k-ink">
            <span aria-hidden>⏱️</span>
            {/* Le mot « Durée » est DANS le badge et non seulement à côté de
                l'icône : lu seul par un lecteur d'écran, « 45 min » ne dit pas
                de quoi il est la mesure. */}
            Durée {formatDuree(durationMinutes)}
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * LES TROIS CARTES DU MOMENT SIGNATURE, avant les créneaux.
 *
 * Numérotées, parce que c'est un déroulé et non une liste d'arguments : le
 * client doit comprendre qu'il y a un début, un milieu et une fin. Le numéro est
 * `aria-hidden` — l'ordre est déjà porté par le `<ol>`, et « 1 Accueil au
 * comptoir » relu deux fois n'apporte rien.
 *
 * Une à trois : c'est la base qui le borne (`reservation_activities_signature_steps`),
 * pas cet écran. Ici on peint ce qui arrive.
 */
export function EtapesExperience({
  steps,
}: {
  steps: readonly { title: string; body: string }[];
}) {
  if (steps.length === 0) return null;

  return (
    <section aria-labelledby="etapes-titre" className="mb-6">
      <h2
        id="etapes-titre"
        className="mb-3 text-sm font-black uppercase tracking-wide text-k-body"
      >
        Ce que vous allez vivre
      </h2>
      <ol className="space-y-3">
        {steps.map((etape, index) => (
          <li
            key={`${index}-${etape.title}`}
            className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-k-ink bg-k-yellow text-sm font-black tabular-nums text-k-ink"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-black leading-snug text-k-ink">
                  {etape.title}
                </h3>
                <p className="mt-1 whitespace-pre-line text-sm font-medium leading-relaxed text-k-body">
                  {etape.body}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * « POUR BIEN EN PROFITER » — la préparation.
 *
 * Une seule colonne en base (`preparation`) porte deux intentions du cahier : ce
 * qu'on conseille d'apporter à un Moment Signature, et les instructions d'un
 * Atelier Duo. Le titre change donc avec le format, le champ non — deux colonnes
 * auraient obligé le commerçant à comprendre laquelle remplir.
 */
export function PreparationExperience({
  kind,
  preparation,
}: {
  kind: ReserverActivityKind;
  preparation: string | null;
}) {
  if (!preparation) return null;

  return (
    <section
      aria-labelledby="preparation-titre"
      className="mb-6 rounded-2xl border-2 border-k-ink bg-white p-5"
    >
      <h2
        id="preparation-titre"
        className="text-sm font-black uppercase tracking-wide text-k-body"
      >
        {kind === "duo" ? "Avant de venir à deux" : "Pour bien en profiter"}
      </h2>
      <p className="mt-2 whitespace-pre-line text-sm font-medium leading-relaxed text-k-ink">
        {preparation}
      </p>
    </section>
  );
}

/**
 * LE BANDEAU DU DUO, et il est en HAUT pour une raison précise.
 *
 * « Cette expérience se vit à deux » change la décision de venir, pas seulement
 * le libellé du bouton. Le lire au moment du clic, sous la jauge, arriverait
 * trop tard pour celui qui pensait réserver seul — et la base l'aurait refusé
 * (`invalid_party_size`) sans qu'il comprenne pourquoi.
 */
export function BandeauDuo() {
  return (
    <p className="mb-6 rounded-2xl border-2 border-k-ink bg-sky-100 px-4 py-3 text-center text-sm font-black text-k-ink">
      <span aria-hidden>👥</span> Cette expérience se vit à deux : une
      réservation retient deux places.
    </p>
  );
}
