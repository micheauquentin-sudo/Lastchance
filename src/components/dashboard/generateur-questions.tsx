"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { genererQuestionsEvenement } from "@/actions/events";
import { genererQuestionsQuiz } from "@/actions/quiz";
import {
  DUREES_PROPOSEES,
  NOMBRE_MAX,
  THEMES_BANQUE,
  dureeLisible,
  genererQuestions,
  genreDe,
  pointsDe,
  presetDe,
  vivier,
  type DifficulteBanque,
  type GenreBanque,
  type QuestionBanque,
} from "@/lib/quiz-banque";
import { quizPresetInfo } from "@/components/quiz/quiz-presets";

/**
 * LE GÉNÉRATEUR, côté commerçant — servi À L'IDENTIQUE au Créateur de quiz et
 * au Mode événement live, qui partagent la même banque.
 *
 * Le commerçant coche des thèmes, dit combien de questions OU combien de temps
 * doit durer la partie, et voit AVANT d'écrire ce qui sera ajouté. Quatre
 * décisions valent d'être dites :
 *
 * 1. **L'aperçu est le tirage.** Le composant appelle `genererQuestions` (pur),
 *    et la server action le REJOUE avec la même graine : ce qui s'affiche est ce
 *    qui s'écrit. Un aperçu « représentatif » mais différent serait pire que pas
 *    d'aperçu du tout — le commerçant validerait autre chose que ce qu'il a lu.
 *
 * 2. **La durée est convertie, pas promise.** On affiche « environ 32 min » et
 *    le nombre de questions déduit ; le chronomètre d'une question est un
 *    plafond, personne ne le consomme entièrement (`PART_CHRONO_CONSOMMEE`).
 *
 * 3. **Le manque est dit, pas masqué.** Un seul thème coché ne porte qu'une
 *    vingtaine de questions : demander une heure là-dessus est légitime, et la
 *    seule réponse honnête est « la banque n'en a que 20, ajoutez des thèmes ».
 *
 * 4. **Le live n'accepte que des questions à options.** On y répond en tapant
 *    sur un gros bouton depuis la salle : ni saisie libre ni nombre à deviner.
 *    Le vivier est donc restreint (`pourEvenement`), et l'écran le dit plutôt
 *    que de laisser croire à une banque plus courte.
 */

/** Ce que le générateur remplit — deux modules, une seule interface. */
export type CibleGenerateur = "quiz" | "evenement";

/** Ce que l'écran propose comme raccourcis de volume. */
const NOMBRES_PROPOSES = [5, 10, 15, 20, 30] as const;

/**
 * Plafond d'une génération, par cible. Le live est plus bas que le quiz : une
 * soirée animée se joue en 20 à 40 manches, et la télécommande deviendrait une
 * liste interminable à faire défiler en direct. Miroir des schémas serveur.
 */
const NOMBRE_MAX_PAR_CIBLE = { quiz: NOMBRE_MAX, evenement: 60 } as const;

const GENRES: ReadonlyArray<{
  cle: GenreBanque;
  label: string;
  icon: string;
  hint: string;
}> = [
  {
    cle: "question",
    label: "Questions",
    icon: "🎯",
    hint: "Une bonne réponse, des points, une correction immédiate.",
  },
  {
    cle: "sondage",
    label: "Sondages",
    icon: "📊",
    hint: "Un avis, aucune bonne réponse, 0 point.",
  },
  {
    cle: "pronostic",
    label: "Pronostics",
    icon: "🔮",
    hint: "Un pari sur la soirée, sans bonne réponse non plus.",
  },
];

/** Le PLAFOND proposé au commerçant — un filtre, pas l'étiquette d'une question. */
const DIFFICULTES: ReadonlyArray<{ valeur: DifficulteBanque; label: string }> = [
  { valeur: 1, label: "Faciles" },
  { valeur: 2, label: "Faciles et moyennes" },
  { valeur: 3, label: "Toutes" },
];

