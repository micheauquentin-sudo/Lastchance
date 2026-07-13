import type { Metadata } from "next";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { TeamInviteForm } from "@/components/dashboard/team-invite-form";
import {
  PendingInvitationsList,
  TeamMembersList,
} from "@/components/dashboard/team-members";
import type { TeamInvitation, TeamMemberRow } from "@/types/database";

export const metadata: Metadata = { title: "Équipe" };

export default async function TeamPage() {
  const { user, organization, role } = await getUserAndOrg();
  const supabase = await createClient();

  if (role !== "owner") {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-8">Équipe</h1>
        <Card>
          <p className="text-sm text-zinc-600">
            La gestion de l&apos;équipe est réservée au propriétaire du
            compte.
          </p>
        </Card>
      </div>
    );
  }

  const [{ data: membersData }, { data: invitationsData }] = await Promise.all([
    supabase.rpc("org_team_members", { p_organization_id: organization!.id }),
    supabase
      .from("team_invitations")
      .select("*")
      .eq("organization_id", organization!.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const members = (membersData ?? []) as TeamMemberRow[];
  const invitations = (invitationsData ?? []) as TeamInvitation[];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Équipe</h1>
      <p className="text-zinc-500 mb-8">
        Donnez accès au dashboard à vos collègues, sans partager votre mot
        de passe.
      </p>

      <div className="max-w-lg space-y-4">
        <Card>
          <h2 className="font-semibold mb-4">Inviter</h2>
          <TeamInviteForm />
        </Card>

        <Card>
          <h2 className="font-semibold mb-4">Invitations en attente</h2>
          <PendingInvitationsList invitations={invitations} />
        </Card>

        <Card>
          <h2 className="font-semibold mb-4">Membres</h2>
          <TeamMembersList members={members} currentUserId={user!.id} />
        </Card>
      </div>
    </div>
  );
}
