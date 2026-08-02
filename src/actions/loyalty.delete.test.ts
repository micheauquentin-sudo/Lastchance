import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// deleteLoyaltyMilestone / deleteLoyaltyProgram — LE PALIER RETIRÉ DÉTRUISAIT
// DES CODES FIDELITE- DÉJÀ GAGNÉS
//
// `loyalty_rewards.(milestone_id, organization_id)` cascade depuis
// `loyalty_milestones` (20260725120000:221-222), et la chaîne complète
// `loyalty_programs → loyalty_milestones → loyalty_rewards` cascade elle aussi
// (:122-123). Retirer un palier devenu obsolète — le geste naturel du ménage —
// détruisait les codes déjà gagnés dessus : le client se présentait au
// comptoir avec son passeport et s'entendait répondre « code introuvable ».
//
// L'écran affichait bien un chiffre (« N code(s) déjà émis »), mais accroché
// au champ STOCK : il compte les codes ÉMIS, remis compris. Un palier
// entièrement soldé y affiche le même nombre qu'un palier dont personne n'est
// encore passé — donc il ne dit rien de ce que la suppression coûte.
// ────────────────────────────────────────────────────────────

const MILESTONE_ID = "77777777-7777-4777-8777-777777777777";
const PROGRAM_ID = "88888888-8888-4888-8888-888888888888";

const { state } = vi.hoisted(() => ({
  state: {
    /** Codes FIDELITE- encore non remis en caisse. */
    enAttente: 0,
    /** Nombre de paliers du programme (garde « un actif garde un palier »). */
    nbPaliers: 3,
    /** Statut du programme parent. */
    statutProgramme: "draft" as string,
    deletes: [] as string[],
    filtresComptage: [] as Array<[string, unknown]>,
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

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      if (table === "loyalty_rewards") {
        const c: Record<string, unknown> = {
          select: () => c,
          eq: (col: string, val: unknown) => {
            state.filtresComptage.push([col, val]);
            return c;
          },
          not: (col: string, _op: string, val: unknown) => {
            state.filtresComptage.push([col, val]);
            return c;
          },
          is: (col: string, val: unknown) => {
            state.filtresComptage.push([col, val]);
            return Promise.resolve({ count: state.enAttente, error: null });
          },
        };
        return c;
      }
      if (table === "loyalty_programs") {
        const p: Record<string, unknown> = {
          estSuppression: false,
          select: () => p,
          delete: () => {
            p.estSuppression = true;
            return p;
          },
          eq: (col: string, val: unknown) => {
            if (p.estSuppression) {
              if (col === "id") state.deletes.push(String(val));
              return col === "organization_id"
                ? Promise.resolve({ error: null })
                : p;
            }
            return p;
          },
          maybeSingle: async () => ({
            data: { status: state.statutProgramme },
          }),
        };
        return p;
      }
      // `loyalty_milestones` sert trois fois : lecture du palier, décompte des
      // paliers du programme, puis suppression. On distingue par la méthode
      // réellement appelée, jamais par un compteur d'appels.
      const m: Record<string, unknown> = {
        estCompte: false,
        estSuppression: false,
        select: (_cols: string, opts?: { count?: string }) => {
          m.estCompte = Boolean(opts?.count);
          return m;
        },
        delete: () => {
          m.estSuppression = true;
          return m;
        },
        eq: (col: string, val: unknown) => {
          if (m.estSuppression) {
            if (col === "id") state.deletes.push(String(val));
            return col === "organization_id"
              ? Promise.resolve({ error: null })
              : m;
          }
          if (m.estCompte && col === "organization_id") {
            return Promise.resolve({ count: state.nbPaliers, error: null });
          }
          return m;
        },
        maybeSingle: async () => ({ data: { program_id: PROGRAM_ID } }),
      };
      return m;
    },
  })),
}));

const { deleteLoyaltyMilestone, deleteLoyaltyProgram } = await import(
  "./loyalty"
);
const { LOYALTY_MILESTONE_LOSS_HINT, LOYALTY_PROGRAM_LOSS_HINT } = await import(
  "@/lib/validations/loyalty"
);

function formPalier(confirme: boolean) {
  const fd = new FormData();
  fd.set("id", MILESTONE_ID);
  if (confirme) fd.set("confirm_outstanding", "1");
  return fd;
}

function formProgramme(confirme: boolean) {
  const fd = new FormData();
  fd.set("id", PROGRAM_ID);
  if (confirme) fd.set("confirm_program_outstanding", "1");
  return fd;
}

