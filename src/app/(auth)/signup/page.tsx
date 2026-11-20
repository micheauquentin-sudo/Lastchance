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

const PLAN_LABELS: Record<string, string> = {
  none: "100 % À la carte",
  core: "Coup d'envoi",
  engagement: "Le Club",
  place: "Sur Place",
  live: "Le Grand Jeu",
  full: "La Totale",
};

const ADDON_LABELS: Record<string, string> = {
  vitrine: "Vitrine & Tarifs QR",
  rdv: "Réservation Directe 0 %",
  moments: "Moments, File & Invendus",
  passport: "Passeport Fidélité & Lots",
  referral: "Parrainage Ambassadeurs",
  duo: "Duo Miroir",
  bande: "Portrait de la Bande",
  pass_hunt: "Pass Chasse au Trésor",
  pass_advent: "Pass Calendrier Surprises",
  pass_quiz: "Pass Quiz Express",
  pass_pot: "Pass Cagnotte & Jackpot",
  pass_prono: "Pass Saison Pronostics",
  pass_screen: "Pass Soirée Live (Écran TV)",
  pass_screen_10: "Pass Soirée Live (10 joueurs)",
  pass_screen_30: "Pass Soirée Live (30 joueurs)",
  pass_screen_50: "Pass Soirée Live (50 joueurs)",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; plan?: string; addons?: string; from?: string; module?: string }>;
}) {
  const { next, plan, addons, from, module: mod } = await searchParams;
  const targetNext = next || "/dashboard";
  const planLabel = plan ? (PLAN_LABELS[plan] ?? plan.replace(/_/g, " ")) : undefined;
  const addonLabels = addons
    ? addons
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
        .map((k) => ADDON_LABELS[k] ?? k.replace(/_/g, " "))
    : [];

  return (
    <Card>
      <h1 className="text-xl font-bold mb-1">Créer un compte</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Accédez gratuitement à votre espace Simple comme QR, sans carte bancaire.
        Configurez tout en brouillon et ne payez que pour publier.
      </p>

      {(planLabel || addonLabels.length > 0) && (
        <div className="mb-5 p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
          <span className="text-base">✨</span>
          <div className="space-y-1">
            {planLabel && (
              <strong className="font-bold text-amber-900 block text-xs uppercase tracking-wide">
                Formule choisie pour publier : {planLabel}
              </strong>
            )}
            {addonLabels.length > 0 && (
              <p className="text-amber-900 font-medium">
                Options &amp; Pass ajoutés : {addonLabels.join(" · ")}
              </p>
            )}
            <p className="text-amber-800 leading-relaxed">
              Votre compte est créé gratuitement, sans paiement immédiat. Préparez
              vos animations en brouillon, puis activez votre formule au moment de
              publier.
            </p>
            <Link
              href="/signup"
              className="inline-block font-bold text-amber-950 underline underline-offset-2 pt-0.5"
            >
              Ou créer un compte gratuit sans formule présélectionnée →
            </Link>
          </div>
        </div>
      )}

      {from === "studio" && !plan && (
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
