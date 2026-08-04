"use client";

import {
  removeTeamMember,
  revokeInvitation,
  updateTeamMemberRole,
} from "@/actions/team";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import { formatDate } from "@/lib/utils";
import { TEAM_ROLE_LABELS } from "@/lib/validations/team";
import type { TeamInvitation, TeamMemberRow } from "@/types/database";

const roleSelectClass =
  "rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900";

export function TeamMembersList({
  members,
  currentUserId,
}: {
  members: TeamMemberRow[];
  currentUserId: string;
}) {
  const { state, pending, onSubmit } = useActionForm(removeTeamMember, {
    networkError: "Retrait impossible, réessayez.",
    // Le retrait n'affiche RIEN — contrairement au changement de rôle juste
    // au-dessus, qui rend « Accès mis à jour. ». Sa seule preuve est la
    // disparition de la ligne, rendue par le serveur. Sans rechargement,
    // l'ancien salarié reste listé : le propriétaire croit que le retrait a
    // échoué et que l'accès à sa caisse est toujours ouvert.
    //
    // C'est aussi cet écart qui a rendu ce défaut INVISIBLE à la garde
    // mécanique : les deux formulaires vivent dans le MÊME composant, et le
    // succès de l'un se lisait comme le succès de l'autre. Voir
    // use-action-form-coverage.test.ts.
    reloadOnSuccess: true,
  });
  // Second formulaire, second état : un échec de retrait et un échec de
  // changement de rôle ne doivent pas s'écraser l'un l'autre sous la liste.
  const {
    state: roleState,
    pending: rolePending,
    onSubmit: roleSubmit,
  } = useActionForm(updateTeamMemberRole, {
    networkError: "Changement de rôle impossible, réessayez.",
  });

  return (
    <div>
      <ul className="space-y-2">
        {members.map((m) => (
          <li
            key={m.user_id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900">
                {m.email}
                {m.user_id === currentUserId && (
                  <span className="ml-2 text-xs font-normal text-zinc-400">(vous)</span>
                )}
              </p>
              <p className="text-xs text-zinc-500">
                {TEAM_ROLE_LABELS[m.role] ?? m.role} · depuis le{" "}
                {formatDate(m.joined_at)}
              </p>
            </div>
            {m.role !== "owner" && (
              <div className="flex shrink-0 items-center gap-3">
                {/* Le seul chemin de changement de rôle du produit. Sans lui,
                    le propriétaire ré-invitait le collègue avec le nouveau
                    rôle — geste qui ne change RIEN et annonce un succès. */}
                <form
                  onSubmit={roleSubmit}
                  className="flex items-center gap-1.5"
                >
                  <input type="hidden" name="userId" value={m.user_id} />
                  <label className="sr-only" htmlFor={`role-${m.user_id}`}>
                    Accès de {m.email}
                  </label>
                  <select
                    id={`role-${m.user_id}`}
                    name="role"
                    defaultValue={m.role}
                    className={roleSelectClass}
                  >
                    <option value="cashier">Caisse uniquement</option>
                    <option value="editor">Campagnes et caisse</option>
                  </select>
                  <button
                    type="submit"
                    disabled={rolePending}
                    className="text-xs font-semibold text-zinc-700 hover:underline disabled:opacity-50"
                  >
                    Changer
                  </button>
                </form>
                <form onSubmit={onSubmit}>
                  <input type="hidden" name="userId" value={m.user_id} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="shrink-0 text-sm text-red-600 hover:underline disabled:opacity-50"
                  >
                    Retirer
                  </button>
                </form>
              </div>
            )}
          </li>
        ))}
      </ul>
      {roleState?.ok && (
        <p className="mt-2 text-sm font-medium text-emerald-600">
          Accès mis à jour.
        </p>
      )}
      <FieldError
        message={roleState && !roleState.ok ? roleState.error : undefined}
      />
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </div>
  );
}

export function PendingInvitationsList({
  invitations,
}: {
  invitations: TeamInvitation[];
}) {
  const { state, pending, onSubmit } = useActionForm(revokeInvitation, {
    networkError: "Annulation impossible, réessayez.",
    // Même forme que le retrait d'un membre : la ligne d'invitation ne
    // disparaît que par le rendu serveur. Sans rechargement, l'invitation
    // révoquée reste affichée « expire le … », donc toujours vivante aux yeux
    // du propriétaire, qui la révoque une seconde fois sans effet visible.
    reloadOnSuccess: true,
  });

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
                {TEAM_ROLE_LABELS[inv.role] ?? inv.role} · expire le{" "}
                {formatDate(inv.expires_at)}
              </p>
            </div>
            <form onSubmit={onSubmit}>
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
