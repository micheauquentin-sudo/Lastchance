"use client";

import { useState } from "react";
import Link from "next/link";
import { Input, Label } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { CodeTtlDaysField } from "@/components/dashboard/code-ttl-days-field";
import { PublicShare } from "@/components/dashboard/public-share";
import {
  EventQuestionsSection,
  SessionForm,
  type EditorQuestion,
  type EditorSession,
} from "@/components/dashboard/event-editor";
import { eventQuestionTypeMeta } from "@/components/event/event-view-state";
import type {
  EtatRythme,
  EtatSalle,
  EtatSoiree,
} from "@/components/event/studio/etat";

/**
 * LE CONTENU DES ÉTAPES DU STUDIO DE LA SOIRÉE (VIT-47).
 *
 * ── AUCUN CONTRÔLE DE CE FICHIER NE PORTE DE `name` DE CHARGE UTILE ──
 *
 * C'est la règle du socle, et elle ne se négocie pas : une étape qu'on quitte
 * est DÉMONTÉE. Un `name` posé ici disparaîtrait du formulaire de réglages, et
 * l'enregistrement automatique suivant effacerait la colonne.
 *
 * Tout écrit donc dans l'état du studio ; la charge d'`updateEventGame` est
 * rendue à part, en entier, par `ChampsCachesSoiree`, et celles
 * d'`updateEventQuestion` et d'`updateEventSession` sont construites par
 * `chargeRythmeEvenement` et `chargeSalleEvenement` au moment de l'envoi.
 *
 * Le seul `name` du fichier est celui de `CodeTtlDaysField`, qui reçoit
 * `champCache={false}` — précisément pour qu'il n'en pose AUCUN : son champ
 * caché vivrait sinon dans une étape démontable, hors du formulaire, et ne
 * partirait jamais. Ici l'échéance voyage dans la charge OBJET de la salle, pas
 * dans une `FormData`.
 */

const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500";
const selectClass =
  "min-w-0 max-w-xs truncate rounded-xl border-2 border-k-ink bg-white px-2.5 py-1.5 text-xs font-bold text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow";

function TitreEtape({ titre, aide }: { titre: string; aide: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-black text-k-ink">{titre}</h2>
      <p className="mt-1 text-sm text-k-body">{aide}</p>
    </div>
  );
}

/** L'encart qu'on lit quand l'étape n'a rien à régler faute d'objet choisi. */
function RienAChoisir({
  texte,
  libelleLien,
  onAller,
}: {
  texte: string;
  libelleLien: string;
  onAller: () => void;
}) {
  return (
    <p className="rounded-2xl border-2 border-k-ink/20 bg-white p-4 text-sm text-k-body">
      {texte}{" "}
      <button
        type="button"
        onClick={onAller}
        className="font-black text-k-ink underline underline-offset-2"
      >
        {libelleLien}
      </button>
      .
    </p>
  );
}

// ── 1. Le nom de votre soirée ───────────────────────────────

export function EtapeNom({
  etat,
  majEtat,
  peutEditer,
}: {
  etat: EtatSoiree;
  majEtat: (patch: Partial<EtatSoiree>) => void;
  peutEditer: boolean;
}) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Le nom de votre soirée"
        aide="Il s'affiche en haut du téléphone de vos joueurs et sur l'écran de salle, pendant toute la soirée."
      />
      <div className="max-w-md">
        <Label htmlFor="studio-soiree-nom">Nom du jeu</Label>
        <Input
          id="studio-soiree-nom"
          value={etat.name}
          onChange={(e) => majEtat({ name: e.target.value })}
          maxLength={120}
          disabled={!peutEditer}
          placeholder="Ex : Le blind test du jeudi"
        />
      </div>
      <InfoBulle id="aide-studio-soiree-nom" resume="Où ce nom sera-t-il lu ?">
        Nommez la soirée telle que vous l&apos;annoncez à vos clients, pas
        d&apos;après votre organisation interne. Il se change à tout moment, même
        une fois le jeu ouvert — l&apos;aperçu à droite le montre à sa place.
      </InfoBulle>
    </div>
  );
}

// ── 2. Vos questions ────────────────────────────────────────

