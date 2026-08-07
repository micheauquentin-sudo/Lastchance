import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  definitionEtape,
  hrefEtapeAtelier,
} from "@/components/dashboard/atelier-etapes";
import {
  construireVerification,
  type EntreeVerification,
} from "@/components/dashboard/atelier-verification-state";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { WheelPreviewTest } from "@/components/dashboard/wheel-preview-test";
import { isSkillGameType } from "@/lib/validations/skill";

/**
 * ÉTAPE 5 — « La vérification ». N'ÉCRIT RIEN.
 *
 * Elle ne porte AUCUN bouton de publication, et c'est délibéré : un seul écran
 * publie, la page de détail de la campagne (`#statut`), et un seul geste y
 * mène. Deux boutons « Ouvrir aux joueurs » à deux endroits, c'est deux
 * vérités sur l'état d'une animation — le dépôt en a déjà payé le prix
 * ailleurs. Ici on vérifie, puis on renvoie.
 */
export function AtelierVerification({
  entree,
  wheelId,
}: {
  entree: EntreeVerification;
  wheelId: string;
}) {
  const etat = construireVerification(entree);

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-black text-k-ink">Tout est-il prêt ?</h2>
          <p className="mt-1 text-sm font-semibold text-k-body">
            Cinq points, calculés sur l&apos;état réel de votre jeu. Chaque point
            en rouge renvoie à l&apos;étape qui le corrige.
          </p>
        </div>

        <ul className="space-y-2">
          {etat.controles.map((controle) => (
            <li
              key={controle.cle}
              className={`flex gap-3 rounded-2xl border-2 p-3 ${
                controle.ok
                  ? "border-k-ink/25 bg-white"
                  : "border-red-700/60 bg-red-50"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-k-ink text-sm font-black ${
                  controle.ok ? "bg-k-green text-k-bg" : "bg-white text-red-700"
                }`}
              >
                {controle.ok ? "✓" : "✗"}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-k-ink">
                  <span className="sr-only">
                    {controle.ok ? "Prêt : " : "À corriger : "}
                  </span>
                  {controle.titre}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-k-body">
                  {controle.detail}
                </p>
                {!controle.ok && (controle.etape || controle.lien) && (
                  <Link
                    href={
                      controle.lien
                        ? controle.lien.href
                        : hrefEtapeAtelier(
                            entree.campaignId,
                            controle.etape!,
                            wheelId,
                          )
                    }
                    className="mt-2 inline-block text-sm font-black text-k-ink underline underline-offset-2"
                  >
                    {controle.lien
                      ? controle.lien.label
                      : `Corriger à l'étape « ${definitionEtape(controle.etape!).label} »`}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>

        <InfoBulle id="aide-verification" resume="Que vérifie cette liste, exactement ?">
          Elle relit ce qui est enregistré, pas ce que vous venez de taper : les
          lots réellement tirables (un lot épuisé ou désactivé ne sort plus), le
          poids total, l&apos;existence d&apos;un QR code, et les dates de la
          campagne. Elle n&apos;empêche rien : ouvrir aux joueurs reste possible
          même avec un point en rouge — vous saurez simplement lequel.
        </InfoBulle>

        {etat.toutPret ? (
          <div className="rounded-2xl border-2 border-k-ink bg-k-green/30 p-4">
            <p className="text-sm font-black text-k-ink">
              Rien ne manque. Il ne reste qu&apos;à ouvrir le jeu à vos clients.
            </p>
            <Link
              href={etat.ctaHref}
              className="k-btn-sm mt-3 inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
            >
              Tout est prêt — Ouvrir aux joueurs
            </Link>
            <p className="mt-2 text-xs font-bold text-k-body">
              L&apos;ouverture se fait sur la page de la campagne : c&apos;est le
              seul endroit qui publie.
            </p>
          </div>
        ) : (
          <p className="rounded-2xl border-2 border-k-ink/25 bg-k-bg p-4 text-sm font-bold text-k-body">
            Corrigez les points en rouge, puis revenez ici. Vous pouvez tout de
            même ouvrir le jeu depuis{" "}
            <Link href={etat.ctaHref} className="font-black text-k-ink underline underline-offset-2">
              la page de la campagne
            </Link>{" "}
            — rien ne vous en empêche, mais vos clients rencontreront ce qui est
            listé ci-dessus.
          </p>
        )}
      </Card>

      <WheelPreviewTest
        wheelId={wheelId}
        estJeuDeDefi={isSkillGameType(entree.gameType)}
      />
    </div>
  );
}
