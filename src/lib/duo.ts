/**
 * DUO MIROIR (L17) — le vocabulaire et la LECTURE DÉFENSIVE des six RPC.
 *
 * ── CE FICHIER EST UN MIROIR, PAS UNE AUTORITÉ ──
 *
 * L'autorité est la migration `20261018120000_duo_miroir.sql` : ses `check`
 * refusent ce que ce fichier accepterait par erreur, et ses RPC décident seules
 * de ce qui sort. Ce qui vit ici sert à donner une forme TYPÉE à des documents
 * `jsonb` que PostgREST rend en `Json`, et à ne jamais laisser un document
 * inattendu se propager jusqu'à un écran. Motif exact de `src/lib/lobby.ts`.
 *
 * ── LES NOMS : DEUX CONVENTIONS, ET LA COUTURE EST ICI ──
 *
 * L'ENVELOPPE est en camelCase, motif `lobby.ts` (`roundId`, `monChoix`,
 * `autreAChoisi`). La FICHE, elle, garde les noms de la base — `nom`,
 * `description`, `prix_affiche`, `photo_path` — motif `VitrineFicheView`, qui
 * porte déjà quatre de ces six clés et que `components/vitrine/fiche-vitrine`
 * consomme telles quelles. Renommer deux champs sur six aurait été le plus
 * mauvais des deux mondes : une fiche à moitié traduite, qu'il faudrait
 * détraduire pour la rendre à un composant existant.
 *
 * ── LA GARDE ANTI-TRICHE EST EN SQL, ET ELLE EST REDOUBLÉE ICI ──
 *
 * `duo_state` ne CALCULE `autre_choix`, `suggestion` et `accord` que dans la
 * branche `revelee` : tant que la manche est ouverte, le choix de l'autre n'est
 * pas dans le document. C'est la vraie garde, et elle suffit. `mapDuoState` la
 * redouble quand même — voir son en-tête : l'écran ne doit dépendre que d'une
 * seule promesse, et celle-ci est vérifiable ici.
 */

// ────────────────────────────────────────────────────────────
// Vocabulaire — miroir des `check` de la migration
// ────────────────────────────────────────────────────────────

/** Les deux états d'une manche. Liste FERMÉE, miroir du `check (status in …)`. */
export const DUO_ROUND_STATUTS = ["ouverte", "revelee"] as const;
export type DuoRoundStatut = (typeof DUO_ROUND_STATUTS)[number];

/**
 * LE PLANCHER DE LA BASE — deux, et c'est un minimum ARITHMÉTIQUE : avec une
 * seule fiche, l'accord serait certain et le choix nul. `set_duo_options` et
 * `duo_start` le tiennent tous les deux.
 *
 * IL N'EST PAS LE PLANCHER DE L'ÉCRAN, qui est à trois — voir
 * `src/lib/validations/duo.ts`, où l'écart est expliqué.
 */
export const DUO_OPTIONS_MIN_BASE = 2;

/** Le plafond, commun à l'écran et à la base : `check` de `set_duo_options`. */
export const DUO_OPTIONS_MAX = 6;

// ────────────────────────────────────────────────────────────
// Les vues — ce que l'écran reçoit
// ────────────────────────────────────────────────────────────

/**
 * UNE FICHE DU PLATEAU. Six clés, rendues par `duo_options_json`.
 *
 * `ordre` est la position que le commerçant a composée — la position dans le
 * tableau qu'il a posté, écrite par `set_duo_options`. Elle est rendue à
 * l'écran parce que c'est elle, et non l'ordre d'arrivée du JSON, qui fait foi.
 */
export interface DuoOptionView {
  item_id: string;
  nom: string;
  description: string | null;
  prix_affiche: string | null;
  photo_path: string | null;
  ordre: number;
}

/**
 * UN CHOIX — deux clés, et pas une de plus.
 *
 * Ce que cette vue N'A PAS est le sujet du lot : ni prix, ni photo, ni
 * description. `duo_state` ne rend que l'identifiant et le nom d'un choix, et ce
 * type refuse de donner une place où atterrir à quoi que ce soit d'autre.
 */
export interface DuoChoixView {
  item_id: string;
  nom: string;
}

/** LA PROPOSITION DE LA MAISON — quatre clés, sans `photo_path` ni `ordre`. */
export interface DuoSuggestionView {
  item_id: string;
  nom: string;
  description: string | null;
  prix_affiche: string | null;
}

/**
 * `duo_start` — ouvrir, ou retrouver, la manche.
 *
 * `non_configure` se distingue d'`unavailable` parce qu'il appelle un geste
 * différent, et chez quelqu'un d'autre : le commerçant n'a pas composé son
 * plateau. Les confondre enverrait les joueurs chercher une panne là où il n'y
 * a qu'une case à cocher — et ce n'est pas un refus de sécurité, il faut déjà
 * être membre d'une salle verrouillée pour le lire.
 */