/**
 * LA LISTE DES QUESTIONS — le MÊME éditeur que l'atelier, pas une copie.
 *
 * `EventQuestionsSection` porte déjà tout ce que cette étape promet : le
 * générateur, l'ajout, la suppression gardée (case cochable seulement APRÈS le
 * refus qui NOMME le nombre de réponses perdues) et l'édition d'une question.
 * En réécrire une version « studio » aurait fait deux vérités sur ce qu'est une
 * question valide — et deux formes de la garde destructive, dont l'une aurait
 * fini par s'afficher sur n'importe quel échec.
 */
export function EtapeQuestions({
  gameId,
  questions,
}: {
  gameId: string;
  questions: EditorQuestion[];
}) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Vos questions"
        aide="Ce que vous demanderez, dans l'ordre de cette liste. Le générateur peut les écrire pour vous à partir d'un thème."
      />
      <EventQuestionsSection gameId={gameId} questions={questions} />
    </div>
  );
}

// ── 3. Le temps de réponse et les points ────────────────────

/**
 * LE RYTHME D'UNE QUESTION — deux nombres, et une charge COMPLÈTE.
 *
 * Ce que l'étape ajoute à la liste : on règle le chronomètre EN VOYANT la barre
 * de décompte sur le téléphone du client, à droite. C'est la raison d'être d'un
 * studio, et c'est un réglage qu'on ne peut pas juger dans une liste.
 *
 * Ce qu'elle POSTE, en revanche, est la question ENTIÈRE — type, intitulé,
 * options et bonne réponse compris, relus de la ligne serveur. Voir
 * `chargeRythmeEvenement` : `updateEventQuestion` est indivisible, et une charge
 * qui n'aurait porté que ces deux nombres aurait effacé la bonne réponse.
 */
export function EtapeRythme({
  question,
  etat,
  majEtat,
  peutEditer,
  onAllerAuxQuestions,
}: {
  question: EditorQuestion | null;
  etat: EtatRythme;
  majEtat: (patch: Partial<EtatRythme>) => void;
  peutEditer: boolean;
  onAllerAuxQuestions: () => void;
}) {
  if (!question) {
    return (
      <div className="space-y-4">
        <TitreEtape
          titre="Le temps de réponse et les points"
          aide="Combien de secondes pour répondre, et ce que la question rapporte."
        />
        <RienAChoisir
          texte="Cette soirée n'a encore aucune question."
          libelleLien="Écrire la première"
          onAller={onAllerAuxQuestions}
        />
      </div>
    );
  }

  const meta = eventQuestionTypeMeta(question.questionType);
  const estQuiz = question.questionType === "quiz";

  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Le temps de réponse et les points"
        aide="Le sélecteur du bandeau, en haut, choisit la question : il pilote ces deux réglages ET l'aperçu, pour qu'on règle toujours la question qu'on regarde."
      />

      <div className="rounded-2xl border-2 border-k-ink/20 bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
          {meta.emoji} {meta.label}
        </p>
        <p className="mt-1 font-black text-k-ink">{question.prompt}</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <Label htmlFor="studio-soiree-temps">Temps de réponse (s)</Label>
          <Input
            id="studio-soiree-temps"
            type="number"
            min={5}
            max={300}
            value={etat.timeLimitSeconds}
            onChange={(e) =>
              majEtat({ timeLimitSeconds: Number(e.target.value) })
            }
            disabled={!peutEditer}
            className="w-32"
          />
        </div>
        <div>
          <Label htmlFor="studio-soiree-points">Points de base</Label>
          <Input
            id="studio-soiree-points"
            type="number"
            min={0}
            max={100000}
            value={etat.pointsBase}
            onChange={(e) => majEtat({ pointsBase: Number(e.target.value) })}
            disabled={!peutEditer}
            className="w-32"
            aria-describedby="studio-soiree-points-aide"
          />
          <p
            id="studio-soiree-points-aide"
            className="mt-1 max-w-xs text-xs text-zinc-500"
          >
            {estQuiz
              ? "Base des points ; répondre vite rapporte davantage."
              : "Sans effet sur un sondage ou un pronostic (aucun score à la rapidité)."}
          </p>
        </div>
      </div>

      <InfoBulle
        id="aide-studio-soiree-rythme"
        resume="Régler le chrono peut-il abîmer ma question ?"
      >
        Non. Enregistrer depuis cet écran renvoie la question ENTIÈRE — son type,
        son intitulé, ses options et sa bonne réponse, tels qu&apos;ils sont
        enregistrés. C&apos;est nécessaire : l&apos;action de mise à jour les
        écrit d&apos;un seul tenant, et une modification qui ne porterait que ces
        deux nombres effacerait le reste. Le libellé se corrige à
        l&apos;étape « Vos questions ».
      </InfoBulle>
    </div>
  );
}

