"use client";

import { useActionForm } from "@/lib/use-action-form";
import {
  VITRINE_CONTENU_RANG_MAX,
  VITRINE_CONTENU_RANG_MIN,
  VITRINE_CONTENU_TITRE_MAX,
  VITRINE_CONTENU_URL_MAX,
  type ContenuVitrineView,
} from "@/lib/vitrine";
import {
  deleteVitrineContenu,
  setVitrineContenu,
} from "@/actions/vitrine";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";

/**
 * Les places, dérivées des bornes de `@/lib/vitrine` — jamais un `[1, 2, 3]`
 * écrit à la main. Les deux constantes sont les miroirs du `check (rang between
 * 1 and 3)` de la table ; les recopier ici aurait fait de cet écran le seul
 * endroit à ne pas suivre le jour où la borne bouge.
 */
const RANGS = Array.from(
  { length: VITRINE_CONTENU_RANG_MAX - VITRINE_CONTENU_RANG_MIN + 1 },
  (_, i) => VITRINE_CONTENU_RANG_MIN + i,
);

/**
 * « À LA UNE » — un à trois contenus mis en avant, saisis à la main.
 *
 * ── TROIS LIGNES TOUJOURS VISIBLES, ET NON UN BOUTON « AJOUTER » ──
 *
 * La base ne connaît pas un « ordre » libre mais une PLACE : `rang` vaut 1, 2
 * ou 3, et l'unique `(organization_id, rang)` interdit deux contenus au même
 * endroit. L'écran dit exactement cela — trois emplacements, remplis ou vides
 * — plutôt qu'une liste extensible qui aurait laissé le commerçant chercher
 * pourquoi son quatrième ajout est refusé. Chaque place a son formulaire :
 * enregistrer la deuxième ne renvoie pas la première au serveur.
 *
 * ── CHAQUE PLACE EST UN `<form>`, ET ELLE RECHARGE ──
 *
 * `setVitrineContenu` insère (ou remplace) une ligne rendue par le serveur :
 * c'est le motif imposé par `use-action-form-coverage` — sans
 * `reloadOnSuccess`, un rafraîchissement qui ne s'applique pas laisse l'écran
 * inchangé, le commerçant reclique, et la place semble refuser sa saisie. Le
 * retrait recharge pour la même raison, en sens inverse.
 *
 * ── AUCUNE VALIDATION D'ADRESSE RECOPIÉE ICI ──
 *
 * `type="url"` et `pattern` bornent la frappe pour éviter l'aller-retour le
 * plus banal ; le verdict appartient au `check` de la table et à l'action, qui
 * refusent tout ce qui n'est pas `https://`. Recopier l'expression régulière du
 * SQL dans le navigateur aurait produit un second jeu de règles à tenir
 * d'accord avec la base — le défaut que cet écran a déjà évité sur le slug.
 */
export function ContenusEditeur({
  contenus,
  peutEditer,
}: {
  contenus: ContenuVitrineView[];
  /** Même garde d'affichage que le reste de l'écran : préparer sans exposer. */
  peutEditer: boolean;
}) {
  return (
    <Card>
      <h2>À la une (3 max)</h2>
      <p className="mb-5 mt-2 text-sm text-zinc-500">
        Trois contenus au plus, choisis par vous : une vidéo, un article, une
        page d&apos;événement. Ils s&apos;affichent sur votre vitrine juste
        au-dessus de vos réseaux, dans l&apos;ordre des places ci-dessous.
      </p>

      <div className="space-y-4">
        {RANGS.map((rang) => (
          <PlaceContenu
            key={rang}
            rang={rang}
            contenu={contenus.find((c) => c.rang === rang) ?? null}
            peutEditer={peutEditer}
          />
        ))}
      </div>
    </Card>
  );
}

function PlaceContenu({
  rang,
  contenu,
  peutEditer,
}: {
  rang: number;
  contenu: ContenuVitrineView | null;
  peutEditer: boolean;
}) {
  const enregistrer = useActionForm(setVitrineContenu, {
    networkError: "Enregistrement impossible, réessayez.",
    reloadOnSuccess: true,
  });
  const retirer = useActionForm(deleteVitrineContenu, {
    networkError: "Retrait impossible, réessayez.",
    reloadOnSuccess: true,
  });

  const idTitre = `vitrine-contenu-${rang}-titre`;
  const idUrl = `vitrine-contenu-${rang}-url`;

  return (
    <div className="rounded-xl border-2 border-k-ink/15 bg-white p-4">
      <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-k-orange-text">
        Place {rang}
      </p>
      {/* LES LIBELLÉS PORTENT LE NUMÉRO DE PLACE, et ce n'est pas une lourdeur
          gratuite : trois champs « Titre » sur le même écran se lisent
          « Titre, Titre, Titre » au lecteur d'écran, qui parcourt les
          formulaires par leurs étiquettes et non par leurs cartes. Le « Place
          3 » ci-dessus est visuel ; l'étiquette, elle, doit se suffire.

          Le formulaire de RETRAIT est distinct et n'entoure pas les champs :
          imbriquer deux `<form>` est invalide en HTML, et un seul formulaire à
          deux boutons aurait fait partir le titre et l'adresse avec une demande
          de suppression. */}
      <form onSubmit={enregistrer.onSubmit} className="space-y-3">
        <input type="hidden" name="rang" value={rang} />

        <div>
          <Label htmlFor={idTitre}>Titre de la place {rang}</Label>
          <Input
            id={idTitre}
            name="titre"
            // `key` sur la valeur reçue : après un retrait, la page est
            // rechargée et le champ doit repartir vide — un `defaultValue` seul
            // laisserait React réutiliser l'ancien contenu du champ.
            key={`${rang}-titre-${contenu?.titre ?? ""}`}
            defaultValue={contenu?.titre ?? ""}
            maxLength={VITRINE_CONTENU_TITRE_MAX}
            required
            disabled={!peutEditer}
            placeholder="Le comptoir en vidéo"
          />
        </div>

        <div>
          <Label htmlFor={idUrl}>Adresse de la place {rang}</Label>
          <Input
            id={idUrl}
            name="url"
            type="url"
            key={`${rang}-url-${contenu?.url ?? ""}`}
            defaultValue={contenu?.url ?? ""}
            maxLength={VITRINE_CONTENU_URL_MAX}
            required
            disabled={!peutEditer}
            pattern="https://.*"
            placeholder="https://…"
            aria-describedby={`${idUrl}-aide`}
          />
          <p id={`${idUrl}-aide`} className="mt-1.5 text-xs text-zinc-500">
            Adresse complète, en <code>https://</code>. Elle s&apos;ouvrira dans
            un nouvel onglet.
          </p>
        </div>

        {enregistrer.state && !enregistrer.state.ok ? (
          <FieldError message={enregistrer.state.error} />
        ) : null}
        {retirer.state && !retirer.state.ok ? (
          <FieldError message={retirer.state.error} />
        ) : null}

        {peutEditer ? (
          <Button type="submit" disabled={enregistrer.pending}>
            {enregistrer.pending
              ? "Enregistrement…"
              : contenu
                ? "Enregistrer"
                : "Mettre en avant"}
          </Button>
        ) : null}
      </form>

      {peutEditer && contenu ? (
        <form onSubmit={retirer.onSubmit} className="mt-3">
          <input type="hidden" name="rang" value={rang} />
          <Button type="submit" variant="secondary" disabled={retirer.pending}>
            {retirer.pending ? "Retrait…" : `Retirer la place ${rang}`}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
