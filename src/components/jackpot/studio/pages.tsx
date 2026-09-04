"use client";

import Link from "next/link";
import { Input, Label } from "@/components/ui/input";
import { InfoBulle, infoBulleTexteId } from "@/components/dashboard/info-bulle";
import { CodeTtlDaysField } from "@/components/dashboard/code-ttl-days-field";
import { AtelierJackpotVerification } from "@/components/dashboard/atelier-jackpot-verification";
import { etapesJackpot } from "@/components/dashboard/atelier-jackpot-etapes";
import {
  formatDurationLabel,
  jackpotDrawModeSummary,
  jackpotPeriodOptions,
} from "@/components/jackpot/jackpot-state";
import {
  frequenceResolueCagnotte,
  type EtatCagnotte,
} from "@/components/jackpot/studio/etat";
import type { EntreeActivationJackpot } from "@/lib/activation/jackpot";
import type { JackpotDrawMode, JackpotValidationMode } from "@/types/database";

/**
 * LE CONTENU DES ÉTAPES DU STUDIO DE LA CAGNOTTE (VIT-44).
 *
 * ── AUCUN CONTRÔLE DE CE FICHIER NE PORTE DE `name` DE CHARGE UTILE ──
 *
 * C'est la règle du socle, et elle ne se négocie pas : une étape qu'on quitte
 * est DÉMONTÉE. Un `name` posé ici disparaîtrait du formulaire de réglages, et
 * l'enregistrement automatique suivant écrirait le défaut du schéma à sa place
 * — sur une action qui réécrit toutes ses colonnes en bloc, c'est-à-dire sans
 * un mot. Trois de ces défauts sont muets et coûteux : `public_slug` à `null`
 * (les QR imprimés meurent), `reward_label` à `""` (l'activation se bloque),
 * les deux montants d'affichage à `0`.
 *
 * Tout écrit donc dans `EtatCagnotte` par `majEtat` ; la charge utile est
 * rendue à part, en entier, depuis ce seul état (`ChampsCachesCagnotte`).
 *
 * Les `name` que l'on voit ici appartiennent à des GROUPES de boutons radio —
 * un navigateur en a besoin pour lier les choix entre eux — et sont
 * délibérément préfixés `studio-cagnotte-…` : aucun ne correspond à un champ
 * que l'action lit.
 */

const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500";
const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500";

