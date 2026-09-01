/**
 * L'HABILLAGE D'UN CONTRÔLE DU STUDIO — partagé par les quatre pages.
 *
 * Il vit dans son propre fichier parce que les pages du studio sont écrites
 * séparément : dupliquer ces douze lignes quatre fois aurait donné quatre
 * libellés qui divergent lentement, et c'est exactement ce que l'écran
 * précédent avait fini par produire.
 */
export function ChampStudio({
  label,
  aide,
  children,
}: {
  label: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-k-ink">{label}</span>
      {children}
      {aide ? (
        <span className="mt-1 block text-xs text-zinc-500">{aide}</span>
      ) : null}
    </label>
  );
}

export const CLASSE_CHAMP =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-semibold text-k-ink disabled:bg-zinc-100";

/**
 * UNE CASE QUI DIT CE QU'ELLE FAIT PARAÎTRE.
 *
 * Elle sert aux blocs de la page (VIT-20), aux réseaux (VIT-21) et aux jeux
 * (VIT-22) : partout où le commerçant décide si quelque chose figure ou non
 * sur sa carte. La phrase d'aide n'est pas décorative — une case sans elle
 * laisse deviner ce qu'on coche, et « Social » ne dit pas « vos liens
 * Instagram et vos avis Google apparaîtront sous la bannière ».
 */
export function CaseStudio({
  label,
  aide,
  cochee,
  onChange,
  disabled,
}: {
  label: string;
  aide?: string;
  cochee: boolean;
  onChange: (valeur: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-xl border-2 border-k-ink/15 bg-white px-3 py-2.5">
      <input
        type="checkbox"
        checked={cochee}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 accent-k-orange-text"
      />
      <span className="min-w-0">
        <span className="block text-xs font-black text-k-ink">{label}</span>
        {aide ? (
          <span className="mt-0.5 block text-xs text-zinc-500">{aide}</span>
        ) : null}
      </span>
    </label>
  );
}
