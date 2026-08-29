"use client";

import { useState } from "react";

import {
  ajouterTableSalle,
  enregistrerDureeService,
  modifierTableSalle,
  supprimerTableSalle,
} from "@/actions/reserver";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { useActionForm } from "@/lib/use-action-form";
import {
  dureeService,
  etapesSalle,
  libelleSalle,
  type EtatEtapeSalle,
  type TableSalle,
} from "@/lib/plan-de-salle";
import {
  RESERVER_TABLE_NAME_MAX,
  RESERVER_TABLE_SEATS_MAX,
  RESERVER_TABLE_SEATS_MIN,
  RESERVER_TABLE_TURN_MAX,
  RESERVER_TABLE_TURN_MIN,
} from "@/lib/reserver";

/**
 * LA SALLE, CÔTÉ COMMERÇANT (RDV-7).
 *
 * ── POURQUOI UN FIL D'ÉTAPES, ET NON QUATRE CHAMPS ──
 *
 * Ouvrir une salle demande quatre décisions qui ne se prennent pas dans
 * n'importe quel ordre : d'abord QUAND on ouvre, puis AVEC QUOI, puis COMBIEN
 * DE TEMPS on garde la table, et alors seulement on engendre les créneaux.
 * Posées côte à côte comme quatre champs, elles se remplissent au hasard et le
 * commerçant génère un agenda vide sans comprendre pourquoi. Le fil dit à
 * chaque instant ce qui manque — c'est `etapesSalle` qui en décide, testé sans
 * DOM ; cet écran ne fait que le peindre.
 *
 * ── LA CONFUSION À DÉSAMORCER : DURÉE DE SERVICE ≠ PAS DE LA GRILLE ──
 *
 * Deux nombres en minutes, dans le même module, et ils ne veulent pas dire la
 * même chose. Le PAS dit tous les combien on propose une heure ; la DURÉE dit
 * combien de temps la table reste prise. Un restaurant propose une heure tous
 * les quarts d'heure et garde ses tables une heure et demie : confondre les
 * deux fait soit tourner les tables quatre fois trop vite, soit n'ouvrir
 * qu'un service par soirée. C'est pourquoi ce panneau ne montre jamais
 * « 90 minutes » mais `dureeService(90)`, et qu'il redit la différence sous le
 * champ plutôt que dans une aide qu'on n'ouvre pas.
 */

/** Les tailles de table qu'on trouve en salle — un clic plutôt qu'une saisie. */
const COUVERTS_SUGGERES = [2, 4, 6, 8] as const;

/** Les durées de service usuelles, du service rapide au repas long. */
const DUREES_SERVICE_SUGGEREES = [60, 90, 120, 150] as const;

