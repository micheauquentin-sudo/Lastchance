import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// chargerEtatLive — LE CACHE D'UNE SECONDE ET LA FUSION EN UN VOYAGE
//
// Ce que ce fichier mesure, et lui seul :
//   · deux lectures de la MÊME session dans la seconde ne font qu'UN appel à
//     `event_etat_partage` — c'est tout l'objet du cache : cinquante
//     téléphones qui sondent la même soirée faisaient recalculer cinquante
//     fois un classement identique ;
//   · deux sessions DIFFÉRENTES ne se marchent pas dessus (une clé par
//     session, pas un unique dernier état) ;
//   · passé le TTL, on retourne réellement en base — un cache qui ne périme
//     pas fige la soirée ;
//   · la part PROPRE au joueur n'est jamais cachée, et n'est même pas demandée
//     sans cookie ;
//   · `{"state":"unavailable"}` de la RPC produit exactement l'issue
//     d'indisponibilité de l'ancien échec de contexte ;
//   · `server_now` traverse jusqu'à `serverNow`.
//
// Les gardes elles-mêmes (draft/archivée/module fermé) sont descendues en base
// et prouvées par pgTAP : ici on prouve qu'on TRAITE leur verdict, pas qu'on le
// rejoue.
// ────────────────────────────────────────────────────────────

const SERVER_NOW = "2026-08-17T20:30:00.000Z";

const { etat } = vi.hoisted(() => ({
  etat: {
    appels: [] as Array<{ nom: string; args: Record<string, unknown> }>,
    /** Réponse de `event_etat_partage` (jsonb). */
    partage: null as unknown,
    /** Message d'erreur de `event_etat_partage`, ou null. */
    erreurPartage: null as string | null,
    /** Réponse de `event_etat_joueur` (jsonb). */
    joueur: { you: null } as unknown,
    erreurJoueur: null as string | null,
  },
}));

vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: (nom: string, args: Record<string, unknown>) => {
      etat.appels.push({ nom, args });
      if (nom === "event_etat_partage") {
        return Promise.resolve(
          etat.erreurPartage
            ? { data: null, error: { message: etat.erreurPartage } }
            : { data: etat.partage, error: null },
        );
      }
      return Promise.resolve(
        etat.erreurJoueur
          ? { data: null, error: { message: etat.erreurJoueur } }
          : { data: etat.joueur, error: null },
      );
    },
  })),
}));

const { chargerEtatLive } = await import("./event-etat");

/** Part partagée nominale, forme exacte d'`event_etat_partage`. */
function partagePlein(sessionId: string, revision = 3): Record<string, unknown> {
  return {
    state: "ok",
    session: {
      id: sessionId,
      state_revision: revision,
      status: "live",
      phase: "question_active",
      join_code: "ABCD12",
      reward_label: "Un café",
      reward_stock: 3,
      reward_claimed_count: 0,
      max_participants: 100,
    },
    question: null,
    correct_option_id: null,
    distribution: null,
    leaderboard: [],
    server_now: SERVER_NOW,
  };
}

function partages(): number {
  return etat.appels.filter((a) => a.nom === "event_etat_partage").length;
}

function joueurs(): number {
  return etat.appels.filter((a) => a.nom === "event_etat_joueur").length;
}

/**
 * Le cache vit en mémoire de module et SURVIT d'un test à l'autre : chaque cas
 * prend donc son propre identifiant de session. C'est aussi ce que fait la
 * production — une clé par session, jamais un dernier état global.
 */
let compteur = 0;
function nouvelleSession(): string {
  compteur += 1;
  return `00000000-0000-4000-8000-${String(compteur).padStart(12, "0")}`;
}

