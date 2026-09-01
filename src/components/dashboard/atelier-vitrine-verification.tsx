import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  definitionEtapeVitrine,
  etapeDuControleVitrine,
  hrefEtapeVitrine,
} from "@/components/dashboard/atelier-vitrine-etapes";
import {
  construireVerificationVitrine,
  type EntreeVerificationVitrine,
} from "@/lib/activation/vitrine";

/**
 * ÉTAPE 7 — « La vérification » de la Vitrine. N'ÉCRIT RIEN, NE PUBLIE PAS.
 *
 * Elle n'invente aucun contrôle : `construireVerificationVitrine` est la même
 * fonction qui colorait déjà les tuiles de l'ancien écran. Ce qui change est
 * ce qu'on en fait — un point rouge renvoie désormais à L'ÉTAPE qui le
 * corrige, là où une tuile ne pouvait que se colorer sur place.
 *
 * ── LE BOUTON DE PUBLICATION N'EST PAS ICI ──
 *
 * Publier n'est pas une étape de préparation : c'est le geste qui expose la
 * page au monde, et il vit dans la vue suivi, à côté de l'adresse et du QR.
 * Cette carte y renvoie plutôt que de le dupliquer — deux boutons pour ouvrir
 * la même vitrine, c'est un de trop, et le second finit toujours par diverger.
 */
export function AtelierVerificationVitrine({
  entree,
}: {
  entree: EntreeVerificationVitrine;
}) {
  const etat = construireVerificationVitrine(entree);
  const restants = etat.controles.filter((c) => !c.ok);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-k-ink">Tout est-il prêt ?</h2>
        <p className="mt-1 text-sm font-semibold text-k-body">
          Calculés sur l&apos;état réel de votre vitrine. Chaque point en rouge
          renvoie à l&apos;étape qui le corrige.
        </p>
      </div>

      <ul className="space-y-2">
        {etat.controles.map((controle) => {
          const etape = etapeDuControleVitrine(controle.cle);
          return (
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
                <p className="text-sm font-black text-k-ink">{controle.titre}</p>
                <p className="mt-0.5 text-sm font-semibold text-k-body">
                  {controle.detail}
                </p>
                {/* LE LIEN N'APPARAÎT QUE SUR UN POINT ROUGE, et seulement si
                    l'étape qui le corrige n'est pas celle-ci. Un « corriger »
                    sous un point vert invite à défaire ce qui est fait ; un
                    lien vers la page qu'on lit déjà ne mène nulle part. */}
                {!controle.ok && etape !== "verification" ? (
                  <Link
                    href={hrefEtapeVitrine(etape)}
                    className="mt-1.5 inline-block text-sm font-black text-k-orange-text underline underline-offset-2"
                  >
                    Corriger dans « {definitionEtapeVitrine(etape).titre} »
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="rounded-2xl border-2 border-k-ink/25 bg-white p-3">
        <p className="text-sm font-semibold text-k-body">
          {restants.length === 0 ? (
            <>
              Tout est prêt. La publication et le QR code vous attendent sur
              l&apos;écran de suivi.
            </>
          ) : (
            <>
              {restants.length} point{restants.length > 1 ? "s" : ""} à régler
              avant d&apos;ouvrir votre vitrine à vos clients.
            </>
          )}
        </p>
        <Link
          href={baseSuivi()}
          className="mt-2 inline-block text-sm font-black text-k-orange-text underline underline-offset-2"
        >
          Revenir au suivi
        </Link>
      </div>
    </Card>
  );
}

/**
 * LA VUE SUIVI EST LA PAGE NUE — sans `?etape=`. Écrit ici plutôt qu'importé
 * pour que ce fichier n'ait pas à connaître la base de l'atelier deux fois.
 */
function baseSuivi(): string {
  return "/dashboard/vitrine";
}