export function SallePanneau({
  activityId,
  bookingMode,
  tables,
  dureeServiceMinutes,
  pasMinutes,
  nombreDePlages,
  creneauxOuverts,
}: {
  activityId: string;
  bookingMode: string;
  tables: TableSalle[];
  dureeServiceMinutes: number;
  /** Le pas de la grille — `horaires.reglages.dureeMinutes`, `null` si non réglé. */
  pasMinutes: number | null;
  nombreDePlages: number;
  creneauxOuverts: number;
}) {
  // UN MOMENT N'A PAS DE SALLE. Une dégustation ou un atelier se compte en
  // places, pas en tables : afficher le panneau y ferait décrire une salle que
  // rien ne lira, et la première étape du fil serait fausse dès l'ouverture.
  if (bookingMode !== "rendez_vous") return null;

  const etapes = etapesSalle({
    nombreDePlages,
    tables,
    dureeServiceMinutes,
    pasMinutes,
    creneauxOuverts,
  });

  return (
    <div className="mt-6 space-y-6">
      <FilEtapes etapes={etapes} />
      <TablesSalle activityId={activityId} tables={tables} />
      <DureeDuService
        activityId={activityId}
        dureeServiceMinutes={dureeServiceMinutes}
        pasMinutes={pasMinutes}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Le fil des étapes — ce qui manque, et dans quel ordre
// ────────────────────────────────────────────────────────────

function FilEtapes({ etapes }: { etapes: EtatEtapeSalle[] }) {
  const restantes = etapes.filter((etape) => !etape.faite).length;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Ouvrir votre salle</h2>
        <p className="text-xs text-zinc-500">
          {restantes === 0
            ? "Tout est en place."
            : `${restantes} étape${restantes > 1 ? "s" : ""} à terminer.`}
        </p>
      </div>

      {/* Une BANDE et non une liste verticale : les quatre étapes se lisent
          comme un chemin, et un chemin se lit de gauche à droite. Elle défile
          horizontalement sur petit écran plutôt que de se replier en colonne,
          où l'ordre cesserait de se voir. */}
      <ol className="flex gap-3 overflow-x-auto pb-1">
        {etapes.map((etape, index) => (
          <li
            key={etape.cle}
            className={`min-w-[13rem] flex-1 rounded-xl border-2 px-3 py-2.5 ${
              etape.faite
                ? "border-k-ink bg-k-yellow/40 shadow-[3px_3px_0_var(--color-k-ink)]"
                : "border-k-ink/20 bg-white"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black ${
                  etape.faite
                    ? "border-k-ink bg-k-ink text-white"
                    : "border-k-ink/30 bg-white text-zinc-500"
                }`}
              >
                {etape.faite ? "✓" : index + 1}
              </span>
              <span className="text-sm font-black text-k-ink">{etape.titre}</span>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              {etape.manque ?? (
                <span className="font-bold text-k-green">Fait.</span>
              )}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Les tables — décrire la salle, jamais placer quelqu'un
// ────────────────────────────────────────────────────────────

function TablesSalle({
  activityId,
  tables,
}: {
  activityId: string;
  tables: TableSalle[];
}) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Vos tables</h2>
        <p className="text-sm font-bold text-k-ink">{libelleSalle(tables)}</p>
      </div>

      {tables.length === 0 ? (
        <p className="mb-4 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
          Aucune table pour l&apos;instant — décrivez votre salle ci-dessous,
          une ligne par table.
        </p>
      ) : (
        <ul className="mb-4 space-y-2">
          {tables.map((table) => (
            <LigneTable key={table.id} table={table} />
          ))}
        </ul>
      )}

      <AjouterTable activityId={activityId} />

      <InfoBulle
        id="aide-salle-tables"
        resume="Qui choisit la table d'un client ?"
        className="mt-4"
      >
        La base, au moment de la réservation, et sous verrou : elle prend la
        plus petite table encore libre où la tablée tient. Vous décrivez votre
        salle, vous ne placez personne — c&apos;est ce qui garantit que deux
        clients qui réservent en même temps n&apos;obtiennent pas la même table.
      </InfoBulle>
    </Card>
  );
}

/**
 * Une table, éditable en place.
 *
 * TROIS FORMULAIRES FRÈRES, et non un seul à trois boutons : `useActionForm`
 * lit `new FormData(form)` sans le bouton déclencheur, donc un `name`/`value`
 * posé sur un bouton de soumission n'arriverait JAMAIS à l'action. Basculer
 * l'état et supprimer sont donc des formulaires à part, chacun avec ses champs
 * cachés — et imbriquer une balise `form` dans une autre est de toute façon
 * invalide en HTML.
 */
function LigneTable({ table }: { table: TableSalle }) {
  const edition = useActionForm(modifierTableSalle, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const bascule = useActionForm(modifierTableSalle, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const suppression = useActionForm(supprimerTableSalle, {
    networkError: "Suppression impossible, réessayez.",
  });

  const erreur =
    (edition.state && !edition.state.ok ? edition.state.error : null) ??
    (bascule.state && !bascule.state.ok ? bascule.state.error : null) ??
    (suppression.state && !suppression.state.ok ? suppression.state.error : null);

  return (
    <li
      className={`rounded-xl border-2 border-k-ink/15 bg-white px-3 py-2 ${
        // Une table désactivée reste VISIBLE, en retrait : la masquer
        // empêcherait de la rallumer, et c'est le geste que le commerçant fait
        // le lendemain matin.
        table.active ? "" : "opacity-55"
      }`}
    >
      <div className="flex flex-wrap items-end gap-2">
        <form
          onSubmit={edition.onSubmit}
          className="flex flex-1 flex-wrap items-end gap-2"
        >
          <input type="hidden" name="id" value={table.id} />
          {/* L'état ne bouge pas quand on renomme : `modifierTableSalle` écrit
              les trois champs d'un coup, donc l'omettre éteindrait la table à
              chaque correction de nom. */}
          <input type="hidden" name="active" value={String(table.active)} />

          <div className="min-w-[9rem] flex-1">
            <Label htmlFor={`table-nom-${table.id}`} className="text-xs">
              Nom
            </Label>
            <Input
              id={`table-nom-${table.id}`}
              name="name"
              defaultValue={table.nom}
              maxLength={RESERVER_TABLE_NAME_MAX}
              required
            />
          </div>

          <div>
            <Label htmlFor={`table-couverts-${table.id}`} className="text-xs">
              Couverts
            </Label>
            <Input
              id={`table-couverts-${table.id}`}
              name="seats"
              type="number"
              min={RESERVER_TABLE_SEATS_MIN}
              max={RESERVER_TABLE_SEATS_MAX}
              defaultValue={table.couverts}
              className="w-20 text-center"
              required
            />
          </div>

          <Button type="submit" variant="secondary" disabled={edition.pending}>
            {edition.pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>

        <form onSubmit={bascule.onSubmit}>
          <input type="hidden" name="id" value={table.id} />
          <input type="hidden" name="name" value={table.nom} />
          <input type="hidden" name="seats" value={table.couverts} />
          <input type="hidden" name="active" value={String(!table.active)} />
          <Button type="submit" variant="secondary" disabled={bascule.pending}>
            {bascule.pending
              ? "…"
              : table.active
                ? "Désactiver"
                : "Réactiver"}
          </Button>
        </form>

        <form onSubmit={suppression.onSubmit}>
          <input type="hidden" name="id" value={table.id} />
          <Button
            type="submit"
            variant="ghost"
            disabled={suppression.pending}
            aria-label={`Supprimer la table ${table.nom}`}
          >
            {suppression.pending ? "…" : "Supprimer"}
          </Button>
        </form>
      </div>

      <FieldError message={erreur ?? undefined} />
    </li>
  );
}

function AjouterTable({ activityId }: { activityId: string }) {
  const [couverts, setCouverts] = useState("4");
  const { state, pending, onSubmit } = useActionForm(ajouterTableSalle, {
    resetOnSuccess: true,
    networkError: "Ajout impossible, réessayez.",
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="activity_id" value={activityId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[10rem] flex-1">
          <Label htmlFor="salle-nouvelle-nom">Nom de la table</Label>
          <Input
            id="salle-nouvelle-nom"
            name="name"
            maxLength={RESERVER_TABLE_NAME_MAX}
            placeholder="Terrasse 3"
            required
          />
        </div>
        <div>
          <Label htmlFor="salle-nouvelle-couverts">Couverts</Label>
          <Input
            id="salle-nouvelle-couverts"
            name="seats"
            type="number"
            min={RESERVER_TABLE_SEATS_MIN}
            max={RESERVER_TABLE_SEATS_MAX}
            value={couverts}
            onChange={(event) => setCouverts(event.target.value)}
            className="w-24 text-center"
            required
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Ajout…" : "Ajouter"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {COUVERTS_SUGGERES.map((valeur) => (
          <button
            key={valeur}
            type="button"
            onClick={() => setCouverts(String(valeur))}
            aria-pressed={Number(couverts) === valeur}
            className={`rounded-lg border-2 px-2.5 py-1 text-xs font-black text-k-ink transition-colors ${
              Number(couverts) === valeur
                ? "border-k-ink bg-k-yellow/40"
                : "border-k-ink/20 bg-white hover:border-k-ink/50"
            }`}
          >
            {valeur} couverts
          </button>
        ))}
      </div>

      {state && !state.ok ? <FieldError message={state.error} /> : null}
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// La durée de service — le nombre qu'on confond avec le pas
// ────────────────────────────────────────────────────────────

function DureeDuService({
  activityId,
  dureeServiceMinutes,
  pasMinutes,
}: {
  activityId: string;
  dureeServiceMinutes: number;
  pasMinutes: number | null;
}) {
  const [duree, setDuree] = useState(String(dureeServiceMinutes));
  const { state, pending, onSubmit } = useActionForm(enregistrerDureeService, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  const minutes = Number(duree);
  const lisible = Number.isFinite(minutes) && minutes > 0 ? minutes : dureeServiceMinutes;

  return (
    <Card>
      <h2 className="font-semibold">La durée d&apos;un service</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-500">
        Combien de temps une table reste prise après l&apos;heure réservée.
        C&apos;est elle, et non la longueur du créneau, qui décide si la table
        est encore libre à l&apos;heure suivante.
      </p>

      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="activity_id" value={activityId} />

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="salle-duree-service">Minutes</Label>
            <Input
              id="salle-duree-service"
              name="table_turn_minutes"
              type="number"
              min={RESERVER_TABLE_TURN_MIN}
              max={RESERVER_TABLE_TURN_MAX}
              value={duree}
              onChange={(event) => setDuree(event.target.value)}
              className="w-24 text-center"
              required
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer la durée"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {DUREES_SERVICE_SUGGEREES.map((valeur) => (
            <button
              key={valeur}
              type="button"
              onClick={() => setDuree(String(valeur))}
              aria-pressed={Number(duree) === valeur}
              className={`rounded-lg border-2 px-2.5 py-1 text-xs font-black text-k-ink transition-colors ${
                Number(duree) === valeur
                  ? "border-k-ink bg-k-yellow/40"
                  : "border-k-ink/20 bg-white hover:border-k-ink/50"
              }`}
            >
              {dureeService(valeur)}
            </button>
          ))}
        </div>

        <p className="text-xs text-zinc-500">
          Une table reste prise <strong>{dureeService(lisible)}</strong>.
          {pasMinutes && pasMinutes > 0 ? (
            <>
              {" "}
              Le pas de la grille, lui, dit tous les combien vous proposez une
              heure — il est réglé sur <strong>{dureeService(pasMinutes)}</strong>{" "}
              dans vos horaires. Les deux sont indépendants&nbsp;: vous pouvez
              proposer une heure tous les quarts d&apos;heure et garder vos
              tables une heure et demie.
            </>
          ) : (
            <>
              {" "}
              Le pas de la grille, lui, dit tous les combien vous proposez une
              heure&nbsp;: il se règle plus haut, dans{" "}
              <strong>Durée d&apos;un rendez-vous</strong>.
            </>
          )}
        </p>

        {state && !state.ok ? <FieldError message={state.error} /> : null}
        {state?.ok ? (
          <span role="status" className="text-sm font-bold text-k-green">
            Durée enregistrée.
          </span>
        ) : null}
      </form>
    </Card>
  );
}