beforeEach(() => {
  vi.useFakeTimers();
  etat.appels = [];
  etat.partage = null;
  etat.erreurPartage = null;
  etat.joueur = { you: null };
  etat.erreurJoueur = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("chargerEtatLive — cache d'une seconde de la part partagée", () => {
  it("deux lectures dans la seconde ne font qu'UN appel à event_etat_partage", async () => {
    const sessionId = nouvelleSession();
    etat.partage = partagePlein(sessionId);

    const premier = await chargerEtatLive(sessionId);
    vi.advanceTimersByTime(900);
    const second = await chargerEtatLive(sessionId);

    // L'ASSERTION QUI PORTE TOUT LE CORRECTIF.
    expect(partages()).toBe(1);
    expect(premier.state).toBe("ok");
    expect(second.state).toBe("ok");
    expect(second.session?.revision).toBe(3);
  });

  it("deux sessions distinctes ont deux caches distincts", async () => {
    const a = nouvelleSession();
    const b = nouvelleSession();

    etat.partage = partagePlein(a, 1);
    const etatA = await chargerEtatLive(a);
    etat.partage = partagePlein(b, 7);
    const etatB = await chargerEtatLive(b);

    expect(partages()).toBe(2);
    // Contrôle de non-vacuité : un cache à clé unique rendrait la MÊME
    // révision aux deux soirées, ce qui est exactement la panne à éviter.
    expect(etatA.session?.revision).toBe(1);
    expect(etatB.session?.revision).toBe(7);
    expect(etatA.session?.id).toBe(a);
    expect(etatB.session?.id).toBe(b);
  });

  it("passé le TTL, la base est réellement relue", async () => {
    const sessionId = nouvelleSession();
    etat.partage = partagePlein(sessionId, 1);

    await chargerEtatLive(sessionId);
    vi.advanceTimersByTime(1_001);
    etat.partage = partagePlein(sessionId, 2);
    const apres = await chargerEtatLive(sessionId);

    expect(partages()).toBe(2);
    // Un cache qui ne périme pas fige la soirée : la transition doit passer.
    expect(apres.session?.revision).toBe(2);
  });

  it("ne met JAMAIS un échec de lecture en cache", async () => {
    const sessionId = nouvelleSession();
    etat.erreurPartage = "could not serialize access";

    const enPanne = await chargerEtatLive(sessionId);
    expect(enPanne.state).toBe("unavailable");

    // Même instant : sans cette exclusion, une seconde de base indisponible se
    // prolongerait en une seconde de refus fabriqué par nous.
    etat.erreurPartage = null;
    etat.partage = partagePlein(sessionId);
    const retabli = await chargerEtatLive(sessionId);

    expect(partages()).toBe(2);
    expect(retabli.state).toBe("ok");
  });
});

describe("chargerEtatLive — part propre au joueur", () => {
  it("sans cookie, event_etat_joueur n'est même pas appelée", async () => {
    const sessionId = nouvelleSession();
    etat.partage = partagePlein(sessionId);

    const res = await chargerEtatLive(sessionId);

    expect(joueurs()).toBe(0);
    expect(res.you).toBeNull();
  });

  it("avec cookie, le bloc « moi » est fusionné — et jamais caché", async () => {
    const sessionId = nouvelleSession();
    const hash = "a".repeat(64);
    etat.partage = partagePlein(sessionId);
    etat.joueur = {
      you: { pseudo: "Zoé", avatar: "🦊", score: 12, rank: 2, win: null },
    };

    const premier = await chargerEtatLive(sessionId, hash);
    const second = await chargerEtatLive(sessionId, hash);

    expect(premier.you).toEqual({ score: 12, rank: 2, win: null });
    expect(second.you).toEqual({ score: 12, rank: 2, win: null });
    // La part PARTAGÉE est cachée, la part du joueur ne l'est PAS : son score
    // et son rang changent à chaque dévoilement.
    expect(partages()).toBe(1);
    expect(joueurs()).toBe(2);
    expect(etat.appels.at(-1)?.args).toEqual({
      p_session_id: sessionId,
      p_player_token_hash: hash,
    });
  });

  it("une panne du bloc « moi » n'efface pas la soirée projetée en salle", async () => {
    const sessionId = nouvelleSession();
    etat.partage = partagePlein(sessionId);
    etat.erreurJoueur = "timeout";

    const res = await chargerEtatLive(sessionId, "b".repeat(64));

    expect(res.state).toBe("ok");
    expect(res.you).toBeNull();
  });
});

describe("chargerEtatLive — verdicts de la garde descendue en base", () => {
  it("`unavailable` rend l'issue d'indisponibilité, sans demander le bloc joueur", async () => {
    const sessionId = nouvelleSession();
    // Session inexistante, brouillon, archivée, ou module fermé : la RPC ne
    // les distingue pas, et cette fonction non plus.
    etat.partage = { state: "unavailable" };

    const res = await chargerEtatLive(sessionId, "c".repeat(64));

    expect(res.state).toBe("unavailable");
    expect(res.session).toBeNull();
    expect(res.leaderboard).toEqual([]);
    expect(res.serverNow).toBeNull();
    // Rien à servir : aller chercher le rang d'un joueur serait une lecture
    // payée pour une réponse qu'on jette.
    expect(joueurs()).toBe(0);
  });
});

describe("chargerEtatLive — l'horloge serveur voyage avec l'état (JOU-4)", () => {
  it("propage server_now jusqu'à serverNow", async () => {
    const sessionId = nouvelleSession();
    etat.partage = partagePlein(sessionId);

    const res = await chargerEtatLive(sessionId);

    // Sans elle, le client compare un instant SERVEUR à SA propre horloge : une
    // tablette de bar en retard affiche un chrono déjà fini sur une question
    // encore ouverte.
    expect(res.serverNow).toBe(SERVER_NOW);
  });

  it("survit à la fusion avec le bloc joueur", async () => {
    const sessionId = nouvelleSession();
    etat.partage = partagePlein(sessionId);
    etat.joueur = { you: null };

    const res = await chargerEtatLive(sessionId, "d".repeat(64));

    expect(res.serverNow).toBe(SERVER_NOW);
  });
});
