"use client";

import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import {
  CAPACITE_CRENEAU_MAX,
  CAPACITE_CRENEAU_MIN,
  HORIZON_MAX,
  HORIZON_MIN,
} from "@/lib/reserver-horaires";
import { DUREES_SUGGEREES } from "@/components/reserver/horaires-panneau";
import type {
  EtatReservation,
  ModeReservation,
} from "@/components/reserver/studio/etat";

/**
 * LES ÉTAPES DU STUDIO DE RÉSERVATION — la colonne de gauche (VIT-49).
 *
 * ── UNE SEULE ÉTAPE EST ÉCRITE ICI, ET C'EST DÉLIBÉRÉ ──
 *
 * Ce studio réutilise les panneaux du tableau de bord pour SEPT de ses huit
 * étapes : `ActiviteReglagesForm`, `SemaineType`, `Fermetures`, `SallePanneau`,
 * `Generation`, `PublicShare` et `InvitationsPanneau` sont montés tels quels,
 * avec leurs propres `<form>` et leurs propres actions (ADR-156). Ils écrivent
 * d'AUTRES TABLES que la ligne d'activité — des plages, des fermetures, des
 * tables, des invitations — par INSERT et DELETE, donc rien à recopier dans
 * l'état du studio et rien à écraser par absence.
 *
 * La huitième — « Ce que le client peut réserver » — est écrite ici, et elle ne
 * pouvait pas être réutilisée. `ReglagesRendezVous`, dans `horaires-panneau`,
 * porte SON PROPRE formulaire vers `enregistrerReglagesRendezVous`, c'est-à-dire
 * exactement l'action que la coquille poste. Le monter ici aurait mis DEUX
 * ÉCRIVAINS sur les mêmes cinq colonnes : celui de la coquille, piloté par
 * l'état, et le sien, figé sur les valeurs du serveur. Le dernier à poster
 * gagnait, et le commerçant aurait vu ses réglages revenir en arrière sans
 * comprendre. C'est le piège que les salons ont nommé, pris ici par l'autre
 * bout.
 *
 * D'où la règle, qui est celle du socle : les contrôles ci-dessous ne portent
 * AUCUN `name`. Ils écrivent dans `EtatReservation`, et
 * `ChampsCachesReservation` traduit cet état en formulaire.
 */

/**
 * L'ÉTAPE QUI DÉCIDE DU RESTE.
 *
 * Changer de mode ici ne règle pas seulement une colonne : il redessine le FIL
 * D'ÉTAPES (`etapesStudioReservation`). Passer en prise de rendez-vous fait
 * apparaître quatre étapes — horaires, fermetures, salle, créneaux — et
 * repasser en Moment les retire. L'écran le DIT, sous les boutons de mode,
 * plutôt que de laisser la barre changer toute seule dans le dos du
 * commerçant : c'est ADR-163 appliqué à un réglage qui ne change pas un autre
 * jeu, mais l'écran lui-même.
 */
