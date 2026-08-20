"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  RESERVER_ACTIVITY_DURATION_MAX,
  RESERVER_ACTIVITY_DURATION_MIN,
  RESERVER_ACTIVITY_PREPARATION_MAX,
  RESERVER_ACTIVITY_PROMISE_MAX,
  RESERVER_ACTIVITY_STEPS_MAX,
  RESERVER_STEP_BODY_MAX,
  RESERVER_STEP_TITLE_MAX,
  type ReserverActivityKind,
} from "@/lib/reserver";
import { champDescription, champSelect } from "@/components/reserver/champs";
import {
  FORMATS_ORDONNES,
  LIBELLE_FORMAT,
} from "@/components/reserver/formats-experience";

/**
 * LE FORMAT D'UNE ACTIVITÉ, ET LES CHAMPS QU'IL OUVRE (RES-5).
 *
 * Posés à l'identique sur les DEUX formulaires d'activité — création et
 * réglages — pour la raison exacte de `ChampsAttenteActive` juste à côté : les
 * deux écrivent les mêmes colonnes, et deux copies auraient divergé au premier
 * ajustement de vocabulaire.
 *
 * ── LE SÉLECTEUR EST UN `<select>`, PAS TROIS CARTES CLIQUABLES ──
 *
 * Trois cartes auraient demandé un groupe de boutons radio déguisés, son état
 * clavier et son `aria-checked`. Un `<select>` natif porte tout cela sans une
 * ligne, part avec le formulaire, et se lit au doigt sur le téléphone que le
 * commerçant a en main derrière son comptoir. La ligne d'aide sous le champ dit
 * ce que chaque choix change — et elle SUIT le choix, plutôt que d'aligner trois
 * paragraphes dont deux ne servent pas.
 *
 * ── POURQUOI LES CHAMPS SONT MASQUÉS ET NON DÉSACTIVÉS ──
 *
 * Un champ désactivé ne poste rien : le serveur lirait `null` et effacerait la
 * promesse d'une activité qu'on repasse en Standard pour la nuit. Masqué, c'est
 * pareil — donc la règle est dite ici pour qu'elle soit tenue là-bas : les
 * champs d'un format qu'on quitte ne sont PAS effacés en base, ils cessent
 * seulement d'être lus. Le commerçant qui revient à « Moment Signature »
 * retrouve ses étapes.
 *
 * ── LES ÉTAPES SONT UN ÉTAT LOCAL, ET RIEN D'AUTRE ──
 *
 * Une à trois cartes, ajoutées et retirées côté navigateur ; elles partent en
 * champs répétés `stepTitle` / `stepBody`, appariés par leur POSITION. Aucun
 * identifiant : une étape n'a pas d'existence propre en base, c'est une entrée
 * du `jsonb` de l'activité. Le seul invariant tenu ici est celui de la
 * contrainte SQL — au moins une, jamais plus de trois — et il est tenu par les
 * boutons, pas par un message d'erreur après coup.
 */

interface EtapeSaisie {
  /** Clé de rendu SEULEMENT : elle ne part pas au serveur, et n'existe pas en base. */
  cle: string;
  title: string;
  body: string;
}

function etapeVide(): EtapeSaisie {
  return { cle: Math.random().toString(36).slice(2), title: "", body: "" };
}

