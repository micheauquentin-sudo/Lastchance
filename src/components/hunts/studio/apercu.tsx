"use client";

import { useMemo } from "react";
import { CadreApercu } from "@/components/studio/cadre-apercu";
import { HuntJourney } from "@/components/hunts/hunt-journey";
import { SkipLink } from "@/components/ui/skip-link";
import type { EtatChasse } from "@/components/hunts/studio/etat";
import type { HuntStep } from "@/types/database";

/**
 * L'APERÇU DE LA CHASSE — ET C'EST LA VRAIE PAGE, PAS UNE MAQUETTE (VIT-40).
 *
 * Il monte `HuntJourney` dans la MÊME coquille que `/hunt/[token]` (le fond
 * crème, le bandeau rayé kermesse, le `<main>`). Ce qui se voit ici est ce qui
 * sera servi.
 *
 * Une maquette approximative aurait été une seconde page joueur à tenir
 * d'accord avec la première. C'est le seul défaut qu'un aperçu ne doit jamais
 * avoir parce qu'il est INVISIBLE : rien ne casse, tout a l'air de
 * fonctionner, et l'écart ne se découvre qu'en ouvrant la vraie page
 * (ADR-152).
 *
 * ── CE QUI EST NEUTRALISÉ, ET SEULEMENT CELA ──
 *
 * `hunt-journey.tsx` importe DEUX actions, et c'est tout ce qu'il importe de
 * `@/actions` : `stampHuntStep` et `claimHuntReward`. Le drapeau `apercu` les
 * coupe toutes les deux, et coupe aussi la proposition de Passeport, qui
 * appelle la sienne. Rien d'autre n'est touché — pas une classe, pas un bloc.
 *
 * ── L'ÉTAT INITIAL EST FABRIQUÉ, JAMAIS DEMANDÉ ──
 *
 * `total` est le nombre d'étapes DÉJÀ chargées par la page, `done` vaut zéro et
 * `stamped` est vide : le commerçant n'a rien tamponné, et un tampon affiché
 * ferait croire à une progression qui n'existe pas. `completedCode` reste
 * `null` — un aperçu ne fabrique pas de code de retrait.
 *
 * ── LE SÉLECTEUR D'ÉTAPE ──
 *
 * Chaque étape de la chasse est une PAGE : le joueur en voit une par QR
 * scanné. Sans sélecteur, l'aperçu ne montrerait que la première, et le
 * commerçant qui règle le libellé de la troisième réglerait à l'aveugle. Le
 * sélecteur ne change que ce que la page AFFICHE ; il ne part jamais au
 * serveur, comme tous les outils d'un studio.
 *
 * `revealedHint` reste `null` quelle que soit l'étape choisie : sur la vraie
 * page, l'indice n'apparaît qu'APRÈS le tampon, et le montrer ici mentirait
 * sur le moment où le joueur le découvre. C'est l'étape des indices qui les
 * donne à relire, pas celle-ci.
 */
export function ApercuChasse({
  etat,
  etapes,
  positionApercu,
  onPositionApercu,
  organizationName,
  organizationId,
  logoUrl,
}: {
  etat: EtatChasse;
  /** Les étapes en base, dans l'ordre affiché par le studio. */
  etapes: HuntStep[];
  /** Position (1..n) de l'étape montrée dans l'aperçu. */
  positionApercu: number;
  onPositionApercu: (position: number) => void;
  organizationName: string;
  organizationId: string;
  logoUrl: string | null;
}) {
  const courante = useMemo(
    () =>
      etapes.find((e) => e.position === positionApercu) ?? etapes[0] ?? null,
    [etapes, positionApercu],
  );

  return (
    <CadreApercu
      /* 448 px, ET CE N'EST PAS UN CHOIX D'ESTHÉTIQUE : c'est `max-w-md`, la
         borne que `HuntJourney` pose sur son propre conteneur. Un cadre plus
         large rendrait une mise en page que personne ne verra. La valeur reste
         LITTÉRALE — Tailwind ne compile pas une classe construite à
         l'exécution. */
      classeCadre="w-full max-w-[448px]"
      legende="Aperçu — la vraie page de vos clients. Vos modifications s'enregistrent toutes seules."
      banniere={
        <div className="w-full max-w-[448px] shrink-0 space-y-2">
          <p
            role="status"
            className="rounded-xl border-2 border-dashed border-k-ink/40 bg-k-yellow/40 px-3 py-2 text-xs font-black text-k-ink"
          >
            Aperçu : « Valider mon passage » ne fait rien ici. Vos clients, eux,
            tamponneront pour de vrai.
          </p>
          {etapes.length > 0 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="studio-chasse-apercu-etape"
                className="text-xs font-bold text-k-ink"
              >
                L&apos;étape que je regarde
              </label>
              <select
                id="studio-chasse-apercu-etape"
                value={courante?.position ?? 1}
                onChange={(e) => onPositionApercu(Number(e.target.value))}
                className="rounded-xl border-2 border-k-ink bg-white px-2 py-1 text-xs font-bold text-k-ink"
              >
                {etapes.map((etape) => (
                  <option key={etape.id} value={etape.position}>
                    n° {etape.position} — {etape.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      }
    >
      {/* LA COQUILLE DE `/hunt/[token]`, reproduite trait pour trait : le fond,
          le bandeau rayé et le `<main>`. Le `SkipLink` en fait partie — sans
          lui l'aperçu ne montrerait pas la page servie, et c'est justement là
          qu'un écart passe inaperçu. */}
      <div className="min-h-dvh bg-k-bg">
        <SkipLink />
        <div
          aria-hidden
          className="h-3 w-full border-b-2 border-k-ink"
          style={{
            background:
              "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
          }}
        />
        <main id="contenu" tabIndex={-1} className="outline-none">
          <HuntJourney
            apercu
            organizationName={organizationName}
            organizationId={organizationId}
            logoUrl={logoUrl}
            huntName={etat.name}
            orderMode={etat.order_mode}
            step={{
              position: courante?.position ?? 1,
              label: courante?.label ?? "Votre première étape",
            }}
            reward={{
              label: etat.reward_label,
              details: etat.reward_details || null,
            }}
            initial={{
              total: etapes.length,
              done: 0,
              stamped: [],
              completedCode: null,
              rewardSoldOut: false,
            }}
            revealedHint={null}
          />
        </main>
      </div>
    </CadreApercu>
  );
}