// ── 4. Les salles de la soirée ──────────────────────────────

const STATUT_SALLE: Record<EditorSession["status"], string> = {
  draft: "Brouillon",
  lobby: "Salon ouvert",
  live: "En direct",
  ended: "Terminée",
  archived: "Archivée",
};

export function EtapeSalles({
  gameId,
  gameActive,
  sessions,
  selection,
  onSelection,
  etat,
  majEtat,
  peutEditer,
}: {
  gameId: string;
  gameActive: boolean;
  sessions: EditorSession[];
  selection: string | null;
  onSelection: (id: string) => void;
  etat: EtatSalle;
  majEtat: (patch: Partial<EtatSalle>) => void;
  peutEditer: boolean;
}) {
  const [creation, setCreation] = useState(false);
  const salle = sessions.find((s) => s.id === selection) ?? null;

  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Les salles de la soirée"
        aide="Une salle est un déroulé du jeu, avec son code d'accès et son lot. On en prépare une par soirée — ou plusieurs, pour plusieurs services."
      />

      {!gameActive && (
        <p className="rounded-xl border-2 border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
          Le jeu n&apos;est pas encore ouvert : vous pouvez tout préparer, mais
          aucune salle ne pourra être lancée en direct tant qu&apos;il ne
          l&apos;est pas.
        </p>
      )}

      {sessions.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
          Aucune salle. Créez-en une pour animer une soirée.
        </p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelection(s.id)}
                aria-pressed={s.id === selection}
                className={`flex w-full flex-wrap items-center gap-2 rounded-xl border-2 p-3 text-left ${
                  s.id === selection
                    ? "border-k-ink bg-k-yellow/30"
                    : "border-k-ink/20 bg-white hover:bg-k-yellow/10"
                }`}
              >
                <span className="font-black text-k-ink">
                  {s.label || "Salle sans nom"}
                </span>
                <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-bold text-zinc-600">
                  {STATUT_SALLE[s.status]}
                </span>
                <span className="font-mono text-xs font-bold tracking-widest text-k-body">
                  {s.joinCode}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {salle && (
        <div className="max-w-md">
          <Label htmlFor="studio-soiree-salle-nom">
            Nom de la salle choisie (facultatif)
          </Label>
          <Input
            id="studio-soiree-salle-nom"
            value={etat.label}
            onChange={(e) => majEtat({ label: e.target.value })}
            maxLength={120}
            disabled={!peutEditer}
            placeholder="Ex : Soirée du 12 juillet"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Pour vous y retrouver entre plusieurs services. Vos clients ne le
            voient pas : ce qu&apos;ils lisent, c&apos;est le nom de la soirée.
          </p>
        </div>
      )}

      {peutEditer &&
        (creation ? (
          <SessionForm
            gameId={gameId}
            onDone={() => setCreation(false)}
            onCancel={() => setCreation(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreation(true)}
            className="rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/30"
          >
            + Nouvelle salle
          </button>
        ))}

      <InfoBulle
        id="aide-studio-soiree-salles"
        resume="Comment supprimer une salle ?"
      >
        Depuis la page de suivi, où l&apos;on voit ce qu&apos;on détruit : les
        codes de retrait déjà gagnés et non retirés y sont comptés avant de vous
        demander de confirmer. Le studio prépare, il ne défait pas.{" "}
        <Link
          href={`/dashboard/events/${gameId}`}
          className="font-black text-k-ink underline underline-offset-2"
        >
          Ouvrir le suivi
        </Link>
      </InfoBulle>
    </div>
  );
}

// ── 5. Le lot et le nombre de gagnants ──────────────────────

