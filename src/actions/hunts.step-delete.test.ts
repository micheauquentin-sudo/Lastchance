import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// deleteHuntStep — LE JOUEUR QUI AVAIT TOUT TAMPONNÉ SAUF CELLE-LÀ
//
// `hunt_scans.step_id` cascade (20260724120000:130-131), mais le dommage n'est
// pas celui qu'on croit : retirer une étape n'efface AUCUN tampon des autres.
// Un joueur qui avait tamponné les 4 étapes restantes se retrouve donc à 4
// tampons pour 4 étapes, SANS ligne `hunt_completions` — la complétion n'étant
// calculée que pendant un scan. Son écran calcule « terminé » dès le
// chargement et masque « Valider mon passage », le seul geste qui débloquerait
// le serveur : il reçoit une carte de victoire VIDE, sans code.
//
// DEUX GESTES, et il faut les deux :
//  1. refuser tant que le commerçant n'a pas confirmé, en NOMMANT le nombre de
//     joueurs en cours ;
//  2. après la suppression, solder ceux que le raccourcissement vient de
//     rendre complets (`settle_hunt_completions`). Sans ce second geste, le
//     refus informé ne ferait qu'ajouter un avertissement à un joueur perdu.
// ────────────────────────────────────────────────────────────

const STEP_ID = "00000000-0000-4000-8000-0000000000f1";
const HUNT_ID = "00000000-0000-4000-8000-0000000000f2";

const { state } = vi.hoisted(() => ({
  state: {
    /** Statut et nombre d'étapes de la chasse (garde préexistante). */
    status: "active" as string,
    nbEtapes: 5,
    /** Joueurs avec un tampon et pas encore de complétion. */
    enCours: 0,
    /** Appels RPC, dans l'ordre. */
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    /** Suppressions d'étapes réellement parties en base. */
    deletes: [] as string[],
    role: "owner" as string,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: vi.fn(async () => ({
    user: { id: "user-1" },
    organization: { id: "org-1" },
    role: state.role,
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/monitoring", () => ({
  monitored: <T,>(_n: string, fn: () => Promise<T>) => fn(),
  reportError: vi.fn(),
  reportSecurityEvent: vi.fn(),
}));
vi.mock("@/lib/resend", () => ({ sendHuntRewardEmail: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      if (name === "hunt_players_in_progress") {
        return Promise.resolve({ data: state.enCours, error: null });
      }
      return Promise.resolve({ data: 0, error: null });
    },
    from(table: string) {
      if (table === "hunt_steps") {
        let mode: "read" | "delete" | null = null;
        let compte = false;
        const chaine: Record<string, unknown> = {
          select: (_cols: string, opts?: { count?: string }) => {
            mode = "read";
            compte = Boolean(opts?.count);
            return chaine;
          },
          delete: () => {
            mode = "delete";
            return chaine;
          },
          eq: (col: string, val: unknown) => {
            if (mode === "delete" && col === "id") state.deletes.push(String(val));
            if (col === "organization_id") {
              if (mode === "delete") return Promise.resolve({ error: null });
              if (compte) {
                return Promise.resolve({ count: state.nbEtapes, error: null });
              }
            }
            return chaine;
          },
          maybeSingle: () =>
            Promise.resolve({ data: { hunt_id: HUNT_ID }, error: null }),
        };
        return chaine;
      }

      if (table === "hunts") {
        const chaine: Record<string, unknown> = {
          select: () => chaine,
          eq: () => chaine,
          maybeSingle: () =>
            Promise.resolve({ data: { status: state.status }, error: null }),
        };
        return chaine;
      }

      throw new Error(`table inattendue: ${table}`);
    },
  })),
}));

const { deleteHuntStep } = await import("./hunts");
const { HUNT_STEP_LOSS_HINT } = await import("@/lib/validations/hunts");

function form(confirme: boolean) {
  const fd = new FormData();
  fd.set("id", STEP_ID);
  if (confirme) fd.set("confirm_players", "1");
  return fd;
}

const noms = () => state.rpcCalls.map((c) => c.name);

describe("deleteHuntStep — les joueurs en cours", () => {
  beforeEach(() => {
    state.status = "active";
    state.nbEtapes = 5;
    state.enCours = 0;
    state.rpcCalls = [];
    state.deletes = [];
    state.role = "owner";
  });

  it("refuse tant qu'un joueur a une chasse ouverte, et NOMME le nombre", async () => {
    state.enCours = 3;

    const res = await deleteHuntStep(null, form(false));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    // « des joueurs » ne permet pas d'arbitrer, « 3 joueurs » si.
    expect(res.error).toContain("3");
    expect(res.error).toContain(HUNT_STEP_LOSS_HINT);
    // Rien n'est parti en base, et surtout aucun solde n'a été tenté.
    expect(state.deletes).toEqual([]);
    expect(noms()).toEqual(["hunt_players_in_progress"]);
  });

  it("supprime PUIS solde les joueurs devenus complets", async () => {
    state.enCours = 3;

    const res = await deleteHuntStep(null, form(true));

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([STEP_ID]);
    // L'ORDRE est le fond du correctif : solder avant la suppression ne
    // trouverait personne (le joueur est encore à 4 tampons pour 5 étapes).
    expect(noms()).toEqual([
      "hunt_players_in_progress",
      "settle_hunt_completions",
    ]);
    expect(state.rpcCalls[1].args).toEqual({ p_hunt_id: HUNT_ID });
  });

  it("ne demande rien quand personne ne joue, mais solde quand même", async () => {
    // CONTRÔLE NÉGATIF DE LA GARDE : préparer une chasse reste sans obstacle.
    // Le solde, lui, est inconditionnel : il coûte un aller-retour et ferme le
    // cas du joueur dont le dernier tampon date d'avant la lecture du compteur.
    state.enCours = 0;

    const res = await deleteHuntStep(null, form(false));

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([STEP_ID]);
    expect(noms()).toEqual([
      "hunt_players_in_progress",
      "settle_hunt_completions",
    ]);
  });

  it("la garde des 2 étapes minimales passe AVANT le comptage des joueurs", async () => {
    // Ce refus-là ne se coche pas : cocher une case ne rendrait pas une chasse
    // active jouable à une seule étape. Il doit donc tomber en premier, et
    // sans le marqueur qui fait apparaître la case.
    state.nbEtapes = 2;
    state.enCours = 9;

    const res = await deleteHuntStep(null, form(true));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toContain(HUNT_STEP_LOSS_HINT);
    expect(state.rpcCalls).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("laisse la garde de rôle passer avant tout", async () => {
    state.role = "cashier";
    state.enCours = 4;

    const res = await deleteHuntStep(null, form(true));

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toEqual([]);
    expect(state.deletes).toEqual([]);
  });
});
