import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordReset } from "@/actions/auth";
import { AuthForm } from "@/components/auth/auth-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <h1 className="mb-1 text-xl font-bold">Réinitialiser le mot de passe</h1>
      <p className="mb-6 text-sm text-zinc-500">Si un compte correspond, un lien de réinitialisation sera envoyé.</p>
      <ResetRequestForm />
      <Link href="/login" className="mt-5 block text-center text-sm text-orange-600 hover:underline">← Connexion</Link>
    </Card>
  );
}

function ResetRequestForm() {
  return <AuthForm action={requestPasswordReset} submitLabel="Envoyer le lien" successMessage="Si ce compte existe, le lien vient d'être envoyé." mode="forgot" />;
}