export type DuoStartResult =
  | { state: "ok"; roundId: string; options: DuoOptionView[] }
  | { state: "non_configure" }
  | { state: "unavailable" };

/**
 * `duo_choose` — sceller son choix.
 *
 * ATTENTION AU MOT `scelle`, QUI DÉSIGNE DEUX CHOSES OPPOSÉES DANS LE CONTRAT
 * SQL : la clé `scelle: true` d'un `ok` dit « votre choix EST scellé » (succès),
 * tandis que l'état `{"state":"scelle"}` dit « vous aviez DÉJÀ scellé un autre
 * item » (refus, et rien n'a été écrit). Le second est renommé `deja-scelle`
 * dès la sortie de l'action (`ChooseDuoOutcome`), justement pour que ce piège
 * ne voyage pas jusqu'à l'écran.
 */
export type DuoChooseResult =
  | { state: "ok"; scelle: true; revelee: boolean }
  | { state: "scelle" }
  | { state: "unavailable" };

/**
 * `duo_state` — ce que voit un joueur. HUIT clés, toujours les mêmes.
 *
 * Les trois valeurs réservées valent `null` avant la révélation plutôt que de
 * disparaître (motif `lobby_state` / `join_code`) : un document de forme STABLE
 * se type une fois, là où une clé qui apparaît et disparaît se teste à chaque
 * lecture — et une clé qu'on oublie de tester est une clé qu'on affiche.
 */
export type DuoStateView =
  | { state: "unavailable" }
  | {
      state: "ok";
      status: DuoRoundStatut;
      /** Toujours lisible : c'est le mien. */
      monChoix: DuoChoixView | null;
      /** Ordonnées par `ordre`. Jamais `undefined`. */
      options: DuoOptionView[];
      /**
       * L'autre a-t-il scellé ? Un FAIT SUR L'EXISTENCE d'un choix, jamais sur
       * son contenu. Un compteur ou une empreinte auraient été des fuites
       * graduées sur un plateau de six fiches.
       */
      autreAChoisi: boolean;
      /** `null` TANT QUE LA MANCHE EST OUVERTE. Voir `mapDuoState`. */
      autreChoix: DuoChoixView | null;
      /** `null` TANT QUE LA MANCHE EST OUVERTE. */
      suggestion: DuoSuggestionView | null;
      /** `null` TANT QUE LA MANCHE EST OUVERTE, et `null` sur un seul choix. */
      accord: boolean | null;
    };

/**
 * `duo_options_state` — l'écran de configuration du commerçant.
 *
 * TOUJOURS UN DOCUMENT, JAMAIS UN REFUS : organisation inconnue et organisation
 * sans sélection rendent le même `{ options: [], suggestion: null }`. Il n'y a
 * rien à distinguer, et surtout rien à distinguer POUR QUI — l'appelant est le
 * serveur, qui connaît déjà l'organisation dont il tient l'écran.
 *
 * ELLE NE MONTRE AUCUNE PARTIE : ni manche, ni choix, ni accord. Le commerçant
 * configure son plateau, il ne regarde pas jouer ses clients par-dessus leur
 * épaule — et ce type ne prévoit aucune place pour cela.
 */
export interface DuoOptionsAdminView {
  options: DuoOptionView[];
  suggestion: DuoSuggestionView | null;
}

// ────────────────────────────────────────────────────────────
// Lecture défensive du jsonb (motif src/lib/lobby.ts)
// ────────────────────────────────────────────────────────────

const INDISPONIBLE = { state: "unavailable" } as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRoundStatut(value: unknown): DuoRoundStatut | null {
  const mot = asString(value);
  return mot && (DUO_ROUND_STATUTS as readonly string[]).includes(mot)
    ? (mot as DuoRoundStatut)
    : null;
}

// ────────────────────────────────────────────────────────────
// Les mappeurs
// ────────────────────────────────────────────────────────────

/**
 * LE PLATEAU — toujours un tableau, et la ligne illisible est SAUTÉE.
 *
 * Motif `mapLobbyMembres` : un document tronqué ne doit pas faire tomber un
 * écran qui itère dessus toutes les deux secondes, et une fiche sans
 * identifiant ni nom ne peut rien produire d'utile — ni un bouton à cliquer, ni
 * un choix à envoyer. La sauter est plus honnête que peindre une carte dont la
 * moitié dit `undefined`.
 *
 * RE-TRIÉ PAR `ordre` MALGRÉ TOUT. Le `jsonb_agg` porte déjà son `order by`,
 * donc ce tri ne corrige rien aujourd'hui. Il existe parce que l'ordre est ce
 * que les DEUX joueurs ont sous les yeux au même instant : une agrégation dont
 * l'ordonnancement se perdrait un jour ferait sauter les cartes sous leurs
 * doigts entre deux sondages — c'est-à-dire, sur cet écran-ci, faire cliquer
 * quelqu'un sur une fiche qui n'était plus là quand il a visé.
 */
