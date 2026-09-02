"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import { setVitrineJeux } from "@/actions/vitrine";
import {
  VITRINE_JEUX,
  type BilanJeuxVitrine,
  type ChoixJeuxVitrine,
} from "@/lib/vitrine";

/**
 * CE QUI PARAÎT SUR LA CARTE (VIT-16, élargi VIT-32) — le bilan, puis les cases.
 *
 * ── LE BILAN VIENT AVANT LES CASES, ET C'EST L'INVERSE DE L'HABITUDE ──
 *
 * Un commerçant ne sait pas toujours ce que son offre comprend : « Duo Miroir »
 * et « Portrait de la Bande » sont des noms de produits, pas des évidences. Une
 * case à cocher seule lui demande de choisir avant de savoir ce qu'il choisit.
 * Chaque ligne dit donc d'abord CE QU'IL POSSÈDE et CE QUI EST PRÊT, et la case
 * vient après — sur la même ligne, pour qu'on ne relie pas deux listes.
 *
 * ── TROIS ÉTATS PAR LIGNE, ET DEUX SEULEMENT SONT DES CASES ──
 *
 *  · Non compris dans l'offre → aucune case, une phrase et rien d'autre. Cocher
 *    un module qu'on n'a pas produirait une porte que la page publique refuserait
 *    d'ouvrir : la promesse serait rompue à l'écran du client, pas ici.
 *  · Compris mais rien à montrer → la case existe ET l'avertissement aussi. On
 *    ne l'interdit pas : préparer sa vitrine avant son contenu est un ordre de
 *    travail légitime, et la vérification le redira.
 *  · Compris et prêt → la case, simplement.
 *
 * ── LE CHOIX RETIRE, IL N'AJOUTE JAMAIS ──
 *
 * Cocher n'ouvre rien : c'est la base qui dit ce qui est jouable (plateau du Duo
 * au-dessus du plancher, quiz publié, calendrier actif, programme actif).
 * Décocher, en revanche, masque à coup sûr. La phrase sous les cases le dit,
 * parce que l'inverse est ce qu'on suppose naturellement d'une case à cocher.
 *
 * ── L'ORDRE DES LIGNES EST CELUI DE LA PAGE PUBLIQUE ──
 *
 * `BlocExperiences` peint la Bande, le Duo, les quiz, les calendriers, les
 * pronostics puis les passeports. Cet écran suit le même ordre : régler une
 * liste en la lisant dans un autre ordre que celui qu'on obtient, c'est la
 * première source de « je ne retrouve pas ce que j'ai coché ».
 */
