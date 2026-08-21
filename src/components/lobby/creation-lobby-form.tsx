"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createLobby, type CreateLobbyOutcome } from "@/actions/lobby";
import type { ActionResult } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { LobbyCarton } from "@/components/lobby/lobby-shell";
import { messageRefusCreation } from "@/components/lobby/refus";
import {
  LOBBY_CAPACITE_MAX,
  LOBBY_CAPACITE_MIN,
  LOBBY_DUO_CAPACITE,
} from "@/lib/lobby";

/**
 * Ouvrir un salon depuis la vitrine d'un commerce.
 *
 * ── Ce que l'écran propose, et ce qu'il tait ──
 *
 * `bande` est le format par défaut, `duo` une option DISCRÈTE : les deux jeux
 * qui les consommeront (L18 Portrait de la Bande, L17 Duo Miroir) n'existent
 * pas encore, et un sélecteur à deux vignettes égales promettrait un choix que
 * rien ne récompense pour l'instant. La capacité DISPARAÎT en duo parce qu'elle
 * n'y est pas négociable — la contrainte `player_lobbies_duo_fige` la fige à
 * deux en base ; l'écran n'a donc rien à demander, et un champ grisé serait
 * une question posée pour rien.
 *
 * ── Le succès ne rend pas une page, il rend un code ──
 *
 * `createLobby` rend `{ etat: "cree", joinCode }` ET pose le cookie de la salle
 * côté serveur : l'hôte est déjà membre en arrivant sur `/lobby/{code}`, qui
 * lira ce cookie et peindra directement la salle d'attente. Rien n'est mémorisé
 * ici — la mémoire d'onglet qui servait à ça a été supprimée, parce qu'elle
 * dupliquait le cookie sans pouvoir le vérifier. On remplace seulement l'entrée
 * d'historique : revenir en arrière depuis la salle d'attente ne doit pas
 * ré-ouvrir un second salon.
 */

/**
 * Bornes DÉRIVÉES de `@/lib/lobby`, jamais recopiées : la migration écrit
 * `check (capacite between 2 and 12)`, `src/lib/lobby.ts` en est le miroir
 * typé, et un troisième chiffre écrit ici divergerait au premier réglage.
 */
const CAPACITES = Array.from(
  { length: LOBBY_CAPACITE_MAX - LOBBY_CAPACITE_MIN + 1 },
  (_, i) => LOBBY_CAPACITE_MIN + i,
);
const CAPACITE_DEFAUT = 6;

/**
 * Ce qu'il faut dire d'une ouverture qui n'a pas abouti, ou rien.
 *
 * Deux canaux distincts : `{ ok: false }` est une PANNE ou une saisie à
 * corriger (le pseudo), et son message vient de l'action ; `{ ok: true }` avec
 * un `etat` autre que « cree » est un refus NORMAL — quota ou indisponible —
 * retraduit du point de vue de qui voulait ouvrir une salle.
 */
function messageEchecCreation(
  etat: ActionResult<CreateLobbyOutcome> | null,
): string | undefined {
  if (!etat) return undefined;
  if (!etat.ok) return etat.error;
  return etat.data.etat === "cree"
    ? undefined
    : messageRefusCreation(etat.data.etat);
}

export function CreationLobbyForm({ slug }: { slug: string }) {
  const [etat, action, enCours] = useActionState(createLobby, null);
  const [duo, setDuo] = useState(false);
  const router = useRouter();
  const idPseudo = useId();
  const idCapacite = useId();
  const idFormat = useId();

  const code = etat && etat.ok && etat.data.etat === "cree" ? etat.data.joinCode : null;
  const ouvert = code !== null;

  useEffect(() => {
    if (!code) return;
    router.replace(`/lobby/${code}`);
  }, [code, router]);

  return (
    <LobbyCarton>
      <form action={action} className="space-y-5">
        <input type="hidden" name="slug" value={slug} />
        {/* Le format part TOUJOURS, y compris quand la case duo est décochée :
            un champ absent obligerait l'action à deviner un défaut, et deux
            défauts (ici et là-bas) finissent par diverger. */}
        <input type="hidden" name="kind" value={duo ? "duo" : "bande"} />

        <div>
          <Label htmlFor={idPseudo}>Votre prénom ou pseudo</Label>
          <Input
            id={idPseudo}
            name="pseudo"
            type="text"
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="go"
            maxLength={24}
            required
            placeholder="Camille"
          />
          <p className="mt-1.5 text-xs text-k-body/80">
            C’est le nom que les autres verront dans le salon.
          </p>
        </div>

        {!duo && (
          <div>
            <Label htmlFor={idCapacite}>Combien serez-vous&nbsp;?</Label>
            <select
              id={idCapacite}
              name="capacite"
              defaultValue={String(CAPACITE_DEFAUT)}
              className="w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm font-semibold text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
            >
              {CAPACITES.map((n) => (
                <option key={n} value={n}>
                  {n} personnes
                </option>
              ))}
            </select>
          </div>
        )}
        {/* En duo la capacité n'est pas masquée à l'œil seulement : elle est
            posée à deux, la valeur que la base impose de toute façon. */}
        {duo && (
          <input type="hidden" name="capacite" value={LOBBY_DUO_CAPACITE} />
        )}

        <div className="flex items-start gap-2.5 rounded-xl bg-k-yellow/20 px-3 py-2.5">
          <input
            id={idFormat}
            type="checkbox"
            checked={duo}
            onChange={(e) => setDuo(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-k-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
          />
          <label htmlFor={idFormat} className="text-sm text-k-body">
            <span className="font-bold text-k-ink">À deux seulement</span> — un
            salon fermé à deux places.
          </label>
        </div>

        <FieldError message={messageEchecCreation(etat)} />

        <Button disabled={enCours || ouvert} className="w-full">
          {enCours || ouvert ? "Ouverture…" : "Ouvrir le salon"}
        </Button>
      </form>
    </LobbyCarton>
  );
}