beforeEach(() => {
  state.enAttente = 0;
  state.nbPaliers = 3;
  state.statutProgramme = "draft";
  state.deletes = [];
  state.filtresComptage = [];
  state.role = "owner";
});

describe("deleteLoyaltyMilestone — les codes FIDELITE- du palier", () => {
  it("refuse tant qu'un code FIDELITE- de ce palier attend en caisse", async () => {
    state.enAttente = 4;
    const res = await deleteLoyaltyMilestone(null, formPalier(false));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("4");
    expect(res.ok === false && res.error).toContain(LOYALTY_MILESTONE_LOSS_HINT);
    expect(state.deletes).toEqual([]);
  });

  it("supprime quand le commerçant confirme en connaissance de cause", async () => {
    state.enAttente = 4;
    const res = await deleteLoyaltyMilestone(null, formPalier(true));

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([MILESTONE_ID]);
  });

  it("ne demande rien quand tous les codes ont déjà été retirés", async () => {
    // CONTRÔLE NÉGATIF DE LA GARDE : invisible sur le cas nominal.
    const res = await deleteLoyaltyMilestone(null, formPalier(false));

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([MILESTONE_ID]);
  });

  it("le refus « dernier palier d'un programme actif » ne porte PAS le marqueur", async () => {
    // CONTRÔLE NÉGATIF DU MARQUEUR : sur ce refus-là, cocher une case ne
    // changerait rien. Lui présenter une confirmation destructive
    // apprendrait à cocher sans lire, ce que le registre des gardes existe
    // précisément pour empêcher.
    state.statutProgramme = "active";
    state.nbPaliers = 1;
    state.enAttente = 4;
    const res = await deleteLoyaltyMilestone(null, formPalier(false));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toContain(LOYALTY_MILESTONE_LOSS_HINT);
    expect(state.deletes).toEqual([]);
  });

  it("compte les codes de CE palier et de SON organisation, non remis", async () => {
    state.enAttente = 1;
    await deleteLoyaltyMilestone(null, formPalier(false));

    // `code not null` plutôt que `reward_type = 'lot'` : le CHECK de la table
    // les rend équivalents, mais c'est le CODE qui est l'engagement en caisse
    // — un tour offert non consommé ne se présente pas au comptoir.
    expect(state.filtresComptage).toEqual([
      ["milestone_id", MILESTONE_ID],
      ["organization_id", "org-1"],
      ["code", null],
      ["redeemed_at", null],
    ]);
  });
});

describe("deleteLoyaltyProgram — les codes FIDELITE- du programme entier", () => {
  it("refuse tant qu'un code FIDELITE- attend en caisse", async () => {
    state.enAttente = 9;
    const res = await deleteLoyaltyProgram(null, formProgramme(false));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("9");
    expect(res.ok === false && res.error).toContain(LOYALTY_PROGRAM_LOSS_HINT);
    expect(state.deletes).toEqual([]);
  });

  it("supprime quand le commerçant confirme en connaissance de cause", async () => {
    state.enAttente = 9;
    await expect(
      deleteLoyaltyProgram(null, formProgramme(true)),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(state.deletes).toEqual([PROGRAM_ID]);
  });

  it("la case du PALIER ne débloque pas la suppression du PROGRAMME", async () => {
    // Les deux cases vivent dans le même écran. Si elles partageaient leur
    // nom de champ, cocher « je supprime ce palier » emporterait le programme
    // entier — un périmètre sans commune mesure avec ce qui a été lu.
    state.enAttente = 9;
    const fd = new FormData();
    fd.set("id", PROGRAM_ID);
    fd.set("confirm_outstanding", "1");
    const res = await deleteLoyaltyProgram(null, fd);

    expect(res.ok).toBe(false);
    expect(state.deletes).toEqual([]);
  });

  it("le refus de RÔLE ne porte pas le marqueur et ne compte rien", async () => {
    state.role = "cashier";
    state.enAttente = 9;
    const res = await deleteLoyaltyProgram(null, formProgramme(false));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toContain(LOYALTY_PROGRAM_LOSS_HINT);
    expect(state.filtresComptage).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("compte les codes de CE programme et de SON organisation, non remis", async () => {
    state.enAttente = 1;
    await deleteLoyaltyProgram(null, formProgramme(false));

    expect(state.filtresComptage).toEqual([
      ["program_id", PROGRAM_ID],
      ["organization_id", "org-1"],
      ["code", null],
      ["redeemed_at", null],
    ]);
  });
});