export function ChampsExperience({
  instanceId,
  defaultKind = "standard",
  defaultPromise = null,
  defaultDurationMinutes = null,
  defaultSteps = [],
  defaultPreparation = null,
  espacement = "mt-4",
}: {
  /** Suffixe des `id`, comme partout dans ce module : ces formulaires sont montés plusieurs fois. */
  instanceId: string;
  defaultKind?: ReserverActivityKind;
  defaultPromise?: string | null;
  defaultDurationMinutes?: number | null;
  defaultSteps?: readonly { title: string; body: string }[];
  defaultPreparation?: string | null;
  /** Le rythme vertical du formulaire hôte — passé, jamais deviné (voir `ChampsAttenteActive`). */
  espacement?: string;
}) {
  const [kind, setKind] = useState<ReserverActivityKind>(defaultKind);
  const [etapes, setEtapes] = useState<EtapeSaisie[]>(() =>
    defaultSteps.length > 0
      ? defaultSteps.map((e, i) => ({
          cle: `initiale-${i}`,
          title: e.title,
          body: e.body,
        }))
      : [etapeVide()],
  );

  const immersif = kind !== "standard";
  const aide = LIBELLE_FORMAT[kind].aide;

  return (
    <>
      <div className={espacement}>
        <Label htmlFor={`activite-format${instanceId}`}>
          Format de l&apos;activité
        </Label>
        <select
          id={`activite-format${instanceId}`}
          name="kind"
          value={kind}
          onChange={(e) =>
            setKind(e.target.value as ReserverActivityKind)
          }
          aria-describedby={`activite-format${instanceId}-aide`}
          className={champSelect}
        >
          {FORMATS_ORDONNES.map((valeur) => (
            <option key={valeur} value={valeur}>
              {LIBELLE_FORMAT[valeur].label}
            </option>
          ))}
        </select>
        {/* Région vivante montée EN PERMANENCE : l'aide change AVEC le choix, et
            un `aria-live` créé en même temps que son contenu n'annonce rien. */}
        <p
          id={`activite-format${instanceId}-aide`}
          aria-live="polite"
          className="mt-1.5 text-xs font-semibold text-k-body"
        >
          {aide}
        </p>
      </div>

      {immersif ? (
        <>
          <div className={espacement}>
            <Label htmlFor={`activite-promesse${instanceId}`}>
              Votre promesse{" "}
              <span className="font-semibold text-k-body">(facultatif)</span>
            </Label>
            <Input
              id={`activite-promesse${instanceId}`}
              name="promise"
              maxLength={RESERVER_ACTIVITY_PROMISE_MAX}
              defaultValue={defaultPromise ?? ""}
              placeholder="Ex : Repartez avec le pain que vous avez pétri"
            />
            <p className="mt-1.5 text-xs font-semibold text-k-body">
              Une phrase, affichée en grand tout en haut de la page que vos
              clients ouvrent. Ce qu&apos;ils vivront, pas ce que vous vendez.
            </p>
          </div>

          <div className={espacement}>
            <Label htmlFor={`activite-duree${instanceId}`}>
              Durée annoncée (en minutes)
            </Label>
            <Input
              id={`activite-duree${instanceId}`}
              name="durationMinutes"
              type="number"
              inputMode="numeric"
              required
              min={RESERVER_ACTIVITY_DURATION_MIN}
              max={RESERVER_ACTIVITY_DURATION_MAX}
              defaultValue={defaultDurationMinutes ?? ""}
              placeholder="45"
            />
            <p className="mt-1.5 text-xs font-semibold text-k-body">
              Entre {RESERVER_ACTIVITY_DURATION_MIN} et{" "}
              {RESERVER_ACTIVITY_DURATION_MAX} minutes. Elle s&apos;affiche en
              badge sous votre promesse : c&apos;est la première question qu&apos;on
              vous pose au téléphone.
            </p>
          </div>
        </>
      ) : null}

      {kind === "signature" ? (
        <fieldset className={espacement}>
          <legend className="text-sm font-black text-k-ink">
            Les étapes du moment{" "}
            <span className="font-semibold text-k-body">
              (1 à {RESERVER_ACTIVITY_STEPS_MAX})
            </span>
          </legend>
          <p className="mt-1 text-xs font-semibold text-k-body">
            Elles s&apos;affichent en cartes numérotées avant les créneaux. Un
            déroulé — accueil, geste, repartir avec — plutôt qu&apos;une liste
            d&apos;arguments.
          </p>

          <ol className="mt-3 space-y-3">
            {etapes.map((etape, index) => (
              <li
                key={etape.cle}
                className="rounded-xl border-2 border-k-ink/20 bg-k-bg p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-wide text-k-body">
                    Étape {index + 1}
                  </span>
                  {/* Le bouton disparaît sur la dernière étape : la contrainte
                      SQL en exige au moins une, et un bouton qui ne peut
                      qu'échouer se lit comme une panne. */}
                  {etapes.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setEtapes((liste) =>
                          liste.filter((e) => e.cle !== etape.cle),
                        )
                      }
                    >
                      Retirer l&apos;étape {index + 1}
                    </Button>
                  ) : null}
                </div>

                <div className="mt-2">
                  <Label htmlFor={`etape-titre${instanceId}-${etape.cle}`}>
                    Titre
                  </Label>
                  <Input
                    id={`etape-titre${instanceId}-${etape.cle}`}
                    name="stepTitle"
                    required
                    maxLength={RESERVER_STEP_TITLE_MAX}
                    value={etape.title}
                    onChange={(e) =>
                      setEtapes((liste) =>
                        liste.map((x) =>
                          x.cle === etape.cle
                            ? { ...x, title: e.target.value }
                            : x,
                        ),
                      )
                    }
                    placeholder="Ex : On pétrit ensemble"
                  />
                </div>

                <div className="mt-2">
                  <Label htmlFor={`etape-corps${instanceId}-${etape.cle}`}>
                    Ce qui s&apos;y passe
                  </Label>
                  <textarea
                    id={`etape-corps${instanceId}-${etape.cle}`}
                    name="stepBody"
                    rows={2}
                    required
                    maxLength={RESERVER_STEP_BODY_MAX}
                    value={etape.body}
                    onChange={(e) =>
                      setEtapes((liste) =>
                        liste.map((x) =>
                          x.cle === etape.cle
                            ? { ...x, body: e.target.value }
                            : x,
                        ),
                      )
                    }
                    placeholder="Deux ou trois phrases, à hauteur de client."
                    className={champDescription}
                  />
                </div>
              </li>
            ))}
          </ol>

          {etapes.length < RESERVER_ACTIVITY_STEPS_MAX ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEtapes((liste) => [...liste, etapeVide()])}
              >
                + Ajouter une étape
              </Button>
            </div>
          ) : null}
        </fieldset>
      ) : null}

      {immersif ? (
        <div className={espacement}>
          <Label htmlFor={`activite-preparation${instanceId}`}>
            {kind === "duo" ? "Instructions pour le duo" : "Pour bien en profiter"}{" "}
            <span className="font-semibold text-k-body">(facultatif)</span>
          </Label>
          <textarea
            id={`activite-preparation${instanceId}`}
            name="preparation"
            rows={3}
            maxLength={RESERVER_ACTIVITY_PREPARATION_MAX}
            defaultValue={defaultPreparation ?? ""}
            placeholder={
              kind === "duo"
                ? "Venez à deux, présentez-vous ensemble au comptoir, prévoyez des chaussures fermées…"
                : "Ce qu'il vaut mieux apporter, prévoir ou éviter avant de venir."
            }
            className={champDescription}
          />
          <p className="mt-1.5 text-xs font-semibold text-k-body">
            Affiché dans un encadré sur la page publique, sous
            {kind === "duo" ? " le bandeau du duo" : " les étapes"}.
          </p>
        </div>
      ) : null}

      {kind === "duo" ? (
        <p className={`${espacement} rounded-xl border-2 border-k-ink bg-sky-100 px-3 py-2 text-xs font-bold text-k-ink`}>
          Chaque réservation d&apos;un Atelier Duo retient DEUX places du créneau.
          Réglez donc la capacité en places — un créneau de 8 places accueille 4
          duos — et la page publique, elle, comptera en duos.
        </p>
      ) : null}
    </>
  );
}
