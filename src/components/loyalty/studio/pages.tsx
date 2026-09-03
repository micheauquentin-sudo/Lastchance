"use client";

import Link from "next/link";
import { Input, Label } from "@/components/ui/input";
import { InfoBulle, infoBulleTexteId } from "@/components/dashboard/info-bulle";
import { CodeTtlDaysField } from "@/components/dashboard/code-ttl-days-field";
import { SelecteurFond } from "@/components/dashboard/selecteur-fond";
import { AtelierVerificationFidelite } from "@/components/dashboard/atelier-loyalty-verification";
import {
  equivalentVisites,
  LoyaltyPaliersEditor,
  type LoyaltyJackpotOption,
  type WheelOption,
} from "@/components/dashboard/loyalty-editor";
import {
  OrderCodeCards,
  type OrderCodeCard,
} from "@/components/dashboard/order-code-cards";
import {
  formatDurationLabel,
  loyaltyPeriodOptions,
  LOYALTY_POINTS_PAR_VISITE,
  LOYALTY_MILESTONE_MIN_COST_POINTS,
} from "@/components/dashboard/loyalty-settings-presets";
import type { EntreeVerificationFidelite } from "@/lib/activation/loyalty";
import type { LoyaltyMilestone } from "@/types/database";
import {
  frequenceResolueFidelite,
  type EtatFidelite,
} from "@/components/loyalty/studio/etat";

/**
 * LE CONTENU DES ÉTAPES DU STUDIO DU PASSEPORT (VIT-42).
 *
 * ── AUCUN CONTRÔLE DE CE FICHIER NE PORTE DE `name` DE CHARGE UTILE ──
 *
 * C'est la règle du socle, et elle ne se négocie pas : une étape qu'on quitte
 * est DÉMONTÉE. Un `name` posé ici disparaîtrait du formulaire de réglages, et
 * l'enregistrement automatique suivant effacerait la colonne — sur une action
 * qui réécrit huit champs en bloc, c'est-à-dire sans un mot.
 *
 * Tout écrit donc dans `EtatFidelite` par `majEtat` ; les trois charges utiles
 * sont rendues à part, en entier, depuis ce seul état.
 *
 * Les SEULS `name` qui apparaissent ici appartiennent à des formulaires qui ne
 * sont pas celui des réglages : les paliers (une action atomique par ligne) et
 * les cartes de commande (leur propre action). Ils vivent dans leurs propres
 * `<form>`, voisins — jamais descendants — de celui de la coquille.
 */

const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500";

export interface ProprietesEtape {
  etat: EtatFidelite;
  majEtat: (patch: Partial<EtatFidelite>) => void;
  peutEditer: boolean;
}

function TitreEtape({
  titre,
  aide,
}: {
  titre: string;
  aide: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-black text-k-ink">{titre}</h2>
      <p className="mt-1 text-sm text-k-body">{aide}</p>
    </div>
  );
}

// ── 1. Le nom ───────────────────────────────────────────────

export function EtapeNom({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Le nom du programme"
        aide="Il s'affiche en grand, en haut de la carte que voient vos clients."
      />
      <div className="max-w-sm">
        <Label htmlFor="studio-fid-nom">Nom du programme</Label>
        <Input
          id="studio-fid-nom"
          value={etat.name}
          onChange={(e) => majEtat({ name: e.target.value })}
          disabled={!peutEditer}
          maxLength={80}
          placeholder="Ex : La carte du comptoir"
        />
      </div>
    </div>
  );
}

// ── 2. Comment le client valide sa visite ───────────────────

/**
 * LE MODE, LA ROTATION, LA FRÉQUENCE, LE JACKPOT ET L'ÉCHÉANCE DU CODE.
 *
 * Ces cinq réglages voyagent ensemble parce que le SCHÉMA les lie : le
 * `superRefine` d'`updateLoyaltyProgramSchema` refuse un jackpot associé hors
 * validation en caisse, et impose un plancher de fréquence qui dépend du mode
 * ET de la rotation. Les séparer aurait rendu ces refus insolubles — le
 * commerçant lirait, sur une étape, un reproche portant sur un réglage qu'il ne
 * voit pas.
 *
 * L'ÉCRAN COMPTOIR N'EST QU'UN LIEN, et c'est délibéré : c'est une TABLETTE
 * tenue par la caisse, face aux clients, avec sa propre garde de permission.
 * L'absorber ici ferait entrer dans le studio une autorisation qui n'est pas la
 * sienne.
 */