/** L'étiquette d'UNE question, indexée par sa difficulté (1 à 3). */
const DIFFICULTE_LABEL: Record<DifficulteBanque, string> = {
  1: "facile",
  2: "moyenne",
  3: "difficile",
};

/** Graine de départ : reproductible d'un rendu à l'autre, jamais `Date.now()`
 *  au premier rendu (aucun écart d'hydratation possible). */
const GRAINE_INITIALE = 1;

function chip(actif: boolean): string {
  return actif
    ? "border-k-ink bg-k-yellow/40 shadow-[3px_3px_0_var(--color-k-ink)]"
    : "border-k-ink/20 bg-white hover:border-k-ink/50";
}

export function GenerateurQuestions({
  cible,
  cibleId,
  /** Intitulés DÉJÀ posés : exclus du tirage, exactement comme côté serveur. */
  promptsExistants,
}: {
  cible: CibleGenerateur;
  /** Identifiant du quiz (`quiz`) ou du jeu (`evenement`). */
  cibleId: string;
  promptsExistants: readonly string[];
}) {
  const pourEvenement = cible === "evenement";
  const nombreMax = NOMBRE_MAX_PAR_CIBLE[cible];
  const [ouvert, setOuvert] = useState(false);
  const [themes, setThemes] = useState<string[]>([]);
  const [genres, setGenres] = useState<GenreBanque[]>(["question"]);
  const [mode, setMode] = useState<"nombre" | "duree">("nombre");
  const [nombre, setNombre] = useState("10");
  const [minutes, setMinutes] = useState(30);
  const [difficulteMax, setDifficulteMax] = useState<DifficulteBanque>(3);
  const [graine, setGraine] = useState(GRAINE_INITIALE);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Miroir EXACT de l'exclusion serveur (intitulé rogné, en minuscules).
  const exclure = useMemo(() => {
    const pris = new Set(promptsExistants.map((p) => p.trim().toLowerCase()));
    return vivier({ mode: { type: "nombre", nombre: 1 }, genres: GENRES.map((g) => g.cle) })
      .filter((q) => pris.has(q.prompt.trim().toLowerCase()))
      .map((q) => q.id);
  }, [promptsExistants]);

  const criteres = useMemo(
    () => ({
      themes,
      genres,
      difficulteMax,
      exclure,
      graine,
      pourEvenement,
      plafond: nombreMax,
      mode:
        mode === "duree"
          ? ({ type: "duree", minutes } as const)
          : // Le plafond est appliqué DÈS L'APERÇU : sans lui, l'écran
            // montrerait 120 questions que le schéma serveur refuserait — un
            // aperçu qu'on ne peut pas valider ne vaut rien.
            ({
              type: "nombre",
              nombre: Math.min(Number(nombre) || 0, nombreMax),
            } as const),
    }),
    [
      themes,
      genres,
      difficulteMax,
      exclure,
      graine,
      pourEvenement,
      mode,
      minutes,
      nombre,
      nombreMax,
    ],
  );

  const tirage = useMemo(() => genererQuestions(criteres), [criteres]);
  const disponibles = useMemo(() => vivier(criteres).length, [criteres]);

  /**
   * Ce que chaque thème porte RÉELLEMENT dans les conditions du moment —
   * difficulté demandée, et restriction aux questions à options pour le live.
   * Un compte figé (« 20 questions ») mentirait dès que l'un des deux change.
   */
  const parTheme = useMemo(() => {
    const pool: QuestionBanque[] = vivier({
      mode: { type: "nombre", nombre: 1 },
      genres: GENRES.map((g) => g.cle),
      difficulteMax,
      pourEvenement,
    });
    const compte = new Map<string, { notees: number; avis: number }>();
    for (const q of pool) {
      const ligne = compte.get(q.theme) ?? { notees: 0, avis: 0 };
      if (genreDe(q) === "question") ligne.notees += 1;
      else ligne.avis += 1;
      compte.set(q.theme, ligne);
    }
    return compte;
  }, [difficulteMax, pourEvenement]);

  const basculeTheme = (cle: string) =>
    setThemes((current) =>
      current.includes(cle) ? current.filter((t) => t !== cle) : [...current, cle],
    );

  const basculeGenre = (cle: GenreBanque) =>
    setGenres((current) =>
      current.includes(cle)
        ? // Jamais zéro nature : le schéma la refuserait, et un écran qui se
          // rend invalide tout seul est une impasse.
          current.length > 1
          ? current.filter((g) => g !== cle)
          : current
        : [...current, cle],
    );

  const ajouter = () => {
    if (pending || tirage.questions.length === 0) return;
    setError(null);
    setPending(true);
    void (async () => {
      try {
        const commande = {
          themes,
          genres,
          mode,
          // Même plafond que l'aperçu : on envoie ce qui a été montré.
          nombre: Math.min(Number(nombre) || 0, nombreMax),
          minutes,
          graine,
          difficulteMax,
        };
        const res = pourEvenement
          ? await genererQuestionsEvenement({ gameId: cibleId, ...commande })
          : await genererQuestionsQuiz({ quizId: cibleId, ...commande });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        // RECHARGEMENT FRANC, comme l'ajout d'une question unique : la liste des
        // questions n'a aucun état local, et `router.refresh()` a été mesuré
        // défaillant (docs/bugs.md). Sans retour visible, le commerçant
        // relancerait la génération et poserait tout deux fois.
        window.location.reload();
      } catch {
        setError("Génération impossible, réessayez.");
      } finally {
        setPending(false);
      }
    })();
  };

  const total = tirage.questions.length;
  // Total de points ANNONCÉ au quiz seulement : le live compte en centaines et
  // ajoute un bonus de rapidité — un total y serait faux avant la première
  // réponse.
  const points = pourEvenement
    ? 0
    : tirage.questions.reduce((t, q) => t + pointsDe(q), 0);

  return (
    <div className="mb-5 rounded-xl border-2 border-k-ink/20 bg-k-stripe/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-k-ink">
            <span aria-hidden>✨ </span>Générateur de questions
          </h3>
          <p className="mt-0.5 text-xs text-zinc-600">
            Choisissez des thèmes et une durée : les questions arrivent avec
            leurs réponses, prêtes à jouer. Vous pouvez tout modifier ensuite.
            {pourEvenement &&
              " En direct, on répond en tapant sur un bouton : seules les questions à propositions sont proposées ici."}
          </p>
        </div>
        <Button
          type="button"
          variant={ouvert ? "ghost" : "secondary"}
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
        >
          {ouvert ? "Fermer" : "Ouvrir le générateur"}
        </Button>
      </div>

      {ouvert && (
        <div className="mt-4 space-y-5">
          {/* ── Thèmes ── */}
          <fieldset>
            <legend className="mb-1.5 text-sm font-bold text-k-ink">
              Thèmes{" "}
              <span className="font-normal text-zinc-500">
                {themes.length === 0
                  ? "— aucun coché : mélange de tous les thèmes"
                  : `— ${themes.length} coché${themes.length > 1 ? "s" : ""}`}
              </span>
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {THEMES_BANQUE.map((theme) => {
                const compte = parTheme.get(theme.cle) ?? { notees: 0, avis: 0 };
                const actif = themes.includes(theme.cle);
                return (
                  <label
                    key={theme.cle}
                    className={`cursor-pointer rounded-xl border-2 px-2.5 py-2 text-left transition-colors ${chip(actif)}`}
                    title={theme.hint}
                  >
                    <input
                      type="checkbox"
                      checked={actif}
                      onChange={() => basculeTheme(theme.cle)}
                      className="sr-only"
                    />
                    <span className="block text-xs font-black text-k-ink">
                      <span aria-hidden>{theme.icon} </span>
                      {theme.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500">
                      {compte.notees} question{compte.notees > 1 ? "s" : ""}
                      {compte.avis > 0 ? ` · ${compte.avis} avis` : ""}
                    </span>
                  </label>
                );
              })}
            </div>
            {themes.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                className="mt-2"
                onClick={() => setThemes([])}
              >
                Tout décocher (mélange)
              </Button>
            )}
          </fieldset>

          {/* ── Natures ── */}
          <fieldset>
            <legend className="mb-1.5 text-sm font-bold text-k-ink">
              Ce qu&apos;on mélange
            </legend>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((genre) => {
                const actif = genres.includes(genre.cle);
                return (
                  <label
                    key={genre.cle}
                    className={`cursor-pointer rounded-xl border-2 px-3 py-2 transition-colors ${chip(actif)}`}
                    title={genre.hint}
                  >
                    <input
                      type="checkbox"
                      checked={actif}
                      onChange={() => basculeGenre(genre.cle)}
                      className="sr-only"
                    />
                    <span className="text-xs font-black text-k-ink">
                      <span aria-hidden>{genre.icon} </span>
                      {genre.label}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              {pourEvenement
                ? "Un sondage ne rapporte rien : il affiche la répartition en direct. Un pronostic, lui, compte — vous désignerez l'option gagnante au moment de révéler. Les deux restent minoritaires : au plus un cinquième de la soirée."
                : "Sondages et pronostics n'ont pas de bonne réponse : ils rapportent 0 point et ne sont jamais corrigés à l'écran. Ils restent minoritaires — au plus un cinquième du quiz."}
            </p>
          </fieldset>

          {/* ── Volume : un nombre, ou une durée ── */}
          <fieldset>
            <legend className="mb-1.5 text-sm font-bold text-k-ink">
              Longueur de la partie
            </legend>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setMode("nombre")}
                aria-pressed={mode === "nombre"}
                className={`rounded-xl border-2 px-3 py-1.5 text-xs font-black text-k-ink transition-colors ${chip(mode === "nombre")}`}
              >
                Par nombre de questions
              </button>
              <button
                type="button"
                onClick={() => setMode("duree")}
                aria-pressed={mode === "duree"}
                className={`rounded-xl border-2 px-3 py-1.5 text-xs font-black text-k-ink transition-colors ${chip(mode === "duree")}`}
              >
                Par durée
              </button>
            </div>

            {mode === "nombre" ? (
              <div>
                <Label htmlFor="generateur-nombre">Nombre de questions</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="generateur-nombre"
                    type="number"
                    min={1}
                    max={nombreMax}
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-24 text-center"
                  />
                  {NOMBRES_PROPOSES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNombre(String(n))}
                      className={`rounded-lg border-2 px-2.5 py-1 text-xs font-black text-k-ink transition-colors ${chip(Number(nombre) === n)}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <span className="mb-1.5 block text-sm font-bold text-k-ink">
                  Durée visée
                </span>
                <div className="flex flex-wrap gap-2">
                  {DUREES_PROPOSEES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMinutes(m)}
                      aria-pressed={minutes === m}
                      className={`rounded-xl border-2 px-3 py-1.5 text-xs font-black text-k-ink transition-colors ${chip(minutes === m)}`}
                    >
                      {m < 60 ? `${m} min` : "1 h"}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">
                  Le nombre de questions est déduit du temps de jeu estimé —
                  chronomètre, lecture de l&apos;énoncé et correction comprises.
                  C&apos;est une estimation : un joueur rapide finira avant.
                </p>
              </div>
            )}
          </fieldset>

          {/* ── Difficulté ── */}
          <div className="max-w-xs">
            <Label htmlFor="generateur-difficulte">Difficulté</Label>
            <select
              id="generateur-difficulte"
              value={difficulteMax}
              onChange={(e) =>
                setDifficulteMax(Number(e.target.value) as DifficulteBanque)
              }
              className="w-full rounded-lg border-2 border-k-ink/20 bg-white px-3 py-2 text-sm text-k-ink focus:border-k-ink focus:outline-none"
            >
              {DIFFICULTES.map((d) => (
                <option key={d.valeur} value={d.valeur}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* ── L'aperçu : ce qui sera écrit, à la question près ── */}
          <div className="rounded-xl border-2 border-k-ink bg-white p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-black text-k-ink">
                {total} question{total > 1 ? "s" : ""} ·{" "}
                {dureeLisible(tirage.dureeEstimeeSecondes)} de jeu estimées
                {points > 0 && ` · ${points} pt${points > 1 ? "s" : ""} au total`}
              </p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setGraine((g) => g + 1)}
              >
                🎲 Autre tirage
              </Button>
            </div>

            {tirage.manquantes > 0 && (
              <p className="mt-2 rounded-lg bg-k-yellow/40 px-2.5 py-1.5 text-xs font-semibold text-k-ink">
                La banque ne porte que {total} question
                {total > 1 ? "s" : ""} pour ces critères, sur les{" "}
                {tirage.demande} demandées. Cochez d&apos;autres thèmes,
                acceptez des questions plus difficiles, ou raccourcissez la
                partie.
              </p>
            )}

            {total === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">
                Aucune question ne correspond : élargissez les thèmes ou la
                difficulté.
              </p>
            ) : (
              <>
                <ol className="mt-2 space-y-1">
                  {tirage.questions.slice(0, 6).map((q, i) => {
                    const info = quizPresetInfo(presetDe(q));
                    return (
                      <li
                        key={q.id}
                        className="flex items-start gap-2 text-xs text-k-ink"
                      >
                        <span className="w-4 shrink-0 text-right font-black tabular-nums text-zinc-500">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span aria-hidden>{info.icon} </span>
                          {q.prompt}
                          <span className="ml-1 text-zinc-500">
                            (
                            {genreDe(q) !== "question"
                              ? info.label.toLowerCase()
                              : pourEvenement
                                ? // En direct, le barème se compte en centaines
                                  // de points ET dépend de la rapidité : afficher
                                  // « 1200 pts » ne dirait rien. La difficulté,
                                  // si.
                                  DIFFICULTE_LABEL[q.difficulte]
                                : `${pointsDe(q)} pt${pointsDe(q) > 1 ? "s" : ""}`}
                            )
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
                {total > 6 && (
                  <p className="mt-1 pl-6 text-xs text-zinc-500">
                    … et {total - 6} autre{total - 6 > 1 ? "s" : ""}.
                  </p>
                )}
              </>
            )}

            <p className="mt-2 text-[11px] text-zinc-500">
              {disponibles} question{disponibles > 1 ? "s" : ""} disponible
              {disponibles > 1 ? "s" : ""} avec ces critères. Les intitulés déjà
              présents ici ne sont jamais reproposés.
            </p>
          </div>

          <FieldError message={error ?? undefined} />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={ajouter}
              disabled={pending || total === 0}
            >
              {pending
                ? "Ajout en cours…"
                : `Ajouter ces ${total} question${total > 1 ? "s" : ""}`}
            </Button>
            <span className="text-xs text-zinc-500">
              Elles s&apos;ajoutent à la suite des questions existantes.
            </span>
          </div>

          <InfoBulle
            id="aide-quiz-generateur"
            resume="D'où viennent ces questions, et puis-je les modifier ?"
          >
            Elles viennent d&apos;une banque intégrée : chaque question porte son
            intitulé, ses propositions et sa bonne réponse. Une fois ajoutées,
            ce sont des questions comme les autres — vous pouvez les réécrire,
            les réordonner, en supprimer ou en ajouter à la main. Rien
            n&apos;est verrouillé, et rien ne change tout seul par la suite.
          </InfoBulle>
        </div>
      )}
    </div>
  );
}
