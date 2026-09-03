"use client";

import { Input, Label } from "@/components/ui/input";
import { InfoBulle, infoBulleTexteId } from "@/components/dashboard/info-bulle";
import { CodeTtlDaysField } from "@/components/dashboard/code-ttl-days-field";
import type { EtatChasse } from "@/components/hunts/studio/etat";
import type { HuntOrderMode } from "@/types/database";

/**
 * LE CONTENU DES ÉTAPES DU STUDIO DE LA CHASSE (VIT-40).
 *
 * ── AUCUN CONTRÔLE DE CE FICHIER NE PORTE DE `name` DE RÉGLAGE ──
 *
 * C'est la règle du socle, et elle ne se négocie pas : une étape qu'on quitte
 * est DÉMONTÉE. Un `name` posé ici disparaîtrait du formulaire de réglages, et
 * l'enregistrement automatique suivant effacerait la colonne — sur une action
 * qui réécrit neuf champs en bloc, c'est-à-dire sans un mot.
 *
 * Tout écrit donc dans `EtatChasse` par `majEtat` ; la charge utile est rendue
 * à part, en entier, par `ChampsCachesChasse`. Le seul `name` de ce fichier est
 * celui des boutons radio, qui ne sert qu'au GROUPEMENT natif du clavier —
 * `studio-chasse-order-choice`, un nom que l'action ne lit pas.
 */

const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500";

export interface ProprietesEtapeChasse {
  etat: EtatChasse;
  majEtat: (patch: Partial<EtatChasse>) => void;
  peutEditer: boolean;
}

function TitreEtape({ titre, aide }: { titre: string; aide: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-black text-k-ink">{titre}</h2>
      <p className="mt-1 text-sm text-k-body">{aide}</p>
    </div>
  );
}

// ── 1. Le nom de ma chasse ──────────────────────────────────

export function EtapeNom({
  etat,
  majEtat,
  peutEditer,
}: ProprietesEtapeChasse) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Le nom de ma chasse"
        aide="Il s'affiche en grand, en haut de chaque page que vos clients scannent."
      />
      <div className="max-w-sm">
        <Label htmlFor="studio-chasse-nom">Nom de la Chasse au QR</Label>
        <Input
          id="studio-chasse-nom"
          value={etat.name}
          onChange={(e) => majEtat({ name: e.target.value })}
          disabled={!peutEditer}
          maxLength={80}
          placeholder="Ex : La chasse au trésor du quartier"
        />
      </div>
    </div>
  );
}

// ── 4. Dans quel ordre on joue ──────────────────────────────

function ChoixOrdre({
  valeur,
  active,
  titre,
  aide,
  onSelect,
  disabled,
}: {
  valeur: HuntOrderMode;
  active: boolean;
  titre: string;
  aide: string;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input
        type="radio"
        /* Groupement natif SEULEMENT : ce nom n'est pas celui de la charge
           utile (`order_mode`), qui part depuis `ChampsCachesChasse`. */
        name="studio-chasse-order-choice"
        value={valeur}
        checked={active}
        onChange={onSelect}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
      />
      <span>
        <span className="font-bold text-k-ink">{titre}</span>
        <span className="block text-xs text-zinc-500">{aide}</span>
      </span>
    </label>
  );
}

export function EtapeOrdre({
  etat,
  majEtat,
  peutEditer,
}: ProprietesEtapeChasse) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Dans quel ordre on joue"
        aide="Vos clients suivent le parcours comme ils veulent, ou dans l'ordre que vous avez fixé."
      />

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-bold text-k-ink">
          Ordre des étapes
        </legend>
        <ChoixOrdre
          valeur="free"
          active={etat.order_mode === "free"}
          titre="Libre"
          aide="Les étapes peuvent être tamponnées dans n'importe quel ordre."
          onSelect={() => majEtat({ order_mode: "free" })}
          disabled={!peutEditer}
        />
        <ChoixOrdre
          valeur="ordered"
          active={etat.order_mode === "ordered"}
          titre="Imposé"
          aide="Les joueurs doivent suivre l'ordre des étapes (1, puis 2, puis 3…)."
          onSelect={() => majEtat({ order_mode: "ordered" })}
          disabled={!peutEditer}
        />
      </fieldset>

      <div>
        <Label htmlFor="studio-chasse-interval">
          Délai minimal entre deux tampons (secondes)
        </Label>
        <Input
          id="studio-chasse-interval"
          type="number"
          inputMode="numeric"
          min={0}
          max={86400}
          value={etat.min_scan_interval_seconds}
          onChange={(e) =>
            majEtat({ min_scan_interval_seconds: e.target.value })
          }
          disabled={!peutEditer}
          className="w-40"
          aria-describedby={infoBulleTexteId("aide-studio-chasse-interval")}
        />
        <InfoBulle
          id="aide-studio-chasse-interval"
          resume="À quoi sert ce délai ?"
          className="mt-2 max-w-md"
        >
          Anti-partage de photos du QR : il empêche de tamponner plusieurs
          étapes trop vite depuis un même téléphone. Sans lui, un joueur qui
          reçoit les photos des QR de toutes les étapes termine la chasse sans
          avoir bougé. 0 = désactivé.
        </InfoBulle>
      </div>
    </div>
  );
}