export function EtapeValidation({
  etat,
  majEtat,
  peutEditer,
  programId,
  jackpots,
}: ProprietesEtape & {
  programId: string;
  jackpots: LoyaltyJackpotOption[];
}) {
  const optionsRotation = loyaltyPeriodOptions(etat.rotating_period_seconds);
  const frequence = frequenceResolueFidelite(etat);

  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Comment le client valide sa visite"
        aide="Le geste qui tamponne la carte, la fréquence autorisée, et jusqu'à quand un cadeau gagné reste retirable."
      />

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-bold text-k-ink">
          Comment valider une visite ?
        </legend>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="radio"
            name="studio-fid-mode-choice"
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
              change régulièrement. Le client le saisit sur sa carte.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="radio"
            name="studio-fid-mode-choice"
            value="staff"
            checked={etat.validation_mode === "staff"}
            onChange={() => majEtat({ validation_mode: "staff" })}
            disabled={!peutEditer}
            className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
          />
          <span>
            <span className="font-bold text-k-ink">Validation en caisse</span>
            <span className="block text-xs text-zinc-500">
              Le client présente le QR de sa carte ; vous le scannez en caisse
              pour valider la visite.
            </span>
          </span>
        </label>
      </fieldset>

      {/* EXCLUSIF AU CODE AU COMPTOIR. En « Validation en caisse » la rotation
          ne gouverne rien : la laisser réglable ferait croire qu'un code tourne
          là où le mode n'en émet aucun. Elle quitte l'ÉCRAN, jamais la CHARGE —
          `rotatingPeriodSchema` est un `entierRequis`, où un champ non rendu
          vaut un refus explicite, et revenir au mode comptoir doit retrouver le
          réglage d'avant plutôt qu'un zéro. Les champs cachés du studio la
          rendent donc toujours, depuis l'état. */}
      {etat.validation_mode === "rotating_code" && (
        <div>
          <Label htmlFor="studio-fid-rotation">
            Rotation du code au comptoir
          </Label>
          <select
            id="studio-fid-rotation"
            value={etat.rotating_period_seconds}
            onChange={(e) =>
              majEtat({ rotating_period_seconds: Number(e.target.value) })
            }
            disabled={!peutEditer}
            className={`${selectClass} max-w-sm`}
            aria-describedby={infoBulleTexteId("aide-studio-fid-rotation")}
          >
            {optionsRotation.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <InfoBulle
            id="aide-studio-fid-rotation"
            resume="Faut-il une rotation courte ou longue ?"
            className="mt-2 max-w-sm"
          >
            Plus la rotation est courte, plus il est difficile de tricher à
            distance — un code photographié puis envoyé à un ami expire vite (5
            minutes au maximum). En contrepartie, elle relève le délai minimal
            entre deux visites, qui vaut le double de la rotation.
          </InfoBulle>
        </div>
      )}

      <div>
        <Label htmlFor="studio-fid-frequence">Fréquence des visites</Label>
        <select
          id="studio-fid-frequence"
          value={frequence.value}
          onChange={(e) =>
            majEtat({ min_stamp_interval_seconds: Number(e.target.value) })
          }
          disabled={!peutEditer}
          aria-describedby="studio-fid-frequence-help"
          className={`${selectClass} max-w-sm`}
        >
          {frequence.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div id="studio-fid-frequence-help" className="mt-1.5 space-y-1">
          <p className="text-xs text-zinc-500">
            Anti-abus : empêche de compter plusieurs visites trop rapprochées
            depuis une même carte.
          </p>
          {frequence.floorSeconds > 0 && (
            <p className="text-xs text-zinc-500">
              {etat.validation_mode === "rotating_code" ? (
                <>
                  Le mode « Code au comptoir » impose au moins{" "}
                  {formatDurationLabel(frequence.floorSeconds)} entre deux
                  visites (le double de la rotation, 5 min minimum) : un code
                  reste valable le temps de deux rotations, sans ce délai il
                  vaudrait deux tampons.
                </>
              ) : (
                <>
                  Le mode « Validation en caisse » impose au moins{" "}
                  {formatDurationLabel(frequence.floorSeconds)} entre deux
                  visites : le QR présenté reste scannable quelques minutes,
                  sans ce délai il vaudrait plusieurs tampons.
                </>
              )}
            </p>
          )}
          {frequence.adjusted && (
            <p role="status" className="text-xs font-semibold text-amber-700">
              Réglage ajusté sur {formatDurationLabel(frequence.value)} pour
              rester compatible avec le mode choisi.
            </p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="studio-fid-jackpot">Jackpot collectif associé</Label>
        <select
          id="studio-fid-jackpot"
          value={etat.jackpot_campaign_id}
          onChange={(e) => majEtat({ jackpot_campaign_id: e.target.value })}
          disabled={!peutEditer}
          className={`${selectClass} max-w-sm`}
          aria-describedby="studio-fid-jackpot-help"
        >
          <option value="">Aucun jackpot associé</option>
          {/* Un pot associé devenu incompatible (archivé, passé en code
              tournant) n'a plus d'option dans la liste : sans cette ligne, le
              `<select>` retomberait en silence sur « Aucun » et le prochain
              enregistrement automatique DISSOCIERAIT le pot sans qu'on le
              demande. */}
          {etat.jackpot_campaign_id &&
            !jackpots.some((j) => j.id === etat.jackpot_campaign_id) && (
              <option value={etat.jackpot_campaign_id}>
                Jackpot associé indisponible — dissociez-le
              </option>
            )}
          {jackpots.map((jackpot) => (
            <option key={jackpot.id} value={jackpot.id}>
              {jackpot.name} — validation en caisse
            </option>
          ))}
        </select>
        <p
          id="studio-fid-jackpot-help"
          className="mt-1.5 max-w-xl text-xs text-zinc-500"
        >
          En validation en caisse, chaque scan du QR de la carte rejoint ce pot
          commun. Le client suit sa jauge directement depuis sa carte ; aucun
          second QR ni passage par la page Jackpot.
        </p>
        {jackpots.length === 0 && (
          <p className="mt-1.5 text-xs font-semibold text-amber-700">
            Créez puis activez d&apos;abord un jackpot en validation caisse pour
            pouvoir l&apos;associer.
          </p>
        )}
      </div>

      {/* `champCache={false}` : le champ caché de ce composant vivrait dans une
          étape DÉMONTABLE, hors du formulaire de réglages — il ne partirait
          jamais, et `formData.has()` serait faux à chaque enregistrement.
          C'est `ChampsCachesFidelite` qui le rend, toujours. */}
      <CodeTtlDaysField
        idPrefix="studio-fid"
        champCache={false}
        value={etat.code_ttl_days}
        onChange={(v) => majEtat({ code_ttl_days: v })}
        emissionHint="Délai laissé au client pour présenter son code FIDELITE- en caisse, à partir du moment où il ÉCHANGE ses points."
      />

      {etat.validation_mode === "rotating_code" && (
        <div className="rounded-2xl border-2 border-k-ink/25 bg-white p-4">
          <p className="text-sm font-black text-k-ink">
            L&apos;écran comptoir
          </p>
          <p className="mt-1 text-sm font-semibold text-k-body">
            C&apos;est la tablette posée au comptoir, face aux clients : elle
            affiche le code qui tourne. Sans elle, personne ne peut tamponner sa
            visite dans ce mode.
          </p>
          <Link
            href={`/dashboard/loyalty/${programId}/comptoir`}
            className="k-btn-sm mt-3 inline-flex items-center gap-2 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-bold text-k-ink"
          >
            Ouvrir l&apos;écran comptoir →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── 3. Les niveaux ──────────────────────────────────────────

export function EtapeNiveaux({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Les niveaux"
        aide={
          <>
            La carte passe bronze → argent → or selon les points{" "}
            <strong className="font-semibold text-zinc-700">
              cumulés depuis le début
            </strong>
            , et non selon le solde restant : un client qui dépense ses points
            garde son niveau, il ne redescend jamais. Ces deux seuils ne
            distribuent rien par eux-mêmes — ils donnent une progression
            visible.
          </>
        }
      />

      <div className="flex flex-wrap gap-4">
        <div>
          <Label htmlFor="studio-fid-argent">Seuil argent 🥈 (points)</Label>
          <Input
            id="studio-fid-argent"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            step={LOYALTY_POINTS_PAR_VISITE}
            value={etat.silver_threshold}
            onChange={(e) => majEtat({ silver_threshold: e.target.value })}
            disabled={!peutEditer}
            className="w-40"
            aria-describedby="studio-fid-argent-help"
          />
          <p id="studio-fid-argent-help" className="mt-1.5 text-xs text-zinc-500">
            {equivalentVisites(Number(etat.silver_threshold))}
          </p>
        </div>
        <div>
          <Label htmlFor="studio-fid-or">Seuil or 🥇 (points)</Label>
          <Input
            id="studio-fid-or"
            type="number"
            inputMode="numeric"
            min={2}
            max={100000}
            step={LOYALTY_POINTS_PAR_VISITE}
            value={etat.gold_threshold}
            onChange={(e) => majEtat({ gold_threshold: e.target.value })}
            disabled={!peutEditer}
            className="w-40"
            aria-describedby="studio-fid-or-help"
          />
          <p id="studio-fid-or-help" className="mt-1.5 text-xs text-zinc-500">
            {equivalentVisites(Number(etat.gold_threshold))}
          </p>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Le seuil or doit être supérieur au seuil argent.
      </p>
    </div>
  );
}

// ── 4. Mes cadeaux et leur prix en points ───────────────────

/**
 * LES PALIERS, ET RIEN QUE LES PALIERS.
 *
 * On monte `LoyaltyPaliersEditor` et NON `LoyaltyMilestonesEditor` : ce dernier
 * embarque `LoyaltyTiersForm`, qui vise `updateLoyaltyProgram` avec un jeu de
 * champs cachés recopiés. À l'écran d'un studio, ce serait un SECOND écrivain
 * sur les colonnes que la coquille poste déjà depuis l'état unique — c'est le
 * piège central du module, et la découpe l'a fermé en séparant les deux.
 *
 * Chaque ligne de palier garde en revanche son propre formulaire et sa propre
 * action, ATOMIQUE par palier : rien à écraser, rien à recopier.
 */
export function EtapeCadeaux({
  programId,
  paliers,
  roues,
}: {
  programId: string;
  paliers: LoyaltyMilestone[];
  roues: WheelOption[];
}) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Mes cadeaux et leur prix en points"
        aide={`Le client dépense ses points quand il le décide, et choisit lequel prendre. Un prix vaut au moins ${LOYALTY_MILESTONE_MIN_COST_POINTS} points (deux visites), et chaque cadeau porte un stock : c'est ce qui borne ce que le programme peut vous coûter.`}
      />
      <LoyaltyPaliersEditor
        programId={programId}
        milestones={paliers}
        wheels={roues}
      />
      <InfoBulle
        id="aide-studio-fid-roue"
        resume="Un cadeau « tour de roue offert » a besoin d'une roue prête"
      >
        Le tour offert se joue sur une roue de vos campagnes, et il n&apos;en
        tire que les lots qui ont un stock. Si la roue choisie n&apos;a que des
        lots illimités, le client verra « aucun lot à distribuer » et conservera
        son tour. Réglez ces stocks depuis la page de la campagne concernée,
        puis revenez ici — votre cadeau vous attend.
      </InfoBulle>
    </div>
  );
}

// ── 5. Le parrainage ────────────────────────────────────────

export function EtapeParrainage({ etat, majEtat, peutEditer }: ProprietesEtape) {
  const nParrain = Number(etat.referral_sponsor_points);
  const nFilleul = Number(etat.referral_filleul_points);
  const nPlafond = Number(etat.referral_max_filleuls);
  const budgetLisible =
    Number.isFinite(nParrain) &&
    Number.isFinite(nFilleul) &&
    Number.isFinite(nPlafond) &&
    nPlafond > 0;
  const depenseMax = budgetLisible ? (nParrain + nFilleul) * nPlafond : 0;
  const visitesOffertes = Math.round(depenseMax / LOYALTY_POINTS_PAR_VISITE);

  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Le parrainage"
        aide={
          <>
            Chaque client peut inviter ses amis avec un lien personnel. Le
            filleul ouvre sa carte, puis{" "}
            <strong className="font-semibold text-zinc-700">
              fait valider une première visite
            </strong>{" "}
            — c&apos;est à ce moment-là, et pas avant, que les points sont
            versés : une carte créée et jamais tamponnée ne vous coûte rien.
          </>
        }
      />

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={etat.referral_enabled}
          onChange={(e) => majEtat({ referral_enabled: e.target.checked })}
          disabled={!peutEditer}
          className="mt-0.5 h-4 w-4 rounded border-2 border-k-ink accent-k-ink"
        />
        <span>
          <span className="font-medium text-zinc-800">
            Proposer le parrainage sur le passeport
          </span>
          <span className="block text-xs text-zinc-500">
            Le bloc « Parrainer un ami » n&apos;apparaît sur la carte de vos
            clients que si cette case est cochée.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap gap-4">
        <div>
          <Label htmlFor="studio-fid-parrain">Points au parrain</Label>
          <Input
            id="studio-fid-parrain"
            type="number"
            inputMode="numeric"
            min={0}
            max={100000}
            step={LOYALTY_POINTS_PAR_VISITE}
            value={etat.referral_sponsor_points}
            onChange={(e) =>
              majEtat({ referral_sponsor_points: e.target.value })
            }
            disabled={!peutEditer}
            className="w-40"
            aria-describedby="studio-fid-parrain-help"
          />
          <p id="studio-fid-parrain-help" className="mt-1.5 text-xs text-zinc-500">
            {equivalentVisites(nParrain)}
          </p>
        </div>
        <div>
          <Label htmlFor="studio-fid-filleul">
            Bonus de bienvenue du filleul
          </Label>
          <Input
            id="studio-fid-filleul"
            type="number"
            inputMode="numeric"
            min={0}
            max={100000}
            step={LOYALTY_POINTS_PAR_VISITE}
            value={etat.referral_filleul_points}
            onChange={(e) =>
              majEtat({ referral_filleul_points: e.target.value })
            }
            disabled={!peutEditer}
            className="w-40"
            aria-describedby="studio-fid-filleul-help"
          />
          <p id="studio-fid-filleul-help" className="mt-1.5 text-xs text-zinc-500">
            0 pour ne rien offrir au filleul.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <Label htmlFor="studio-fid-plafond">
            Filleuls maximum par parrain
          </Label>
          <Input
            id="studio-fid-plafond"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            value={etat.referral_max_filleuls}
            onChange={(e) => majEtat({ referral_max_filleuls: e.target.value })}
            disabled={!peutEditer}
            className="w-40"
            aria-describedby="studio-fid-plafond-help"
          />
          <p id="studio-fid-plafond-help" className="mt-1.5 text-xs text-zinc-500">
            Au-delà, l&apos;invitation cesse d&apos;accueillir de nouveaux
            filleuls.
          </p>
        </div>
        <div>
          <Label htmlFor="studio-fid-fenetre">
            Validité d&apos;une invitation (jours)
          </Label>
          <Input
            id="studio-fid-fenetre"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={etat.referral_window_days}
            onChange={(e) => majEtat({ referral_window_days: e.target.value })}
            disabled={!peutEditer}
            className="w-40"
            aria-describedby="studio-fid-fenetre-help"
          />
          <p id="studio-fid-fenetre-help" className="mt-1.5 text-xs text-zinc-500">
            Comptés depuis le jour où le client obtient son lien.
          </p>
        </div>
      </div>

      {/* CE QUE ÇA COÛTE — la ligne qui manque pour décider. Elle se recalcule à
          la saisie, avant tout enregistrement. */}
      <p
        className="rounded-xl border-2 border-k-ink/15 bg-amber-50 px-3.5 py-2.5 text-sm text-zinc-700"
        role="status"
        aria-live="polite"
      >
        {budgetLisible ? (
          <>
            <strong className="font-semibold">Dépense maximale :</strong>{" "}
            {nParrain} points au parrain + {nFilleul} au filleul, × {nPlafond}{" "}
            filleul{nPlafond > 1 ? "s" : ""} au maximum ={" "}
            <strong className="font-semibold">
              {depenseMax.toLocaleString("fr-FR")} points
            </strong>{" "}
            pour un seul parrain, soit environ {visitesOffertes} visite
            {visitesOffertes > 1 ? "s" : ""} offerte
            {visitesOffertes > 1 ? "s" : ""}. Chaque point versé suppose une
            visite réellement validée.
          </>
        ) : (
          "Renseignez les deux montants et le plafond pour voir la dépense maximale par parrain."
        )}
      </p>
    </div>
  );
}

// ── 6. L'allure du passeport ────────────────────────────────

export function EtapeAllure({
  etat,
  majEtat,
  peutEditer,
  logoUrl,
}: ProprietesEtape & { logoUrl: string | null }) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="L'allure du passeport"
        aide="Une grande image derrière la carte de vos clients. Elle est adoucie par un voile pour que le solde et les prix restent lisibles — vous le voyez à droite, en direct."
      />

      {/* Le sélecteur n'est pas désactivable : ses radios n'ont pas de prop
          `disabled`. Un rôle qui n'édite pas ne verrait de toute façon rien
          partir — `useEnregistrementDepuisEtat` et l'envoi de l'habillage sont
          tous deux gelés par `peutEditer`. Le dire vaut mieux que le laisser
          essayer en silence. */}
      {!peutEditer && (
        <p className="rounded-xl border-2 border-k-ink/25 bg-white px-3.5 py-2.5 text-sm font-semibold text-k-body">
          Vous pouvez regarder les fonds proposés, mais votre rôle ne permet pas
          de les enregistrer.
        </p>
      )}

      <SelecteurFond
        nomGroupe="studio-fid-fond-choice"
        valeur={etat.fond || undefined}
        onChange={(v) => majEtat({ fond: v ?? "" })}
        legende="Fond d'écran du passeport"
        className=""
      />

      {/* LE LOGO NE SE RÈGLE PAS ICI, ET NE LE SERA PAS : il appartient à
          l'établissement, pas au programme, et il est déjà servi par plusieurs
          autres surfaces. Ce bloc MONTRE ce qui est en place et ouvre la porte —
          une capacité sans chemin pour l'atteindre est une capacité que
          personne ne sait avoir. */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-k-ink/25 bg-white p-4">
        {logoUrl ? (
          // Le dépôt n'utilise pas next/image (convention assumée).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-full border-2 border-k-ink bg-white object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-k-ink bg-white text-lg"
          >
            🎟️
          </span>
        )}
        <p className="min-w-0 flex-1 text-sm font-semibold text-k-body">
          {logoUrl
            ? "Le logo de votre établissement coiffe la carte. Il se change une fois pour toutes vos animations."
            : "Aucun logo : la carte affiche un jeton. Ajoutez-en un et il coiffera toutes vos animations."}
        </p>
        <Link
          href="/dashboard/settings"
          className="shrink-0 rounded-xl border-2 border-k-ink bg-white px-3 py-1.5 text-sm font-black text-k-ink hover:bg-k-yellow"
        >
          {logoUrl ? "Changer le logo" : "Ajouter un logo"}
        </Link>
      </div>
    </div>
  );
}

// ── 7. Les cartes pour les colis ────────────────────────────

export function EtapeCartes({
  programId,
  cartes,
  plafond,
}: {
  programId: string;
  cartes: OrderCodeCard[];
  /** Nombre maximal de cartes rendues par la page — DIT à l'écran. */
  plafond: number;
}) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Les cartes pour les colis"
        aide="Facultatif : un programme s'ouvre très bien sans avoir émis une seule carte."
      />
      <p className="rounded-2xl border-2 border-k-ink/25 bg-white p-4 text-sm font-semibold text-k-body">
        Ces cartes servent aux commandes livrées — le client scanne le QR glissé
        dans son colis et tamponne sa visite sans passer en boutique.
        {cartes.length >= plafond && (
          <>
            {" "}
            Cet écran n&apos;affiche que les {plafond} cartes les plus récentes ;
            les plus anciennes restent valables même si elles ne sont plus
            listées ici.
          </>
        )}
      </p>
      <OrderCodeCards programId={programId} codes={cartes} />
    </div>
  );
}

// ── 8. Vérifier et ouvrir aux clients ───────────────────────

/**
 * LA VÉRIFICATION N'OUVRE PAS, ET C'EST LE MODULE QUI L'A DÉCIDÉ.
 *
 * `AtelierVerificationFidelite` porte déjà, en toutes lettres :
 * « L'ouverture se fait sur l'écran de suivi du programme : c'est le seul
 * endroit qui publie. » Son bouton y renvoie. Le studio ne double donc PAS les
 * contrôles de statut — contrairement au calendrier et au quiz, dont la
 * publication vit dans leur étape de vérification. Deux endroits pour publier,
 * dont l'un porte aussi la SUPPRESSION du programme et de tous ses passeports,
 * auraient été deux vérités sur le geste le plus lourd du module.
 */
export function EtapeVerification({
  entree,
  modeValidation,
}: {
  entree: EntreeVerificationFidelite;
  modeValidation: "rotating_code" | "staff";
}) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Vérifier et ouvrir aux clients"
        aide="Calculé sur l'état réel de votre programme. L'ouverture elle-même se fait depuis l'écran de suivi."
      />
      <AtelierVerificationFidelite
        entree={entree}
        modeValidation={modeValidation}
      />
    </div>
  );
}
