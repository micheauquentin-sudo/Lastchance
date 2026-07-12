import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { can } from "@/lib/admin/rbac";
import { listAdminTeam } from "@/lib/admin/data";
import { formatDate } from "@/lib/utils";
import { Badge, EmptyState, PageHeader, Panel, Table } from "@/components/admin/ui";
import {
  CreateAdminForm,
  RoleControl,
  ToggleControl,
} from "@/components/admin/admin-team-controls";
import { ADMIN_ROLE_LABELS } from "@/types/admin";

export const metadata: Metadata = { title: "Paramètres · Back-office", robots: { index: false } };

export default async function SettingsPage() {
  const admin = await requireAdmin("settings.view");
  const canManage = can(admin.role, "admins.manage");
  const team = await listAdminTeam();

  return (
    <div>
      <PageHeader
        title="Paramètres"
        description="Équipe du back-office et rôles d'accès."
      />

      <Panel className="mb-8 p-5">
        <h2 className="mb-1 text-sm font-semibold text-white">Matrice des rôles</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Chaque rôle donne un ensemble fixe de permissions. Les actions sensibles
          sont journalisées et l&apos;attribution d&apos;un rôle supérieur au vôtre est
          impossible.
        </p>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li className="text-zinc-300"><b className="text-white">Super Admin</b> — tout, dont la gestion de l&apos;équipe.</li>
          <li className="text-zinc-300"><b className="text-white">Admin</b> — opérationnel complet, sauf gestion de l&apos;équipe.</li>
          <li className="text-zinc-300"><b className="text-white">Support</b> — commerçants + notes, sans finance.</li>
          <li className="text-zinc-300"><b className="text-white">Finance</b> — Stripe/facturation, sans actions support.</li>
          <li className="text-zinc-300"><b className="text-white">Lecture seule</b> — consultation uniquement.</li>
        </ul>
      </Panel>

      {canManage && (
        <Panel className="mb-8 p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Inviter un membre</h2>
          <CreateAdminForm actorRole={admin.role} />
          <p className="mt-3 text-xs text-zinc-500">
            La personne doit déjà avoir un compte LastChance (même email).
          </p>
        </Panel>
      )}

      <h2 className="mb-3 text-sm font-semibold text-white">
        Équipe <span className="text-zinc-500">({team.length})</span>
      </h2>
      {team.length === 0 ? (
        <EmptyState title="Aucun membre" hint="Amorcez le premier super_admin en base." />
      ) : (
        <Table
          head={
            <tr>
              <th className="px-4 py-2.5">Membre</th>
              <th className="px-4 py-2.5">Rôle</th>
              <th className="px-4 py-2.5">Statut</th>
              <th className="px-4 py-2.5">Ajouté</th>
              {canManage && <th className="px-4 py-2.5">Actions</th>}
            </tr>
          }
        >
          {team.map((u) => {
            const isSelf = u.id === admin.id;
            return (
              <tr key={u.id} className="text-zinc-300">
                <td className="px-4 py-3">
                  <p className="font-medium text-white">{u.email}</p>
                  <p className="text-xs text-zinc-500">{u.name || "—"}{isSelf && " · vous"}</p>
                </td>
                <td className="px-4 py-3">
                  {canManage && !isSelf ? (
                    <RoleControl adminId={u.id} current={u.role} actorRole={admin.role} />
                  ) : (
                    <Badge tone="violet">{ADMIN_ROLE_LABELS[u.role]}</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.is_active ? (
                    <Badge tone="emerald">Actif</Badge>
                  ) : (
                    <Badge tone="red">Désactivé</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-400">{formatDate(u.created_at)}</td>
                {canManage && (
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <span className="text-xs text-zinc-600">—</span>
                    ) : (
                      <ToggleControl adminId={u.id} isActive={u.is_active} />
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
