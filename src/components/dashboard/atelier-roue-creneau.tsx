"use client";

import { InfoBulle } from "@/components/dashboard/info-bulle";
import { Label } from "@/components/ui/input";

/**
 * LES CONTRÔLES DU CRÉNEAU D'UNE ROUE — extraits de
 * `wheel-schedule-editor.tsx` pour que le STUDIO les monte sans les recopier
 * (VIT-46).
 *
 * ── DEUX APPELANTS, UNE SEULE DIFFÉRENCE : LE `name` ──
 *
 * Dans l'atelier, ces contrôles vivent DANS le `<form>` d'`updateWheelSchedule`
 * et portent donc les `name` de la charge (`schedule_days`,
 * `schedule_start_hour`, `schedule_end_hour`). Dans un studio, aucun contrôle
 * visible ne porte de `name` : une étape qu'on quitte est démontée, et la
 * charge partirait amputée — ici, « aucun jour coché » signifiant TOUS les
 * jours, une case démontée rouvrirait le jeu en silence. Le studio passe donc
 * `nomme={false}` et poste depuis son état.
 *
 * ── ILS SONT CONTRÔLÉS DANS LES DEUX CAS ──
 *
 * L'éditeur d'origine s'appuyait sur `defaultChecked` / `defaultValue` et
 * laissait le DOM porter la vérité. C'est tenable quand le formulaire est
 * l'unique lecteur ; ça ne l'est plus dès qu'un aperçu ou une signature
 * d'enregistrement doit lire la même chose. Les valeurs postées sont
 * identiques — c'est le même formulaire, avec une source de vérité de plus.
 */

// 0=dimanche..6=samedi (comme Date.getDay()), affichés Lun→Dim.
const DAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" },
];

const HOURS = Array.from({ length: 25 }, (_, h) => h);

export function ChampsCreneau({
  debut,
  fin,
  jours,
  onDebut,
  onFin,
  onJours,
  nomme = true,
  disabled = false,
}: {
  /** Heure de début, `""` = pas de borne. */
  debut: string;
  fin: string;
  /** Jours cochés (0..6). Liste vide = tous les jours. */
  jours: readonly number[];
  onDebut: (valeur: string) => void;
  onFin: (valeur: string) => void;
  onJours: (jours: number[]) => void;
  /** Les champs portent-ils les `name` de la charge ? Faux dans un studio. */
  nomme?: boolean;
  disabled?: boolean;
}) {
  const basculer = (jour: number, coche: boolean) => {
    onJours(
      coche ? [...jours, jour] : jours.filter((j) => j !== jour),
    );
  };

  return (
    <>
      <div>
        <Label>Jours actifs</Label>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <label
              key={d.value}
              className="cursor-pointer select-none rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-700 has-[:checked]:border-orange-400 has-[:checked]:bg-orange-50 has-[:checked]:text-orange-700"
            >
              <input
                type="checkbox"
                name={nomme ? "schedule_days" : undefined}
                value={d.value}
                checked={jours.includes(d.value)}
                onChange={(e) => basculer(d.value, e.target.checked)}
                disabled={disabled}
                className="sr-only"
              />
              {d.label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-600">
          Aucun jour coché = tous les jours.
        </p>
        <InfoBulle
          id="aide-creneau-jours"
          resume="Aucun jour coché : le jeu est-il fermé ?"
          className="mt-2"
        >
          Non — c&apos;est l&apos;inverse. Zéro case cochée signifie{" "}
          <strong>tous les jours</strong>, pas « aucun jour » : le jeu tourne en
          permanence. Ne cochez que si vous voulez le RESTREINDRE, par exemple
          au week-end.
        </InfoBulle>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="schedule_start_hour">Début</Label>
          <select
            id="schedule_start_hour"
            name={nomme ? "schedule_start_hour" : undefined}
            value={debut}
            onChange={(e) => onDebut(e.target.value)}
            disabled={disabled}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">—</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="schedule_end_hour">Fin</Label>
          <select
            id="schedule_end_hour"
            name={nomme ? "schedule_end_hour" : undefined}
            value={fin}
            onChange={(e) => onFin(e.target.value)}
            disabled={disabled}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">—</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-zinc-600">
        Fin exclusive. Un début supérieur à la fin (ex. 22h→2h) couvre la nuit.
      </p>
      <InfoBulle
        id="aide-creneau-fin"
        resume="« Fin exclusive », ça veut dire quoi ?"
      >
        L&apos;heure de fin n&apos;est pas jouable. De 17h à 19h, un client peut
        jouer à 17h00 et à 18h59, mais plus à 19h00. Pour couvrir la soirée
        entière jusqu&apos;à minuit, choisissez 24h en fin.
      </InfoBulle>
      <InfoBulle
        id="aide-creneau-nuit"
        resume="Comment ouvrir de 22h à 2h du matin ?"
      >
        Mettez simplement 22h en début et 2h en fin. Un début SUPÉRIEUR à la fin
        n&apos;est pas une erreur : il se lit comme un créneau qui traverse
        minuit. Les jours cochés désignent alors le jour où le créneau COMMENCE.
      </InfoBulle>
    </>
  );
}
