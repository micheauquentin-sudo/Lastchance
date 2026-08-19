import { Label } from "@/components/ui/input";
import { champSelect } from "@/components/reserver/champs";

/**
 * LES DEUX RÉGLAGES DU MODE ATTENTE ACTIVE (RES-4), écrits UNE fois.
 *
 * Ils sont posés à l'identique sur deux parents — la file d'accueil
 * (`reservation_queues`) et l'activité (`reservation_activities`) — parce que la
 * migration 20261006120000 pose les deux MÊMES colonnes sur les deux tables.
 * Deux copies de ces champs auraient divergé au premier ajustement de
 * vocabulaire, et c'est exactement la raison d'être de `ChampsCommuns` et de
 * `champs.ts` juste à côté.
 *
 * ── LA LIGNE D'AIDE EST LE CONTRAT, PAS UN ORNEMENT ──
 *
 * « n'influence jamais l'ordre de passage » est ce que le SQL garantit :
 * `wait_session_use_pause` n'écrit RIEN dans la file ni dans la réservation, et
 * la campagne cible vient du parent, jamais de l'appelant. Le commerçant doit le
 * lire avant de cocher, parce que c'est ce qu'il devra pouvoir répondre au
 * client qui demande si jouer lui fait perdre sa place.
 *
 * ── UN SÉLECTEUR VIDE NE S'AFFICHE PAS ──
 *
 * Même règle que « Activité liée » au-dessus : proposer un menu déroulant dont
 * la seule option est « Aucun » demande un choix qui n'existe pas. Sans quiz
 * publié, ou sans campagne, le champ correspondant disparaît.
 */
export function ChampsAttenteActive({
  quiz,
  campagnes,
  instanceId,
  defaultQuizId = null,
  defaultPauseCampaignId = null,
  espacement = "mt-3",
}: {
  /** Les quiz de l'organisation, proposables pendant l'attente. */
  quiz: { id: string; name: string }[];
  /** Les campagnes de l'organisation, cibles possibles de la Pause Chance. */
  campagnes: { id: string; name: string }[];
  /** Suffixe des `id`, comme partout dans ce module : ces formulaires sont montés plusieurs fois. */
  instanceId: string;
  defaultQuizId?: string | null;
  defaultPauseCampaignId?: string | null;
  /**
   * L'espacement vertical du formulaire hôte : `mt-3` dans le panneau des
   * files, `mt-4` dans les réglages d'activité. Passé plutôt que deviné —
   * mélanger les deux rythmes se voit à l'œil sur la même page.
   */
  espacement?: string;
}) {
  if (quiz.length === 0 && campagnes.length === 0) return null;

  return (
    <>
      {quiz.length > 0 ? (
        <div className={espacement}>
          <Label htmlFor={`attente-quiz${instanceId}`}>
            Quiz d&apos;attente{" "}
            <span className="font-semibold text-k-body">(facultatif)</span>
          </Label>
          <select
            id={`attente-quiz${instanceId}`}
            name="waitQuizId"
            defaultValue={defaultQuizId ?? ""}
            className={champSelect}
          >
            <option value="">Aucun</option>
            {quiz.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs font-semibold text-k-body">
            Facultatif — n&apos;influence jamais l&apos;ordre de passage. Proposé
            à celui qui attend, qui peut l&apos;ignorer sans rien perdre.
          </p>
        </div>
      ) : null}

      {campagnes.length > 0 ? (
        <div className={espacement}>
          <Label htmlFor={`attente-pause${instanceId}`}>
            Campagne Pause Chance{" "}
            <span className="font-semibold text-k-body">(facultatif)</span>
          </Label>
          <select
            id={`attente-pause${instanceId}`}
            name="waitPauseCampaignId"
            defaultValue={defaultPauseCampaignId ?? ""}
            className={champSelect}
          >
            <option value="">Aucune</option>
            {campagnes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs font-semibold text-k-body">
            Facultatif — n&apos;influence jamais l&apos;ordre de passage. Un seul
            tour offert par attente, et le gain se retire au comptoir comme tous
            les autres.
          </p>
        </div>
      ) : null}
    </>
  );
}
