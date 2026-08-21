/**
 * SOCLE DE LOBBY (L16) — le vocabulaire et la LECTURE DÉFENSIVE des six RPC.
 *
 * ── CE FICHIER EST UN MIROIR, PAS UNE AUTORITÉ ──
 *
 * L'autorité est la migration `20261017120000_socle_lobby.sql` : ses `check`
 * refusent ce que ce fichier accepterait par erreur, et ses six RPC décident
 * seules de ce qui sort. Ce qui vit ici sert à donner une forme TYPÉE à des
 * documents `jsonb` que PostgREST rend en `Json`, et à ne jamais laisser un
 * document inattendu se propager jusqu'à un écran.
 *
 * ── POURQUOI DES MAPPEURS PLUTÔT QU'UN CAST ──
 *
 * `admin.rpc(...)` rend `Json` : un cast direct vers `LobbyStateView` serait une
 * PROMESSE, pas une vérification, et la première clé renommée en SQL se
 * manifesterait par un `undefined` au milieu d'un rendu. Le motif est celui de
 * `mapVitrinePublicState` — tout ce qui n'est pas reconnu retombe sur l'état
 * muet, jamais sur une valeur inventée.
 *
 * ── LE REFUS EST INDISTINCT, ET LES MAPPEURS LE PRÉSERVENT ──
 *
 * `join_player_lobby` rend le MÊME document pour un code inventé, expiré, clos
 * ou malformé. Aucun mappeur d'ici n'a le droit d'enrichir ce refus : un état
 * non reconnu devient `unavailable`, exactement comme un refus explicite.
 */

// ────────────────────────────────────────────────────────────
// Vocabulaire — miroir des `check` de la migration
// ────────────────────────────────────────────────────────────

/** Les deux formats de salle : « duo » est L17, « bande » est L18. */
export const LOBBY_KINDS = ["duo", "bande"] as const;
export type LobbyKind = (typeof LOBBY_KINDS)[number];

/**
 * Les quatre états d'une salle. `expired` n'est écrit par AUCUNE RPC : il est
 * CONSTATÉ à la lecture (ADR-111), et `lobby_state` est le seul à le rendre.
 */
export const LOBBY_STATUTS = ["lobby", "locked", "closed", "expired"] as const;
export type LobbyStatut = (typeof LOBBY_STATUTS)[number];

export const LOBBY_CAPACITE_MIN = 2;
export const LOBBY_CAPACITE_MAX = 12;
/** Un duo est FIGÉ à deux — `player_lobbies_duo_fige` le tient en base. */
export const LOBBY_DUO_CAPACITE = 2;

// ────────────────────────────────────────────────────────────
// Les vues — ce que l'écran reçoit
// ────────────────────────────────────────────────────────────

export interface LobbyMembreView {
  pseudo: string;
  /** Rang d'arrivée, 1 pour l'hôte — calculé en SQL, jamais ici. */
  rang: number;
  /** Le porteur du cookie de CE lobby est-il ce membre ? */
  estMoi: boolean;
}

export type LobbyStateView =
  | { state: "unavailable" }
  | {
      state: "ok";
      status: LobbyStatut;
      kind: LobbyKind;
      capacite: number;
      expiresAt: string;
      /**
       * `null` pour tout le monde SAUF l'hôte. La clé est toujours présente —
       * un document de forme stable se type une fois, là où une clé qui
       * apparaît et disparaît se teste à chaque lecture.
       */
      joinCode: string | null;
      /** Ordonnés par rang, l'hôte en tête. Jamais `undefined`. */
      membres: LobbyMembreView[];
    };

export type CreateLobbyResult =
  | { state: "created"; lobbyId: string; joinCode: string; expiresAt: string }
  /** Vingt salles actives dans ce commerce — garde 2 d'ADR-109 §A4. */
  | { state: "quota" }
  | { state: "unavailable" };

export type JoinLobbyResult =
  | {
      state: "joined";
      lobbyId: string;
      kind: LobbyKind;
      capacite: number;
      rang: number;
    }
  | { state: "full" }
  | { state: "locked" }
  | { state: "unavailable" };

export type LockLobbyResult =
  | { state: "locked"; expiresAt: string }
  | { state: "unavailable" };

/**
 * `leave_player_lobby` ne connaît que deux issues, et `left` est de très loin
 * la plus large : lobby inconnu, jeton non membre, salle déjà close — tout cela
 * rend `left`. Sortir de quelque part où l'on n'est pas EST une sortie, et le
 * dire autrement aurait fabriqué un oracle sur l'existence des salles.
 */
export type LeaveLobbyResult = { state: "left" } | { state: "locked" };

// ────────────────────────────────────────────────────────────
// Lecture défensive du jsonb (motif src/lib/vitrine.ts)
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

function asKind(value: unknown): LobbyKind | null {
  const mot = asString(value);
  return mot && (LOBBY_KINDS as readonly string[]).includes(mot)
    ? (mot as LobbyKind)
    : null;
}

function asStatut(value: unknown): LobbyStatut | null {
  const mot = asString(value);
  return mot && (LOBBY_STATUTS as readonly string[]).includes(mot)
    ? (mot as LobbyStatut)
    : null;
}

