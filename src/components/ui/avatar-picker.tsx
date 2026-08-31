"use client";

import { useState } from "react";
import {
  AVATAR_GROUPS,
  Avatar,
  avatarLabel,
  type AvatarId,
} from "@/lib/avatars";

/**
 * Sélecteur de FIGURE du catalogue partagé (`src/lib/avatars.tsx`) : onglets
 * de familles, puis une grille de médaillons.
 *
 * Le dépôt a tranché trois fois pour ce catalogue — concours, événements,
 * quiz — et le même sélecteur avait été recopié à chaque fois. Le passeport
 * étant le quatrième, il vit désormais ici : une figure ajoutée au catalogue
 * apparaît dans tous les écrans sans qu'aucun ne soit touché.
 *
 * ACCESSIBILITÉ — chaque médaillon porte le LIBELLÉ du catalogue comme nom
 * accessible (« Renard », « Japon »), jamais un emoji : un U+FE0F invisible
 * dans un nom accessible a déjà cassé des locators Playwright ici.
 */
export type AvatarGroupKey = (typeof AVATAR_GROUPS)[number]["key"];

export function AvatarPicker({
  value,
  onChange,
  label = "Votre figure",
  idPrefix,
}: {
  value: AvatarId;
  onChange: (id: AvatarId) => void;
  /** Intitulé du groupe de choix, adapté à l'écran qui le monte. */
  label?: string;
  /** Préfixe d'identifiants, quand deux sélecteurs cohabitent sur une page. */
  idPrefix?: string;
}) {
  const [groupKey, setGroupKey] = useState<AvatarGroupKey>(
    () =>
      AVATAR_GROUPS.find((g) => (g.ids as readonly AvatarId[]).includes(value))
        ?.key ?? AVATAR_GROUPS[0].key,
  );
  const group = AVATAR_GROUPS.find((g) => g.key === groupKey) ?? AVATAR_GROUPS[0];
  const prefix = idPrefix ? `${idPrefix}-` : "";

  return (
    <div>
      <span className="mb-1.5 block text-sm font-bold text-k-ink">{label}</span>
      <div
        className="mb-2 flex gap-1.5"
        role="tablist"
        aria-label="Familles d'avatars"
      >
        {AVATAR_GROUPS.map((g) => {
          const active = g.key === groupKey;
          return (
            <button
              key={g.key}
              id={`${prefix}avatar-groupe-${g.key}`}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setGroupKey(g.key)}
              className={
                active
                  ? "rounded-full border-2 border-k-ink bg-k-yellow px-3 py-1 text-xs font-black text-k-ink"
                  : "rounded-full border-2 border-transparent bg-zinc-100 px-3 py-1 text-xs font-bold text-k-body hover:bg-zinc-200"
              }
            >
              {g.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-6 gap-2">
        {group.ids.map((id) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={active}
              aria-label={avatarLabel(id)}
              title={avatarLabel(id)}
              className={
                active
                  ? "rounded-full ring-2 ring-k-ink ring-offset-2 ring-offset-white transition"
                  : "rounded-full opacity-70 transition hover:opacity-100"
              }
            >
              <Avatar id={id} className="h-full w-full" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