// ── 5. Quand ça se joue ─────────────────────────────────────

export function EtapeQuand({
  etat,
  majEtat,
  peutEditer,
  timeZone,
}: ProprietesEtapeChasse & { timeZone: string }) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Quand ça se joue"
        aide="Hors de cette fenêtre, les pages d'étapes deviennent indisponibles pour vos clients — les affiches restent en place."
      />

      <div className="flex flex-wrap gap-4">
        <div>
          <Label htmlFor="studio-chasse-debut">Début</Label>
          <Input
            id="studio-chasse-debut"
            type="datetime-local"
            value={etat.starts_at}
            onChange={(e) => majEtat({ starts_at: e.target.value })}
            disabled={!peutEditer}
            className="w-56"
          />
        </div>
        <div>
          <Label htmlFor="studio-chasse-fin">Fin</Label>
          <Input
            id="studio-chasse-fin"
            type="datetime-local"
            value={etat.ends_at}
            onChange={(e) => majEtat({ ends_at: e.target.value })}
            disabled={!peutEditer}
            className="w-56"
          />
        </div>
      </div>

      {/* LE FUSEAU EST CELUI DE L'ÉTABLISSEMENT, ET C'EST ÉCRIT. L'action
          relit la saisie avec `zonedDateTimeToIso(…, organization.timezone)` :
          sans cette phrase, un commerçant en déplacement lirait ces heures dans
          le fuseau de son téléphone et fermerait sa chasse trop tôt. */}
      <p className="text-xs text-zinc-500">
        Vide = sans borne. Heures de l&apos;établissement ({timeZone}).
      </p>
    </div>
  );
}

// ── 6. Le lot final ─────────────────────────────────────────

export function EtapeLot({
  etat,
  majEtat,
  peutEditer,
}: ProprietesEtapeChasse) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Le lot final"
        aide="Ce que gagne le joueur qui a tamponné toutes les étapes. Il est demandé pour ouvrir la chasse aux joueurs."
      />

      <div>
        <Label htmlFor="studio-chasse-lot">Lot (requis pour ouvrir)</Label>
        <Input
          id="studio-chasse-lot"
          value={etat.reward_label}
          onChange={(e) => majEtat({ reward_label: e.target.value })}
          disabled={!peutEditer}
          maxLength={80}
          placeholder="Ex : Un dessert offert"
          className="max-w-sm"
        />
      </div>

      <div>
        <Label htmlFor="studio-chasse-lot-details">Détails (optionnel)</Label>
        <textarea
          id="studio-chasse-lot-details"
          value={etat.reward_details}
          onChange={(e) => majEtat({ reward_details: e.target.value })}
          disabled={!peutEditer}
          maxLength={2000}
          rows={3}
          placeholder="Conditions, durée de validité, modalités de retrait…"
          className={textareaClass}
        />
      </div>

      <div>
        <Label htmlFor="studio-chasse-lot-stock">Stock (optionnel)</Label>
        <Input
          id="studio-chasse-lot-stock"
          type="number"
          inputMode="numeric"
          min={0}
          max={1000000}
          value={etat.reward_stock}
          onChange={(e) => majEtat({ reward_stock: e.target.value })}
          disabled={!peutEditer}
          placeholder="Illimité"
          className="w-40"
          aria-describedby={infoBulleTexteId("aide-studio-chasse-stock")}
        />
        <InfoBulle
          id="aide-studio-chasse-stock"
          resume="Le stock est-il obligatoire ici ?"
          className="mt-2 max-w-md"
        >
          Non : sur une chasse, le laisser VIDE signifie « illimité » — rien ne
          borne alors le nombre de codes émis. Une fois le stock épuisé, les
          joueurs qui terminent sont informés qu&apos;il n&apos;y a plus de lot.
        </InfoBulle>
      </div>

      {/* `champCache={false}` : dans un studio, la charge utile est rendue par
          `ChampsCachesChasse` et par lui seul. Le champ caché du composant
          vivrait ici, dans une étape démontable et HORS du formulaire de
          réglages — il ne partirait jamais tout en donnant l'illusion d'une
          charge complète. */}
      <fieldset disabled={!peutEditer}>
        <CodeTtlDaysField
          idPrefix="studio-chasse"
          value={etat.code_ttl_days}
          onChange={(next) => majEtat({ code_ttl_days: next })}
          champCache={false}
          emissionHint="Délai laissé au joueur pour présenter son code CHASSE- en caisse, à partir du moment où il TERMINE la chasse."
        />
      </fieldset>
    </div>
  );
}
