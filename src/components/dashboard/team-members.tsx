"use client";

import { useActionState } from "react";
import { removeTeamMember, revokeInvitation } from "@/actions/team";
import { FieldError } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import type { TeamInvitation, TeamMemberRow } from "@/types/database";

export function TeamMembersList({
  members,
  currentUserId,
}: {
  members: TeamMemberRow[];
  currentUserId: string;
}) {
  const [state, formAction, pending] = useActionState(removeTeamMember, null);

  return (
    <div>
      <ul className="space-y-2">
        {members.map((m) => (
          <li
            key={m.user_id}
            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900">
                {m.email}
                {m.user_id === currentUserId && (
                  <span className="ml-2 text-xs font-normal text-zinc-400">(vous)</span>
                )}
              </p>
              <p className="text-xs text-zinc-500">
                {m.role === "owner"
                  ? "Propriétaire"
                  : m.role === "editor"
                    ? "Éditeur"
                    : "Caissier"} · depuis le{" "}
                {formatDate(m.joined_at)}
              </p>
            </div>
            {m.role !== "owner" && (
              <form action={formAction}>
                <input type="hidden" name="userId" value={m.user_id} />
                <button
                  type="submit"
                  disabled={pending}
                  className="shrink-0 text-sm text-red-600 hover:underline disabled:opacity-50"
                >
                  Retirer
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </div>
  );
}

export function PendingInvitationsList({
  invitations,
}: {
  invitations: TeamInvitation[];
}) {
  const [state, formAction, pending] = useActionState(revokeInvitation, null);

  if (invitations.length === 0) {
    return <p className="text-sm text-zinc-500">Aucune invitation en attente.</p>;
  }

  return (
    <div>
      <ul className="space-y-2">
        {invitations.map((inv) => (
          <li
            key={inv.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900">{inv.email}</p>
              <p className="text-xs text-zinc-500">
                {inv.role === "editor" ? "Éditeur" : "Caissier"} · expire le{" "}
                {formatDate(inv.expires_at)}
              </p>
            </div>
            <form action={formAction}>
              <input type="hidden" name="id" value={inv.id} />
              <button
                type="submit"
                disabled={pending}
                className="shrink-0 text-sm text-red-600 hover:underline disabled:opacity-50"
              >
                Annuler
              </button>
            </form>
          </li>
        ))}
      </ul>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </div>
  );
}
