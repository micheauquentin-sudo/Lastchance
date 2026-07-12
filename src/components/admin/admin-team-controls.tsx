"use client";

import { useActionState } from "react";
import {
  createAdmin,
  toggleAdmin,
  updateAdminRole,
} from "@/app/admin/(protected)/settings/actions";
import { ADMIN_ROLE_LABELS, ADMIN_ROLES, type AdminRole } from "@/types/admin";
import type { ActionResult } from "@/lib/utils";

type FdAction = (fd: FormData) => Promise<ActionResult>;
const adapt = (fn: FdAction) => (_prev: ActionResult | null, fd: FormData) => fn(fd);

/** Rôles que l'acteur peut attribuer (≤ le sien). */
function assignableRoles(actorRole: AdminRole): AdminRole[] {
  const rank: Record<AdminRole, number> = {
    read_only: 0,
    support: 1,
    finance: 1,
    admin: 2,
    super_admin: 3,
  };
  return ADMIN_ROLES.filter((r) => rank[r] <= rank[actorRole]);
}

export function CreateAdminForm({ actorRole }: { actorRole: AdminRole }) {
  const [state, action, pending] = useActionState(adapt(createAdmin), null);
  const roles = assignableRoles(actorRole);

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Email</label>
        <input
          name="email"
          type="email"
          required
          placeholder="collegue@lastchance.app"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-violet-400/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
      </div>
      <div className="flex-1">
        <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Nom</label>
        <input
          name="name"
          maxLength={120}
          placeholder="Prénom Nom"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-violet-400/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Rôle</label>
        <select
          name="role"
          defaultValue={roles[0]}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        >
          {roles.map((r) => (
            <option key={r} value={r} className="bg-zinc-900">
              {ADMIN_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <button
        disabled={pending}
        className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
      >
        Inviter
      </button>
      {state && !state.ok && (
        <p role="alert" className="w-full text-xs text-red-400 sm:w-auto">{state.error}</p>
      )}
    </form>
  );
}

export function RoleControl({
  adminId,
  current,
  actorRole,
}: {
  adminId: string;
  current: AdminRole;
  actorRole: AdminRole;
}) {
  const [state, action, pending] = useActionState(adapt(updateAdminRole), null);
  const roles = assignableRoles(actorRole);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="adminId" value={adminId} />
      <select
        name="role"
        defaultValue={current}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      >
        {roles.map((r) => (
          <option key={r} value={r} className="bg-zinc-900">
            {ADMIN_ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <button
        disabled={pending}
        className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-60"
      >
        OK
      </button>
      {state && !state.ok && <span className="text-xs text-red-400">{state.error}</span>}
    </form>
  );
}

export function ToggleControl({
  adminId,
  isActive,
}: {
  adminId: string;
  isActive: boolean;
}) {
  const [state, action, pending] = useActionState(adapt(toggleAdmin), null);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="adminId" value={adminId} />
      <input type="hidden" name="isActive" value={(!isActive).toString()} />
      <button
        disabled={pending}
        className={`rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset disabled:opacity-60 ${
          isActive
            ? "bg-red-500/10 text-red-300 ring-red-500/30 hover:bg-red-500/20"
            : "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30 hover:bg-emerald-500/20"
        }`}
      >
        {isActive ? "Désactiver" : "Réactiver"}
      </button>
      {state && !state.ok && <span className="text-xs text-red-400">{state.error}</span>}
    </form>
  );
}
