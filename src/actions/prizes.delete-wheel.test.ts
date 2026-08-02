import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// deleteWheel — LA ROUE SUPPRIMÉE EMPORTAIT LES CODES GAIN- NON RETIRÉS
//
// `participations.wheel_id` porte `on delete cascade` (00001:100), et une
// SECONDE clé composite ajoutée plus tard cascade elle aussi (00017:285-289) :
// les deux, pas une seule. Retirer une roue de la rotation d'une campagne —
// un RÉGLAGE, du point de vue du commerçant : « je retire la roue Happy
// hour » — emportait donc toutes ses participations, y compris celles dont le
// `redeem_code` est émis et le `redeemed_at` encore null. Le client se
// présentait au comptoir et la caisse répondait « code introuvable ».
//
// Le dépôt garde déjà exactement ce danger un cran au-dessus, sur
// `deleteCampaign`, avec un refus qui NOMME le chiffre. La roue, elle, ne
// portait qu'un `confirm()` navigateur qui ne nommait rien.
//
// PRINCIPE : on ne touche pas à la cascade — la retirer donnerait un 23503
// opaque au commerçant. On refuse tant qu'un lot attend, et le refus nomme le
// nombre.
// ────────────────────────────────────────────────────────────

const WHEEL_ID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";

const { state } = vi.hoisted(() => ({
  state: {
    /** Lots gagnés sur cette roue, encore non remis en caisse. */
    enAttente: 0,
    /** Nombre de roues de la campagne (la garde « dernière roue »). */
    nbRoues: 2,
    /** Les suppressions réellement parties en base. */
    deletes: [] as string[],
    /** Filtres posés sur le comptage — c'est là que se joue le multi-tenant. */
    filtresComptage: [] as Array<[string, unknown]>,
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
    role: "owner",
  })),
}));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/revalidate-play", () => ({ revalidatePlaySlugs: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      if (table === "participations") {
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
            // Le comptage se résout sur le DERNIER prédicat de la chaîne.
            return col === "cancelled_at"
              ? Promise.resolve({ count: state.enAttente, error: null })
              : c;
          },
        };
        return c;
      }
      // `wheels` sert trois fois : la lecture de la roue, le décompte des
      // roues de la campagne, puis la suppression. On distingue par la
      // méthode réellement appelée, pas par un compteur d'appels.
      const w: Record<string, unknown> = {
        estCompte: false,
        estSuppression: false,
        select: (_cols: string, opts?: { count?: string }) => {
          w.estCompte = Boolean(opts?.count);
          return w;
        },
        delete: () => {
          w.estSuppression = true;
          return w;
        },
        eq: (col: string, val: unknown) => {
          if (w.estSuppression) {
            if (col === "id") state.deletes.push(String(val));
            return col === "organization_id"
              ? Promise.resolve({ error: null })
              : w;
          }
          if (w.estCompte && col === "campaign_id") {
            return Promise.resolve({ count: state.nbRoues, error: null });
          }
          return w;
        },
        maybeSingle: async () => ({
          data: { id: WHEEL_ID, campaign_id: CAMPAIGN_ID },
        }),
      };
      return w;
    },
  })),
}));

const { deleteWheel } = await import("./prizes");
const { WHEEL_OUTSTANDING_LOSS_HINT } = await import("@/lib/validations/prizes");

function form(confirme: boolean) {
  const fd = new FormData();
  fd.set("id", WHEEL_ID);
  if (confirme) fd.set("confirm_outstanding", "1");
  return fd;
}

describe("deleteWheel — les lots gagnés sur cette roue", () => {
  beforeEach(() => {
    state.enAttente = 0;
    state.nbRoues = 2;
    state.deletes = [];
    state.filtresComptage = [];
  });

  it("refuse tant qu'un lot de cette roue attend en caisse", async () => {
    state.enAttente = 7;
    const res = await deleteWheel(null, form(false));

    expect(res.ok).toBe(false);
    // Le refus doit NOMMER le nombre : « des lots » ne permet pas d'arbitrer,
    // 7 si — c'est ce chiffre qui fait choisir entre le ménage et le client.
    expect(res.ok === false && res.error).toContain("7");
    // Et il doit porter le MARQUEUR partagé : c'est lui, et non `!ok`, qui
    // décide de montrer la case de confirmation. Sans lui, l'écran ne la
    // proposerait jamais et la suppression deviendrait impossible.
    expect(res.ok === false && res.error).toContain(WHEEL_OUTSTANDING_LOSS_HINT);
    // Et surtout : rien n'est parti en base.
    expect(state.deletes).toEqual([]);
  });

  it("supprime quand le commerçant confirme en connaissance de cause", async () => {
    state.enAttente = 7;
    const res = await deleteWheel(null, form(true));

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([WHEEL_ID]);
  });

  it("ne demande rien quand tous les lots ont déjà été retirés", async () => {
    // CONTRÔLE NÉGATIF DE LA GARDE : si elle se déclenchait sur le cas
    // nominal, elle transformerait un réglage banal en obstacle, et le
    // commerçant apprendrait à cocher la case sans la lire — ce qui la
    // rendrait inutile le jour où elle compte.
    const res = await deleteWheel(null, form(false));

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([WHEEL_ID]);
  });

  it("le refus « dernière roue » ne porte PAS le marqueur", async () => {
    // CONTRÔLE NÉGATIF DU MARQUEUR : sur ce refus-là, cocher une case ne
    // changerait rien — la campagne a toujours besoin d'une roue à servir.
    // S'il portait le marqueur, l'écran présenterait une confirmation
    // destructive inutile, exactement la pédagogie que le registre des gardes
    // cherche à éviter.
    state.nbRoues = 1;
    state.enAttente = 7;
    const res = await deleteWheel(null, form(false));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toContain(WHEEL_OUTSTANDING_LOSS_HINT);
    expect(state.deletes).toEqual([]);
  });

  it("compte les lots de SA roue et de SON organisation, non remis, non annulés", async () => {
    state.enAttente = 1;
    await deleteWheel(null, form(false));

    // Un comptage non scopé sur l'organisation ferait refuser la suppression à
    // cause des lots d'un AUTRE commerçant — et divulguerait au passage son
    // activité par le nombre affiché. `cancelled_at` compte aussi : un lot
    // annulé n'est plus un engagement, l'inclure gonflerait le chiffre et
    // ferait cocher une case pour rien.
    expect(state.filtresComptage).toEqual([
      ["wheel_id", WHEEL_ID],
      ["organization_id", "org-1"],
      ["redeem_code", null],
      ["redeemed_at", null],
      ["cancelled_at", null],
    ]);
  });
});
