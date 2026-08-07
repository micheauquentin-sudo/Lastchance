import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  definitionEtapeFidelite,
  hrefEtapeFidelite,
} from "@/components/dashboard/atelier-loyalty-etapes";
import {
  construireVerificationFidelite,
  type EntreeVerificationFidelite,
} from "@/components/dashboard/atelier-loyalty-verification-state";
import { InfoBulle } from "@/components/dashboard/info-bulle";

/**
 * ÉTAPE 4 — « La vérification » du passeport. N'ÉCRIT RIEN, NE PUBLIE PAS.
 *
 * Le CTA renvoie sur `#statut` de la vue suivi : un seul écran ouvre un
 * programme aux clients.
 */
export function AtelierVerificationFidelite({
  entree,
  modeValidation,
}: {
  entree: EntreeVerificationFidelite;
  /** Sert au seul rappel d'exploitation : l'écran comptoir en mode code tournant. */
  modeValidation: "rotating_code" | "staff";
}) {
  const etat = construireVerificationFidelite(entree);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-k-ink">Tout est-il prêt ?</h2>
        <p className="mt-1 text-sm font-semibold text-k-body">
          Calculés sur l&apos;état réel de votre programme. Chaque point en
          rouge renvoie à l&apos;étape qui le corrige.
        </p>
      </div>

      <ul className="space-y-2">
        {etat.controles.map((controle) => (
          <li
            key={controle.cle}
            className={`flex gap-3 rounded-2xl border-2 p-3 ${
              controle.ok ? "border-k-ink/25 bg-white" : "border-red-700/60 bg-red-50"
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
              {!controle.ok && (
                <Link
                  href={hrefEtapeFidelite(entree.programId, controle.etape)}
                  className="mt-2 inline-block text-sm font-black text-k-ink underline underline-offset-2"
                >
                  Corriger à l&apos;étape «{" "}
                  {definitionEtapeFidelite(controle.etape).titre} »
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      {modeValidation === "rotating_code" && (
        <p className="rounded-2xl border-2 border-k-ink/25 bg-white p-3 text-sm font-semibold text-k-body">
          Rappel d&apos;exploitation : votre programme valide les visites par
          code au comptoir. L&apos;écran comptoir doit rester ouvert en boutique
          — sans lui, aucun client ne peut tamponner sa visite. Vous le trouvez
          sur l&apos;écran de suivi.
        </p>
      )}

      <InfoBulle
        id="aide-verification-fidelite"
        resume="Que vérifie cette liste, exactement ?"
      >
        Seul le premier point est exigé pour ouvrir le programme. Les autres
        sont des situations que la base laisse passer sans un mot : un palier à
        stock 0 est en pause, un tour de roue offert sur une roue sans lot à
        stock ne distribue rien. Elle n&apos;empêche rien : ouvrir reste
        possible avec un point en rouge.
      </InfoBulle>

      {etat.toutPret ? (
        <div className="rounded-2xl border-2 border-k-ink bg-k-green/30 p-4">
          <p className="text-sm font-black text-k-ink">
            Rien ne manque. Il ne reste qu&apos;à ouvrir le passeport à vos
            clients.
          </p>
          <Link
            href={etat.ctaHref}
            className="k-btn-sm mt-3 inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
          >
            Tout est prêt — Ouvrir aux clients
          </Link>
          <p className="mt-2 text-xs font-bold text-k-body">
            L&apos;ouverture se fait sur l&apos;écran de suivi du programme :
            c&apos;est le seul endroit qui publie.
          </p>
        </div>
      ) : (
        <p className="rounded-2xl border-2 border-k-ink/25 bg-k-bg p-4 text-sm font-bold text-k-body">
          Corrigez les points en rouge, puis revenez ici. Vous pouvez tout de
          même ouvrir le programme depuis{" "}
          <Link
            href={etat.ctaHref}
            className="font-black text-k-ink underline underline-offset-2"
          >
            l&apos;écran de suivi
          </Link>{" "}
          — rien ne vous en empêche, mais vos clients rencontreront ce qui est
          listé ci-dessus.
        </p>
      )}
    </Card>
  );
}
