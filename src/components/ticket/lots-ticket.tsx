"use client";

import {
  creerLotTicketOr,
  modifierLotTicketOr,
  supprimerLotTicketOr,
} from "@/actions/ticket-or";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  TICKET_LIBELLE_MAX,
  TICKET_POIDS_MAX,
  type LotTicketOrView,
} from "@/lib/ticket-or";

/**
 * LES LOTS DU TICKET D'OR (TKT-1) — le stock, pesé.
 *
 * ── LE CHAMP STOCK EST VIDE PAR DÉFAUT, ET C'EST « ILLIMITÉ » ──
 *
 * Vide et « 0 » sont deux intentions différentes : « je ne compte pas » et
 * « il n'y en a plus ». Les confondre aurait épuisé un café offert au premier
 * tirage. L'aide sous le champ le dit, parce que personne ne devine qu'un champ
 * vide veut dire quelque chose.
 *
 * ── LE POIDS N'EST PAS UN POURCENTAGE ──
 *
 * Même sémantique que la roue : une part relative au total. L'écran ne calcule
 * pas de pourcentage — il changerait à chaque lot ajouté, et un chiffre qui
 * bouge tout seul se lit comme une erreur.
 *
 * ── `champs` : LE MÊME ÉDITEUR, VU PAR UNE SEULE COLONNE (VIT-45) ──
 *
 * Le tableau de bord montre les quatre réglages d'un lot d'un coup
 * (`champs="tous"`, le défaut, et rien n'y change). Le studio, lui, en montre
 * UN par étape : le nom sur « Mes lots », le poids sur « Les chances de
 * sortie », et ainsi de suite.
 *
 * ── ET C'EST LÀ QU'EST LE PIÈGE, IDENTIQUE À CELUI DES ÉTAPES DE LA CHASSE ──
 *
 * `modifierLotTicketOr` lit les QUATRE champs d'un seul `FormData` et réécrit
 * les quatre colonnes EN BLOC. Un formulaire qui ne porterait que la colonne
 * visible enverrait un libellé vide (refusé), un poids ramené à 1, un stock
 * remis à « illimité » et un lot décoché — c'est-à-dire qu'il détruirait le
 * réglage voisin sans un mot. Chaque champ non montré est donc rendu en
 * MIROIR CACHÉ, depuis la même ligne, dans le même formulaire : la charge est
 * toujours complète, quelle que soit l'étape ouverte.
 *
 * Le cas de `actif` mérite sa ligne : l'action le lit par PRÉSENCE
 * (`z.string().nullable()` puis `valeur !== null`), comme une case à cocher.
 * Son miroir n'est donc rendu QUE si le lot est actif — un
 * `<input type="hidden" value="false">` le rallumerait.
 *
 * ── LE FORMULAIRE D'AJOUT, LUI, MONTRE TOUJOURS TOUT ──
 *
 * Il n'a pas de ligne d'où tirer un miroir, et `creerLotTicketOr` lit `actif`
 * par présence : un ajout amputé créerait un lot DÉCOCHÉ, donc jamais tirable,
 * sur un écran qui vient de dire « ajouté ». Il n'apparaît donc que sur
 * l'étape qui ajoute, et il y apparaît entier.
 */
/** La colonne montrée. `"tous"` = l'éditeur complet du tableau de bord. */
export type ChampsLot = "tous" | "libelle" | "poids" | "stock" | "actif";

export function LotsTicket({
  lots,
  peutRegler,
  champs = "tous",
  avecAjout = true,
  vide,
}: {
  lots: LotTicketOrView[];
  peutRegler: boolean;
  champs?: ChampsLot;
  /** Le formulaire d'ajout. Faux sur les étapes qui ne font que régler. */
  avecAjout?: boolean;
  /** La phrase affichée sans aucun lot. Chaque étape a la sienne. */
  vide?: string;
}) {
  const creer = useActionForm(creerLotTicketOr, {
    networkError: "Création impossible, réessayez.",
    resetOnSuccess: true,
    reloadOnSuccess: true,
  });

  if (!peutRegler) {
    return (
      <p className="text-sm text-zinc-500">
        Le réglage des lots est réservé au propriétaire et aux éditeurs. Vous
        pouvez émettre des tickets ci-dessus.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {lots.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {vide ??
            "Aucun lot pour l'instant. Un ticket ouvert sans lot n'offre rien : ajoutez-en au moins un."}
        </p>
      ) : (
        <ul className="space-y-3">
          {lots.map((lot) => (
            <li key={lot.id}>
              <LotForm lot={lot} champs={champs} />
            </li>
          ))}
        </ul>
      )}

      {!avecAjout ? null : (
      <form
        onSubmit={creer.onSubmit}
        className="space-y-3 rounded-2xl border-2 border-dashed border-k-ink/25 px-4 py-4"
      >
        <p className="text-sm font-black uppercase tracking-wide text-k-body">
          Ajouter un lot
        </p>
        {/* ENTIER, toujours : voir l'en-tête (un ajout amputé crée un lot décoché). */}
        <ChampsDuLot />
        {creer.state && !creer.state.ok ? (
          <FieldError message={creer.state.error} />
        ) : null}
        <Button type="submit" disabled={creer.pending}>
          {creer.pending ? "Ajout…" : "Ajouter"}
        </Button>
      </form>
      )}
    </div>
  );
}

