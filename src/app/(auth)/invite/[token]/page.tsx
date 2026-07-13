import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { AcceptInviteForm } from "@/components/dashboard/accept-invite-form";

export const metadata: Metadata = { title: "Invitation d'équipe" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { user } = await getUserAndOrg();

  const next = `/invite/${token}`;

  return (
    <div>
      <h1 className="text-xl font-bold mb-1 text-center">
        Invitation d&apos;équipe
      </h1>
      <p className="text-sm text-zinc-500 mb-6 text-center">
        On vous a invité(e) à rejoindre un établissement sur Lastchance.
      </p>

      {user ? (
        <AcceptInviteForm token={token} />
      ) : (
        <Card>
          <p className="text-sm text-zinc-600 mb-4">
            Connectez-vous (ou créez un compte avec l&apos;adresse email qui a
            reçu l&apos;invitation) pour l&apos;accepter.
          </p>
          <div className="flex gap-2">
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="flex-1 text-center rounded-lg bg-zinc-900 text-white text-sm font-semibold px-4 py-2.5 hover:bg-zinc-700 transition-colors"
            >
              Se connecter
            </Link>
            <Link
              href={`/signup?next=${encodeURIComponent(next)}`}
              className="flex-1 text-center rounded-lg border border-zinc-300 text-sm font-semibold px-4 py-2.5 hover:bg-zinc-50 transition-colors"
            >
              Créer un compte
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
