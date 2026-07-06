import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { OnboardingForm } from "@/components/auth/onboarding-form";

export const metadata: Metadata = { title: "Bienvenue" };

export default async function OnboardingPage() {
  const { user, organization } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (organization) redirect("/dashboard");

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Card>
          <h1 className="text-xl font-bold mb-1">Bienvenue 👋</h1>
          <p className="text-sm text-zinc-500 mb-6">
            Comment s&apos;appelle votre établissement ?
          </p>
          <OnboardingForm />
        </Card>
      </div>
    </main>
  );
}
