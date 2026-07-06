import type { Metadata } from "next";
import Link from "next/link";
import { signup } from "@/actions/auth";
import { AuthForm } from "@/components/auth/auth-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Créer un compte" };

export default function SignupPage() {
  return (
    <Card>
      <h1 className="text-xl font-bold mb-1">Créer un compte</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Lancez votre première roue en quelques minutes.
      </p>
      <AuthForm
        action={signup}
        submitLabel="Créer mon compte"
        successMessage="Compte créé ! Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous."
      />
      <p className="mt-6 text-sm text-zinc-500 text-center">
        Déjà inscrit ?{" "}
        <Link href="/login" className="font-medium text-violet-600 hover:underline">
          Connexion
        </Link>
      </p>
    </Card>
  );
}