export function EtapeLot({
  salle,
  etat,
  majEtat,
  peutEditer,
  onAllerAuxSalles,
}: {
  salle: EditorSession | null;
  etat: EtatSalle;
  majEtat: (patch: Partial<EtatSalle>) => void;
  peutEditer: boolean;
  onAllerAuxSalles: () => void;
}) {
  if (!salle) {
    return (
      <div className="space-y-4">
        <TitreEtape
          titre="Le lot et le nombre de gagnants"
          aide="Ce que gagne le podium, en quelle quantité, et jusqu'à quand."
        />
        <RienAChoisir
          texte="Le lot se règle salle par salle, et cette soirée n'en a encore aucune."
          libelleLien="Préparer la première"
          onAller={onAllerAuxSalles}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Le lot et le nombre de gagnants"
        aide={`Pour la salle « ${salle.label || "sans nom"} ». Le sélecteur du bandeau, en haut, en change.`}
      />

      <div>
        <Label htmlFor="studio-soiree-lot">Lot</Label>
        <Input
          id="studio-soiree-lot"
          value={etat.rewardLabel}
          onChange={(e) => majEtat({ rewardLabel: e.target.value })}
          maxLength={120}
          disabled={!peutEditer}
          placeholder="Ex : Une tournée offerte"
        />
      </div>

      <div>
        <Label htmlFor="studio-soiree-lot-details">
          Détails du lot (facultatif)
        </Label>
        <textarea
          id="studio-soiree-lot-details"
          value={etat.rewardDetails}
          onChange={(e) => majEtat({ rewardDetails: e.target.value })}
          maxLength={2000}
          rows={2}
          disabled={!peutEditer}
          placeholder="Conditions, validité, modalités de retrait…"
          className={textareaClass}
        />
      </div>

      <div>
        <Label htmlFor="studio-soiree-stock">
          Nombre de gagnants (obligatoire)
        </Label>
        <Input
          id="studio-soiree-stock"
          type="number"
          min={0}
          max={1000000}
          value={etat.rewardStock}
          onChange={(e) => majEtat({ rewardStock: e.target.value })}
          disabled={!peutEditer}
          className="w-32"
          aria-describedby="studio-soiree-stock-aide"
        />
        <p
          id="studio-soiree-stock-aide"
          className="mt-1 max-w-md text-xs text-zinc-500"
        >
          Nombre de codes de retrait émis à la fin, du 1<sup>er</sup> au
          N<sup>e</sup> du classement. À 0, le podium s&apos;affiche à
          l&apos;écran mais personne ne repart avec quoi que ce soit.{" "}
          {salle.rewardClaimedCount} déjà remis.
        </p>
      </div>

      {/* `champCache={false}` : dans un studio, l'échéance voyage dans la charge
          OBJET de la salle (`chargeSalleEvenement`), pas dans une `FormData`. Le
          champ caché que ce composant pose par défaut vivrait ici dans une étape
          démontable, hors du formulaire de réglages, et ne partirait jamais. */}
      <CodeTtlDaysField
        idPrefix="studio-soiree-salle"
        value={etat.codeTtlDays}
        onChange={(next) => majEtat({ codeTtlDays: next })}
        champCache={false}
        emissionHint="Délai laissé au gagnant pour présenter son code EVENT- en caisse, à partir de la FIN de la salle (les codes sont émis au podium)."
      />

      <InfoBulle
        id="aide-studio-soiree-lot"
        resume="Pourquoi le nombre de gagnants est-il obligatoire ?"
      >
        Parce qu&apos;il plafonne ce que vous devrez servir. Un stock illimité
        n&apos;existe pas ici : le podium émet exactement autant de codes que le
        nombre annoncé, et pas un de plus. Vous pouvez le régler pendant que la
        salle est préparée, jamais après la fin de la soirée.
      </InfoBulle>
    </div>
  );
}

// ── 6. Le QR et le code d'accès ─────────────────────────────

/**
 * CE QUI SE PRÉPARE AVANT, ET RIEN DE CE QUI S'ANIME PENDANT.
 *
 * L'affiche à coller sur les tables, le lien à envoyer, le code à lire à voix
 * haute : trois choses qu'on fait AVANT que la salle s'ouvre. « Piloter »,
 * l'écran de projection et le compteur d'ouvertures en direct restent sur la
 * page de suivi — un studio prépare, il n'anime pas. Le lien ci-dessous y mène ;
 * il ne les ramène pas.
 */
export function EtapeAcces({
  gameId,
  salle,
  onAllerAuxSalles,
}: {
  gameId: string;
  salle: EditorSession | null;
  onAllerAuxSalles: () => void;
}) {
  if (!salle) {
    return (
      <div className="space-y-4">
        <TitreEtape
          titre="Le QR et le code d'accès"
          aide="L'affiche à imprimer et le code à lire à voix haute en salle."
        />
        <RienAChoisir
          texte="Le QR appartient à une salle, et cette soirée n'en a encore aucune."
          libelleLien="Préparer la première"
          onAller={onAllerAuxSalles}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Le QR et le code d'accès"
        aide={`Pour la salle « ${salle.label || "sans nom"} ». Imprimez l'affiche, posez-la sur les tables : vos clients scannent et arrivent dans la salle d'attente.`}
      />

      <div className="rounded-2xl border-2 border-k-ink/20 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-wide text-zinc-500">
          Code d&apos;accès à lire en salle
        </p>
        <p className="mt-1 font-mono text-2xl font-black tracking-widest text-k-ink">
          {salle.joinCode}
        </p>
      </div>

      {salle.status === "archived" ? (
        <p className="rounded-2xl border-2 border-k-ink/25 bg-k-bg p-4 text-sm font-bold text-k-body">
          Cette salle est archivée : son lien joueur et son QR ne sont plus
          proposés.
        </p>
      ) : (
        <PublicShare
          url={salle.publicUrl}
          fileName={`evenement-${salle.joinCode}`}
          qrLabel={salle.label || `Salle ${salle.joinCode}`}
          openCount={salle.openCount}
          resource={{ kind: "event", id: salle.id }}
        />
      )}

      <p className="rounded-2xl border-2 border-k-ink/25 bg-k-bg p-4 text-sm font-bold text-k-body">
        Le soir venu, c&apos;est la page de suivi qui pilote : lancer la salle,
        envoyer les questions, projeter l&apos;écran.{" "}
        <Link
          href={`/dashboard/events/${gameId}`}
          className="font-black text-k-ink underline underline-offset-2"
        >
          Ouvrir le suivi
        </Link>
      </p>
    </div>
  );
}

// ── Les deux sélecteurs du bandeau ──────────────────────────

/**
 * LES SÉLECTEURS — dans le bandeau `outils` de la coquille.
 *
 * Ils ne partent JAMAIS au serveur : ce sont des réglages d'AFFICHAGE, ce pour
 * quoi le socle a prévu cette rangée. Et ils sont UNIQUES : un second sélecteur
 * dans l'étape aurait fait deux commandes pour un seul état, dont l'une
 * désynchronisée de l'aperçu à la première distraction.
 */
export function SelecteurQuestion({
  questions,
  selection,
  onSelection,
}: {
  questions: EditorQuestion[];
  selection: string | null;
  onSelection: (id: string) => void;
}) {
  if (questions.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label
        htmlFor="studio-soiree-question-choix"
        className="shrink-0 text-xs font-black text-k-ink"
      >
        Question affichée
      </label>
      <select
        id="studio-soiree-question-choix"
        value={selection ?? ""}
        onChange={(e) => onSelection(e.target.value)}
        className={selectClass}
      >
        {questions.map((q, index) => (
          <option key={q.id} value={q.id}>
            {index + 1}. {q.prompt}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SelecteurSalle({
  sessions,
  selection,
  onSelection,
}: {
  sessions: EditorSession[];
  selection: string | null;
  onSelection: (id: string) => void;
}) {
  if (sessions.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label
        htmlFor="studio-soiree-salle-choix"
        className="shrink-0 text-xs font-black text-k-ink"
      >
        Salle réglée
      </label>
      <select
        id="studio-soiree-salle-choix"
        value={selection ?? ""}
        onChange={(e) => onSelection(e.target.value)}
        className={selectClass}
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label || `Salle ${s.joinCode}`}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Rend une sélection utilisable comme état contrôlé.
 *
 * L'élément choisi peut DISPARAÎTRE — une question supprimée depuis la liste,
 * une salle effacée depuis le suivi : on retombe alors sur le premier plutôt que
 * sur un écran vide, comme partout ailleurs dans ce produit (ADR-129).
 */
export function useSelectionParmi<T extends { id: string }>(elements: T[]) {
  const premier = elements[0]?.id ?? null;
  const [choisi, setChoisi] = useState<string | null>(premier);
  const selection =
    choisi !== null && elements.some((e) => e.id === choisi) ? choisi : premier;
  return { selection, setSelection: setChoisi };
}
