"use client";

import { setBandePack } from "@/actions/bande";
import { BANDE_PACKS } from "@/lib/bande-packs";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";

/**
 * PORTRAIT DE LA BANDE (L18) — l'écran où le commerçant choisit le TON.
 *
 * ── UN SEUL RÉGLAGE, ET C'EST VOULU ──
 *
 * Le jeu marche sans configuration : le pack a un défaut (`amis`) en base comme
 * en TypeScript, et rien d'autre n'est à composer — les questions vivent dans le
 * code, pas dans la carte du commerçant. Cette carte ne règle donc qu'une chose,
 * la seule qui l'engage : quelles questions s'affichent sur un écran qui porte
 * son nom, devant des gens qui ne les ont pas choisies.
 *
 * ── LE PACK TAQUIN EST UN CHOIX, PAS UN DÉFAUT ──
 *
 * Il est le dernier de la liste (l'ordre vient de `BANDE_PACKS`), sa description
 * dit ce qu'il est — « à choisir en connaissance de cause » — et il n'est JAMAIS
 * présélectionné : `loadBandePack` replie sur `amis` quand la lecture échoue,
 * précisément pour qu'une panne d'affichage ne puisse pas faire croire à un
 * commerçant que le pack moqueur est actif chez lui. Adoucir sa description
 * reviendrait à le vendre pour ce qu'il n'est pas.
 *
 * ── LES PACKS NE SONT PAS RECOPIÉS ICI ──
 *
 * Noms, descriptions et ordre viennent de `BANDE_PACKS`, la même liste que le
 * schéma de validation et que le `check` SQL prennent pour miroir. Un pack
 * ajouté là-bas apparaît ici sans qu'une ligne bouge — et un pack retiré
 * disparaît, plutôt que de rester cochable sur un écran qui ment.
 */
export function BandeEditeur({
  pack,
  peutEditer,
}: {
  /** La clé réglée. JAMAIS `null` : le défaut est `amis` (voir `bande-context`). */
  pack: string;
  /** Même garde d'affichage que le reste de l'écran : préparer sans exposer. */
  peutEditer: boolean;
}) {
  const enregistrer = useActionForm(setBandePack, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const etat = enregistrer.state;

  return (
    // L'ANCRE DU SOMMAIRE N'EST PLUS ICI, même raison que le Duo : elle est
    // portée par la `CarteRepliable` qui enveloppe ce bloc, laquelle rouvre le
    // bloc quand l'ancre le vise. Le sommaire, lui, la propose TOUJOURS : ce jeu
    // n'a pas d'état « pas prêt » — pack par défaut, questions dans le code.
    <Card>
      <h2>Portrait de la Bande</h2>
      {/* CE QUE LE COMMERÇANT DOIT SAVOIR AVANT DE PROPOSER LE JEU EN SALLE.
          Il répondra de cette promesse devant sa table : si elle est absolue à
          l'écran et fausse à deux, c'est lui qui la démentira. À deux, une
          question ne porte qu'une voix — celui qui passe sait qu'elle est de
          l'autre. Ce n'est pas un défaut, c'est la nature d'un vote à deux, et
          le pack « En duo » l'assume déjà (voir `src/lib/bande-packs.ts`, où
          les questions sont écrites pour que LES DEUX réponses fassent
          sourire). */}
      <p className="mb-5 mt-2 text-sm text-zinc-500">
        De deux à douze clients autour d&apos;une table&nbsp;: une question, chacun
        nomme quelqu&apos;un — ou passe —, et la table découvre sa réponse. Dès trois
        joueurs, personne ne saura jamais qui a voté pour qui&nbsp;; à deux, chacun
        devine forcément la réponse de l&apos;autre — le pack «&nbsp;En duo&nbsp;» est
        écrit pour ça. Choisissez le ton des questions.
      </p>

      <form onSubmit={enregistrer.onSubmit}>
        <fieldset disabled={!peutEditer} className="border-0 p-0">
          {/* Une LÉGENDE et non un titre libre : les cinq boutons radio forment
              un groupe, et un lecteur d'écran annonce la question avant chaque
              pack. */}
          <legend className="mb-2 text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
            Le pack de questions
          </legend>

          <ul className="space-y-2">
            {BANDE_PACKS.map((option) => (
              <li key={option.cle}>
                <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border-2 border-k-ink/15 px-3 py-2.5 hover:bg-k-yellow/20">
                  {/* NON CONTRÔLÉ, `defaultChecked` : rien à calculer pendant la
                      sélection (aucune borne, aucun compte), et l'état du
                      navigateur suffit. La `key` du formulaire n'est donc pas
                      nécessaire — la page est rechargée par l'action. */}
                  <input
                    type="radio"
                    name="pack"
                    value={option.cle}
                    defaultChecked={option.cle === pack}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-k-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-k-ink">
                      {option.nom}
                    </span>
                    <span className="block text-xs leading-snug text-zinc-500">
                      {option.description}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {/* LE PACK EST COPIÉ AU DÉMARRAGE DE CHAQUE PARTIE : changer d'avis ici
              ne change rien à une tablée en cours. Le dire évite au commerçant
              d'aller vérifier ce qu'il ne peut pas voir depuis cet écran. */}
          <p className="mt-3 text-xs text-zinc-500">
            Le changement vaut pour les prochaines parties&nbsp;: une tablée déjà
            lancée garde le ton avec lequel elle a commencé.
          </p>

          {/* DEUX CANAUX, ET ILS NE DISENT PAS LA MÊME CHOSE. `{ ok: false }`
              est une saisie à corriger et son message vient du schéma ;
              `pack-inconnu` est un `{ ok: true }` — la base a répondu, et ce
              qu'elle refuse est un écart entre la liste de ce dépôt et son
              propre `check`. Ce n'est pas une faute du commerçant, et lui dire
              « une erreur est survenue » l'enverrait recliquer indéfiniment. */}
          {etat && !etat.ok ? <FieldError message={etat.error} /> : null}
          {etat && etat.ok && etat.data.etat === "pack-inconnu" ? (
            <FieldError message="Ce pack n’est pas disponible pour l’instant. Choisissez-en un autre, et signalez-le nous." />
          ) : null}
          {etat && etat.ok && etat.data.etat === "enregistre" ? (
            <p className="mt-2 text-sm font-semibold text-k-body" role="status">
              Pack enregistré.
            </p>
          ) : null}

          {peutEditer ? (
            <Button type="submit" className="mt-3" disabled={enregistrer.pending}>
              {enregistrer.pending ? "Enregistrement…" : "Enregistrer le pack"}
            </Button>
          ) : null}
        </fieldset>
      </form>
    </Card>
  );
}