export function EtapeMode({
  etat,
  onMode,
  onEtat,
  peutEditer,
}: {
  etat: EtatReservation;
  onMode: (mode: ModeReservation) => void;
  onEtat: (patch: Partial<EtatReservation>) => void;
  peutEditer: boolean;
}) {
  const rendezVous = etat.booking_mode === "rendez_vous";

  return (
    <Card>
      <h2 className="font-semibold">Ce que le client peut réserver</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-500">
        Un <strong>Moment</strong> se compose créneau par créneau — un atelier,
        une dégustation, une date précise. Une{" "}
        <strong>prise de rendez-vous</strong> se décrit une fois en horaires, et
        les créneaux se génèrent tout seuls.
      </p>

      <fieldset disabled={!peutEditer}>
        <legend className="mb-1.5 text-sm font-bold text-k-ink">
          Comment naissent les créneaux
        </legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { valeur: "moment", label: "Moment — créneaux à la main" },
              {
                valeur: "rendez_vous",
                label: "Rendez-vous — horaires récurrents",
              },
            ] as const
          ).map((choix) => (
            <button
              key={choix.valeur}
              type="button"
              aria-pressed={etat.booking_mode === choix.valeur}
              onClick={() => onMode(choix.valeur)}
              className={`cursor-pointer rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors ${
                etat.booking_mode === choix.valeur
                  ? "border-k-ink bg-k-yellow/40 shadow-[3px_3px_0_var(--color-k-ink)]"
                  : "border-k-ink/20 bg-white hover:border-k-ink/50"
              }`}
            >
              {choix.label}
            </button>
          ))}
        </div>

        {/* LA PORTÉE, LÀ OÙ LA MAIN EST POSÉE — voir l'en-tête du composant. */}
        <p className="mt-2 text-xs font-semibold text-zinc-500">
          {rendezVous
            ? "La prise de rendez-vous ajoute quatre étapes à votre parcours : vos horaires, vos fermetures, votre salle et la génération des créneaux."
            : "Un Moment n'a ni horaires récurrents, ni salle, ni génération : vous posez vos créneaux un par un depuis vos réservations."}
        </p>

        {rendezVous && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="studio-rdv-duree">
                Durée d&apos;un rendez-vous (minutes)
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="studio-rdv-duree"
                  type="number"
                  min={5}
                  max={480}
                  value={etat.duration_minutes ?? ""}
                  onChange={(e) =>
                    onEtat({
                      duration_minutes:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="w-24 text-center"
                />
                {DUREES_SUGGEREES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={etat.duration_minutes === d}
                    onClick={() => onEtat({ duration_minutes: d })}
                    className={`rounded-lg border-2 px-2 py-1 text-xs font-black text-k-ink transition-colors ${
                      etat.duration_minutes === d
                        ? "border-k-ink bg-k-yellow/40"
                        : "border-k-ink/20 bg-white hover:border-k-ink/50"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-zinc-500">
                C&apos;est aussi le pas de la grille : une plage de 9 h à 11 h en{" "}
                {etat.duration_minutes ?? 30} minutes donne{" "}
                {Math.max(
                  0,
                  Math.floor(120 / (etat.duration_minutes || 30)),
                )}{" "}
                créneaux.
              </p>
            </div>

            <div>
              <Label htmlFor="studio-rdv-capacite">Personnes par créneau</Label>
              <Input
                id="studio-rdv-capacite"
                type="number"
                min={CAPACITE_CRENEAU_MIN}
                max={CAPACITE_CRENEAU_MAX}
                value={etat.slot_capacity ?? ""}
                onChange={(e) =>
                  onEtat({
                    slot_capacity:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="w-24 text-center"
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                <strong>1</strong> pour un rendez-vous individuel. Au-delà,
                plusieurs clients partagent le même horaire.
              </p>
            </div>

            {/* HORIZON ET DÉLAI VIVENT ICI, ET NON DANS UNE ÉTAPE À EUX.
                Le découpage proposé les séparait ; ils partagent la même action
                et le même `update` que le mode, la durée et la capacité — les
                séparer aurait fait deux écrans pour un seul geste, et le socle
                aurait de toute façon posté les cinq champs depuis les deux. */}
            <div>
              <Label htmlFor="studio-rdv-horizon">
                Réservable jusqu&apos;à (jours)
              </Label>
              <Input
                id="studio-rdv-horizon"
                type="number"
                min={HORIZON_MIN}
                max={HORIZON_MAX}
                value={etat.booking_horizon_days}
                onChange={(e) =>
                  onEtat({ booking_horizon_days: Number(e.target.value) })
                }
                className="w-24 text-center"
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                Au-delà, vos clients ne voient rien à réserver.
              </p>
            </div>

            <div>
              <Label htmlFor="studio-rdv-delai">
                Délai de prévenance (minutes)
              </Label>
              <Input
                id="studio-rdv-delai"
                type="number"
                min={0}
                max={20160}
                value={etat.lead_time_minutes}
                onChange={(e) =>
                  onEtat({ lead_time_minutes: Number(e.target.value) })
                }
                className="w-24 text-center"
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                Aucun créneau proposé avant ce délai — évite le rendez-vous pris
                pour dans dix minutes. <strong>0</strong> = sans délai.
              </p>
            </div>
          </div>
        )}
      </fieldset>
    </Card>
  );
}
