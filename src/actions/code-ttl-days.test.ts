import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// code_ttl_days — LE CHAMP ABSENT NE DOIT RIEN EFFACER
//
// Les sept expériences (chasse, fidélité, jackpot, soirée, calendrier,
// parrainage, quiz) portent depuis la migration 20260904120000 une échéance
// de code de retrait en jours, `null` valant « sans limite ».
//
// LE PIÈGE, et c'est lui que ce fichier garde : « sans limite » se saisit en
// VIDANT le champ. `''` est donc une valeur légitime, pas un champ absent —
// et un `formData.get("code_ttl_days") ?? ""` confond les deux. Avec lui,
// tout autre formulaire de la même page (le statut, la dotation, les
// étapes…) posterait implicitement « sans limite » et effacerait le réglage
// du commerçant sans qu'il ait touché au champ, sans message, sans trace.
// D'où la garde `formData.has(...)` — et son équivalent typé pour les deux
// actions qui reçoivent un objet plutôt qu'un FormData.
//
// DEUX FAMILLES, DEUX CHEMINS D'ENTRÉE DIFFÉRENTS, délibérément :
//  · `updateHunt` reçoit un FormData        → garde `formData.has(...)` ;
//  · `updateEventSession` reçoit un OBJET typé → la valeur est passée telle
//    quelle, et c'est `undefined` qui porte l'absence.
// Le second chemin est le plus exposé : `?? ""` y est encore plus naturel
// sous la main, puisque tous ses voisins immédiats l'utilisent.
// ────────────────────────────────────────────────────────────

const HUNT_ID = "44444444-4444-4444-8444-444444444444";
const SESSION_ID = "00000000-0000-4000-8000-0000000000e1";

const { state } = vi.hoisted(() => ({
  state: {
    /** La charge utile réellement passée à `.update()`. */
    payload: null as Record<string, unknown> | null,
    reset() {
      state.payload = null;
    },
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
    organization: { id: "org-1", timezone: "Europe/Paris" },
    role: "owner",
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
    from() {
      const c: Record<string, unknown> = {
        update: (payload: Record<string, unknown>) => {
          state.payload = payload;
          return c;
        },
        select: () => c,
        eq: () => c,
        // `updateHunt` termine sur `.eq()` (thenable), `updateEventSession`
        // sur `.select().single()` : la chaîne sert les deux formes.
        single: async () => ({ data: { game_id: "game-1" }, error: null }),
        then: (
          onFulfilled: (v: { error: null }) => unknown,
          onRejected?: (r: unknown) => unknown,
        ) => Promise.resolve({ error: null }).then(onFulfilled, onRejected),
      };
      return c;
    },
  })),
}));

const { updateHunt } = await import("./hunts");
const { updateEventSession } = await import("./events");

/** Le formulaire de réglages d'une chasse, tel que l'éditeur le poste.
 *  `ttl` non fourni = le formulaire NE PORTE PAS le champ (cas du piège). */
function formChasse(ttl?: string) {
  const fd = new FormData();
  fd.set("id", HUNT_ID);
  fd.set("name", "Chasse d'été");
  fd.set("order_mode", "free");
  fd.set("min_scan_interval_seconds", "60");
  fd.set("reward_label", "Café offert");
  fd.set("reward_details", "");
  fd.set("reward_stock", "10");
  fd.set("starts_at", "");
  fd.set("ends_at", "");
  if (ttl !== undefined) fd.set("code_ttl_days", ttl);
  return fd;
}

/** L'entrée de `updateEventSession`, telle que l'éditeur de soirée l'envoie. */
function entreeSoiree(ttl?: string) {
  return {
    id: SESSION_ID,
    label: "Soirée quiz",
    rewardLabel: "Une consommation",
    rewardDetails: "",
    rewardStock: "5",
    ...(ttl !== undefined ? { codeTtlDays: ttl } : {}),
  };
}

beforeEach(() => state.reset());

describe("updateHunt — échéance du code CHASSE- (chemin FormData)", () => {
  it("LE PIÈGE : un formulaire sans le champ ne touche PAS au réglage", async () => {
    // C'est l'assertion centrale du lot. `not.toHaveProperty` et non
    // `toBeUndefined` : la colonne ne doit pas figurer dans la charge utile du
    // tout. Une clé présente à `undefined` survivrait au `JSON.stringify` de
    // PostgREST par accident — on ne veut pas que la garde repose sur cet
    // effet de bord, qui disparaîtrait au premier changement de client HTTP.
    const res = await updateHunt(null, formChasse());

    expect(res.ok).toBe(true);
    expect(state.payload).not.toHaveProperty("code_ttl_days");
  });

  it("un champ VIDE vaut « sans limite » et s'écrit null", async () => {
    // Le pendant du test précédent, et la raison d'être de la garde : si `''`
    // n'était pas une valeur légitime, distinguer l'absence ne servirait à
    // rien. Les deux assertions ne valent QUE l'une avec l'autre.
    const res = await updateHunt(null, formChasse(""));

    expect(res.ok).toBe(true);
    expect(state.payload).toHaveProperty("code_ttl_days", null);
  });

  it.each(["1", "30", "365"])("accepte %s jour(s) et l'écrit en nombre", async (v) => {
    const res = await updateHunt(null, formChasse(v));

    expect(res.ok).toBe(true);
    expect(state.payload).toHaveProperty("code_ttl_days", Number(v));
  });

  it.each([
    ["0", "Minimum 1 jour"],
    ["366", "Maximum 365 jours"],
  ])("refuse %s hors bornes, sans rien écrire", async (v, message) => {
    const res = await updateHunt(null, formChasse(v));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe(message);
    // Un refus partiel serait pire que le défaut : le reste des réglages
    // (nom, lot, stock) serait passé en base avec une échéance invalide.
    expect(state.payload).toBeNull();
  });

  it.each(["3.5", "abc"])("refuse la saisie non entière %s, sans rien écrire", async (v) => {
    const res = await updateHunt(null, formChasse(v));

    expect(res.ok).toBe(false);
    expect(state.payload).toBeNull();
  });
});

describe("updateEventSession — échéance du code EVENT- (chemin objet typé)", () => {
  it("LE PIÈGE : une entrée sans la clé ne touche PAS au réglage", async () => {
    // Même garde, autre chemin. Ici pas de `formData.has` à écrire : c'est le
    // fait de passer `input.codeTtlDays` TEL QUEL — et surtout pas
    // `input.codeTtlDays ?? ""` — qui préserve l'absence. Les quatre voisins
    // immédiats de cette ligne, eux, utilisent bien `?? ""` : c'est ce qui
    // rend l'erreur si facile à commettre ici.
    const res = await updateEventSession(entreeSoiree());

    expect(res.ok).toBe(true);
    expect(state.payload).not.toHaveProperty("code_ttl_days");
  });

  it("une chaîne vide vaut « sans limite » et s'écrit null", async () => {
    const res = await updateEventSession(entreeSoiree(""));

    expect(res.ok).toBe(true);
    expect(state.payload).toHaveProperty("code_ttl_days", null);
  });

  it.each(["1", "90", "365"])("accepte %s jour(s) et l'écrit en nombre", async (v) => {
    const res = await updateEventSession(entreeSoiree(v));

    expect(res.ok).toBe(true);
    expect(state.payload).toHaveProperty("code_ttl_days", Number(v));
  });

  it.each(["0", "366", "3.5", "abc"])(
    "refuse %s, sans rien écrire",
    async (v) => {
      const res = await updateEventSession(entreeSoiree(v));

      expect(res.ok).toBe(false);
      expect(state.payload).toBeNull();
    },
  );
});
