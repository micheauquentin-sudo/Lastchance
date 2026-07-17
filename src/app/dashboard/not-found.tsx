import Link from "next/link";
import { Card } from "@/components/ui/card";

/**
 * 404 du panel : rendu à l'intérieur du layout dashboard (sidebar visible).
 * Couvre notamment le cas où un lien pointe vers une campagne/roue qui
 * n'appartient pas à l'organisation actuellement active — le
 * cloisonnement multi-tenant bloque la requête avant même d'arriver ici,
 * donc ce n'est jamais un accès refusé silencieux, juste "introuvable ici".
 */
export default function DashboardNotFound() {
  return (
    <Card className="mx-auto max-w-lg py-12 text-center">
      <span className="k-border mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-k-yellow text-2xl">
        🔍
      </span>
      <h1 className="mt-5 text-xl font-black text-k-ink">Page introuvable</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm font-bold text-k-body">
        Cette page n&apos;existe pas, ou n&apos;appartient pas à
        l&apos;organisation actuellement sélectionnée. Si vous gérez
        plusieurs commerces, vérifiez le sélecteur d&apos;organisation en
        haut du menu.
      </p>
      <Link
        href="/dashboard"
        className="k-border k-btn-sm mt-6 inline-block rounded-full bg-k-yellow px-6 py-2.5 text-sm font-black text-k-ink"
      >
        Retour au tableau de bord
      </Link>
    </Card>
  );
}