/**
 * Capacité RELUE, jamais devinée. Hors bornes = document illisible : la base ne
 * peut pas produire un 13, donc en lire un signifie qu'on ne lit pas ce qu'on
 * croit — et un écran qui dessine treize places sur une salle de douze est pire
 * qu'un écran qui dit « indisponible ».
 */
function asCapacite(value: unknown): number | null {
  const n = asInt(value);
  if (n === null) return null;
  return n >= LOBBY_CAPACITE_MIN && n <= LOBBY_CAPACITE_MAX ? n : null;
}

// ────────────────────────────────────────────────────────────
// Les cinq mappeurs
// ────────────────────────────────────────────────────────────

/** Lecture de `create_player_lobby`. */
export function mapCreateLobby(raw: unknown): CreateLobbyResult {
  const root = asRecord(raw);
  if (!root) return INDISPONIBLE;
  const state = asString(root.state);
  if (state === "quota") return { state: "quota" };
  if (state !== "created") return INDISPONIBLE;

  const lobbyId = asString(root.lobby_id);
  const joinCode = asString(root.join_code);
  const expiresAt = asString(root.expires_at);
  // Un « created » amputé de son identifiant ou de son code n'est pas une
  // création utilisable : l'écran n'aurait ni salle à ouvrir ni code à montrer.
  if (!lobbyId || !joinCode || !expiresAt) return INDISPONIBLE;

  return { state: "created", lobbyId, joinCode, expiresAt };
}

/** Lecture de `join_player_lobby`. */
export function mapJoinLobby(raw: unknown): JoinLobbyResult {
  const root = asRecord(raw);
  if (!root) return INDISPONIBLE;
  const state = asString(root.state);
  if (state === "full") return { state: "full" };
  if (state === "locked") return { state: "locked" };
  if (state !== "joined") return INDISPONIBLE;

  const lobbyId = asString(root.lobby_id);
  const kind = asKind(root.kind);
  const capacite = asCapacite(root.capacite);
  const rang = asInt(root.rang);
  if (!lobbyId || !kind || capacite === null || rang === null) return INDISPONIBLE;

  return { state: "joined", lobbyId, kind, capacite, rang };
}

/**
 * Lecture de `lobby_state` — la seule lecture que l'écran rappelle en boucle.
 *
 * `membres` est TOUJOURS un tableau, éventuellement vide : un lobby sans membre
 * lisible n'existe pas (l'hôte est membre de son propre lobby, invariant de
 * `create_player_lobby`), mais un document tronqué ne doit pas faire tomber un
 * écran qui itère dessus toutes les trois secondes.
 */
export function mapLobbyState(raw: unknown): LobbyStateView {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return INDISPONIBLE;

  const status = asStatut(root.status);
  const kind = asKind(root.kind);
  const capacite = asCapacite(root.capacite);
  const expiresAt = asString(root.expires_at);
  if (!status || !kind || capacite === null || !expiresAt) return INDISPONIBLE;

  return {
    state: "ok",
    status,
    kind,
    capacite,
    expiresAt,
    joinCode: asString(root.join_code),
    membres: mapLobbyMembres(root.membres),
  };
}

/**
 * Les membres, dans l'ordre rendu par le SQL — RE-TRIÉS par rang malgré tout.
 *
 * Le `jsonb_agg` porte déjà son `order by`, donc ce tri ne corrige rien
 * aujourd'hui. Il existe parce que l'ordre est ce que l'écran AFFICHE : une
 * agrégation dont l'ordonnancement se perdrait un jour rendrait des places
 * mélangées à chaque sondage, c'est-à-dire une liste qui saute sous les yeux
 * des joueurs sans qu'aucune erreur ne soit remontée nulle part.
 */
export function mapLobbyMembres(raw: unknown): LobbyMembreView[] {
  const sortie: LobbyMembreView[] = [];
  for (const brut of asArray(raw)) {
    const root = asRecord(brut);
    if (!root) continue;
    const pseudo = asString(root.pseudo);
    const rang = asInt(root.rang);
    if (!pseudo || rang === null) continue;
    sortie.push({ pseudo, rang, estMoi: root.est_moi === true });
  }
  return sortie.sort((a, b) => a.rang - b.rang);
}

/** Lecture de `lock_player_lobby`. */
export function mapLockLobby(raw: unknown): LockLobbyResult {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "locked") return INDISPONIBLE;
  const expiresAt = asString(root.expires_at);
  // La prolongation à quatre heures EST le contenu de cette réponse : un
  // « locked » sans date ne dit pas jusqu'à quand la salle vit, et l'écran
  // afficherait un compte à rebours vide.
  if (!expiresAt) return INDISPONIBLE;
  return { state: "locked", expiresAt };
}

/**
 * Lecture de `leave_player_lobby`.
 *
 * LE DÉFAUT EST `left`, ET C'EST L'INVERSE DES QUATRE AUTRES MAPPEURS. Un
 * document illisible sur ce chemin ne peut pas retomber sur « indisponible » :
 * cet état n'existe pas dans le contrat, et le fabriquer laisserait un joueur
 * bloqué dans une salle qu'il vient de quitter. Seul un `locked` EXPLICITE —
 * l'hôte a déjà fermé la porte, on ne sort plus — fait exception.
 */
export function mapLeaveLobby(raw: unknown): LeaveLobbyResult {
  const root = asRecord(raw);
  return root && asString(root.state) === "locked"
    ? { state: "locked" }
    : { state: "left" };
}