export function mapDuoOptions(raw: unknown): DuoOptionView[] {
  const sortie: DuoOptionView[] = [];
  for (const brut of asArray(raw)) {
    const root = asRecord(brut);
    if (!root) continue;
    const item_id = asString(root.item_id);
    const nom = asString(root.nom);
    if (!item_id || !nom) continue;
    sortie.push({
      item_id,
      nom,
      description: asString(root.description),
      prix_affiche: asString(root.prix_affiche),
      photo_path: asString(root.photo_path),
      // Repli de `mapFiche` : un `ordre` illisible ne vaut pas de jeter la
      // fiche, il vaut de la mettre en tête. Le tri ci-dessous est stable, donc
      // les fiches saines gardent l'ordre du SQL entre elles.
      ordre: asInt(root.ordre) ?? 0,
    });
  }
  return sortie.sort((a, b) => a.ordre - b.ordre);
}

/** Un choix — `item_id` ET `nom`, ou rien. Une carte sans nom ne s'affiche pas. */
export function mapDuoChoix(raw: unknown): DuoChoixView | null {
  const root = asRecord(raw);
  if (!root) return null;
  const item_id = asString(root.item_id);
  const nom = asString(root.nom);
  return item_id && nom ? { item_id, nom } : null;
}

/** La proposition de la maison. Mêmes exigences : identifiant et nom. */
export function mapDuoSuggestion(raw: unknown): DuoSuggestionView | null {
  const root = asRecord(raw);
  if (!root) return null;
  const item_id = asString(root.item_id);
  const nom = asString(root.nom);
  if (!item_id || !nom) return null;
  return {
    item_id,
    nom,
    description: asString(root.description),
    prix_affiche: asString(root.prix_affiche),
  };
}

/**
 * Lecture de `duo_start`.
 *
 * ── UN « ok » SOUS DEUX OPTIONS EST RENDU `non_configure` ──
 *
 * Ce n'est pas une règle inventée ici, c'est la MÊME règle appliquée au second
 * endroit où elle s'observe. `duo_start` ne compte les fiches qu'à la CRÉATION
 * de la manche : une manche déjà ouverte est rendue telle quelle, sans
 * recompter (et c'est nécessaire — la révélation ferme la salle). Or une
 * cascade de suppression de fiche peut avoir vidé la sélection depuis. Le
 * document dit alors `ok` avec un plateau injouable, et l'écran peindrait un
 * jeu à un seul bouton. `non_configure` nomme exactement ce qui s'est produit,
 * là où `unavailable` enverrait chercher une panne.
 */
export function mapDuoStart(raw: unknown): DuoStartResult {
  const root = asRecord(raw);
  if (!root) return INDISPONIBLE;
  const state = asString(root.state);
  if (state === "non_configure") return { state: "non_configure" };
  if (state !== "ok") return INDISPONIBLE;

  const roundId = asString(root.round_id);
  // Un « ok » amputé de sa manche n'est pas une ouverture utilisable.
  if (!roundId) return INDISPONIBLE;

  const options = mapDuoOptions(root.options);
  if (options.length < DUO_OPTIONS_MIN_BASE) return { state: "non_configure" };

  return { state: "ok", roundId, options };
}

/**
 * Lecture de `duo_choose`.
 *
 * ── UN « ok » SANS SES DEUX BOOLÉENS EXACTS EST INDISPONIBLE ──
 *
 * Motif `mapKickLobby`, et pour la même raison : `revelee` est le CONTENU de
 * cette réponse, pas une mise en forme — c'est lui qui décide si l'écran bascule
 * sur le résultat ou reste en attente. Le deviner à `false` ferait attendre un
 * joueur devant une manche déjà révélée. Et `scelle` est exigé strictement
 * `true` parce que la RPC ne sait pas écrire autre chose : un `ok` qui dirait
 * `scelle: false` est un document qu'on ne comprend pas, et l'afficher comme un
 * succès affirmerait un sceau qui n'a peut-être pas été posé.
 */
export function mapDuoChoose(raw: unknown): DuoChooseResult {
  const root = asRecord(raw);
  if (!root) return INDISPONIBLE;
  const state = asString(root.state);
  if (state === "scelle") return { state: "scelle" };
  if (state !== "ok") return INDISPONIBLE;
  if (root.scelle !== true) return INDISPONIBLE;
  if (typeof root.revelee !== "boolean") return INDISPONIBLE;
  return { state: "ok", scelle: true, revelee: root.revelee };
}