export interface ProprietesEtape {
  etat: EtatCagnotte;
  majEtat: (patch: Partial<EtatCagnotte>) => void;
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

// ── 1. Le nom de la cagnotte ────────────────────────────────

export function EtapeNom({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Le nom de la cagnotte"
        aide="Il s'affiche en grand, en haut de la page que voient vos clients."
      />
      <div className="max-w-sm">
        <Label htmlFor="studio-cagnotte-nom">Nom de la cagnotte</Label>
        <Input
          id="studio-cagnotte-nom"
          value={etat.name}
          onChange={(e) => majEtat({ name: e.target.value })}
          disabled={!peutEditer}
          maxLength={80}
          placeholder="Ex : La cagnotte du comptoir"
        />
      </div>
    </div>
  );
}

// ── 2. Comment on participe ─────────────────────────────────

/**
 * LE MODE, LA ROTATION, LA FRÉQUENCE ET L'ÉCHÉANCE DU CODE GAGNANT.
 *
 * Ces quatre réglages voyagent ensemble parce que le SCHÉMA les lie :
 * `refineCampaign` impose un plancher de fréquence qui dépend du MODE ET de la
 * ROTATION. Les séparer aurait rendu ce refus insoluble — le commerçant lirait,
 * sur une étape, un reproche portant sur un réglage qu'il ne voit pas.
 *
 * L'ÉCRAN COMPTOIR N'EST QU'UN LIEN, et c'est délibéré : c'est une TABLETTE
 * tenue par la caisse, face aux clients, avec sa propre garde de permission.
 * L'absorber ici ferait entrer dans le studio une autorisation qui n'est pas la
 * sienne.
 */
export function EtapeParticipation({
  etat,
  majEtat,
  peutEditer,
  campaignId,
}: ProprietesEtape & { campaignId: string }) {
  const optionsRotation = jackpotPeriodOptions(etat.rotating_period_seconds);
  const frequence = frequenceResolueCagnotte(etat);

  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Comment on participe"
        aide="Le geste qui fait monter la jauge, la fréquence autorisée, et jusqu'à quand un lot gagné reste retirable."
      />

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-bold text-k-ink">
          Comment participer ?
        </legend>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="radio"
            name="studio-cagnotte-mode-choice"
            value="rotating_code"
            checked={etat.validation_mode === "rotating_code"}
            onChange={() => majEtat({ validation_mode: "rotating_code" })}
            disabled={!peutEditer}
            className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
          />
          <span>
            <span className="font-bold text-k-ink">Code au comptoir</span>
            <span className="block text-xs text-zinc-500">
              Un code à 6 chiffres s&apos;affiche sur un écran au comptoir et
              change régulièrement. Le client le saisit pour participer.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="radio"
            name="studio-cagnotte-mode-choice"
            value="staff"
            checked={etat.validation_mode === "staff"}
            onChange={() => majEtat({ validation_mode: "staff" })}
            disabled={!peutEditer}
            className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
          />
          <span>
            <span className="font-bold text-k-ink">Validation en caisse</span>
            <span className="block text-xs text-zinc-500">
              Le client présente le QR de sa page ; vous le scannez en caisse
              pour valider sa participation.
            </span>
          </span>
        </label>
      </fieldset>

      {/* EXCLUSIVE AU CODE AU COMPTOIR. En « Validation en caisse » la rotation
          ne gouverne rien : la laisser réglable ferait croire qu'un code tourne
          là où le mode n'en émet aucun. Elle quitte l'ÉCRAN, jamais la CHARGE —
          `rotatingPeriodSchema` est un `entierRequis`, où un champ non rendu
          vaut un refus explicite, et revenir au mode comptoir doit retrouver le
          réglage d'avant plutôt qu'un zéro. Les champs cachés du studio la
          rendent donc toujours, depuis l'état.

          C'est aussi ce qui remplace l'infobulle de l'atelier, laquelle devait
          EXPLIQUER pourquoi un réglage sans effet restait à l'écran : ici la
          question ne se pose plus. */}
      {etat.validation_mode === "rotating_code" && (
        <div>
          <Label htmlFor="studio-cagnotte-rotation">
            Rotation du code au comptoir
          </Label>
          <select
            id="studio-cagnotte-rotation"
            value={etat.rotating_period_seconds}
            onChange={(e) =>
              majEtat({ rotating_period_seconds: Number(e.target.value) })
            }
            disabled={!peutEditer}
            className={`${selectClass} max-w-sm`}
            aria-describedby={infoBulleTexteId("aide-studio-cagnotte-rotation")}
          >
            {optionsRotation.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <InfoBulle
            id="aide-studio-cagnotte-rotation"
            resume="Faut-il une rotation courte ou longue ?"
            className="mt-2 max-w-sm"
          >
            Plus la rotation est courte, plus il est difficile de tricher à
            distance — un code photographié puis envoyé à un ami expire vite (5
            minutes au maximum). En contrepartie, elle relève le délai minimal
            entre deux participations, qui vaut le double de la rotation.
          </InfoBulle>
        </div>
      )}

      <div>
        <Label htmlFor="studio-cagnotte-frequence">
          Fréquence de participation
        </Label>
        <select
          id="studio-cagnotte-frequence"
          value={frequence.value}
          onChange={(e) =>
            majEtat({
              min_participation_interval_seconds: Number(e.target.value),
            })
          }
          disabled={!peutEditer}
          aria-describedby="studio-cagnotte-frequence-help"
          className={`${selectClass} max-w-sm`}
        >
          {frequence.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div id="studio-cagnotte-frequence-help" className="mt-1.5 space-y-1">
          <p className="text-xs text-zinc-500">
            Anti-abus : empêche un même joueur de participer plusieurs fois trop
            rapidement.
          </p>
          {frequence.floorSeconds > 0 && (
            <p className="text-xs text-zinc-500">
              {etat.validation_mode === "rotating_code" ? (
                <>
                  Le mode « Code au comptoir » impose au moins{" "}
                  {formatDurationLabel(frequence.floorSeconds)} (le double de la
                  rotation, 5 min minimum) : un code reste valable le temps de
                  deux rotations, sans ce délai il vaudrait deux participations.
                </>
              ) : (
                <>
                  Le mode « Validation en caisse » impose au moins{" "}
                  {formatDurationLabel(frequence.floorSeconds)} : le QR présenté
                  reste scannable quelques minutes.
                </>
              )}
            </p>
          )}
          {/* LE RÉGLAGE EST DÉJÀ CORRIGÉ DANS LA CHARGE, PAS SEULEMENT ICI.
              `chargeReglagesCagnotte` poste `frequenceResolueCagnotte(...).value`
              — sans quoi changer de mode pendant que CETTE étape est fermée
              enverrait une fréquence sous le plancher, et le serveur refuserait
              tout l'enregistrement sur un écran où rien ne bouge. */}
          {frequence.adjusted && (
            <p role="status" className="text-xs font-semibold text-amber-700">
              Réglage ajusté sur {formatDurationLabel(frequence.value)} pour
              rester compatible avec le mode choisi.
            </p>
          )}
        </div>
      </div>

      {/* `champCache={false}` : le champ caché de ce composant vivrait dans une
          étape DÉMONTABLE, hors du formulaire de réglages — il ne partirait
          jamais, et `formData.has()` serait faux à chaque enregistrement.
          C'est `ChampsCachesCagnotte` qui le rend, toujours. */}
      <CodeTtlDaysField
        idPrefix="studio-cagnotte"
        champCache={false}
        value={etat.code_ttl_days}
        onChange={(v) => majEtat({ code_ttl_days: v })}
        emissionHint="Délai laissé au gagnant pour présenter son code JACKPOT- en caisse, à partir du TIRAGE qui l'a désigné."
      />

      {etat.validation_mode === "rotating_code" && (
        <div className="rounded-2xl border-2 border-k-ink/25 bg-white p-4">
          <p className="text-sm font-black text-k-ink">L&apos;écran comptoir</p>
          <p className="mt-1 text-sm font-semibold text-k-body">
            C&apos;est la tablette posée au comptoir, face aux clients : elle
            affiche la jauge géante et le code qui tourne. Sans elle, personne ne
            peut participer dans ce mode.
          </p>
          <Link
            href={`/dashboard/jackpot/${campaignId}/comptoir`}
            className="k-btn-sm mt-3 inline-flex items-center gap-2 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-bold text-k-ink"
          >
            Ouvrir l&apos;écran comptoir →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── 3. L'objectif à atteindre ───────────────────────────────

export function EtapeObjectif({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="L'objectif à atteindre"
        aide="Le nombre de participations qui remplit la jauge. C'est le grand « 12 / 50 » que vos clients suivent."
      />
      <div>
        <Label htmlFor="studio-cagnotte-objectif">Objectif de la jauge</Label>
        <Input
          id="studio-cagnotte-objectif"
          type="number"
          inputMode="numeric"
          min={1}
          max={1_000_000}
          value={etat.threshold}
          onChange={(e) => majEtat({ threshold: e.target.value })}
          disabled={!peutEditer}
          className="w-40"
          aria-describedby="studio-cagnotte-objectif-help"
        />
        <p
          id="studio-cagnotte-objectif-help"
          className="mt-1.5 max-w-xl text-xs text-zinc-500"
        >
          {etat.draw_mode === "date_draw"
            ? "En « Tirage à date », l'objectif ne déclenche rien : il donne seulement une progression à suivre, le tirage ayant lieu à la date que vous fixez."
            : "Nombre de participations à atteindre pour déclencher le jackpot."}
        </p>
      </div>
    </div>
  );
}

// ── 4. Comment le gagnant est désigné ───────────────────────

const MODES_TIRAGE: { value: JackpotDrawMode; label: string }[] = [
  { value: "threshold_draw", label: "🎯 Tirage à l'objectif" },
  { value: "rescan_win", label: "⚡ Gain instantané au rescan" },
  { value: "date_draw", label: "🗓️ Tirage à date" },
];

/**
 * LE MODE DE TIRAGE COMMANDE LES DEUX CHAMPS QUI LE SUIVENT.
 *
 * `campaignFieldsForMode` écrase `win_probability` hors de `rescan_win` et
 * `draw_at` hors de `date_draw` — c'est le miroir des CHECK SQL, et sans lui le
 * commerçant récolterait une erreur 23514 brute. Les deux champs quittent donc
 * l'ÉCRAN avec leur mode, mais JAMAIS la charge : leur saisie doit survivre à un
 * aller-retour entre deux modes tant que rien n'a été enregistré.
 */
export function EtapeTirage({
  etat,
  majEtat,
  peutEditer,
  timeZone,
}: ProprietesEtape & { timeZone: string }) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Comment le gagnant est désigné"
        aide="Ce qui se passe une fois la jauge pleine — ou à la date que vous fixez."
      />

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-bold text-k-ink">
          Comment le jackpot se remporte
        </legend>
        {MODES_TIRAGE.map((m) => (
          <label
            key={m.value}
            className="flex cursor-pointer items-start gap-3 text-sm"
          >
            <input
              type="radio"
              name="studio-cagnotte-draw-choice"
              value={m.value}
              checked={etat.draw_mode === m.value}
              onChange={() => majEtat({ draw_mode: m.value })}
              disabled={!peutEditer}
              className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
            />
            <span>
              <span className="font-bold text-k-ink">{m.label}</span>
              <span className="block text-xs text-zinc-500">
                {jackpotDrawModeSummary(m.value)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {etat.draw_mode === "rescan_win" && (
        <div>
          <Label htmlFor="studio-cagnotte-winprob">
            Probabilité de gain (0 à 1)
          </Label>
          <Input
            id="studio-cagnotte-winprob"
            type="number"
            step="0.001"
            min={0}
            max={1}
            value={etat.win_probability}
            onChange={(e) => majEtat({ win_probability: e.target.value })}
            disabled={!peutEditer}
            placeholder="Auto"
            className="w-40"
            aria-describedby="studio-cagnotte-winprob-help"
          />
          <p
            id="studio-cagnotte-winprob-help"
            className="mt-1.5 max-w-xl text-xs text-zinc-500"
          >
            Chance qu&apos;une participation gagne une fois le jackpot armé.
            Laissez vide pour la valeur automatique (1 ÷ objectif).
          </p>
        </div>
      )}

      {etat.draw_mode === "date_draw" && (
        <div>
          <Label htmlFor="studio-cagnotte-drawat">
            Date et heure du tirage
          </Label>
          <Input
            id="studio-cagnotte-drawat"
            type="datetime-local"
            value={etat.draw_at}
            onChange={(e) => majEtat({ draw_at: e.target.value })}
            disabled={!peutEditer}
            className="w-64"
            aria-describedby="studio-cagnotte-drawat-help"
          />
          <p
            id="studio-cagnotte-drawat-help"
            className="mt-1.5 max-w-xl text-xs text-zinc-500"
          >
            Le gagnant est tiré au sort à cette date parmi tous les
            participants. Heure de l&apos;établissement ({timeZone}).
            Obligatoire pour ouvrir en mode « Tirage à date ».
          </p>
        </div>
      )}
    </div>
  );
}

// ── 5. Le lot et combien j'en ai ────────────────────────────

export function EtapeLot({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Le lot et combien j'en ai"
        aide="Ce que vos clients voient sous le montant, et le nombre de fois où vous êtes prêt à le donner."
      />

      <div className="max-w-sm">
        <Label htmlFor="studio-cagnotte-lot">Lot</Label>
        <Input
          id="studio-cagnotte-lot"
          value={etat.reward_label}
          onChange={(e) => majEtat({ reward_label: e.target.value })}
          disabled={!peutEditer}
          maxLength={120}
          placeholder="Ex : Un magnum de champagne"
        />
      </div>

      <div>
        <Label htmlFor="studio-cagnotte-lot-details">
          Détails (optionnel)
        </Label>
        <textarea
          id="studio-cagnotte-lot-details"
          value={etat.reward_details}
          onChange={(e) => majEtat({ reward_details: e.target.value })}
          disabled={!peutEditer}
          maxLength={2000}
          rows={2}
          placeholder="Conditions, validité, modalités de retrait…"
          className={textareaClass}
        />
      </div>

      <div>
        <Label htmlFor="studio-cagnotte-stock">
          Nombre de gagnants (stock, obligatoire)
        </Label>
        <Input
          id="studio-cagnotte-stock"
          type="number"
          inputMode="numeric"
          min={0}
          max={1_000_000}
          value={etat.reward_stock}
          onChange={(e) => majEtat({ reward_stock: e.target.value })}
          disabled={!peutEditer}
          className="w-40"
          aria-describedby="studio-cagnotte-stock-help"
        />
        <p
          id="studio-cagnotte-stock-help"
          className="mt-1.5 max-w-xl text-xs text-zinc-500"
        >
          Ce nombre plafonne les gagnants : chaque cycle gagné le décompte, et
          au-delà plus aucun tirage n&apos;a lieu. C&apos;est ce qui borne votre
          engagement, quel que soit le nombre de participants (0 = épuisé / en
          pause).
        </p>
      </div>
    </div>
  );
}

// ── 6. Le montant qui s'affiche ─────────────────────────────

export function EtapeMontant({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Le montant qui s'affiche"
        aide={
          <>
            Le grand chiffre en euros, en haut de la page. Il monte à chaque
            participation.{" "}
            <strong className="font-semibold text-zinc-700">
              Purement visuel
            </strong>{" "}
            : le vrai lot reste celui de l&apos;étape précédente.
          </>
        }
      />

      <div className="flex flex-wrap gap-4">
        <div>
          <Label htmlFor="studio-cagnotte-base">Montant de départ (€)</Label>
          <Input
            id="studio-cagnotte-base"
            type="number"
            step="0.01"
            min={0}
            value={etat.display_base}
            onChange={(e) => majEtat({ display_base: e.target.value })}
            disabled={!peutEditer}
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="studio-cagnotte-increment">
            Ajout par participation (€)
          </Label>
          <Input
            id="studio-cagnotte-increment"
            type="number"
            step="0.01"
            min={0}
            value={etat.display_increment}
            onChange={(e) => majEtat({ display_increment: e.target.value })}
            disabled={!peutEditer}
            className="w-40"
          />
        </div>
      </div>

      <p className="max-w-xl text-xs text-zinc-500">
        L&apos;aperçu montre le montant de DÉPART : c&apos;est ce que lit le tout
        premier client. Avec ces réglages, la jauge pleine afficherait{" "}
        <strong className="font-black text-k-ink">
          {montantALObjectif(etat)}
        </strong>
        .
      </p>
    </div>
  );
}

/**
 * Ce que le compteur affichera une fois l'objectif atteint — la seule question
 * que le commerçant se pose vraiment en réglant un incrément, et à laquelle
 * l'atelier ne répondait pas.
 *
 * Les trois saisies sont BRUTES : une valeur illisible vaut zéro ici, jamais un
 * `NaN` affiché à l'écran.
 */
function montantALObjectif(etat: EtatCagnotte): string {
  const nombre = (brut: string) => {
    const n = Number(brut.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const objectif = Number.parseInt(etat.threshold, 10);
  const total =
    nombre(etat.display_base) +
    nombre(etat.display_increment) *
      (Number.isFinite(objectif) && objectif > 0 ? objectif : 0);
  return total.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
}

// ── 7. Mon message aux clients ──────────────────────────────

/**
 * LE TEXTE LIBRE ET L'ADRESSE DU LIEN, ENSEMBLE.
 *
 * Les deux sont ce que la page publique porte en plus des chiffres : ce qu'on y
 * lit, et par quelle adresse on y arrive. Le slug est le champ le plus
 * dangereux du module — une adresse changée laisse les affiches déjà collées en
 * vitrine pointer sur une page qui n'existe plus — d'où l'infobulle, reprise
 * mot pour mot de l'atelier.
 */
export function EtapeMessage({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Mon message aux clients"
        aide="Ce que vos clients lisent sous la jauge, et l'adresse à laquelle ils arrivent."
      />

      <div>
        <Label htmlFor="studio-cagnotte-message">
          Vos actualités sur la page (optionnel)
        </Label>
        <textarea
          id="studio-cagnotte-message"
          value={etat.merchant_content}
          onChange={(e) => majEtat({ merchant_content: e.target.value })}
          disabled={!peutEditer}
          maxLength={4000}
          rows={4}
          placeholder="Offres du moment, soirées à venir, horaires… Ce texte s'affiche sur la page suivie par vos clients."
          className={textareaClass}
        />
      </div>

      <div>
        <Label htmlFor="studio-cagnotte-slug">Adresse du lien (optionnel)</Label>
        <div className="flex flex-wrap items-center gap-1 text-sm text-zinc-500">
          <span className="font-mono">…/jackpot/</span>
          <Input
            id="studio-cagnotte-slug"
            value={etat.public_slug}
            onChange={(e) => majEtat({ public_slug: e.target.value })}
            disabled={!peutEditer}
            maxLength={64}
            pattern="[a-z0-9-]{3,64}"
            placeholder="ma-cagnotte"
            className="w-56 font-mono"
            aria-describedby="studio-cagnotte-slug-help"
          />
        </div>
        <p
          id="studio-cagnotte-slug-help"
          className="mt-1.5 max-w-xl text-xs text-zinc-500"
        >
          Une adresse lisible pour le QR et le partage (3 à 64 caractères : a-z,
          0-9, tirets). Laissée vide, une adresse est générée à l&apos;ouverture.
        </p>
        <InfoBulle
          id="aide-studio-cagnotte-url"
          resume="Puis-je la changer une fois mes QR imprimés ?"
          className="mt-2 max-w-md"
        >
          Non sans conséquence : le QR encode l&apos;adresse telle qu&apos;elle
          était à l&apos;impression. La changer laisse les affiches déjà collées
          en vitrine pointer sur une adresse qui n&apos;existe plus. Fixez-la
          maintenant, imprimez ensuite.
        </InfoBulle>
      </div>
    </div>
  );
}

// ── 8. Vérifier et ouvrir ───────────────────────────────────

/**
 * LA VÉRIFICATION N'OUVRE PAS, ET C'EST LE MÊME ARBITRAGE QUE LE PASSEPORT.
 *
 * `AtelierJackpotVerification` porte déjà, en toutes lettres : « L'ouverture se
 * fait sur la page de suivi : c'est le seul endroit qui publie. » Son bouton y
 * renvoie. Le studio ne double donc PAS les contrôles de statut — contrairement
 * au calendrier et au quiz, dont la publication vit dans leur étape de
 * vérification.
 *
 * La raison est la même que pour la fidélité (ADR-159), et elle tient au
 * composant : `JackpotStatusControls` porte l'ouverture ET la SUPPRESSION de la
 * cagnotte, de ses participations et de ses gains, dans la même carte.
 * L'amener ici aurait fait deux endroits pour publier — donc deux vérités sur
 * l'état d'une cagnotte ouverte aux clients — et, au passage, un second chemin
 * vers le geste le plus lourd du module, sur un écran où l'on vient régler.
 *
 * ── LES LIENS DE CORRECTION VISENT L'ATELIER, PAS LE STUDIO ──
 *
 * `AtelierJackpotVerification` renvoie vers `?etape=reglages`, c'est-à-dire la
 * grande carte de l'atelier. C'est assumé : elle porte TOUS les réglages, donc
 * elle corrige à coup sûr ce que la vérification reproche, alors qu'un renvoi
 * vers une étape du studio devrait deviner laquelle — et se tromperait sur les
 * contrôles qui portent sur deux étapes à la fois (le mode et la date).
 */
export function EtapeVerification({
  campaignId,
  entree,
  modeValidation,
}: {
  campaignId: string;
  entree: EntreeActivationJackpot;
  /**
   * Le mode ENREGISTRÉ, et non celui de l'état en cours. Il ne sert qu'à
   * NOMMER les étapes de l'atelier vers lesquelles les liens de correction
   * renvoient : ces liens mènent à l'état tel qu'il est en base, pas à ce que
   * le commerçant vient de taper. `EntreeActivationJackpot.validation_mode` est
   * typé `string` (le module d'activation ne dépend d'aucun type de base), d'où
   * cette prop plutôt qu'une lecture de l'entrée.
   */
  modeValidation: JackpotValidationMode;
}) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Vérifier et ouvrir"
        aide="Calculé sur l'état réel de votre cagnotte. L'ouverture elle-même se fait depuis la page de suivi."
      />
      <AtelierJackpotVerification
        campaignId={campaignId}
        // Les étapes servent à NOMMER l'étape d'atelier que chaque contrôle
        // corrige : c'est la liste de l'ATELIER qu'il faut, pas celle du studio.
        etapes={etapesJackpot(modeValidation)}
        entree={entree}
      />
    </div>
  );
}