export function JeuxVitrineEditeur({
  possede,
  coche,
  compte,
  duoPret,
  peutEditer,
  rechargerApresSucces = false,
}: {
  /**
   * Le DROIT de chaque module, tel que la base le voit. Un `false` retire la
   * case, il ne la décoche pas : ce ne sont pas les mêmes phrases.
   */
  possede: ChoixJeuxVitrine;
  /** L'état RÉSOLU des cases — l'absence en base vaut « coché » (ADR-129). */
  coche: ChoixJeuxVitrine;
  /**
   * CE QUE LE COMMERÇANT A DÉJÀ, par famille : fiches du plateau Duo, quiz
   * publiés, calendriers actifs, pronostics ouverts, programmes de fidélité
   * actifs. Zéro n'interdit pas de cocher — il l'explique.
   *
   * La Bande n'y figure pas : son pack a un défaut et ses questions vivent dans
   * le code, il n'existe aucun état « pas prêt » à refléter (DUO-3a).
   */
  compte: BilanJeuxVitrine["compte"];
  /** Le plateau du Duo tient debout — le PLANCHER, pas un compte brut. */
  duoPret: boolean;
  peutEditer: boolean;
  /**
   * Recharge franchement la page après un succès. `false` par défaut.
   *
   * ── LA COURSE QUE CETTE OPTION FERME, ET POURQUOI CE N'EST PAS LE DÉFAUT ──
   *
   * `setVitrineJeux` écrit DEUX choses : `theme.jeux` ET `theme.ordre_blocs` —
   * cocher quelque chose AJOUTE `experiences` à l'ordre, ne rien cocher le
   * RETIRE (ADR-129). Un appelant qui tient cet ordre dans son état CLIENT — le
   * studio — le repostera au prochain enregistrement : le commerçant coche son
   * jeu, la base écrit `experiences`, l'état du studio l'ignore, l'envoi suivant
   * l'écrase, et le bloc « Jeux » disparaît de la vitrine publique juste après
   * qu'il l'a demandé. C'est la course de VIT-19, rejouée entre deux ACTIONS au
   * lieu de deux écrans.
   *
   * ELLE TIENT TOUJOURS SOUS L'ENREGISTREMENT AUTOMATIQUE (VIT-30), et elle est
   * même DEVENUE plus nécessaire : le studio reposte désormais son ordre 1,2 s
   * après chaque changement de réglage, sans qu'on ait cliqué. La fenêtre pour
   * écraser `experiences` n'est plus « au prochain clic » mais « à la prochaine
   * seconde », et seul le rechargement remet l'état client d'accord avec la base.
   *
   * Le tableau de bord, lui, n'a pas cet état client, donc pas cette course :
   * lui imposer un rechargement (~1 s, défilement perdu) l'aurait ralenti pour
   * rien. D'où le défaut à `false` et l'option posée par le seul appelant qui
   * la paie. Ce qu'elle coûte est assumé et écrit : un réglage du studio modifié
   * dans les 1,2 s qui précèdent l'enregistrement d'un choix de jeu part avec le
   * rechargement. Contre une porte publique écrasée en silence, c'est le bon
   * échange — et l'inverse (forcer l'envoi des réglages avant celui-ci) ferait
   * courir DEUX écritures concurrentes sur la même colonne `theme`, dont l'une
   * perdrait à coup sûr.
   */
  rechargerApresSucces?: boolean;
}) {
  const [choix, setChoix] = useState<ChoixJeuxVitrine>(coche);
  const { state, pending, onSubmit } = useActionForm(setVitrineJeux, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Choix enregistré.",
    reloadOnSuccess: rechargerApresSucces,
  });

  // AUCUNE case cochée PARMI CE QUE LE COMMERÇANT POSSÈDE : c'est ce qui fait
  // disparaître le bloc. Compter les cases d'un module non détenu aurait rendu
  // la phrase fausse pour tout le monde, puisque l'état résolu les coche toutes
  // par défaut — y compris celles qu'aucune ligne ne rend.
  const aucun = !VITRINE_JEUX.some((cle) => possede[cle] && choix[cle]);

  return (
    <Card className="space-y-5">
      <div>
        <h2>Ce qui paraît sur votre carte</h2>
        <p className="mt-2 text-sm text-k-body">
          Voici ce que comprend votre offre. Cochez ce que vos clients pourront
          ouvrir depuis votre vitrine — ou ne cochez rien : le bloc « Jeux »
          disparaîtra de la page.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <LigneJeu
          nom="Portrait de la Bande"
          description="De 2 à 12 joueurs à la même table. Dès trois, personne ne sait qui a voté."
          name="bande"
          possede={possede.bande}
          coche={choix.bande}
          onChange={(v) => setChoix((c) => ({ ...c, bande: v }))}
          peutEditer={peutEditer}
          etat={
            possede.bande
              ? "Prêt : le jeu fonctionne sans réglage, avec son pack par défaut."
              : null
          }
        />

        <LigneJeu
          nom="Duo Miroir"
          description="À deux : chacun choisit ce qu'il offrirait à l'autre."
          name="duo"
          possede={possede.duo}
          coche={choix.duo}
          onChange={(v) => setChoix((c) => ({ ...c, duo: v }))}
          peutEditer={peutEditer}
          etat={
            !possede.duo
              ? null
              : duoPret
                ? `Prêt : ${compte.duo} fiche${compte.duo > 1 ? "s" : ""} épinglée${compte.duo > 1 ? "s" : ""} au plateau.`
                : `Pas encore prêt : ${compte.duo} fiche${compte.duo > 1 ? "s" : ""} au plateau, il en faut davantage. Le jeu resterait fermé même coché.`
          }
          avertissement={possede.duo && !duoPret}
        />

        {/* LES QUATRE FAMILLES QUE VIT-32 AJOUTE. Elles paraissaient D'OFFICE :
            dès que la base ouvrait la porte, la carte l'annonçait, et un
            commerçant qui réserve son quiz à sa newsletter n'avait rien à dire.

            LEUR « PRÊT » EST UN COMPTE, et c'est le même que celui de la porte —
            zéro quiz publié, zéro porte peinte. Le dire ici évite la seule
            impasse possible : cocher, ne rien voir apparaître, et n'avoir aucune
            idée de laquelle des deux moitiés manque. */}
        <LigneJeu
          nom="Quiz"
          description="Vos quiz publiés, ouverts depuis la carte."
          name="quiz"
          possede={possede.quiz}
          coche={choix.quiz}
          onChange={(v) => setChoix((c) => ({ ...c, quiz: v }))}
          peutEditer={peutEditer}
          etat={
            possede.quiz ? phraseCompte(compte.quiz, "quiz publié", "quiz publiés") : null
          }
          avertissement={possede.quiz && compte.quiz === 0}
        />

        <LigneJeu
          nom="Calendrier"
          description="Votre calendrier de l'Avent, tant qu'il est actif."
          name="calendars"
          possede={possede.calendars}
          coche={choix.calendars}
          onChange={(v) => setChoix((c) => ({ ...c, calendars: v }))}
          peutEditer={peutEditer}
          etat={
            possede.calendars
              ? phraseCompte(compte.calendars, "calendrier actif", "calendriers actifs")
              : null
          }
          avertissement={possede.calendars && compte.calendars === 0}
        />

        <LigneJeu
          nom="Pronostics"
          description="Vos pronostics en cours, et ceux dont le classement se consulte encore."
          name="pronostics"
          possede={possede.pronostics}
          coche={choix.pronostics}
          onChange={(v) => setChoix((c) => ({ ...c, pronostics: v }))}
          peutEditer={peutEditer}
          etat={
            possede.pronostics
              ? phraseCompte(compte.pronostics, "pronostic ouvert", "pronostics ouverts")
              : null
          }
          avertissement={possede.pronostics && compte.pronostics === 0}
        />

        <LigneJeu
          nom="Passeport de fidélité"
          description="Vos clients cumulent leurs visites et débloquent leurs paliers."
          name="loyalty"
          possede={possede.loyalty}
          coche={choix.loyalty}
          onChange={(v) => setChoix((c) => ({ ...c, loyalty: v }))}
          peutEditer={peutEditer}
          etat={
            possede.loyalty
              ? phraseCompte(compte.loyalty, "programme actif", "programmes actifs")
              : null
          }
          avertissement={possede.loyalty && compte.loyalty === 0}
        />

        {aucun ? (
          <p className="rounded-xl border-2 border-k-ink/20 bg-k-bg px-3 py-2 text-sm font-semibold text-k-body">
            Rien de coché : le bloc « Jeux » n&apos;apparaîtra pas sur votre
            vitrine. Rien n&apos;est supprimé — vos réglages restent, et vous
            pourrez les remettre quand vous voudrez.
          </p>
        ) : (
          <p className="text-xs text-zinc-500">
            Cocher ne force rien : ce qui n&apos;est pas prêt reste fermé, même
            coché. Décocher, en revanche, le masque à coup sûr.
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

/**
 * « 3 quiz publiés » ou « Aucun quiz publié pour l'instant ».
 *
 * Le zéro a sa propre phrase plutôt qu'un « 0 quiz publiés » : c'est le seul cas
 * où cocher ne montrera rien, et c'est donc le seul qui mérite d'être lu comme
 * un avertissement plutôt que comme un chiffre.
 */
function phraseCompte(n: number, singulier: string, pluriel: string): string {
  if (n === 0) {
    return `Aucun ${singulier} pour l'instant : cocher n'ajoutera encore rien à votre carte.`;
  }
  return `Prêt : ${n} ${n > 1 ? pluriel : singulier}.`;
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
        {/* LE CHAMP CACHÉ EST LA MOITIÉ QUI COMPTE DE CE BLOC (VIT-32).
            `caseNative` lit un champ ABSENT comme « décoché » — sa propre
            docstring le dit et pose la condition : « l'écran rend toujours la
            case ». À deux jeux, l'enfreindre coûtait peu ; à six, un commerçant
            qui n'a que la Vitrine enregistrerait `false` sur les quatre modules
            qu'il ne possède pas, et le jour où il achète le Passeport, sa carte
            ne l'annoncerait pas — sans que rien ne lui dise pourquoi.
            On reposte donc l'état RÉSOLU : la ligne n'a pas de case, mais elle a
            toujours une voix. */}
        <input type="hidden" name={name} value={coche ? "1" : ""} />
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
