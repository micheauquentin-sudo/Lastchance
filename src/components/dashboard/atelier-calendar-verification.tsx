import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  definitionEtapeCalendrier,
  hrefEtapeCalendrier,
} from "@/components/dashboard/atelier-calendar-etapes";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import {
  caseVide,
  verificationCalendrier,
  type EntreeVerificationCalendrier,
} from "@/lib/activation/calendar";

/**
 * ÉTAPE 3 — « La vérification » du calendrier. N'ÉCRIT RIEN, NE PUBLIE PAS.
 *
 * Son apport principal tient en une phrase : elle NOMME la case qui bloque. Le
 * refus serveur dit « Une case lot n'a pas de stock » sur une grille de 24 à 60
 * cases, sans jamais dire laquelle — c'est le défaut que cet écran ferme, en
 * partageant le module d'activation avec l'action plutôt qu'en le recopiant.
 */
export function AtelierCalendrierVerification({
  calendarId,
  entree,
}: {
  calendarId: string;
  entree: EntreeVerificationCalendrier;
}) {
  const etat = verificationCalendrier(entree);
  // `etat.garnies` compte « complètes POUR LEUR USAGE » : depuis qu'une case
  // message vide est légale, elle y entre. Ce n'est pas faux, mais ce n'est pas
  // ce que le commerçant lit dans « garnies » — on retranche les vides et on
  // les nomme, avec le prédicat partagé plutôt qu'une règle recopiée.
  const vides = entree.cases.filter(caseVide).length;
  const garnies = etat.garnies - vides;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-k-ink">Tout est-il prêt ?</h2>
        <p className="mt-1 text-sm font-semibold text-k-body">
          {garnies} case{garnies > 1 ? "s" : ""} garnie
          {garnies > 1 ? "s" : ""} sur {entree.cases.length}
          {vides > 0 && (
            <>
              , {vides} qui s&apos;ouvrira{vides > 1 ? "ont" : ""} sur un « pas
              de chance »
            </>
          )}
          . Chaque point en rouge nomme la case à corriger et y mène.
        </p>
      </div>

      <ul className="space-y-2">
        {etat.controles.map((controle) => {
          const alerte = !controle.ok && !controle.bloquant;
          const premiereCase = controle.casesLiees?.[0];
          return (
            <li
              key={controle.cle}
              className={`flex gap-3 rounded-2xl border-2 p-3 ${
                controle.ok
                  ? "border-k-ink/25 bg-white"
                  : alerte
                    ? "border-amber-400 bg-amber-50"
                    : "border-red-700/60 bg-red-50"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-k-ink text-sm font-black ${
                  controle.ok
                    ? "bg-k-green text-k-bg"
                    : alerte
                      ? "bg-white text-amber-700"
                      : "bg-white text-red-700"
                }`}
              >
                {controle.ok ? "✓" : alerte ? "!" : "✗"}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-k-ink">
                  <span className="sr-only">
                    {controle.ok
                      ? "Prêt : "
                      : alerte
                        ? "À savoir : "
                        : "À corriger : "}
                  </span>
                  {controle.titre}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-k-body">
                  {controle.detail}
                </p>
                {!controle.ok && controle.etape && (
                  <Link
                    href={
                      premiereCase === undefined
                        ? hrefEtapeCalendrier(calendarId, controle.etape)
                        : `${hrefEtapeCalendrier(calendarId, controle.etape)}#case-${premiereCase}`
                    }
                    className="mt-2 inline-block text-sm font-black text-k-ink underline underline-offset-2"
                  >
                    {premiereCase === undefined
                      ? `Corriger à l'étape « ${definitionEtapeCalendrier(controle.etape).titre} »`
                      : `Aller à la case ${premiereCase}`}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <InfoBulle
        id="aide-verification-calendrier"
        resume="Qu'est-ce qui empêche vraiment d'ouvrir ?"
      >
        Les points en rouge, et eux seuls : le serveur refuse l&apos;ouverture
        tant qu&apos;une case promet quelque chose sans pouvoir le tenir — un lot
        sans stock ni libellé, un tour de roue sans roue. Une case message
        laissée vide n&apos;est PAS un défaut : c&apos;est un choix, elle
        s&apos;ouvrira sur un « pas de chance », comptera dans l&apos;assiduité
        et n&apos;empêche pas d&apos;ouvrir. Les points orange n&apos;empêchent
        rien non plus — ils décrivent ce que vos clients rencontreraient si vous
        ouvriez tel quel.
      </InfoBulle>

      {etat.toutPret ? (
        <div className="rounded-2xl border-2 border-k-ink bg-k-green/30 p-4">
          <p className="text-sm font-black text-k-ink">
            Rien ne manque. Il ne reste qu&apos;à ouvrir le calendrier à vos
            clients.
          </p>
          <Link
            href={`/dashboard/calendar/${calendarId}#statut`}
            className="k-btn-sm mt-3 inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
          >
            Tout est prêt — Ouvrir aux joueurs
          </Link>
          <p className="mt-2 text-xs font-bold text-k-body">
            L&apos;ouverture se fait sur le suivi du calendrier : c&apos;est le
            seul endroit qui publie.
          </p>
        </div>
      ) : (
        <p className="rounded-2xl border-2 border-k-ink/25 bg-k-bg p-4 text-sm font-bold text-k-body">
          Corrigez les points en rouge, puis revenez ici. L&apos;ouverture se
          fait depuis{" "}
          <Link
            href={`/dashboard/calendar/${calendarId}#statut`}
            className="font-black text-k-ink underline underline-offset-2"
          >
            le suivi du calendrier
          </Link>
          .
        </p>
      )}
    </Card>
  );
}
