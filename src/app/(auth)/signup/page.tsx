import type { Metadata } from "next";
import Link from "next/link";
import { signup } from "@/actions/auth";
import { AuthForm } from "@/components/auth/auth-form";
import {
  AuthDivider,
  GoogleAuthButton,
} from "@/components/auth/google-button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; from?: string; module?: string }>;
}) {
  const { next, from, module: mod } = await searchParams;
  const targetNext = next || "/dashboard";

  return (
    <Card>
      <h1 className="text-xl font-bold mb-1">Créer un compte</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Accédez gratuitement à votre espace Simple comme QR, sans carte bancaire. Configurez tout en brouillon et abonnez-vous uniquement au moment de publier.
      </p>

      {from === "studio" && (
        <div className="mb-5 p-3.5 bg-purple-50 border border-purple-300 rounded-xl text-xs text-purple-950 flex items-start gap-2.5">
          <span className="text-base">🛠️</span>
          <div className="space-y-0.5">
            <strong className="font-bold text-purple-900 block text-xs uppercase tracking-wide">
              Configuration Studio sauvegardée{mod ? ` (${mod})` : ""}
            </strong>
            <p className="text-purple-800 leading-relaxed">
              Vos réglages sont gardés en mémoire et seront importés directement dans votre tableau de bord.
            </p>
          </div>
        </div>
      )}

      <GoogleAuthButton label="S'inscrire avec Google" next={targetNext} />
      <AuthDivider />
      <AuthForm
        action={signup}
        submitLabel="Créer mon compte"
        successMessage="Compte créé ! Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous."
        next={targetNext}
        mode="signup"
      />
      <p className="mt-6 text-sm text-zinc-500 text-center">
        Déjà inscrit ?{" "}
        <Link
          href={targetNext ? `/login?next=${encodeURIComponent(targetNext)}` : "/login"}
          className="font-medium text-k-orange-text hover:underline"
        >
          Connexion
        </Link>
      </p>
    </Card>
  );
}
