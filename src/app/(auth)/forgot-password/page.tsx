import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordReset } from "@/actions/auth";
import { AuthForm } from "@/components/auth/auth-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Mot de passe oublié" };

/**
 * Le proxy sert cette page sous CSP à nonce (`strict-dynamic`, sans
 * `'unsafe-inline'`). Un HTML prérendu au build ne porte aucun nonce :
 * ses balises <script> — en ligne comme externes, `'self'` étant ignoré
 * sous `strict-dynamic` — étaient toutes bloquées, et le formulaire ne
 * s'hydratait jamais. Rendue à la requête, la page reçoit le nonce du
 * proxy. Deux seules pages du back-office étaient concernées (celle-ci
 * et /update-password) : les autres dépendent déjà de la session.
 */
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <Card>
      <h1 className="mb-1 text-xl font-bold">Réinitialiser le mot de passe</h1>
      <p className="mb-6 text-sm text-zinc-500">Si un compte correspond, un lien de réinitialisation sera envoyé.</p>
      <ResetRequestForm />
      <Link href="/login" className="mt-5 block text-center text-sm text-k-orange-text hover:underline">← Connexion</Link>
    </Card>
  );
}

function ResetRequestForm() {
  return <AuthForm action={requestPasswordReset} submitLabel="Envoyer le lien" successMessage="Si ce compte existe, le lien vient d'être envoyé." mode="forgot" />;
}
