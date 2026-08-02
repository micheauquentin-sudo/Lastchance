import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// deleteHunt — LA CHASSE SUPPRIMÉE EMPORTAIT LES CODES CHASSE- NON RETIRÉS
//
// `hunt_players` cascade depuis `hunts`
// (20260724120000_treasure_hunts.sql:108-110) et `hunt_completions` cascade
// depuis `hunt_players` (:159-160). Le commerçant fait le ménage après
// l'opération d'été ; les gagnants qui avaient reçu leur code par e-mail se
// voient répondre « code introuvable » au comptoir.
//
// Le texte de confirmation de l'écran énumérait « cette chasse, ses étapes et
// toute la progression » : précisément tout ce que le commerçant accepte de
// perdre, et rien de ce qui lui coûte un client.
//
// Le même fichier portait DÉJÀ cette doctrine sur `deleteHuntStep`
// (`HUNT_STEP_LOSS_HINT`, avec ses deux chiffres) — le geste le plus
// destructeur des deux, lui, n'avait rien.
// ────────────────────────────────────────────────────────────

const HUNT_ID = "44444444-4444-4444-8444-444444444444";

const { state } = vi.hoisted(() => ({
  state: {
    /** Codes CHASSE- de cette chasse encore non remis en caisse. */
    enAttente: 0,
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
vi.mock("@/lib/resend", () => ({ sendHuntRewardEmail: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      if (table === "hunt_completions") {
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
      const s: Record<string, unknown> = {
        delete: () => s,
        eq: (col: string, val: unknown) => {
          if (col === "id") state.deletes.push(String(val));
          return col === "organization_id"
            ? Promise.resolve({ error: null })
            : s;
        },
      };
      return s;
    },
  })),
}));

const { deleteHunt } = await import("./hunts");
const { HUNT_DELETE_LOSS_HINT } = await import("@/lib/validations/hunts");

function form(confirme: boolean) {
  const fd = new FormData();
  fd.set("id", HUNT_ID);
  if (confirme) fd.set("confirm_outstanding", "1");
  return fd;
}

describe("deleteHunt — les codes CHASSE- non retirés", () => {
  beforeEach(() => {
    state.enAttente = 0;
    state.deletes = [];
    state.filtresComptage = [];
    state.role = "owner";
  });

  it("refuse tant qu'un code CHASSE- attend en caisse", async () => {
    state.enAttente = 12;
    const res = await deleteHunt(null, form(false));

    expect(res.ok).toBe(false);
    // Le refus NOMME le nombre : c'est lui qui fait arbitrer entre le ménage
    // et douze clients qu'on va refuser au comptoir.
    expect(res.ok === false && res.error).toContain("12");
    expect(res.ok === false && res.error).toContain(HUNT_DELETE_LOSS_HINT);
    expect(state.deletes).toEqual([]);
  });

  it("supprime quand le commerçant confirme en connaissance de cause", async () => {
    state.enAttente = 12;
    // Le succès EST un `redirect()` vers /dashboard/hunts : il sort par une
    // exception, jamais par un `ok: true`.
    await expect(deleteHunt(null, form(true))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.deletes).toEqual([HUNT_ID]);
  });

  it("ne demande rien quand tous les codes ont déjà été retirés", async () => {
    // CONTRÔLE NÉGATIF DE LA GARDE : sur le cas nominal elle doit être
    // invisible, sans quoi le commerçant apprend à cocher sans lire.
    await expect(deleteHunt(null, form(false))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.deletes).toEqual([HUNT_ID]);
  });

  it("le refus de RÔLE ne porte pas le marqueur et ne compte rien", async () => {
    // CONTRÔLE NÉGATIF DU MARQUEUR : un caissier reçoit un refus sur lequel
    // cocher une case ne changerait rien — et la garde de rôle doit passer
    // AVANT tout comptage, sinon elle divulgue une activité qu'il n'a pas le
    // droit de lire.
    state.role = "cashier";
    state.enAttente = 12;
    const res = await deleteHunt(null, form(false));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toContain(HUNT_DELETE_LOSS_HINT);
    expect(state.filtresComptage).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("compte les codes de SA chasse et de SON organisation, non remis", async () => {
    state.enAttente = 1;
    await deleteHunt(null, form(false));

    expect(state.filtresComptage).toEqual([
      ["hunt_id", HUNT_ID],
      ["organization_id", "org-1"],
      ["code", null],
      ["redeemed_at", null],
    ]);
  });
});
