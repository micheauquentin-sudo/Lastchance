import type { Metadata } from "next";
import Link from "next/link";
import { login } from "@/actions/auth";
import { AuthForm } from "@/components/auth/auth-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <Card>
      <h1 className="text-xl font-bold mb-1">Connexion</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Accédez à votre espace commerçant.
      </p>
      <AuthForm action={login} submitLabel="Se connecter" />
      <p className="mt-6 text-sm text-zinc-500 text-center">
        Pas encore de compte ?{" "}
        <Link href="/signup" className="font-medium text-violet-600 hover:underline">
          Essai gratuit
        </Link>
      </p>
    </Card>
  );
}
