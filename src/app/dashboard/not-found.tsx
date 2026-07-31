import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getUserAndOrg } from "@/lib/auth";
import { hasActiveAccess } from "@/lib/subscription";

/**
 * 404 du panel : rendu à l'intérieur du layout dashboard (sidebar visible).
 * Couvre notamment le cas où un lien pointe vers une campagne/roue qui
 * n'appartient pas à l'organisation actuellement active — le
 * cloisonnement multi-tenant bloque la requête avant même d'arriver ici,
 * donc ce n'est jamais un accès refusé silencieux, juste "introuvable ici".
 *
 * MAIS ce n'est pas la seule route vers cet écran, et le message unique
 * mentait sur la seconde. Les sept pages de module (`calendar/[id]`,
 * `hunts/[id]`, `quiz/[id]`, `events/[id]`, `pronostics/[id]`,
 * `jackpot/[id]`, `loyalty/[id]`) appellent `notFound()` quand l'abonnement
 * ne couvre plus le module. Le commerçant dont l'essai vient d'expirer
 * ouvrait alors son favori et lisait qu'il fallait « vérifier le sélecteur
 * d'organisation » — on l'envoyait chercher une cause inexistante, alors
 * que la page existe, lui appartient, et n'est fermée que par l'abonnement.
 *
 * `getUserAndOrg` est un `cache()` : le layout l'a déjà appelée pour ce
 * rendu, la distinction ne coûte aucune requête supplémentaire.
 */
export default async function DashboardNotFound() {
  const { organization, role } = await getUserAndOrg();
  const abonnementCoupe = organization ? !hasActiveAccess(organization) : false;
  // `/dashboard/settings` redirige tout le monde sauf le propriétaire. Y
  // envoyer un éditeur, c'est le renvoyer d'où il vient sans un mot — le
  // défaut même que ce correctif traite. Lui seul voit donc ce lien.
  const versAbonnement = abonnementCoupe && role === "owner";

  return (
    <Card className="mx-auto max-w-lg py-12 text-center">
      <span className="k-border mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-k-yellow text-2xl">
        {abonnementCoupe ? "🔒" : "🔍"}
      </span>
      <h1 className="mt-5 text-xl font-black text-k-ink">
        {abonnementCoupe ? "Page réservée aux abonnés" : "Page introuvable"}
      </h1>
      {abonnementCoupe ? (
        <p className="mx-auto mt-2 max-w-sm text-sm font-bold text-k-body">
          Vos données sont intactes : rien n&apos;a été supprimé. Cette page
          se rouvre dès que votre abonnement reprend.
        </p>
      ) : (
        <p className="mx-auto mt-2 max-w-sm text-sm font-bold text-k-body">
          Cette page n&apos;existe pas, ou n&apos;appartient pas à
          l&apos;organisation actuellement sélectionnée. Si vous gérez
          plusieurs commerces, vérifiez le sélecteur d&apos;organisation en
          haut du menu.
        </p>
      )}
      <Link
        href={versAbonnement ? "/dashboard/settings" : "/dashboard"}
        className="k-border k-btn-sm mt-6 inline-block rounded-full bg-k-yellow px-6 py-2.5 text-sm font-black text-k-ink"
      >
        {versAbonnement ? "Voir mon abonnement" : "Retour au tableau de bord"}
      </Link>
    </Card>
  );
}
