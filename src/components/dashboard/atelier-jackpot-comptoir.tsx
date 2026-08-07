import Link from "next/link";
import { Card } from "@/components/ui/card";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { formatDurationLabel } from "@/components/jackpot/jackpot-state";

/**
 * ÉTAPE « L'ÉCRAN COMPTOIR » — LECTURE SEULE, ET SEULEMENT EN CODE TOURNANT.
 *
 * Elle n'écrit rien : tout ce qu'elle décrit se règle à l'étape des réglages.
 * Elle existe parce que le mode « Code au comptoir » demande un GESTE PHYSIQUE
 * — installer un écran face aux clients — que rien dans le produit ne disait
 * avant l'ouverture. Un commerçant qui ouvre sa cagnotte sans cet écran n'a
 * aucun code à montrer : personne ne peut participer, et rien ne l'annonce.
 *
 * En « Validation en caisse » cette étape n'est pas construite du tout
 * (`etapesJackpot`) : `getJackpotCounterCode` y rend `code: null`, l'écran n'y
 * produit rien.
 */
export function AtelierJackpotComptoir({
  campaignId,
  periodSeconds,
  cooldownSeconds,
}: {
  campaignId: string;
  periodSeconds: number;
  cooldownSeconds: number;
}) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-k-ink">L&apos;écran comptoir</h2>
        <p className="mt-1 text-sm font-semibold text-k-body">
          En mode « Code au comptoir », un code à 6 chiffres change toutes les{" "}
          {formatDurationLabel(periodSeconds)} sur un écran placé face aux
          clients. C&apos;est ce code qu&apos;ils saisissent pour participer :
          sans écran allumé, la cagnotte est ouverte mais injouable.
        </p>
      </div>

      <ul className="space-y-2">
        <li className="rounded-2xl border-2 border-k-ink/25 bg-white p-3 text-sm font-semibold text-k-body">
          <span className="font-black text-k-ink">Ce qu&apos;il vous faut : </span>
          un écran, une tablette ou un vieux téléphone posé au comptoir, connecté
          à votre compte. La page se met en plein écran d&apos;un bouton.
        </li>
        <li className="rounded-2xl border-2 border-k-ink/25 bg-white p-3 text-sm font-semibold text-k-body">
          <span className="font-black text-k-ink">Le rythme : </span>
          un nouveau code toutes les {formatDurationLabel(periodSeconds)}, et un
          même client ne peut pas participer plus souvent que toutes les{" "}
          {formatDurationLabel(cooldownSeconds)} — le double de la rotation, 5
          minutes au minimum, pour qu&apos;un code reste valable le temps de deux
          rotations.
        </li>
        <li className="rounded-2xl border-2 border-k-ink/25 bg-white p-3 text-sm font-semibold text-k-body">
          <span className="font-black text-k-ink">Ce qui s&apos;y affiche aussi : </span>
          la jauge géante et le montant qui monte à chaque participation. C&apos;est
          l&apos;écran qui chauffe la salle, pas seulement celui qui donne le code.
        </li>
      </ul>

      <InfoBulle
        id="aide-comptoir-jackpot"
        resume="Pourquoi un code qui change plutôt qu'un code fixe ?"
      >
        Un code fixe se photographie et circule : la cagnotte se remplirait
        depuis le canapé du client. Le code tournant oblige à être dans la
        boutique au moment où il s&apos;affiche — c&apos;est ce qui garde le jeu
        lié à une visite réelle. Plus la rotation est courte, plus c&apos;est
        vrai ; 5 minutes est le maximum.
      </InfoBulle>

      <Link
        href={`/dashboard/jackpot/${campaignId}/comptoir`}
        className="k-btn-sm inline-flex items-center gap-2 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
      >
        Ouvrir l&apos;écran comptoir →
      </Link>
    </Card>
  );
}
