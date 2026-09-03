"use client";

import { Input, Label } from "@/components/ui/input";

/**
 * Bornes du CHECK SQL `code_ttl_days is null or between 1 and 365`
 * (migration 20260904120000), miroir de `codeTtlDaysSchema`.
 */
export const CODE_TTL_MIN_DAYS = 1;
export const CODE_TTL_MAX_DAYS = 365;

/**
 * Le réglage d'échéance du code de retrait, pour les SEPT familles qui portent
 * `code_ttl_days` (chasse, fidélité, jackpot, soirée, calendrier, parrainage,
 * quiz). Un seul composant et non sept blocs recopiés : la phrase qui explique
 * qu'un code déjà émis garde son échéance est la même partout, et sept copies
 * se seraient contredites à la première relecture.
 *
 * ── CE QUI EST REPRIS DE `CodeExpirySection` (contest-settings.tsx) ──
 *
 * La forme, les libellés, le ton — et LE CHAMP CACHÉ.
 *
 * ── CE QUI N'EST PAS REPRIS, ET POURQUOI ────────────────────────────
 *
 * Toute la machinerie jours ↔ secondes du modèle, avec son mode LECTURE SEULE
 * pour les durées non représentables en jours entiers. Elle n'existe là-bas
 * que parce que les pronostics stockent des SECONDES (`code_ttl_seconds`) : un
 * réglage de 1 h y est légitime en base et le formulaire l'écraserait en 24 h.
 * Ici la colonne EST en jours : il n'existe aucune valeur stockée que ce champ
 * ne sache saisir, donc aucun arrondi, aucun mode dégradé, aucun `%`.
 *
 * ── LE CHAMP CACHÉ, ET CE QU'IL PORTE ───────────────────────────────
 *
 * Côté serveur, `formData.has("code_ttl_days")` est la SEULE chose qui
 * distingue « efface le réglage » (valeur `''`, légitime : sans limite) de
 * « ne touche pas à ce réglage » (champ absent). D'où deux conséquences
 * symétriques :
 *
 *  - il doit être présent dès que le champ est saisissable, sinon vider la
 *    case n'écrirait jamais « sans limite » ;
 *  - il ne doit JAMAIS être posé dans un formulaire qui ne règle pas
 *    l'échéance, sinon la sauvegarde de cet autre formulaire effacerait le
 *    réglage sans que personne y ait touché.
 *
 * Il porte la saisie BRUTE (juste trimée) et non un nombre reconstruit : une
 * saisie invalide (« 3.5 », « abc ») part telle quelle et se voit refuser par
 * `codeTtlDaysSchema` avec son message. Reconstruire un nombre ici
 * transformerait « 3.5 » en un silencieux « sans limite ».
 */
export function CodeTtlDaysField({
  idPrefix,
  value,
  onChange,
  emissionHint,
  legend = "Expiration du code de retrait",
  champCache = true,
}: {
  /** Préfixe des `id` — un écran peut porter plusieurs formulaires. */
  idPrefix: string;
  /** Saisie courante en jours (`""` = sans limite). Contrôlée par le parent. */
  value: string;
  onChange: (next: string) => void;
  /**
   * Ce qui est PROPRE à cette expérience : l'instant d'où court le délai (fin
   * de chasse, palier atteint, tirage, ouverture de case, filleul validé, quiz
   * terminé…). Jamais « à partir du passage en caisse » : le décompte part de
   * l'ÉMISSION du lot.
   */
  emissionHint: string;
  /** Titre du bloc — surchargeable là où « code » désignerait autre chose. */
  legend?: string;
  /**
   * LE CHAMP CACHÉ SE RETIRE DANS UN STUDIO, ET NULLE PART AILLEURS (VIT-39).
   *
   * Un studio rend sa charge utile EN ENTIER depuis son état, dans un
   * formulaire VIDE dont les contrôles visibles sont les VOISINS — jamais les
   * descendants. Le champ caché posé ici vivrait donc dans une étape
   * démontable, hors du formulaire de réglages : il ne partirait jamais, et
   * ferait croire à une charge complète.
   *
   * Le défaut du champ reste `true` : les sept éditeurs historiques posent
   * leurs contrôles DANS leur formulaire, et pour eux ce champ est la seule
   * chose qui distingue « efface le réglage » de « ne touche pas au réglage ».
   */
  champCache?: boolean;
}) {
  const helpId = `${idPrefix}-code-ttl-help`;
  const boundsId = `${idPrefix}-code-ttl-bounds`;

  return (
    <div>
      <p className="text-sm font-bold text-k-ink mb-1">{legend}</p>
      <p id={helpId} className="mb-2 text-xs text-zinc-500">
        {emissionHint} Les codes déjà émis gardent l&apos;échéance qu&apos;ils
        avaient : modifier ce réglage ne change que les lots émis ensuite.
      </p>
      {/* Présent dès que le champ est saisissable — voir l'en-tête. */}
      {champCache && (
        <input type="hidden" name="code_ttl_days" value={value.trim()} />
      )}
      <div className="w-40">
        <Label htmlFor={`${idPrefix}-code-ttl`}>Validité (jours)</Label>
        <Input
          id={`${idPrefix}-code-ttl`}
          type="number"
          inputMode="numeric"
          min={CODE_TTL_MIN_DAYS}
          max={CODE_TTL_MAX_DAYS}
          step={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Sans limite"
          aria-describedby={`${helpId} ${boundsId}`}
        />
      </div>
      <p id={boundsId} className="mt-1.5 text-xs text-zinc-500">
        Laisser vide = pas d&apos;expiration ; sinon entre {CODE_TTL_MIN_DAYS} et{" "}
        {CODE_TTL_MAX_DAYS} jours.
      </p>
    </div>
  );
}

/** Valeur initiale du champ depuis la colonne (`null` → champ vide). */
export function codeTtlDaysInitial(stored: number | null | undefined): string {
  return stored === null || stored === undefined ? "" : String(stored);
}
