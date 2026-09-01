"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import { setVitrineJeux } from "@/actions/vitrine";

/**
 * LES JEUX SUR LA CARTE (VIT-16) — le bilan, puis les cases.
 *
 * ── LE BILAN VIENT AVANT LES CASES, ET C'EST L'INVERSE DE L'HABITUDE ──
 *
 * Un commerçant ne sait pas toujours ce que son offre comprend : « Duo Miroir »
 * et « Portrait de la Bande » sont des noms de produits, pas des évidences. Une
 * case à cocher seule lui demande de choisir avant de savoir ce qu'il choisit.
 * Chaque ligne dit donc d'abord CE QU'IL POSSÈDE et CE QUI EST PRÊT, et la case
 * vient après — sur la même ligne, pour qu'on ne relie pas deux listes.
 *
 * ── TROIS ÉTATS PAR JEU, ET DEUX SEULEMENT SONT DES CASES ──
 *
 *  · Non compris dans l'offre → aucune case, une phrase et rien d'autre. Cocher
 *    un jeu qu'on n'a pas produirait une porte que la page publique refuserait
 *    d'ouvrir : la promesse serait rompue à l'écran du client, pas ici.
 *  · Compris mais pas prêt → la case existe ET l'avertissement aussi. On ne
 *    l'interdit pas : préparer sa vitrine avant son plateau est un ordre de
 *    travail légitime, et la vérification le redira.
 *  · Compris et prêt → la case, simplement.
 *
 * ── LE CHOIX RETIRE, IL N'AJOUTE JAMAIS ──
 *
 * Cocher n'ouvre pas un jeu : c'est la base qui dit ce qui est jouable (plateau
 * du Duo au-dessus du plancher, pack de la Bande). Décocher, en revanche,
 * masque à coup sûr. La phrase sous les cases le dit, parce que l'inverse est
 * ce qu'on suppose naturellement d'une case à cocher.
 */
export function JeuxVitrineEditeur({
  duoPossede,
  bandePossede,
  duoPret,
  duoCoche,
  bandeCoche,
  nbFichesDuo,
  peutEditer,
}: {
  duoPossede: boolean;
  bandePossede: boolean;
  /** Le plateau tient debout (assez de fiches épinglées). */
  duoPret: boolean;
  duoCoche: boolean;
  bandeCoche: boolean;
  nbFichesDuo: number;
  peutEditer: boolean;
}) {
  const [duo, setDuo] = useState(duoCoche);
  const [bande, setBande] = useState(bandeCoche);
  const { state, pending, onSubmit } = useActionForm(setVitrineJeux, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Choix enregistré.",
  });

  const aucun = !duo && !bande;

  return (
    <Card className="space-y-5">
      <div>
        <h2>Les jeux sur votre carte</h2>
        <p className="mt-2 text-sm text-k-body">
          Voici ce que comprend votre offre. Cochez ce que vos clients pourront
          lancer depuis votre vitrine — ou ne cochez rien : le bloc « Jeux »
          disparaîtra de la page.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <LigneJeu
          nom="Portrait de la Bande"
          description="De 2 à 12 joueurs à la même table. Dès trois, personne ne sait qui a voté."
          possede={bandePossede}
          coche={bande}
          onChange={setBande}
          name="bande"
          peutEditer={peutEditer}
          etat={
            bandePossede
              ? "Prêt : le jeu fonctionne sans réglage, avec son pack par défaut."
              : null
          }
        />

        <LigneJeu
          nom="Duo Miroir"
          description="À deux : chacun choisit ce qu'il offrirait à l'autre."
          possede={duoPossede}
          coche={duo}
          onChange={setDuo}
          name="duo"
          peutEditer={peutEditer}
          etat={
            !duoPossede
              ? null
              : duoPret
                ? `Prêt : ${nbFichesDuo} fiche${nbFichesDuo > 1 ? "s" : ""} épinglée${nbFichesDuo > 1 ? "s" : ""} au plateau.`
                : `Pas encore prêt : ${nbFichesDuo} fiche${nbFichesDuo > 1 ? "s" : ""} au plateau, il en faut davantage. Le jeu resterait fermé même coché.`
          }
          avertissement={duoPossede && !duoPret}
        />

        {aucun ? (
          <p className="rounded-xl border-2 border-k-ink/20 bg-k-bg px-3 py-2 text-sm font-semibold text-k-body">
            Aucun jeu coché : le bloc « Jeux » n&apos;apparaîtra pas sur votre
            vitrine. Rien n&apos;est supprimé — vos réglages de jeu restent, et
            vous pourrez les remettre quand vous voudrez.
          </p>
        ) : (
          <p className="text-xs text-zinc-500">
            Cocher ne force rien : un jeu qui n&apos;est pas prêt reste fermé,
            même coché. Décocher, en revanche, le masque à coup sûr.
          </p>
        )}

        {peutEditer ? (
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer mon choix"}
          </Button>
        ) : null}
        <FieldError
          message={state && !state.ok ? state.error : undefined}
        />
        {state?.ok ? (
          <p className="text-sm font-semibold text-k-body" role="status">
            Choix enregistré.
          </p>
        ) : null}
      </form>
    </Card>
  );
}

function LigneJeu({
  nom,
  description,
  possede,
  coche,
  onChange,
  name,
  peutEditer,
  etat,
  avertissement = false,
}: {
  nom: string;
  description: string;
  possede: boolean;
  coche: boolean;
  onChange: (v: boolean) => void;
  name: string;
  peutEditer: boolean;
  etat: string | null;
  avertissement?: boolean;
}) {
  if (!possede) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-k-ink/20 p-3">
        <p className="text-sm font-black text-k-ink">{nom}</p>
        <p className="mt-0.5 text-sm text-k-body">{description}</p>
        <p className="mt-1.5 text-sm font-semibold text-zinc-500">
          Non compris dans votre offre.{" "}
          <Link
            href="/dashboard/settings"
            className="text-k-orange-text underline underline-offset-2"
          >
            Voir les offres
          </Link>
        </p>
      </div>
    );
  }

  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-k-ink/20 bg-white p-3">
      <input
        type="checkbox"
        name={name}
        checked={coche}
        onChange={(e) => onChange(e.target.checked)}
        disabled={!peutEditer}
        className="mt-1 size-4 shrink-0 accent-k-orange-text"
      />
      <span className="min-w-0">
        <span className="block text-sm font-black text-k-ink">{nom}</span>
        <span className="mt-0.5 block text-sm text-k-body">{description}</span>
        {etat ? (
          <span
            className={`mt-1 block text-sm font-semibold ${
              avertissement ? "text-red-700" : "text-zinc-500"
            }`}
          >
            {etat}
          </span>
        ) : null}
      </span>
    </label>
  );
}
