import type { Metadata } from "next";
import Link from "next/link";
import { login } from "@/actions/auth";
import { AuthForm } from "@/components/auth/auth-form";
import {
  AuthDivider,
  GoogleAuthButton,
} from "@/components/auth/google-button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Connexion" };

const ERROR_MESSAGES: Record<string, string> = {
  oauth: "La connexion Google a échoué. Réessayez ou utilisez votre email.",
  confirmation:
    "Le lien de confirmation est invalide ou expiré. Reconnectez-vous pour en recevoir un nouveau.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; reset?: string }>;
}) {
  const { error, next, reset } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  return (
    <Card>
      <h1 className="text-xl font-bold mb-1">Connexion</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Accédez à votre espace commerçant.
      </p>
      {errorMessage && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </p>
      )}
      {reset === "done" && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Mot de passe modifié. Vous pouvez vous connecter.</p>}
      <GoogleAuthButton label="Continuer avec Google" next={next} />
      <AuthDivider />
      <AuthForm action={login} submitLabel="Se connecter" next={next} />
      <p className="mt-3 text-center text-sm"><Link href="/forgot-password" className="text-zinc-500 hover:text-orange-600">Mot de passe oublié ?</Link></p>
      <p className="mt-6 text-sm text-zinc-500 text-center">
        Pas encore de compte ?{" "}
        <Link
          href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
          className="font-medium text-orange-600 hover:underline"
        >
          Essai gratuit
        </Link>
      </p>
    </Card>
  );
}