function LotForm({
  lot,
  champs,
}: {
  lot: LotTicketOrView;
  champs: ChampsLot;
}) {
  const modifier = useActionForm(modifierLotTicketOr, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const supprimer = useActionForm(supprimerLotTicketOr, {
    networkError: "Suppression impossible, réessayez.",
  });

  return (
    <div className="space-y-3 rounded-2xl border-2 border-k-ink/15 px-4 py-4">
      <form onSubmit={modifier.onSubmit} className="space-y-3">
        <input type="hidden" name="id" value={lot.id} />
        <ChampsDuLot lot={lot} champs={champs} />
        {modifier.state && !modifier.state.ok ? (
          <FieldError message={modifier.state.error} />
        ) : null}
        {modifier.state?.ok ? (
          <p className="text-sm font-semibold text-green-700">Enregistré.</p>
        ) : null}
        <Button type="submit" variant="secondary" disabled={modifier.pending}>
          {modifier.pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </form>

      <form onSubmit={supprimer.onSubmit}>
        <input type="hidden" name="id" value={lot.id} />
        {supprimer.state && !supprimer.state.ok ? (
          <FieldError message={supprimer.state.error} />
        ) : null}
        {/* LE RETRAIT NE VIT QUE LÀ OÙ L'ON AJOUTE. Deux endroits pour un
            geste destructeur, ce sont deux endroits à corriger — et un
            commerçant venu régler un stock n'a rien à faire à un clic d'une
            suppression. */}
        {champs === "tous" || champs === "libelle" ? (
          <button
            type="submit"
            disabled={supprimer.pending}
            className="text-xs font-semibold text-red-600 underline underline-offset-2 disabled:opacity-50"
          >
            {supprimer.pending ? "Suppression…" : "Retirer ce lot"}
          </button>
        ) : null}
      </form>
    </div>
  );
}

/**
 * LE MIROIR D'UN CHAMP NON MONTRÉ — voir l'en-tête du fichier.
 *
 * `actif` n'a pas de miroir ici : il se lit par PRÉSENCE côté action, et son
 * cas est traité dans `ChampsDuLot`.
 */
function Miroir({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

function ChampsDuLot({
  lot,
  champs = "tous",
}: {
  lot?: LotTicketOrView;
  champs?: ChampsLot;
}) {
  const cle = lot?.id ?? "nouveau";
  const montre = (quoi: ChampsLot) => champs === "tous" || champs === quoi;
  return (
    <div className="flex flex-wrap items-end gap-3">
      {montre("libelle") ? (
      <div className="min-w-0 flex-1">
        <Label htmlFor={`lot-libelle-${cle}`}>Lot</Label>
        <Input
          id={`lot-libelle-${cle}`}
          name="libelle"
          defaultValue={lot?.libelle ?? ""}
          required
          maxLength={TICKET_LIBELLE_MAX}
          placeholder="Un café offert"
        />
      </div>
      ) : (
        <Miroir name="libelle" value={lot?.libelle ?? ""} />
      )}

      {montre("poids") ? (
      <div>
        <Label htmlFor={`lot-poids-${cle}`}>Poids</Label>
        <input
          id={`lot-poids-${cle}`}
          name="poids"
          type="number"
          min={0}
          max={TICKET_POIDS_MAX}
          defaultValue={lot?.poids ?? 1}
          className="w-24 rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
        />
      </div>
      ) : (
        <Miroir name="poids" value={String(lot?.poids ?? 1)} />
      )}

      {montre("stock") ? (
      <div>
        <Label htmlFor={`lot-stock-${cle}`}>Stock</Label>
        <input
          id={`lot-stock-${cle}`}
          name="stock"
          type="number"
          min={0}
          defaultValue={lot?.stock ?? ""}
          placeholder="illimité"
          className="w-28 rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
          aria-describedby={`lot-stock-aide-${cle}`}
        />
        <p id={`lot-stock-aide-${cle}`} className="mt-1 text-xs text-zinc-500">
          Vide = illimité
        </p>
      </div>
      ) : (
        <Miroir name="stock" value={lot?.stock === null ? "" : String(lot?.stock ?? "")} />
      )}

      {montre("actif") ? (
        <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-k-ink">
          <input
            type="checkbox"
            name="actif"
            defaultChecked={lot?.actif ?? true}
            className="size-4 accent-k-ink"
          />
          Tirable
        </label>
      ) : lot?.actif ? (
        /* PRÉSENCE, ET RIEN D'AUTRE. L'action lit `actif` comme une case
           cochée : un champ rendu avec `value="false"` la rallumerait. Le
           miroir n'existe donc que si le lot est actif — et son absence
           EST l'information « décoché ». */
        <input type="hidden" name="actif" value="on" />
      ) : null}
    </div>
  );
}