/**
 * Lecture de `duo_state` — LE MAPPEUR QUI COMPTE.
 *
 * ── UN `autre_choix` NON NUL SUR UNE MANCHE OUVERTE EST UN DOCUMENT CORROMPU ──
 *
 * La RPC ne peut PAS produire cela : `autre_choix`, `suggestion` et `accord` ne
 * sont lus que dans la branche `revelee`, sous un `if`, et hors de cette branche
 * ils gardent leur `null` initial. En lire un ici signifie donc qu'on ne lit pas
 * ce qu'on croit — un `duo_state` réécrit, un cache qui rend un vieux document,
 * une RPC homonyme. Les trois sont FORCÉS à `null` tant que le statut n'est pas
 * `revelee`.
 *
 * C'est de la DÉFENSE EN PROFONDEUR, pas une garde qui remplace l'autre : la
 * vraie garde reste en SQL, parce qu'un document qui transite est un document
 * qu'on peut ouvrir, et qu'un `curl` verrait ce que ce mappeur écarterait. Ce
 * qu'on achète ici est plus modeste et bien réel : l'écran ne dépend plus que
 * d'UNE promesse — « si `status` vaut `ouverte`, `autreChoix` vaut `null` » —
 * et cette promesse-là est tenue par du code qu'on peut lire, pas par la
 * confiance dans un document reçu.
 *
 * Le contrat ne nomme que `autre_choix` ; `suggestion` et `accord` voyagent sur
 * la même garde parce qu'ils sont réservés par le MÊME `if` et pour le même
 * motif : `accord` sur un plateau de deux fiches trahit le choix de l'autre dès
 * qu'on connaît le sien, et la suggestion affichée pendant le choix surlignerait
 * une réponse sur le plateau.
 */
export function mapDuoState(raw: unknown): DuoStateView {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return INDISPONIBLE;

  const status = asRoundStatut(root.status);
  // Un statut hors vocabulaire n'est pas une manche qu'on sait peindre : ni
  // « choisissez », ni « voici le résultat ». Le refus est plus honnête.
  if (!status) return INDISPONIBLE;

  const revelee = status === "revelee";

  return {
    state: "ok",
    status,
    monChoix: mapDuoChoix(root.mon_choix),
    options: mapDuoOptions(root.options),
    // Booléen EXACT, motif `est_moi` : un « true » textuel vient d'un document
    // qu'on ne comprend pas. Le repli est `false`, c'est-à-dire « on attend
    // encore » — l'attente est le seul repli qui n'affirme rien.
    autreAChoisi: root.autre_a_choisi === true,
    autreChoix: revelee ? mapDuoChoix(root.autre_choix) : null,
    suggestion: revelee ? mapDuoSuggestion(root.suggestion) : null,
    accord: revelee && typeof root.accord === "boolean" ? root.accord : null,
  };
}

/**
 * Lecture de `duo_options_state` — TOUJOURS un document, jamais un refus.
 *
 * C'est l'inverse de tous les autres mappeurs de ce fichier, et c'est le contrat
 * de la RPC : elle ne refuse pas, elle rend un plateau éventuellement vide.
 * Fabriquer ici un `unavailable` qui n'existe pas en face aurait obligé l'écran
 * de configuration à distinguer « rien d'épinglé » de « lecture impossible » —
 * deux situations dans lesquelles il affiche exactement la même chose : une
 * sélection vide et une invitation à la composer.
 */
export function mapDuoOptionsAdmin(raw: unknown): DuoOptionsAdminView {
  const root = asRecord(raw);
  return {
    options: mapDuoOptions(root?.options),
    suggestion: mapDuoSuggestion(root?.suggestion),
  };
}

/**
 * Lecture de `set_duo_options` — le COMPTE écrit, ou `null` si illisible.
 *
 * Le compte est le contenu de la réponse : c'est ce que l'écran affiche
 * (« 4 fiches épinglées ») et ce que le journal a retenu du geste. Le deviner
 * ferait afficher un nombre qui n'a été écrit nulle part.
 */
export function mapDuoOptionsSaved(raw: unknown): number | null {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return null;
  const options = asInt(root.options);
  return options !== null && options >= 0 ? options : null;
}

/**
 * Lecture de `set_duo_suggestion` — la valeur POSÉE, ou `null` si illisible.
 *
 * `null` EST UNE VALEUR LÉGITIME ICI (le commerçant retire sa proposition), donc
 * il ne peut pas servir de signal d'échec : l'enveloppe distingue les deux. Sans
 * elle, un document illisible et un retrait réussi se seraient lus pareil, et
 * l'écran aurait annoncé « proposition retirée » d'une écriture dont il ne sait
 * rien.
 */
export function mapDuoSuggestionSaved(
  raw: unknown,
): { suggestion: string | null } | null {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return null;
  if (!("suggestion" in root)) return null;
  return { suggestion: asString(root.suggestion) };
}
