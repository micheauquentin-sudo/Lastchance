import type { Metadata } from "next";
import { PasswordUpdateForm } from "@/components/auth/password-update-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default function UpdatePasswordPage() {
  return (
    <Card>
      <h1 className="mb-1 text-xl font-bold">Choisir un nouveau mot de passe</h1>
      <p className="mb-6 text-sm text-zinc-500">Utilisez au moins 8 caractères et un mot de passe unique.</p>
      <PasswordUpdateForm />
    </Card>
  );
}
