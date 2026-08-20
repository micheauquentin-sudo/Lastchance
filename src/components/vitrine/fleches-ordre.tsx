"use client";

/**
 * Les deux flèches d'une ligne réordonnable.
 *
 * `aria-label` NOMMÉ, jamais « Monter » seul : sur une carte de trente fiches,
 * un lecteur d'écran annoncerait soixante boutons identiques. Le libellé porte
 * donc ce qui bouge — « Monter « Tarte aux pommes » ».
 *
 * Cibles tactiles : `min-h-9 min-w-9`. En dessous, la flèche du haut et celle
 * du bas se touchent sur un téléphone, et le commerçant descend un plat quand
 * il voulait le monter.
 */
export function FlechesOrdre({
  index,
  total,
  nom,
  disabled,
  onDeplacer,
}: {
  index: number;
  total: number;
  /** Ce qui bouge, tel qu'il s'affiche. */
  nom: string;
  disabled: boolean;
  onDeplacer: (index: number, direction: -1 | 1) => void;
}) {
  const classe =
    "inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-zinc-200 text-k-ink hover:bg-zinc-50 disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => onDeplacer(index, -1)}
        disabled={disabled || index === 0}
        aria-label={`Monter « ${nom} »`}
        className={classe}
      >
        ↑
      </button>
      <button
        type="button"
        onClick={() => onDeplacer(index, 1)}
        disabled={disabled || index === total - 1}
        aria-label={`Descendre « ${nom} »`}
        className={classe}
      >
        ↓
      </button>
    </div>
  );
}
